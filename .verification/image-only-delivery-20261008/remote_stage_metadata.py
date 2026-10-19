"""Second bounded read before image-only delivery; no mutation or private output.

Run only after separate review. The first preflight remains sealed and unchanged.
"""

import json
import os
import re
import subprocess


CONTAINERS = {
    "vega-pb": ("/pb/pocketbase", "vegacms:c04f0aaf14651415a368605546b8a205a2c063a7",
                "sha256:e1eb49a883852c13d4c46cb326e56d146c116327883d970aadea769364ec4c0d"),
    "lumbre-admin-pb": ("/pb/lumbre-admin", "lumbre-admin-pb:64830ad-vega-c04f0aa",
                        "sha256:47f4c28349e923b164ea6db717988be26ec645b73c2e3901d5b8db239244b533"),
    "fodaveg": ("/pb/fodaveg-pb", "fodaveg:2be1119b15c0516d16f89316d6c356e49ec93ef1",
                "sha256:5f5fb452e12c131e273a2b0be6c85f981a9f73cfa2902b2fa0a7a8c5143252be"),
}
BACKUP_IMAGE = "alpine:3.23@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40"
INSPECT = ('{"id":{{json .Image}},"status":{{json .State.Status}},'
           '"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},'
           '"ports":{{json .NetworkSettings.Ports}}}')


def run(argv):
    try:
        result = subprocess.run(argv, capture_output=True, timeout=15, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("Unavailable") from None
    if result.returncode or len(result.stdout) > 65536 or len(result.stderr) > 65536:
        raise RuntimeError("Unavailable")
    return result.stdout


def version(container, binary):
    """Discard full CLI output in RAM and return only one strict PocketBase semver."""
    output = run(["docker", "exec", container, binary, "--version"])
    values = set(re.findall(rb"(?<![0-9A-Za-z])v?(0\.[0-9]{1,3}\.[0-9]{1,3})(?![0-9A-Za-z])", output))
    if len(values) != 1:
        raise RuntimeError("VersionUnknown")
    return next(iter(values)).decode("ascii")


def container_metadata(name, binary, old_ref, old_id):
    raw = json.loads(run(["docker", "inspect", "--format", INSPECT, name]))
    resolved = json.loads(run(["docker", "image", "inspect", "--format", "{{json .Id}}", old_ref]))
    ports = raw.get("ports")
    expected_ports = {"vega-pb": {"8090/tcp"}, "lumbre-admin-pb": {"8090/tcp"},
                      "fodaveg": {"8090/tcp", "4321/tcp"}}[name]
    ports_known = isinstance(ports, dict) and set(ports) == expected_ports and all(
        value is None for value in ports.values())
    health = raw.get("health")
    result = {"oldIdStillRunning": raw.get("id") == old_id,
              "oldTagStillResolves": resolved == old_id,
              "stateRunning": raw.get("status") == "running",
              "health": health if health in ("healthy", "starting", "unhealthy") else None,
              "noPublishedPorts": ports_known,
              "portKeys": sorted(ports) if ports_known else [],
              "pocketBaseVersion": version(name, binary)}
    result["status"] = "READY_FOR_REVIEW" if all((result["oldIdStillRunning"], result["oldTagStillResolves"],
                                                    result["stateRunning"], result["health"] == "healthy",
                                                    result["noPublishedPorts"])) else "STOP"
    return result


def main():
    output = {"schemaVersion": 1, "mode": "image-only-second-metadata", "remoteWrites": False,
              "configEnvRead": False, "caddyRead": False, "filesRead": [], "containers": {}}
    try:
        stat = os.statvfs("/srv")
        output["freeKiB"] = stat.f_bavail * stat.f_frsize // 1024
    except OSError:
        output["freeKiB"] = None
    try:
        backup_id = json.loads(run(["docker", "image", "inspect", "--format", "{{json .Id}}", BACKUP_IMAGE]))
        output["backupUtilityCached"] = isinstance(backup_id, str) and re.fullmatch(
            r"sha256:[0-9a-f]{64}", backup_id) is not None
    except Exception:
        output["backupUtilityCached"] = False
    for name, (binary, old_ref, old_id) in CONTAINERS.items():
        try:
            output["containers"][name] = container_metadata(name, binary, old_ref, old_id)
        except Exception:
            output["containers"][name] = {"status": "STOP", "errorCode": "MetadataUnavailable"}
    output["status"] = "READY_FOR_REVIEW" if (output["freeKiB"] is not None and
        output["backupUtilityCached"] and all(item["status"] == "READY_FOR_REVIEW"
                                             for item in output["containers"].values())) else "STOP"
    print(json.dumps(output, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
