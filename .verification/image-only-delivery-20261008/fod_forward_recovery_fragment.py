"""Forward-only recovery. Used with the pinned read-only diagnostic definitions."""
import time

BACKUP_IMAGE = "alpine:3.23@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40"
ORIGINAL_SNAPSHOT_SHA = "8d81dfebb9d61e98049d1d778a873f93f0d1d5d7e76b9daf47064ab72771c03b"
EXPECTED_BOOLEANS = {"imageIsNew", "refIsNew", "entrypointMatches", "cmdMatches", "mountsMatch",
    "networksMatch", "exposedPortsMatch", "newTagMatchesExpectedImage", "composeMatches", "dotenvMatches",
    "backupComposeMatches", "backupDotenvMatches", "snapshotExists"}


def run_long(argv, timeout=30):
    try:
        result = subprocess.run(argv, capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        raise RuntimeError("CommandTimeout") from None
    except OSError:
        raise RuntimeError("CommandUnavailable") from None
    if result.returncode or len(result.stdout) > 1048576 or len(result.stderr) > 1048576:
        raise RuntimeError("CommandRejected")
    return result.stdout


def preserve_postattempt():
    """Snapshot current stopped live data without restoring or altering it."""
    identity = json.loads(run_long(["docker", "image", "inspect", "--format", "{{json .Id}}", BACKUP_IMAGE]))
    if identity != "sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40":
        # A digest-qualified reference resolves to a platform image ID, not its manifest digest.
        # Existence of this exact immutable reference is the identity check; validate ID syntax.
        if not isinstance(identity, str) or re.fullmatch(r"sha256:[0-9a-f]{64}", identity) is None:
            raise RuntimeError("BackupUtilityUnavailable")
    mountpoint = json.loads(run_long(["docker", "volume", "inspect", "--format", "{{json .Mountpoint}}", VOLUME]))
    if not isinstance(mountpoint, str) or not mountpoint.startswith("/var/lib/docker/volumes/") or not mountpoint.endswith("/" + VOLUME + "/_data"):
        raise RuntimeError("VolumeIdentityUnknown")
    raw_size = run_long(["du", "-sk", mountpoint], timeout=90).split(None, 1)[0]
    if re.fullmatch(rb"[0-9]{1,14}", raw_size) is None:
        raise RuntimeError("VolumeSizeUnknown")
    size_kib = int(raw_size)
    srv = os.statvfs("/srv")
    free_kib = srv.f_bavail * srv.f_frsize // 1024
    if free_kib < size_kib + 512 * 1024:
        raise RuntimeError("InsufficientSnapshotSpace")
    root = Path("/srv/vega-image-rollout")
    if root.is_symlink() or not root.is_dir() or stat.S_IMODE(root.stat().st_mode) != 0o700:
        raise RuntimeError("BackupDirectoryUnsafe")
    path = root / ("fodaveg-forward-preserve-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-" + str(os.getpid()))
    path.mkdir(mode=0o700)
    run_long(["docker", "run", "--rm", "--network", "none", "--read-only", "--volume", VOLUME + ":/source:ro",
              "--volume", str(path) + ":/backup:rw", BACKUP_IMAGE,
              "tar", "-C", "/source", "-czf", "/backup/data.tgz", "."], timeout=600)
    archive = path / "data.tgz"
    if archive.is_symlink() or not archive.is_file():
        raise RuntimeError("SnapshotUnavailable")
    archive.chmod(0o600)
    with archive.open("rb") as stream:
        os.fsync(stream.fileno())
    for directory in (path, root):
        descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    run_long(["docker", "run", "--rm", "--network", "none", "--read-only", "--volume", str(path) + ":/backup:ro",
              BACKUP_IMAGE, "/bin/sh", "-c", "tar -tzf /backup/data.tgz >/dev/null"], timeout=600)
    sha, size, _ = file_digest(archive, 100 * 1024 ** 3)
    if size == 0:
        raise RuntimeError("SnapshotUnavailable")
    return {"postattemptBackupDir": str(path), "postattemptSnapshotSha256": sha,
            "postattemptSnapshotBytes": size, "volumeKiB": size_kib, "freeSrvKiB": free_kib,
            "requiredSrvKiB": size_kib + 512 * 1024}


def public_http_status(port, path):
    """Node fetch returns public HTTP status only; never returns response body."""
    script = ("(async()=>{try{const r=await fetch('http://127.0.0.1:" + str(port) + path +
              "',{redirect:'manual',signal:AbortSignal.timeout(5000)});const s=r.status;if(r.body)await r.body.cancel();console.log(s);"
              "}catch{console.log('UNAVAILABLE')}})()")
    raw = run_long(["docker", "exec", SERVICE, "node", "-e", script], timeout=15).strip()
    return int(raw) if re.fullmatch(rb"[1-5][0-9]{2}", raw) else None


def fresh_start_guard():
    """Recheck stopped identity, volume exclusion and exact files just before start."""
    raw = json.loads(run_long(["docker", "inspect", "--format", TEMPLATE, SERVICE]))
    state = runtime_projection(raw)
    if state["running"] or any(state.get(key) is not True for key in (
            "imageIsNew", "refIsNew", "entrypointMatches", "cmdMatches", "mountsMatch", "networksMatch", "exposedPortsMatch")):
        raise RuntimeError("RuntimeIdentityDrift")
    names = run_long(["docker", "ps", "--filter", "volume=" + VOLUME, "--format", "{{.Names}}"])
    if names.strip():
        raise RuntimeError("OtherVolumeWriter")
    if file_digest(Path("/root/fodaveg/compose.yml"), 2097152)[0] != COMPOSE_SHA or \
            file_digest(Path("/root/fodaveg/.env"), 2097152)[0] != NEW_ENV_SHA:
        raise RuntimeError("DeploymentFilesDrift")


def recover_forward():
    output = {"schemaVersion": 1, "service": SERVICE, "mode": "forward-same-image",
              "status": "STOP_PRESTART", "remoteWrites": False, "startAttempted": False,
              "oldImageStarted": False, "liveDataRestored": False, "privateLogsRead": False,
              "originalSnapshotSha256": ORIGINAL_SNAPSHOT_SHA, "newImageId": NEW_ID}
    try:
        before = main()
        if before.get("status") != "DIAGNOSED" or before.get("running") is not False or \
                before.get("runningVolumeMountCount") != 0 or before.get("snapshotSha256") != ORIGINAL_SNAPSHOT_SHA or \
                any(before.get(key) is not True for key in EXPECTED_BOOLEANS):
            raise RuntimeError("PrestartGuardRejected")
        output["remoteWrites"] = True  # Creation of the additional preservation snapshot starts here.
        output.update(preserve_postattempt())
        fresh_start_guard()
        output["startAttempted"] = True
        run_long(["docker", "start", SERVICE], timeout=60)
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            raw = json.loads(run_long(["docker", "inspect", "--format", TEMPLATE, SERVICE]))
            state = runtime_projection(raw)
            output["running"] = state["running"]
            output["nativeHealth"] = state["health"]
            output["newImageMatches"] = state["imageIsNew"] and state["refIsNew"]
            if not state["running"] or not output["newImageMatches"]:
                break
            try:
                output["pbHttpStatus"] = public_http_status(8090, "/api/health")
                output["astroHttpStatus"] = public_http_status(4321, "/")
                processes = process_projection()
                output["pbProcessMatches"] = processes["pbProcessCount"] == 1 and processes["pbArgvMatches"]
                output["nodeProcessPresent"] = processes["nodeProcessCount"] >= 1
            except RuntimeError:
                time.sleep(1)
                continue
            if output["pbHttpStatus"] == 200 and output["astroHttpStatus"] == 200 and \
                    output["pbProcessMatches"] and output["nodeProcessPresent"]:
                output["status"] = "FORWARD_NATIVE_SMOKE_PASS" if state["health"] == "healthy" else "FORWARD_NATIVE_SMOKE_PASS_HEALTH_PENDING"
                return output
            time.sleep(1)
        output["status"] = "FORWARD_NATIVE_SMOKE_FAILED"
    except Exception as error:
        allowed = {"CommandTimeout", "CommandUnavailable", "CommandRejected", "BackupUtilityUnavailable",
                   "VolumeIdentityUnknown", "VolumeSizeUnknown", "InsufficientSnapshotSpace", "BackupDirectoryUnsafe",
                   "SnapshotUnavailable", "RuntimeIdentityDrift", "OtherVolumeWriter", "DeploymentFilesDrift", "PrestartGuardRejected"}
        output["errorCode"] = str(error) if isinstance(error, RuntimeError) and str(error) in allowed else "RecoveryUnavailable"
        output["status"] = "STOP_AFTER_START_ATTEMPT" if output["startAttempted"] else "STOP_PRESTART"
    return output


if __name__ == "__main__":
    print(json.dumps(recover_forward(), sort_keys=True, separators=(",", ":")))
