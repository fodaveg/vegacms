"""Publish the exact selected Caddy Compose after the frozen partial cutover.

The release owner injects sealed helpers. No Caddy restart, dotenv discovery,
upstream publication or hook execution is part of this operation.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys

import edge_apply as edge
import edge_base as base
import edge_phase2 as phase2

OID = re.compile(r"[0-9a-f]{40}\Z")
FLAGS = ["--no-interpolate", "--no-env-resolution", "--no-path-resolution"]
PHASE = "CADDY_SOURCE_DURABLE"


def git(args, *, body=None, index=None):
    """Bound Git output; isolate ambient Git overrides and never invoke hooks."""
    env = {key: value for key, value in os.environ.items()
           if not key.startswith("GIT_") and key not in {"COMPOSE_FILE", "COMPOSE_PROJECT_NAME"}}
    if index is not None:
        env["GIT_INDEX_FILE"] = str(index)
    argv = ["git", "--no-optional-locks", "-c", "core.fsmonitor=false", "-c",
            "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-C",
            str(base.COMPOSE.parent), *args]
    try:
        result = subprocess.run(argv, input=body, env=env, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("GitUnavailable") from None
    if result.returncode or len(result.stdout) > 8192 or len(result.stderr) > 8192:
        raise RuntimeError("GitUnavailable")
    return result.stdout


def oid(args, **kwargs):
    value = git(args, **kwargs).strip().decode("ascii")
    if not OID.fullmatch(value):
        raise RuntimeError("GitOIDUnknown")
    return value


def blob(body):
    return hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest()


def commit_guard(head, parent, expected_blob, body):
    """Reject merges, foreign HEADs, other changed paths and selected index drift."""
    snapshot = phase2.git_snapshot(body)
    if (not OID.fullmatch(head or "") or snapshot["gitClass"] != "EXACT_CLEAN" or
            snapshot["headCommit"] != head or
            any(snapshot[key] != expected_blob for key in
                ("headBlob", "indexBlob", "workingBlob"))):
        raise RuntimeError("DurableGitSourceChanged")
    if git(["rev-list", "--parents", "-n", "1", head]).strip() != (head + " " + parent).encode():
        raise RuntimeError("DurableParentChanged")
    if git(["diff-tree", "--no-commit-id", "--name-status", "-r", parent, head]) != b"M\tcompose.yml\n":
        raise RuntimeError("DurableScopeChanged")
    if oid(["rev-parse", parent + ":compose.yml"]) != (
            edge.EXPECTED_BLOB):
        raise RuntimeError("DurableParentBlobChanged")


def sealed_state(fd):
    state = json.loads(edge.read_saved(fd, "state.json", 16384))
    old = edge.read_saved(fd, "compose.old")
    new = edge.read_saved(fd, "compose.new")
    if (not isinstance(state, dict) or state.get("caddyId") != base.CONTAINER_ID or
            state.get("oldComposeSha") != base.BASE_SHA or
            state.get("newComposeSha") != edge.EXPECTED_CANDIDATE or
            not re.fullmatch(r"edge-[0-9a-f]{32}", state.get("owner", "")) or
            not edge.ID.fullmatch(state.get("networkId", "")) or
            base.digest(old) != base.BASE_SHA or base.digest(new) != edge.EXPECTED_CANDIDATE or
            base.candidate(old) != new):
        raise RuntimeError("DurableStateUnknown")
    return state, old, new


def reject_extensions(body):
    """Reject composition directives before the Compose parser can follow them."""
    if re.search(rb"(?:^|[\s{,])[\"\']?(?:include|extends)[\"\']?\s*:", body):
        raise RuntimeError("ComposeExtensionUnknown")


def compose(body, args, *, selected=False):
    """Parse only sealed bytes on stdin; private model values stay in server RAM."""
    reject_extensions(body)
    env = {key: value for key, value in os.environ.items() if not key.startswith("COMPOSE_")}
    env["COMPOSE_DISABLE_ENV_FILE"] = "1"
    argv = ["docker", "compose", "--project-name", "edge", "--project-directory",
            "/srv/edge", "--env-file", "/dev/null", "--file",
            str(base.COMPOSE) if selected else "-", "config", *FLAGS, *args]
    try:
        result = subprocess.run(argv, input=None if selected else body, env=env, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("ComposeValidationUnavailable") from None
    if result.returncode or len(result.stdout) > 2 * 1024 * 1024 or len(result.stderr) > 8192:
        raise RuntimeError("ComposeValidationUnavailable")
    return result.stdout


def model_proof(old, new):
    """Prove model network delta and preserved fields for a future recreate."""
    for body in (old, new):
        compose(body, ["--quiet"])
    before = json.loads(compose(old, ["--format", "json"]))
    after = json.loads(compose(new, ["--format", "json"]))
    normalized = json.loads(json.dumps(after))
    try:
        networks = normalized["services"]["caddy"]["networks"]
        if set(networks) != {"edge", "vega-edge"} or networks["vega-edge"] not in ({}, None):
            raise RuntimeError("ComposeNetworkDeltaUnknown")
        del networks["vega-edge"]
        definition = normalized["networks"].pop("vega-edge")
        if definition != {"name": "vega-edge", "external": True} or normalized != before:
            raise RuntimeError("ComposeModelDeltaUnknown")
    except (KeyError, TypeError):
        raise RuntimeError("ComposeModelShapeUnknown") from None
    service = after["services"]["caddy"]
    # A recreate is reviewed through full equality of every non-network model
    # field. Pins retain the existing image identity and selected Caddy ID.
    if not service.get("image") or service.get("build"):
        raise RuntimeError("RecreateImageUnknown")
    return {"modelDeltaOnlyDedicatedNetwork": True, "runtimeNonNetworkFingerprintPreserved": True,
            "caddyRecreateNotPerformed": True,
            "nonNetworkRecreateFieldsPreserved": True}


def runtime_fingerprint():
    """Hash permitted runtime fields in RAM, omitting environment values."""
    template = ('{"id":{{json .Id}},"imageId":{{json .Image}},'
                '"imageRef":{{json .Config.Image}},"entrypoint":{{json .Config.Entrypoint}},'
                '"cmd":{{json .Config.Cmd}},"user":{{json .Config.User}},'
                '"workingDir":{{json .Config.WorkingDir}},"mounts":{{json .Mounts}},'
                '"ports":{{json .HostConfig.PortBindings}},'
                '"restartPolicy":{{json .HostConfig.RestartPolicy}},'
                '"startedAt":{{json .State.StartedAt}},"restarts":{{json .RestartCount}},'
                '"configFiles":{{json (index .Config.Labels "com.docker.compose.project.config_files")}},'
                '"sourceDir":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}}}')
    value = json.loads(edge.checked(["docker", "inspect", "--format", template, "edge-caddy"], limit=65536))
    if (set(value) != {"id", "imageId", "imageRef", "entrypoint", "cmd", "user", "workingDir",
            "mounts", "ports", "restartPolicy", "startedAt", "restarts", "configFiles", "sourceDir"} or
            value["id"] != base.CONTAINER_ID or value["imageId"] != base.IMAGE_ID or
            value["configFiles"] != str(base.COMPOSE) or value["sourceDir"] != str(base.COMPOSE.parent)):
        raise RuntimeError("CaddyRuntimeSelectionChanged")
    return base.digest(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def partial_guard(state, new):
    if state.get("phase") != "CADDY_ATTACHED_PARTIAL":
        raise RuntimeError("PartialPhaseUnknown")
    current, info = base.read_compose()
    if current != new or phase2.file_identity(info) != tuple(state["composeInstalledIdentity"]):
        raise RuntimeError("DurableSourceChanged")
    edge.git_installed_guard(current)
    edge.caddy_guard(attached=True)
    edge.network_guard(state["networkId"], state["owner"], {base.CONTAINER_ID})
    edge.source_guard(new, state["composeInstalledIdentity"])


def published_guard(state, old, new):
    if (state.get("phase") != PHASE or state.get("durableParent") != edge.EXPECTED_HEAD or
            state.get("durableBlob") != blob(new) or state.get("modelProof") != {
                "modelDeltaOnlyDedicatedNetwork": True, "runtimeNonNetworkFingerprintPreserved": True,
                "caddyRecreateNotPerformed": True, "nonNetworkRecreateFieldsPreserved": True}):
        raise RuntimeError("DurablePublicationUnknown")
    current, info = base.read_compose()
    if current != new or phase2.file_identity(info) != tuple(state["composeInstalledIdentity"]):
        raise RuntimeError("DurableSourceChanged")
    import network_dependencies
    dependency = network_dependencies.DEPENDENCIES
    if dependency and dependency.get("source"):
        selected = dependency["source"]
        if (selected["head"] != state.get("durableHead") or selected["parent"] != edge.EXPECTED_HEAD or
                selected["networkId"] != state["networkId"] or selected["composeSha"] != base.digest(new)):
            raise RuntimeError("DurableReceiptChanged")
    commit_guard(state.get("durableHead"), edge.EXPECTED_HEAD, blob(new), new)
    edge.caddy_guard(attached=True)
    if runtime_fingerprint() != state.get("runtimeFingerprint"):
        raise RuntimeError("CaddyNonNetworkRuntimeChanged")
    compose(new, ["--quiet"], selected=True)
    edge.source_guard(new, state["composeInstalledIdentity"])


def make_commit(fd, name, body, parent, message):
    """Build an isolated one-path tree; caller CAS-publishes its exact commit."""
    temporary = edge.STATE_ROOT / name / ("index-" + secrets.token_hex(12))
    try:
        git(["read-tree", parent], index=temporary)
        object_id = oid(["hash-object", "-w", "--stdin"], body=body)
        mode = git(["ls-tree", parent, "--", "compose.yml"]).split()[0].decode("ascii")
        if mode not in {"100644", "100755"}:
            raise RuntimeError("GitFileModeUnknown")
        git(["update-index", "--add", "--cacheinfo", mode + "," + object_id + ",compose.yml"], index=temporary)
        tree = oid(["write-tree"], index=temporary)
        receipt = (message + "\nVerified-tree: " + tree + "\n" +
                   "Verification: exact one-path source tree; guarded publication required.\n" +
                   "Evidence: " + str(edge.STATE_ROOT / name / "state.json") + "\n" +
                   "Scope: selected edge Compose; no Caddy recreate or public smoke.\n")
        head = oid(["-c", "user.name=Vega release owner", "-c", "user.email=vega-release@localhost",
                    "commit-tree", tree, "-p", parent], body=receipt.encode())
        if git(["diff-tree", "--no-commit-id", "--name-status", "-r", parent, head]) != b"M\tcompose.yml\n":
            raise RuntimeError("CommitScopeChanged")
        return head, object_id, mode
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def publish_index_commit(fd, name, head, parent, previous_blob, target_blob, mode, body, before):
    """Own index.lock before validating the selected index and CAS-publishing.

An isolated copy preserves every foreign staged entry. The index lock covers
validation, update-ref and atomic index installation; no checkout or reset.
"""
    source_parent = edge.parent_fd()
    try:
        git_dir = os.open(".git", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=source_parent)
    finally:
        os.close(source_parent)
    lock = None
    lock_identity = None
    temporary_name = "publish-index-" + secrets.token_hex(12)
    temporary = edge.STATE_ROOT / name / temporary_name
    def read_index():
        selected = os.open("index", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=git_dir)
        with os.fdopen(selected, "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_size > 8 * 1024 * 1024:
                raise RuntimeError("IndexShapeUnknown")
            raw = stream.read(info.st_size + 1)
            if len(raw) != info.st_size or phase2.file_identity(info) != phase2.file_identity(os.fstat(stream.fileno())):
                raise RuntimeError("IndexChanged")
        return raw, info
    try:
        if git(["rev-parse", "--git-path", "index"]).strip() not in (b".git/index", b"/srv/edge/.git/index"):
            raise RuntimeError("IndexSelectionUnknown")
        lock = os.open("index.lock", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=git_dir)
        lock_identity = (os.fstat(lock).st_dev, os.fstat(lock).st_ino)
        original, info = read_index()
        edge.save_new(fd, temporary_name, original)
        snapshot = phase2.git_snapshot(body)
        if (snapshot["headCommit"] != parent or snapshot["indexBlob"] != previous_blob or
                snapshot["workingBlob"] != blob(body)):
            raise RuntimeError("PublicationIndexChanged")
        git(["update-index", "--cacheinfo", mode + "," + target_blob + ",compose.yml"], index=temporary)
        with temporary.open("rb") as stream:
            replacement = stream.read(8 * 1024 * 1024 + 1)
        if len(replacement) > 8 * 1024 * 1024:
            raise RuntimeError("IndexShapeUnknown")
        with os.fdopen(lock, "wb") as stream:
            lock = None
            stream.write(replacement)
            os.fchown(stream.fileno(), info.st_uid, info.st_gid)
            os.fchmod(stream.fileno(), stat.S_IMODE(info.st_mode))
            stream.flush()
            os.fsync(stream.fileno())
        before()
        fresh, fresh_info = read_index()
        if fresh != original or phase2.file_identity(fresh_info) != phase2.file_identity(info):
            raise RuntimeError("PublicationIndexChanged")
        if not edge.temp_owned(git_dir, "index.lock", lock_identity):
            raise RuntimeError("PublicationLockChanged")
        git(["update-ref", "HEAD", head, parent])
        # No Git writer can enter while our lock exists; recheck non-Git drift.
        fresh, fresh_info = read_index()
        if fresh != original or phase2.file_identity(fresh_info) != phase2.file_identity(info):
            raise RuntimeError("PublicationIndexChanged")
        if not edge.temp_owned(git_dir, "index.lock", lock_identity):
            raise RuntimeError("PublicationLockChanged")
        os.replace("index.lock", "index", src_dir_fd=git_dir, dst_dir_fd=git_dir)
        lock_identity = None
        os.fsync(git_dir)
    finally:
        if lock is not None:
            os.close(lock)
        if lock_identity is not None and edge.temp_owned(git_dir, "index.lock", lock_identity):
            os.unlink("index.lock", dir_fd=git_dir)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        os.close(git_dir)


def publish(name):
    fd = edge.open_backup(name)
    try:
        state, old, new = sealed_state(fd)
        import network_dependencies
        network_dependencies.guard(source_required=False)
        partial_guard(state, new)
        proof = model_proof(old, new)
        fingerprint = runtime_fingerprint()
        head, object_id, mode = make_commit(fd, name, new, edge.EXPECTED_HEAD,
            "ops(edge): persist dedicated Vega network\n\nOnly selected compose.yml; no Caddy recreate.\n")
        network_dependencies.guard(source_required=False)
        partial_guard(state, new)
        state.update({"phase": "DURABLE_COMMIT_PENDING", "durableParent": edge.EXPECTED_HEAD,
                      "durableHead": head, "durableBlob": object_id, "modelProof": proof,
                      "runtimeFingerprint": fingerprint})
        edge.save_state(fd, state)
        network_dependencies.guard(source_required=False)
        partial_guard({**state, "phase": "CADDY_ATTACHED_PARTIAL"}, new)
        # Plumbing avoids hooks; the owned index lock preserves other staging.
        def before_commit():
            network_dependencies.guard(source_required=False)
            partial_guard({**state, "phase": "CADDY_ATTACHED_PARTIAL"}, new)
        publish_index_commit(fd, name, head, edge.EXPECTED_HEAD, edge.EXPECTED_BLOB,
                             object_id, mode, new, before_commit)
        state["phase"] = PHASE
        edge.save_state(fd, state)
        published_guard(state, old, new)
        edge.network_guard(state["networkId"], state["owner"], {base.CONTAINER_ID})
        return {"status": PHASE, "backupId": name, "head": head,
                "parent": edge.EXPECTED_HEAD, "composeSha": edge.EXPECTED_CANDIDATE,
                "networkId": state["networkId"], "remoteWrites": True,
                "privateValuesExported": False, **proof}
    finally:
        os.close(fd)


def check(name):
    fd = edge.open_backup(name)
    try:
        state, old, new = sealed_state(fd)
        published_guard(state, old, new)
        model_proof(old, new)
        edge.network_guard(state["networkId"], state["owner"], {base.CONTAINER_ID})
        return {"status": "DURABLE_SOURCE_VERIFIED", "backupId": name,
                "head": state["durableHead"], "remoteWrites": False,
                "privateValuesExported": False}
    finally:
        os.close(fd)


def rollback_source(name):
    """Append an exact inverse commit; preserve Caddy's live networks.

Only permitted before PB joins or after PB rollback. Never resets a branch,
restores someone else's leaf or removes a shared network.
"""
    fd = edge.open_backup(name)
    try:
        state, old, new = sealed_state(fd)
        published_guard(state, old, new)
        edge.network_guard(state["networkId"], state["owner"], {base.CONTAINER_ID})
        head, object_id, mode = make_commit(fd, name, old, state["durableHead"],
            "ops(edge): revert dedicated network source\n\nControlled source rollback; live networks retained.\n")
        published_guard(state, old, new)
        edge.network_guard(state["networkId"], state["owner"], {base.CONTAINER_ID})
        current, info = base.read_compose()
        state.update({"phase": "DURABLE_SOURCE_ROLLBACK_PENDING", "rollbackHead": head})
        edge.save_state(fd, state)
        # Reuse the reviewed CAS leaf replacement, not git checkout/reset.
        import cors_apply
        restored = cors_apply.replace_owned(base.COMPOSE, old, base.digest(new), cors_apply.identity(info))
        def before_rollback_commit():
            edge.caddy_guard(attached=True)
            edge.network_guard(state["networkId"], state["owner"], {base.CONTAINER_ID})
            if oid(["rev-parse", "HEAD"]) != state["durableHead"]:
                raise RuntimeError("RollbackHeadChanged")
            current, info = base.read_compose()
            if current != old or cors_apply.identity(info) != restored:
                raise RuntimeError("RollbackSourceChanged")
        publish_index_commit(fd, name, head, state["durableHead"], blob(new),
                             object_id, mode, old, before_rollback_commit)
        snapshot = phase2.git_snapshot(old)
        if (snapshot["gitClass"] != "EXACT_CLEAN" or snapshot["headCommit"] != head or
                any(snapshot[key] != edge.EXPECTED_BLOB for key in ("headBlob", "indexBlob", "workingBlob"))):
            raise RuntimeError("SourceRollbackUnproved")
        state.update({"phase": "DURABLE_SOURCE_ROLLED_BACK", "restoredIdentity": restored})
        edge.save_state(fd, state)
        return {"status": "DURABLE_SOURCE_ROLLED_BACK", "backupId": name,
                "head": head, "remoteWrites": True, "privateValuesExported": False}
    finally:
        os.close(fd)


def main():
    name = None
    try:
        mode, name = sys.argv[1:]
        if mode not in {"publish", "check", "rollback-source"} or not re.fullmatch(r"edge-[0-9a-f]{24}", name):
            raise RuntimeError("ArgsUnknown")
        result = {"publish": publish, "check": check, "rollback-source": rollback_source}[mode](name)
    except Exception:
        result = {"status": "STOP_DURABLE_NEEDS_OPERATOR", "remoteWrites": len(sys.argv) > 1 and sys.argv[1] != "check",
                  "privateValuesExported": False}
        if name and re.fullmatch(r"edge-[0-9a-f]{24}", name):
            result["backupId"] = name
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 2 if result["status"].startswith("STOP_") else 0


if __name__ == "__main__":
    sys.exit(main())
