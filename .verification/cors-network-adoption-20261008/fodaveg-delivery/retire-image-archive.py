"""Retire only the redundant owned remote image export; keep loaded OCI/data."""
import hashlib
import json
import os
from pathlib import Path
import stat

import cors_apply as c
import image_helpers as h
import image_transport as t

OPERATION = "836eb9dd-ec1b-4d81-a542-3c57a855b7de"
RECORD = "fodaveg-image-archive-retire-" + OPERATION
BACKUP = "fodaveg-20261008T231304Z-3656162"
REQUIRED_ALLOCATOR = 1510136
REQUIRED_SRV = 1511160
PIN = '{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}'
IMAGE_PIN = '{"id":{{json .Id}},"layers":{{json .RootFS.Layers}}}'
FAILURES = {"OldRuntimeUnknown", "LoadedImageUnknown", "BackupStateUnknown", "AllocatorUnknown",
            "WrongFilesystem", "ArchiveIdentityUnknown", "ArchiveIdentityDrift", "ArchiveParentDrift",
            "ArchiveReappeared", "SnapshotDrift", "JournalDrift", "OTHER"}


def pins():
    spec = c.SPECS["fodaveg"]
    old = json.loads(h.run(["docker", "inspect", "--format", PIN, spec["containerId"]]))
    if old != {"id": spec["containerId"], "image": spec["oldImageId"], "running": True, "health": "healthy"} or type(old.get("running")) is not bool:
        raise RuntimeError("OldRuntimeUnknown")
    image = json.loads(h.run(["docker", "image", "inspect", "--format", IMAGE_PIN, t.CHAIN["tag"]]))
    if image != {"id": t.CHAIN["ociManifestDigest"], "layers": t.CHAIN["layers"]}:
        raise RuntimeError("LoadedImageUnknown")


def own_backup():
    path = c.ROOT / BACKUP / "state.json"
    body, selected = c.read_file(path)
    value = json.loads(body)
    spec = c.SPECS["fodaveg"]
    if (not isinstance(value, dict) or value.get("service") != "fodaveg" or value.get("status") != "PREPARED"
            or value.get("oldContainerId") != spec["containerId"] or value.get("imageId") != spec["imageId"]
            or value.get("oldComposeSha") != spec["base"] or value.get("newComposeSha") != spec["target"]):
        raise RuntimeError("BackupStateUnknown")
    return body, c.identity(selected)


def root_allocator():
    raw = h.run(["docker", "info", "--format", "{{json .DockerRootDir}}"])
    if len(raw) > 8192:
        raise RuntimeError("AllocatorUnknown")
    value = json.loads(raw)
    if not isinstance(value, str) or not 1 <= len(value) <= 4096 or "\0" in value:
        raise RuntimeError("AllocatorUnknown")
    root = Path(value)
    if not root.is_absolute() or str(root) != value or ".." in root.parts:
        raise RuntimeError("AllocatorUnknown")
    return root / "volumes"


def directory_identity(value):
    return [value.st_dev, value.st_ino, value.st_uid, value.st_gid, stat.S_IMODE(value.st_mode)]


def free(fd):
    value = os.fstatvfs(fd)
    return value.f_bavail * value.f_frsize // 1024


class Receipt:
    """Persist archive fullidentity/hash metadata before the unlink effect."""
    def __init__(self, value):
        self.path = c.ROOT / RECORD / "retirement.json"
        parent = c.parent_fd(self.path.parent)
        try:
            os.mkdir(RECORD, mode=0o700, dir_fd=parent)
            os.fsync(parent)
        finally:
            os.close(parent)
        fd = c.parent_fd(self.path)
        try:
            descriptor = os.open(self.path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
            body = self.body(value)
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(body)
                stream.flush()
                os.fsync(stream.fileno())
                self.identity = c.identity(os.fstat(stream.fileno()))
            os.fsync(fd)
            self.sha = hashlib.sha256(body).hexdigest()
        finally:
            os.close(fd)

    def body(self, value):
        return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()

    def save(self, value):
        body = self.body(value)
        self.identity = c.replace_owned(self.path, body, self.sha, self.identity)
        self.sha = hashlib.sha256(body).hexdigest()


def retire():
    value = {"status": "RETIRE_STOP", "operationId": OPERATION, "archiveBytes": t.ARCHIVE_BYTES,
             "archiveSHA256": t.ARCHIVE_SHA, "archiveIdentity": None, "archiveAllocatedBytes": None,
             "archiveRemoved": False, "freeAllocatorBeforeKiB": None, "freeAllocatorAfterKiB": None,
             "freeSrvBeforeKiB": None, "freeSrvAfterKiB": None, "requiredAllocatorKiB": REQUIRED_ALLOCATOR,
             "requiredSrvKiB": REQUIRED_SRV, "sameFilesystemProved": False,
             "budgetAfterPassed": False, "imageAndOldPinsPreserved": False, "backupStatePreserved": False,
             "remoteWrites": False, "productionControlOperations": False, "privateValuesExported": False,
             "failureClass": None}
    allocator_fd = srv_fd = None
    receipt = None
    try:
        pins()
        original_backup = own_backup()
        allocator_path = root_allocator()
        allocator_fd = c.parent_fd(allocator_path / "sentinel")
        allocator_identity = directory_identity(os.fstat(allocator_fd))
        srv_fd = c.parent_fd(c.ROOT / BACKUP / "sentinel")
        srv_identity = directory_identity(os.fstat(srv_fd))
        with t.verified_archive() as (parent, stream, selected, archive_parent):
            info = os.fstat(stream.fileno())
            if info.st_nlink != 1:
                raise RuntimeError("ArchiveIdentityUnknown")
            if info.st_dev != allocator_identity[0] or info.st_dev != srv_identity[0]:
                raise RuntimeError("WrongFilesystem")
            value.update(archiveIdentity=list(selected), archiveAllocatedBytes=info.st_blocks * 512,
                         freeAllocatorBeforeKiB=free(allocator_fd), freeSrvBeforeKiB=free(srv_fd), sameFilesystemProved=True)
            # Own metadata writes are separate from the delivery parent, so they
            # cannot invalidate the archive-parent CAS by changing its timestamps.
            value["remoteWrites"] = True
            prepared = {"phase": "PREPARED", **value}
            receipt = Receipt(prepared)
            pins()
            if own_backup() != original_backup or root_allocator() != allocator_path:
                raise RuntimeError("SnapshotDrift")
            fresh = c.parent_fd(allocator_path / "sentinel")
            try:
                if directory_identity(os.fstat(fresh)) != allocator_identity:
                    raise RuntimeError("SnapshotDrift")
            finally:
                os.close(fresh)
            receipt.save({"phase": "UNLINK_ISSUED", **value})
            # Last fresh gate checks the approved inode, all identity fields,
            # parent fullidentity and the same literal no-symlink parent chain.
            t.verify_selected(parent, stream, selected, archive_parent)
            actual_parent = c.parent_fd(t.ARCHIVE)
            try:
                if c.identity(os.fstat(actual_parent)) != list(archive_parent):
                    raise RuntimeError("ArchiveParentDrift")
            finally:
                os.close(actual_parent)
            os.unlink(t.ARCHIVE.name, dir_fd=parent)
            value["archiveRemoved"] = True
            os.fsync(parent)
            receipt.save({"phase": "UNLINKED_FD_STILL_OPEN", **value})
        # Closing the verified descriptor is necessary before observing released
        # physical space. Keep every data backup, loaded image and local archive.
        parent = c.parent_fd(t.ARCHIVE)
        try:
            try:
                os.stat(t.ARCHIVE.name, dir_fd=parent, follow_symlinks=False)
            except FileNotFoundError:
                pass
            else:
                raise RuntimeError("ArchiveReappeared")
        finally:
            os.close(parent)
        fresh = c.parent_fd(allocator_path / "sentinel")
        try:
            if root_allocator() != allocator_path or directory_identity(os.fstat(fresh)) != allocator_identity:
                raise RuntimeError("SnapshotDrift")
        finally:
            os.close(fresh)
        value.update(freeAllocatorAfterKiB=free(allocator_fd), freeSrvAfterKiB=free(srv_fd))
        pins()
        value["imageAndOldPinsPreserved"] = True
        if own_backup() != original_backup:
            raise RuntimeError("SnapshotDrift")
        value["backupStatePreserved"] = True
        value["budgetAfterPassed"] = value["freeAllocatorAfterKiB"] >= REQUIRED_ALLOCATOR and value["freeSrvAfterKiB"] >= REQUIRED_SRV
        value["status"] = "RETIRE_PASSED_BUDGET_READY" if value["budgetAfterPassed"] else "RETIRE_COMPLETED_BUDGET_FALSE"
        receipt.save({"phase": "FINAL", **value})
    except Exception as exc:
        label = str(exc)
        value["failureClass"] = label if label in FAILURES else "OTHER"
        if receipt is not None:
            try:
                receipt.save({"phase": "STOP", **value})
            except Exception:
                value["failureClass"] = "JournalDrift"
    finally:
        if allocator_fd is not None:
            os.close(allocator_fd)
        if srv_fd is not None:
            os.close(srv_fd)
    return value
