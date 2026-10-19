import importlib.util
import json
from unittest import mock
from pathlib import Path
import tempfile
import unittest
import uuid

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('apply_engine', HERE / 'apply_engine.py')
e = importlib.util.module_from_spec(spec)
spec.loader.exec_module(e)

class ApplyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.root = self.base / 'edge'
        self.backups = self.base / 'backups'
        self.root.mkdir()
        self.backups.mkdir(mode=0o700)
        (self.root / 'conf.d').mkdir()
        self.original = {name: ('old-' + str(index)).encode() for index, name in enumerate(e.PATHS)}
        self.post = {name: ('new-' + str(index)).encode() for index, name in enumerate(e.PATHS)}
        for name, data in self.original.items():
            (self.root / name).write_bytes(data)
        self.identity = {'caddyImageId': 'sha256:'+'d'*64, 'caddyId': 'e'*64,
                         'consumers': {'vega-pb': '1'*64, 'lumbre-admin-pb': '2'*64, 'fodaveg': '3'*64},
                         'composeGuards': {'edge': 'c'*64, 'vega': 'a'*64, 'lumbre': 'b'*64, 'fodaveg': 'f'*64}}
        self.transform_source = b'def build_postimages(originals):\n    return {name: ("new-" + str(index)).encode() for index, name in enumerate(originals)}\n'
        self.package = {'status': 'FINAL_VALIDATED', 'operationId': str(uuid.uuid4()),
                        'transformerSHA256': e.sha(self.transform_source),
                        'validatorSHA256': '9'*64,
                        'rollbackBaseline': {'hosts':['admin.vegacms.com','admin.lumbre.pro','admin.fodaveg.net'], 'rootStatus':200,'healthStatus':200},
                        'validationOperationId': 'validation',
                        'sources': {name: e.sha(data) for name, data in self.original.items()},
                        'postimages': {name: e.sha(data) for name, data in self.post.items()},
                        'runtimeIdentity': self.identity, 'composeGuards': self.identity['composeGuards']}
        projection = {'schemaVersion': 'caddy-four-delta-v1',
                      'status': 'VALIDATED_RESOURCE_TEST_COPY_NOT_LITERAL_PRODUCTION',
                      'knownGuards': dict(zip(('root','vega','lumbre','fodaveg'),
                                              self.package['sources'].values())),
                      'postimageSHA256': self.package['postimages'],
                      'composeGuards': self.package['composeGuards'],
                      'imageId': 'sha256:'+'d'*64, 'commandVerified': True,
                      'closureVerified': True, 'globalLogMerged': True,
                      'globalLogFilterVerified': True, 'policyRestored': True,
                      'scratchRemoved': True, 'adaptExit': 0, 'validateExit': 0}
        manifest = {'schemaVersion': 'caddy-four-delta-v1',
                    'operationId': 'validation',
                    'files': {'transformer.py': e.sha(self.transform_source)},
                    'dependencies': {}, 'postimages': self.package['postimages']}
        encode = lambda value: (json.dumps(value,sort_keys=True)+'\n').encode()
        self.artifacts = {'manifest': encode(manifest), 'projection': encode(projection),
                          'transformer': self.transform_source}
        for name in ('manifest','projection'):
            self.package['validation'+name.title()+'SHA256'] = e.sha(self.artifacts[name])
        receipt = {'operationId': 'validation', 'status': 'PROJECTED',
                   'validationStatus': projection['status'], 'transportExit': 0,
                   'manifestSHA256': self.package['validationManifestSHA256'],
                   'projectionSHA256': self.package['validationProjectionSHA256'],
                   'transformerSHA256': self.package['transformerSHA256']}
        self.artifacts['receipt'] = encode(receipt)
        self.package['validationReceiptSHA256'] = e.sha(self.artifacts['receipt'])
        self.reload_calls = 0
        self.validate_calls = 0
        self.smoke_calls = 0

    def observe(self):
        return {'identity': self.identity, 'directoryBindVerified': True,
                'commandVerified': True, 'configPathMapped': True,
                'adminAvailable': True, 'importsUnchanged': True,
                'referencedEnvUnchanged': True, 'sinkProof': True}

    def engine(self, validate=None, reload=None, smoke=None, rollback_smoke=None):
        return e.Engine(self.root, self.backups, self.package, self.artifacts, self.observe,
                        validate or self.validate, reload or self.reload,
                        smoke or self.smoke, rollback_smoke or self.rollback_smoke)

    def validate(self, images):
        self.validate_calls += 1
        return self.validation_proof(images)

    def validation_proof(self, images):
        return {'imageId': 'sha256:'+'d'*64, 'caddyId': 'e'*64, 'treeSHA256': e.tree_hash(images),
                'sameConsumer': True, 'scopeVerified': True, 'adaptExit': 0,
                'validateExit': 0}

    def reload(self):
        self.reload_calls += 1
        return {'caddyId': 'e'*64, 'reloadExit': 0, 'samePid1': True}

    def smoke(self):
        self.smoke_calls += 1
        return dict.fromkeys(('headers','panels','assets','api','peers',
                              'loggerMarkerAbsent','loggerControlObserved'), True)

    def rollback_smoke(self):
        return {"baselineServed": True, "peersHealthy": True, "sameCaddyId": True}

    def assert_files(self, expected):
        for name, data in expected.items():
            self.assertEqual((self.root / name).read_bytes(), data)

    def test_draft_rejected_before_callbacks_or_files(self):
        self.package['status'] = 'DRAFT'
        with self.assertRaisesRegex(e.Stop, 'INPUT_NOT_FINAL'):
            self.engine()
        self.assertEqual(list(self.backups.iterdir()), [])
        self.assert_files(self.original)

    def test_missing_sink_stops_before_backup(self):
        self.observe = lambda: {'identity': self.identity, 'directoryBindVerified': True,
                                'commandVerified': True, 'configPathMapped': True,
                                'adminAvailable': True, 'importsUnchanged': True,
                                'referencedEnvUnchanged': True, 'sinkProof': False}
        result = self.engine().run()
        self.assertEqual(result['phase'], 'STOP_NEEDS_OPERATOR')
        self.assertEqual(list(self.backups.iterdir()), [])
        self.assert_files(self.original)

    def test_transformer_seal_rejected_before_backend(self):
        self.package['transformerSHA256'] = 'f'*64
        with self.assertRaisesRegex(e.Stop, 'ARTIFACT_SEAL'):
            self.engine()
        self.assertEqual(list(self.backups.iterdir()), [])

    def test_receipt_bytes_tampered_before_backend(self):
        self.artifacts['receipt'] += b' '
        with self.assertRaisesRegex(e.Stop, 'ARTIFACT_SEAL'):
            self.engine()
        self.assertEqual(list(self.backups.iterdir()), [])

    def test_projection_producer_schema_rejected(self):
        value=json.loads(self.artifacts['projection'])
        value.pop('postimageSHA256')
        self.artifacts['projection']=(json.dumps(value,sort_keys=True)+'\n').encode()
        self.package['validationProjectionSHA256']=e.sha(self.artifacts['projection'])
        receipt=json.loads(self.artifacts['receipt'])
        receipt['projectionSHA256']=self.package['validationProjectionSHA256']
        self.artifacts['receipt']=(json.dumps(receipt,sort_keys=True)+'\n').encode()
        self.package['validationReceiptSHA256']=e.sha(self.artifacts['receipt'])
        with self.assertRaisesRegex(e.Stop, 'VALIDATION_BINDING'):
            self.engine()

    def test_rollback_requires_public_recovery(self):
        result=self.engine(smoke=lambda: None,rollback_smoke=lambda: None).run()
        self.assertEqual(result['phase'],'STOP_NEEDS_OPERATOR')
        self.assertFalse(result['rollbackVerified'])
        self.assert_files(self.original)

    def test_journal_failure_returns_finite_projection(self):
        with mock.patch.object(e,'journal',side_effect=OSError('disk')):
            result=self.engine().run()
        self.assertEqual(result['phase'],'STOP_NEEDS_OPERATOR')
        self.assertEqual(result['failureClass'],'UNKNOWN')
        self.assert_files(self.original)

    def test_validation_proof_cannot_be_bool(self):
        result = self.engine(validate=lambda images: True).run()
        self.assertEqual(result['phase'], 'STOP_NEEDS_OPERATOR')
        self.assertEqual(list(self.backups.iterdir()), [])

    def test_source_symlink_rejected_before_backup(self):
        source = self.root / 'Caddyfile'
        source.unlink()
        source.symlink_to(self.root / 'conf.d/vega.caddy')
        result = self.engine().run()
        self.assertEqual(result['phase'], 'STOP_NEEDS_OPERATOR')
        self.assertEqual(list(self.backups.iterdir()), [])

    def test_env_stability_required_before_backup(self):
        def unstable():
            state = self.observe_good()
            state['referencedEnvUnchanged'] = False
            return state
        self.observe_good = self.observe
        self.observe = unstable
        result = self.engine().run()
        self.assertEqual(result['phase'], 'STOP_NEEDS_OPERATOR')
        self.assertEqual(list(self.backups.iterdir()), [])

    def test_success_four_only(self):
        result = self.engine().run()
        self.assertEqual(result['phase'], 'ACCEPTED')
        self.assertEqual(self.reload_calls, 1)
        self.assert_files(self.post)
        directory = self.backups / self.package['operationId']
        self.assertEqual((directory.stat().st_mode & 0o777), 0o700)
        self.assertEqual((directory / 'Caddyfile').stat().st_mode & 0o777, 0o600)
        self.assertEqual((directory / 'Caddyfile').read_bytes(), self.original['Caddyfile'])

    def test_installed_validation_failure_rolls_back_without_reload(self):
        def fail_second(images):
            self.validate_calls += 1
            return self.validation_proof(images) if self.validate_calls == 1 else None
        result = self.engine(validate=fail_second).run()
        self.assertEqual(result['phase'], 'ROLLED_BACK')
        self.assertTrue(result['rollbackVerified'])
        self.assertEqual(self.reload_calls, 0)
        self.assert_files(self.original)

    def test_smoke_failure_rolls_back_and_reloads_once(self):
        result = self.engine(smoke=lambda: None).run()
        self.assertEqual(result['phase'], 'ROLLED_BACK')
        self.assertEqual(self.reload_calls, 2)
        self.assert_files(self.original)

    def test_foreign_cas_change_stops_without_restoring(self):
        def alter_second_validation(images):
            self.validate_calls += 1
            if self.validate_calls == 2:
                (self.root / 'Caddyfile').write_bytes(b'foreign')
            return self.validation_proof(images)
        result = self.engine(validate=alter_second_validation).run()
        self.assertEqual(result['phase'], 'STOP_NEEDS_OPERATOR')
        self.assertEqual((self.root / 'Caddyfile').read_bytes(), b'foreign')
        self.assertEqual(self.reload_calls, 0)

    def test_uncertain_reload_never_retried(self):
        def uncertain():
            self.reload_calls += 1
            raise RuntimeError('unknown')
        result = self.engine(reload=uncertain).run()
        self.assertEqual(result['phase'], 'STOP_NEEDS_OPERATOR')
        self.assertEqual(self.reload_calls, 1)
        self.assert_files(self.post)

    def test_projection_closed(self):
        with self.assertRaises(ValueError):
            e.projection('x', 'LOOSE', 'NONE')

if __name__ == '__main__':
    unittest.main(verbosity=2)
