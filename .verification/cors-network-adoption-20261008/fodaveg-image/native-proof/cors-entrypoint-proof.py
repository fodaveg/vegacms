"""Actual default image entrypoint; synthetic data; finite public projections only."""
import argparse, http.client, json, pathlib, shutil, subprocess, tempfile, time

p = argparse.ArgumentParser()
p.add_argument('--image', required=True)
p.add_argument('--out', type=pathlib.Path, required=True)
a = p.parse_args()
name = 'fodaveg-cors-native-20261008'
fixture = pathlib.Path(tempfile.mkdtemp(prefix=name+'-'))
report = {'image': a.image, 'cases': {}, 'responses': [], 'limits': [
    'Local Linux amd64 image via Docker Desktop; synthetic empty PB database.',
    'Public GET/preflight and unauthenticated denial only; no production authentication, browser or Caddy QA.']}
owned = False

def check(ok, label):
    if not ok: raise AssertionError(label)
    report['cases'][label] = True

def docker(*args):
    r = subprocess.run(['docker', *args], capture_output=True, timeout=45)
    if r.returncode: raise AssertionError('docker-'+args[0])
    return r.stdout

def request(method, path, origin=None, preflight=False):
    h = {}
    if origin is not None: h['Origin'] = origin
    if preflight:
        h.update({'Access-Control-Request-Method': 'POST',
                  'Access-Control-Request-Headers': 'content-type,authorization'})
    c = http.client.HTTPConnection('127.0.0.1', pb, timeout=8)
    try:
        c.request(method, path, headers=h)
        r = c.getresponse()
        body = r.read()
        headers = {k.lower(): v for k,v in r.getheaders() if k.lower().startswith('access-control-') or k.lower()=='vary'}
        return r.status, headers, body
    finally: c.close()

def ports_ready():
    global pb, node
    pb = int(docker('port', name, '8090/tcp').decode().strip().rsplit(':',1)[1])
    node = int(docker('port', name, '4321/tcp').decode().strip().rsplit(':',1)[1])
    deadline = time.monotonic()+45
    while time.monotonic()<deadline:
        try:
            if request('GET','/api/fodaveg/health')[0]==200:
                c=http.client.HTTPConnection('127.0.0.1',node,timeout=8)
                try:
                    c.request('GET','/cors-synthetic-missing-page'); r=c.getresponse(); r.read()
                    if r.status==404: return
                finally: c.close()
        except OSError: pass
        time.sleep(.25)
    raise AssertionError('bounded-PB-Node-readiness')

def processes(label):
    js = "const f=require('fs');const rows=f.readdirSync('/proc').filter(x=>/^\\d+$/.test(x)).flatMap(x=>{try{return [{pid:+x,comm:f.readFileSync('/proc/'+x+'/comm','utf8').trim(),args:f.readFileSync('/proc/'+x+'/cmdline','utf8').split('\\0').filter(Boolean)}]}catch{return []}});const pb=rows.filter(x=>x.comm==='fodaveg-pb');console.log(JSON.stringify({tini:rows.filter(x=>x.comm==='tini').length,node:rows.filter(x=>x.comm==='node'&&x.args.includes('dist/server/entry.mjs')).length,pb:pb.length,pbArgs:pb[0]?.args,tiniPid:rows.find(x=>x.comm==='tini')?.pid}))"
    v=json.loads(docker('exec',name,'node','-e',js))
    check(v['tini']==1 and v['node']==1 and v['pb']==1 and v['tiniPid']==1,label+'-one-tini-Node-PB')
    check(v['pbArgs']==['/pb/fodaveg-pb','--dir','/pb/pb_data','serve','--http=0.0.0.0:8090','--origins=https://admin.fodaveg.net'],label+'-exact-PB-argv')
    report[label+'Processes']=v

def cors_matrix(label):
    for path in ['/api/health','/api/collections/users/records','/api/vega/discovery','/api/fodaveg/health']:
        for origin in ['https://admin.fodaveg.net','https://foreign.invalid','null',None]:
            for method in ['GET','OPTIONS']:
                status,h,body=request(method,path,origin,method=='OPTIONS')
                key=label+'-'+path+'-'+str(origin)+'-'+method
                report['responses'].append({'round':label,'path':path,'origin':origin,'method':method,'status':status,'headers':h})
                if origin=='https://admin.fodaveg.net':
                    check(h.get('access-control-allow-origin')==origin,key+'-own-allowed')
                    if method=='OPTIONS':
                        check(200<=status<300,key+'-preflight-success')
                        methods={s.strip().upper() for s in h.get('access-control-allow-methods','').split(',')}
                        allowed={s.strip().lower() for s in h.get('access-control-allow-headers','').split(',')}
                        check('POST' in methods and {'content-type','authorization'}<=allowed,key+'-method-headers-allowed')
                else:
                    check(h.get('access-control-allow-origin') not in ['*','https://foreign.invalid','null'],key+'-no-permissive-ACAO')
                if method=='GET' and path in ['/api/health','/api/fodaveg/health','/api/vega/discovery']:
                    check(status==200,key+'-health-preserved')
                if method=='GET' and path=='/api/collections/users/records':
                    check(status in [200,401,403],key+'-normal-API-routed')
    status,_,_=request('POST','/api/collections/_superusers/auth-with-password')
    check(status==400,label+'-no-Origin-auth-body-validation-preserved')
    status,_,_=request('GET','/api/backups')
    report[label+'UnauthenticatedBackupsStatus']=status
    check(status in [401,403],label+'-no-Origin-backups-auth-required')

try:
    data=fixture/'data'; data.mkdir(mode=0o777); data.chmod(0o777)
    report['imageId']=docker('image','inspect',a.image,'--format','{{.Id}}').decode().strip()
    docker('run','--detach','--pull=never','--platform=linux/amd64','--name',name,
           '--label','vega.proof.owner=fodaveg-cors-20261008','--network=bridge',
           '--memory=512m','--cpus=2','--pids-limit=128','--read-only','--cap-drop=ALL',
           '--security-opt=no-new-privileges','--tmpfs','/tmp:size=16m',
           '--publish','127.0.0.1::8090','--publish','127.0.0.1::4321',
           '--mount','type=bind,src='+str(data)+',dst=/pb/pb_data',
           '--env','PB_ADMIN_EMAIL=','--env','PB_ADMIN_PASSWORD=','--env','VEGA_PREVIEW_SECRET=',a.image)
    owned=True
    check(json.loads(docker('inspect',name,'--format','{{json .Config.Entrypoint}}'))==['/usr/bin/tini','-g','--','./docker-entrypoint.sh'],'default-entrypoint-preserved')
    mounts=json.loads(docker('inspect',name,'--format','{{json .Mounts}}'))
    check([x['Destination'] for x in mounts]==['/pb/pb_data'],'data-only-mount')
    report['mounts']=[{k:x[k] for k in ['Type','Source','Destination','RW']} for x in mounts]
    for round in ['boot','reopen']:
        ports_ready(); processes(round); cors_matrix(round)
        if round=='boot':
            docker('exec',name,'node','-e',"const f=require('fs');const p=f.readdirSync('/proc').find(x=>{try{return /^\\d+$/.test(x)&&f.readFileSync('/proc/'+x+'/comm','utf8').trim()==='fodaveg-pb'}catch{return false}});if(!p)process.exit(1);process.kill(+p,'SIGTERM')")
            deadline=time.monotonic()+20
            while docker('inspect',name,'--format','{{.State.Running}}').decode().strip()=='true':
                if time.monotonic()>deadline: raise AssertionError('bounded-child-exit')
                time.sleep(.25)
            check(True,'container-exits-when-PB-child-exits')
            report['childExitCode']=int(docker('inspect',name,'--format','{{.State.ExitCode}}'))
            docker('start',name)
    docker('stop',name)
    report['passed']=True
except Exception as e:
    report['passed']=False
    report['failure']={'class':type(e).__name__,'label':str(e) if isinstance(e,AssertionError) else 'runner operation failed'}
finally:
    if owned:
        r=subprocess.run(['docker','rm','--force',name],capture_output=True,timeout=45)
        report['cleanupExit']=r.returncode
    shutil.rmtree(fixture)
    report['fixtureRemoved']=not fixture.exists()
    a.out.write_text(json.dumps(report,indent=2)+'\n')
raise SystemExit(0 if report.get('passed') and report.get('cleanupExit')==0 and report['fixtureRemoved'] else 1)
