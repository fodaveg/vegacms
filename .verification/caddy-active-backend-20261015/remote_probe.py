"""Readonly selected runtime metadata probe; project no paths, commands or config."""
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile

VALIDATOR_SHA = 'b9a4cc3ef38919409348509d0b6af8312655a795a3ec1caf0ffe4372cf032b6e'
TARGETS = ('Caddyfile', 'conf.d/vega.caddy', 'conf.d/admin-lumbre-pro.caddy',
           'conf.d/fodaveg.caddy')

def classify_mounts(mounts, root=Path('/srv/edge'), config=None):
    if not isinstance(mounts, list) or len(mounts) > 32:
        return 'UNKNOWN'
    root_mounts = []
    for mount in mounts:
        if not isinstance(mount, dict) or set(mount) != {'source', 'destination', 'type'}:
            return 'UNKNOWN'
        source, destination = mount['source'], mount['destination']
        if (not isinstance(source, str) or not isinstance(destination, str) or
                not source.startswith('/') or not destination.startswith('/') or
                '..' in Path(source).parts or '..' in Path(destination).parts):
            return 'UNKNOWN'
        p = Path(source)
        if p == root:
            if mount['type'] != 'bind':
                return 'OTHER'
            try:
                descriptor = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
                try:
                    for part in p.parts[1:]:
                        following = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                            dir_fd=descriptor)
                        os.close(descriptor)
                        descriptor = following
                    if not stat.S_ISDIR(os.fstat(descriptor).st_mode):
                        return 'OTHER'
                finally:
                    os.close(descriptor)
            except OSError:
                return 'OTHER'
            root_mounts.append(mount)
    if not root_mounts:
        return 'MISSING_ROOT_DIRECTORY_BIND'
    if len(root_mounts) != 1:
        return 'FILE_BIND_OR_SHADOW'
    root_destination = Path(root_mounts[0]['destination'])
    if not isinstance(config, Path) or config != root_destination / 'Caddyfile':
        return 'CONFIG_OUTSIDE_ROOT_BIND'
    runtime_targets = tuple(root_destination / target for target in TARGETS)
    for mount in mounts:
        if mount is root_mounts[0]:
            continue
        destination = Path(mount['destination'])
        # A bind from ANY host source can cover the runtime config path.
        if any(destination == target or destination in target.parents or
               target in destination.parents for target in runtime_targets):
            return 'FILE_BIND_OR_SHADOW'
    return 'DIRECTORY_BIND_ALL'


def diagnose(validator):
    result = dict(status='STOPPED', failureClass='UNKNOWN', validatorMatched=False,
                  runtimeIdentityMatched=False, commandVerified=False,
                  configMapped=False, mountShape='UNKNOWN')
    if hashlib.sha256(validator).hexdigest() != VALIDATOR_SHA:
        result['failureClass'] = 'VALIDATOR_CHANGED'
        return result
    result['validatorMatched'] = True
    module = {'__name__': 'sealed_validator'}
    try:
        exec(compile(validator, '<sealed-validator>', 'exec'), module)
        with tempfile.TemporaryDirectory(prefix='caddy-metadata-', dir='/dev/shm') as temp:
            stage = Path(temp)
            client = stage / 'docker-client'; client.mkdir()
            (client / 'config.json').write_text('{}')
            module['CLIENT_ENV'] = {'PATH': os.defpath, 'HOME': str(stage), 'DOCKER_CONFIG': str(client)}
            raw = module['bounded'](['docker', 'inspect', '--format', module['INSPECT'], module['CONTAINER']], 8192)
            selected = json.loads(raw)
            result['runtimeIdentityMatched'] = selected.get('id') == module['CADDY_ID'] and selected.get('name') == '/' + module['CONTAINER']
            entry=selected.get('entrypoint') or []
            cmd=selected.get('cmd') or []
            try:
                config=module['direct_command'](entry+cmd)
            except (TypeError,module['Stop']):
                result['failureClass']='COMMAND_UNKNOWN'
                return result
            result['mountShape'] = classify_mounts(selected.get('mounts'),config=config)
            if not result['runtimeIdentityMatched']:
                result['failureClass'] = 'IDENTITY_CHANGED'
                return result
            try:
                image, config, mapping, command = module['provenance']()
            except module['Stop'] as error:
                allowed = {'COMMAND_UNKNOWN', 'MAPPING_UNKNOWN', 'IMAGE_SOURCE_UNVERIFIED',
                           'VERSION_UNKNOWN', 'GUARD_CHANGED', 'UNSAFE_OR_MISSING_PATH',
                           'EXECUTABLE_MOUNT_SHADOW', 'CLI_FAILED', 'CAPTURE_LIMIT_OR_TIMEOUT'}
                result['failureClass'] = str(error) if str(error) in allowed else 'PROVENANCE_STOP'
                return result
            result['commandVerified'] = True
            result['configMapped'] = module['logical_to_relative'](config, mapping) == Path('Caddyfile')
            result['status'] = 'DIAGNOSED'
            result['failureClass'] = 'NONE'
            return result
    except Exception:
        result['failureClass'] = 'OPERATION_ERROR'
        return result

if __name__ == '__main__':
    print(json.dumps(diagnose(VALIDATOR_SOURCE), sort_keys=True))
