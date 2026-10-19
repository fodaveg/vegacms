"""One-shot local wrapper. A sealed explicit approval is required before SSH."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import uuid
from projection import validate

HERE = Path(__file__).resolve().parent
PRIOR = HERE.parent / 'caddy-global-logs-20261015'
MODE = 'caddy-root-marker-form-classifier-read-only'
SCOPE = {'readPaths': ['/srv/edge/Caddyfile'], 'expectedRootSHA256':
         'ff093f30330f8a7fa536bffcafb12cc316b096e4210142461889da66eaabb09b',
         'container': None, 'environmentReads': False, 'docker': False,
         'activeWrites': False, 'rawSourceExport': False, 'lineNumbersExport': False,
         'remoteScratch': None}
FILES = ('remote_probe.py', 'projection.py', 'run_once.py', 'probe.py',
         'proposal.md', 'verification.md', 'probe.log')
DEPENDENCIES = {'remote_validate.py': 'd980095b44a9d5c53940fea86dc4863619273bafed8c64798247516c5e37503f',
                'global-log-fragment.caddy': '79cb9a1ac82ef4dda07c822794a8ca3e9091f3a0cab1a854ea8a20941492c441'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def authorize(operation):
    try:
        snapshot = {name: (HERE / name).read_bytes() for name in (*FILES, 'manifest.json', 'execution-approval.json')}
        dependencies = {name: (PRIOR / name).read_bytes() for name in DEPENDENCIES}
        approval = json.loads(snapshot['execution-approval.json'])
        manifest = json.loads(snapshot['manifest.json'])
    except (OSError, ValueError):
        raise ValueError('NOT_AUTHORIZED_ZERO_CONNECTIONS') from None
    if (set(approval) != {'status', 'reviewStatus', 'operationId', 'mode', 'manifestSHA256',
                         'scope', 'runtimeApprovalReference'} or
            approval['status'] != 'APPROVED' or approval['reviewStatus'] != 'APPROVED' or
            approval['operationId'] != operation or approval['mode'] != MODE or
            approval['scope'] != SCOPE or approval['manifestSHA256'] != sha(snapshot['manifest.json']) or
            not isinstance(approval['runtimeApprovalReference'], str) or not approval['runtimeApprovalReference']):
        raise ValueError('NOT_AUTHORIZED_ZERO_CONNECTIONS')
    if (set(manifest) != {'operationId', 'files', 'dependencies'} or
            manifest['operationId'] != operation or set(manifest['files']) != set(FILES) or
            manifest['dependencies'] != DEPENDENCIES or
            any(sha(snapshot[name]) != expected for name, expected in manifest['files'].items()) or
            any(sha(dependencies[name]) != expected for name, expected in DEPENDENCIES.items())):
        raise ValueError('SEAL_MISMATCH_ZERO_CONNECTIONS')
    return snapshot, dependencies


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--operation-id', required=True)
    args = parser.parse_args()
    try:
        operation = str(uuid.UUID(args.operation_id))
        snapshot, dependencies = authorize(operation)
    except Exception:
        print('NOT_AUTHORIZED_OR_SEAL_MISMATCH_ZERO_CONNECTIONS')
        return 1
    marker = HERE / 'request-started.json'
    try:
        fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump({'operationId': operation, 'attempts': 1}, stream)
    except OSError:
        print('CONSUMED_OR_UNAVAILABLE_ZERO_CONNECTIONS')
        return 1
    receipt = {'operationId': operation, 'status': 'TRANSPORT_OR_PROJECTION_ERROR_NO_RETRY'}
    try:
        module = {'__name__': 'sealed_validator'}
        exec(compile(dependencies['remote_validate.py'], '<sealed-validator>', 'exec'), module)
        payload = (b'VALIDATOR_SOURCE = ' + repr(dependencies['remote_validate.py']).encode() +
                   b'\nLOG_FRAGMENT = ' + repr(dependencies['global-log-fragment.caddy']).encode() +
                   b'\n' + snapshot['remote_probe.py'])
        result = module['capture_process'](
            ['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
             'lumbre', 'python3', '-B', '-'], input=payload, timeout=90, limit=4096)
        receipt['transportExit'] = result.returncode
        if result.returncode == 0:
            public = validate(json.loads(result.stdout))
            (HERE / 'projection.json').write_text(json.dumps(public, sort_keys=True, indent=2) + '\n')
            receipt.update(status='PROJECTED', markerKind=public['kind'])
    except Exception:
        pass
    (HERE / 'execution-receipt.json').write_text(json.dumps(receipt, sort_keys=True, indent=2) + '\n')
    print(json.dumps(receipt, sort_keys=True))
    return 0 if receipt['status'] == 'PROJECTED' else 1


if __name__ == '__main__':
    sys.exit(main())
