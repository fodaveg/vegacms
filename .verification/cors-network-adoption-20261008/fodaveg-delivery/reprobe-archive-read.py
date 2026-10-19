"""Read-only archive attestation and TEST budget; never stop a live service."""
import hashlib
import json
import os
import stat
import sys
import tarfile

import image_helpers as h
import cors_apply as c

BACKUP_ID = "fodaveg-20261008T231304Z-3656162"
NAME = "fodaveg"
DOCKER_VOLUMES = "/var/lib/docker/volumes"
PIN = '{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}'
FAILURES = {"ArchiveUnknown", "StateUnknown", "ArchiveShapeUnknown", "ArchiveDuplicateOrTooMany",
            "ArchiveEmpty", "ArchiveScopeExceeded", "SnapshotDrift", "OldRuntimeUnknown",
            "DockerVolumesUnknown", "CommandUnavailable", "CommandExitNonzero"}


def pin(spec):
    observed = json.loads(h.run(["docker", "inspect", "--format", PIN, NAME]))
    expected = {"id": spec["containerId"], "image": spec["oldImageId"], "running": True, "health": "healthy"}
    if observed != expected or type(observed.get("running")) is not bool:
        raise RuntimeError("OldRuntimeUnknown")


def projected():
    spec = c.SPECS[NAME]
    backup = c.ROOT / BACKUP_ID
    if backup.is_symlink() or not backup.is_dir() or stat.S_IMODE(backup.stat().st_mode) != 0o700:
        raise RuntimeError("ArchiveUnknown")
    body, state_stat = c.read_file(backup / "state.json")
    state = json.loads(body)
    if (not isinstance(state, dict) or state.get("service") != NAME or state.get("status") != "PREPARED"
            or state.get("checkpoint") != "CLONE_CLEANUP_VOLUME" or state.get("oldContainerId") != spec["containerId"]
            or state.get("oldComposeSha") != spec["base"] or state.get("newComposeSha") != spec["target"]
            or state.get("imageId") != spec["imageId"] or state.get("envSha") != spec["envSha"]
            or state.get("newContainerId") is not None or state.get("rollbackContainerId") is not None):
        raise RuntimeError("StateUnknown")
    pin(spec)
    path = backup / "data.tgz"
    parent = c.parent_fd(path)
    parent_identity = (os.fstat(parent).st_dev, os.fstat(parent).st_ino)
    try:
        descriptor = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or stat.S_IMODE(before.st_mode) != 0o600 or not 0 < before.st_size <= 2 * 1024**3:
                raise RuntimeError("ArchiveUnknown")
            hasher = hashlib.sha256()
            for chunk in iter(lambda: stream.read(65536), b""):
                hasher.update(chunk)
            stream.seek(0)
            seen, files, expanded = set(), 0, 0
            with tarfile.open(fileobj=stream, mode="r:gz") as archive:
                for member in archive:
                    parts = h.safe_archive_parts(member)
                    key = "/".join(parts)
                    if key in seen or len(seen) >= 100000:
                        raise RuntimeError("ArchiveDuplicateOrTooMany")
                    seen.add(key)
                    if member.isfile():
                        files += 1
                        expanded += member.size
                        if expanded > 100 * 1024**3:
                            raise RuntimeError("ArchiveScopeExceeded")
            if not seen or files == 0 or expanded == 0:
                raise RuntimeError("ArchiveEmpty")
            if c.identity(before) != c.identity(os.fstat(stream.fileno())) or \
                    c.identity(before) != c.identity(os.stat(path.name, dir_fd=parent, follow_symlinks=False)):
                raise RuntimeError("SnapshotDrift")
            archive_identity = c.identity(before)
    finally:
        os.close(parent)
    # The default local TEST driver uses this canonical Docker storage parent.
    # Stat filesystem metadata only; no production-volume/database reads.
    storage = os.lstat(DOCKER_VOLUMES)
    if not stat.S_ISDIR(storage.st_mode) or stat.S_ISLNK(storage.st_mode):
        raise RuntimeError("DockerVolumesUnknown")
    srv, docker = os.statvfs(backup), os.statvfs(DOCKER_VOLUMES)
    free_srv = srv.f_bavail * srv.f_frsize // 1024
    free_docker = docker.f_bavail * docker.f_frsize // 1024
    same_fs = backup.stat().st_dev == storage.st_dev
    # Existing archive is retained: one clone, 128MiB PB headroom, 512MiB reserve.
    clone_kib = (expanded + 1023) // 1024 + 128 * 1024
    required_docker = clone_kib + 512 * 1024
    required_srv = required_docker + 1024 if same_fs else 512 * 1024 + 1024
    final_body, final_state_stat = c.read_file(backup / "state.json")
    if body != final_body or c.identity(state_stat) != c.identity(final_state_stat):
        raise RuntimeError("SnapshotDrift")
    final_parent = c.parent_fd(path)
    try:
        parent_stat = os.fstat(final_parent)
        if ((parent_stat.st_dev, parent_stat.st_ino) != parent_identity or
                c.identity(os.stat(path.name, dir_fd=final_parent, follow_symlinks=False)) != archive_identity):
            raise RuntimeError("SnapshotDrift")
    finally:
        os.close(final_parent)
    pin(spec)
    return {"status": "ARCHIVE_AND_BUDGET_PROJECTED", "backupId": BACKUP_ID,
            "archiveSha": hasher.hexdigest(), "archiveBytes": before.st_size,
            "archiveIdentity": archive_identity, "archiveFiles": files, "expandedBytes": expanded,
            "freeSrvKiB": free_srv, "freeDockerKiB": free_docker,
            "requiredSrvKiB": required_srv, "requiredDockerKiB": required_docker,
            "sameFilesystem": same_fs, "budgetPassed": free_srv >= required_srv and free_docker >= required_docker,
            "oldRuntimePinsPreserved": True, "snapshotStable": True,
            "remoteWrites": False, "privateValuesExported": False}


def main():
    try:
        if len(sys.argv) != 1:
            raise RuntimeError("StateUnknown")
        value = projected()
    except Exception as failure:
        label = str(failure)
        value = {"status": "STOP_ARCHIVE_UNRESOLVED", "backupId": BACKUP_ID,
                 "failureClass": label if label in FAILURES else "OTHER_READ_UNAVAILABLE",
                 "remoteWrites": False, "privateValuesExported": False}
    print(json.dumps(value, sort_keys=True, separators=(",", ":")))
    return 0 if value["status"] == "ARCHIVE_AND_BUDGET_PROJECTED" else 2


if __name__ == "__main__":
    sys.exit(main())
