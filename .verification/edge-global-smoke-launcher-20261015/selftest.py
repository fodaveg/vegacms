"""Directed offline checks of source pinning, one-byte-domain edit and closed receipt."""

import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import remote_global_smoke as remote
import run_global_smoke as wrapper


class GlobalSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.body = (wrapper.CAPTURE / "smoke.sh").read_bytes()

    def test_exact_original_and_single_metadata_only_delta(self):
        wrapper.load_sources()
        target = remote.patched_source(self.body)
        self.assertEqual(remote.sha(target), remote.TARGET_SHA)
        self.assertEqual(target.count(remote.NEW), 1)
        self.assertEqual(target.replace(remote.NEW, remote.OLD, 1), self.body)
        active = [line for line in target.splitlines()
                  if line.startswith((b"check_http ", b"check_not_served ", b"check_header ",
                                      b"\tdocker exec edge-caddy "))]
        self.assertEqual(len(active), 19)

    def test_drift_or_second_raw_inspect_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "SourceSealChanged"):
            remote.patched_source(self.body + b"\n")
        changed = self.body.replace(b"check_http \"fodaveg\"", b"check_http \"foreign\"")
        with self.assertRaisesRegex(RuntimeError, "SourceSealChanged"):
            remote.patched_source(changed)

    def fake_run(self, process, *, guard=None):
        with patch.object(remote, "source_snapshot", side_effect=[(self.body, (1,)),
                                                            (self.body, (1,))]), \
                patch.object(remote, "caddy_guard", side_effect=guard) as check, \
                patch.object(remote.subprocess, "run", return_value=process) as execute:
            result = remote.run()
        self.assertEqual(execute.call_count, 1)
        self.assertEqual(execute.call_args.args[0], ["bash", "-s"])
        self.assertEqual(execute.call_args.kwargs["input"], remote.patched_source(self.body))
        self.assertEqual(execute.call_args.kwargs["stderr"], subprocess.DEVNULL)
        self.assertEqual(check.call_count, 2)
        return result

    def test_pass_is_19_closed_checks_with_both_guards(self):
        process = subprocess.CompletedProcess([], 0, stdout=b"OK: test\n" * 19, stderr=b"SECRET")
        result = self.fake_run(process)
        self.assertTrue(wrapper.valid(result, 0))
        self.assertEqual(result["status"], "GLOBAL_SMOKE_PASS")
        self.assertNotIn("SECRET", json.dumps(result))

    def test_first_failure_is_finite_and_closed(self):
        process = subprocess.CompletedProcess([], 1, stdout=b"OK: test\n" * 7, stderr=b"SECRET")
        result = self.fake_run(process)
        self.assertTrue(wrapper.valid(result, 2))
        self.assertEqual(result["checksPassed"], 7)
        self.assertEqual(result["failedCheckCount"], 1)
        self.assertNotIn("SECRET", json.dumps(result))

    def test_early_guard_throw_and_late_drift_stop_closed(self):
        with patch.object(remote, "source_snapshot", return_value=(self.body, (1,))), \
                patch.object(remote, "caddy_guard", side_effect=RuntimeError("SECRET")), \
                patch.object(remote.subprocess, "run") as execute:
            result = remote.run()
        execute.assert_not_called()
        self.assertEqual(result["status"], "STOP_GLOBAL_SMOKE_UNAVAILABLE")
        self.assertNotIn("SECRET", json.dumps(result))
        process = subprocess.CompletedProcess([], 0, stdout=b"OK: test\n" * 19)
        result = self.fake_run(process, guard=[None, RuntimeError("SECRET")])
        self.assertEqual(result["status"], "STOP_GLOBAL_SMOKE_UNAVAILABLE")
        self.assertNotIn("SECRET", json.dumps(result))

    def test_wrapper_rejects_private_or_inconsistent_receipt(self):
        result = {"status": "GLOBAL_SMOKE_PASS",
                  "mode": "canonical-source-single-inspect-format-override",
                  "sourceSha": remote.SOURCE_SHA,
                  "targetSha": remote.TARGET_SHA, "checksPassed": 19, "failedCheckCount": 0,
                  "sourceBeforeMatches": True, "sourceAfterMatches": True,
                  "caddyBeforeMatches": True, "caddyAfterMatches": True,
                  "remoteWrites": False, "privateValuesExported": False}
        self.assertTrue(wrapper.valid(result, 0))
        self.assertFalse(wrapper.valid({**result, "private": "SECRET"}, 0))
        self.assertFalse(wrapper.valid({**result, "caddyAfterMatches": False}, 0))
        self.assertFalse(wrapper.valid({**result, "checksPassed": 18}, 0))


if __name__ == "__main__":
    unittest.main(verbosity=2)
