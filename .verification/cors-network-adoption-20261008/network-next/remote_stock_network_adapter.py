"""Adapt the reviewed CORS volume cutover to Vega's dedicated network only."""

import hashlib
import json
import re
import sys

import cors_apply as c
import edge_apply as edge
import edge_base as base
import edge_phase2 as phase2
import image_helpers as h

NAME = "vega-pb"
BASE_SHA = "11593d1da51e580f988058bfac8288194eaeb7697ac7db2f6926815f8d14dcde"
TARGET_SHA = "50b1d28af027fc64e48788fbdc3b6e7703ea6d5420e8d2f94a0b3409dd86c08a"
OLD_ID = "007b755b8de76195d857181ce985a9522fe71c5d2941a2c1597b310d12d56881"
EDGE_BACKUP_ID = None

c.ROOT = c.Path("/srv/vega-network-rollout")
h.BACKUP_ROOT = c.ROOT
c.SPECS = {NAME: {**c.SPECS[NAME], "base": BASE_SHA, "target": TARGET_SHA,
                  "containerId": OLD_ID}}
SPEC = c.SPECS[NAME]
ORIGINAL_GATE_FILES = c.gate_files


def patch(name, spec, body):
    """Prove the sole stock network byte delta and its exact target digest."""
    before = b"    networks:\n      edge:\n        aliases:\n          - vega-pb\n"
    after = before.replace(b"      edge:\n", b"      vega-edge:\n", 1)
    root_before = b"networks:\n  edge:\n    external: true\n    name: edge\n"
    root_after = root_before + b"  vega-edge:\n    external: true\n    name: vega-edge\n"
    if (name != NAME or c.digest(body) != BASE_SHA or body.count(before) != 1 or
            body.count(root_before) != 1 or b"vega-edge" in body):
        raise RuntimeError("NetworkComposeBaseUnknown")
    candidate = body.replace(before, after, 1).replace(root_before, root_after, 1)
    if (c.digest(candidate) != TARGET_SHA or candidate.replace(after, before, 1)
            .replace(root_after, root_before, 1) != body):
        raise RuntimeError("NetworkComposeTargetUnknown")
    return candidate


def command(name, spec, after):
    if name != NAME:
        raise RuntimeError("ServiceUnknown")
    return h.OLD_RUNTIME[NAME]["cmd"] + ["--origins=" + spec["origin"]]


def edge_guard(*, pb_id=None, require_pb=None):
    """Bind the actual bridge to this cutover's Caddy-only owned stage."""
    if EDGE_BACKUP_ID is None:
        raise RuntimeError("EdgeBackupUnknown")
    fd = edge.open_backup(EDGE_BACKUP_ID)
    try:
        state = json.loads(edge.read_saved(fd, "state.json", 8192))
    finally:
        edge.os.close(fd)
    network_id = state.get("networkId") if isinstance(state, dict) else None
    owner = state.get("owner") if isinstance(state, dict) else None
    if (state.get("phase") != "CADDY_ATTACHED_PARTIAL" or
            not isinstance(network_id, str) or not edge.ID.fullmatch(network_id) or
            not isinstance(owner, str) or not re.fullmatch(r"edge-[0-9a-f]{32}", owner) or
            state.get("caddyId") != base.CONTAINER_ID or
            state.get("newComposeSha") != edge.EXPECTED_CANDIDATE):
        raise RuntimeError("EdgeOwnershipUnknown")
    compose, info = base.read_compose()
    if (base.digest(compose) != edge.EXPECTED_CANDIDATE or
            phase2.file_identity(info) != tuple(state.get("composeInstalledIdentity") or ())):
        raise RuntimeError("EdgeSourceChanged")
    edge.git_installed_guard(compose)
    edge.caddy_guard(attached=True)
    if phase2.selected_network_id() != network_id:
        raise RuntimeError("EdgeNetworkChanged")
    # Only selected IDs are tested by the template; no other member names or
    # addresses enter the Python result or the local receipt.
    selected_pb = pb_id or c.container_id(NAME)
    if require_pb is None:
        require_pb = selected_pb != OLD_ID and h.is_running(NAME)
    template = ('{"id":{{json .ID}},"name":{{json .Name}},'
                '"driver":{{json .Driver}},"scope":{{json .Scope}},'
                '"internal":{{json .Internal}},'
                '"owner":{{json (index .Labels "' + edge.OWNER_KEY + '")}},'
                '"count":{{len .Containers}},'
                '"caddy":{{if index .Containers "' + base.CONTAINER_ID +
                '"}}true{{else}}false{{end}},'
                '"pb":{{if index .Containers "' + selected_pb +
                '"}}true{{else}}false{{end}}}')
    value = json.loads(edge.checked(["docker", "network", "inspect", "--format",
                                     template, network_id], limit=2048))
    if not isinstance(value, dict) or value != {
            "id": network_id, "name": "vega-edge", "driver": "bridge",
            "scope": "local", "internal": False, "owner": owner,
            "count": 1 + int(bool(value.get("pb"))), "caddy": True,
            "pb": value.get("pb")} or type(value["pb"]) is not bool:
        raise RuntimeError("EdgeMembersChanged")
    # A stopped Compose-created PB may be omitted from network inspection;
    # when it appears, it must be precisely the selected ID.
    if value["pb"] and selected_pb == OLD_ID:
        raise RuntimeError("OldPBUnexpectedOnNewNetwork")
    if require_pb and not value["pb"]:
        raise RuntimeError("RunningPBAbsentFromOwnedNetwork")
    edge.source_guard(compose, state["composeInstalledIdentity"])
    return network_id


def gate_files(spec, compose_sha, compose_identity, env_sha, env_identity):
    edge_guard()
    ORIGINAL_GATE_FILES(spec, compose_sha, compose_identity, env_sha, env_identity)


def runtime(name, spec, after, baseline=None, expected_id=None,
            require_healthy=True, volume_users=None):
    """Retain CORS guards; vary only the selected network and stable argv."""
    raw = c.inspect(name)
    expected = h.OLD_RUNTIME[name]
    mounts, networks, ports = raw["mounts"], raw["networks"], raw["ports"]
    ports_match = (isinstance(ports, dict) and set(ports) == expected["ports"] and
                   all(value is None for value in ports.values()))
    if not ports_match and ports == {} and not require_healthy and not h.is_running(name):
        config = json.loads(h.run(["docker", "inspect", "--format",
            '{"exposed":{{json .Config.ExposedPorts}},'
            '"bindings":{{json .HostConfig.PortBindings}}}', name]))
        exposed = config.get("exposed") if isinstance(config, dict) else None
        ports_match = (isinstance(exposed, dict) and set(exposed) == expected["ports"] and
                       all(value == {} for value in exposed.values()) and
                       config.get("bindings") in (None, {}))
    if (not isinstance(mounts, list) or not isinstance(networks, list) or
            not isinstance(ports, dict) or not ports_match or len(networks) != 1 or
            networks[0].get("name") != ("vega-edge" if after else "edge") or
            sorted(networks[0].get("aliases", [])) != sorted(expected["aliases"])):
        raise RuntimeError("RuntimeTopologyDrift")
    normalized = sorted((m.get("type"), m.get("name") or None, m.get("dest"), m.get("rw"),
                         c.digest(m.get("source", "").encode())) for m in mounts
                        if isinstance(m, dict) and isinstance(m.get("source"), str))
    if len(normalized) != len(mounts) or normalized != sorted(expected["mounts"]):
        raise RuntimeError("RuntimeMountDrift")
    if (raw["imageId"] != spec["imageId"] or raw["imageRef"] != spec["image"] or
            raw["entrypoint"] != expected["entrypoint"] or raw["cmd"] != command(name, spec, after) or
            (require_healthy and (raw["health"] != "healthy" or
             c.pb_argv(name) != [expected["entrypoint"][0], *command(name, spec, after)]))):
        raise RuntimeError("RuntimeCommandDrift")
    baseline_ports_match = baseline is None or ports == baseline["ports"] or (
        ports == {} and ports_match and
        baseline["ports"] == {port: None for port in expected["ports"]})
    if baseline is not None and (not baseline_ports_match or
            any(raw[key] != baseline[key] for key in (
                "imageId", "imageRef", "entrypoint", "mounts")) or
            (not after and raw["networks"] != baseline["networks"])):
        raise RuntimeError("RuntimePeerDrift")
    selected = c.container_id(name)
    if expected_id is not None and selected != expected_id:
        raise RuntimeError("ContainerIdentityDrift")
    users = h.volume_running_containers(spec["volume"])
    if (volume_users is not None and users != volume_users) or \
            (volume_users is None and users != [name]):
        raise RuntimeError("OtherVolumeWriter")
    if after:
        network_id = edge_guard(pb_id=selected,
                                require_pb=require_healthy or h.is_running(name))
        linked = json.loads(h.run(["docker", "inspect", "--format",
            '{{with index .NetworkSettings.Networks "vega-edge"}}'
            '{{json .NetworkID}}{{else}}null{{end}}', name]))
        if linked != network_id:
            raise RuntimeError("RuntimeNetworkIdDrift")
    return selected, raw


c.patch = patch
c.command = command
c.runtime = runtime
c.gate_files = gate_files


def main():
    global EDGE_BACKUP_ID
    try:
        mode, edge_id, *rest = sys.argv[1:]
        if (mode not in {"check", "apply", "rollback"} or
                not re.fullmatch(r"edge-[0-9a-f]{24}", edge_id) or
                len(rest) != (1 if mode == "rollback" else 0) or
                (rest and not re.fullmatch(r"vega-pb-[0-9]{8}T[0-9]{6}Z-[0-9]+", rest[0]))):
            raise RuntimeError("ArgsUnknown")
        EDGE_BACKUP_ID = edge_id
        edge_guard()
        if mode == "check":
            state = c.preflight(NAME, SPEC)
            result = {"status": "NETWORK_READY_FOR_REVIEW", "remoteWrites": False,
                      "composeSha": BASE_SHA, "candidateSha": TARGET_SHA,
                      "imageId": SPEC["imageId"], "containerId": state["oldId"],
                      "volumeKiB": state["volumeKiB"], **state["budget"]}
        elif mode == "apply":
            result = c.apply(NAME, SPEC)
            if result["status"] == "CORS_APPLIED_AWAITING_PUBLIC_SMOKE":
                result["status"] = "NETWORK_APPLIED_AWAITING_PUBLIC_SMOKE"
        else:
            result = c.rollback(NAME, SPEC, rest[0])
            if result["status"] == "CORS_ROLLED_BACK_AWAITING_PUBLIC_SMOKE":
                result["status"] = "NETWORK_ROLLED_BACK_AWAITING_PUBLIC_SMOKE"
        result["edgeBackupId"] = edge_id
    except Exception:
        if (len(sys.argv) == 4 and sys.argv[1] == "rollback" and
                re.fullmatch(r"edge-[0-9a-f]{24}", sys.argv[2]) and
                re.fullmatch(r"vega-pb-[0-9]{8}T[0-9]{6}Z-[0-9]+", sys.argv[3])):
            result = {"status": "STOP_NETWORK_ROLLBACK_NEEDS_OPERATOR",
                      "remoteWrites": True, "edgeBackupId": sys.argv[2],
                      "backupId": sys.argv[3]}
        else:
            result = {"status": "STOP_NETWORK_UNKNOWN", "remoteWrites": len(sys.argv) > 1 and
                      sys.argv[1] != "check"}
    result["privateValuesExported"] = False
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] in {"NETWORK_READY_FOR_REVIEW",
        "NETWORK_APPLIED_AWAITING_PUBLIC_SMOKE",
        "NETWORK_ROLLED_BACK_AWAITING_PUBLIC_SMOKE"} else 2


if __name__ == "__main__":
    sys.exit(main())
