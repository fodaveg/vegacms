"""Read only the selected Lumbre CORS cutover state after a guarded STOP."""

import json
from pathlib import Path
import re
import stat
import sys

import image_helpers as h
import cors_apply as c

NAME = "lumbre-admin-pb"
BACKUP_ID = "lumbre-admin-pb-20261008T223304Z-3566962"
HEX = re.compile(r"[0-9a-f]{64}\Z")


def projected():
    spec = c.SPECS[NAME]
    backup = c.ROOT / BACKUP_ID
    if backup.is_symlink() or not backup.is_dir() or \
            stat.S_IMODE(backup.stat().st_mode) != 0o700:
        raise RuntimeError("BackupUnknown")
    body, state_stat = c.read_file(backup / "state.json")
    if len(body) > 32768:
        raise RuntimeError("StateOversize")
    state = json.loads(body)
    if (not isinstance(state, dict) or state.get("service") != NAME or
            state.get("oldComposeSha") != spec["base"] or
            state.get("newComposeSha") != spec["target"] or
            state.get("imageId") != spec["imageId"] or
            state.get("oldContainerId") != spec["containerId"] or
            state.get("status") not in ("PREPARED", "INSTALLED", "CREATED",
                                        "AWAITING_PUBLIC_SMOKE", "ROLLBACK_COMPOSE_INSTALLED",
                                        "ROLLBACK_CREATED", "ROLLED_BACK") or
            state.get("newContainerId") is not None and
            (not isinstance(state["newContainerId"], str) or
             not HEX.fullmatch(state["newContainerId"])) or
            state.get("rollbackContainerId") is not None and
            (not isinstance(state["rollbackContainerId"], str) or
             not HEX.fullmatch(state["rollbackContainerId"]))):
        raise RuntimeError("StateUnknown")
    compose, compose_stat = c.read_file(spec["compose"])
    env, env_stat = c.read_file(spec["env"])
    compose_sha = c.digest(compose)
    compose_class = ("BASE" if compose_sha == spec["base"] else
                     "TARGET" if compose_sha == spec["target"] else "OTHER")
    env_matches = c.digest(env) == state.get("envSha") and \
        c.identity(env_stat) == state.get("envIdentity")
    installed_identity = state.get("installedComposeIdentity")
    compose_owned = compose_class == "TARGET" and \
        isinstance(installed_identity, list) and \
        c.identity(compose_stat) == installed_identity
    rollback_identity = state.get("rollbackComposeIdentity")
    rollback_compose_owned = compose_class == "BASE" and \
        isinstance(rollback_identity, list) and c.identity(compose_stat) == rollback_identity
    selected = "UNAVAILABLE"
    running = None
    image_ok = command = labels_ok = mount_ok = aliases_ok = None
    network_class = "UNAVAILABLE"
    ports_empty = exposed_only = host_bindings_none = None
    try:
        selected_id = c.container_id(NAME)
        raw = c.inspect(NAME)
        running = h.is_running(NAME)
        if selected_id == state["oldContainerId"]:
            selected = "OLD"
        elif selected_id == state.get("newContainerId"):
            selected = "NEW"
        elif selected_id == state.get("rollbackContainerId"):
            selected = "ROLLBACK"
        else:
            selected = "OTHER"
        image_ok = raw["imageId"] == spec["imageId"] and raw["imageRef"] == spec["image"]
        command = ("BEFORE" if raw["cmd"] == c.command(NAME, spec, False) else
                   "AFTER" if raw["cmd"] == c.command(NAME, spec, True) else "OTHER")
        labels = json.loads(h.run(["docker", "inspect", "--format",
            '{"project":{{json (index .Config.Labels "com.docker.compose.project")}},'
            '"service":{{json (index .Config.Labels "com.docker.compose.service")}}}', NAME]))
        labels_ok = labels == {"project": spec["project"], "service": spec["service"]}
        expected = h.OLD_RUNTIME[NAME]
        mounts = raw["mounts"]
        normalized = sorted((m.get("type"), m.get("name") or None, m.get("dest"),
                             m.get("rw"), c.digest(m.get("source", "").encode()))
                            for m in mounts if isinstance(m, dict) and
                            isinstance(m.get("source"), str))
        mount_ok = len(normalized) == len(mounts) and normalized == sorted(expected["mounts"])
        ports_empty = raw["ports"] == {}
        networks = raw["networks"]
        network_class = ("ZERO" if len(networks) == 0 else "ONE_EDGE" if
                         len(networks) == 1 and networks[0].get("name") == "edge" else
                         "OTHER")
        aliases_ok = (sorted(networks[0].get("aliases", [])) ==
                      sorted(expected["aliases"])) if network_class == "ONE_EDGE" else None
        port_config = json.loads(h.run(["docker", "inspect", "--format",
            '{"exposed":{{json .Config.ExposedPorts}},'
            '"bindings":{{json .HostConfig.PortBindings}}}', NAME]))
        exposed_only = set(port_config["exposed"] or {}) == {"8090/tcp"}
        host_bindings_none = port_config["bindings"] in (None, {})
    except Exception:
        pass
    users = h.volume_running_containers(spec["volume"])
    users_class = ("NONE" if users == [] else "SELECTED" if users == [NAME]
                   else "OTHER")
    final_state, final_stat = c.read_file(backup / "state.json")
    final_compose, final_compose_stat = c.read_file(spec["compose"])
    final_env, final_env_stat = c.read_file(spec["env"])
    snapshot_stable = (final_state == body and c.identity(final_stat) == c.identity(state_stat)
                       and final_compose == compose and
                       c.identity(final_compose_stat) == c.identity(compose_stat) and
                       final_env == env and c.identity(final_env_stat) == c.identity(env_stat))
    if selected != "UNAVAILABLE":
        snapshot_stable = snapshot_stable and c.container_id(NAME) == selected_id
    return {"status": "PROJECTED", "backupId": BACKUP_ID, "phase": state["status"],
            "recordNewId": state.get("newContainerId"),
            "recordRollbackId": state.get("rollbackContainerId"),
            "composeClass": compose_class, "composeOwned": compose_owned,
            "rollbackComposeOwned": rollback_compose_owned,
            "envMatches": env_matches, "selection": selected, "running": running,
            "imageMatches": image_ok, "commandClass": command,
            "labelsMatch": labels_ok, "mountsMatch": mount_ok,
            "networkClass": network_class, "aliasesMatch": aliases_ok,
            "portsObservedEmpty": ports_empty, "exposed8090Only": exposed_only,
            "hostBindingsNone": host_bindings_none,
            "snapshotStable": snapshot_stable,
            "volumeUsers": users_class, "remoteWrites": False,
            "privateValuesExported": False}


def main():
    try:
        if len(sys.argv) != 1:
            raise RuntimeError("ArgsUnknown")
        result = projected()
    except Exception:
        result = {"status": "STOP_READ_UNAVAILABLE", "backupId": BACKUP_ID,
                  "remoteWrites": False, "privateValuesExported": False}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] == "PROJECTED" else 2


if __name__ == "__main__":
    sys.exit(main())
