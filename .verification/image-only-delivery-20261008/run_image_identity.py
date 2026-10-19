"""Release-owner wrapper for one image identity read after load mismatch."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "remote_image_identity.py"
TAGS = {"vegacms:a51b8521e1eeef52a522d2a065b36a03578c0c3a",
        "lumbre-admin-pb:a598bfe-vega-a51b852",
        "fodaveg:f92bac858e904817ffc4cf6bf6307a6de0190c32"}
SHA = re.compile(r"sha256:[0-9a-f]{64}")


def valid(value, exit_code):
    """Only selected public fields may reach the durable JSON receipt."""
    if not isinstance(value, dict) or set(value) != {
            "status", "schemaVersion", "remoteWrites", "configEnvRead",
            "logsRead", "caddyRead", "images"} or value["schemaVersion"] != 1 or \
            any(value[key] is not False for key in ("remoteWrites", "configEnvRead", "logsRead", "caddyRead")):
        return False
    if value["status"] == "STOP_IDENTITY_READ":
        return exit_code == 2 and value["images"] is None
    if value["status"] != "IDENTITIES_PROJECTED_FOR_REVIEW" or exit_code != 0 or \
            not isinstance(value["images"], dict) or set(value["images"]) != TAGS:
        return False
    for image in value["images"].values():
        if not isinstance(image, dict) or set(image) != {
                "id", "os", "architecture", "layers", "descriptor", "revision"} or \
                not isinstance(image["id"], str) or not SHA.fullmatch(image["id"]) or \
                image["os"] != "linux" or image["architecture"] != "amd64" or \
                not isinstance(image["layers"], list) or not 1 <= len(image["layers"]) <= 64 or \
                any(not isinstance(item, str) or not SHA.fullmatch(item) for item in image["layers"]):
            return False
        descriptor = image["descriptor"]
        if not isinstance(descriptor, dict) or set(descriptor) != {"digest", "mediaType"}:
            return False
        if descriptor["digest"] is not None and (not isinstance(descriptor["digest"], str) or
                                                 not SHA.fullmatch(descriptor["digest"])):
            return False
        if descriptor["mediaType"] is not None and (not isinstance(descriptor["mediaType"], str) or
                                                    not re.fullmatch(r"application/vnd\.[a-z0-9.+-]+",
                                                                     descriptor["mediaType"])):
            return False
        if image["revision"] is not None and (not isinstance(image["revision"], str) or
                                              not re.fullmatch(r"[0-9a-f]{40}", image["revision"])):
            return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source = SOURCE.read_bytes()
    if hashlib.sha256(source).hexdigest() != args.script_sha256:
        raise SystemExit("STOP: image identity script hash mismatch")
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output must be a new JSON in this evidence directory")
    try:
        result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                                 "lumbre", "python3", "-B", "-"], input=source,
                                capture_output=True, timeout=150, check=False)
        if len(result.stdout) > 32768 or len(result.stderr) > 8192:
            raise ValueError
        value = json.loads(result.stdout)
        if not valid(value, result.returncode):
            raise ValueError
    except (OSError, subprocess.TimeoutExpired, ValueError, UnicodeDecodeError):
        raise SystemExit("STOP: image identity projection unavailable or invalid; no raw output saved") from None
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(value["status"])
    return 0 if value["status"] == "IDENTITIES_PROJECTED_FOR_REVIEW" else 2


if __name__ == "__main__":
    sys.exit(main())
