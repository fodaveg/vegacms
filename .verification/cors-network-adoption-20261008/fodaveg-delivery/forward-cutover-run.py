"""One reviewed forward operation; fixed source buffers and no transport retry."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import time

HERE = Path(__file__).resolve().parent
OPERATION = "d42f490f-606d-42d5-84f9-bd0c31da2492"
MODE = "fodaveg-owned-forward-cors-snapshot-clone-cutover"
ARTIFACTS = ("forward-probe.py", "remote_cutover_forward.py", "forward-cutover-run.py",
             "forward-cutover-selftest.py", "forward-cutover-wrapper-selftest.py", "FORWARD_CUTOVER.md")
IMPORTS = {
    "image_helpers": (HERE.parent.parent / "image-only-delivery-20261008/remote_cutover.py", "5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128"),
    "local_volume_constructor": (HERE / "reprobe-local-volume.py", "209d772063412eb93056065c03068299325dcd7395640e20ef9366453304f952"),
    "cors_apply": (HERE / "remote_cutover_controlled.py", "43b68aba0c937deef45ff3a9e2e33f6d3933fb06949605fdc3b0d9448d31c7b4"),
}
CAPTURE = Path(".verification/worktrees/caddy-referenced-env-20261008/.verification/release-adoption-plan-20261008/logs-selective-next-step/capture.py")
CAPTURE_SHA = "d48e4a2705ebaac2d32720b38ebab1040fde26b3348a2aeeeb906702af4e9b01"
SCOPE = {
    "oldId": "6bddffa88de1c2738bf9aee711425f512deac30365f6183bb3d2ad008a2ff452",
    "oldImage": "sha256:0e0ef56341d677366cfc00d91e2ead83da0ebcc4372f7ba627f575be682ee51f",
    "newImage": "sha256:22cf0983980e3bf9562a0a518f258e6e69cdd58cb3d23a19516f1da60a6d403e",
    "sourceCommit": "cc8f3b14dca9bf10e4a60502da9e17503362bbb8",
    "composeBase": "a18777c55d583c8eab43671d968108c9560f8a41152440e04ba610e583a9b500",
    "composeTarget": "eb62c0447d4cce8a8af1ceedeeabb11602770d48d6bf952618ef19e7b8a1008b",
    "dotenvSHA256": "6c6730312e9e32942398294d840a7b78f6040f5e9f43d893b238f7dfe9d4676c",
    "productionVolume": "fodaveg_fodaveg_pb", "origin": "https://admin.fodaveg.net",
    "maxSnapshotBytes": 134217728, "maxExpandedBytes": 943718400,
    "reserveKiB": 524288, "pbHeadroomKiB": 131072, "metadataAllowanceKiB": 1024,
    "minimumMemAvailableKiB": 1572864, "maxOwnedTestContainers": 3, "maxOwnedTestVolumes": 1, "maxProductionRecreateContainers": 1,
    "privateSnapshotRAMAndPrivateComposeDotenvBackup": True,
    "fixedOwnIDsBeforeStart": True, "sameArchiveFDRequired": True,
    "driver": "local", "driverOptionsAllowed": False,
    "stopKnownOldStartKnownNewAndPreinstallOldRecoveryAllowed": True,
    "ownInstalledBeforeCreateRollbackAllowed": True,
    "productionDataRestoreAllowed": False, "oldUnrecordedTestCleanupAllowed": False,
    "configEnvOrLogContentAllowed": False, "pullOrBuildAllowed": False,
    "dockerRootDirScalarRAMOnly": True, "actualMountBudgetBeforeExtractionRequired": True,
    "retryAllowed": False, "maxSSHConnections": 1, "transportTimeoutSeconds": 1800, "outputLimitBytes": 8192,
}
PHASES = {'PROVE_VOLUME', 'PRIMARY_PASSED', 'INTENT', 'SAVE_SNAPSHOT', 'ARCHIVE', 'START_EXTRACTOR', 'START_PB', 'VERIFY_BYTES', 'CREATE_PB', 'CREATE_EXTRACTOR', 'START_SNAPSHOT', 'CLEANUP_PB', 'CLEANUP_EXTRACTOR', 'CLEANUP_SNAPSHOT', 'CLEANUP_VOLUME', 'CREATE_VOLUME', 'PB_HEALTH', 'MOUNT_BUDGET', 'CREATE_SNAPSHOT', 'FINAL', 'ALLOCATOR'}
FAILURES = {'BudgetInsufficient', 'VolumeOwnershipUnknown', 'JournalDrift', 'OldPinUnknown', 'ProbeFailed', 'CommandExitNonzero', 'TestIdentityUnknown', 'CloneUnhealthy', 'OTHER', 'ContainerOwnershipUnknown', 'QuiescenceUnknown', 'ArchiveUnknown', 'AllocatorUnknown', 'CreationOutcomeUnresolved', 'SnapshotBoundExceeded', 'OutputBoundExceeded', 'RestoreMismatch', 'MemoryInsufficient', 'ArchiveDrift', 'TestCollision', 'CommandUnavailable'}
EVIDENCE = {
    "reprobe-test-execution.json": 'be5c282e179635e0f2bdc4891351f268517b044d4498a76880e403e0afdde2ab',
    "retire-image-archive-execution.json": "23468c3b3474cfdfa13ecb52161f47fee856fda12a57e6a4343c5facb6e2d900",
}


def authorize(base, operation):
    """Hash, parse and transmit the same buffers; missing grant means no SSH."""
    snapshot = {name: (base / name).read_bytes() for name in ("forward-cutover-approval.json", "forward-cutover-manifest.json", *ARTIFACTS)}
    manifest = json.loads(snapshot["forward-cutover-manifest.json"])
    grant = json.loads(snapshot["forward-cutover-approval.json"])
    keys = {"status", "reviewStatus", "operationId", "mode", "manifestSHA256", "scope", "runtimeApprovalReference",
            "forwardControlExplicitlyApproved", "privateSnapshotRAMAccessExplicitlyApproved", "ownedRecordId", "ownedBackupId"}
    if (operation != OPERATION or not isinstance(grant, dict) or set(grant) != keys
            or grant["status"] != "APPROVED" or grant["reviewStatus"] != "APPROVED"
            or grant["operationId"] != operation or grant["mode"] != MODE or json.dumps(grant["scope"], sort_keys=True) != json.dumps(SCOPE, sort_keys=True)
            or grant["forwardControlExplicitlyApproved"] is not True or grant["privateSnapshotRAMAccessExplicitlyApproved"] is not True
            or not isinstance(grant["runtimeApprovalReference"], str) or not grant["runtimeApprovalReference"].strip()
            or not isinstance(grant["ownedRecordId"], str) or re.fullmatch(r"fodaveg-reprobe-[0-9]{8}T[0-9]{6}Z-[0-9]{1,10}", grant["ownedRecordId"]) is None
            or not isinstance(grant["ownedBackupId"], str) or re.fullmatch(r"fodaveg-[0-9]{8}T[0-9]{6}Z-[0-9]{1,10}", grant["ownedBackupId"]) is None
            or grant["manifestSHA256"] != hashlib.sha256(snapshot["forward-cutover-manifest.json"]).hexdigest()
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
    for name, expected in EVIDENCE.items():
        snapshot[name] = (base / name).read_bytes()
        if hashlib.sha256(snapshot[name]).hexdigest() != expected:
            raise ValueError("EVIDENCE_DRIFT")
    return snapshot


def payload(snapshot, owner, backup):
    source = "import base64,json,sys,types\n"
    for name, module in (("image_helpers", "image_helpers"), ("cors_apply", "cors_apply"),
                         ("local_volume_constructor", "local_volume_constructor"), ("capture.py", "bounded_capture"),
                         ("forward-probe.py", "forward_probe"), ("remote_cutover_forward.py", "forward_apply")):
        body = base64.b64encode(snapshot[name]).decode("ascii")
        source += ("m=types.ModuleType(" + repr(module) + ")\n"
                   "sys.modules[" + repr(module) + "]=m\n"
                   "exec(compile(base64.b64decode(" + repr(body) + "),'<sealed-module>','exec'),m.__dict__)\n")
    source += "sys.modules['forward_probe'].OPERATOR_RECORD_ID=" + repr(owner) + "\n"
    source += "m=sys.modules['forward_apply'];m.OPERATOR_BACKUP_ID=" + repr(backup) + "\n"
    source += ("try:\n value=m.apply('fodaveg',m.SPECS['fodaveg'])\n"
               "except Exception:\n value={'status':'STOP_UNCLASSIFIED','service':'fodaveg','remoteWrites':True}\n")
    source += "print(json.dumps(value,sort_keys=True,separators=(',',':')))\n"
    source += "sys.exit(0 if value['status']=='CORS_APPLIED_AWAITING_PUBLIC_SMOKE' else 2)\n"
    return source.encode("ascii")


def finite_failure(value):
    if not isinstance(value, dict) or set(value) != {"phase", "failureClass", "commandExit"} or value["phase"] not in PHASES or value["failureClass"] not in FAILURES:
        return False
    code = value["commandExit"]
    return ((code is None or type(code) is int and 1 <= code <= 255)
            and (value["failureClass"] == "CommandExitNonzero") == (code is not None))


def project(value, code):
    """Closed finite production receipt; no raw failure, argv or private values."""
    if not isinstance(value, dict) or value.get("service") != "fodaveg" or value.get("remoteWrites") is not True:
        raise ValueError("UNKNOWN_OUTPUT")
    status = value.get("status")
    if status == "STOP_UNCLASSIFIED":
        if code != 2 or set(value) != {"status", "service", "remoteWrites"}:
            raise ValueError("UNKNOWN_OUTPUT")
        return value
    common = {"status", "service", "remoteWrites", "backupId", "probe"}
    if status == "CORS_APPLIED_AWAITING_PUBLIC_SMOKE":
        fields = common | {"oldContainerId", "newContainerId", "composeSha", "imageId", "archiveSha", "archiveBytes", "restoredFiles", "restoredBytes"}
        valid = (code == 0 and set(value) == fields and value["oldContainerId"] == SCOPE["oldId"]
                 and isinstance(value["newContainerId"], str) and re.fullmatch(r"[0-9a-f]{64}", value["newContainerId"])
                 and value["newContainerId"] != SCOPE["oldId"] and value["composeSha"] == SCOPE["composeTarget"]
                 and value["imageId"] == SCOPE["newImage"] and isinstance(value["archiveSha"], str) and re.fullmatch(r"[0-9a-f]{64}", value["archiveSha"])
                 and type(value["archiveBytes"]) is int and 1 <= value["archiveBytes"] <= SCOPE["maxSnapshotBytes"]
                 and type(value["restoredFiles"]) is int and 1 <= value["restoredFiles"] <= 100000
                 and type(value["restoredBytes"]) is int and 1 <= value["restoredBytes"] <= SCOPE["maxExpandedBytes"])
    elif status in {"STOP_NEEDS_OPERATOR", "STOP_OLD_RUNTIME_RESTORED"}:
        fields = common | {"checkpoint", "failureClass", "createExit", "commandExit", "baselineFields"}
        checks = {"PRESTOP_IMAGE", "PRESTOP_RUNTIME", "PRESTOP_FILES", "STOP", "QUIESCENCE", "BACKUP", "POSTBACKUP_FILES", "STAGE_CONFIG", "INSTALL_COMPOSE", "INSTALLED_RUNTIME_1", "INSTALLED_CONFIG", "INSTALLED_IMAGE", "INSTALLED_RUNTIME_2", "INSTALLED_FILES", "CREATE", "CREATED_SELECTION", "CREATED_RUNTIME", "PERSIST_CREATED", "START_IMAGE", "START_SELECTION", "START_RUNTIME", "START_FILES", "START", "HEALTH", "FINAL_FILES", "SUCCESS"}
        failures = {"OTHER_FAILURE", "ProbeFailed", "RuntimeImageDrift", "RuntimeProcessDrift", "PBArgvUnknown", "ImageChangedBeforeStop", "VolumeStillInUse", "FilesOrContainerChangedAfterBackup", "RuntimeTopologyDrift", "RuntimeMountDrift", "RuntimeCommandDrift", "RuntimePeerDrift", "ContainerIdentityDrift", "OtherVolumeWriter", "RuntimeShapeUnknown", "ContainerIdUnknown", "CommandUnavailable", "ForeignFileChange", "ImageChangedBeforeCreate", "ImageOrOldContainerDrift", "CreatedSelectionUnknown", "CreatedContainerUnknown", "CreateExitNonzero", "CreateUnavailable", "InstalledComposeDrift", "NewRuntimeUnhealthy", "CommandExitNonzero", "BudgetInsufficient", "MemoryInsufficient", "AllocatorUnknown"}
        failures |= FAILURES
        baselines = {"mountRawSame", "mountCanonicalSame", "aliasesRawSame", "aliasesCanonicalSame", "networkRawSame", "portsStoppedEquivalent"}
        valid = (code == 2 and set(value) == fields and value["checkpoint"] in checks | {None}
                 and value["failureClass"] in failures and isinstance(value["baselineFields"], dict)
                 and set(value["baselineFields"]) == baselines and all(v is None or type(v) is bool for v in value["baselineFields"].values()))
        for key, label in (("createExit", "CreateExitNonzero"), ("commandExit", "CommandExitNonzero")):
            num = value[key]
            valid = valid and (num is None or type(num) is int and 1 <= num <= 255) and ((value["failureClass"] == label) == (num is not None))
    else:
        raise ValueError("UNKNOWN_OUTPUT")
    if not valid or not isinstance(value["backupId"], str) or not re.fullmatch(r"fodaveg-[0-9]{8}T[0-9]{6}Z-[0-9]{1,10}", value["backupId"]):
        raise ValueError("UNKNOWN_OUTPUT")
    probe = value["probe"]
    if probe is not None:
        if (not isinstance(probe, dict) or set(probe) != {"primary", "cleanup", "files", "bytes", "recordId", "finished"}
                or type(probe["finished"]) is not bool or not isinstance(probe["recordId"], str) or re.fullmatch(r"fodaveg-reprobe-[0-9]{8}T[0-9]{6}Z-[0-9]{1,10}", probe["recordId"]) is None
                or type(probe["files"]) is not int or not 0 <= probe["files"] <= 100000
                or type(probe["bytes"]) is not int or not 0 <= probe["bytes"] <= SCOPE["maxExpandedBytes"]
                or (probe["primary"] is not None and not finite_failure(probe["primary"]))
                or not isinstance(probe["cleanup"], list) or len(probe["cleanup"]) > 4 or not all(finite_failure(v) for v in probe["cleanup"])):
            raise ValueError("UNKNOWN_OUTPUT")
    if status == "CORS_APPLIED_AWAITING_PUBLIC_SMOKE" and (probe is None or not probe["finished"] or probe["primary"] is not None or probe["cleanup"] or probe["files"] != value["restoredFiles"] or probe["bytes"] != value["restoredBytes"]):
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
        owner = json.loads(snapshot["forward-cutover-approval.json"])["ownedRecordId"]
        backup = json.loads(snapshot["forward-cutover-approval.json"])["ownedBackupId"]
        body = payload(snapshot, owner, backup)
        if (HERE / "forward-cutover-execution.json").exists():
            raise ValueError("CONSUMED")
    except Exception:
        print("NOT_AUTHORIZED_OR_SEAL_DRIFT_ZERO_CONNECTIONS")
        return 1
    try:
        write_new(HERE / "forward-cutover-started.json", {"operationId": OPERATION, "attempts": 1, "ownedRecordId": owner, "ownedBackupId": backup})
    except OSError:
        print("CONSUMED_OR_UNAVAILABLE_ZERO_CONNECTIONS")
        return 1
    receipt = {"operationId": OPERATION, "ownedRecordId": owner, "ownedBackupId": backup, "status": "TRANSPORT_UNKNOWN_NO_RETRY", "transportExit": None}
    try:
        result = transport(["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
                            "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=1", "lumbre", "python3", "-B", "-"],
                           input=body, timeout=1800, limit=8192)
        receipt["transportExit"] = result.returncode if type(result.returncode) is int and -255 <= result.returncode <= 255 else None
        value = project(json.loads(result.stdout), result.returncode)
        if value.get("backupId", backup) != backup or value.get("probe") is not None and value["probe"]["recordId"] != owner:
            raise ValueError("UNKNOWN_RECORD_SELECTION")
        receipt.update(status=value["status"], result=value)
    except Exception:
        pass
    write_new(HERE / "forward-cutover-execution.json", receipt)
    print(json.dumps(receipt, sort_keys=True))
    return 0 if receipt["status"] == "CORS_APPLIED_AWAITING_PUBLIC_SMOKE" else 2


if __name__ == "__main__":
    raise SystemExit(main())
