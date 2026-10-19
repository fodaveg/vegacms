"""Offline LOAD chain, projection, budget and no-recreate checks."""

import json
import hashlib
import io
import os
from pathlib import Path
import tempfile
from contextlib import contextmanager
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import remote_transport as t
import run_transport as w


def response(value, code=0):
    return SimpleNamespace(returncode=code, stdout=json.dumps(value).encode(), stderr=b"")


class TransportTests(unittest.TestCase):
    @contextmanager
    def approved_archive(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder).resolve() / "image.tar"
            path.write_bytes(b"approved")
            path.chmod(0o600)
            with patch.object(t, "ARCHIVE", path), patch.object(t, "ARCHIVE_BYTES", 8), \
                    patch.object(t, "ARCHIVE_SHA", hashlib.sha256(b"approved").hexdigest()):
                yield path

    def test_partial_cleanup_preserves_replaced_file_and_inode(self):
        with tempfile.TemporaryDirectory() as folder:
            parent = Path(folder).resolve()
            path = parent / "image.tar"
            path.write_bytes(b"own")
            fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
            self.addCleanup(os.close, fd)
            own = t.file_identity(path.stat())
            replacement = parent / "other.tar"
            replacement.write_bytes(b"own")
            os.replace(replacement, path)
            t.remove_owned(fd, path.name, own)
            self.assertEqual(path.read_bytes(), b"own")
            t.remove_owned(fd, path.name, t.file_identity(path.stat()))
            self.assertFalse(path.exists())

    def test_bad_receive_removes_own_partial_but_preserves_foreign_replacement(self):
        for foreign in (False, True):
            with self.subTest(foreign=foreign), tempfile.TemporaryDirectory() as folder:
                parent = Path(folder).resolve()
                archive = parent / "image.tar"
                class Reader(io.BytesIO):
                    def read(self, count):
                        if foreign and self.tell() == 0:
                            other = parent / "foreign.tar"
                            other.write_bytes(b"foreign")
                            os.replace(other, archive)
                        return super().read(count)
                stdin = SimpleNamespace(buffer=Reader(b"wrong"))
                with patch.object(t, "ARCHIVE", archive), patch.object(t, "ARCHIVE_BYTES", 5), \
                        patch.object(t, "filesystem_budget", return_value={}), patch.object(t.sys, "stdin", stdin):
                    with self.assertRaisesRegex(RuntimeError, "ArchiveIdentityUnknown"):
                        t.receive()
                self.assertEqual(archive.exists(), foreign)
                if foreign:
                    self.assertEqual(archive.read_bytes(), b"foreign")

    def identity(self):
        return {"id": t.CHAIN["ociManifestDigest"], "os": "linux", "architecture": "amd64",
                "layers": t.CHAIN["layers"], "descriptor": {"digest": t.CHAIN["ociManifestDigest"],
                                                            "mediaType": t.CHAIN["ociMediaType"]}}

    def test_effective_oci_id_and_all_layers_required(self):
        actual = self.identity()
        with patch.object(t.subprocess, "run", return_value=response(actual)):
            value = t.identity()
        self.assertTrue(w.valid(value, "identity", 0))
        for field, wrong in (("id", t.CHAIN["configId"]), ("layers", actual["layers"][:-1]),
                             ("os", "darwin"), ("descriptor", {})):
            with self.subTest(field=field), patch.object(t.subprocess, "run", return_value=response({**actual, field: wrong})):
                with self.assertRaises(RuntimeError):
                    t.identity()
        self.assertFalse(w.valid({**value, "private": True}, "identity", 0))
        self.assertFalse(w.valid(value, "load", 0))

    def test_load_checks_archive_and_tag_before_write(self):
        with patch.object(t, "verified_archive", side_effect=RuntimeError("bad")), \
                patch.object(t.subprocess, "run") as run:
            with self.assertRaises(RuntimeError):
                t.load()
            run.assert_not_called()
        with self.approved_archive(), patch.object(t, "filesystem_budget", return_value={}), \
                patch.object(t.subprocess, "run", return_value=response(t.CHAIN["ociManifestDigest"])) as run:
            with self.assertRaisesRegex(RuntimeError, "TagAlreadyPresentOrUnknown"):
                t.load()
            self.assertEqual(run.call_count, 1)

    def test_load_has_no_container_or_compose_commands(self):
        results = [response(None, 1), response(None), response(self.identity())]
        with self.approved_archive(), patch.object(t, "filesystem_budget", return_value={}), \
                patch.object(t.subprocess, "run", side_effect=results) as run:
            self.assertEqual(t.load()["effectiveRemoteId"], t.CHAIN["ociManifestDigest"])
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual([command[:3] for command in commands],
                         [["docker", "image", "inspect"], ["docker", "image", "load"], ["docker", "image", "inspect"]])
        load_call = run.call_args_list[1]
        self.assertEqual(load_call.args[0], ["docker", "image", "load"])
        self.assertIn("stdin", load_call.kwargs)

    def test_drift_during_budget_or_prior_inspect_causes_zero_loads(self):
        for boundary in ("budget", "inspect"):
            with self.subTest(boundary=boundary), self.approved_archive() as archive:
                def foreign_replace():
                    other = archive.parent / "foreign.tar"
                    other.write_bytes(b"foreign")
                    other.chmod(0o600)
                    os.replace(other, archive)
                def budget(_):
                    if boundary == "budget":
                        foreign_replace()
                    return {}
                def inspect(argv, **_):
                    self.assertEqual(argv[:3], ["docker", "image", "inspect"])
                    if boundary == "inspect":
                        foreign_replace()
                    return response(None, 1)
                with patch.object(t, "filesystem_budget", side_effect=budget), \
                        patch.object(t.subprocess, "run", side_effect=inspect) as run:
                    with self.assertRaisesRegex(RuntimeError, "ArchiveIdentityDrift"):
                        t.load()
                    self.assertEqual(run.call_count, 1)
                self.assertEqual(archive.read_bytes(), b"foreign")

    def test_docker_load_reads_original_verified_fd_and_detects_post_load_drift(self):
        with self.approved_archive() as archive:
            inode = archive.stat().st_ino
            def command(argv, **kwargs):
                if argv[:3] == ["docker", "image", "load"]:
                    stream = kwargs["stdin"]
                    self.assertEqual(os.fstat(stream.fileno()).st_ino, inode)
                    self.assertEqual(stream.read(), b"approved")
                    other = archive.parent / "foreign.tar"
                    other.write_bytes(b"foreign")
                    os.replace(other, archive)
                    return response(None)
                return response(None, 1)
            with patch.object(t, "filesystem_budget", return_value={}), \
                    patch.object(t.subprocess, "run", side_effect=command):
                with self.assertRaisesRegex(RuntimeError, "ArchiveIdentityDrift"):
                    t.load()
            self.assertEqual(archive.read_bytes(), b"foreign")

    def test_wrapper_streams_approved_fd_without_reopening_path(self):
        received = bytearray()
        value = {"status": "ARCHIVE_SEALED", "archiveSha256": w.CHAIN["archiveSha256"],
                 "archiveBytes": w.CHAIN["archiveBytes"], "remoteWrites": True,
                 "freeSrvKiB": 10, "freeDockerKiB": 10, "requiredSrvKiB": 1,
                 "requiredDockerKiB": 1, "sameFilesystem": True}
        class Sink:
            def write(self, chunk):
                received.extend(chunk)
            def close(self):
                pass
        class Process:
            returncode = 0
            stdin = Sink()
            def communicate(self):
                return json.dumps(value).encode(), None
            def poll(self):
                return 0
            def kill(self):
                pass
        with self.approved_archive() as path, path.open("rb") as approved:
            other = path.parent / "foreign.tar"
            other.write_bytes(b"foreign")
            os.replace(other, path)
            with patch.object(w.subprocess, "Popen", return_value=Process()), \
                    patch.object(Path, "open", side_effect=AssertionError("path reopened")):
                self.assertEqual(w.invoke("receive", b"pass", approved), (value, 0))
            self.assertEqual(received, b"approved")

    def test_budget_checks_actual_docker_filesystem(self):
        roomy = SimpleNamespace(f_bavail=4000000, f_frsize=1024, st_dev=1)
        small = SimpleNamespace(f_bavail=100, f_frsize=1024, st_dev=2)
        with patch.object(t.subprocess, "run", return_value=response("/var/lib/docker")), \
                patch.object(t.os, "statvfs", side_effect=[roomy, small]), \
                patch.object(t.os, "stat", side_effect=[roomy, small]):
            with self.assertRaisesRegex(RuntimeError, "InsufficientTransportSpace"):
                t.filesystem_budget("load")


if __name__ == "__main__":
    unittest.main()
