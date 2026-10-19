import importlib.util
from pathlib import Path
import tempfile
import unittest

HERE=Path(__file__).resolve().parent

def load(name):
    spec=importlib.util.spec_from_file_location(name,HERE/(name+'.py'))
    module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module
p=load('remote_probe'); projection=load('projection')

class ProbeTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name).resolve()/'edge'; self.root.mkdir()
        (self.root/'conf.d').mkdir()
    def mount(self,source,type='bind'):
        return {'source':str(source),'destination':'/etc/caddy','type':type}
    def test_directory(self):
        self.assertEqual(p.classify_mounts([self.mount(self.root)],self.root,config=Path('/etc/caddy/Caddyfile')),'DIRECTORY_BIND_ALL')
    def test_file_shadow(self):
        self.assertEqual(p.classify_mounts([self.mount(self.root),self.mount(self.root/'Caddyfile')],self.root,config=Path('/etc/caddy/Caddyfile')),'FILE_BIND_OR_SHADOW')
    def test_conf_directory_shadow(self):
        self.assertEqual(p.classify_mounts([self.mount(self.root),self.mount(self.root/'conf.d')],self.root,config=Path('/etc/caddy/Caddyfile')),'FILE_BIND_OR_SHADOW')
    def test_foreign_source_runtime_shadow(self):
        foreign=self.mount(self.root.parent/'foreign')
        foreign['destination']='/etc/caddy/conf.d'
        self.assertEqual(p.classify_mounts([self.mount(self.root),foreign],self.root,config=Path('/etc/caddy/Caddyfile')),'FILE_BIND_OR_SHADOW')
    def test_unrelated_foreign_destination(self):
        foreign=self.mount(self.root.parent/'foreign')
        foreign['destination']='/data'
        self.assertEqual(p.classify_mounts([self.mount(self.root),foreign],self.root,config=Path('/etc/caddy/Caddyfile')),'DIRECTORY_BIND_ALL')
    def test_config_uses_file_bind_outside_root_directory(self):
        root_mount=self.mount(self.root); root_mount['destination']='/unused'
        file_mount=self.mount(self.root/'Caddyfile'); file_mount['destination']='/etc/caddy/Caddyfile'
        self.assertEqual(p.classify_mounts([root_mount,file_mount],self.root,config=Path('/etc/caddy/Caddyfile')),'CONFIG_OUTSIDE_ROOT_BIND')
    def test_missing_root(self):
        self.assertEqual(p.classify_mounts([],self.root,config=Path('/etc/caddy/Caddyfile')),'MISSING_ROOT_DIRECTORY_BIND')
    def test_nonbind(self):
        self.assertEqual(p.classify_mounts([self.mount(self.root,'volume')],self.root,config=Path('/etc/caddy/Caddyfile')),'OTHER')
    def test_bad_schema(self):
        self.assertEqual(p.classify_mounts([dict(self.mount(self.root),raw='private')],self.root,config=Path('/etc/caddy/Caddyfile')),'UNKNOWN')
    def test_validator_guard_before_docker(self):
        self.assertEqual(p.diagnose(b'wrong')['failureClass'],'VALIDATOR_CHANGED')
    def test_projection_rejects_private(self):
        value=p.diagnose(b'wrong'); value['path']='/private'
        with self.assertRaises(ValueError): projection.validate(value)
    def test_approval_absent(self):
        runner=load('run_once')
        with self.assertRaisesRegex(ValueError,'NOT_AUTHORIZED_ZERO_CONNECTIONS'):
            runner.authorize('00000000-0000-4000-8000-000000000000')

if __name__=='__main__': unittest.main(verbosity=2)
