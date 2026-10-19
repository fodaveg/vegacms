"""Offline negative checks; no Docker, SSH, or production files."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import remote_edge_read as edge_base
sys.modules["edge_base"] = edge_base
import remote_edge_phase2 as edge_phase2
sys.modules["edge_phase2"] = edge_phase2
import remote_edge_apply_candidate as apply
import run_edge_apply_candidate as wrapper


class EdgeCandidateTests(unittest.TestCase):
    def test_network_owner_and_only_known_member(self):
        network_id = "a" * 64
        value = {"id": network_id, "name": "vega-edge", "driver": "bridge",
                 "scope": "local", "internal": False, "owner": "owned",
                 "memberCount": 1, "caddyMember": True}
        response = subprocess.CompletedProcess([], 0, json.dumps(value).encode(), b"")
        with patch.object(apply, "checked", return_value=response.stdout):
            self.assertEqual(apply.network_details(network_id, "owned"),
                             {edge_base.CONTAINER_ID})
        for change in ({"owner": "other"}, {"memberCount": 2}, {"internal": True}):
            response = subprocess.CompletedProcess([], 0,
                                                   json.dumps({**value, **change}).encode(), b"")
            with patch.object(apply, "checked", return_value=response.stdout):
                with self.assertRaises(RuntimeError):
                    apply.network_details(network_id, "owned")

    def test_installed_git_guard_rejects_foreign_head_or_working_blob(self):
        body = b"candidate"
        blob = hashlib.sha1(b"blob 9\0candidate").hexdigest()
        value = {"gitClass": "DIRTY", "headCommit": apply.EXPECTED_HEAD,
                 "headBlob": apply.EXPECTED_BLOB, "indexBlob": apply.EXPECTED_BLOB,
                 "workingBlob": blob, "trackedClean": False}
        with patch.object(edge_phase2, "git_snapshot", return_value=value):
            apply.git_installed_guard(body)
        for change in ({"headCommit": "f" * 40}, {"workingBlob": "f" * 40}):
            with patch.object(edge_phase2, "git_snapshot", return_value={**value, **change}):
                with self.assertRaises(RuntimeError):
                    apply.git_installed_guard(body)

    def test_preflight_requires_fresh_network_absence(self):
        with patch.object(edge_base, "read_compose", side_effect=RuntimeError("stop")):
            with self.assertRaises(RuntimeError):
                apply.preflight()
        info = type("Info", (), {key: 1 for key in (
            "st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_size",
            "st_mtime_ns", "st_ctime_ns")})()
        with patch.object(edge_base, "read_compose", return_value=(b"old", info)), \
                patch.object(edge_base, "candidate", return_value=b"new"), \
                patch.object(apply, "digest", side_effect=lambda body:
                             apply.EXPECTED_CANDIDATE if body == b"new" else "other"), \
                patch.object(apply, "git_guard"), patch.object(apply, "caddy_guard"), \
                patch.object(edge_phase2, "network_snapshot", return_value={
                    "networkClass": "UNAVAILABLE", "networkId": None}):
            with self.assertRaisesRegex(RuntimeError, "NetworkNotMissing"):
                apply.preflight()

    def test_foreign_compose_edit_is_never_replaced(self):
        with tempfile.TemporaryDirectory(dir="/private/tmp") as folder:
            path = Path(folder) / "compose.yml"
            path.write_bytes(b"old")
            with patch.object(edge_base, "COMPOSE", path):
                _, original_info = edge_base.read_compose()
                path.write_bytes(b"foreign")
                with self.assertRaisesRegex(RuntimeError, "ComposeChanged"):
                    apply.replace_compose(b"old", original_info, b"new",
                                          "a" * 64, "owned", lambda _: None)
                self.assertEqual(path.read_bytes(), b"foreign")

    def test_foreign_edit_during_install_guard_stays_intact(self):
        with tempfile.TemporaryDirectory(dir="/private/tmp") as folder:
            path = Path(folder) / "compose.yml"
            path.write_bytes(b"old")
            with patch.object(edge_base, "COMPOSE", path):
                _, original_info = edge_base.read_compose()
                def foreign_edit(_):
                    path.write_bytes(b"foreign")
                with patch.object(apply, "git_guard"), \
                        patch.object(apply, "caddy_guard"), \
                        patch.object(apply, "network_guard"):
                    with self.assertRaisesRegex(RuntimeError, "ComposeChanged"):
                        apply.replace_compose(b"old", original_info, b"new",
                                              "a" * 64, "owned", foreign_edit)
                self.assertEqual(path.read_bytes(), b"foreign")

    def test_foreign_edit_after_git_guard_stays_intact(self):
        with tempfile.TemporaryDirectory(dir="/private/tmp") as folder:
            path = Path(folder) / "compose.yml"
            path.write_bytes(b"old")
            with patch.object(edge_base, "COMPOSE", path):
                _, original_info = edge_base.read_compose()
                def foreign_edit(_):
                    path.write_bytes(b"foreign")
                with patch.object(apply, "git_guard", side_effect=foreign_edit), \
                        patch.object(apply, "caddy_guard"), \
                        patch.object(apply, "network_guard"):
                    with self.assertRaisesRegex(RuntimeError, "ComposeChanged"):
                        apply.replace_compose(b"old", original_info, b"new",
                                              "a" * 64, "owned", lambda _: None)
                self.assertEqual(path.read_bytes(), b"foreign")

    def test_replaced_temporary_file_is_not_deleted(self):
        with tempfile.TemporaryDirectory(dir="/private/tmp") as folder:
            path = Path(folder) / "compose.yml"
            path.write_bytes(b"old")
            with patch.object(edge_base, "COMPOSE", path):
                _, original_info = edge_base.read_compose()
                def alien_replacement(_):
                    temporary, = Path(folder).glob("compose.yml.vega-edge-*")
                    temporary.unlink()
                    temporary.write_bytes(b"alien")
                with patch.object(apply, "git_guard"), \
                        patch.object(apply, "caddy_guard"), \
                        patch.object(apply, "network_guard"):
                    with self.assertRaisesRegex(RuntimeError, "ComposeChanged"):
                        apply.replace_compose(b"old", original_info, b"new",
                                              "a" * 64, "owned", alien_replacement)
                self.assertEqual(path.read_bytes(), b"old")
                temporary, = Path(folder).glob("compose.yml.vega-edge-*")
                self.assertEqual(temporary.read_bytes(), b"alien")

    def test_network_actions_reject_compose_drift_during_last_guards(self):
        for action in ("connect", "disconnect", "remove"):
            with self.subTest(action=action), tempfile.TemporaryDirectory(dir="/private/tmp") as folder:
                path = Path(folder) / "compose.yml"
                path.write_bytes(b"known")
                with patch.object(edge_base, "COMPOSE", path):
                    _, info = edge_base.read_compose()
                    def foreign_edit(*_):
                        path.write_bytes(b"foreign")
                    with patch.object(apply, "git_guard"), \
                            patch.object(apply, "git_installed_guard"), \
                            patch.object(apply, "caddy_guard"), \
                            patch.object(apply, "network_guard", side_effect=foreign_edit), \
                            patch.object(apply, "checked") as command:
                        with self.assertRaisesRegex(RuntimeError, "ComposeChanged"):
                            args = ("a" * 64, "owned", b"known",
                                    edge_phase2.file_identity(info))
                            if action == "connect":
                                apply.connect_owned(*args)
                            elif action == "disconnect":
                                apply.disconnect_owned(*args)
                            else:
                                apply.remove_owned(*args)
                    command.assert_not_called()
                    self.assertEqual(path.read_bytes(), b"foreign")

    def test_rollback_resumes_own_removed_network(self):
        original = b"old"
        candidate = b"new"
        info = type("Info", (), {key: 1 for key in (
            "st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_size",
            "st_mtime_ns", "st_ctime_ns")})()
        identity = edge_phase2.file_identity(info)
        state = {"owner": "edge-" + "b" * 32, "caddyId": edge_base.CONTAINER_ID,
                 "oldComposeSha": edge_base.BASE_SHA,
                 "newComposeSha": apply.EXPECTED_CANDIDATE,
                 "phase": "REMOVE_PENDING", "networkId": "a" * 64,
                 "restoredComposeIdentity": identity}
        source = {"state.json": json.dumps(state).encode(), "compose.old": original,
                  "compose.new": candidate}
        with tempfile.TemporaryDirectory(dir="/private/tmp") as folder:
            saves = []
            with patch.object(apply, "open_backup", side_effect=lambda _: os.open(folder, os.O_RDONLY)), \
                    patch.object(apply, "read_saved", side_effect=lambda _, name, *a: source[name]), \
                    patch.object(apply, "digest", side_effect=lambda body:
                                 edge_base.BASE_SHA if body == original else
                                 apply.EXPECTED_CANDIDATE), \
                    patch.object(edge_base, "candidate", return_value=candidate), \
                    patch.object(edge_base, "read_compose", return_value=(original, info)), \
                    patch.object(edge_phase2, "selected_network_id", return_value=None), \
                    patch.object(edge_phase2, "network_snapshot", return_value={
                        "networkClass": "MISSING_CONFIRMED", "networkId": None}), \
                    patch.object(apply, "git_guard"), patch.object(apply, "caddy_guard"), \
                    patch.object(apply, "rollback_final_guard"), \
                    patch.object(apply, "save_state", side_effect=lambda _, value:
                                 saves.append(value["phase"])), \
                    patch.object(apply, "checked") as operation:
                result = apply.rollback("edge-" + "a" * 24)
            self.assertEqual(result["status"], "EDGE_PARTIAL_ROLLED_BACK")
            self.assertEqual(saves, ["ROLLED_BACK"])
            operation.assert_not_called()

    def test_rollback_resumes_own_disconnect_or_restore_boundary(self):
        original, candidate = b"old", b"new"
        info = type("Info", (), {key: 1 for key in (
            "st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_size",
            "st_mtime_ns", "st_ctime_ns")})()
        identity = edge_phase2.file_identity(info)
        for phase in ("DISCONNECT_PENDING", "RESTORE_PENDING"):
            with self.subTest(phase=phase), tempfile.TemporaryDirectory(dir="/private/tmp") as folder:
                state = {"owner": "edge-" + "b" * 32, "caddyId": edge_base.CONTAINER_ID,
                         "oldComposeSha": edge_base.BASE_SHA,
                         "newComposeSha": apply.EXPECTED_CANDIDATE,
                         "phase": phase, "networkId": "a" * 64,
                         "restoredComposeIdentity": identity,
                         "plannedRestoreInode": [info.st_dev, info.st_ino],
                         "oldComposeIdentity": identity}
                source = {"state.json": json.dumps(state).encode(),
                          "compose.old": original, "compose.new": candidate}
                saves = []
                with patch.object(apply, "open_backup", side_effect=lambda _: os.open(folder, os.O_RDONLY)), \
                        patch.object(apply, "read_saved", side_effect=lambda _, name, *a: source[name]), \
                        patch.object(apply, "digest", side_effect=lambda body:
                                     edge_base.BASE_SHA if body == original else
                                     apply.EXPECTED_CANDIDATE), \
                        patch.object(edge_base, "candidate", return_value=candidate), \
                        patch.object(edge_base, "read_compose", return_value=(original, info)), \
                        patch.object(edge_phase2, "selected_network_id", return_value="a" * 64), \
                        patch.object(edge_phase2, "network_snapshot", return_value={
                            "networkClass": "MISSING_CONFIRMED", "networkId": None}), \
                        patch.object(apply, "network_details", return_value=set()), \
                        patch.object(apply, "network_guard"), \
                        patch.object(apply, "git_guard"), patch.object(apply, "caddy_guard"), \
                        patch.object(apply, "source_guard"), \
                        patch.object(apply, "rollback_final_guard"), \
                        patch.object(apply, "save_state", side_effect=lambda _, value:
                                     saves.append(value["phase"])), \
                        patch.object(apply, "checked", return_value=b"") as operation:
                    result = apply.rollback("edge-" + "a" * 24)
                self.assertEqual(result["status"], "EDGE_PARTIAL_ROLLED_BACK")
                self.assertEqual([call.args[0][2] for call in operation.call_args_list], ["rm"])
                self.assertEqual(saves[-1], "ROLLED_BACK")

    def test_transport_schema_rejects_private_fields_and_unowned_ids(self):
        success = {"status": "CADDY_ATTACHED_PARTIAL", "backupId": "edge-" + "a" * 24,
                   "networkId": "b" * 64, "composeSha": wrapper.CANDIDATE_SHA,
                   "caddyId": wrapper.CADDY_ID, "remoteWrites": True,
                   "privateValuesExported": False}
        self.assertTrue(wrapper.valid(success, 0, "apply", None))
        self.assertFalse(wrapper.valid({**success, "raw": "private"}, 0, "apply", None))
        self.assertFalse(wrapper.valid({**success, "networkId": "unknown"}, 0,
                                       "apply", None))
        self.assertTrue(wrapper.valid({"status": "STOP_NEEDS_OPERATOR",
                                       "backupId": "edge-" + "a" * 24,
                                       "remoteWrites": True,
                                       "privateValuesExported": False}, 2,
                                      "apply", None))
        self.assertTrue(wrapper.valid({"status": "EDGE_PARTIAL_ROLLED_BACK",
                                       "backupId": "edge-" + "a" * 24,
                                       "remoteWrites": True,
                                       "privateValuesExported": False}, 0,
                                      "rollback", "edge-" + "a" * 24))


if __name__ == "__main__":
    unittest.main()
