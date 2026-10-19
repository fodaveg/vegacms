"""Release-owner wrapper for the separately approved private health classifier."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "remote_fod_health_classifier.py"
BOOLS = {"remoteWrites", "dockerLogsRead", "healthOutputRead", "imageMatches", "running", "testPresent",
         "testCmdShell", "testCmd", "testDisabled", "testUsesWget", "testUsesCurl", "urlLocalhost",
         "urlIPv4Loopback", "urlIPv6Loopback", "urlPB8090", "urlAstro4321", "urlApiHealth"}
INTS = {"schemaVersion", "urlCount", "healthLogCount", "healthOutputBytes", "emptyOutputCount"}
SIGNALS = {"connectionRefused", "ipv6LoopbackMention", "ipv4LoopbackMention", "localhostMention",
           "nameResolutionFailure", "networkUnreachable", "timeout", "httpClientError", "httpServerError",
           "commandMissing", "permissionDenied", "pbMention", "astroMention", "nodeImportFailure", "bindFailure"}


def valid(value):
    base = {"schemaVersion", "service", "mode", "status", "remoteWrites", "dockerLogsRead", "healthOutputRead"}
    if not isinstance(value, dict) or not base <= set(value) or value.get("schemaVersion") != 1 or \
            value.get("service") != "fodaveg" or value.get("mode") != "health-classifier" or \
            value.get("remoteWrites") is not False or value.get("dockerLogsRead") is not False or value.get("healthOutputRead") is not True:
        return False
    if value.get("status") == "STOP":
        return set(value) == base | {"errorCode"} and value.get("errorCode") in \
            {"ImageIdentityDrift", "HealthShapeUnknown", "CommandRejected", "CommandTimeout", "ProjectionUnavailable"}
    if value.get("status") != "CLASSIFIED" or set(value) != BOOLS | INTS | {"service", "mode", "status", "health", "exitCodes", "signals", "lastSignals"}:
        return False
    if any(type(value[key]) is not bool for key in BOOLS) or any(type(value[key]) is not int or not 0 <= value[key] <= 1048576 for key in INTS):
        return False
    if value["health"] not in {"healthy", "unhealthy", "starting", "none"} or not isinstance(value["exitCodes"], list) or len(value["exitCodes"]) > 5:
        return False
    if any(type(code) is not int or not -1 <= code <= 255 for code in value["exitCodes"]):
        return False
    for key in ("signals", "lastSignals"):
        if not isinstance(value[key], dict) or set(value[key]) != SIGNALS or any(type(body) is not bool for body in value[key].values()):
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
        raise SystemExit("STOP: classifier source hash mismatch")
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: new JSON required in classifier evidence directory")
    try:
        result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2",
            "lumbre", "python3", "-B", "-"], input=source, capture_output=True, timeout=90, check=False)
        if result.returncode or len(result.stdout) > 65536 or len(result.stderr) > 65536:
            raise ValueError("TransportRejected")
        value = json.loads(result.stdout)
        if not valid(value):
            raise ValueError("ProjectionRejected")
    except (OSError, subprocess.TimeoutExpired, ValueError, UnicodeDecodeError):
        raise SystemExit("STOP: classifier transport/projection rejected") from None
    fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(value["status"])
    return 0 if value["status"] == "CLASSIFIED" else 2


if __name__ == "__main__":
    sys.exit(main())
