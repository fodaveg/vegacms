"""Root-only guarded MIME replacement; raw selected data stays in server RAM.

OPERATION and CANDIDATE are injected from the wrapper's approved byte snapshot.
No environment files/blocks, logs, HTTP headers or shell error text are read.
The two rechecks detect drift; they are not an atomic CAS against alien writers.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import uuid

WEB = Path('/srv/lumbre-web')
CONFIG = WEB / 'Caddyfile'
COMPOSE = WEB / 'compose.yml'
SITE = WEB / 'sites/a598bfe-astro020-pbadmin'
BEFORE = 'fb32709db7dfdf999a41e44cdee6669c141de2ffc067168931a051c9bbad92ba'
AFTER = 'd909f78a737b7970fae80468bb895cd8ac9ee035b1c5892273e73f8f10536d17'
COMPOSE_SHA = '680d04d18b7707fba2e7b377609c70e4f78f7067bb5e4e68e0f19972fd989ef5'
IMAGE = 'caddy@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648'
DIGEST = re.compile(r'sha256:[0-9a-f]{64}\Z')


def sha(body):
    return hashlib.sha256(body).hexdigest()


def open_dir(path):
    """Walk absolute directory components without following any symlink."""
    if not path.is_absolute() or '..' in path.parts:
        raise RuntimeError('PATH_UNKNOWN')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parts[1:]:
            following = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = following
        return fd
    except BaseException:
        os.close(fd)
        raise


def metadata(info, body):
    return {'sha': sha(body), 'mode': stat.S_IMODE(info.st_mode), 'uid': info.st_uid,
            'gid': info.st_gid, 'inode': info.st_ino, 'device': info.st_dev,
            'size': info.st_size, 'mtime': info.st_mtime_ns, 'ctime': info.st_ctime_ns}


def read_at(directory, name):
    """Bounded regular-file read at an already held, no-symlink parent descriptor."""
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    with os.fdopen(fd, 'rb') as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > 65536:
            raise RuntimeError('FILE_SHAPE_UNKNOWN')
        body = stream.read(65537)
        after = os.fstat(stream.fileno())
    if len(body) > 65536 or metadata(before, body) != metadata(after, body):
        raise RuntimeError('FILE_CHANGED')
    return body, metadata(before, body)


def read_file(path):
    directory = open_dir(path.parent)
    try:
        return read_at(directory, path.name)
    finally:
        os.close(directory)


def replace_owned(path, expected, body):
    """Replace matching identity twice; preserve uid/gid/mode and hold the parent FD."""
    directory = open_dir(path.parent)
    temp = '.mime-' + str(uuid.uuid4())
    created = False
    try:
        current, info = read_at(directory, path.name)
        if info != expected:
            raise RuntimeError('DRIFT_BEFORE_WRITE')
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=directory)
        created = True
        with os.fdopen(fd, 'wb') as stream:
            stream.write(body)
            os.fchown(stream.fileno(), expected['uid'], expected['gid'])
            os.fchmod(stream.fileno(), expected['mode'])
            stream.flush()
            os.fsync(stream.fileno())
            temporary = os.fstat(stream.fileno())
        again, info = read_at(directory, path.name)
        if again != current or info != expected:
            raise RuntimeError('DRIFT_BEFORE_REPLACE')
        # Require the held parent still names the expected directory at the path.
        check = open_dir(path.parent)
        try:
            if (os.fstat(check).st_dev, os.fstat(check).st_ino) != (os.fstat(directory).st_dev, os.fstat(directory).st_ino):
                raise RuntimeError('PARENT_CHANGED')
        finally:
            os.close(check)
        os.replace(temp, path.name, src_dir_fd=directory, dst_dir_fd=directory)
        created = False
        os.fsync(directory)
        installed, identity = read_at(directory, path.name)
        if installed != body or identity['inode'] != temporary.st_ino or any(
                identity[key] != expected[key] for key in ('mode', 'uid', 'gid', 'device')):
            raise RuntimeError('POST_WRITE_IDENTITY_UNKNOWN')
        return identity
    finally:
        if created:
            os.unlink(temp, dir_fd=directory)
        os.close(directory)


def backup(body, operation):
    """Create one private operation directory and an exclusive 0600 backup."""
    directory = open_dir(WEB)
    name = '.mime-discovery-' + operation
    try:
        os.mkdir(name, 0o700, dir_fd=directory)
        fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
        try:
            os.fchmod(fd, 0o700)
            leaf = os.open('before.Caddyfile', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                           0o600, dir_fd=fd)
            with os.fdopen(leaf, 'wb') as stream:
                stream.write(body)
                os.fchmod(stream.fileno(), 0o600)
                stream.flush()
                os.fsync(stream.fileno())
            os.fsync(fd)
            observed, meta = read_at(fd, 'before.Caddyfile')
            if observed != body or meta['mode'] != 0o600:
                raise RuntimeError('BACKUP_UNKNOWN')
        finally:
            os.close(fd)
        os.fsync(directory)
    finally:
        os.close(directory)


def run(argv, timeout=30, allow_failure=False):
    result = capture_process(argv, timeout=timeout, limit=65536)
    if result.returncode and not allow_failure:
        raise RuntimeError('COMMAND_FAILED')
    return result.returncode, result.stdout


def quiescent():
    """Observe publisher and builders; do not change their state or read requests."""
    for unit in ('vega-publish.path', 'vega-publish.service'):
        code, output = run(['systemctl', 'is-active', unit], allow_failure=True)
        if code != 3 or output.strip() != b'inactive':
            raise RuntimeError('PUBLISHER_NOT_QUIESCENT')
    parent = open_dir(Path('/srv/lumbre-admin/publish'))
    try:
        try:
            os.stat('request', dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise RuntimeError('REQUEST_PRESENT')
    finally:
        os.close(parent)
    for tag in ('lumbre-web-builder:abb2bb2-candidate', 'lumbre-web-builder:node22-pnpm11'):
        if run(['docker', 'container', 'ls', '--quiet', '--no-trunc', '--filter', 'ancestor=' + tag])[1].strip():
            raise RuntimeError('BUILDER_RUNNING')


def guards():
    quiescent()
    body, meta = read_file(COMPOSE)
    if meta['sha'] != COMPOSE_SHA or b'${' in body or b'env_file:' in body:
        raise RuntimeError('COMPOSE_DRIFT')
    fd = open_dir(SITE)
    try:
        info = os.fstat(fd)
        return {'compose': meta, 'site': (info.st_dev, info.st_ino)}
    finally:
        os.close(fd)


def runtime(expected_image=None, require_healthy=True):
    """Inspect explicit fields only; never ask Docker for Env or full objects."""
    template = ('{"id":{{json .Id}},"image":{{json .Image}},"selector":{{json .Config.Image}},'
                '"running":{{json .State.Running}},"health":{{json .State.Health.Status}},'
                '"readOnly":{{json .HostConfig.ReadonlyRootfs}},"mounts":['
                '{{range $i,$m := .Mounts}}{{if $i}},{{end}}'
                '{"source":{{json $m.Source}},"target":{{json $m.Destination}},'
                '"type":{{json $m.Type}},"rw":{{json $m.RW}}}{{end}}],'
                '"edge":{{if index .NetworkSettings.Networks "edge"}}true{{else}}false{{end}},'
                '"networkCount":{{len .NetworkSettings.Networks}}}')
    item = json.loads(run(['docker', 'container', 'inspect', '--format', template, 'lumbre-web'])[1])
    if set(item) != {'id', 'image', 'selector', 'running', 'health', 'readOnly', 'mounts', 'edge', 'networkCount'}:
        raise RuntimeError('RUNTIME_SHAPE')
    if (not DIGEST.fullmatch(item['image']) or not re.fullmatch('[0-9a-f]{64}', item['id'])
            or item['selector'] != IMAGE or require_healthy and (item['running'] is not True or item['health'] != 'healthy')
            or item['readOnly'] is not True or item['edge'] is not True or item['networkCount'] != 1
            or expected_image is not None and item['image'] != expected_image):
        raise RuntimeError('RUNTIME_DRIFT')
    mounts = sorted(item['mounts'], key=lambda value: value['target'])
    expected = sorted([{'source': str(CONFIG), 'target': '/etc/caddy/Caddyfile', 'type': 'bind', 'rw': False},
                       {'source': str(SITE), 'target': '/srv/site', 'type': 'bind', 'rw': False}], key=lambda value: value['target'])
    if mounts != expected:
        raise RuntimeError('MOUNT_DRIFT')
    image = json.loads(run(['docker', 'image', 'inspect', '--format', '{"id":{{json .Id}},"digests":{{json .RepoDigests}}}', item['image']])[1])
    if set(image) != {'id', 'digests'} or image['id'] != item['image'] or not isinstance(image['digests'], list) or IMAGE not in image['digests']:
        raise RuntimeError('IMAGE_DRIFT')
    return item['image'], item['id']


def recreate():
    return run(['docker', 'compose', '--env-file', '/dev/null', '--file', str(COMPOSE),
                '--project-name', 'lumbre-web', '--project-directory', str(WEB),
                'up', '--detach', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '120',
                '--no-build', '--pull', 'never', 'site'], timeout=150, allow_failure=True)[0]


def pre_recreate(expected_body, expected_meta, initial_guard, image, container_id, *, require_healthy):
    """Fresh owned-file, global-guard and selected-runtime gate immediately before recreate.

    Compare bytes and complete installed identity after checking the other guards;
    an intervening alien edit causes STOP without another recreation. As with the
    replace rechecks, this gate needs the release owner's writer exclusivity.
    """
    if guards() != initial_guard:
        raise RuntimeError('PRE_RECREATE_GUARD_DRIFT')
    if runtime(image, require_healthy=require_healthy) != (image, container_id):
        raise RuntimeError('PRE_RECREATE_RUNTIME_DRIFT')
    observed, meta = read_file(CONFIG)
    if observed != expected_body or meta != expected_meta:
        raise RuntimeError('PRE_RECREATE_FILE_DRIFT')


def apply(operation, candidate):
    """Only rollback a known installed identity; leave any ambiguous write for the owner."""
    result = {'status': 'STOPPED_BEFORE_WRITE', 'backupCreated': False, 'recreateExit': None,
              'rollbackExit': None, 'sameImage': False, 'runtimeChecked': False,
              'publisherQuiescent': False, 'beforeSHA256': BEFORE, 'afterSHA256': AFTER,
              'composeSHA256': COMPOSE_SHA, 'operationId': operation}
    installed = None
    try:
        if str(uuid.UUID(operation)) != operation or sha(candidate) != AFTER:
            raise RuntimeError('INPUT_UNKNOWN')
        initial_guard = guards()
        image, old_id = runtime()
        original, original_meta = read_file(CONFIG)
        if original_meta['sha'] != BEFORE:
            raise RuntimeError('CONFIG_DRIFT')
        backup(original, operation)
        result['backupCreated'] = True
        if guards() != initial_guard or runtime() != (image, old_id):
            raise RuntimeError('PRE_WRITE_DRIFT')
        # Mark possible write before calling: unknown post-rename identity is never blindly undone.
        result['status'] = 'WRITE_IDENTITY_UNKNOWN_NEEDS_OPERATOR'
        installed = replace_owned(CONFIG, original_meta, candidate)
        result['status'] = 'INSTALLED_PENDING_RUNTIME'
        pre_recreate(candidate, installed, initial_guard, image, old_id, require_healthy=True)
        result['recreateExit'] = recreate()
        if result['recreateExit'] != 0:
            raise RuntimeError('RECREATE_FAILED')
        observed, info = read_file(CONFIG)
        if observed != candidate or info != installed or guards() != initial_guard:
            raise RuntimeError('POST_RECREATE_DRIFT')
        new_image, new_id = runtime(image)
        if new_id == old_id:
            raise RuntimeError('RECREATE_NOT_OBSERVED')
        result.update(status='APPLIED_RUNTIME_VERIFIED', sameImage=new_image == image,
                      runtimeChecked=True, publisherQuiescent=True)
        return result
    except Exception:
        if installed is None:
            return result
        result['status'] = 'ROLLBACK_NEEDS_OPERATOR'
        try:
            if guards() != initial_guard:
                return result
            # Identity must still be approved even when failed recreation is unhealthy.
            rollback_image, rollback_id = runtime(image, require_healthy=False)
            _, current = read_file(CONFIG)
            if current != installed:
                return result
            restored = replace_owned(CONFIG, installed, original)
            pre_recreate(original, restored, initial_guard, rollback_image, rollback_id, require_healthy=False)
            result['rollbackExit'] = recreate()
            if result['rollbackExit'] != 0:
                return result
            body, meta = read_file(CONFIG)
            runtime(image)
            if body != original or meta != restored or guards() != initial_guard:
                return result
            result.update(status='ROLLED_BACK_RUNTIME_VERIFIED', sameImage=True,
                          runtimeChecked=True, publisherQuiescent=True)
        except Exception:
            pass
        return result


def main():
    try:
        result = apply(OPERATION, CANDIDATE)
    except Exception:
        result = {'status': 'INPUT_UNKNOWN'}
    print(json.dumps(result, sort_keys=True))
    return 0 if result.get('status') == 'APPLIED_RUNTIME_VERIFIED' else 1


if __name__ == '__main__':
    sys.exit(main())
