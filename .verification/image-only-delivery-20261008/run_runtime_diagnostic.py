"""Transport one reviewed read-only binary/volume diagnostic; no implicit SSH."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "remote_runtime_diagnostic.py"
NAMES = {"lumbre-admin-pb", "fodaveg"}
VOLUMES = {"vega_data", "lumbre_admin_pb_data", "fodaveg_fodaveg_pb"}


def valid(value):
    if not isinstance(value, dict) or set(value) != {
        "schemaVersion", "mode", "remoteWrites", "configEnvRead", "caddyRead",
        "binaryRawPersisted", "versions", "volumesKiB", "freeKiB", "status"
    }:
        return False
    if (value["schemaVersion"] != 1 or value["mode"] != "custom-pb-buildinfo-and-volume-size" or
            value["remoteWrites"] is not False or value["configEnvRead"] is not False or
            value["caddyRead"] is not False or value["binaryRawPersisted"] is not False or
            not isinstance(value["versions"], dict) or set(value["versions"]) != NAMES or
            not isinstance(value["volumesKiB"], dict) or set(value["volumesKiB"]) != VOLUMES or
            value["status"] not in ("STOP", "READY_FOR_REVIEW")):
        return False
    if value["freeKiB"] is not None and (not isinstance(value["freeKiB"], int) or value["freeKiB"] < 0):
        return False
    for amount in value["volumesKiB"].values():
        if amount is not None and (not isinstance(amount, int) or amount < 0):
            return False
    for item in value["versions"].values():
        if not isinstance(item, dict):
            return False
        if item == {"errorCode": "BuildInfoUnavailable"}:
            continue
        if set(item) != {"moduleVersion", "binarySha256", "binaryBytes", "matchesSourcePin"}:
            return False
        if (not isinstance(item["moduleVersion"], str) or
                re.fullmatch(r"0\.[0-9]{1,3}\.[0-9]{1,3}", item["moduleVersion"]) is None or
                not isinstance(item["binarySha256"], str) or
                re.fullmatch(r"[0-9a-f]{64}", item["binarySha256"]) is None or
                not isinstance(item["binaryBytes"], int) or not 0 < item["binaryBytes"] <= 200 * 1024 * 1024 or
                not isinstance(item["matchesSourcePin"], bool)):
            return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source = SOURCE.read_bytes()
    if hashlib.sha256(source).hexdigest() != args.script_sha256:
        raise SystemExit("STOP: runtime diagnostic hash mismatch")
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output must be a new JSON file in this evidence directory")
    try:
        result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                                 "lumbre", "python3", "-B", "-"], input=source,
                                capture_output=True, timeout=300, check=False)
        if result.returncode or len(result.stdout) > 65536 or len(result.stderr) > 65536:
            raise ValueError("remote transport unavailable")
        value = json.loads(result.stdout)
        if not valid(value):
            raise ValueError("remote projection invalid")
    except (OSError, subprocess.TimeoutExpired, ValueError, json.JSONDecodeError):
        raise SystemExit("STOP: runtime diagnostic unavailable or invalid; no raw output saved") from None
    descriptor = os.open(str(args.out), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print("PREPARED_RUNTIME_REVIEW" if value["status"] == "READY_FOR_REVIEW" else "STOP_RUNTIME_REVIEW")
    return 0 if value["status"] == "READY_FOR_REVIEW" else 2


if __name__ == "__main__":
    sys.exit(main())
