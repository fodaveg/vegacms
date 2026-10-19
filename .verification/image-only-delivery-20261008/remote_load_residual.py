"""Read-only discrimination after a failed image load; no retry or log read."""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


ARCHIVE = Path("/srv/vega-image-rollout/images-a51b-20261008.tar")
ARCHIVE_SHA = "34a1780fe31f9c1b50a5e47435fa6183cdd53d956ce00ddab82a247ae8e1ee0a"
ARCHIVE_BYTES = 606022656
IMAGES = {
    "vegacms:a51b8521e1eeef52a522d2a065b36a03578c0c3a":
        "sha256:9cd8aaaee3b486b8d9bc3f19de89ecab2e5d67a62717f2b492e7a20dfd428adc",
    "lumbre-admin-pb:a598bfe-vega-a51b852":
        "sha256:7465d6b88612beff8a68d6f9b727935e76898fd4d4a76e200459bea2eeeebfe4",
    "fodaveg:f92bac858e904817ffc4cf6bf6307a6de0190c32":
        "sha256:fbb072fe3a1a80f8c5ee87104e470fb71729c07d3e158b696c020eaf9ce7f223",
}
VERSION = re.compile(r"[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(?:[-+][A-Za-z0-9._-]+)?")


def command(argv):
    """Bound and discard all private CLI failure text."""
    try:
        result = subprocess.run(argv, capture_output=True, timeout=25, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("DockerCommandUnavailable") from None
    if len(result.stdout) > 1024 or len(result.stderr) > 1024:
        raise RuntimeError("DockerProjectionOversized")
    return result.returncode, result.stdout


def versions():
    status, body = command(["docker", "version", "--format",
                            "{{json .Client.Version}}|{{json .Server.Version}}"])
    if status or body.count(b"|") != 1:
        raise RuntimeError("DockerVersionUnavailable")
    try:
        client, server = (json.loads(part) for part in body.split(b"|"))
    except (ValueError, UnicodeDecodeError):
        raise RuntimeError("DockerVersionUnavailable") from None
    if not all(isinstance(value, str) and VERSION.fullmatch(value) for value in (client, server)):
        raise RuntimeError("DockerVersionUnavailable")
    return client, server


def archive_identity():
    """Read only the already sealed local archive's size and SHA."""
    if ARCHIVE.is_symlink() or not ARCHIVE.is_file():
        return False, False
    size_matches = ARCHIVE.stat().st_size == ARCHIVE_BYTES
    if not size_matches:
        return False, False
    hasher = hashlib.sha256()
    with ARCHIVE.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return size_matches, hasher.hexdigest() == ARCHIVE_SHA


def image_states():
    """Return only match/missing/wrong-ID, without Docker errors or Config.Env."""
    states = {}
    for tag, expected in IMAGES.items():
        status, body = command(["docker", "image", "inspect", "--format", "{{json .Id}}", tag])
        if status:
            states[tag] = "NOT_RESOLVED"
            continue
        try:
            actual = json.loads(body)
        except (ValueError, UnicodeDecodeError):
            states[tag] = "INSPECT_INVALID"
            continue
        states[tag] = "MATCH" if actual == expected else "WRONG_ID"
    return states


def disk():
    status, body = command(["docker", "info", "--format", "{{json .DockerRootDir}}"])
    if status:
        raise RuntimeError("DockerRootUnknown")
    try:
        docker_root = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        raise RuntimeError("DockerRootUnknown") from None
    if not isinstance(docker_root, str) or not docker_root.startswith("/") or "/../" in docker_root:
        raise RuntimeError("DockerRootUnknown")
    srv = os.statvfs("/srv")
    docker = os.statvfs(docker_root)
    return {"freeSrvKiB": srv.f_bavail * srv.f_frsize // 1024,
            "freeDockerKiB": docker.f_bavail * docker.f_frsize // 1024,
            "sameFilesystem": os.stat("/srv").st_dev == os.stat(docker_root).st_dev}


def main():
    try:
        size_matches, hash_matches = archive_identity()
        client, server = versions()
        states = image_states()
        space = disk()
        status = "THREE_LOADED" if size_matches and hash_matches and all(
            value == "MATCH" for value in states.values()) else "RESIDUAL_REVIEW"
        result = {"status": status, "schemaVersion": 1, "remoteWrites": False,
                  "archiveBytesMatch": size_matches, "archiveSha256Match": hash_matches,
                  "imageStates": states, "dockerClientVersion": client,
                  "dockerServerVersion": server, **space,
                  "configEnvRead": False, "logsRead": False, "caddyRead": False}
    except Exception:
        result = {"status": "STOP_RESIDUAL_READ", "schemaVersion": 1, "remoteWrites": False,
                  "archiveBytesMatch": None, "archiveSha256Match": None,
                  "imageStates": None, "dockerClientVersion": None,
                  "dockerServerVersion": None, "freeSrvKiB": None,
                  "freeDockerKiB": None, "sameFilesystem": None,
                  "configEnvRead": False, "logsRead": False, "caddyRead": False}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] == "THREE_LOADED" else 2


if __name__ == "__main__":
    sys.exit(main())
