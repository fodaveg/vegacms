"""Read-only local byte/policy verification, to run only after separately authorized startup."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
import urllib.error
parser = argparse.ArgumentParser()
parser.add_argument('--bundle', required=True, choices=['vega-lumbre','fodaveg'])
args = parser.parse_args()
BASE=Path(__file__).resolve().parent / args.bundle
identity=json.loads((BASE/'current-spa-proof-runtime/identity.json').read_text())
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None
opener=urllib.request.build_opener(NoRedirect())
results=[]
for path, expected in identity['buildFilesSHA256'].items():
    row={'path':path,'status':None,'sha256':None,'expectedSHA256':expected,'match':False}
    try:
        with opener.open('http://localhost:4173/'+('/' if path=='index.html' else path).lstrip('/'),timeout=10) as response:
            row['status']=response.status
            row['sha256']=hashlib.sha256(response.read()).hexdigest()
            row['match']=row['status']==200 and row['sha256']==expected
            if path=='index.html':
                row['policyMatch']=response.headers.get('Content-Security-Policy')==identity['policy']
                row['match']=row['match'] and row['policyMatch']
    except Exception as error:
        row['errorClass']=type(error).__name__
    results.append(row)
passed=all(row['match'] for row in results)
(BASE/'readiness.json').write_text(json.dumps({'status':'PASSED' if passed else 'FAILED','files':len(results),'results':results},indent=2)+'\n')
print(json.dumps({'status':'PASSED' if passed else 'FAILED','files':len(results)}))
raise SystemExit(0 if passed else 1)
