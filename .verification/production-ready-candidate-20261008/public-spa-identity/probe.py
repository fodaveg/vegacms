"""Compare six unauthenticated public responses with existing sealed byte identities."""
from pathlib import Path
import datetime
import hashlib
import json
import urllib.request
import urllib.error

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]
V = ROOT / '.verification'
sha = lambda data: hashlib.sha256(data).hexdigest()
references = {
    'historical-csp13-mounted-build': V / 'production-rollout-proposal-20261007/current-spa-proof-final-receipt.json',
    'current-be130-image': V / 'local-consumer-runtime-20261008/vega-current-packaged-image/frontend-manifest.json',
    'historical-f59-image-receipt': V / 'production-security-real-20261007/receipt.json',
}
old = json.loads(references['historical-csp13-mounted-build'].read_text())
current = json.loads(references['current-be130-image'].read_text())
security = json.loads(references['historical-f59-image-receipt'].read_text())
old_index = next(x.split()[0] for x in security['images']['pocketbase']['packagedHashes'] if x.endswith('/pb/pb_public/index.html'))
expected = {
    'historical-csp13-mounted-build': {k: old['buildFilesSHA256'][k] for k in ['index.html', '_app/version.json']},
    'current-be130-image': {k: current[k] for k in ['index.html', '_app/version.json']},
    'historical-f59-image-index-only': {'index.html': old_index},
}
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None
opener = urllib.request.build_opener(NoRedirect())
results = []
for host in ['admin.vegacms.com', 'admin.lumbre.pro', 'admin.fodaveg.net']:
    responses = {}
    for path, key in [('/', 'index.html'), ('/_app/version.json', '_app/version.json')]:
        item = {'path': path, 'status': None, 'sha256': None, 'bytes': None, 'errorClass': None}
        req = urllib.request.Request('https://' + host + path, headers={'Accept': 'text/html' if key == 'index.html' else 'application/json'})
        try:
            with opener.open(req, timeout=20) as response:
                item['status'] = response.status
                if response.status == 200:
                    data = response.read(2 * 1024 * 1024 + 1)
                    if len(data) > 2 * 1024 * 1024:
                        item['errorClass'] = 'BodyLimitExceeded'
                    else:
                        item.update(sha256=sha(data), bytes=len(data))
                        if key == '_app/version.json':
                            value = json.loads(data)
                            item['version'] = value.get('version') if isinstance(value, dict) else None
        except urllib.error.HTTPError as err:
            item['status'] = err.code
            item['errorClass'] = 'HTTPError'
            err.close()
        except Exception as err:
            item['errorClass'] = type(err).__name__
        responses[key] = item
    results.append({'host': host, 'responses': responses, 'matches': {
        name: all(responses[key]['status'] == 200 and responses[key]['sha256'] == digest for key, digest in hashes.items())
        for name, hashes in expected.items()
    }})
output = {
    'completedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'referenceSHA256': {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in references.values()},
    'expected': expected, 'results': results, 'requestCount': 6,
    'redirectsFollowed': False, 'retries': 0, 'cookies': False, 'credentials': False,
    'queryStrings': False, 'browser': False, 'rawResponseBodiesRetained': False,
    'all151AssetsDownloaded': False,
    'limits': ['Index plus version discriminants cannot prove all151 asset identity.',
               'Historical CSP13 mounted the candidate9165 build on f59; image name alone does not transfer this proof.'],
}
(BASE / 'discriminants.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps({'requests': 6, 'results': results, 'all151AssetsDownloaded': False}))
