"""Offline source-form diagnostics against the sealed parser."""
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
from remote_probe import diagnose
from projection import validate
import run_once

PRIOR = HERE.parent / 'caddy-global-logs-20261015'
VALIDATOR = (PRIOR / 'remote_validate.py').read_bytes()
FRAGMENT = (PRIOR / 'global-log-fragment.caddy').read_bytes()
OPERATION = 'fcbaf292-d28f-4a15-bcd2-84fd047123bb'


def inspect(source):
    data = source.encode()
    return diagnose(data, VALIDATOR, FRAGMENT, hashlib.sha256(data).hexdigest())


class MarkerFormTests(unittest.TestCase):
    def test_raw_backtick_single_line(self):
        result = inspect('{\n log default {\n  level `INFO`\n }\n}\n')
        self.assertEqual((result['kind'], result['form'], result['position'], result['context']),
                         ('BACKTICK', 'RAW_QUOTE_SINGLE_LINE', 'TOKEN_INITIAL', 'GLOBAL_LOG_DEFAULT'))
        validate(result)

    def test_raw_backtick_multiline(self):
        result = inspect('{\n log default {\n  level `INFO\n  MORE`\n }\n}\n')
        self.assertEqual((result['kind'], result['form']), ('BACKTICK', 'RAW_QUOTE_MULTILINE'))
        validate(result)

    def test_backtick_bare_and_double_quoted(self):
        bare = inspect('{\n log default {\n  level IN`FO\n }\n}\n')
        escaped = inspect('{\n log default {\n  level IN\\`FO\n }\n}\n')
        quoted = inspect('{\n log default {\n  level "IN`FO"\n }\n}\n')
        self.assertEqual((bare['form'], bare['position']), ('BARE_INTERIOR', 'TOKEN_INTERIOR'))
        self.assertEqual(escaped['form'], 'BARE_INTERIOR_ESCAPED')
        self.assertEqual((quoted['form'], quoted['position']), ('DOUBLE_QUOTED_INTERIOR', 'DOUBLE_QUOTED'))
        validate(bare); validate(escaped); validate(quoted)

    def test_bom_prefix_and_token_interior(self):
        prefix = inspect('\ufeff{\n log default {\n }\n}\n')
        inner = inspect('{\n log default {\n  level IN\ufeffFO\n }\n}\n')
        self.assertEqual((prefix['kind'], prefix['form'], prefix['position']),
                         ('BOM', 'FILE_PREFIX', 'FILE_PREFIX'))
        self.assertEqual((inner['kind'], inner['form']), ('BOM', 'BARE_TOKEN_INTERIOR'))
        validate(prefix); validate(inner)

    def test_markers_in_comment_are_inactive(self):
        result = inspect('{\n # ` \ufeff\n log default {\n  level INFO\n }\n}\n')
        self.assertEqual((result['status'], result['kind'], result['form']),
                         ('NOT_REPRODUCED', 'NONE', 'NO_ACTIVE_MARKER'))
        validate(result)

    def test_projection_excludes_content_and_unknown_fields(self):
        result = inspect('{\n log default {\n  level `INFO`\n }\n}\n')
        self.assertNotIn('INFO', json.dumps(result))
        result['rawToken'] = 'private'
        with self.assertRaises(ValueError):
            validate(result)

    def test_no_approval_zero_connections(self):
        self.assertFalse((HERE / 'execution-approval.json').exists())
        marker = HERE / 'request-started.json'
        self.assertFalse(marker.exists())
        result = subprocess.run([sys.executable, '-B', str(HERE / 'run_once.py'),
                                 '--operation-id', OPERATION], capture_output=True,
                                text=True, timeout=10)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout.strip(), 'NOT_AUTHORIZED_OR_SEAL_MISMATCH_ZERO_CONNECTIONS')
        self.assertFalse(marker.exists())

    def test_exact_seal_fixture_and_dependency_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory) / 'candidate'
            previous = Path(directory) / 'caddy-global-logs-20261015'
            base.mkdir(); previous.mkdir()
            for name in run_once.FILES:
                shutil.copy2(HERE / name, base / name)
            for name in run_once.DEPENDENCIES:
                shutil.copy2(PRIOR / name, previous / name)
            manifest = {'operationId': OPERATION,
                        'files': {name: hashlib.sha256((base / name).read_bytes()).hexdigest()
                                  for name in run_once.FILES},
                        'dependencies': run_once.DEPENDENCIES}
            (base / 'manifest.json').write_text(json.dumps(manifest))
            approval = {'status': 'APPROVED', 'reviewStatus': 'APPROVED',
                        'operationId': OPERATION, 'mode': run_once.MODE,
                        'manifestSHA256': hashlib.sha256((base / 'manifest.json').read_bytes()).hexdigest(),
                        'scope': run_once.SCOPE, 'runtimeApprovalReference': 'synthetic-fixture-only'}
            (base / 'execution-approval.json').write_text(json.dumps(approval))
            with patch.object(run_once, 'HERE', base), patch.object(run_once, 'PRIOR', previous):
                run_once.authorize(OPERATION)
                (previous / 'remote_validate.py').write_bytes(b'changed')
                with self.assertRaisesRegex(ValueError, 'SEAL_MISMATCH_ZERO_CONNECTIONS'):
                    run_once.authorize(OPERATION)


if __name__ == '__main__':
    unittest.main(verbosity=2)
