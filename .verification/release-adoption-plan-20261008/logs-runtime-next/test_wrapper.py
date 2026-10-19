"""Offline fixtures only: no real grant, marker, SSH or Docker request."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import run_default as run

HERE = Path(__file__).resolve().parent


class WrapperTests(unittest.TestCase):
    def test_no_approval_means_no_payload_or_transport(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(FileNotFoundError):
                run.authorize(Path(folder), run.OPERATION)

    def test_exact_grant_and_same_buffers_then_tamper_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
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
            (base / "manifest-v2.json").write_bytes(body)
            # Explicit offline fixture, never installed in the live evidence directory.
            approval = {"status": "APPROVED", "reviewStatus": "APPROVED", "operationId": run.OPERATION,
                        "mode": run.MODE, "manifestSHA256": hashlib.sha256(body).hexdigest(), "scope": run.SCOPE,
                        "runtimeApprovalReference": "OFFLINE FIXTURE ONLY",
                        "selectiveDefaultPrivateSubtreeRAMAccessExplicitlyApproved": True,
                        "environmentOrLogContentAccessApproved": False, "wholeConfigAccessApproved": False}
            approval_path = base / "execution-approval.json"
            approval_path.write_text(json.dumps(approval))
            snapshot = run.authorize(base, run.OPERATION)
            approved_payload = run.payload(snapshot)
            (base / "read_default.py").write_bytes(b"foreign private source")
            self.assertEqual(run.payload(snapshot), approved_payload)
            with self.assertRaisesRegex(ValueError, "SEAL_DRIFT"):
                run.authorize(base, run.OPERATION)
            approval["selectiveDefaultPrivateSubtreeRAMAccessExplicitlyApproved"] = False
            approval_path.write_text(json.dumps(approval))
            with self.assertRaisesRegex(ValueError, "NOT_AUTHORIZED"):
                run.authorize(base, run.OPERATION)

    def test_closed_projection_and_false_claims(self):
        value = {"status": "DEFAULT_CONFIG_TYPES_AND_TOKEN_RULES_PROJECTED", "endpoint": run.SCOPE["endpoint"],
                 "requestAttempts": 1, "remoteWrites": False, "rawConfigPersisted": False,
                 "logsRead": False, "configEnvRead": False, "taskClosureProved": False,
                 "defaultLogger": {"writerType": "STDOUT", "encoderTypes": ["FILTER", "JSON"],
                     "tokenFilterRules": [{"uriToken": "DELETE_LITERAL_TOKEN_QUERY", "referer": "DELETE_REFERER_FIELD"}],
                     "effectiveTokenSafetyProved": False, "customProducerMessageSafetyProved": False,
                     "namedLoggerCoverageProved": False}}
        self.assertIs(run.project(value), value)
        for altered in ({**value, "raw": "secret"}, {**value, "requestAttempts": True},
                        {**value, "taskClosureProved": True}):
            with self.assertRaises(ValueError):
                run.project(altered)
        value["defaultLogger"]["writerType"] = "private-custom-name"
        with self.assertRaises(ValueError):
            run.project(value)

    def test_marker_is_exclusive_and_never_replaced(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "marker.json"
            run.write_exclusive(path, {"attempts": 1})
            before = path.read_bytes()
            with self.assertRaises(FileExistsError):
                run.write_exclusive(path, {"attempts": 2})
            self.assertEqual(path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
