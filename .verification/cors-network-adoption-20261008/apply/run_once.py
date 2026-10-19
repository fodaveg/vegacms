"""Send two pinned sources to server RAM and persist only closed CORS receipts."""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "remote_apply.py"
HELPER = HERE.parent.parent / "image-only-delivery-20261008" / "remote_cutover.py"
HELPER_SHA = "5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128"
SERVICES = {"vega-pb", "lumbre-admin-pb"}
EXPECTED = {
    "vega-pb": ("bae812ef0031b5e6aeb65f4678905e65d74cfadf62a5e78fe156250166377f7e",
                "11593d1da51e580f988058bfac8288194eaeb7697ac7db2f6926815f8d14dcde",
                "sha256:dd978b8d23081d2e3c69ebf6ef8ff4599a1acdd3f38dc559ae6fa379e46449b4",
                "5f8fed3402b9be46851f6909ad0bb59b4d21ca27be1e385711e6c0985c6aaef7"),
    "lumbre-admin-pb": ("7ed9a9e225790a4e15ccef3ce4c110b8d3b22e0fef53e6c1840d286181ebb8dd",
                        "56caa1a1273feaa3c56b34db7724177c448190d1c28d723d53a5b62fbe110ae9",
                        "sha256:40df6a9bbcfd4edbc93680b0f45946d0be7c50c4e5c470167e33646fe499c1b7",
                        "6241f7d6b8d1a2dda326770a318a1d3b94d84b032cc5df050527f9631e75f7d6"),
}
HEX = re.compile(r"[0-9a-f]{64}\Z")
IMAGE = re.compile(r"sha256:[0-9a-f]{64}\Z")


def positive(value):
    return type(value) is int and 0 <= value <= 10**13


def hex64(value):
    return isinstance(value, str) and HEX.fullmatch(value) is not None


def image_id(value):
    return isinstance(value, str) and IMAGE.fullmatch(value) is not None


def valid(value, code, mode, service):
    if not isinstance(value, dict) or value.get("service") != service or \
            type(value.get("remoteWrites")) is not bool:
        return False
    status = value.get("status")
    if not isinstance(status, str):
        return False
    if status == "STOP_UNCLASSIFIED":
        return (code == 2 and set(value) == {"status", "service", "remoteWrites"} and
                value["remoteWrites"] == (mode != "check"))
    if status in {"STOP_NEEDS_OPERATOR", "STOP_OLD_RUNTIME_RESTORED"}:
        return (mode == "apply" and code == 2 and value["remoteWrites"] is True and
                set(value) == {"status", "service", "remoteWrites", "backupId"} and
                isinstance(value["backupId"], str) and re.fullmatch(
                    re.escape(service) + r"-[0-9]{8}T[0-9]{6}Z-[0-9]+", value["backupId"]))
    if status == "STOP_ROLLBACK_NEEDS_OPERATOR":
        return (mode == "rollback" and code == 2 and value["remoteWrites"] is True and
                set(value) == {"status", "service", "remoteWrites", "backupId"} and
                isinstance(value["backupId"], str) and re.fullmatch(
                    re.escape(service) + r"-[0-9]{8}T[0-9]{6}Z-[0-9]+", value["backupId"]))
    if status == "READY_FOR_REVIEW":
        fields = {"status", "service", "remoteWrites", "composeSha", "candidateSha",
                  "imageId", "containerId", "volumeKiB", "freeSrvKiB", "freeDockerKiB",
                  "requiredSrvKiB", "requiredDockerKiB", "sameFilesystem"}
        return (mode == "check" and code == 0 and value["remoteWrites"] is False and
                set(value) == fields and all(positive(value[k]) for k in (
                    "volumeKiB", "freeSrvKiB", "freeDockerKiB", "requiredSrvKiB",
                    "requiredDockerKiB")) and type(value["sameFilesystem"]) is bool and
                hex64(value["composeSha"]) and hex64(value["candidateSha"]) and
                image_id(value["imageId"]) and hex64(value["containerId"]) and
                (value["composeSha"], value["candidateSha"], value["imageId"],
                 value["containerId"]) == EXPECTED[service])
    if status == "CORS_APPLIED_AWAITING_PUBLIC_SMOKE":
        fields = {"status", "service", "remoteWrites", "backupId", "oldContainerId",
                  "newContainerId", "composeSha", "imageId", "archiveSha", "archiveBytes",
                  "restoredFiles", "restoredBytes"}
        return (mode == "apply" and code == 0 and value["remoteWrites"] is True and
                set(value) == fields and all(positive(value[k]) for k in (
                    "archiveBytes", "restoredFiles", "restoredBytes")) and
                all(hex64(value[k]) for k in (
                    "oldContainerId", "newContainerId", "composeSha", "archiveSha")) and
                image_id(value["imageId"]) and isinstance(value["backupId"], str) and
                re.fullmatch(re.escape(service) + r"-[0-9]{8}T[0-9]{6}Z-[0-9]+", value["backupId"]) and
                value["composeSha"] == EXPECTED[service][1] and
                value["imageId"] == EXPECTED[service][2] and
                value["oldContainerId"] == EXPECTED[service][3])
    if status == "CORS_ROLLED_BACK_AWAITING_PUBLIC_SMOKE":
        fields = {"status", "service", "remoteWrites", "backupId", "containerId", "composeSha"}
        return (mode == "rollback" and code == 0 and value["remoteWrites"] is True and
                set(value) == fields and hex64(value["containerId"]) and
                hex64(value["composeSha"]) and isinstance(value["backupId"], str) and
                re.fullmatch(re.escape(service) + r"-[0-9]{8}T[0-9]{6}Z-[0-9]+", value["backupId"]) and
                value["composeSha"] == EXPECTED[service][0])
    return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--mode", choices=("check", "apply", "rollback"), required=True)
    parser.add_argument("--service", choices=tuple(SERVICES), required=True)
    parser.add_argument("--backup-id")
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json" or \
            (args.mode == "rollback") != bool(args.backup_id):
        raise SystemExit("STOP: output must be new here; rollback requires its backup ID")
    if args.backup_id and not re.fullmatch(
            re.escape(args.service) + r"-[0-9]{8}T[0-9]{6}Z-[0-9]+", args.backup_id):
        raise SystemExit("STOP: backup ID shape unknown")
    helper = HELPER.read_bytes()
    source = SOURCE.read_bytes()
    if hashlib.sha256(helper).hexdigest() != HELPER_SHA or \
            hashlib.sha256(source).hexdigest() != args.script_sha256:
        raise SystemExit("STOP: pinned source drift")
    bootstrap = ("import base64,sys,types\n"
                 "m=types.ModuleType('image_helpers')\n"
                 "exec(compile(base64.b64decode('" + base64.b64encode(helper).decode() +
                 "'),'<sealed-image-helpers>','exec'),m.__dict__)\n"
                 "sys.modules['image_helpers']=m\n"
                 "exec(compile(base64.b64decode('" + base64.b64encode(source).decode() +
                 "'),'<sealed-cors-apply>','exec'),{'__name__':'__main__'})\n")
    remote = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
              "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15",
              "-o", "ServerAliveCountMax=1", "lumbre", "python3", "-B", "-",
              args.mode, args.service]
    if args.backup_id:
        remote.append(args.backup_id)
    try:
        response = subprocess.run(remote, input=bootstrap.encode(), stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, timeout=1200, check=False)
        if len(response.stdout) > 4096:
            raise ValueError("oversized")
        value = json.loads(response.stdout)
        if not valid(value, response.returncode, args.mode, args.service):
            raise ValueError("schema")
    except (OSError, subprocess.TimeoutExpired, UnicodeError, ValueError):
        raise SystemExit("STOP: CORS stage unavailable; no raw output persisted") from None
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(value["status"])
    return 0 if response.returncode == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
