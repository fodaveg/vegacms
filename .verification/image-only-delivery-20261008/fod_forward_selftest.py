"""Local forward recovery ordering/privacy tests; no Docker or SSH."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


remote = load("remote_fod_forward_recovery")
wrapper = load("run_fod_forward_recovery")


class RecoveryTests(unittest.TestCase):
    def baseline(self):
        return {"status": "DIAGNOSED", "running": False, "runningVolumeMountCount": 0,
                "snapshotSha256": remote.ORIGINAL_SNAPSHOT_SHA, **{key: True for key in remote.EXPECTED_BOOLEANS}}

    def test_private_early_failure_stops_without_start(self):
        with patch.object(remote, "main", side_effect=OSError("PRIVATE_SECRET")), \
                patch.object(remote, "run_long") as run:
            output = remote.recover_forward()
        run.assert_not_called()
        self.assertFalse(output["startAttempted"])
        self.assertFalse(output["remoteWrites"])
        self.assertNotIn("PRIVATE_SECRET", json.dumps(output))
        self.assertTrue(wrapper.valid(output))

    def test_snapshot_failure_never_starts_old_or_new_image(self):
        with patch.object(remote, "main", return_value=self.baseline()), \
                patch.object(remote, "preserve_postattempt", side_effect=RuntimeError("SnapshotUnavailable")), \
                patch.object(remote, "run_long") as run:
            output = remote.recover_forward()
        run.assert_not_called()
        self.assertFalse(output["startAttempted"])
        self.assertEqual(output["errorCode"], "SnapshotUnavailable")
        self.assertTrue(wrapper.valid(output))

    def test_changed_volume_writer_excludes_start(self):
        baseline = self.baseline()
        baseline["runningVolumeMountCount"] = 1
        with patch.object(remote, "main", return_value=baseline), \
                patch.object(remote, "preserve_postattempt") as preserve, \
                patch.object(remote, "run_long") as run:
            output = remote.recover_forward()
        preserve.assert_not_called()
        run.assert_not_called()
        self.assertEqual(output["errorCode"], "PrestartGuardRejected")
        self.assertFalse(output["startAttempted"])
        self.assertTrue(wrapper.valid(output))

    def test_start_rejection_never_restarts_old_or_restores_data(self):
        with patch.object(remote, "main", return_value=self.baseline()), \
                patch.object(remote, "preserve_postattempt", return_value={}), \
                patch.object(remote, "fresh_start_guard"), \
                patch.object(remote, "run_long", side_effect=RuntimeError("CommandRejected")) as run:
            output = remote.recover_forward()
        run.assert_called_once_with(["docker", "start", "fodaveg"], timeout=60)
        self.assertEqual(output["status"], "STOP_AFTER_START_ATTEMPT")
        self.assertFalse(output["oldImageStarted"])
        self.assertFalse(output["liveDataRestored"])
        self.assertTrue(wrapper.valid(output))

    def test_one_same_image_start_after_snapshot_and_no_stop_on_native_unhealthy(self):
        events = []
        def preserve():
            events.append("snapshot")
            return {"postattemptBackupDir": "/srv/vega-image-rollout/fodaveg-forward-preserve-20261008T200000Z-1",
                    "postattemptSnapshotSha256": "0" * 64, "postattemptSnapshotBytes": 1}
        def guard():
            events.append("guard")
        def run(argv, **kwargs):
            if argv == ["docker", "start", "fodaveg"]:
                events.append("start")
            else:
                self.assertNotIn("stop", argv)
            return b"{}"
        with patch.object(remote, "main", return_value=self.baseline()), \
                patch.object(remote, "preserve_postattempt", side_effect=preserve), \
                patch.object(remote, "fresh_start_guard", side_effect=guard), \
                patch.object(remote, "run_long", side_effect=run), \
                patch.object(remote, "runtime_projection", return_value={"running": True, "health": "unhealthy", "imageIsNew": True, "refIsNew": True}), \
                patch.object(remote, "public_http_status", return_value=200), \
                patch.object(remote, "process_projection", return_value={"pbProcessCount": 1, "pbArgvMatches": True, "nodeProcessCount": 1}):
            output = remote.recover_forward()
        self.assertEqual(events, ["snapshot", "guard", "start"])
        self.assertEqual(output["status"], "FORWARD_NATIVE_SMOKE_PASS_HEALTH_PENDING")
        self.assertFalse(output["oldImageStarted"])
        self.assertFalse(output["liveDataRestored"])
        self.assertTrue(wrapper.valid(output))
        self.assertFalse(wrapper.valid(dict(output, private="PRIVATE_SECRET")))


if __name__ == "__main__":
    unittest.main()
