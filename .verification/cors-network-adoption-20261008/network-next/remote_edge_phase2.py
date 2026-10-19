"""Project exact Git and Docker-network identities for Caddy ↔ Vega only."""

import json
import re
import stat
import subprocess
import sys

import edge_base as base

HEX = re.compile(r"[0-9a-f]{40}(?:[0-9a-f]{24})?\Z")
NETWORK = "vega-edge"
MISSING_ERRORS = {
    b"Error: No such network: vega-edge",
    b"Error response from daemon: network vega-edge not found",
}
NETWORK_TEMPLATE = ('{"id":{{json .ID}},"name":{{json .Name}},'
                    '"driver":{{json .Driver}},"scope":{{json .Scope}},'
                    '"internal":{{json .Internal}}}')


def command(argv, *, body=None, limit=1024, timeout=15):
    """Capture bounded output in server RAM and discard raw failures."""
    try:
        result = subprocess.run(argv, input=body, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("CommandUnavailable") from None
    if len(result.stdout) > limit or len(result.stderr) > limit:
        raise RuntimeError("CommandOversize")
    return result


def git_snapshot(body):
    """Compare only the known Compose's HEAD/index/worktree Git objects."""
    root = str(base.COMPOSE.parent)
    prefix = ["git", "--no-optional-locks", "-c", "core.fsmonitor=false", "-C", root]

    def exact_oid(args, *, input_body=None):
        result = command([*prefix, *args], body=input_body)
        try:
            value = result.stdout.strip().decode("ascii")
        except UnicodeError:
            raise RuntimeError("GitObjectUnavailable") from None
        if result.returncode or not HEX.fullmatch(value):
            raise RuntimeError("GitObjectUnavailable")
        return value

    try:
        top = command([*prefix, "rev-parse", "--show-toplevel"])
        if top.returncode or top.stdout.strip() != root.encode():
            raise RuntimeError("GitRootUnknown")
        tracked = command([*prefix, "ls-files", "--error-unmatch", "--", base.COMPOSE.name])
        if tracked.returncode or tracked.stdout.strip() != base.COMPOSE.name.encode():
            raise RuntimeError("GitPathUnknown")
        head = exact_oid(["rev-parse", "--verify", "HEAD^{commit}"])
        head_blob = exact_oid(["rev-parse", "--verify", "HEAD:" + base.COMPOSE.name])
        index_blob = exact_oid(["rev-parse", "--verify", ":" + base.COMPOSE.name])
        working_blob = exact_oid(["hash-object", "--stdin"], input_body=body)
        status = command([*prefix, "status", "--porcelain=v1",
                          "--untracked-files=no", "--", base.COMPOSE.name])
        if status.returncode:
            raise RuntimeError("GitStatusUnavailable")
    except Exception:
        return {"gitClass": "UNAVAILABLE", "headCommit": None,
                "headBlob": None, "indexBlob": None, "workingBlob": None,
                "trackedClean": False, "headIndexSame": False,
                "indexWorkingSame": False}
    clean = status.stdout == b""
    head_index = head_blob == index_blob
    index_working = index_blob == working_blob
    return {"gitClass": "EXACT_CLEAN" if clean and head_index and index_working else "DIRTY",
            "headCommit": head, "headBlob": head_blob,
            "indexBlob": index_blob, "workingBlob": working_blob,
            "trackedClean": clean, "headIndexSame": head_index,
            "indexWorkingSame": index_working}


def selected_network_id():
    """List only the literal name and never project other network names."""
    selector = '{{if eq .Name "vega-edge"}}{{.ID}}{{end}}'
    result = command(["docker", "network", "ls", "--filter", "name=vega-edge",
                      "--no-trunc", "--format", selector], limit=8192)
    if result.returncode:
        raise RuntimeError("NetworkListUnavailable")
    try:
        ids = [line.strip().decode("ascii") for line in result.stdout.splitlines()
               if line.strip()]
    except UnicodeError:
        raise RuntimeError("NetworkSelectionUnknown") from None
    if len(ids) > 1 or any(not re.fullmatch(r"[0-9a-f]{64}", item) for item in ids):
        raise RuntimeError("NetworkSelectionUnknown")
    return ids[0] if ids else None


def network_snapshot():
    """Distinguish one exact absent network from an unavailable Docker daemon."""
    try:
        listed = selected_network_id()
        target = listed or NETWORK
        result = command(["docker", "network", "inspect", "--format",
                          NETWORK_TEMPLATE, target], limit=2048)
        again = selected_network_id()
        if listed != again:
            raise RuntimeError("NetworkChanged")
        if listed is None:
            if result.returncode and result.stderr.strip() in MISSING_ERRORS:
                return {"networkClass": "MISSING_CONFIRMED", "networkId": None}
            raise RuntimeError("NetworkMissingUnproved")
        if result.returncode:
            raise RuntimeError("NetworkInspectUnavailable")
        value = json.loads(result.stdout)
        if not isinstance(value, dict) or set(value) != {
                "id", "name", "driver", "scope", "internal"} or value["id"] != listed:
            raise RuntimeError("NetworkIdentityUnknown")
        if value != {"id": listed, "name": NETWORK, "driver": "bridge",
                     "scope": "local", "internal": False}:
            return {"networkClass": "OTHER", "networkId": None}
        return {"networkClass": "EXISTING_EXPECTED", "networkId": listed}
    except Exception:
        return {"networkClass": "UNAVAILABLE", "networkId": None}


def file_identity(info):
    return (info.st_dev, info.st_ino, info.st_uid, info.st_gid, info.st_mode,
            info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def projected():
    body, info = base.read_compose()
    candidate = base.candidate(body)
    selected = base.selected_container()
    git = git_snapshot(body)
    network = network_snapshot()
    final_body, final_info = base.read_compose()
    if (body != final_body or file_identity(info) != file_identity(final_info) or
            base.selected_container() != selected or git_snapshot(body) != git or
            network_snapshot() != network):
        raise RuntimeError("SnapshotChanged")
    return {"status": "PROJECTED", "composeBaseMatches": base.digest(body) == base.BASE_SHA,
            "candidateSha256": base.digest(candidate),
            "composeMode": stat.S_IMODE(info.st_mode), "composeRegular": True,
            **selected, **git, **network,
            "remoteWrites": False, "privateValuesExported": False}


def main():
    try:
        if len(sys.argv) != 1:
            raise RuntimeError("ArgsUnknown")
        result = projected()
    except Exception:
        result = {"status": "STOP_READ_UNAVAILABLE", "remoteWrites": False,
                  "privateValuesExported": False}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] == "PROJECTED" else 2


if __name__ == "__main__":
    sys.exit(main())
