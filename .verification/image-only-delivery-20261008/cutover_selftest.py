"""Local negative fixtures for the private, remote-only cutover program."""

import io
import json
import os
from pathlib import Path
import stat
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import remote_cutover as cutover


class CutoverTests(unittest.TestCase):
    def test_env_changes_only_exact_selectors(self):
        original = b"SECRET=opaque\nVEGA_IMAGE_TAG=old\nVEGA_GIT_SHA=old\n# keep me\n"
        result = cutover.patch_env(original, {"VEGA_IMAGE_TAG": ("old", "new"),
                                              "VEGA_GIT_SHA": ("old", "new")})
        self.assertEqual(result, b"SECRET=opaque\nVEGA_IMAGE_TAG=new\nVEGA_GIT_SHA=new\n# keep me\n")
        for bad in (b"VEGA_IMAGE_TAG=other\nVEGA_GIT_SHA=old\n",
                    b"VEGA_IMAGE_TAG=old\nVEGA_IMAGE_TAG=old\nVEGA_GIT_SHA=old\n"):
            with self.assertRaises(RuntimeError):
                cutover.patch_env(bad, {"VEGA_IMAGE_TAG": ("old", "new"),
                                        "VEGA_GIT_SHA": ("old", "new")})

    def test_stock_compose_exact_command_only(self):
        original = b"services:\n  pocketbase:\n    image: ${VEGA_IMAGE_TAG}\n  edge:\n    image: caddy\n"
        result = cutover.patch_stock_compose(original)
        self.assertEqual(result.replace(cutover.STOCK_CMD, b"", 1), original)
        self.assertEqual(result.count(cutover.STOCK_CMD), 1)
        with self.assertRaises(RuntimeError):
            cutover.patch_stock_compose(original.replace(b"    image:", b"    command: serve\n    image:", 1))

    def test_atomic_write_preserves_mode_and_body(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "compose.yml"
            path.write_bytes(b"old")
            os.chmod(path, 0o640)
            cutover.write_new(path, b"new", stat.S_IMODE(path.stat().st_mode))
            self.assertEqual(path.read_bytes(), b"new")
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o640)

    def archive(self, root, members):
        backup = root / "backup"
        backup.mkdir()
        with tarfile.open(backup / "data.tgz", "w:gz") as archive:
            for name, kind, data in members:
                item = tarfile.TarInfo(name)
                item.type = tarfile.DIRTYPE if kind == "dir" else tarfile.REGTYPE
                item.size = len(data)
                archive.addfile(item, io.BytesIO(data) if kind == "file" else None)
        return backup

    def test_restore_tar_real_dot_prefix_and_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            volume = root / "volume"
            volume.mkdir()
            (volume / "file.db").write_bytes(b"sqlite bytes")
            backup = self.archive(root, [("./", "dir", b""), ("./file.db", "file", b"sqlite bytes")])
            with patch.object(cutover, "volume_mountpoint", return_value=str(volume)):
                cutover.validate_archive(backup / "data.tgz")
                self.assertEqual(cutover.verify_restored(backup, "test"), (1, 12))

    def test_restore_rejects_escape_duplicate_symlink_and_mismatch(self):
        cases = [
            [("./../escape", "file", b"x")],
            [("/absolute", "file", b"x")],
            [("./file", "file", b"x"), ("./file", "file", b"x")],
            [("./file", "file", b"different")],
        ]
        for members in cases:
            with self.subTest(members=members), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                volume = root / "volume"
                volume.mkdir()
                (volume / "file").write_bytes(b"x")
                backup = self.archive(root, members)
                with patch.object(cutover, "volume_mountpoint", return_value=str(volume)):
                    with self.assertRaises(RuntimeError):
                        if members[0][0] == "./file" and len(members) == 1:
                            cutover.verify_restored(backup, "test")
                        else:
                            cutover.validate_archive(backup / "data.tgz")

    def test_archive_rejects_symlink_before_extraction(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "data.tgz"
            with tarfile.open(path, "w:gz") as archive:
                member = tarfile.TarInfo("./link")
                member.type = tarfile.SYMTYPE
                member.linkname = "/private"
                archive.addfile(member)
            with self.assertRaisesRegex(RuntimeError, "ArchiveShapeUnknown"):
                cutover.validate_archive(path)

    def test_budget_requires_both_filesystems(self):
        class Statvfs:
            f_bavail = 100
            f_frsize = 1024

        class Stat:
            st_dev = 1

        with patch.object(cutover, "volume_mountpoint", return_value="/var/lib/docker/volumes/x/_data"), \
                patch.object(cutover.os, "statvfs", return_value=Statvfs()), \
                patch.object(cutover.os, "stat", return_value=Stat()):
            with self.assertRaisesRegex(RuntimeError, "InsufficientSpace"):
                cutover.filesystem_budget("x", 1)

    def test_runtime_guard_rejects_mount_health_ports_and_argv_drift(self):
        spec = cutover.SPECS["vega-pb"]
        original = {"imageId": spec["oldId"], "imageRef": spec["oldTag"],
                    "entrypoint": ["/pb/pocketbase"], "cmd": cutover.OLD_RUNTIME["vega-pb"]["cmd"],
                    "health": "healthy", "ports": {"8090/tcp": None},
                    "networks": [{"name": "edge", "aliases": ["pocketbase", "vega-pb", "vega-pb"]}],
                    "mounts": [{"type": "volume", "name": "vega_data",
                                "source": "/var/lib/docker/volumes/vega_data/_data",
                                "dest": "/pb/pb_data", "rw": True}]}

        def check(value, argv=True):
            with patch.object(cutover, "run", return_value=json.dumps(value).encode()), \
                    patch.object(cutover, "current_pb_argv",
                                 return_value=cutover.OLD_PB_ARGV["vega-pb"] if argv else None):
                return cutover.runtime_guard("vega-pb", spec)

        self.assertTrue(check(original))
        for field, bad in (("mounts", []), ("health", "starting"), ("ports", {}),
                           ("networks", [{"name": "wrong", "aliases": []}])):
            with self.subTest(field=field):
                changed = dict(original)
                changed[field] = bad
                self.assertFalse(check(changed))
        self.assertFalse(check(original, argv=False))

    def test_backup_directory_failure_never_claims_no_remote_writes(self):
        spec = cutover.SPECS["vega-pb"]
        data = {"oldCompose": b"compose", "oldEnv": b"env", "oldEnvSha": cutover.digest(b"env"),
                "newComposeSha": cutover.digest(b"new compose"), "newEnvSha": cutover.digest(b"new env"),
                "composeMode": 0o640, "envMode": 0o600}
        with patch.object(cutover, "inspect_guard", return_value=data), \
                patch.object(cutover, "make_backup_dir", side_effect=RuntimeError("mkdir failed")), \
                patch.object(cutover, "digest", side_effect=lambda body: spec["oldComposeSha"] if body == b"compose" else data["oldEnvSha"]), \
                patch.object(cutover, "is_running", return_value=True), \
                patch.object(cutover, "read_private", side_effect=[
                    (b"compose", SimpleNamespace(st_mode=0o640)),
                    (b"env", SimpleNamespace(st_mode=0o600))]), \
                patch.object(cutover, "wait_old_runtime", return_value=True):
            result = cutover.apply("vega-pb", spec, False)
        self.assertEqual(result["status"], "STOP_BEFORE_NEW_IMAGE_RESTORED")
        self.assertTrue(result["remoteWrites"])

    def test_failed_stop_after_actual_stop_restarts_old_container(self):
        spec = cutover.SPECS["vega-pb"]
        data = {"oldCompose": b"compose", "oldEnv": b"env", "oldEnvSha": cutover.digest(b"env"),
                "newComposeSha": cutover.digest(b"new compose"), "newEnvSha": cutover.digest(b"new env"),
                "composeMode": 0o640, "envMode": 0o600}
        with tempfile.TemporaryDirectory() as temporary, \
                patch.object(cutover, "inspect_guard", return_value=data), \
                patch.object(cutover, "make_backup_dir", return_value=Path(temporary)), \
                patch.object(cutover, "run", side_effect=[RuntimeError("stop returned error"), b""]) as command, \
                patch.object(cutover, "digest", side_effect=lambda body: spec["oldComposeSha"] if body == b"compose" else data["oldEnvSha"]), \
                patch.object(cutover, "is_running", return_value=False), \
                patch.object(cutover, "read_private", side_effect=[
                    (b"compose", SimpleNamespace(st_mode=0o640)),
                    (b"env", SimpleNamespace(st_mode=0o600))]), \
                patch.object(cutover, "wait_old_runtime", return_value=True):
            result = cutover.apply("vega-pb", spec, False)
        self.assertEqual(result["status"], "STOP_BEFORE_NEW_IMAGE_RESTORED")
        self.assertTrue(result["oldImageRestarted"])
        self.assertEqual(command.call_args_list[-1].args[0], ["docker", "start", "vega-pb"])

    def test_recovery_never_overwrites_concurrent_file(self):
        with patch.object(cutover, "read_private", return_value=(b"foreign", SimpleNamespace(st_mode=0o600))), \
                patch.object(cutover, "write_new") as writer:
            self.assertFalse(cutover.restore_file_if_owned(
                Path("/private/path"), b"old", cutover.digest(b"old"),
                cutover.digest(b"new"), 0o600, True))
        writer.assert_not_called()

    def test_recovery_restores_only_own_new_bytes(self):
        with patch.object(cutover, "read_private", side_effect=[
                (b"new", SimpleNamespace(st_mode=0o600)),
                (b"old", SimpleNamespace(st_mode=0o600))]), \
                patch.object(cutover, "write_new") as writer:
            self.assertTrue(cutover.restore_file_if_owned(
                Path("/private/path"), b"old", cutover.digest(b"old"),
                cutover.digest(b"new"), 0o600, True))
        writer.assert_called_once_with(Path("/private/path"), b"old", 0o600)


if __name__ == "__main__":
    unittest.main()
