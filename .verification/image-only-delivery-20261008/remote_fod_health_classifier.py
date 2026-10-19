"""Read the existing healthcheck Test/Outputs into RAM; emit fixed booleans only."""
import json
import re
import subprocess

NEW_ID = "sha256:0e0ef56341d677366cfc00d91e2ead83da0ebcc4372f7ba627f575be682ee51f"
TEMPLATE = ('{"id":{{json .Image}},"running":{{json .State.Running}},'
 '"test":{{with index .Config "Healthcheck"}}{{json .Test}}{{else}}null{{end}},'
 '"health":{{with index .State "Health"}}{{json .Status}}{{else}}null{{end}},'
 '"logs":[{{with index .State "Health"}}{{range $i,$l := .Log}}{{if $i}},{{end}}'
 '{"code":{{json $l.ExitCode}},"output":{{json $l.Output}}}{{end}}{{end}}]}')
PATTERNS = {
    "connectionRefused": r"connection refused|failed to connect|couldn't connect",
    "ipv6LoopbackMention": r"\[?::1\]?",
    "ipv4LoopbackMention": r"127\.0\.0\.1",
    "localhostMention": r"localhost",
    "nameResolutionFailure": r"unable to resolve|bad address|could not resolve|name or service not known|temporary failure in name resolution",
    "networkUnreachable": r"network is unreachable|no route to host",
    "timeout": r"timed out|timeout",
    "httpClientError": r"(?:HTTP/\d(?:\.\d)?\s+|ERROR\s+|status[ :=]+)4\d\d|404 not found|403 forbidden|401 unauthorized",
    "httpServerError": r"(?:HTTP/\d(?:\.\d)?\s+|ERROR\s+|status[ :=]+)5\d\d|502 bad gateway|503 service unavailable|500 internal server error",
    "commandMissing": r"not found|no such file or directory",
    "permissionDenied": r"permission denied",
    "pbMention": r"pocketbase|fodaveg-pb|8090|/api/health",
    "astroMention": r"astro|node|4321",
    "nodeImportFailure": r"err_module_not_found|cannot find module|cannot find package|syntaxerror",
    "bindFailure": r"eaddrinuse|address already in use|cannot assign requested address",
}


def classify(raw):
    if not isinstance(raw, dict) or raw.get("id") != NEW_ID:
        raise RuntimeError("ImageIdentityDrift")
    test, logs = raw.get("test"), raw.get("logs")
    if test is not None and (not isinstance(test, list) or not all(isinstance(x, str) for x in test)):
        raise RuntimeError("HealthShapeUnknown")
    if not isinstance(logs, list) or len(logs) > 5:
        raise RuntimeError("HealthShapeUnknown")
    joined = " ".join(test or [])
    if len(joined) > 65536:
        raise RuntimeError("HealthShapeUnknown")
    urls = re.findall(r"https?://[^\s'\";)&]+", joined)
    output = {"schemaVersion": 1, "service": "fodaveg", "mode": "health-classifier",
              "status": "CLASSIFIED", "remoteWrites": False, "dockerLogsRead": False,
              "healthOutputRead": True, "imageMatches": True, "running": raw.get("running") is True,
              "health": raw.get("health") if raw.get("health") in {"healthy", "unhealthy", "starting"} else "none",
              "testPresent": test is not None, "testCmdShell": bool(test) and test[0] == "CMD-SHELL",
              "testCmd": bool(test) and test[0] == "CMD", "testDisabled": bool(test) and test[0] == "NONE",
              "testUsesWget": bool(re.search(r"\bwget\b", joined)),
              "testUsesCurl": bool(re.search(r"\bcurl\b", joined)),
              "urlCount": len(urls), "urlLocalhost": any(re.search(r"https?://localhost(?::|/|$)", u) for u in urls),
              "urlIPv4Loopback": any(re.search(r"https?://127\.0\.0\.1(?::|/|$)", u) for u in urls),
              "urlIPv6Loopback": any(re.search(r"https?://\[::1\](?::|/|$)", u) for u in urls),
              "urlPB8090": any(re.search(r":8090(?:/|$)", u) for u in urls),
              "urlAstro4321": any(re.search(r":4321(?:/|$)", u) for u in urls),
              "urlApiHealth": any("/api/health" in u for u in urls),
              "healthLogCount": len(logs), "healthOutputBytes": 0, "emptyOutputCount": 0,
              "exitCodes": [], "signals": {key: False for key in PATTERNS}, "lastSignals": {key: False for key in PATTERNS}}
    for index, item in enumerate(logs):
        if not isinstance(item, dict) or type(item.get("code")) is not int or not -1 <= item["code"] <= 255 or \
                not isinstance(item.get("output"), str) or len(item["output"].encode()) > 65536:
            raise RuntimeError("HealthShapeUnknown")
        text = item["output"]
        output["healthOutputBytes"] += len(text.encode())
        output["emptyOutputCount"] += int(not text.strip())
        output["exitCodes"].append(item["code"])
        for key, pattern in PATTERNS.items():
            found = re.search(pattern, text, re.I) is not None
            output["signals"][key] |= found
            if index == len(logs) - 1:
                output["lastSignals"][key] = found
    return output


def main():
    try:
        result = subprocess.run(["docker", "inspect", "--format", TEMPLATE, "fodaveg"],
                                capture_output=True, timeout=30, check=False)
        if result.returncode or len(result.stdout) > 1048576 or len(result.stderr) > 1048576:
            raise RuntimeError("CommandRejected")
        return classify(json.loads(result.stdout))
    except Exception as error:
        code = str(error) if isinstance(error, RuntimeError) and str(error) in \
            {"ImageIdentityDrift", "HealthShapeUnknown", "CommandRejected"} else \
            "CommandTimeout" if isinstance(error, subprocess.TimeoutExpired) else "ProjectionUnavailable"
        return {"schemaVersion": 1, "service": "fodaveg", "mode": "health-classifier", "status": "STOP",
                "remoteWrites": False, "dockerLogsRead": False, "healthOutputRead": True, "errorCode": code}


if __name__ == "__main__":
    print(json.dumps(main(), sort_keys=True, separators=(",", ":")))
