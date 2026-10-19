"""Public L13 delivery evidence: GET only, no auth, redirects, proxies or raw outputs.

Uses the public asset identity convention from image-only-delivery/served_smoke.py
and the published-home lookup from lumbre-web/infra/production/deploy-preview.sh.
Only this new evidence directory is written; production/source trees are untouched.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import ssl
import tarfile
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, build_opener, HTTPSHandler, HTTPRedirectHandler, ProxyHandler

ARCHIVE = 'lumbre-static-a598bfe-pbadmin.tar.gz'
ARCHIVE_SHA = '53dab75dddae4478fe7c02ef937ac5bea3dd9bdc6af9e258fd789aa1705c45ac'
MANIFEST_SHA = 'f551461cc7b96af6ab8da8d575eca11eba4f386d5abc4ba3a963c2c0ee1e3ac0'
CANDIDATE = 'a598bfeee0b7ee072cdf26a5196ac534a07ebc49'
HOSTS = ('admin.vegacms.com', 'admin.lumbre.pro', 'admin.fodaveg.net')
MAX_BODY = 12 * 1024 * 1024
MIMES = {'.html': {'text/html'}, '.xml': {'application/xml', 'text/xml'}, '.css': {'text/css'},
         '.js': {'application/javascript', 'text/javascript'}, '.webp': {'image/webp'},
         '.jpg': {'image/jpeg'}, '.png': {'image/png'}, '.woff2': {'font/woff2'}}
PUBLIC_MIMES = frozenset().union(*MIMES.values(), {'application/json'})


def sha(value):
    return hashlib.sha256(value).hexdigest()


class NoRedirect(HTTPRedirectHandler):
    """Reject before redirect requests, including any cross-host location."""
    def redirect_request(self, *args, **kwargs):
        return None


def fetch(host, path, read_body=True):
    """Bounded unauthenticated GET; response headers/bodies are never persisted."""
    row = {'status': None, 'mime': None, 'sha256': None, 'bytes': 0, 'error': None, 'blocksPresent': False}
    body = b''
    opener = build_opener(ProxyHandler({}), NoRedirect(), HTTPSHandler(context=ssl.create_default_context()))
    try:
        request = Request('https://' + host + path, method='GET', headers={
            'Accept-Encoding': 'identity', 'User-Agent': 'Lumbre-public-delivery-verification/1'})
        try:
            response = opener.open(request, timeout=15)
        except HTTPError as error:
            response = error
        with response:
            row['status'] = response.status
            mime = response.headers.get('Content-Type', '').split(';', 1)[0].strip().lower()
            row['mime'] = mime if mime in PUBLIC_MIMES else 'OTHER'
            if response.headers.get('Content-Encoding', 'identity').lower() not in ('', 'identity'):
                row['error'] = 'UNEXPECTED_ENCODING'
            if read_body:
                body = response.read(MAX_BODY + 1)
                if len(body) > MAX_BODY:
                    row['error'] = 'BODY_LIMIT'; body = b''
                else:
                    row.update(sha256=sha(body), bytes=len(body), blocksPresent=b'data-vega-blocks-root' in body)
    except Exception:
        row['error'] = 'TRANSPORT_ERROR'
    return row, body


def path_for(name):
    """Request HTML at its canonical directory route and assets at their exact path."""
    if name == 'index.html':
        return '/'
    if name.endswith('/index.html'):
        return '/' + quote(name[:-len('index.html')], safe='/')
    return '/' + quote(name, safe='/')


def expected_mime(name):
    if name == 'api/vega/discovery':
        return {'application/json'}
    values = MIMES.get(PurePosixPath(name).suffix)
    if values is None:
        raise ValueError('UNCLASSIFIED_LOCAL_MIME')
    return values


def archive_files(data, expected):
    """Inspect a sealed archive in memory without extracting files or following links."""
    observed, total = {}, 0
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        members = archive.getmembers()
        if len(members) > 100:
            raise ValueError('ARCHIVE_SHAPE')
        for member in members:
            if member.isdir():
                continue
            name = member.name[2:] if member.name.startswith('./') else member.name
            if not member.isfile() or name not in expected or name in observed or member.size > MAX_BODY:
                raise ValueError('ARCHIVE_SHAPE')
            value = archive.extractfile(member).read(MAX_BODY + 1)
            total += len(value)
            if total > MAX_BODY or len(value) != member.size or sha(value) != expected[name]:
                raise ValueError('ARCHIVE_IDENTITY')
            observed[name] = {'sha256': expected[name], 'bytes': len(value)}
    if set(observed) != set(expected):
        raise ValueError('ARCHIVE_CLOSURE')
    return observed


def local_snapshot(source):
    """Exact package/manifest bytes, with full 55-file closure before any GET."""
    manifest_bytes = (source / 'static-production-manifest.json').read_bytes()
    archive_bytes = (source / 'delivery' / ARCHIVE).read_bytes()
    if sha(manifest_bytes) != MANIFEST_SHA or sha(archive_bytes) != ARCHIVE_SHA:
        raise ValueError('LOCAL_GUARD')
    manifest = json.loads(manifest_bytes)
    files = manifest.get('files')
    if manifest.get('candidate') != CANDIDATE or not isinstance(files, dict) or len(files) != 55:
        raise ValueError('LOCAL_MANIFEST')
    for name, digest in files.items():
        if not isinstance(name, str) or name.startswith('/') or '..' in name.split('/') or not re.fullmatch(r'[a-f0-9]{64}', digest):
            raise ValueError('LOCAL_MANIFEST')
        expected_mime(name)
    if not {'index.html', 'en/index.html', 'de/index.html', 'sitemap.xml'} <= files.keys():
        raise ValueError('LOCALE_OR_SITEMAP_MISSING')
    return archive_files(archive_bytes, files)


def verify_static(snapshot):
    """Compare every public asset: status200, SHA256, byte count and classified MIME."""
    def check(item):
        name, expected = item
        remote, body = fetch('lumbre.pro', path_for(name))
        del body
        return {'file': name, 'path': path_for(name), 'status': remote['status'], 'mime': remote['mime'],
                'sha256': remote['sha256'], 'bytes': remote['bytes'], 'error': remote['error'],
                'bytesShaEqual': remote['sha256'] == expected['sha256'] and remote['bytes'] == expected['bytes'],
                'mimeCorrect': remote['mime'] in expected_mime(name)}
    with ThreadPoolExecutor(max_workers=6) as pool:
        rows = list(pool.map(check, sorted(snapshot.items())))
    return rows


def published_home():
    """Canonical public published-home id lookup; export only resolution status, not body/id."""
    query = urlencode({'filter': 'pathEs="/" && status="published"', 'fields': 'id', 'perPage': '2'})
    remote, body = fetch('admin.lumbre.pro', '/api/collections/pages/records?' + query)
    try:
        value = json.loads(body)
        record = value['items'][0]['id']
        if remote['status'] != 200 or remote['error'] is not None or value['totalItems'] != 1 or not re.fullmatch(r'[a-z0-9]{15}', record):
            raise ValueError('PUBLIC_HOME_UNKNOWN')
        return record
    except Exception:
        return None


def verify_preview(record):
    """Public negative only; never persist a preview body, token, record id or its hash."""
    rows = []
    paths = [('root', '/')]
    if record:
        paths.extend((locale, prefix + '/preview/pages/' + record) for locale, prefix in (('es', ''), ('en', '/en'), ('de', '/de')))
    for label, path in paths:
        remote, body = fetch('preview.lumbre.pro', path)
        del body
        rows.append({'case': label, 'status': remote['status'], 'error': remote['error'],
                     'blocksPresent': remote['blocksPresent'], 'expected404': remote['status'] == 404 and not remote['blocksPresent']})
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', required=True, type=Path)
    parser.add_argument('--check-local', action='store_true')
    parser.add_argument('--out', default='public-serving-receipt.json')
    args = parser.parse_args()
    base = Path(__file__).resolve().parent
    target = base / args.out
    if target.parent.resolve() != base or target.suffix != '.json' or target.exists():
        raise SystemExit('OUTPUT_SCOPE_OR_ALREADY_EXISTS')
    try:
        seal = json.loads((base/'seal.json').read_bytes())
        if set(seal) != {'files'} or set(seal['files']) != {'verify_served.py', 'test_verify_served.py', 'README.md'}:
            raise ValueError('SEAL_SHAPE')
        if any(sha((base/name).read_bytes()) != digest for name, digest in seal['files'].items()):
            raise ValueError('SEAL_CHANGED')
        snapshot = local_snapshot(args.source_dir)
    except Exception:
        raise SystemExit('LOCAL_GUARD_OR_SEAL_FAILED_ZERO_GETS')
    if args.check_local:
        print(json.dumps({'status': 'LOCAL_55_FILE_ARCHIVE_MATCHES_MANIFEST', 'files': len(snapshot), 'GETs': 0}))
        return 0
    rows = verify_static(snapshot)
    record = published_home()
    preview = verify_preview(record)
    health = []
    for host in HOSTS:
        remote, body = fetch(host, '/api/health', read_body=False)
        del body
        health.append({'host': host, 'status': remote['status'], 'error': remote['error']})
    matched = sum(row['status'] == 200 and row['error'] is None and row['bytesShaEqual'] and row['mimeCorrect'] for row in rows)
    good = matched == 55 and record is not None and all(row['expected404'] and row['error'] is None for row in preview) and all(row['status'] == 200 and row['error'] is None for row in health)
    result = {'observedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'status': 'PUBLIC_DELIVERY_MATCHES' if good else 'PUBLIC_DELIVERY_PARTIAL_OR_MISMATCH',
              'candidate': CANDIDATE, 'archiveSHA256': ARCHIVE_SHA, 'manifestSHA256': MANIFEST_SHA,
              'scriptSHA256': seal['files']['verify_served.py'], 'checked': len(rows), 'matched': matched,
              'files': rows, 'publicHomeResolved': record is not None, 'previewWithoutToken': preview, 'peerHealth': health,
              'requestCount': 55 + 1 + len(preview) + 3,
              'credentialsSent': False, 'cookiesSent': False, 'redirectsFollowed': False, 'SSH': False,
              'rawBodiesOrHeadersStored': False, 'privateLogsOrEnvironmentRead': False,
              'authenticatedPreviewProved': False,
              'limits': ['Public asset bytes/MIME and negative preview only; no real CMS/admin token proof.',
                         'Health200 does not certify authenticated workflows, CORS/CSP, UI or native behavior.',
                         'No production container/image identity or private process state inspected.']}
    with target.open('x') as output:
        json.dump(result, output, indent=2, sort_keys=True); output.write('\n')
    print(json.dumps({'status': result['status'], 'checked': len(rows), 'matched': matched,
                      'previewStatuses': [row['status'] for row in preview], 'peerStatuses': [row['status'] for row in health]}))
    return 0 if good else 1


if __name__ == '__main__':
    raise SystemExit(main())
