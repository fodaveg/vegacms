"""Isolated stream, timeout and schema probes; no SSH or Docker."""

import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import time
from unittest.mock import patch


HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + ".py"))
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


remote = load("remote_runtime_diagnostic")
wrapper = load("run_runtime_diagnostic")
passed = 0


def check(value, reason="probe failed"):
    global passed
    assert value, reason
    passed += 1


def archive_bytes(body, name="fodaveg-pb"):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w") as archive:
        info = tarfile.TarInfo(name)
        info.size = len(body)
        archive.addfile(info, io.BytesIO(body))
    return output.getvalue()


class FakeProcess:
    def __init__(self, data):
        self.stdout = io.BytesIO(data)

    def wait(self, timeout=None):
        return 0

    def kill(self):
        pass


body = b"binary\0dep\tgithub.com/pocketbase/pocketbase\tv0.39.7\th1:public\n"
with patch.object(remote.subprocess, "Popen", return_value=FakeProcess(archive_bytes(body))):
    result = remote.buildinfo_stream("fodaveg", "/pb/fodaveg-pb")
    check(result["moduleVersion"] == "0.39.7" and result["binaryBytes"] == len(body))
with patch.object(remote.subprocess, "Popen", return_value=FakeProcess(archive_bytes(b"no module"))):
    try:
        remote.buildinfo_stream("fodaveg", "/pb/fodaveg-pb")
    except RuntimeError:
        passed += 1
    else:
        raise AssertionError("missing module accepted")
with patch.object(remote.subprocess, "Popen", return_value=FakeProcess(archive_bytes(body, "other-binary"))):
    try:
        remote.buildinfo_stream("fodaveg", "/pb/fodaveg-pb")
    except RuntimeError:
        passed += 1
    else:
        raise AssertionError("wrong binary tar member accepted")

real_popen = subprocess.Popen
started = time.monotonic()
with patch.object(remote.subprocess, "Popen", side_effect=lambda *a, **kw:
                  real_popen([sys.executable, "-c", "import time; time.sleep(10)"],
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)):
    try:
        remote.buildinfo_stream("fodaveg", "/pb/fodaveg-pb", deadline_seconds=0.2)
    except Exception:
        passed += 1
    else:
        raise AssertionError("stalled stream accepted")
check(time.monotonic() - started < 2, "stalled stream was not killed by deadline")

valid = {"schemaVersion": 1, "mode": "custom-pb-buildinfo-and-volume-size",
         "remoteWrites": False, "configEnvRead": False, "caddyRead": False,
         "binaryRawPersisted": False,
         "versions": {name: {"errorCode": "BuildInfoUnavailable"} for name in remote.CUSTOM},
         "volumesKiB": {name: None for name in remote.ALL_VOLUMES},
         "freeKiB": None, "status": "STOP"}
check(wrapper.valid(valid))
check(not wrapper.valid({**valid, "rawBinary": "private"}))

print(f"PASS {passed} runtime diagnostic probes; zero remote operations")
