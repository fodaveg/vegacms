"""Run only the separately reviewed second metadata reader; no remote writes."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "remote_stage_metadata.py"
NAMES = {"vega-pb", "lumbre-admin-pb", "fodaveg"}


def valid(value):
    if not isinstance(value, dict) or set(value) != {
        "schemaVersion", "mode", "remoteWrites", "configEnvRead", "caddyRead",
        "filesRead", "containers", "freeKiB", "backupUtilityCached", "status"
    }:
        return False
    if (value["schemaVersion"] != 1 or value["mode"] != "image-only-second-metadata" or
            value["remoteWrites"] is not False or value["configEnvRead"] is not False or
            value["caddyRead"] is not False or value["filesRead"] != [] or
            not isinstance(value["containers"], dict) or set(value["containers"]) != NAMES or
            value["status"] not in ("STOP", "READY_FOR_REVIEW") or
            not isinstance(value["backupUtilityCached"], bool) or
            (value["freeKiB"] is not None and
             (not isinstance(value["freeKiB"], int) or value["freeKiB"] < 0))):
        return False
    for item in value["containers"].values():
        if not isinstance(item, dict) or item.get("status") not in ("STOP", "READY_FOR_REVIEW"):
            return False
        if item.get("errorCode") == "MetadataUnavailable" and set(item) == {"status", "errorCode"}:
            continue
        if set(item) != {"oldIdStillRunning", "oldTagStillResolves", "stateRunning", "health",
                         "noPublishedPorts", "portKeys", "pocketBaseVersion", "status"}:
            return False
        if any(not isinstance(item[k], bool) for k in ("oldIdStillRunning", "oldTagStillResolves",
                                                      "stateRunning", "noPublishedPorts")):
            return False
        if (item["health"] not in (None, "healthy", "starting", "unhealthy") or
                not isinstance(item["portKeys"], list) or
                any(v not in ("8090/tcp", "4321/tcp") for v in item["portKeys"]) or
                not isinstance(item["pocketBaseVersion"], str) or
                re.fullmatch(r"0\.[0-9]{1,3}\.[0-9]{1,3}", item["pocketBaseVersion"]) is None):
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
        raise SystemExit("STOP: second metadata reader hash mismatch")
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output must be a new JSON file in this evidence directory")
    try:
        result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                                 "lumbre", "python3", "-B", "-"], input=source,
                                capture_output=True, timeout=150, check=False)
        if result.returncode or len(result.stdout) > 65536 or len(result.stderr) > 65536:
            raise ValueError("remote transport unavailable")
        value = json.loads(result.stdout)
        if not valid(value):
            raise ValueError("remote projection invalid")
    except (OSError, subprocess.TimeoutExpired, ValueError, json.JSONDecodeError):
        raise SystemExit("STOP: second metadata unavailable or invalid; no raw output saved") from None
    descriptor = os.open(str(args.out), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print("PREPARED_METADATA_REVIEW" if value["status"] == "READY_FOR_REVIEW" else "STOP_METADATA_REVIEW")
    return 0 if value["status"] == "READY_FOR_REVIEW" else 2


if __name__ == "__main__":
    sys.exit(main())
