"""Seal Fodaveg's single-image Docker/OCI export without extracting configs."""

import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tarfile

HERE = Path(__file__).resolve().parent
ARCHIVE = HERE.parent / "fodaveg-image/fodaveg-cors-cc8f3b1-linux-amd64.tar"
TAG = "fodaveg-cors:cc8f3b1-candidate"
CONFIG = "sha256:1b6436fee8c23615d7f7826cb4f87cb1d6e7e97d2d56150ff87a90571b951c40"
COMMIT = "cc8f3b14dca9bf10e4a60502da9e17503362bbb8"
TREE = "693fc1ae70e8a28e64a87950e25883905a0de1d4"
SHA = re.compile(r"sha256:[0-9a-f]{64}")
MEDIA = "application/vnd.oci.image.manifest.v1+json"


def digest_file(stream):
    hasher = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        hasher.update(chunk)
    return hasher.hexdigest()


def project(path, tag=TAG, config_id=CONFIG):
    """Verify every addressed blob, then retain only the public identity chain."""
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as source:
        before = os.fstat(source.fileno())
        if not stat.S_ISREG(before.st_mode):
            raise RuntimeError("ArchiveNotRegular")
        archive_sha = digest_file(source)
        source.seek(0)
        with tarfile.open(fileobj=source, mode="r:") as archive:
            members = {}
            for member in archive.getmembers():
                if member.name in members or member.name.startswith("/") or ".." in Path(member.name).parts or \
                        not (member.isfile() or member.isdir()):
                    raise RuntimeError("ArchiveMemberUnsafe")
                members[member.name] = member
                if member.isfile() and member.name.startswith("blobs/sha256/"):
                    if not re.fullmatch(r"blobs/sha256/[0-9a-f]{64}", member.name) or \
                            digest_file(archive.extractfile(member)) != member.name.rsplit("/", 1)[-1]:
                        raise RuntimeError("ArchiveBlobHashMismatch")

            def small(name):
                member = members.get(name)
                if member is None or not member.isfile() or member.size > 1024 * 1024:
                    raise RuntimeError("ArchiveMetadataUnknown")
                return json.loads(archive.extractfile(member).read())

            docker = small("manifest.json")
            index = small("index.json")
            if not isinstance(docker, list) or len(docker) != 1 or docker[0].get("RepoTags") != [tag] or \
                    len(index.get("manifests", [])) != 1:
                raise RuntimeError("ArchiveTagUnknown")
            descriptor = index["manifests"][0]
            name = descriptor.get("annotations", {}).get("io.containerd.image.name", "")
            oci_id = descriptor.get("digest", "")
            if name.removeprefix("docker.io/library/") != tag or not SHA.fullmatch(oci_id) or \
                    descriptor.get("mediaType") != MEDIA:
                raise RuntimeError("ArchiveDescriptorUnknown")
            entry = docker[0]
            if entry.get("Config") != "blobs/sha256/" + config_id.removeprefix("sha256:"):
                raise RuntimeError("ArchiveConfigDrift")
            config = small(entry["Config"])
            manifest = small("blobs/sha256/" + oci_id.removeprefix("sha256:"))
            layers = config.get("rootfs", {}).get("diff_ids")
            docker_layers = entry.get("Layers")
            oci_layers = manifest.get("layers")
            if config.get("os") != "linux" or config.get("architecture") != "amd64" or \
                    not isinstance(layers, list) or not 1 <= len(layers) <= 64 or \
                    any(not isinstance(layer, str) or not SHA.fullmatch(layer) for layer in layers) or \
                    manifest.get("mediaType") != MEDIA or manifest.get("config", {}).get("digest") != config_id or \
                    manifest.get("config", {}).get("mediaType") != "application/vnd.oci.image.config.v1+json" or \
                    not isinstance(docker_layers, list) or not isinstance(oci_layers, list) or \
                    len(docker_layers) != len(layers) or len(oci_layers) != len(layers):
                raise RuntimeError("ArchiveChainUnknown")
            for local, layer, diff_id in zip(docker_layers, oci_layers, layers):
                if not isinstance(local, str) or not re.fullmatch(r"blobs/sha256/[0-9a-f]{64}", local) or \
                        layer.get("digest") != "sha256:" + local.rsplit("/", 1)[-1] or \
                        layer.get("mediaType") != "application/vnd.oci.image.layer.v1.tar" or \
                        layer.get("digest") != diff_id or \
                        local not in members or layer.get("size") != members[local].size:
                    raise RuntimeError("ArchiveLayerDrift")
            if descriptor.get("size") != members["blobs/sha256/" + oci_id.removeprefix("sha256:")].size or \
                    manifest["config"].get("size") != members[entry["Config"]].size:
                raise RuntimeError("ArchiveDescriptorSizeDrift")
        after = os.fstat(source.fileno())
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != \
                (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise RuntimeError("ArchiveChangedDuringSeal")
    return {"status": "FODAVEG_ARCHIVE_CHAIN_SEALED", "commit": COMMIT, "tree": TREE,
            "archiveSha256": archive_sha, "archiveBytes": before.st_size,
            "tag": tag, "configId": config_id, "ociManifestDigest": oci_id,
            "ociMediaType": MEDIA, "os": "linux", "architecture": "amd64", "layers": layers,
            "allBlobHashesVerified": True, "configEnvProjected": False}


def write_new(path, value):
    """Keep the first reviewed seal; never silently overwrite evidence."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


if __name__ == "__main__":
    write_new(HERE / "archive-chain-v2.json", project(ARCHIVE))
    print("FODAVEG_ARCHIVE_CHAIN_SEALED")
