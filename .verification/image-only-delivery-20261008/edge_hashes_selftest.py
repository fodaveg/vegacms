"""Negative schema fixtures for the five-file hash-only edge gate."""

import unittest

import run_edge_hashes as wrapper


class EdgeHashTests(unittest.TestCase):
    def value(self):
        return {"status": "EDGE_UNCHANGED", "schemaVersion": 1,
                "matches": {name: True for name in wrapper.PATHS},
                "targetFileCount": 5, "remoteWrites": False,
                "configEnvRead": False, "fileBodiesProjected": False}

    def test_exact_five_booleans_pass(self):
        self.assertTrue(wrapper.valid(self.value(), 0))

    def test_missing_path_or_extra_body_fails(self):
        value = self.value()
        value["matches"].pop("/srv/edge/Caddyfile")
        self.assertFalse(wrapper.valid(value, 0))
        value = self.value()
        value["rawBody"] = "private"
        self.assertFalse(wrapper.valid(value, 0))

    def test_drift_requires_stop_code(self):
        value = self.value()
        value["status"] = "STOP_EDGE_DRIFT"
        value["matches"]["/srv/edge/Caddyfile"] = False
        self.assertTrue(wrapper.valid(value, 2))
        self.assertFalse(wrapper.valid(value, 0))


if __name__ == "__main__":
    unittest.main()
