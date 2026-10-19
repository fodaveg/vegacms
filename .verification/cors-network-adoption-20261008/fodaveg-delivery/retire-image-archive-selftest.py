"""Offline exact-file retirement, physical-budget projection and zero SSH tests."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def load(name, path):
    module = types.ModuleType(name)
    module.__file__ = str(path)
    sys.modules[name] = module
    exec(compile(path.read_bytes(), str(path), "exec"), module.__dict__)
    return module


class RetirementTests(unittest.TestCase):
    def modules(self):
        h = load("image_helpers", HERE.parent.parent / "image-only-delivery-20261008/remote_cutover.py")
        c = load("cors_apply", HERE / "remote_cutover_controlled.py")
        t = load("image_transport", HERE / "remote_transport.py")
        reader = load("archive_retire", HERE / "retire-image-archive.py")
        wrapper = load("archive_retire_wrapper", HERE / "retire-image-archive-run.py")
        return h, c, t, reader, wrapper

    def observe(self, replace=False, wrong_fs=False, budget_false=False, image_drift=False):
        h, c, t, reader, wrapper = self.modules()
        with tempfile.TemporaryDirectory(prefix="fod-retirement-") as folder:
            root = Path(folder).resolve()
            c.ROOT = root / "owned-backups"
            backup = c.ROOT / reader.BACKUP
            backup.mkdir(parents=True)
            spec = c.SPECS["fodaveg"]
            (backup / "state.json").write_text(json.dumps({"service": "fodaveg", "status": "PREPARED", "oldContainerId": spec["containerId"],
                                                         "oldComposeSha": spec["base"], "newComposeSha": spec["target"], "imageId": spec["imageId"]}))
            daemon = root / "private-daemon"
            allocator = daemon / "volumes"
            allocator.mkdir(parents=True)
            delivery = root / "private-delivery"
            delivery.mkdir(mode=0o700)
            t.ARCHIVE = delivery / "own.tar"
            t.ARCHIVE.write_bytes(b"owned-export")
            t.ARCHIVE.chmod(0o600)
            t.ARCHIVE_SHA = hashlib.sha256(t.ARCHIVE.read_bytes()).hexdigest()
            t.ARCHIVE_BYTES = t.ARCHIVE.stat().st_size
            wrapper.SCOPE = {**wrapper.SCOPE, "archiveSHA256": t.ARCHIVE_SHA, "archiveBytes": t.ARCHIVE_BYTES}
            archive_identity = c.identity(t.ARCHIVE.stat())
            calls, image_checks = [], 0

            def run(argv):
                nonlocal image_checks
                calls.append(argv)
                self.assertNotIn("Env", " ".join(argv))
                self.assertNotIn("Output", " ".join(argv))
                if argv[:2] == ["docker", "inspect"]:
                    return json.dumps({"id": spec["containerId"], "image": spec["oldImageId"], "running": True, "health": "healthy"}).encode()
                if argv[:3] == ["docker", "image", "inspect"]:
                    image_checks += 1
                    if replace and image_checks == 2:
                        other = delivery / "foreign.tar"
                        other.write_bytes(b"foreign")
                        other.chmod(0o600)
                        other.replace(t.ARCHIVE)
                    return json.dumps({"id": "foreign" if image_drift else t.CHAIN["ociManifestDigest"], "layers": t.CHAIN["layers"]}).encode()
                self.assertEqual(argv, ["docker", "info", "--format", "{{json .DockerRootDir}}"])
                return json.dumps(str(daemon)).encode()

            identity = reader.directory_identity
            def directory_identity(info):
                value = identity(info)
                if wrong_fs and info.st_ino == allocator.stat().st_ino:
                    value[0] += 1
                return value

            after = 1200000 if budget_false else 1800000
            with patch.object(h, "run", side_effect=run), patch.object(reader, "directory_identity", side_effect=directory_identity), \
                    patch.object(reader, "free", side_effect=[1200000, 1200000, after, after]), \
                    patch.object(t.subprocess, "run", side_effect=AssertionError("Real Docker forbidden")):
                value = reader.retire()
            self.assertTrue(wrapper.project(value, 2 if value["status"] == "RETIRE_STOP" else 0))
            self.assertFalse(any(argv[1] in {"stop", "start", "rm", "create", "volume"} for argv in calls))
            self.assertNotIn("private-daemon", json.dumps(value))
            self.assertNotIn("foreign", json.dumps(value))
            if replace:
                self.assertFalse(value["archiveRemoved"])
                self.assertEqual(t.ARCHIVE.read_bytes(), b"foreign")
            elif wrong_fs or image_drift:
                self.assertFalse(value["archiveRemoved"])
                self.assertEqual(c.identity(t.ARCHIVE.stat()), archive_identity)
                self.assertFalse(value["remoteWrites"])
            else:
                self.assertTrue(value["archiveRemoved"])
                self.assertFalse(t.ARCHIVE.exists())
                self.assertEqual(value["archiveIdentity"], archive_identity)
                self.assertEqual(value["budgetAfterPassed"], not budget_false)
                self.assertEqual(value["status"], "RETIRE_COMPLETED_BUDGET_FALSE" if budget_false else "RETIRE_PASSED_BUDGET_READY")
                record = json.loads((c.ROOT / reader.RECORD / "retirement.json").read_bytes())
                self.assertEqual(record["phase"], "FINAL")
                self.assertTrue(record["imageAndOldPinsPreserved"])
                for mutation in ({"freeAllocatorAfterKiB": True}, {"rawPath": "private"}, {"budgetAfterPassed": budget_false}):
                    with self.assertRaises(ValueError):
                        wrapper.project({**value, **mutation}, 0)

    def test_owned_archive_retirement_and_measured_budget(self):
        self.observe()

    def test_replacement_between_hash_and_unlink_is_preserved(self):
        self.observe(replace=True)

    def test_other_filesystem_zero_unlink(self):
        self.observe(wrong_fs=True)

    def test_loaded_image_drift_zero_unlink(self):
        self.observe(image_drift=True)

    def test_insufficient_after_budget_never_false_green(self):
        self.observe(budget_false=True)

    def test_missing_invalid_grant_or_source_drift_zero_ssh(self):
        _, _, _, _, wrapper = self.modules()
        with tempfile.TemporaryDirectory(prefix="fod-retire-grant-") as folder:
            root = Path(folder).resolve()
            with patch.object(wrapper, "HERE", root), patch.object(sys, "argv", ["retire", "--operation-id", wrapper.OPERATION]), \
                    patch("subprocess.Popen", side_effect=AssertionError("SSH forbidden")) as transport:
                self.assertEqual(wrapper.main(), 1)
                for name in wrapper.ARTIFACTS:
                    (root / name).write_bytes(b"fixture")
                manifest = {"operationId": wrapper.OPERATION, "scope": wrapper.SCOPE,
                            "files": {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in wrapper.ARTIFACTS}}
                (root / "retire-image-archive-manifest.json").write_text(json.dumps(manifest))
                (root / "retire-image-archive-approval.json").write_text(json.dumps({"status": "INVALID"}))
                self.assertEqual(wrapper.main(), 1)
                grant = {"status": "APPROVED", "reviewStatus": "APPROVED", "operationId": wrapper.OPERATION, "mode": wrapper.MODE,
                         "manifestSHA256": hashlib.sha256((root / "retire-image-archive-manifest.json").read_bytes()).hexdigest(), "scope": wrapper.SCOPE,
                         "runtimeApprovalReference": "OFFLINE_TEMP_FIXTURE_ONLY", "ownedArchiveRetirementExplicitlyApproved": True,
                         "archiveTupleAndFileIdentityRAMAccessExplicitlyApproved": True}
                (root / "retire-image-archive-approval.json").write_text(json.dumps(grant))
                (root / wrapper.ARTIFACTS[0]).write_bytes(b"foreign")
                self.assertEqual(wrapper.main(), 1)
                transport.assert_not_called()
                self.assertFalse((root / "retire-image-archive-started.json").exists())

    def test_local_export_replacement_is_detected(self):
        _, _, _, _, wrapper = self.modules()
        with tempfile.TemporaryDirectory(prefix="fod-retained-local-") as folder:
            wrapper.LOCAL_ARCHIVE = Path(folder).resolve() / "local.tar"
            wrapper.LOCAL_ARCHIVE.write_bytes(b"local-export")
            wrapper.SCOPE = {**wrapper.SCOPE, "archiveBytes": 12, "archiveSHA256": hashlib.sha256(b"local-export").hexdigest()}
            stream, identity, parent = wrapper.retained_archive()
            try:
                other = wrapper.LOCAL_ARCHIVE.parent / "foreign.tar"
                other.write_bytes(b"local-export")
                other.replace(wrapper.LOCAL_ARCHIVE)
                with self.assertRaisesRegex(ValueError, "LOCAL_ARCHIVE_DRIFT"):
                    wrapper.verify_local(stream, identity, parent)
            finally:
                stream.close()
                __import__("os").close(parent)

    def test_local_replacement_during_marker_zero_ssh_marker_consumed(self):
        _, _, _, _, wrapper = self.modules()
        with tempfile.TemporaryDirectory(prefix="fod-retire-marker-") as folder:
            root = Path(folder).resolve()
            local = root / "local.tar"
            local.write_bytes(b"local-export")
            wrapper.SCOPE = {**wrapper.SCOPE, "archiveBytes": 12, "archiveSHA256": hashlib.sha256(b"local-export").hexdigest()}
            original_write = wrapper.write_new
            def write_new(path, value):
                original_write(path, value)
                if path.name == "retire-image-archive-started.json":
                    foreign = root / "foreign.tar"
                    foreign.write_bytes(b"local-export")
                    foreign.replace(local)
            snapshot = {"capture.py": b"def capture_process(*args, **kwargs):\n import subprocess\n return subprocess.Popen(['FORBIDDEN_TEST_TRANSPORT'])\n"}
            with patch.object(wrapper, "HERE", root), patch.object(wrapper, "LOCAL_ARCHIVE", local), \
                    patch.object(wrapper, "authorize", return_value=snapshot), patch.object(wrapper, "payload", return_value=b"approved-fixture"), \
                    patch.object(wrapper, "write_new", side_effect=write_new), patch.object(sys, "argv", ["retire", "--operation-id", wrapper.OPERATION]), \
                    patch("subprocess.Popen", side_effect=AssertionError("SSH forbidden")) as transport:
                self.assertEqual(wrapper.main(), 2)
                transport.assert_not_called()
                self.assertTrue((root / "retire-image-archive-started.json").exists())
                receipt = json.loads((root / "retire-image-archive-execution.json").read_bytes())
                self.assertEqual(receipt["status"], "TRANSPORT_UNKNOWN_NO_RETRY")
                self.assertIsNone(receipt["transportExit"])
                self.assertEqual(local.read_bytes(), b"local-export")


if __name__ == "__main__":
    unittest.main()
