"""Owned TEST-only reprobe boundaries; no production control operations.

The entry point is intentionally a library until an independent review and a
new execution wrapper bind the archive tuple, sources and one-shot grant.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import tarfile
import time

import cors_apply as c
import image_helpers as h
import local_volume_constructor as constructor

BACKUP_ID = "fodaveg-20261008T231304Z-3656162"
ARCHIVE_SHA = "3a78532b99aea0dd1a424039ea0fca0eed67b9ef4026d48049cfc0f89285bdde"
ARCHIVE_BYTES = 110406535
ARCHIVE_IDENTITY = [2049, 433285, 0, 0, 384, 110406535, 1791501199906887961, 1791501200051887374]
FILES, EXPANDED = 71, 875290525
HEX = re.compile(r"[0-9a-f]{64}\Z")
IMAGE = c.SPECS["fodaveg"]["imageId"]
ACTIVE = None
OPERATOR_RECORD_ID = None
PIN = '{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}'
VOLUME = ('{"name":{{json .Name}},"driver":{{json .Driver}},"optionsEmpty":{{if .Options}}false{{else}}true{{end}},'
          '"mountpoint":{{json .Mountpoint}},"created":{{json .CreatedAt}},'
          '"owner":{{json (index .Labels "vega.fod.reprobe")}},"nonce":{{json (index .Labels "vega.fod.nonce")}}}')
CONTAINER = ('{"id":{{json .Id}},"image":{{json .Image}},"name":{{json .Name}},'
             '"running":{{json .State.Running}},"status":{{json .State.Status}},"exitCode":{{json .State.ExitCode}},'
             '"network":{{json .HostConfig.NetworkMode}},"readonly":{{json .HostConfig.ReadonlyRootfs}},'
             '"bindingsNone":{{if .HostConfig.PortBindings}}false{{else}}true{{end}},'
             '"networks":[{{$first := true}}{{range $name,$v := .NetworkSettings.Networks}}{{if not $first}},{{end}}{{json $name}}{{$first = false}}{{end}}],'
             '"entrypoint":{{json .Config.Entrypoint}},"cmd":{{json .Config.Cmd}},'
             '"owner":{{json (index .Config.Labels "vega.fod.reprobe")}},'
             '"nonce":{{json (index .Config.Labels "vega.fod.nonce")}},'
             '"mounts":[{{range $i,$m := .Mounts}}{{if $i}},{{end}}'
             '{"type":{{json $m.Type}},"name":{{json $m.Name}},"dest":{{json $m.Destination}},"rw":{{json $m.RW}}}{{end}}]}')
PHASES = {"INTENT", "ARCHIVE", "ALLOCATOR", "CREATE_VOLUME", "PROVE_VOLUME", "MOUNT_BUDGET",
          "CREATE_EXTRACTOR", "START_EXTRACTOR", "VERIFY_BYTES", "CREATE_PB", "START_PB",
          "PB_HEALTH", "PRIMARY_PASSED", "CLEANUP_PB", "CLEANUP_EXTRACTOR", "CLEANUP_VOLUME", "FINAL"}
FAILURES = {"CommandUnavailable", "CommandExitNonzero", "OutputBoundExceeded", "OldPinUnknown",
            "ArchiveUnknown", "ArchiveDrift", "RestoreMismatch", "AllocatorUnknown", "BudgetInsufficient",
            "TestCollision", "TestIdentityUnknown", "VolumeOwnershipUnknown", "ContainerOwnershipUnknown",
            "CloneUnhealthy", "JournalDrift", "CreationOutcomeUnresolved", "OTHER"}


class CommandExit(RuntimeError):
    def __init__(self, code):
        self.code = code if type(code) is int and 1 <= code <= 255 else None
        super().__init__("CommandExitNonzero" if self.code is not None else "CommandUnavailable")


def command(argv, timeout=30, stdin=None, allowed=(0,)):
    """Keep command text and both streams in RAM; expose finite failures only."""
    try:
        result = subprocess.run(argv, stdin=stdin, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("CommandUnavailable") from None
    if len(result.stdout) > 1048576 or len(result.stderr) > 1048576:
        raise RuntimeError("OutputBoundExceeded")
    if result.returncode not in allowed:
        raise CommandExit(result.returncode)
    return result


def failure(exc, phase):
    label = str(exc)
    return {"phase": phase, "failureClass": label if label in FAILURES else "OTHER",
            "commandExit": exc.code if isinstance(exc, CommandExit) else None}


def old_pin():
    spec = c.SPECS["fodaveg"]
    raw = json.loads(command(["docker", "inspect", "--format", PIN, spec["containerId"]]).stdout)
    if raw != {"id": spec["containerId"], "image": spec["oldImageId"], "running": True, "health": "healthy"} or type(raw.get("running")) is not bool:
        raise RuntimeError("OldPinUnknown")


def backup_state():
    body, selected = c.read_file(c.ROOT / BACKUP_ID / "state.json")
    value = json.loads(body)
    spec = c.SPECS["fodaveg"]
    if (not isinstance(value, dict) or value.get("service") != "fodaveg" or value.get("status") != "PREPARED"
            or value.get("oldContainerId") != spec["containerId"] or value.get("imageId") != IMAGE
            or value.get("oldComposeSha") != spec["base"] or value.get("newComposeSha") != spec["target"]):
        raise RuntimeError("ArchiveUnknown")
    return body, c.identity(selected)


class Journal:
    """Exclusive private intent, then fullidentity/CAS updates before effects."""
    def __init__(self):
        global ACTIVE
        self.owner = OPERATOR_RECORD_ID
        if not isinstance(self.owner, str) or not re.fullmatch(r"fodaveg-reprobe-[0-9]{8}T[0-9]{6}Z-[0-9]{1,10}", self.owner):
            raise RuntimeError("TestIdentityUnknown")
        self.nonce = secrets.token_hex(16)
        self.directory = c.ROOT / self.owner
        self.path = self.directory / "reprobe.json"
        self.value = {"owner": self.owner, "nonce": self.nonce, "phase": "INTENT",
                      "volume": "vega-fod-reprobe-" + self.nonce,
                      "extractor": "vega-fod-reprobe-tar-" + self.nonce,
                      "pb": "vega-fod-reprobe-pb-" + self.nonce,
                      "extractorId": None, "pbId": None, "volumeProof": None,
                      "primary": None, "cleanup": [], "finished": False}
        ACTIVE = self
        parent = c.parent_fd(self.directory)
        try:
            os.mkdir(self.owner, mode=0o700, dir_fd=parent)
            os.fsync(parent)
        finally:
            os.close(parent)
        body = self.body()
        fd = c.parent_fd(self.path)
        try:
            leaf = os.open(self.path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
            with os.fdopen(leaf, "wb") as stream:
                stream.write(body)
                stream.flush()
                os.fsync(stream.fileno())
                self.last_identity = c.identity(os.fstat(stream.fileno()))
            os.fsync(fd)
        finally:
            os.close(fd)
        self.last_sha = c.digest(body)

    def body(self):
        return json.dumps(self.value, sort_keys=True, separators=(",", ":")).encode()

    def save(self, phase=None):
        if phase is not None:
            if phase not in PHASES:
                raise RuntimeError("JournalDrift")
            self.value["phase"] = phase
        body = self.body()
        self.last_identity = c.replace_owned(self.path, body, self.last_sha, self.last_identity)
        self.last_sha = c.digest(body)

    def gate(self):
        body, selected = c.read_file(self.path)
        if c.digest(body) != self.last_sha or c.identity(selected) != self.last_identity:
            raise RuntimeError("JournalDrift")


class Archive:
    """Hold the approved inode open across hash, extraction and byte comparison."""
    def __init__(self):
        self.path = c.ROOT / BACKUP_ID / "data.tgz"
        self.parent = c.parent_fd(self.path)
        try:
            descriptor = os.open(self.path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=self.parent)
            self.stream = os.fdopen(descriptor, "rb")
            self.gate()
            digest = hashlib.sha256()
            for data in iter(lambda: self.stream.read(65536), b""):
                digest.update(data)
            if digest.hexdigest() != ARCHIVE_SHA:
                raise RuntimeError("ArchiveUnknown")
            self.stream.seek(0)
            seen, files, expanded = set(), 0, 0
            with tarfile.open(fileobj=self.stream, mode="r:gz") as archive:
                for member in archive:
                    parts = h.safe_archive_parts(member)
                    if parts in seen or len(seen) >= 100000:
                        raise RuntimeError("ArchiveUnknown")
                    seen.add(parts)
                    if member.isfile():
                        files += 1
                        expanded += member.size
            if files != FILES or expanded != EXPANDED:
                raise RuntimeError("ArchiveUnknown")
            self.gate()
        except BaseException:
            self.close()
            raise

    def gate(self):
        selected = os.stat(self.path.name, dir_fd=self.parent, follow_symlinks=False)
        opened = os.fstat(self.stream.fileno())
        fresh_parent = c.parent_fd(self.path)
        try:
            same_parent = (os.fstat(self.parent).st_dev, os.fstat(self.parent).st_ino) == (os.fstat(fresh_parent).st_dev, os.fstat(fresh_parent).st_ino)
        finally:
            os.close(fresh_parent)
        if not same_parent or not stat.S_ISREG(selected.st_mode) or c.identity(selected) != ARCHIVE_IDENTITY or c.identity(opened) != ARCHIVE_IDENTITY:
            raise RuntimeError("ArchiveDrift")

    def close(self):
        if hasattr(self, "stream"):
            self.stream.close()
        os.close(self.parent)


def allocator():
    raw = command(["docker", "info", "--format", "{{json .DockerRootDir}}" ]).stdout
    if len(raw) > 8192:
        raise RuntimeError("AllocatorUnknown")
    text = json.loads(raw)
    if not isinstance(text, str) or not 1 <= len(text) <= 4096 or "\0" in text:
        raise RuntimeError("AllocatorUnknown")
    root = Path(text)
    if not root.is_absolute() or str(root) != text or ".." in root.parts:
        raise RuntimeError("AllocatorUnknown")
    for directory in (root, root / "volumes"):
        fd = c.parent_fd(directory / "sentinel")
        os.close(fd)
    return root


def budget(mountpoint, initial=False, pb_only=False):
    """Initial metadata allowance differs from the actual restored-clone budget."""
    backup = c.ROOT / BACKUP_ID
    need = ((128 + 512) * 1024 if pb_only else 1024 + 512 * 1024 if initial
            else (EXPANDED + 1023) // 1024 + (128 + 512) * 1024)
    same = os.stat(mountpoint).st_dev == backup.stat().st_dev
    srv_need = need + 1024 if same else 512 * 1024 + 1024
    values = [os.statvfs(mountpoint), os.statvfs(backup)]
    free = [v.f_bavail * v.f_frsize // 1024 for v in values]
    if free[0] < need or free[1] < srv_need:
        raise RuntimeError("BudgetInsufficient")
    return {"sameFilesystem": same, "requiredAllocatorKiB": need, "requiredSrvKiB": srv_need,
            "freeAllocatorKiB": free[0], "freeSrvKiB": free[1]}


def volume_proof(journal, root, require_recorded=True):
    raw = json.loads(command(["docker", "volume", "inspect", "--format", VOLUME, journal.value["volume"]]).stdout)
    expected_mount = str(root / "volumes" / journal.value["volume"] / "_data")
    if (not isinstance(raw, dict) or set(raw) != {"name", "driver", "optionsEmpty", "mountpoint", "created", "owner", "nonce"}
            or raw["name"] != journal.value["volume"] or raw["driver"] != "local" or raw["optionsEmpty"] is not True
            or raw["mountpoint"] != expected_mount or raw["owner"] != journal.owner or raw["nonce"] != journal.nonce
            or not isinstance(raw["created"], str) or not 1 <= len(raw["created"]) <= 128):
        raise RuntimeError("VolumeOwnershipUnknown")
    directory = Path(expected_mount)
    fd = c.parent_fd(directory / "sentinel")
    try:
        current = os.fstat(fd)
    finally:
        os.close(fd)
    # The daemon-root/mountpoint text stays in RAM; the own private receipt needs
    # only its hash plus the selected local driver's identity and inode metadata.
    recorded = {key: value for key, value in raw.items() if key != "mountpoint"}
    recorded["mountpointSha256"] = c.digest(raw["mountpoint"].encode())
    proof = {"selected": recorded, "directoryIdentity": [current.st_dev, current.st_ino, current.st_uid, current.st_gid, stat.S_IMODE(current.st_mode)]}
    if require_recorded and proof != journal.value["volumeProof"]:
        raise RuntimeError("VolumeOwnershipUnknown")
    return proof, directory


def absent(kind, name):
    response = command(["docker", kind, "inspect", "--format", "{{json .Id}}" if kind == "container" else "{{json .Name}}", name], allowed=(0, 1))
    if response.returncode != 1:
        raise RuntimeError("TestCollision")


def create_volume(journal, root):
    journal.gate()
    absent("volume", journal.value["volume"])
    budget(root / "volumes", initial=True)
    journal.save("CREATE_VOLUME")
    journal.value["volumeCreateIssued"] = True
    journal.save()
    response = command(constructor.volume_create_argv(journal.nonce, journal.owner))
    if response.stdout.decode("ascii", "strict").strip() != journal.value["volume"]:
        raise RuntimeError("VolumeOwnershipUnknown")
    journal.save("PROVE_VOLUME")
    proof, mountpoint = volume_proof(journal, root, require_recorded=False)
    journal.value["volumeProof"] = proof
    journal.save("MOUNT_BUDGET")
    journal.value["mountBudget"] = budget(mountpoint)
    journal.save()
    return mountpoint


def create_argv(journal, role, image):
    labels = ["--label", "vega.fod.reprobe=" + journal.owner, "--label", "vega.fod.nonce=" + journal.nonce]
    argv = ["docker", "create", "--pull=never", "--name", journal.value[role], *labels, "--network", "none"]
    if role == "extractor":
        return [*argv, "--read-only", "--interactive", "--entrypoint", "/bin/tar", "--volume", journal.value["volume"] + ":/target:rw", image,
                "-C", "/target", "-xzf", "-"]
    return [*argv, "--entrypoint", "/pb/fodaveg-pb", "--volume", journal.value["volume"] + ":/pb/pb_data:rw", image,
            "--dir", "/pb/pb_data", "serve", "--http=127.0.0.1:8090"]


def container_proof(journal, role, image):
    selected = journal.value[role + "Id"]
    if not isinstance(selected, str) or not HEX.fullmatch(selected):
        raise RuntimeError("ContainerOwnershipUnknown")
    raw = json.loads(command(["docker", "container", "inspect", "--format", CONTAINER, selected]).stdout)
    cmd = ["-C", "/target", "-xzf", "-"] if role == "extractor" else ["--dir", "/pb/pb_data", "serve", "--http=127.0.0.1:8090"]
    entrypoint = ["/bin/tar"] if role == "extractor" else ["/pb/fodaveg-pb"]
    dest = "/target" if role == "extractor" else "/pb/pb_data"
    if (not isinstance(raw, dict) or set(raw) != {"id", "image", "name", "running", "status", "exitCode", "network", "readonly", "bindingsNone", "networks", "entrypoint", "cmd", "owner", "nonce", "mounts"}
            or raw["id"] != selected or raw["image"] != image or raw["name"] != "/" + journal.value[role]
            or type(raw["running"]) is not bool or raw["status"] not in {"created", "running", "exited"}
            or raw["running"] != (raw["status"] == "running") or type(raw["exitCode"]) is not int or not 0 <= raw["exitCode"] <= 255
            or raw["network"] != "none" or raw["readonly"] is not (role == "extractor")
            or raw["bindingsNone"] is not True or raw["networks"] != ["none"]
            or raw["entrypoint"] != entrypoint or raw["cmd"] != cmd
            or raw["owner"] != journal.owner or raw["nonce"] != journal.nonce
            or raw["mounts"] != [{"type": "volume", "name": journal.value["volume"], "dest": dest, "rw": True}]
            or type(raw["mounts"][0]["rw"]) is not bool):
        raise RuntimeError("ContainerOwnershipUnknown")
    return raw


def create_container(journal, role, image, root):
    journal.gate()
    volume_proof(journal, root)
    absent("container", journal.value[role])
    journal.save("CREATE_EXTRACTOR" if role == "extractor" else "CREATE_PB")
    journal.value[role + "CreateIssued"] = True
    journal.save()
    journal.gate()
    volume_proof(journal, root)
    raw = command(create_argv(journal, role, image)).stdout.decode("ascii", "strict").strip()
    if not HEX.fullmatch(raw):
        raise RuntimeError("ContainerOwnershipUnknown")
    journal.value[role + "Id"] = raw
    # Creation itself allocates an ID. Persist the returned fixed ID before START.
    journal.save()
    if container_proof(journal, role, image)["status"] != "created":
        raise RuntimeError("ContainerOwnershipUnknown")


def verify_bytes(archive, mountpoint):
    """Read the verified FD and restored files through symlink-free parent FDs."""
    archive.gate()
    archive.stream.seek(0)
    files, expanded = 0, 0
    with tarfile.open(fileobj=archive.stream, mode="r:gz") as tar:
        for member in tar:
            parts = h.safe_archive_parts(member)
            destination = mountpoint.joinpath(*parts)
            if member.isdir():
                fd = c.parent_fd(destination / "sentinel")
                os.close(fd)
                continue
            parent = c.parent_fd(destination)
            try:
                leaf = os.open(destination.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
                with os.fdopen(leaf, "rb") as restored:
                    before = os.fstat(restored.fileno())
                    if not stat.S_ISREG(before.st_mode) or before.st_size != member.size:
                        raise RuntimeError("RestoreMismatch")
                    expected = tar.extractfile(member)
                    for chunk in iter(lambda: expected.read(65536), b""):
                        if restored.read(len(chunk)) != chunk:
                            raise RuntimeError("RestoreMismatch")
                    if c.identity(before) != c.identity(os.fstat(restored.fileno())):
                        raise RuntimeError("RestoreMismatch")
            finally:
                os.close(parent)
            files += 1
            expanded += member.size
    archive.gate()
    if files != FILES or expanded != EXPANDED:
        raise RuntimeError("RestoreMismatch")
    return files, expanded


def cleanup(journal, root, extractor_image):
    """Remove only recorded own IDs; a cleanup failure cannot erase primary."""
    for role, image in (("pb", IMAGE), ("extractor", extractor_image)):
        if journal.value[role + "Id"] is None:
            if journal.value.get(role + "CreateIssued"):
                phase = "CLEANUP_PB" if role == "pb" else "CLEANUP_EXTRACTOR"
                journal.value["cleanup"].append(failure(RuntimeError("CreationOutcomeUnresolved"), phase))
                journal.save()
            continue
        phase = "CLEANUP_PB" if role == "pb" else "CLEANUP_EXTRACTOR"
        try:
            journal.gate()
            journal.save(phase)
            raw = container_proof(journal, role, image)
            if raw["running"]:
                command(["docker", "stop", journal.value[role + "Id"]], timeout=35)
            if container_proof(journal, role, image)["running"]:
                raise RuntimeError("ContainerOwnershipUnknown")
            journal.gate()
            command(["docker", "rm", journal.value[role + "Id"]])
            absent("container", journal.value[role + "Id"])
            journal.value[role + "Removed"] = True
            journal.save()
        except Exception as exc:
            journal.value["cleanup"].append(failure(exc, phase))
            journal.save()
    if journal.value["volumeProof"] is not None:
        phase = "CLEANUP_VOLUME"
        try:
            journal.gate()
            journal.save(phase)
            if any(journal.value.get(role + "CreateIssued") and not journal.value.get(role + "Removed") for role in ("pb", "extractor")):
                raise RuntimeError("ContainerOwnershipUnknown")
            volume_proof(journal, root)
            command(["docker", "volume", "rm", journal.value["volume"]])
            absent("volume", journal.value["volume"])
            journal.value["volumeRemoved"] = True
            journal.save()
        except Exception as exc:
            journal.value["cleanup"].append(failure(exc, phase))
            journal.save()
    elif journal.value.get("volumeCreateIssued"):
        journal.value["cleanup"].append(failure(RuntimeError("CreationOutcomeUnresolved"), "CLEANUP_VOLUME"))
        journal.save()


def reprobe():
    """Standalone TEST effect sequence; called only by a future reviewed wrapper."""
    global ACTIVE
    old_pin()
    original_state = backup_state()
    root = allocator()
    # A new parent full-clone budget must pass before any archive data read or
    # own metadata/TEST allocation. The actual mount budget is still rechecked.
    budget(root / "volumes")
    archive = Archive()
    try:
        extractor_image = h.image_id(h.BACKUP_IMAGE)
        if not isinstance(extractor_image, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", extractor_image) or h.image_id(IMAGE) != IMAGE:
            raise RuntimeError("TestIdentityUnknown")
        old_pin()
        if backup_state() != original_state:
            raise RuntimeError("ArchiveDrift")
        journal = Journal()
    except BaseException:
        archive.close()
        raise
    ACTIVE = journal
    try:
        journal.save("ARCHIVE")
        archive.gate()
        journal.save("ALLOCATOR")
        mountpoint = create_volume(journal, root)
        create_container(journal, "extractor", extractor_image, root)
        volume_proof(journal, root)
        budget(mountpoint)
        archive.gate()
        journal.gate()
        journal.save("START_EXTRACTOR")
        if container_proof(journal, "extractor", extractor_image)["status"] != "created":
            raise RuntimeError("ContainerOwnershipUnknown")
        volume_proof(journal, root)
        archive.gate()
        journal.gate()
        archive.stream.seek(0)
        command(["docker", "start", "--attach", "--interactive", journal.value["extractorId"]], timeout=600, stdin=archive.stream)
        extracted = container_proof(journal, "extractor", extractor_image)
        if extracted["status"] != "exited":
            raise RuntimeError("ContainerOwnershipUnknown")
        if extracted["exitCode"]:
            raise CommandExit(extracted["exitCode"])
        archive.gate()
        volume_proof(journal, root)
        journal.save("VERIFY_BYTES")
        journal.value["filesVerified"], journal.value["bytesVerified"] = verify_bytes(archive, mountpoint)
        journal.save()
        budget(mountpoint, pb_only=True)
        create_container(journal, "pb", IMAGE, root)
        volume_proof(journal, root)
        journal.save("START_PB")
        if container_proof(journal, "pb", IMAGE)["status"] != "created":
            raise RuntimeError("ContainerOwnershipUnknown")
        volume_proof(journal, root)
        journal.gate()
        command(["docker", "start", journal.value["pbId"]])
        journal.save("PB_HEALTH")
        healthy = False
        deadline = time.monotonic() + 35
        while time.monotonic() < deadline:
            observed = container_proof(journal, "pb", IMAGE)
            if not observed["running"]:
                if observed["exitCode"]:
                    raise CommandExit(observed["exitCode"])
                break
            try:
                raw = command(["docker", "exec", journal.value["pbId"], "wget", "-qO-", "http://127.0.0.1:8090/api/health"], timeout=5).stdout
                health = json.loads(raw)
                healthy = isinstance(health, dict) and type(health.get("code")) is int and health["code"] == 200
                if healthy:
                    break
            except (RuntimeError, ValueError):
                pass
            time.sleep(1)
        if not healthy:
            raise RuntimeError("CloneUnhealthy")
        archive.gate()
        if backup_state() != original_state:
            raise RuntimeError("ArchiveDrift")
        old_pin()
        journal.save("PRIMARY_PASSED")
    except Exception as exc:
        journal.value["primary"] = failure(exc, journal.value["phase"])
        # Primary failure is durably recorded BEFORE any cleanup command.
        journal.save()
    finally:
        archive.close()
    cleanup(journal, root, extractor_image)
    old_pin()
    if backup_state() != original_state:
        raise RuntimeError("ArchiveDrift")
    journal.value["finished"] = True
    journal.save("FINAL")
    return journal


def entry():
    """Closed finite receipt; never serialize command output or private paths."""
    unexpected = None
    try:
        journal = reprobe()
    except Exception as exc:
        unexpected = exc
        journal = ACTIVE
    if journal is None:
        return {"status": "PRECHECK_STOP", "ownedRecordId": None,
                "primaryFailure": failure(unexpected, "PRECHECK"), "cleanupFailures": [],
                "filesVerified": 0, "bytesVerified": 0, "remoteWrites": False,
                "productionControlOperations": False, "productionDataRestore": False,
                "privateValuesExported": False}
    primary = journal.value["primary"]
    errors = journal.value["cleanup"]
    if unexpected is not None:
        status = "TEST_PROTOCOL_UNRESOLVED"
        if primary is None:
            primary = failure(unexpected, journal.value["phase"])
    elif errors:
        status = "TEST_CLEANUP_UNRESOLVED"
    elif primary:
        status = "TEST_PRIMARY_FAILED_CLEANED"
    else:
        status = "TEST_REPROBE_PASSED_AND_CLEANED"
    return {"status": status, "ownedRecordId": journal.owner,
            "primaryFailure": primary, "cleanupFailures": errors,
            "filesVerified": journal.value.get("filesVerified", 0),
            "bytesVerified": journal.value.get("bytesVerified", 0), "remoteWrites": True,
            "productionControlOperations": False, "productionDataRestore": False,
            "privateValuesExported": False}
