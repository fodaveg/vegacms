import hashlib
import importlib.util
from pathlib import Path
import unittest

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('runtime_backend',HERE/'runtime_backend.py')
r=importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
runner_spec=importlib.util.spec_from_file_location('run_apply_once',HERE/'run_apply_once.py')
runner=importlib.util.module_from_spec(runner_spec); runner_spec.loader.exec_module(runner)

class RuntimeTests(unittest.TestCase):
    def runtime(self,grants=None):
        source=b'x=1\n'
        package={'validatorSHA256':hashlib.sha256(source).hexdigest(),
                 'runtimeIdentity':{'caddyImageId':'sha256:'+'a'*64},
                 'rollbackBaseline':{'hosts':list(r.HOSTS),'rootStatus':200,'healthStatus':200}}
        return r.Runtime(source,package,grants or {},{},lambda mounts,config=None:'DIRECTORY_BIND_ALL')
    def test_validator_seal_before_runtime(self):
        with self.assertRaisesRegex(ValueError,'VALIDATOR_SEAL'):
            r.Runtime(b'x=1\n',{'validatorSHA256':'0'*64},{},{},None)
    def test_admin_and_sink_fail_closed_without_grants(self):
        runtime=self.runtime()
        self.assertFalse(runtime._admin_capability())
        self.assertFalse(runtime._sink_capability())
    def test_public_smoke_does_not_invent_logger_proof(self):
        runtime=self.runtime({'publicSmoke':True})
        runtime._http=lambda host,path,limit=262144:(200,{
            'Content-Security-Policy':'policy','Strict-Transport-Security':'max-age=1',
            'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict'},
            b'<script src="/_app/immutable/app.js"></script>') if path=='/' else (
            (404 if path.startswith('/_') and not path.startswith('/_app') else 200),{},b'')
        runtime._upstreams=lambda:True
        proof=runtime.smoke()
        self.assertTrue(all(proof[key] for key in ('headers','panels','assets','api','peers')))
        self.assertFalse(proof['loggerMarkerAbsent'])
        self.assertFalse(proof['loggerControlObserved'])
    def test_rollback_smoke_checks_served(self):
        runtime=self.runtime({'publicSmoke':True})
        runtime._http=lambda host,path,limit=262144:(200,{},b'')
        runtime._upstreams=lambda:True
        runtime.module['provenance']=lambda:('sha256:'+'a'*64,None,None,None)
        self.assertEqual(runtime.rollback_smoke(),{'baselineServed':True,
                                                   'peersHealthy':True,'sameCaddyId':True})
    def test_one_shot_draft_before_any_files_or_ssh(self):
        with self.assertRaisesRegex(ValueError,'DRAFT_ZERO_CONNECTIONS'):
            runner.authorize('00000000-0000-4000-8000-000000000000')
        self.assertFalse((HERE/'apply-request-started.json').exists())

if __name__=='__main__': unittest.main(verbosity=2)
