"""Release-owner wrapper for one approved snapshot+same-image forward start."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "remote_fod_forward_recovery.py"
NEW_ID = "sha256:0e0ef56341d677366cfc00d91e2ead83da0ebcc4372f7ba627f575be682ee51f"
ORIGINAL_SHA = "8d81dfebb9d61e98049d1d778a873f93f0d1d5d7e76b9daf47064ab72771c03b"
BOOLS = {"remoteWrites", "startAttempted", "oldImageStarted", "liveDataRestored", "privateLogsRead",
         "running", "newImageMatches", "pbProcessMatches", "nodeProcessPresent"}
INTS = {"schemaVersion", "postattemptSnapshotBytes", "volumeKiB", "freeSrvKiB", "requiredSrvKiB"}
STATUS = {"STOP_PRESTART", "STOP_AFTER_START_ATTEMPT", "FORWARD_NATIVE_SMOKE_PASS",
          "FORWARD_NATIVE_SMOKE_PASS_HEALTH_PENDING", "FORWARD_NATIVE_SMOKE_FAILED"}
ERRORS = {"CommandTimeout", "CommandUnavailable", "CommandRejected", "BackupUtilityUnavailable",
          "VolumeIdentityUnknown", "VolumeSizeUnknown", "InsufficientSnapshotSpace", "BackupDirectoryUnsafe",
          "SnapshotUnavailable", "RuntimeIdentityDrift", "OtherVolumeWriter", "DeploymentFilesDrift",
          "PrestartGuardRejected", "RecoveryUnavailable"}


def valid(value):
    required = {"schemaVersion", "service", "mode", "status", "remoteWrites", "startAttempted",
                "oldImageStarted", "liveDataRestored", "privateLogsRead", "originalSnapshotSha256", "newImageId"}
    allowed = required | BOOLS | INTS | {"postattemptBackupDir", "postattemptSnapshotSha256", "nativeHealth",
                                       "pbHttpStatus", "astroHttpStatus", "errorCode"}
    if not isinstance(value, dict) or not required <= set(value) or set(value) - allowed:
        return False
    if value["schemaVersion"] != 1 or value["service"] != "fodaveg" or value["mode"] != "forward-same-image" or \
            not isinstance(value["status"], str) or value["status"] not in STATUS or value["newImageId"] != NEW_ID or value["originalSnapshotSha256"] != ORIGINAL_SHA:
        return False
    if any(value[key] is not False for key in ("oldImageStarted", "liveDataRestored", "privateLogsRead")):
        return False
    for key, body in value.items():
        if key in BOOLS and type(body) is not bool:
            return False
        if key in INTS and (type(body) is not int or not 0 <= body <= 100 * 1024 ** 3):
            return False
        if key in {"pbHttpStatus", "astroHttpStatus"} and body is not None and (type(body) is not int or not 100 <= body <= 599):
            return False
        if key == "nativeHealth" and (not isinstance(body, str) or body not in {"healthy", "unhealthy", "starting", "none", "unknown"}):
            return False
        if key == "errorCode" and (not isinstance(body, str) or body not in ERRORS):
            return False
        if key == "postattemptSnapshotSha256" and (not isinstance(body, str) or re.fullmatch(r"[0-9a-f]{64}", body) is None):
            return False
        if key == "postattemptBackupDir" and (not isinstance(body, str) or re.fullmatch(
            r"/srv/vega-image-rollout/fodaveg-forward-preserve-[0-9]{8}T[0-9]{6}Z-[0-9]+", body) is None):
            return False
    if value["status"].startswith("FORWARD_NATIVE_SMOKE_PASS"):
        return all(value.get(key) is True for key in ("remoteWrites", "startAttempted", "running", "newImageMatches", "pbProcessMatches", "nodeProcessPresent")) and \
            value.get("pbHttpStatus") == 200 and value.get("astroHttpStatus") == 200 and \
            {"postattemptBackupDir", "postattemptSnapshotSha256", "postattemptSnapshotBytes"} <= set(value)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source = SOURCE.read_bytes()
    if hashlib.sha256(source).hexdigest() != args.script_sha256:
        raise SystemExit("STOP: forward recovery source hash mismatch")
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: new JSON required in recovery evidence directory")
    try:
        result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2",
            "lumbre", "python3", "-B", "-"], input=source, capture_output=True, timeout=900, check=False)
        if result.returncode or len(result.stdout) > 65536 or len(result.stderr) > 65536:
            raise ValueError("TransportRejected")
        value = json.loads(result.stdout)
        if not valid(value):
            raise ValueError("ProjectionRejected")
    except (OSError, subprocess.TimeoutExpired, ValueError, UnicodeDecodeError):
        raise SystemExit("STOP: forward recovery transport/projection rejected; preserve remote state") from None
    fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(value["status"])
    return 0 if value["status"].startswith("FORWARD_NATIVE_SMOKE_PASS") else 2


if __name__ == "__main__":
    sys.exit(main())
