"""Offline Fodaveg image-only ownership, phase and rollback tests."""
import hashlib,json,os,sys,tempfile,types,unittest
from pathlib import Path
from contextlib import ExitStack
from unittest.mock import patch
import run_cutover as run_once
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent

def load_remote():
    helper=types.ModuleType("image_helpers")
    sys.modules["image_helpers"]=helper
    path=ROOT/"image-only-delivery-20261008/remote_cutover.py"
    exec(compile(path.read_bytes(),str(path),"exec"),helper.__dict__)
    remote=types.ModuleType("fodaveg_cutover")
    path=HERE/"remote_cutover.py"
    exec(compile(path.read_bytes(),str(path),"exec"),remote.__dict__)
    return helper,remote

class CutoverTests(unittest.TestCase):
    def test_exact_image_only_delta(self):
        _, remote = load_remote()
        body = (ROOT / "worktrees/fodaveg-vega-adoption-20261008/deploy/compose.yml").read_bytes()
        spec = remote.SPECS["fodaveg"]
        result = remote.patch("fodaveg", spec, body)
        self.assertEqual(remote.digest(result), spec["target"])
        self.assertEqual(result.replace(('    image: ' + spec["imageId"] + '\n').encode(),
                         b'    image: ${FODAVEG_IMAGE:?Define FODAVEG_IMAGE con un tag SHA inmutable}\n'), body)
        with self.assertRaises(RuntimeError):
            remote.patch("fodaveg", spec, body + b"foreign")

    def test_runtime_requires_origins_exact_trio_and_fixed_identity(self):
        helper, remote = load_remote()
        spec = remote.SPECS["fodaveg"]
        expected = helper.OLD_RUNTIME["fodaveg"]
        source = "/known-test-volume"
        expected["mounts"] = [("volume", spec["volume"], "/pb/pb_data", True,
                               hashlib.sha256(source.encode()).hexdigest())]
        raw = {"imageId": spec["imageId"], "imageRef": spec["image"],
               "entrypoint": expected["entrypoint"], "cmd": None, "health": "healthy",
               "ports": {"8090/tcp": None, "4321/tcp": None},
               "mounts": [{"type": "volume", "name": spec["volume"], "source": source,
                           "dest": "/pb/pb_data", "rw": True}],
               "networks": [{"name": "edge", "aliases": ["fodaveg", "fodaveg"]}]}
        argv = helper.OLD_PB_ARGV["fodaveg"] + ["--origins=" + spec["origin"]]
        with patch.object(remote, "inspect", return_value=raw), \
                patch.object(remote, "container_id", return_value="a" * 64), \
                patch.object(helper, "image_id", return_value=spec["imageId"]), \
                patch.object(helper, "volume_running_containers", return_value=["fodaveg"]), \
                patch.object(remote, "pb_argv", return_value=argv) as pb, \
                patch.object(helper, "run", return_value=b"fodaveg-pb\nnode\ntini\n") as run:
            remote.runtime("fodaveg", spec, True, expected_id="a" * 64)
            shell = run.call_args.args[0][-1]
            self.assertIn('read -r c < "$f"', shell)
            self.assertNotIn('\\"', shell)
            pb.return_value = helper.OLD_PB_ARGV["fodaveg"]
            with self.assertRaisesRegex(RuntimeError, "RuntimeProcessDrift"):
                remote.runtime("fodaveg", spec, True)
            pb.return_value = argv
            run.return_value = b"fodaveg-pb\nnode\nnode\ntini\n"
            with self.assertRaisesRegex(RuntimeError, "RuntimeProcessDrift"):
                remote.runtime("fodaveg", spec, True)
            run.return_value = b"fodaveg-pb\nnode\ntini\n"
            with self.assertRaisesRegex(RuntimeError, "ContainerIdentityDrift"):
                remote.runtime("fodaveg", spec, True, expected_id="b" * 64)

    def test_backup_helpers_never_pull(self):
        _, remote = load_remote()
        with patch.object(remote, "_helper_run", return_value=b"") as run:
            remote.run_without_pull(["docker", "run", "--rm", "known@sha256:hash", "tar"])
            self.assertEqual(run.call_args.args[0][:3], ["docker", "run", "--pull=never"])

    def test_stopped_ports_require_both_exposed_ports_no_bindings_and_exact_id(self):
        helper, remote = load_remote()
        spec = remote.SPECS["fodaveg"]
        expected = helper.OLD_RUNTIME["fodaveg"]
        source = "/known-test-volume"
        expected["mounts"] = [("volume", spec["volume"], "/pb/pb_data", True,
                               hashlib.sha256(source.encode()).hexdigest())]
        raw = {"imageId": spec["imageId"], "imageRef": spec["image"],
               "entrypoint": expected["entrypoint"], "cmd": None, "health": None,
               "ports": {}, "mounts": [{"type": "volume", "name": spec["volume"], "source": source,
                                        "dest": "/pb/pb_data", "rw": True}],
               "networks": [{"name": "edge", "aliases": ["fodaveg", "fodaveg"]}]}
        full_ports = {"8090/tcp": None, "4321/tcp": None}
        config = {"exposed": {"8090/tcp": {}, "4321/tcp": {}}, "bindings": None}
        with patch.object(remote, "inspect", return_value=raw), \
                patch.object(remote, "container_id", return_value="a" * 64), \
                patch.object(helper, "image_id", return_value=spec["imageId"]), \
                patch.object(helper, "is_running", return_value=False) as running, \
                patch.object(helper, "volume_running_containers", return_value=[]), \
                patch.object(helper, "run", return_value=json.dumps(config).encode()) as run:
            remote.runtime("fodaveg", spec, True, expected_id="a" * 64, require_healthy=False,
                           volume_users=[], baseline={**raw, "ports": full_ports})
            for invalid in ({"exposed": {"8090/tcp": {}}, "bindings": None},
                            {"exposed": config["exposed"], "bindings": {"8090/tcp": [{"HostPort": "80"}]}}):
                run.return_value = json.dumps(invalid).encode()
                with self.assertRaisesRegex(RuntimeError, "RuntimeTopologyDrift"):
                    remote.runtime("fodaveg", spec, True, require_healthy=False, volume_users=[])
            run.return_value = json.dumps(config).encode()
            with self.assertRaisesRegex(RuntimeError, "ContainerIdentityDrift"):
                remote.runtime("fodaveg", spec, True, expected_id="b" * 64,
                               require_healthy=False, volume_users=[])
            running.return_value = True
            with self.assertRaisesRegex(RuntimeError, "RuntimeTopologyDrift"):
                remote.runtime("fodaveg", spec, True, require_healthy=False, volume_users=[])
            running.return_value = False
            with self.assertRaisesRegex(RuntimeError, "RuntimeTopologyDrift"):
                remote.runtime("fodaveg", spec, True, volume_users=[])

    def test_wrapper_rejects_unprojected_value_and_wrong_mode(self):
        service = "fodaveg"
        base, target, image, container = run_once.EXPECTED[service]
        value = {"status": "READY_FOR_REVIEW", "service": service, "remoteWrites": False,
                 "composeSha": base, "candidateSha": target,
                 "imageId": image, "containerId": container,
                 "volumeKiB": 1, "freeSrvKiB": 2, "freeDockerKiB": 2,
                 "requiredSrvKiB": 1, "requiredDockerKiB": 1, "sameFilesystem": True}
        self.assertTrue(run_once.valid(value, 0, "check", service))
        self.assertFalse(run_once.valid({**value, "secret": "private-marker"}, 0,
                                        "check", service))
        self.assertFalse(run_once.valid(value, 0, "apply", service))

    def test_backup_id_cannot_escape_its_service(self):
        valid = {"status": "STOP_NEEDS_OPERATOR", "service": "fodaveg",
                 "remoteWrites": True, "backupId": "fodaveg-20261008T120000Z-123"}
        self.assertTrue(run_once.valid(valid, 2, "apply", "fodaveg"))
        self.assertFalse(run_once.valid({**valid, "backupId": "../../private"}, 2,
                                         "apply", "fodaveg"))

    def test_rollback_rejects_unowned_metadata_before_docker(self):
        helper, remote = load_remote()
        name = "fodaveg"
        backup_id = name + "-20261008T120000Z-123"
        old_root, old_run = remote.ROOT, helper.run
        with tempfile.TemporaryDirectory(prefix="cors-rollback-") as folder:
            root = Path(folder)
            backup = root / backup_id
            backup.mkdir(mode=0o700)
            (backup / "state.json").write_text(json.dumps({"status": "AWAITING_PUBLIC_SMOKE",
                                                           "service": "foreign"}))
            remote.ROOT = root
            helper.run = lambda *args, **kwargs: self.fail("Docker called for unowned backup")
            try:
                with self.assertRaises(RuntimeError):
                    remote.rollback(name, remote.SPECS[name], backup_id)
            finally:
                remote.ROOT, helper.run = old_root, old_run

    def test_owned_compose_replace_rejects_foreign_change_and_symlink_parent(self):
        _, remote = load_remote()
        with tempfile.TemporaryDirectory(prefix="cors-file-") as folder:
            parent = Path(folder).resolve() / "real"
            parent.mkdir()
            path = parent / "compose.yml"
            path.write_bytes(b"original")
            path.chmod(0o640)
            original, original_stat = remote.read_file(path)
            installed = remote.replace_owned(path, b"candidate", remote.digest(original),
                                             remote.identity(original_stat))
            self.assertEqual(path.read_bytes(), b"candidate")
            self.assertEqual(path.stat().st_mode & 0o777, 0o640)
            self.assertEqual(installed, remote.identity(path.stat()))
            _, current_stat = remote.read_file(path)
            current_identity = remote.identity(current_stat)
            original_read_leaf = remote.read_leaf
            calls = 0

            def foreign_write(fd, name):
                nonlocal calls
                calls += 1
                if calls == 2:
                    path.write_bytes(b"foreign")
                return original_read_leaf(fd, name)

            with patch.object(remote, "read_leaf", side_effect=foreign_write):
                with self.assertRaises(RuntimeError):
                    remote.replace_owned(path, b"new", remote.digest(b"candidate"),
                                         current_identity)
            self.assertEqual(path.read_bytes(), b"foreign")
            path.write_bytes(b"candidate")
            current, current_stat = remote.read_file(path)
            calls = 0

            def same_bytes_new_inode(fd, name):
                nonlocal calls
                calls += 1
                if calls == 3:
                    other = parent / "alien"
                    other.write_bytes(b"new")
                    other.chmod(0o640)
                    os.replace(other, path)
                return original_read_leaf(fd, name)

            with patch.object(remote, "read_leaf", side_effect=same_bytes_new_inode):
                with self.assertRaises(RuntimeError):
                    remote.replace_owned(path, b"new", remote.digest(current),
                                         remote.identity(current_stat))
            self.assertEqual(path.read_bytes(), b"new")
            link = Path(folder).resolve() / "link"
            link.symlink_to(parent, target_is_directory=True)
            with self.assertRaises(OSError):
                remote.read_file(link / "compose.yml")

    def test_created_selection_rejects_wrong_id_and_other_volume_writer(self):
        helper, remote = load_remote()
        name = "fodaveg"
        spec = remote.SPECS[name]
        expected = helper.OLD_RUNTIME[name]
        raw = {"imageId": spec["imageId"], "imageRef": spec["image"],
               "entrypoint": expected["entrypoint"], "cmd": remote.command(name, spec, True)}
        labels = {"project": spec["project"], "service": spec["service"]}
        def run(argv, **_):
            self.assertIn('index .Config.Labels "com.docker.compose.project"', argv[-2])
            self.assertIn('index .Config.Labels "com.docker.compose.service"', argv[-2])
            return json.dumps(labels).encode()
        with patch.object(remote, "inspect", return_value=raw), \
                patch.object(remote, "container_id", return_value="a" * 64), \
                patch.object(helper, "run", side_effect=run), \
                patch.object(helper, "is_running", return_value=False), \
                patch.object(helper, "volume_running_containers", return_value=[]):
            self.assertEqual(remote.created_selection(name, spec), "a" * 64)
            with self.assertRaises(RuntimeError):
                remote.created_selection(name, spec, expected_id="b" * 64)
        with patch.object(remote, "inspect", return_value=raw), \
                patch.object(remote, "container_id", return_value="a" * 64), \
                patch.object(helper, "run", side_effect=run), \
                patch.object(helper, "is_running", return_value=False), \
                patch.object(helper, "volume_running_containers", return_value=["other"]):
            with self.assertRaises(RuntimeError):
                remote.created_selection(name, spec)

    def test_apply_last_file_guard_blocks_create_or_start_after_runtime_drift(self):
        for mutate_at, forbidden, expected_status in (
                (-1, "stop", "PREPARED"),
                (0, "create", "PREPARED"),
                (3, "create", "INSTALLED"), (5, "start", "CREATED")):
            with self.subTest(mutate_at=mutate_at), \
                    tempfile.TemporaryDirectory(prefix="cors-apply-flow-") as folder:
                helper, remote = load_remote()
                root = Path(folder).resolve()
                compose, env = root / "compose.yml", root / ".env"
                compose.write_bytes(b"original")
                env.write_bytes(b"private=opaque\n")
                env.chmod(0o600)
                old_id, new_id = "a" * 64, "b" * 64
                spec = {**remote.SPECS["fodaveg"], "compose": compose, "env": env,
                        "base": remote.digest(b"original"),
                        "target": remote.digest(b"candidate"), "containerId": old_id}
                _, cstat = remote.read_file(compose)
                _, estat = remote.read_file(env)
                state = {"body": b"original", "candidate": b"candidate",
                         "mode": 0o644, "composeIdentity": remote.identity(cstat),
                         "envSha": remote.digest(b"private=opaque\n"),
                         "envMode": 0o600, "envIdentity": remote.identity(estat),
                         "oldId": old_id, "oldRuntime": {}, "volumeKiB": 1,
                         "budget": {}}
                selected = {"id": old_id, "running": True}
                operations = []
                count = 0
                backup = root / "fodaveg-20261008T120000Z-123"
                backup.mkdir(mode=0o700)

                def run(argv, **_):
                    if argv[:2] == ["docker", "stop"]:
                        selected["running"] = False
                    elif "create" in argv:
                        selected["id"] = new_id
                    elif argv[:2] == ["docker", "start"]:
                        selected["running"] = True
                    operations.append(argv)
                    return b""

                def runtime(*_args, **_kwargs):
                    nonlocal count
                    count += 1
                    if mutate_at == -1 and count == 1:
                        raise RuntimeError("ContainerIdentityDrift")
                    if count == mutate_at:
                        compose.write_bytes(b"foreign")
                    return selected["id"], {}

                def restore_probe(*_):
                    if mutate_at == 0:
                        compose.write_bytes(b"foreign")
                    return 1, 1

                with ExitStack() as stack:
                    for obj, attr, value in (
                            (remote, "preflight", lambda *_: state),
                            (remote, "ROOT", root),
                            (remote, "compose_quiet", lambda *_: None),
                            (remote, "runtime", runtime),
                            (remote, "container_id", lambda _: selected["id"]),
                            (remote, "created_selection", lambda *_a, **_k: selected["id"]),
                            (helper, "make_backup_dir", lambda _: backup),
                            (helper, "write_backup", lambda p, b: p.write_bytes(b)),
                            (helper, "write_new", lambda p, b, _mode: p.write_bytes(b)),
                            (helper, "backup_volume", lambda *_: ("c" * 64, 1)),
                            (helper, "isolated_restore_probe", restore_probe),
                            (helper, "image_id", lambda ref: spec["oldImageId"] if ref == spec["oldImage"] else spec["imageId"]),
                            (helper, "is_running", lambda _: selected["running"]),
                            (helper, "volume_running_containers", lambda _: []),
                            (helper, "run", run)):
                        stack.enter_context(patch.object(obj, attr, value))
                    result = remote.apply("fodaveg", spec)
                self.assertEqual(result["status"], "STOP_NEEDS_OPERATOR")
                self.assertFalse(any(forbidden in argv for argv in operations))
                receipt = json.loads((backup / "state.json").read_bytes())
                self.assertEqual(receipt["status"], expected_status)

    def test_rollback_owned_unhealthy_created_id_restores_old_runtime(self):
        helper, remote = load_remote()
        name = "fodaveg"
        old_id, new_id, restored_id = "a" * 64, "b" * 64, "c" * 64
        with tempfile.TemporaryDirectory(prefix="cors-rollback-flow-") as folder:
            root = Path(folder).resolve()
            backup_id = name + "-20261008T120000Z-123"
            backup = root / backup_id
            backup.mkdir(mode=0o700)
            compose, env = root / "compose.yml", root / ".env"
            compose.write_bytes(b"candidate")
            env.write_bytes(b"private=opaque\n")
            env.chmod(0o600)
            spec = {**remote.SPECS[name], "compose": compose, "env": env,
                    "base": remote.digest(b"original"),
                    "target": remote.digest(b"candidate")}
            _, cstat = remote.read_file(compose)
            _, estat = remote.read_file(env)
            record = {"status": "CREATED", "service": name,
                      "oldComposeSha": spec["base"], "newComposeSha": spec["target"],
                      "imageId": spec["imageId"], "oldContainerId": old_id,
                      "newContainerId": new_id,
                      "installedComposeIdentity": remote.identity(cstat),
                      "envSha": remote.digest(b"private=opaque\n"),
                      "envIdentity": remote.identity(estat)}
            (backup / "state.json").write_text(json.dumps(record))
            (backup / "compose.old").write_bytes(b"original")
            selected = {"id": new_id, "running": True}
            operations = []

            def run(argv, **_):
                operations.append(argv)
                if argv[:2] == ["docker", "stop"]:
                    selected["running"] = False
                elif "create" in argv:
                    selected["id"] = restored_id
                elif argv[:2] == ["docker", "start"]:
                    selected["running"] = True
                elif argv[:2] == ["docker", "inspect"]:
                    return b'{"project":"fodaveg","service":"fodaveg"}'
                return b""

            def runtime(*_args, **kwargs):
                if kwargs.get("require_healthy", True):
                    self.assertEqual(selected, {"id": restored_id, "running": True})
                return selected["id"], {}

            expected = helper.OLD_RUNTIME[name]
            def inspect(_):
                return {"imageId": spec["oldImageId"], "imageRef": spec["oldImage"],
                        "entrypoint": expected["entrypoint"],
                        "cmd": remote.command(name, spec, False)}

            with ExitStack() as stack:
                for obj, attr, value in (
                        (remote, "ROOT", root),
                        (remote, "compose_quiet", lambda *_: None),
                        (remote, "runtime", runtime),
                        (remote, "inspect", inspect),
                        (remote, "created_selection", lambda *_a, **_k: selected["id"]),
                        (remote, "container_id", lambda _: selected["id"]),
                        (helper, "read_private", lambda p: (p.read_bytes(), None)),
                        (helper, "write_new", lambda p, b, _mode: p.write_bytes(b)),
                        (helper, "image_id", lambda ref: spec["oldImageId"] if ref == spec["oldImage"] else spec["imageId"]),
                        (helper, "is_running", lambda _: selected["running"]),
                        (helper, "volume_running_containers", lambda _: [name] if
                         selected["running"] else []),
                        (helper, "run", run)):
                    stack.enter_context(patch.object(obj, attr, value))
                result = remote.rollback(name, spec, backup_id)
            self.assertEqual(result["status"], "CORS_ROLLED_BACK_AWAITING_PUBLIC_SMOKE")
            self.assertEqual(compose.read_bytes(), b"original")
            self.assertEqual(selected, {"id": restored_id, "running": True})
            self.assertIn(["docker", "stop", new_id], operations)
            self.assertIn(["docker", "start", restored_id], operations)
            self.assertEqual(json.loads((backup / "state.json").read_bytes())["status"],
                             "ROLLED_BACK")

if __name__ == "__main__": unittest.main()
