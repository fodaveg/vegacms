"""One-service Fodaveg image-only CORS cutover; only the release owner runs this on the VPS.

Uses the previously reviewed image-only backup, archive-validation and atomic
file helpers, injected as ``image_helpers`` by the pinned local wrapper.
"""

import base64
import binascii
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import sys
import subprocess
from contextlib import contextmanager
import time

import image_helpers as h


_helper_run = h.run


def run_without_pull(argv, timeout=30):
    """Apply the existing backup recipe with locally present images only."""
    if argv[:2] == ["docker", "run"]:
        argv = argv[:2] + ["--pull=never"] + argv[2:]
    return _helper_run(argv, timeout=timeout)


h.run = run_without_pull

ROOT = Path("/srv/vega-fodaveg-cors-rollout")
SPECS = {"fodaveg": {'compose': None, 'env': None, 'volume': 'fodaveg_fodaveg_pb', 'service': 'fodaveg', 'base': 'a18777c55d583c8eab43671d968108c9560f8a41152440e04ba610e583a9b500', 'target': 'eb62c0447d4cce8a8af1ceedeeabb11602770d48d6bf952618ef19e7b8a1008b', 'image': 'sha256:22cf0983980e3bf9562a0a518f258e6e69cdd58cb3d23a19516f1da60a6d403e', 'imageId': 'sha256:22cf0983980e3bf9562a0a518f258e6e69cdd58cb3d23a19516f1da60a6d403e', 'oldImage': 'fodaveg:f92bac858e904817ffc4cf6bf6307a6de0190c32', 'oldImageId': 'sha256:0e0ef56341d677366cfc00d91e2ead83da0ebcc4372f7ba627f575be682ee51f', 'containerId': '6bddffa88de1c2738bf9aee711425f512deac30365f6183bb3d2ad008a2ff452', 'project': 'fodaveg', 'origin': 'https://admin.fodaveg.net', 'envSha': '6c6730312e9e32942398294d840a7b78f6040f5e9f43d893b238f7dfe9d4676c', 'newTag': 'sha256:22cf0983980e3bf9562a0a518f258e6e69cdd58cb3d23a19516f1da60a6d403e'}}
SPECS["fodaveg"].update(compose=Path("/root/fodaveg/compose.yml"), env=Path("/root/fodaveg/.env"))


def digest(body):
    return hashlib.sha256(body).hexdigest()


def identity(file_stat):
    """Detect replacement or chmod even when bytes happen to remain identical."""
    return [file_stat.st_dev, file_stat.st_ino, file_stat.st_uid, file_stat.st_gid,
            stat.S_IMODE(file_stat.st_mode), file_stat.st_size,
            file_stat.st_mtime_ns, file_stat.st_ctime_ns]


def parent_fd(path):
    """Pin the literal parent from / without traversing any symlink."""
    parts = path.parts
    if not parts or parts[0] != "/":
        raise RuntimeError("PathUnknown")
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in parts[1:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                            dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def read_leaf(fd, name):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > 2 * 1024 * 1024:
            raise RuntimeError("FileShapeUnknown")
        body = stream.read(before.st_size + 1)
        after = os.fstat(stream.fileno())
    if len(body) != before.st_size or identity(before) != identity(after):
        raise RuntimeError("FileChangedDuringRead")
    return body, before


def read_file(path):
    fd = parent_fd(path)
    try:
        return read_leaf(fd, path.name)
    finally:
        os.close(fd)


def replace_owned(path, body, expected_sha, expected_identity):
    """Replace only an unchanged regular leaf in the same pinned parent."""
    fd = parent_fd(path)
    temporary = path.name + ".vega-cors-" + secrets.token_hex(8)
    created = False
    try:
        current, current_stat = read_leaf(fd, path.name)
        if digest(current) != expected_sha or identity(current_stat) != expected_identity:
            raise RuntimeError("ForeignFileChange")
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o600, dir_fd=fd)
        created = True
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(body)
            os.fchown(stream.fileno(), current_stat.st_uid, current_stat.st_gid)
            os.fchmod(stream.fileno(), stat.S_IMODE(current_stat.st_mode))
            stream.flush()
            os.fsync(stream.fileno())
            temporary_stat = os.fstat(stream.fileno())
        # Docker config validation may have taken time. Recheck bytes, full file
        # identity, and the literal parent immediately before the rename.
        fresh, fresh_stat = read_leaf(fd, path.name)
        other_fd = parent_fd(path)
        try:
            same_parent = (os.fstat(fd).st_dev, os.fstat(fd).st_ino) == (
                os.fstat(other_fd).st_dev, os.fstat(other_fd).st_ino)
        finally:
            os.close(other_fd)
        if not same_parent or digest(fresh) != expected_sha or \
                identity(fresh_stat) != expected_identity:
            raise RuntimeError("ForeignFileChange")
        os.replace(temporary, path.name, src_dir_fd=fd, dst_dir_fd=fd)
        created = False
        os.fsync(fd)
        installed, installed_stat = read_leaf(fd, path.name)
        if ((installed_stat.st_dev, installed_stat.st_ino) !=
                (temporary_stat.st_dev, temporary_stat.st_ino) or
                installed != body or installed_stat.st_uid != current_stat.st_uid or
                installed_stat.st_gid != current_stat.st_gid or
                stat.S_IMODE(installed_stat.st_mode) != stat.S_IMODE(current_stat.st_mode)):
            raise RuntimeError("InstalledFileDrift")
        # Confirm the pinned directory is still the path selected by the service.
        # A parent renamed after the pre-replace check must not be accepted.
        selected, selected_stat = read_file(path)
        if selected != body or identity(selected_stat) != identity(installed_stat):
            raise RuntimeError("InstalledPathDrift")
        return identity(installed_stat)
    finally:
        if created:
            try:
                os.unlink(temporary, dir_fd=fd)
            except OSError:
                pass
        os.close(fd)


def command(name, spec, after):
    return None


def patch(name, spec, body):
    """Replace only the image selector, fixed to the loaded OCI manifest ID."""
    before = b"    image: ${FODAVEG_IMAGE:?Define FODAVEG_IMAGE con un tag SHA inmutable}\n"
    after = ("    image: " + spec["imageId"] + "\n").encode()
    if digest(body) != spec["base"] or body.count(before) != 1:
        raise RuntimeError("ComposeBaseDrift")
    candidate = body.replace(before, after, 1)
    if digest(candidate) != spec["target"] or candidate.replace(after, before, 1) != body:
        raise RuntimeError("ComposeTargetDrift")
    return candidate


def compose_quiet(spec, path):
    h.run(["docker", "compose", "--project-directory", str(spec["compose"].parent),
           "--env-file", str(spec["env"]), "--file", str(path), "config", "--quiet"])


def inspect(name):
    value = json.loads(h.run(["docker", "inspect", "--format", h.CONTAINER_TEMPLATE, name]))
    if not isinstance(value, dict) or set(value) != {
            "imageId", "imageRef", "entrypoint", "cmd", "health", "ports", "mounts", "networks"}:
        raise RuntimeError("RuntimeShapeUnknown")
    return value


def container_id(name):
    value = json.loads(h.run(["docker", "inspect", "--format", "{{json .Id}}", name]))
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
        raise RuntimeError("ContainerIdUnknown")
    return value


def created_selection(name, spec, expected_id=None, volume_users=None):
    """Identify a stopped Compose-created container before any start attempt."""
    raw = inspect(name)
    labels = json.loads(h.run(["docker", "inspect", "--format",
        '{"project":{{json (index .Config.Labels "com.docker.compose.project")}},'
        '"service":{{json (index .Config.Labels "com.docker.compose.service")}}}', name]))
    selected = container_id(name)
    if (not isinstance(labels, dict) or set(labels) != {"project", "service"} or
            labels["project"] != spec["project"] or labels["service"] != spec["service"] or
            raw["imageId"] != spec["imageId"] or raw["imageRef"] != spec["image"] or
            raw["entrypoint"] != h.OLD_RUNTIME[name]["entrypoint"] or
            raw["cmd"] != command(name, spec, True) or
            (expected_id is not None and selected != expected_id) or
            h.is_running(name) or
            h.volume_running_containers(spec["volume"]) != ([] if volume_users is None else volume_users)):
        raise RuntimeError("CreatedSelectionUnknown")
    return selected


def pb_argv(name):
    """Read one PB argv only; never print an unknown process argument."""
    raw = h.run(["docker", "exec", name, "/bin/sh", "-c", h.PROC_COMMAND])
    if len(raw) > 128 * 1024:
        raise RuntimeError("PBArgvUnknown")
    lines = raw.decode("ascii").splitlines()
    body, found = None, []
    for line in lines:
        if line == "__PB_BEGIN__":
            if body is not None:
                raise RuntimeError("PBArgvUnknown")
            body = []
        elif line == "__PB_END__":
            if body is None:
                raise RuntimeError("PBArgvUnknown")
            try:
                payload = base64.b64decode("".join(body), validate=True)
                if not payload.endswith(b"\0") or len(payload) > 16384:
                    raise ValueError
                found.append([item.decode("utf-8") for item in payload[:-1].split(b"\0")])
            except (binascii.Error, UnicodeError, ValueError):
                raise RuntimeError("PBArgvUnknown") from None
            body = None
        elif body is not None:
            body.append(line)
        else:
            raise RuntimeError("PBArgvUnknown")
    if body is not None or len(found) != 1:
        raise RuntimeError("PBArgvUnknown")
    return found[0]


def runtime(name, spec, after, baseline=None, expected_id=None,
            require_healthy=True, volume_users=None):
    raw = inspect(name)
    expected = h.OLD_RUNTIME[name]
    mounts = raw["mounts"]
    networks = raw["networks"]
    ports = raw["ports"]
    # Docker may expose no NetworkSettings.Ports while a known container is
    # stopped. Config.ExposedPorts and HostConfig.PortBindings must still prove
    # the same unpublished port before treating that representation as equal.
    ports_match = (set(ports) == expected["ports"] and
                   all(value is None for value in ports.values())) if isinstance(ports, dict) else False
    if not ports_match and ports == {} and not require_healthy and not h.is_running(name):
        port_config = json.loads(h.run(["docker", "inspect", "--format",
            '{"exposed":{{json .Config.ExposedPorts}},'
            '"bindings":{{json .HostConfig.PortBindings}}}', name]))
        exposed = port_config.get("exposed") if isinstance(port_config, dict) else None
        ports_match = (isinstance(exposed, dict) and set(exposed) == expected["ports"] and
                       all(value == {} for value in exposed.values()) and
                       port_config.get("bindings") in (None, {}))
    if (not isinstance(mounts, list) or not isinstance(networks, list) or
            not ports_match or len(networks) != 1 or
            networks[0].get("name") != "edge" or
            sorted(networks[0].get("aliases", [])) != sorted(expected["aliases"]) or
            not isinstance(ports, dict)):
        raise RuntimeError("RuntimeTopologyDrift")
    normalized = sorted((m.get("type"), m.get("name") or None, m.get("dest"), m.get("rw"),
                         digest(m.get("source", "").encode())) for m in mounts
                        if isinstance(m, dict) and isinstance(m.get("source"), str))
    if len(normalized) != len(mounts) or normalized != sorted(expected["mounts"]):
        raise RuntimeError("RuntimeMountDrift")
    reference = spec["image"] if after else spec["oldImage"]
    expected_image = spec["imageId"] if after else spec["oldImageId"]
    if h.image_id(reference) != expected_image or raw["imageId"] != expected_image or \
            raw["imageRef"] != reference or raw["entrypoint"] != expected["entrypoint"] or raw["cmd"] is not None:
        raise RuntimeError("RuntimeImageDrift")
    if require_healthy:
        argv = h.OLD_PB_ARGV[name] + (["--origins=" + spec["origin"]] if after else [])
        counts = h.run(["docker", "exec", name, "/bin/sh", "-c",
                       'for f in /proc/[0-9]*/comm; do read -r c < "$f" || continue; '
                       'case "$c" in fodaveg-pb|node|tini) printf "%s\\n" "$c";; esac; done'])
        if raw["health"] != "healthy" or pb_argv(name) != argv or \
                sorted(counts.decode().splitlines()) != ["fodaveg-pb", "node", "tini"]:
            raise RuntimeError("RuntimeProcessDrift")
    baseline_ports_match = baseline is None or raw["ports"] == baseline["ports"] or (
        ports == {} and ports_match and
        baseline["ports"] == {port: None for port in expected["ports"]})
    if baseline is not None and (not baseline_ports_match or
            any(raw[key] != baseline[key] for key in (
                "entrypoint", "mounts", "networks"))):
        raise RuntimeError("RuntimePeerDrift")
    current_id = container_id(name)
    if expected_id is not None and current_id != expected_id:
        raise RuntimeError("ContainerIdentityDrift")
    users = h.volume_running_containers(spec["volume"])
    if (volume_users is not None and users != volume_users) or \
            (volume_users is None and users != [name]):
        raise RuntimeError("OtherVolumeWriter")
    return current_id, raw


def file_state(spec, expected):
    compose, compose_stat = read_file(spec["compose"])
    env, env_stat = read_file(spec["env"])
    compose_mode = stat.S_IMODE(compose_stat.st_mode)
    if (digest(compose) != expected or compose_mode not in (0o600, 0o640, 0o644) or
            stat.S_IMODE(env_stat.st_mode) & 0o077):
        raise RuntimeError("FileIdentityDrift")
    return compose, compose_stat, digest(env), env_stat


def gate_files(spec, compose_sha, compose_identity, env_sha, env_identity):
    """Require this invocation's active Compose and unchanged private selector."""
    compose, compose_stat = read_file(spec["compose"])
    env, env_stat = read_file(spec["env"])
    if (digest(compose) != compose_sha or identity(compose_stat) != compose_identity or
            digest(env) != env_sha or identity(env_stat) != env_identity):
        raise RuntimeError("ForeignFileChange")


def preflight(name, spec):
    body, compose_stat, env_sha, env_stat = file_state(spec, spec["base"])
    if env_sha != spec["envSha"]:
        raise RuntimeError("EnvBaselineDrift")
    candidate = patch(name, spec, body)
    old_id, old_runtime = runtime(name, spec, False, expected_id=spec["containerId"])
    if h.image_id(spec["image"]) != spec["imageId"] or h.image_id(h.BACKUP_IMAGE) is None:
        raise RuntimeError("ImageMissingOrDrift")
    size = h.volume_size_kib(spec["volume"])
    budget = h.filesystem_budget(spec["volume"], size)
    compose_quiet(spec, spec["compose"])
    return {"body": body, "candidate": candidate,
            "mode": stat.S_IMODE(compose_stat.st_mode),
            "composeIdentity": identity(compose_stat), "envSha": env_sha,
            "envMode": stat.S_IMODE(env_stat.st_mode), "envIdentity": identity(env_stat),
            "oldId": old_id,
            "oldRuntime": old_runtime, "volumeKiB": size, "budget": budget}


def metadata(path, value):
    data = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    h.write_backup(path, data)


def replace_metadata(path, value):
    data = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    h.write_new(path, data, 0o600)


CHECKPOINTS = {"PRESTOP_IMAGE", "PRESTOP_RUNTIME", "PRESTOP_FILES", "STOP", "QUIESCENCE",
               "BACKUP", "BACKUP_TAR", "BACKUP_TAR_VALIDATE", "ARCHIVE_VALIDATE",
               "CLONE_IDENTITY", "CLONE_CREATE", "CLONE_LABELS", "RESTORE_TAR",
               "RESTORE_BYTES", "CLONE_PB_BOOT", "CLONE_PB_HEALTH", "POSTBACKUP_FILES",
               "STAGE_CONFIG", "INSTALL_COMPOSE", "CLONE_CLEANUP_STOP", "CLONE_CLEANUP_VOLUME",
               "INSTALLED_RUNTIME_1", "INSTALLED_CONFIG", "INSTALLED_IMAGE",
               "INSTALLED_RUNTIME_2", "INSTALLED_FILES", "CREATE",
               "CREATED_SELECTION", "CREATED_RUNTIME", "PERSIST_CREATED",
               "START_IMAGE", "START_SELECTION", "START_RUNTIME", "START_FILES",
               "START", "HEALTH", "FINAL_FILES", "SUCCESS"}
FAILURES = {"RuntimeImageDrift", "RuntimeProcessDrift", "PBArgvUnknown",
            "ImageChangedBeforeStop", "VolumeStillInUse", "BackupMissing", "ArchiveShapeUnknown",
            "ArchiveDuplicateOrTooMany", "ArchiveEmpty", "RestoreDirectoryMismatch",
            "RestoreFileMismatch", "RestoreSizeMismatch", "RestoreByteMismatch", "RestoreScopeExceeded",
            "RestoreEmpty", "CloneServeUnhealthy", "ProbeVolumeIdentityUnknown", "ProbeVolumeCollision",
            "ProbeVolumeCreationUnknown", "FilesOrContainerChangedAfterBackup", "CommandExitNonzero", "RuntimeTopologyDrift", "RuntimeMountDrift", "RuntimeCommandDrift",
            "RuntimePeerDrift", "ContainerIdentityDrift", "OtherVolumeWriter",
            "RuntimeShapeUnknown", "ContainerIdUnknown", "CommandUnavailable",
            "ForeignFileChange", "ImageChangedBeforeCreate", "ImageOrOldContainerDrift",
            "CreatedSelectionUnknown", "CreatedContainerUnknown", "CreateExitNonzero",
            "CreateUnavailable", "InstalledComposeDrift", "NewRuntimeUnhealthy"}


def checkpoint(backup, record, label):
    """Persist the next finite operation before it may change recoverability."""
    if label not in CHECKPOINTS:
        raise RuntimeError("CheckpointUnknown")
    next_record = {**record, "checkpoint": label}
    replace_metadata(backup / "state.json", next_record)
    record.update(next_record)


def baseline_comparison(name, spec, old_runtime, old_id):
    """Project hash-only raw/canonical equality with the pre-stop PB snapshot."""
    fields = {"mountRawSame": None, "mountCanonicalSame": None,
              "aliasesRawSame": None, "aliasesCanonicalSame": None,
              "networkRawSame": None, "portsStoppedEquivalent": None}
    try:
        if container_id(name) != old_id or h.is_running(name):
            return fields
        raw = inspect(name)
        if not isinstance(raw["mounts"], list) or not isinstance(raw["networks"], list) or \
                len(raw["networks"]) != 1 or len(old_runtime["networks"]) != 1:
            return fields
        def hashed(value):
            return digest(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())
        def canonical(mounts):
            result = sorted((m.get("type"), m.get("name") or None, m.get("dest"),
                             m.get("rw"), digest(m.get("source", "").encode()))
                            for m in mounts if isinstance(m, dict) and
                            isinstance(m.get("source"), str))
            return result if len(result) == len(mounts) else None
        aliases = raw["networks"][0].get("aliases")
        old_aliases = old_runtime["networks"][0].get("aliases")
        fields.update({
            "mountRawSame": hashed(raw["mounts"]) == hashed(old_runtime["mounts"]),
            "mountCanonicalSame": canonical(raw["mounts"]) == canonical(old_runtime["mounts"]),
            "aliasesRawSame": hashed(aliases) == hashed(old_aliases),
            "aliasesCanonicalSame": sorted(aliases) == sorted(old_aliases),
            "networkRawSame": hashed(raw["networks"]) == hashed(old_runtime["networks"]),
            "portsStoppedEquivalent": raw["ports"] == old_runtime["ports"] or
                (raw["ports"] == {} and old_runtime["ports"] ==
                 {port: None for port in h.OLD_RUNTIME[name]["ports"]}),
        })
    except Exception:
        pass
    return fields


def create_selected(spec):
    """Keep a numeric Docker create exit without exporting its private output."""
    argv = ["docker", "compose", "--project-directory", str(spec["compose"].parent),
            "--env-file", str(spec["env"]), "--file", str(spec["compose"]),
            "create", "--force-recreate", "--no-build", "--pull", "never",
            spec["service"]]
    try:
        result = subprocess.run(argv, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, timeout=120, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("CreateUnavailable") from None
    if result.returncode != 0:
        raise CreateExit(result.returncode)
    return result.returncode


class CreateExit(RuntimeError):
    """Carry only Docker's numeric exit code, never its output."""

    def __init__(self, code):
        self.code = code if type(code) is int and 1 <= code <= 255 else None
        super().__init__("CreateExitNonzero" if self.code is not None else "CreateUnavailable")



class CommandExit(RuntimeError):
    """Retain a bounded numeric exit; command output stays in remote RAM."""
    def __init__(self, code):
        self.code = code if type(code) is int and 1 <= code <= 255 else None
        super().__init__("CommandExitNonzero" if self.code is not None else "CommandUnavailable")


def controlled_command(argv, timeout=30):
    """Same helper bounds and pull policy, with a numeric failure discriminator."""
    try:
        result = subprocess.run(argv, capture_output=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("CommandUnavailable") from None
    if len(result.stdout) > 1048576 or len(result.stderr) > 1048576:
        raise RuntimeError("CommandUnavailable")
    if result.returncode:
        raise CommandExit(result.returncode)
    return result.stdout


_helper_run = controlled_command


@contextmanager
def probe_checkpoints(backup, record):
    """Observe canonical helper operations without changing TEST cleanup or data."""
    original_run, original_verify, original_validate = h.run, h.verify_restored, h.validate_archive

    def observed_run(argv, timeout=30):
        label = None
        if argv[:3] == ["docker", "volume", "create"]:
            label = "CLONE_CREATE"
        elif argv[:3] == ["docker", "volume", "inspect"]:
            label = "CLONE_LABELS"
        elif argv[:2] == ["docker", "run"]:
            if "/pb/fodaveg-pb" in argv:
                label = "CLONE_PB_BOOT"
            elif "-czf" in argv:
                label = "BACKUP_TAR"
            elif "-xzf" in argv:
                label = "RESTORE_TAR"
            elif argv[-1] == "tar -tzf /backup/data.tgz >/dev/null":
                label = "BACKUP_TAR_VALIDATE"
        elif argv[:2] == ["docker", "exec"]:
            label = "CLONE_PB_HEALTH"
        if label is not None:
            checkpoint(backup, record, label)
        # Cleanup stop/rm do not replace the checkpoint of the failed operation.
        try:
            return original_run(argv, timeout=timeout)
        except Exception:
            if argv[:2] == ["docker", "stop"] and len(argv) > 2 and argv[2].startswith("vega-image-serve-"):
                checkpoint(backup, record, "CLONE_CLEANUP_STOP")
            elif argv[:3] == ["docker", "volume", "rm"]:
                checkpoint(backup, record, "CLONE_CLEANUP_VOLUME")
            raise

    def verify(*args):
        checkpoint(backup, record, "RESTORE_BYTES")
        return original_verify(*args)

    def validate(*args):
        checkpoint(backup, record, "ARCHIVE_VALIDATE")
        return original_validate(*args)

    h.run, h.verify_restored, h.validate_archive = observed_run, verify, validate
    try:
        yield
    finally:
        h.run, h.verify_restored, h.validate_archive = original_run, original_verify, original_validate


def wait_owned_old(name, spec, state):
    """Wait only for the same adopted OLD identity and unchanged BASE/env files."""
    deadline = time.monotonic() + 60
    while True:
        gate_files(spec, spec["base"], state["composeIdentity"], state["envSha"], state["envIdentity"])
        if container_id(name) != state["oldId"]:
            raise RuntimeError("ContainerIdentityDrift")
        try:
            runtime(name, spec, False, expected_id=state["oldId"])
            return True
        except RuntimeError:
            if time.monotonic() >= deadline:
                return False
            time.sleep(1)


def apply(name, spec):
    state = preflight(name, spec)
    h.BACKUP_ROOT = ROOT
    backup = h.make_backup_dir(name)
    h.write_backup(backup / "compose.old", state["body"])
    env_body, env_stat = read_file(spec["env"])
    if digest(env_body) != state["envSha"] or identity(env_stat) != state["envIdentity"]:
        raise RuntimeError("EnvChangedBeforeBackup")
    h.write_backup(backup / "dotenv.old", env_body)
    record = {"service": name, "oldComposeSha": spec["base"], "newComposeSha": spec["target"],
              "oldContainerId": state["oldId"], "newContainerId": None,
              "imageId": spec["imageId"], "envSha": state["envSha"],
              "envMode": state["envMode"], "composeMode": state["mode"],
              "envIdentity": state["envIdentity"], "installedComposeIdentity": None,
              "status": "PREPARED"}
    metadata(backup / "state.json", record)
    stopped = False
    installed = False
    try:
        checkpoint(backup, record, "PRESTOP_IMAGE")
        if h.image_id(spec["image"]) != spec["imageId"]:
            raise RuntimeError("ImageChangedBeforeStop")
        checkpoint(backup, record, "PRESTOP_RUNTIME")
        runtime(name, spec, False, baseline=state["oldRuntime"],
                expected_id=state["oldId"])
        checkpoint(backup, record, "PRESTOP_FILES")
        checkpoint(backup, record, "STOP")
        gate_files(spec, spec["base"], state["composeIdentity"],
                   state["envSha"], state["envIdentity"])
        h.run(["docker", "stop", state["oldId"]], timeout=60)
        stopped = True
        checkpoint(backup, record, "QUIESCENCE")
        if h.is_running(name) or h.volume_running_containers(spec["volume"]):
            raise RuntimeError("VolumeStillInUse")
        with probe_checkpoints(backup, record):
            checkpoint(backup, record, "BACKUP")
            archive_sha, archive_size = h.backup_volume(spec["volume"], backup)
            checkpoint(backup, record, "CLONE_IDENTITY")
            files, restored_bytes = h.isolated_restore_probe(name, spec, backup)
        if files < 1 or restored_bytes < 1:
            raise RuntimeError("RestoreEmpty")
        checkpoint(backup, record, "POSTBACKUP_FILES")
        live_compose, live_compose_stat = read_file(spec["compose"])
        live_env, live_env_stat = read_file(spec["env"])
        if (container_id(name) != state["oldId"] or
                digest(live_compose) != spec["base"] or
                identity(live_compose_stat) != state["composeIdentity"] or
                digest(live_env) != state["envSha"] or
                identity(live_env_stat) != state["envIdentity"]):
            raise RuntimeError("FilesOrContainerChangedAfterBackup")
        staged = backup / "compose.new"
        h.write_backup(staged, state["candidate"])
        os.chmod(staged, state["mode"])
        checkpoint(backup, record, "STAGE_CONFIG")
        compose_quiet(spec, staged)
        checkpoint(backup, record, "INSTALL_COMPOSE")
        installed_identity = replace_owned(spec["compose"], state["candidate"],
                                           spec["base"], state["composeIdentity"])
        installed = True
        installed_compose, installed_stat = read_file(spec["compose"])
        if digest(installed_compose) != spec["target"] or \
                identity(installed_stat) != installed_identity:
            raise RuntimeError("InstalledComposeDrift")
        record["installedComposeIdentity"] = installed_identity
        record["status"] = "INSTALLED"
        record.update({"archiveSha": archive_sha, "archiveBytes": archive_size,
                       "restoredFiles": files, "restoredBytes": restored_bytes})
        replace_metadata(backup / "state.json", record)
        # The staged config was validated before installation. Revalidate the
        # selected config and all ownership guards immediately before start.
        checkpoint(backup, record, "INSTALLED_RUNTIME_1")
        if h.image_id(spec["image"]) != spec["imageId"] or h.is_running(name):
            raise RuntimeError("ImageOrOldContainerDrift")
        runtime(name, spec, False, baseline=state["oldRuntime"],
                expected_id=state["oldId"], require_healthy=False, volume_users=[])
        checkpoint(backup, record, "INSTALLED_CONFIG")
        compose_quiet(spec, spec["compose"])
        checkpoint(backup, record, "INSTALLED_IMAGE")
        if h.image_id(spec["image"]) != spec["imageId"]:
            raise RuntimeError("ImageChangedBeforeCreate")
        checkpoint(backup, record, "INSTALLED_RUNTIME_2")
        runtime(name, spec, False, baseline=state["oldRuntime"],
                expected_id=state["oldId"], require_healthy=False, volume_users=[])
        checkpoint(backup, record, "INSTALLED_FILES")
        checkpoint(backup, record, "CREATE")
        gate_files(spec, spec["target"], installed_identity,
                   state["envSha"], state["envIdentity"])
        # Create the selected container without starting it. Its ID is fixed
        # and persisted before any start attempt, so a later unhealthy PB can
        # be rolled back without adopting a merely similar foreign container.
        create_selected(spec)
        checkpoint(backup, record, "CREATED_SELECTION")
        new_id = created_selection(name, spec)
        if new_id == state["oldId"]:
            raise RuntimeError("CreatedContainerUnknown")
        checkpoint(backup, record, "CREATED_RUNTIME")
        runtime(name, spec, True, baseline=state["oldRuntime"],
                expected_id=new_id, require_healthy=False, volume_users=[])
        checkpoint(backup, record, "PERSIST_CREATED")
        record.update({"status": "CREATED", "newContainerId": new_id})
        replace_metadata(backup / "state.json", record)
        checkpoint(backup, record, "START_IMAGE")
        if h.image_id(spec["image"]) != spec["imageId"]:
            raise RuntimeError("ImageChangedBeforeStart")
        checkpoint(backup, record, "START_SELECTION")
        created_selection(name, spec, expected_id=new_id)
        checkpoint(backup, record, "START_RUNTIME")
        runtime(name, spec, True, baseline=state["oldRuntime"],
                expected_id=new_id, require_healthy=False, volume_users=[])
        checkpoint(backup, record, "START_FILES")
        checkpoint(backup, record, "START")
        gate_files(spec, spec["target"], installed_identity,
                   state["envSha"], state["envIdentity"])
        h.run(["docker", "start", new_id], timeout=60)
        checkpoint(backup, record, "HEALTH")
        deadline = time.monotonic() + 60
        while True:
            if container_id(name) != new_id:
                raise RuntimeError("ContainerChangedAfterStart")
            try:
                runtime(name, spec, True, baseline=state["oldRuntime"], expected_id=new_id)
                break
            except RuntimeError:
                if time.monotonic() >= deadline:
                    raise RuntimeError("NewRuntimeUnhealthy") from None
                time.sleep(1)
        checkpoint(backup, record, "FINAL_FILES")
        gate_files(spec, spec["target"], installed_identity,
                   state["envSha"], state["envIdentity"])
        record.update({"status": "AWAITING_PUBLIC_SMOKE", "newContainerId": new_id,
                       "archiveSha": archive_sha, "archiveBytes": archive_size,
                       "restoredFiles": files, "restoredBytes": restored_bytes})
        replace_metadata(backup / "state.json", record)
        checkpoint(backup, record, "SUCCESS")
        gate_files(spec, spec["target"], installed_identity,
                   state["envSha"], state["envIdentity"])
        return {"status": "CORS_APPLIED_AWAITING_PUBLIC_SMOKE", "service": name,
                "remoteWrites": True, "backupId": backup.name,
                "oldContainerId": state["oldId"], "newContainerId": new_id,
                "composeSha": spec["target"], "imageId": spec["imageId"],
                "archiveSha": archive_sha, "archiveBytes": archive_size,
                "restoredFiles": files, "restoredBytes": restored_bytes}
    except Exception as failure:
        # Safe recovery only while the old container and original files still belong to us.
        recovered = False
        failure_class = str(failure) if str(failure) in FAILURES else "OTHER_FAILURE"
        create_exit = failure.code if isinstance(failure, CreateExit) else None
        command_exit = failure.code if isinstance(failure, CommandExit) else None
        comparison = {"mountRawSame": None, "mountCanonicalSame": None,
                      "aliasesRawSame": None, "aliasesCanonicalSame": None,
                      "networkRawSame": None, "portsStoppedEquivalent": None}
        if installed and failure_class == "RuntimePeerDrift":
            comparison = baseline_comparison(name, spec, state["oldRuntime"], state["oldId"])
        if stopped and not installed:
            try:
                old_compose, old_compose_stat = read_file(spec["compose"])
                old_env, old_env_stat = read_file(spec["env"])
                if (container_id(name) == state["oldId"] and
                        digest(old_compose) == spec["base"] and
                        identity(old_compose_stat) == state["composeIdentity"] and
                        digest(old_env) == state["envSha"] and
                        identity(old_env_stat) == state["envIdentity"] and
                        not h.volume_running_containers(spec["volume"])):
                    runtime(name, spec, False, expected_id=state["oldId"],
                            require_healthy=False, volume_users=[])
                    gate_files(spec, spec["base"], state["composeIdentity"],
                               state["envSha"], state["envIdentity"])
                    h.run(["docker", "start", state["oldId"]], timeout=60)
                    recovered = wait_owned_old(name, spec, state)
            except Exception:
                pass
        if installed and record["status"] == "INSTALLED" and \
                record.get("newContainerId") is None:
            try:
                result = rollback(name, spec, backup.name)
                recovered = (result["status"] == "CORS_ROLLED_BACK_AWAITING_PUBLIC_SMOKE" and
                             result["containerId"] == state["oldId"])
            except Exception:
                pass
        return {"status": "STOP_OLD_RUNTIME_RESTORED" if recovered else "STOP_NEEDS_OPERATOR",
                "service": name, "remoteWrites": True,
                "backupId": backup.name, "checkpoint": record.get("checkpoint"),
                "failureClass": failure_class, "createExit": create_exit, "commandExit": command_exit,
                "baselineFields": comparison}


def rollback(name, spec, backup_id):
    if not re.fullmatch(re.escape(name) + r"-[0-9]{8}T[0-9]{6}Z-[0-9]+", backup_id):
        raise RuntimeError("BackupIdUnknown")
    backup = ROOT / backup_id
    if backup.is_symlink() or not backup.is_dir() or stat.S_IMODE(backup.stat().st_mode) != 0o700:
        raise RuntimeError("BackupUnknown")
    body, _ = h.read_private(backup / "state.json")
    record = json.loads(body)
    if (not isinstance(record, dict) or record.get("status") not in (
            "INSTALLED", "CREATED", "AWAITING_PUBLIC_SMOKE") or
            record.get("service") != name or record.get("oldComposeSha") != spec["base"] or
            record.get("newComposeSha") != spec["target"] or
            record.get("imageId") != spec["imageId"] or
            not isinstance(record.get("oldContainerId"), str) or
            not re.fullmatch(r"[0-9a-f]{64}", record["oldContainerId"]) or
            (record["status"] == "INSTALLED" and record.get("newContainerId") is not None) or
            (record["status"] != "INSTALLED" and
             (not isinstance(record.get("newContainerId"), str) or
              not re.fullmatch(r"[0-9a-f]{64}", record["newContainerId"])))):
        raise RuntimeError("BackupMetadataUnknown")
    original, _ = h.read_private(backup / "compose.old")
    if digest(original) != spec["base"]:
        raise RuntimeError("BackupComposeDrift")
    current, current_stat = read_file(spec["compose"])
    env, env_stat = read_file(spec["env"])
    if (digest(current) != spec["target"] or
            identity(current_stat) != record["installedComposeIdentity"] or
            digest(env) != record["envSha"] or
            identity(env_stat) != record["envIdentity"] or
            container_id(name) != (record["oldContainerId"] if record["status"] == "INSTALLED"
                                   else record["newContainerId"])):
        raise RuntimeError("ForeignChangeBeforeRollback")
    if h.image_id(spec["image"]) != spec["imageId"]:
        raise RuntimeError("ImageChangedBeforeRollback")
    compose_quiet(spec, spec["compose"])
    gate_files(spec, spec["target"], record["installedComposeIdentity"],
               record["envSha"], record["envIdentity"])
    if record["status"] == "INSTALLED":
        if h.is_running(name):
            raise RuntimeError("OldContainerUnexpectedlyRunning")
        runtime(name, spec, False, expected_id=record["oldContainerId"],
                require_healthy=False, volume_users=[])
        restored_identity = replace_owned(spec["compose"], original, spec["target"],
                                          record["installedComposeIdentity"])
        record["status"] = "ROLLBACK_COMPOSE_INSTALLED"
        record["rollbackComposeIdentity"] = restored_identity
        replace_metadata(backup / "state.json", record)
        if h.image_id(spec["image"]) != spec["imageId"] or h.is_running(name):
            raise RuntimeError("RollbackOldContainerDrift")
        runtime(name, spec, False, expected_id=record["oldContainerId"],
                require_healthy=False, volume_users=[])
        gate_files(spec, spec["base"], restored_identity,
                   record["envSha"], record["envIdentity"])
        h.run(["docker", "start", record["oldContainerId"]], timeout=60)
        deadline = time.monotonic() + 60
        while True:
            if container_id(name) != record["oldContainerId"]:
                raise RuntimeError("RollbackOldContainerChanged")
            try:
                runtime(name, spec, False, expected_id=record["oldContainerId"])
                break
            except RuntimeError:
                if time.monotonic() >= deadline:
                    raise RuntimeError("OldRuntimeUnhealthy") from None
                time.sleep(1)
        gate_files(spec, spec["base"], restored_identity,
                   record["envSha"], record["envIdentity"])
        record["status"] = "ROLLED_BACK"
        replace_metadata(backup / "state.json", record)
        gate_files(spec, spec["base"], restored_identity,
                   record["envSha"], record["envIdentity"])
        return {"status": "CORS_ROLLED_BACK_AWAITING_PUBLIC_SMOKE", "service": name,
                "remoteWrites": True, "backupId": backup.name,
                "containerId": record["oldContainerId"], "composeSha": spec["base"]}
    running = h.is_running(name)
    if running:
        runtime(name, spec, True, expected_id=record["newContainerId"],
                require_healthy=False, volume_users=[name])
    else:
        created_selection(name, spec, expected_id=record["newContainerId"])
    if running:
        if h.image_id(spec["image"]) != spec["imageId"]:
            raise RuntimeError("ImageChangedBeforeRollbackStop")
        gate_files(spec, spec["target"], record["installedComposeIdentity"],
                   record["envSha"], record["envIdentity"])
        h.run(["docker", "stop", record["newContainerId"]], timeout=60)
    if h.is_running(name) or h.volume_running_containers(spec["volume"]):
        raise RuntimeError("VolumeStillInUse")
    stopped_compose, stopped_compose_stat = read_file(spec["compose"])
    stopped_env, stopped_env_stat = read_file(spec["env"])
    if (container_id(name) != record["newContainerId"] or
            digest(stopped_compose) != spec["target"] or
            identity(stopped_compose_stat) != record["installedComposeIdentity"] or
            digest(stopped_env) != record["envSha"] or
            identity(stopped_env_stat) != record["envIdentity"]):
        raise RuntimeError("ForeignChangeAfterStop")
    restored_identity = replace_owned(spec["compose"], original, spec["target"],
                                      record["installedComposeIdentity"])
    record["status"] = "ROLLBACK_COMPOSE_INSTALLED"
    record["rollbackComposeIdentity"] = restored_identity
    replace_metadata(backup / "state.json", record)
    if h.image_id(spec["image"]) != spec["imageId"] or h.is_running(name):
        raise RuntimeError("RollbackImageOrContainerDrift")
    created_selection(name, spec, expected_id=record["newContainerId"])
    compose_quiet(spec, spec["compose"])
    runtime(name, spec, True, expected_id=record["newContainerId"],
            require_healthy=False, volume_users=[])
    if h.image_id(spec["oldImage"]) != spec["oldImageId"]:
        raise RuntimeError("RollbackOldImageDrift")
    gate_files(spec, spec["base"], restored_identity,
               record["envSha"], record["envIdentity"])
    h.run(["docker", "compose", "--project-directory", str(spec["compose"].parent),
           "--env-file", str(spec["env"]), "--file", str(spec["compose"]),
           "create", "--force-recreate", "--no-build", "--pull", "never",
           spec["service"]], timeout=120)
    old_id = container_id(name)
    old_created = inspect(name)
    old_labels = json.loads(h.run(["docker", "inspect", "--format",
        '{"project":{{json (index .Config.Labels "com.docker.compose.project")}},'
        '"service":{{json (index .Config.Labels "com.docker.compose.service")}}}', name]))
    if (old_created["imageId"] != spec["oldImageId"] or
            old_created["imageRef"] != spec["oldImage"] or
            old_created["entrypoint"] != h.OLD_RUNTIME[name]["entrypoint"] or
            old_created["cmd"] != command(name, spec, False) or
            not isinstance(old_labels, dict) or set(old_labels) != {"project", "service"} or
            old_labels["project"] != spec["project"] or
            old_labels["service"] != spec["service"] or
            h.is_running(name) or h.volume_running_containers(spec["volume"])):
        raise RuntimeError("RollbackCreatedSelectionUnknown")
    if old_id == record["newContainerId"] or h.is_running(name):
        raise RuntimeError("RollbackCreatedContainerUnknown")
    runtime(name, spec, False, expected_id=old_id,
            require_healthy=False, volume_users=[])
    record["status"] = "ROLLBACK_CREATED"
    record["rollbackContainerId"] = old_id
    replace_metadata(backup / "state.json", record)
    if h.image_id(spec["image"]) != spec["imageId"]:
        raise RuntimeError("RollbackImageChangedBeforeStart")
    if container_id(name) != old_id or h.is_running(name) or \
            h.volume_running_containers(spec["volume"]):
        raise RuntimeError("RollbackCreatedContainerChanged")
    runtime(name, spec, False, expected_id=old_id,
            require_healthy=False, volume_users=[])
    gate_files(spec, spec["base"], restored_identity,
               record["envSha"], record["envIdentity"])
    h.run(["docker", "start", old_id], timeout=60)
    deadline = time.monotonic() + 60
    while True:
        if container_id(name) != old_id:
            raise RuntimeError("RollbackContainerChangedAfterStart")
        try:
            runtime(name, spec, False, expected_id=old_id)
            break
        except RuntimeError:
            if time.monotonic() >= deadline:
                raise RuntimeError("OldRuntimeUnhealthy") from None
            time.sleep(1)
    gate_files(spec, spec["base"], restored_identity,
               record["envSha"], record["envIdentity"])
    record["status"] = "ROLLED_BACK"
    replace_metadata(backup / "state.json", record)
    gate_files(spec, spec["base"], restored_identity,
               record["envSha"], record["envIdentity"])
    return {"status": "CORS_ROLLED_BACK_AWAITING_PUBLIC_SMOKE", "service": name,
            "remoteWrites": True, "backupId": backup.name,
            "containerId": old_id, "composeSha": spec["base"]}


def main():
    try:
        mode, name, *rest = sys.argv[1:]
        if name not in SPECS or mode not in ("check", "apply", "rollback") or \
                (mode == "rollback" and len(rest) != 1) or \
                (mode != "rollback" and rest):
            raise RuntimeError("ArgsUnknown")
        spec = SPECS[name]
        if mode == "check":
            state = preflight(name, spec)
            result = {"status": "READY_FOR_REVIEW", "service": name, "remoteWrites": False,
                      "composeSha": spec["base"], "candidateSha": spec["target"],
                      "imageId": spec["imageId"], "containerId": state["oldId"],
                      "volumeKiB": state["volumeKiB"], **state["budget"]}
        elif mode == "apply":
            result = apply(name, spec)
        else:
            result = rollback(name, spec, rest[0])
    except Exception:
        if (len(sys.argv) == 4 and sys.argv[1] == "rollback" and sys.argv[2] in SPECS and
                re.fullmatch(re.escape(sys.argv[2]) + r"-[0-9]{8}T[0-9]{6}Z-[0-9]+", sys.argv[3])):
            result = {"status": "STOP_ROLLBACK_NEEDS_OPERATOR", "service": sys.argv[2],
                      "remoteWrites": True, "backupId": sys.argv[3]}
        else:
            result = {"status": "STOP_UNCLASSIFIED", "service": sys.argv[2] if len(sys.argv) > 2 and
                      sys.argv[2] in SPECS else None, "remoteWrites": len(sys.argv) > 1 and
                      sys.argv[1] in ("apply", "rollback")}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] in ("READY_FOR_REVIEW", "CORS_APPLIED_AWAITING_PUBLIC_SMOKE",
                                     "CORS_ROLLED_BACK_AWAITING_PUBLIC_SMOKE") else 2


if __name__ == "__main__":
    sys.exit(main())
