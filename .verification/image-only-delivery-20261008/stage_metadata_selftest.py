"""Isolated probes for the second read-only stage; no SSH or Docker."""

import importlib.util
import json
from pathlib import Path
from unittest.mock import patch


HERE = Path(__file__).resolve().parent


def module(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + ".py"))
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


remote = module("remote_stage_metadata")
wrapper = module("run_stage_metadata")
passed = 0


def check(value):
    global passed
    assert value
    passed += 1


with patch.object(remote, "run", return_value=b"PocketBase v0.39.9\n"):
    check(remote.version("vega-pb", "/pb/pocketbase") == "0.39.9")
with patch.object(remote, "run", return_value=b"PocketBase v0.39.9\nSECRET=private\n"):
    check(remote.version("vega-pb", "/pb/pocketbase") == "0.39.9")
with patch.object(remote, "run", return_value=b"password-only\n"):
    try:
        remote.version("vega-pb", "/pb/pocketbase")
    except RuntimeError:
        passed += 1
    else:
        raise AssertionError("missing semver accepted")
check("Config.Env" not in remote.INSPECT and "Caddy" not in remote.INSPECT)
check("--version" in Path(remote.__file__).read_text() and "docker top" not in Path(remote.__file__).read_text())

def fake_inspect(ports):
    return {"id": remote.CONTAINERS["fodaveg"][2], "status": "running", "health": "healthy",
            "ports": ports}

with patch.object(remote, "run", side_effect=[json.dumps(fake_inspect({"8090/tcp": None})).encode(),
                                             json.dumps(remote.CONTAINERS["fodaveg"][2]).encode(),
                                             b"PocketBase v0.39.7\n"]):
    check(remote.container_metadata("fodaveg", *remote.CONTAINERS["fodaveg"])["status"] == "STOP")
with patch.object(remote, "run", side_effect=[json.dumps(fake_inspect({"8090/tcp": None,
                                                                        "4321/tcp": None})).encode(),
                                             json.dumps(remote.CONTAINERS["fodaveg"][2]).encode(),
                                             b"PocketBase v0.39.7\n"]):
    check(remote.container_metadata("fodaveg", *remote.CONTAINERS["fodaveg"])["status"] == "READY_FOR_REVIEW")

valid = {"schemaVersion": 1, "mode": "image-only-second-metadata", "remoteWrites": False,
         "configEnvRead": False, "caddyRead": False, "filesRead": [],
         "containers": {name: {"status": "STOP", "errorCode": "MetadataUnavailable"}
                        for name in remote.CONTAINERS},
         "freeKiB": 1000000, "backupUtilityCached": False, "status": "STOP"}
check(wrapper.valid(valid))
check(not wrapper.valid({**valid, "Config.Env": "private"}))
check(not wrapper.valid({**valid, "filesRead": ["/root/.env"]}))

with patch.object(remote, "run", side_effect=RuntimeError("secret-bearing exception")):
    with patch.object(remote.os, "statvfs", side_effect=OSError):
        # main writes a sanitized JSON only; collect in memory.
        import io
        import contextlib
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            remote.main()
        projection = json.loads(buffer.getvalue())
        check(projection["status"] == "STOP" and "secret-bearing" not in buffer.getvalue())

print(f"PASS {passed} isolated second-stage probes; zero remote operations")
