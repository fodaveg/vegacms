"""Project only the durable Vega network preconditions of shared edge Caddy."""

import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

COMPOSE = Path("/srv/edge/compose.yml")
BASE_SHA = "c6c47d481ff63296d8818680e6b20d351a73b34d00b9339b2654df7679abbee2"
CONTAINER_ID = "ae97fc0c57fbe4c3a97f5dce15dfc9da92f33f527b60d95c3f74de9d2a160a7a"
IMAGE_ID = "sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648"
SERVICE_ANCHOR = b"    networks:\n      - edge\n"
ROOT_ANCHOR = b"networks:\n  edge:\n    external: true\n    name: edge\n"
NETWORK_BLOCK = b"  vega-edge:\n    external: true\n    name: vega-edge\n"


def digest(body):
    return hashlib.sha256(body).hexdigest()


def read_compose():
    """Pin every directory, reject symlinks and keep complete bytes in RAM."""
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in COMPOSE.parts[1:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        leaf = os.open(COMPOSE.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                       dir_fd=fd)
        with os.fdopen(leaf, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size > 2 * 1024 * 1024:
                raise RuntimeError("ComposeShapeUnknown")
            body = stream.read(before.st_size + 1)
            after = os.fstat(stream.fileno())
        if len(body) != before.st_size or (before.st_dev, before.st_ino, before.st_mtime_ns,
                before.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_mtime_ns,
                                       after.st_ctime_ns):
            raise RuntimeError("ComposeChanged")
        return body, before
    finally:
        os.close(fd)


def candidate(body, base_sha=BASE_SHA):
    """Add only Vega's external network to the already selected Caddy service."""
    if (digest(body) != base_sha or body.count(SERVICE_ANCHOR) != 1 or
            body.count(ROOT_ANCHOR) != 1 or b"vega-edge" in body):
        raise RuntimeError("ComposeAnchorUnknown")
    result = body.replace(SERVICE_ANCHOR, SERVICE_ANCHOR + b"      - vega-edge\n", 1)
    result = result.replace(ROOT_ANCHOR, ROOT_ANCHOR + NETWORK_BLOCK, 1)
    if (result.replace(SERVICE_ANCHOR + b"      - vega-edge\n", SERVICE_ANCHOR, 1)
            .replace(ROOT_ANCHOR + NETWORK_BLOCK, ROOT_ANCHOR, 1) != body):
        raise RuntimeError("ComposeDeltaUnknown")
    return result


def command(argv):
    result = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            timeout=20, check=False)
    if result.returncode or len(result.stdout) > 65536:
        raise RuntimeError("CommandUnavailable")
    return result.stdout


def selected_container():
    template = (
        '{"id":{{json .Id}},"image":{{json .Image}},'
        '"running":{{json .State.Running}},'
        '"configFiles":{{json (index .Config.Labels "com.docker.compose.project.config_files")}},'
        '"workingDir":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}},'
        '"networks":{{json .NetworkSettings.Networks}}}'
    )
    value = json.loads(command(["docker", "inspect", "--format", template, "edge-caddy"]))
    if not isinstance(value, dict) or set(value) != {
            "id", "image", "running", "configFiles", "workingDir", "networks"} or \
            not isinstance(value["networks"], dict):
        raise RuntimeError("ContainerShapeUnknown")
    config_files = value["configFiles"]
    working_dir = value["workingDir"]
    source_class = ("EXACT" if config_files == str(COMPOSE) and
                    working_dir == str(COMPOSE.parent) else
                    "UNKNOWN" if not config_files or not working_dir else "OTHER")
    networks = value["networks"]
    return {"idMatches": value["id"] == CONTAINER_ID,
            "imageMatches": value["image"] == IMAGE_ID,
            "running": value["running"] is True,
            "composeSourceClass": source_class,
            "edgeMember": "edge" in networks,
            "vegaEdgeMember": "vega-edge" in networks,
            "otherNetworkCount": len(set(networks) - {"edge", "vega-edge"})}


def git_source_class():
    """Classify the known Compose's local Git ownership without exporting paths."""
    root = subprocess.run(["git", "-C", str(COMPOSE.parent), "rev-parse", "--show-toplevel"],
                          stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)
    if root.returncode or len(root.stdout) > 512:
        return "UNKNOWN"
    selected = Path(root.stdout.decode("utf-8", "replace").strip())
    if selected != COMPOSE.parent:
        return "OTHER_ROOT"
    tracked = subprocess.run(["git", "-C", str(COMPOSE.parent), "ls-files",
                              "--error-unmatch", "--", COMPOSE.name],
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)
    return "TRACKED" if tracked.returncode == 0 and \
        tracked.stdout.strip() == COMPOSE.name.encode() else "UNTRACKED_OR_UNKNOWN"


def network_class():
    template = ('{"name":{{json .Name}},"driver":{{json .Driver}},'
                '"scope":{{json .Scope}},"internal":{{json .Internal}}}')
    try:
        value = json.loads(command(["docker", "network", "inspect", "--format",
                                    template, "vega-edge"]))
    except Exception:
        return "UNAVAILABLE"
    if value == {"name": "vega-edge", "driver": "bridge", "scope": "local",
                 "internal": False}:
        return "EXPECTED"
    return "OTHER"


def projected():
    body, file_stat = read_compose()
    result = candidate(body)
    selected = selected_container()
    network = network_class()
    owner = git_source_class()
    final_body, final_stat = read_compose()
    if (final_body != body or
            (file_stat.st_dev, file_stat.st_ino, file_stat.st_uid, file_stat.st_gid,
             file_stat.st_mode, file_stat.st_size, file_stat.st_mtime_ns,
             file_stat.st_ctime_ns) !=
            (final_stat.st_dev, final_stat.st_ino, final_stat.st_uid, final_stat.st_gid,
             final_stat.st_mode, final_stat.st_size, final_stat.st_mtime_ns,
             final_stat.st_ctime_ns) or
            selected_container() != selected or network_class() != network):
        raise RuntimeError("SnapshotChanged")
    return {"status": "PROJECTED", "composeBaseMatches": digest(body) == BASE_SHA,
            "candidateSha256": digest(result), "composeMode": stat.S_IMODE(file_stat.st_mode),
            "composeRegular": True, "gitSourceClass": owner,
            "networkClass": network, **selected,
            "remoteWrites": False, "privateValuesExported": False}


def main():
    try:
        if len(sys.argv) != 1:
            raise RuntimeError("ArgsUnknown")
        value = projected()
    except Exception:
        value = {"status": "STOP_READ_UNAVAILABLE", "remoteWrites": False,
                 "privateValuesExported": False}
    print(json.dumps(value, sort_keys=True, separators=(",", ":")))
    return 0 if value["status"] == "PROJECTED" else 2


if __name__ == "__main__":
    sys.exit(main())
