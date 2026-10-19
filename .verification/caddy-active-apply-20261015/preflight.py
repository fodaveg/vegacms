"""Local DRAFT seal check; never opens SSH or invokes the apply engine."""
import hashlib
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def check():
    failures = []
    try:
        candidate = json.loads((HERE / 'candidate.json').read_text())
        manifest = json.loads((HERE / 'manifest.json').read_text())
        if (manifest.get('operationId') != candidate.get('operationId') or
                manifest.get('status') != 'DRAFT_SEAL_NO_RUNTIME_AUTHORITY' or
                not isinstance(manifest.get('files'), dict) or
                any(digest(HERE / name) != expected for name, expected in manifest['files'].items())):
            failures.append('DRAFT_SEAL_BROKEN')
        if (candidate.get('status') != 'DRAFT_ENGINE_LOCAL_ONLY_DEPENDS_ON_FINAL_VALIDATION' or
                candidate.get('validation', {}).get('status') != 'PENDING' or
                candidate.get('scope', {}).get('sshAuthorized') is not False or
                candidate.get('scope', {}).get('applicationAuthorized') is not False):
            failures.append('DRAFT_SCOPE_CHANGED')
    except (OSError, ValueError, KeyError, TypeError):
        failures.append('DRAFT_SEAL_UNREADABLE')
    return sorted(set(failures))

if __name__ == '__main__':
    failures = check()
    print(json.dumps({'status': 'DRAFT_BLOCKED', 'failureClasses': failures}, sort_keys=True))
    sys.exit(2 if failures else 0)
