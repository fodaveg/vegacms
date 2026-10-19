"""Validate the exact Lumbre CORS candidate against the recovered live base."""

import json
import subprocess
import sys

import image_helpers as h
import cors_apply as c
import cors_diag as d

RUNTIME_FAILURES = {
    "RuntimeTopologyDrift", "RuntimeMountDrift", "RuntimeCommandDrift",
    "RuntimePeerDrift", "ContainerIdentityDrift", "OtherVolumeWriter",
    "RuntimeShapeUnknown", "ContainerIdUnknown", "CommandUnavailable",
    "PBArgvUnknown",
}


def snapshot():
    """Compare owned file bytes and full identities without exporting them."""
    spec = c.SPECS[d.NAME]
    backup = c.ROOT / d.BACKUP_ID
    return tuple((body, c.identity(info)) for body, info in (
        c.read_file(backup / "state.json"), c.read_file(spec["compose"]),
        c.read_file(spec["env"])))


def config_quiet_from_stdin(spec, candidate):
    """Check Compose's target model from RAM with the original path base."""
    argv = ["docker", "compose", "--project-directory", str(spec["compose"].parent),
            "--env-file", str(spec["env"]), "--file", "-", "config", "--quiet"]
    try:
        result = subprocess.run(argv, cwd=spec["compose"].parent, input=candidate,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return "UNAVAILABLE"
    return "PASS" if result.returncode == 0 else "FAIL"


def target_model_from_stdin(spec, candidate):
    """Compare only the selected service and image; keep model output private."""
    prefix = ["docker", "compose", "--project-directory", str(spec["compose"].parent),
              "--env-file", str(spec["env"]), "--file", "-"]
    values = []
    for selector in ("--services", "--images"):
        try:
            result = subprocess.run([*prefix, "config", selector],
                                    cwd=spec["compose"].parent, input=candidate,
                                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                    timeout=30, check=False)
        except (OSError, subprocess.TimeoutExpired):
            return "UNAVAILABLE"
        if result.returncode or len(result.stdout) > 1024:
            return "UNAVAILABLE"
        values.append(result.stdout.splitlines())
    return "EXPECTED" if values == [[spec["service"].encode()],
                                    [spec["image"].encode()]] else "OTHER"


def dry_create_from_stdin(spec, candidate):
    """Simulate only this service's create; discard all CLI output in RAM."""
    try:
        help_result = subprocess.run(["docker", "compose", "--help"],
                                     stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                     timeout=15, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return "UNAVAILABLE"
    if help_result.returncode or len(help_result.stdout) > 65536:
        return "UNAVAILABLE"
    if b"--dry-run" not in help_result.stdout:
        return "UNSUPPORTED"
    argv = ["docker", "compose", "--dry-run", "--project-directory",
            str(spec["compose"].parent), "--env-file", str(spec["env"]),
            "--file", "-", "create", "--force-recreate", "--no-build",
            "--pull", "never", spec["service"]]
    try:
        result = subprocess.run(argv, cwd=spec["compose"].parent, input=candidate,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                timeout=45, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return "UNAVAILABLE"
    return "PASS" if result.returncode == 0 else "FAIL"


def order_sample(spec):
    """Compare five raw Docker orderings after verifying equal semantics and ID."""
    expected = h.OLD_RUNTIME[d.NAME]
    samples = []
    for _ in range(5):
        if c.container_id(d.NAME) != spec["containerId"] or not h.is_running(d.NAME):
            raise RuntimeError("SampleIdentityChanged")
        raw = c.inspect(d.NAME)
        mounts = raw["mounts"]
        networks = raw["networks"]
        if (raw["imageId"] != spec["imageId"] or raw["imageRef"] != spec["image"] or
                raw["entrypoint"] != expected["entrypoint"] or
                raw["cmd"] != c.command(d.NAME, spec, False) or
                not isinstance(mounts, list) or not isinstance(networks, list) or
                len(networks) != 1 or networks[0].get("name") != "edge" or
                sorted(networks[0].get("aliases", [])) != sorted(expected["aliases"]) or
                raw["ports"] != {port: None for port in expected["ports"]}):
            raise RuntimeError("SampleSemanticsChanged")
        normalized = sorted((m.get("type"), m.get("name") or None, m.get("dest"),
                             m.get("rw"), c.digest(m.get("source", "").encode()))
                            for m in mounts if isinstance(m, dict) and
                            isinstance(m.get("source"), str))
        if len(normalized) != len(mounts) or normalized != sorted(expected["mounts"]):
            raise RuntimeError("SampleMountsChanged")
        samples.append(raw)
    return (any(raw["mounts"] != samples[0]["mounts"] for raw in samples[1:]),
            any(raw["networks"] != samples[0]["networks"] for raw in samples[1:]))


def projected():
    first = d.projected()
    if first["status"] != "PROJECTED":
        raise RuntimeError("DiagnosticUnavailable")
    eligible = (first["phase"] == "ROLLED_BACK" and first["selection"] == "OLD" and
                first["running"] is True and first["composeClass"] == "BASE" and
                first["rollbackComposeOwned"] and first["envMatches"] and
                first["snapshotStable"] and first["imageMatches"] and
                first["commandClass"] == "BEFORE" and first["labelsMatch"] and
                first["mountsMatch"] and first["networkClass"] == "ONE_EDGE" and
                first["aliasesMatch"] and first["exposed8090Only"] and
                first["hostBindingsNone"] and first["volumeUsers"] == "SELECTED")
    if not eligible:
        return {"status": "WINDOW_UNAVAILABLE", "phase": first["phase"],
                "candidateExact": False, "runtimeClass": "NOT_RUN",
                "configClass": "NOT_RUN", "modelClass": "NOT_RUN",
                "dryCreateClass": "NOT_RUN",
                "rawMountOrderChanged": False, "rawAliasOrderChanged": False,
                "snapshotStable": first["snapshotStable"],
                "baselineComparable": False, "remoteWrites": False,
                "privateValuesExported": False}
    before = snapshot()
    spec = c.SPECS[d.NAME]
    candidate = c.patch(d.NAME, spec, before[1][0])
    exact = c.digest(candidate) == spec["target"]
    if not exact:
        raise RuntimeError("CandidateChanged")
    try:
        c.runtime(d.NAME, spec, False, expected_id=spec["containerId"])
        runtime_class = "PASS_WITHOUT_BASELINE"
    except Exception as failure:
        runtime_class = str(failure) if str(failure) in RUNTIME_FAILURES else "OTHER_FAILURE"
    config_class = config_quiet_from_stdin(spec, candidate)
    model_class = target_model_from_stdin(spec, candidate) if config_class == "PASS" else "NOT_RUN"
    dry_class = dry_create_from_stdin(spec, candidate) if model_class == "EXPECTED" else "NOT_RUN"
    mounts_reordered, aliases_reordered = order_sample(spec)
    second = d.projected()
    stable = second == first and snapshot() == before
    if not stable:
        raise RuntimeError("SnapshotChanged")
    return {"status": "PROJECTED", "phase": first["phase"],
            "candidateExact": exact, "runtimeClass": runtime_class,
            "configClass": config_class, "modelClass": model_class,
            "dryCreateClass": dry_class,
            "rawMountOrderChanged": mounts_reordered,
            "rawAliasOrderChanged": aliases_reordered,
            "snapshotStable": True,
            "baselineComparable": False, "remoteWrites": False,
            "privateValuesExported": False}


def main():
    try:
        if len(sys.argv) != 1:
            raise RuntimeError("ArgsUnknown")
        result = projected()
    except Exception:
        result = {"status": "STOP_READ_UNAVAILABLE", "phase": "UNKNOWN",
                  "candidateExact": False, "runtimeClass": "NOT_RUN",
                  "configClass": "NOT_RUN", "modelClass": "NOT_RUN",
                  "dryCreateClass": "NOT_RUN",
                  "rawMountOrderChanged": False, "rawAliasOrderChanged": False,
                  "snapshotStable": False,
                  "baselineComparable": False, "remoteWrites": False,
                  "privateValuesExported": False}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] in ("PROJECTED", "WINDOW_UNAVAILABLE") else 2


if __name__ == "__main__":
    sys.exit(main())
