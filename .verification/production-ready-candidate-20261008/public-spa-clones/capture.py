"""Capture only bounded, same-origin public SPA asset dependencies; no API or config reads."""
from collections import deque
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import urljoin, urlsplit
import datetime
import hashlib
import json
import re
import urllib.request
import urllib.error

BASE = Path(__file__).resolve().parent
sha = lambda data: hashlib.sha256(data).hexdigest()
MAX_BYTES = 50 * 1024 * 1024
MAX_ASSETS = 300
EXTENSIONS = {'.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf'}
LITERAL = re.compile(r'''["']([^"'\s<>`]+\.(?:js|css|svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf|otf))["']''')
CSS_URL = re.compile(r'''url\(\s*["']?([^\s)"']+)["']?\s*\)''')
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None
OPENER = urllib.request.build_opener(NoRedirect())
requests = []
class CaptureError(Exception):
    pass

def get(host, path, remaining=MAX_BYTES):
    row = {'host': host, 'path': path, 'status': None, 'sha256': None, 'bytes': None, 'errorClass': None}
    requests.append(row)
    try:
        with OPENER.open(urllib.request.Request('https://' + host + path, headers={'Accept': '*/*'}), timeout=20) as response:
            row['status'] = response.status
            if response.status != 200:
                raise CaptureError('Non200')
            data = response.read(remaining + 1)
            if len(data) > remaining:
                raise CaptureError('ByteLimitExceeded')
            row.update(sha256=sha(data), bytes=len(data))
            return data
    except urllib.error.HTTPError as err:
        row['status'] = err.code
        row['errorClass'] = 'HTTPError'
        err.close()
        raise CaptureError('HTTPError') from None
    except Exception as err:
        row['errorClass'] = type(err).__name__
        raise CaptureError(type(err).__name__) from None

def discriminants(host):
    index = get(host, '/')
    version = get(host, '/_app/version.json', 4096)
    value = json.loads(version)
    return {'indexSHA256': sha(index), 'versionSHA256': sha(version), 'version': value.get('version')}, index, version

class AssetHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ['script', 'img', 'source'] and attrs.get('src'):
            self.references.append(attrs['src'])
        if tag == 'link' and any(x in attrs.get('rel', '').split() for x in ['stylesheet', 'modulepreload', 'preload', 'icon']):
            if attrs.get('href'):
                self.references.append(attrs['href'])

result = {'startedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'bundles': {}, 'requests': requests,
          'noCredentialsCookiesQueryRedirectsRetries': True, 'privateReads': False, 'apiReads': False,
          'browserBuildInstall': False, 'scope': 'Literal public asset closure only; dynamic closure completeness not proven'}
try:
    before = {}
    inputs = {}
    for host in ['admin.vegacms.com', 'admin.lumbre.pro', 'admin.fodaveg.net']:
        before[host], index, version = discriminants(host)
        inputs[host] = (index, version)
    result['before'] = before
    if before['admin.vegacms.com'] != before['admin.lumbre.pro']:
        raise CaptureError('VegaLumbreDiscriminantsDiffer')
    for name, host in [('vega-lumbre', 'admin.vegacms.com'), ('fodaveg', 'admin.fodaveg.net')]:
        build = BASE / name / 'build'
        build.mkdir(parents=True, exist_ok=False)
        index, version = inputs[host]
        manifest = {'index.html': sha(index), '_app/version.json': sha(version)}
        (build / '_app').mkdir()
        (build / 'index.html').write_bytes(index)
        (build / '_app/version.json').write_bytes(version)
        total = len(index) + len(version)
        queue = deque()
        seen = set()
        external = set()
        rejected = set()
        def add(ref, source):
            if ref.startswith(('data:', 'blob:', '#')):
                return
            # Vite map-dependencies entries rooted at _app are relative to origin, not the current module.
            target = urljoin('https://' + host + ('/' if ref.startswith('_app/') else source), ref)
            parsed = urlsplit(target)
            if parsed.hostname != host or parsed.scheme != 'https':
                external.add(parsed.scheme + '://' + (parsed.hostname or ''))
                return
            path = parsed.path
            suffix = PurePosixPath(path).suffix
            if parsed.query or parsed.fragment or '%' in path or suffix not in EXTENSIONS or '..' in PurePosixPath(path).parts:
                rejected.add('NonLiteralOrOutsideAssetAllowlist')
                return
            if not path.startswith('/_app/') and path not in ['/favicon.svg', '/favicon.ico']:
                rejected.add('OutsideAppAssetAllowlist')
                return
            if path not in seen:
                seen.add(path)
                queue.append(path)
        html = index.decode('utf8')
        parser = AssetHTML()
        parser.feed(html)
        for ref in parser.references + LITERAL.findall(html):
            add(ref, '/')
        while queue:
            if len(manifest) >= MAX_ASSETS:
                raise CaptureError('AssetCountLimitExceeded')
            path = queue.popleft()
            data = get(host, path, MAX_BYTES - total)
            total += len(data)
            destination = build / path.lstrip('/')
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            manifest[path.lstrip('/')] = sha(data)
            if path.endswith(('.js', '.css')):
                text = data.decode('utf8')
                for ref in LITERAL.findall(text) + (CSS_URL.findall(text) if path.endswith('.css') else []):
                    add(ref, path)
        bundle = {'host': host, 'files': len(manifest), 'bytes': total, 'manifest': dict(sorted(manifest.items())),
                  'externalOriginsReferenced': sorted(external), 'rejectedReferenceClasses': sorted(rejected),
                  'literalDependencyQueueExhausted': True, 'fullDynamicDependencyClosureProven': False,
                  'limitations': ['Quoted literal asset references and CSS url() only; runtime-generated paths unresolved until local readiness/browser observation.',
                                  'No backend config, API, sourcemaps, external-origin assets or routes fetched.']}
        result['bundles'][name] = bundle
        (BASE / name / 'frontend-manifest.json').write_text(json.dumps(bundle['manifest'], indent=2) + '\n')
    after = {host: discriminants(host)[0] for host in before}
    result['after'] = after
    result['discriminantsStable'] = before == after
    if before != after:
        raise CaptureError('SnapshotChangedDuringCapture')
    result['status'] = 'BOUNDED_LITERAL_CLOSURES_CAPTURED_DYNAMIC_COMPLETENESS_UNPROVEN'
except Exception as err:
    result['status'] = 'CAPTURE_STOPPED'
    result['errorClass'] = type(err).__name__
    result['failureClass'] = str(err) if isinstance(err, CaptureError) else type(err).__name__
finally:
    result['completedAtUTC'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (BASE / 'capture-result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'status': result['status'], 'requests': len(requests), 'bundles': {k: {x: v[x] for x in ['files', 'bytes', 'rejectedReferenceClasses']} for k,v in result['bundles'].items()}, 'failureClass': result.get('failureClass')}))
if result['status'] == 'CAPTURE_STOPPED':
    raise SystemExit(1)
