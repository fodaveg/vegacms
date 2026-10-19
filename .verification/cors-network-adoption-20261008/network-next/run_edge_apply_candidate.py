"""Root-only sealed transport for the partial Caddy network cutover candidate."""

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
    ("edge_base", HERE / "remote_edge_read.py",
     "cd0d9f7faab6ccc30f5ceeda7d2b962b027d23b087151aca120f04ce07e6879b"),
    ("edge_phase2", HERE / "remote_edge_phase2.py",
     "13427c4798645a1fd2701b169a0cb7776166d6789f33d6090ec36e7db28f516f"),
)
ID = re.compile(r"[0-9a-f]{64}\Z")
BACKUP = re.compile(r"edge-[0-9a-f]{24}\Z")
CANDIDATE_SHA = "6c527267ca840d9889b20766ff272cef477834045ccbf29387beab19ae70a977"
CADDY_ID = "ae97fc0c57fbe4c3a97f5dce15dfc9da92f33f527b60d95c3f74de9d2a160a7a"


def valid(value, code, mode, backup_id):
    if not isinstance(value, dict) or value.get("privateValuesExported") is not False:
        return False
    status = value.get("status")
    if status == "STOP_PREFLIGHT":
        return code == 2 and value == {"status": status, "remoteWrites": False,
                                      "privateValuesExported": False}
    if status == "STOP_NEEDS_OPERATOR":
        return (mode == "apply" and code == 2 and set(value) == {"status", "backupId", "remoteWrites",
                                                 "privateValuesExported"} and
                value["remoteWrites"] is True and
                isinstance(value["backupId"], str) and BACKUP.fullmatch(value["backupId"]))
    if status in ("STOP_ROLLBACK_NEEDS_OPERATOR", "EDGE_PARTIAL_ROLLED_BACK"):
        return (mode == "rollback" and value.get("backupId") == backup_id and
                code == (0 if status == "EDGE_PARTIAL_ROLLED_BACK" else 2) and
                set(value) == {"status", "backupId", "remoteWrites",
                               "privateValuesExported"} and value["remoteWrites"] is True)
    return (mode == "apply" and code == 0 and status == "CADDY_ATTACHED_PARTIAL" and
            set(value) == {"status", "backupId", "networkId", "composeSha",
                           "caddyId", "remoteWrites", "privateValuesExported"} and
            value["remoteWrites"] is True and
            isinstance(value["backupId"], str) and BACKUP.fullmatch(value["backupId"]) and
            isinstance(value["networkId"], str) and ID.fullmatch(value["networkId"]) and
            value["composeSha"] == CANDIDATE_SHA and value["caddyId"] == CADDY_ID)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--mode", choices=("apply", "rollback"), required=True)
    parser.add_argument("--backup-id")
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if (args.out.exists() or args.out.parent.resolve() != HERE or
            args.out.suffix != ".json" or
            (args.mode == "rollback") != bool(args.backup_id) or
            (args.backup_id and not BACKUP.fullmatch(args.backup_id))):
        raise SystemExit("STOP: output path unknown")
    sources = []
    for name, path, expected in SOURCES:
        body = path.read_bytes()
        if hashlib.sha256(body).hexdigest() != expected:
            raise SystemExit("STOP: sealed helper changed")
        sources.append((name, body))
    target = (HERE / "remote_edge_apply_candidate.py").read_bytes()
    if hashlib.sha256(target).hexdigest() != args.source_sha256:
        raise SystemExit("STOP: source seal drift")
    bootstrap = "import base64,sys,types\n"
    for name, body in sources:
        bootstrap += ("m=types.ModuleType('" + name + "')\n"
                      "exec(compile(base64.b64decode('" +
                      base64.b64encode(body).decode("ascii") +
                      "'),'<sealed-" + name + ">','exec'),m.__dict__)\n"
                      "sys.modules['" + name + "']=m\n")
    bootstrap += ("exec(compile(base64.b64decode('" +
                  base64.b64encode(target).decode("ascii") +
                  "'),'<sealed-edge-apply>','exec'),{'__name__':'__main__'})\n")
    remote = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
              "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15",
              "-o", "ServerAliveCountMax=1", "lumbre", "python3", "-B", "-",
              args.mode]
    if args.backup_id:
        remote.append(args.backup_id)
    try:
        response = subprocess.run(remote, input=bootstrap.encode("ascii"),
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                  timeout=180, check=False)
        if len(response.stdout) > 1024:
            raise ValueError("oversized")
        result = json.loads(response.stdout)
        if not valid(result, response.returncode, args.mode, args.backup_id):
            raise ValueError("schema")
    except (OSError, subprocess.TimeoutExpired, UnicodeError, ValueError):
        raise SystemExit("STOP: remote operation unknown; raw output discarded") from None
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(result, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(result["status"])
    return response.returncode


if __name__ == "__main__":
    raise SystemExit(main())
