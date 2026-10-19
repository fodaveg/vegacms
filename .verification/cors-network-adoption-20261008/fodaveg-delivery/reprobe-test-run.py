"""One new grant, one frozen TEST-only reprobe, no production control."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import time

HERE = Path(__file__).resolve().parent
OPERATION = "b32e0d62-7fd7-4e86-bf21-7b3c17996802"
MODE = "fodaveg-owned-test-only-quiesced-archive-reprobe"
ARTIFACTS = ("reprobe-test-core.py", "reprobe-test-run.py", "reprobe-test-selftest.py",
             "reprobe-test-wrapper-selftest.py", "reprobe-local-volume.py", "REPROBE_TEST.md")
IMPORTS = {
    "image_helpers": (HERE.parent.parent / "image-only-delivery-20261008/remote_cutover.py", "5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128"),
    "cors_apply": (HERE / "remote_cutover_controlled.py", "43b68aba0c937deef45ff3a9e2e33f6d3933fb06949605fdc3b0d9448d31c7b4"),
}
CAPTURE = Path(".verification/worktrees/caddy-referenced-env-20261008/.verification/release-adoption-plan-20261008/logs-selective-next-step/capture.py")
CAPTURE_SHA = "d48e4a2705ebaac2d32720b38ebab1040fde26b3348a2aeeeb906702af4e9b01"
SCOPE = {
    "backupId": "fodaveg-20261008T231304Z-3656162",
    "archiveSHA256": "3a78532b99aea0dd1a424039ea0fca0eed67b9ef4026d48049cfc0f89285bdde", "archiveBytes": 110406535,
    "archiveIdentity": [2049, 433285, 0, 0, 384, 110406535, 1791501199906887961, 1791501200051887374],
    "expandedBytes": 875290525, "archiveFiles": 71,
    "oldId": "6bddffa88de1c2738bf9aee711425f512deac30365f6183bb3d2ad008a2ff452",
    "newImage": "sha256:22cf0983980e3bf9562a0a518f258e6e69cdd58cb3d23a19516f1da60a6d403e",
    "driver": "local", "driverOptionsAllowed": False,
    "initialOwnMetadataAllowanceKiB": 1024, "initialFreeReserveKiB": 524288,
    "fullParentCloneBudgetBeforeAnyWritesRequired": True, "pbHeadroomBeforeNativeKiB": 131072,
    "ownRecordIdBoundInNewGrantAndPersistedLocallyBeforeSSH": True,
    "ownContainerSelectedFields": ["Id", "Image", "Name", "State.Running", "State.Status", "State.ExitCode", "HostConfig.NetworkMode", "HostConfig.ReadonlyRootfs", "HostConfig.PortBindingsEmpty", "NetworkSettings.NetworkNames", "Config.Entrypoint", "Config.Cmd", "TwoOwnLabels", "Mounts.TypeNameDestinationRW"],
    "ownVolumeSelectedFields": ["Name", "Driver", "OptionsEmpty", "MountpointRAM", "CreatedAt", "TwoOwnLabels"],
    "dockerRootDirScalarRAMOnly": True,
    "actualMountpointBudgetBeforeExtractionRequired": True, "maxOwnedVolumes": 1, "maxOwnedContainers": 2,
    "productionStopOrStartAllowed": False, "productionDataRestoreAllowed": False,
    "composeOrDotenvAccessAllowed": False, "configEnvOrLogContentAllowed": False,
    "oldUnrecordedTestCleanupAllowed": False, "pullOrBuildAllowed": False,
    "privateArchiveRAMAndSameFDUseExplicit": True, "retryAllowed": False,
    "maxSSHConnections": 1, "transportTimeoutSeconds": 900, "outputLimitBytes": 4096,
}
PHASES = {"PRECHECK", "INTENT", "ARCHIVE", "ALLOCATOR", "CREATE_VOLUME", "PROVE_VOLUME", "MOUNT_BUDGET",
          "CREATE_EXTRACTOR", "START_EXTRACTOR", "VERIFY_BYTES", "CREATE_PB", "START_PB",
          "PB_HEALTH", "PRIMARY_PASSED", "CLEANUP_PB", "CLEANUP_EXTRACTOR", "CLEANUP_VOLUME", "FINAL"}
FAILURES = {"CommandUnavailable", "CommandExitNonzero", "OutputBoundExceeded", "OldPinUnknown",
            "ArchiveUnknown", "ArchiveDrift", "RestoreMismatch", "AllocatorUnknown", "BudgetInsufficient",
            "TestCollision", "TestIdentityUnknown", "VolumeOwnershipUnknown", "ContainerOwnershipUnknown",
            "CloneUnhealthy", "JournalDrift", "CreationOutcomeUnresolved", "OTHER"}


def authorize(base, operation):
    """Hash, parse and transmit the same buffers; missing grant means no SSH."""
    snapshot = {name: (base / name).read_bytes() for name in ("reprobe-test-approval.json", "reprobe-test-manifest.json", *ARTIFACTS)}
    manifest = json.loads(snapshot["reprobe-test-manifest.json"])
    grant = json.loads(snapshot["reprobe-test-approval.json"])
    keys = {"status", "reviewStatus", "operationId", "mode", "manifestSHA256", "scope", "runtimeApprovalReference",
            "ownedTestWritesExplicitlyApproved", "privateArchiveRAMAccessExplicitlyApproved", "ownedRecordId"}
    if (operation != OPERATION or not isinstance(grant, dict) or set(grant) != keys
            or grant["status"] != "APPROVED" or grant["reviewStatus"] != "APPROVED"
            or grant["operationId"] != operation or grant["mode"] != MODE or json.dumps(grant["scope"], sort_keys=True) != json.dumps(SCOPE, sort_keys=True)
            or grant["ownedTestWritesExplicitlyApproved"] is not True or grant["privateArchiveRAMAccessExplicitlyApproved"] is not True
            or not isinstance(grant["runtimeApprovalReference"], str) or not grant["runtimeApprovalReference"].strip()
            or not isinstance(grant["ownedRecordId"], str) or re.fullmatch(r"fodaveg-reprobe-[0-9]{8}T[0-9]{6}Z-[0-9]{1,10}", grant["ownedRecordId"]) is None
            or grant["manifestSHA256"] != hashlib.sha256(snapshot["reprobe-test-manifest.json"]).hexdigest()
            or manifest["operationId"] != operation or json.dumps(manifest["scope"], sort_keys=True) != json.dumps(SCOPE, sort_keys=True) or set(manifest["files"]) != set(ARTIFACTS)):
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


def payload(snapshot, owner):
    source = "import base64,json,sys,types\n"
    for name, module in (("image_helpers", "image_helpers"), ("cors_apply", "cors_apply"),
                         ("reprobe-local-volume.py", "local_volume_constructor"), ("reprobe-test-core.py", "test_core")):
        body = base64.b64encode(snapshot[name]).decode("ascii")
        source += ("m=types.ModuleType(" + repr(module) + ")\n"
                   "sys.modules[" + repr(module) + "]=m\n"
                   "exec(compile(base64.b64decode(" + repr(body) + "),'<sealed-module>','exec'),m.__dict__)\n")
    source += "sys.modules['test_core'].OPERATOR_RECORD_ID=" + repr(owner) + "\n"
    source += "value=sys.modules['test_core'].entry()\nprint(json.dumps(value,sort_keys=True,separators=(',',':')))\n"
    source += "sys.exit(0 if value['status']=='TEST_REPROBE_PASSED_AND_CLEANED' else 2)\n"
    return source.encode("ascii")


def finite_failure(value):
    if not isinstance(value, dict) or set(value) != {"phase", "failureClass", "commandExit"} or value["phase"] not in PHASES or value["failureClass"] not in FAILURES:
        return False
    code = value["commandExit"]
    return ((code is None or type(code) is int and 1 <= code <= 255)
            and (value["failureClass"] == "CommandExitNonzero") == (code is not None))


def project(value, code):
    keys = {"status", "ownedRecordId", "primaryFailure", "cleanupFailures", "filesVerified", "bytesVerified", "remoteWrites",
            "productionControlOperations", "productionDataRestore", "privateValuesExported"}
    statuses = {"PRECHECK_STOP", "TEST_PROTOCOL_UNRESOLVED", "TEST_CLEANUP_UNRESOLVED", "TEST_PRIMARY_FAILED_CLEANED", "TEST_REPROBE_PASSED_AND_CLEANED"}
    if (not isinstance(value, dict) or set(value) != keys or value["status"] not in statuses
            or type(value["remoteWrites"]) is not bool or any(value[k] is not False for k in ("productionControlOperations", "productionDataRestore", "privateValuesExported"))
            or type(value["filesVerified"]) is not int or value["filesVerified"] not in (0, 71)
            or type(value["bytesVerified"]) is not int or value["bytesVerified"] not in (0, 875290525)
            or (value["filesVerified"] == 0) != (value["bytesVerified"] == 0)
            or not isinstance(value["cleanupFailures"], list) or len(value["cleanupFailures"]) > 3
            or not all(finite_failure(item) for item in value["cleanupFailures"])
            or value["primaryFailure"] is not None and not finite_failure(value["primaryFailure"])):
        raise ValueError("UNKNOWN_OUTPUT")
    if value["status"] == "PRECHECK_STOP":
        valid = code == 2 and value["ownedRecordId"] is None and value["remoteWrites"] is False and value["primaryFailure"] is not None and not value["cleanupFailures"] and value["filesVerified"] == 0
    else:
        valid = (value["remoteWrites"] is True and isinstance(value["ownedRecordId"], str)
                 and re.fullmatch(r"fodaveg-reprobe-[0-9]{8}T[0-9]{6}Z-[0-9]{1,10}", value["ownedRecordId"]) is not None)
        if value["status"] == "TEST_REPROBE_PASSED_AND_CLEANED":
            valid = valid and code == 0 and value["primaryFailure"] is None and not value["cleanupFailures"] and value["filesVerified"] == 71
        else:
            valid = valid and code == 2
            if value["status"] == "TEST_PRIMARY_FAILED_CLEANED":
                valid = valid and value["primaryFailure"] is not None and not value["cleanupFailures"]
            if value["status"] == "TEST_CLEANUP_UNRESOLVED":
                valid = valid and bool(value["cleanupFailures"])
    if not valid:
        raise ValueError("UNKNOWN_OUTPUT")
    return value


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
        owner = json.loads(snapshot["reprobe-test-approval.json"])["ownedRecordId"]
        body = payload(snapshot, owner)
        if (HERE / "reprobe-test-execution.json").exists():
            raise ValueError("CONSUMED")
    except Exception:
        print("NOT_AUTHORIZED_OR_SEAL_DRIFT_ZERO_CONNECTIONS")
        return 1
    try:
        write_new(HERE / "reprobe-test-started.json", {"operationId": OPERATION, "attempts": 1, "ownedRecordId": owner})
    except OSError:
        print("CONSUMED_OR_UNAVAILABLE_ZERO_CONNECTIONS")
        return 1
    receipt = {"operationId": OPERATION, "ownedRecordId": owner, "status": "TRANSPORT_UNKNOWN_NO_RETRY", "transportExit": None}
    try:
        result = transport(["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
                            "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=1", "lumbre", "python3", "-B", "-"],
                           input=body, timeout=900, limit=4096)
        receipt["transportExit"] = result.returncode if type(result.returncode) is int and -255 <= result.returncode <= 255 else None
        value = project(json.loads(result.stdout), result.returncode)
        if value["ownedRecordId"] is not None and value["ownedRecordId"] != owner:
            raise ValueError("UNKNOWN_RECORD_SELECTION")
        receipt.update(status=value["status"], result=value)
    except Exception:
        pass
    write_new(HERE / "reprobe-test-execution.json", receipt)
    print(json.dumps(receipt, sort_keys=True))
    return 0 if receipt["status"] == "TEST_REPROBE_PASSED_AND_CLEANED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
