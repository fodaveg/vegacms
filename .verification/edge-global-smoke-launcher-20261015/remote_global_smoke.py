"""Run the exact captured edge smoke in RAM with one metadata-only inspect edit."""

import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys


SOURCE = Path("/srv/edge/scripts/smoke.sh")
SOURCE_SHA = "0362bbe1c4b022135cff039d52271b0ff1da473b7ae65117ed962556832b5873"
TARGET_SHA = "560240126078e0da021becfb90baef48554153db8ca1fc43d5562174027f0122"
OLD = b"docker inspect edge-caddy >/dev/null 2>&1"
NEW = b"docker inspect --format '{{.Id}}' edge-caddy >/dev/null 2>&1"
EXPECTED_CADDY = {
    "id": "ae97fc0c57fbe4c3a97f5dce15dfc9da92f33f527b60d95c3f74de9d2a160a7a",
    "image": "sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648",
    "running": True,
}
EXPECTED_CHECKS = 19
MAX_SOURCE = 8192
MAX_OUTPUT = 4096


def sha(body):
    return hashlib.sha256(body).hexdigest()


def identity(info):
    return (info.st_dev, info.st_ino, info.st_uid, info.st_gid, info.st_mode,
            info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def source_snapshot():
    """Read only the known regular script through nonsymlink directory entries."""
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in SOURCE.parts[1:-1]:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        leaf = os.open(SOURCE.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        with os.fdopen(leaf, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size != 8059:
                raise RuntimeError("SourceShapeChanged")
            body = stream.read(MAX_SOURCE + 1)
            after = os.fstat(stream.fileno())
        if len(body) != before.st_size or identity(before) != identity(after):
            raise RuntimeError("SourceReadChanged")
        return body, identity(before)
    finally:
        os.close(fd)


def patched_source(body):
    if len(body) != 8059 or sha(body) != SOURCE_SHA or body.count(OLD) != 1:
        raise RuntimeError("SourceSealChanged")
    result = body.replace(OLD, NEW, 1)
    if len(result) != 8078 or sha(result) != TARGET_SHA or result.replace(NEW, OLD, 1) != body:
        raise RuntimeError("PatchShapeChanged")
    return result


def caddy_guard():
    template = '{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}}}'
    result = subprocess.run(["docker", "inspect", "--format", template, "edge-caddy"],
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            timeout=10, check=False)
    if result.returncode or len(result.stdout) > 256:
        raise RuntimeError("CaddyReadUnavailable")
    if json.loads(result.stdout) != EXPECTED_CADDY:
        raise RuntimeError("CaddyIdentityChanged")


def closed_result():
    return {"status": "STOP_GLOBAL_SMOKE_UNAVAILABLE",
            "mode": "canonical-source-single-inspect-format-override", "sourceSha": SOURCE_SHA,
            "targetSha": TARGET_SHA, "checksPassed": None, "failedCheckCount": None,
            "sourceBeforeMatches": False, "sourceAfterMatches": False,
            "caddyBeforeMatches": False, "caddyAfterMatches": False,
            "remoteWrites": False, "privateValuesExported": False}


def run():
    result = closed_result()
    try:
        body, initial_identity = source_snapshot()
        target = patched_source(body)
        result["sourceBeforeMatches"] = True
        caddy_guard()
        result["caddyBeforeMatches"] = True
        command = subprocess.run(["bash", "-s"], input=target,
                                 stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                 timeout=400, check=False)
        if len(command.stdout) > MAX_OUTPUT:
            raise RuntimeError("OutputOversize")
        lines = command.stdout.decode("utf-8").splitlines()
        if any(not line.startswith("OK: ") or len(line) > 256 for line in lines):
            raise RuntimeError("OutputShapeUnknown")
        count = len(lines)
        after_body, after_identity = source_snapshot()
        if sha(after_body) != SOURCE_SHA or after_identity != initial_identity:
            raise RuntimeError("SourceChangedAfterRun")
        result["sourceAfterMatches"] = True
        caddy_guard()
        result["caddyAfterMatches"] = True
        if command.returncode == 0 and count == EXPECTED_CHECKS:
            result.update(status="GLOBAL_SMOKE_PASS", checksPassed=count, failedCheckCount=0)
        elif command.returncode != 0 and 0 <= count < EXPECTED_CHECKS:
            # set -e stops at the first failed statement; neither its text nor
            # the response body is exported. The check identity remains unknown.
            result.update(status="GLOBAL_SMOKE_CHECK_FAILED", checksPassed=count,
                          failedCheckCount=1)
        else:
            raise RuntimeError("CheckCountUnknown")
    except (OSError, ValueError, UnicodeError, RuntimeError, subprocess.TimeoutExpired):
        result["status"] = "STOP_GLOBAL_SMOKE_UNAVAILABLE"
        result["checksPassed"] = None
        result["failedCheckCount"] = None
    return result


def main():
    if len(sys.argv) != 1:
        result = closed_result()
    else:
        result = run()
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] == "GLOBAL_SMOKE_PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
