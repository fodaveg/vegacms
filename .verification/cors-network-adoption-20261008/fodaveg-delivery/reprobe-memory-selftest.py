"""Offline two-counter memory projection, drift and zero-connection tests."""
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


class MemoryTests(unittest.TestCase):
    def modules(self):
        h = load("image_helpers", HERE.parent.parent / "image-only-delivery-20261008/remote_cutover.py")
        c = load("cors_apply", HERE / "remote_cutover_controlled.py")
        reader = load("memory_reader", HERE / "reprobe-memory-read.py")
        wrapper = load("memory_wrapper", HERE / "reprobe-memory-run.py")
        return h, c, reader, wrapper

    def observe(self, low=False, drift=False, foreign=False):
        h, c, reader, wrapper = self.modules()
        with tempfile.TemporaryDirectory(prefix="fod-memory-ro-") as folder:
            root = Path(folder).resolve()
            c.ROOT = root
            backup = root / reader.BACKUP_ID
            backup.mkdir()
            spec = c.SPECS["fodaveg"]
            state = {"service": "foreign" if foreign else "fodaveg", "status": "PREPARED",
                     "oldContainerId": spec["containerId"], "oldComposeSha": spec["base"],
                     "newComposeSha": spec["target"], "imageId": spec["imageId"]}
            (backup / "state.json").write_text(json.dumps(state))
            observed = {"id": spec["containerId"], "image": spec["oldImageId"], "running": True, "health": "healthy"}
            available = 1 if low else 3 * 1024**2
            memory = [(4 * 1024**2, available), (5 * 1024**2 if drift else 4 * 1024**2, available)]
            with patch.object(h, "run", return_value=json.dumps(observed).encode()) as commands, patch.object(reader, "memory", side_effect=memory):
                if foreign or drift:
                    with self.assertRaisesRegex(RuntimeError, "StateUnknown" if foreign else "SnapshotDrift"):
                        reader.projected()
                    self.assertEqual(commands.call_count, 0 if foreign else 1)
                    return
                value = reader.projected()
                self.assertEqual(commands.call_count, 2)
            self.assertEqual(value["memoryBudgetPassed"], not low)
            self.assertFalse(value["testCgroupAndTmpfsControlsProved"])
            self.assertTrue(wrapper.valid(value, 0))
            for mutation in ({"memTotalKiB": True}, {"memoryBudgetPassed": low}, {"privateHostPath": "private"}, {"testCgroupAndTmpfsControlsProved": True}):
                self.assertFalse(wrapper.valid({**value, **mutation}, 0))

    def test_capacity_is_metadata_only(self):
        self.observe()

    def test_insufficient_available_blocks_tmpfs(self):
        self.observe(low=True)

    def test_total_memory_drift_is_rejected(self):
        self.observe(drift=True)

    def test_foreign_state_zero_docker(self):
        self.observe(foreign=True)

    def test_counter_shapes_and_unrelated_values_never_export(self):
        _, _, reader, _ = self.modules()
        with tempfile.TemporaryDirectory(prefix="fod-memory-counters-") as folder:
            reader.MEMINFO = Path(folder) / "meminfo"
            reader.MEMINFO.write_bytes(b"MemTotal: 8388608 kB\nPrivateOther: never-export\nMemAvailable: 4194304 kB\n")
            self.assertEqual(reader.memory(), (8388608, 4194304))
            for body in (b"MemTotal: 1 MB\nMemAvailable: 1 kB\n", b"MemTotal: 1 kB\nMemAvailable: 2 kB\n",
                         b"MemTotal: 1 kB\nMemTotal: 1 kB\nMemAvailable: 1 kB\n", b"MemTotal: 1 kB\n"):
                reader.MEMINFO.write_bytes(body)
                with self.assertRaisesRegex(RuntimeError, "MemoryShapeUnknown"):
                    reader.memory()

    def test_source_drift_zero_ssh(self):
        _, _, _, wrapper = self.modules()
        with tempfile.TemporaryDirectory(prefix="fod-memory-wrapper-") as folder:
            root = Path(folder).resolve()
            source = root / "reader.py"
            source.write_text("foreign")
            argv = ["reader", "--execute", "--reader-sha256", "0" * 64, "--out", str(root / "observation.json")]
            with patch.object(wrapper, "HERE", root), patch.object(wrapper, "EXPECTED", {}), patch.object(wrapper, "READER", source), \
                    patch.object(sys, "argv", argv), patch.object(wrapper.subprocess, "run", side_effect=AssertionError("SSH forbidden")) as transport:
                with self.assertRaisesRegex(SystemExit, "source seal drift"):
                    wrapper.main()
                transport.assert_not_called()
                self.assertFalse((root / "observation.json").exists())


if __name__ == "__main__":
    unittest.main()
