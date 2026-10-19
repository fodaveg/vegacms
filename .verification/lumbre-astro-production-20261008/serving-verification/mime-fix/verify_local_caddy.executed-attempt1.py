"""Small local Caddy fixture: cached exact image, owned resources, no pulls/builds/SSH."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler
import uuid

IMAGE = 'sha256:6b08c1b9858ca9a7d99c1da13c3695081e0e604c6cf214ca26a7ce0e2c4fd9b4'
DIGEST = 'caddy@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648'
BEFORE = 'fb32709db7dfdf999a41e44cdee6669c141de2ffc067168931a051c9bbad92ba'
OWNER = 'lumbre-discovery-mime-20261008'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def sha(value):
    return hashlib.sha256(value).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True, type=Path)
    args = parser.parse_args()
    base = Path(__file__).resolve().parent
    receipt_path = base/'local-caddy-receipt.json'
    if receipt_path.exists():
        raise SystemExit('RECEIPT_EXISTS_ZERO_DOCKER')
    candidate = args.source.read_bytes()
    # Compare the source against its parent commit, with only this path read from Git.
    project = args.source.resolve().parents[2]
    before = subprocess.run(['git', '-C', str(project), 'show', 'HEAD:infra/production/Caddyfile'], capture_output=True, timeout=10, check=True).stdout
    if sha(before) != BEFORE or b'{$' in candidate or b'import ' in candidate:
        raise SystemExit('SOURCE_UNKNOWN_ZERO_DOCKER')
    inserted = ('\n\t# Astro genera discovery sin extensión; su contenido sigue siendo JSON.\n'
                '\t@vegaDiscovery path /api/vega/discovery\n'
                '\theader @vegaDiscovery Content-Type application/json\n\n').encode()
    if candidate.replace(inserted, b'', 1) != before or candidate.count(inserted) != 1:
        raise SystemExit('SOURCE_DIFF_UNKNOWN_ZERO_DOCKER')
    label = OWNER + '-' + uuid.uuid4().hex[:12]
    network, names, network_created = label + '-network', [], False
    result = {'status': 'STOPPED', 'sourceSHA256': sha(candidate), 'beforeSHA256': BEFORE, 'image': IMAGE,
              'owner': label, 'nativeExits': {}, 'cases': [], 'resourcesRemoved': False, 'SSH': False,
              'buildPullInstall': False, 'rawLogsOrHeadersStored': False,
              'diskBefore': shutil.disk_usage(base).free, 'diskAfter': None,
              'scriptSHA256': sha(Path(__file__).read_bytes())}
    if result['diskBefore'] < 100 * 1024**3:
        raise SystemExit('LOCAL_DISK_BUDGET')
    # Existing exact CLI, with private empty client config, no default registry auth config read.
    docker = shutil.which('docker')
    if not docker:
        raise SystemExit('DOCKER_UNAVAILABLE')
    scratch = Path(tempfile.mkdtemp(prefix='fixture-', dir=base))
    client = scratch/'docker-client'; client.mkdir(); (client/'config.json').write_text('{}')
    site = scratch/'site'; site.mkdir()
    (site/'api/vega').mkdir(parents=True)
    body = b'{"protocolVersion":1,"fixture":true}'
    (site/'api/vega/discovery').write_bytes(body)
    (site/'index.html').write_bytes(b'<!doctype html><title>public fixture</title>')
    (site/'asset.css').write_bytes(b'body { color: black; }')
    source = scratch/'Caddyfile'; source.write_bytes(candidate)
    def cli(arguments, label_key, check=True):
        operation = subprocess.run([docker, '--config', str(client), *arguments], capture_output=True, timeout=30)
        result['nativeExits'][label_key] = operation.returncode
        if len(operation.stdout) > 1024*1024 or len(operation.stderr) > 256*1024 or check and operation.returncode:
            raise RuntimeError('NATIVE_FAILED')
        return operation.stdout
    options = ['--pull=never', '--read-only', '--log-driver=none', '--cap-drop=ALL', '--cap-add=NET_BIND_SERVICE',
               '--security-opt=no-new-privileges', '--memory=64m', '--memory-swap=64m', '--pids-limit=64', '--cpus=1',
               '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--tmpfs', '/data:rw,noexec,nosuid,size=16m',
               '--tmpfs', '/config:rw,noexec,nosuid,size=16m', '--label', 'vega.proof.owner='+label,
               '--mount', 'type=bind,source='+str(source)+',target=/etc/caddy/Caddyfile,readonly',
               '--mount', 'type=bind,source='+str(site)+',target=/srv/site,readonly', '--entrypoint', '/usr/bin/caddy']
    try:
        identity = json.loads(cli(['image', 'inspect', '--format', '{{json .RepoDigests}}', IMAGE], 'image'))
        if DIGEST not in identity:
            raise RuntimeError('IMAGE_UNKNOWN')
        for command in ('version', 'adapt', 'validate'):
            name = label + '-' + command; names.append(name)
            argv = ['run', '--rm', '--name', name, '--network=none', *options, IMAGE, command]
            if command != 'version':
                argv.extend(['--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
            output = cli(argv, command)
            if command == 'version' and not output.startswith(b'v2.11.4 '):
                raise RuntimeError('VERSION_UNKNOWN')
            if command == 'adapt':
                json.loads(output)  # Adapt result is public fixture config; keep only exit and parse success.
        cli(['network', 'create', '--internal', '--label', 'vega.proof.owner='+label, network], 'networkCreate')
        network_created = True
        name = label + '-serve'; names.append(name)
        cli(['run', '-d', '--name', name, '--network', network, '-p', '127.0.0.1::8080', *options,
             IMAGE, 'run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], 'serveStart')
        port = cli(['port', name, '8080/tcp'], 'port').decode().strip()
        if not port.startswith('127.0.0.1:') or not port[10:].isdigit():
            raise RuntimeError('PORT_UNKNOWN')
        origin = 'http://' + port
        opener = build_opener(ProxyHandler({}), NoRedirect())
        ready = False
        for attempt in range(30):
            try:
                with opener.open(origin+'/', timeout=1) as response:
                    ready = response.status == 200
                if ready:
                    break
            except Exception:
                pass
            time.sleep(.1)
        if not ready:
            raise RuntimeError('STARTUP_FAILED')
        cases = [('discovery', '/api/vega/discovery', 200, 'application/json', body),
                 ('discoveryQuery', '/api/vega/discovery?publicFixture=1', 200, 'application/json', body),
                 ('home', '/', 200, 'text/html', (site/'index.html').read_bytes()),
                 ('asset', '/asset.css', 200, 'text/css', (site/'asset.css').read_bytes()),
                 ('subpathNegative', '/api/vega/discovery/child', 404, None, None)]
        for case, path, status, mime, expected in cases:
            try:
                response = opener.open(Request(origin+path, method='GET', headers={'Accept-Encoding':'identity'}), timeout=5)
            except HTTPError as error:
                response = error
            with response:
                actual_mime = response.headers.get('Content-Type', '').split(';',1)[0].lower()
                raw = response.read(65537)
                passed = response.status == status and (actual_mime == mime if mime else actual_mime != 'application/json') and (expected is None or raw == expected)
                result['cases'].append({'case':case,'status':response.status,'mimeClass':actual_mime if actual_mime in ('application/json','text/html','text/css','text/plain','') else 'OTHER','passed':passed})
        if not all(case['passed'] for case in result['cases']):
            raise RuntimeError('HTTP_FIXTURE_FAILED')
        if args.source.read_bytes() != candidate:
            raise RuntimeError('SOURCE_DRIFT')
        result['status'] = 'LOCAL_CADDY_ADAPT_VALIDATE_AND_HTTP_5_OF_5_PASSED'
    except Exception:
        result['status'] = 'LOCAL_CHECK_FAILED'
    finally:
        clean = True
        for name in names:
            try:
                cli(['rm','--force',name], 'cleanup-'+name.rsplit('-',1)[1], check=False)
                if cli(['ps','--all','--filter','name=^/'+name+'$','--format','{{.Names}}'], 'absence-'+name.rsplit('-',1)[1]):
                    clean = False
            except Exception:
                clean = False
        if network_created:
            try:
                cli(['network','rm',network], 'networkRemove')
                if cli(['network','ls','--filter','name=^'+network+'$','--format','{{.Name}}'], 'networkAbsent'):
                    clean = False
            except Exception:
                clean = False
        shutil.rmtree(scratch)
        result['resourcesRemoved'] = clean and not scratch.exists()
        result['diskAfter'] = shutil.disk_usage(base).free
        if not result['resourcesRemoved']:
            result['status'] = 'CLEANUP_UNCONFIRMED'
    result['observedUTC'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with receipt_path.open('x') as stream:
        json.dump(result, stream, indent=2, sort_keys=True); stream.write('\n')
    print(json.dumps({'status':result['status'],'nativeExits':result['nativeExits'],'cases':result['cases'],'resourcesRemoved':result['resourcesRemoved']}))
    return 0 if result['status'].endswith('PASSED') else 1


if __name__ == '__main__':
    raise SystemExit(main())
