"""Offline one-shot grant/same-buffer/closed-receipt boundaries; no SSH."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def wrapper_module():
    module = types.ModuleType("test_wrapper")
    module.__file__ = str(HERE / "reprobe-test-run.py")
    exec(compile(Path(module.__file__).read_bytes(), module.__file__, "exec"), module.__dict__)
    return module


class WrapperTests(unittest.TestCase):
    def test_bad_grants_sources_and_imports_zero_connections(self):
        wrapper = wrapper_module()
        for case in ("MISSING", "INVALID", "OPERATION", "SCOPE_TYPE", "SOURCE", "IMPORT"):
            with self.subTest(case=case), tempfile.TemporaryDirectory(prefix="fod-reprobe-grant-") as folder:
                root = Path(folder).resolve()
                for name in wrapper.ARTIFACTS:
                    (root / name).write_bytes(b"offline fixture")
                manifest = {"operationId": wrapper.OPERATION, "scope": wrapper.SCOPE,
                            "files": {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in wrapper.ARTIFACTS}}
                (root / "reprobe-test-manifest.json").write_text(json.dumps(manifest))
                grant = {"status": "APPROVED", "reviewStatus": "APPROVED", "operationId": wrapper.OPERATION, "mode": wrapper.MODE,
                         "scope": wrapper.SCOPE, "manifestSHA256": hashlib.sha256((root / "reprobe-test-manifest.json").read_bytes()).hexdigest(),
                         "runtimeApprovalReference": "OFFLINE_TEMP_FIXTURE_ONLY", "ownedTestWritesExplicitlyApproved": True,
                         "privateArchiveRAMAccessExplicitlyApproved": True, "ownedRecordId": "fodaveg-reprobe-20261009T001500Z-1234"}
                if case == "INVALID":
                    grant["ownedTestWritesExplicitlyApproved"] = False
                elif case == "OPERATION":
                    grant["operationId"] = "foreign"
                elif case == "SCOPE_TYPE":
                    grant["scope"] = {**wrapper.SCOPE, "retryAllowed": 0}
                elif case == "SOURCE":
                    (root / wrapper.ARTIFACTS[0]).write_bytes(b"foreign")
                if case != "MISSING":
                    (root / "reprobe-test-approval.json").write_text(json.dumps(grant))
                imports = {"fixture": (root / wrapper.ARTIFACTS[0], "0" * 64)} if case == "IMPORT" else wrapper.IMPORTS
                with patch.object(wrapper, "HERE", root), patch.object(wrapper, "IMPORTS", imports), \
                        patch.object(sys, "argv", ["reprobe", "--operation-id", wrapper.OPERATION]), \
                        patch("subprocess.Popen", side_effect=AssertionError("SSH forbidden")) as transport:
                    self.assertEqual(wrapper.main(), 1)
                    transport.assert_not_called()
                    self.assertFalse((root / "reprobe-test-started.json").exists())

    def good_receipt(self):
        return {"status": "TEST_REPROBE_PASSED_AND_CLEANED", "ownedRecordId": "fodaveg-reprobe-20261009T001500Z-1234",
                "primaryFailure": None, "cleanupFailures": [], "filesVerified": 71, "bytesVerified": 875290525,
                "remoteWrites": True, "productionControlOperations": False, "productionDataRestore": False, "privateValuesExported": False}

    def test_closed_projection_drops_raw_extra_keys_and_numeric_booleans(self):
        wrapper = wrapper_module()
        value = self.good_receipt()
        self.assertEqual(wrapper.project(value, 0), value)
        for mutation in ({"rawRuntimeArgv": "private"}, {"filesVerified": True}, {"productionControlOperations": 0},
                         {"privateValuesExported": True}, {"ownedRecordId": "/foreign"}, {"bytesVerified": 1}):
            with self.subTest(field=next(iter(mutation))), self.assertRaises(ValueError):
                wrapper.project({**value, **mutation}, 0)

    def test_primary_and_cleanup_numeric_failures_remain_separate(self):
        wrapper = wrapper_module()
        value = {**self.good_receipt(), "status": "TEST_CLEANUP_UNRESOLVED",
                 "primaryFailure": {"phase": "START_PB", "failureClass": "CommandExitNonzero", "commandExit": 17},
                 "cleanupFailures": [{"phase": "CLEANUP_VOLUME", "failureClass": "CommandExitNonzero", "commandExit": 1}]}
        self.assertEqual(wrapper.project(value, 2)["primaryFailure"]["commandExit"], 17)
        for failure in ({"phase": "FOREIGN_PHASE", "failureClass": "OTHER", "commandExit": None},
                        {"phase": "START_PB", "failureClass": "CommandExitNonzero", "commandExit": True},
                        {"phase": "START_PB", "failureClass": "PRIVATE_ERROR_TEXT", "commandExit": None}):
            with self.assertRaises(ValueError):
                wrapper.project({**value, "primaryFailure": failure}, 2)

    def fake_snapshot(self):
        return {"capture.py": b"def capture_process(*args, **kwargs):\n import subprocess\n return subprocess.Popen(['UNIT_TEST_NO_CONNECTION'])\n",
                "reprobe-test-approval.json": b'{"ownedRecordId":"fodaveg-reprobe-20261009T001500Z-1234"}'}

    def test_existing_marker_or_receipt_zero_connections(self):
        wrapper = wrapper_module()
        for name in ("reprobe-test-started.json", "reprobe-test-execution.json"):
            with self.subTest(name=name), tempfile.TemporaryDirectory(prefix="fod-reprobe-consumed-") as folder:
                root = Path(folder).resolve()
                (root / name).write_bytes(b"foreign-marker-retained")
                with patch.object(wrapper, "HERE", root), patch.object(wrapper, "authorize", return_value=self.fake_snapshot()), \
                        patch.object(wrapper, "payload", return_value=b"approved-buffer"), \
                        patch.object(sys, "argv", ["reprobe", "--operation-id", wrapper.OPERATION]), \
                        patch("subprocess.Popen", side_effect=AssertionError("SSH forbidden")) as transport:
                    self.assertEqual(wrapper.main(), 1)
                    transport.assert_not_called()
                    self.assertEqual((root / name).read_bytes(), b"foreign-marker-retained")

    def test_unknown_remote_output_never_persisted_and_marker_consumed(self):
        wrapper = wrapper_module()
        with tempfile.TemporaryDirectory(prefix="fod-reprobe-unknown-") as folder:
            root = Path(folder).resolve()
            remote = types.SimpleNamespace(returncode=0, stdout=b'{"rawPrivateRuntime":"NEVER_EXPORT"}')
            with patch.object(wrapper, "HERE", root), patch.object(wrapper, "authorize", return_value=self.fake_snapshot()), \
                    patch.object(wrapper, "payload", return_value=b"approved-buffer"), \
                    patch.object(sys, "argv", ["reprobe", "--operation-id", wrapper.OPERATION]), patch("subprocess.Popen", return_value=remote) as transport:
                self.assertEqual(wrapper.main(), 2)
                self.assertEqual(transport.call_count, 1)
                receipt = (root / "reprobe-test-execution.json").read_bytes()
                self.assertNotIn(b"NEVER_EXPORT", receipt)
                self.assertNotIn(b"rawPrivateRuntime", receipt)
                marker = json.loads((root / "reprobe-test-started.json").read_bytes())
                self.assertRegex(marker["ownedRecordId"], r"^fodaveg-reprobe-[0-9]{8}T[0-9]{6}Z-[0-9]+$")
                self.assertEqual(wrapper.main(), 1)
                self.assertEqual(transport.call_count, 1)


if __name__ == "__main__":
    unittest.main()
