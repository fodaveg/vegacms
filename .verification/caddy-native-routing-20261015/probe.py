"""Offline synthetic tests. No SSH, Docker, application, or private source reads."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import projection
import run_once

NAMESPACE = {'__name__': 'caddy_base'}
BASE = Path(__file__).with_name('base_remote_validate.py')
NATIVE = Path(__file__).with_name('remote_native.py')
exec(compile(BASE.read_bytes(), str(BASE), 'exec'), NAMESPACE)
exec(compile(NATIVE.read_bytes(), str(NATIVE), 'exec'), NAMESPACE)


def call(name, *args):
    return NAMESPACE[name](*args)


def synthetic(logs, server_logs=None, extra_logging=None):
    routes = [{'match': [{'host': [host]}], 'handle': [{'handler': 'reverse_proxy',
               'upstreams': [{'dial': 'backend:8090'}]}]}
              for host in NAMESPACE['HOSTS'].values()]
    server = {'listen': [':443'], 'routes': routes}
    if server_logs is not None:
        server['logs'] = server_logs
    return {'logging': {'logs': logs, **(extra_logging or {})},
            'apps': {'http': {'servers': {'srv0': server}}}}


class RoutingTests(unittest.TestCase):
    def test_implicit_default_named_exclusion_and_error_suffix(self):
        logs = {'default': {'exclude': ['http.log.access.private']},
                'private': {'include': ['http.log.access.private']}}
        candidate = synthetic(logs, {'logger_names': {host: 'private'
                              for host in NAMESPACE['HOSTS'].values()}})
        result = call('native_projection', candidate, b'{\n}\n', b'{\n}\n')
        self.assertEqual(result['defaultOrigin'], 'ADAPTER_GENERATED')
        self.assertTrue(result['mappingUnambiguous'])
        for item in result['hosts'].values():
            self.assertEqual(item['channels']['ACCESS']['route'], 'ALLOW')
            self.assertEqual(item['channels']['ERROR']['route'], 'ALLOW')
            self.assertEqual(item['channels']['ERROR']['uri'], 'ABSENT')

    def test_env_name_and_raw_quote_declarations_are_classified_without_values(self):
        original = b'{\n log {$LOGGER_NAME} {\n level DEBUG\n }\n log `raw # {}` {\n }\n}\n'
        expanded = b'{\n log private {\n level DEBUG\n }\n log `raw # {}` {\n }\n}\n'
        result = call('declarations_summary', original, expanded,
                      {'private': {}, 'raw # {}': {}, 'default': {}})
        histogram, origin, mapped = result
        self.assertEqual(histogram['ENVREF/OTHER/BARE'], 1)
        self.assertEqual(histogram['LITERAL/OTHER/QUOTED'], 1)
        self.assertEqual(origin, 'ADAPTER_GENERATED')
        self.assertTrue(mapped)
        self.assertNotIn('raw # {}', json.dumps(histogram))
        self.assertNotIn('private', json.dumps(histogram))

    def test_host_mapping_is_measured_before_skip_hosts(self):
        host = NAMESPACE['HOSTS']['vega']
        candidate = synthetic({'default': {}, 'named': {}},
                              {'logger_names': {host: 'named'}, 'skip_hosts': [host]})
        result = call('native_projection', candidate, b'{\n}\n', b'{\n}\n')['hosts']['vega']
        self.assertTrue(result['hostMapped'])
        self.assertTrue(result['hostSkipped'])
        self.assertEqual(result['accessEffective'], 'ENABLED')
        self.assertEqual(result['channels']['ACCESS']['route'], 'ALLOW')

    def test_error_suffix_selects_named_logger(self):
        host = NAMESPACE['HOSTS']['vega']
        candidate = synthetic({'default': {'exclude': ['http.log.error']},
                               'named': {'include': ['http.log.error.named'], 'level': 'ERROR'}},
                              {'logger_names': {host: 'named'}})
        result = call('native_projection', candidate, b'{\n}\n', b'{\n}\n')['hosts']['vega']
        self.assertEqual(result['channels']['ERROR']['route'], 'ALLOW')
        self.assertEqual(result['channels']['ERROR']['uri'], 'ABSENT')

    def test_wildcard_mapping_selects_most_specific_logger_name(self):
        names, mapped = call('mapped_names', {'logger_names': {'*.vegacms.com': ['specific'],
                                                               '*.*.com': ['generic']}},
                             NAMESPACE['HOSTS']['vega'])
        self.assertEqual(names, ['specific'])
        self.assertTrue(mapped)
        self.assertEqual(call('mapped_names', {'logger_names': {'*.*.com': ['generic']}},
                              NAMESPACE['HOSTS']['vega']), (['generic'], True))

    def test_reverse_proxy_debug_is_distinct_from_access(self):
        candidate = synthetic({'default': {'level': 'INFO'},
                               'debug': {'include': ['http.handlers.reverse_proxy'], 'level': 'DEBUG'}},
                              {'default_logger_name': 'default'})
        result = call('native_projection', candidate, b'{\n}\n', b'{\n}\n')['hosts']['vega']
        self.assertEqual(result['channels']['REVERSEPROXY_DEBUG']['route'], 'ALLOW')
        self.assertEqual(result['channels']['ACCESS']['route'], 'ALLOW')

    def test_unknown_logging_core_and_arbitrary_regex_cannot_claim_coverage(self):
        safe = {'format': 'filter', 'fields': {'request>uri': NAMESPACE['KNOWN_URI'],
                                             'request>headers>Referer': NAMESPACE['KNOWN_REFERER']}}
        arbitrary = {'format': 'filter', 'fields': {'request>uri':
                     {'filter': 'regexp', 'regexp': '.*', 'value': '[hidden]'}}}
        candidate = synthetic({'default': {'encoder': safe}, 'named': {'encoder': arbitrary}},
                              {'default_logger_name': 'default'}, {'cores': {'custom': {}}})
        result = call('native_projection', candidate, b'{\n}\n', b'{\n}\n')
        self.assertTrue(result['extraLoggingUnknown'])
        self.assertEqual(result['hosts']['vega']['channels']['ERROR']['route'], 'UNKNOWN')
        self.assertEqual(call('filter_classes', arbitrary)[0], 'UNKNOWN')
        self.assertEqual(call('filter_classes', safe)[:2], ('KNOWN_COVERED', 'DELETE'))

    def test_no_server_logging_disables_access(self):
        candidate = synthetic({'default': {}})
        result = call('native_projection', candidate, b'{\n}\n', b'{\n}\n')['hosts']['vega']
        self.assertEqual(result['accessEffective'], 'DISABLED')
        self.assertEqual(result['channels']['ACCESS']['route'], 'NOT_EMITTED')

    def test_projection_rejects_private_strings_and_unknown_fields(self):
        value = {'status': 'STOPPED', 'failureClass': 'GUARD_CHANGED', 'sourceGuards': False,
                 'composeGuards': False, 'commandVerified': False, 'closureVerified': False,
                 'imageVerified': False, 'sourceFiles': 0, 'referencedCount': 0,
                 'presentCount': 0, 'adaptExit': None, 'scratchRemoved': True, 'analysis': None}
        projection.validate(value)
        with self.assertRaises(ValueError):
            projection.validate({**value, 'failureClass': 'SECRET_VALUE'})
        with self.assertRaises(ValueError):
            projection.validate({**value, 'rawConfig': 'private'})

    def test_missing_approval_stops_before_marker_and_transport(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                run_once.authorize(Path(temp), run_once.OPERATION_ID)
        with patch.object(run_once, 'capture_process') as transport, patch.object(
                run_once, 'authorize', side_effect=ValueError('denied')):
            with (patch('sys.argv', ['run_once.py', '--operation-id', run_once.OPERATION_ID]),
                  contextlib.redirect_stdout(io.StringIO()) as output):
                self.assertEqual(run_once.main(), 1)
            transport.assert_not_called()
            self.assertIn('ZERO_CONNECTIONS', output.getvalue())

    def test_controlled_early_transport_throw_keeps_class_without_secret(self):
        with tempfile.TemporaryDirectory() as temp:
            launcher = Path(temp) / 'run_once.py'
            launcher.touch()
            snapshot = {'base_remote_validate.py': b'# base\n', 'remote_native.py': b'# native\n'}
            with (patch.object(run_once, '__file__', str(launcher)),
                  patch.object(run_once, 'authorize', return_value=snapshot),
                  patch.object(run_once, 'capture_process', side_effect=RuntimeError('SECRET_SENTINEL')),
                  patch('sys.argv', ['run_once.py', '--operation-id', run_once.OPERATION_ID]),
                  contextlib.redirect_stdout(io.StringIO()) as output):
                self.assertEqual(run_once.main(), 1)
            receipt = (Path(temp) / 'execution-receipt.json').read_text()
            self.assertIn('TRANSPORT_OR_PROJECTION_ERROR_NO_RETRY', receipt)
            self.assertIn('TRANSPORT_RUNTIMEERROR', receipt)
            self.assertNotIn('SECRET_SENTINEL', receipt + output.getvalue())
            self.assertTrue((Path(temp) / 'request-started.json').exists())


if __name__ == '__main__':
    unittest.main()
