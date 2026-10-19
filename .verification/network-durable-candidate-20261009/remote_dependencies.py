"""Closed reviewed dependency tuples; no probes outside the selected services."""
import json
import re
from pathlib import Path

import cors_apply as c
import edge_apply as edge
import edge_base as base

DEPENDENCIES = None
HEX = re.compile(r"[0-9a-f]{64}\Z")
PATHS = {"vega-pb": Path("/srv/vega/infra/production/compose.yml"),
         "lumbre-admin-pb": Path("/srv/lumbre-admin/compose.yml"),
         "fodaveg": Path("/root/fodaveg/compose.yml")}


def validate(value, *, source_required):
    """Reject drafts, missing consumer PASS and unreviewed mutable selectors."""
    if (not isinstance(value, dict) or set(value) != {"schema", "state", "cors", "caddy", "source"} or
            value["schema"] != 1 or value["state"] != "REVIEWED" or
            not isinstance(value["cors"], dict) or set(value["cors"]) != set(PATHS)):
        raise RuntimeError("DependenciesUnreviewed")
    for item in value["cors"].values():
        if (not isinstance(item, dict) or set(item) != {"status", "containerId", "imageId", "composeSha", "receiptSha"} or
                item["status"] != "PASS" or not HEX.fullmatch(item.get("containerId", "")) or
                not re.fullmatch(r"sha256:[0-9a-f]{64}", item.get("imageId", "")) or
                not HEX.fullmatch(item.get("composeSha", "")) or not HEX.fullmatch(item.get("receiptSha", ""))):
            raise RuntimeError("CORSDependencyUnknown")
    item = value["caddy"]
    if (not isinstance(item, dict) or set(item) != {"status", "containerId", "imageId", "preflightSha"} or
            item["status"] != "PASS" or item["containerId"] != base.CONTAINER_ID or
            item["imageId"] != base.IMAGE_ID or not HEX.fullmatch(item.get("preflightSha", ""))):
        raise RuntimeError("CaddyDependencyUnknown")
    source = value["source"]
    if source_required:
        if (not isinstance(source, dict) or set(source) != {"backupId", "head", "parent", "composeSha", "networkId", "receiptSha"} or
                not re.fullmatch(r"edge-[0-9a-f]{24}", source.get("backupId", "")) or
                not re.fullmatch(r"[0-9a-f]{40}", source.get("head", "")) or
                source["parent"] != edge.EXPECTED_HEAD or source["composeSha"] != edge.EXPECTED_CANDIDATE or
                not HEX.fullmatch(source.get("networkId", "")) or not HEX.fullmatch(source.get("receiptSha", ""))):
            raise RuntimeError("DurableDependencyUnknown")
    elif source is not None:
        raise RuntimeError("UnexpectedPublishedSource")
    return value


def guard(*, source_required, stock_stage=False):
    """Recheck ID/image/Compose tuples immediately before guarded operations."""
    value = validate(DEPENDENCIES, source_required=source_required)
    for name, path in PATHS.items():
        # During PB cutover its own approved adapter owns runtime/file guards;
        # other CORS consumers must remain pinned throughout apply/rollback.
        if stock_stage and name == "vega-pb":
            continue
        expected = value["cors"][name]
        template = '{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}}}'
        raw = json.loads(edge.checked(["docker", "inspect", "--format", template, name], limit=1024))
        if raw != {"id": expected["containerId"], "image": expected["imageId"], "running": True}:
            raise RuntimeError("CORSRuntimeDependencyChanged")
        body, _ = c.read_file(path)
        if base.digest(body) != expected["composeSha"]:
            raise RuntimeError("CORSComposeDependencyChanged")
    edge.caddy_guard(attached=True)
    return value
