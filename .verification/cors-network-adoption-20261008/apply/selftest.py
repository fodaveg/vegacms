"""Offline contract checks for the two guarded Compose deltas and projections."""

import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from contextlib import ExitStack
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import run_once
import served_cors_smoke


def load_remote():
    helper = types.ModuleType("image_helpers")
    sys.modules["image_helpers"] = helper
    source = ROOT / "image-only-delivery-20261008" / "remote_cutover.py"
    exec(compile(source.read_bytes(), str(source), "exec"), helper.__dict__)
    remote = types.ModuleType("cors_apply")
    path = HERE / "remote_apply.py"
    exec(compile(path.read_bytes(), str(path), "exec"), remote.__dict__)
    return helper, remote


class CorsApplyTests(unittest.TestCase):
    def test_patches_match_remote_hashes_and_only_origins_delta(self):
        helper, remote = load_remote()
        previous = ROOT / "private-runtime-metadata-read-ready-20261008" / "local-patch-dryrun-20261008" / "original"
        stock = (previous / "srv/vega/infra/production/compose.yml").read_bytes().replace(
            b"  pocketbase:\n", b"  pocketbase:\n" + helper.STOCK_CMD, 1)
        lumbre = (previous / "srv/lumbre-admin/compose.yml").read_bytes()
        for name, body in (("vega-pb", stock), ("lumbre-admin-pb", lumbre)):
            spec = remote.SPECS[name]
            self.assertEqual(hashlib.sha256(body).hexdigest(), spec["base"])
            result = remote.patch(name, spec, body)
            self.assertEqual(hashlib.sha256(result).hexdigest(), spec["target"])
            self.assertEqual(result.count(b"--origins="), 1)
            with self.assertRaises(RuntimeError):
                remote.patch(name, spec, body + b"foreign")

    def test_wrapper_rejects_unprojected_value_and_wrong_mode(self):
        service = "vega-pb"
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
        valid = {"status": "STOP_NEEDS_OPERATOR", "service": "vega-pb",
                 "remoteWrites": True, "backupId": "vega-pb-20261008T120000Z-123"}
        self.assertTrue(run_once.valid(valid, 2, "apply", "vega-pb"))
        self.assertFalse(run_once.valid({**valid, "backupId": "../../private"}, 2,
                                         "apply", "vega-pb"))

    def test_runtime_guard_requires_new_pb_argv(self):
        helper, remote = load_remote()
        name = "vega-pb"
        spec = remote.SPECS[name]
        expected = helper.OLD_RUNTIME[name]
        old_mounts = expected["mounts"]
        old_aliases = expected["aliases"]
        source = "/known-test-volume"
        expected["mounts"] = [("volume", "vega_data", "/pb/pb_data", True,
                               hashlib.sha256(source.encode()).hexdigest())]
        expected["aliases"] = ["vega-pb"]
        current = {"imageId": spec["imageId"], "imageRef": spec["image"],
                   "entrypoint": expected["entrypoint"],
                   "cmd": remote.command(name, spec, True), "health": "healthy",
                   "ports": {"8090/tcp": None},
                   "mounts": [{"type": "volume", "name": "vega_data", "source": source,
                               "dest": "/pb/pb_data", "rw": True}],
                   "networks": [{"name": "edge", "aliases": ["vega-pb"]}]}
        old_inspect, old_argv, old_id = remote.inspect, remote.pb_argv, remote.container_id
        old_volume = helper.volume_running_containers
        try:
            remote.inspect = lambda _: current
            remote.pb_argv = lambda _: ["/pb/pocketbase", *current["cmd"]]
            remote.container_id = lambda _: "a" * 64
            helper.volume_running_containers = lambda _: [name]
            self.assertEqual(remote.runtime(name, spec, True)[0], "a" * 64)
            remote.pb_argv = lambda _: ["/pb/pocketbase", *remote.command(name, spec, False)]
            with self.assertRaises(RuntimeError):
                remote.runtime(name, spec, True)
        finally:
            remote.inspect, remote.pb_argv, remote.container_id = old_inspect, old_argv, old_id
            helper.volume_running_containers = old_volume
            expected["mounts"], expected["aliases"] = old_mounts, old_aliases

    def test_stopped_empty_ports_requires_exposed_only_and_no_host_binding(self):
        helper, remote = load_remote()
        name = "vega-pb"
        spec = remote.SPECS[name]
        expected = helper.OLD_RUNTIME[name]
        source = "/known-test-volume"
        raw = {"imageId": spec["imageId"], "imageRef": spec["image"],
               "entrypoint": expected["entrypoint"],
               "cmd": remote.command(name, spec, False), "health": None,
               "ports": {}, "mounts": [{"type": "volume", "name": "vega_data",
                                         "source": source, "dest": "/pb/pb_data", "rw": True}],
               "networks": [{"name": "edge", "aliases": ["vega-pb"]}]}
        selected_mounts, selected_aliases = expected["mounts"], expected["aliases"]
        expected["mounts"] = [("volume", "vega_data", "/pb/pb_data", True,
                               hashlib.sha256(source.encode()).hexdigest())]
        expected["aliases"] = ["vega-pb"]
        port_config = {"exposed": {"8090/tcp": {}}, "bindings": {}}
        def run(argv, **_):
            self.assertIn(".Config.ExposedPorts", argv[-2])
            self.assertIn(".HostConfig.PortBindings", argv[-2])
            return json.dumps(port_config).encode()
        try:
            with patch.object(remote, "inspect", return_value=raw), \
                    patch.object(remote, "container_id", return_value="a" * 64), \
                    patch.object(helper, "is_running", return_value=False) as running, \
                    patch.object(helper, "volume_running_containers", return_value=[]), \
                    patch.object(helper, "run", side_effect=run):
                baseline = {**raw, "ports": {"8090/tcp": None}}
                self.assertEqual(remote.runtime(name, spec, False, expected_id="a" * 64,
                                               baseline=baseline, require_healthy=False,
                                               volume_users=[])[0],
                                 "a" * 64)
                with self.assertRaises(RuntimeError):
                    remote.runtime(name, spec, False,
                                   baseline={**baseline, "ports": {"8090/tcp": "published"}},
                                   require_healthy=False, volume_users=[])
                port_config["bindings"] = {"8090/tcp": [{"HostPort": "8090"}]}
                with self.assertRaises(RuntimeError):
                    remote.runtime(name, spec, False, require_healthy=False,
                                   volume_users=[])
                port_config["bindings"] = {}
                port_config["exposed"] = {"4321/tcp": {}}
                with self.assertRaises(RuntimeError):
                    remote.runtime(name, spec, False, require_healthy=False,
                                   volume_users=[])
                port_config["exposed"] = {"8090/tcp": {}}
                running.return_value = True
                with self.assertRaises(RuntimeError):
                    remote.runtime(name, spec, False, require_healthy=False,
                                   volume_users=[])
                running.return_value = False
                with self.assertRaises(RuntimeError):
                    remote.runtime(name, spec, False, require_healthy=True,
                                   volume_users=[])
        finally:
            expected["mounts"], expected["aliases"] = selected_mounts, selected_aliases

    def test_rollback_rejects_unowned_metadata_before_docker(self):
        helper, remote = load_remote()
        name = "vega-pb"
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
        name = "vega-pb"
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
                spec = {**remote.SPECS["vega-pb"], "compose": compose, "env": env,
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
                backup = root / "vega-pb-20261008T120000Z-123"
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
                            (helper, "image_id", lambda _: spec["imageId"]),
                            (helper, "is_running", lambda _: selected["running"]),
                            (helper, "volume_running_containers", lambda _: []),
                            (helper, "run", run)):
                        stack.enter_context(patch.object(obj, attr, value))
                    result = remote.apply("vega-pb", spec)
                self.assertEqual(result["status"], "STOP_NEEDS_OPERATOR")
                self.assertFalse(any(forbidden in argv for argv in operations))
                receipt = json.loads((backup / "state.json").read_bytes())
                self.assertEqual(receipt["status"], expected_status)

    def test_discovery_rejects_html_and_redirect_without_following(self):
        class Response(io.BytesIO):
            status = 200
            url = "https://admin.vegacms.com/api/vega/discovery"
            headers = {"Content-Type": "text/html"}
        class Opener:
            calls = 0
            def open(self, *_args, **_kwargs):
                self.calls += 1
                return Response(b"<html>fallback</html>")
        opener = Opener()
        with patch.object(served_cors_smoke, "OPENER", opener):
            self.assertFalse(served_cors_smoke.discovery_json("admin.vegacms.com"))
            self.assertEqual(opener.calls, 1)
        self.assertIsNone(served_cors_smoke.NoRedirect().redirect_request(
            None, None, 302, "redirect", {}, "https://foreign.invalid/"))

    def test_index_alias_requires_known_redirect_and_sealed_root_bytes(self):
        class Response(io.BytesIO):
            status = 301
            headers = {"Location": "./"}
        class Opener:
            def open(self, *_args, **_kwargs):
                return Response(b"")
        class Smoke:
            @staticmethod
            def verify_assets(_):
                return {"checked": 153, "matched": 152, "failedPaths": ["index.html"]}
            @staticmethod
            def manifest_for(_):
                return {"index.html": "a" * 64}, None
        target = {"paths": {"root": {"status": 200, "bodySha256": "a" * 64}}}
        with patch.object(served_cors_smoke, "OPENER", Opener()):
            self.assertTrue(served_cors_smoke.canonical_index_alias("admin.vegacms.com"))
            self.assertEqual(served_cors_smoke.verified_assets(Smoke, "vega-pb", target),
                             (153, 153, True))
            Response.headers = {"Location": "https://foreign.invalid/"}
            self.assertFalse(served_cors_smoke.canonical_index_alias("admin.vegacms.com"))
            self.assertEqual(served_cors_smoke.verified_assets(Smoke, "vega-pb", target),
                             (153, 152, False))
            Response.headers = {"Location": "./"}
            target["paths"]["root"]["bodySha256"] = "b" * 64
            self.assertEqual(served_cors_smoke.verified_assets(Smoke, "vega-pb", target),
                             (153, 152, False))

    def test_rollback_owned_unhealthy_created_id_restores_old_runtime(self):
        helper, remote = load_remote()
        name = "vega-pb"
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
                    return b'{"project":"vega","service":"pocketbase"}'
                return b""

            def runtime(*_args, **kwargs):
                if kwargs.get("require_healthy", True):
                    self.assertEqual(selected, {"id": restored_id, "running": True})
                return selected["id"], {}

            expected = helper.OLD_RUNTIME[name]
            def inspect(_):
                return {"imageId": spec["imageId"], "imageRef": spec["image"],
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
                        (helper, "image_id", lambda _: spec["imageId"]),
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

    def test_installed_old_stopped_ports_empty_rollback_starts_exact_id(self):
        helper, remote = load_remote()
        name, old_id = "vega-pb", "a" * 64
        with tempfile.TemporaryDirectory(prefix="cors-old-stopped-") as folder:
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
            state = {"status": "INSTALLED", "service": name,
                     "oldComposeSha": spec["base"], "newComposeSha": spec["target"],
                     "imageId": spec["imageId"], "oldContainerId": old_id,
                     "newContainerId": None,
                     "installedComposeIdentity": remote.identity(cstat),
                     "envSha": remote.digest(b"private=opaque\n"),
                     "envIdentity": remote.identity(estat)}
            (backup / "state.json").write_text(json.dumps(state))
            (backup / "compose.old").write_bytes(b"original")
            running = {"value": False}
            operations = []
            expected = helper.OLD_RUNTIME[name]
            old_mounts, old_aliases = expected["mounts"], expected["aliases"]
            source = "/known-test-volume"
            expected["mounts"] = [("volume", "vega_data", "/pb/pb_data", True,
                                   hashlib.sha256(source.encode()).hexdigest())]
            expected["aliases"] = ["vega-pb"]

            def inspect(_):
                return {"imageId": spec["imageId"], "imageRef": spec["image"],
                        "entrypoint": expected["entrypoint"],
                        "cmd": remote.command(name, spec, False),
                        "health": "healthy" if running["value"] else None,
                        "ports": {"8090/tcp": None} if running["value"] else {},
                        "mounts": [{"type": "volume", "name": "vega_data",
                                    "source": source, "dest": "/pb/pb_data", "rw": True}],
                        "networks": [{"name": "edge", "aliases": ["vega-pb"]}]}

            def run(argv, **_):
                operations.append(argv)
                if argv[:2] == ["docker", "start"]:
                    running["value"] = True
                    return b""
                self.assertIn(".Config.ExposedPorts", argv[-2])
                return b'{"exposed":{"8090/tcp":{}},"bindings":{}}'

            try:
                with ExitStack() as stack:
                    for obj, attr, value in (
                            (remote, "ROOT", root),
                            (remote, "compose_quiet", lambda *_: None),
                            (remote, "inspect", inspect),
                            (remote, "container_id", lambda _: old_id),
                            (remote, "pb_argv", lambda _: [expected["entrypoint"][0],
                                                          *remote.command(name, spec, False)]),
                            (helper, "read_private", lambda p: (p.read_bytes(), None)),
                            (helper, "write_new", lambda p, b, _mode: p.write_bytes(b)),
                            (helper, "image_id", lambda _: spec["imageId"]),
                            (helper, "is_running", lambda _: running["value"]),
                            (helper, "volume_running_containers", lambda _: [name] if
                             running["value"] else []),
                            (helper, "run", run)):
                        stack.enter_context(patch.object(obj, attr, value))
                    result = remote.rollback(name, spec, backup_id)
                self.assertEqual(result["status"], "CORS_ROLLED_BACK_AWAITING_PUBLIC_SMOKE")
                self.assertEqual(compose.read_bytes(), b"original")
                self.assertTrue(running["value"])
                self.assertEqual(operations.count(["docker", "start", old_id]), 1)
            finally:
                expected["mounts"], expected["aliases"] = old_mounts, old_aliases

    def test_public_cors_requires_foreign_and_null_denial(self):
        host = "admin.vegacms.com"
        index_sha = "a" * 64

        class Smoke:
            @staticmethod
            def fetch(host, path, method, origin):
                if method == "OPTIONS" and origin is None:
                    raise AssertionError("OPTIONS without Origin is not a CORS preflight")
                if method == "OPTIONS":
                    status, mime, body_sha = 204, None, None
                elif path == served_cors_smoke.NORMAL_API:
                    status, mime, body_sha = 403, "application/json", "b" * 64
                else:
                    status, mime, body_sha = 200, "text/html", index_sha
                return {"status": status, "contentType": mime, "bodySha256": body_sha,
                        "cors": origin if origin == "https://" + host else None}

            @staticmethod
            def manifest_for(service):
                return {"index.html": index_sha}, "sealed"

        original = served_cors_smoke.preflight
        old_discovery = served_cors_smoke.discovery_json
        served_cors_smoke.preflight = lambda host, origin, method, path: {
            "status": 204, "origin": "MATCH" if origin == "https://" + host else "ABSENT",
            "methodAllowed": True, "headersAllowed": True}
        served_cors_smoke.discovery_json = lambda host: True
        try:
            observation = {"paths": {"health": {"status": 200}},
                           "cors": {"getOwn": {"status": 200, "cors": "https://" + host},
                                    "optionsOwn": {"status": 204, "cors": "https://" + host},
                                    "getForeign": {"status": 200, "cors": None},
                                    "optionsForeign": {"status": 204, "cors": None}}}
            result, mode = served_cors_smoke.cors_after(Smoke, "vega-pb", observation)
            self.assertTrue(all(result.values()))
            self.assertEqual(mode, "LEGACY_SPA_FALLBACK")
            observation["cors"]["getForeign"]["cors"] = "*"
            self.assertFalse(served_cors_smoke.cors_after(
                Smoke, "vega-pb", observation)[0]["foreignDenied"])
        finally:
            served_cors_smoke.preflight = original
            served_cors_smoke.discovery_json = old_discovery

    def test_stock_fallback_rejects_wrong_html_or_acao_and_native_requires_json(self):
        host = "admin.vegacms.com"
        own = "https://" + host
        observation = {"paths": {"health": {"status": 200}},
                       "cors": {"getOwn": {"status": 200, "cors": own},
                                "optionsOwn": {"status": 204, "cors": own},
                                "getForeign": {"status": 200, "cors": None},
                                "optionsForeign": {"status": 204, "cors": None}}}

        class Smoke:
            sha = "a" * 64
            discovery_cors = None

            @classmethod
            def fetch(cls, host, path, method, origin):
                if method == "OPTIONS" and origin is None:
                    raise AssertionError("OPTIONS without Origin is not a CORS preflight")
                if method == "OPTIONS":
                    return {"status": 204,
                            "cors": origin if origin == "https://" + host else None}
                if path == served_cors_smoke.NORMAL_API:
                    return {"status": 403, "contentType": "application/json",
                            "cors": origin if origin == "https://" + host else None}
                return {"status": 200, "contentType": "text/html", "bodySha256": cls.sha,
                        "cors": cls.discovery_cors if origin == "https://" + host else None}

            @staticmethod
            def manifest_for(service):
                return {"index.html": "a" * 64}, "sealed"

        with patch.object(served_cors_smoke, "preflight", return_value={
                "status": 204, "origin": "MATCH", "methodAllowed": True,
                "headersAllowed": True}):
            checks, mode = served_cors_smoke.cors_after(Smoke, "vega-pb", observation)
            self.assertFalse(checks["discoveryAndCors"])
            self.assertEqual(mode, "UNKNOWN")
            Smoke.discovery_cors = own
            checks, mode = served_cors_smoke.cors_after(Smoke, "vega-pb", observation)
            self.assertTrue(checks["discoveryAndCors"])
            self.assertEqual(mode, "LEGACY_SPA_FALLBACK")
            Smoke.sha = "b" * 64
            checks, mode = served_cors_smoke.cors_after(Smoke, "vega-pb", observation)
            self.assertFalse(checks["discoveryAndCors"])
            self.assertEqual(mode, "UNKNOWN")
            with patch.object(served_cors_smoke, "discovery_json", return_value=True):
                checks, mode = served_cors_smoke.cors_after(
                    Smoke, "lumbre-admin-pb", observation)
                self.assertFalse(checks["discoveryAndCors"])
                self.assertEqual(mode, "UNKNOWN")

    def test_normal_api_must_deny_json_with_origin_policy(self):
        host = "admin.vegacms.com"
        own = "https://" + host
        observation = {"paths": {"health": {"status": 200}},
                       "cors": {"getOwn": {"status": 200, "cors": own},
                                "optionsOwn": {"status": 204, "cors": own},
                                "getForeign": {"status": 200, "cors": None},
                                "optionsForeign": {"status": 204, "cors": None}}}

        class Smoke:
            api_status = 403
            api_mime = "application/json"
            api_foreign_cors = None

            @classmethod
            def fetch(cls, host, path, method, origin):
                if method == "OPTIONS" and origin is None:
                    raise AssertionError("OPTIONS without Origin is not a CORS preflight")
                cors = own if origin == own else None
                if path == served_cors_smoke.NORMAL_API:
                    if origin == "https://not-authorized.invalid":
                        cors = cls.api_foreign_cors
                    return {"status": 204 if method == "OPTIONS" else cls.api_status,
                            "contentType": cls.api_mime, "cors": cors}
                return {"status": 204 if method == "OPTIONS" else 200,
                        "contentType": "text/html", "bodySha256": "a" * 64,
                        "cors": cors}

            @staticmethod
            def manifest_for(service):
                return {"index.html": "a" * 64}, "sealed"

        def valid_preflight(host, origin, method, path):
            return {"status": 204, "origin": "MATCH" if origin == own else "ABSENT",
                    "methodAllowed": True, "headersAllowed": True}

        with patch.object(served_cors_smoke, "preflight", side_effect=valid_preflight):
            self.assertTrue(served_cors_smoke.cors_after(
                Smoke, "vega-pb", observation)[0]["normalApiAndCors"])
            for attribute, invalid in (("api_status", 200), ("api_mime", "text/html"),
                                       ("api_foreign_cors", "*")):
                with self.subTest(attribute=attribute):
                    original = getattr(Smoke, attribute)
                    setattr(Smoke, attribute, invalid)
                    self.assertFalse(served_cors_smoke.cors_after(
                        Smoke, "vega-pb", observation)[0]["normalApiAndCors"])
                    setattr(Smoke, attribute, original)


if __name__ == "__main__":
    unittest.main()
