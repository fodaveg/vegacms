"""Run the sealed edge network reader in server RAM and save only its schema."""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "remote_edge_read.py"
HEX = re.compile(r"[0-9a-f]{64}\Z")
FIELDS = {"status", "composeBaseMatches", "candidateSha256", "composeMode",
          "composeRegular", "gitSourceClass", "networkClass", "idMatches",
          "imageMatches", "running", "composeSourceClass", "edgeMember",
          "vegaEdgeMember", "otherNetworkCount", "remoteWrites",
          "privateValuesExported"}


def valid(value, code):
    if not isinstance(value, dict) or value.get("remoteWrites") is not False or \
            value.get("privateValuesExported") is not False:
        return False
    if value.get("status") == "STOP_READ_UNAVAILABLE":
        return code == 2 and set(value) == {
            "status", "remoteWrites", "privateValuesExported"}
    return (code == 0 and value.get("status") == "PROJECTED" and set(value) == FIELDS and
            isinstance(value["candidateSha256"], str) and
            HEX.fullmatch(value["candidateSha256"]) is not None and
            type(value["composeMode"]) is int and 0 <= value["composeMode"] <= 0o777 and
            type(value["otherNetworkCount"]) is int and
            0 <= value["otherNetworkCount"] <= 64 and
            all(type(value[key]) is bool for key in (
                "composeBaseMatches", "composeRegular", "idMatches", "imageMatches",
                "running", "edgeMember", "vegaEdgeMember")) and
            value["gitSourceClass"] in {
                "TRACKED", "UNTRACKED_OR_UNKNOWN", "OTHER_ROOT", "UNKNOWN"} and
            value["networkClass"] in {"EXPECTED", "OTHER", "UNAVAILABLE"} and
            value["composeSourceClass"] in {"EXACT", "OTHER", "UNKNOWN"})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output path unknown")
    source = SOURCE.read_bytes()
    if hashlib.sha256(source).hexdigest() != args.source_sha256:
        raise SystemExit("STOP: source seal drift")
    bootstrap = ("import base64\nexec(compile(base64.b64decode('" +
                 base64.b64encode(source).decode("ascii") +
                 "'),'<sealed-edge-network-read>','exec'),{'__name__':'__main__'})\n")
    remote = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
              "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15",
              "-o", "ServerAliveCountMax=1", "lumbre", "python3", "-B", "-"]
    try:
        response = subprocess.run(remote, input=bootstrap.encode("ascii"),
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                  timeout=90, check=False)
        if len(response.stdout) > 2048:
            raise ValueError("oversized")
        value = json.loads(response.stdout)
        if not valid(value, response.returncode):
            raise ValueError("schema")
    except (OSError, subprocess.TimeoutExpired, UnicodeError, ValueError):
        raise SystemExit("STOP: edge read unavailable; raw output discarded") from None
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
