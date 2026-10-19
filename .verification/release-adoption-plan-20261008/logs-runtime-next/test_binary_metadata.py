"""Offline grant/source/one-shot and projection tests; no live approvals or I/O."""
from contextlib import redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import run_binary_metadata as run

HERE = Path(__file__).resolve().parent


class BinaryMetadataTests(unittest.TestCase):
    def fixture(self, root):
        base = root / "a" / "b" / "base"
        base.mkdir(parents=True)
        files = {}
        for name in run.ARTIFACTS:
            body = (HERE / name).read_bytes()
            (base / name).write_bytes(body)
            files[name] = hashlib.sha256(body).hexdigest()
        capture = root / run.CAPTURE
        capture.parent.mkdir(parents=True)
        capture.write_bytes((HERE.parents[2] / run.CAPTURE).read_bytes())
        manifest = {"operationId": run.OPERATION, "scope": run.SCOPE, "files": files}
        body = json.dumps(manifest).encode()
        (base / "binary-metadata-manifest-v2.json").write_bytes(body)
        # Offline fixture only; never write this grant to the real candidate directory.
        approval = {"status": "APPROVED", "reviewStatus": "APPROVED", "operationId": run.OPERATION,
                    "mode": run.MODE, "manifestSHA256": hashlib.sha256(body).hexdigest(), "scope": run.SCOPE,
                    "runtimeApprovalReference": "OFFLINE FIXTURE ONLY",
                    "selectiveBinaryMetadataAndModuleStdoutRAMAccessExplicitlyApproved": True,
                    "environmentOrLogContentAccessApproved": False, "wholeConfigAccessApproved": False}
        (base / "binary-execution-approval.json").write_text(json.dumps(approval))
        return base, approval

    def test_missing_invalid_grant_or_source_means_zero_connections(self):
        for case in ("missing_grant", "invalid_json", "scope_denied", "missing_source", "source_drift"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as folder:
                base, approval = self.fixture(Path(folder))
                path = base / "binary-execution-approval.json"
                if case == "missing_grant":
                    path.unlink()
                elif case == "invalid_json":
                    path.write_text("unknown private value")
                elif case == "scope_denied":
                    approval["selectiveBinaryMetadataAndModuleStdoutRAMAccessExplicitlyApproved"] = False
                    path.write_text(json.dumps(approval))
                elif case == "missing_source":
                    (base / "read_binary_metadata.py").unlink()
                else:
                    (base / "read_binary_metadata.py").write_bytes(b"private source drift")
                with patch.object(run, "__file__", str(base / "run_binary_metadata.py")), \
                        patch.object(sys, "argv", ["wrapper", "--operation-id", run.OPERATION]), \
                        patch("subprocess.Popen", side_effect=AssertionError("connection forbidden")) as connection, \
                        redirect_stdout(io.StringIO()) as output:
                    self.assertEqual(run.main(), 1)
                connection.assert_not_called()
                self.assertFalse((base / "binary-request-started.json").exists())
                self.assertFalse((base / "binary-execution-receipt.json").exists())
                self.assertNotIn("private", output.getvalue())

    def test_payload_reuses_approved_buffers_after_source_change(self):
        with tempfile.TemporaryDirectory() as folder:
            base, _ = self.fixture(Path(folder))
            snapshot = run.authorize(base, run.OPERATION)
            payload = run.payload(snapshot)
            (base / "read_binary_metadata.py").write_bytes(b"foreign source")
            self.assertEqual(run.payload(snapshot), payload)
            with self.assertRaisesRegex(ValueError, "SEAL_DRIFT"):
                run.authorize(base, run.OPERATION)

    def test_consumed_marker_blocks_connections(self):
        with tempfile.TemporaryDirectory() as folder:
            base, _ = self.fixture(Path(folder))
            marker = base / "binary-request-started.json"
            marker.write_bytes(b"prior attempt")
            with patch.object(run, "__file__", str(base / "run_binary_metadata.py")), \
                    patch.object(sys, "argv", ["wrapper", "--operation-id", run.OPERATION]), \
                    patch("subprocess.Popen", side_effect=AssertionError("connection forbidden")) as connection, \
                    redirect_stdout(io.StringIO()):
                self.assertEqual(run.main(), 1)
            connection.assert_not_called()
            self.assertEqual(marker.read_bytes(), b"prior attempt")
            self.assertFalse((base / "binary-execution-receipt.json").exists())

    def read_fixture(self, mode):
        module = types.ModuleType("bounded_capture")
        namespace = {"__name__": "offline_reader"}
        calls = []
        initial = {"id": run.SCOPE["containerId"], "imageId": run.SCOPE["imageId"], "tty": False}
        final = {**initial, "tty": True} if mode == "tty_drift" else initial
        if mode == "bad_final_tty":
            final = {**initial, "tty": 0}
        if mode == "bad_tty":
            initial = {**initial, "tty": "private-value"}
        version = b"private-version" if mode == "bad_version" else b"v2.11.0 h1:" + b"a" * 43 + b"=\n"
        sequence = iter([json.dumps(initial).encode(), version,
                         b"caddy.logging.encoders.filter\ncaddy.logging.encoders.json\ncaddy.logging.writers.stderr\nprivate.custom.module\n",
                         json.dumps(final).encode()])

        def capture(command, **kwargs):
            calls.append(command)
            return types.SimpleNamespace(returncode=0, stdout=next(sequence))

        module.capture_process = capture
        with patch.dict(sys.modules, {"bounded_capture": module}):
            exec(compile((HERE / "read_binary_metadata.py").read_bytes(), "<reader>", "exec"), namespace)
            value = namespace["read_binary_metadata"]()
        return value, calls

    def test_reader_exports_only_finite_values_and_pre_post_tty(self):
        value, calls = self.read_fixture("good")
        self.assertEqual(len(calls), 4)
        self.assertEqual(calls[0], calls[-1])
        self.assertTrue(all(command[2] == run.SCOPE["containerId"] for command in calls if command[:2] == ["docker", "exec"]))
        self.assertEqual(value["version"], "2.11.0")
        self.assertEqual(value["modules"], {"filterAvailable": True, "jsonAvailable": True, "stderrAvailable": True})
        self.assertNotIn("private", json.dumps(value))
        self.assertNotIn("h1:", json.dumps(value))
        self.assertIs(run.project(value), value)

    def test_invalid_shape_and_post_tty_drift_discard_projection(self):
        for mode, commands in (("bad_tty", 1), ("bad_version", 2),
                               ("tty_drift", 4), ("bad_final_tty", 4)):
            with self.subTest(mode=mode):
                value, calls = self.read_fixture(mode)
                self.assertEqual(len(calls), commands)
                self.assertEqual(value["status"], "STOP_BINARY_METADATA_UNRESOLVED")
                self.assertTrue(all(value[key] is None for key in ("version", "tty", "modules")))
                self.assertNotIn("private", json.dumps(value))
                self.assertIs(run.project(value), value)

    def test_closed_wrapper_rejects_raw_module_names_and_claims(self):
        value, _ = self.read_fixture("good")
        for changed in ({**value, "customModule": "private"}, {**value, "version": "v2.11.0 private-build"},
                        {**value, "tty": 0}, {**value, "effectiveTokenSafetyProved": True},
                        {**value, "modules": {"filterAvailable": True, "jsonAvailable": True, "stderrAvailable": "private"}}):
            with self.assertRaises(ValueError):
                run.project(changed)


if __name__ == "__main__":
    unittest.main()
