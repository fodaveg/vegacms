"""Offline classifier regressions; no remote access."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from remote_probe import classify, token_reason
from projection import validate
import run_once

PRIOR = HERE.parent / 'caddy-global-logs-20261015'
VALIDATOR = (PRIOR / 'remote_validate.py').read_bytes()
FRAGMENT = (PRIOR / 'global-log-fragment.caddy').read_bytes()


def inspect(source):
    data = source.encode()
    return classify(data, FRAGMENT, VALIDATOR, hashlib.sha256(data).hexdigest())


class ClassifierTests(unittest.TestCase):
    def test_reproduces_blanket_quoted_brace_even_in_comment(self):
        result = inspect('{\n # "{"\n log default {\n  level INFO\n }\n}\n')
        self.assertEqual((result['failureClass'], result['stage'], result['category'], result['context']),
                         ('SYNTAX_UNSUPPORTED', 'BLANKET', 'QUOTED_OPEN_BRACE', 'WHOLE_SOURCE'))
        self.assertTrue(result['blanketFlags']['quotedOpenBrace'])
        validate(result)

    def test_reproduces_token_quoted_backslash_without_value(self):
        result = inspect('{\n log default {\n  level "I\\NFO"\n }\n}\n')
        self.assertEqual((result['failureClass'], result['stage'], result['category'], result['context']),
                         ('SYNTAX_UNSUPPORTED', 'TOKEN', 'QUOTED_BACKSLASH', 'GLOBAL_LOG_DEFAULT'))
        self.assertNotIn('I\\NFO', json.dumps(result))
        validate(result)

    def test_reproduces_inline_braces(self):
        result = inspect('{\n log default {\n  level INFO\n }\n foo { bar }\n}\n')
        self.assertEqual((result['failureClass'], result['stage'], result['category']),
                         ('SYNTAX_UNSUPPORTED', 'STRUCTURE', 'INLINE_OR_MULTIPLE_BRACE'))
        validate(result)

    def test_ordinary_bare_backslash_is_not_blindly_rejected(self):
        result = inspect('{\n log default {\n  level INFO\\X\n }\n}\n')
        self.assertEqual((result['status'], result['category']), ('NOT_REPRODUCED', 'NO_STOP'))
        validate(result)

    def test_stage_classifier_handles_lexical_subclasses(self):
        self.assertEqual(token_reason('x\\'), 'BARE_BACKSLASH_FINAL')
        self.assertEqual(token_reason('x\\#'), 'BARE_BACKSLASH_DELIMITER')
        self.assertEqual(token_reason('"unterminated'), 'QUOTE_UNCLOSED')
        self.assertEqual(token_reason('"closed"suffix'), 'QUOTE_BOUNDARY')

    def test_projection_rejects_private_or_unknown_output(self):
        result = inspect('{\n # "{"\n log default {\n }\n}\n')
        result['rawLine'] = 'private'
        with self.assertRaises(ValueError):
            validate(result)

    def test_no_approval_causes_zero_connections_and_no_marker(self):
        self.assertFalse((HERE / 'execution-approval.json').exists())
        marker = HERE / 'request-started.json'
        self.assertFalse(marker.exists())
        result = subprocess.run([sys.executable, '-B', str(HERE / 'run_once.py'),
                                 '--operation-id', '728f92f0-4623-4a74-9324-8873f78da905'],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout.strip(), 'NOT_AUTHORIZED_OR_SEAL_MISMATCH_ZERO_CONNECTIONS')
        self.assertFalse(marker.exists())

    def test_seal_accepts_only_exact_artifacts_in_isolated_fixture(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory) / 'candidate'
            previous = Path(directory) / 'caddy-global-logs-20261015'
            base.mkdir(); previous.mkdir()
            for name in run_once.FILES:
                shutil.copy2(HERE / name, base / name)
            for name in run_once.DEPENDENCIES:
                shutil.copy2(PRIOR / name, previous / name)
            operation = '728f92f0-4623-4a74-9324-8873f78da905'
            manifest = {'operationId': operation,
                        'files': {name: hashlib.sha256((base / name).read_bytes()).hexdigest()
                                  for name in run_once.FILES},
                        'dependencies': run_once.DEPENDENCIES}
            (base / 'manifest.json').write_text(json.dumps(manifest))
            approval = {'status': 'APPROVED', 'reviewStatus': 'APPROVED',
                        'operationId': operation, 'mode': run_once.MODE,
                        'manifestSHA256': hashlib.sha256((base / 'manifest.json').read_bytes()).hexdigest(),
                        'scope': run_once.SCOPE, 'runtimeApprovalReference': 'synthetic-fixture-only'}
            (base / 'execution-approval.json').write_text(json.dumps(approval))
            with patch.object(run_once, 'HERE', base), patch.object(run_once, 'PRIOR', previous):
                run_once.authorize(operation)
                (previous / 'remote_validate.py').write_bytes(b'changed')
                with self.assertRaisesRegex(ValueError, 'SEAL_MISMATCH_ZERO_CONNECTIONS'):
                    run_once.authorize(operation)


if __name__ == '__main__':
    unittest.main(verbosity=2)
