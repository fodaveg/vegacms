"""Release-owner wrapper for the pinned, two-stage image archive delivery."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import threading


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "remote_transport.py"
ARCHIVE = HERE.parent / "release-image-distribution-a51b-20261008" / "images.tar"
ARCHIVE_SHA = "34a1780fe31f9c1b50a5e47435fa6183cdd53d956ce00ddab82a247ae8e1ee0a"
ARCHIVE_BYTES = 606022656
STAGES = {"receive": "ARCHIVE_SEALED", "load": "THREE_IMAGES_LOADED"}


def verify_local_archive():
    """Stop before SSH unless source bytes match the reviewed receipt."""
    if ARCHIVE.is_symlink() or not ARCHIVE.is_file() or ARCHIVE.stat().st_size != ARCHIVE_BYTES:
        raise RuntimeError("LocalArchiveUnknown")
    hasher = hashlib.sha256()
    with ARCHIVE.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    if hasher.hexdigest() != ARCHIVE_SHA:
        raise RuntimeError("LocalArchiveUnknown")


def invoke(stage, source):
    """Stream the archive only for receive; capture a small filtered JSON."""
    command = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "lumbre",
               "python3", "-B", "-c", shlex.quote(source.decode("utf-8")), stage]
    process = subprocess.Popen(command, stdin=subprocess.PIPE if stage == "receive" else subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    timed_out = [False]

    def timeout():
        timed_out[0] = True
        process.kill()

    timer = threading.Timer(300 if stage == "receive" else 360, timeout)
    timer.start()
    try:
        if stage == "receive":
            with ARCHIVE.open("rb") as archive:
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
    if timed_out[0] or process.returncode or len(stdout) > 8192:
        raise RuntimeError("TransportUnavailable")
    try:
        value = json.loads(stdout)
    except (ValueError, UnicodeDecodeError):
        raise RuntimeError("ProjectionInvalid") from None
    if (not isinstance(value, dict) or value.get("status") != STAGES[stage] or
            value.get("archiveSha256") != ARCHIVE_SHA or value.get("remoteWrites") is not True):
        raise RuntimeError("ProjectionInvalid")
    budget_keys = {"freeSrvKiB", "freeDockerKiB", "requiredSrvKiB", "requiredDockerKiB",
                   "sameFilesystem"}
    if (not budget_keys <= set(value) or
            any(not isinstance(value[key], int) or isinstance(value[key], bool) or value[key] < 0
                for key in budget_keys - {"sameFilesystem"}) or
            not isinstance(value["sameFilesystem"], bool) or
            value["freeSrvKiB"] < value["requiredSrvKiB"] or
            value["freeDockerKiB"] < value["requiredDockerKiB"]):
        raise RuntimeError("ProjectionInvalid")
    if stage == "receive":
        if set(value) != {"status", "archiveSha256", "archiveBytes", "remoteWrites"} | budget_keys or \
                value["archiveBytes"] != ARCHIVE_BYTES:
            raise RuntimeError("ProjectionInvalid")
    else:
        if set(value) != {"status", "archiveSha256", "imageIds", "remoteWrites"} | budget_keys or \
                value["imageIds"] != {
                    "vegacms:a51b8521e1eeef52a522d2a065b36a03578c0c3a":
                        "sha256:9cd8aaaee3b486b8d9bc3f19de89ecab2e5d67a62717f2b492e7a20dfd428adc",
                    "lumbre-admin-pb:a598bfe-vega-a51b852":
                        "sha256:7465d6b88612beff8a68d6f9b727935e76898fd4d4a76e200459bea2eeeebfe4",
                    "fodaveg:f92bac858e904817ffc4cf6bf6307a6de0190c32":
                        "sha256:fbb072fe3a1a80f8c5ee87104e470fb71729c07d3e158b696c020eaf9ce7f223",
                }:
            raise RuntimeError("ProjectionInvalid")
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--stage", choices=tuple(STAGES), required=True)
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source = SOURCE.read_bytes()
    if hashlib.sha256(source).hexdigest() != args.script_sha256:
        raise SystemExit("STOP: transport script hash mismatch")
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output must be a new JSON in this evidence directory")
    try:
        verify_local_archive()
        value = invoke(args.stage, source)
    except (OSError, RuntimeError, BrokenPipeError):
        raise SystemExit("STOP: transport/load unavailable or invalid; inspect remote residual state before retry") from None
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(value["status"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
