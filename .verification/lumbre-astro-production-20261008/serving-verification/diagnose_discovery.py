"""One public GET; finite MIME projection only, preserving the executed verifier seal."""
import hashlib
import json
from pathlib import Path
import verify_served as public


def main():
    base = Path(__file__).resolve().parent
    output = base/'discovery-mime-receipt.json'
    if output.exists():
        raise SystemExit('RECEIPT_ALREADY_EXISTS_ZERO_GETS')
    seal = json.loads((base/'seal.json').read_bytes())
    for name, digest in seal['files'].items():
        if hashlib.sha256((base/name).read_bytes()).hexdigest() != digest:
            raise SystemExit('VERIFIER_SEAL_CHANGED_ZERO_GETS')
    diagnostic_seal = json.loads((base/'diagnostic-seal.json').read_bytes())
    if diagnostic_seal != {'diagnose_discovery.py': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}:
        raise SystemExit('DIAGNOSTIC_SEAL_CHANGED_ZERO_GETS')
    # Add only finite public diagnostic MIME values; no raw header is ever printed/stored.
    public.PUBLIC_MIMES = public.PUBLIC_MIMES | {'text/plain', 'application/octet-stream'}
    remote, body = public.fetch('lumbre.pro', '/api/vega/discovery')
    del body
    mime_class = {'application/json': 'JSON', 'text/plain': 'TEXT_PLAIN',
                  'application/octet-stream': 'OCTET_STREAM', 'text/html': 'HTML'}.get(remote['mime'], 'OTHER')
    result = {'status': remote['status'], 'mimeClass': mime_class, 'error': remote['error'], 'GETs': 1,
              'bodySHAStillExpected': remote['sha256'] == '1877b6183ea38980bd5891bb4acf13b889c66654793fb30ced57d320ed12273d',
              'scriptSHA256': diagnostic_seal['diagnose_discovery.py'],
              'rawHeadersOrBodiesStored': False, 'credentials': False, 'SSH': False}
    with output.open('x') as stream:
        json.dump(result, stream, indent=2, sort_keys=True); stream.write('\n')
    print(json.dumps(result))
    return 0 if result['status'] == 200 and result['error'] is None else 1


if __name__ == '__main__':
    raise SystemExit(main())
