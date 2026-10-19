"""Stream Go build information and volume sizes from the two custom PB containers.

The prior `--version` probe is not repeated. Binary tar bytes and volume paths
remain in RAM; only exact public module versions, hashes and counts are emitted.
"""

import hashlib
import json
import os
import re
import subprocess
import tarfile
import threading


CUSTOM = {
    "lumbre-admin-pb": ("/pb/lumbre-admin", "lumbre_admin_pb_data", "0.39.9"),
    "fodaveg": ("/pb/fodaveg-pb", "fodaveg_fodaveg_pb", "0.39.7"),
}
ALL_VOLUMES = ("vega_data", "lumbre_admin_pb_data", "fodaveg_fodaveg_pb")
MODULE_RE = re.compile(rb"dep\tgithub\.com/pocketbase/pocketbase\tv(0\.[0-9]{1,3}\.[0-9]{1,3})(?:\t|\n)")
MAX_BINARY_BYTES = 200 * 1024 * 1024


def run(argv, timeout=60):
    try:
        result = subprocess.run(argv, capture_output=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("Unavailable") from None
    if result.returncode or len(result.stdout) > 4096 or len(result.stderr) > 4096:
        raise RuntimeError("Unavailable")
    return result.stdout


def buildinfo_stream(container, binary, deadline_seconds=90):
    """Docker copy writes only a tar stream to this process; never to server disk."""
    try:
        proc = subprocess.Popen(["docker", "cp", container + ":" + binary, "-"],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    except OSError:
        raise RuntimeError("BinaryUnavailable") from None
    sha = hashlib.sha256()
    count, versions, tail, found = 0, set(), b"", False
    expired = threading.Event()

    def abort_stalled_copy():
        expired.set()
        try:
            proc.kill()
        except OSError:
            pass

    timer = threading.Timer(deadline_seconds, abort_stalled_copy)
    timer.daemon = True
    timer.start()
    try:
        with tarfile.open(fileobj=proc.stdout, mode="r|") as archive:
            for member in archive:
                if (found or not member.isfile() or member.size <= 0 or
                        member.size > MAX_BINARY_BYTES or member.name.rsplit("/", 1)[-1] != binary.rsplit("/", 1)[-1]):
                    raise RuntimeError("TarShapeUnknown")
                stream = archive.extractfile(member)
                if stream is None:
                    raise RuntimeError("BinaryUnavailable")
                found = True
                for chunk in iter(lambda: stream.read(65536), b""):
                    count += len(chunk)
                    if count > MAX_BINARY_BYTES:
                        raise RuntimeError("BinaryTooLarge")
                    sha.update(chunk)
                    window = tail + chunk
                    versions.update(match.decode("ascii") for match in MODULE_RE.findall(window))
                    tail = window[-256:]
        if expired.is_set() or proc.wait(timeout=20) != 0 or not found or len(versions) != 1:
            raise RuntimeError("BuildInfoUnknown")
        return {"moduleVersion": next(iter(versions)), "binarySha256": sha.hexdigest(),
                "binaryBytes": count}
    except Exception:
        proc.kill()
        proc.wait()
        raise
    finally:
        timer.cancel()
        if proc.stdout:
            proc.stdout.close()


def volume_kib(volume):
    """Return numeric usage only; the Docker volume mountpoint is discarded."""
    raw = run(["docker", "volume", "inspect", "--format", "{{json .Mountpoint}}", volume])
    path = json.loads(raw)
    if not isinstance(path, str) or not path.startswith("/var/lib/docker/volumes/"):
        raise RuntimeError("VolumeUnknown")
    try:
        result = subprocess.run(["du", "-sk", path], capture_output=True, timeout=90, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("VolumeUnknown") from None
    if result.returncode or len(result.stdout) > 4096:
        raise RuntimeError("VolumeUnknown")
    first = result.stdout.split(None, 1)[0]
    if re.fullmatch(rb"[0-9]{1,14}", first) is None:
        raise RuntimeError("VolumeUnknown")
    return int(first)


def main():
    output = {"schemaVersion": 1, "mode": "custom-pb-buildinfo-and-volume-size",
              "remoteWrites": False, "configEnvRead": False, "caddyRead": False,
              "binaryRawPersisted": False, "versions": {}, "volumesKiB": {}}
    for name, (binary, _, expected) in CUSTOM.items():
        try:
            result = buildinfo_stream(name, binary)
            result["matchesSourcePin"] = result["moduleVersion"] == expected
            output["versions"][name] = result
        except Exception:
            output["versions"][name] = {"errorCode": "BuildInfoUnavailable"}
    for volume in ALL_VOLUMES:
        try:
            output["volumesKiB"][volume] = volume_kib(volume)
        except Exception:
            output["volumesKiB"][volume] = None
    try:
        stat = os.statvfs("/srv")
        output["freeKiB"] = stat.f_bavail * stat.f_frsize // 1024
    except OSError:
        output["freeKiB"] = None
    sizes = output["volumesKiB"].values()
    output["status"] = "READY_FOR_REVIEW" if (
        all(value.get("matchesSourcePin") is True for value in output["versions"].values()) and
        all(isinstance(size, int) and size >= 0 for size in sizes) and
        isinstance(output["freeKiB"], int)
    ) else "STOP"
    print(json.dumps(output, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
