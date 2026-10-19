"""Proposed fixed-Caddy binary metadata read; no execution on import.

Only version, three known module booleans and Config.Tty are projected. Full
module stdout, which may contain custom identities, stays in remote RAM.
"""
import json
import re

from bounded_capture import capture_process

EDGE_ID = "ae97fc0c57fbe4c3a97f5dce15dfc9da92f33f527b60d95c3f74de9d2a160a7a"
EDGE_IMAGE = "sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648"
IDENTITY_TTY = '{"id":{{json .Id}},"imageId":{{json .Image}},"tty":{{json .Config.Tty}}}'
VERSION = re.compile(rb"v([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})(?: h1:[A-Za-z0-9+/]{43}=)?\r?\n?\Z")
MODULES = {"filterAvailable": b"caddy.logging.encoders.filter",
           "jsonAvailable": b"caddy.logging.encoders.json",
           "stderrAvailable": b"caddy.logging.writers.stderr"}


def read_binary_metadata():
    """Exactly four bounded Docker commands; no GET, Env, logs or fallback."""
    value = {"status": "STOP_BINARY_METADATA_UNRESOLVED", "version": None,
             "tty": None, "modules": None, "identitiesPreserved": False,
             "remoteWrites": False, "configEnvRead": False, "logsRead": False,
             "effectiveTokenSafetyProved": False, "namedLoggerCoverageProved": False,
             "customProducerMessageSafetyProved": False}
    try:
        before = capture_process(["docker", "inspect", "--format", IDENTITY_TTY, "edge-caddy"],
                                 timeout=12, limit=1024)
        selected = json.loads(before.stdout)
        if before.returncode or not isinstance(selected, dict) or set(selected) != {"id", "imageId", "tty"} or \
                selected["id"] != EDGE_ID or selected["imageId"] != EDGE_IMAGE or type(selected["tty"]) is not bool:
            raise ValueError("IDENTITY_UNKNOWN")
        version = capture_process(["docker", "exec", EDGE_ID, "caddy", "version"], timeout=12, limit=1024)
        match = VERSION.fullmatch(version.stdout)
        if version.returncode or match is None:
            raise ValueError("VERSION_UNKNOWN")
        semver = match.group(1).decode("ascii")
        del version, match
        modules = capture_process(["docker", "exec", EDGE_ID, "caddy", "list-modules"],
                                  timeout=12, limit=65536)
        if modules.returncode:
            raise ValueError("MODULES_UNKNOWN")
        lines = modules.stdout.splitlines()
        projected_modules = {key: literal in lines for key, literal in MODULES.items()}
        del modules, lines
        after = capture_process(["docker", "inspect", "--format", IDENTITY_TTY, "edge-caddy"],
                                timeout=12, limit=1024)
        final = json.loads(after.stdout)
        if (after.returncode or not isinstance(final, dict) or
                set(final) != {"id", "imageId", "tty"} or
                type(final["tty"]) is not bool or final != selected):
            raise ValueError("IDENTITY_CHANGED")
        value.update(status="CADDY_BINARY_METADATA_PROJECTED", version=semver,
                     tty=selected["tty"], modules=projected_modules, identitiesPreserved=True)
    except Exception:
        pass
    return value
