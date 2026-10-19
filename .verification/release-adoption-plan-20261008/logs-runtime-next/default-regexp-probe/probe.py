"""One local, networkless Caddy 2.11.4 syntax discriminator.

The Caddyfile is synthetic and passed on stdin. No host configuration, logs,
secrets, ports or remote Docker context enter this probe.
"""
import hashlib
import json
from pathlib import Path
import re
import secrets
import subprocess


IMAGE = "sha256:6b08c1b9858ca9a7d99c1da13c3695081e0e604c6cf214ca26a7ce0e2c4fd9b4"
FRAGMENT = (Path(__file__).resolve().parents[1] /
            "default-runtime-encoder-regexp.proposed.caddy").read_bytes()
OWNER = "vega-default-regexp-local-" + secrets.token_hex(6)
ROOT = Path(__file__).resolve().parent
PREFIX = b"{\n admin off\n auto_https off\n log default {\n"
SUFFIX = b"\n }\n}\n:8080 {\n respond \"ok\" 200\n}\n"


def fixture(fragment):
    """Nest only the reviewed fragment in a synthetic global default logger."""
    return PREFIX + fragment + SUFFIX


def captured(command, *, input_bytes=None, timeout=30):
    result = subprocess.run(command, input=input_bytes, capture_output=True,
                            timeout=timeout, check=False)
    if len(result.stdout) > 4_000_000 or len(result.stderr) > 4_000_000:
        raise RuntimeError("OUTPUT_LIMIT")
    return result


def caddy(command, body=None):
    name = OWNER + "-" + str(caddy.calls)
    caddy.calls += 1
    args = ["docker", "run", "--rm", "-i", "--pull=never",
            "--platform=linux/arm64", "--network=none", "--read-only",
            "--tmpfs=/tmp:rw,nosuid,size=16m",
            "--tmpfs=/data:rw,nosuid,size=16m",
            "--tmpfs=/config:rw,nosuid,size=16m",
            "--env=XDG_DATA_HOME=/data", "--env=XDG_CONFIG_HOME=/config",
            "--label=vega.probe.owner=" + OWNER, "--name=" + name,
            "--entrypoint=caddy", IMAGE, *command]
    return captured(args, input_bytes=body)


caddy.calls = 0


def main():
    receipt = {"status": "STOP", "imageExpected": IMAGE,
               "fragmentSHA256": hashlib.sha256(FRAGMENT).hexdigest(),
               "network": "none", "hostMounts": 0, "hostPorts": 0,
               "readOnly": True, "pull": "never", "containerOwner": OWNER,
               "checks": {}}
    try:
        image = captured(["docker", "image", "inspect", IMAGE, "--format",
                          '{{.Id}} {{.Architecture}} {{.Os}}'])
        parts = image.stdout.decode("ascii", "strict").strip().split()
        if image.returncode or parts != [IMAGE, "arm64", "linux"]:
            raise RuntimeError("IMAGE_ID_OR_PLATFORM_UNKNOWN")
        receipt["checks"]["imageExact"] = True

        version = caddy(["version"])
        receipt["checks"]["versionExit"] = version.returncode
        if version.returncode or not re.fullmatch(
                rb"v2\.11\.4(?: h1:[A-Za-z0-9+/]{43}=)?\r?\n?", version.stdout):
            raise RuntimeError("VERSION_UNKNOWN")
        receipt["checks"]["versionExact"] = True

        body = fixture(FRAGMENT)
        receipt["fixtureSHA256"] = hashlib.sha256(body).hexdigest()
        adapt = caddy(["adapt", "--config", "/dev/stdin", "--adapter", "caddyfile"], body)
        receipt["checks"]["adaptExit"] = adapt.returncode
        if adapt.returncode:
            raise RuntimeError("ADAPT_FAILED")
        model = json.loads(adapt.stdout)
        default = model["logging"]["logs"]["default"]
        encoder = default["encoder"]
        fields = encoder["fields"]
        uri = fields["request>uri"]
        referer = fields["request>headers>Referer"]
        if ("writer" in default or encoder.get("format") != "filter" or
                "wrap" in encoder or uri != {"filter": "regexp",
                                                 "regexp": "(?s)[?].*",
                                                 "value": "?REDACTED"} or
                referer != {"filter": "delete"}):
            raise RuntimeError("ADAPTED_MODEL_UNEXPECTED")
        receipt["checks"].update(defaultWriterOmitted=True, wrappedFormatOmitted=True,
                                 regexpFieldExact=True, refererDeleteExact=True)

        valid = caddy(["validate", "--config", "/dev/stdin", "--adapter", "caddyfile"], body)
        receipt["checks"]["validateExit"] = valid.returncode
        if valid.returncode:
            raise RuntimeError("VALIDATE_FAILED")

        bad_fragment = FRAGMENT.replace(b"(?s)[?].*", b"(?s)[", 1)
        if bad_fragment == FRAGMENT:
            raise RuntimeError("NEGATIVE_NOT_CONSTRUCTED")
        negative = caddy(["validate", "--config", "/dev/stdin", "--adapter", "caddyfile"],
                         fixture(bad_fragment))
        receipt["checks"]["negativeValidateExit"] = negative.returncode
        if negative.returncode == 0:
            raise RuntimeError("NEGATIVE_ACCEPTED")
        receipt["status"] = "LOCAL_SYNTAX_DISCRIMINATOR_PASSED"
    except Exception as error:
        receipt["failureClass"] = str(error) if str(error) in {
            "IMAGE_ID_OR_PLATFORM_UNKNOWN", "VERSION_UNKNOWN", "ADAPT_FAILED",
            "ADAPTED_MODEL_UNEXPECTED", "VALIDATE_FAILED", "NEGATIVE_NOT_CONSTRUCTED",
            "NEGATIVE_ACCEPTED", "OUTPUT_LIMIT"} else "UNRESOLVED"
    receipt["dockerRunCount"] = caddy.calls
    path = ROOT / "receipt-arm64.json"
    with path.open("x", encoding="utf-8") as stream:
        json.dump(receipt, stream, sort_keys=True, indent=2)
        stream.write("\n")
    print(receipt["status"])
    return 0 if receipt["status"] == "LOCAL_SYNTAX_DISCRIMINATOR_PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
