"""Offline archive metadata/ownership and unsafe-tar tests; no Docker or SSH."""
import hashlib
import io
import json
from pathlib import Path
import sys
import tarfile
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


class ArchiveTests(unittest.TestCase):
    def observe(self, unsafe=False, drift=False, foreign=False):
        helper = load("image_helpers", HERE.parent.parent / "image-only-delivery-20261008/remote_cutover.py")
        controlled = load("cors_apply", HERE / "remote_cutover_controlled.py")
        reader = load("archive_reader", HERE / "reprobe-archive-read.py")
        wrapper = load("archive_wrapper", HERE / "reprobe-archive-run.py")
        with tempfile.TemporaryDirectory(prefix="fod-archive-ro-") as folder:
            root = Path(folder).resolve()
            controlled.ROOT = root
            storage = root / "docker-volumes"
            storage.mkdir()
            reader.DOCKER_VOLUMES = str(storage)
            backup = root / reader.BACKUP_ID
            backup.mkdir(mode=0o700)
            spec = controlled.SPECS["fodaveg"]
            state = {"service": "foreign" if foreign else "fodaveg", "status": "PREPARED",
                     "checkpoint": "CLONE_CLEANUP_VOLUME", "oldContainerId": spec["containerId"],
                     "oldComposeSha": spec["base"], "newComposeSha": spec["target"],
                     "imageId": spec["imageId"], "envSha": spec["envSha"]}
            (backup / "state.json").write_text(json.dumps(state))
            archive = backup / "data.tgz"
            with tarfile.open(archive, "w:gz") as tar:
                item = tarfile.TarInfo("./private-data.db")
                if unsafe:
                    item.type = tarfile.SYMTYPE
                    item.linkname = "/private-target"
                    tar.addfile(item)
                else:
                    data = b"private-body"
                    item.size = len(data)
                    tar.addfile(item, io.BytesIO(data))
            archive.chmod(0o600)
            observed = {"id": spec["containerId"], "image": spec["oldImageId"], "running": True, "health": "healthy"}
            commands = []

            def run(argv, **kwargs):
                commands.append(argv)
                self.assertEqual(argv[:2], ["docker", "inspect"])
                self.assertNotIn("Env", argv[3])
                self.assertNotIn("Output", argv[3])
                return json.dumps(observed).encode()

            original = helper.safe_archive_parts
            def parts(member):
                if drift:
                    replacement = backup / "foreign.tgz"
                    replacement.write_bytes(b"foreign")
                    replacement.chmod(0o600)
                    replacement.replace(archive)
                return original(member)

            with patch.object(helper, "run", side_effect=run), patch.object(helper, "safe_archive_parts", side_effect=parts):
                if foreign or unsafe or drift:
                    label = "StateUnknown" if foreign else "ArchiveShapeUnknown" if unsafe else "SnapshotDrift"
                    with self.assertRaisesRegex(RuntimeError, label):
                        reader.projected()
                    self.assertEqual(len(commands), 0 if foreign else 1)
                    return
                value = reader.projected()
            self.assertEqual(len(commands), 2)
            self.assertEqual(value["archiveSha"], hashlib.sha256(archive.read_bytes()).hexdigest())
            self.assertEqual(value["archiveFiles"], 1)
            self.assertEqual(value["expandedBytes"], len(b"private-body"))
            self.assertTrue(value["snapshotStable"])
            self.assertTrue(wrapper.valid(value, 0))
            self.assertNotIn("private-", json.dumps(value))
            self.assertFalse(wrapper.valid({**value, "rawPath": "private"}, 0))
            self.assertFalse(wrapper.valid({**value, "archiveBytes": True}, 0))
            self.assertFalse(wrapper.valid({**value, "budgetPassed": not value["budgetPassed"]}, 0))

    def test_archive_identity_hash_and_budget_are_closed(self):
        self.observe()

    def test_unsafe_tar_is_rejected_without_extraction(self):
        self.observe(unsafe=True)

    def test_archive_replacement_is_detected(self):
        self.observe(drift=True)

    def test_foreign_backup_state_prevents_docker(self):
        self.observe(foreign=True)


if __name__ == "__main__":
    unittest.main()
