"""Negative fixtures for the selected three-image identity projection."""

import json
from pathlib import Path
import unittest
from unittest.mock import patch

import remote_image_identity as remote
import run_image_identity as wrapper


class IdentityTests(unittest.TestCase):
    def image(self):
        return {"id": "sha256:" + "a" * 64, "os": "linux", "architecture": "amd64",
                "layers": ["sha256:" + "b" * 64],
                "descriptor": {"digest": "sha256:" + "c" * 64,
                               "mediaType": "application/vnd.oci.image.manifest.v1+json"},
                "revision": "d" * 40}

    def test_descriptor_annotations_are_not_projected(self):
        essential = {key: value for key, value in self.image().items()
                     if key in ("id", "os", "architecture", "layers")}
        descriptor = {"digest": "sha256:" + "c" * 64,
                      "mediaType": "application/vnd.oci.image.manifest.v1+json",
                      "annotations": {"private": "must not leave RAM"}}
        with patch.object(remote, "inspect_field", side_effect=[essential, descriptor, "d" * 40]):
            result = remote.project(next(iter(remote.TAGS)))
        self.assertEqual(result, self.image())
        self.assertNotIn("annotations", result["descriptor"])

    def test_invalid_layers_stop(self):
        essential = {"id": "sha256:" + "a" * 64, "os": "linux",
                     "architecture": "amd64", "layers": ["unknown"]}
        with patch.object(remote, "inspect_field", return_value=essential):
            with self.assertRaises(RuntimeError):
                remote.project(next(iter(remote.TAGS)))

    def test_wrapper_exact_schema(self):
        value = {"status": "IDENTITIES_PROJECTED_FOR_REVIEW", "schemaVersion": 1,
                 "remoteWrites": False, "configEnvRead": False,
                 "logsRead": False, "caddyRead": False,
                 "images": {tag: self.image() for tag in wrapper.TAGS}}
        self.assertTrue(wrapper.valid(value, 0))
        value["rawConfig"] = {"Env": ["SECRET=bad"]}
        self.assertFalse(wrapper.valid(value, 0))

    def test_local_archive_chain_connects_three_config_and_manifest_digests(self):
        path = Path(__file__).resolve().parent / "local-archive-image-chain.json"
        value = json.loads(path.read_bytes())
        self.assertTrue(value["identityChainVerified"])
        self.assertEqual(set(value["images"]), wrapper.TAGS)
        for image in value["images"].values():
            self.assertTrue(image["blobHashesVerified"])
            self.assertTrue(image["ociConfigDigestMatchesDockerConfig"])
            self.assertTrue(image["ociCompressedLayersMatchDockerManifest"])
            self.assertTrue(remote.SHA.fullmatch(image["configId"]))
            self.assertTrue(remote.SHA.fullmatch(image["ociManifestDigest"]))


if __name__ == "__main__":
    unittest.main()
