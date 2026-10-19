"""Pinned release-owner runner for the public-only Vega config classifier."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

import public_config_probe as probe

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "public_config_probe.py"
MIMES = {"JSON", "HTML", "OTHER", "UNAVAILABLE"}
SHAPES = {"HTTP_NON_OK", "REDIRECT_UNFOLLOWED", "OVERSIZED", "PARSE_FAILURE", "JSON_PRIMITIVE",
          "JSON_ARRAY", "JSON_OBJECT_NO_BACKEND", "JSON_OBJECT_BACKEND_PUBLIC",
          "JSON_OBJECT_BACKEND_OTHER", "UNAVAILABLE"}
BACKENDS = {"SAME_ORIGIN", "KNOWN_OTHER_ORIGIN", "UNDETERMINED"}


def valid(value, code):
    if code != 0 or not isinstance(value, dict) or set(value) != {
            "schemaVersion", "mode", "status", "remoteWrites", "pages"} or \
            type(value["schemaVersion"]) is not int or value["schemaVersion"] != 1 or \
            value["mode"] != "PUBLIC_VEGA_CONFIG_CLASSIFIER" or \
            value["status"] != "PROJECTED" or value["remoteWrites"] is not False or \
            not isinstance(value["pages"], dict) or set(value["pages"]) != set(probe.PAGES):
        return False
    for item in value["pages"].values():
        if not isinstance(item, dict) or set(item) != {
                "httpStatus", "mime", "shape", "backend", "overrideUninspected"} or \
                item["httpStatus"] is not None and (type(item["httpStatus"]) is not int or
                                                 not 100 <= item["httpStatus"] <= 599) or \
                item["mime"] not in MIMES or item["shape"] not in SHAPES or \
                item["backend"] not in BACKENDS or item["overrideUninspected"] is not True:
            return False
        if item["shape"] == "UNAVAILABLE" and (item["httpStatus"] is not None or
            item["mime"] != "UNAVAILABLE" or item["backend"] != "UNDETERMINED"):
            return False
        if item["shape"] == "HTTP_NON_OK" and (item["httpStatus"] is None or
            200 <= item["httpStatus"] < 400 or item["backend"] != "SAME_ORIGIN"):
            return False
        if item["shape"] == "REDIRECT_UNFOLLOWED" and (item["httpStatus"] is None or
            not 300 <= item["httpStatus"] < 400 or item["backend"] != "UNDETERMINED"):
            return False
        if item["shape"] not in {"UNAVAILABLE", "HTTP_NON_OK", "REDIRECT_UNFOLLOWED"} and \
                (item["httpStatus"] is None or not 200 <= item["httpStatus"] < 300):
            return False
        if item["shape"] in {"PARSE_FAILURE", "JSON_PRIMITIVE", "JSON_ARRAY",
                             "JSON_OBJECT_NO_BACKEND"} and item["backend"] != "SAME_ORIGIN":
            return False
        if item["shape"] in {"OVERSIZED", "JSON_OBJECT_BACKEND_OTHER"} and \
                item["backend"] != "UNDETERMINED":
            return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output must be a new JSON in this evidence directory")
    source = SOURCE.read_bytes()
    if hashlib.sha256(source).hexdigest() != args.script_sha256:
        raise SystemExit("STOP: pinned source drift")
    remote = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
              "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15",
              "-o", "ServerAliveCountMax=1", "lumbre", "python3", "-B", "-c",
              shlex.quote(source.decode("utf-8"))]
    try:
        response = subprocess.run(remote, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, timeout=45, check=False)
        if len(response.stdout) > 4096:
            raise ValueError("oversized")
        value = json.loads(response.stdout)
        if not valid(value, response.returncode):
            raise ValueError("schema")
    except (OSError, subprocess.TimeoutExpired, UnicodeError, ValueError):
        raise SystemExit("STOP: public config projection unavailable; no raw output persisted") from None
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(value["status"])


if __name__ == "__main__":
    sys.exit(main())
