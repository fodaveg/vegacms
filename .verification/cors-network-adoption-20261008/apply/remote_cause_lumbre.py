"""Classify only the stopped, owned Lumbre cutover before any recovery."""

import json
import sys

import image_helpers as h
import cors_apply as c
import cors_diag as d

RUNTIME_FAILURES = {
    "RuntimeTopologyDrift", "RuntimeMountDrift", "RuntimeCommandDrift",
    "RuntimePeerDrift", "ContainerIdentityDrift", "OtherVolumeWriter",
    "RuntimeShapeUnknown", "ContainerIdUnknown", "CommandUnavailable",
}


def file_snapshot():
    """Keep private bytes in RAM and compare full identities across probes."""
    spec = c.SPECS[d.NAME]
    backup = c.ROOT / d.BACKUP_ID
    return tuple((body, c.identity(info)) for body, info in (
        c.read_file(backup / "state.json"), c.read_file(spec["compose"]),
        c.read_file(spec["env"])))


def projected():
    first = d.projected()
    if first["status"] != "PROJECTED":
        raise RuntimeError("DiagnosticUnavailable")
    phase = first["phase"]
    eligible = (phase == "INSTALLED" and first["selection"] == "OLD" and
                first["running"] is False and first["recordNewId"] is None and
                first["composeClass"] == "TARGET" and first["composeOwned"] and
                first["envMatches"] and first["snapshotStable"] and
                first["imageMatches"] and first["labelsMatch"] and
                first["mountsMatch"] and first["networkClass"] == "ONE_EDGE" and
                first["aliasesMatch"] and first["exposed8090Only"] and
                first["hostBindingsNone"] and first["volumeUsers"] == "NONE")
    if not eligible:
        return {"status": "WINDOW_CLOSED", "phase": phase, "runtimeClass": "NOT_RUN",
                "composeQuietClass": "NOT_RUN", "baselineComparable": False,
                "snapshotStable": first["snapshotStable"], "remoteWrites": False,
                "privateValuesExported": False}
    before = file_snapshot()
    spec = c.SPECS[d.NAME]
    try:
        c.runtime(d.NAME, spec, False, expected_id=first["recordNewId"] or
                  spec["containerId"], require_healthy=False, volume_users=[])
        runtime_class = "PASS_WITHOUT_BASELINE"
    except Exception as failure:
        runtime_class = str(failure) if str(failure) in RUNTIME_FAILURES else "OTHER_FAILURE"
    try:
        c.compose_quiet(spec, spec["compose"])
        compose_class = "PASS"
    except Exception:
        compose_class = "FAIL"
    second = d.projected()
    stable = second == first and file_snapshot() == before
    if not stable:
        raise RuntimeError("SnapshotChanged")
    return {"status": "PROJECTED", "phase": phase, "runtimeClass": runtime_class,
            "composeQuietClass": compose_class, "baselineComparable": False,
            "snapshotStable": stable, "remoteWrites": False,
            "privateValuesExported": False}


def main():
    try:
        if len(sys.argv) != 1:
            raise RuntimeError("ArgsUnknown")
        result = projected()
    except Exception:
        result = {"status": "STOP_READ_UNAVAILABLE", "phase": "UNKNOWN",
                  "runtimeClass": "NOT_RUN", "composeQuietClass": "NOT_RUN",
                  "baselineComparable": False, "snapshotStable": False,
                  "remoteWrites": False, "privateValuesExported": False}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] in ("PROJECTED", "WINDOW_CLOSED") else 2


if __name__ == "__main__":
    sys.exit(main())
