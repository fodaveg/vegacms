"""Offline crafted Docker/OCI archives exercise the identity boundary."""

import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

import seal_archive as s


def fixture(path, defect=None):
    bodies = {}

    def blob(value):
        body = json.dumps(value).encode() if isinstance(value, dict) else value
        key = hashlib.sha256(body).hexdigest()
        bodies["blobs/sha256/" + key] = body
        return {"digest": "sha256:" + key, "size": len(body)}

    layer = blob(b"layer bytes")
    diff_id = "sha256:" + "0" * 64 if defect == "diff-id" else layer["digest"]
    config = blob({"os": "linux", "architecture": "amd64", "rootfs": {"diff_ids": [diff_id]},
                   "config": {"Env": ["DO_NOT_PROJECT=private"]}})
    layer["mediaType"] = "application/vnd.oci.image.layer.v1.tar+gzip" if defect == "compressed" else \
        "application/vnd.oci.image.layer.v1.tar"
    if defect == "size":
        layer["size"] += 1
    config["mediaType"] = "application/vnd.oci.image.config.v1+json"
    manifest = blob({"mediaType": s.MEDIA, "config": config, "layers": [layer]})
    manifest.update({"mediaType": s.MEDIA, "annotations": {"io.containerd.image.name": "docker.io/library/" + s.TAG}})
    bodies["index.json"] = json.dumps({"manifests": [manifest]}).encode()
    bodies["manifest.json"] = json.dumps([{"RepoTags": [s.TAG], "Config": "blobs/sha256/" + config["digest"][7:],
                                          "Layers": ["blobs/sha256/" + layer["digest"][7:]]}]).encode()
    if defect == "hash":
        bodies["blobs/sha256/" + layer["digest"][7:]] = b"changed"
    with tarfile.open(path, "w") as archive:
        for name, body in bodies.items():
            info = tarfile.TarInfo(name)
            info.size = len(body)
            archive.addfile(info, io.BytesIO(body))
        if defect == "duplicate":
            archive.addfile(info, io.BytesIO(body))
    return config["digest"]


class SealTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "image.tar"

    def test_valid_projects_no_env(self):
        result = s.project(self.path, config_id=fixture(self.path))
        self.assertEqual(result["configEnvProjected"], False)
        self.assertNotIn("private", json.dumps(result))
        self.assertEqual(result["layers"][0], result["layers"][0])

    def test_config_digest_does_not_prove_diff_id(self):
        config = fixture(self.path, "diff-id")
        with self.assertRaisesRegex(RuntimeError, "ArchiveLayerDrift"):
            s.project(self.path, config_id=config)

    def test_corrupted_blob_and_unknown_compression_and_size(self):
        for defect in ("hash", "compressed", "size", "duplicate"):
            with self.subTest(defect=defect):
                config = fixture(self.path, defect)
                with self.assertRaises(RuntimeError):
                    s.project(self.path, config_id=config)

    def test_wrong_config_and_symlink_and_no_overwrite(self):
        fixture(self.path)
        with self.assertRaises(RuntimeError):
            s.project(self.path)
        link = self.path.parent / "link.tar"
        link.symlink_to(self.path)
        with self.assertRaises(OSError):
            s.project(link)
        out = self.path.parent / "seal.json"
        s.write_new(out, {"first": True})
        with self.assertRaises(FileExistsError):
            s.write_new(out, {"first": False})
        self.assertEqual(json.loads(out.read_text()), {"first": True})


if __name__ == "__main__":
    unittest.main()
