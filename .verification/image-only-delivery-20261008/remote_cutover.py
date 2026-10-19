"""Guarded, one-service image replacement; run only by the release owner.

Stages: `check SERVICE` is read-only; `apply SERVICE` backs up data and changes
only that service's image selectors, plus the stock CORS-preserving command.
All private Compose/dotenv/process output stays in server RAM. Caddy is absent.
"""

import base64
import binascii
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import tarfile
import time


BACKUP_IMAGE = "alpine:3.23@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40"
BACKUP_ROOT = Path("/srv/vega-image-rollout")
SPECS = {
    "vega-pb": {
        "service": "pocketbase", "compose": Path("/srv/vega/infra/production/compose.yml"),
        "env": Path("/srv/vega/infra/production/.env"), "volume": "vega_data",
        "oldComposeSha": "812e521c2280704b62761ad5014cd9b6982bb2a548b7db47d5fcbd404dedddff",
        "oldTag": "vegacms:c04f0aaf14651415a368605546b8a205a2c063a7",
        "oldId": "sha256:e1eb49a883852c13d4c46cb326e56d146c116327883d970aadea769364ec4c0d",
        "newTag": "vegacms:a51b8521e1eeef52a522d2a065b36a03578c0c3a",
        "newId": "sha256:dd978b8d23081d2e3c69ebf6ef8ff4599a1acdd3f38dc559ae6fa379e46449b4",
        "selectors": {"VEGA_IMAGE_TAG": ("c04f0aaf14651415a368605546b8a205a2c063a7",
                                         "a51b8521e1eeef52a522d2a065b36a03578c0c3a"),
                      "VEGA_GIT_SHA": ("c04f0aaf14651415a368605546b8a205a2c063a7",
                                       "a51b8521e1eeef52a522d2a065b36a03578c0c3a")},
    },
    "lumbre-admin-pb": {
        "service": "pocketbase", "compose": Path("/srv/lumbre-admin/compose.yml"),
        "env": Path("/srv/lumbre-admin/.env"), "volume": "lumbre_admin_pb_data",
        "oldComposeSha": "7ed9a9e225790a4e15ccef3ce4c110b8d3b22e0fef53e6c1840d286181ebb8dd",
        "oldTag": "lumbre-admin-pb:64830ad-vega-c04f0aa",
        "oldId": "sha256:47f4c28349e923b164ea6db717988be26ec645b73c2e3901d5b8db239244b533",
        "newTag": "lumbre-admin-pb:a598bfe-vega-a51b852",
        "newId": "sha256:40df6a9bbcfd4edbc93680b0f45946d0be7c50c4e5c470167e33646fe499c1b7",
        "selectors": {"LUMBRE_ADMIN_IMAGE": ("lumbre-admin-pb:64830ad-vega-c04f0aa",
                                                 "lumbre-admin-pb:a598bfe-vega-a51b852")},
    },
    "fodaveg": {
        "service": "fodaveg", "compose": Path("/root/fodaveg/compose.yml"),
        "env": Path("/root/fodaveg/.env"), "volume": "fodaveg_fodaveg_pb",
        "oldComposeSha": "a18777c55d583c8eab43671d968108c9560f8a41152440e04ba610e583a9b500",
        "oldTag": "fodaveg:2be1119b15c0516d16f89316d6c356e49ec93ef1",
        "oldId": "sha256:5f5fb452e12c131e273a2b0be6c85f981a9f73cfa2902b2fa0a7a8c5143252be",
        "newTag": "fodaveg:f92bac858e904817ffc4cf6bf6307a6de0190c32",
        "newId": "sha256:0e0ef56341d677366cfc00d91e2ead83da0ebcc4372f7ba627f575be682ee51f",
        "selectors": {"FODAVEG_IMAGE": ("fodaveg:2be1119b15c0516d16f89316d6c356e49ec93ef1",
                                             "fodaveg:f92bac858e904817ffc4cf6bf6307a6de0190c32")},
    },
}
STOCK_CMD = (b"    command:\n"
             b"      - serve\n"
             b"      - --http=0.0.0.0:8090\n"
             b"      - --dir=/pb/pb_data\n"
             b"      - --publicDir=/pb/pb_public\n")
CONTAINER_TEMPLATE = (
    '{"imageId":{{json .Image}},"imageRef":{{json .Config.Image}},'
    '"entrypoint":{{json .Config.Entrypoint}},"cmd":{{json .Config.Cmd}},'
    '"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},'
    '"ports":{{json .NetworkSettings.Ports}},'
    '"mounts":[{{range $i,$m := .Mounts}}{{if $i}},{{end}}'
    '{"type":{{json $m.Type}},"name":{{json $m.Name}},'
    '"source":{{json $m.Source}},"dest":{{json $m.Destination}},'
    '"rw":{{json $m.RW}}}{{end}}],'
    '"networks":[{{$first := true}}{{range $name,$v := .NetworkSettings.Networks}}'
    '{{if not $first}},{{end}}{"name":{{json $name}},"aliases":{{json $v.Aliases}}}'
    '{{$first = false}}{{end}}]}'
)
OLD_RUNTIME = {
    "vega-pb": {
        "entrypoint": ["/pb/pocketbase"],
        "cmd": ["serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--publicDir=/pb/pb_public"],
        "mounts": [("volume", "vega_data", "/pb/pb_data", True,
                    "24bae05fc866a1c360dd895da69d9f3a828f7d4b804694a02135d484b24ed59e")],
        "aliases": ["pocketbase", "vega-pb", "vega-pb"], "ports": {"8090/tcp"},
    },
    "lumbre-admin-pb": {
        "entrypoint": ["/pb/lumbre-admin"],
        "cmd": ["serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--publicDir=/pb/pb_public"],
        "mounts": [("volume", "lumbre_admin_pb_data", "/pb/pb_data", True,
                    "28cfbd5cd84ab241c8ed45754acc2e3f8483ebadf5d79f638ea45f8610a640ce"),
                   ("bind", None, "/pb/pb_migrations", False,
                    "9bb42da9478f098e7b28fe1688335fdf501b786d0675094c03f2cc5b9ae522fd"),
                   ("bind", None, "/pb/publish", True,
                    "2516668ee5245f5a019b3d3cac9d843e8bb3f455d268ac34b44743af6e43773d")],
        "aliases": ["lumbre-admin-pb", "lumbre-admin-pb", "pocketbase"], "ports": {"8090/tcp"},
    },
    "fodaveg": {
        "entrypoint": ["/usr/bin/tini", "-g", "--", "./docker-entrypoint.sh"], "cmd": None,
        "mounts": [("volume", "fodaveg_fodaveg_pb", "/pb/pb_data", True,
                    "5758553f1921872ef0782119baaefb0716fa527c4fa42e7b01a5757d6da6f26a")],
        "aliases": ["fodaveg", "fodaveg"], "ports": {"8090/tcp", "4321/tcp"},
    },
}
OLD_PB_ARGV = {
    "vega-pb": ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data",
                "--publicDir=/pb/pb_public"],
    "lumbre-admin-pb": ["/pb/lumbre-admin", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data",
                        "--publicDir=/pb/pb_public"],
    "fodaveg": ["/pb/fodaveg-pb", "--dir", "/pb/pb_data", "serve", "--http=0.0.0.0:8090"],
}
PROC_COMMAND = '''set -eu
for f in /proc/[0-9]*/comm; do
    IFS= read -r comm < "$f" || continue
    case "$comm" in
        pocketbase|lumbre-admin|fodaveg-pb)
            printf '__PB_BEGIN__\\n'
            base64 "${f%/comm}/cmdline"
            printf '__PB_END__\\n'
            ;;
    esac
done'''


def run(argv, timeout=30):
    """Never serialize command output or private failure text."""
    try:
        result = subprocess.run(argv, capture_output=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("CommandUnavailable") from None
    if result.returncode or len(result.stdout) > 1048576 or len(result.stderr) > 1048576:
        raise RuntimeError("CommandUnavailable")
    return result.stdout


def read_private(path):
    """Read the exact regular file into server RAM, with no final symlink."""
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > 2 * 1024 * 1024:
            raise RuntimeError("FileUnavailable")
        body = stream.read(2 * 1024 * 1024 + 1)
        after = os.fstat(stream.fileno())
    if (len(body) > 2 * 1024 * 1024 or
            (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns)):
        raise RuntimeError("ConcurrentFileChange")
    return body, before


def digest(body):
    return hashlib.sha256(body).hexdigest()


def fsync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def patch_env(body, selectors):
    """Replace exact image-key lines; prove all non-selector bytes remain equal."""
    lines = body.splitlines(keepends=True)
    count = {key: 0 for key in selectors}
    changed = []
    for line in lines:
        key_bytes, separator, remainder = line.partition(b"=")
        try:
            key = key_bytes.decode("ascii")
        except UnicodeDecodeError:
            key = ""
        if not separator or key not in selectors:
            changed.append(line)
            continue
        count[key] += 1
        before, after = selectors[key]
        if remainder not in (before.encode() + b"\n", before.encode()):
            raise RuntimeError("SelectorDrift")
        changed.append(key_bytes + b"=" + after.encode() + (b"\n" if line.endswith(b"\n") else b""))
    if any(value != 1 for value in count.values()):
        raise RuntimeError("SelectorCardinality")
    new_body = b"".join(changed)
    old_non_image = b"".join(line for line in lines if line.partition(b"=")[0].decode("ascii", "ignore") not in selectors)
    new_non_image = b"".join(line for line in new_body.splitlines(keepends=True)
                             if line.partition(b"=")[0].decode("ascii", "ignore") not in selectors)
    if old_non_image != new_non_image:
        raise RuntimeError("OtherEnvChanged")
    return new_body


def patch_stock_compose(body):
    """Insert one exact command block under the sole stock service anchor."""
    anchor = b"  pocketbase:\n"
    if body.count(anchor) != 1 or b"\r" in body:
        raise RuntimeError("ComposeShapeUnknown")
    start = body.index(anchor) + len(anchor)
    match = re.search(rb"(?m)^(?:  [a-z][a-z0-9_-]*:|[a-z][a-z0-9_-]*:)", body[start:])
    end = start + match.start() if match else len(body)
    service = body[start:end]
    if re.search(rb"(?m)^    (?:command|entrypoint):", service):
        raise RuntimeError("ExistingCommandUnknown")
    patched = body[:start] + STOCK_CMD + body[start:]
    if patched.replace(STOCK_CMD, b"", 1) != body or patched.count(STOCK_CMD) != 1:
        raise RuntimeError("ComposeDeltaUnknown")
    return patched


def image_id(reference):
    result = json.loads(run(["docker", "image", "inspect", "--format", "{{json .Id}}", reference]))
    return result if isinstance(result, str) and re.fullmatch(r"sha256:[0-9a-f]{64}", result) else None


def current_id(name):
    result = json.loads(run(["docker", "inspect", "--format", "{{json .Image}}", name]))
    return result if isinstance(result, str) and re.fullmatch(r"sha256:[0-9a-f]{64}", result) else None


def current_image_ref(name):
    result = json.loads(run(["docker", "inspect", "--format", "{{json .Config.Image}}", name]))
    return result if isinstance(result, str) else None


def current_pb_argv(name):
    """Select one PB cmdline only, using the proved /proc framing."""
    raw = run(["docker", "exec", name, "/bin/sh", "-c", PROC_COMMAND])
    try:
        lines = raw.decode("ascii").splitlines()
    except UnicodeDecodeError:
        return None
    payload, candidates = None, []
    for line in lines:
        if line == "__PB_BEGIN__":
            if payload is not None:
                return None
            payload = []
        elif line == "__PB_END__":
            if payload is None:
                return None
            try:
                data = base64.b64decode("".join(payload), validate=True)
                if not data.endswith(b"\0") or len(data) > 16384:
                    return None
                candidates.append([part.decode("utf-8") for part in data[:-1].split(b"\0")])
            except (binascii.Error, UnicodeDecodeError, ValueError):
                return None
            payload = None
        elif payload is not None:
            payload.append(line)
        else:
            return None
    return candidates[0] if payload is None and len(candidates) == 1 and \
        candidates[0] == OLD_PB_ARGV[name] else None


def runtime_guard(name, spec, new=False):
    """Compare selected runtime fields; never request Docker Config.Env."""
    raw = json.loads(run(["docker", "inspect", "--format", CONTAINER_TEMPLATE, name]))
    old = OLD_RUNTIME[name]
    ports = raw.get("ports")
    networks = raw.get("networks")
    mounts = raw.get("mounts")
    if not isinstance(mounts, list) or not isinstance(networks, list) or not isinstance(ports, dict):
        return False
    normalized = sorted((m.get("type"), m.get("name") or None, m.get("dest"), m.get("rw"),
                         hashlib.sha256(m.get("source", "").encode()).hexdigest())
                        for m in mounts if isinstance(m, dict) and isinstance(m.get("source"), str))
    if len(normalized) != len(mounts) or normalized != sorted(old["mounts"]):
        return False
    if len(networks) != 1 or networks[0].get("name") != "edge" or \
            sorted(networks[0].get("aliases", [])) != sorted(old["aliases"]):
        return False
    if set(ports) != old["ports"] or any(value is not None for value in ports.values()):
        return False
    if raw.get("health") != "healthy":
        return False
    if current_pb_argv(name) is None:
        return False
    if not new:
        return (raw.get("imageId") == spec["oldId"] and raw.get("imageRef") == spec["oldTag"] and
                raw.get("entrypoint") == old["entrypoint"] and raw.get("cmd") == old["cmd"])
    expected_cmd = old["cmd"] if name == "vega-pb" else (
        None if name == "fodaveg" else old["cmd"])
    return (raw.get("imageId") == spec["newId"] and raw.get("imageRef") == spec["newTag"] and
            raw.get("entrypoint") == old["entrypoint"] and raw.get("cmd") == expected_cmd)


def compose_quiet(spec):
    run(["docker", "compose", "--env-file", str(spec["env"]), "--file", str(spec["compose"]),
         "config", "--quiet"])


def volume_mountpoint(volume):
    mountpoint = json.loads(run(["docker", "volume", "inspect", "--format", "{{json .Mountpoint}}", volume]))
    if (not isinstance(mountpoint, str) or not mountpoint.startswith("/var/lib/docker/volumes/") or
            not mountpoint.endswith("/" + volume + "/_data")):
        raise RuntimeError("VolumeSourceUnknown")
    return mountpoint


def volume_size_kib(volume):
    """Only numeric disk usage leaves server; mountpoint path stays in RAM."""
    mountpoint = volume_mountpoint(volume)
    raw = run(["du", "-sk", mountpoint], timeout=60).split(None, 1)[0]
    if not re.fullmatch(rb"[0-9]{1,14}", raw):
        raise RuntimeError("VolumeSizeUnknown")
    return int(raw)


def free_kib():
    value = os.statvfs("/srv")
    return value.f_bavail * value.f_frsize // 1024


def filesystem_budget(volume, size_kib):
    """Reserve for snapshot and clone on their actual filesystems."""
    mountpoint = volume_mountpoint(volume)
    srv_stat = os.statvfs("/srv")
    docker_stat = os.statvfs(mountpoint)
    srv_free = srv_stat.f_bavail * srv_stat.f_frsize // 1024
    docker_free = docker_stat.f_bavail * docker_stat.f_frsize // 1024
    same_fs = os.stat("/srv").st_dev == os.stat(mountpoint).st_dev
    reserve = 512 * 1024
    required_srv = size_kib + reserve
    required_docker = size_kib + reserve
    if same_fs:
        # Snapshot + restored test clone can coexist until the probe ends.
        required_srv = required_docker = size_kib * 2 + reserve
    if srv_free < required_srv or docker_free < required_docker:
        raise RuntimeError("InsufficientSpace")
    return {"freeSrvKiB": srv_free, "freeDockerKiB": docker_free,
            "requiredSrvKiB": required_srv, "requiredDockerKiB": required_docker,
            "sameFilesystem": same_fs}


def volume_running_containers(volume):
    """Only expected container names may be returned; unknown names stay in RAM."""
    raw = run(["docker", "ps", "--filter", "volume=" + volume, "--format", "{{.Names}}"])
    return raw.decode("utf-8", "replace").splitlines()


def is_running(name):
    value = json.loads(run(["docker", "inspect", "--format", "{{json .State.Running}}", name]))
    return value is True


def inspect_guard(name, spec):
    compose, compose_stat = read_private(spec["compose"])
    env, env_stat = read_private(spec["env"])
    if digest(compose) != spec["oldComposeSha"]:
        raise RuntimeError("ComposeDrift")
    if stat.S_IMODE(env_stat.st_mode) & 0o077:
        raise RuntimeError("DotenvPermissions")
    new_env = patch_env(env, spec["selectors"])
    new_compose = patch_stock_compose(compose) if name == "vega-pb" else compose
    if (current_id(name) != spec["oldId"] or current_image_ref(name) != spec["oldTag"] or
            image_id(spec["oldTag"]) != spec["oldId"] or image_id(spec["newTag"]) != spec["newId"]):
        raise RuntimeError("ImageIdentityDrift")
    if not runtime_guard(name, spec):
        raise RuntimeError("RuntimeIdentityDrift")
    if image_id(BACKUP_IMAGE) is None:
        raise RuntimeError("BackupUtilityMissing")
    if volume_running_containers(spec["volume"]) != [name]:
        raise RuntimeError("OtherVolumeWriterOrTargetMissing")
    compose_quiet(spec)
    size_kib = volume_size_kib(spec["volume"])
    budget = filesystem_budget(spec["volume"], size_kib)
    return {"oldCompose": compose, "oldEnv": env, "newCompose": new_compose, "newEnv": new_env,
            "composeMode": stat.S_IMODE(compose_stat.st_mode),
            "envMode": stat.S_IMODE(env_stat.st_mode),
            "oldEnvSha": digest(env), "newEnvSha": digest(new_env),
            "newComposeSha": digest(new_compose), "volumeKiB": size_kib,
            **budget}


def write_new(path, body, mode):
    """Atomically replace one guarded file while preserving its mode."""
    temporary = path.with_name(path.name + ".vega-image-new")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(body)
            os.fchmod(stream.fileno(), mode)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        fsync_directory(path.parent)
    except BaseException:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
        raise


def write_backup(path, body):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(body)
        stream.flush()
        os.fsync(stream.fileno())
    fsync_directory(path.parent)


def make_backup_dir(name):
    BACKUP_ROOT.mkdir(mode=0o700, exist_ok=True)
    if stat.S_IMODE(BACKUP_ROOT.stat().st_mode) != 0o700 or BACKUP_ROOT.is_symlink():
        raise RuntimeError("BackupDirectoryUnsafe")
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    path = BACKUP_ROOT / (name + "-" + stamp + "-" + str(os.getpid()))
    path.mkdir(mode=0o700)
    fsync_directory(BACKUP_ROOT)
    return path


def backup_volume(volume, backup_dir):
    run(["docker", "run", "--rm", "--network", "none", "--read-only",
         "--volume", volume + ":/source:ro", "--volume", str(backup_dir) + ":/backup:rw",
         BACKUP_IMAGE, "tar", "-C", "/source", "-czf", "/backup/data.tgz", "."], timeout=600)
    archive = backup_dir / "data.tgz"
    if not archive.is_file() or archive.is_symlink() or archive.stat().st_size == 0:
        raise RuntimeError("BackupMissing")
    archive.chmod(0o600)
    with archive.open("rb") as stream:
        os.fsync(stream.fileno())
    fsync_directory(backup_dir)
    run(["docker", "run", "--rm", "--network", "none", "--read-only",
         "--volume", str(backup_dir) + ":/backup:ro", BACKUP_IMAGE,
         "/bin/sh", "-c", "tar -tzf /backup/data.tgz >/dev/null"], timeout=600)
    hasher = hashlib.sha256()
    with archive.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            hasher.update(chunk)
    validate_archive(archive)
    return hasher.hexdigest(), archive.stat().st_size


def safe_archive_parts(member):
    """Accept only tar's own ./ relative regular paths, before extraction."""
    raw_parts = member.name.split("/")
    if (raw_parts[0] != "." or
            any(part in ("", ".", "..") for part in raw_parts[1:-1]) or
            (len(raw_parts) > 1 and raw_parts[-1] in (".", "..")) or
            (raw_parts[-1] == "" and not member.isdir()) or
            not (member.isdir() or member.isfile())):
        raise RuntimeError("ArchiveShapeUnknown")
    parts = tuple(part for part in raw_parts[1:] if part)
    if not parts and not member.isdir():
        raise RuntimeError("ArchiveShapeUnknown")
    return parts


def validate_archive(archive_path):
    """Reject links, escapes, duplicates and unsupported entries before tar restore."""
    seen = set()
    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive:
            parts = safe_archive_parts(member)
            relative = "/".join(parts)
            if relative in seen or len(seen) >= 100000:
                raise RuntimeError("ArchiveDuplicateOrTooMany")
            seen.add(relative)
    if not seen:
        raise RuntimeError("ArchiveEmpty")


def verify_restored(backup_dir, test_volume):
    """Compare every regular archive member byte for byte with the test volume."""
    root = Path(volume_mountpoint(test_volume))
    checked, bytes_checked, seen = 0, 0, set()
    with tarfile.open(backup_dir / "data.tgz", "r:gz") as archive:
        for member in archive:
            parts = safe_archive_parts(member)
            relative = "/".join(parts)
            if relative in seen:
                raise RuntimeError("ArchiveDuplicate")
            seen.add(relative)
            destination = root.joinpath(*parts)
            if member.isdir():
                if not destination.is_dir() or destination.is_symlink():
                    raise RuntimeError("RestoreDirectoryMismatch")
                continue
            if not member.isfile() or not destination.is_file() or destination.is_symlink():
                raise RuntimeError("RestoreFileMismatch")
            stream = archive.extractfile(member)
            if stream is None or destination.stat().st_size != member.size:
                raise RuntimeError("RestoreSizeMismatch")
            with destination.open("rb") as restored:
                for expected in iter(lambda: stream.read(65536), b""):
                    if restored.read(len(expected)) != expected:
                        raise RuntimeError("RestoreByteMismatch")
            checked += 1
            bytes_checked += member.size
            if checked > 100000 or bytes_checked > 100 * 1024 * 1024 * 1024:
                raise RuntimeError("RestoreScopeExceeded")
    if checked == 0:
        raise RuntimeError("RestoreEmpty")
    return checked, bytes_checked


def fod_serve_probe(spec, test_volume, test_name):
    """Boot the actual Fod PB serve command on the isolated clone; no network."""
    run(["docker", "run", "--rm", "--detach", "--name", test_name, "--network", "none",
         "--entrypoint", "/pb/fodaveg-pb", "--volume", test_volume + ":/pb/pb_data:rw",
         spec["newTag"], "--dir", "/pb/pb_data", "serve", "--http=127.0.0.1:8090"], timeout=30)
    healthy = False
    deadline = time.monotonic() + 35
    try:
        while time.monotonic() < deadline:
            try:
                run(["docker", "exec", test_name, "wget", "-qO-",
                     "http://127.0.0.1:8090/api/health"], timeout=5)
                healthy = True
                break
            except RuntimeError:
                time.sleep(1)
    finally:
        run(["docker", "stop", test_name], timeout=30)
    if not healthy:
        raise RuntimeError("CloneServeUnhealthy")


def isolated_restore_probe(name, spec, backup_dir):
    """Restore all services to TEST volumes; Fod also runs real PB serve."""
    nonce = secrets.token_hex(16)
    test_volume = "vega-image-probe-" + nonce
    label = "vega.image-probe=" + nonce
    try:
        prior = subprocess.run(["docker", "volume", "inspect", test_volume],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               timeout=15, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("ProbeVolumeIdentityUnknown") from None
    if prior.returncode == 0:
        raise RuntimeError("ProbeVolumeCollision")
    if prior.returncode != 1:
        raise RuntimeError("ProbeVolumeIdentityUnknown")
    created = run(["docker", "volume", "create", "--label", label, test_volume]).decode("ascii", "strict").strip()
    labels = json.loads(run(["docker", "volume", "inspect", "--format", "{{json .Labels}}", test_volume]))
    if not isinstance(labels, dict) or labels.get("vega.image-probe") != nonce:
        raise RuntimeError("ProbeVolumeCreationUnknown")
    try:
        if created != test_volume:
            raise RuntimeError("ProbeVolumeCreationUnknown")
        run(["docker", "run", "--rm", "--network", "none", "--read-only",
             "--volume", test_volume + ":/target:rw", "--volume", str(backup_dir) + ":/backup:ro",
             BACKUP_IMAGE, "tar", "-C", "/target", "-xzf", "/backup/data.tgz"], timeout=600)
        checked, bytes_checked = verify_restored(backup_dir, test_volume)
        if name == "fodaveg":
            fod_serve_probe(spec, test_volume, "vega-image-serve-" + secrets.token_hex(8))
    finally:
        # This volume is uniquely named by this probe and never contains live data.
        run(["docker", "volume", "rm", test_volume])
    return checked, bytes_checked


def health_and_id(name, spec):
    return runtime_guard(name, spec, new=True)


def wait_old_runtime(name, spec):
    """Confirm recovery uses the original image and the same healthy runtime."""
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        try:
            if runtime_guard(name, spec, new=False):
                return True
        except RuntimeError:
            pass
        time.sleep(1)
    return False


def restore_file_if_owned(path, old_body, old_sha, new_sha, mode, attempted):
    """Undo only this invocation's exact bytes; never overwrite concurrent edits."""
    current_body, current_stat = read_private(path)
    if stat.S_IMODE(current_stat.st_mode) != mode:
        return False
    current_sha = digest(current_body)
    if current_sha == old_sha:
        return True
    if not attempted or current_sha != new_sha:
        return False
    write_new(path, old_body, mode)
    restored_body, restored_stat = read_private(path)
    return digest(restored_body) == old_sha and stat.S_IMODE(restored_stat.st_mode) == mode


def apply(name, spec, dry):
    try:
        data = inspect_guard(name, spec)
    except Exception:
        return {"status": "STOP_PREMUTATION", "service": name, "remoteWrites": False}
    if dry:
        return {"status": "READY_FOR_REVIEW", "service": name, "remoteWrites": False,
                "oldComposeSha256": spec["oldComposeSha"], "newComposeSha256": data["newComposeSha"],
                "oldDotenvSha256": data["oldEnvSha"], "newDotenvSha256": data["newEnvSha"],
                "volumeKiB": data["volumeKiB"],
                "freeSrvKiB": data["freeSrvKiB"], "freeDockerKiB": data["freeDockerKiB"],
                "requiredSrvKiB": data["requiredSrvKiB"],
                "requiredDockerKiB": data["requiredDockerKiB"],
                "sameFilesystem": data["sameFilesystem"], "backupUtilityCached": True,
                "oldId": spec["oldId"], "newId": spec["newId"]}
    backup_dir = None
    stopped, new_started = False, False
    compose_attempted, env_attempted = False, False
    try:
        backup_dir = make_backup_dir(name)
        write_backup(backup_dir / "compose.old", data["oldCompose"])
        write_backup(backup_dir / "dotenv.old", data["oldEnv"])
        run(["docker", "stop", name], timeout=60)
        stopped = True
        if is_running(name) or volume_running_containers(spec["volume"]):
            raise RuntimeError("VolumeStillMountedByRunningContainer")
        archive_hash, archive_bytes = backup_volume(spec["volume"], backup_dir)
        restored_files, restored_bytes = isolated_restore_probe(name, spec, backup_dir)
        # Recheck original bytes after the service is stopped, before edits.
        current_compose, _ = read_private(spec["compose"])
        current_env, _ = read_private(spec["env"])
        if digest(current_compose) != spec["oldComposeSha"] or digest(current_env) != data["oldEnvSha"]:
            raise RuntimeError("FilesChangedWhileBackingUp")
        if name == "vega-pb":
            compose_attempted = True
            write_new(spec["compose"], data["newCompose"], data["composeMode"])
        env_attempted = True
        write_new(spec["env"], data["newEnv"], data["envMode"])
        if digest(read_private(spec["compose"])[0]) != data["newComposeSha"] or \
                digest(read_private(spec["env"])[0]) != data["newEnvSha"]:
            raise RuntimeError("NewFilesChanged")
        compose_quiet(spec)
        new_started = True  # A failed up may already have run migrations.
        run(["docker", "compose", "--env-file", str(spec["env"]), "--file", str(spec["compose"]),
             "up", "--detach", "--wait", "--no-build", spec["service"]], timeout=240)
        if not health_and_id(name, spec):
            raise RuntimeError("NewRuntimeUnknown")
        return {"status": "CUTOVER_WAITING_SERVED_SMOKE", "service": name, "remoteWrites": True,
                "backupDir": str(backup_dir), "snapshotSha256": archive_hash,
                "snapshotBytes": archive_bytes, "oldId": spec["oldId"], "newId": spec["newId"],
                "newComposeSha256": data["newComposeSha"], "newDotenvSha256": data["newEnvSha"],
                "isolatedRestoreFiles": restored_files, "isolatedRestoreBytes": restored_bytes,
                "cloneServeProbePassed": name == "fodaveg"}
    except Exception:
        if not stopped:
            try:
                stopped = not is_running(name)
            except Exception:
                stopped = True  # Unknown state is treated as a possible stop.
        if new_started:
            try:
                run(["docker", "stop", name], timeout=60)
            except RuntimeError:
                pass
            return {"status": "STOP_AFTER_NEW_IMAGE_POSSIBLE_DATA_MIGRATION", "service": name,
                    "remoteWrites": True, "backupDir": str(backup_dir) if backup_dir else None,
                    "oldImageNotRestarted": True}
        # No new image ran. Undo only our own exact bytes, then restart the old runtime.
        try:
            compose_restored = restore_file_if_owned(
                spec["compose"], data["oldCompose"], spec["oldComposeSha"], data["newComposeSha"],
                data["composeMode"], compose_attempted)
            env_restored = restore_file_if_owned(
                spec["env"], data["oldEnv"], data["oldEnvSha"], data["newEnvSha"],
                data["envMode"], env_attempted)
            if not (compose_restored and env_restored):
                raise RuntimeError("ConcurrentFileChange")
            if stopped:
                run(["docker", "start", name], timeout=60)
            restored = wait_old_runtime(name, spec)
        except Exception:
            restored = False
        return {"status": "STOP_BEFORE_NEW_IMAGE_RESTORED" if restored else "STOP_RESTORE_NEEDS_OPERATOR",
                "service": name, "remoteWrites": True,
                "backupDir": str(backup_dir) if backup_dir else None,
                "oldImageRestarted": restored}


def main():
    try:
        mode, name = sys.argv[1:]
        if mode not in ("check", "apply") or name not in SPECS:
            raise ValueError
        result = apply(name, SPECS[name], mode == "check")
    except Exception:
        result = {"status": "STOP_UNCLASSIFIED", "service": sys.argv[2] if len(sys.argv) > 2 and
                  sys.argv[2] in SPECS else None,
                  "remoteWrites": len(sys.argv) > 1 and sys.argv[1] == "apply"}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] in ("READY_FOR_REVIEW", "CUTOVER_WAITING_SERVED_SMOKE") else 2


if __name__ == "__main__":
    sys.exit(main())
