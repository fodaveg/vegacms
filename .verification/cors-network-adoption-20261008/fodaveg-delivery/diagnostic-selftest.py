"""Offline tests of closed diagnostic output and fixed-container process reads."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from contextlib import ExitStack
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def load(name, path):
    module = types.ModuleType(name)
    module.__file__ = str(path)
    sys.modules[name] = module
    exec(compile(path.read_bytes(), str(path), "exec"), module.__dict__)
    return module


class DiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.h = load("image_helpers", HERE.parent.parent / "image-only-delivery-20261008/remote_cutover.py")
        self.c = load("cors_apply", HERE / "remote_cutover.py")
        self.reader = load("diagnostic_reader", HERE / "diagnostic-read.py")
        self.wrapper = load("diagnostic_wrapper", HERE / "diagnostic-run.py")

    def observe(self, cmd=None, failure=None, foreign=False, drift=False):
        with tempfile.TemporaryDirectory(prefix="fod-diagnostic-") as folder, ExitStack() as stack:
            root = Path(folder).resolve()
            self.c.ROOT = root
            backup = root / self.reader.BACKUP_ID
            backup.mkdir(mode=0o700)
            spec = copy.deepcopy(self.c.SPECS["fodaveg"])
            spec.update(compose=root / "compose.yml", env=root / ".env")
            spec["compose"].write_bytes(b"target")
            spec["env"].write_bytes(b"private-marker-not-exported")
            spec["env"].chmod(0o600)
            spec["target"] = self.c.digest(b"target")
            spec["envSha"] = self.c.digest(spec["env"].read_bytes())
            self.c.SPECS["fodaveg"] = spec
            selected_id = "a" * 64
            state = {"service": "foreign" if foreign else "fodaveg", "status": "CREATED",
                     "oldComposeSha": spec["base"], "newComposeSha": spec["target"],
                     "imageId": spec["imageId"], "oldContainerId": spec["containerId"],
                     "newContainerId": selected_id, "envSha": spec["envSha"],
                     "envIdentity": self.c.identity(spec["env"].stat()),
                     "installedComposeIdentity": self.c.identity(spec["compose"].stat())}
            (backup / "state.json").write_text(json.dumps(state))
            expected = self.h.OLD_RUNTIME["fodaveg"]
            expected["mounts"] = []
            raw = {"imageId": spec["imageId"], "imageRef": spec["image"], "health": "healthy",
                   "cmd": cmd, "mounts": [], "ports": {"8090/tcp": None, "4321/tcp": None},
                   "networks": [{"name": "edge", "aliases": expected["aliases"]}]}
            commands = []

            def run(command, **kwargs):
                commands.append(command)
                if command[:2] == ["docker", "exec"]:
                    self.assertEqual(command[2], selected_id)
                    self.assertNotIn('\\"', command[-1])
                    return b"fodaveg-pb\nnode\ntini\n"
                if "exposed" in command[-2]:
                    return b'{"exposed":{"8090/tcp":{},"4321/tcp":{}},"bindings":null}'
                return json.dumps({"project": spec["project"], "service": spec["service"]}).encode()

            stack.enter_context(patch.object(self.h, "run", side_effect=run))
            stack.enter_context(patch.object(self.h, "is_running", return_value=True))
            stack.enter_context(patch.object(self.h, "volume_running_containers", return_value=["fodaveg"]))
            stack.enter_context(patch.object(self.c, "inspect", return_value=raw))
            ids = [selected_id, selected_id, "b" * 64] if drift else [selected_id] * 3
            stack.enter_context(patch.object(self.c, "container_id", side_effect=ids))
            runtime = stack.enter_context(patch.object(self.c, "runtime", side_effect=failure))
            argv = self.h.OLD_PB_ARGV["fodaveg"] + ["--origins=" + spec["origin"]]
            pb = stack.enter_context(patch.object(self.c, "pb_argv", return_value=argv))
            if foreign:
                with self.assertRaisesRegex(RuntimeError, "StateUnknown"):
                    self.reader.projected()
                self.assertEqual(commands, [])
                return
            value = self.reader.projected()
            self.assertTrue(self.wrapper.valid(value, 0))
            self.assertNotIn("private-marker", json.dumps(value))
            self.assertLess(len(json.dumps(value)), 2048)
            runtime.assert_called_once_with("fodaveg", spec, True, expected_id=selected_id,
                                            require_healthy=True, volume_users=["fodaveg"])
            pb.assert_called_once_with(selected_id)
            self.assertEqual(value["processCounts"], {"pb": 1, "node": 1, "tini": 1})
            return value

    def test_null_and_empty_cmd_remain_distinct(self):
        self.assertEqual(self.observe()["commandClass"], "DEFAULT_NONE")
        value = self.observe(cmd=[], failure=RuntimeError("RuntimeImageDrift"))
        self.assertEqual(value["commandClass"], "EMPTY_ARRAY")
        self.assertEqual(value["runtimeGuard"], "RuntimeImageDrift")

    def test_unknown_error_and_arguments_are_not_exported(self):
        value = self.observe(cmd=["private-argument"], failure=RuntimeError("private-exception"))
        self.assertEqual(value["commandClass"], "OTHER")
        self.assertEqual(value["runtimeGuard"], "OTHER_READ_UNAVAILABLE")
        self.assertNotIn("private-", json.dumps(value))
        self.assertFalse(self.wrapper.valid({**value, "Health.Output": "private"}, 0))
        self.assertFalse(self.wrapper.valid({**value, "processCounts": {"pb": True, "node": 1, "tini": 1}}, 0))

    def test_foreign_metadata_stops_before_runtime(self):
        self.observe(foreign=True)

    def test_selected_container_drift_is_visible(self):
        self.assertFalse(self.observe(drift=True)["snapshotStable"])

    def test_stop_output_is_closed_and_exit_bound(self):
        value = {"status": "STOP_READ_UNAVAILABLE", "backupId": self.reader.BACKUP_ID,
                 "remoteWrites": False, "privateValuesExported": False}
        self.assertTrue(self.wrapper.valid(value, 2))
        self.assertFalse(self.wrapper.valid(value, 0))
        self.assertFalse(self.wrapper.valid({**value, "error": "private"}, 2))


if __name__ == "__main__":
    unittest.main()
