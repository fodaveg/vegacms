"""Closed root-only transport for one Vega stock network cutover."""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
SOURCES = (
    ("image_helpers", HERE.parent.parent / "image-only-delivery-20261008" /
     "remote_cutover.py", "5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128"),
    ("cors_apply", HERE.parent / "apply" / "remote_apply.py",
     "079f3cfa28378d551b29893ef4e47d71b6417eb8cd3c0f32ea3133d2fcc21682"),
    ("edge_base", HERE / "remote_edge_read.py",
     "cd0d9f7faab6ccc30f5ceeda7d2b962b027d23b087151aca120f04ce07e6879b"),
    ("edge_phase2", HERE / "remote_edge_phase2.py",
     "13427c4798645a1fd2701b169a0cb7776166d6789f33d6090ec36e7db28f516f"),
    ("edge_apply", HERE / "remote_edge_apply_candidate.py",
     "04bc97dddc7528e0f831d0d8ccea086c2149b838a915892bc2f10e61d16ba841"),
)
BASE_SHA = "11593d1da51e580f988058bfac8288194eaeb7697ac7db2f6926815f8d14dcde"
TARGET_SHA = "50b1d28af027fc64e48788fbdc3b6e7703ea6d5420e8d2f94a0b3409dd86c08a"
IMAGE_ID = "sha256:dd978b8d23081d2e3c69ebf6ef8ff4599a1acdd3f38dc559ae6fa379e46449b4"
OLD_ID = "007b755b8de76195d857181ce985a9522fe71c5d2941a2c1597b310d12d56881"
HEX = re.compile(r"[0-9a-f]{64}\Z")
EDGE_BACKUP = re.compile(r"edge-[0-9a-f]{24}\Z")
STOCK_BACKUP = re.compile(r"vega-pb-[0-9]{8}T[0-9]{6}Z-[0-9]+\Z")


def positive(value):
    return type(value) is int and 0 <= value <= 10**13


def valid(value, code, mode, edge_backup, stock_backup):
    if (not isinstance(value, dict) or value.get("privateValuesExported") is not False or
            type(value.get("remoteWrites")) is not bool):
        return False
    status = value.get("status")
    if status == "STOP_NETWORK_UNKNOWN":
        return code == 2 and set(value) == {
            "status", "remoteWrites", "privateValuesExported"}
    if status == "STOP_NETWORK_ROLLBACK_NEEDS_OPERATOR":
        return (mode == "rollback" and code == 2 and value["remoteWrites"] and
                value.get("edgeBackupId") == edge_backup and
                value.get("backupId") == stock_backup and
                set(value) == {"status", "remoteWrites", "privateValuesExported",
                               "edgeBackupId", "backupId"})
    if value.get("edgeBackupId") != edge_backup or value.get("service", "vega-pb") != "vega-pb":
        return False
    if status == "NETWORK_READY_FOR_REVIEW":
        fields = {"status", "remoteWrites", "privateValuesExported", "edgeBackupId",
                  "composeSha", "candidateSha", "imageId", "containerId",
                  "volumeKiB", "freeSrvKiB", "freeDockerKiB", "requiredSrvKiB",
                  "requiredDockerKiB", "sameFilesystem"}
        return (mode == "check" and code == 0 and not value["remoteWrites"] and
                set(value) == fields and value["composeSha"] == BASE_SHA and
                value["candidateSha"] == TARGET_SHA and value["imageId"] == IMAGE_ID and
                value["containerId"] == OLD_ID and
                type(value["sameFilesystem"]) is bool and all(positive(value[key])
                for key in ("volumeKiB", "freeSrvKiB", "freeDockerKiB",
                            "requiredSrvKiB", "requiredDockerKiB")))
    if status in {"STOP_NEEDS_OPERATOR", "STOP_OLD_RUNTIME_RESTORED"}:
        return (mode == "apply" and code == 2 and value["remoteWrites"] and
                set(value) == {"status", "service", "remoteWrites", "backupId",
                               "edgeBackupId", "privateValuesExported"} and
                isinstance(value["backupId"], str) and STOCK_BACKUP.fullmatch(value["backupId"]))
    if status == "NETWORK_APPLIED_AWAITING_PUBLIC_SMOKE":
        return (mode == "apply" and code == 0 and value["remoteWrites"] and
                set(value) == {"status", "service", "remoteWrites", "backupId",
                               "oldContainerId", "newContainerId", "composeSha",
                               "imageId", "archiveSha", "archiveBytes", "restoredFiles",
                               "restoredBytes", "edgeBackupId", "privateValuesExported"} and
                isinstance(value["backupId"], str) and STOCK_BACKUP.fullmatch(value["backupId"]) and
                value["oldContainerId"] == OLD_ID and value["composeSha"] == TARGET_SHA and
                value["imageId"] == IMAGE_ID and isinstance(value["newContainerId"], str) and
                HEX.fullmatch(value["newContainerId"]) and isinstance(value["archiveSha"], str) and
                HEX.fullmatch(value["archiveSha"]) and all(positive(value[key]) for key in
                ("archiveBytes", "restoredFiles", "restoredBytes")))
    if status == "NETWORK_ROLLED_BACK_AWAITING_PUBLIC_SMOKE":
        return (mode == "rollback" and code == 0 and value["remoteWrites"] and
                value.get("backupId") == stock_backup and
                set(value) == {"status", "service", "remoteWrites", "backupId",
                               "containerId", "composeSha", "edgeBackupId",
                               "privateValuesExported"} and
                value["composeSha"] == BASE_SHA and isinstance(value["containerId"], str) and
                HEX.fullmatch(value["containerId"]))
    return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--mode", choices=("check", "apply", "rollback"), required=True)
    parser.add_argument("--edge-backup-id", required=True)
    parser.add_argument("--stock-backup-id")
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if (args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json" or
            not EDGE_BACKUP.fullmatch(args.edge_backup_id) or
            (args.mode == "rollback") != bool(args.stock_backup_id) or
            (args.stock_backup_id and not STOCK_BACKUP.fullmatch(args.stock_backup_id))):
        raise SystemExit("STOP: selector unknown")
    sources = []
    for name, path, expected in SOURCES:
        body = path.read_bytes()
        if hashlib.sha256(body).hexdigest() != expected:
            raise SystemExit("STOP: sealed helper changed")
        sources.append((name, body))
    target = (HERE / "remote_stock_network_adapter.py").read_bytes()
    if hashlib.sha256(target).hexdigest() != args.source_sha256:
        raise SystemExit("STOP: source seal drift")
    bootstrap = "import base64,sys,types\n"
    for name, body in sources:
        bootstrap += ("m=types.ModuleType('" + name + "')\n"
                      "exec(compile(base64.b64decode('" + base64.b64encode(body).decode("ascii") +
                      "'),'<sealed-" + name + ">','exec'),m.__dict__)\n"
                      "sys.modules['" + name + "']=m\n")
    bootstrap += ("exec(compile(base64.b64decode('" + base64.b64encode(target).decode("ascii") +
                  "'),'<sealed-stock-network>','exec'),{'__name__':'__main__'})\n")
    remote = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
              "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15",
              "-o", "ServerAliveCountMax=1", "lumbre", "python3", "-B", "-",
              args.mode, args.edge_backup_id]
    if args.stock_backup_id:
        remote.append(args.stock_backup_id)
    try:
        response = subprocess.run(remote, input=bootstrap.encode("ascii"),
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                  timeout=1200, check=False)
        if len(response.stdout) > 4096:
            raise ValueError("oversized")
        value = json.loads(response.stdout)
        if not valid(value, response.returncode, args.mode,
                     args.edge_backup_id, args.stock_backup_id):
            raise ValueError("schema")
    except (OSError, subprocess.TimeoutExpired, UnicodeError, ValueError):
        raise SystemExit("STOP: remote operation unknown; raw output discarded") from None
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(value["status"])
    return response.returncode


if __name__ == "__main__":
    raise SystemExit(main())
