"""Synthetic privacy/scope tests only: no SSH, Docker, installs or production data."""
import ast
import contextlib
import copy
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import remote_validate as rv
import projection
import run_once


class ReducedReaderTests(unittest.TestCase):
    def stop(self, expected, function, *args):
        with self.assertRaises(rv.Stop) as caught:
            function(*args)
        self.assertEqual(str(caught.exception), expected)

    def test_individual_lookup_preserves_missing_empty_and_multiline(self):
        observed = []
        synthetic = {'ONLY_VALUE': 'sensitive\n$(false)\ntrailing\n', 'EMPTY_VALUE': '', 'UNRELATED_SECRET': 'DO_NOT_READ'}
        def query(args, limit):
            observed.append(args)
            self.assertEqual(args[:5], ['docker', 'exec', rv.CONTAINER, '/bin/sh', '-c'])
            return subprocess.run(['/bin/sh', '-c', args[5]], env=synthetic, capture_output=True, check=True).stdout
        with patch.object(rv, 'bounded', query):
            self.assertEqual(rv.query_value(b'ONLY_VALUE'), synthetic['ONLY_VALUE'].encode())
            self.assertEqual(rv.query_value(b'EMPTY_VALUE'), b'')
            self.assertIsNone(rv.query_value(b'MISSING_VALUE'))
        self.assertEqual(len(observed), 3)
        self.assertNotIn('UNRELATED_SECRET', str(observed))
        self.assertNotIn(synthetic['ONLY_VALUE'], str(observed))
        self.assertNotIn('eval', str(observed))

    def test_identifiers_control_variables_and_limits_stop_before_exec(self):
        with patch.object(rv, 'bounded') as command:
            for name in (b'NAME;cat', b'A$(cat)', b'bad-name', b'lowercase'):
                self.stop('REFERENCE_UNSUPPORTED', rv.query_value, name)
            for name in (b'PATH', b'PPID', b'SMTP_PASSWORD', b'LD_FAKE', b'_'):
                self.stop('REFERENCE_EXCLUDED', rv.query_value, name)
            command.assert_not_called()
        with patch.object(rv, 'bounded', return_value=b'Pbad\0bytes'):
            self.stop('ENV_LIMIT', rv.query_value, b'SAFE_VALUE')

    def test_byte_expansion_including_comments_defaults_and_no_recursion(self):
        data = b'# {$COMMENT}\n{$ABSENT:a:b}|{$EMPTY:fallback}|{$PRESENT:fallback}'
        self.assertEqual(rv.references(data), {b'COMMENT', b'ABSENT', b'EMPTY', b'PRESENT'})
        values = {b'COMMENT': b'\nimport /outside/not-approved.caddy', b'ABSENT': None, b'EMPTY': b'', b'PRESENT': b'{$NESTED}'}
        self.assertEqual(rv.expand(data, values), b'# \nimport /outside/not-approved.caddy\na:b||{$NESTED}')
        self.stop('REFERENCE_UNSUPPORTED', rv.references, b'# {$UNCLOSED')

    def fixtures(self):
        snapshots = {Path('Caddyfile'): b'import /etc/caddy/conf.d/*.caddy\n'}
        for label in rv.BLOCKS:
            snapshots[Path(rv.FILES[label][0])] = (label + '.example {\n respond 404\n}\n').encode()
        return snapshots, [(Path(''), Path('/etc/caddy'))]

    def test_closure_queries_comments_once_and_preserves_glob_manifest(self):
        snapshots, mapping = self.fixtures()
        snapshots[Path('Caddyfile')] = b'# {$COMMENT:default}\nimport /etc/caddy/conf.d/*.caddy\n'
        calls = []
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve(); (root/'conf.d').mkdir()
            for path in snapshots:
                (root/path).touch()
            (root/'conf.d/.hidden.caddy').touch()
            expanded, values, patterns = rv.closure(snapshots, root, Path('/etc/caddy/Caddyfile'), mapping, lambda name: calls.append(name))
        self.assertEqual(calls, [b'COMMENT'])
        self.assertEqual(values, {b'COMMENT': None})
        self.assertEqual(len(expanded), 4)
        self.assertEqual(len(patterns[0][2]), 3)
        rv.preadapt_modules(expanded)

    def test_expansion_import_scope_stops_before_resource_open(self):
        snapshots, mapping = self.fixtures()
        snapshots[Path('Caddyfile')] = b'# {$VALUE}\n'
        for value in (b'\nimport /etc/secret.caddy', b'\nimport /etc/caddy/private/credential.caddy', b'\nimport ../private.caddy'):
            with patch.object(rv, 'open_directory') as directory, patch.object(rv, 'read_source') as read:
                with self.assertRaises(rv.Stop):
                    rv.closure(copy.deepcopy(snapshots), Path('/unread'), Path('/etc/caddy/Caddyfile'), mapping, lambda name: value)
                read.assert_not_called(); directory.assert_not_called()

    def test_nested_and_runtime_references_do_not_run_adapter(self):
        snapshots, mapping = self.fixtures()
        for replacement in (b'{$NEW_NAME}', b'{env.NEW_NAME}', b'{file./secret}', b'\x00'):
            snapshots[Path('Caddyfile')] = b'{$VALUE}\n'
            self.stop('RESOURCE_REFERENCE_UNSUPPORTED', rv.closure, copy.deepcopy(snapshots), Path('/unread'), Path('/etc/caddy/Caddyfile'), mapping, lambda name: replacement)

    def test_import_symlink_not_read_and_glob_drift_observable(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve(); (root/'conf.d').mkdir()
            (root/'credential.caddy').write_text('PRIVATE_CANARY')
            (root/'conf.d/a.caddy').symlink_to(root/'credential.caddy')
            self.stop('UNSAFE_OR_MISSING_PATH', rv.read_source, root, Path('conf.d/a.caddy'))
            (root/'conf.d/a.caddy').unlink(); (root/'conf.d/a.caddy').touch()
            mapping = [(Path(''), Path('/etc/caddy'))]
            before = rv.import_targets(root, Path('Caddyfile'), '/etc/caddy/conf.d/*.caddy', mapping)
            (root/'conf.d/b.caddy').touch()
            after = rv.import_targets(root, Path('Caddyfile'), '/etc/caddy/conf.d/*.caddy', mapping)
            self.assertNotEqual(before, after)

    def test_creation_command_rejects_wrappers_envfile_and_ambiguity(self):
        valid = ['caddy', 'run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']
        self.assertEqual(rv.direct_command(valid), Path('/etc/caddy/Caddyfile'))
        for args in (['sh', '-c'] + valid, valid + ['--envfile', '/secret'], valid + ['--resume'], valid[:3] + ['relative'] + valid[4:]):
            self.stop('COMMAND_UNKNOWN', rv.direct_command, args)

    def test_provenance_fails_before_first_value_lookup(self):
        with patch.object(rv, 'read_guard'), patch.object(rv, 'bounded', return_value=b'{}'), patch.object(rv, 'query_value') as lookup:
            self.stop('IMAGE_SOURCE_UNVERIFIED', rv.provenance)
            lookup.assert_not_called()

    def test_selected_provenance_exact_guards_and_loader_shadow(self):
        image = 'sha256:' + '1'*64
        args = ['caddy', 'run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']
        metadata = {'name': '/' + rv.CONTAINER, 'imageId': image, 'entrypoint': None, 'cmd': args, 'workingDir': '/srv',
                    'mounts': [{'source': '/srv/edge', 'destination': '/etc/caddy', 'type': 'bind'}]}
        def bounded(command, *unused):
            if command[:2] == ['docker', 'inspect']:
                self.assertNotIn('.Config.Env', command[3]); return json.dumps(metadata).encode()
            if command[:3] == ['docker', 'image', 'inspect']:
                return json.dumps([rv.IMAGE]).encode()
            if command[-1] == '/proc/1/cmdline':
                return b'\0'.join(a.encode() for a in args) + b'\0'
            if command[-1] == 'version':
                return b'v2.11.4\n'
            self.fail('Unexpected private metadata command')
        with patch.object(rv, 'read_guard') as guards, patch.object(rv, 'bounded', bounded), patch.object(rv, 'query_value') as values:
            self.assertEqual(rv.provenance()[:2], (image, Path('/etc/caddy/Caddyfile')))
            self.assertEqual(guards.call_args_list[1].args, (Path('/srv/vega/infra/production/compose.yml'), rv.VEGA_GUARD))
            metadata['mounts'].append({'source': '/unknown', 'destination': '/lib/libc.so', 'type': 'bind'})
            self.stop('EXECUTABLE_MOUNT_SHADOW', rv.provenance)
            values.assert_not_called()

    def test_syntax_and_unknown_modules_stop(self):
        for line in ('import "a', 'import `a`', 'import a\\\nb', 'import <<EOF', '"a"b'):
            self.stop('SYNTAX_UNSUPPORTED', rv.tokens, line)
        for source in (b'example {\n tls /credential /key\n}\n', b'example {\n file_server\n}\n', b'example {\n unknown_module\n}\n'):
            self.stop('MODULE_UNSUPPORTED', rv.preadapt_modules, {Path('Caddyfile'): source})
        self.assertEqual(rv.tokens('header Test "one two" # trailing'), ['header', 'Test', 'one two'])
        self.assertEqual(rv.tokens('respond foo#literal'), ['respond', 'foo#literal'])

    def test_exact_filewriter_and_storage_reverse_and_rejection(self):
        candidate = {'logging': {'logs': {'a': {'writer': {'output': 'file', 'filename': '/private/a.log', 'roll_keep': 3}},
                                             'b': {'writer': {'output': 'file', 'filename': '/private/a.log'}}}},
                     'apps': {'http': {'servers': {'srv0': {'listen': [':443'], 'routes': [{'handle': [{'handler': 'static_response', 'status_code': 404}]}]}}}}}
        before = copy.deepcopy(candidate)
        result, count, unique, explicit = rv.isolated_test_copy(candidate)
        self.assertEqual(candidate, before); self.assertEqual((count, unique, explicit), (2, 1, 0))
        self.assertEqual(result['storage'], {'module': 'file_system', 'root': '/scratch/storage'})
        candidate['storage'] = {'module': 'file_system', 'root': '/private/data'}
        self.assertEqual(rv.isolated_test_copy(candidate)[3], 1)
        for field in ('load_files', 'unknown'):
            hostile = copy.deepcopy(candidate); hostile['apps']['tls'] = {field: ['PRIVATE_CANARY']}
            self.stop('MODULE_RESOURCE', rv.isolated_test_copy, hostile)
        hostile = copy.deepcopy(candidate); hostile['storage'] = {'module': 'network_unknown', 'root': '/private/data'}
        self.stop('MODULE_RESOURCE', rv.isolated_test_copy, hostile)
        hostile = copy.deepcopy(candidate); hostile['apps']['http']['servers']['srv0']['routes'][0]['handle'][0] = {'handler': 'unknown'}
        self.stop('MODULE_RESOURCE', rv.isolated_test_copy, hostile)

    def test_wrapper_approval_absence_and_rejected_old_mode_zero_connections(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            with self.assertRaises(ValueError):
                run_once.authorize(base, 'test')
            (base/'execution-approval.json').write_text(json.dumps({'status': 'APPROVED', 'mode': 'old-complete-environment'}))
            with self.assertRaises(ValueError):
                run_once.authorize(base, 'test')
            self.assertFalse((base/'request-started.json').exists())
        with patch.object(run_once, 'capture_process') as command, patch.object(run_once.sys, 'argv', ['run_once.py', '--operation-id', 'cb1720b6-a4d4-4352-929c-ff8b4d7c1762']), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(run_once.main(), 1)
            command.assert_not_called()

    def test_finite_projection_rejects_raw_names_errors_and_new_hashes(self):
        source = Path(rv.__file__).read_text()
        # Extract the public result literal without running main or creating any process.
        main = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'main')
        node = next(n for n in main.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'result' for t in n.targets))
        value = eval(compile(ast.Expression(node.value), '<synthetic>', 'eval'), {'EDGE_GUARD': rv.EDGE_GUARD, 'VEGA_GUARD': rv.VEGA_GUARD})
        guards = {label: expected for label, (_, expected) in rv.FILES.items()}
        compose = {'edge': rv.EDGE_GUARD, 'vega': rv.VEGA_GUARD}
        projection.validate(value, guards, compose)
        for key, payload in (('variableName', 'PRIVATE_CANARY'), ('rawError', 'PRIVATE_CANARY'), ('compiledHash', 'a'*64)):
            hostile = dict(value); hostile[key] = payload
            with self.assertRaises(ValueError):
                projection.validate(hostile, guards, compose)
        hostile = dict(value); hostile['failureClass'] = 'PRIVATE_CANARY'
        with self.assertRaises(ValueError):
            projection.validate(hostile, guards, compose)

    def test_exact_wrapper_seal_and_mutation_rejection(self):
        import uuid
        operation = str(uuid.uuid4())
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            for name in run_once.ARTIFACTS:
                (base/name).write_text('synthetic exact artifact')
            manifest = {'operationId': operation, 'files': {name: run_once.digest(base/name) for name in run_once.ARTIFACTS}}
            (base/'manifest.json').write_text(json.dumps(manifest))
            approval = {'status': 'APPROVED', 'reviewStatus': 'APPROVED', 'operationId': operation, 'mode': run_once.MODE,
                        'manifestSHA256': run_once.digest(base/'manifest.json'), 'scope': run_once.SCOPE,
                        'runtimeApprovalReference': 'SYNTHETIC_ONLY_NOT_REAL_AUTHORITY',
                        'sensitiveValueAccessExplicitlyApproved': True, 'fullEnvironmentReadRejectedStill': True}
            (base/'execution-approval.json').write_text(json.dumps(approval))
            run_once.authorize(base, operation)
            (base/'remote_validate.py').write_text('changed after review')
            with self.assertRaises(ValueError):
                run_once.authorize(base, operation)

    def test_post_authorization_mutation_sends_only_approved_snapshot(self):
        import uuid
        from types import SimpleNamespace
        operation = str(uuid.uuid4())
        approved_script = b'SYNTHETIC_APPROVED_SCRIPT'
        approved_patches = {'vega': 'approved-a', 'lumbre': 'approved-b', 'fodaveg': 'approved-c'}
        original_authorize = run_once.authorize
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            for name in run_once.ARTIFACTS:
                (base/name).write_bytes(b'synthetic artifact')
            (base/'remote_validate.py').write_bytes(approved_script)
            (base/'patch-inputs.json').write_text(json.dumps(approved_patches))
            manifest = {'operationId': operation, 'files': {name: run_once.digest(base/name) for name in run_once.ARTIFACTS}}
            (base/'manifest.json').write_text(json.dumps(manifest))
            approval = {'status': 'APPROVED', 'reviewStatus': 'APPROVED', 'operationId': operation, 'mode': run_once.MODE,
                        'manifestSHA256': run_once.digest(base/'manifest.json'), 'scope': run_once.SCOPE,
                        'runtimeApprovalReference': 'SYNTHETIC_ONLY_NOT_REAL_AUTHORITY',
                        'sensitiveValueAccessExplicitlyApproved': True, 'fullEnvironmentReadRejectedStill': True}
            (base/'execution-approval.json').write_text(json.dumps(approval))
            def mutate_after_authorization(path, identifier):
                snapshot = original_authorize(path, identifier)
                (base/'remote_validate.py').write_bytes(b'UNAPPROVED_MUTATED_SCRIPT')
                (base/'patch-inputs.json').write_text(json.dumps({'vega': 'UNAPPROVED', 'lumbre': 'b', 'fodaveg': 'c'}))
                (base/'manifest.json').write_text('{}')
                (base/'execution-approval.json').write_text('{}')
                return snapshot
            with patch.object(run_once, '__file__', str(base/'run_once.py')), \
                 patch.object(run_once, 'authorize', side_effect=mutate_after_authorization), \
                 patch.object(run_once, 'capture_process', return_value=SimpleNamespace(returncode=1, stdout=b'')) as transport, \
                 patch.object(run_once.sys, 'argv', ['run_once.py', '--operation-id', operation]), \
                 contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(run_once.main(), 1)
                self.assertEqual(transport.call_count, 1)
                sent = transport.call_args.kwargs['input']
                self.assertEqual(sent, ('PATCH_INPUTS = ' + repr(approved_patches) + '\n').encode() + approved_script)
                self.assertNotIn(b'UNAPPROVED', sent)

    def test_wrapper_consumes_attempt_even_when_transport_fails(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            (base/'run_once.py').touch()
            (base/'remote_validate.py').write_text('synthetic payload')
            (base/'patch-inputs.json').write_text(json.dumps({'vega': 'a', 'lumbre': 'b', 'fodaveg': 'c'}))
            argv = ['run_once.py', '--operation-id', 'cb1720b6-a4d4-4352-929c-ff8b4d7c1762']
            with patch.object(run_once, '__file__', str(base/'run_once.py')), patch.object(run_once, 'authorize', return_value={'remote_validate.py': b'synthetic payload', 'patch-inputs.json': json.dumps({'vega': 'a', 'lumbre': 'b', 'fodaveg': 'c'}).encode()}), \
                 patch.object(run_once, 'capture_process', return_value=SimpleNamespace(returncode=1, stdout=b'PRIVATE_CANARY')) as transport, \
                 patch.object(run_once.sys, 'argv', argv), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(run_once.main(), 1)
                self.assertEqual(run_once.main(), 1)
                self.assertEqual(transport.call_count, 1)
                self.assertTrue((base/'request-started.json').exists())
                self.assertNotIn('PRIVATE_CANARY', output.getvalue())
                self.assertNotIn('PRIVATE_CANARY', (base/'execution-receipt.json').read_text())

    def test_source_leaf_fifo_rejected_without_waiting(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            os.mkfifo(root/'Caddyfile')
            self.stop('SOURCE_LIMIT_OR_TYPE', rv.read_source, root, Path('Caddyfile'))

    def test_candidates_matchers_headers_and_request_body_subset(self):
        source = b'example {\n @panel path /_ /_/*\n respond @panel 404\n @spa {\n not path /api/* /_ /_/*\n }\n header @spa Content-Security-Policy "default-src self"\n request_body {\n max_size 25MB\n }\n header {\n X-Test "value"\n -Server\n }\n reverse_proxy server:8090 {\n transport http {\n read_timeout 30s\n }\n }\n}\n'
        rv.preadapt_modules({Path('Caddyfile'): source})
        rv.isolated_test_copy({'apps': {'http': {'servers': {'srv0': {'listen': [':443'], 'routes': [
            {'match': [{'not': [{'path': ['/api/*']}]}], 'handle': [{'handler': 'request_body', 'max_size': 25000000},
             {'handler': 'reverse_proxy', 'upstreams': [{'dial': 'server:8090'}], 'transport': {'protocol': 'http', 'read_timeout': 30000000000}}]}
        ]}}}}})

    def test_source_has_no_environment_inventory_or_native_adapter(self):
        source = Path(rv.__file__).read_text()
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute):
                self.assertNotIn(node.attr, {'environ', 'getenv'})
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                self.assertNotIn('.Config.Env', node.value)
                self.assertNotIn('/environ', node.value)
                self.assertNotIn('printenv', node.value)
        self.assertNotIn('process_environment', source)
        self.assertNotIn("CONTAINER, '/usr/bin/caddy', 'adapt'", source)
        self.assertNotIn("CONTAINER, '/usr/bin/caddy', 'validate'", source)


if __name__ == '__main__':
    unittest.main(verbosity=2)
