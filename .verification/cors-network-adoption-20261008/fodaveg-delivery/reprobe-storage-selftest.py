"""Offline daemon-root privacy, allocator budget and constructor tests."""
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


class StorageTests(unittest.TestCase):
    def observe(self, root_shape=None, drift=False, foreign=False, low=False):
        helper = load("image_helpers", HERE.parent.parent / "image-only-delivery-20261008/remote_cutover.py")
        controlled = load("cors_apply", HERE / "remote_cutover_controlled.py")
        reader = load("storage_reader", HERE / "reprobe-storage-read.py")
        wrapper = load("storage_wrapper", HERE / "reprobe-storage-run.py")
        with tempfile.TemporaryDirectory(prefix="fod-storage-ro-") as folder:
            root = Path(folder).resolve()
            controlled.ROOT = root
            daemon = root / "private-daemon-root"
            daemon.mkdir()
            (daemon / "volumes").mkdir()
            backup = root / reader.BACKUP_ID
            backup.mkdir(mode=0o700)
            spec = controlled.SPECS["fodaveg"]
            state = {"service": "foreign" if foreign else "fodaveg", "status": "PREPARED",
                     "oldContainerId": spec["containerId"], "oldComposeSha": spec["base"],
                     "newComposeSha": spec["target"], "imageId": spec["imageId"]}
            (backup / "state.json").write_text(json.dumps(state))
            commands = []
            root_reads = 0

            def run(argv):
                nonlocal root_reads
                commands.append(argv)
                if argv[:2] == ["docker", "inspect"]:
                    self.assertNotIn("Env", argv[3])
                    self.assertNotIn("Output", argv[3])
                    return json.dumps({"id": spec["containerId"], "image": spec["oldImageId"],
                                       "running": True, "health": "healthy"}).encode()
                self.assertEqual(argv, ["docker", "info", "--format", "{{json .DockerRootDir}}"])
                root_reads += 1
                return json.dumps(root_shape if root_shape is not None else str(daemon) + ("-changed" if drift and root_reads == 2 else "")).encode()

            fs = types.SimpleNamespace(f_bavail=1 if low else 10**7, f_frsize=1024)
            with patch.object(helper, "run", side_effect=run), patch.object(reader.os, "statvfs", return_value=fs):
                if foreign or root_shape is not None or drift:
                    error = "StateUnknown" if foreign else "DaemonRootUnknown" if root_shape is not None else "SnapshotDrift"
                    with self.assertRaisesRegex(RuntimeError, error):
                        reader.projected()
                    self.assertEqual(len(commands), 0 if foreign else 2 if root_shape is not None else 3)
                    return
                value = reader.projected()
            self.assertEqual(len(commands), 4)
            self.assertEqual(value["budgetPassed"], not low)
            self.assertEqual(value["requiredAllocatorKiB"], 1510136)
            self.assertEqual(value["requiredSrvKiB"], 1511160)
            self.assertTrue(wrapper.valid(value, 0))
            self.assertNotIn("private-daemon", json.dumps(value))
            self.assertFalse(wrapper.valid({**value, "rootPath": str(daemon)}, 0))
            self.assertFalse(wrapper.valid({**value, "freeRootKiB": True}, 0))
            self.assertFalse(wrapper.valid({**value, "budgetPassed": not value["budgetPassed"]}, 0))

    def test_daemon_scalar_projected_without_path(self):
        self.observe()

    def test_insufficient_actual_parent_is_false_without_writes(self):
        self.observe(low=True)

    def test_whole_info_or_relative_path_rejected(self):
        for shape in ({"DockerRootDir": "/private"}, "relative", "/root/../private"):
            with self.subTest(shape=type(shape).__name__):
                self.observe(root_shape=shape)

    def test_root_scalar_drift_rejected(self):
        self.observe(drift=True)

    def test_foreign_state_zero_docker_commands(self):
        self.observe(foreign=True)

    def test_future_constructor_explicit_local_without_options(self):
        constructor = load("local_constructor", HERE / "reprobe-local-volume.py")
        nonce = "a" * 32
        argv = constructor.volume_create_argv(nonce, "fodaveg-reprobe-20261009T001500Z-1234")
        self.assertEqual(argv[:5], ["docker", "volume", "create", "--driver", "local"])
        self.assertEqual(argv[-1], "vega-fod-reprobe-" + nonce)
        self.assertNotIn("--opt", argv)
        self.assertNotIn("--rm", argv)
        for bad_nonce, bad_owner in (("../foreign", "fodaveg-reprobe-20261009T001500Z-1234"), (nonce, "foreign")):
            with self.assertRaisesRegex(ValueError, "TestIdentityUnknown"):
                constructor.volume_create_argv(bad_nonce, bad_owner)


if __name__ == "__main__":
    unittest.main()
