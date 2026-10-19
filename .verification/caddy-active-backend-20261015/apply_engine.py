"""Local, transport-free Caddy four-file apply engine. Runtime callbacks are mandatory.

No production entry point is supplied until a final validation receipt, reviewed
transformer, runtime identity checks and application authority exist.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import uuid

PATHS = ('Caddyfile', 'conf.d/vega.caddy', 'conf.d/admin-lumbre-pro.caddy',
         'conf.d/fodaveg.caddy')
STATES = ('PREPARED', 'STAGED', 'INSTALLED_UNLOADED', 'RELOADED', 'SMOKED',
          'ACCEPTED', 'ROLLED_BACK', 'STOP_NEEDS_OPERATOR')

def sha(data):
    return hashlib.sha256(data).hexdigest()


def open_dir(path):
    """Pin every directory component, refusing ancestor symlinks."""
    path = Path(path)
    if not path.is_absolute():
        raise Stop('PATH_NOT_ABSOLUTE')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parts[1:]:
            following = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                dir_fd=fd)
            os.close(fd)
            fd = following
        return fd
    except Exception:
        os.close(fd)
        raise

class Stop(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def require_ready(package, artifacts):
    """Authenticate the exact producer bytes before loading executable input."""
    if not isinstance(package, dict) or package.get('status') != 'FINAL_VALIDATED':
        raise Stop('INPUT_NOT_FINAL')
    allowed_package={'status','operationId','transformerSHA256','validatorSHA256',
                     'validationOperationId','sources','postimages','runtimeIdentity',
                     'composeGuards','validationManifestSHA256','validationReceiptSHA256',
                     'validationProjectionSHA256','rollbackBaseline'}
    if set(package)!=allowed_package or package.get('rollbackBaseline') != {
            'hosts':['admin.vegacms.com','admin.lumbre.pro','admin.fodaveg.net'],
            'rootStatus':200,'healthStatus':200}:
        raise Stop('INPUT_SHAPE')
    if not isinstance(artifacts, dict) or set(artifacts) != {'manifest','receipt','projection','transformer'} or any(not isinstance(v,bytes) for v in artifacts.values()):
        raise Stop('ARTIFACTS_MISSING')
    if (not isinstance(package.get('operationId'), str) or
            not isinstance(package.get('transformerSHA256'), str) or
            set(package.get('sources', {})) != set(PATHS) or
            set(package.get('postimages', {})) != set(PATHS) or
            not isinstance(package.get('runtimeIdentity'), dict)):
        raise Stop('INPUT_SHAPE')
    for name, field in (('manifest','validationManifestSHA256'),
                        ('receipt','validationReceiptSHA256'),
                        ('projection','validationProjectionSHA256'),
                        ('transformer','transformerSHA256')):
        if sha(artifacts[name]) != package.get(field):
            raise Stop('ARTIFACT_SEAL')
    try:
        manifest=json.loads(artifacts['manifest'])
        receipt=json.loads(artifacts['receipt'])
        evidence=json.loads(artifacts['projection'])
    except (ValueError,UnicodeError):
        raise Stop('ARTIFACT_SCHEMA') from None
    if (not isinstance(manifest,dict) or set(manifest) !=
            {'schemaVersion','operationId','files','dependencies','postimages'} or
            manifest['schemaVersion'] != 'caddy-four-delta-v1' or
            manifest['operationId'] != package.get('validationOperationId') or
            manifest['postimages'] != package['postimages'] or
            not isinstance(manifest['files'],dict) or
            manifest['files'].get('transformer.py') != package['transformerSHA256'] or
            not isinstance(manifest['dependencies'],dict)):
        raise Stop('ARTIFACT_SCHEMA')
    if (not isinstance(receipt,dict) or set(receipt) !=
            {'operationId','status','validationStatus','transportExit','manifestSHA256',
             'projectionSHA256','transformerSHA256'} or
            receipt['operationId'] != package.get('validationOperationId') or
            receipt['status'] != 'PROJECTED' or receipt['transportExit'] != 0 or
            receipt['validationStatus'] != 'VALIDATED_RESOURCE_TEST_COPY_NOT_LITERAL_PRODUCTION' or
            receipt['manifestSHA256'] != package['validationManifestSHA256'] or
            receipt['projectionSHA256'] != package['validationProjectionSHA256'] or
            receipt['transformerSHA256'] != package['transformerSHA256']):
        raise Stop('VALIDATION_NOT_FINAL')
    try:
        uuid.UUID(package['operationId'])
    except (ValueError, AttributeError):
        raise Stop('INPUT_SHAPE') from None
    identity = package['runtimeIdentity']
    if (set(identity) != {'caddyImageId', 'caddyId', 'consumers', 'composeGuards'} or
            not isinstance(identity['caddyImageId'],str) or
            not re.fullmatch(r'sha256:[0-9a-f]{64}',identity['caddyImageId']) or
            not isinstance(identity['caddyId'],str) or
            not re.fullmatch(r'[0-9a-f]{64}',identity['caddyId']) or
            not isinstance(package['validatorSHA256'],str) or
            not re.fullmatch(r'[0-9a-f]{64}',package['validatorSHA256']) or
            not isinstance(identity['consumers'], dict) or
            identity['composeGuards'] != package.get('composeGuards')):
        raise Stop('INPUT_SHAPE')
    if (set(identity['consumers']) != {'vega-pb','lumbre-admin-pb','fodaveg'} or
            set(package['composeGuards']) != {'edge','vega','lumbre','fodaveg'} or
            any(not isinstance(value,str) or not re.fullmatch(r'[0-9a-f]{64}',value)
                for value in identity['consumers'].values()) or
            any(not isinstance(value,str) or not re.fullmatch(r'[0-9a-f]{64}',value)
                for value in package['composeGuards'].values())):
        raise Stop('INPUT_SHAPE')
    known = dict(zip(('root', 'vega', 'lumbre', 'fodaveg'),
                     (package['sources'][name] for name in PATHS)))
    allowed_projection={'schemaVersion','status','failureClass','sourceFiles',
        'referencedCount','presentCount','adaptExit','validateExit','writersRemapped',
        'storageExplicit','nativePatchChecks','commandVerified','closureVerified',
        'globalLogMerged','globalLogFilterVerified','policyRestored','scratchRemoved',
        'knownGuards','composeGuards','imageId','diskBefore','diskAfter',
        'postimageSHA256','routingPreserved'}
    if (not isinstance(evidence, dict) or
            set(evidence)-allowed_projection or
            evidence.get('schemaVersion') != 'caddy-four-delta-v1' or
            evidence.get('status') != receipt['validationStatus'] or
            evidence.get('knownGuards') != known or
            evidence.get('postimageSHA256') != package['postimages'] or
            evidence.get('composeGuards') != package.get('composeGuards') or
            evidence.get('imageId') != package['runtimeIdentity'].get('caddyImageId') or
            evidence.get('commandVerified') is not True):
        raise Stop('VALIDATION_BINDING')
    for name in PATHS:
        if not all(isinstance(package[field][name], str) and re.fullmatch(r'[0-9a-f]{64}', package[field][name])
                   for field in ('sources', 'postimages')):
            raise Stop('INPUT_SHAPE')
    if not all(evidence.get(key) is True for key in ('closureVerified', 'globalLogMerged', 'globalLogFilterVerified', 'policyRestored', 'scratchRemoved')) or evidence.get('adaptExit') != 0 or evidence.get('validateExit') != 0:
        raise Stop('VALIDATION_INCOMPLETE')
    return True


def snapshot(path):
    """No symlinks; identity and bytes from one opened regular-file inode."""
    parent = open_dir(path.parent)
    try:
        info = os.stat(path.name, dir_fd=parent, follow_symlinks=False)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise Stop('SOURCE_TYPE')
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        try:
            before = os.fstat(fd)
            data = bytearray()
            while True:
                chunk = os.read(fd, 65536)
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > 16 * 1024 * 1024:
                    raise Stop('SOURCE_LIMIT')
            after = os.fstat(fd)
            key = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid, s.st_size, s.st_mtime_ns)
            if key(info) != key(before) or key(before) != key(after):
                raise Stop('SOURCE_CHANGED')
            return {'identity': key(after), 'sha256': sha(data), 'bytes': bytes(data)}
        finally:
            os.close(fd)
    finally:
        os.close(parent)


def write_exclusive(path, data, mode=0o600, owner=None):
    parent = open_dir(path.parent)
    try:
        fd = os.open(path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     mode, dir_fd=parent)
        try:
            if owner and (os.fstat(fd).st_uid, os.fstat(fd).st_gid) != owner:
                os.fchown(fd, *owner)
            view = memoryview(data)
            while view:
                view = view[os.write(fd, view):]
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        os.close(parent)
    if sha(snapshot(path)['bytes']) != sha(data):
        raise Stop('STAGE_VERIFY')


def fsync_dir(path):
    fd = open_dir(path)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def journal(directory, value):
    payload = json.dumps(value, sort_keys=True).encode() + b'\n'
    pending = directory / 'journal.pending'
    write_exclusive(pending, payload)
    replace_same_dir(pending, directory / 'journal.json')
    fsync_dir(directory)


def replace_same_dir(source, target):
    if source.parent != target.parent:
        raise Stop('REPLACE_SCOPE')
    parent = open_dir(source.parent)
    try:
        os.replace(source.name, target.name, src_dir_fd=parent, dst_dir_fd=parent)
        os.fsync(parent)
    finally:
        os.close(parent)


def remove_owned_stage(path, expected):
    try:
        seen = snapshot(path)
        if (seen['identity'], seen['sha256']) != (expected['identity'], expected['sha256']):
            raise Stop('STAGE_CHANGED')
    except FileNotFoundError:
        return
    parent = open_dir(path.parent)
    try:
        os.unlink(path.name, dir_fd=parent)
        os.fsync(parent)
    finally:
        os.close(parent)


def projection(operation, phase, failure, backups=False, rollback=False):
    if phase not in STATES or failure not in {'NONE', 'INPUT', 'GUARD', 'SOURCE',
                                                'VALIDATE', 'RELOAD', 'SMOKE', 'CAS',
                                                'UNKNOWN'}:
        raise ValueError('closed projection')
    return {'operationId': operation, 'phase': phase, 'failureClass': failure,
            'backupVerified': bool(backups), 'rollbackVerified': bool(rollback)}


def tree_hash(images):
    digest = hashlib.sha256()
    for name in PATHS:
        digest.update(name.encode() + b'\0' + hashlib.sha256(images[name]).digest())
    return digest.hexdigest()


class Engine:
    def __init__(self, root, backup_base, package, artifacts, observe, validate, reload, smoke, rollback_smoke):
        require_ready(package, artifacts)
        transform_source=artifacts['transformer']
        transformer = {'__name__': 'sealed_transformer'}
        exec(compile(transform_source, '<sealed-transformer>', 'exec'), transformer)
        if not callable(transformer.get('build_postimages')):
            raise Stop('TRANSFORMER_SHAPE')
        self.root = Path(root)
        self.backup_base = Path(backup_base)
        self.package = package
        self.observe = observe  # runtime IDs, image, Compose, closure/env fingerprint, mounts/admin
        self.transform = transformer['build_postimages']  # reviewed SHA-bound exact four-postimage transform
        self.validate = validate  # same image/consumer isolated adapt + validate, no listeners
        self.reload = reload  # one reload of same existing Caddy ID; may raise on uncertainty
        self.smoke = smoke  # finite headers/panel/assets/API/peers; logger check separately authorized
        self.rollback_smoke = rollback_smoke
        self.operation = str(uuid.UUID(package['operationId']))
        if self.root.resolve() == self.backup_base.resolve() or self.backup_base.resolve().is_relative_to(self.root.resolve()):
            raise Stop('BACKUP_LOCATION')
        backup_fd = open_dir(self.backup_base)
        try:
            info = os.fstat(backup_fd)
            if stat.S_IMODE(info.st_mode) != 0o700 or info.st_uid != os.geteuid():
                raise Stop('BACKUP_BASE_UNSAFE')
        finally:
            os.close(backup_fd)

    def guard_runtime(self):
        actual = self.observe()
        expected = self.package['runtimeIdentity']
        if not isinstance(actual, dict) or actual.get('identity') != expected:
            raise Stop('RUNTIME_IDENTITY')
        for key in ('directoryBindVerified', 'commandVerified', 'configPathMapped',
                    'adminAvailable', 'importsUnchanged', 'referencedEnvUnchanged'):
            if actual.get(key) is not True:
                raise Stop('RUNTIME_PRECONDITION')
        # Log sink and marker authority is not inferred from mounts or validation.
        if actual.get('sinkProof') is not True:
            raise Stop('SINK_UNPROVEN')

    def paths(self):
        return {name: self.root / name for name in PATHS}

    def cas(self, expected):
        self.guard_runtime()
        for name, path in self.paths().items():
            seen = snapshot(path)
            if (seen['identity'], seen['sha256']) != (expected[name]['identity'], expected[name]['sha256']):
                raise Stop('CAS_CHANGED')

    def record(self, directory, phase, failure, installed, next_effect=None, rollback=False):
        public = projection(self.operation, phase, failure, True, rollback)
        private = dict(public, caddyId=self.package['runtimeIdentity']['caddyId'],
                       imageId=self.package['runtimeIdentity']['caddyImageId'],
                       consumerIds=self.package['runtimeIdentity']['consumers'],
                       composeGuards=self.package['composeGuards'],
                       installed=sorted(installed), nextEffect=next_effect,
                       originalSHA256=self.package['sources'],
                       postSHA256=self.package['postimages'])
        journal(directory, private)
        return public

    def validate_images(self, images):
        proof = self.validate(images)
        return (isinstance(proof, dict) and
                proof.get('imageId') == self.package['runtimeIdentity'].get('caddyImageId') and
                proof.get('caddyId') == self.package['runtimeIdentity'].get('caddyId') and
                proof.get('treeSHA256') == tree_hash(images) and
                proof.get('sameConsumer') is True and
                proof.get('scopeVerified') is True and
                proof.get('adaptExit') == 0 and proof.get('validateExit') == 0)

    def reload_once(self):
        try:
            proof = self.reload()
            if not (isinstance(proof, dict) and
                    proof.get('caddyId') == self.package['runtimeIdentity'].get('caddyId') and
                    proof.get('reloadExit') == 0 and proof.get('samePid1') is True):
                raise RuntimeError('RELOAD_UNCERTAIN')
            self.guard_runtime()
        except Exception:
            raise RuntimeError('RELOAD_UNCERTAIN') from None

    def smoke_public(self):
        proof = self.smoke()
        return isinstance(proof, dict) and all(proof.get(key) is True for key in (
            'headers', 'panels', 'assets', 'api', 'peers', 'loggerMarkerAbsent',
            'loggerControlObserved'))

    def rollback_public(self):
        proof=self.rollback_smoke()
        return isinstance(proof,dict) and all(proof.get(key) is True for key in (
            'baselineServed','peersHealthy','sameCaddyId'))

    def stop_result(self, directory, installed, failure='UNKNOWN'):
        result=projection(self.operation,'STOP_NEEDS_OPERATOR',failure,bool(directory))
        if directory:
            try:
                self.record(directory,'STOP_NEEDS_OPERATOR',failure,installed)
            except Exception:
                pass  # finite return even if journal storage is unavailable
        return result

    def run(self):
        originals, expected, installed = {}, {}, set()
        staged = {}
        directory = None
        phase = 'PREPARED'
        reloaded = False
        try:
            self.guard_runtime()
            for name, path in self.paths().items():
                originals[name] = snapshot(path)
                if originals[name]['sha256'] != self.package['sources'][name]:
                    raise Stop('SOURCE_HASH')
            expected = originals.copy()
            self.cas(expected)
            post = self.transform({name: originals[name]['bytes'] for name in PATHS})
            if not isinstance(post, dict) or set(post) != set(PATHS) or any(
                    not isinstance(post[name], bytes) or len(post[name]) > 16 * 1024 * 1024 or
                    sha(post[name]) != self.package['postimages'][name]
                    for name in PATHS):
                raise Stop('TRANSFORM_MISMATCH')
            # A pre-effect validation is mandatory and must bind to this exact transform.
            if not self.validate_images(post):
                raise Stop('VALIDATE_FAILED')
            self.cas(expected)
            target_directory = self.backup_base / self.operation
            backup_fd = open_dir(self.backup_base)
            try:
                os.mkdir(self.operation, 0o700, dir_fd=backup_fd)  # never reuse an attempt
                os.fsync(backup_fd)
            finally:
                os.close(backup_fd)
            directory = target_directory
            fsync_dir(self.backup_base)
            for name in PATHS:
                self.cas(expected)
                backup = directory / name.replace('/', '__')
                write_exclusive(backup, originals[name]['bytes'])
                if snapshot(backup)['sha256'] != originals[name]['sha256']:
                    raise Stop('BACKUP_MISMATCH')
            self.record(directory, 'PREPARED', 'NONE', installed)
            phase = 'STAGED'
            for name, path in self.paths().items():
                temp = path.parent / ('.' + path.name + '.' + self.operation + '.pending')
                write_exclusive(temp, post[name], stat.S_IMODE(originals[name]['identity'][2]),
                                originals[name]['identity'][3:5])
                staged[name] = (temp, snapshot(temp))
            self.record(directory, phase, 'NONE', installed)
            for name, path in self.paths().items():
                self.cas(expected)
                staged_path, staged_identity = staged[name]
                seen_stage = snapshot(staged_path)
                if (seen_stage['identity'], seen_stage['sha256']) != (staged_identity['identity'], staged_identity['sha256']):
                    raise Stop('STAGE_CHANGED')
                self.record(directory, phase, 'NONE', installed, 'INSTALL:' + name)
                replace_same_dir(staged_path, path)
                expected[name] = snapshot(path)
                if expected[name]['sha256'] != self.package['postimages'][name]:
                    raise Stop('CAS_CHANGED')
                installed.add(name)
            phase = 'INSTALLED_UNLOADED'
            self.cas(expected)
            self.record(directory, phase, 'NONE', installed)
            if not self.validate_images(post):
                raise Stop('VALIDATE_FAILED')
            self.cas(expected)
            # The callback must assert same running Caddy ID before and after one reload.
            self.record(directory, phase, 'NONE', installed, 'RELOAD')
            self.reload_once()
            reloaded = True
            phase = 'RELOADED'
            self.record(directory, phase, 'NONE', installed)
            self.cas(expected)
            if not self.smoke_public():
                raise Stop('SMOKE_FAILED')
            phase = 'SMOKED'
            self.record(directory, phase, 'NONE', installed)
            self.cas(expected)
            phase = 'ACCEPTED'
            result = self.record(directory, phase, 'NONE', installed)
            return result
        except Stop as error:
            failure = ('GUARD' if error.code.startswith('RUNTIME') or error.code == 'SINK_UNPROVEN' else
                       'CAS' if error.code == 'CAS_CHANGED' else
                       'SOURCE' if error.code.startswith(('SOURCE', 'TRANSFORM', 'BACKUP')) else
                       'VALIDATE' if error.code == 'VALIDATE_FAILED' else
                       'SMOKE' if error.code == 'SMOKE_FAILED' else 'UNKNOWN')
            if not directory or not installed:
                try:
                    for path, identity in staged.values():
                        remove_owned_stage(path, identity)
                    if directory:
                        self.record(directory, 'STOP_NEEDS_OPERATOR', failure, installed)
                except Exception:
                    return projection(self.operation, 'STOP_NEEDS_OPERATOR', 'UNKNOWN', bool(directory))
                return projection(self.operation, 'STOP_NEEDS_OPERATOR', failure, bool(directory))
            try:
                # Only own replacements; unknown foreign state leaves backups untouched.
                self.cas(expected)
                for name in reversed(PATHS):
                    if name not in installed:
                        continue
                    self.cas(expected)
                    path = self.paths()[name]
                    self.record(directory, phase, failure, installed, 'RESTORE:' + name)
                    restore = path.parent / ('.' + path.name + '.' + self.operation + '.restore')
                    data = snapshot(directory / name.replace('/', '__'))['bytes']
                    if sha(data) != originals[name]['sha256']:
                        raise Stop('BACKUP_MISMATCH')
                    write_exclusive(restore, data, stat.S_IMODE(originals[name]['identity'][2]),
                                    originals[name]['identity'][3:5])
                    replace_same_dir(restore, path)
                    expected[name] = snapshot(path)
                    installed.remove(name)
                self.cas(expected)
                if reloaded:
                    if not self.validate_images({name: originals[name]['bytes'] for name in PATHS}):
                        raise Stop('ROLLBACK_VALIDATE_FAILED')
                    self.record(directory, phase, failure, installed, 'ROLLBACK_RELOAD')
                    self.reload_once()
                if not self.rollback_public():
                    raise Stop('ROLLBACK_SMOKE_FAILED')
                for path, identity in staged.values():
                    remove_owned_stage(path, identity)
                result = projection(self.operation, 'ROLLED_BACK', failure, True, True)
                self.record(directory, 'ROLLED_BACK', failure, installed, rollback=True)
                return result
            except Exception:
                return self.stop_result(directory,installed)
        except Exception:
            # An uncertain reload/transport or partial filesystem effect is never replayed.
            return self.stop_result(directory,installed)
