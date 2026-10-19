"""Sealed local launcher. No transport until an exact approval and unused operation ID."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import uuid
from projection import validate
from base_remote_validate import capture_process, Stop as CaptureStop

BASE_SHA256 = 'b9a4cc3ef38919409348509d0b6af8312655a795a3ec1caf0ffe4372cf032b6e'
MODE = 'caddy-native-original-routing-private-isolated'
OPERATION_ID = '2045785c-2235-408a-abfe-8f0c58858198'
SCOPE = {
    'source': 'ORIGINAL_EXPANDED_RAM_ONLY', 'hostPatches': False, 'globalLogMerge': False,
    'files': ['/srv/edge/Caddyfile', '/srv/edge/conf.d/vega.caddy',
              '/srv/edge/conf.d/admin-lumbre-pro.caddy', '/srv/edge/conf.d/fodaveg.caddy'],
    'compose': ['/srv/edge/compose.yml', '/srv/vega/infra/production/compose.yml',
                '/srv/lumbre-admin/compose.yml', '/root/fodaveg/compose.yml'],
    'importPrefix': '/srv/edge/conf.d/', 'importSuffix': '.caddy',
    'environment': 'REFERENCED_NAMES_ONE_BY_ONE_RAM_ONLY', 'environmentInventory': False,
    'container': 'edge-caddy', 'selectedConsumerContainers': ['vega-pb', 'lumbre-admin-pb', 'fodaveg'],
    'sameOCI': True, 'network': 'none', 'tmpfs': True,
    'rawExport': False, 'configAPI': False, 'logs': False, 'activeWrites': False,
    'runtimeApprovalRequired': True,
}
ARTIFACTS = ('base_remote_validate.py', 'remote_native.py', 'projection.py', 'run_once.py',
             'probe.py', 'proposal.md', 'procedure.md', 'verification.md', 'SHA256SUMS')


def authorize(base, operation):
    try:
        snapshot = {name: (base / name).read_bytes() for name in ('execution-approval.json', 'manifest.json', *ARTIFACTS)}
    except OSError:
        raise ValueError('NOT_AUTHORIZED_ZERO_CONNECTIONS') from None
    approval = json.loads(snapshot['execution-approval.json'])
    manifest = json.loads(snapshot['manifest.json'])
    if (set(approval) != {'status', 'reviewStatus', 'operationId', 'mode', 'scope',
                          'manifestSHA256', 'runtimeApprovalReference', 'sensitiveValueAccessExplicitlyApproved'}
        or approval['status'] != 'APPROVED' or approval['reviewStatus'] != 'APPROVED'
        or approval['operationId'] != operation or approval['mode'] != MODE or approval['scope'] != SCOPE
        or approval['manifestSHA256'] != hashlib.sha256(snapshot['manifest.json']).hexdigest()
        or not isinstance(approval['runtimeApprovalReference'], str) or not approval['runtimeApprovalReference']
        or approval['sensitiveValueAccessExplicitlyApproved'] is not True):
        raise ValueError('NOT_AUTHORIZED_ZERO_CONNECTIONS')
    if (set(manifest) != {'operationId', 'files'} or manifest['operationId'] != operation
        or set(manifest['files']) != set(ARTIFACTS)
        or any(hashlib.sha256(snapshot[name]).hexdigest() != manifest['files'][name] for name in ARTIFACTS)
        or hashlib.sha256(snapshot['base_remote_validate.py']).hexdigest() != BASE_SHA256):
        raise ValueError('SEAL_MISMATCH_ZERO_CONNECTIONS')
    return snapshot


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--operation-id', required=True)
    args = parser.parse_args()
    try:
        operation = str(uuid.UUID(args.operation_id))
        if operation != OPERATION_ID:
            raise ValueError('OPERATION_MISMATCH')
        base = Path(__file__).resolve().parent
        snapshot = authorize(base, operation)
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
    receipt = {'operationId': operation, 'status': 'TRANSPORT_OR_PROJECTION_ERROR_NO_RETRY',
               'failureClass': None}
    try:
        # The sealed base has no top-level side effects with this private module name.
        payload = (b"__name__ = 'caddy_base'\n" + snapshot['base_remote_validate.py'] +
                   b"\n__name__ = '__main__'\n" + snapshot['remote_native.py'])
        result = capture_process(['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                                  'lumbre', 'python3', '-B', '-'], input=payload,
                                 limit=65536, timeout=600)
        receipt['transportExit'] = result.returncode
        if result.returncode == 0 and len(result.stdout) <= 65536:
            public = validate(json.loads(result.stdout))
            (base / 'projection.json').write_text(json.dumps(public, sort_keys=True, indent=2) + '\n')
            receipt.update(status='PROJECTED', validationStatus=public['status'])
        else:
            receipt['failureClass'] = 'TRANSPORT_EXIT_OR_OUTPUT_LIMIT'
    except CaptureStop:
        receipt['failureClass'] = 'TRANSPORT_CAPTURE_LIMIT_OR_TIMEOUT'
    except OSError:
        receipt['failureClass'] = 'TRANSPORT_OSERROR'
    except RuntimeError:
        receipt['failureClass'] = 'TRANSPORT_RUNTIMEERROR'
    except json.JSONDecodeError:
        receipt['failureClass'] = 'REMOTE_JSON_INVALID'
    except ValueError:
        receipt['failureClass'] = 'PROJECTION_REJECTED'
    except Exception:
        receipt['failureClass'] = 'OTHER_ERROR'
    (base / 'execution-receipt.json').write_text(json.dumps(receipt, sort_keys=True, indent=2) + '\n')
    print(json.dumps(receipt))
    return 0 if receipt.get('validationStatus') == 'DIAGNOSED' else 1


if __name__ == '__main__':
    sys.exit(main())
