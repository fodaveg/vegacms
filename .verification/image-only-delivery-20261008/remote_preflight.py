"""Read-only projection for the three existing admin containers.

Run on the VPS only after the release owner reviews this exact file. Docker and
Compose may see private data; this process emits only bounded public metadata.
No SSH, Caddy, Config.Env, backup, or mutation is performed here.
"""

import base64
import binascii
import hashlib
import json
import os
import re
import shlex
import stat
import subprocess
from pathlib import Path


SPECS = (
    ("vega-pb", "vega", "pocketbase", "/srv/vega/infra/production/compose.yml",
     "/srv/vega/infra/production/.env", ("VEGA_IMAGE_TAG", "VEGA_GIT_SHA")),
    ("lumbre-admin-pb", "lumbre-admin", "pocketbase", "/srv/lumbre-admin/compose.yml",
     "/srv/lumbre-admin/.env", ("LUMBRE_ADMIN_IMAGE",)),
    ("fodaveg", "fodaveg", "fodaveg", "/root/fodaveg/compose.yml",
     "/root/fodaveg/.env", ("FODAVEG_IMAGE",)),
)
IMAGE_TAGS = {
    "VEGA_IMAGE_TAG": re.compile(r"[0-9a-f]{40}"),
    "VEGA_GIT_SHA": re.compile(r"[0-9a-f]{40}"),
    "LUMBRE_ADMIN_IMAGE": re.compile(r"lumbre-admin-pb:[a-z0-9][a-z0-9._-]{0,127}"),
    "FODAVEG_IMAGE": re.compile(r"fodaveg:[a-z0-9][a-z0-9._-]{0,127}"),
}
KNOWN_VOLUMES = {"vega_data", "lumbre_admin_pb_data", "fodaveg_fodaveg_pb"}
KNOWN_DESTINATIONS = {"/pb/pb_data", "/pb/pb_migrations", "/pb/publish"}
KNOWN_NETWORKS = {"edge", "vega-edge"}
EXPECTED_MOUNTS = {
    "vega-pb": {("volume", "vega_data", "/pb/pb_data", True, None)},
    "lumbre-admin-pb": {
        ("volume", "lumbre_admin_pb_data", "/pb/pb_data", True, None),
        ("bind", None, "/pb/pb_migrations", False,
         hashlib.sha256(b"/srv/lumbre-admin/pb_migrations").hexdigest()),
        ("bind", None, "/pb/publish", True,
         hashlib.sha256(b"/srv/lumbre-admin/publish").hexdigest()),
    },
    "fodaveg": {("volume", "fodaveg_fodaveg_pb", "/pb/pb_data", True, None)},
}
EXPECTED_ALIASES = {"vega-pb": "vega-pb", "lumbre-admin-pb": "lumbre-admin-pb", "fodaveg": "fodaveg"}
KNOWN_ALIASES = {"vega-pb", "lumbre-admin-pb", "fodaveg", "pocketbase"}
STOCK_OLD_CMD = ["serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--publicDir=/pb/pb_public"]
KNOWN_EXECUTABLES = {"/pb/pocketbase", "/pb/lumbre-admin", "/pb/fodaveg-pb", "/usr/bin/tini",
                     "./docker-entrypoint.sh", "--", "-g"}
PROCESS_PATHS = {"vega-pb": "/pb/pocketbase", "lumbre-admin-pb": "/pb/lumbre-admin",
                 "fodaveg": "/pb/fodaveg-pb"}
PROC_COMMAND = '''set -eu
for f in /proc/[0-9]*/comm; do
    IFS= read -r comm < "$f" || continue
    case "$comm" in
        pocketbase|lumbre-admin|fodaveg-pb)
            printf '__PB_BEGIN__\\n'
            base64 "${f%/comm}/cmdline"
            printf '__PB_END__\\n'
            ;;
    esac
done'''
DOCKER_TEMPLATE = (
    '{"imageId":{{json .Image}},"imageRef":{{json .Config.Image}},'
    '"entrypoint":{{json .Config.Entrypoint}},"cmd":{{json .Config.Cmd}},'
    '"project":{{json (index .Config.Labels "com.docker.compose.project")}},'
    '"service":{{json (index .Config.Labels "com.docker.compose.service")}},'
    '"mounts":[{{range $i,$m := .Mounts}}{{if $i}},{{end}}'
    '{"type":{{json $m.Type}},"name":{{json $m.Name}},'
    '"source":{{json $m.Source}},"dest":{{json $m.Destination}},'
    '"rw":{{json $m.RW}}}{{end}}],'
    '"networks":[{{$first := true}}{{range $name,$v := .NetworkSettings.Networks}}'
    '{{if not $first}},{{end}}{"name":{{json $name}},"aliases":{{json $v.Aliases}}}'
    '{{$first = false}}{{end}}]}'
)


def run(argv, limit=524288):
    """Bound subprocess output; never include its stdout/stderr in errors."""
    try:
        result = subprocess.run(argv, capture_output=True, timeout=18, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("CommandUnavailable") from None
    if result.returncode or len(result.stdout) > limit or len(result.stderr) > limit:
        raise RuntimeError("CommandUnavailable")
    return result.stdout


def file_open(path):
    """Open the literal file without following symlinks in any path component."""
    parts = Path(path).parts
    if not parts or parts[0] != "/":
        raise RuntimeError("FileUnavailable")
    parent = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    descriptor = None
    try:
        for part in parts[1:-1]:
            next_parent = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            os.close(parent)
            parent = next_parent
        descriptor = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > 2 * 1024 * 1024:
            raise RuntimeError("FileUnavailable")
        stream = os.fdopen(descriptor, "rb")
        descriptor = None
        return stream, metadata
    finally:
        if descriptor is not None:
            os.close(descriptor)
        os.close(parent)


def hash_file(path):
    """Hash Compose bytes; do not parse or serialize its body."""
    stream, before = file_open(path)
    with stream:
        hasher = hashlib.sha256()
        total = 0
        for chunk in iter(lambda: stream.read(65536), b""):
            total += len(chunk)
            if total > 2 * 1024 * 1024:
                raise RuntimeError("FileUnavailable")
            hasher.update(chunk)
        after = os.fstat(stream.fileno())
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError("ConcurrentFileChange")
    return hasher.hexdigest()


def selected_env(path, keys):
    """Scan only requested image selector keys; discard all other lines in RAM."""
    stream, before = file_open(path)
    found = {}
    with stream:
        for line in stream:
            if len(line) > 65536:
                raise RuntimeError("EnvLineTooLong")
            head, sep, value = line.partition(b"=")
            if not sep:
                continue
            try:
                key = head.decode("ascii")
            except UnicodeDecodeError:
                continue
            if key not in keys:
                continue
            if key in found:
                raise RuntimeError("DuplicateSelector")
            try:
                candidate = value.strip().decode("ascii")
            except UnicodeDecodeError:
                raise RuntimeError("InvalidSelector") from None
            if IMAGE_TAGS[key].fullmatch(candidate) is None:
                raise RuntimeError("InvalidSelector")
            found[key] = candidate
        after = os.fstat(stream.fileno())
    if set(found) != set(keys) or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError("SelectorUnavailable")
    return found


def project_args(raw):
    """Allow only known public PocketBase flags; unknown values never leave RAM."""
    if raw is None:
        return {"allowed": [], "unknownCount": 1}
    if isinstance(raw, str):
        try:
            raw = shlex.split(raw)
        except ValueError:
            return {"allowed": [], "unknownCount": 1}
    if not isinstance(raw, list) or len(raw) > 64 or any(not isinstance(v, str) for v in raw):
        return {"allowed": [], "unknownCount": 1}
    allowed, unknown = [], 0
    index = 0
    while index < len(raw):
        item = raw[index]
        if item in KNOWN_EXECUTABLES or item == "serve":
            allowed.append(item)
        elif item == "--dir" and index + 1 < len(raw) and raw[index + 1] == "/pb/pb_data":
            allowed.extend((item, raw[index + 1]))
            index += 1
        elif re.fullmatch(r"--http=(?:0\.0\.0\.0|127\.0\.0\.1):(?:8090|4321)", item):
            allowed.append(item)
        elif item in ("--hooksWatch=false", "--hooksWatch=true"):
            allowed.append(item)
        elif any(item == flag + "=" + dest for flag in ("--dir", "--publicDir", "--hooksDir", "--migrationsDir")
                 for dest in KNOWN_DESTINATIONS | {"/pb/pb_public", "/pb/pb_hooks"}):
            allowed.append(item)
        elif item.startswith("--origins="):
            origins = item.removeprefix("--origins=").split(",")
            if origins and all(v in ("https://admin.vegacms.com", "https://admin.lumbre.pro",
                                       "https://admin.fodaveg.net", "https://fodaveg.net") for v in origins):
                allowed.append(item)
            else:
                unknown += 1
        else:
            unknown += 1
        index += 1
    return {"allowed": allowed, "unknownCount": unknown}


def project_mounts(raw):
    result, unknown = [], 0
    if not isinstance(raw, list) or len(raw) > 16:
        return [], 1
    for mount in raw:
        if not isinstance(mount, dict):
            unknown += 1
            continue
        kind, name, source, dest, rw = (mount.get(k) for k in ("type", "name", "source", "dest", "rw"))
        if (kind not in ("volume", "bind") or dest not in KNOWN_DESTINATIONS or
                not isinstance(source, str) or not isinstance(rw, bool) or
                (kind == "volume" and name not in KNOWN_VOLUMES) or
                (kind == "bind" and name not in ("", None))):
            unknown += 1
            continue
        result.append({"type": kind, "name": name if kind == "volume" else None,
                       "destination": dest, "readWrite": rw,
                       "sourceFingerprint": hashlib.sha256(source.encode()).hexdigest()})
    return sorted(result, key=lambda v: v["destination"]), unknown


def project_networks(raw):
    result, unknown = [], 0
    if not isinstance(raw, list) or len(raw) > 8:
        return [], 1
    for item in raw:
        if not isinstance(item, dict) or item.get("name") not in KNOWN_NETWORKS:
            unknown += 1
            continue
        aliases = item.get("aliases")
        if not isinstance(aliases, list) or any(not isinstance(alias, str) or
                                                (alias not in KNOWN_ALIASES and
                                                 re.fullmatch(r"[0-9a-f]{12,64}", alias) is None)
                                                for alias in aliases):
            unknown += 1
            continue
        result.append({"name": item["name"], "aliases": sorted(aliases)})
    return sorted(result, key=lambda v: v["name"]), unknown


def project_proc_output(output, container):
    """Decode one framed PB cmdline in RAM; never serialize raw/base64 process data."""
    unknown = {"allowed": [], "unknownCount": 1}
    if not isinstance(output, bytes) or len(output) > 524288:
        return unknown
    try:
        lines = output.decode("ascii").splitlines()
    except UnicodeDecodeError:
        return unknown
    candidates, payload = [], None
    for line in lines:
        if line == "__PB_BEGIN__":
            if payload is not None:
                return unknown
            payload = []
        elif line == "__PB_END__":
            if payload is None:
                return unknown
            try:
                raw = base64.b64decode("".join(payload), validate=True)
                if not raw or len(raw) > 16384 or not raw.endswith(b"\0"):
                    return unknown
                args = [part.decode("utf-8") for part in raw[:-1].split(b"\0")]
            except (binascii.Error, UnicodeDecodeError, ValueError):
                return unknown
            if not args or args[0] != PROCESS_PATHS[container]:
                return unknown
            candidates.append(project_args(args))
            payload = None
        elif payload is not None:
            payload.append(line)
        else:
            return unknown
    return candidates[0] if payload is None and len(candidates) == 1 else unknown


def project_process(container):
    """Read only allowlisted PB process cmdline inside this container."""
    output = run(["docker", "exec", container, "/bin/sh", "-c", PROC_COMMAND])
    return project_proc_output(output, container)


def project_image_cmd(name, raw):
    """Fod's literal Dockerfile has no CMD; its entrypoint starts PB itself."""
    if name == "fodaveg" and raw is None:
        return {"allowed": [], "unknownCount": 0}
    return project_args(raw)


def project_container(name, project, service):
    raw = json.loads(run(["docker", "inspect", "--format", DOCKER_TEMPLATE, name]))
    mounts, mount_unknown = project_mounts(raw.get("mounts"))
    networks, network_unknown = project_networks(raw.get("networks"))
    image_id = raw.get("imageId")
    ref = raw.get("imageRef")
    if not isinstance(image_id, str) or re.fullmatch(r"sha256:[0-9a-f]{64}", image_id) is None:
        image_id = None
    expected_prefix = {"vega-pb": "vegacms:", "lumbre-admin-pb": "lumbre-admin-pb:",
                       "fodaveg": "fodaveg:"}[name]
    if (not isinstance(ref, str) or not ref.startswith(expected_prefix) or
            re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,127}", ref[len(expected_prefix):]) is None):
        ref = None
    entry = project_args(raw.get("entrypoint"))
    cmd = project_image_cmd(name, raw.get("cmd"))
    pb = project_process(name)
    return {"imageId": image_id, "imageRef": ref,
            "composeIdentityMatches": raw.get("project") == project and raw.get("service") == service,
            "entrypoint": entry, "cmd": cmd, "pbArgv": pb,
            "mounts": mounts, "unknownMounts": mount_unknown,
            "networks": networks, "unknownNetworks": network_unknown}


def matches_mounts(name, mounts):
    """Require exact volume, bind destination, mode and known bind source fingerprint."""
    observed = {(m["type"], m["name"], m["destination"], m["readWrite"],
                 m["sourceFingerprint"] if m["type"] == "bind" else None) for m in mounts}
    return len(observed) == len(mounts) and observed == EXPECTED_MOUNTS[name]


def matches_network(name, networks):
    return len(networks) == 1 and networks[0]["name"] == "edge" and EXPECTED_ALIASES[name] in networks[0]["aliases"]


def selected_image_ref(name, selectors):
    if name == "vega-pb":
        if selectors["VEGA_IMAGE_TAG"] != selectors["VEGA_GIT_SHA"]:
            return None
        return "vegacms:" + selectors["VEGA_IMAGE_TAG"]
    if name == "lumbre-admin-pb":
        return selectors["LUMBRE_ADMIN_IMAGE"]
    return selectors["FODAVEG_IMAGE"]


def preflight():
    """Fail closed for any incomplete field, without returning private subprocess data."""
    output = {"schemaVersion": 1, "mode": "image-only-metadata-preflight",
              "remoteWrites": False, "caddyRead": False, "configEnvRequested": False,
              "dotenvSelectorScan": True, "composeMayInterpolateSecretsInRAM": True,
              "composeBodyParsed": False, "composeHashRead": True, "containers": {}}
    complete = True
    for name, project, service, compose, env_file, keys in SPECS:
        item = {"status": "STOP"}
        try:
            before = hash_file(compose)
            selectors = selected_env(env_file, keys)
            quiet = subprocess.run(["docker", "compose", "--env-file", env_file,
                                    "--file", compose, "config", "--quiet"],
                                   capture_output=True, timeout=18, check=False)
            item["composeQuietValid"] = quiet.returncode == 0 and not quiet.stdout
            item["composeSha256"] = before
            item["selectors"] = selectors
            item["runtime"] = project_container(name, project, service)
            item["composeStable"] = hash_file(compose) == before
            runtime = item["runtime"]
            expected_ref = selected_image_ref(name, selectors)
            item["selectorMatchesRuntime"] = expected_ref is not None and runtime["imageRef"] == expected_ref
            resolved_id = None
            if expected_ref is not None:
                resolved_id = json.loads(run(["docker", "image", "inspect", "--format", "{{json .Id}}", expected_ref]))
            item["selectorResolvesCurrentImage"] = resolved_id == runtime["imageId"] and resolved_id is not None
            item["mountsMatch"] = matches_mounts(name, runtime["mounts"])
            item["networkMatches"] = matches_network(name, runtime["networks"])
            item["stockCorsBaselineMatches"] = (name != "vega-pb" or
                                                 (runtime["cmd"]["allowed"] == STOCK_OLD_CMD and
                                                  runtime["pbArgv"]["allowed"] == ["/pb/pocketbase", *STOCK_OLD_CMD]))
            known = (item["composeQuietValid"] and item["composeStable"] and runtime["imageId"] and
                     runtime["imageRef"] and runtime["composeIdentityMatches"] and
                     item["selectorMatchesRuntime"] and item["selectorResolvesCurrentImage"] and
                     runtime["unknownMounts"] == 0 and runtime["unknownNetworks"] == 0 and
                     item["mountsMatch"] and item["networkMatches"] and item["stockCorsBaselineMatches"] and
                     all(runtime[k]["unknownCount"] == 0 for k in ("entrypoint", "cmd", "pbArgv")))
            item["status"] = "READY_FOR_REVIEW" if known else "STOP"
        except Exception:
            item["errorCode"] = "MetadataUnavailable"
        output["containers"][name] = item
        complete &= item["status"] == "READY_FOR_REVIEW"
    output["status"] = "READY_FOR_REVIEW" if complete else "STOP"
    return output


if __name__ == "__main__":
    print(json.dumps(preflight(), sort_keys=True, separators=(",", ":")))
