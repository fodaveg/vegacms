"""Sealed one-shot wrapper. Local preparation does not grant runtime approval."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid
from projection import validate
from remote_validate import FILES, EDGE_GUARD, VEGA_GUARD, capture_process

MODE = 'caddy-referenced-values-only-private-isolated'
SCOPE = {
    'files': ['/srv/edge/' + path for path, _ in FILES.values()] + ['/srv/edge/compose.yml', '/srv/vega/infra/production/compose.yml'],
    'importPrefix': '/srv/edge/conf.d/', 'importSuffix': '.caddy',
    'container': 'edge-caddy', 'pidCommandOnly': '/proc/1/cmdline',
    'selectedDockerFields': ['Name', 'Image', 'Config.Entrypoint', 'Config.Cmd', 'Config.WorkingDir', 'Mounts.Source', 'Mounts.Destination', 'Mounts.Type', 'RepoDigests'],
    'variableValues': 'ONLY_NAMES_REFERENCED_IN_APPROVED_CADDYFILES_ONE_NAME_PER_EXEC',
    'environmentInventory': False, 'rawDataExport': False, 'activeConfigWrites': False,
    'adaptation': 'ISOLATED_SAME_IMAGE_RESOLVED_BYTES', 'validation': 'ISOLATED_RESOURCE_TEST_COPY',
    'isolatedNetwork': 'none', 'remoteScratch': '/dev/shm', 'newRuntimeApprovalRequired': True,
}
ARTIFACTS = ('remote_validate.py', 'run_once.py', 'projection.py', 'patch-inputs.json', 'probe.py', 'proposal.md', 'verification.md', 'probe.log')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def authorize(base, operation):
    """No connection or marker before exact seal and explicit new review approval match."""
    # Capture each artifact once; hashes, parsing and transport use these exact buffers.
    try:
        snapshot = {name: (base / name).read_bytes()
                    for name in ('execution-approval.json', 'manifest.json', *ARTIFACTS)}
    except OSError:
        raise ValueError('NOT_AUTHORIZED_ZERO_CONNECTIONS') from None
    approval = json.loads(snapshot['execution-approval.json'])
    required = {'status', 'reviewStatus', 'operationId', 'mode', 'manifestSHA256', 'scope', 'runtimeApprovalReference',
                'sensitiveValueAccessExplicitlyApproved', 'fullEnvironmentReadRejectedStill'}
    if set(approval) != required or approval['status'] != 'APPROVED' or approval['reviewStatus'] != 'APPROVED':
        raise ValueError('NOT_AUTHORIZED_ZERO_CONNECTIONS')
    manifest = json.loads(snapshot['manifest.json'])
    if (approval['operationId'] != operation or approval['mode'] != MODE or approval['scope'] != SCOPE
            or approval['manifestSHA256'] != hashlib.sha256(snapshot['manifest.json']).hexdigest()
            or approval['sensitiveValueAccessExplicitlyApproved'] is not True
            or approval['fullEnvironmentReadRejectedStill'] is not True
            or not isinstance(approval['runtimeApprovalReference'], str) or not approval['runtimeApprovalReference']):
        raise ValueError('NOT_AUTHORIZED_ZERO_CONNECTIONS')
    if set(manifest) != {'operationId', 'files'} or manifest['operationId'] != operation or set(manifest['files']) != set(ARTIFACTS):
        raise ValueError('SEAL_MISMATCH_ZERO_CONNECTIONS')
    if any(hashlib.sha256(snapshot[file]).hexdigest() != expected for file, expected in manifest['files'].items()):
        raise ValueError('SEAL_MISMATCH_ZERO_CONNECTIONS')
    return snapshot


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--operation-id', required=True)
    args = parser.parse_args()
    try:
        operation = str(uuid.UUID(args.operation_id))
        base = Path(__file__).resolve().parent
        snapshot = authorize(base, operation)
        patches = json.loads(snapshot['patch-inputs.json'])
        if set(patches) != {'vega', 'lumbre', 'fodaveg'} or any(not isinstance(v, str) for v in patches.values()):
            raise ValueError('PATCH_SHAPE_ZERO_CONNECTIONS')
    except Exception:
        print('NOT_AUTHORIZED_OR_SEAL_MISMATCH_ZERO_CONNECTIONS')
        return 1
    marker = base / 'request-started.json'
    try:
        descriptor = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w') as stream:
            json.dump({'operationId': operation, 'attempts': 1}, stream)
    except OSError:
        print('CONSUMED_OR_UNAVAILABLE_ZERO_CONNECTIONS')
        return 1
    receipt = {'operationId': operation, 'status': 'TRANSPORT_OR_PROJECTION_ERROR_NO_RETRY'}
    try:
        payload = ('PATCH_INPUTS = ' + repr(patches) + '\n').encode() + snapshot['remote_validate.py']
        result = capture_process(['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', 'lumbre', 'python3', '-B', '-'],
                                 input=payload, timeout=600, limit=65536)
        receipt['transportExit'] = result.returncode
        if result.returncode == 0:
            public = validate(json.loads(result.stdout), {label: expected for label, (_, expected) in FILES.items()},
                              {'edge': EDGE_GUARD, 'vega': VEGA_GUARD})
            (base / 'projection.json').write_text(json.dumps(public, sort_keys=True, indent=2) + '\n')
            receipt.update(status='PROJECTED', validationStatus=public['status'])
    except Exception:
        pass
    (base / 'execution-receipt.json').write_text(json.dumps(receipt, sort_keys=True, indent=2) + '\n')
    print(json.dumps(receipt))
    return 0 if receipt.get('validationStatus', '').startswith('VALIDATED') else 1


if __name__ == '__main__':
    sys.exit(main())
