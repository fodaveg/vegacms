"""L15: real custom binary, synthetic data; only aggregates leave process memory."""
import argparse
import hashlib
import http.client
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time

parser = argparse.ArgumentParser()
parser.add_argument('--consumer', choices=['lumbre', 'fodaveg'], required=True)
parser.add_argument('--binary', type=pathlib.Path, required=True)
parser.add_argument('--hook', type=pathlib.Path, required=True)
parser.add_argument('--image', required=True)
parser.add_argument('--out', type=pathlib.Path, required=True)
args = parser.parse_args()
marker = 'l15-synthetic-query-marker'
email, password = 'l15@example.test', 'l15-synthetic-password-1'
hook_sha = 'c11c225c49511ba2578572689be1a49a5c9b54bd083ef3f0be791d124b6f462a'
name = 'vega-l15-packaged-' + args.consumer
report = {'consumer': args.consumer, 'binarySHA256': hashlib.sha256(args.binary.read_bytes()).hexdigest(),
          'hookSHA256': hashlib.sha256(args.hook.read_bytes()).hexdigest(), 'image': args.image,
          'cases': {}, 'cleanup': [], 'limits': ['Actual custom PB binary; synthetic auth/database.',
          'Literal Fod Dockerfile final image; synthetic backend proof, not production or complete frontend/auth QA.',
          'No Caddy logger mapping claim. Node/tini not started by this backend-only proof.']}
owned = []
fixture = pathlib.Path(tempfile.mkdtemp(prefix=name + '-'))

def require(condition, label):
    if not condition:
        raise AssertionError(label)


def record(label, condition, **metadata):
    require(condition, label)
    report['cases'][label] = {'passed': True, **metadata}


def docker(*argv, timeout=30):
    result = subprocess.run(['docker', *argv], capture_output=True, timeout=timeout)
    require(result.returncode == 0, 'Docker ' + argv[0] + ' failed')
    return result.stdout + result.stderr if argv[0] == 'logs' else result.stdout


def request(method, route, body=None, headers=None):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=12)
    payload = json.dumps(body) if body is not None else None
    try:
        connection.request(method, route, payload, {'Content-Type': 'application/json', **(headers or {})})
        response = connection.getresponse()
        return response.status, response.read()
    finally:
        connection.close()


def api(method, route, body=None):
    return request(method, route, body, {'Authorization': auth})


def parsed(response):
    return json.loads(response[1])


def logs():
    flushed = api('GET', '/api/l15/flush')
    require(flushed[0] == 200, 'real logger flush')
    result = api('GET', '/api/logs?perPage=1000')
    require(result[0] == 200, 'read real PB activity logs')
    return parsed(result)['items'], parsed(flushed)


def start(with_hook):
    global port, auth, current
    label = 'positive' if with_hook else 'negative'
    data, hooks = fixture / (label + '-data'), fixture / (label + '-hooks')
    data.mkdir(mode=0o777)
    data.chmod(0o777)
    hooks.mkdir()
    # Positive uses the hook copied into the image. Negative masks only that file.
    disabled = hooks / 'disabled-redactor.pb.js'
    disabled.write_text('')
    # Observer runs outside the production middleware and sees state after finally.
    (hooks / 'observer.pb.js').write_text("""
routerUse(new Middleware((e) => {
    try { return e.next(); } finally {
        if (e.request.url.path.startsWith('/api/backups/')) {
            $app.store().set('l15Observation', {
                queryEmpty: e.request.url.rawQuery === '',
                uriClean: e.request.requestURI.indexOf('?') === -1,
                refererEmpty: e.request.header.get('Referer') === ''
            });
        }
    }
}, -1037));
routerAdd('GET', '/api/l15/flush', (e) => {
    $app.logger().handler().writeAll(e.request.context());
    return e.json(200, $app.store().get('l15Observation'));
}, $apis.requireSuperuserAuth(), $apis.skipSuccessActivityLog());
routerAdd('GET', '/api/backups/l15-exception', () => {
    throw new InternalServerError('l15 synthetic exception');
});
""")
    common = ['--pull=never', '--platform=linux/amd64', '--read-only', '--cap-drop=ALL',
              '--security-opt=no-new-privileges', '--tmpfs', '/tmp:size=16m',
              '--mount', 'type=bind,src=' + str(data) + ',dst=/pb/pb_data',
              '--mount', 'type=bind,src=' + str(hooks / 'observer.pb.js') + ',dst=/pb/pb_hooks/l15-observer.pb.js,readonly',
              '--entrypoint', '/pb/fodaveg-pb']
    if not with_hook:
        common += ['--mount', 'type=bind,src=' + str(disabled) + ',dst=/pb/pb_hooks/' + args.hook.name + ',readonly']
    flags = ['--dir=/pb/pb_data']
    if args.consumer == 'lumbre':
        flags += ['--hooksWatch=false']
    docker('run', '--rm', *common, args.image, *flags, 'superuser', 'upsert', email, password)
    current = name + '-' + label
    docker('run', '--detach', '--name', current, '--label', 'vega.proof.owner=L15-20261008',
           '--network=bridge', '--publish', '127.0.0.1::8090', *common,
           args.image, *flags, 'serve', '--http=0.0.0.0:8090')
    owned.append(current)
    port = int(docker('port', current, '8090/tcp').decode().strip().rsplit(':', 1)[1])
    deadline = time.monotonic() + 30
    while True:
        try:
            if request('GET', '/api/health')[0] == 200:
                break
        except OSError:
            pass
        require(time.monotonic() < deadline, 'bounded custom PB readiness')
        time.sleep(.2)
    inspect = json.loads(docker('inspect', current))[0]
    mount_targets = [item['Destination'] for item in inspect['Mounts']]
    require('/pb/fodaveg-pb' not in mount_targets and '/proof/backend' not in mount_targets,
            'packaged binary never substituted')
    require('/pb/pb_hooks' not in mount_targets, 'packaged hooks directory never substituted')
    require((('/pb/pb_hooks/' + args.hook.name) not in mount_targets) == with_hook,
            'only explicit negative masks packaged redactor')
    require(inspect['Config']['Entrypoint'] == ['/pb/fodaveg-pb'], 'backend-only packaged binary entrypoint')
    require(docker('exec', current, 'id', '-u').decode().strip() == '0', 'runtime UID0 matches literal Dockerfile')
    report.setdefault('runtimeVariants', {})[label] = {
        'mountTargets': mount_targets, 'entrypoint': inspect['Config']['Entrypoint'],
        'uid': 0, 'healthStatus': 200, 'redactorFromImage': with_hook,
        'binaryFromImage': True, 'control': 'file mask disables redactor only' if not with_hook else None}
    auth = ''
    result = api('POST', '/api/collections/_superusers/auth-with-password',
                 {'identity': email, 'password': password})
    require(result[0] == 200, 'synthetic superuser auth')
    auth = parsed(result)['token']
    require(api('PATCH', '/api/settings', {'logs': {'maxDays': 1, 'minLevel': 0}})[0] == 200,
            'enable real activity logger')
    return data


try:
    require(report['hookSHA256'] == hook_sha, 'exact frozen production hook')
    start(False)
    response = request('GET', '/api/backups/synthetic.zip?token=' + marker)
    record('negative-auth403', response[0] == 403)
    entries, observation = logs()
    record('negative-discriminant-marker-retained', marker in json.dumps(entries))
    record('negative-observer-query-retained', observation['queryEmpty'] is False)
    docker('rm', '--force', current)
    owned.remove(current)

    data = start(True)
    require(api('POST', '/api/backups', {'name': 'synthetic.zip'})[0] == 204, 'native backup request')
    deadline = time.monotonic() + 30
    while True:
        result = api('GET', '/api/backups')
        require(result[0] == 200, 'native backup list')
        if any(value['key'] == 'synthetic.zip' for value in parsed(result)):
            break
        require(time.monotonic() < deadline, 'bounded native ZIP readiness')
        time.sleep(.2)
    original = (data / 'backups/synthetic.zip').read_bytes()
    token = api('POST', '/api/files/token')
    require(token[0] == 200, 'real file token')
    file_token = parsed(token)['token']
    download = '/api/backups/synthetic.zip'
    referer = 'https://fixture.invalid/copias?token=' + marker
    result = request('GET', download + '?token=' + file_token + '&token=' + marker + '&%74oken=' + marker,
                     headers={'Referer': referer})
    record('positive-native-authZIP200-identical', result[0] == 200 and result[1] == original,
           bytes=len(original), sha256=hashlib.sha256(original).hexdigest())
    for number, query in enumerate(['token=' + marker, '%74oken=' + marker + '&token=other',
                                    'token=' + marker + '&bad=%zz']):
        record('positive-auth403-' + str(number), request('GET', download + '?' + query,
               headers={'Referer': referer})[0] == 403)
    record('positive-exception500', request('GET', '/api/backups/l15-exception?token=' + marker,
           headers={'Referer': referer})[0] == 500)
    for number, query in enumerate(['token=', '%74oken=', '%zz=']):
        record('positive-sensitiveReferer-' + str(number), request('GET', '/api/health',
               headers={'Referer': 'https://fixture.invalid/copias?' + query + marker})[0] == 200)
    ordinary = 'https://fixture.invalid/copias?view=recent'
    require(request('GET', '/api/health', headers={'Referer': ordinary})[0] == 200, 'ordinary Referer request')
    require(api('PATCH', '/api/settings', {'rateLimits': {'enabled': True,
            'rules': [{'label': '/api/backups/', 'maxRequests': 1, 'duration': 60}]}})[0] == 200,
            'real rate limit configuration')
    for expected in [403, 429]:
        record('positive-rate-' + str(expected), request('GET', download + '?token=' + marker,
               headers={'Referer': referer})[0] == expected)
    entries, observation = logs()
    backup_entries = [item for item in entries if item.get('data', {}).get('url', '').startswith('/api/backups/')]
    record('positive-real-flush-complete', len(backup_entries) == 7,
           records=len(backup_entries), statuses=sorted({item['data']['status'] for item in backup_entries}))
    serialized = json.dumps(entries)
    record('positive-no-token-query-referer', all(secret not in serialized for secret in [marker, file_token, auth])
           and all('?' not in item['data']['url'] and not item['data'].get('referer') for item in backup_entries))
    record('positive-ordinaryReferer-preserved', any(item.get('data', {}).get('referer') == ordinary for item in entries))
    record('positive-observer-after-finally', observation == {'queryEmpty': True, 'uriClean': True, 'refererEmpty': True})
    docker('stop', current)
    output = docker('logs', current)
    record('positive-stdout-no-token', all(secret.encode() not in output for secret in [marker, auth, file_token]),
           bytes=len(output))
    report['passed'] = True
except Exception as error:
    report['passed'] = False
    # Deliberately no exception body: requests can carry synthetic auth/token values.
    report['failure'] = {'class': type(error).__name__,
                         'label': str(error) if isinstance(error, AssertionError) else 'runner operation failed'}
    print(json.dumps(report['failure']))
    sys.exit(1)
finally:
    for container in reversed(owned):
        result = subprocess.run(['docker', 'rm', '--force', container], capture_output=True)
        report['cleanup'].append({'container': container, 'exit': result.returncode})
    shutil.rmtree(fixture)
    report['fixtureRemoved'] = not fixture.exists()
    args.out.write_text(json.dumps(report, indent=2) + '\n')
