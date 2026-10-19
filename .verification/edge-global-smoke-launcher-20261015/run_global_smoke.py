"""Release-owner wrapper: transmit exact read-only global edge smoke and close output."""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess


HERE = Path(__file__).resolve().parent
CAPTURE = Path.home() / "code/vegacms/.verification/edge-global-smoke-source-20261015"
REMOTE = HERE / "remote_global_smoke.py"
CAPTURE_SHA = "0362bbe1c4b022135cff039d52271b0ff1da473b7ae65117ed962556832b5873"
CAPTURE_RECEIPT_SHA = "f12b5af6d8faa11252f42ae8390c286ad075acb7e0e7e45c00f5c3ba00dd5291"
REMOTE_SHA = "267bb0d56031cdc2a02f364f07e03da780160069a72b019ed7eee16f8a996f9a"
TARGET_SHA = "560240126078e0da021becfb90baef48554153db8ca1fc43d5562174027f0122"
FIELDS = {"status", "mode", "sourceSha", "targetSha", "checksPassed", "failedCheckCount",
          "sourceBeforeMatches", "sourceAfterMatches", "caddyBeforeMatches", "caddyAfterMatches",
          "remoteWrites", "privateValuesExported"}


def sha(body):
    return hashlib.sha256(body).hexdigest()


def load_sources():
    source = (CAPTURE / "smoke.sh").read_bytes()
    receipt_body = (CAPTURE / "source-receipt.json").read_bytes()
    remote = REMOTE.read_bytes()
    receipt = json.loads(receipt_body)
    if (sha(source) != CAPTURE_SHA or len(source) != 8059 or
            sha(receipt_body) != CAPTURE_RECEIPT_SHA or
            receipt != {"bytes": 8059, "codeSourceOnly": True, "remoteExecuted": False,
                        "remotePath": "/srv/edge/scripts/smoke.sh", "sha256": CAPTURE_SHA,
                        "transportExit": 0} or sha(remote) != REMOTE_SHA):
        raise RuntimeError("SourceSealChanged")
    return remote


def valid(value, code):
    if (not isinstance(value, dict) or set(value) != FIELDS or
            value["mode"] != "canonical-source-single-inspect-format-override" or
            value["sourceSha"] != CAPTURE_SHA or value["targetSha"] != TARGET_SHA or
            value["remoteWrites"] is not False or value["privateValuesExported"] is not False or
            any(type(value[key]) is not bool for key in (
                "sourceBeforeMatches", "sourceAfterMatches", "caddyBeforeMatches", "caddyAfterMatches"))):
        return False
    status = value["status"]
    if status == "GLOBAL_SMOKE_PASS":
        return (code == 0 and value["checksPassed"] == 19 and
                type(value["checksPassed"]) is int and value["failedCheckCount"] == 0 and
                type(value["failedCheckCount"]) is int and
                all(value[key] for key in (
                    "sourceBeforeMatches", "sourceAfterMatches", "caddyBeforeMatches", "caddyAfterMatches")))
    if status == "GLOBAL_SMOKE_CHECK_FAILED":
        return (code == 2 and type(value["checksPassed"]) is int and
                0 <= value["checksPassed"] < 19 and
                value["failedCheckCount"] == 1 and type(value["failedCheckCount"]) is int and
                all(value[key] for key in (
                    "sourceBeforeMatches", "sourceAfterMatches", "caddyBeforeMatches", "caddyAfterMatches")))
    return (status == "STOP_GLOBAL_SMOKE_UNAVAILABLE" and code == 2 and
            value["checksPassed"] is None and value["failedCheckCount"] is None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output path unknown")
    remote = load_sources()
    source = ("import base64\n"
              "exec(compile(base64.b64decode('" + base64.b64encode(remote).decode("ascii") +
              "'),'<sealed-global-smoke>','exec'),{'__name__':'__main__'})\n")
    argv = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15",
            "-o", "ServerAliveCountMax=1", "lumbre", "python3", "-B", "-"]
    try:
        response = subprocess.run(argv, input=source.encode("ascii"),
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                  timeout=430, check=False)
        if len(response.stdout) > 1024:
            raise ValueError("oversized")
        value = json.loads(response.stdout)
        if not valid(value, response.returncode):
            raise ValueError("schema")
    except (OSError, subprocess.TimeoutExpired, UnicodeError, ValueError):
        raise SystemExit("STOP: global smoke read unavailable; raw output discarded") from None
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(value["status"])
    return 0 if value["status"] == "GLOBAL_SMOKE_PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
