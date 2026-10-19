"""Sealed single-attempt Docker-only reader. Root must obtain a new runtime grant.

Capture all reviewed artifacts once; hash, parse and transmit the same buffers.
No approval => zero connections/no marker. No retry, no environment/log fallback.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import uuid

MODE = 'logs-docker-only-fixed-four-identities-selective-read'
ARTIFACTS = ('project_metadata.py', 'test_projection.py', 'capture.py', 'pins.json',
             'remote_read.py', 'run_once.py', 'test_executor.py', 'proposal.md', 'receipt.json', 'checks.json')
FROZEN_PROJECTOR = '365ef90796abf30359b3210026b0918e9e263a3f00f6560df31ac6b35bb7eacf'
FROZEN_CAPTURE = 'd48e4a2705ebaac2d32720b38ebab1040fde26b3348a2aeeeb906702af4e9b01'
PIN_SHA = 'ebeaff189ea269454d976b9b64fe246f8a24b779c7db6838399e4fa55d5d7d45'
SCOPE = {
    'containerNames': ['vega-pb', 'lumbre-admin-pb', 'fodaveg', 'edge-caddy'],
    'pinsSHA256': PIN_SHA, 'selectedFields': ['Id', 'Image', 'HostConfig.LogConfig.Type'],
    'driverFirst': True, 'allowedDriversForOptionRead': ['json-file', 'local', 'none'],
    'unknownKeyGate': 'COUNT_BOOLEAN_ONLY_BEFORE_OPTION_VALUES',
    'knownOptionsOnly': ['max-size', 'max-file', 'compress', 'mode', 'max-buffer-size'],
    'pinContainerIdForAllOptionQueries': True, 'identityRecheckAfterRead': True,
    'maxCommands': 20, 'commandTimeoutSeconds': 12, 'stdoutLimitBytes': 8192,
    'fullConfigOrLogConfig': False, 'configEnvOrEnvironmentValues': False,
    'logPathOrLogContents': False, 'healthOutput': False, 'caddyAdminGET': False,
    'credentialAccess': False, 'remoteWritesOrRestart': False, 'contactOrMail': False,
    'taskClosureOrGlobalTokenAbsenceClaim': False, 'newRuntimeGrantRequired': True,
}
CONTAINERS = tuple(SCOPE['containerNames'])
RESULT_KEYS = {'operationId', 'status', 'identitiesPreserved', 'identityRecheckPassed',
               'containers', 'commands', 'unresolved', 'taskClosureProved',
               'globalTokenAbsenceClaimed', 'remoteWrites', 'logsRead', 'configEnvRead'}
UNRESOLVED = ['PB_EFFECTIVE_SETTINGS_UNRESOLVED', 'CADDY_DEFAULT_RUNTIME_FILTER_UNRESOLVED', 'NAMED_CUSTOM_CHANNELS_UNRESOLVED']
ITEM_KEYS = {'status', 'driver', 'maxBytes', 'maxFiles', 'compressed', 'delivery',
             'bufferBytes', 'retentionDays', 'readerPolicy', 'collectorPolicy',
             'filterPolicy', 'effectiveTokenSafetyProved'}
ITEM_STATUSES = {'STOP_UNKNOWN_METADATA', 'STOP_UNKNOWN_OPTIONS_NO_VALUES_REQUESTED',
                 'STOP_EXTERNAL_OR_JOURNAL_RETENTION_UNKNOWN',
                 'DOCKER_STREAM_DISABLED_OTHER_SINKS_UNKNOWN',
                 'CONFIGURED_SIZE_COUNT_ONLY_OTHER_SINKS_UNKNOWN',
                 'STOP_ROTATION_DEFAULT_OR_UNSET_UNKNOWN'}
DRIVERS = {'UNKNOWN', 'JSON_FILE', 'LOCAL', 'NONE', 'JOURNALD', 'SYSLOG', 'FLUENTD',
           'GELF', 'AWSLOGS', 'SPLUNK', 'GCPLOGS'}


def authorize(base, operation):
    """Validate the exact new grant and seal before any marker or connection."""
    snapshot = {name: (base / name).read_bytes()
                for name in ('execution-approval.json', 'manifest.json', *ARTIFACTS)}
    approval = json.loads(snapshot['execution-approval.json'])
    manifest = json.loads(snapshot['manifest.json'])
    keys = {'status', 'reviewStatus', 'operationId', 'mode', 'manifestSHA256', 'scope',
            'runtimeApprovalReference', 'selectiveDockerMetadataAccessExplicitlyApproved',
            'environmentOrLogContentAccessApproved'}
    if (set(approval) != keys or approval['status'] != 'APPROVED' or approval['reviewStatus'] != 'APPROVED'
            or approval['operationId'] != operation or approval['mode'] != MODE or approval['scope'] != SCOPE
            or approval['selectiveDockerMetadataAccessExplicitlyApproved'] is not True
            or approval['environmentOrLogContentAccessApproved'] is not False
            or not isinstance(approval['runtimeApprovalReference'], str) or not approval['runtimeApprovalReference']
            or approval['manifestSHA256'] != hashlib.sha256(snapshot['manifest.json']).hexdigest()
            or set(manifest) != {'operationId', 'files'} or manifest['operationId'] != operation
            or set(manifest['files']) != set(ARTIFACTS)):
        raise ValueError('NOT_AUTHORIZED')
    for name, expected in manifest['files'].items():
        if hashlib.sha256(snapshot[name]).hexdigest() != expected:
            raise ValueError('SEAL_MISMATCH')
    if (hashlib.sha256(snapshot['project_metadata.py']).hexdigest() != FROZEN_PROJECTOR
            or hashlib.sha256(snapshot['capture.py']).hexdigest() != FROZEN_CAPTURE
            or hashlib.sha256(snapshot['pins.json']).hexdigest() != PIN_SHA):
        raise ValueError('PINNED_REUSE_MISMATCH')
    return snapshot


def payload(snapshot, operation):
    """Build exclusively from approved buffers; never re-open paths after authorization."""
    pins = json.loads(snapshot['pins.json'])
    prefix = ('OPERATION = ' + repr(operation) + '\nPINS = ' + repr(pins) + '\n').encode()
    return prefix + snapshot['capture.py'] + b'\n' + snapshot['project_metadata.py'] + b'\n' + snapshot['remote_read.py']


def project(result, operation):
    """Closed output schema; never store raw config scalars, stderr or unknown strings."""
    if not isinstance(result, dict) or set(result) != RESULT_KEYS or result['operationId'] != operation:
        raise ValueError('PROJECTION_UNKNOWN')
    if result['status'] not in {'DOCKER_ONLY_PARTIAL_IDENTITIES_PRESERVED', 'STOP_UNKNOWN_OR_IDENTITY_DRIFT'}:
        raise ValueError('PROJECTION_UNKNOWN')
    if result['unresolved'] != UNRESOLVED or type(result['commands']) is not int or not 0 <= result['commands'] <= 20:
        raise ValueError('PROJECTION_UNKNOWN')
    for key in ('taskClosureProved', 'globalTokenAbsenceClaimed', 'remoteWrites', 'logsRead', 'configEnvRead'):
        if result[key] is not False:
            raise ValueError('PROJECTION_UNKNOWN')
    good = result['status'] == 'DOCKER_ONLY_PARTIAL_IDENTITIES_PRESERVED'
    if result['identitiesPreserved'] is not good or result['identityRecheckPassed'] is not good:
        raise ValueError('PROJECTION_UNKNOWN')
    if not isinstance(result['containers'], dict) or set(result['containers']) != (set(CONTAINERS) if good else set()):
        raise ValueError('PROJECTION_UNKNOWN')
    if good and result['commands'] < 8:
        raise ValueError('PROJECTION_UNKNOWN')
    for item in result['containers'].values():
        if not isinstance(item, dict) or set(item) != ITEM_KEYS or item['status'] not in ITEM_STATUSES or item['driver'] not in DRIVERS:
            raise ValueError('PROJECTION_UNKNOWN')
        if item['compressed'] not in {'UNKNOWN', 'TRUE', 'FALSE', 'UNSET_NO_DEFAULT_INFERRED'} or item['delivery'] not in {'UNKNOWN', 'BLOCKING', 'NON_BLOCKING', 'UNSET_NO_DEFAULT_INFERRED'}:
            raise ValueError('PROJECTION_UNKNOWN')
        for key, maximum in (('maxBytes', 1024 ** 4), ('bufferBytes', 1024 ** 4), ('maxFiles', 9999)):
            if item[key] is not None and (type(item[key]) is not int or not 1 <= item[key] <= maximum):
                raise ValueError('PROJECTION_UNKNOWN')
        if item['retentionDays'] is not None or item['effectiveTokenSafetyProved'] is not False or any(item[key] != 'NOT_OBSERVED' for key in ('readerPolicy', 'collectorPolicy', 'filterPolicy')):
            raise ValueError('PROJECTION_UNKNOWN')
    return result


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
                            'lumbre', 'python3', '-B', '-'], input=approved_payload, timeout=300, limit=16384)
        receipt['transportExit'] = result.returncode
        receipt['result'] = project(json.loads(result.stdout), operation)
        receipt['status'] = receipt['result']['status']
    except Exception:
        pass
    descriptor = os.open(base / 'execution-receipt.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        json.dump(receipt, stream, sort_keys=True, indent=2)
        stream.write('\n')
    print(json.dumps(receipt, sort_keys=True))
    return 0 if receipt['status'] == 'DOCKER_ONLY_PARTIAL_IDENTITIES_PRESERVED' and receipt['transportExit'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
