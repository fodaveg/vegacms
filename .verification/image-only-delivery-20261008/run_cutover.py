"""Release-owner wrapper for one pinned, image-only remote cutover stage."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "remote_cutover.py"
SERVICES = {"vega-pb", "lumbre-admin-pb", "fodaveg"}
SUCCESS = {"check": "READY_FOR_REVIEW", "apply": "CUTOVER_WAITING_SERVED_SMOKE"}
STOP = {"STOP_UNCLASSIFIED", "STOP_PREMUTATION", "STOP_AFTER_NEW_IMAGE_POSSIBLE_DATA_MIGRATION",
        "STOP_BEFORE_NEW_IMAGE_RESTORED", "STOP_RESTORE_NEEDS_OPERATOR"}


def valid(value, stage, service, returncode):
    """Allow only the public fields emitted by the reviewed remote program."""
    if not isinstance(value, dict) or value.get("service") != service or value.get("status") not in \
            ({SUCCESS[stage]} | STOP):
        return False
    if value["status"] == SUCCESS[stage] and returncode != 0:
        return False
    if value["status"] in STOP and returncode not in (0, 2):
        return False
    keys = set(value)
    allowed = {"status", "service", "remoteWrites", "oldComposeSha256", "newComposeSha256",
               "oldDotenvSha256", "newDotenvSha256", "volumeKiB", "freeSrvKiB",
               "freeDockerKiB", "requiredSrvKiB", "requiredDockerKiB", "sameFilesystem",
               "backupUtilityCached", "oldId", "newId", "backupDir", "snapshotSha256",
               "snapshotBytes", "isolatedRestoreFiles", "isolatedRestoreBytes",
               "cloneServeProbePassed", "oldImageNotRestarted", "oldImageRestarted"}
    if keys - allowed or not isinstance(value.get("remoteWrites"), bool):
        return False
    for key in ("oldComposeSha256", "newComposeSha256", "oldDotenvSha256", "newDotenvSha256",
                "snapshotSha256"):
        if key in value and (not isinstance(value[key], str) or
                             re.fullmatch(r"[0-9a-f]{64}", value[key]) is None):
            return False
    for key in ("oldId", "newId"):
        if key in value and (not isinstance(value[key], str) or
                             re.fullmatch(r"sha256:[0-9a-f]{64}", value[key]) is None):
            return False
    for key in ("volumeKiB", "freeSrvKiB", "freeDockerKiB", "requiredSrvKiB",
                "requiredDockerKiB", "snapshotBytes", "isolatedRestoreFiles", "isolatedRestoreBytes"):
        if key in value and (not isinstance(value[key], int) or isinstance(value[key], bool) or
                             value[key] < 0):
            return False
    if "backupDir" in value and value["backupDir"] is not None and \
            (not isinstance(value["backupDir"], str) or
             re.fullmatch(r"/srv/vega-image-rollout/(?:vega-pb|lumbre-admin-pb|fodaveg)-[0-9]{8}T[0-9]{6}Z-[0-9]+",
                          value["backupDir"]) is None):
        return False
    if value["status"] == SUCCESS[stage]:
        required = {"status", "service", "remoteWrites", "newComposeSha256", "newDotenvSha256",
                    "oldId", "newId"}
        if not required <= keys or value["remoteWrites"] is not (stage == "apply"):
            return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--stage", choices=tuple(SUCCESS), required=True)
    parser.add_argument("--service", choices=tuple(SERVICES), required=True)
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source = SOURCE.read_bytes()
    if hashlib.sha256(source).hexdigest() != args.script_sha256:
        raise SystemExit("STOP: cutover script hash mismatch")
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output must be a new JSON in this evidence directory")
    try:
        result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                                 "lumbre", "python3", "-B", "-", args.stage, args.service],
                                input=source, capture_output=True, timeout=1800, check=False)
        if len(result.stdout) > 65536 or len(result.stderr) > 65536:
            raise ValueError("oversized projection")
        value = json.loads(result.stdout)
        if not valid(value, args.stage, args.service, result.returncode):
            raise ValueError("invalid projection")
    except (OSError, subprocess.TimeoutExpired, ValueError, UnicodeDecodeError):
        raise SystemExit("STOP: cutover transport unavailable; remote state may have changed") from None
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(value["status"])
    return 0 if value["status"] == SUCCESS[args.stage] else 2


if __name__ == "__main__":
    sys.exit(main())
