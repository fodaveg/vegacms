"""Release-owner wrapper for one pinned, schema-closed CORS/network read."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

import remote_probe as probe

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "remote_probe.py"


def count(value):
    return type(value) is int and 0 <= value <= 10000


def arguments(value):
    return (isinstance(value, dict) and set(value) == {"allowed", "unknownCount", "originsExplicit"}
            and isinstance(value["allowed"], list) and len(value["allowed"]) <= 128
            and probe.args(value["allowed"])["allowed"] == value["allowed"]
            and probe.args(value["allowed"])["unknownCount"] == 0
            and count(value["unknownCount"])
            and (value["originsExplicit"] is None or type(value["originsExplicit"]) is bool))


def valid(value, exit_code):
    base = {"schemaVersion", "mode", "status", "remoteWrites",
            "configEnvRequested", "privateValuesExported"}
    if not isinstance(value, dict) or type(value.get("schemaVersion")) is not int or \
            value["schemaVersion"] != 1 or value.get("mode") != "CORS_NETWORK_SELECTIVE_READONLY" or \
            value.get("remoteWrites") is not False or value.get("configEnvRequested") is not False or \
            value.get("privateValuesExported") is not False:
        return False
    if value.get("status") == "STOP":
        return exit_code == 2 and set(value) == base
    if value.get("status") != "PROJECTED" or exit_code != 0 or \
            set(value) != base | {"compose", "containers", "edge", "browser"}:
        return False
    compose = value["compose"]
    if not isinstance(compose, dict) or set(compose) != set(probe.FILES):
        return False
    for item in compose.values():
        if not isinstance(item, dict) or set(item) != {"sha256", "matchesReceipt"} or \
                not isinstance(item["sha256"], str) or not probe.HEX.fullmatch(item["sha256"]) or \
                type(item["matchesReceipt"]) is not bool:
            return False
    for name, (_, expected) in probe.FILES.items():
        if compose[name]["matchesReceipt"] != (compose[name]["sha256"] == expected):
            return False
    containers = value["containers"]
    if not isinstance(containers, dict) or set(containers) != set(probe.NAMES):
        return False
    ids = set()
    for name, item in containers.items():
        if not isinstance(item, dict) or set(item) != {
                "id", "imageId", "state", "entrypoint", "command", "pbArgs",
                "networks", "unknownNetworkCount", "ports", "unknownPortCount"}:
            return False
        if not isinstance(item["id"], str) or not probe.HEX.fullmatch(item["id"]) or \
                not isinstance(item["imageId"], str) or not probe.IMAGE.fullmatch(item["imageId"]) or \
                item["state"] not in ("running", "exited", "created", "restarting", "paused") or \
                not arguments(item["entrypoint"]) or not arguments(item["command"]) or \
                not count(item["unknownNetworkCount"]) or not count(item["unknownPortCount"]):
            return False
        if item["id"] in ids:
            return False
        ids.add(item["id"])
        if (name in probe.BACKENDS and item["pbArgs"] is not None and not arguments(item["pbArgs"])) or \
                (name not in probe.BACKENDS and item["pbArgs"] is not None):
            return False
        networks = item["networks"]
        if not isinstance(networks, dict) or not set(networks).issubset(probe.NETWORKS):
            return False
        for record in networks.values():
            if not isinstance(record, dict) or set(record) != {"known", "unknownCount"} or \
                    not isinstance(record["known"], list) or \
                    any(alias not in probe.NAMES for alias in record["known"]) or \
                    len(record["known"]) != len(set(record["known"])) or \
                    not count(record["unknownCount"]):
                return False
        ports = item["ports"]
        if not isinstance(ports, dict) or not set(ports).issubset(probe.PORTS) or \
                any(type(published) is not bool for published in ports.values()):
            return False
    edge = value["edge"]
    if not isinstance(edge, dict) or set(edge) != {"id", "known", "unknownCount", "total"} or \
            not isinstance(edge["id"], str) or not probe.HEX.fullmatch(edge["id"]) or \
            not isinstance(edge["known"], list) or any(name not in probe.NAMES for name in edge["known"]) or \
            len(edge["known"]) != len(set(edge["known"])) or not count(edge["unknownCount"]) or \
            not count(edge["total"]) or edge["total"] != len(edge["known"]) + edge["unknownCount"] or \
            edge["known"] != sorted(name for name, item in containers.items()
                                    if "edge" in item["networks"]):
        return False
    browser = value["browser"]
    if not isinstance(browser, dict) or set(browser) != set(probe.ORIGINS):
        return False
    for name, entry in browser.items():
        if not isinstance(entry, dict) or set(entry) != {"pageOrigin", "config", "overrideUninspected"} or \
                entry["pageOrigin"] != probe.ORIGINS[name] or entry["overrideUninspected"] is not True:
            return False
        config = entry["config"]
        if not isinstance(config, dict) or set(config) != {"state", "backendOrigin", "sameOrigin"} or \
                config["state"] not in ("ABSENT", "DEFAULT", "PUBLIC_KNOWN", "UNKNOWN", "UNAVAILABLE"):
            return False
        backend = config["backendOrigin"]
        if backend is not None and backend not in probe.ORIGINS.values():
            return False
        if config["state"] in ("UNKNOWN", "UNAVAILABLE"):
            if backend is not None or config["sameOrigin"] is not None:
                return False
        elif (type(config["sameOrigin"]) is not bool or backend is None or
              config["sameOrigin"] != (backend == entry["pageOrigin"])):
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
                                  stderr=subprocess.DEVNULL, timeout=120, check=False)
        if len(response.stdout) > 8192:
            raise ValueError("oversized")
        value = json.loads(response.stdout)
        if not valid(value, response.returncode):
            raise ValueError("schema")
    except (OSError, subprocess.TimeoutExpired, UnicodeError, ValueError):
        raise SystemExit("STOP: selective projection unavailable; no raw output persisted") from None
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(value["status"])
    return 0 if value["status"] == "PROJECTED" else 2


if __name__ == "__main__":
    sys.exit(main())
