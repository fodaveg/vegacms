"""Local negative tests; never accesses Docker or SSH."""
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


remote = load("remote_fod_failure_readonly")
wrapper = load("run_fod_failure_readonly")


class DiagnosticTests(unittest.TestCase):
    def test_failure_before_first_normal_event_is_sanitized(self):
        with patch.object(remote.subprocess, "run", side_effect=OSError("PRIVATE_SECRET")):
            output = remote.main()
        self.assertEqual(output["errors"]["runtime"], "CommandUnavailable")
        self.assertNotIn("PRIVATE_SECRET", json.dumps(output))
        self.assertTrue(wrapper.valid(output))

    def test_early_timeout_retains_safe_failure_code(self):
        with patch.object(remote.subprocess, "run", side_effect=subprocess.TimeoutExpired("PRIVATE_SECRET", 30)):
            output = remote.main()
        self.assertEqual(output["errors"]["runtime"], "CommandTimeout")
        self.assertNotIn("PRIVATE_SECRET", json.dumps(output))
        self.assertTrue(wrapper.valid(output))

    def test_nonzero_stderr_is_never_projected(self):
        result = subprocess.CompletedProcess(["docker"], 1, b"PRIVATE_SECRET", b"PRIVATE_SECRET")
        with patch.object(remote.subprocess, "run", return_value=result):
            output = remote.main()
        self.assertEqual(output["errors"]["runtime"], "CommandNonzero")
        self.assertNotIn("PRIVATE_SECRET", json.dumps(output))

    def test_projection_rejects_unlisted_keys_and_private_errors(self):
        with patch.object(remote.subprocess, "run", side_effect=OSError("PRIVATE_SECRET")):
            output = remote.main()
        self.assertFalse(wrapper.valid(dict(output, unexpected="PRIVATE_SECRET")))
        self.assertFalse(wrapper.valid(dict(output, errors={"runtime": "PRIVATE_SECRET"})))
        self.assertFalse(wrapper.valid(dict(output, service="PRIVATE_SECRET")))

    def test_stopped_container_never_execs_and_distinguishes_exposed_ports(self):
        raw = {"imageId": remote.NEW_ID, "imageRef": remote.NEW_TAG, "entrypoint": remote.ENTRYPOINT,
               "cmd": None, "running": False, "state": "exited", "startedAt": "2026-10-08T20:05:00Z",
               "finishedAt": "2026-10-08T20:06:00Z", "exitCode": 0, "restartCount": 0,
               "health": None, "healthcheckPresent": False, "healthExitCodes": [], "ports": {},
               "exposedPorts": {"8090/tcp": {}, "4321/tcp": {}}, "mounts": [], "networks": []}
        def command(argv):
            self.assertNotIn("exec", argv)
            if argv[:2] == ["docker", "inspect"]:
                return json.dumps(raw).encode()
            if argv[:3] == ["docker", "image", "inspect"]:
                return json.dumps({"id": remote.NEW_ID, "healthcheckPresent": False}).encode()
            return b""
        with patch.object(remote, "run", side_effect=command), \
                patch.object(remote, "file_digest", return_value=("0" * 64, 1, 0o600)), \
                patch.object(remote, "compose_healthcheck_present", return_value=False):
            output = remote.main()
        self.assertEqual(output["processProbe"], "skipped-stopped")
        self.assertTrue(output["nativeHealthAbsent"])
        self.assertTrue(output["newImageHealthcheckAbsent"])
        self.assertFalse(output["containerHealthcheckPresent"])
        self.assertTrue(output["exposedPortsMatch"])
        self.assertFalse(output["portsMatch"])
        self.assertTrue(wrapper.valid(output))


if __name__ == "__main__":
    unittest.main()
