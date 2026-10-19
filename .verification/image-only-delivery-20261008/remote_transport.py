"""Receive and load the sealed three-image archive on the server.

Invoked only by the release owner's pinned local wrapper. No Compose, env,
Caddy, container, or volume data is requested by this stage.
"""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


ARCHIVE = Path("/srv/vega-image-rollout/images-a51b-20261008.tar")
ARCHIVE_SHA = "34a1780fe31f9c1b50a5e47435fa6183cdd53d956ce00ddab82a247ae8e1ee0a"
ARCHIVE_BYTES = 606022656
ARCHIVE_KIB = (ARCHIVE_BYTES + 1023) // 1024
MARGIN_KIB = 512 * 1024
IMAGES = {
    "vegacms:a51b8521e1eeef52a522d2a065b36a03578c0c3a":
        "sha256:9cd8aaaee3b486b8d9bc3f19de89ecab2e5d67a62717f2b492e7a20dfd428adc",
    "lumbre-admin-pb:a598bfe-vega-a51b852":
        "sha256:7465d6b88612beff8a68d6f9b727935e76898fd4d4a76e200459bea2eeeebfe4",
    "fodaveg:f92bac858e904817ffc4cf6bf6307a6de0190c32":
        "sha256:fbb072fe3a1a80f8c5ee87104e470fb71729c07d3e158b696c020eaf9ce7f223",
}


def filesystem_budget(stage):
    """Check /srv and Docker's actual root filesystem before heavy writes."""
    try:
        result = subprocess.run(["docker", "info", "--format", "{{json .DockerRootDir}}"],
                                capture_output=True, timeout=20, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("DockerRootUnknown") from None
    if result.returncode or len(result.stdout) > 1024 or len(result.stderr) > 1024:
        raise RuntimeError("DockerRootUnknown")
    try:
        docker_root = json.loads(result.stdout)
    except (ValueError, UnicodeDecodeError):
        raise RuntimeError("DockerRootUnknown") from None
    if not isinstance(docker_root, str) or not docker_root.startswith("/") or "/../" in docker_root:
        raise RuntimeError("DockerRootUnknown")
    srv_stat, docker_stat = os.statvfs("/srv"), os.statvfs(docker_root)
    srv_free = srv_stat.f_bavail * srv_stat.f_frsize // 1024
    docker_free = docker_stat.f_bavail * docker_stat.f_frsize // 1024
    same_fs = os.stat("/srv").st_dev == os.stat(docker_root).st_dev
    if stage == "receive":
        required_srv, required_docker = ARCHIVE_KIB + MARGIN_KIB, MARGIN_KIB
    else:
        required_srv, required_docker = MARGIN_KIB, ARCHIVE_KIB * 3 + MARGIN_KIB
    if same_fs:
        required_srv = required_docker = max(required_srv, required_docker)
    if srv_free < required_srv or docker_free < required_docker:
        raise RuntimeError("InsufficientTransportSpace")
    return {"freeSrvKiB": srv_free, "freeDockerKiB": docker_free,
            "requiredSrvKiB": required_srv, "requiredDockerKiB": required_docker,
            "sameFilesystem": same_fs}


def archive_hash():
    """Verify the sealed regular archive without emitting its contents."""
    if ARCHIVE.is_symlink() or not ARCHIVE.is_file() or ARCHIVE.stat().st_size != ARCHIVE_BYTES:
        raise RuntimeError("ArchiveIdentityUnknown")
    hasher = hashlib.sha256()
    with ARCHIVE.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    if hasher.hexdigest() != ARCHIVE_SHA:
        raise RuntimeError("ArchiveIdentityUnknown")


def receive():
    """Create exactly one sealed archive; never overwrite an existing path."""
    budget = filesystem_budget("receive")
    parent = ARCHIVE.parent
    parent.mkdir(mode=0o700, exist_ok=True)
    if parent.is_symlink() or parent.stat().st_mode & 0o077:
        raise RuntimeError("DeliveryDirectoryUnsafe")
    descriptor = os.open(ARCHIVE, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    size, hasher = 0, hashlib.sha256()
    try:
        with os.fdopen(descriptor, "wb") as stream:
            for chunk in iter(lambda: sys.stdin.buffer.read(1024 * 1024), b""):
                size += len(chunk)
                if size > ARCHIVE_BYTES:
                    raise RuntimeError("ArchiveTooLarge")
                stream.write(chunk)
                hasher.update(chunk)
            stream.flush()
            os.fsync(stream.fileno())
        if size != ARCHIVE_BYTES or hasher.hexdigest() != ARCHIVE_SHA:
            raise RuntimeError("ArchiveIdentityUnknown")
        directory = os.open(parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    except BaseException:
        ARCHIVE.unlink(missing_ok=True)
        raise
    return {"status": "ARCHIVE_SEALED", "archiveSha256": ARCHIVE_SHA,
            "archiveBytes": ARCHIVE_BYTES, "remoteWrites": True, **budget}


def load():
    """Load the exact archive and prove each expected tag resolves to its ID."""
    archive_hash()
    budget = filesystem_budget("load")
    try:
        loaded = subprocess.run(["docker", "image", "load", "--input", str(ARCHIVE)],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                timeout=300, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("ImageLoadUnavailable") from None
    if loaded.returncode:
        raise RuntimeError("ImageLoadUnavailable")
    for tag, expected in IMAGES.items():
        try:
            result = subprocess.run(["docker", "image", "inspect", "--format", "{{json .Id}}", tag],
                                    capture_output=True, timeout=20, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise RuntimeError("ImageIdentityUnavailable") from None
        if result.returncode or len(result.stdout) > 200 or len(result.stderr) > 1024:
            raise RuntimeError("ImageIdentityUnavailable")
        try:
            actual = json.loads(result.stdout)
        except (ValueError, UnicodeDecodeError):
            raise RuntimeError("ImageIdentityUnavailable") from None
        if not isinstance(actual, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", actual) or actual != expected:
            raise RuntimeError("ImageIdentityDrift")
    return {"status": "THREE_IMAGES_LOADED", "archiveSha256": ARCHIVE_SHA,
            "imageIds": IMAGES, "remoteWrites": True, **budget}


def main():
    stage = sys.argv[1] if len(sys.argv) == 2 else None
    try:
        if stage == "receive":
            result = receive()
        elif stage == "load":
            result = load()
        else:
            raise RuntimeError("UnknownStage")
    except Exception:
        result = {"status": "STOP", "stage": stage, "remoteWrites": True}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] != "STOP" else 2


if __name__ == "__main__":
    sys.exit(main())
