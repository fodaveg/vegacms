"""Negative projection fixtures for post-load read-only diagnosis."""

import json
import unittest
from unittest.mock import patch

import remote_load_residual as remote
import run_load_residual as wrapper


class ResidualTests(unittest.TestCase):
    def value(self):
        return {"status": "THREE_LOADED", "schemaVersion": 1, "remoteWrites": False,
                "archiveBytesMatch": True, "archiveSha256Match": True,
                "imageStates": {tag: "MATCH" for tag in wrapper.IMAGES},
                "dockerClientVersion": "28.3.2", "dockerServerVersion": "27.5.1",
                "freeSrvKiB": 1000000, "freeDockerKiB": 1000000,
                "sameFilesystem": True, "configEnvRead": False,
                "logsRead": False, "caddyRead": False}

    def test_exact_projection(self):
        self.assertTrue(wrapper.valid(self.value(), 0))
        value = self.value()
        value["rawError"] = "private"
        self.assertFalse(wrapper.valid(value, 0))

    def test_partial_load_requires_review(self):
        value = self.value()
        value["status"] = "RESIDUAL_REVIEW"
        value["imageStates"][next(iter(wrapper.IMAGES))] = "NOT_RESOLVED"
        self.assertTrue(wrapper.valid(value, 2))
        self.assertFalse(wrapper.valid(value, 0))

    def test_version_projection_only_semver(self):
        with patch.object(remote, "command", return_value=(0, b'"28.3.2"|"27.5.1"\n')):
            self.assertEqual(remote.versions(), ("28.3.2", "27.5.1"))
        with patch.object(remote, "command", return_value=(0, b'"private"|"27.5.1"\n')):
            with self.assertRaises(RuntimeError):
                remote.versions()

    def test_image_id_mismatch_is_not_match(self):
        with patch.object(remote, "command", return_value=(0, json.dumps("sha256:" + "f" * 64).encode())):
            states = remote.image_states()
        self.assertTrue(all(value == "WRONG_ID" for value in states.values()))


if __name__ == "__main__":
    unittest.main()
