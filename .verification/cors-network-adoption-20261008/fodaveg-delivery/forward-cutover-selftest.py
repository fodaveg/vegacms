"""Offline owned-resource state machine; subprocess/Docker never invoked."""
import ast
import gzip
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


class ReprobeTests(unittest.TestCase):
    def exercise(self, primary_fail=False, cleanup_fail=False, budget_fail=False, collision=False, unknown_create=False, replace_archive=False, snapshot_fail=False):
        h = load("image_helpers", HERE.parent.parent / "image-only-delivery-20261008/remote_cutover.py")
        c = load("cors_apply", HERE / "remote_cutover_controlled.py")
        load("local_volume_constructor", HERE / "reprobe-local-volume.py")
        load("bounded_capture", HERE.parents[1] / "worktrees/caddy-referenced-env-20261008/.verification/release-adoption-plan-20261008/logs-selective-next-step/capture.py")
        core = load("test_core", HERE / "forward-probe.py")
        core.OPERATOR_RECORD_ID = "fodaveg-reprobe-20261009T001500Z-1234"
        with tempfile.TemporaryDirectory(prefix="fod-test-reprobe-") as folder:
            root = Path(folder).resolve()
            c.ROOT = root
            daemon = root / "private-daemon"
            (daemon / "volumes").mkdir(parents=True)
            backup = root / "fodaveg-20261009T001500Z-1234"
            backup.mkdir(mode=0o700)
            spec = c.SPECS["fodaveg"]
            state = {"service": "fodaveg", "status": "PREPARED", "oldContainerId": spec["containerId"],
                     "oldComposeSha": spec["base"], "newComposeSha": spec["target"], "imageId": spec["imageId"]}
            (backup / "state.json").write_text(json.dumps(state))
            archive = backup / "data.tgz"
            fixture = root / "input.tgz"
            data = b"private TEST payload"
            with tarfile.open(fixture, "w:gz") as tar:
                member = tarfile.TarInfo("./private.db")
                member.size = len(data)
                tar.addfile(member, io.BytesIO(data))
            fixture_bytes = fixture.read_bytes()
            extractor_image = "sha256:" + "e" * 64
            containers, volume, calls, started_fds = {}, None, [], []

            def own_record():
                paths = list(root.glob("*/forward-probe.json"))
                self.assertEqual(len(paths), 1)
                return json.loads(paths[0].read_bytes())

            def result(body=b"", code=0):
                return types.SimpleNamespace(stdout=body, returncode=code)

            def command(argv, timeout=30, stdin=None, allowed=(0,)):
                nonlocal volume
                calls.append(argv)
                self.assertNotIn("--rm", argv)
                if argv[:2] == ["docker", "inspect"]:
                    return result(json.dumps({"id": spec["containerId"], "image": spec["oldImageId"], "running": True, "health": "healthy"}).encode())
                if argv[:2] == ["docker", "info"]:
                    return result(json.dumps(str(daemon)).encode())
                if argv[:3] == ["docker", "volume", "inspect"]:
                    if volume is None:
                        if collision:
                            return result(b'"foreign"')
                        return result(code=1)
                    return result(json.dumps(volume).encode())
                if argv[:3] == ["docker", "volume", "create"]:
                    record = own_record()
                    self.assertEqual(record["phase"], "CREATE_VOLUME")
                    self.assertEqual(argv[3:5], ["--driver", "local"])
                    self.assertNotIn("--opt", argv)
                    name = argv[-1]
                    mountpoint = daemon / "volumes" / name / "_data"
                    mountpoint.mkdir(parents=True)
                    volume = {"name": name, "driver": "local", "optionsEmpty": True, "mountpoint": str(mountpoint),
                              "created": "known-creation", "owner": record["owner"], "nonce": record["nonce"]}
                    return result((name + "\n").encode())
                if argv[:3] == ["docker", "volume", "rm"]:
                    record = own_record()
                    self.assertFalse(any(k in containers for k in (record["pbId"], record["extractorId"])))
                    if cleanup_fail:
                        self.assertEqual(record["primary"]["commandExit"], 17)
                        raise core.CommandExit(1)
                    volume = None
                    return result()
                if argv[:3] == ["docker", "container", "inspect"]:
                    if argv[-1] not in containers:
                        return result(code=1)
                    return result(json.dumps(containers[argv[-1]]).encode())
                if argv[:2] == ["docker", "create"]:
                    record = own_record()
                    role = "snapshot" if record["phase"] == "CREATE_SNAPSHOT" else "extractor" if record["phase"] == "CREATE_EXTRACTOR" else "pb"
                    fixed_id = "c" * 64 if role == "snapshot" else "a" * 64 if role == "extractor" else "b" * 64
                    image = extractor_image if role != "pb" else core.IMAGE
                    name = record[role]
                    containers[fixed_id] = {"id": fixed_id, "image": image, "name": "/" + name,
                                           "running": False, "status": "created", "exitCode": 0, "network": "none",
                                           "bindingsNone": True, "networks": ["none"],
                                           "readonly": role != "pb", "entrypoint": ["/bin/tar"] if role != "pb" else ["/pb/fodaveg-pb"],
                                           "cmd": ["-C", "/source", "-czf", "-", "."] if role == "snapshot" else ["-C", "/target", "-xzf", "-"] if role == "extractor" else ["--dir", "/pb/pb_data", "serve", "--http=127.0.0.1:8090"],
                                           "owner": record["owner"], "nonce": record["nonce"],
                                           "mounts": [{"type": "volume", "name": spec["volume"] if role == "snapshot" else record["volume"], "dest": "/source" if role == "snapshot" else "/target" if role == "extractor" else "/pb/pb_data", "rw": role != "snapshot"}]}
                    return result(b"unknown-create-output" if unknown_create and role == "extractor" else (fixed_id + "\n").encode())
                if argv[:2] == ["docker", "start"]:
                    record = own_record()
                    selected = containers[argv[-1]]
                    role = "extractor" if argv[-1] == record["extractorId"] else "pb"
                    self.assertEqual(argv[-1], record[role + "Id"])
                    self.assertEqual(record["phase"], "START_EXTRACTOR" if role == "extractor" else "START_PB")
                    if role == "extractor":
                        self.assertIsNotNone(stdin)
                        self.assertEqual(c.identity(__import__("os").fstat(stdin.fileno())), record["archive"]["identity"])
                        started_fds.append(stdin.fileno())
                        with tarfile.open(fileobj=stdin, mode="r:gz") as tar:
                            member = next(iter(tar))
                            (Path(volume["mountpoint"]) / "private.db").write_bytes(tar.extractfile(member).read())
                        selected.update(status="exited", exitCode=0)
                    elif primary_fail:
                        raise core.CommandExit(17)
                    else:
                        selected.update(status="running", running=True)
                    return result()
                if argv[:2] == ["docker", "exec"]:
                    return result(b'{"code":200,"message":"private native body"}')
                if argv[:2] == ["docker", "stop"]:
                    containers[argv[-1]].update(running=False, status="exited")
                    return result()
                if argv[:2] == ["docker", "rm"]:
                    del containers[argv[-1]]
                    return result()
                self.fail("Unexpected fake command")

            original_budget = core.budget
            def budget(mountpoint, backup, initial=False, pb_only=False, snapshot=False):
                if budget_fail and not initial and mountpoint != daemon / "volumes":
                    raise RuntimeError("BudgetInsufficient")
                return original_budget(mountpoint, backup, initial, pb_only, snapshot)

            def capture(argv, timeout, limit):
                record = own_record()
                self.assertEqual(record["snapshotId"], argv[-1])
                self.assertEqual(record["phase"], "START_SNAPSHOT")
                self.assertEqual(limit, core.SNAPSHOT_CAP)
                if snapshot_fail:
                    raise RuntimeError("CAPTURE_LIMIT_OR_TIMEOUT")
                containers[argv[-1]].update(status="exited", exitCode=0)
                return result(fixture_bytes)

            fs = types.SimpleNamespace(f_bavail=10**7, f_frsize=1024)
            original_save = core.Journal.save
            def save(journal, phase=None):
                original_save(journal, phase)
                if replace_archive and phase == "START_EXTRACTOR":
                    foreign = backup / "foreign.tgz"
                    foreign.write_bytes(b"foreign")
                    foreign.chmod(0o600)
                    foreign.replace(archive)
            with patch.object(core, "command", side_effect=command), patch.object(core, "budget", side_effect=budget), \
                    patch.object(h, "image_id", side_effect=lambda value: core.IMAGE if value == core.IMAGE else extractor_image), \
                    patch.object(core.os, "statvfs", return_value=fs), patch.object(core.subprocess, "run", side_effect=AssertionError("Real subprocess forbidden")), \
                    patch.object(core.Journal, "save", save), patch.object(core, "capture_process", side_effect=capture),                     patch.object(core, "quiesced"), patch.object(core, "memory_budget", return_value=10**7):
                try:
                    core.probe(backup, spec, state)
                except RuntimeError as exc:
                    self.assertEqual(str(exc), "ProbeFailed")
                journal = core.ACTIVE
            self.assertTrue(journal.value["finished"])
            self.assertTrue(all(spec["containerId"] not in argv for argv in calls if argv[1] in {"stop", "start", "rm", "create"}))
            if snapshot_fail:
                self.assertEqual(journal.value["primary"]["failureClass"], "SnapshotBoundExceeded")
                self.assertFalse(archive.exists())
                self.assertFalse(any(argv[:3] == ["docker", "volume", "create"] for argv in calls))
                self.assertEqual(containers, {})
                return
            if unknown_create:
                self.assertEqual(journal.value["primary"], {"phase": "CREATE_EXTRACTOR", "failureClass": "ContainerOwnershipUnknown", "commandExit": None})
                self.assertIsNone(journal.value["extractorId"])
                self.assertEqual([item["failureClass"] for item in journal.value["cleanup"]], ["CreationOutcomeUnresolved", "ContainerOwnershipUnknown"])
                self.assertFalse(any(argv[:3] == ["docker", "volume", "rm"] or argv[:2] == ["docker", "start"] for argv in calls))
            elif replace_archive:
                self.assertEqual(journal.value["primary"]["phase"], "START_EXTRACTOR")
                self.assertEqual(journal.value["primary"]["failureClass"], "ArchiveDrift")
                self.assertEqual(archive.read_bytes(), b"foreign")
                self.assertFalse(any(argv[:2] == ["docker", "start"] for argv in calls))
                self.assertEqual(journal.value["cleanup"], [])
            elif primary_fail:
                self.assertEqual(journal.value["primary"], {"phase": "START_PB", "failureClass": "CommandExitNonzero", "commandExit": 17})
                if cleanup_fail:
                    self.assertEqual(journal.value["cleanup"], [{"phase": "CLEANUP_VOLUME", "failureClass": "CommandExitNonzero", "commandExit": 1}])
            elif budget_fail:
                self.assertEqual(journal.value["primary"]["phase"], "MOUNT_BUDGET")
                self.assertFalse(any(argv[:2] == ["docker", "create"] and "/target:rw" in " ".join(argv) for argv in calls))
            elif collision:
                self.assertEqual(journal.value["primary"]["failureClass"], "TestCollision")
                self.assertFalse(any(argv[:3] in (["docker", "volume", "create"], ["docker", "volume", "rm"]) for argv in calls))
            else:
                self.assertIsNone(journal.value["primary"])
                self.assertEqual(journal.value["cleanup"], [])
                self.assertEqual(len(started_fds), 1)
                self.assertEqual(journal.value["filesVerified"], 1)
                self.assertIsNone(volume)
                self.assertEqual(containers, {})

    def test_positive_owned_native_boundary_and_cleanup(self):
        self.exercise()

    def test_primary_exit_survives_cleanup_exit(self):
        self.exercise(primary_fail=True, cleanup_fail=True)

    def test_actual_mount_budget_blocks_all_container_creation(self):
        self.exercise(budget_fail=True)

    def test_collision_has_zero_create_and_zero_foreign_cleanup(self):
        self.exercise(collision=True)

    def test_unknown_create_outcome_is_recorded_without_blind_cleanup(self):
        self.exercise(unknown_create=True)

    def test_archive_replacement_after_hash_blocks_start_and_preserves_foreign(self):
        self.exercise(replace_archive=True)

    def modules(self):
        h = load("image_helpers", HERE.parent.parent / "image-only-delivery-20261008/remote_cutover.py")
        c = load("cors_apply", HERE / "remote_cutover_controlled.py")
        load("local_volume_constructor", HERE / "reprobe-local-volume.py")
        load("bounded_capture", HERE.parents[1] / "worktrees/caddy-referenced-env-20261008/.verification/release-adoption-plan-20261008/logs-selective-next-step/capture.py")
        f = load("forward_probe", HERE / "forward-probe.py")
        return h, c, f

    def test_snapshot_capture_limit_cleans_known_worker_without_clone(self):
        self.exercise(snapshot_fail=True)

    def test_stopped_guard_is_explicit_and_does_not_accept_running_old(self):
        h, c, f = self.modules()
        state = {"composeIdentity": [1], "envSha": "sha", "envIdentity": [2], "oldRuntime": {"baseline": True}, "oldId": "selected"}
        spec = c.SPECS["fodaveg"]
        with patch.object(c, "gate_files"), patch.object(c, "runtime") as runtime,                 patch.object(h, "is_running", return_value=False), patch.object(h, "volume_running_containers", return_value=[]):
            f.quiesced(spec, state)
            self.assertFalse(runtime.call_args.kwargs["require_healthy"])
            self.assertEqual(runtime.call_args.kwargs["expected_id"], "selected")
            self.assertEqual(runtime.call_args.kwargs["baseline"], state["oldRuntime"])
            self.assertEqual(runtime.call_args.kwargs["volume_users"], [])
        with patch.object(c, "gate_files"), patch.object(c, "runtime") as runtime, patch.object(h, "is_running", return_value=True):
            with self.assertRaisesRegex(RuntimeError, "QuiescenceUnknown"):
                f.quiesced(spec, state)
            runtime.assert_not_called()

    def test_false_parent_budget_has_zero_journal_snapshot_or_clone(self):
        _, _, f = self.modules()
        with patch.object(f, "quiesced"), patch.object(f, "allocator", return_value=Path("/known")),                 patch.object(f, "budget", side_effect=RuntimeError("BudgetInsufficient")), patch.object(f, "Journal") as journal, patch.object(f, "snapshot") as snapshot:
            with self.assertRaisesRegex(RuntimeError, "BudgetInsufficient"):
                f.probe(Path("/known-backup"), {}, {})
            journal.assert_not_called()
            snapshot.assert_not_called()

    def test_huge_header_rejected_before_decompressing_member(self):
        _, c, f = self.modules()
        with tempfile.TemporaryDirectory() as folder:
            backup = Path(folder).resolve()
            member = tarfile.TarInfo("./private.db")
            member.size = f.EXPANDED_CAP + 1
            path = backup / "data.tgz"
            path.write_bytes(gzip.compress(member.tobuf() + bytes(1024)))
            with self.assertRaisesRegex(RuntimeError, "SnapshotBoundExceeded"):
                f.Archive(backup, c.identity(path.stat()))

    def test_final_false_budget_blocks_stop_after_checkpoint_and_records_failure(self):
        h, _, f = self.modules()
        remote = load("forward_remote", HERE / "remote_cutover_forward.py")
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            backup = root / "fodaveg-20261009T001500Z-1234"
            backup.mkdir()
            spec = {**remote.SPECS["fodaveg"], "env": root / "env"}
            spec["env"].write_bytes(b"private unit fixture")
            env_stat = spec["env"].stat()
            state = {"body": b"compose fixture", "candidate": b"new fixture", "envSha": remote.digest(spec["env"].read_bytes()),
                     "envIdentity": remote.identity(env_stat), "envMode": 0o600, "mode": 0o600,
                     "composeIdentity": [1], "oldId": spec["containerId"], "oldRuntime": {}}
            with patch.object(remote, "preflight", return_value=state), patch.object(f, "make_backup", return_value=backup),                     patch.object(remote, "runtime"), patch.object(remote, "gate_files"),                     patch.object(f, "preflight_budget", side_effect=RuntimeError("BudgetInsufficient")),                     patch.object(h, "image_id", return_value=spec["imageId"]), patch.object(h, "run") as run:
                value = remote.apply("fodaveg", spec)
                run.assert_not_called()
                self.assertEqual(value["failureClass"], "BudgetInsufficient")
                self.assertEqual(json.loads((backup / "state.json").read_bytes())["failure"]["failureClass"], "BudgetInsufficient")

    def test_runtime_cas_create_and_rollback_invariants_preserved(self):
        before = ast.parse((HERE / "remote_cutover_controlled.py").read_bytes())
        after = ast.parse((HERE / "remote_cutover_forward.py").read_bytes())
        names = ("runtime", "patch", "replace_owned", "gate_files", "created_selection", "create_selected", "wait_owned_old", "rollback")
        def selected(tree, name):
            return ast.dump(next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name), include_attributes=False)
        for name in names:
            self.assertEqual(selected(before, name), selected(after, name), name)
        # The installed CREATE/START branches are unchanged byte for byte.
        old = (HERE / "remote_cutover_controlled.py").read_text()
        new = (HERE / "remote_cutover_forward.py").read_text()
        start = '        staged = backup / "compose.new"'
        end = '        return {"status": "CORS_APPLIED_AWAITING_PUBLIC_SMOKE"'
        self.assertEqual(old[old.index(start):old.index(end)], new[new.index(start):new.index(end)])


if __name__ == "__main__":
    unittest.main()
