"""Bounded mocked Docker read and one-shot/privacy negatives; no SSH or Docker."""
import importlib.util
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import uuid

BASE = Path(__file__).resolve().parent
NS = {'__name__': 'offline_reader'}
exec(compile(BASE.joinpath('project_metadata.py').read_bytes(), '<frozen_projector>', 'exec'), NS)
exec(compile(BASE.joinpath('remote_read.py').read_bytes(), '<remote_read>', 'exec'), NS)
PINS = json.loads(BASE.joinpath('pins.json').read_bytes())
spec = importlib.util.spec_from_file_location('logs_wrapper', BASE / 'run_once.py')
WRAPPER = importlib.util.module_from_spec(spec)
spec.loader.exec_module(WRAPPER)
OPERATION = str(uuid.uuid4())


def options():
    return {'driver': 'json-file', 'maxSize': '10m', 'maxFile': '3', 'compress': '',
            'mode': '', 'maxBufferSize': '', 'unknownOptions': 0}


class ExecutorTests(unittest.TestCase):
    def read(self, modify=None):
        commands = []
        selected = {item['id']: name for name, item in PINS['containers'].items()}
        identity_seen = {}
        def capture(command, **kwargs):
            self.assertEqual(command[:4], ['docker', 'container', 'inspect', '--format'])
            self.assertEqual(kwargs, {'timeout': 12, 'limit': 8192})
            commands.append(command)
            template, target = command[4:]
            if template == NS['IDENTITY_TEMPLATE']:
                identity_seen[target] = identity_seen.get(target, 0) + 1
                body = dict(PINS['containers'][target])
                phase = 'after_identity' if identity_seen[target] > 1 else 'before_identity'
                name = target
            else:
                name = selected[target]
                phase = 'driver' if template == NS['DRIVER_TEMPLATE'] else 'schema' if template == NS['DOCKER_DRIVER_TEMPLATE'] else 'options'
                body = 'json-file' if phase == 'driver' else {'driver': 'json-file', 'unknownOptions': 0} if phase == 'schema' else options()
            if modify:
                body = modify(name, phase, body)
            return subprocess.CompletedProcess(command, 0, json.dumps(body).encode(), b'')
        with patch.dict(NS, capture_process=capture):
            result = NS['Reader'](PINS).read(OPERATION)
        WRAPPER.project(result, OPERATION)
        return result, commands

    def test_normal_twenty_exact_calls_and_no_full_objects(self):
        result, commands = self.read()
        self.assertEqual(result['status'], 'DOCKER_ONLY_PARTIAL_IDENTITIES_PRESERVED')
        self.assertEqual(result['commands'], 20)
        self.assertTrue(result['identityRecheckPassed'])
        self.assertEqual(result['containers']['vega-pb']['maxBytes'], 10 * 1024 ** 2)
        self.assertFalse(result['taskClosureProved'])
        for command in commands:
            self.assertNotIn('.Config.Env', command[4])
            self.assertNotIn('{{json .HostConfig}}', command[4])
            self.assertNotIn('{{json .HostConfig.LogConfig}}', command[4])
            self.assertNotIn('.LogPath', command[4])
            self.assertNotIn('Health', command[4])
            if command[4] != NS['IDENTITY_TEMPLATE']:
                self.assertIn(command[5], {v['id'] for v in PINS['containers'].values()})

    def test_unknown_or_external_driver_no_schema_or_options(self):
        for driver in ('PRIVATE_CANARY', 'syslog', 'journald'):
            result, commands = self.read(lambda name, phase, body: driver if name == 'vega-pb' and phase == 'driver' else body)
            pin = PINS['containers']['vega-pb']['id']
            self.assertEqual(sum(command[5] == pin for command in commands), 1)
            self.assertNotIn('PRIVATE_CANARY', json.dumps(result))
            self.assertTrue(result['containers']['vega-pb']['status'].startswith('STOP_'))

    def test_unknown_option_keys_no_option_values(self):
        result, commands = self.read(lambda name, phase, body: dict(body, unknownOptions=1) if name == 'vega-pb' and phase == 'schema' else body)
        pin = PINS['containers']['vega-pb']['id']
        self.assertFalse(any(command[5] == pin and command[4] == NS['DOCKER_TEMPLATE'] for command in commands))
        self.assertEqual(result['containers']['vega-pb']['status'], 'STOP_UNKNOWN_OPTIONS_NO_VALUES_REQUESTED')

    def test_private_or_malformed_value_not_exported(self):
        result, _ = self.read(lambda name, phase, body: dict(body, maxSize='PRIVATE_CANARY') if name == 'vega-pb' and phase == 'options' else body)
        self.assertNotIn('PRIVATE_CANARY', json.dumps(result))
        self.assertEqual(result['containers']['vega-pb']['status'], 'STOP_UNKNOWN_METADATA')

    def test_schema_driver_drift_stops_before_option_values(self):
        result, commands = self.read(lambda name, phase, body: dict(body, driver='syslog') if name == 'vega-pb' and phase == 'schema' else body)
        self.assertEqual(result['status'], 'STOP_UNKNOWN_OR_IDENTITY_DRIFT')
        self.assertEqual(result['containers'], {})
        self.assertFalse(any(command[4] == NS['DOCKER_TEMPLATE'] for command in commands))

    def test_recreated_container_recheck_discards_all_observations(self):
        result, _ = self.read(lambda name, phase, body: dict(body, id='f' * 64) if name == 'vega-pb' and phase == 'after_identity' else body)
        self.assertEqual(result['status'], 'STOP_UNKNOWN_OR_IDENTITY_DRIFT')
        self.assertEqual(result['containers'], {})
        self.assertFalse(result['identitiesPreserved'])

    def test_initial_image_drift_does_not_read_logger(self):
        result, commands = self.read(lambda name, phase, body: dict(body, imageId='sha256:' + 'f' * 64) if phase == 'before_identity' else body)
        self.assertEqual(result['commands'], 1)
        self.assertEqual(result['containers'], {})
        self.assertEqual(len(commands), 1)

    def test_extra_raw_fields_rejected_without_export(self):
        result, _ = self.read(lambda name, phase, body: dict(body, Env='PRIVATE_CANARY') if name == 'vega-pb' and phase == 'options' else body)
        self.assertNotIn('PRIVATE_CANARY', json.dumps(result))
        self.assertEqual(result['status'], 'STOP_UNKNOWN_OR_IDENTITY_DRIFT')

    def test_raw_command_error_not_projected(self):
        def fail(*args, **kwargs):
            raise RuntimeError('PRIVATE_CANARY')
        with patch.dict(NS, capture_process=fail):
            result = NS['Reader'](PINS).read(OPERATION)
        WRAPPER.project(result, OPERATION)
        self.assertNotIn('PRIVATE_CANARY', json.dumps(result))
        self.assertEqual(result['containers'], {})

    def test_count_cap_and_pin_scope_fail_closed(self):
        reader = NS['Reader'](PINS)
        reader.calls = 20
        with patch.dict(NS, capture_process=lambda *a, **kw: self.fail('Unexpected Docker execution')):
            with self.assertRaises(ValueError):
                reader.inspect('vega-pb', NS['IDENTITY_TEMPLATE'])
        self.assertEqual(reader.calls, 20)
        with self.assertRaises(ValueError):
            NS['Reader'](dict(PINS, Env='PRIVATE_CANARY'))


class WrapperTests(unittest.TestCase):
    def approve(self, base):
        for name in WRAPPER.ARTIFACTS:
            base.joinpath(name).write_bytes(BASE.joinpath(name).read_bytes() if name != 'checks.json' else b'{}\n')
        manifest = {'operationId': OPERATION, 'files': {name: hashlib.sha256(base.joinpath(name).read_bytes()).hexdigest() for name in WRAPPER.ARTIFACTS}}
        base.joinpath('manifest.json').write_text(json.dumps(manifest))
        approval = {'status': 'APPROVED', 'reviewStatus': 'APPROVED', 'operationId': OPERATION,
                    'mode': WRAPPER.MODE, 'scope': WRAPPER.SCOPE,
                    'manifestSHA256': hashlib.sha256(base.joinpath('manifest.json').read_bytes()).hexdigest(),
                    'runtimeApprovalReference': 'SYNTHETIC_OFFLINE_NOT_A_GRANT',
                    'selectiveDockerMetadataAccessExplicitlyApproved': True,
                    'environmentOrLogContentAccessApproved': False}
        base.joinpath('execution-approval.json').write_text(json.dumps(approval))

    def test_snapshot_mutation_never_changes_transmitted_buffers(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            self.approve(base)
            snapshot = WRAPPER.authorize(base, OPERATION)
            original = WRAPPER.payload(snapshot, OPERATION)
            for name in WRAPPER.ARTIFACTS:
                base.joinpath(name).write_bytes(b'UNAPPROVED_MUTATION')
            self.assertEqual(WRAPPER.payload(snapshot, OPERATION), original)
            self.assertNotIn(b'UNAPPROVED_MUTATION', original)
            compile(original, '<approved_remote_payload>', 'exec')
            with self.assertRaises(ValueError):
                WRAPPER.authorize(base, OPERATION)

    def test_missing_approval_zero_connections_no_marker(self):
        with tempfile.TemporaryDirectory() as folder, patch('subprocess.Popen') as connection, \
                patch.object(WRAPPER, '__file__', str(Path(folder) / 'run_once.py')), \
                patch('sys.argv', ['run_once.py', '--operation-id', OPERATION]):
            self.assertEqual(WRAPPER.main(), 1)
            connection.assert_not_called()
            self.assertFalse(Path(folder).joinpath('request-started.json').exists())

    def test_consumed_marker_prevents_second_connection(self):
        snapshot = {name: BASE.joinpath(name).read_bytes() for name in ('capture.py', 'project_metadata.py', 'remote_read.py', 'pins.json')}
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            base.joinpath('request-started.json').write_text('{}')
            with patch.object(WRAPPER, '__file__', str(base / 'run_once.py')), \
                    patch.object(WRAPPER, 'authorize', return_value=snapshot), \
                    patch('sys.argv', ['run_once.py', '--operation-id', OPERATION]), \
                    patch('subprocess.Popen') as connection:
                self.assertEqual(WRAPPER.main(), 1)
                connection.assert_not_called()

    def test_projection_rejects_private_data_and_positive_global_claims(self):
        result, _ = ExecutorTests().read()
        for key in ('Env', 'HealthOutput', 'LogPath', 'headers', 'rawConfig', 'stderr'):
            with self.assertRaises(ValueError):
                WRAPPER.project(dict(result, **{key: 'PRIVATE_CANARY'}), OPERATION)
        for key in ('taskClosureProved', 'globalTokenAbsenceClaimed', 'remoteWrites', 'logsRead', 'configEnvRead'):
            with self.assertRaises(ValueError):
                WRAPPER.project(dict(result, **{key: True}), OPERATION)


if __name__ == '__main__':
    unittest.main()
