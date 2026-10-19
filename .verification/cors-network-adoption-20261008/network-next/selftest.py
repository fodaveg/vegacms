"""Offline structure and closed-projection tests for the edge network reader."""

import hashlib
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import remote_edge_read as remote
import run_edge_read as wrapper


class EdgeReadTests(unittest.TestCase):
    def test_only_one_caddy_network_and_root_definition_added(self):
        before = (b"services:\n  caddy:\n    networks:\n      - edge\n"
                  b"networks:\n  edge:\n    external: true\n    name: edge\n")
        result = remote.candidate(before, hashlib.sha256(before).hexdigest())
        self.assertEqual(result.count(b"vega-edge"), 3)
        self.assertEqual(result.replace(remote.SERVICE_ANCHOR + b"      - vega-edge\n",
                                        remote.SERVICE_ANCHOR, 1).replace(
            remote.ROOT_ANCHOR + remote.NETWORK_BLOCK, remote.ROOT_ANCHOR, 1), before)
        with self.assertRaises(RuntimeError):
            remote.candidate(before, "0" * 64)
        with self.assertRaises(RuntimeError):
            remote.candidate(before + before, hashlib.sha256(before + before).hexdigest())

    def test_wrapper_requires_only_known_enums_and_no_extra_field(self):
        value = {"status": "PROJECTED", "composeBaseMatches": True,
                 "candidateSha256": "a" * 64, "composeMode": 0o640,
                 "composeRegular": True, "gitSourceClass": "TRACKED",
                 "networkClass": "EXPECTED", "idMatches": True,
                 "imageMatches": True, "running": True,
                 "composeSourceClass": "EXACT", "edgeMember": True,
                 "vegaEdgeMember": False, "otherNetworkCount": 0,
                 "remoteWrites": False, "privateValuesExported": False}
        self.assertTrue(wrapper.valid(value, 0))
        self.assertFalse(wrapper.valid({**value, "private": "data"}, 0))
        self.assertFalse(wrapper.valid({**value, "composeMode": 0o1000}, 0))
        self.assertFalse(wrapper.valid({**value, "networkClass": "private-name"}, 0))

    def test_selected_container_change_stops_mixed_snapshot(self):
        body = b"known"
        stat = type("Stat", (), {name: 1 for name in (
            "st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_size",
            "st_mtime_ns", "st_ctime_ns")})()
        with patch.object(remote, "read_compose", return_value=(body, stat)), \
                patch.object(remote, "candidate", return_value=b"candidate"), \
                patch.object(remote, "selected_container", side_effect=(
                    {"idMatches": True}, {"idMatches": False})), \
                patch.object(remote, "network_class", return_value="EXPECTED"), \
                patch.object(remote, "git_source_class", return_value="TRACKED"):
            with self.assertRaises(RuntimeError):
                remote.projected()


if __name__ == "__main__":
    unittest.main()
