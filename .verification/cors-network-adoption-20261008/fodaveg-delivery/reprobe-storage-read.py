"""Read the daemon's literal DockerRootDir only in RAM, then stat its allocator."""
import json
import os
from pathlib import Path
import stat
import sys

import image_helpers as h
import cors_apply as c

BACKUP_ID = "fodaveg-20261008T231304Z-3656162"
EXPANDED_BYTES = 875290525
PIN = '{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}'
FAILURES = {"DaemonRootUnknown", "AllocatorParentUnknown", "OldRuntimeUnknown",
            "StateUnknown", "SnapshotDrift", "CommandUnavailable", "CommandExitNonzero"}


def pin():
    spec = c.SPECS["fodaveg"]
    raw = json.loads(h.run(["docker", "inspect", "--format", PIN, "fodaveg"]))
    if raw != {"id": spec["containerId"], "image": spec["oldImageId"], "running": True, "health": "healthy"} or type(raw.get("running")) is not bool:
        raise RuntimeError("OldRuntimeUnknown")


def projected():
    spec = c.SPECS["fodaveg"]
    backup = c.ROOT / BACKUP_ID
    body, before = c.read_file(backup / "state.json")
    state = json.loads(body)
    if (not isinstance(state, dict) or state.get("service") != "fodaveg" or state.get("status") != "PREPARED"
            or state.get("oldContainerId") != spec["containerId"] or state.get("imageId") != spec["imageId"]
            or state.get("oldComposeSha") != spec["base"] or state.get("newComposeSha") != spec["target"]):
        raise RuntimeError("StateUnknown")
    pin()
    raw = h.run(["docker", "info", "--format", "{{json .DockerRootDir}}"])
    if len(raw) > 8192:
        raise RuntimeError("DaemonRootUnknown")
    root_text = json.loads(raw)
    if not isinstance(root_text, str) or not 1 <= len(root_text) <= 4096 or "\0" in root_text:
        raise RuntimeError("DaemonRootUnknown")
    root = Path(root_text)
    if not root.is_absolute() or ".." in root.parts or root_text != str(root):
        raise RuntimeError("DaemonRootUnknown")
    root_stat = os.lstat(root)
    if not stat.S_ISDIR(root_stat.st_mode) or stat.S_ISLNK(root_stat.st_mode):
        raise RuntimeError("DaemonRootUnknown")
    # The explicitly local, option-free constructor selects RootDir/volumes.
    # Mountpoint/Driver/empty options must still be proved after TEST creation.
    allocator = root / "volumes"
    allocator_stat = os.lstat(allocator)
    if not stat.S_ISDIR(allocator_stat.st_mode) or stat.S_ISLNK(allocator_stat.st_mode):
        raise RuntimeError("AllocatorParentUnknown")
    root_fs, allocator_fs, srv_fs = os.statvfs(root), os.statvfs(allocator), os.statvfs(backup)
    free_root = root_fs.f_bavail * root_fs.f_frsize // 1024
    free_allocator = allocator_fs.f_bavail * allocator_fs.f_frsize // 1024
    free_srv = srv_fs.f_bavail * srv_fs.f_frsize // 1024
    same_fs = backup.stat().st_dev == allocator_stat.st_dev
    required_allocator = (EXPANDED_BYTES + 1023) // 1024 + (128 + 512) * 1024
    required_srv = required_allocator + 1024 if same_fs else 512 * 1024 + 1024
    final, after = c.read_file(backup / "state.json")
    # Re-read only the same scalar; neither path nor whole Docker info is exported.
    final_root = json.loads(h.run(["docker", "info", "--format", "{{json .DockerRootDir}}"] ))
    if final != body or c.identity(before) != c.identity(after) or final_root != root_text or \
            (os.lstat(root).st_dev, os.lstat(root).st_ino) != (root_stat.st_dev, root_stat.st_ino) or \
            (os.lstat(allocator).st_dev, os.lstat(allocator).st_ino) != (allocator_stat.st_dev, allocator_stat.st_ino):
        raise RuntimeError("SnapshotDrift")
    pin()
    return {"status": "DAEMON_ALLOCATOR_METADATA_PROJECTED", "backupId": BACKUP_ID,
            "rootDirectoryProved": True, "localAllocatorParentDirectoryProved": True,
            "rootAndAllocatorSameFilesystem": root_stat.st_dev == allocator_stat.st_dev,
            "archiveAndAllocatorSameFilesystem": same_fs, "freeRootKiB": free_root,
            "freeAllocatorKiB": free_allocator, "freeSrvKiB": free_srv,
            "requiredAllocatorKiB": required_allocator, "requiredSrvKiB": required_srv,
            "budgetPassed": free_allocator >= required_allocator and free_srv >= required_srv,
            "futureDriver": "EXPLICIT_LOCAL_NO_OPTIONS_RUNTIME_MOUNTPOINT_CHECK_REQUIRED",
            "snapshotStable": True, "oldRuntimePinsPreserved": True,
            "remoteWrites": False, "privateValuesExported": False}


def main():
    try:
        if len(sys.argv) != 1:
            raise RuntimeError("StateUnknown")
        value = projected()
    except Exception as failure:
        label = str(failure)
        value = {"status": "STOP_ALLOCATOR_UNRESOLVED", "backupId": BACKUP_ID,
                 "failureClass": label if label in FAILURES else "OTHER_READ_UNAVAILABLE",
                 "remoteWrites": False, "privateValuesExported": False}
    print(json.dumps(value, sort_keys=True, separators=(",", ":")))
    return 0 if value["status"] == "DAEMON_ALLOCATOR_METADATA_PROJECTED" else 2


if __name__ == "__main__":
    sys.exit(main())
