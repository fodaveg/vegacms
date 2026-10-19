"""Offline scope/privacy/ownership negatives; never Docker, SSH or network."""
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid

BASE = Path(__file__).resolve().parent


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, BASE / file)
    instance = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(instance)
    return instance


REMOTE = module('mime_remote', 'remote_apply.py')
WRAPPER = module('mime_wrapper', 'run_once.py')
CANDIDATE = (BASE / 'candidate.Caddyfile').read_bytes()
ORIGINAL = CANDIDATE.replace(b'\n\t# Astro genera discovery sin extensi\xc3\xb3n; su contenido sigue siendo JSON.\n\t@vegaDiscovery path /api/vega/discovery\n\theader @vegaDiscovery Content-Type application/json\n\n', b'')


class OwnedFileTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        # Darwin /var may be a symlink: resolve only the known local scratch path.
        self.root = Path(self.scratch.name).resolve()
        self.file = self.root / 'Caddyfile'
        self.file.write_bytes(ORIGINAL)
        self.file.chmod(0o640)

    def tearDown(self):
        self.scratch.cleanup()

    def test_exact_guard_inputs(self):
        self.assertEqual(REMOTE.sha(ORIGINAL), REMOTE.BEFORE)
        self.assertEqual(REMOTE.sha(CANDIDATE), REMOTE.AFTER)

    def test_replace_preserves_identity_attributes(self):
        _, before = REMOTE.read_file(self.file)
        after = REMOTE.replace_owned(self.file, before, CANDIDATE)
        self.assertEqual(self.file.read_bytes(), CANDIDATE)
        self.assertNotEqual(after['inode'], before['inode'])
        for key in ('mode', 'uid', 'gid', 'device'):
            self.assertEqual(after[key], before[key])
        restored = REMOTE.replace_owned(self.file, after, ORIGINAL)
        self.assertEqual(restored['sha'], REMOTE.BEFORE)

    def test_first_recheck_stops_alien_write(self):
        _, before = REMOTE.read_file(self.file)
        self.file.write_bytes(b'alien')
        with self.assertRaises(RuntimeError):
            REMOTE.replace_owned(self.file, before, CANDIDATE)
        self.assertEqual(self.file.read_bytes(), b'alien')

    def test_second_recheck_stops_alien_write(self):
        _, before = REMOTE.read_file(self.file)
        real = REMOTE.read_at
        count = 0
        def mutate(directory, name):
            nonlocal count
            count += 1
            if count == 2:
                self.file.write_bytes(b'alien')
            return real(directory, name)
        with patch.object(REMOTE, 'read_at', side_effect=mutate):
            with self.assertRaises(RuntimeError):
                REMOTE.replace_owned(self.file, before, CANDIDATE)
        self.assertEqual(self.file.read_bytes(), b'alien')
        self.assertEqual(list(self.root.glob('.mime-*')), [])

    def test_leaf_symlink_fifo_and_parent_symlink_stop(self):
        link = self.root / 'linked'
        link.symlink_to(self.file)
        with self.assertRaises(OSError):
            REMOTE.read_file(link)
        fifo = self.root / 'fifo'
        os.mkfifo(fifo)
        with self.assertRaises(RuntimeError):
            REMOTE.read_file(fifo)
        folder = self.root / 'folder'
        folder.mkdir()
        folder.joinpath('file').write_bytes(b'x')
        alias = self.root / 'alias'
        alias.symlink_to(folder)
        with self.assertRaises(OSError):
            REMOTE.read_file(alias / 'file')

    def test_backup_private_exclusive(self):
        operation = str(uuid.uuid4())
        with patch.object(REMOTE, 'WEB', self.root):
            REMOTE.backup(ORIGINAL, operation)
            with self.assertRaises(FileExistsError):
                REMOTE.backup(ORIGINAL, operation)
        folder = self.root / ('.mime-discovery-' + operation)
        self.assertEqual(folder.stat().st_mode & 0o777, 0o700)
        self.assertEqual(folder.joinpath('before.Caddyfile').stat().st_mode & 0o777, 0o600)
        self.assertEqual(folder.joinpath('before.Caddyfile').read_bytes(), ORIGINAL)

    def apply_fixture(self, recreate):
        image = 'sha256:' + 'b' * 64
        initial = 'a' * 64
        current = initial
        def runtime(expected_image=None, require_healthy=True):
            return image, current
        def recreate_identity():
            nonlocal current
            current = 'c' * 64
            return recreate()
        with patch.object(REMOTE, 'CONFIG', self.file), patch.object(REMOTE, 'WEB', self.root), \
                patch.object(REMOTE, 'guards', return_value={'public': True}), \
                patch.object(REMOTE, 'runtime', side_effect=runtime), \
                patch.object(REMOTE, 'recreate', side_effect=recreate_identity):
            return REMOTE.apply(str(uuid.uuid4()), CANDIDATE)

    def test_success_runtime_check_after_recreate(self):
        result = self.apply_fixture(lambda: 0)
        self.assertEqual(result['status'], 'APPLIED_RUNTIME_VERIFIED')
        self.assertEqual(self.file.read_bytes(), CANDIDATE)
        WRAPPER.project(result, result['operationId'])

    def test_failed_recreate_rolls_back_only_owned_file(self):
        returns = iter((4, 0))
        result = self.apply_fixture(lambda: next(returns))
        self.assertEqual(result['status'], 'ROLLED_BACK_RUNTIME_VERIFIED')
        self.assertEqual(result['recreateExit'], 4)
        self.assertEqual(self.file.read_bytes(), ORIGINAL)
        WRAPPER.project(result, result['operationId'])

    def test_alien_write_after_recreate_never_rollback(self):
        def alien():
            self.file.write_bytes(b'alien')
            return 4
        result = self.apply_fixture(alien)
        self.assertEqual(result['status'], 'ROLLBACK_NEEDS_OPERATOR')
        self.assertEqual(self.file.read_bytes(), b'alien')

    def test_alien_after_install_stops_before_any_recreate(self):
        real = REMOTE.replace_owned
        def replace(path, expected, body):
            installed = real(path, expected, body)
            self.file.write_bytes(b'alien-after-install')
            return installed
        with patch.object(REMOTE, 'replace_owned', side_effect=replace):
            with patch.object(REMOTE, 'recreate') as recreate:
                result = self.apply_fixture(lambda: recreate())
        self.assertEqual(result['status'], 'ROLLBACK_NEEDS_OPERATOR')
        self.assertEqual(self.file.read_bytes(), b'alien-after-install')
        recreate.assert_not_called()
        self.assertIsNone(result['recreateExit'])
        self.assertIsNone(result['rollbackExit'])

    def test_alien_after_restore_stops_before_rollback_recreate(self):
        real = REMOTE.replace_owned
        def replace(path, expected, body):
            installed = real(path, expected, body)
            if body == ORIGINAL:
                self.file.write_bytes(b'alien-after-restore')
            return installed
        called = []
        def recreate():
            called.append(True)
            return 4
        with patch.object(REMOTE, 'replace_owned', side_effect=replace):
            result = self.apply_fixture(recreate)
        self.assertEqual(result['status'], 'ROLLBACK_NEEDS_OPERATOR')
        self.assertEqual(self.file.read_bytes(), b'alien-after-restore')
        self.assertEqual(len(called), 1)
        self.assertIsNone(result['rollbackExit'])

    def test_compose_after_restore_stops_before_rollback_recreate(self):
        image = 'sha256:' + 'b' * 64
        old_id = 'a' * 64
        current_id = old_id
        guard = {'compose': 'approved'}
        called = []
        real = REMOTE.replace_owned
        def replace(path, expected, body):
            installed = real(path, expected, body)
            if body == ORIGINAL:
                guard['compose'] = 'alien-compose'
            return installed
        def recreate():
            nonlocal current_id
            called.append(True)
            current_id = 'c' * 64
            return 4
        with patch.object(REMOTE, 'CONFIG', self.file), patch.object(REMOTE, 'WEB', self.root), \
                patch.object(REMOTE, 'guards', side_effect=lambda: dict(guard)), \
                patch.object(REMOTE, 'runtime', side_effect=lambda *a, **k: (image, current_id)), \
                patch.object(REMOTE, 'replace_owned', side_effect=replace), \
                patch.object(REMOTE, 'recreate', side_effect=recreate):
            result = REMOTE.apply(str(uuid.uuid4()), CANDIDATE)
        self.assertEqual(result['status'], 'ROLLBACK_NEEDS_OPERATOR')
        self.assertEqual(self.file.read_bytes(), ORIGINAL)
        self.assertEqual(len(called), 1)
        self.assertIsNone(result['rollbackExit'])


class ApprovalTests(unittest.TestCase):
    def approved(self, base, operation):
        for name in WRAPPER.ARTIFACTS:
            base.joinpath(name).write_bytes((BASE / name).read_bytes() if name != 'checks.json' else b'{}\n')
        manifest = {'operationId': operation, 'files': {
            name: hashlib.sha256(base.joinpath(name).read_bytes()).hexdigest() for name in WRAPPER.ARTIFACTS}}
        base.joinpath('manifest.json').write_text(json.dumps(manifest))
        approval = {'status': 'APPROVED', 'reviewStatus': 'APPROVED', 'operationId': operation,
                    'mode': WRAPPER.MODE, 'scope': WRAPPER.SCOPE,
                    'manifestSHA256': hashlib.sha256(base.joinpath('manifest.json').read_bytes()).hexdigest(),
                    'runtimeApprovalReference': 'SYNTHETIC_OFFLINE_NOT_A_GRANT',
                    'productionFileWriteExplicitlyApproved': True, 'siteRecreateExplicitlyApproved': True}
        base.joinpath('execution-approval.json').write_text(json.dumps(approval))

    def test_snapshot_mutation_cannot_change_transported_buffers(self):
        operation = str(uuid.uuid4())
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            self.approved(base, operation)
            snapshot = WRAPPER.authorize(base, operation)
            expected = WRAPPER.payload(snapshot, operation)
            for name in WRAPPER.ARTIFACTS:
                base.joinpath(name).write_bytes(b'UNAPPROVED_MUTATION')
            self.assertEqual(WRAPPER.payload(snapshot, operation), expected)
            self.assertNotIn(b'UNAPPROVED_MUTATION', expected)
            with self.assertRaises(ValueError):
                WRAPPER.authorize(base, operation)

    def test_missing_or_partial_approval_has_no_connection(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(WRAPPER, '__file__', str(Path(folder) / 'run_once.py')), \
                    patch('sys.argv', ['run_once.py', '--operation-id', str(uuid.uuid4())]), \
                    patch('subprocess.Popen') as connection:
                self.assertEqual(WRAPPER.main(), 1)
                connection.assert_not_called()
                self.assertFalse(Path(folder).joinpath('request-started.json').exists())

    def test_projection_rejects_raw_values_headers_unknown_fields(self):
        item = {'status': 'STOPPED_BEFORE_WRITE', 'backupCreated': False, 'recreateExit': None,
                'rollbackExit': None, 'sameImage': False, 'runtimeChecked': False, 'publisherQuiescent': False,
                'beforeSHA256': REMOTE.BEFORE, 'afterSHA256': REMOTE.AFTER,
                'composeSHA256': REMOTE.COMPOSE_SHA, 'operationId': str(uuid.uuid4())}
        WRAPPER.project(item, item['operationId'])
        for field in ('rawHeaders', 'stderr', 'Env', 'configBytes'):
            with self.assertRaises(ValueError):
                WRAPPER.project(dict(item, **{field: 'PRIVATE'}), item['operationId'])
        with self.assertRaises(ValueError):
            WRAPPER.project(dict(item, recreateExit=True), item['operationId'])

    def test_runtime_only_selected_docker_fields(self):
        seen = []
        image = 'sha256:' + 'a' * 64
        data = {'id': 'b' * 64, 'image': image, 'selector': REMOTE.IMAGE, 'running': True,
                'health': 'healthy', 'readOnly': True, 'edge': True, 'networkCount': 1,
                'mounts': [{'source': str(REMOTE.CONFIG), 'target': '/etc/caddy/Caddyfile', 'type': 'bind', 'rw': False},
                           {'source': str(REMOTE.SITE), 'target': '/srv/site', 'type': 'bind', 'rw': False}]}
        def run(argv, **kwargs):
            seen.append(argv)
            obj = {'id': image, 'digests': [REMOTE.IMAGE]} if argv[1] == 'image' else data
            return 0, json.dumps(obj).encode()
        with patch.object(REMOTE, 'run', side_effect=run):
            self.assertEqual(REMOTE.runtime(), (image, 'b' * 64))
        for command in seen:
            fmt = command[command.index('--format') + 1]
            self.assertNotIn('Env', fmt)
            self.assertNotIn('json .Config}', fmt)
            self.assertNotIn('json .NetworkSettings.Networks', fmt)
            self.assertNotIn('json .Mounts', fmt)

    def test_quiescence_rejects_active_service_without_request_content_read(self):
        with patch.object(REMOTE, 'run', return_value=(0, b'active\n')) as command:
            with self.assertRaises(RuntimeError):
                REMOTE.quiescent()
            self.assertEqual(command.call_args.args[0], ['systemctl', 'is-active', 'vega-publish.path'])

    def test_invalid_candidate_stops_before_any_remote_command(self):
        with patch.object(REMOTE, 'guards') as guard:
            result = REMOTE.apply(str(uuid.uuid4()), b'unapproved')
            self.assertEqual(result['status'], 'STOPPED_BEFORE_WRITE')
            guard.assert_not_called()
            WRAPPER.project(result, result['operationId'])

    def test_capture_discards_stderr_and_caps_raw_stdout(self):
        capture = module('bounded_capture', 'capture.py')
        result = capture.capture_process(['python3', '-B', '-c',
                    'import sys;sys.stdout.write("OK");sys.stderr.write("PRIVATE")'])
        self.assertEqual(result.stdout, b'OK')
        self.assertEqual(result.stderr, b'')
        with self.assertRaises(RuntimeError):
            capture.capture_process(['python3', '-B', '-c', 'print("x" * 4096)'], limit=32)

    def test_recreate_only_site_no_env_file_pull_build(self):
        with patch.object(REMOTE, 'run', return_value=(0, b'')) as command:
            self.assertEqual(REMOTE.recreate(), 0)
        argv = command.call_args.args[0]
        self.assertEqual(argv[-1], 'site')
        self.assertEqual(argv[argv.index('--env-file') + 1], '/dev/null')
        self.assertEqual(argv[argv.index('--pull') + 1], 'never')
        self.assertIn('--no-build', argv)
        self.assertIn('--no-deps', argv)
        self.assertIn('--wait', argv)
        self.assertEqual(argv[argv.index('--project-name') + 1], 'lumbre-web')
        self.assertEqual(argv[argv.index('--project-directory') + 1], str(REMOTE.WEB))


if __name__ == '__main__':
    unittest.main()
