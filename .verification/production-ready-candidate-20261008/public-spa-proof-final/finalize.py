"""Seal existing local proof evidence without running tests, requests or changing prior artifacts."""
from pathlib import Path
import json, hashlib, datetime
P=Path(__file__).resolve().parent
B=P.parent
V=B.parent
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
folders=['public-spa-identity','public-spa-clones','public-spa-isolation','public-spa-isolation-module-fix','public-spa-landing-probe','public-spa-historical-landing','public-spa-seed-probes','public-spa-version-fixture','public-spa-final-runner']
refs=[]
for name in folders:
 f=B/name
 for leaf in ['receipt.json','freeze-manifest.json','capture-result.json','exports-probe.json','result.json','terminal.json','demo-result.json','showcase-result.json']:
  if (f/leaf).is_file():refs.append(f/leaf)
 if (f/'execution').exists():refs.extend(sorted(x for x in (f/'execution').iterdir() if x.is_file() and x.suffix in ['.json','.log']))
 for bundle in ['vega-lumbre','fodaveg']:
  for leaf in ['frontend-manifest.json','readiness.json']:
   if (f/bundle/leaf).is_file():refs.append(f/bundle/leaf)
for leaf in ['execution-receipt.json','result.json','execution-manifest.json']:
 refs.append(V/'private-runtime-metadata-read-ready-20261008/public-lumbre-equivalence-20261008'/leaf)
checks=[]
for name in ['freeze-manifest.json','headers-panel-batch/freeze-manifest.json']+[x+'/freeze-manifest.json' for x in folders if (B/x/'freeze-manifest.json').is_file()]:
 f=B/name;data=json.loads(f.read_text());entries=data.get('files',data.get('entries',data))
 pairs=[(x['path'],x['sha256']) for x in entries] if isinstance(entries,list) else list(entries.items())
 mismatches=[rel for rel,digest in pairs if not (f.parent/rel).is_file() or sha(f.parent/rel)!=digest]
 assert not mismatches,(name,mismatches)
 checks.append({'manifest':name,'sha256':sha(f),'entries':len(pairs),'mismatches':0})
for path in [B/'public-spa-isolation/vega-lumbre/readiness.json',B/'public-spa-final-runner/fodaveg/readiness.json']:
 d=json.loads(path.read_text());assert d['status']=='PASSED' and d['files']==109 and all(x['match'] for x in d['results'])
for name in ['vega','fod']:
 d=json.loads((B/'public-spa-final-runner/execution'/f'{name}-resources-after.json').read_text());assert not any(d.values())
source=json.loads((B/'public-spa-final-runner/receipt.json').read_text())
receipt={
 'status':'PUBLIC_SPA_CSP_AFFECTED_SCOPE_PASSED','completedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'capture':{'session_id':60473,'exit_code':0,'requests':226,'filesPerBundle':109,'VegaBytes':1568205,'FodBytes':1568212,'stableDiscriminantsBeforeAfter':True,'fullDynamicClosureProven':False},
 'coverage':{'admin.vegacms.com':'12 unchanged cases52086 plus affected visual78097','admin.lumbre.pro':'same109 public hashes asVega verified separately71318; same publicSPA CSPscope','admin.fodaveg.net':'13 cases in one full execution37624'},
 'vega':{'reuse':{'session_id':52086,'exit_code':1,'passed':12,'failed':1,'scope':'Only visual label assertion failed; all code outside that case is unchanged'},'affected':{'session_id':78097,'exit_code':0,'passed':1,'durationSeconds':2.5},'sourceScopeHashProof':source['unchangedTwelveCasesAndSetupScope']['vega-lumbre'],'singleFullFinalVega13Execution':False},
 'fod':{'session_id':37624,'exit_code':0,'passed':13,'durationSeconds':10.3},
 'readiness':{'Vega':{'files':109,'SHA200Matches':109,'exit_code':0},'Fod':{'files':109,'SHA200Matches':109,'exit_code':0}},
 'threeRealNegativeControls':['frame-ancestors actualblock against reachable parent4177/controlwithoutXFO','connect-src removesHTTPS and blocks token before endpoint','form-action self blocksPOST after successfultokenfetch'],
 'guard':{'syntheticProbeCases':14,'probeRealNetworkRequests':0,'contextTeardownAssertions':'blocked==0 and unhandledSynthetic==0 executed; no separate numeric counter artifact','routeFetchGateBeforeNetwork':True,'routeFetchMaxRedirects':0,'ancestorPageUnroutePreservesContextGuard':True},
 'cleanup':{'VegaHandle':63077,'VegaExit':0,'FodExit':0,'ownContainers':0,'ownNetworks':0,'ownVolumes':0,'heavySlotReleased':True,'dfAvailableBeforeKiB':140400000,'dfAvailableAfterKiB':138800000,'dfDeltaAttribution':'Sharedfilesystem variation, not claimed as own recovery/usage','budgetBytes':1073741824,'retained':'Publicassets/source/logs needed for proof and reuse'},
 'priorAttempts':[{'cause':'CJS moduleinterop failed beforetests','exit_code':1,'tests':0},{'session_id':38334,'passed':2,'failed':11,'cause':'currentInicio helper not historicallanding'},{'session_id':67402,'passed':6,'failed':7,'cause':'2Titlelabel mismatches+5showcase landing mismatches'},{'session_id':52086,'passed':12,'failed':1,'cause':'historical3bloque(s) copy versusnewplural'}],
 'referenceSHA256':{str(f.relative_to(V)):sha(f) for f in refs},'sourceSealsChecked':checks,
 'limits':['Publicclones exercised locally under proposedpolicy; no production headers changed.','Memoryauth/backend and interceptedHTTPSsite/token synthetic; noPBcryptoauth/CORS/TLS QA.','Stockbe130 only localPBengine; publicclone mount explicit. Liveimage/CMD not certified.','109 captured literal dependencies; exercised actions do not prove all dynamic/unvisiteddependencies.','SharedCaddy/imports/Fodcontextpatch privatevalidation and apply/reload remain separate pendingpermission.'],
 'privateReads':False,'productionWrites':False,'buildsInstallsPulls':False}
(P/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
(P/'result.md').write_text('''El alcance CSP de las SPA públicas capturadas está acreditado localmente para tres admins. Vega suma12 casos intactos de52086 a1caso visual repetido78097; Fod37624 pasó13/13 en una ejecución. Lumbre comparte los109 hashes completos de Vega según71318. No se afirma una ejecución finalVega13 completa.

Readiness109HTTP200/SHA y CSPreal pasaron en ambos bundles. Los tres controles reales de ancestros, connectHTTPS y formPOST pasaron. Guard14probe sinred y assertionsblocked/unhandledSynthetic0 al teardown; no se conserva un contador numérico porcontexto separado.

Los rojos anteriores se conservan como discrepancias de helper/selector/texto de la versión histórica, no bugsCSP o funciones inexistentes: interopCJS, Inicio, semillaSHOWCASE/Title y pluralización. Se conservaron auth/CRUD/historial, previewGET/POST, token/bridge/selección/overlay y las13 intenciones. Los primeros fallos no alcanzaban algunas de esas acciones; el resultado finalsí.

Teardown0 de ambos proyectos, recursos propiosvacíos y slotliberado. Sininstall/build/pull/lecturasprivadas/cambiosproductivos. Se conservan assets3,14MB nominales y evidencia. Dfantes140400000/después138800000KiB: variacióncompartida sin atribución propia. No se borraron capturas/logs requeridos.

Permite avanzar compatibilidadfrontend del subloteheaders sobre esos bytes. No valida/aplica Caddy compartido/imports/Fodcontextpatch ni runtime/CORS real. Closure dinámico completo noacreditado, memoryauth/HTTPSsite sintéticos y mountclonestock explícitos. Permiso privado y publicación siguen en raíz.
''')
manifest={f.name:sha(f) for f in P.iterdir() if f.is_file() and f.name!='freeze-manifest.json'}
(P/'freeze-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'receiptSHA256':manifest['receipt.json'],'manifestSHA256':sha(P/'freeze-manifest.json'),'references':len(refs),'sourceSealsVerified':len(checks)}))
