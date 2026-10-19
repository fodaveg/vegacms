"""Send sealed Lumbre cause classifier to server RAM; keep output closed."""

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
DIAG = HERE / "remote_diagnose_lumbre.py"
READER = HERE / "remote_cause_lumbre.py"
EXPECTED = {
    HELPER: "5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128",
    APPLY: "079f3cfa28378d551b29893ef4e47d71b6417eb8cd3c0f32ea3133d2fcc21682",
    DIAG: "a55ac29fe013da231227018441eeaa32339255b699fb9b2bdf5f7cc2110e2aa3",
}
FIELDS = {"status", "phase", "runtimeClass", "composeQuietClass",
          "baselineComparable", "snapshotStable", "remoteWrites", "privateValuesExported"}
PHASES = {"PREPARED", "INSTALLED", "CREATED", "AWAITING_PUBLIC_SMOKE",
          "ROLLBACK_COMPOSE_INSTALLED", "ROLLBACK_CREATED", "ROLLED_BACK"}
RUNTIME_CLASSES = {"NOT_RUN", "PASS_WITHOUT_BASELINE", "RuntimeTopologyDrift",
                   "RuntimeMountDrift", "RuntimeCommandDrift", "RuntimePeerDrift",
                   "ContainerIdentityDrift", "OtherVolumeWriter",
                   "RuntimeShapeUnknown", "ContainerIdUnknown", "CommandUnavailable",
                   "OTHER_FAILURE"}


def valid(value, code):
    if not isinstance(value, dict) or set(value) != FIELDS or \
            value.get("remoteWrites") is not False or \
            value.get("privateValuesExported") is not False:
        return False
    if value.get("status") == "STOP_READ_UNAVAILABLE":
        return (code == 2 and value["phase"] == "UNKNOWN" and
                value["runtimeClass"] == value["composeQuietClass"] == "NOT_RUN" and
                value["baselineComparable"] is False and
                value["snapshotStable"] is False)
    if value.get("status") not in {"PROJECTED", "WINDOW_CLOSED"} or code != 0:
        return False
    return (value["phase"] in PHASES and value["runtimeClass"] in RUNTIME_CLASSES and
            value["composeQuietClass"] in {"NOT_RUN", "PASS", "FAIL"} and
            value["baselineComparable"] is False and
            type(value["snapshotStable"]) is bool and
            (value["status"] != "WINDOW_CLOSED" or
             (value["runtimeClass"] == value["composeQuietClass"] == "NOT_RUN")) and
            (value["status"] != "PROJECTED" or
             (value["phase"] == "INSTALLED" and value["snapshotStable"] and
              value["runtimeClass"] != "NOT_RUN" and
              value["composeQuietClass"] != "NOT_RUN")))


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
    for path, module in ((HELPER, "image_helpers"), (APPLY, "cors_apply"),
                         (DIAG, "cors_diag")):
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
