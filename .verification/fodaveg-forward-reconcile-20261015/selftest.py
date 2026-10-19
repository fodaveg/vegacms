"""Negative checks for the exact local aggregate; no network or container access."""
import copy
import tempfile
import unittest
from pathlib import Path

import aggregate as a


EVIDENCE = Path(__file__).resolve().parents[5] / ".verification/cors-network-adoption-20261008/fodaveg-delivery"


class AggregateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.good = a.load(EVIDENCE)

    def test_real_evidence(self):
        value = a.build(self.good)
        self.assertEqual(value["status"], "PASS")
        self.assertEqual(value["originalExecution"]["status"], "STOP_NEEDS_OPERATOR")
        self.assertEqual(value["diagnostic"]["journalPhase"], "CREATED")

    def reject(self, name, field, value):
        evidence = copy.deepcopy(self.good)
        evidence[name][field] = value
        with self.assertRaises(ValueError):
            a.build(evidence)

    def test_original_stop_cannot_be_recast(self):
        self.reject("forward-cutover-execution.json", "status", "CORS_APPLIED_AWAITING_PUBLIC_SMOKE")
        evidence = copy.deepcopy(self.good)
        evidence["forward-cutover-execution.json"]["result"]["failureClass"] = "OTHER_FAILURE"
        with self.assertRaises(ValueError):
            a.build(evidence)

    def test_foreign_record_or_container_rejected(self):
        self.reject("forward-cutover-execution.json", "ownedBackupId", "fodaveg-foreign")
        self.reject("forward-cutover-diagnostic-20261015.json", "recordNewId", "a" * 64)

    def test_unhealthy_or_unowned_snapshot_rejected(self):
        for key, value in (("healthClass", "UNHEALTHY"), ("runtimeGuard", "RuntimePeerDrift"),
                           ("composeOwned", False), ("envMatches", False), ("volumeUsers", "OTHER"),
                           ("snapshotStable", False), ("phase", "AWAITING_PUBLIC_SMOKE")):
            with self.subTest(key=key):
                self.reject("forward-cutover-diagnostic-20261015.json", key, value)

    def test_public_failure_rejected(self):
        for key, value in (("status", "CORS_PUBLIC_FAILED"), ("assetsMatched", 154),
                           ("pathsUnchanged", False), ("peersUnchanged", False)):
            with self.subTest(key=key):
                self.reject("forward-public-after-20261015.json", key, value)
        evidence = copy.deepcopy(self.good)
        evidence["forward-public-after-20261015.json"]["cors"]["foreignDenied"] = False
        with self.assertRaises(ValueError):
            a.build(evidence)

    def test_input_sha_and_receipt_drift_rejected(self):
        with tempfile.TemporaryDirectory() as dirname:
            root = Path(dirname)
            for name in a.PINS:
                (root / name).write_bytes((EVIDENCE / name).read_bytes())
            (root / "forward-public-after-20261015.json").write_bytes(b"{}\n")
            with self.assertRaisesRegex(ValueError, "EvidenceShaDrift"):
                a.load(root)
            (root / "forward-public-after-20261015.json").write_bytes(
                (EVIDENCE / "forward-public-after-20261015.json").read_bytes())
            receipt = root / "receipt.json"
            receipt.write_bytes(a.encoded(a.build(a.load(root))))
            self.assertEqual(receipt.read_bytes(), a.encoded(a.build(a.load(root))))
            receipt.write_bytes(b"{}\n")
            self.assertNotEqual(receipt.read_bytes(), a.encoded(a.build(a.load(root))))


if __name__ == "__main__":
    unittest.main(verbosity=2)
