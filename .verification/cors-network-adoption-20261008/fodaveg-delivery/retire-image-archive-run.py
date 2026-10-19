"""One new grant retires only the redundant owned remote image archive."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat

HERE = Path(__file__).resolve().parent
OPERATION = "836eb9dd-ec1b-4d81-a542-3c57a855b7de"
MODE = "fodaveg-owned-redundant-remote-image-archive-retirement"
ARTIFACTS = ("retire-image-archive.py", "retire-image-archive-run.py", "retire-image-archive-selftest.py", "RETIRE_IMAGE_ARCHIVE.md")
IMPORTS = {
    "image_helpers": (HERE.parent.parent / "image-only-delivery-20261008/remote_cutover.py", "5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128"),
    "cors_apply": (HERE / "remote_cutover_controlled.py", "43b68aba0c937deef45ff3a9e2e33f6d3933fb06949605fdc3b0d9448d31c7b4"),
    "image_transport": (HERE / "remote_transport.py", "ad47c6a2c2ec238ef545ecbcd6f06e0bc53df838ab100dcbbcbf3f5b34a10cc5"),
}
CAPTURE = Path(".verification/worktrees/caddy-referenced-env-20261008/.verification/release-adoption-plan-20261008/logs-selective-next-step/capture.py")
CAPTURE_SHA = "d48e4a2705ebaac2d32720b38ebab1040fde26b3348a2aeeeb906702af4e9b01"
LOCAL_ARCHIVE = HERE.parent / "fodaveg-image/fodaveg-cors-cc8f3b1-linux-amd64.tar"
SCOPE = {
    "remoteArchive": "/srv/vega-image-rollout/fodaveg-cors-cc8f3b1-20261008.tar",
    "archiveSHA256": "abac0eb3feb7432880c7cc2a4a3d34444507347ff82c72967a4626a38a1bad8e", "archiveBytes": 488653312,
    "localArchiveMustRemainVerified": True, "loadedImageId": "sha256:22cf0983980e3bf9562a0a518f258e6e69cdd58cb3d23a19516f1da60a6d403e",
    "loadedImageFields": ["Id", "RootFS.Layers"], "loadedImageChecks": 3,
    "oldRuntimeFields": ["Id", "Image", "State.Running", "State.Health.Status"], "oldRuntimeChecks": 3,
    "ownDataBackupStateMetadataAllowed": True, "dataBackupModifyAllowed": False,
    "dockerRootDirScalarRAMAccessAllowed": True, "filesystemMetadataAllowed": True,
    "archiveFullIdentityHashAndParentCASRequired": True, "archiveMustShareAllocatorFilesystem": True,
    "ownedBeforeAfterReceiptAllowed": True, "maxArchiveUnlinks": 1,
    "productionControlAllowed": False, "envOrLogContentAllowed": False, "otherCleanupAllowed": False,
    "imageUnloadOrBuildAllowed": False, "dataOrVolumeCleanupAllowed": False,
    "retryAllowed": False, "maxSSHConnections": 1, "transportTimeoutSeconds": 180, "outputLimitBytes": 4096,
}
FAILURES = {"OldRuntimeUnknown", "LoadedImageUnknown", "BackupStateUnknown", "AllocatorUnknown",
            "WrongFilesystem", "ArchiveIdentityUnknown", "ArchiveIdentityDrift", "ArchiveParentDrift",
            "ArchiveReappeared", "SnapshotDrift", "JournalDrift", "OTHER"}


def authorize(base, operation):
    """Hash, parse and transmit the same buffers; missing grant means no SSH."""
    snapshot = {name: (base / name).read_bytes() for name in ("retire-image-archive-approval.json", "retire-image-archive-manifest.json", *ARTIFACTS)}
    manifest = json.loads(snapshot["retire-image-archive-manifest.json"])
    grant = json.loads(snapshot["retire-image-archive-approval.json"])
    keys = {"status", "reviewStatus", "operationId", "mode", "manifestSHA256", "scope", "runtimeApprovalReference",
            "ownedArchiveRetirementExplicitlyApproved", "archiveTupleAndFileIdentityRAMAccessExplicitlyApproved"}
    if (operation != OPERATION or not isinstance(grant, dict) or set(grant) != keys
            or grant["status"] != "APPROVED" or grant["reviewStatus"] != "APPROVED"
            or grant["operationId"] != operation or grant["mode"] != MODE or grant["scope"] != SCOPE
            or grant["ownedArchiveRetirementExplicitlyApproved"] is not True or grant["archiveTupleAndFileIdentityRAMAccessExplicitlyApproved"] is not True
            or not isinstance(grant["runtimeApprovalReference"], str) or not grant["runtimeApprovalReference"].strip()
            or grant["manifestSHA256"] != hashlib.sha256(snapshot["retire-image-archive-manifest.json"]).hexdigest()
            or manifest["operationId"] != operation or manifest["scope"] != SCOPE or set(manifest["files"]) != set(ARTIFACTS)):
        raise ValueError("NOT_AUTHORIZED")
    for name, expected in manifest["files"].items():
        if hashlib.sha256(snapshot[name]).hexdigest() != expected:
            raise ValueError("SEAL_DRIFT")
    for module, (path, expected) in IMPORTS.items():
        body = path.read_bytes()
        if hashlib.sha256(body).hexdigest() != expected:
            raise ValueError("IMPORT_DRIFT")
        snapshot[module] = body
    snapshot["capture.py"] = (base.parents[2] / CAPTURE).read_bytes()
    if hashlib.sha256(snapshot["capture.py"]).hexdigest() != CAPTURE_SHA:
        raise ValueError("CAPTURE_DRIFT")
    return snapshot


def payload(snapshot):
    source = "import base64,json,sys,types\n"
    for name, module in (("image_helpers", "image_helpers"), ("cors_apply", "cors_apply"),
                         ("image_transport", "image_transport"), ("retire-image-archive.py", "archive_retire")):
        body = base64.b64encode(snapshot[name]).decode("ascii")
        source += ("m=types.ModuleType(" + repr(module) + ")\n"
                   "sys.modules[" + repr(module) + "]=m\n"
                   "exec(compile(base64.b64decode(" + repr(body) + "),'<sealed-module>','exec'),m.__dict__)\n")
    source += "value=sys.modules['archive_retire'].retire()\nprint(json.dumps(value,sort_keys=True,separators=(',',':')))\n"
    source += "sys.exit(0 if value['status']!='RETIRE_STOP' else 2)\n"
    return source.encode("ascii")


def project(value, code):
    keys = {"status", "operationId", "archiveBytes", "archiveSHA256", "archiveIdentity", "archiveAllocatedBytes", "archiveRemoved",
            "freeAllocatorBeforeKiB", "freeAllocatorAfterKiB", "freeSrvBeforeKiB", "freeSrvAfterKiB", "requiredAllocatorKiB", "requiredSrvKiB",
            "sameFilesystemProved", "budgetAfterPassed", "imageAndOldPinsPreserved", "backupStatePreserved", "remoteWrites",
            "productionControlOperations", "privateValuesExported", "failureClass"}
    numbers = ("archiveAllocatedBytes", "freeAllocatorBeforeKiB", "freeAllocatorAfterKiB", "freeSrvBeforeKiB", "freeSrvAfterKiB")
    booleans = ("archiveRemoved", "sameFilesystemProved", "budgetAfterPassed", "imageAndOldPinsPreserved", "backupStatePreserved", "remoteWrites")
    if (not isinstance(value, dict) or set(value) != keys or value["operationId"] != OPERATION
            or value["archiveBytes"] != SCOPE["archiveBytes"] or type(value["archiveBytes"]) is not int or value["archiveSHA256"] != SCOPE["archiveSHA256"]
            or value["requiredAllocatorKiB"] != 1510136 or type(value["requiredAllocatorKiB"]) is not int
            or value["requiredSrvKiB"] != 1511160 or type(value["requiredSrvKiB"]) is not int
            or any(value[k] is not False for k in ("productionControlOperations", "privateValuesExported"))
            or not all(type(value[k]) is bool for k in booleans)
            or not all(value[k] is None or type(value[k]) is int and 0 <= value[k] <= 10**13 for k in numbers)):
        raise ValueError("UNKNOWN_OUTPUT")
    identity = value["archiveIdentity"]
    if identity is not None and (not isinstance(identity, list) or len(identity) != 8 or not all(type(v) is int and 0 <= v <= 10**20 for v in identity)
                                 or identity[4] != 384 or identity[5] != SCOPE["archiveBytes"]):
        raise ValueError("UNKNOWN_OUTPUT")
    if value["status"] == "RETIRE_STOP":
        valid = code == 2 and value["failureClass"] in FAILURES
    else:
        valid = (code == 0 and value["status"] in {"RETIRE_PASSED_BUDGET_READY", "RETIRE_COMPLETED_BUDGET_FALSE"}
                 and value["failureClass"] is None and identity is not None and all(value[k] is True for k in booleans if k != "budgetAfterPassed")
                 and all(value[k] is not None for k in numbers)
                 and value["budgetAfterPassed"] == (value["freeAllocatorAfterKiB"] >= 1510136 and value["freeSrvAfterKiB"] >= 1511160)
                 and (value["status"] == "RETIRE_PASSED_BUDGET_READY") == value["budgetAfterPassed"])
    if not valid:
        raise ValueError("UNKNOWN_OUTPUT")
    return value


def archive_identity(info):
    return [info.st_dev, info.st_ino, info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode), info.st_size, info.st_mtime_ns, info.st_ctime_ns]


def archive_parent():
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in LOCAL_ARCHIVE.parent.parts[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def retained_archive():
    parent = archive_parent()
    try:
        fd = os.open(LOCAL_ARCHIVE.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        stream = os.fdopen(fd, "rb")
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size != SCOPE["archiveBytes"]:
            raise ValueError("LOCAL_ARCHIVE_UNKNOWN")
        digest = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1048576), b""):
            digest.update(chunk)
        if digest.hexdigest() != SCOPE["archiveSHA256"]:
            raise ValueError("LOCAL_ARCHIVE_UNKNOWN")
        verify_local(stream, archive_identity(before), parent)
        return stream, archive_identity(before), parent
    except BaseException:
        if "stream" in locals():
            stream.close()
        os.close(parent)
        raise


def verify_local(stream, identity, parent):
    fresh = archive_parent()
    try:
        pinned = os.fstat(parent)
        selected = os.fstat(fresh)
        same_parent = (pinned.st_dev, pinned.st_ino, pinned.st_uid, pinned.st_gid, pinned.st_mode) == (selected.st_dev, selected.st_ino, selected.st_uid, selected.st_gid, selected.st_mode)
        if not same_parent or archive_identity(os.fstat(stream.fileno())) != identity or archive_identity(os.stat(LOCAL_ARCHIVE.name, dir_fd=parent, follow_symlinks=False)) != identity:
            raise ValueError("LOCAL_ARCHIVE_DRIFT")
    finally:
        os.close(fresh)


def write_new(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--operation-id", required=True)
    args = parser.parse_args()
    try:
        snapshot = authorize(HERE, args.operation_id)
        namespace = {"__name__": "approved_capture"}
        exec(compile(snapshot["capture.py"], "<approved_capture>", "exec"), namespace)
        transport = namespace["capture_process"]
        body = payload(snapshot)
        archive, archive_before, archive_parent_fd = retained_archive()
        if (HERE / "retire-image-archive-execution.json").exists():
            raise ValueError("CONSUMED")
    except Exception:
        if "archive" in locals():
            archive.close()
            os.close(archive_parent_fd)
        print("NOT_AUTHORIZED_OR_SEAL_DRIFT_ZERO_CONNECTIONS")
        return 1
    try:
        write_new(HERE / "retire-image-archive-started.json", {"operationId": OPERATION, "attempts": 1})
    except OSError:
        archive.close()
        os.close(archive_parent_fd)
        print("CONSUMED_OR_UNAVAILABLE_ZERO_CONNECTIONS")
        return 1
    receipt = {"operationId": OPERATION, "status": "TRANSPORT_UNKNOWN_NO_RETRY", "transportExit": None}
    try:
        # Marker persistence may take time. Recheck the SAME hashed FD, selected
        # leaf fullidentity and literal parent immediately before the connection.
        verify_local(archive, archive_before, archive_parent_fd)
        result = transport(["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
                            "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=1", "lumbre", "python3", "-B", "-"],
                           input=body, timeout=180, limit=4096)
        receipt["transportExit"] = result.returncode if type(result.returncode) is int and -255 <= result.returncode <= 255 else None
        verify_local(archive, archive_before, archive_parent_fd)
        value = project(json.loads(result.stdout), result.returncode)
        receipt.update(status=value["status"], result=value, localArchiveRetainedVerified=True)
    except Exception:
        pass
    finally:
        archive.close()
        os.close(archive_parent_fd)
    write_new(HERE / "retire-image-archive-execution.json", receipt)
    print(json.dumps(receipt, sort_keys=True))
    return 0 if receipt["status"] in {"RETIRE_PASSED_BUDGET_READY", "RETIRE_COMPLETED_BUDGET_FALSE"} else 2


if __name__ == "__main__":
    raise SystemExit(main())
