"""One reviewed fixed-Caddy binary metadata read; a fresh real runtime grant is mandatory.

Hash, parse and transmit the same source buffers. Missing approval or seal drift
means zero connections. A consumed marker forbids retry, including after STOP.
"""
import argparse
import base64
import hashlib
import json
import os
import re
from pathlib import Path
import sys

OPERATION = "c459ae09-0a35-46a8-9470-f2f12dd2fb4d"
MODE = "caddy-fixed-binary-metadata-module-ram-read"
ARTIFACTS = ("BINARY_METADATA_PROPOSAL.md", "read_binary_metadata.py", "run_binary_metadata.py", "test_binary_metadata.py", "OPERATE_BINARY.md")
CAPTURE = Path(".verification/worktrees/caddy-referenced-env-20261008/.verification/release-adoption-plan-20261008/logs-selective-next-step/capture.py")
CAPTURE_SHA = "d48e4a2705ebaac2d32720b38ebab1040fde26b3348a2aeeeb906702af4e9b01"
SCOPE = {
    "container": "edge-caddy", "containerId": "ae97fc0c57fbe4c3a97f5dce15dfc9da92f33f527b60d95c3f74de9d2a160a7a",
    "imageId": "sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648",
    "selectedDockerFields": ["Id", "Image", "Config.Tty"], "identityAndTtyChecks": 2,
    "execVersion": True, "execListModules": True, "rawModuleNamesOnlyInRemoteRAM": True,
    "versionProjection": "strict stable semver only", "moduleProjection": ["filterAvailable", "jsonAvailable", "stderrAvailable"],
    "maxDockerCommands": 4, "commandTimeoutSeconds": 12, "pinVersionLimitBytes": 1024,
    "moduleStdoutLimitBytes": 65536, "retryAllowed": False,
    "configEnvRead": False, "logsRead": False, "caddyGET": False, "wholeConfigRead": False,
    "otherLoggerRead": False, "otherHostRead": False, "remoteWrites": False,
    "taskClosureProved": False, "newRuntimeGrantRequired": True,
}

def authorize(base, operation):
    """Require the exact explicit grant and all reviewed source seals once."""
    snapshot = {name: (base / name).read_bytes() for name in
                ("binary-execution-approval.json", "binary-metadata-manifest-v2.json", *ARTIFACTS)}
    snapshot["capture.py"] = (base.parents[2] / CAPTURE).read_bytes()
    approval = json.loads(snapshot["binary-execution-approval.json"])
    manifest = json.loads(snapshot["binary-metadata-manifest-v2.json"])
    keys = {"status", "reviewStatus", "operationId", "mode", "manifestSHA256", "scope",
            "runtimeApprovalReference", "selectiveBinaryMetadataAndModuleStdoutRAMAccessExplicitlyApproved",
            "environmentOrLogContentAccessApproved", "wholeConfigAccessApproved"}
    if (operation != OPERATION or set(approval) != keys or approval["status"] != "APPROVED"
            or approval["reviewStatus"] != "APPROVED" or approval["operationId"] != operation
            or approval["mode"] != MODE or approval["scope"] != SCOPE
            or approval["selectiveBinaryMetadataAndModuleStdoutRAMAccessExplicitlyApproved"] is not True
            or approval["environmentOrLogContentAccessApproved"] is not False
            or approval["wholeConfigAccessApproved"] is not False
            or not isinstance(approval["runtimeApprovalReference"], str)
            or not approval["runtimeApprovalReference"].strip()
            or approval["manifestSHA256"] != hashlib.sha256(snapshot["binary-metadata-manifest-v2.json"]).hexdigest()
            or manifest["operationId"] != operation or manifest["scope"] != SCOPE
            or set(manifest["files"]) != set(ARTIFACTS)):
        raise ValueError("NOT_AUTHORIZED")
    for name, expected in manifest["files"].items():
        if hashlib.sha256(snapshot[name]).hexdigest() != expected:
            raise ValueError("SEAL_DRIFT")
    if hashlib.sha256(snapshot["capture.py"]).hexdigest() != CAPTURE_SHA:
        raise ValueError("CAPTURE_DRIFT")
    return snapshot


def payload(snapshot):
    """Build only from approved buffers; no path re-open after authorization."""
    source = "import base64,json,sys,types\n"
    for name, module in (("capture.py", "bounded_capture"), ("read_binary_metadata.py", "read_binary_metadata")):
        encoded = base64.b64encode(snapshot[name]).decode("ascii")
        source += ("m=types.ModuleType(" + repr(module) + ")\n"
                   "sys.modules[" + repr(module) + "]=m\n"
                   "exec(compile(base64.b64decode(" + repr(encoded) + "),'<sealed-module>','exec'),m.__dict__)\n")
    source += "print(json.dumps(sys.modules['read_binary_metadata'].read_binary_metadata(),sort_keys=True,separators=(',',':')))\n"
    return source.encode("ascii")


def project(value):
    """Store no raw module name, build string, error or unknown field."""
    keys = {"status", "version", "tty", "modules", "identitiesPreserved", "remoteWrites", "configEnvRead",
            "logsRead", "effectiveTokenSafetyProved", "namedLoggerCoverageProved", "customProducerMessageSafetyProved"}
    if not isinstance(value, dict) or set(value) != keys or value["status"] not in {
            "CADDY_BINARY_METADATA_PROJECTED", "STOP_BINARY_METADATA_UNRESOLVED"}:
        raise ValueError("UNKNOWN_OUTPUT")
    if any(value[key] is not False for key in ("remoteWrites", "configEnvRead", "logsRead",
            "effectiveTokenSafetyProved", "namedLoggerCoverageProved", "customProducerMessageSafetyProved")):
        raise ValueError("UNKNOWN_OUTPUT")
    good = value["status"] == "CADDY_BINARY_METADATA_PROJECTED"
    if value["identitiesPreserved"] is not good:
        raise ValueError("UNKNOWN_OUTPUT")
    if not good:
        if any(value[key] is not None for key in ("version", "tty", "modules")):
            raise ValueError("UNKNOWN_OUTPUT")
    elif (not isinstance(value["version"], str) or re.fullmatch(r"[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}", value["version"]) is None
          or type(value["tty"]) is not bool or not isinstance(value["modules"], dict)
          or set(value["modules"]) != {"filterAvailable", "jsonAvailable", "stderrAvailable"}
          or any(type(flag) is not bool for flag in value["modules"].values())):
        raise ValueError("UNKNOWN_OUTPUT")
    return value


def write_exclusive(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--operation-id", required=True)
    args = parser.parse_args()
    base = Path(__file__).resolve().parent
    try:
        snapshot = authorize(base, args.operation_id)
        namespace = {"__name__": "approved_capture"}
        exec(compile(snapshot["capture.py"], "<approved_capture>", "exec"), namespace)
        transport = namespace["capture_process"]
        approved_payload = payload(snapshot)
        if (base / "binary-execution-receipt.json").exists():
            raise ValueError("CONSUMED")
    except Exception:
        print("NOT_AUTHORIZED_OR_SEAL_DRIFT_ZERO_CONNECTIONS")
        return 1
    try:
        write_exclusive(base / "binary-request-started.json", {"operationId": OPERATION, "attempts": 1})
    except OSError:
        print("CONSUMED_OR_UNAVAILABLE_ZERO_CONNECTIONS")
        return 1
    receipt = {"operationId": OPERATION, "status": "TRANSPORT_OR_PROJECTION_UNKNOWN_NO_RETRY", "transportExit": None}
    try:
        result = transport(["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                            "-o", "ConnectTimeout=10", "lumbre", "python3", "-B", "-"],
                           input=approved_payload, timeout=90, limit=8192)
        receipt["transportExit"] = result.returncode
        if result.returncode != 0:
            raise ValueError("TRANSPORT_UNKNOWN")
        receipt["result"] = project(json.loads(result.stdout))
        receipt["status"] = receipt["result"]["status"]
    except Exception:
        pass
    write_exclusive(base / "binary-execution-receipt.json", receipt)
    print(json.dumps(receipt, sort_keys=True))
    return 0 if receipt["status"] == "CADDY_BINARY_METADATA_PROJECTED" else 1


if __name__ == "__main__":
    sys.exit(main())
