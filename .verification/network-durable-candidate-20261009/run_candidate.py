"""Release-owner-only sealed transport; preparation/selftests never call SSH."""
import argparse
import base64
import hashlib
import sys
import json
import os
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = Path('/Users/david/code/vegacms/.verification')
NEXT = ROOT / 'cors-network-adoption-20261008/network-next'
MODULES = (
    ('image_helpers', ROOT / 'image-only-delivery-20261008/remote_cutover.py'),
    ('cors_apply', ROOT / 'cors-network-adoption-20261008/apply/remote_apply.py'),
    ('edge_base', NEXT / 'remote_edge_read.py'),
    ('edge_phase2', NEXT / 'remote_edge_phase2.py'),
    ('edge_apply', NEXT / 'remote_edge_apply_candidate.py'),
    ('stock_frozen', NEXT / 'remote_stock_network_adapter.py'),
    ('stock_validator', NEXT / 'run_stock_network_candidate.py'),
    ('edge_durable', HERE / 'remote_edge_durable.py'),
    ('network_dependencies', HERE / 'remote_dependencies.py'),
    ('stock_durable', HERE / 'remote_stock_durable.py'),
)
HEX = re.compile(r'[0-9a-f]{64}\Z')
BACKUP = re.compile(r'edge-[0-9a-f]{24}\Z')


def sha(body):
    return hashlib.sha256(body).hexdigest()


def load_sources(manifest, expected):
    body = manifest.read_bytes()
    if sha(body) != expected:
        raise RuntimeError('ManifestSealChanged')
    value = json.loads(body)
    if not isinstance(value, dict) or set(value) != {name for name, _ in MODULES}:
        raise RuntimeError('ManifestSchemaUnknown')
    result = []
    for name, path in MODULES:
        source = path.read_bytes()
        if sha(source) != value[name]:
            raise RuntimeError('SourceSealChanged')
        result.append((name, source))
    return result


def valid(value, code, action, backup, stock_backup):
    if action.startswith('stock-'):
        return sys.modules['stock_validator'].valid(value, code, action.removeprefix('stock-'), backup, stock_backup)
    if not isinstance(value, dict) or value.get('privateValuesExported') is not False:
        return False
    if value.get('status') == 'STOP_DURABLE_NEEDS_OPERATOR':
        return (code == 2 and set(value) == {'status', 'remoteWrites', 'privateValuesExported', 'backupId'} and
                value['backupId'] == backup and value['remoteWrites'] is (action != 'durable-check'))
    if value.get('backupId') != backup or code != 0:
        return False
    if action == 'durable-publish':
        return (set(value) == {'status', 'backupId', 'head', 'parent', 'composeSha', 'networkId', 'remoteWrites',
                'privateValuesExported', 'modelDeltaOnlyDedicatedNetwork', 'runtimeNonNetworkFingerprintPreserved',
                'caddyRecreateNotPerformed', 'nonNetworkRecreateFieldsPreserved'} and
                value['status'] == 'CADDY_SOURCE_DURABLE' and value['remoteWrites'] is True and
                re.fullmatch(r'[0-9a-f]{40}', value.get('head', '')) and
                value['parent'] == '2c3034b82efc070d5b747de8322936e3dbcc7459' and
                value['composeSha'] == '6c527267ca840d9889b20766ff272cef477834045ccbf29387beab19ae70a977' and
                HEX.fullmatch(value.get('networkId', '')) and all(value[k] is True for k in (
                'modelDeltaOnlyDedicatedNetwork', 'runtimeNonNetworkFingerprintPreserved',
                'caddyRecreateNotPerformed', 'nonNetworkRecreateFieldsPreserved')))
    return (action in {'durable-check', 'durable-rollback-source'} and
            set(value) == {'status', 'backupId', 'head', 'remoteWrites', 'privateValuesExported'} and
            value['status'] == ('DURABLE_SOURCE_VERIFIED' if action == 'durable-check' else 'DURABLE_SOURCE_ROLLED_BACK') and
            re.fullmatch(r'[0-9a-f]{40}', value.get('head', '')) and
            value['remoteWrites'] is (action != 'durable-check'))


def bundle(sources, dependencies, action):
    result = 'import base64,sys,types\n'
    for name, body in sources:
        result += ('m=types.ModuleType(' + repr(name) + ')\n'
                   'm.__file__=' + repr('/sealed/' + name + '.py') + '\n'
                   'sys.modules[' + repr(name) + ']=m\n'
                   'exec(compile(base64.b64decode(' + repr(base64.b64encode(body).decode('ascii')) +
                   '),"<sealed-module>","exec"),m.__dict__)\n')
    result += 'sys.modules["network_dependencies"].DEPENDENCIES=' + repr(dependencies) + '\n'
    module = 'stock_durable' if action.startswith('stock-') else 'edge_durable'
    result += 'sys.exit(sys.modules[' + repr(module) + '].main())\n'
    return result.encode('ascii')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute', action='store_true', required=True)
    parser.add_argument('--action', required=True, choices=('durable-publish', 'durable-check', 'durable-rollback-source',
                                                        'stock-check', 'stock-apply', 'stock-rollback'))
    parser.add_argument('--backup-id', required=True)
    parser.add_argument('--stock-backup-id')
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--dependencies', type=Path, required=True)
    parser.add_argument('--dependencies-sha256', required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if (not BACKUP.fullmatch(args.backup_id) or args.out.exists() or args.out.parent.resolve() != HERE or
            args.out.suffix != '.json' or args.dependencies.parent.resolve() != HERE or
            (args.action == 'stock-rollback') != bool(args.stock_backup_id) or
            (args.stock_backup_id and not re.fullmatch(r'vega-pb-[0-9]{8}T[0-9]{6}Z-[0-9]+', args.stock_backup_id))):
        raise SystemExit('STOP: selector unknown')
    sources = load_sources(HERE / 'seals.json', args.manifest_sha256)
    dep_body = args.dependencies.read_bytes()
    if sha(dep_body) != args.dependencies_sha256:
        raise SystemExit('STOP: dependency seal changed')
    dependencies = json.loads(dep_body)
    # Validate closed schema locally with the same sealed dependency code.
    import sys
    for name, source in sources:
        import types
        module = types.ModuleType(name)
        module.__file__ = str(HERE / (name + ".py"))
        sys.modules[name] = module
        exec(compile(source, '<sealed-local-validation>', 'exec'), module.__dict__)
    source_required = args.action != 'durable-publish'
    sys.modules['network_dependencies'].validate(dependencies, source_required=source_required)
    if source_required and dependencies['source']['backupId'] != args.backup_id:
        raise SystemExit('STOP: published source selector changed')
    mode = args.action.removeprefix('stock-').removeprefix('durable-')
    remote = ['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10',
              '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=1', 'lumbre', 'python3', '-B', '-',
              mode, args.backup_id]
    if args.stock_backup_id:
        remote.append(args.stock_backup_id)
    try:
        response = subprocess.run(remote, input=bundle(sources, dependencies, args.action),
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=1200, check=False)
        if len(response.stdout) > 4096:
            raise ValueError('oversized')
        value = json.loads(response.stdout)
        if not valid(value, response.returncode, args.action, args.backup_id, args.stock_backup_id):
            raise ValueError('schema')
    except (OSError, subprocess.TimeoutExpired, UnicodeError, ValueError):
        raise SystemExit('STOP: remote operation unknown; raw output discarded') from None
    fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    print(value['status'])
    return response.returncode


if __name__ == '__main__':
    raise SystemExit(main())
