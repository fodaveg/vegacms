import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
PRIOR = HERE.parent / 'caddy-global-logs-rawquote-20261015'

def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

probe = load('remote_probe')
projection = load('projection')
validator = (PRIOR / 'remote_validate.py').read_bytes()
fragment = (PRIOR / 'global-log-fragment.caddy').read_bytes()
module = {'__name__': 'sealed_validator'}
exec(compile(validator, '<sealed-validator>', 'exec'), module)

class ShapeTests(unittest.TestCase):
    def classify(self, source):
        return probe.shape(source.encode(), module)

    def test_unnamed_default(self):
        self.assertEqual(self.classify('{\n log {\n level INFO\n }\n}\nexample.test {\n log\n}\n')[0], 'UNNAMED_DEFAULT')

    def test_explicit_default(self):
        self.assertEqual(self.classify('{\n log default {\n level INFO\n }\n}\n')[0], 'EXPLICIT_DEFAULT')

    def test_absent_global(self):
        self.assertEqual(self.classify('example.test {\n log\n}\n')[:3], ('GLOBAL_NOT_FIRST', 'OTHER', 'ZERO'))

    def test_no_log(self):
        self.assertEqual(self.classify('{\n debug\n}\n')[0], 'NO_ROOT_LOG')

    def test_duplicate(self):
        self.assertEqual(self.classify('{\n log {\n }\n log default {\n }\n}\n')[0], 'MULTIPLE_ROOT_LOGS')

    def test_other_named(self):
        self.assertEqual(self.classify('{\n log named {\n }\n}\n')[0], 'OTHER_ROOT_LOG')

    def test_import(self):
        self.assertEqual(self.classify('{\n import conf.d/*.caddy\n}\n')[6], True)

    def test_multiple_global(self):
        self.assertEqual(self.classify('{\n}\n{\n}\n')[0], 'GLOBAL_COUNT_UNEXPECTED')

    def test_rawquote_braces_are_data(self):
        self.assertEqual(self.classify('{\n log {\n  level `brace { # " \\ }`\n }\n}\n')[0], 'UNNAMED_DEFAULT')

    def test_merge_guard_and_projection(self):
        root = b'{\n log {\n }\n}\n'
        result = probe.diagnose(root, validator, fragment, hashlib.sha256(root).hexdigest())
        self.assertEqual(result['diagnosis'], 'UNNAMED_DEFAULT')
        self.assertTrue(result['mergeReproduced'])
        self.assertEqual(projection.validate(result), result)
        self.assertEqual(probe.diagnose(root, validator, fragment)['diagnosis'], 'ROOT_CHANGED')

    def test_projection_rejects_extra_and_private_data(self):
        root = b'{\n log {\n }\n}\n'
        result = probe.diagnose(root, validator, fragment, hashlib.sha256(root).hexdigest())
        result['private'] = 'secret'
        with self.assertRaises(ValueError):
            projection.validate(result)

    def test_no_approval_means_zero_connections(self):
        run = load('run_once')
        with self.assertRaisesRegex(ValueError, 'NOT_AUTHORIZED_ZERO_CONNECTIONS'):
            run.authorize('00000000-0000-4000-8000-000000000000')

if __name__ == '__main__':
    unittest.main(verbosity=2)
