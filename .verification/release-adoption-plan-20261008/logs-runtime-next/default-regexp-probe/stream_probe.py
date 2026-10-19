"""One synthetic local stream probe for Caddy's existing default logger.

Uses the pinned local image, an owned Docker network and loopback-only ports.
Only finite assertions are persisted; synthetic raw logs stay in process RAM.
"""
import hashlib
import http.client
import json
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import time


ROOT = Path(__file__).resolve().parent
IMAGE = "sha256:6b08c1b9858ca9a7d99c1da13c3695081e0e604c6cf214ca26a7ce0e2c4fd9b4"
FRAGMENT = (ROOT.parent / "default-runtime-encoder-regexp.proposed.caddy").read_text()
OWNER = "vega-default-stream-" + secrets.token_hex(6)
MARKER = "vega-synthetic-stream-token-20261009"
CASES = (
    ("normal", "/normal?token=" + MARKER),
    ("encoded_key", "/encoded?%74oken=" + MARKER),
    ("repeated", "/repeated?token=" + MARKER + "&token=" + MARKER),
    ("malformed_percent", "/malformed?bad=%zz&token=" + MARKER),
    ("encoded_newline", "/newline?note=%0A&token=" + MARKER),
)


def docker(*args, input_bytes=None, timeout=25):
    """Capture local Docker output; never echo synthetic raw log lines."""
    result = subprocess.run(["docker", *args], input=input_bytes,
                            capture_output=True, timeout=timeout, check=False)
    if len(result.stdout) > 4_000_000 or len(result.stderr) > 4_000_000:
        raise RuntimeError("DOCKER_OUTPUT_LIMIT")
    if result.returncode:
        raise RuntimeError("DOCKER_" + args[0].upper() + "_FAILED")
    return result.stdout + result.stderr if args[0] == "logs" else result.stdout


def request(port, route):
    """Send only synthetic loopback requests with a synthetic Referer."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        connection.request("GET", route, headers={
            "Host": "fixture.invalid",
            "Referer": "https://fixture.invalid/ref?token=" + MARKER,
        })
        response = connection.getresponse()
        response.read()
        return response.status
    finally:
        connection.close()


def config(filtered):
    """Nest the reviewed fragment inside a synthetic global default logger."""
    format_line = FRAGMENT if filtered else ""
    return ("{\n admin off\n auto_https off\n log default {\n" +
            format_line + "\n }\n}\n:8080 {\n" +
            " reverse_proxy http://127.0.0.1:65534\n}\n")


def records(raw):
    """Select only request-bearing 502 records without persisting raw logs."""
    values = []
    for line in raw.decode("utf-8", "replace").splitlines():
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and isinstance(value.get("request"), dict):
            values.append(value)
    return values


def run_mode(mode, fixture, network, receipt):
    """Start one owned instance, collect its error records and stop it."""
    name = OWNER + "-" + mode
    source = fixture / (mode + ".Caddyfile")
    source.write_text(config(mode == "filtered"))
    expected = CASES if mode == "filtered" else CASES[:1]
    docker("run", "--detach", "--pull=never", "--platform=linux/arm64",
           "--name", name, "--label=vega.probe.owner=" + OWNER,
           "--network", network, "--read-only",
           "--tmpfs=/tmp:rw,nosuid,size=16m",
           "--tmpfs=/data:rw,nosuid,size=16m",
           "--tmpfs=/config:rw,nosuid,size=16m",
           "--env=XDG_DATA_HOME=/data", "--env=XDG_CONFIG_HOME=/config",
           "--publish=127.0.0.1::8080",
           "--mount=type=bind,src=" + str(source) + ",dst=/etc/caddy/Caddyfile,readonly",
           "--entrypoint=caddy", IMAGE,
           "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile")
    port_text = docker("port", name, "8080/tcp").decode("ascii", "strict").strip()
    if not re.fullmatch(r"127\.0\.0\.1:[0-9]+", port_text):
        raise RuntimeError("PORT_NOT_LOOPBACK")
    port = int(port_text.rsplit(":", 1)[1])
    statuses = []
    for label, route in expected:
        deadline = time.monotonic() + 8
        while True:
            try:
                status = request(port, route)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise RuntimeError("LOCAL_START_TIMEOUT")
                time.sleep(0.1)
        statuses.append((label, status))
    time.sleep(0.4)
    docker("stop", name)
    raw = docker("logs", name)
    values = records(raw)
    if len(values) != len(expected) or any(value.get("status") != 502 for value in values):
        raise RuntimeError("REQUEST_RECORD_COUNT_OR_STATUS")
    details = []
    for ((label, route), (_, status), value) in zip(expected, statuses, values):
        req = value["request"]
        uri = req.get("uri")
        if not isinstance(uri, str):
            raise RuntimeError("URI_SHAPE")
        referer = req.get("headers", {}).get("Referer")
        expected_uri = route.split("?", 1)[0] + "?REDACTED"
        expected_present = mode == "control"
        if (status != 502 or (MARKER in uri) != expected_present or
                (MARKER in json.dumps(referer)) != expected_present):
            raise RuntimeError("TOKEN_POLICY_FAILED")
        if mode == "filtered" and (uri != expected_uri or referer is not None or
                                   MARKER in json.dumps(value)):
            raise RuntimeError("FILTERED_RECORD_FAILED")
        details.append({"case": label, "status": status,
                        "pathPreserved": uri.split("?", 1)[0] == route.split("?", 1)[0],
                        "queryRedacted": uri == expected_uri,
                        "markerInRequestURI": MARKER in uri,
                        "refererRemoved": referer is None,
                        "markerInRecord": MARKER in json.dumps(value)})
    receipt["modes"][mode] = {"recordCount": len(values), "cases": details,
                               "syntheticLogSHA256": hashlib.sha256(raw).hexdigest()}


def main():
    """Run one control and one filtered instance, then clean only owned resources."""
    receipt = {"status": "STOP", "owner": OWNER, "image": IMAGE,
               "fragmentSHA256": hashlib.sha256(FRAGMENT.encode()).hexdigest(),
               "network": "owned_bridge", "port": "127.0.0.1:ephemeral",
               "modes": {}, "rawLogsPersisted": False}
    network = OWNER + "-network"
    cleanup = []
    try:
        image = docker("image", "inspect", IMAGE, "--format",
                       "{{.Id}} {{.Architecture}} {{.Os}}").decode().strip()
        if image != IMAGE + " arm64 linux":
            raise RuntimeError("IMAGE_PLATFORM_CHANGED")
        with tempfile.TemporaryDirectory(prefix=OWNER + "-") as temporary:
            fixture = Path(temporary)
            docker("network", "create",
                   "--label=vega.probe.owner=" + OWNER, network)
            for mode in ("control", "filtered"):
                run_mode(mode, fixture, network, receipt)
        receipt["status"] = "LOCAL_STREAM_PASS"
    except Exception as error:
        known = {"DOCKER_OUTPUT_LIMIT", "PORT_NOT_LOOPBACK", "LOCAL_START_TIMEOUT",
                 "REQUEST_RECORD_COUNT_OR_STATUS", "URI_SHAPE", "TOKEN_POLICY_FAILED",
                 "FILTERED_RECORD_FAILED", "IMAGE_PLATFORM_CHANGED"}
        message = str(error)
        receipt["failureClass"] = message if message in known or message.startswith("DOCKER_") else "UNRESOLVED"
    finally:
        for mode in ("filtered", "control"):
            result = subprocess.run(["docker", "rm", "--force", OWNER + "-" + mode],
                                    capture_output=True, check=False)
            cleanup.append({"resource": mode, "exit": result.returncode})
        result = subprocess.run(["docker", "network", "rm", network],
                                capture_output=True, check=False)
        cleanup.append({"resource": "network", "exit": result.returncode})
        receipt["cleanup"] = cleanup
    path = ROOT / "stream-receipt-bridge.json"
    with path.open("x", encoding="utf-8") as stream:
        json.dump(receipt, stream, indent=2, sort_keys=True)
        stream.write("\n")
    print(receipt["status"])
    return 0 if receipt["status"] == "LOCAL_STREAM_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
