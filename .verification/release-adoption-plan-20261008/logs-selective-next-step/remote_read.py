"""Docker-only selective metadata, executed later by root after a new grant.

PINS/OPERATION and the reviewed projector/capture code are injected once from
approved snapshot buffers. No file/env/credential/log/HealthOutput/Caddy API
read, writes or container exec. All private scalars/errors stay in server RAM.
"""
import json
import re
import sys

IDENTITY_TEMPLATE = '{"id":{{json .Id}},"imageId":{{json .Image}}}'
DRIVER_TEMPLATE = '{{json .HostConfig.LogConfig.Type}}'
RESULT_UNKNOWNS = ['PB_EFFECTIVE_SETTINGS_UNRESOLVED', 'CADDY_DEFAULT_RUNTIME_FILTER_UNRESOLVED',
                   'NAMED_CUSTOM_CHANNELS_UNRESOLVED']
MAX_COMMANDS = 20


class Reader:
    """Twenty bounded selected-field Docker calls at most, no retry or fallback."""
    def __init__(self, pins):
        if set(pins) != {'sourceProjectionSHA256', 'containers'} or set(pins['containers']) != set(CONTAINERS):
            raise ValueError('PIN_SCOPE_UNKNOWN')
        if not re.fullmatch('[0-9a-f]{64}', pins['sourceProjectionSHA256']):
            raise ValueError('PIN_UNKNOWN')
        for name, item in pins['containers'].items():
            if set(item) != {'id', 'imageId'} or not re.fullmatch('[0-9a-f]{64}', item['id']) or not re.fullmatch('sha256:[0-9a-f]{64}', item['imageId']):
                raise ValueError('PIN_UNKNOWN')
            if name in IMAGE_GUARDS and item['imageId'] != IMAGE_GUARDS[name]:
                raise ValueError('IMAGE_GUARD_DRIFT')
        if pins['containers']['edge-caddy']['imageId'] != 'sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648':
            raise ValueError('EDGE_IMAGE_GUARD_DRIFT')
        self.pins = pins['containers']
        self.calls = 0

    def inspect(self, target, template):
        if self.calls >= MAX_COMMANDS:
            raise ValueError('COMMAND_COUNT_UNKNOWN')
        self.calls += 1
        result = capture_process(['docker', 'container', 'inspect', '--format', template, target], timeout=12, limit=8192)
        if result.returncode:
            raise ValueError('SELECTED_READ_FAILED')
        return json.loads(result.stdout)

    def identities(self):
        """Resolve the four literal names and require exact observed ID+image pairs."""
        for name in CONTAINERS:
            observed = self.inspect(name, IDENTITY_TEMPLATE)
            if observed != self.pins[name]:
                raise ValueError('IDENTITY_DRIFT')

    def container(self, name):
        """Ask driver first; any unknown branch stops before requesting option values."""
        selected_id = self.pins[name]['id']
        driver = self.inspect(selected_id, DRIVER_TEMPLATE)
        empty = {'driver': driver, 'maxSize': None, 'maxFile': None, 'compress': None,
                 'mode': None, 'maxBufferSize': None, 'unknownOptions': 0}
        gate = driver_gate({'driver': driver, 'unknownOptions': 0})
        if not gate['readRotationValuesAllowed']:
            return docker_projection(empty)
        schema = self.inspect(selected_id, DOCKER_DRIVER_TEMPLATE)
        if not isinstance(schema, dict) or set(schema) != {'driver', 'unknownOptions'} or schema['driver'] != driver:
            raise ValueError('LOGGER_SCHEMA_DRIFT')
        gate = driver_gate(schema)
        if not gate['readRotationValuesAllowed']:
            return docker_projection(dict(empty, unknownOptions=schema['unknownOptions']))
        raw = self.inspect(selected_id, DOCKER_TEMPLATE)
        if not isinstance(raw, dict) or set(raw) != INPUT_FIELDS or raw['driver'] != driver or type(raw['unknownOptions']) is not int or raw['unknownOptions'] != 0:
            raise ValueError('LOGGER_OPTIONS_DRIFT')
        return docker_projection(raw)

    def read(self, operation):
        result = {'operationId': operation, 'status': 'STOP_UNKNOWN_OR_IDENTITY_DRIFT',
                  'identitiesPreserved': False, 'identityRecheckPassed': False,
                  'containers': {}, 'commands': 0, 'unresolved': RESULT_UNKNOWNS,
                  'taskClosureProved': False, 'globalTokenAbsenceClaimed': False,
                  'remoteWrites': False, 'logsRead': False, 'configEnvRead': False}
        try:
            self.identities()
            observations = {name: self.container(name) for name in CONTAINERS}
            self.identities()
            result.update(status='DOCKER_ONLY_PARTIAL_IDENTITIES_PRESERVED',
                          identitiesPreserved=True, identityRecheckPassed=True,
                          containers=observations)
        except Exception:
            # Drift invalidates partial observations; never emit raw scalar/error data.
            pass
        result['commands'] = self.calls
        return result


def main():
    try:
        result = Reader(PINS).read(OPERATION)
    except Exception:
        result = {'operationId': OPERATION, 'status': 'STOP_UNKNOWN_OR_IDENTITY_DRIFT',
                  'identitiesPreserved': False, 'identityRecheckPassed': False,
                  'containers': {}, 'commands': 0, 'unresolved': RESULT_UNKNOWNS,
                  'taskClosureProved': False, 'globalTokenAbsenceClaimed': False,
                  'remoteWrites': False, 'logsRead': False, 'configEnvRead': False}
    print(json.dumps(result, sort_keys=True))
    return 0 if result['identitiesPreserved'] and all(not item['status'].startswith('STOP_') for item in result['containers'].values()) else 1


if __name__ == '__main__':
    sys.exit(main())
