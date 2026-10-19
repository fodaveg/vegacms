"""Receive and load the sealed single-image archive on the server.

Invoked only by the release owner's pinned local wrapper. No Compose, env,
Caddy, container, or volume data is requested by this stage.
"""

import hashlib
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import subprocess
import stat
import sys


ARCHIVE = Path("/srv/vega-image-rollout/fodaveg-cors-cc8f3b1-20261008.tar")
ARCHIVE_SHA = "abac0eb3feb7432880c7cc2a4a3d34444507347ff82c72967a4626a38a1bad8e"
ARCHIVE_BYTES = 488653312
ARCHIVE_KIB = (ARCHIVE_BYTES + 1023) // 1024
MARGIN_KIB = 512 * 1024
CHAIN = {'allBlobHashesVerified': True, 'architecture': 'amd64', 'archiveBytes': 488653312, 'archiveSha256': 'abac0eb3feb7432880c7cc2a4a3d34444507347ff82c72967a4626a38a1bad8e', 'commit': 'cc8f3b14dca9bf10e4a60502da9e17503362bbb8', 'configEnvProjected': False, 'configId': 'sha256:1b6436fee8c23615d7f7826cb4f87cb1d6e7e97d2d56150ff87a90571b951c40', 'layers': ['sha256:e58989146fcec76699871403b9897b5c014af1ccd85f5a9300a215e7975525d7', 'sha256:4990a62cab1587a2ed690c9d4f41675b9216d68120e99033d664b558662e90c8', 'sha256:3714bbaf32038e259cddcddea09e13fc9aaa1a86a644274a6c6e263b00972240', 'sha256:f6becc1249c39a0f6d687460220dcfcf9f2a46d01770a70fc0a8ed4c98a6fd49', 'sha256:cae24708e29a74f04cc1ec51fc52e2d283c35f243ab21912e036095a2b50dbde', 'sha256:9fbe3aed5e5205c4ab3b69a51833c2ed91345e401b8835595aa4a28150e74151', 'sha256:bff9a32ad7a1a82ad6c69b1e8edcc8055ccd317642b192bd59ea081c12fa54c1', 'sha256:d5fa04c4862406391ac76687c229121096e1796e1685c9d35e9ef85b673520e5', 'sha256:6595ba18ee1ecb659d2c39a41aca8ba324968d902da2756e09be2865d9a4c852', 'sha256:76df8aa567eba956d49d6af92ff6c4ba1a3030ebb66cc9a24bca9fc2a9266199', 'sha256:66cd04e4a667feafe6e338c132f0e73ab81d9376c4dd22ba5be6444852362850', 'sha256:b61ad1272e1aaedd007bcca47e3b96e97ae62fa78cedd2a6711417d71e997161', 'sha256:5f58cbe2dc2527f3c69a4d956a6972e63ccbd537ecb6879354b14e4b684e2421', 'sha256:809a531ce53f2668ed44aa6cd5607826cc727457ee04b27ce390171e6000d985', 'sha256:32d3a8074bc1399aaead12eee3c4a6d6f32461f4150398786e681b5e98255137', 'sha256:0bcc41565bee15e9875b81b1e9ddc04b0827cee5212713f16f3b0823452a4a91'], 'ociManifestDigest': 'sha256:22cf0983980e3bf9562a0a518f258e6e69cdd58cb3d23a19516f1da60a6d403e', 'ociMediaType': 'application/vnd.oci.image.manifest.v1+json', 'os': 'linux', 'status': 'FODAVEG_ARCHIVE_CHAIN_SEALED', 'tag': 'fodaveg-cors:cc8f3b1-candidate', 'tree': '693fc1ae70e8a28e64a87950e25883905a0de1d4'}
IMAGES = {CHAIN["tag"]: CHAIN["ociManifestDigest"]}



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


@contextmanager
def verified_archive():
    """Keep exactly the FD whose bytes and selected full identity were verified."""
    directory = delivery_parent(create=False)
    try:
        fd = os.open(ARCHIVE.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
        with os.fdopen(fd, "rb", buffering=0) as stream:
            info = os.fstat(stream.fileno())
            selected = file_identity(info)
            parent = file_identity(os.fstat(directory))
            if not stat.S_ISREG(info.st_mode) or info.st_size != ARCHIVE_BYTES or \
                    stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.geteuid():
                raise RuntimeError("ArchiveIdentityUnknown")
            hasher = hashlib.sha256()
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                hasher.update(chunk)
            if hasher.hexdigest() != ARCHIVE_SHA:
                raise RuntimeError("ArchiveIdentityUnknown")
            verify_selected(directory, stream, selected, parent)
            stream.seek(0)
            yield directory, stream, selected, parent
    finally:
        os.close(directory)


def verify_selected(directory, stream, selected, parent):
    if file_identity(os.fstat(stream.fileno())) != selected or \
            file_identity(os.stat(ARCHIVE.name, dir_fd=directory, follow_symlinks=False)) != selected or \
            file_identity(os.fstat(directory)) != parent or \
            file_identity(os.stat(ARCHIVE.parent, follow_symlinks=False)) != parent:
        raise RuntimeError("ArchiveIdentityDrift")


def archive_hash():
    with verified_archive():
        pass


def file_identity(value):
    return (value.st_dev, value.st_ino, value.st_uid, value.st_gid,
            stat.S_IMODE(value.st_mode), value.st_size, value.st_mtime_ns, value.st_ctime_ns)


def delivery_parent(create=True):
    """Open the literal parent without following any ancestor symlink."""
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in ARCHIVE.parent.parts[1:]:
            try:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            except FileNotFoundError:
                # Only this rollout leaf may be created, never a missing ancestor.
                if not create or part != ARCHIVE.parent.name:
                    raise RuntimeError("DeliveryParentUnknown") from None
                os.mkdir(part, mode=0o700, dir_fd=fd)
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        if stat.S_IMODE(os.fstat(fd).st_mode) != 0o700 or os.fstat(fd).st_uid != os.geteuid():
            raise RuntimeError("DeliveryDirectoryUnsafe")
        return fd
    except BaseException:
        os.close(fd)
        raise


def remove_owned(fd, name, expected):
    """A failed receive can remove only its own still-identical partial file."""
    try:
        actual = os.stat(name, dir_fd=fd, follow_symlinks=False)
    except FileNotFoundError:
        return
    if stat.S_ISREG(actual.st_mode) and file_identity(actual) == expected:
        os.unlink(name, dir_fd=fd)
        os.fsync(fd)


def receive():
    """Create one own archive; preserve foreign replacements on every failure."""
    budget = filesystem_budget("receive")
    directory = delivery_parent()
    try:
        descriptor = os.open(ARCHIVE.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o600, dir_fd=directory)
        stream = os.fdopen(descriptor, "wb")
        size, hasher = 0, hashlib.sha256()
        try:
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
            selected = os.stat(ARCHIVE.name, dir_fd=directory, follow_symlinks=False)
            if file_identity(selected) != file_identity(os.fstat(stream.fileno())) or \
                    file_identity(os.stat(ARCHIVE.parent, follow_symlinks=False)) != file_identity(os.fstat(directory)):
                raise RuntimeError("ArchiveOrParentReplaced")
            os.fsync(directory)
        except BaseException:
            stream.flush()
            remove_owned(directory, ARCHIVE.name, file_identity(os.fstat(stream.fileno())))
            raise
        finally:
            stream.close()
    finally:
        os.close(directory)
    return {"status": "ARCHIVE_SEALED", "archiveSha256": ARCHIVE_SHA,
            "archiveBytes": ARCHIVE_BYTES, "remoteWrites": True, **budget}


def load():
    """Docker reads the same verified FD by stdin, never an archive path again."""
    with verified_archive() as (directory, stream, selected, parent):
        budget = filesystem_budget("load")
        prior = subprocess.run(["docker", "image", "inspect", "--format", "{{json .Id}}", CHAIN["tag"]],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20, check=False)
        if prior.returncode != 1:
            raise RuntimeError("TagAlreadyPresentOrUnknown")
        verify_selected(directory, stream, selected, parent)
        stream.seek(0)
        try:
            loaded = subprocess.run(["docker", "image", "load"], stdin=stream,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                    timeout=300, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise RuntimeError("ImageLoadUnavailable") from None
        verify_selected(directory, stream, selected, parent)
        if loaded.returncode:
            raise RuntimeError("ImageLoadUnavailable")
        return identity(budget, remote_writes=True)


def identity(budget=None, remote_writes=False):
    """Require OCI ID, descriptor and uncompressed layers from the sealed chain."""
    template = ('{"id":{{json .Id}},"os":{{json .Os}},'
                '"architecture":{{json .Architecture}},"layers":{{json .RootFS.Layers}},'
                '"descriptor":{{json .Descriptor}}}')
    result = subprocess.run(["docker", "image", "inspect", "--format", template, CHAIN["tag"]],
                            capture_output=True, timeout=25, check=False)
    if result.returncode or len(result.stdout) > 32768 or len(result.stderr) > 1024:
        raise RuntimeError("ImageIdentityUnavailable")
    actual = json.loads(result.stdout)
    descriptor = actual.get("descriptor", {})
    if (set(actual) != {"id", "os", "architecture", "layers", "descriptor"} or
            actual["id"] != CHAIN["ociManifestDigest"] or actual["os"] != "linux" or
            actual["architecture"] != "amd64" or actual["layers"] != CHAIN["layers"] or
            not isinstance(descriptor, dict) or
            (descriptor.get("digest") or descriptor.get("Digest")) != CHAIN["ociManifestDigest"] or
            (descriptor.get("mediaType") or descriptor.get("MediaType")) != CHAIN["ociMediaType"]):
        raise RuntimeError("ImageChainDrift")
    return {"status": "FODAVEG_LOADED_CHAIN_PROVED", "archiveSha256": ARCHIVE_SHA,
            "archiveBytes": ARCHIVE_BYTES, "configId": CHAIN["configId"],
            "effectiveRemoteId": actual["id"], "remoteWrites": remote_writes,
            "platformAndLayersMatch": True, **(budget or {})}


def main():
    stage = sys.argv[1] if len(sys.argv) == 2 else None
    try:
        if stage == "receive":
            result = receive()
        elif stage == "load":
            result = load()
        elif stage == "identity":
            archive_hash()
            result = identity()
        else:
            raise RuntimeError("UnknownStage")
    except Exception:
        result = {"status": "STOP", "stage": stage, "remoteWrites": stage in ("receive", "load")}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] != "STOP" else 2


if __name__ == "__main__":
    sys.exit(main())
