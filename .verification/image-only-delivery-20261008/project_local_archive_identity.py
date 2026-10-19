"""Project only public identity fields from the locally sealed image archive."""

import hashlib
import json
import os
from pathlib import Path
import re
import tarfile


HERE = Path(__file__).resolve().parent
ARCHIVE = HERE.parent / "release-image-distribution-a51b-20261008" / "images.tar"
OUT = HERE / "local-archive-image-chain.json"
ARCHIVE_SHA = "34a1780fe31f9c1b50a5e47435fa6183cdd53d956ce00ddab82a247ae8e1ee0a"
ARCHIVE_BYTES = 606022656
TAGS = {"vegacms:a51b8521e1eeef52a522d2a065b36a03578c0c3a",
        "lumbre-admin-pb:a598bfe-vega-a51b852",
        "fodaveg:f92bac858e904817ffc4cf6bf6307a6de0190c32"}
SHA = re.compile(r"sha256:[0-9a-f]{64}")


def small_bytes(archive, name):
    member = archive.getmember(name)
    if not member.isfile() or member.size > 1024 * 1024:
        raise RuntimeError("ArchiveMemberUnknown")
    stream = archive.extractfile(member)
    if stream is None:
        raise RuntimeError("ArchiveMemberUnknown")
    body = stream.read(1024 * 1024 + 1)
    if len(body) != member.size:
        raise RuntimeError("ArchiveMemberIncomplete")
    if name.startswith("blobs/sha256/") and hashlib.sha256(body).hexdigest() != name.rsplit("/", 1)[-1]:
        raise RuntimeError("ArchiveBlobHashMismatch")
    return body


def small_json(archive, name):
    return json.loads(small_bytes(archive, name))


def main():
    if OUT.exists() or ARCHIVE.is_symlink() or ARCHIVE.stat().st_size != ARCHIVE_BYTES:
        raise SystemExit("STOP: local archive/output identity")
    hasher = hashlib.sha256()
    with ARCHIVE.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    if hasher.hexdigest() != ARCHIVE_SHA:
        raise SystemExit("STOP: local archive hash")
    with tarfile.open(ARCHIVE, "r:") as archive:
        docker_manifest = small_json(archive, "manifest.json")
        oci_index = small_json(archive, "index.json")
        oci_by_tag = {}
        for descriptor in oci_index["manifests"]:
            name = descriptor.get("annotations", {}).get("io.containerd.image.name", "")
            tag = name.removeprefix("docker.io/library/")
            if tag in TAGS:
                oci_by_tag[tag] = descriptor
        if len(docker_manifest) != 3 or set(oci_by_tag) != TAGS:
            raise SystemExit("STOP: archive manifest tags")
        images = {}
        for entry in docker_manifest:
            tags = entry.get("RepoTags")
            config_name = entry.get("Config")
            if not isinstance(tags, list) or len(tags) != 1 or tags[0] not in TAGS or \
                    not isinstance(config_name, str) or not re.fullmatch(r"blobs/sha256/[0-9a-f]{64}", config_name):
                raise SystemExit("STOP: Docker manifest identity")
            config = small_json(archive, config_name)
            diff_ids = config.get("rootfs", {}).get("diff_ids")
            revision = (config.get("config") or {}).get("Labels", {}).get("org.opencontainers.image.revision")
            if (not isinstance(diff_ids, list) or not 1 <= len(diff_ids) <= 64 or
                    any(not isinstance(item, str) or not SHA.fullmatch(item) for item in diff_ids)):
                raise SystemExit("STOP: config layers")
            descriptor = oci_by_tag[tags[0]]
            config_id = "sha256:" + config_name.rsplit("/", 1)[-1]
            oci_digest = descriptor.get("digest")
            if not isinstance(oci_digest, str) or not SHA.fullmatch(oci_digest):
                raise SystemExit("STOP: OCI descriptor digest")
            oci_manifest = small_json(archive, "blobs/sha256/" + oci_digest.removeprefix("sha256:"))
            oci_config = oci_manifest.get("config", {})
            oci_layers = oci_manifest.get("layers")
            docker_layers = entry.get("Layers")
            if (oci_manifest.get("mediaType") != descriptor.get("mediaType") or
                    oci_config.get("digest") != config_id or
                    oci_config.get("mediaType") != "application/vnd.oci.image.config.v1+json" or
                    not isinstance(oci_layers, list) or not isinstance(docker_layers, list) or
                    len(oci_layers) != len(diff_ids) or len(docker_layers) != len(diff_ids) or
                    any(not isinstance(layer, dict) or layer.get("digest") != "sha256:" + docker_layer.rsplit("/", 1)[-1]
                        for layer, docker_layer in zip(oci_layers, docker_layers))):
                raise SystemExit("STOP: OCI/Docker config or layer chain")
            if revision is not None and (not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}", revision)):
                revision = None
            images[tags[0]] = {"configId": config_id, "os": config.get("os"),
                                "architecture": config.get("architecture"),
                                "layers": diff_ids, "revision": revision,
                                "ociManifestDigest": oci_digest,
                                "ociMediaType": descriptor.get("mediaType"),
                                "ociConfigDigestMatchesDockerConfig": True,
                                "ociCompressedLayersMatchDockerManifest": True,
                                "blobHashesVerified": True}
        if set(images) != TAGS:
            raise SystemExit("STOP: projected tags")
    result = {"status": "LOCAL_ARCHIVE_IDENTITY_PROJECTED", "archiveSha256": ARCHIVE_SHA,
              "archiveBytes": ARCHIVE_BYTES, "configEnvProjected": False,
              "identityChainVerified": True, "images": images}
    descriptor = os.open(OUT, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(result, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(result["status"])


if __name__ == "__main__":
    main()
