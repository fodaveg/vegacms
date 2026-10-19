"""Only MemTotal/MemAvailable and existing OLD/backup metadata, no allocation."""
import json
import os
from pathlib import Path
import re
import stat
import sys

import image_helpers as h
import cors_apply as c

BACKUP_ID = "fodaveg-20261008T231304Z-3656162"
MEMINFO = Path("/proc/meminfo")
TEST_CAP_KIB = 1536 * 1024
HOST_RESERVE_KIB = 1024 * 1024
PIN = '{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}'
FAILURES = {"MemoryShapeUnknown", "MemoryUnavailable", "OldRuntimeUnknown", "StateUnknown", "SnapshotDrift"}


def memory():
    """Read at most 8192 bytes; project exactly the two literal kB counters."""
    selected = {}
    fd = os.open(MEMINFO, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise RuntimeError("MemoryUnavailable")
        consumed = 0
        while len(selected) < 2:
            line = stream.readline(512)
            consumed += len(line)
            if not line or consumed > 8192 or not line.endswith(b"\n"):
                raise RuntimeError("MemoryShapeUnknown")
            key, separator, value = line.partition(b":")
            if key not in (b"MemTotal", b"MemAvailable"):
                continue
            if not separator or key in selected:
                raise RuntimeError("MemoryShapeUnknown")
            match = re.fullmatch(rb"\s+([0-9]{1,14}) kB\n", value)
            if match is None:
                raise RuntimeError("MemoryShapeUnknown")
            selected[key] = int(match[1])
    total, available = selected[b"MemTotal"], selected[b"MemAvailable"]
    if not 0 <= available <= total <= 10**13 or total == 0:
        raise RuntimeError("MemoryShapeUnknown")
    return total, available


def pin():
    spec = c.SPECS["fodaveg"]
    raw = json.loads(h.run(["docker", "inspect", "--format", PIN, spec["containerId"]]))
    if raw != {"id": spec["containerId"], "image": spec["oldImageId"], "running": True, "health": "healthy"} or type(raw.get("running")) is not bool:
        raise RuntimeError("OldRuntimeUnknown")


def projected():
    spec = c.SPECS["fodaveg"]
    path = c.ROOT / BACKUP_ID / "state.json"
    body, before = c.read_file(path)
    value = json.loads(body)
    if (not isinstance(value, dict) or value.get("service") != "fodaveg" or value.get("status") != "PREPARED"
            or value.get("oldContainerId") != spec["containerId"] or value.get("imageId") != spec["imageId"]
            or value.get("oldComposeSha") != spec["base"] or value.get("newComposeSha") != spec["target"]):
        raise RuntimeError("StateUnknown")
    pin()
    total_before, available_before = memory()
    total_after, available_after = memory()
    final, after = c.read_file(path)
    if final != body or c.identity(before) != c.identity(after) or total_before != total_after:
        raise RuntimeError("SnapshotDrift")
    pin()
    required = TEST_CAP_KIB + HOST_RESERVE_KIB
    return {"status": "MEMORY_METADATA_PROJECTED", "backupId": BACKUP_ID,
            "memTotalKiB": total_before, "memAvailableBeforeKiB": available_before,
            "memAvailableAfterKiB": available_after, "testMemoryCapKiB": TEST_CAP_KIB,
            "hostReserveKiB": HOST_RESERVE_KIB, "requiredAvailableKiB": required,
            "memoryBudgetPassed": min(available_before, available_after) >= required,
            "testCgroupAndTmpfsControlsProved": False, "remoteAllocationPerformed": False,
            "snapshotStable": True, "oldRuntimePinsPreserved": True,
            "remoteWrites": False, "privateValuesExported": False}


def main():
    try:
        if len(sys.argv) != 1:
            raise RuntimeError("StateUnknown")
        result = projected()
    except Exception as failure:
        label = str(failure)
        result = {"status": "STOP_MEMORY_UNRESOLVED", "backupId": BACKUP_ID,
                  "failureClass": label if label in FAILURES else "OTHER_READ_UNAVAILABLE",
                  "remoteWrites": False, "privateValuesExported": False}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] == "MEMORY_METADATA_PROJECTED" else 2


if __name__ == "__main__":
    sys.exit(main())
