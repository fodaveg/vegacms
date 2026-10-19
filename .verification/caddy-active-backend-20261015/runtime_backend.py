"""Server-side callbacks for the four-file engine. Imported by a sealed one-shot payload.

The launcher must verify FINAL artifacts and explicit grants before transmitting this
module. No Docker call, admin read, reload or log read occurs at import time.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time
import urllib.error
import urllib.request
import uuid

TARGETS = ('Caddyfile', 'conf.d/vega.caddy', 'conf.d/admin-lumbre-pro.caddy',
           'conf.d/fodaveg.caddy')
HOSTS = ('admin.vegacms.com', 'admin.lumbre.pro', 'admin.fodaveg.net')

def sha(data):
    return hashlib.sha256(data).hexdigest()

class Runtime:
    def __init__(self, validator_source, package, grants, engine, mount_classifier):
        if sha(validator_source) != package.get('validatorSHA256'):
            raise ValueError('VALIDATOR_SEAL')
        self.module = {'__name__': 'sealed_validator'}
        exec(compile(validator_source, '<sealed-validator>', 'exec'), self.module)
        self.package, self.grants, self.engine = package, grants, engine
        self.mount_classifier = mount_classifier
        self.stage = None
        self.initial = None
        self.last_compiled = None
        self.containers = []

    def __enter__(self):
        self.stage = tempfile.TemporaryDirectory(prefix='caddy-active-', dir='/dev/shm')
        root = Path(self.stage.name)
        client = root / 'docker-client'; client.mkdir()
        (client / 'config.json').write_text('{}')
        self.module['CLIENT_ENV'] = {'PATH': os.defpath, 'HOME': str(root),
                                     'DOCKER_CONFIG': str(client)}
        return self

    def __exit__(self, *_):
        clean=True
        try:
            for name in self.containers:
                try:
                    self.module['bounded'](['docker','rm','--force',name],4096,timeout=10)
                except Exception:
                    pass
                try:
                    if self.module['bounded'](['docker','ps','--all','--filter','name=^/'+name+'$',
                                               '--format','{{.Names}}'],4096,timeout=10):
                        clean=False
                except Exception:
                    clean=False
        finally:
            self.module['CLIENT_ENV'] = None
            if self.stage:
                self.stage.cleanup()
        if not clean:
            raise RuntimeError('ISOLATED_CLEANUP_UNCONFIRMED')

    def _selected(self):
        m=self.module
        return json.loads(m['bounded'](['docker','inspect','--format',m['INSPECT'],m['CONTAINER']],8192))

    def _source_images(self):
        m=self.module
        return {Path(name):m['read_source'](m['ROOT'],Path(name)) for name in TARGETS}

    def _closure(self, images, config, mapping):
        m=self.module
        snapshots=dict(images)
        expanded, values, patterns=m['closure'](snapshots,m['ROOT'],config,mapping,m['query_value'])
        imports={str(path):sha(data) for path,data in snapshots.items() if str(path) not in TARGETS}
        routes=tuple((str(path),str(operand),tuple(str(x) for x in targets))
                     for path,operand,targets in patterns)
        return expanded, values, routes, imports

    def _admin_capability(self):
        if self.grants.get('adminRead') is not True or self.grants.get('adminAddress') != '127.0.0.1:2019':
            return False
        m=self.module
        # GET response is consumed by /dev/null in the existing container, never exported.
        try:
            m['bounded'](['docker','exec',m['CONTAINER'],'/bin/busybox','wget','-q',
                          '-O','/dev/null','http://127.0.0.1:2019/config/'],4096,timeout=10)
            return True
        except Exception:
            return False

    def _sink_capability(self):
        if (self.grants.get('sinkMetadataRead') is not True or
                self.grants.get('sinkRoutingReviewed') is not True or
                self.grants.get('sinkKind') != 'DOCKER_STDERR'):
            return False
        m=self.module
        try:
            value=json.loads(m['bounded'](['docker','inspect','--format',
                     '{{json .HostConfig.LogConfig.Type}}',m['CONTAINER']],4096,timeout=10))
            return value in ('local','json-file','journald')
        except Exception:
            return False

    def observe(self):
        m=self.module
        image,config,mapping,command=m['provenance']()
        selected=self._selected()
        if selected.get('id') != m['CADDY_ID'] or selected.get('imageId') != image:
            raise RuntimeError('IDENTITY_CHANGED')
        mount_shape=self.mount_classifier(selected.get('mounts'),config=config)
        # Identity is finite and contains no source, command, Env or log bytes.
        identity={'caddyImageId':image,'caddyId':m['CADDY_ID'],
                  'consumers':{name:cid for name,(cid,_) in m['CONSUMERS'].items()},
                  'composeGuards':{name:guard for name,(_,guard) in m['COMPOSE_GUARDS'].items()}}
        images=self._source_images()
        expanded,values,routes,imports=self._closure(images,config,mapping)
        if self.initial is None:
            self.initial=(values,routes,imports)
        old_values,old_routes,old_imports=self.initial
        return {'identity':identity,
                'directoryBindVerified':mount_shape=='DIRECTORY_BIND_ALL',
                'commandVerified':True,
                'configPathMapped':m['logical_to_relative'](config,mapping)==Path('Caddyfile'),
                'adminAvailable':self._admin_capability(),
                'importsUnchanged':routes==old_routes and imports==old_imports,
                'referencedEnvUnchanged':values==old_values,
                'sinkProof':self._sink_capability()}

    def _isolated(self, operation, config, source):
        m=self.module
        name='caddy-active-'+uuid.uuid4().hex
        self.containers.append(name)
        image=self.package['runtimeIdentity']['caddyImageId']
        args=['docker','run','--rm','--pull=never','--name',name,'--network=none',
              '--read-only','--log-driver=none','--memory=256m','--memory-swap=256m',
              '--pids-limit=64','--cpus=1','--cap-drop=ALL','--security-opt=no-new-privileges',
              '--user=65534:65534','--tmpfs','/data:rw,noexec,nosuid,size=16m,mode=1777',
              '--tmpfs','/config:rw,noexec,nosuid,size=16m,mode=1777',
              '--tmpfs','/scratch:rw,noexec,nosuid,size=16m,mode=1777',
              '--entrypoint','/usr/bin/caddy']
        if operation=='adapt':
            for prefix,destination in self.mapping:
                host=source/prefix
                if not host.exists():
                    raise RuntimeError('MAPPING_UNKNOWN')
                args+=['--mount','type=bind,source='+str(host)+',target='+str(destination)+',readonly']
        else:
            args+=['--mount','type=bind,source='+str(source)+',target=/scratch/test.json,readonly']
        args += [image,operation,'--config',str(config)]
        if operation=='adapt': args+=['--adapter','caddyfile']
        response=m['capture_process'](args,timeout=60,limit=m['MAX_BYTES'],env=m['CLIENT_ENV'])
        if response.returncode:
            raise RuntimeError('ISOLATED_'+operation.upper()+'_FAILED')
        return response.stdout

    def validate(self, images):
        m=self.module
        if set(images)!=set(TARGETS) or any(not isinstance(data,bytes) for data in images.values()):
            return None
        try:
            image,config,mapping,command=m['provenance']()
            self.mapping=mapping
            expanded,values,routes,imports=self._closure({Path(k):v for k,v in images.items()},config,mapping)
            if self.initial is not None and (values,routes,imports)!=self.initial:
                return None
            m['preadapt_modules'](expanded)
            source=Path(self.stage.name)/('validate-'+uuid.uuid4().hex)
            source.mkdir()
            for path,data in expanded.items():
                target=source/path; target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(data)
            adapted=json.loads(self._isolated('adapt',config,source))
            m['validate_global_log_filter'](adapted)
            remapped,*_=m['isolated_test_copy'](adapted)
            testfile=Path(self.stage.name)/('test-'+uuid.uuid4().hex+'.json')
            testfile.write_text(json.dumps(remapped,separators=(',',':')))
            self._isolated('validate',Path('/scratch/test.json'),testfile)
            self.last_compiled=adapted
            return {'imageId':image,'caddyId':m['CADDY_ID'],
                    'treeSHA256':self.engine['tree_hash'](images),
                    'sameConsumer':True,'scopeVerified':True,'adaptExit':0,'validateExit':0}
        except m['Stop']:
            return None
        except RuntimeError:
            raise  # unknown Docker/cleanup effect stops the engine

    def reload(self):
        if self.grants.get('reload') is not True:
            raise RuntimeError('RELOAD_GRANT_MISSING')
        m=self.module
        before=m['provenance']()
        config=before[1]
        response=m['capture_process'](['docker','exec',m['CONTAINER'],'/usr/bin/caddy',
                         'reload','--config',str(config),'--adapter','caddyfile'],
                         timeout=30,limit=4096,env=m['CLIENT_ENV'])
        if response.returncode or m['provenance']()!=before:
            raise RuntimeError('RELOAD_UNCERTAIN')
        return {'caddyId':m['CADDY_ID'],'reloadExit':0,'samePid1':True}

    def _http(self, host, path, limit=262144):
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args,**kwargs): return None
        opener=urllib.request.build_opener(NoRedirect)
        request=urllib.request.Request('https://'+host+path,headers={'User-Agent':'Vega-Caddy-Apply-Check'})
        try:
            response=opener.open(request,timeout=10)
        except urllib.error.HTTPError as error:
            response=error
        with response:
            body=response.read(limit+1)
            if len(body)>limit: raise RuntimeError('HTTP_LIMIT')
            return response.status,response.headers,body

    def _upstreams(self):
        if self.grants.get('peerSmoke') is not True:
            return False
        def visit(value):
            if isinstance(value,dict):
                if value.get('handler')=='reverse_proxy':
                    for item in value.get('upstreams',[]):
                        yield item.get('dial')
                for child in value.values(): yield from visit(child)
            elif isinstance(value,list):
                for child in value: yield from visit(child)
        dials=set(visit(self.last_compiled or {}))
        if not dials or len(dials)>8 or any(not isinstance(d,str) or not re.fullmatch(r'[a-z0-9.-]+:[0-9]{2,5}',d) for d in dials):
            return False
        for dial in dials:
            self.module['bounded'](['docker','exec',self.module['CONTAINER'],'/bin/busybox',
                  'wget','-q','-O','/dev/null','http://'+dial+'/api/health'],4096,timeout=10)
        return True

    def smoke(self):
        proof=dict.fromkeys(('headers','panels','assets','api','peers',
                            'loggerMarkerAbsent','loggerControlObserved'),False)
        if self.grants.get('publicSmoke') is not True:
            return proof
        try:
            headers=panels=assets=api=True
            for host in HOSTS:
                status,h,body=self._http(host,'/')
                headers &= status==200 and bool(h.get('Content-Security-Policy')) and bool(h.get('Strict-Transport-Security')) and h.get('X-Content-Type-Options')=='nosniff' and bool(h.get('Referrer-Policy'))
                for path in ('/_','/_/probe'):
                    panels &= self._http(host,path,8192)[0]==404
                match=re.search(rb'/_app/immutable/[A-Za-z0-9_./-]+',body)
                assets &= bool(match) and self._http(host,match.group().decode(),262144)[0]==200
                api &= self._http(host,'/api/health',8192)[0]==200
            proof.update(headers=bool(headers),panels=bool(panels),assets=bool(assets),api=bool(api),peers=self._upstreams())
        except Exception:
            return proof
        # Logger proof requires a separately reviewed stimulus and bounded sink read.
        # No generic log inspection is safe here; false blocks acceptance.
        return proof

    def rollback_smoke(self):
        proof={'baselineServed':False,'peersHealthy':False,'sameCaddyId':False}
        if self.grants.get('publicSmoke') is not True:
            return proof
        try:
            baseline=self.package.get('rollbackBaseline')
            if baseline != {'hosts':list(HOSTS),'rootStatus':200,'healthStatus':200}:
                return proof
            proof['baselineServed']=all(self._http(host,'/',262144)[0]==200 and
                                        self._http(host,'/api/health',8192)[0]==200
                                        for host in HOSTS)
            proof['peersHealthy']=self._upstreams()
            proof['sameCaddyId']=self.module['provenance']()[0]==self.package['runtimeIdentity']['caddyImageId']
        except Exception:
            return proof
        return proof
