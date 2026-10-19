"""Offline stock-network adapter checks; no Docker, SSH, or source writes."""

import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parent
sys.path[:0] = [str(BASE), str(BASE.parent / "apply"),
                str(BASE.parent.parent / "image-only-delivery-20261008")]
import remote_cutover as image_helpers
sys.modules["image_helpers"] = image_helpers
import remote_apply as cors_apply
sys.modules["cors_apply"] = cors_apply
import remote_edge_read as edge_base
sys.modules["edge_base"] = edge_base
import remote_edge_phase2 as edge_phase2
sys.modules["edge_phase2"] = edge_phase2
import remote_edge_apply_candidate as edge_apply
sys.modules["edge_apply"] = edge_apply
import remote_stock_network_adapter as remote
import run_stock_network_candidate as wrapper


class StockNetworkTests(unittest.TestCase):
    def test_exact_compose_delta_and_stable_origins_argv(self):
        old = (BASE / "stock-after-cors-preimage.compose.yml").read_bytes()
        new = (BASE / "stock-vega-edge.candidate.compose.yml").read_bytes()
        self.assertEqual(remote.patch(remote.NAME, remote.SPEC, old), new)
        self.assertEqual(remote.command(remote.NAME, remote.SPEC, False),
                         remote.command(remote.NAME, remote.SPEC, True))
        self.assertEqual(remote.command(remote.NAME, remote.SPEC, True)[-1],
                         "--origins=https://admin.vegacms.com")
        with self.assertRaises(RuntimeError):
            remote.patch(remote.NAME, remote.SPEC, old + b"foreign")

    def test_runtime_checks_new_network_id_and_preserves_mount_port_image(self):
        expected = image_helpers.OLD_RUNTIME[remote.NAME]
        raw = {"imageId": remote.SPEC["imageId"], "imageRef": remote.SPEC["image"],
               "entrypoint": expected["entrypoint"],
               "cmd": remote.command(remote.NAME, remote.SPEC, True),
               "health": "healthy", "ports": {"8090/tcp": None},
               "mounts": [{"type": "volume", "name": "vega_data",
                           "source": "known-source", "dest": "/pb/pb_data", "rw": True}],
               "networks": [{"name": "vega-edge", "aliases": expected["aliases"]}]}
        selected = "b" * 64
        with patch.object(cors_apply, "inspect", return_value=raw), \
                patch.object(cors_apply, "digest", return_value=expected["mounts"][0][-1]), \
                patch.object(cors_apply, "pb_argv", return_value=[
                    expected["entrypoint"][0], *raw["cmd"]]), \
                patch.object(cors_apply, "container_id", return_value=selected), \
                patch.object(image_helpers, "is_running", return_value=True), \
                patch.object(image_helpers, "volume_running_containers", return_value=[remote.NAME]), \
                patch.object(remote, "edge_guard", return_value="a" * 64), \
                patch.object(image_helpers, "run", return_value=json.dumps("a" * 64).encode()):
            self.assertEqual(remote.runtime(remote.NAME, remote.SPEC, True,
                                            expected_id=selected)[0], selected)
        with patch.object(cors_apply, "inspect", return_value={**raw,
                "networks": [{"name": "edge", "aliases": expected["aliases"]}]}):
            with self.assertRaisesRegex(RuntimeError, "RuntimeTopologyDrift"):
                remote.runtime(remote.NAME, remote.SPEC, True)
        with patch.object(cors_apply, "inspect", return_value=raw), \
                patch.object(cors_apply, "digest", return_value=expected["mounts"][0][-1]), \
                patch.object(cors_apply, "pb_argv", return_value=[
                    expected["entrypoint"][0], *raw["cmd"]]), \
                patch.object(cors_apply, "container_id", return_value=selected), \
                patch.object(image_helpers, "is_running", return_value=True), \
                patch.object(image_helpers, "volume_running_containers", return_value=[remote.NAME]), \
                patch.object(remote, "edge_guard", return_value="a" * 64), \
                patch.object(image_helpers, "run", return_value=json.dumps("c" * 64).encode()):
            with self.assertRaisesRegex(RuntimeError, "RuntimeNetworkIdDrift"):
                remote.runtime(remote.NAME, remote.SPEC, True, expected_id=selected)
        with patch.object(cors_apply, "inspect", return_value=raw), \
                patch.object(cors_apply, "digest", return_value=expected["mounts"][0][-1]), \
                patch.object(cors_apply, "pb_argv", return_value=[
                    expected["entrypoint"][0], *raw["cmd"]]), \
                patch.object(cors_apply, "container_id", return_value=selected), \
                patch.object(image_helpers, "is_running", return_value=True), \
                patch.object(image_helpers, "volume_running_containers", return_value=[remote.NAME]), \
                patch.object(remote, "edge_guard", side_effect=lambda **kw:
                             (_ for _ in ()).throw(RuntimeError("RunningPBAbsent"))
                             if kw.get("require_pb") else "a" * 64), \
                patch.object(image_helpers, "run", return_value=json.dumps("a" * 64).encode()):
            with self.assertRaisesRegex(RuntimeError, "RunningPBAbsent"):
                remote.runtime(remote.NAME, remote.SPEC, True, expected_id=selected)

    def test_transport_schema_rejects_private_fields_and_wrong_candidate(self):
        edge_id = "edge-" + "a" * 24
        ready = {"status": "NETWORK_READY_FOR_REVIEW", "remoteWrites": False,
                 "privateValuesExported": False, "edgeBackupId": edge_id,
                 "composeSha": wrapper.BASE_SHA, "candidateSha": wrapper.TARGET_SHA,
                 "imageId": wrapper.IMAGE_ID, "containerId": wrapper.OLD_ID,
                 "volumeKiB": 100, "freeSrvKiB": 10000, "freeDockerKiB": 10000,
                 "requiredSrvKiB": 100, "requiredDockerKiB": 100,
                 "sameFilesystem": True}
        self.assertTrue(wrapper.valid(ready, 0, "check", edge_id, None))
        self.assertFalse(wrapper.valid({**ready, "candidateSha": "f" * 64}, 0,
                                       "check", edge_id, None))
        self.assertFalse(wrapper.valid({**ready, "private": "hidden"}, 0,
                                       "check", edge_id, None))

    def test_edge_guard_rejects_foreign_network_membership(self):
        edge_id = "edge-" + "a" * 24
        remote.EDGE_BACKUP_ID = edge_id
        info = type("Info", (), {key: 1 for key in (
            "st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_size",
            "st_mtime_ns", "st_ctime_ns")})()
        state = {"phase": "CADDY_ATTACHED_PARTIAL", "networkId": "b" * 64,
                 "owner": "edge-" + "c" * 32, "caddyId": edge_base.CONTAINER_ID,
                 "newComposeSha": edge_apply.EXPECTED_CANDIDATE,
                 "composeInstalledIdentity": edge_phase2.file_identity(info)}
        expected = {"id": "b" * 64, "name": "vega-edge", "driver": "bridge",
                    "scope": "local", "internal": False, "owner": state["owner"],
                    "count": 1, "caddy": True, "pb": False}
        with tempfile.TemporaryDirectory(dir="/private/tmp") as folder:
            def operate(network, *, require_pb=None, pb_id=None):
                with patch.object(edge_apply, "open_backup", side_effect=lambda _: os.open(folder, os.O_RDONLY)), \
                        patch.object(edge_apply, "read_saved", return_value=json.dumps(state).encode()), \
                        patch.object(edge_base, "read_compose", return_value=(b"known", info)), \
                        patch.object(edge_base, "digest", return_value=edge_apply.EXPECTED_CANDIDATE), \
                        patch.object(edge_apply, "git_installed_guard"), \
                        patch.object(edge_apply, "caddy_guard"), \
                        patch.object(edge_apply, "source_guard"), \
                        patch.object(edge_phase2, "selected_network_id", return_value="b" * 64), \
                        patch.object(cors_apply, "container_id", return_value=remote.OLD_ID), \
                        patch.object(edge_apply, "checked", return_value=json.dumps(network).encode()):
                    return remote.edge_guard(require_pb=require_pb, pb_id=pb_id)
            self.assertEqual(operate(expected), "b" * 64)
            for change in ({"owner": "foreign"}, {"count": 2}, {"pb": True}):
                with self.subTest(change=change), self.assertRaises(RuntimeError):
                    operate({**expected, **change})
            # A newly selected PB may join, but still no third member.
            self.assertEqual(operate({**expected, "count": 2, "pb": True},
                                     require_pb=True, pb_id="d" * 64), "b" * 64)
            with self.assertRaisesRegex(RuntimeError, "RunningPBAbsent"):
                operate(expected, require_pb=True, pb_id="d" * 64)

    def test_transport_requires_exact_applied_and_rollback_receipts(self):
        edge_id = "edge-" + "a" * 24
        backup = "vega-pb-20261009T120000Z-1234"
        applied = {"status": "NETWORK_APPLIED_AWAITING_PUBLIC_SMOKE",
                   "service": "vega-pb", "remoteWrites": True,
                   "privateValuesExported": False, "edgeBackupId": edge_id,
                   "backupId": backup, "oldContainerId": wrapper.OLD_ID,
                   "newContainerId": "b" * 64, "composeSha": wrapper.TARGET_SHA,
                   "imageId": wrapper.IMAGE_ID, "archiveSha": "c" * 64,
                   "archiveBytes": 100, "restoredFiles": 1, "restoredBytes": 100}
        self.assertTrue(wrapper.valid(applied, 0, "apply", edge_id, None))
        self.assertFalse(wrapper.valid({**applied, "composeSha": wrapper.BASE_SHA},
                                       0, "apply", edge_id, None))
        rolled = {"status": "NETWORK_ROLLED_BACK_AWAITING_PUBLIC_SMOKE",
                  "service": "vega-pb", "remoteWrites": True,
                  "privateValuesExported": False, "edgeBackupId": edge_id,
                  "backupId": backup, "containerId": "d" * 64,
                  "composeSha": wrapper.BASE_SHA}
        self.assertTrue(wrapper.valid(rolled, 0, "rollback", edge_id, backup))
        self.assertFalse(wrapper.valid(rolled, 0, "rollback", edge_id,
                                       "vega-pb-20261009T120000Z-9999"))


if __name__ == "__main__":
    unittest.main()
