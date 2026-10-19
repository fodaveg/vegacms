"""Offline synthetic proof of scalar projection and privacy failures; no network."""
import json
from pathlib import Path
import unittest
import project_metadata as projection


def fixture():
    return {'driver': 'json-file', 'maxSize': '10m', 'maxFile': '3',
            'compress': '', 'mode': '', 'maxBufferSize': '', 'unknownOptions': 0}


class ProjectionTests(unittest.TestCase):
    def test_explicit_rotation_is_not_time_retention_or_secret_safety(self):
        item = projection.docker_projection(fixture())
        self.assertEqual(item['maxBytes'], 10 * 1024 ** 2)
        self.assertEqual(item['maxFiles'], 3)
        self.assertIsNone(item['retentionDays'])
        self.assertFalse(item['effectiveTokenSafetyProved'])
        self.assertEqual(item['readerPolicy'], 'NOT_OBSERVED')

    def test_missing_options_never_infer_docker_defaults(self):
        item = projection.docker_projection(dict(fixture(), maxSize='', maxFile=''))
        self.assertEqual(item['status'], 'STOP_ROTATION_DEFAULT_OR_UNSET_UNKNOWN')
        self.assertIsNone(item['maxBytes'])
        self.assertIsNone(item['maxFiles'])

    def test_private_unknown_key_names_or_values_not_reflected(self):
        for raw in (dict(fixture(), Env='PRIVATE_CANARY'), dict(fixture(), driver='PRIVATE_CANARY'),
                    dict(fixture(), maxSize='PRIVATE_CANARY'), dict(fixture(), maxFile='PRIVATE_CANARY'),
                    dict(fixture(), mode='PRIVATE_CANARY'), dict(fixture(), compress='PRIVATE_CANARY'),
                    dict(fixture(), unknownOptions=1), dict(fixture(), unknownOptions=True)):
            text = json.dumps(projection.docker_projection(raw))
            self.assertNotIn('PRIVATE_CANARY', text)
            self.assertIn('STOP_', text)

    def test_external_driver_retention_is_unknown(self):
        for driver in ('journald', 'syslog', 'fluentd', 'gelf', 'awslogs', 'splunk', 'gcplogs'):
            item = projection.docker_projection(dict(fixture(), driver=driver))
            self.assertEqual(item['status'], 'STOP_EXTERNAL_OR_JOURNAL_RETENTION_UNKNOWN')
            self.assertFalse(item['effectiveTokenSafetyProved'])

    def test_no_driver_does_not_prove_no_other_sinks(self):
        raw = dict(fixture(), driver='none', maxSize='', maxFile='')
        item = projection.docker_projection(raw)
        self.assertEqual(item['status'], 'DOCKER_STREAM_DISABLED_OTHER_SINKS_UNKNOWN')
        self.assertFalse(item['effectiveTokenSafetyProved'])

    def test_local_rotation_compression_nonblocking_is_finite(self):
        item = projection.docker_projection(dict(fixture(), driver='local', compress='true',
                                                mode='non-blocking', maxBufferSize='1m'))
        self.assertEqual(item['compressed'], 'TRUE')
        self.assertEqual(item['delivery'], 'NON_BLOCKING')
        self.assertEqual(item['bufferBytes'], 1024 ** 2)
        self.assertEqual(item['status'], 'CONFIGURED_SIZE_COUNT_ONLY_OTHER_SINKS_UNKNOWN')

    def test_malformed_negative_large_options_stop(self):
        for bad in ('-1', '0', '0m', '10MB', '1.5m', '1000000000g'):
            self.assertEqual(projection.docker_projection(dict(fixture(), maxSize=bad))['status'], 'STOP_UNKNOWN_METADATA')
        self.assertEqual(projection.docker_projection(dict(fixture(), maxFile='10000'))['status'], 'STOP_UNKNOWN_METADATA')
        self.assertEqual(projection.docker_projection(dict(fixture(), compress='true'))['status'], 'STOP_UNKNOWN_METADATA')

    def test_all_three_admins_plus_edge_required_task_never_closed(self):
        raw = {name: fixture() for name in projection.CONTAINERS}
        item = projection.inventory_projection(raw)
        self.assertEqual(len(item['containers']), 4)
        self.assertFalse(item['taskClosureProved'])
        del raw['edge-caddy']
        with self.assertRaises(ValueError):
            projection.inventory_projection(raw)

    def test_first_gate_stops_unknown_schema_before_option_values(self):
        for raw in ({'driver': 'PRIVATE_CANARY', 'unknownOptions': 0},
                    {'driver': 'syslog', 'unknownOptions': 0},
                    {'driver': 'json-file', 'unknownOptions': 1},
                    {'driver': 'local', 'unknownOptions': True}):
            item = projection.driver_gate(raw)
            self.assertFalse(item['readRotationValuesAllowed'])
            self.assertNotIn('PRIVATE_CANARY', json.dumps(item))
        for driver in ('json-file', 'local', 'none'):
            self.assertTrue(projection.driver_gate({'driver': driver, 'unknownOptions': 0})['readRotationValuesAllowed'])
        self.assertNotIn('index .HostConfig.LogConfig.Config', projection.DOCKER_DRIVER_TEMPLATE)
        self.assertNotIn('{{json $k}}', projection.DOCKER_DRIVER_TEMPLATE)
        self.assertNotIn('{{json $v}}', projection.DOCKER_DRIVER_TEMPLATE)

    def test_reader_has_no_execution_or_file_access(self):
        import ast
        tree = ast.parse(Path(projection.__file__).read_bytes())
        imports = {alias.name for n in tree.body if isinstance(n, ast.Import) for alias in n.names}
        self.assertEqual(imports, {'re'})
        forbidden = {'open', 'read_bytes', 'read_text', 'getenv', 'system', 'exec', 'eval', 'Popen', 'run'}
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                name = node.func.id if isinstance(node.func, ast.Name) else node.func.attr if isinstance(node.func, ast.Attribute) else ''
                self.assertNotIn(name, forbidden)
        template = projection.DOCKER_TEMPLATE
        self.assertNotIn('json .HostConfig.LogConfig}}', template)
        self.assertNotIn('.Config.Env', template)
        self.assertNotIn('.State.Health.Log', template)
        self.assertNotIn('.LogPath', template)
        self.assertNotIn('{{$n = add', template)


if __name__ == '__main__':
    unittest.main()
