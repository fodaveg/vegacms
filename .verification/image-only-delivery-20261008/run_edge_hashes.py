"""Release-owner wrapper for one newly scoped edge hash-only read."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "remote_edge_hashes.py"
PATHS = {"/srv/edge/compose.yml", "/srv/edge/conf.d/fodaveg.caddy",
         "/srv/edge/conf.d/admin-lumbre-pro.caddy", "/srv/edge/conf.d/vega.caddy",
         "/srv/edge/Caddyfile"}


def valid(value, exit_code):
    """Accept only five booleans, never source file bytes or error text."""
    if not isinstance(value, dict) or set(value) != {
            "status", "schemaVersion", "matches", "targetFileCount", "remoteWrites",
            "configEnvRead", "fileBodiesProjected"}:
        return False
    if (value["schemaVersion"] != 1 or value["targetFileCount"] != 5 or
            value["remoteWrites"] is not False or value["configEnvRead"] is not False or
            value["fileBodiesProjected"] is not False):
        return False
    if value["status"] == "EDGE_UNCHANGED":
        return exit_code == 0 and isinstance(value["matches"], dict) and \
            set(value["matches"]) == PATHS and all(item is True for item in value["matches"].values())
    if value["status"] == "STOP_EDGE_DRIFT":
        return exit_code == 2 and isinstance(value["matches"], dict) and \
            set(value["matches"]) == PATHS and all(isinstance(item, bool) for item in value["matches"].values())
    return value["status"] == "STOP_EDGE_READ" and exit_code == 2 and value["matches"] is None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source = SOURCE.read_bytes()
    if hashlib.sha256(source).hexdigest() != args.script_sha256:
        raise SystemExit("STOP: edge hash script mismatch")
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output must be a new JSON in this evidence directory")
    try:
        result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                                 "lumbre", "python3", "-B", "-"], input=source,
                                capture_output=True, timeout=90, check=False)
        if len(result.stdout) > 8192 or len(result.stderr) > 8192:
            raise ValueError
        value = json.loads(result.stdout)
        if not valid(value, result.returncode):
            raise ValueError
    except (OSError, subprocess.TimeoutExpired, ValueError, UnicodeDecodeError):
        raise SystemExit("STOP: edge hash-only read unavailable or invalid") from None
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(value["status"])
    return 0 if value["status"] == "EDGE_UNCHANGED" else 2


if __name__ == "__main__":
    sys.exit(main())
