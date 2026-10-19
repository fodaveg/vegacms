"""Send sealed read-only CORS state reader to server RAM; keep output closed."""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
HELPER = HERE.parent.parent / "image-only-delivery-20261008" / "remote_cutover.py"
APPLY = HERE / "remote_apply.py"
READER = HERE / "remote_diagnose_lumbre.py"
EXPECTED = {
    HELPER: "5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128",
    APPLY: "079f3cfa28378d551b29893ef4e47d71b6417eb8cd3c0f32ea3133d2fcc21682",
}
BACKUP_ID = "lumbre-admin-pb-20261008T223304Z-3566962"
HEX = re.compile(r"[0-9a-f]{64}\Z")
FIELDS = {"status", "backupId", "phase", "recordNewId", "recordRollbackId", "composeClass",
          "composeOwned", "rollbackComposeOwned", "envMatches", "selection", "running",
          "imageMatches", "commandClass", "labelsMatch", "mountsMatch", "networkClass",
          "aliasesMatch", "portsObservedEmpty", "exposed8090Only", "hostBindingsNone",
          "snapshotStable", "volumeUsers",
          "remoteWrites", "privateValuesExported"}


def valid(value, code):
    if not isinstance(value, dict) or value.get("backupId") != BACKUP_ID or \
            value.get("remoteWrites") is not False or \
            value.get("privateValuesExported") is not False:
        return False
    if value.get("status") == "STOP_READ_UNAVAILABLE":
        return code == 2 and set(value) == {
            "status", "backupId", "remoteWrites", "privateValuesExported"}
    if value.get("status") != "PROJECTED" or code != 0 or set(value) != FIELDS:
        return False
    phase = value["phase"]
    new_id = value["recordNewId"]
    rollback_id = value["recordRollbackId"]
    return (phase in {"PREPARED", "INSTALLED", "CREATED", "AWAITING_PUBLIC_SMOKE",
                      "ROLLBACK_COMPOSE_INSTALLED", "ROLLBACK_CREATED", "ROLLED_BACK"} and
            (new_id is None if phase in {"PREPARED", "INSTALLED"} else
             (new_id is None and phase.startswith("ROLLBACK")) or
             (new_id is None and phase == "ROLLED_BACK") or
             (isinstance(new_id, str) and HEX.fullmatch(new_id) is not None)) and
            (rollback_id is None or isinstance(rollback_id, str) and
             HEX.fullmatch(rollback_id) is not None) and
            value["composeClass"] in {"BASE", "TARGET", "OTHER"} and
            value["networkClass"] in {"ZERO", "ONE_EDGE", "OTHER", "UNAVAILABLE"} and
            value["selection"] in {"OLD", "NEW", "ROLLBACK", "OTHER", "UNAVAILABLE"} and
            value["commandClass"] in {"BEFORE", "AFTER", "OTHER", None} and
            value["volumeUsers"] in {"NONE", "SELECTED", "OTHER"} and
            all(type(value[key]) is bool for key in (
                "composeOwned", "rollbackComposeOwned", "envMatches", "snapshotStable")) and
            all(value[key] is None or type(value[key]) is bool for key in (
                "running", "imageMatches", "labelsMatch", "mountsMatch", "aliasesMatch",
                "portsObservedEmpty", "exposed8090Only", "hostBindingsNone")))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--reader-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output path unknown")
    sources = {}
    for path, expected in (*EXPECTED.items(), (READER, args.reader_sha256)):
        body = path.read_bytes()
        if hashlib.sha256(body).hexdigest() != expected:
            raise SystemExit("STOP: source seal drift")
        sources[path] = body
    bootstrap = "import base64,sys,types\n"
    for path, module in ((HELPER, "image_helpers"), (APPLY, "cors_apply")):
        encoded = base64.b64encode(sources[path]).decode("ascii")
        bootstrap += ("m=types.ModuleType('" + module + "')\n" +
                      "exec(compile(base64.b64decode('" + encoded +
                      "'),'<sealed-" + module + ">','exec'),m.__dict__)\n" +
                      "sys.modules['" + module + "']=m\n")
    encoded = base64.b64encode(sources[READER]).decode("ascii")
    bootstrap += ("exec(compile(base64.b64decode('" + encoded +
                  "'),'<sealed-cors-diagnose>','exec'),{'__name__':'__main__'})\n")
    command = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
               "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15",
               "-o", "ServerAliveCountMax=1", "lumbre", "python3", "-B", "-"]
    try:
        response = subprocess.run(command, input=bootstrap.encode("ascii"),
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                  timeout=90, check=False)
        if len(response.stdout) > 2048:
            raise ValueError("oversized")
        value = json.loads(response.stdout)
        if not valid(value, response.returncode):
            raise ValueError("schema")
    except (OSError, subprocess.TimeoutExpired, UnicodeError, ValueError):
        raise SystemExit("STOP: read unavailable; raw output discarded") from None
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
