"""Release-owner SSH wrapper; strict public projection, no raw stdout/stderr."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "remote_fod_failure_readonly.py"
BOOLS = {"remoteWrites", "configEnvRead", "logsRead", "imageIsNew", "imageIsOld", "refIsNew", "refIsOld",
         "entrypointMatches", "cmdMatches", "running", "oomKilled", "stateErrorPresent", "mountsMatch",
         "networksMatch", "portsPresent", "port8090Present", "port4321Present", "portsMatch",
         "exposedPortsMatch", "pbArgvMatches", "onlyExpectedRunningVolumeMount",
         "unexpectedRunningVolumeMountPresent", "nativeHealthAbsent", "containerHealthcheckPresent",
         "newTagMatchesExpectedImage", "newImageHealthcheckAbsent", "composeHealthcheckPresent"}
INTS = {"schemaVersion", "exitCode", "restartCount", "failingStreak", "healthCheckCount",
        "healthLastExitCode", "mountCount", "networkCount", "portCount", "pbProcessCount",
        "nodeProcessCount", "tiniProcessCount", "runningVolumeMountCount"}
FILES = {"compose", "dotenv", "backupCompose", "backupDotenv", "snapshot"}
for name in FILES:
    BOOLS.update({name + "Exists", name + "PrivateMode"})
    if name != "snapshot":
        BOOLS.add(name + "Matches")
    INTS.add(name + "Bytes")
SHAS = {name + "Sha256" for name in FILES}
ENUMS = {"service": {"fodaveg"}, "mode": {"fod-failure-readonly"}, "status": {"DIAGNOSED", "PARTIAL"},
         "cmdShape": {"null", "empty", "other"},
         "state": {"created", "running", "paused", "restarting", "removing", "exited", "dead", "unknown"},
         "health": {"healthy", "unhealthy", "starting", "none", "unknown"},
         "processProbe": {"read", "skipped-stopped"}}
ERRORS = {"CommandTimeout", "CommandUnavailable", "CommandNonzero", "CommandOversize",
          "FileShapeUnknown", "ConcurrentFileChange", "InspectShapeUnknown", "ProcessShapeUnknown",
          "FileUnavailable", "ProjectionUnavailable"}
BACKUP = "/srv/vega-image-rollout/fodaveg-20261008T200548Z-3247510"


def valid(value):
    if not isinstance(value, dict) or not {"schemaVersion", "service", "mode", "status", "remoteWrites",
            "configEnvRead", "logsRead", "backupDir", "errors"} <= set(value):
        return False
    allowed = BOOLS | INTS | SHAS | set(ENUMS) | {"backupDir", "errors", "observedImageId", "startedAt", "finishedAt"}
    if set(value) - allowed or value["schemaVersion"] != 1 or value["backupDir"] != BACKUP:
        return False
    if any(value.get(key) is not False for key in ("remoteWrites", "configEnvRead", "logsRead")):
        return False
    for key, body in value.items():
        if key in BOOLS and type(body) is not bool:
            return False
        if key in INTS and body is not None and (type(body) is not int or not -1 <= body <= 100 * 1024 ** 3):
            return False
        if key in SHAS and (not isinstance(body, str) or re.fullmatch(r"[0-9a-f]{64}", body) is None):
            return False
        if key in ENUMS and (not isinstance(body, str) or body not in ENUMS[key]):
            return False
        if key == "observedImageId" and (not isinstance(body, str) or re.fullmatch(r"sha256:[0-9a-f]{64}", body) is None):
            return False
        if key in {"startedAt", "finishedAt"} and (not isinstance(body, str) or re.fullmatch(
                r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z", body) is None):
            return False
    errors = value["errors"]
    if not isinstance(errors, dict) or set(errors) - (FILES | {"runtime", "processes", "volume", "image", "composeHealthcheck"}):
        return False
    if any(not isinstance(body, str) or body not in ERRORS for body in errors.values()):
        return False
    return value["status"] == ("PARTIAL" if errors else "DIAGNOSED")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source = SOURCE.read_bytes()
    if hashlib.sha256(source).hexdigest() != args.script_sha256:
        raise SystemExit("STOP: diagnostic source hash mismatch")
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: new JSON required in diagnostic evidence directory")
    try:
        result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                                 "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15",
                                 "-o", "ServerAliveCountMax=2",
                                 "lumbre", "python3", "-B", "-"], input=source,
                                capture_output=True, timeout=600, check=False)
        if result.returncode != 0 or len(result.stdout) > 65536 or len(result.stderr) > 65536:
            raise ValueError("TransportRejected")
        value = json.loads(result.stdout)
        if not valid(value):
            raise ValueError("ProjectionRejected")
    except (OSError, subprocess.TimeoutExpired, ValueError, UnicodeDecodeError):
        raise SystemExit("STOP: diagnostic transport/projection rejected") from None
    fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(value["status"])
    return 0 if value["status"] == "DIAGNOSED" else 2


if __name__ == "__main__":
    sys.exit(main())
