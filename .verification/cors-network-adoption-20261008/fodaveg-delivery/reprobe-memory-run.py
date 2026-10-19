"""Send sealed read-only CORS state reader to server RAM; keep output closed."""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
HELPER = HERE.parent.parent / "image-only-delivery-20261008" / "remote_cutover.py"
APPLY = HERE / "remote_cutover_controlled.py"
READER = HERE / "reprobe-memory-read.py"
EXPECTED = {
    HELPER: "5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128",
    APPLY: "43b68aba0c937deef45ff3a9e2e33f6d3933fb06949605fdc3b0d9448d31c7b4",
}
BACKUP_ID = "fodaveg-20261008T231304Z-3656162"
HEX = re.compile(r"[0-9a-f]{64}\Z")
FAILURES = {"MemoryShapeUnknown", "MemoryUnavailable", "OldRuntimeUnknown", "StateUnknown", "SnapshotDrift", "OTHER_READ_UNAVAILABLE"}


def valid(value, code):
    if not isinstance(value, dict) or value.get("backupId") != BACKUP_ID or value.get("remoteWrites") is not False or value.get("privateValuesExported") is not False:
        return False
    if value.get("status") == "STOP_MEMORY_UNRESOLVED":
        return code == 2 and set(value) == {"status", "backupId", "failureClass", "remoteWrites", "privateValuesExported"} and value["failureClass"] in FAILURES
    fields = {"status", "backupId", "memTotalKiB", "memAvailableBeforeKiB", "memAvailableAfterKiB", "testMemoryCapKiB",
              "hostReserveKiB", "requiredAvailableKiB", "memoryBudgetPassed", "testCgroupAndTmpfsControlsProved",
              "remoteAllocationPerformed", "snapshotStable", "oldRuntimePinsPreserved", "remoteWrites", "privateValuesExported"}
    numbers = ("memTotalKiB", "memAvailableBeforeKiB", "memAvailableAfterKiB", "testMemoryCapKiB", "hostReserveKiB", "requiredAvailableKiB")
    return (code == 0 and value.get("status") == "MEMORY_METADATA_PROJECTED" and set(value) == fields
            and all(type(value[key]) is int and 0 <= value[key] <= 10**13 for key in numbers)
            and 0 <= value["memAvailableBeforeKiB"] <= value["memTotalKiB"] and 0 <= value["memAvailableAfterKiB"] <= value["memTotalKiB"] and value["memTotalKiB"] > 0
            and value["testMemoryCapKiB"] == 1572864 and value["hostReserveKiB"] == 1048576 and value["requiredAvailableKiB"] == 2621440
            and type(value["memoryBudgetPassed"]) is bool and value["memoryBudgetPassed"] == (min(value["memAvailableBeforeKiB"], value["memAvailableAfterKiB"]) >= 2621440)
            and value["snapshotStable"] is True and value["oldRuntimePinsPreserved"] is True
            and value["testCgroupAndTmpfsControlsProved"] is False and value["remoteAllocationPerformed"] is False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--reader-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output path unknown")
    sources = {}
    for path, expected in (*EXPECTED.items(), (READER, args.reader_sha256)):
        body = path.read_bytes()
        if hashlib.sha256(body).hexdigest() != expected:
            raise SystemExit("STOP: source seal drift")
        sources[path] = body
    bootstrap = "import base64,sys,types\n"
    for path, module in ((HELPER, "image_helpers"), (APPLY, "cors_apply")):
        encoded = base64.b64encode(sources[path]).decode("ascii")
        bootstrap += ("m=types.ModuleType('" + module + "')\n" +
                      "exec(compile(base64.b64decode('" + encoded +
                      "'),'<sealed-" + module + ">','exec'),m.__dict__)\n" +
                      "sys.modules['" + module + "']=m\n")
    encoded = base64.b64encode(sources[READER]).decode("ascii")
    bootstrap += ("exec(compile(base64.b64decode('" + encoded +
                  "'),'<sealed-cors-diagnose>','exec'),{'__name__':'__main__'})\n")
    command = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
               "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15",
               "-o", "ServerAliveCountMax=1", "lumbre", "python3", "-B", "-"]
    try:
        response = subprocess.run(command, input=bootstrap.encode("ascii"),
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                  timeout=90, check=False)
        if len(response.stdout) > 2048:
            raise ValueError("oversized")
        value = json.loads(response.stdout)
        if not valid(value, response.returncode):
            raise ValueError("schema")
    except (OSError, subprocess.TimeoutExpired, UnicodeError, ValueError):
        raise SystemExit("STOP: read unavailable; raw output discarded") from None
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(value["status"])
    return 0 if response.returncode == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
