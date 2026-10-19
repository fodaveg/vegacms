"""One-shot MIME wrapper: no connection before a new exact-scope runtime approval.

Read each approved artifact once. Hash, parse and transmit the same captured
buffers; changing paths later cannot introduce unreviewed payload bytes.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

MODE = 'lumbre-discovery-mime-guarded-site-recreate'
ARTIFACTS = ('remote_apply.py', 'capture.py', 'run_once.py', 'candidate.Caddyfile',
             'test_ops.py', 'proposal.md', 'checks.json')
SCOPE = {
    'writeFile': '/srv/lumbre-web/Caddyfile',
    'beforeSHA256': 'fb32709db7dfdf999a41e44cdee6669c141de2ffc067168931a051c9bbad92ba',
    'afterSHA256': 'd909f78a737b7970fae80468bb895cd8ac9ee035b1c5892273e73f8f10536d17',
    'composeFile': '/srv/lumbre-web/compose.yml',
    'composeSHA256': '680d04d18b7707fba2e7b377609c70e4f78f7067bb5e4e68e0f19972fd989ef5',
    'image': 'caddy@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648',
    'site': '/srv/lumbre-web/sites/a598bfe-astro020-pbadmin',
    'publisherPath': 'vega-publish.path', 'publisherMustAlreadyBeInactive': True,
    'publisherService': 'vega-publish.service', 'publisherServiceMustBeInactive': True,
    'requestExistenceOnly': '/srv/lumbre-admin/publish/request',
    'builderAncestorsOnly': ['lumbre-web-builder:abb2bb2-candidate', 'lumbre-web-builder:node22-pnpm11'],
    'selectedDockerFields': ['Id', 'Image', 'Config.Image', 'State.Running', 'State.Health.Status',
                             'HostConfig.ReadonlyRootfs', 'Mounts.Source', 'Mounts.Destination',
                             'Mounts.Type', 'Mounts.RW', 'NetworkSettings.Networks.edge.exists',
                             'NetworkSettings.Networks.count', 'RepoDigests'],
    'recreateOnlyService': 'site', 'composeProject': 'lumbre-web', 'composeDirectory': '/srv/lumbre-web', 'composeEnvFile': '/dev/null', 'pull': 'never', 'build': False,
    'privateBackup': '/srv/lumbre-web/.mime-discovery-<operationId>/before.Caddyfile',
    'backupMode': '0600', 'backupDirectoryMode': '0700',
    'rollback': 'ONLY_OWN_INSTALLED_BYTES_MODE_UID_GID_INODE_DEVICE_SIZE_MTIME_CTIME',
    'fullEnvironmentRead': False, 'credentialRead': False, 'logRead': False,
    'edgeChanges': False, 'publisherStateChanges': False, 'rawOutputExport': False,
    'newRuntimeApprovalRequired': True,
}
RESULT_KEYS = {'status', 'backupCreated', 'recreateExit', 'rollbackExit', 'sameImage',
               'runtimeChecked', 'publisherQuiescent', 'beforeSHA256', 'afterSHA256',
               'composeSHA256', 'operationId'}
STATUSES = {'STOPPED_BEFORE_WRITE', 'WRITE_IDENTITY_UNKNOWN_NEEDS_OPERATOR',
            'INSTALLED_PENDING_RUNTIME', 'ROLLBACK_NEEDS_OPERATOR',
            'APPLIED_RUNTIME_VERIFIED', 'ROLLED_BACK_RUNTIME_VERIFIED'}


def authorize(base, operation):
    """Snapshot once, then require both human review and the fresh runtime grant."""
    snapshot = {name: (base / name).read_bytes()
                for name in ('execution-approval.json', 'manifest.json', *ARTIFACTS)}
    approval = json.loads(snapshot['execution-approval.json'])
    manifest = json.loads(snapshot['manifest.json'])
    keys = {'status', 'reviewStatus', 'operationId', 'mode', 'manifestSHA256', 'scope',
            'runtimeApprovalReference', 'productionFileWriteExplicitlyApproved', 'siteRecreateExplicitlyApproved'}
    if (set(approval) != keys or approval['status'] != 'APPROVED' or approval['reviewStatus'] != 'APPROVED'
            or approval['operationId'] != operation or approval['mode'] != MODE or approval['scope'] != SCOPE
            or approval['productionFileWriteExplicitlyApproved'] is not True
            or approval['siteRecreateExplicitlyApproved'] is not True
            or not isinstance(approval['runtimeApprovalReference'], str) or not approval['runtimeApprovalReference']
            or approval['manifestSHA256'] != hashlib.sha256(snapshot['manifest.json']).hexdigest()
            or set(manifest) != {'operationId', 'files'} or manifest['operationId'] != operation
            or set(manifest['files']) != set(ARTIFACTS)):
        raise ValueError('NOT_AUTHORIZED')
    for name, expected in manifest['files'].items():
        if hashlib.sha256(snapshot[name]).hexdigest() != expected:
            raise ValueError('SEAL_MISMATCH')
    if hashlib.sha256(snapshot['candidate.Caddyfile']).hexdigest() != SCOPE['afterSHA256']:
        raise ValueError('CANDIDATE_MISMATCH')
    return snapshot


def payload(snapshot, operation):
    """Transport uses the exact approved byte buffers, with no filesystem rereads."""
    prefix = ('OPERATION = ' + repr(operation) + '\nCANDIDATE = ' + repr(snapshot['candidate.Caddyfile']) + '\n').encode()
    return prefix + snapshot['capture.py'] + b'\n' + snapshot['remote_apply.py']


def project(item, operation):
    """Accept fixed statuses/counts/exits only; reject extra fields or raw data."""
    if not isinstance(item, dict) or set(item) != RESULT_KEYS or item['status'] not in STATUSES or item['operationId'] != operation:
        raise ValueError('PROJECTION_UNKNOWN')
    for key in ('backupCreated', 'sameImage', 'runtimeChecked', 'publisherQuiescent'):
        if type(item[key]) is not bool:
            raise ValueError('PROJECTION_UNKNOWN')
    for key in ('recreateExit', 'rollbackExit'):
        if item[key] is not None and (type(item[key]) is not int or not 0 <= item[key] <= 255):
            raise ValueError('PROJECTION_UNKNOWN')
    for key in ('beforeSHA256', 'afterSHA256', 'composeSHA256'):
        if item[key] != SCOPE[key]:
            raise ValueError('PROJECTION_UNKNOWN')
    if item['status'] in ('APPLIED_RUNTIME_VERIFIED', 'ROLLED_BACK_RUNTIME_VERIFIED') and (
            not all(item[key] for key in ('backupCreated', 'sameImage', 'runtimeChecked', 'publisherQuiescent'))
            or item['recreateExit' if item['status'] == 'APPLIED_RUNTIME_VERIFIED' else 'rollbackExit'] != 0):
        raise ValueError('PROJECTION_UNKNOWN')
    return item


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--operation-id', required=True)
    args = parser.parse_args()
    base = Path(__file__).resolve().parent
    try:
        operation = str(uuid.UUID(args.operation_id))
        snapshot = authorize(base, operation)
        namespace = {'__name__': 'approved_capture'}
        exec(compile(snapshot['capture.py'], '<approved_capture>', 'exec'), namespace)
        transport = namespace['capture_process']
        approved_payload = payload(snapshot, operation)
    except Exception:
        print('NOT_AUTHORIZED_OR_SEAL_MISMATCH_ZERO_CONNECTIONS')
        return 1
    try:
        descriptor = os.open(base / 'request-started.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'w') as stream:
            json.dump({'operationId': operation, 'attempts': 1}, stream)
            stream.flush()
            os.fsync(stream.fileno())
    except OSError:
        print('CONSUMED_OR_UNAVAILABLE_ZERO_CONNECTIONS')
        return 1
    receipt = {'operationId': operation, 'status': 'TRANSPORT_OR_PROJECTION_UNKNOWN_NO_RETRY', 'transportExit': None}
    try:
        result = transport(['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                            'lumbre', 'python3', '-B', '-'], input=approved_payload, timeout=420, limit=4096)
        receipt['transportExit'] = result.returncode
        receipt['result'] = project(json.loads(result.stdout), operation)
        receipt['status'] = receipt['result']['status']
    except Exception:
        pass
    # No stdout/stderr bytes from the transport are ever persisted or displayed.
    descriptor = os.open(base / 'execution-receipt.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        json.dump(receipt, stream, sort_keys=True, indent=2)
        stream.write('\n')
    print(json.dumps(receipt, sort_keys=True))
    return 0 if receipt['status'] == 'APPLIED_RUNTIME_VERIFIED' else 1


if __name__ == '__main__':
    sys.exit(main())
