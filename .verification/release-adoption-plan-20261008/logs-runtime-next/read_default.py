"""Prepare one selective Caddy default logger read; no SSH entry point.

The release owner's separately granted, reviewed one-shot wrapper must inject
the frozen bounded_capture and project_default modules. Importing this file
performs no I/O. read_default is the entire proposed remote operation.
"""

import http.client
import io
import json

from bounded_capture import capture_process
from project_default import project_default


EDGE_ID = "ae97fc0c57fbe4c3a97f5dce15dfc9da92f33f527b60d95c3f74de9d2a160a7a"
EDGE_IMAGE = "sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648"
ENDPOINT = "/config/logging/logs/default/"
IDENTITY = '{"id":{{json .Id}},"imageId":{{json .Image}}}'


class MemorySocket:
    def __init__(self, value):
        self.value = value

    def makefile(self, *args, **kwargs):
        return io.BytesIO(self.value)


def pin():
    """Inspect two public identity fields only, before and after the request."""
    result = capture_process(["docker", "inspect", "--format", IDENTITY, "edge-caddy"],
                             timeout=12, limit=1024)
    if result.returncode or json.loads(result.stdout) != {"id": EDGE_ID, "imageId": EDGE_IMAGE}:
        raise ValueError("IDENTITY_DRIFT")


def read_default():
    """No broad GET, fallback, retry, content logs, Env, config file or writes."""
    result = {"status": "STOP_UNRESOLVED", "endpoint": ENDPOINT,
              "requestAttempts": 0, "remoteWrites": False, "rawConfigPersisted": False,
              "logsRead": False, "configEnvRead": False, "taskClosureProved": False,
              "defaultLogger": None}
    try:
        pin()
        request = ("GET " + ENDPOINT + " HTTP/1.1\r\nHost: localhost:2019\r\n"
                   "Connection: close\r\nAccept: application/json\r\n\r\n").encode()
        result["requestAttempts"] = 1
        transport = capture_process(["docker", "exec", "-i", EDGE_ID, "nc", "-w", "12",
                                     "127.0.0.1", "2019"], input=request, timeout=15, limit=96 * 1024)
        if transport.returncode:
            raise ValueError("TRANSPORT_UNRESOLVED")
        response = http.client.HTTPResponse(MemorySocket(transport.stdout))
        response.begin()
        if response.status != 200:
            # Error bodies and redirect destinations are never decoded or emitted.
            result["status"] = "DEFAULT_ABSENT_EFFECTIVE_UNRESOLVED" if response.status == 404 else \
                "HTTP_UNRESOLVED_NO_FALLBACK"
        elif response.getheader("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
            raise ValueError("MIME_UNRESOLVED")
        else:
            body = response.read(64 * 1024 + 1)
            if len(body) > 64 * 1024:
                raise ValueError("BODY_UNRESOLVED")
            logger = json.loads(body)
            result["defaultLogger"] = project_default(logger)
            del logger, body
            result["status"] = "DEFAULT_CONFIG_TYPES_AND_TOKEN_RULES_PROJECTED"
        response.close()
        del transport
        pin()
    except Exception:
        result["status"] = "STOP_UNRESOLVED"
        result["defaultLogger"] = None
    return result
