"""Pinned read-only diagnostic. No logs, restart, mounts or configuration values."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

SERVICE = "fodaveg"
NEW_ID = "sha256:0e0ef56341d677366cfc00d91e2ead83da0ebcc4372f7ba627f575be682ee51f"
OLD_ID = "sha256:5f5fb452e12c131e273a2b0be6c85f981a9f73cfa2902b2fa0a7a8c5143252be"
NEW_TAG = "fodaveg:f92bac858e904817ffc4cf6bf6307a6de0190c32"
OLD_TAG = "fodaveg:2be1119b15c0516d16f89316d6c356e49ec93ef1"
VOLUME = "fodaveg_fodaveg_pb"
BACKUP = Path("/srv/vega-image-rollout/fodaveg-20261008T200548Z-3247510")
COMPOSE_SHA = "a18777c55d583c8eab43671d968108c9560f8a41152440e04ba610e583a9b500"
OLD_ENV_SHA = "1bf6ed5f10fb8e47ef76591f89724fd1a53f35504e876a951f15c4f296a140cf"
NEW_ENV_SHA = "6c6730312e9e32942398294d840a7b78f6040f5e9f43d893b238f7dfe9d4676c"
ENTRYPOINT = ["/usr/bin/tini", "-g", "--", "./docker-entrypoint.sh"]
PB_ARGV = ["/pb/fodaveg-pb", "--dir", "/pb/pb_data", "serve", "--http=0.0.0.0:8090"]
MOUNT = ("volume", VOLUME, "/pb/pb_data", True,
         "5758553f1921872ef0782119baaefb0716fa527c4fa42e7b01a5757d6da6f26a")
TEMPLATE = ('{"imageId":{{json .Image}},"imageRef":{{json .Config.Image}},'
 '"entrypoint":{{json .Config.Entrypoint}},"cmd":{{json .Config.Cmd}},'
 '"running":{{json .State.Running}},"state":{{json .State.Status}},'
 '"healthcheckPresent":{{if index .Config "Healthcheck"}}true{{else}}false{{end}},'
 '"startedAt":{{json .State.StartedAt}},"finishedAt":{{json .State.FinishedAt}},'
 '"exitCode":{{json .State.ExitCode}},"oomKilled":{{json .State.OOMKilled}},'
 '"stateErrorPresent":{{if .State.Error}}true{{else}}false{{end}},'
 '"restartCount":{{json .RestartCount}},'
 '"health":{{with index .State "Health"}}{{json .Status}}{{else}}null{{end}},'
 '"failingStreak":{{with index .State "Health"}}{{json .FailingStreak}}{{else}}null{{end}},'
 '"healthExitCodes":[{{with index .State "Health"}}{{range $i,$l := .Log}}'
 '{{if $i}},{{end}}{{json $l.ExitCode}}{{end}}{{end}}],'
 '"ports":{{json .NetworkSettings.Ports}},'
 '"exposedPorts":{{json .Config.ExposedPorts}},'
 '"mounts":[{{range $i,$m := .Mounts}}{{if $i}},{{end}}'
 '{"type":{{json $m.Type}},"name":{{json $m.Name}},"source":{{json $m.Source}},'
 '"dest":{{json $m.Destination}},"rw":{{json $m.RW}}}{{end}}],'
 '"networks":[{{$first := true}}{{range $name,$v := .NetworkSettings.Networks}}'
 '{{if not $first}},{{end}}{"name":{{json $name}},"aliases":{{json $v.Aliases}}}'
 '{{$first = false}}{{end}}]}')
PROC = '''set -eu
for f in /proc/[0-9]*/comm; do
 IFS= read -r comm < "$f" || continue
 case "$comm" in
  fodaveg-pb|node|tini)
   printf '__BEGIN__%s\\n' "$comm"
   base64 "${f%/comm}/cmdline"
   printf '__END__\\n'
   ;;
 esac
done'''


def run(argv):
    try:
        result = subprocess.run(argv, capture_output=True, timeout=30, check=False)
    except subprocess.TimeoutExpired:
        raise RuntimeError("CommandTimeout") from None
    except OSError:
        raise RuntimeError("CommandUnavailable") from None
    if result.returncode != 0:
        raise RuntimeError("CommandNonzero")
    if len(result.stdout) > 1048576 or len(result.stderr) > 1048576:
        raise RuntimeError("CommandOversize")
    return result.stdout


def file_digest(path, limit):
    """Hash existing regular files, bounded; bytes never leave RAM."""
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > limit:
            raise RuntimeError("FileShapeUnknown")
        digest = hashlib.sha256()
        size = 0
        for chunk in iter(lambda: stream.read(65536), b""):
            size += len(chunk)
            if size > limit:
                raise RuntimeError("FileShapeUnknown")
            digest.update(chunk)
        after = os.fstat(stream.fileno())
    if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
        raise RuntimeError("ConcurrentFileChange")
    return digest.hexdigest(), size, stat.S_IMODE(before.st_mode)


def runtime_projection(raw):
    ports, exposed = raw.get("ports"), raw.get("exposedPorts")
    mounts, networks = raw.get("mounts"), raw.get("networks")
    if not isinstance(mounts, list) or not isinstance(networks, list):
        raise RuntimeError("InspectShapeUnknown")
    normalized = [(m.get("type"), m.get("name") or None, m.get("dest"), m.get("rw"),
                   hashlib.sha256(m.get("source", "").encode()).hexdigest()) for m in mounts]
    state, health, identifier = raw.get("state"), raw.get("health"), raw.get("imageId")
    if not isinstance(identifier, str) or re.fullmatch(r"sha256:[0-9a-f]{64}", identifier) is None:
        raise RuntimeError("InspectShapeUnknown")
    result = {
        "observedImageId": identifier,
        "imageIsNew": identifier == NEW_ID, "imageIsOld": identifier == OLD_ID,
        "refIsNew": raw.get("imageRef") == NEW_TAG, "refIsOld": raw.get("imageRef") == OLD_TAG,
        "entrypointMatches": raw.get("entrypoint") == ENTRYPOINT,
        "cmdMatches": raw.get("cmd") is None,
        "cmdShape": "null" if raw.get("cmd") is None else "empty" if raw.get("cmd") == [] else "other",
        "running": raw.get("running") is True,
        "state": state if state in {"created", "running", "paused", "restarting", "removing", "exited", "dead"} else "unknown",
        "exitCode": raw.get("exitCode"), "oomKilled": raw.get("oomKilled") is True,
        "stateErrorPresent": raw.get("stateErrorPresent") is True,
        "restartCount": raw.get("restartCount"),
        "health": health if health in {"healthy", "unhealthy", "starting"} else "none" if health is None else "unknown",
        "nativeHealthAbsent": health is None,
        "containerHealthcheckPresent": raw.get("healthcheckPresent") is True,
        "failingStreak": raw.get("failingStreak"),
        "healthCheckCount": len(raw.get("healthExitCodes", [])),
        "healthLastExitCode": raw["healthExitCodes"][-1] if raw.get("healthExitCodes") else None,
        "mountCount": len(mounts), "mountsMatch": normalized == [MOUNT],
        "networkCount": len(networks),
        "networksMatch": len(networks) == 1 and networks[0].get("name") == "edge" and
            sorted(networks[0].get("aliases") or []) == ["fodaveg", "fodaveg"],
        "portsPresent": isinstance(ports, dict),
        "portCount": len(ports) if isinstance(ports, dict) else 0,
        "port8090Present": isinstance(ports, dict) and "8090/tcp" in ports,
        "port4321Present": isinstance(ports, dict) and "4321/tcp" in ports,
        "portsMatch": isinstance(ports, dict) and set(ports) == {"8090/tcp", "4321/tcp"} and
            all(value is None for value in ports.values()),
        "exposedPortsMatch": isinstance(exposed, dict) and set(exposed) == {"8090/tcp", "4321/tcp"},
    }
    for key in ("startedAt", "finishedAt"):
        value = raw.get(key)
        if isinstance(value, str) and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z", value):
            result[key] = value
        else:
            raise RuntimeError("InspectShapeUnknown")
    for key in ("exitCode", "restartCount", "failingStreak", "healthLastExitCode"):
        value = result[key]
        if value is not None and (type(value) is not int or not -1 <= value <= 1000000):
            raise RuntimeError("InspectShapeUnknown")
    return result


def compose_healthcheck_present():
    descriptor = os.open("/root/fodaveg/compose.yml", os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > 2097152:
            raise RuntimeError("FileShapeUnknown")
        body = stream.read(2097153)
        after = os.fstat(stream.fileno())
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError("ConcurrentFileChange")
    if hashlib.sha256(body).hexdigest() != COMPOSE_SHA or body.count(b"  fodaveg:\n") != 1:
        raise RuntimeError("FileShapeUnknown")
    tail = body.split(b"  fodaveg:\n", 1)[1]
    boundary = re.search(rb"(?m)^(?:  [a-z][a-z0-9_-]*:|[a-z][a-z0-9_-]*:)", tail)
    service = tail[:boundary.start()] if boundary else tail
    return re.search(rb"(?m)^    healthcheck:", service) is not None


def process_projection():
    raw = run(["docker", "exec", SERVICE, "/bin/sh", "-c", PROC]).decode("ascii")
    candidates = {"fodaveg-pb": [], "node": [], "tini": []}
    kind, payload = None, []
    for line in raw.splitlines():
        if line.startswith("__BEGIN__"):
            if kind is not None:
                raise RuntimeError("ProcessShapeUnknown")
            kind = line[9:]
            if kind not in candidates:
                raise RuntimeError("ProcessShapeUnknown")
        elif line == "__END__":
            if kind is None:
                raise RuntimeError("ProcessShapeUnknown")
            body = base64.b64decode("".join(payload), validate=True)
            if not body.endswith(b"\0") or len(body) > 16384:
                raise RuntimeError("ProcessShapeUnknown")
            candidates[kind].append([part.decode("utf-8") for part in body[:-1].split(b"\0")])
            kind, payload = None, []
        elif kind is not None:
            payload.append(line)
        else:
            raise RuntimeError("ProcessShapeUnknown")
    if kind is not None:
        raise RuntimeError("ProcessShapeUnknown")
    return {"processProbe": "read", "pbProcessCount": len(candidates["fodaveg-pb"]),
            "pbArgvMatches": candidates["fodaveg-pb"] == [PB_ARGV],
            "nodeProcessCount": len(candidates["node"]), "tiniProcessCount": len(candidates["tini"])}


def error_code(error):
    allowed = {"CommandTimeout", "CommandUnavailable", "CommandNonzero", "CommandOversize",
               "FileShapeUnknown", "ConcurrentFileChange", "InspectShapeUnknown", "ProcessShapeUnknown"}
    return str(error) if isinstance(error, RuntimeError) and str(error) in allowed else \
        "FileUnavailable" if isinstance(error, OSError) else "ProjectionUnavailable"


def main():
    output = {"schemaVersion": 1, "service": SERVICE, "mode": "fod-failure-readonly",
              "remoteWrites": False, "configEnvRead": False, "logsRead": False,
              "backupDir": str(BACKUP), "errors": {}}
    try:
        raw = json.loads(run(["docker", "inspect", "--format", TEMPLATE, SERVICE]))
        output.update(runtime_projection(raw))
        if output["running"]:
            try:
                output.update(process_projection())
            except Exception as error:
                output["errors"]["processes"] = error_code(error)
        else:
            output["processProbe"] = "skipped-stopped"
    except Exception as error:
        output["errors"]["runtime"] = error_code(error)
    try:
        image = json.loads(run(["docker", "image", "inspect", "--format",
            '{"id":{{json .Id}},"healthcheckPresent":{{if index .Config "Healthcheck"}}true{{else}}false{{end}}}', NEW_TAG]))
        output["newTagMatchesExpectedImage"] = image.get("id") == NEW_ID
        output["newImageHealthcheckAbsent"] = image.get("healthcheckPresent") is False
    except Exception as error:
        output["errors"]["image"] = error_code(error)
    try:
        output["composeHealthcheckPresent"] = compose_healthcheck_present()
    except Exception as error:
        output["errors"]["composeHealthcheck"] = error_code(error)
    try:
        names = run(["docker", "ps", "--filter", "volume=" + VOLUME, "--format", "{{.Names}}"]).decode("utf-8").splitlines()
        output["runningVolumeMountCount"] = len(names)
        output["onlyExpectedRunningVolumeMount"] = names == [SERVICE]
        output["unexpectedRunningVolumeMountPresent"] = any(name != SERVICE for name in names)
    except Exception as error:
        output["errors"]["volume"] = error_code(error)
    for category, path, expected, limit in (
        ("compose", Path("/root/fodaveg/compose.yml"), COMPOSE_SHA, 2097152),
        ("dotenv", Path("/root/fodaveg/.env"), NEW_ENV_SHA, 2097152),
        ("backupCompose", BACKUP / "compose.old", COMPOSE_SHA, 2097152),
        ("backupDotenv", BACKUP / "dotenv.old", OLD_ENV_SHA, 2097152),
        ("snapshot", BACKUP / "data.tgz", None, 100 * 1024 ** 3),
    ):
        try:
            value, size, mode = file_digest(path, limit)
            output[category + "Exists"] = True
            output[category + "Sha256"] = value
            output[category + "Bytes"] = size
            output[category + "PrivateMode"] = mode & 0o077 == 0
            if expected is not None:
                output[category + "Matches"] = value == expected
        except Exception as error:
            output[category + "Exists"] = False
            output["errors"][category] = error_code(error)
    output["status"] = "DIAGNOSED" if not output["errors"] else "PARTIAL"
    return output


if __name__ == "__main__":
    try:
        print(json.dumps(main(), sort_keys=True, separators=(",", ":")))
    except Exception:
        print('{"status":"STOP","service":"fodaveg","remoteWrites":false,"errorCode":"ProjectionUnavailable"}')
