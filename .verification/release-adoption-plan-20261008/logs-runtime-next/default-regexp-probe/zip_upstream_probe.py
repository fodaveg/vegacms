"""Directed local ZIP/upstream probe for the reviewed default-log fragment.

One Caddy instance proxies loopback port 8080 to its local static ZIP listener
on 8081. The upstream access record proves the query reached that listener;
the response digest proves the ZIP bytes survived the proxy. Synthetic raw
logs, ZIP bytes and token exist only in RAM or an owned temporary directory.
"""
import hashlib
import http.client
import io
import json
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import time
import zipfile


ROOT = Path(__file__).resolve().parent
IMAGE = "sha256:6b08c1b9858ca9a7d99c1da13c3695081e0e604c6cf214ca26a7ce0e2c4fd9b4"
FRAGMENT = (ROOT.parent / "default-runtime-encoder-regexp.proposed.caddy").read_text()
OWNER = "vega-default-zip-" + secrets.token_hex(6)


def docker(*args, timeout=25):
    """Use only the local Docker engine and keep unfiltered output in RAM."""
    result = subprocess.run(["docker", *args], capture_output=True,
                            timeout=timeout, check=False)
    if len(result.stdout) > 4_000_000 or len(result.stderr) > 4_000_000:
        raise RuntimeError("DOCKER_OUTPUT_LIMIT")
    if result.returncode:
        raise RuntimeError("DOCKER_" + args[0].upper() + "_FAILED")
    return result.stdout + result.stderr if args[0] == "logs" else result.stdout


def caddyfile():
    """Preserve the proposed global default logger on the proxying server."""
    return ("{\n admin off\n auto_https off\n log default {\n" + FRAGMENT +
            "\n }\n}\n:8080 {\n reverse_proxy http://127.0.0.1:8081\n}\n" +
            ":8081 {\n root * /srv\n file_server\n" +
            " log {\n output stdout\n format json\n }\n}\n")


def zip_bytes():
    """Construct a small deterministic synthetic ZIP; no real backup data."""
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        member = zipfile.ZipInfo("synthetic.txt", date_time=(2020, 1, 1, 0, 0, 0))
        member.compress_type = zipfile.ZIP_STORED
        archive.writestr(member, b"synthetic ZIP response for local Caddy proxy probe\n")
    return output.getvalue()


def request(port, route):
    """Send a synthetic GET over an ephemeral host-loopback port."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        connection.request("GET", route, headers={"Host": "fixture.invalid"})
        response = connection.getresponse()
        return response.status, response.read()
    finally:
        connection.close()


def access_records(raw):
    """Select upstream access records without writing their query strings."""
    values = []
    for line in raw.decode("utf-8", "replace").splitlines():
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if (isinstance(value, dict) and value.get("status") == 200 and
                isinstance(value.get("request"), dict)):
            values.append(value)
    return values


def main():
    """Verify two proxy requests, then remove only this run's resources."""
    token = "synthetic-" + secrets.token_hex(16)
    payload = zip_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    paths = (
        "/synthetic.zip?token=" + token,
        "/synthetic.zip?bad=%zz&%74oken=" + token + "&token=" + token,
    )
    network = OWNER + "-network"
    name = OWNER + "-caddy"
    receipt = {"status": "STOP", "owner": OWNER, "image": IMAGE,
               "fragmentSHA256": hashlib.sha256(FRAGMENT.encode()).hexdigest(),
               "syntheticZIPSHA256": digest, "syntheticZIPBytes": len(payload),
               "network": "owned_bridge", "hostPort": "127.0.0.1:ephemeral",
               "rawLogsPersisted": False, "cases": []}
    try:
        image = docker("image", "inspect", IMAGE, "--format",
                       "{{.Id}} {{.Architecture}} {{.Os}}").decode().strip()
        if image != IMAGE + " arm64 linux":
            raise RuntimeError("IMAGE_PLATFORM_CHANGED")
        with tempfile.TemporaryDirectory(prefix=OWNER + "-") as temporary:
            fixture = Path(temporary)
            (fixture / "Caddyfile").write_text(caddyfile())
            site = fixture / "site"
            site.mkdir()
            (site / "synthetic.zip").write_bytes(payload)
            docker("network", "create", "--label=vega.probe.owner=" + OWNER,
                   network)
            docker("run", "--detach", "--pull=never", "--platform=linux/arm64",
                   "--name", name, "--label=vega.probe.owner=" + OWNER,
                   "--network", network, "--read-only",
                   "--tmpfs=/tmp:rw,nosuid,size=16m",
                   "--tmpfs=/data:rw,nosuid,size=16m",
                   "--tmpfs=/config:rw,nosuid,size=16m",
                   "--env=XDG_DATA_HOME=/data", "--env=XDG_CONFIG_HOME=/config",
                   "--publish=127.0.0.1::8080",
                   "--mount=type=bind,src=" + str(fixture / "Caddyfile") +
                   ",dst=/etc/caddy/Caddyfile,readonly",
                   "--mount=type=bind,src=" + str(site) + ",dst=/srv,readonly",
                   "--entrypoint=caddy", IMAGE,
                   "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile")
            port_text = docker("port", name, "8080/tcp").decode("ascii").strip()
            if not re.fullmatch(r"127\.0\.0\.1:[0-9]+", port_text):
                raise RuntimeError("PORT_NOT_LOOPBACK")
            port = int(port_text.rsplit(":", 1)[1])
            for index, route in enumerate(paths):
                deadline = time.monotonic() + 8
                while True:
                    try:
                        status, body = request(port, route)
                        break
                    except OSError:
                        if time.monotonic() >= deadline:
                            raise RuntimeError("LOCAL_START_TIMEOUT")
                        time.sleep(0.1)
                body_digest = hashlib.sha256(body).hexdigest()
                if status != 200 or body_digest != digest:
                    raise RuntimeError("ZIP_RESPONSE_CHANGED")
                receipt["cases"].append({"case": index, "status": status,
                                         "zipDigestMatches": True, "zipBytes": len(body)})
            time.sleep(0.4)
            docker("stop", name)
            raw = docker("logs", name)
            records = access_records(raw)
            if len(records) != len(paths):
                raise RuntimeError("UPSTREAM_RECORD_COUNT")
            for index, (route, record) in enumerate(zip(paths, records)):
                if record["request"].get("uri") != route:
                    raise RuntimeError("UPSTREAM_QUERY_CHANGED")
                receipt["cases"][index]["upstreamQueryExact"] = True
            receipt["upstreamRecordCount"] = len(records)
            receipt["syntheticLogSHA256"] = hashlib.sha256(raw).hexdigest()
            receipt["status"] = "LOCAL_ZIP_UPSTREAM_PASS"
    except Exception as error:
        message = str(error)
        allowed = {"DOCKER_OUTPUT_LIMIT", "IMAGE_PLATFORM_CHANGED", "PORT_NOT_LOOPBACK",
                   "LOCAL_START_TIMEOUT", "ZIP_RESPONSE_CHANGED", "UPSTREAM_RECORD_COUNT",
                   "UPSTREAM_QUERY_CHANGED"}
        receipt["failureClass"] = message if message in allowed or message.startswith("DOCKER_") else "UNRESOLVED"
    finally:
        container = subprocess.run(["docker", "rm", "--force", name],
                                   capture_output=True, check=False)
        net = subprocess.run(["docker", "network", "rm", network],
                             capture_output=True, check=False)
        receipt["cleanup"] = {"containerExit": container.returncode,
                              "networkExit": net.returncode}
    with (ROOT / "zip-upstream-receipt.json").open("x", encoding="utf-8") as stream:
        json.dump(receipt, stream, indent=2, sort_keys=True)
        stream.write("\n")
    print(receipt["status"])
    return 0 if receipt["status"] == "LOCAL_ZIP_UPSTREAM_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
