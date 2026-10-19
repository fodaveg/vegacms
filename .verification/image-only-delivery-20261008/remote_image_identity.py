"""Project public identity fields for three newly loaded, mismatching tags.

No Config.Env, full image config, Compose, Caddy, logs, or container data is
requested. Docker descriptor metadata and revision labels are filtered in RAM.
"""

import json
import re
import subprocess
import sys


TAGS = (
    "vegacms:a51b8521e1eeef52a522d2a065b36a03578c0c3a",
    "lumbre-admin-pb:a598bfe-vega-a51b852",
    "fodaveg:f92bac858e904817ffc4cf6bf6307a6de0190c32",
)
ESSENTIAL = ('{"id":{{json .Id}},"os":{{json .Os}},'
             '"architecture":{{json .Architecture}},"layers":{{json .RootFS.Layers}}}')
DESCRIPTOR = "{{json .Descriptor}}"
REVISION = ('{{if .Config.Labels}}'
            '{{json (index .Config.Labels "org.opencontainers.image.revision")}}'
            '{{else}}null{{end}}')
SHA = re.compile(r"sha256:[0-9a-f]{64}")
REV = re.compile(r"[0-9a-f]{40}")


def inspect_field(tag, template, optional=False):
    """Bound and discard Docker's raw output after selective template parsing."""
    try:
        result = subprocess.run(["docker", "image", "inspect", "--format", template, tag],
                                capture_output=True, timeout=25, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("ImageInspectionUnavailable") from None
    if result.returncode:
        if optional:
            return None
        raise RuntimeError("ImageInspectionUnavailable")
    if len(result.stdout) > 32768 or len(result.stderr) > 1024:
        raise RuntimeError("ImageProjectionOversized")
    try:
        return json.loads(result.stdout)
    except (ValueError, UnicodeDecodeError):
        if optional:
            return None
        raise RuntimeError("ImageProjectionInvalid") from None


def project(tag):
    """Keep exact ID/layer digests plus only descriptor media type and revision."""
    identity = inspect_field(tag, ESSENTIAL)
    if (not isinstance(identity, dict) or set(identity) != {"id", "os", "architecture", "layers"} or
            not isinstance(identity["id"], str) or not SHA.fullmatch(identity["id"]) or
            identity["os"] != "linux" or identity["architecture"] != "amd64" or
            not isinstance(identity["layers"], list) or not 1 <= len(identity["layers"]) <= 64 or
            any(not isinstance(item, str) or not SHA.fullmatch(item) for item in identity["layers"])):
        raise RuntimeError("ImageIdentityShapeUnknown")
    raw_descriptor = inspect_field(tag, DESCRIPTOR, optional=True)
    descriptor = {"digest": None, "mediaType": None}
    if isinstance(raw_descriptor, dict):
        candidate_digest = raw_descriptor.get("digest") or raw_descriptor.get("Digest")
        candidate_type = raw_descriptor.get("mediaType") or raw_descriptor.get("MediaType")
        if isinstance(candidate_digest, str) and SHA.fullmatch(candidate_digest):
            descriptor["digest"] = candidate_digest
        if isinstance(candidate_type, str) and re.fullmatch(r"application/vnd\.[a-z0-9.+-]+", candidate_type):
            descriptor["mediaType"] = candidate_type
    raw_revision = inspect_field(tag, REVISION, optional=True)
    revision = raw_revision if isinstance(raw_revision, str) and REV.fullmatch(raw_revision) else None
    return {**identity, "descriptor": descriptor, "revision": revision}


def main():
    try:
        images = {tag: project(tag) for tag in TAGS}
        result = {"status": "IDENTITIES_PROJECTED_FOR_REVIEW", "schemaVersion": 1,
                  "remoteWrites": False, "configEnvRead": False, "logsRead": False,
                  "caddyRead": False, "images": images}
    except Exception:
        result = {"status": "STOP_IDENTITY_READ", "schemaVersion": 1,
                  "remoteWrites": False, "configEnvRead": False, "logsRead": False,
                  "caddyRead": False, "images": None}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] == "IDENTITIES_PROJECTED_FOR_REVIEW" else 2


if __name__ == "__main__":
    sys.exit(main())
