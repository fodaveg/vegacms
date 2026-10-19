"""Selective CORS and network inventory; all unapproved values stay in server RAM."""

import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from urllib import error, request
from urllib.parse import urlsplit

NAMES = ("edge-caddy", "vega-pb", "lumbre-admin-pb", "fodaveg", "lumbre-preview")
BACKENDS = ("vega-pb", "lumbre-admin-pb", "fodaveg")
NETWORKS = ("edge", "vega-edge", "lumbre-admin-edge", "fodaveg-admin-edge")
PORTS = ("80/tcp", "443/tcp", "8090/tcp", "4321/tcp", "2019/tcp")
FILES = {
    "vega": ("/srv/vega/infra/production/compose.yml", "bae812ef0031b5e6aeb65f4678905e65d74cfadf62a5e78fe156250166377f7e"),
    "lumbre": ("/srv/lumbre-admin/compose.yml", "7ed9a9e225790a4e15ccef3ce4c110b8d3b22e0fef53e6c1840d286181ebb8dd"),
    "fodaveg": ("/root/fodaveg/compose.yml", "a18777c55d583c8eab43671d968108c9560f8a41152440e04ba610e583a9b500"),
    "edge": ("/srv/edge/compose.yml", "c6c47d481ff63296d8818680e6b20d351a73b34d00b9339b2654df7679abbee2"),
}
ORIGINS = {"vega-pb": "https://admin.vegacms.com",
           "lumbre-admin-pb": "https://admin.lumbre.pro",
           "fodaveg": "https://admin.fodaveg.net"}
EXECUTABLES = ("/pb/pocketbase", "/pb/lumbre-admin", "/pb/fodaveg-pb",
               "pocketbase", "lumbre-admin", "fodaveg-pb", "/usr/bin/tini", "tini",
               "node", "serve", "--")
DESTINATIONS = ("/pb/pb_data", "/pb/pb_public", "/pb/pb_hooks",
                "/app/pb_data", "/app/pb_public", "/app/pb_hooks")
HEX = re.compile(r"[0-9a-f]{64}\Z")
IMAGE = re.compile(r"sha256:[0-9a-f]{64}\Z")
INSPECT = '''{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"state":{{json .State.Status}},"entry":{{json .Config.Entrypoint}},"cmd":{{json .Config.Cmd}},"nets":[{{$first := true}}{{range $name,$v := .NetworkSettings.Networks}}{{if not $first}},{{end}}{"name":{{json $name}},"aliases":{{json $v.Aliases}}}{{$first = false}}{{end}}],"ports":[{{$first := true}}{{range $port,$bindings := .NetworkSettings.Ports}}{{if not $first}},{{end}}{"port":{{json $port}},"published":{{if $bindings}}true{{else}}false{{end}}}{{$first = false}}{{end}}]}'''
EDGE = '''{"id":{{json .Id}},"name":{{json .Name}},"members":[{{$first := true}}{{range $id,$v := .Containers}}{{if not $first}},{{end}}{"id":{{json $id}},"name":{{json $v.Name}}}{{$first = false}}{{end}}]}'''
PROC = '''set -eu
for f in /proc/[0-9]*/comm; do
    IFS= read -r comm < "$f" || continue
    case "$comm" in
        pocketbase|lumbre-admin|fodaveg-pb)
            printf '__PB_BEGIN__\\n'
            base64 "$(dirname "$f")/cmdline"
            printf '__PB_END__\\n'
            ;;
    esac
done'''


def run(argv):
    result = subprocess.run(argv, capture_output=True, timeout=15, check=False)
    if result.returncode or len(result.stdout) > 256 * 1024 or len(result.stderr) > 256 * 1024:
        raise RuntimeError("SELECTIVE_READ_UNAVAILABLE")
    return result.stdout


def sha_file(path):
    """Read one literal Compose file, no symlink, bounded to 2 MiB."""
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        parts = Path(path).parts[1:]
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        leaf = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                       dir_fd=fd)
        with os.fdopen(leaf, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size > 2 * 1024 * 1024:
                raise RuntimeError("COMPOSE_UNKNOWN")
            data = stream.read(before.st_size + 1)
            after = os.fstat(stream.fileno())
            if len(data) != before.st_size or (before.st_dev, before.st_ino, before.st_size,
                    before.st_mtime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
                raise RuntimeError("COMPOSE_DRIFT")
            return hashlib.sha256(data).hexdigest()
    finally:
        os.close(fd)


def origin(value):
    if not isinstance(value, str) or value != value.strip():
        return None
    try:
        parsed = urlsplit(value)
        if parsed.scheme != "https" or parsed.username or parsed.password or \
                parsed.port not in (None, 443) or parsed.path not in ("", "/") or \
                parsed.query or parsed.fragment:
            return None
        normalized = "https://" + parsed.hostname
        return normalized if normalized in ORIGINS.values() else None
    except (ValueError, TypeError):
        return None


def args(values):
    """Allowlist PB argv and public origins; count all unknown values."""
    if not isinstance(values, list) or len(values) > 128 or any(not isinstance(v, str) for v in values):
        return {"allowed": [], "unknownCount": 1, "originsExplicit": None}
    allowed, unknown, explicit, index = [], 0, False, 0
    while index < len(values):
        value = values[index]
        if value in ("--dir", "--publicDir", "--hooksDir", "--http", "--hooksWatch"):
            index += 1
            candidate = values[index] if index < len(values) else ""
            normalized = value + "=" + candidate
            if (value in ("--dir", "--publicDir", "--hooksDir") and candidate in DESTINATIONS) or \
                    (value == "--http" and re.fullmatch(
                        r"(?:0\.0\.0\.0|127\.0\.0\.1):(?:8090|4321)", candidate)) or \
                    (value == "--hooksWatch" and candidate in ("true", "false")):
                allowed.append(normalized)
            else:
                unknown += 1
        elif value in EXECUTABLES or re.fullmatch(r"--http=(?:0\.0\.0\.0|127\.0\.0\.1):(?:8090|4321)", value) or \
                value in ("--hooksWatch=false", "--hooksWatch=true") or any(
                    value == flag + "=" + dest for flag in ("--dir", "--publicDir", "--hooksDir")
                    for dest in DESTINATIONS):
            allowed.append(value)
        elif value == "--origins" or value.startswith("--origins="):
            explicit = True
            if value == "--origins":
                index += 1
                listed = values[index] if index < len(values) else ""
            else:
                listed = value.split("=", 1)[1]
            parts = listed.split(",")
            normalized = [origin(part) for part in parts]
            if normalized and all(normalized) and parts == normalized:
                allowed.append("--origins=" + ",".join(normalized))
            else:
                unknown += 1
        else:
            unknown += 1
        index += 1
    return {"allowed": allowed, "unknownCount": unknown, "originsExplicit": explicit}


def process(body):
    if len(body) > 128 * 1024:
        return None
    found, payload = [], None
    for line in body.decode("ascii").splitlines():
        if line == "__PB_BEGIN__":
            if payload is not None:
                return None
            payload = []
        elif line == "__PB_END__":
            if payload is None:
                return None
            raw = base64.b64decode("".join(payload), validate=True)
            if not raw.endswith(b"\0"):
                return None
            found.append(args([part.decode("utf-8") for part in raw[:-1].split(b"\0")]))
            payload = None
        elif payload is not None:
            payload.append(line)
        else:
            return None
    return found[0] if payload is None and len(found) == 1 else None


def selected_container(name):
    data = json.loads(run(["docker", "inspect", "--format", INSPECT, name]))
    if set(data) != {"id", "name", "image", "state", "entry", "cmd", "nets", "ports"} or \
            data["name"] != "/" + name or not isinstance(data["id"], str) or \
            not HEX.fullmatch(data["id"]) or not isinstance(data["image"], str) or \
            not IMAGE.fullmatch(data["image"]) or data["state"] not in (
                "running", "exited", "created", "restarting", "paused"):
        raise RuntimeError("CONTAINER_UNKNOWN")
    nets, unknown_nets = {}, 0
    if not isinstance(data["nets"], list) or len(data["nets"]) > 32:
        raise RuntimeError("NETWORK_UNKNOWN")
    for item in data["nets"]:
        if not isinstance(item, dict) or set(item) != {"name", "aliases"} or not isinstance(item["name"], str):
            raise RuntimeError("NETWORK_UNKNOWN")
        if item["name"] not in NETWORKS:
            unknown_nets += 1
            continue
        aliases = [] if item["aliases"] is None else item["aliases"]
        if not isinstance(aliases, list) or len(aliases) > 64 or any(not isinstance(a, str) for a in aliases):
            raise RuntimeError("ALIASES_UNKNOWN")
        nets[item["name"]] = {"known": sorted(set(a for a in aliases if a in NAMES)),
                              "unknownCount": sum(a not in NAMES for a in aliases)}
    ports, unknown_ports = {}, 0
    if not isinstance(data["ports"], list) or len(data["ports"]) > 32:
        raise RuntimeError("PORTS_UNKNOWN")
    for item in data["ports"]:
        if not isinstance(item, dict) or set(item) != {"port", "published"} or \
                not isinstance(item["port"], str) or type(item["published"]) is not bool:
            raise RuntimeError("PORTS_UNKNOWN")
        if item["port"] in PORTS:
            ports[item["port"]] = item["published"]
        else:
            unknown_ports += 1
    try:
        pb = process(run(["docker", "exec", name, "/bin/sh", "-c", PROC])) if name in BACKENDS else None
    except Exception:
        pb = None
    return {"id": data["id"], "imageId": data["image"], "state": data["state"],
            "entrypoint": args(data["entry"]), "command": args(data["cmd"]), "pbArgs": pb,
            "networks": nets, "unknownNetworkCount": unknown_nets,
            "ports": ports, "unknownPortCount": unknown_ports}


def edge_members(containers):
    data = json.loads(run(["docker", "network", "inspect", "--format", EDGE, "edge"]))
    if set(data) != {"id", "name", "members"} or data["name"] != "edge" or \
            not isinstance(data["id"], str) or not HEX.fullmatch(data["id"]) or \
            not isinstance(data["members"], list) or len(data["members"]) > 100:
        raise RuntimeError("EDGE_UNKNOWN")
    known, unknown, ids = [], 0, set()
    for member in data["members"]:
        if not isinstance(member, dict) or set(member) != {"id", "name"} or \
                not isinstance(member["id"], str) or not HEX.fullmatch(member["id"]) or \
                not isinstance(member["name"], str) or member["id"] in ids:
            raise RuntimeError("EDGE_UNKNOWN")
        ids.add(member["id"])
        if member["name"] in NAMES:
            if member["name"] in known:
                raise RuntimeError("EDGE_NAME_DUPLICATE")
            if member["id"] != containers[member["name"]]["id"]:
                raise RuntimeError("EDGE_MEMBER_ID_DRIFT")
            known.append(member["name"])
        else:
            unknown += 1
    return {"id": data["id"], "known": sorted(set(known)),
            "unknownCount": unknown, "total": len(data["members"])}


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def browser_config(page):
    """Read public unauthenticated config only; emit its backend classification."""
    try:
        opener = request.build_opener(request.ProxyHandler({}), NoRedirect)
        with opener.open(request.Request(page + "/vega.config.json", method="GET"), timeout=8) as response:
            if response.status != 200:
                raise ValueError("CONFIG_STATUS")
            body = response.read(8193)
            if len(body) > 8192:
                raise ValueError("CONFIG_OVERSIZED")
    except error.HTTPError as failure:
        if failure.code == 404:
            return {"state": "ABSENT", "backendOrigin": page, "sameOrigin": True}
        return {"state": "UNAVAILABLE", "backendOrigin": None, "sameOrigin": None}
    except Exception:
        return {"state": "UNAVAILABLE", "backendOrigin": None, "sameOrigin": None}
    try:
        config = json.loads(body)
        if not isinstance(config, dict):
            raise ValueError("CONFIG_UNKNOWN")
        value = config.get("backendUrl")
        if value is None or value == "":
            return {"state": "DEFAULT", "backendOrigin": page, "sameOrigin": True}
        normalized = origin(value)
        if normalized is None:
            raise ValueError("BACKEND_UNKNOWN")
        return {"state": "PUBLIC_KNOWN", "backendOrigin": normalized,
                "sameOrigin": normalized == page}
    except Exception:
        return {"state": "UNKNOWN", "backendOrigin": None, "sameOrigin": None}


def main():
    try:
        compose = {key: {"sha256": sha_file(path), "matchesReceipt": False}
                   for key, (path, _) in FILES.items()}
        for key, (_, expected) in FILES.items():
            compose[key]["matchesReceipt"] = compose[key]["sha256"] == expected
        containers = {name: selected_container(name) for name in NAMES}
        if len({item["id"] for item in containers.values()}) != len(NAMES):
            raise RuntimeError("CONTAINER_ID_DUPLICATE")
        edge = edge_members(containers)
        if edge["known"] != sorted(name for name, item in containers.items()
                                    if "edge" in item["networks"]):
            raise RuntimeError("EDGE_MEMBERSHIP_DRIFT")
        browser = {name: {"pageOrigin": page, "config": browser_config(page),
                          "overrideUninspected": True}
                   for name, page in ORIGINS.items()}
        output = {"schemaVersion": 1, "mode": "CORS_NETWORK_SELECTIVE_READONLY",
                  "status": "PROJECTED", "remoteWrites": False, "configEnvRequested": False,
                  "privateValuesExported": False, "compose": compose,
                  "containers": containers, "edge": edge, "browser": browser}
    except Exception:
        output = {"schemaVersion": 1, "mode": "CORS_NETWORK_SELECTIVE_READONLY",
                  "status": "STOP", "remoteWrites": False, "configEnvRequested": False,
                  "privateValuesExported": False}
    print(json.dumps(output, sort_keys=True, separators=(",", ":")))
    return 0 if output["status"] == "PROJECTED" else 2


if __name__ == "__main__":
    sys.exit(main())
