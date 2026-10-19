"""One reviewed default-logger request; a fresh real runtime grant is mandatory.

Hash, parse and transmit the same source buffers. Missing approval or seal drift
means zero connections. A consumed marker forbids retry, including after STOP.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import sys

OPERATION = "e544677b-b75b-4734-bdf7-cda99e4f013a"
MODE = "caddy-default-logger-selective-private-ram-read"
ARTIFACTS = ("PROPOSAL.md", "read_default.py", "project_default.py", "run_default.py", "test_wrapper.py", "OPERATE.md")
CAPTURE = Path(".verification/worktrees/caddy-referenced-env-20261008/.verification/release-adoption-plan-20261008/logs-selective-next-step/capture.py")
CAPTURE_SHA = "d48e4a2705ebaac2d32720b38ebab1040fde26b3348a2aeeeb906702af4e9b01"
SCOPE = {
    "container": "edge-caddy", "containerId": "ae97fc0c57fbe4c3a97f5dce15dfc9da92f33f527b60d95c3f74de9d2a160a7a",
    "imageId": "sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648",
    "endpoint": "/config/logging/logs/default/", "configField": "logging.logs.default",
    "privateSubtreeOnlyInRemoteRAM": True, "identityFields": ["Id", "Image"],
    "identityChecks": 2, "maxDockerCommands": 3, "requests": 1, "retryAllowed": False,
    "wireLimitBytes": 98304, "bodyLimitBytes": 65536,
    "projection": "finite writer/encoder classes and exact URI token/Referer rule classes",
    "configEnvRead": False, "logsRead": False, "wholeConfigRead": False,
    "otherLoggerRead": False, "otherHostRead": False, "remoteWrites": False,
    "taskClosureProved": False, "newRuntimeGrantRequired": True,
}


def authorize(base, operation):
    """Require the exact explicit grant and all reviewed source seals once."""
    snapshot = {name: (base / name).read_bytes() for name in
                ("execution-approval.json", "manifest-v2.json", *ARTIFACTS)}
    snapshot["capture.py"] = (base.parents[2] / CAPTURE).read_bytes()
    approval = json.loads(snapshot["execution-approval.json"])
    manifest = json.loads(snapshot["manifest-v2.json"])
    keys = {"status", "reviewStatus", "operationId", "mode", "manifestSHA256", "scope",
            "runtimeApprovalReference", "selectiveDefaultPrivateSubtreeRAMAccessExplicitlyApproved",
            "environmentOrLogContentAccessApproved", "wholeConfigAccessApproved"}
    if (operation != OPERATION or set(approval) != keys or approval["status"] != "APPROVED"
            or approval["reviewStatus"] != "APPROVED" or approval["operationId"] != operation
            or approval["mode"] != MODE or approval["scope"] != SCOPE
            or approval["selectiveDefaultPrivateSubtreeRAMAccessExplicitlyApproved"] is not True
            or approval["environmentOrLogContentAccessApproved"] is not False
            or approval["wholeConfigAccessApproved"] is not False
            or not isinstance(approval["runtimeApprovalReference"], str)
            or not approval["runtimeApprovalReference"].strip()
            or approval["manifestSHA256"] != hashlib.sha256(snapshot["manifest-v2.json"]).hexdigest()
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
    """Inject only approved buffers; the reader owns the one bounded GET."""
    source = "import base64,json,sys,types\n"
    for name, module in (("capture.py", "bounded_capture"), ("project_default.py", "project_default"),
                         ("read_default.py", "read_default")):
        encoded = base64.b64encode(snapshot[name]).decode("ascii")
        source += ("m=types.ModuleType(" + repr(module) + ")\n"
                   "sys.modules[" + repr(module) + "]=m\n"
                   "exec(compile(base64.b64decode(" + repr(encoded) + "),'<sealed-module>','exec'),m.__dict__)\n")
    source += "print(json.dumps(sys.modules['read_default'].read_default(),sort_keys=True,separators=(',',':')))\n"
    return source.encode("ascii")


def project(value):
    """Discard every unknown key/string before storing a receipt."""
    keys = {"status", "endpoint", "requestAttempts", "remoteWrites", "rawConfigPersisted",
            "logsRead", "configEnvRead", "taskClosureProved", "defaultLogger"}
    if not isinstance(value, dict) or set(value) != keys or value["endpoint"] != SCOPE["endpoint"]:
        raise ValueError("UNKNOWN_OUTPUT")
    if value["status"] not in {"STOP_UNRESOLVED", "DEFAULT_ABSENT_EFFECTIVE_UNRESOLVED",
                              "HTTP_UNRESOLVED_NO_FALLBACK", "DEFAULT_CONFIG_TYPES_AND_TOKEN_RULES_PROJECTED"}:
        raise ValueError("UNKNOWN_OUTPUT")
    if type(value["requestAttempts"]) is not int or value["requestAttempts"] not in (0, 1) or any(
            value[key] is not False for key in ("remoteWrites", "rawConfigPersisted", "logsRead", "configEnvRead", "taskClosureProved")):
        raise ValueError("UNKNOWN_OUTPUT")
    logger = value["defaultLogger"]
    if value["status"] != "DEFAULT_CONFIG_TYPES_AND_TOKEN_RULES_PROJECTED":
        if logger is not None:
            raise ValueError("UNKNOWN_OUTPUT")
        return value
    if value["requestAttempts"] != 1 or not isinstance(logger, dict) or set(logger) != {
            "writerType", "encoderTypes", "tokenFilterRules", "effectiveTokenSafetyProved",
            "customProducerMessageSafetyProved", "namedLoggerCoverageProved"}:
        raise ValueError("UNKNOWN_OUTPUT")
    if logger["writerType"] not in {"STDOUT", "STDERR", "FILE", "NET", "DISCARD",
                                   "OMITTED_EFFECTIVE_DEFAULT_UNRESOLVED", "OTHER_MODULE_UNRESOLVED"}:
        raise ValueError("UNKNOWN_OUTPUT")
    chain, rules = logger["encoderTypes"], logger["tokenFilterRules"]
    if not isinstance(chain, list) or not 1 <= len(chain) <= 4 or any(item not in {
            "FILTER", "JSON", "CONSOLE", "OTHER_MODULE_UNRESOLVED", "OMITTED_EFFECTIVE_DEFAULT_UNRESOLVED"} for item in chain):
        raise ValueError("UNKNOWN_OUTPUT")
    if not isinstance(rules, list) or len(rules) != chain.count("FILTER") or any(
            logger[key] is not False for key in ("effectiveTokenSafetyProved", "customProducerMessageSafetyProved", "namedLoggerCoverageProved")):
        raise ValueError("UNKNOWN_OUTPUT")
    for rule in rules:
        if not isinstance(rule, dict) or set(rule) != {"uriToken", "referer"} or rule["uriToken"] not in {
                "NOT_CONFIGURED", "UNRESOLVED", "DELETE_URI_FIELD", "OTHER_URI_FILTER_UNRESOLVED",
                "NO_LITERAL_TOKEN_ACTION", "DELETE_LITERAL_TOKEN_QUERY", "OTHER_TOKEN_ACTION_UNRESOLVED"} or rule["referer"] not in {
                "NOT_CONFIGURED", "DELETE_REFERER_FIELD", "OTHER_REFERER_FILTER_UNRESOLVED"}:
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
        if (base / "execution-receipt.json").exists():
            raise ValueError("CONSUMED")
    except Exception:
        print("NOT_AUTHORIZED_OR_SEAL_DRIFT_ZERO_CONNECTIONS")
        return 1
    try:
        write_exclusive(base / "request-started.json", {"operationId": OPERATION, "attempts": 1})
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
    write_exclusive(base / "execution-receipt.json", receipt)
    print(json.dumps(receipt, sort_keys=True))
    return 0 if receipt["status"] == "DEFAULT_CONFIG_TYPES_AND_TOKEN_RULES_PROJECTED" else 1


if __name__ == "__main__":
    sys.exit(main())
