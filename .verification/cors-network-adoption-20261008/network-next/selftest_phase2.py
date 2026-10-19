"""Offline negative and closed-schema checks for the scoped edge phase-2 reader."""

import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import remote_edge_read as edge_base
sys.modules["edge_base"] = edge_base
import remote_edge_phase2 as remote
import run_edge_phase2 as wrapper


class PhaseTwoTests(unittest.TestCase):
    def test_network_missing_requires_exact_error_and_two_empty_lists(self):
        missing = subprocess.CompletedProcess([], 1, stdout=b"",
                                              stderr=b"Error: No such network: vega-edge\n")
        with patch.object(remote, "selected_network_id", side_effect=[None, None]), \
                patch.object(remote, "command", return_value=missing):
            self.assertEqual(remote.network_snapshot(),
                             {"networkClass": "MISSING_CONFIRMED", "networkId": None})
        unknown = subprocess.CompletedProcess([], 1, stdout=b"", stderr=b"private failure")
        with patch.object(remote, "selected_network_id", side_effect=[None, None]), \
                patch.object(remote, "command", return_value=unknown):
            self.assertEqual(remote.network_snapshot(),
                             {"networkClass": "UNAVAILABLE", "networkId": None})
        with patch.object(remote, "selected_network_id", side_effect=[None, "a" * 64]), \
                patch.object(remote, "command", return_value=missing):
            self.assertEqual(remote.network_snapshot()["networkClass"], "UNAVAILABLE")

    def test_existing_network_keeps_exact_id_only_with_expected_attributes(self):
        network_id = "a" * 64
        body = {"id": network_id, "name": "vega-edge", "driver": "bridge",
                "scope": "local", "internal": False}
        response = subprocess.CompletedProcess([], 0, stdout=json.dumps(body).encode(),
                                               stderr=b"")
        with patch.object(remote, "selected_network_id", side_effect=[network_id, network_id]), \
                patch.object(remote, "command", return_value=response):
            self.assertEqual(remote.network_snapshot(),
                             {"networkClass": "EXISTING_EXPECTED", "networkId": network_id})
        body["internal"] = True
        response = subprocess.CompletedProcess([], 0, stdout=json.dumps(body).encode(),
                                               stderr=b"")
        with patch.object(remote, "selected_network_id", side_effect=[network_id, network_id]), \
                patch.object(remote, "command", return_value=response):
            self.assertEqual(remote.network_snapshot(),
                             {"networkClass": "OTHER", "networkId": None})

    def test_selector_rejects_ambiguous_or_noncanonical_network_ids(self):
        selected = subprocess.CompletedProcess([], 0, stdout=(b"\n" + b"a" * 64 + b"\n"),
                                               stderr=b"")
        with patch.object(remote, "command", return_value=selected):
            self.assertEqual(remote.selected_network_id(), "a" * 64)
        for payload in (b"a" * 64 + b"\n" + b"b" * 64 + b"\n", b"private-name\n"):
            selected = subprocess.CompletedProcess([], 0, stdout=payload, stderr=b"")
            with patch.object(remote, "command", return_value=selected):
                with self.assertRaises(RuntimeError):
                    remote.selected_network_id()

    def test_projected_rejects_changed_network_or_git_snapshot(self):
        info = type("Info", (), {key: 1 for key in (
            "st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_size",
            "st_mtime_ns", "st_ctime_ns")})()
        selected = {"idMatches": True, "imageMatches": True, "running": True,
                    "composeSourceClass": "EXACT", "edgeMember": True,
                    "vegaEdgeMember": False, "otherNetworkCount": 0}
        git = {"gitClass": "EXACT_CLEAN"}
        missing = {"networkClass": "MISSING_CONFIRMED", "networkId": None}
        existing = {"networkClass": "EXISTING_EXPECTED", "networkId": "a" * 64}
        with patch.object(remote.base, "read_compose", side_effect=[(b"known", info)] * 2), \
                patch.object(remote.base, "candidate", return_value=b"candidate"), \
                patch.object(remote.base, "selected_container", return_value=selected), \
                patch.object(remote, "git_snapshot", return_value=git), \
                patch.object(remote, "network_snapshot", side_effect=[missing, existing]):
            with self.assertRaisesRegex(RuntimeError, "SnapshotChanged"):
                remote.projected()
        with patch.object(remote.base, "read_compose", side_effect=[(b"known", info)] * 2), \
                patch.object(remote.base, "candidate", return_value=b"candidate"), \
                patch.object(remote.base, "selected_container", return_value=selected), \
                patch.object(remote, "git_snapshot", side_effect=[git, {"gitClass": "DIRTY"}]), \
                patch.object(remote, "network_snapshot", return_value=missing):
            with self.assertRaisesRegex(RuntimeError, "SnapshotChanged"):
                remote.projected()

    def test_git_snapshot_uses_only_known_path_and_suppresses_status_body(self):
        calls = []
        def command(argv, *, body=None, limit=1024, timeout=15):
            calls.append((argv, body))
            last = argv[-1]
            stdout = (b"/srv/edge\n" if last == "--show-toplevel" else
                      b"compose.yml\n" if last == "compose.yml" and "ls-files" in argv else
                      b"" if "status" in argv else
                      b"b" * 40 + b"\n" if last == "HEAD^{commit}" else
                      b"a" * 40 + b"\n")
            return subprocess.CompletedProcess(argv, 0, stdout=stdout, stderr=b"")
        with patch.object(remote, "command", side_effect=command):
            result = remote.git_snapshot(b"known compose")
        self.assertEqual(result["gitClass"], "EXACT_CLEAN")
        self.assertTrue(result["trackedClean"])
        self.assertTrue(all("--no-optional-locks" in argv for argv, _ in calls))
        self.assertTrue(any(body == b"known compose" for _, body in calls))
        self.assertNotIn("known compose", repr(result))

    def test_wrapper_rejects_private_fields_and_unproved_network_id(self):
        value = {"status": "PROJECTED", "composeBaseMatches": True,
                 "candidateSha256": wrapper.CANDIDATE_SHA, "composeMode": 0o664,
                 "composeRegular": True, "gitClass": "EXACT_CLEAN",
                 "headCommit": "b" * 40, "headBlob": "a" * 40,
                 "indexBlob": "a" * 40, "workingBlob": "a" * 40,
                 "trackedClean": True, "headIndexSame": True,
                 "indexWorkingSame": True, "networkClass": "MISSING_CONFIRMED",
                 "networkId": None, "idMatches": True, "imageMatches": True,
                 "running": True, "composeSourceClass": "EXACT",
                 "edgeMember": True, "vegaEdgeMember": False,
                 "otherNetworkCount": 0, "remoteWrites": False,
                 "privateValuesExported": False}
        self.assertTrue(wrapper.valid(value, 0))
        self.assertFalse(wrapper.valid({**value, "private": "payload"}, 0))
        self.assertFalse(wrapper.valid({**value, "networkId": "a" * 64}, 0))
        existing = {**value, "networkClass": "EXISTING_EXPECTED",
                    "networkId": "c" * 64}
        self.assertTrue(wrapper.valid(existing, 0))


if __name__ == "__main__":
    unittest.main()
