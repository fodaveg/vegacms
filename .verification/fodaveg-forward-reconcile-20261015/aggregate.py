"""Close local evidence of effective Fodaveg CORS without rewriting its failed cutover."""

import argparse
import hashlib
import json
import os
from pathlib import Path


PINS = {
    "forward-cutover-execution.json": "39e2fc2404b3bcf8b9cb94dbf686afa16f43b1accf3085dbd83eb987f6f67e43",
    "forward-cutover-diagnostic-20261015.json": "49d03b44db3aa147cfac0b9be9e853aac5722b8b4d890d46546b818afc43fc3f",
    "forward-public-after-20261015.json": "29b5775d04ba0ed5fa5999263ae2e55be2e513e9978b898b47edfb7e7ea88879",
    "controlled-public-baseline-network-20261009.json": "96569b55e02cbf3a7706a81d95b9373042d3a479661b14501553da228e5d575d",
}
OPERATION = "d42f490f-606d-42d5-84f9-bd0c31da2492"
BACKUP = "fodaveg-20261015T020337Z-50583"
RECORD = "fodaveg-reprobe-20261015T020337Z-50583"
CONTAINER = "c25a7858f2692b395925d5b7f8d80512378dccbaa58ec55e432d8c5f186b73e6"
IMAGE = "sha256:22cf0983980e3bf9562a0a518f258e6e69cdd58cb3d23a19516f1da60a6d403e"
COMPOSE = "eb62c0447d4cce8a8af1ceedeeabb11602770d48d6bf952618ef19e7b8a1008b"


def require(condition, name):
    if not condition:
        raise ValueError(name)


def load(evidence_dir):
    evidence = {}
    for name, sha in PINS.items():
        body = (evidence_dir / name).read_bytes()
        require(hashlib.sha256(body).hexdigest() == sha, "EvidenceShaDrift:" + name)
        evidence[name] = json.loads(body)
    return evidence


def build(evidence):
    execution = evidence["forward-cutover-execution.json"]
    diagnostic = evidence["forward-cutover-diagnostic-20261015.json"]
    public = evidence["forward-public-after-20261015.json"]
    baseline = evidence["controlled-public-baseline-network-20261009.json"]
    failure = execution.get("result", {})
    probe = failure.get("probe", {})
    require(execution.get("operationId") == OPERATION and execution.get("ownedBackupId") == BACKUP
            and execution.get("ownedRecordId") == RECORD and execution.get("status") == "STOP_NEEDS_OPERATOR"
            and execution.get("transportExit") == 2, "OriginalExecutionChanged")
    require(failure.get("status") == "STOP_NEEDS_OPERATOR" and failure.get("backupId") == BACKUP
            and failure.get("service") == "fodaveg" and failure.get("remoteWrites") is True
            and failure.get("checkpoint") == "HEALTH" and failure.get("failureClass") == "NewRuntimeUnhealthy"
            and failure.get("commandExit") is None and failure.get("createExit") is None,
            "OriginalFailureChanged")
    require(probe == {"primary": None, "cleanup": [], "files": 71, "bytes": 875285637,
                      "recordId": RECORD, "finished": True}, "CloneProbeChanged")
    require(diagnostic.get("status") == "PROJECTED" and diagnostic.get("backupId") == BACKUP
            and diagnostic.get("checkpoint") == "HEALTH" and diagnostic.get("phase") == "CREATED"
            and diagnostic.get("recordNewId") == CONTAINER and diagnostic.get("recordRollbackId") is None
            and diagnostic.get("selection") == "NEW" and diagnostic.get("runtimeGuard") == "PASS"
            and diagnostic.get("healthClass") == "HEALTHY" and diagnostic.get("pbArgvClass") == "OWN_CORS"
            and diagnostic.get("processCounts") == {"pb": 1, "node": 1, "tini": 1}
            and diagnostic.get("composeClass") == "TARGET" and diagnostic.get("composeOwned") is True
            and diagnostic.get("rollbackComposeOwned") is False and diagnostic.get("envMatches") is True
            and diagnostic.get("imageClass") == "NEW" and diagnostic.get("imageMatches") is True
            and diagnostic.get("running") is True and diagnostic.get("networkClass") == "ONE_EDGE"
            and diagnostic.get("volumeUsers") == "SELECTED" and diagnostic.get("snapshotStable") is True
            and diagnostic.get("labelsMatch") is True and diagnostic.get("mountsMatch") is True
            and diagnostic.get("aliasesMatch") is True and diagnostic.get("exposed8090And4321Only") is True
            and diagnostic.get("hostBindingsNone") is True and diagnostic.get("remoteWrites") is False
            and diagnostic.get("privateValuesExported") is False, "DiagnosticChanged")
    require(public.get("status") == "CORS_PUBLIC_OK" and public.get("service") == "fodaveg"
            and public.get("stage") == "after" and public.get("assetsChecked") == 155
            and public.get("assetsMatched") == 155 and public.get("canonicalIndexAlias") is True
            and public.get("pathsUnchanged") is True and public.get("peersUnchanged") is True
            and public.get("credentialsSent") is False and public.get("bodyValuesStored") is False
            and public.get("cors") == {"discoveryJsonAndCors": True, "foreignDenied": True,
                                       "methodHeaderPreflights": True, "nullDenied": True,
                                       "ownOrigin": True, "withoutOrigin": True}, "PublicSmokeChanged")
    require(baseline.get("status") == "CORS_BASELINE_CAPTURED" and baseline.get("service") == "fodaveg"
            and baseline.get("stage") == "baseline" and baseline.get("credentialsSent") is False
            and baseline.get("bodyValuesStored") is False, "HistoricalBaselineChanged")
    return {
        "schema": 1,
        "status": "PASS",
        "meaning": "effective-fodaveg-runtime-and-public-cors-after-failed-forward-execution",
        "service": "fodaveg",
        "operationId": OPERATION,
        "backupId": BACKUP,
        "recordId": RECORD,
        "originalExecution": {"status": "STOP_NEEDS_OPERATOR", "checkpoint": "HEALTH",
                              "failureClass": "NewRuntimeUnhealthy", "transportExit": 2,
                              "receiptSha": PINS["forward-cutover-execution.json"]},
        "diagnostic": {"status": "PROJECTED", "journalPhase": "CREATED", "healthClass": "HEALTHY",
                       "runtimeGuard": "PASS", "receiptSha": PINS["forward-cutover-diagnostic-20261015.json"]},
        "public": {"status": "CORS_PUBLIC_OK", "assetsMatched": 155,
                   "receiptSha": PINS["forward-public-after-20261015.json"]},
        "historicalBaseline": {"date": "2026-10-09", "freshPreCutover": False,
                               "receiptSha": PINS["controlled-public-baseline-network-20261009.json"]},
        "dependency": {"status": "PASS", "containerId": CONTAINER, "imageId": IMAGE,
                       "composeSha": COMPOSE},
        "limits": ["The original operation stopped; this receipt does not change that result or the remote journal.",
                   "The diagnostic was a read-only snapshot; dependency guards must recheck ID, image and Compose.",
                   "The public smoke compared with a historical 2026-10-09 baseline, not a fresh pre-cutover snapshot."],
    }


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2) + "\n").encode()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence-dir", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = encoded(build(load(args.evidence_dir)))
    if args.check:
        require(args.out.read_bytes() == result, "AggregateReceiptDrift")
    else:
        fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(result)
            stream.flush()
            os.fsync(stream.fileno())
    print("PASS " + hashlib.sha256(result).hexdigest())


if __name__ == "__main__":
    main()
