"""Offline checks for Lumbre's diagnostic cutover and owned recovery."""

from itertools import product
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
HELPER = HERE.parent.parent / "image-only-delivery-20261008" / "remote_cutover.py"
SOURCE = HERE / "remote_apply_lumbre_controlled.py"
sys.path.insert(0, str(HERE))
import run_lumbre_controlled as wrapper


def load_remote():
    helper = types.ModuleType("image_helpers")
    sys.modules["image_helpers"] = helper
    exec(compile(HELPER.read_bytes(), str(HELPER), "exec"), helper.__dict__)
    remote = types.ModuleType("controlled")
    exec(compile(SOURCE.read_bytes(), str(SOURCE), "exec"), remote.__dict__)
    return helper, remote


class ControlledTests(unittest.TestCase):
    def test_failure_receipt_schema_rejects_unexpected_details(self):
        fields = {key: None for key in wrapper.BASELINE_FIELDS}
        value = {"status": "STOP_OLD_RUNTIME_RESTORED", "service": "lumbre-admin-pb",
                 "remoteWrites": True,
                 "backupId": "lumbre-admin-pb-20261009T000000Z-123",
                 "checkpoint": "INSTALLED_RUNTIME_1", "failureClass": "RuntimePeerDrift",
                 "createExit": None, "baselineFields": fields}
        self.assertTrue(wrapper.valid(value, 2, "apply", "lumbre-admin-pb"))
        self.assertFalse(wrapper.valid({**value, "private": "secret"}, 2, "apply",
                                       "lumbre-admin-pb"))
        self.assertFalse(wrapper.valid({**value, "checkpoint": "raw error"}, 2, "apply",
                                       "lumbre-admin-pb"))
        self.assertFalse(wrapper.valid({**value, "createExit": 17}, 2, "apply",
                                       "lumbre-admin-pb"))

    def test_create_exit_is_numeric_without_command_output(self):
        _, remote = load_remote()
        spec = remote.SPECS["lumbre-admin-pb"]
        result = subprocess.CompletedProcess([], 17)
        with patch.object(remote.subprocess, "run", return_value=result) as run:
            with self.assertRaises(remote.CreateExit) as failure:
                remote.create_selected(spec)
        self.assertEqual(failure.exception.code, 17)
        self.assertIn("--pull", run.call_args.args[0])
        self.assertEqual(run.call_args.kwargs["stdout"], subprocess.DEVNULL)
        self.assertEqual(run.call_args.kwargs["stderr"], subprocess.DEVNULL)

    def test_baseline_projection_reports_order_without_mount_sources(self):
        helper, remote = load_remote()
        spec = remote.SPECS["lumbre-admin-pb"]
        first = {"type": "bind", "name": "", "dest": "/pb/publish", "rw": True,
                 "source": "/private/first"}
        second = {"type": "volume", "name": "known", "dest": "/pb/pb_data", "rw": True,
                  "source": "/private/second"}
        old = {"mounts": [first, second],
               "networks": [{"name": "edge", "aliases": ["pocketbase", "lumbre-admin-pb"]}],
               "ports": {"8090/tcp": None}}
        current = {"mounts": [second, first],
                   "networks": [{"name": "edge", "aliases": ["lumbre-admin-pb", "pocketbase"]}],
                   "ports": {}}
        with patch.object(remote, "container_id", return_value="a" * 64), \
                patch.object(helper, "is_running", return_value=False), \
                patch.object(remote, "inspect", return_value=current):
            result = remote.baseline_comparison("lumbre-admin-pb", spec, old, "a" * 64)
        self.assertEqual(result, {"mountRawSame": False, "mountCanonicalSame": True,
                                  "aliasesRawSame": False, "aliasesCanonicalSame": True,
                                  "networkRawSame": False, "portsStoppedEquivalent": True})
        self.assertNotIn("private", repr(result))
        with patch.object(remote, "container_id", return_value="b" * 64):
            self.assertTrue(all(value is None for value in remote.baseline_comparison(
                "lumbre-admin-pb", spec, old, "a" * 64).values()))

    def test_owned_installed_failure_invokes_only_guarded_rollback(self):
        for failure_at, rollback_succeeds in product(
                ("runtime", "create", "foreign_create", "foreign_start"), (True, False)):
            with self.subTest(failure_at=failure_at, rollback_succeeds=rollback_succeeds), \
                    tempfile.TemporaryDirectory(prefix="lumbre-cors-controlled-",
                                                dir="/private/tmp") as folder:
                helper, remote = load_remote()
                root = Path(folder).resolve()
                compose = root / "compose.yml"
                env = root / ".env"
                compose.write_bytes(b"base\n")
                env.write_bytes(b"opaque\n")
                env.chmod(0o600)
                spec = {**remote.SPECS["lumbre-admin-pb"], "compose": compose,
                        "env": env, "volume": "owned-volume", "base": remote.digest(b"base\n"),
                        "target": remote.digest(b"target\n"), "imageId": "known-image",
                        "containerId": "a" * 64}
                _, compose_stat = remote.read_file(compose)
                _, env_stat = remote.read_file(env)
                state = {"body": b"base\n", "candidate": b"target\n", "mode": 0o644,
                         "composeIdentity": remote.identity(compose_stat),
                         "envSha": remote.digest(b"opaque\n"),
                         "envMode": 0o600, "envIdentity": remote.identity(env_stat),
                         "oldId": "a" * 64, "oldRuntime": {}, "volumeKiB": 1,
                         "budget": {}}
                running = {"value": True}
                calls = []

                def runtime(*args, **kwargs):
                    calls.append("runtime")
                    if failure_at == "runtime" and not running["value"]:
                        raise RuntimeError("RuntimePeerDrift")
                    return "a" * 64, {}

                def docker_run(argv, **kwargs):
                    calls.append("docker:" + " ".join(argv[:2]))
                    if argv[:2] == ["docker", "stop"]:
                        running["value"] = False
                        return b""
                    self.fail("unexpected Docker command")

                def guarded_rollback(*args):
                    calls.append("rollback")
                    if not rollback_succeeds or failure_at == "foreign_create":
                        raise RuntimeError("guard blocked")
                    return {"status": "CORS_ROLLED_BACK_AWAITING_PUBLIC_SMOKE",
                            "containerId": "a" * 64}

                original_gate = remote.gate_files
                def gate(*args):
                    calls.append("gate")
                    return original_gate(*args)

                original_checkpoint = remote.checkpoint
                def checkpoint(*args):
                    original_checkpoint(*args)
                    label = args[2]
                    if failure_at == "foreign_create" and label == "CREATE":
                        compose.write_bytes(b"foreign compose\n")
                    if failure_at == "foreign_start" and label == "START":
                        env.write_bytes(b"foreign env\n")

                def create(*args):
                    calls.append("create")
                    if failure_at == "create":
                        raise remote.CreateExit(17)
                    return 0

                with patch.object(remote, "ROOT", root / "backups"), \
                        patch.object(remote, "preflight", return_value=state), \
                        patch.object(remote, "runtime", side_effect=runtime), \
                        patch.object(remote, "create_selected", side_effect=create), \
                        patch.object(remote, "created_selection", return_value="b" * 64), \
                        patch.object(remote, "checkpoint", side_effect=checkpoint), \
                        patch.object(remote, "container_id", return_value="a" * 64), \
                        patch.object(remote, "gate_files", side_effect=gate), \
                        patch.object(remote, "compose_quiet"), \
                        patch.object(remote, "rollback", side_effect=guarded_rollback), \
                        patch.object(remote, "baseline_comparison", return_value={
                            key: True for key in wrapper.BASELINE_FIELDS}), \
                        patch.object(helper, "image_id", return_value="known-image"), \
                        patch.object(helper, "is_running", side_effect=lambda _: running["value"]), \
                        patch.object(helper, "volume_running_containers", return_value=[]), \
                        patch.object(helper, "backup_volume", return_value=("b" * 64, 10)), \
                        patch.object(helper, "isolated_restore_probe", return_value=(1, 1)), \
                        patch.object(helper, "run", side_effect=docker_run):
                    result = remote.apply("lumbre-admin-pb", spec)
                expected_step = {"runtime": "INSTALLED_RUNTIME_1", "create": "CREATE",
                                 "foreign_create": "CREATE", "foreign_start": "START"}
                expected_failure = {"runtime": "RuntimePeerDrift",
                                    "create": "CreateExitNonzero",
                                    "foreign_create": "ForeignFileChange",
                                    "foreign_start": "ForeignFileChange"}
                self.assertEqual(result["checkpoint"], expected_step[failure_at],
                                 (result, calls))
                self.assertEqual(result["failureClass"], expected_failure[failure_at])
                self.assertEqual(result["createExit"], 17 if failure_at == "create" else None)
                self.assertEqual(calls.count("rollback"),
                                 0 if failure_at == "foreign_start" else 1)
                restored = rollback_succeeds and failure_at in ("runtime", "create")
                self.assertEqual(result["status"],
                                 "STOP_OLD_RUNTIME_RESTORED" if restored else
                                 "STOP_NEEDS_OPERATOR")
                if failure_at == "foreign_create":
                    self.assertEqual(compose.read_bytes(), b"foreign compose\n")
                    self.assertEqual(calls.count("create"), 0)
                if failure_at == "foreign_start":
                    self.assertEqual(env.read_bytes(), b"foreign env\n")
                    self.assertNotIn("docker:docker start", calls)
                self.assertTrue(wrapper.valid(result, 2, "apply", "lumbre-admin-pb"))


if __name__ == "__main__":
    unittest.main()
