"""Fresh quiesced snapshot and owned clone for one forward operation.

The reviewed TEST primitive sequence is retained in this separate candidate.
The caller supplies the stopped OLD baseline and grant-bound record identities;
no healthy/running OLD callback is overridden in the immutable TEST module.
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
from bounded_capture import capture_process

SNAPSHOT_CAP = 128 * 1024 * 1024
EXPANDED_CAP = 900 * 1024 * 1024
MEMORY_REQUIRED_KIB = 1536 * 1024
HEX = re.compile(r"[0-9a-f]{64}\Z")
IMAGE = c.SPECS["fodaveg"]["imageId"]
ACTIVE = None
OPERATOR_RECORD_ID = None
OPERATOR_BACKUP_ID = None
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
          "PB_HEALTH", "PRIMARY_PASSED", "CLEANUP_PB", "CLEANUP_EXTRACTOR", "CLEANUP_VOLUME", "FINAL",
          "CREATE_SNAPSHOT", "START_SNAPSHOT", "SAVE_SNAPSHOT", "CLEANUP_SNAPSHOT"}
FAILURES = {"CommandUnavailable", "CommandExitNonzero", "OutputBoundExceeded", "OldPinUnknown",
            "ArchiveUnknown", "ArchiveDrift", "RestoreMismatch", "AllocatorUnknown", "BudgetInsufficient",
            "TestCollision", "TestIdentityUnknown", "VolumeOwnershipUnknown", "ContainerOwnershipUnknown",
            "CloneUnhealthy", "JournalDrift", "CreationOutcomeUnresolved", "SnapshotBoundExceeded",
            "QuiescenceUnknown", "MemoryInsufficient", "ProbeFailed", "OTHER"}


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


def quiesced(spec, state):
    """Full stopped OLD runtime plus original file identities; zero other users."""
    c.gate_files(spec, spec["base"], state["composeIdentity"], state["envSha"], state["envIdentity"])
    if h.is_running(spec["service"]) or h.volume_running_containers(spec["volume"]):
        raise RuntimeError("QuiescenceUnknown")
    c.runtime(spec["service"], spec, False, baseline=state["oldRuntime"],
              expected_id=state["oldId"], require_healthy=False, volume_users=[])


def make_backup():
    """The one-shot grant names this exclusive private directory before SSH."""
    if not isinstance(OPERATOR_BACKUP_ID, str) or not re.fullmatch(r"fodaveg-[0-9]{8}T[0-9]{6}Z-[0-9]{1,10}", OPERATOR_BACKUP_ID):
        raise RuntimeError("TestIdentityUnknown")
    path = c.ROOT / OPERATOR_BACKUP_ID
    fd = c.parent_fd(path)
    try:
        parent = os.fstat(fd)
        selected = c.ROOT.stat(follow_symlinks=False)
        if (not stat.S_ISDIR(selected.st_mode) or stat.S_IMODE(parent.st_mode) != 0o700
                or parent.st_uid != 0 or (parent.st_dev, parent.st_ino) != (selected.st_dev, selected.st_ino)):
            raise RuntimeError("TestIdentityUnknown")
        os.mkdir(path.name, 0o700, dir_fd=fd)
        os.fsync(fd)
    finally:
        os.close(fd)
    return path


def memory_budget():
    """Only MemAvailable is selected; bound gzip RAM plus one GiB host reserve."""
    with open("/proc/meminfo", encoding="ascii") as stream:
        for line in stream:
            if line.startswith("MemAvailable:"):
                match = re.fullmatch(r"MemAvailable:\s+([0-9]+) kB\n", line)
                if not match or int(match[1]) < MEMORY_REQUIRED_KIB:
                    raise RuntimeError("MemoryInsufficient")
                return int(match[1])
    raise RuntimeError("MemoryInsufficient")


class Journal:
    """Exclusive private intent, then fullidentity/CAS updates before effects."""
    def __init__(self, backup, spec, state):
        global ACTIVE
        self.owner = OPERATOR_RECORD_ID
        if not isinstance(self.owner, str) or not re.fullmatch(r"fodaveg-reprobe-[0-9]{8}T[0-9]{6}Z-[0-9]{1,10}", self.owner):
            raise RuntimeError("TestIdentityUnknown")
        self.nonce = secrets.token_hex(16)
        self.directory = backup
        self.backup = backup
        self.spec, self.state = spec, state
        selected = backup.stat(follow_symlinks=False)
        self.directory_identity = [selected.st_dev, selected.st_ino, selected.st_uid, selected.st_gid, stat.S_IMODE(selected.st_mode)]
        self.path = self.directory / "forward-probe.json"
        self.value = {"owner": self.owner, "nonce": self.nonce, "phase": "INTENT",
                      "volume": "vega-fod-reprobe-" + self.nonce,
                      "extractor": "vega-fod-reprobe-tar-" + self.nonce,
                      "pb": "vega-fod-reprobe-pb-" + self.nonce,
                      "extractorId": None, "pbId": None, "volumeProof": None,
                      "snapshot": "vega-fod-reprobe-snapshot-" + self.nonce, "snapshotId": None,
                      "primary": None, "cleanup": [], "finished": False}
        ACTIVE = self
        body = self.body()
        fd = c.parent_fd(self.path)
        try:
            parent = os.fstat(fd)
            if [parent.st_dev, parent.st_ino, parent.st_uid, parent.st_gid, stat.S_IMODE(parent.st_mode)] != self.directory_identity:
                raise RuntimeError("JournalDrift")
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
        self.gate()
        if phase is not None:
            if phase not in PHASES:
                raise RuntimeError("JournalDrift")
            self.value["phase"] = phase
        body = self.body()
        self.last_identity = c.replace_owned(self.path, body, self.last_sha, self.last_identity)
        self.last_sha = c.digest(body)

    def gate(self):
        fd = c.parent_fd(self.path)
        try:
            parent = os.fstat(fd)
            actual = [parent.st_dev, parent.st_ino, parent.st_uid, parent.st_gid, stat.S_IMODE(parent.st_mode)]
            if actual != self.directory_identity:
                raise RuntimeError("JournalDrift")
        finally:
            os.close(fd)
        body, selected = c.read_file(self.path)
        if c.digest(body) != self.last_sha or c.identity(selected) != self.last_identity:
            raise RuntimeError("JournalDrift")


class Archive:
    """Hold the approved inode open across hash, extraction and byte comparison."""
    def __init__(self, backup, expected_identity):
        self.path = backup / "data.tgz"
        self.expected_identity = expected_identity
        self.parent = c.parent_fd(self.path)
        try:
            descriptor = os.open(self.path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=self.parent)
            self.stream = os.fdopen(descriptor, "rb")
            self.gate()
            digest = hashlib.sha256()
            for data in iter(lambda: self.stream.read(65536), b""):
                digest.update(data)
            self.sha = digest.hexdigest()
            self.size = os.fstat(self.stream.fileno()).st_size
            if not 1 <= self.size <= SNAPSHOT_CAP:
                raise RuntimeError("SnapshotBoundExceeded")
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
                        if expanded > EXPANDED_CAP:
                            raise RuntimeError("SnapshotBoundExceeded")
            if files < 1 or not 1 <= expanded <= EXPANDED_CAP:
                raise RuntimeError("SnapshotBoundExceeded")
            self.files, self.expanded = files, expanded
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
        if not same_parent or not stat.S_ISREG(selected.st_mode) or c.identity(selected) != self.expected_identity or c.identity(opened) != self.expected_identity:
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


def budget(mountpoint, backup, initial=False, pb_only=False, snapshot=False):
    """Initial metadata allowance differs from the actual restored-clone budget."""
    need = ((128 + 512) * 1024 if pb_only else 1024 + 512 * 1024 if initial
            else (EXPANDED_CAP + 1023) // 1024 + (128 + 512) * 1024)
    if snapshot:
        need += SNAPSHOT_CAP // 1024
    same = os.stat(mountpoint).st_dev == backup.stat().st_dev
    srv_need = need + 1024 if same else 512 * 1024 + 1024 + (SNAPSHOT_CAP // 1024 if snapshot else 0)
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
    budget(root / "volumes", journal.backup, initial=True)
    journal.save("CREATE_VOLUME")
    journal.value["volumeCreateIssued"] = True
    journal.save()
    journal.gate()
    quiesced(journal.spec, journal.state)
    budget(root / "volumes", journal.backup, initial=True)
    response = command(constructor.volume_create_argv(journal.nonce, journal.owner))
    if response.stdout.decode("ascii", "strict").strip() != journal.value["volume"]:
        raise RuntimeError("VolumeOwnershipUnknown")
    journal.save("PROVE_VOLUME")
    proof, mountpoint = volume_proof(journal, root, require_recorded=False)
    journal.value["volumeProof"] = proof
    journal.save("MOUNT_BUDGET")
    journal.value["mountBudget"] = budget(mountpoint, journal.backup)
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
    quiesced(journal.spec, journal.state)
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
    if files != archive.files or expanded != archive.expanded:
        raise RuntimeError("RestoreMismatch")
    return files, expanded


def cleanup(journal, root, extractor_image):
    """Remove only recorded own IDs; a cleanup failure cannot erase primary."""
    for role, image in (("snapshot", extractor_image), ("pb", IMAGE), ("extractor", extractor_image)):
        if journal.value.get(role + "CleanupAttempted"):
            continue
        if journal.value[role + "Id"] is None:
            if journal.value.get(role + "CreateIssued"):
                phase = "CLEANUP_SNAPSHOT" if role == "snapshot" else "CLEANUP_PB" if role == "pb" else "CLEANUP_EXTRACTOR"
                journal.value["cleanup"].append(failure(RuntimeError("CreationOutcomeUnresolved"), phase))
                journal.save()
            continue
        phase = "CLEANUP_SNAPSHOT" if role == "snapshot" else "CLEANUP_PB" if role == "pb" else "CLEANUP_EXTRACTOR"
        try:
            journal.gate()
            journal.value[role + "CleanupAttempted"] = True
            journal.save(phase)
            raw = snapshot_proof(journal, image) if role == "snapshot" else container_proof(journal, role, image)
            if raw["running"]:
                command(["docker", "stop", journal.value[role + "Id"]], timeout=35)
            if (snapshot_proof(journal, image) if role == "snapshot" else container_proof(journal, role, image))["running"]:
                raise RuntimeError("ContainerOwnershipUnknown")
            journal.gate()
            command(["docker", "rm", journal.value[role + "Id"]])
            absent("container", journal.value[role + "Id"])
            journal.value[role + "Removed"] = True
            journal.save()
        except Exception as exc:
            journal.value["cleanup"].append(failure(exc, phase))
            journal.save()
    if journal.value["volumeProof"] is not None and not journal.value.get("volumeCleanupAttempted"):
        phase = "CLEANUP_VOLUME"
        try:
            journal.gate()
            journal.value["volumeCleanupAttempted"] = True
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
    elif journal.value["volumeProof"] is None and journal.value.get("volumeCreateIssued"):
        journal.value["cleanup"].append(failure(RuntimeError("CreationOutcomeUnresolved"), "CLEANUP_VOLUME"))
        journal.save()


def summary(journal):
    return {"primary": journal.value["primary"], "cleanup": journal.value["cleanup"],
            "files": journal.value.get("filesVerified", 0), "bytes": journal.value.get("bytesVerified", 0),
            "recordId": journal.owner, "finished": journal.value["finished"]}


def snapshot_proof(journal, image):
    selected = journal.value["snapshotId"]
    if not isinstance(selected, str) or not HEX.fullmatch(selected):
        raise RuntimeError("ContainerOwnershipUnknown")
    raw = json.loads(command(["docker", "container", "inspect", "--format", CONTAINER, selected]).stdout)
    expected = {"id": selected, "image": image, "name": "/" + journal.value["snapshot"],
                "network": "none", "readonly": True, "bindingsNone": True, "networks": ["none"],
                "entrypoint": ["/bin/tar"], "cmd": ["-C", "/source", "-czf", "-", "."],
                "owner": journal.owner, "nonce": journal.nonce,
                "mounts": [{"type": "volume", "name": c.SPECS["fodaveg"]["volume"], "dest": "/source", "rw": False}]}
    if (not isinstance(raw, dict) or set(raw) != set(expected) | {"running", "status", "exitCode"}
            or any(raw[key] != value for key, value in expected.items())
            or any(type(raw[key]) is not bool for key in ("running", "readonly", "bindingsNone"))
            or type(raw["mounts"][0]["rw"]) is not bool
            or raw["status"] not in {"created", "running", "exited"}
            or raw["running"] != (raw["status"] == "running")
            or type(raw["exitCode"]) is not int or not 0 <= raw["exitCode"] <= 255):
        raise RuntimeError("ContainerOwnershipUnknown")
    return raw


def snapshot(journal, spec, state, image, root):
    """Capture bounded private gzip in server RAM from a recorded readonly worker."""
    journal.gate()
    absent("container", journal.value["snapshot"])
    journal.save("CREATE_SNAPSHOT")
    journal.value["snapshotCreateIssued"] = True
    journal.save()
    journal.gate()
    quiesced(spec, state)
    budget(root / "volumes", journal.backup, snapshot=True)
    memory_budget()
    labels = ["--label", "vega.fod.reprobe=" + journal.owner, "--label", "vega.fod.nonce=" + journal.nonce]
    raw = command(["docker", "create", "--pull=never", "--name", journal.value["snapshot"], *labels,
                   "--network", "none", "--read-only", "--entrypoint", "/bin/tar", "--volume",
                   spec["volume"] + ":/source:ro", image, "-C", "/source", "-czf", "-", "."]).stdout.decode("ascii", "strict").strip()
    if not HEX.fullmatch(raw):
        raise RuntimeError("ContainerOwnershipUnknown")
    journal.value["snapshotId"] = raw
    journal.save("START_SNAPSHOT")
    journal.gate()
    if snapshot_proof(journal, image)["status"] != "created":
        raise RuntimeError("ContainerOwnershipUnknown")
    quiesced(spec, state)
    memory_budget()
    budget(root / "volumes", journal.backup, snapshot=True)
    try:
        result = capture_process(["docker", "start", "--attach", raw], timeout=600, limit=SNAPSHOT_CAP)
    except Exception:
        raise RuntimeError("SnapshotBoundExceeded") from None
    if result.returncode:
        raise CommandExit(result.returncode)
    observed = snapshot_proof(journal, image)
    if observed["status"] != "exited" or observed["exitCode"]:
        if observed["exitCode"]:
            raise CommandExit(observed["exitCode"])
        raise RuntimeError("ContainerOwnershipUnknown")
    # Exited snapshot is not a production-volume user. Recheck before writing.
    quiesced(spec, state)
    if not 1 <= len(result.stdout) <= SNAPSHOT_CAP:
        raise RuntimeError("SnapshotBoundExceeded")
    journal.save("SAVE_SNAPSHOT")
    journal.gate()
    budget(root / "volumes", journal.backup, snapshot=True)
    path = journal.backup / "data.tgz"
    parent = c.parent_fd(path)
    try:
        selected_parent = os.fstat(parent)
        if [selected_parent.st_dev, selected_parent.st_ino, selected_parent.st_uid, selected_parent.st_gid, stat.S_IMODE(selected_parent.st_mode)] != journal.directory_identity:
            raise RuntimeError("JournalDrift")
        journal.gate()
        fd = os.open(path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
        with os.fdopen(fd, "wb") as stream:
            stream.write(result.stdout)
            stream.flush()
            os.fsync(stream.fileno())
            selected = c.identity(os.fstat(stream.fileno()))
        os.fsync(parent)
    finally:
        os.close(parent)
    del result
    archive = Archive(journal.backup, selected)
    journal.value["archive"] = {"sha": archive.sha, "size": archive.size, "identity": selected,
                                "files": archive.files, "expanded": archive.expanded}
    journal.save()
    return archive


def preflight_budget():
    """Actual default allocator, full snapshot cap and clone cap before STOP."""
    root = allocator()
    memory_budget()
    return budget(root / "volumes", c.ROOT, snapshot=True)


def probe(backup, spec, state):
    """Fresh snapshot/clone with explicit stopped OLD guards, durable primary."""
    global ACTIVE
    quiesced(spec, state)
    root = allocator()
    budget(root / "volumes", backup, snapshot=True)
    image = h.image_id(h.BACKUP_IMAGE)
    if not isinstance(image, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", image) or h.image_id(IMAGE) != IMAGE:
        raise RuntimeError("TestIdentityUnknown")
    journal = Journal(backup, spec, state)
    ACTIVE = journal
    archive = None
    try:
        archive = snapshot(journal, spec, state, image, root)
        # Remove the recorded snapshot worker before allocating the clone.
        cleanup(journal, root, image)
        if journal.value["cleanup"]:
            raise RuntimeError("ProbeFailed")
        quiesced(spec, state)
        journal.save("ALLOCATOR")
        mountpoint = create_volume(journal, root)
        create_container(journal, "extractor", image, root)
        volume_proof(journal, root)
        budget(mountpoint, backup)
        journal.save("START_EXTRACTOR")
        if container_proof(journal, "extractor", image)["status"] != "created":
            raise RuntimeError("ContainerOwnershipUnknown")
        volume_proof(journal, root)
        archive.gate()
        journal.gate()
        quiesced(spec, state)
        archive.stream.seek(0)
        command(["docker", "start", "--attach", "--interactive", journal.value["extractorId"]], timeout=600, stdin=archive.stream)
        extracted = container_proof(journal, "extractor", image)
        if extracted["status"] != "exited":
            raise RuntimeError("ContainerOwnershipUnknown")
        if extracted["exitCode"]:
            raise CommandExit(extracted["exitCode"])
        volume_proof(journal, root)
        journal.save("VERIFY_BYTES")
        journal.value["filesVerified"], journal.value["bytesVerified"] = verify_bytes(archive, mountpoint)
        journal.save()
        budget(mountpoint, backup, pb_only=True)
        create_container(journal, "pb", IMAGE, root)
        volume_proof(journal, root)
        journal.save("START_PB")
        if container_proof(journal, "pb", IMAGE)["status"] != "created":
            raise RuntimeError("ContainerOwnershipUnknown")
        volume_proof(journal, root)
        journal.gate()
        quiesced(spec, state)
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
                value = json.loads(command(["docker", "exec", journal.value["pbId"], "wget", "-qO-", "http://127.0.0.1:8090/api/health"], timeout=5).stdout)
                healthy = isinstance(value, dict) and type(value.get("code")) is int and value["code"] == 200
                if healthy:
                    break
            except (RuntimeError, ValueError):
                pass
            time.sleep(1)
        if not healthy:
            raise RuntimeError("CloneUnhealthy")
        archive.gate()
        quiesced(spec, state)
        journal.save("PRIMARY_PASSED")
    except Exception as exc:
        journal.value["primary"] = failure(exc, journal.value["phase"])
        journal.save()  # Primary must be durable before any cleanup effect.
    finally:
        if archive is not None:
            archive.close()
    cleanup(journal, root, image)
    quiesced(spec, state)
    journal.value["finished"] = True
    journal.save("FINAL")
    if journal.value["primary"] or journal.value["cleanup"]:
        raise RuntimeError("ProbeFailed")
    return journal.value["archive"]["sha"], journal.value["archive"]["size"], journal.value["filesVerified"], journal.value["bytesVerified"]
