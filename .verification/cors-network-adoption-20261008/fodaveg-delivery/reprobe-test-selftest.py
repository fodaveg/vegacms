"""Offline owned-resource state machine; subprocess/Docker never invoked."""
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
    def exercise(self, primary_fail=False, cleanup_fail=False, budget_fail=False, collision=False, unknown_create=False, replace_archive=False):
        h = load("image_helpers", HERE.parent.parent / "image-only-delivery-20261008/remote_cutover.py")
        c = load("cors_apply", HERE / "remote_cutover_controlled.py")
        load("local_volume_constructor", HERE / "reprobe-local-volume.py")
        core = load("test_core", HERE / "reprobe-test-core.py")
        core.OPERATOR_RECORD_ID = "fodaveg-reprobe-20261009T001500Z-1234"
        with tempfile.TemporaryDirectory(prefix="fod-test-reprobe-") as folder:
            root = Path(folder).resolve()
            c.ROOT = root
            daemon = root / "private-daemon"
            (daemon / "volumes").mkdir(parents=True)
            backup = root / core.BACKUP_ID
            backup.mkdir(mode=0o700)
            spec = c.SPECS["fodaveg"]
            state = {"service": "fodaveg", "status": "PREPARED", "oldContainerId": spec["containerId"],
                     "oldComposeSha": spec["base"], "newComposeSha": spec["target"], "imageId": spec["imageId"]}
            (backup / "state.json").write_text(json.dumps(state))
            archive = backup / "data.tgz"
            data = b"private TEST payload"
            with tarfile.open(archive, "w:gz") as tar:
                member = tarfile.TarInfo("./private.db")
                member.size = len(data)
                tar.addfile(member, io.BytesIO(data))
            archive.chmod(0o600)
            core.ARCHIVE_SHA = hashlib.sha256(archive.read_bytes()).hexdigest()
            core.ARCHIVE_IDENTITY = c.identity(archive.stat())
            core.FILES, core.EXPANDED = 1, len(data)
            extractor_image = "sha256:" + "e" * 64
            containers, volume, calls, started_fds = {}, None, [], []

            def own_record():
                paths = list(root.glob("fodaveg-reprobe-*/reprobe.json"))
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
                    role = "extractor" if record["phase"] == "CREATE_EXTRACTOR" else "pb"
                    fixed_id = "a" * 64 if role == "extractor" else "b" * 64
                    image = extractor_image if role == "extractor" else core.IMAGE
                    name = record[role]
                    containers[fixed_id] = {"id": fixed_id, "image": image, "name": "/" + name,
                                           "running": False, "status": "created", "exitCode": 0, "network": "none",
                                           "bindingsNone": True, "networks": ["none"],
                                           "readonly": role == "extractor", "entrypoint": ["/bin/tar"] if role == "extractor" else ["/pb/fodaveg-pb"],
                                           "cmd": ["-C", "/target", "-xzf", "-"] if role == "extractor" else ["--dir", "/pb/pb_data", "serve", "--http=127.0.0.1:8090"],
                                           "owner": record["owner"], "nonce": record["nonce"],
                                           "mounts": [{"type": "volume", "name": record["volume"], "dest": "/target" if role == "extractor" else "/pb/pb_data", "rw": True}]}
                    return result(b"unknown-create-output" if unknown_create else (fixed_id + "\n").encode())
                if argv[:2] == ["docker", "start"]:
                    record = own_record()
                    selected = containers[argv[-1]]
                    role = "extractor" if argv[-1] == record["extractorId"] else "pb"
                    self.assertEqual(argv[-1], record[role + "Id"])
                    self.assertEqual(record["phase"], "START_EXTRACTOR" if role == "extractor" else "START_PB")
                    if role == "extractor":
                        self.assertIsNotNone(stdin)
                        self.assertEqual(c.identity(__import__("os").fstat(stdin.fileno())), core.ARCHIVE_IDENTITY)
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
            def budget(mountpoint, initial=False, pb_only=False):
                if budget_fail and not initial and mountpoint != daemon / "volumes":
                    raise RuntimeError("BudgetInsufficient")
                return original_budget(mountpoint, initial, pb_only)

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
                    patch.object(core.Journal, "save", save):
                journal = core.reprobe()
            self.assertTrue(journal.value["finished"])
            if not replace_archive:
                self.assertEqual(c.identity(archive.stat()), core.ARCHIVE_IDENTITY)
            self.assertTrue(all(spec["containerId"] not in argv for argv in calls if argv[1] in {"stop", "start", "rm", "create"}))
            if unknown_create:
                self.assertEqual(journal.value["primary"], {"phase": "CREATE_EXTRACTOR", "failureClass": "ContainerOwnershipUnknown", "commandExit": None})
                self.assertIsNone(journal.value["extractorId"])
                self.assertEqual([item["failureClass"] for item in journal.value["cleanup"]], ["CreationOutcomeUnresolved", "ContainerOwnershipUnknown"])
                self.assertFalse(any(argv[1] in {"start", "stop", "rm"} or argv[:3] == ["docker", "volume", "rm"] for argv in calls))
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
                self.assertFalse(any(argv[:2] == ["docker", "create"] for argv in calls))
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

    def test_parent_false_budget_zero_archive_read_and_zero_test_allocation(self):
        load("image_helpers", HERE.parent.parent / "image-only-delivery-20261008/remote_cutover.py")
        load("cors_apply", HERE / "remote_cutover_controlled.py")
        load("local_volume_constructor", HERE / "reprobe-local-volume.py")
        core = load("blocked_core", HERE / "reprobe-test-core.py")
        with patch.object(core, "old_pin"), patch.object(core, "backup_state"), patch.object(core, "allocator", return_value=Path("/known-parent")), \
                patch.object(core, "budget", side_effect=RuntimeError("BudgetInsufficient")), patch.object(core, "Archive") as archive, patch.object(core, "Journal") as journal:
            result = core.entry()
            archive.assert_not_called()
            journal.assert_not_called()
            self.assertEqual(result["status"], "PRECHECK_STOP")
            self.assertEqual(result["primaryFailure"]["failureClass"], "BudgetInsufficient")
            self.assertFalse(result["remoteWrites"])

    def test_journal_replacement_preserved_by_fullidentity_cas(self):
        load("image_helpers", HERE.parent.parent / "image-only-delivery-20261008/remote_cutover.py")
        c = load("cors_apply", HERE / "remote_cutover_controlled.py")
        load("local_volume_constructor", HERE / "reprobe-local-volume.py")
        core = load("cas_core", HERE / "reprobe-test-core.py")
        core.OPERATOR_RECORD_ID = "fodaveg-reprobe-20261009T001500Z-1234"
        with tempfile.TemporaryDirectory(prefix="fod-reprobe-cas-") as folder:
            c.ROOT = Path(folder).resolve()
            journal = core.Journal()
            foreign = journal.directory / "foreign.json"
            foreign.write_bytes(b"foreign")
            foreign.chmod(0o600)
            foreign.replace(journal.path)
            with self.assertRaisesRegex(RuntimeError, "ForeignFileChange"):
                journal.save("CREATE_VOLUME")
            self.assertEqual(journal.path.read_bytes(), b"foreign")

    def test_container_network_and_boolean_shapes_are_strict(self):
        load("image_helpers", HERE.parent.parent / "image-only-delivery-20261008/remote_cutover.py")
        load("cors_apply", HERE / "remote_cutover_controlled.py")
        load("local_volume_constructor", HERE / "reprobe-local-volume.py")
        core = load("shape_core", HERE / "reprobe-test-core.py")
        journal = types.SimpleNamespace(owner="owned", nonce="a" * 32, value={"extractorId": "b" * 64, "extractor": "own-tar", "volume": "own-volume"})
        image = "sha256:" + "e" * 64
        raw = {"id": "b" * 64, "image": image, "name": "/own-tar", "running": False, "status": "created", "exitCode": 0,
               "network": "none", "readonly": True, "bindingsNone": True, "networks": ["none"], "entrypoint": ["/bin/tar"],
               "cmd": ["-C", "/target", "-xzf", "-"], "owner": "owned", "nonce": "a" * 32,
               "mounts": [{"type": "volume", "name": "own-volume", "dest": "/target", "rw": True}]}
        mutations = ({"running": 0}, {"exitCode": False}, {"networks": ["none", "unrelated-private-network"]},
                     {"mounts": [{"type": "volume", "name": "own-volume", "dest": "/target", "rw": 1}]})
        for mutation in mutations:
            with patch.object(core, "command", return_value=types.SimpleNamespace(stdout=json.dumps({**raw, **mutation}).encode())):
                with self.assertRaisesRegex(RuntimeError, "ContainerOwnershipUnknown"):
                    core.container_proof(journal, "extractor", image)


if __name__ == "__main__":
    unittest.main()
