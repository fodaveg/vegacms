"""Release owner streams only the sealed Fodaveg archive; LOAD never recreates."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import threading

from seal_archive import ARCHIVE, digest_file, write_new

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "remote_transport.py"
CHAIN = json.loads((HERE / "archive-chain-v2.json").read_text())


def valid(value, stage, code):
    """Accept closed public receipts only, including a classified STOP."""
    if not isinstance(value, dict):
        return False
    if value.get("status") == "STOP":
        return code == 2 and value == {"status": "STOP", "stage": stage,
                                      "remoteWrites": stage != "identity"}
    if code != 0 or value.get("archiveSha256") != CHAIN["archiveSha256"] or \
            value.get("archiveBytes") != CHAIN["archiveBytes"] or \
            value.get("remoteWrites") is not (stage != "identity"):
        return False
    budget = {"freeSrvKiB", "freeDockerKiB", "requiredSrvKiB", "requiredDockerKiB", "sameFilesystem"}
    common = {"status", "archiveSha256", "archiveBytes", "remoteWrites"}
    if stage == "receive":
        fields = common | budget
        if value.get("status") != "ARCHIVE_SEALED":
            return False
    else:
        fields = common | {"configId", "effectiveRemoteId", "platformAndLayersMatch"}
        if stage == "load":
            fields |= budget
        if value.get("status") != "FODAVEG_LOADED_CHAIN_PROVED" or \
                value.get("configId") != CHAIN["configId"] or \
                value.get("effectiveRemoteId") != CHAIN["ociManifestDigest"] or \
                value.get("platformAndLayersMatch") is not True:
            return False
    if set(value) != fields:
        return False
    if stage != "identity" and (type(value["sameFilesystem"]) is not bool or
            any(type(value[k]) is not int or value[k] < 0 for k in budget - {"sameFilesystem"}) or
            value["freeSrvKiB"] < value["requiredSrvKiB"] or
            value["freeDockerKiB"] < value["requiredDockerKiB"]):
        return False
    return True


def invoke(stage, source, archive):
    command = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
               "-o", "ConnectTimeout=10", "lumbre", "python3", "-B", "-c",
               shlex.quote(source.decode()), stage]
    process = subprocess.Popen(command, stdin=subprocess.PIPE if stage == "receive" else subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    timer = threading.Timer(600, process.kill)
    timer.start()
    try:
        if stage == "receive":
            archive.seek(0)
            for chunk in iter(lambda: archive.read(1024 * 1024), b""):
                process.stdin.write(chunk)
            process.stdin.close()
            process.stdin = None
        stdout, _ = process.communicate()
    finally:
        timer.cancel()
        if process.poll() is None:
            process.kill()
            process.wait()
    if len(stdout) > 8192:
        raise RuntimeError("ProjectionOversized")
    value = json.loads(stdout)
    if not valid(value, stage, process.returncode):
        raise RuntimeError("ProjectionUnknown")
    return value, process.returncode


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--stage", choices=("receive", "load", "identity"), required=True)
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output must be new in this directory")
    source = SOURCE.read_bytes()
    if hashlib.sha256(source).hexdigest() != args.script_sha256:
        raise SystemExit("STOP: reviewed source drift")
    fd = os.open(ARCHIVE, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        if os.fstat(stream.fileno()).st_size != CHAIN["archiveBytes"] or \
                digest_file(stream) != CHAIN["archiveSha256"]:
            raise SystemExit("STOP: archive drift before SSH")
        stream.seek(0)
        try:
            value, code = invoke(args.stage, source, stream)
        except (OSError, ValueError, RuntimeError):
            raise SystemExit("STOP: transport unavailable; inspect identity before retrying LOAD") from None
    write_new(args.out, value)
    print(value["status"])
    return code


if __name__ == "__main__":
    raise SystemExit(main())
