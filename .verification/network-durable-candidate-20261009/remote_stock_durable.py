"""Reuse the frozen stock adapter with the new exact published-source guard."""
import json
import os
import re
import stat
import sys

import cors_apply as c
import edge_apply as edge
import edge_base as base
import edge_phase2 as phase2
import stock_frozen as stock
import edge_durable as durable
import network_dependencies as dependencies

RECOVERY_BACKUP_ID = None


def restored_on_edge(selected_pb):
    """Recognize only this rollback's recorded, healthy replacement on edge."""
    if RECOVERY_BACKUP_ID is None:
        return False
    backup = c.ROOT / RECOVERY_BACKUP_ID
    if backup.is_symlink() or not backup.is_dir() or stat.S_IMODE(backup.stat().st_mode) != 0o700:
        raise RuntimeError("BackupUnknown")
    body, _ = stock.h.read_private(backup / "state.json")
    record = json.loads(body)
    if not isinstance(record, dict) or record.get("status") not in {"ROLLBACK_CREATED", "ROLLED_BACK"}:
        return False
    if (record.get("service") != stock.NAME or record.get("oldContainerId") != stock.OLD_ID or
            not isinstance(record.get("newContainerId"), str) or
            not re.fullmatch(r"[0-9a-f]{64}", record["newContainerId"]) or
            record.get("newContainerId") == selected_pb or
            record.get("rollbackContainerId") != selected_pb or
            record.get("oldComposeSha") != stock.BASE_SHA or
            record.get("newComposeSha") != stock.TARGET_SHA or
            record.get("imageId") != stock.SPEC["imageId"]):
        raise RuntimeError("RollbackIdentityChanged")
    compose, info = c.read_file(stock.SPEC["compose"])
    if (c.digest(compose) != stock.BASE_SHA or
            c.identity(info) != record.get("rollbackComposeIdentity")):
        raise RuntimeError("RollbackSourceChanged")
    stock.runtime(stock.NAME, stock.SPEC, False, expected_id=selected_pb)
    return True


def edge_guard(*, pb_id=None, require_pb=None):
    """Pin the published receipt, complete commit guard and owned memberships."""
    expected = dependencies.guard(source_required=True, stock_stage=True)["source"]
    if stock.EDGE_BACKUP_ID != expected["backupId"]:
        raise RuntimeError("DurableBackupSelectorChanged")
    fd = edge.open_backup(expected["backupId"])
    try:
        state, old, new = durable.sealed_state(fd)
    finally:
        os.close(fd)
    if (state.get("durableHead") != expected["head"] or state.get("durableParent") != expected["parent"] or
            state.get("networkId") != expected["networkId"]):
        raise RuntimeError("DurableReceiptChanged")
    durable.published_guard(state, old, new)
    if phase2.selected_network_id() != expected["networkId"]:
        raise RuntimeError("EdgeNetworkChanged")
    selected_pb = pb_id or c.container_id(stock.NAME)
    running_replacement = (selected_pb != stock.OLD_ID and stock.h.is_running(stock.NAME)
                           if require_pb is None or RECOVERY_BACKUP_ID is not None else False)
    recovered = running_replacement and RECOVERY_BACKUP_ID is not None and restored_on_edge(selected_pb)
    if require_pb is None:
        require_pb = running_replacement and not recovered
    template = ('{"id":{{json .ID}},"name":{{json .Name}},"driver":{{json .Driver}},'
                '"scope":{{json .Scope}},"internal":{{json .Internal}},'
                '"owner":{{json (index .Labels "' + edge.OWNER_KEY + '")}},'
                '"count":{{len .Containers}},"caddy":{{if index .Containers "' + base.CONTAINER_ID + '"}}true{{else}}false{{end}},'
                '"pb":{{if index .Containers "' + selected_pb + '"}}true{{else}}false{{end}}}')
    raw = json.loads(edge.checked(["docker", "network", "inspect", "--format", template, expected["networkId"]], limit=2048))
    if (not isinstance(raw, dict) or type(raw.get("pb")) is not bool or raw != {
            "id": expected["networkId"], "name": "vega-edge", "driver": "bridge", "scope": "local",
            "internal": False, "owner": state["owner"], "count": 1 + int(raw["pb"]),
            "caddy": True, "pb": raw["pb"]} or (raw["pb"] and selected_pb == stock.OLD_ID)):
        raise RuntimeError("EdgeMembersChanged")
    if require_pb and not raw["pb"]:
        raise RuntimeError("RunningPBAbsentFromOwnedNetwork")
    if recovered and raw["pb"]:
        raise RuntimeError("RestoredPBUnexpectedOnOwnedNetwork")
    edge.source_guard(new, state["composeInstalledIdentity"])
    return expected["networkId"]


stock.edge_guard = edge_guard


def main():
    global RECOVERY_BACKUP_ID
    # Frozen main validates literal modes/IDs and returns its closed receipts.
    if (len(sys.argv) == 4 and sys.argv[1] == "rollback" and
            re.fullmatch(r"vega-pb-[0-9]{8}T[0-9]{6}Z-[0-9]+", sys.argv[3])):
        RECOVERY_BACKUP_ID = sys.argv[3]
    return stock.main()


if __name__ == "__main__":
    raise SystemExit(main())
