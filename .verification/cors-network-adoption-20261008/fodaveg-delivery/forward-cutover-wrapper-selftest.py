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
    module.__file__ = str(HERE / "forward-cutover-run.py")
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
                (root / "forward-cutover-manifest.json").write_text(json.dumps(manifest))
                grant = {"status": "APPROVED", "reviewStatus": "APPROVED", "operationId": wrapper.OPERATION, "mode": wrapper.MODE,
                         "scope": wrapper.SCOPE, "manifestSHA256": hashlib.sha256((root / "forward-cutover-manifest.json").read_bytes()).hexdigest(),
                         "runtimeApprovalReference": "OFFLINE_TEMP_FIXTURE_ONLY", "forwardControlExplicitlyApproved": True,
                         "privateSnapshotRAMAccessExplicitlyApproved": True, "ownedRecordId": "fodaveg-reprobe-20261009T001500Z-1234", "ownedBackupId": "fodaveg-20261009T001500Z-1234"}
                if case == "INVALID":
                    grant["forwardControlExplicitlyApproved"] = False
                elif case == "OPERATION":
                    grant["operationId"] = "foreign"
                elif case == "SCOPE_TYPE":
                    grant["scope"] = {**wrapper.SCOPE, "retryAllowed": 0}
                elif case == "SOURCE":
                    (root / wrapper.ARTIFACTS[0]).write_bytes(b"foreign")
                if case != "MISSING":
                    (root / "forward-cutover-approval.json").write_text(json.dumps(grant))
                imports = {"fixture": (root / wrapper.ARTIFACTS[0], "0" * 64)} if case == "IMPORT" else wrapper.IMPORTS
                with patch.object(wrapper, "HERE", root), patch.object(wrapper, "IMPORTS", imports), \
                        patch.object(sys, "argv", ["reprobe", "--operation-id", wrapper.OPERATION]), \
                        patch("subprocess.Popen", side_effect=AssertionError("SSH forbidden")) as transport:
                    self.assertEqual(wrapper.main(), 1)
                    transport.assert_not_called()
                    self.assertFalse((root / "forward-cutover-started.json").exists())

    def good_receipt(self):
        wrapper = wrapper_module()
        return {"status": "CORS_APPLIED_AWAITING_PUBLIC_SMOKE", "service": "fodaveg", "remoteWrites": True,
                "backupId": "fodaveg-20261009T001500Z-1234", "oldContainerId": wrapper.SCOPE["oldId"],
                "newContainerId": "a" * 64, "composeSha": wrapper.SCOPE["composeTarget"], "imageId": wrapper.SCOPE["newImage"],
                "archiveSha": "b" * 64, "archiveBytes": 110406535, "restoredFiles": 71, "restoredBytes": 875290525,
                "probe": {"primary": None, "cleanup": [], "files": 71, "bytes": 875290525,
                          "recordId": "fodaveg-reprobe-20261009T001500Z-1234", "finished": True}}

    def test_closed_projection_rejects_private_fields_bool_counts_and_caps(self):
        wrapper = wrapper_module()
        value = self.good_receipt()
        self.assertEqual(wrapper.project(value, 0), value)
        for mutation in ({"rawRuntimeArgv": "private"}, {"restoredFiles": True}, {"remoteWrites": 0},
                         {"newContainerId": wrapper.SCOPE["oldId"]}, {"backupId": "/foreign"},
                         {"archiveBytes": wrapper.SCOPE["maxSnapshotBytes"] + 1},
                         {"restoredBytes": wrapper.SCOPE["maxExpandedBytes"] + 1}, {"probe": None}):
            with self.subTest(field=next(iter(mutation))), self.assertRaises(ValueError):
                wrapper.project({**value, **mutation}, 0)

    def test_primary_and_cleanup_numeric_failures_remain_separate(self):
        wrapper = wrapper_module()
        probe = {**self.good_receipt()["probe"], "primary": {"phase": "START_PB", "failureClass": "CommandExitNonzero", "commandExit": 17},
                 "cleanup": [{"phase": "CLEANUP_VOLUME", "failureClass": "CommandExitNonzero", "commandExit": 1}]}
        value = {"status": "STOP_OLD_RUNTIME_RESTORED", "service": "fodaveg", "remoteWrites": True,
                 "backupId": "fodaveg-20261009T001500Z-1234", "checkpoint": "BACKUP", "failureClass": "ProbeFailed", "createExit": None, "commandExit": None,
                 "baselineFields": dict.fromkeys(("mountRawSame", "mountCanonicalSame", "aliasesRawSame", "aliasesCanonicalSame", "networkRawSame", "portsStoppedEquivalent")), "probe": probe}
        self.assertEqual(wrapper.project(value, 2)["probe"]["primary"]["commandExit"], 17)
        for failure in ({"phase": "FOREIGN_PHASE", "failureClass": "OTHER", "commandExit": None},
                        {"phase": "START_PB", "failureClass": "CommandExitNonzero", "commandExit": True},
                        {"phase": "START_PB", "failureClass": "PRIVATE_ERROR_TEXT", "commandExit": None}):
            with self.assertRaises(ValueError):
                wrapper.project({**value, "probe": {**probe, "primary": failure}}, 2)

    def test_authorize_pins_same_buffers_and_payload_ignores_later_disk_edits(self):
        wrapper = wrapper_module()
        with tempfile.TemporaryDirectory(prefix="fod-forward-seal-") as folder:
            root = Path(folder).resolve()
            base = root / "a/b/c"
            base.mkdir(parents=True)
            for name in wrapper.ARTIFACTS:
                (base / name).write_bytes((HERE / name).read_bytes())
            capture = base.parents[2] / wrapper.CAPTURE
            capture.parent.mkdir(parents=True)
            capture.write_bytes((HERE.parents[2] / wrapper.CAPTURE).read_bytes())
            for name in wrapper.EVIDENCE:
                (base / name).write_bytes((HERE / name).read_bytes())
            manifest = {"operationId": wrapper.OPERATION, "scope": wrapper.SCOPE,
                        "files": {name: hashlib.sha256((base / name).read_bytes()).hexdigest() for name in wrapper.ARTIFACTS}}
            (base / "forward-cutover-manifest.json").write_text(json.dumps(manifest))
            owner, backup = "fodaveg-reprobe-20261009T001500Z-1234", "fodaveg-20261009T001500Z-1234"
            grant = {"status": "APPROVED", "reviewStatus": "APPROVED", "operationId": wrapper.OPERATION, "mode": wrapper.MODE,
                     "scope": wrapper.SCOPE, "manifestSHA256": hashlib.sha256((base / "forward-cutover-manifest.json").read_bytes()).hexdigest(),
                     "runtimeApprovalReference": "OFFLINE_TEMP_FIXTURE_ONLY", "forwardControlExplicitlyApproved": True,
                     "privateSnapshotRAMAccessExplicitlyApproved": True, "ownedRecordId": owner, "ownedBackupId": backup}
            (base / "forward-cutover-approval.json").write_text(json.dumps(grant))
            snapshot = wrapper.authorize(base, wrapper.OPERATION)
            first = wrapper.payload(snapshot, owner, backup)
            compile(first, "sealed-payload", "exec")
            (base / "forward-probe.py").write_bytes(b"FOREIGN_SOURCE_DO_NOT_RUN")
            self.assertEqual(wrapper.payload(snapshot, owner, backup), first)
            with self.assertRaisesRegex(ValueError, "SEAL_DRIFT"):
                wrapper.authorize(base, wrapper.OPERATION)

    def fake_snapshot(self):
        return {"capture.py": b"def capture_process(*args, **kwargs):\n import subprocess\n return subprocess.Popen(['UNIT_TEST_NO_CONNECTION'])\n",
                "forward-cutover-approval.json": b'{"ownedRecordId":"fodaveg-reprobe-20261009T001500Z-1234","ownedBackupId":"fodaveg-20261009T001500Z-1234"}'}

    def test_existing_marker_or_receipt_zero_connections(self):
        wrapper = wrapper_module()
        for name in ("forward-cutover-started.json", "forward-cutover-execution.json"):
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
                receipt = (root / "forward-cutover-execution.json").read_bytes()
                self.assertNotIn(b"NEVER_EXPORT", receipt)
                self.assertNotIn(b"rawPrivateRuntime", receipt)
                marker = json.loads((root / "forward-cutover-started.json").read_bytes())
                self.assertRegex(marker["ownedRecordId"], r"^fodaveg-reprobe-[0-9]{8}T[0-9]{6}Z-[0-9]+$")
                self.assertEqual(wrapper.main(), 1)
                self.assertEqual(transport.call_count, 1)


if __name__ == "__main__":
    unittest.main()
