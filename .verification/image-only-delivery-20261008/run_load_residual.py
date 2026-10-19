"""Release-owner wrapper for one filtered read after the failed load."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "remote_load_residual.py"
IMAGES = {"vegacms:a51b8521e1eeef52a522d2a065b36a03578c0c3a",
          "lumbre-admin-pb:a598bfe-vega-a51b852",
          "fodaveg:f92bac858e904817ffc4cf6bf6307a6de0190c32"}
STATES = {"MATCH", "NOT_RESOLVED", "INSPECT_INVALID", "WRONG_ID"}


def valid(value, exit_code):
    """Reject unfiltered Docker text, secrets and private paths."""
    keys = {"status", "schemaVersion", "remoteWrites", "archiveBytesMatch",
            "archiveSha256Match", "imageStates", "dockerClientVersion",
            "dockerServerVersion", "freeSrvKiB", "freeDockerKiB",
            "sameFilesystem", "configEnvRead", "logsRead", "caddyRead"}
    if not isinstance(value, dict) or set(value) != keys or value["schemaVersion"] != 1 or \
            any(value[key] is not False for key in ("remoteWrites", "configEnvRead", "logsRead", "caddyRead")):
        return False
    if value["status"] == "STOP_RESIDUAL_READ":
        return exit_code == 2 and all(value[key] is None for key in (
            "archiveBytesMatch", "archiveSha256Match", "imageStates", "dockerClientVersion",
            "dockerServerVersion", "freeSrvKiB", "freeDockerKiB", "sameFilesystem"))
    if value["status"] not in ("THREE_LOADED", "RESIDUAL_REVIEW") or \
            exit_code != (0 if value["status"] == "THREE_LOADED" else 2):
        return False
    if not all(isinstance(value[key], bool) for key in ("archiveBytesMatch", "archiveSha256Match",
                                                        "sameFilesystem")):
        return False
    if not isinstance(value["imageStates"], dict) or set(value["imageStates"]) != IMAGES or \
            any(item not in STATES for item in value["imageStates"].values()):
        return False
    for key in ("dockerClientVersion", "dockerServerVersion"):
        if not isinstance(value[key], str) or not re.fullmatch(
                r"[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(?:[-+][A-Za-z0-9._-]+)?", value[key]):
            return False
    if any(not isinstance(value[key], int) or isinstance(value[key], bool) or value[key] < 0
           for key in ("freeSrvKiB", "freeDockerKiB")):
        return False
    return value["status"] != "THREE_LOADED" or (
        value["archiveBytesMatch"] and value["archiveSha256Match"] and
        all(item == "MATCH" for item in value["imageStates"].values()))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source = SOURCE.read_bytes()
    if hashlib.sha256(source).hexdigest() != args.script_sha256:
        raise SystemExit("STOP: residual script hash mismatch")
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output must be a new JSON in this evidence directory")
    try:
        result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                                 "lumbre", "python3", "-B", "-"], input=source,
                                capture_output=True, timeout=150, check=False)
        if len(result.stdout) > 8192 or len(result.stderr) > 8192:
            raise ValueError
        value = json.loads(result.stdout)
        if not valid(value, result.returncode):
            raise ValueError
    except (OSError, subprocess.TimeoutExpired, ValueError, UnicodeDecodeError):
        raise SystemExit("STOP: residual projection unavailable or invalid; no raw output saved") from None
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(value["status"])
    return 0 if value["status"] == "THREE_LOADED" else 2


if __name__ == "__main__":
    sys.exit(main())
