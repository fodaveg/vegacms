"""Offline rejection and Git plumbing tests; no SSH, Docker or live source edits."""
import copy
from contextlib import ExitStack, redirect_stdout
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run_candidate as transport
for name, path in transport.MODULES:
    module = types.ModuleType(name)
    module.__file__ = str(path)
    sys.modules[name] = module
    exec(compile(path.read_bytes(), str(path), 'exec'), module.__dict__)
d = sys.modules['edge_durable']
e = sys.modules['edge_apply']
b = sys.modules['edge_base']
p = sys.modules['edge_phase2']
n = sys.modules['network_dependencies']
s = sys.modules['stock_durable']
c = sys.modules['cors_apply']


def dependency():
    return {'schema': 1, 'state': 'REVIEWED', 'cors': {name: {
        'status': 'PASS', 'containerId': 'a' * 64, 'imageId': 'sha256:' + 'b' * 64,
        'composeSha': 'c' * 64, 'receiptSha': 'd' * 64} for name in n.PATHS},
        'caddy': {'status': 'PASS', 'containerId': b.CONTAINER_ID, 'imageId': b.IMAGE_ID, 'preflightSha': 'e' * 64},
        'source': None}


class DurableTests(unittest.TestCase):
    def test_exact_published_guard_and_all_rejections(self):
        head = 'a' * 40
        candidate = b'candidate'
        target = d.blob(candidate)
        snapshot = {'gitClass': 'EXACT_CLEAN', 'headCommit': head, 'headBlob': target,
                    'indexBlob': target, 'workingBlob': target}
        def guard(**changes):
            with patch.object(p, 'git_snapshot', return_value={**snapshot, **changes}), \
                    patch.object(d, 'git', side_effect=[(head + ' ' + e.EXPECTED_HEAD + '\n').encode(), b'M\tcompose.yml\n']), \
                    patch.object(d, 'oid', return_value=e.EXPECTED_BLOB):
                d.commit_guard(head, e.EXPECTED_HEAD, target, candidate)
        guard()
        for changes in ({'headCommit': 'f' * 40}, {'indexBlob': e.EXPECTED_BLOB}, {'gitClass': 'DIRTY'},
                        {'workingBlob': 'e' * 40}, {'headBlob': 'e' * 40}):
            with self.subTest(changes=changes), self.assertRaises(RuntimeError):
                guard(**changes)
        with patch.object(p, 'git_snapshot', return_value=snapshot), \
                patch.object(d, 'git', return_value=(head + ' ' + 'f' * 40 + '\n').encode()):
            with self.assertRaisesRegex(RuntimeError, 'DurableParentChanged'):
                d.commit_guard(head, e.EXPECTED_HEAD, target, candidate)
        for paths in (b'M\tcompose.yml\nM\tCaddyfile\n', b'M\tother.yml\n'):
            with patch.object(p, 'git_snapshot', return_value=snapshot), \
                    patch.object(d, 'git', side_effect=[(head + ' ' + e.EXPECTED_HEAD).encode(), paths]):
                with self.assertRaisesRegex(RuntimeError, 'DurableScopeChanged'):
                    d.commit_guard(head, e.EXPECTED_HEAD, target, candidate)

    def test_real_git_commit_tree_preserves_foreign_index_and_head(self):
        with tempfile.TemporaryDirectory(dir='/private/tmp') as directory:
            root = Path(directory)
            repo = root / 'edge'
            repo.mkdir()
            def git(*args):
                return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.DEVNULL)
            git('init', '-q')
            git('config', 'user.name', 'offline fixture')
            git('config', 'user.email', 'fixture@localhost')
            (repo / 'compose.yml').write_text('old\n')
            (repo / 'peer').write_text('original\n')
            git('add', 'compose.yml', 'peer')
            git('commit', '-qm', 'fixture')
            parent = git('rev-parse', 'HEAD').strip().decode()
            (repo / 'peer').write_text('foreign staged work\n')
            git('add', 'peer')
            index_before = (repo / '.git/index').read_bytes()
            state_root = root / 'state'
            (state_root / 'edge-test').mkdir(parents=True)
            with patch.object(b, 'COMPOSE', repo / 'compose.yml'), patch.object(e, 'STATE_ROOT', state_root):
                head, object_id, mode = d.make_commit(None, 'edge-test', b'new\n', parent, 'fixture network\n')
            self.assertEqual(git('rev-parse', 'HEAD').strip().decode(), parent)
            self.assertEqual((repo / '.git/index').read_bytes(), index_before)
            self.assertEqual(git('diff-tree', '--no-commit-id', '--name-status', '-r', parent, head), b'M\tcompose.yml\n')
            self.assertEqual(git('show', head + ':peer'), b'original\n')
            self.assertEqual(object_id, d.blob(b'new\n'))
            self.assertEqual(list((state_root / 'edge-test').iterdir()), [])
            (repo / 'compose.yml').write_bytes(b'new\n')
            state_fd = os.open(state_root / 'edge-test', os.O_RDONLY)
            try:
                with patch.object(b, 'COMPOSE', repo / 'compose.yml'), patch.object(e, 'STATE_ROOT', state_root):
                    index_path = repo / '.git/index'
                    def foreign_index_write():
                        index_path.write_bytes(index_path.read_bytes())
                    with self.assertRaisesRegex(RuntimeError, 'PublicationIndexChanged'):
                        d.publish_index_commit(state_fd, 'edge-test', head, parent, d.blob(b'old\n'),
                                               object_id, mode, b'new\n', foreign_index_write)
                    self.assertEqual(git('rev-parse', 'HEAD').strip().decode(), parent)
                    self.assertFalse((repo / '.git/index.lock').exists())
                    d.publish_index_commit(state_fd, 'edge-test', head, parent, d.blob(b'old\n'),
                                           object_id, mode, b'new\n', lambda: None)
            finally:
                os.close(state_fd)
            self.assertEqual(git('rev-parse', 'HEAD').strip().decode(), head)
            self.assertEqual(git('show', ':peer'), b'foreign staged work\n')
            self.assertEqual(git('show', ':compose.yml'), b'new\n')
            self.assertFalse((repo / '.git/index.lock').exists())
            self.assertEqual(list((state_root / 'edge-test').iterdir()), [])

    def test_model_delta_preserves_every_other_service(self):
        old = {'services': {'caddy': {'image': 'caddy:pinned', 'networks': {'edge': {}},
                                     'environment': {'UNCHANGED': '${UNCHANGED}'}},
                             'peer': {'image': 'peer:pinned'}},
               'networks': {'edge': {'name': 'edge', 'external': True}}}
        new = copy.deepcopy(old)
        new['services']['caddy']['networks']['vega-edge'] = {}
        new['networks']['vega-edge'] = {'name': 'vega-edge', 'external': True}
        def proof(after):
            with patch.object(d, 'compose', side_effect=[b'', b'', json.dumps(old).encode(), json.dumps(after).encode()]):
                return d.model_proof(b'old', b'new')
        self.assertTrue(proof(new)['modelDeltaOnlyDedicatedNetwork'])
        for path in ('peer', 'caddy'):
            altered = copy.deepcopy(new)
            altered['services'][path]['image'] = 'foreign'
            with self.subTest(path=path), self.assertRaisesRegex(RuntimeError, 'ComposeModelDeltaUnknown'):
                proof(altered)
        altered = copy.deepcopy(new)
        altered['networks']['vega-edge']['internal'] = True
        with self.assertRaisesRegex(RuntimeError, 'ComposeModelDeltaUnknown'):
            proof(altered)

    def test_extension_rejected_before_parser_and_flags_do_not_resolve_env(self):
        for source in (b'include: other.yml', b'services:\n  caddy:\n    extends: other.yml', b'{include: [other.yml]}', b'"include": [other.yml]'):
            with patch.object(d.subprocess, 'run') as run:
                with self.assertRaisesRegex(RuntimeError, 'ComposeExtensionUnknown'):
                    d.compose(source, ['--quiet'])
                run.assert_not_called()
        d.reject_extensions(b'services:\n  caddy:\n    image: ${UNCHANGED}\n')
        response = types.SimpleNamespace(returncode=0, stdout=b'', stderr=b'')
        with patch.object(d.subprocess, 'run', return_value=response) as run:
            d.compose(b'known', ['--quiet'], selected=True)
            args, kwargs = run.call_args
            for flag in d.FLAGS:
                self.assertIn(flag, args[0])
            self.assertIn(str(b.COMPOSE), args[0])
            self.assertIn('/dev/null', args[0])
            self.assertEqual(kwargs['env']['COMPOSE_DISABLE_ENV_FILE'], '1')
            self.assertIsNone(kwargs['input'])

    def test_rollback_drift_never_replaces_or_commits(self):
        with tempfile.TemporaryDirectory(dir='/private/tmp') as directory:
            for reason in ('DurableGitSourceChanged', 'DurableSourceChanged', 'CaddyNonNetworkRuntimeChanged'):
                with patch.object(e, 'open_backup', side_effect=lambda _: os.open(directory, os.O_RDONLY)), \
                        patch.object(d, 'sealed_state', return_value=({}, b'old', b'new')), \
                        patch.object(d, 'published_guard', side_effect=RuntimeError(reason)), \
                        patch.object(d, 'make_commit') as make, patch.object(c, 'replace_owned') as restore:
                    with self.assertRaisesRegex(RuntimeError, reason):
                        d.rollback_source('edge-' + 'a' * 24)
                    make.assert_not_called()
                    restore.assert_not_called()

    def test_rollback_requires_caddy_only_before_source_write(self):
        with tempfile.TemporaryDirectory(dir='/private/tmp') as directory:
            state = {'networkId': 'a' * 64, 'owner': 'edge-' + 'b' * 32}
            with patch.object(e, 'open_backup', side_effect=lambda _: os.open(directory, os.O_RDONLY)), \
                    patch.object(d, 'sealed_state', return_value=(state, b'old', b'new')), \
                    patch.object(d, 'published_guard'), patch.object(e, 'network_guard', side_effect=RuntimeError('NetworkMembersUnknown')), \
                    patch.object(d, 'make_commit') as make:
                with self.assertRaisesRegex(RuntimeError, 'NetworkMembersUnknown'):
                    d.rollback_source('edge-' + 'a' * 24)
                make.assert_not_called()

    def test_dependencies_reject_draft_missing_pass_and_foreign_fields(self):
        value = dependency()
        n.validate(value, source_required=False)
        for change in ({'state': 'DRAFT'}, {'extra': 'foreign'}, {'source': {'head': 'unknown'}}):
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                n.validate({**value, **change}, source_required=False)
        missing = copy.deepcopy(value)
        missing['cors']['fodaveg']['status'] = 'PENDING'
        with self.assertRaisesRegex(RuntimeError, 'CORSDependencyUnknown'):
            n.validate(missing, source_required=False)
        with self.assertRaisesRegex(RuntimeError, 'DurableDependencyUnknown'):
            n.validate(value, source_required=True)

    def test_dependency_guard_rejects_fod_forward_drift(self):
        value = dependency()
        good = {'id': 'a' * 64, 'image': 'sha256:' + 'b' * 64, 'running': True}
        n.DEPENDENCIES = value
        with patch.object(e, 'checked', side_effect=[json.dumps(good).encode(), json.dumps({**good, 'id': 'f' * 64}).encode()]), \
                patch.object(c, 'read_file', return_value=(b'known', None)), \
                patch.object(b, 'digest', return_value='c' * 64):
            with self.assertRaisesRegex(RuntimeError, 'CORSRuntimeDependencyChanged'):
                n.guard(source_required=False)
        n.DEPENDENCIES = None

    def test_new_stock_guard_accepts_only_owned_exact_members(self):
        value = dependency()
        backup = 'edge-' + 'a' * 24
        value['source'] = {'backupId': backup, 'head': 'b' * 40, 'parent': e.EXPECTED_HEAD,
                           'composeSha': e.EXPECTED_CANDIDATE, 'networkId': 'c' * 64, 'receiptSha': 'd' * 64}
        state = {'durableHead': 'b' * 40, 'durableParent': e.EXPECTED_HEAD,
                 'networkId': 'c' * 64, 'owner': 'edge-' + 'e' * 32, 'composeInstalledIdentity': [1] * 8}
        s.stock.EDGE_BACKUP_ID = backup
        network = {'id': 'c' * 64, 'name': 'vega-edge', 'driver': 'bridge', 'scope': 'local',
                   'internal': False, 'owner': state['owner'], 'count': 1, 'caddy': True, 'pb': False}
        with tempfile.TemporaryDirectory(dir='/private/tmp') as directory:
            def inspect(raw, *, selected=None, healthy=False, state_override=None):
                with patch.object(n, 'guard', return_value=value), \
                        patch.object(e, 'open_backup', side_effect=lambda _: os.open(directory, os.O_RDONLY)), \
                        patch.object(d, 'sealed_state', return_value=(state_override or state, b'old', b'new')), \
                        patch.object(d, 'published_guard'), patch.object(p, 'selected_network_id', return_value='c' * 64), \
                        patch.object(c, 'container_id', return_value=s.stock.OLD_ID), \
                        patch.object(e, 'checked', return_value=json.dumps(raw).encode()), patch.object(e, 'source_guard'):
                    return s.edge_guard(pb_id=selected, require_pb=healthy)
            self.assertEqual(inspect(network), 'c' * 64)
            for change in ({'owner': 'foreign'}, {'count': 2}, {'pb': True}, {'caddy': False}, {'internal': True}):
                with self.subTest(change=change), self.assertRaises(RuntimeError):
                    inspect({**network, **change})
            self.assertEqual(inspect({**network, 'count': 2, 'pb': True}, selected='f' * 64, healthy=True), 'c' * 64)
            with self.assertRaisesRegex(RuntimeError, 'RunningPBAbsent'):
                inspect(network, selected='f' * 64, healthy=True)
            with patch.object(n, 'guard', return_value=value), \
                    patch.object(e, 'open_backup', side_effect=lambda _: os.open(directory, os.O_RDONLY)), \
                    patch.object(d, 'sealed_state', return_value=(state, b'old', b'new')), \
                    patch.object(d, 'published_guard'), patch.object(p, 'selected_network_id', return_value='c' * 64), \
                    patch.object(c, 'container_id', return_value='f' * 64), \
                    patch.object(s.stock.h, 'is_running', return_value=True), \
                    patch.object(e, 'checked', return_value=json.dumps(network).encode()), \
                    patch.object(e, 'source_guard'), patch.object(s, 'RECOVERY_BACKUP_ID', None):
                with self.assertRaisesRegex(RuntimeError, 'RunningPBAbsentFromOwnedNetwork'):
                    s.edge_guard()
            with self.assertRaisesRegex(RuntimeError, 'DurableReceiptChanged'):
                inspect(network, state_override={**state, 'durableHead': 'f' * 40})

    def test_real_stock_rollback_recreates_on_edge_and_closes_receipt(self):
        edge_backup = 'edge-' + 'a' * 24
        stock_backup = 'vega-pb-20261009T080000Z-1'
        new_id, restored_id = 'a' * 64, 'b' * 64
        network_id = 'c' * 64
        value = dependency()
        value['source'] = {'backupId': edge_backup, 'head': 'd' * 40,
                           'parent': e.EXPECTED_HEAD, 'composeSha': e.EXPECTED_CANDIDATE,
                           'networkId': network_id, 'receiptSha': 'e' * 64}
        durable_state = {'durableHead': 'd' * 40, 'durableParent': e.EXPECTED_HEAD,
                         'networkId': network_id, 'owner': 'edge-' + 'f' * 32,
                         'composeInstalledIdentity': [1] * 8}

        def flow(*, initial_phase='AWAITING_PUBLIC_SMOKE', reject_recovery=False,
                 foreign_id=False, foreign_member=False,
                 drift_source=False, drift_receipt=False):
            with tempfile.TemporaryDirectory(dir='/private/tmp') as directory:
                root = Path(directory)
                backup = root / stock_backup
                backup.mkdir(mode=0o700)
                compose = root / 'compose.yml'
                env = root / '.env'
                compose.write_bytes(b'target')
                env.write_bytes(b'env')
                (backup / 'compose.old').write_bytes(b'base')
                selected = {'id': new_id, 'running': True, 'network': 'vega-edge'}
                spec = {**s.stock.SPEC, 'compose': compose, 'env': env}
                record = {'status': initial_phase, 'service': s.stock.NAME,
                          'oldComposeSha': s.stock.BASE_SHA, 'newComposeSha': s.stock.TARGET_SHA,
                          'oldContainerId': s.stock.OLD_ID, 'newContainerId': new_id,
                          'imageId': spec['imageId'], 'installedComposeIdentity': c.identity(compose.stat()),
                          'envSha': 'envsha', 'envIdentity': c.identity(env.stat())}
                (backup / 'state.json').write_text(json.dumps(record))

                def digest(body):
                    return {b'target': s.stock.TARGET_SHA, b'base': s.stock.BASE_SHA,
                            b'env': 'envsha'}[body]

                def metadata(path, state):
                    persisted = {**state}
                    if foreign_id and state['status'] == 'ROLLBACK_CREATED':
                        persisted['rollbackContainerId'] = '9' * 64
                    path.write_text(json.dumps(persisted))

                def replace_owned(path, body, *_):
                    path.write_bytes(body)
                    return c.identity(path.stat())

                def runtime(name, expected, after, *, expected_id=None, require_healthy=True, **_):
                    self.assertEqual(name, s.stock.NAME)
                    self.assertEqual(expected_id, selected['id'])
                    self.assertEqual(selected['network'], 'vega-edge' if after else 'edge')
                    if require_healthy:
                        self.assertTrue(selected['running'])
                    return selected['id'], {}

                def run(argv, **_):
                    if argv[:2] == ['docker', 'stop']:
                        selected['running'] = False
                    elif argv[:2] == ['docker', 'compose']:
                        selected.update(id=restored_id, network='edge')
                    elif argv[:2] == ['docker', 'start']:
                        selected['running'] = True
                    elif argv[:2] == ['docker', 'inspect']:
                        return json.dumps({'project': spec['project'], 'service': spec['service']}).encode()
                    else:
                        self.fail(f'unexpected Docker operation: {argv[:2]}')
                    return b''

                def network(*_args, **_kwargs):
                    on_owned = selected['network'] == 'vega-edge'
                    count = 2 if on_owned or foreign_member else 1
                    return json.dumps({'id': network_id, 'name': 'vega-edge', 'driver': 'bridge',
                                       'scope': 'local', 'internal': False, 'owner': durable_state['owner'],
                                       'count': count, 'caddy': True, 'pb': on_owned}).encode()

                def inspect(_):
                    return {'imageId': spec['imageId'], 'imageRef': spec['image'],
                            'entrypoint': s.stock.h.OLD_RUNTIME[s.stock.NAME]['entrypoint'],
                            'cmd': s.stock.command(s.stock.NAME, spec, False)}

                with ExitStack() as stack:
                    stack.enter_context(patch.object(c, 'ROOT', root))
                    stack.enter_context(patch.object(s.stock, 'SPEC', spec))
                    stack.enter_context(patch.object(c, 'digest', side_effect=digest))
                    stack.enter_context(patch.object(c, 'replace_metadata', side_effect=metadata))
                    stack.enter_context(patch.object(c, 'replace_owned', side_effect=replace_owned))
                    stack.enter_context(patch.object(c, 'runtime', side_effect=runtime))
                    stack.enter_context(patch.object(s.stock, 'runtime', side_effect=runtime))
                    stack.enter_context(patch.object(c, 'container_id', side_effect=lambda _: selected['id']))
                    stack.enter_context(patch.object(c, 'created_selection', side_effect=lambda *_, **__: selected['id']))
                    stack.enter_context(patch.object(c, 'inspect', side_effect=inspect))
                    stack.enter_context(patch.object(c, 'compose_quiet'))
                    stack.enter_context(patch.object(s.stock.h, 'run', side_effect=run))
                    stack.enter_context(patch.object(s.stock.h, 'is_running', side_effect=lambda _: selected['running']))
                    stack.enter_context(patch.object(s.stock.h, 'volume_running_containers',
                                              side_effect=lambda _: [s.stock.NAME] if selected['running'] else []))
                    stack.enter_context(patch.object(s.stock.h, 'image_id', return_value=spec['imageId']))
                    stack.enter_context(patch.object(n, 'guard', return_value=value))
                    stack.enter_context(patch.object(e, 'open_backup', side_effect=lambda _: os.open(root, os.O_RDONLY)))
                    stack.enter_context(patch.object(d, 'sealed_state', return_value=(
                        {**durable_state, 'durableHead': 'f' * 40} if drift_receipt else durable_state,
                        b'old', b'new')))
                    stack.enter_context(patch.object(d, 'published_guard'))
                    stack.enter_context(patch.object(p, 'selected_network_id', return_value=network_id))
                    stack.enter_context(patch.object(e, 'checked', side_effect=network))
                    stack.enter_context(patch.object(e, 'source_guard'))
                    stack.enter_context(patch.object(sys, 'argv', ['stock_durable', 'rollback', edge_backup, stock_backup]))
                    stack.enter_context(patch.object(s, 'RECOVERY_BACKUP_ID', None))
                    if reject_recovery:
                        stack.enter_context(patch.object(s, 'restored_on_edge', return_value=False))
                    if drift_source:
                        original = s.restored_on_edge
                        def changed_source(selected_pb):
                            compose.write_bytes(b'target')
                            return original(selected_pb)
                        stack.enter_context(patch.object(s, 'restored_on_edge', side_effect=changed_source))
                    output = io.StringIO()
                    with redirect_stdout(output):
                        code = s.main()
                    receipt = json.loads(output.getvalue())
                    return code, receipt, json.loads((backup / 'state.json').read_text())['status']

        code, receipt, phase = flow(reject_recovery=True)
        self.assertEqual((code, receipt['status'], phase),
                         (2, 'STOP_NETWORK_ROLLBACK_NEEDS_OPERATOR', 'ROLLBACK_CREATED'))
        code, receipt, phase = flow()
        self.assertEqual((code, receipt['status'], phase),
                         (0, 'NETWORK_ROLLED_BACK_AWAITING_PUBLIC_SMOKE', 'ROLLED_BACK'))
        self.assertTrue(transport.valid(receipt, code, 'stock-rollback', edge_backup, stock_backup))
        code, receipt, phase = flow(initial_phase='CREATED')
        self.assertEqual((code, receipt['status'], phase),
                         (0, 'NETWORK_ROLLED_BACK_AWAITING_PUBLIC_SMOKE', 'ROLLED_BACK'))
        self.assertTrue(transport.valid(receipt, code, 'stock-rollback', edge_backup, stock_backup))
        for option in ({'foreign_id': True}, {'foreign_member': True},
                       {'drift_source': True}, {'drift_receipt': True}):
            with self.subTest(option=option):
                code, receipt, phase = flow(**option)
                self.assertEqual(code, 2)
                self.assertFalse(transport.valid(receipt, 0, 'stock-rollback', edge_backup, stock_backup))

    def test_transport_rejects_extra_receipt_and_wrong_source_pin(self):
        backup = 'edge-' + 'a' * 24
        receipt = {'status': 'DURABLE_SOURCE_VERIFIED', 'backupId': backup, 'head': 'b' * 40,
                   'remoteWrites': False, 'privateValuesExported': False}
        self.assertTrue(transport.valid(receipt, 0, 'durable-check', backup, None))
        self.assertFalse(transport.valid({**receipt, 'private': 'raw'}, 0, 'durable-check', backup, None))
        self.assertFalse(transport.valid({**receipt, 'head': 'wrong'}, 0, 'durable-check', backup, None))
        self.assertFalse(transport.valid(receipt, 2, 'durable-check', backup, None))

    def test_manifest_and_source_seals_reject_drift(self):
        seals = {name: transport.sha(path.read_bytes()) for name, path in transport.MODULES}
        with tempfile.TemporaryDirectory(dir='/private/tmp') as directory:
            manifest = Path(directory) / 'manifest.json'
            manifest.write_text(json.dumps(seals))
            expected = transport.sha(manifest.read_bytes())
            self.assertEqual(len(transport.load_sources(manifest, expected)), len(transport.MODULES))
            with self.assertRaisesRegex(RuntimeError, 'ManifestSealChanged'):
                transport.load_sources(manifest, 'f' * 64)
            seals['edge_durable'] = 'f' * 64
            manifest.write_text(json.dumps(seals))
            with self.assertRaisesRegex(RuntimeError, 'SourceSealChanged'):
                transport.load_sources(manifest, transport.sha(manifest.read_bytes()))

    def test_bootstrap_compiles_without_running_remote_operation(self):
        sources = [(name, path.read_bytes()) for name, path in transport.MODULES]
        body = transport.bundle(sources, dependency(), 'durable-publish')
        compile(body, '<offline-bootstrap>', 'exec')
        response = subprocess.run([sys.executable, '-B', '-', 'invalid', 'edge-' + 'a' * 24],
                                  input=body, capture_output=True, check=False)
        self.assertEqual(response.returncode, 2, response.stderr)
        self.assertEqual(json.loads(response.stdout)['status'], 'STOP_DURABLE_NEEDS_OPERATOR')


if __name__ == '__main__':
    unittest.main(verbosity=2)
