"""One explicit transport of the reviewed projector; no implicit SSH attempt."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "remote_preflight.py"
EXPECTED_CONTAINERS = {"vega-pb", "lumbre-admin-pb", "fodaveg"}
ALLOWED_MOUNT_NAMES = {"vega_data", "lumbre_admin_pb_data", "fodaveg_fodaveg_pb", None}
ALLOWED_MOUNT_DESTINATIONS = {"/pb/pb_data", "/pb/pb_migrations", "/pb/publish"}
ALLOWED_NETWORKS = {"edge", "vega-edge"}
EXPECTED_SELECTOR_KEYS = {"vega-pb": {"VEGA_IMAGE_TAG", "VEGA_GIT_SHA"},
                          "lumbre-admin-pb": {"LUMBRE_ADMIN_IMAGE"},
                          "fodaveg": {"FODAVEG_IMAGE"}}
EXPECTED_IMAGE_PREFIX = {"vega-pb": "vegacms:", "lumbre-admin-pb": "lumbre-admin-pb:",
                         "fodaveg": "fodaveg:"}
KNOWN_ALIASES = {"vega-pb", "lumbre-admin-pb", "fodaveg", "pocketbase"}


def allowed_arg(value):
    if value in {"/pb/pocketbase", "/pb/lumbre-admin", "/pb/fodaveg-pb",
                 "/usr/bin/tini", "./docker-entrypoint.sh", "--", "-g", "serve", "--dir",
                 "/pb/pb_data", "--hooksWatch=false", "--hooksWatch=true"}:
        return True
    if re.fullmatch(r"--http=(?:0\.0\.0\.0|127\.0\.0\.1):(?:8090|4321)", value):
        return True
    if re.fullmatch(r"--(?:dir|publicDir|hooksDir|migrationsDir)=/pb/(?:pb_data|pb_public|pb_hooks|pb_migrations|publish)", value):
        return True
    return re.fullmatch(r"--origins=(?:https://(?:admin\.vegacms\.com|admin\.lumbre\.pro|admin\.fodaveg\.net|fodaveg\.net))(?:,https://(?:admin\.vegacms\.com|admin\.lumbre\.pro|admin\.fodaveg\.net|fodaveg\.net))*", value) is not None


def validate(value):
    """Reject all unrecognized structure rather than preserving raw remote output."""
    if not isinstance(value, dict) or set(value) != {
        "schemaVersion", "mode", "remoteWrites", "caddyRead", "configEnvRequested",
        "dotenvSelectorScan", "composeMayInterpolateSecretsInRAM", "composeBodyParsed",
        "composeHashRead", "containers", "status"
    }:
        return False
    if (value["schemaVersion"] != 1 or value["mode"] != "image-only-metadata-preflight" or
            value["remoteWrites"] is not False or value["caddyRead"] is not False or
            value["configEnvRequested"] is not False or value["dotenvSelectorScan"] is not True or
            value["composeMayInterpolateSecretsInRAM"] is not True or
            value["composeBodyParsed"] is not False or value["composeHashRead"] is not True or
            value["status"] not in ("STOP", "READY_FOR_REVIEW") or
            not isinstance(value["containers"], dict) or set(value["containers"]) != EXPECTED_CONTAINERS):
        return False
    for name, item in value["containers"].items():
        if not isinstance(item, dict) or set(item) - {
            "status", "errorCode", "composeQuietValid", "composeSha256", "selectors",
            "runtime", "composeStable", "selectorMatchesRuntime", "selectorResolvesCurrentImage",
            "mountsMatch", "networkMatches", "stockCorsBaselineMatches"
        } or item.get("status") not in ("STOP", "READY_FOR_REVIEW"):
            return False
        if item.get("errorCode") not in (None, "MetadataUnavailable"):
            return False
        if any(item.get(k) not in (None, True, False) for k in (
            "composeQuietValid", "composeStable", "selectorMatchesRuntime",
            "selectorResolvesCurrentImage", "mountsMatch", "networkMatches", "stockCorsBaselineMatches"
        )):
            return False
        digest = item.get("composeSha256")
        if digest is not None and (not isinstance(digest, str) or re.fullmatch(r"[0-9a-f]{64}", digest) is None):
            return False
        selectors = item.get("selectors", {})
        if not isinstance(selectors, dict) or set(selectors) - EXPECTED_SELECTOR_KEYS[name] or any(not isinstance(v, str) or re.fullmatch(
            r"(?:lumbre-admin-pb|fodaveg):[a-z0-9][a-z0-9._-]{0,127}|[0-9a-f]{40}", v
        ) is None for v in selectors.values()):
            return False
        runtime = item.get("runtime")
        if runtime is not None:
            if not isinstance(runtime, dict) or set(runtime) != {
                "imageId", "imageRef", "composeIdentityMatches", "entrypoint", "cmd", "pbArgv",
                "mounts", "unknownMounts", "networks", "unknownNetworks"
            }:
                return False
            if not isinstance(runtime["composeIdentityMatches"], bool):
                return False
            if runtime["imageId"] is not None and (not isinstance(runtime["imageId"], str) or
                re.fullmatch(r"sha256:[0-9a-f]{64}", runtime["imageId"]) is None):
                return False
            for field in ("entrypoint", "cmd", "pbArgv"):
                projected = runtime[field]
                if (not isinstance(projected, dict) or set(projected) != {"allowed", "unknownCount"} or
                        not isinstance(projected["allowed"], list) or
                        not isinstance(projected["unknownCount"], int) or
                        projected["unknownCount"] < 0):
                    return False
                if any(not isinstance(v, str) or not allowed_arg(v) for v in projected["allowed"]):
                    return False
            if (not isinstance(runtime["mounts"], list) or len(runtime["mounts"]) > 16 or
                    not isinstance(runtime["networks"], list) or len(runtime["networks"]) > 8 or
                    not isinstance(runtime["unknownMounts"], int) or runtime["unknownMounts"] < 0 or
                    not isinstance(runtime["unknownNetworks"], int) or runtime["unknownNetworks"] < 0):
                return False
            if runtime["imageRef"] is not None and (not isinstance(runtime["imageRef"], str) or
                not runtime["imageRef"].startswith(EXPECTED_IMAGE_PREFIX[name]) or
                re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,127}",
                             runtime["imageRef"][len(EXPECTED_IMAGE_PREFIX[name]):]) is None):
                return False
            for mount in runtime["mounts"]:
                if (not isinstance(mount, dict) or set(mount) != {
                    "type", "name", "destination", "readWrite", "sourceFingerprint"
                } or mount["type"] not in ("bind", "volume") or
                        mount["name"] not in ALLOWED_MOUNT_NAMES or
                        mount["destination"] not in ALLOWED_MOUNT_DESTINATIONS or
                        not isinstance(mount["readWrite"], bool) or
                        not isinstance(mount["sourceFingerprint"], str) or
                        re.fullmatch(r"[0-9a-f]{64}", mount["sourceFingerprint"]) is None):
                    return False
            for network in runtime["networks"]:
                if (not isinstance(network, dict) or set(network) != {"name", "aliases"} or
                        network["name"] not in ALLOWED_NETWORKS or
                        not isinstance(network["aliases"], list) or len(network["aliases"]) > 16 or
                        any(not isinstance(alias, str) or
                            (alias not in KNOWN_ALIASES and
                             re.fullmatch(r"[0-9a-f]{12,64}", alias) is None)
                            for alias in network["aliases"])):
                    return False
        if item["status"] == "READY_FOR_REVIEW":
            if (set(selectors) != EXPECTED_SELECTOR_KEYS[name] or runtime is None or
                    not all(item.get(k) is True for k in (
                        "composeQuietValid", "composeStable", "selectorMatchesRuntime",
                        "selectorResolvesCurrentImage", "mountsMatch", "networkMatches", "stockCorsBaselineMatches"
                    ))):
                return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source = SCRIPT.read_bytes()
    if hashlib.sha256(source).hexdigest() != args.script_sha256:
        raise SystemExit("STOP: projector hash mismatch")
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output must be a new JSON file in this evidence directory")
    try:
        result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                                 "lumbre", "python3", "-B", "-"], input=source,
                                capture_output=True, timeout=120, check=False)
        if result.returncode or len(result.stdout) > 65536 or len(result.stderr) > 65536:
            raise ValueError("remote transport unavailable")
        value = json.loads(result.stdout)
        if not validate(value):
            raise ValueError("remote projection invalid")
    except (OSError, subprocess.TimeoutExpired, ValueError, json.JSONDecodeError):
        raise SystemExit("STOP: remote preflight unavailable or invalid; no raw remote output saved") from None
    descriptor = os.open(str(args.out), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print("PREPARED_METADATA_REVIEW" if value["status"] == "READY_FOR_REVIEW" else "STOP_METADATA_REVIEW")
    return 0 if value["status"] == "READY_FOR_REVIEW" else 2


if __name__ == "__main__":
    sys.exit(main())
