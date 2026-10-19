"""Prepare the existing CSP13 harness against captured public bytes; starts no service."""
from pathlib import Path
import hashlib
import json
import shutil
BASE = Path(__file__).resolve().parent
VERIFICATION = BASE.parents[2] / '.verification'
SOURCE = VERIFICATION / 'vega-current-image-csp-20261008'
sha = lambda data: hashlib.sha256(data).hexdigest()
capture = json.loads((BASE / 'capture-result.json').read_text())
if capture.get('status') != 'BOUNDED_LITERAL_CLOSURES_CAPTURED_DYNAMIC_COMPLETENESS_UNPROVEN' or not capture.get('discriminantsStable'):
    raise SystemExit('Stable captured literal closures required; no capture/build fallback')
original = json.loads((SOURCE / 'current-spa-proof-runtime/identity.json').read_text())
source_compose = json.loads((SOURCE / 'current-spa-proof-runtime/compose.json').read_text())
fixture_root = Path(original['candidateRoot'])
for relative, expected in original['fixtureHashes'].items():
    if sha((fixture_root / relative).read_bytes()) != expected:
        raise SystemExit('Previously reviewed fixture byte identity changed')
prepared = {}
for name, bundle in capture['bundles'].items():
    folder = BASE / name
    build = folder / 'build'
    manifest = json.loads((folder / 'frontend-manifest.json').read_text())
    actual = {str(p.relative_to(build)): sha(p.read_bytes()) for p in sorted(build.rglob('*')) if p.is_file()}
    if actual != manifest or manifest != bundle['manifest']:
        raise SystemExit('Captured byte identity mismatch')
    runtime = folder / 'current-spa-proof-runtime'
    runtime.mkdir(exist_ok=True)
    for source, destination in [('current-spa-proof.spec.ts', folder / 'current-spa-proof.spec.ts'), ('current-spa-proof.config.mjs', folder / 'current-spa-proof.config.mjs'), ('current-spa-proof-runtime/Caddyfile', runtime / 'Caddyfile')]:
        shutil.copyfile(SOURCE / source, destination)
    identity = {k: original[k] for k in ['candidateRoot', 'policy', 'variants', 'ancestorControlOnlyHeaderRemoval', 'parentFixture', 'fixtureHashes', 'CaddyfileSHA256']}
    identity.update(buildFilesSHA256=manifest, fixtureCandidate=original.get('candidate'), fixtureBuiltTree=original.get('builtTree'),
                    candidate=None, builtTree=None, publicHost=bundle['host'],
                    captureResultSHA256=sha((BASE / 'capture-result.json').read_bytes()),
                    publicManifestSHA256=sha((folder / 'frontend-manifest.json').read_bytes()),
                    literalDependenciesCaptured=True, fullDynamicDependencyClosureProven=False,
                    scope='Exact public captured SPA mounted on verified stock PB; memory auth and synthetic HTTPS site. Not image-native frontend or real remote PB.')
    (runtime / 'identity.json').write_text(json.dumps(identity, indent=2) + '\n')
    compose = json.loads(json.dumps(source_compose))
    compose['name'] = 'vega-served-' + name + '-csp-20261008'
    compose['services']['csp-pb']['volumes'].append(str(build.resolve()) + ':/pb/pb_public:ro')
    compose['services']['csp-edge']['volumes'] = [str((runtime / 'Caddyfile').resolve()) + ':/etc/caddy/Caddyfile:ro']
    # Stock image CMD including its --origins remains inherited. No remote CMD/CORS claim.
    (runtime / 'compose.json').write_text(json.dumps(compose, indent=2) + '\n')
    prepared[name] = {'files': len(manifest), 'publicManifestSHA256': identity['publicManifestSHA256'],
                      'identitySHA256': sha((runtime / 'identity.json').read_bytes()), 'composeSHA256': sha((runtime / 'compose.json').read_bytes()),
                      'harnessSHA256': {file: sha((folder / file).read_bytes()) for file in ['current-spa-proof.spec.ts', 'current-spa-proof.config.mjs']},
                      'CaddyfileSHA256': sha((runtime / 'Caddyfile').read_bytes())}
(BASE / 'preparation.json').write_text(json.dumps({'status':'PREPARED_NOT_EXECUTED', 'prepared':prepared,
    'sourceCSPReceiptSHA256':sha((SOURCE/'receipt.json').read_bytes()), 'captureResultSHA256':sha((BASE/'capture-result.json').read_bytes()),
    'controls':['frame-ancestors vs real parent4177 and control without XFO','connect-src removes HTTPS','form-action self blocks real POST'],
    'priorPlanCorrection':'The third negative is form-action, not frame-src. Source policy and existing13 harness unchanged.',
    'processesStarted':False,'fullDynamicDependencyClosureProven':False,'rootRuntimeReviewSlotRequired':True},indent=2)+'\n')
print(json.dumps({'prepared':{k:v['files'] for k,v in prepared.items()},'processesStarted':False}))
