"""Prepare only Caddy's Vega network, tracked Compose bytes, and live attachment.

This is a root-only, deliberately partial cutover. It never restarts Caddy or
edits Git's index, its Caddy configuration, dotenv, or other services.
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

import edge_base as base
import edge_phase2 as phase2

STATE_ROOT = Path("/srv/vega-edge-network-cutover")
OWNER_KEY = "com.fodaveg.vega-edge-cutover"
EXPECTED_HEAD = "2c3034b82efc070d5b747de8322936e3dbcc7459"
EXPECTED_BLOB = "03bae62b20f3c9b7bba8661091b688fb4afbb2cf"
EXPECTED_CANDIDATE = "6c527267ca840d9889b20766ff272cef477834045ccbf29387beab19ae70a977"
ID = re.compile(r"[0-9a-f]{64}\Z")


def digest(body):
    return hashlib.sha256(body).hexdigest()


def command(argv, *, limit=4096, timeout=30):
    """Retain raw Docker failures in server RAM only; emit finite status."""
    try:
        result = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("CommandUnavailable") from None
    if len(result.stdout) > limit or len(result.stderr) > limit:
        raise RuntimeError("CommandOversize")
    return result


def checked(argv, *, limit=4096, timeout=30):
    result = command(argv, limit=limit, timeout=timeout)
    if result.returncode:
        raise RuntimeError("CommandFailed")
    return result.stdout


def owned_directory():
    """Create one unique backup directory under a pinned /srv parent."""
    parent = os.open("/srv", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        root_name = STATE_ROOT.name
        try:
            os.mkdir(root_name, 0o700, dir_fd=parent)
        except FileExistsError:
            pass
        root = os.open(root_name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                       dir_fd=parent)
        try:
            root_stat = os.fstat(root)
            if root_stat.st_uid != os.geteuid() or stat.S_IMODE(root_stat.st_mode) != 0o700:
                raise RuntimeError("StateRootUnknown")
            name = "edge-" + secrets.token_hex(12)
            os.mkdir(name, 0o700, dir_fd=root)
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                            dir_fd=root)
            return name, child
        finally:
            os.close(root)
    finally:
        os.close(parent)


def save_new(fd, name, body):
    descriptor = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=fd)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(body)
        stream.flush()
        os.fsync(stream.fileno())
    os.fsync(fd)


def save_state(fd, value):
    body = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    name = "state-" + secrets.token_hex(8) + ".json"
    save_new(fd, name, body)
    os.rename(name, "state.json", src_dir_fd=fd, dst_dir_fd=fd)
    os.fsync(fd)


def git_guard(body):
    value = phase2.git_snapshot(body)
    if (value["gitClass"] != "EXACT_CLEAN" or value["headCommit"] != EXPECTED_HEAD or
            value["headBlob"] != EXPECTED_BLOB or
            value["indexBlob"] != EXPECTED_BLOB or
            value["workingBlob"] != EXPECTED_BLOB):
        raise RuntimeError("GitSourceChanged")


def git_installed_guard(body):
    """Keep HEAD/index owned while only the known working leaf is patched."""
    expected = hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest()
    value = phase2.git_snapshot(body)
    if (value["gitClass"] != "DIRTY" or value["headCommit"] != EXPECTED_HEAD or
            value["headBlob"] != EXPECTED_BLOB or value["indexBlob"] != EXPECTED_BLOB or
            value["workingBlob"] != expected or value["trackedClean"]):
        raise RuntimeError("GitSourceChanged")


def caddy_guard(*, attached=False):
    value = base.selected_container()
    if (not value["idMatches"] or not value["imageMatches"] or not value["running"] or
            value["composeSourceClass"] != "EXACT" or not value["edgeMember"] or
            value["vegaEdgeMember"] is not attached or value["otherNetworkCount"]):
        raise RuntimeError("CaddySelectionChanged")


def network_details(network_id, owner):
    template = ('{"id":{{json .ID}},"name":{{json .Name}},'
                '"driver":{{json .Driver}},"scope":{{json .Scope}},'
                '"internal":{{json .Internal}},'
                '"owner":{{json (index .Labels "' + OWNER_KEY + '")}},'
                '"memberCount":{{len .Containers}},'
                '"caddyMember":{{if index .Containers "' + base.CONTAINER_ID +
                '"}}true{{else}}false{{end}}}')
    value = json.loads(checked(["docker", "network", "inspect", "--format",
                                template, network_id], limit=16384))
    if (not isinstance(value, dict) or set(value) != {
            "id", "name", "driver", "scope", "internal", "owner", "memberCount",
            "caddyMember"} or
            value["id"] != network_id or value["name"] != "vega-edge" or
            value["driver"] != "bridge" or value["scope"] != "local" or
            value["internal"] is not False or value["owner"] != owner or
            type(value["memberCount"]) is not int or
            type(value["caddyMember"]) is not bool):
        raise RuntimeError("NetworkOwnershipChanged")
    if value["memberCount"] == 0 and not value["caddyMember"]:
        return set()
    if value["memberCount"] == 1 and value["caddyMember"]:
        return {base.CONTAINER_ID}
    raise RuntimeError("NetworkMembersUnknown")


def network_guard(network_id, owner, members):
    if phase2.selected_network_id() != network_id or \
            network_details(network_id, owner) != members:
        raise RuntimeError("NetworkSelectionChanged")


def parent_fd():
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in base.COMPOSE.parts[1:-1]:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                              dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def read_leaf(fd):
    descriptor = os.open(base.COMPOSE.name, os.O_RDONLY | os.O_NOFOLLOW |
                         os.O_NONBLOCK, dir_fd=fd)
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > 2 * 1024 * 1024:
            raise RuntimeError("ComposeShapeUnknown")
        body = stream.read(before.st_size + 1)
        after = os.fstat(stream.fileno())
    if len(body) != before.st_size or phase2.file_identity(before) != \
            phase2.file_identity(after):
        raise RuntimeError("ComposeChanged")
    return body, before


def temp_owned(fd, name, expected):
    try:
        info = os.stat(name, dir_fd=fd, follow_symlinks=False)
    except FileNotFoundError:
        return False
    return stat.S_ISREG(info.st_mode) and (info.st_dev, info.st_ino) == tuple(expected)


def source_guard(body, expected_identity):
    """Make the known leaf the final guard before a network side effect."""
    fd = parent_fd()
    try:
        current, info = read_leaf(fd)
        if current != body or phase2.file_identity(info) != tuple(expected_identity):
            raise RuntimeError("ComposeChanged")
    finally:
        os.close(fd)


def connect_owned(network_id, owner, candidate, installed):
    current, info = base.read_compose()
    if current != candidate or phase2.file_identity(info) != tuple(installed):
        raise RuntimeError("InstalledComposeChanged")
    git_installed_guard(current)
    network_guard(network_id, owner, set())
    caddy_guard()
    source_guard(candidate, installed)
    checked(["docker", "network", "connect", "--gw-priority=-1",
             network_id, base.CONTAINER_ID], limit=256)


def disconnect_owned(network_id, owner, original, restored_identity):
    current, _ = base.read_compose()
    git_guard(current)
    caddy_guard(attached=True)
    network_guard(network_id, owner, {base.CONTAINER_ID})
    source_guard(original, restored_identity)
    checked(["docker", "network", "disconnect", network_id,
             base.CONTAINER_ID], limit=256)


def remove_owned(network_id, owner, original, restored_identity):
    current, _ = base.read_compose()
    git_guard(current)
    caddy_guard()
    network_guard(network_id, owner, set())
    source_guard(original, restored_identity)
    checked(["docker", "network", "rm", network_id], limit=256)


def replace_compose(old, old_info, target, network_id, owner, before_replace):
    """CAS one pinned regular leaf, preserving owner/group/mode and temp inode."""
    fd = parent_fd()
    temp = base.COMPOSE.name + ".vega-edge-" + secrets.token_hex(8)
    created = False
    try:
        current, info = base.read_compose()
        if current != old or phase2.file_identity(info) != phase2.file_identity(old_info):
            raise RuntimeError("ComposeChanged")
        output = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=fd)
        created = True
        temp_id = (os.fstat(output).st_dev, os.fstat(output).st_ino)
        with os.fdopen(output, "wb") as stream:
            stream.write(target)
            os.fchown(stream.fileno(), old_info.st_uid, old_info.st_gid)
            os.fchmod(stream.fileno(), stat.S_IMODE(old_info.st_mode))
            stream.flush()
            os.fsync(stream.fileno())
            if (os.fstat(stream.fileno()).st_dev, os.fstat(stream.fileno()).st_ino) != temp_id:
                raise RuntimeError("TemporaryFileChanged")
        before_replace(temp_id)
        # Snapshot after all writes, then the last read-only ownership checks.
        current, info = base.read_compose()
        git_guard(current)
        caddy_guard()
        network_guard(network_id, owner, set())
        now_parent = parent_fd()
        try:
            if (os.fstat(fd).st_dev, os.fstat(fd).st_ino) != (
                    os.fstat(now_parent).st_dev, os.fstat(now_parent).st_ino):
                raise RuntimeError("ComposeParentChanged")
        finally:
            os.close(now_parent)
        current, info = read_leaf(fd)
        if current != old or phase2.file_identity(info) != phase2.file_identity(old_info) or \
                not temp_owned(fd, temp, temp_id):
            raise RuntimeError("ComposeChanged")
        os.replace(temp, base.COMPOSE.name, src_dir_fd=fd, dst_dir_fd=fd)
        created = False
        os.fsync(fd)
        installed, installed_info = base.read_compose()
        if installed != target or (installed_info.st_dev, installed_info.st_ino) != temp_id:
            raise RuntimeError("InstalledComposeUnknown")
        return phase2.file_identity(installed_info)
    finally:
        if created and 'temp_id' in locals() and temp_owned(fd, temp, temp_id):
            try:
                os.unlink(temp, dir_fd=fd)
            except FileNotFoundError:
                pass
        os.close(fd)


def preflight():
    current, info = base.read_compose()
    candidate = base.candidate(current)
    if digest(candidate) != EXPECTED_CANDIDATE:
        raise RuntimeError("CandidateChanged")
    git_guard(current)
    caddy_guard()
    if phase2.network_snapshot() != {"networkClass": "MISSING_CONFIRMED", "networkId": None}:
        raise RuntimeError("NetworkNotMissing")
    again, again_info = base.read_compose()
    if again != current or phase2.file_identity(again_info) != phase2.file_identity(info):
        raise RuntimeError("ComposeChanged")
    return current, info, candidate


def apply():
    original, info, candidate = preflight()
    name, state_fd = owned_directory()
    owner = "edge-" + secrets.token_hex(16)
    state = {"phase": "PREPARED", "owner": owner, "networkId": None,
             "composeInstalledIdentity": None, "caddyId": base.CONTAINER_ID,
             "oldComposeSha": base.BASE_SHA, "newComposeSha": EXPECTED_CANDIDATE,
             "oldComposeIdentity": phase2.file_identity(info)}
    try:
        save_new(state_fd, "compose.old", original)
        save_new(state_fd, "compose.new", candidate)
        save_state(state_fd, state)
        state["phase"] = "CREATE_PENDING"
        save_state(state_fd, state)
        # A fresh absence proof is required immediately before creation.
        if phase2.network_snapshot()["networkClass"] != "MISSING_CONFIRMED":
            raise RuntimeError("NetworkNotMissing")
        fresh, fresh_info = base.read_compose()
        if fresh != original or phase2.file_identity(fresh_info) != phase2.file_identity(info):
            raise RuntimeError("ComposeChanged")
        git_guard(fresh)
        caddy_guard()
        source_guard(original, phase2.file_identity(info))
        output = checked(["docker", "network", "create", "--driver", "bridge",
                          "--label", OWNER_KEY + "=" + owner, "vega-edge"], limit=256)
        network_id = output.strip().decode("ascii")
        if not ID.fullmatch(network_id):
            raise RuntimeError("CreatedNetworkIdUnknown")
        network_guard(network_id, owner, set())
        state.update({"phase": "NETWORK_CREATED", "networkId": network_id})
        save_state(state_fd, state)
        network_guard(network_id, owner, set())
        def before_replace(temp_id):
            state.update({"phase": "INSTALL_PENDING", "plannedComposeInode": temp_id})
            save_state(state_fd, state)
        installed = replace_compose(original, info, candidate, network_id, owner,
                                    before_replace)
        state.update({"phase": "SOURCE_INSTALLED_UNPUBLISHED",
                      "composeInstalledIdentity": installed})
        save_state(state_fd, state)
        current, current_info = base.read_compose()
        if current != candidate or phase2.file_identity(current_info) != tuple(installed):
            raise RuntimeError("InstalledComposeChanged")
        git_installed_guard(current)
        network_guard(network_id, owner, set())
        caddy_guard()
        state["phase"] = "CONNECT_PENDING"
        save_state(state_fd, state)
        # No Caddy restart; the old edge membership remains intact.
        # Keep the existing edge network as Caddy's default gateway.
        connect_owned(network_id, owner, candidate, installed)
        network_guard(network_id, owner, {base.CONTAINER_ID})
        caddy_guard(attached=True)
        state["phase"] = "CADDY_ATTACHED_PARTIAL"
        save_state(state_fd, state)
        current, current_info = base.read_compose()
        git_installed_guard(current)
        network_guard(network_id, owner, {base.CONTAINER_ID})
        caddy_guard(attached=True)
        fd = parent_fd()
        try:
            selected, selected_info = read_leaf(fd)
            if (selected != candidate or selected != current or
                    phase2.file_identity(selected_info) != tuple(installed) or
                    phase2.file_identity(current_info) != tuple(installed)):
                raise RuntimeError("InstalledComposeChanged")
        finally:
            os.close(fd)
        return {"status": "CADDY_ATTACHED_PARTIAL", "backupId": name,
                "networkId": network_id, "composeSha": EXPECTED_CANDIDATE,
                "caddyId": base.CONTAINER_ID, "remoteWrites": True,
                "privateValuesExported": False}
    except Exception:
        # No blind undo: the phase file and owner label permit a separately
        # reviewed, guarded recovery even after an ambiguous Docker failure.
        return {"status": "STOP_NEEDS_OPERATOR", "backupId": name,
                "remoteWrites": True, "privateValuesExported": False}
    finally:
        os.close(state_fd)


def read_saved(fd, name, limit=2 * 1024 * 1024):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                         dir_fd=fd)
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > limit or \
                stat.S_IMODE(before.st_mode) != 0o600:
            raise RuntimeError("BackupShapeUnknown")
        body = stream.read(before.st_size + 1)
        after = os.fstat(stream.fileno())
    if len(body) != before.st_size or phase2.file_identity(before) != \
            phase2.file_identity(after):
        raise RuntimeError("BackupChanged")
    return body


def open_backup(name):
    if not re.fullmatch(r"edge-[0-9a-f]{24}", name):
        raise RuntimeError("BackupIdUnknown")
    parent = os.open("/srv", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        root = os.open(STATE_ROOT.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                       dir_fd=parent)
        try:
            fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                         dir_fd=root)
        finally:
            os.close(root)
    finally:
        os.close(parent)
    info = os.fstat(fd)
    if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
        os.close(fd)
        raise RuntimeError("BackupOwnerUnknown")
    return fd


def restore_compose(current, info, original, owner, network_id, members,
                    state, fd):
    """Restore only this cutover's installed inode, with fresh source guards."""
    parent = parent_fd()
    temporary = base.COMPOSE.name + ".vega-edge-restore-" + secrets.token_hex(8)
    created = False
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                             os.O_NOFOLLOW, 0o600, dir_fd=parent)
        created = True
        planned = [os.fstat(descriptor).st_dev, os.fstat(descriptor).st_ino]
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(original)
            os.fchown(stream.fileno(), info.st_uid, info.st_gid)
            os.fchmod(stream.fileno(), stat.S_IMODE(info.st_mode))
            stream.flush()
            os.fsync(stream.fileno())
            if [os.fstat(stream.fileno()).st_dev, os.fstat(stream.fileno()).st_ino] != planned:
                raise RuntimeError("TemporaryFileChanged")
        state.update({"phase": "RESTORE_PENDING", "plannedRestoreInode": planned})
        save_state(fd, state)
        fresh, fresh_info = base.read_compose()
        git_installed_guard(fresh)
        caddy_guard(attached=bool(members))
        network_guard(network_id, owner, members)
        other_parent = parent_fd()
        try:
            if (os.fstat(parent).st_dev, os.fstat(parent).st_ino) != (
                    os.fstat(other_parent).st_dev, os.fstat(other_parent).st_ino):
                raise RuntimeError("ComposeParentChanged")
        finally:
            os.close(other_parent)
        fresh, fresh_info = read_leaf(parent)
        if fresh != current or phase2.file_identity(fresh_info) != \
                phase2.file_identity(info) or not temp_owned(parent, temporary, planned):
            raise RuntimeError("ComposeChanged")
        os.replace(temporary, base.COMPOSE.name, src_dir_fd=parent, dst_dir_fd=parent)
        created = False
        os.fsync(parent)
        restored, restored_info = base.read_compose()
        if restored != original or [restored_info.st_dev, restored_info.st_ino] != planned:
            raise RuntimeError("RestoredSourceUnknown")
        git_guard(restored)
        state.update({"phase": "SOURCE_RESTORED",
                      "restoredComposeIdentity": phase2.file_identity(restored_info)})
        save_state(fd, state)
    finally:
        if created and 'planned' in locals() and temp_owned(parent, temporary, planned):
            try:
                os.unlink(temporary, dir_fd=parent)
            except FileNotFoundError:
                pass
        os.close(parent)


def rollback_final_guard(original, expected_identity):
    if phase2.network_snapshot() != {"networkClass": "MISSING_CONFIRMED",
                                      "networkId": None}:
        raise RuntimeError("NetworkRemovalUnknown")
    current, _ = base.read_compose()
    git_guard(current)
    caddy_guard()
    source_guard(original, expected_identity)


def rollback(name):
    fd = open_backup(name)
    try:
        state = json.loads(read_saved(fd, "state.json", 8192))
        original = read_saved(fd, "compose.old")
        candidate = read_saved(fd, "compose.new")
        if (not isinstance(state, dict) or state.get("owner") is None or
                not re.fullmatch(r"edge-[0-9a-f]{32}", state["owner"]) or
                state.get("caddyId") != base.CONTAINER_ID or
                state.get("oldComposeSha") != base.BASE_SHA or
                state.get("newComposeSha") != EXPECTED_CANDIDATE or
                digest(original) != base.BASE_SHA or
                digest(candidate) != EXPECTED_CANDIDATE or
                base.candidate(original) != candidate):
            raise RuntimeError("BackupIdentityUnknown")
        phase = state.get("phase")
        if phase not in {"CREATE_PENDING", "NETWORK_CREATED", "INSTALL_PENDING",
                         "SOURCE_INSTALLED_UNPUBLISHED", "CONNECT_PENDING",
                         "CADDY_ATTACHED_PARTIAL", "RESTORE_PENDING",
                         "SOURCE_RESTORED", "DISCONNECT_PENDING",
                         "CADDY_DETACHED", "REMOVE_PENDING"}:
            raise RuntimeError("RecoveryPhaseUnknown")
        network_id = state.get("networkId")
        if network_id is None and phase == "CREATE_PENDING":
            network_id = phase2.selected_network_id()
            if network_id is None:
                current, info = base.read_compose()
                if current != original or phase2.file_identity(info) != \
                        tuple(state["oldComposeIdentity"]):
                    raise RuntimeError("SourceChanged")
                git_guard(current)
                caddy_guard()
                state["phase"] = "ROLLED_BACK"
                save_state(fd, state)
                rollback_final_guard(original, state["oldComposeIdentity"])
                return {"status": "EDGE_PARTIAL_ROLLED_BACK", "backupId": name,
                        "remoteWrites": True, "privateValuesExported": False}
        if not isinstance(network_id, str) or not ID.fullmatch(network_id):
            raise RuntimeError("NetworkIdUnknown")
        if phase == "REMOVE_PENDING" and phase2.selected_network_id() is None:
            current, info = base.read_compose()
            if current != original or phase2.file_identity(info) != \
                    tuple(state.get("restoredComposeIdentity", [])):
                raise RuntimeError("RestoredSourceChanged")
            git_guard(current)
            caddy_guard()
            if phase2.network_snapshot() != {"networkClass": "MISSING_CONFIRMED",
                                              "networkId": None}:
                raise RuntimeError("NetworkRemovalUnknown")
            state["phase"] = "ROLLED_BACK"
            save_state(fd, state)
            rollback_final_guard(original, state["restoredComposeIdentity"])
            return {"status": "EDGE_PARTIAL_ROLLED_BACK", "backupId": name,
                    "remoteWrites": True, "privateValuesExported": False}
        members = network_details(network_id, state["owner"])
        if phase2.selected_network_id() != network_id:
            raise RuntimeError("NetworkSelectionChanged")
        if members not in (set(), {base.CONTAINER_ID}):
            raise RuntimeError("NetworkMembersUnknown")
        if members and phase not in {"CONNECT_PENDING", "CADDY_ATTACHED_PARTIAL",
                                     "RESTORE_PENDING", "SOURCE_RESTORED",
                                     "DISCONNECT_PENDING"}:
            raise RuntimeError("AttachmentOwnershipUnknown")
        current, info = base.read_compose()
        caddy_guard(attached=bool(members))
        if current == candidate:
            planned = state.get("plannedComposeInode")
            installed = state.get("composeInstalledIdentity")
            identity = phase2.file_identity(info)
            if not (isinstance(planned, list) and len(planned) == 2 and
                    [info.st_dev, info.st_ino] == planned and
                    (installed is None or tuple(installed) == identity)):
                raise RuntimeError("InstalledSourceUnknown")
            git_installed_guard(current)
            restore_compose(current, info, original, state["owner"], network_id,
                            members, state, fd)
        elif current == original:
            actual = phase2.file_identity(info)
            if phase in {"CREATE_PENDING", "NETWORK_CREATED", "INSTALL_PENDING"}:
                if actual != tuple(state["oldComposeIdentity"]):
                    raise RuntimeError("OriginalSourceChanged")
                state["restoredComposeIdentity"] = actual
                save_state(fd, state)
            elif phase == "RESTORE_PENDING":
                planned = state.get("plannedRestoreInode")
                if not (isinstance(planned, list) and len(planned) == 2 and
                        [info.st_dev, info.st_ino] == planned and
                        actual[2:5] == tuple(state["oldComposeIdentity"])[2:5]):
                    raise RuntimeError("RestoredSourceUnknown")
                state.update({"phase": "SOURCE_RESTORED",
                              "restoredComposeIdentity": actual})
                save_state(fd, state)
            elif actual != tuple(state.get("restoredComposeIdentity", [])):
                raise RuntimeError("RestoredSourceChanged")
            git_guard(current)
        else:
            raise RuntimeError("SourceUnknown")
        if members:
            state["phase"] = "DISCONNECT_PENDING"
            save_state(fd, state)
            disconnect_owned(network_id, state["owner"], original,
                             state["restoredComposeIdentity"])
            network_guard(network_id, state["owner"], set())
            caddy_guard()
        state["phase"] = "CADDY_DETACHED"
        save_state(fd, state)
        state["phase"] = "REMOVE_PENDING"
        save_state(fd, state)
        remove_owned(network_id, state["owner"], original,
                     state["restoredComposeIdentity"])
        if phase2.network_snapshot() != {"networkClass": "MISSING_CONFIRMED", "networkId": None}:
            raise RuntimeError("NetworkRemovalUnknown")
        current, info = base.read_compose()
        if current != original or phase2.file_identity(info) != \
                tuple(state["restoredComposeIdentity"]):
            raise RuntimeError("RestoredSourceChanged")
        git_guard(current)
        caddy_guard()
        source_guard(original, state["restoredComposeIdentity"])
        state["phase"] = "ROLLED_BACK"
        save_state(fd, state)
        rollback_final_guard(original, state["restoredComposeIdentity"])
        return {"status": "EDGE_PARTIAL_ROLLED_BACK", "backupId": name,
                "remoteWrites": True, "privateValuesExported": False}
    except Exception:
        return {"status": "STOP_ROLLBACK_NEEDS_OPERATOR", "backupId": name,
                "remoteWrites": True, "privateValuesExported": False}
    finally:
        os.close(fd)


def main():
    if len(sys.argv) not in (2, 3) or sys.argv[1] not in ("apply", "rollback") or \
            (sys.argv[1] == "apply") != (len(sys.argv) == 2):
        print(json.dumps({"status": "STOP_PREFLIGHT", "remoteWrites": False,
                          "privateValuesExported": False}))
        return 2
    try:
        result = apply() if sys.argv[1] == "apply" else rollback(sys.argv[2])
    except Exception:
        result = {"status": "STOP_PREFLIGHT", "remoteWrites": False,
                  "privateValuesExported": False}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] in {
        "CADDY_ATTACHED_PARTIAL", "EDGE_PARTIAL_ROLLED_BACK"} else 2


if __name__ == "__main__":
    sys.exit(main())
