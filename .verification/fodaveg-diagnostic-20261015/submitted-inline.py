import pathlib,types,sys,hashlib,base64,json,subprocess,os
p=pathlib.Path('.verification/cors-network-adoption-20261008/fodaveg-delivery');bid='fodaveg-20261015T020337Z-50583'
paths=[(p.parent.parent/'image-only-delivery-20261008/remote_cutover.py','image_helpers','5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128'),(p/'remote_cutover_controlled.py','cors_apply','43b68aba0c937deef45ff3a9e2e33f6d3933fb06949605fdc3b0d9448d31c7b4'),(p/'diagnostic-read-v2.py','diagnostic_reader','5bd641467962efe86718599b5abc2a37aecf7f0b5699f859fdd2552153d0baa9')]
payload='import base64,types,sys,json\n'
for path,name,h in paths:
 b=path.read_bytes()
 if hashlib.sha256(b).hexdigest()!=h:raise SystemExit('SOURCE_DRIFT_ZERO_CONNECTIONS')
 payload+='m=types.ModuleType('+repr(name)+');sys.modules['+repr(name)+']=m\nexec(compile(base64.b64decode('+repr(base64.b64encode(b).decode())+'),"<sealed>","exec"),m.__dict__)\n'
payload+='m.BACKUP_ID='+repr(bid)+'\nsys.exit(m.main())\n'
b=(p/'diagnostic-run-v2.py').read_bytes()
if hashlib.sha256(b).hexdigest()!='e5e2d806c329b167f6c7aecc80fcb4f7375089f29dfbf55d66da917969c0df00':raise SystemExit('WRAPPER_DRIFT_ZERO_CONNECTIONS')
w=types.ModuleType('local_validator');w.__file__=str((p/'diagnostic-run-v2.py').resolve());exec(compile(b,'<sealed>','exec'),w.__dict__);w.BACKUP_ID=bid
r=subprocess.run(['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=1','lumbre','python3','-B','-'],input=payload.encode('ascii'),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=90)
if len(r.stdout)>2048:raise SystemExit('OUTPUT_REJECTED')
v=json.loads(r.stdout)
if not w.valid(v,r.returncode):raise SystemExit('OUTPUT_SCHEMA_REJECTED')
fd=os.open(p/'forward-cutover-diagnostic-20261015.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:json.dump(v,f,sort_keys=True,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
print(json.dumps(v,sort_keys=True));raise SystemExit(r.returncode)
