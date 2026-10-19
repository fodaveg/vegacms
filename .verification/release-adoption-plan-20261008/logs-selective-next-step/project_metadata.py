"""Offline projection for a future separately approved, scalar-only Docker read.

No transport, subprocess, file opening, environment, credential or log access.
Unknown drivers/options/values produce STOP without reflecting private strings.
The Docker plan below is a proposal, not an authorization or an executed probe.
"""
import re

CONTAINERS = ('vega-pb', 'lumbre-admin-pb', 'fodaveg', 'edge-caddy')
ADMINS = CONTAINERS[:3]
IMAGE_GUARDS = {
    'vega-pb': 'sha256:dd978b8d23081d2e3c69ebf6ef8ff4599a1acdd3f38dc559ae6fa379e46449b4',
    'lumbre-admin-pb': 'sha256:40df6a9bbcfd4edbc93680b0f45946d0be7c50c4e5c470167e33646fe499c1b7',
    'fodaveg': 'sha256:0e0ef56341d677366cfc00d91e2ead83da0ebcc4372f7ba627f575be682ee51f',
}
INPUT_FIELDS = {'driver', 'maxSize', 'maxFile', 'compress', 'mode', 'maxBufferSize', 'unknownOptions'}
# Step 1 returns a finite driver classification and one unknown-key Boolean.
# No option values are requested until this gate recognizes the driver/schema.
DOCKER_DRIVER_TEMPLATE = (
    '{"driver":{{json .HostConfig.LogConfig.Type}},'
    '"unknownOptions":{{$unknown := false}}{{range $k,$v := .HostConfig.LogConfig.Config}}'
    '{{if and (ne $k "max-size") (ne $k "max-file") (ne $k "compress") '
    '(ne $k "mode") (ne $k "max-buffer-size")}}{{$unknown = true}}{{end}}{{end}}'
    '{{if $unknown}}1{{else}}0{{end}}}'
)
# Step 2 may inspect this exact template ONLY for the same pinned container ID,
# after the gate above. Repeated driver/schema fields detect selection drift.
DOCKER_TEMPLATE = (
    '{"driver":{{json .HostConfig.LogConfig.Type}},'
    '"maxSize":{{json (index .HostConfig.LogConfig.Config "max-size")}},'
    '"maxFile":{{json (index .HostConfig.LogConfig.Config "max-file")}},'
    '"compress":{{json (index .HostConfig.LogConfig.Config "compress")}},'
    '"mode":{{json (index .HostConfig.LogConfig.Config "mode")}},'
    '"maxBufferSize":{{json (index .HostConfig.LogConfig.Config "max-buffer-size")}},'
    '"unknownOptions":{{$unknown := false}}{{range $k,$v := .HostConfig.LogConfig.Config}}'
    '{{if and (ne $k "max-size") (ne $k "max-file") (ne $k "compress") '
    '(ne $k "mode") (ne $k "max-buffer-size")}}{{$unknown = true}}{{end}}{{end}}'
    '{{if $unknown}}1{{else}}0{{end}}}'
)


def driver_gate(raw):
    """Unknown/external drivers or options STOP before fetching any option value."""
    denied = {'status': 'STOP_NO_OPTION_VALUES_REQUESTED', 'driver': 'UNKNOWN', 'readRotationValuesAllowed': False}
    if not isinstance(raw, dict) or set(raw) != {'driver', 'unknownOptions'}:
        return denied
    if raw['driver'] not in ('json-file', 'local', 'none', 'journald', 'syslog', 'fluentd',
                             'gelf', 'awslogs', 'splunk', 'gcplogs'):
        return denied
    item = dict(denied, driver=raw['driver'].upper().replace('-', '_'))
    if type(raw['unknownOptions']) is not int or raw['unknownOptions'] != 0 or raw['driver'] not in ('json-file', 'local', 'none'):
        return item
    return dict(item, status='FINITE_DRIVER_OPTIONS_GATE_PASSED', readRotationValuesAllowed=True)


def missing(value):
    return value is None or value == ''


def size(value):
    """Accept Docker's explicit integer byte/k/m/g values; never infer missing defaults."""
    if missing(value):
        return None
    if not isinstance(value, str):
        raise ValueError('UNKNOWN_ROTATION_VALUE')
    match = re.fullmatch(r'([1-9][0-9]{0,8})([kKmMgG]?)', value)
    if not match:
        raise ValueError('UNKNOWN_ROTATION_VALUE')
    amount = int(match[1]) * {'': 1, 'k': 1024, 'm': 1024 ** 2, 'g': 1024 ** 3}[match[2].lower()]
    if amount > 1024 ** 4:
        raise ValueError('UNKNOWN_ROTATION_VALUE')
    return amount


def count(value):
    if missing(value):
        return None
    if not isinstance(value, str) or not re.fullmatch(r'[1-9][0-9]{0,3}', value):
        raise ValueError('UNKNOWN_ROTATION_VALUE')
    return int(value)


def option(value, choices):
    if missing(value):
        return 'UNSET_NO_DEFAULT_INFERRED'
    if value not in choices:
        raise ValueError('UNKNOWN_OPTION_VALUE')
    return choices[value]


def docker_projection(raw):
    """Expose sink class, configured rotation and finite uncertainty; no raw strings."""
    stopped = {'status': 'STOP_UNKNOWN_METADATA', 'driver': 'UNKNOWN',
               'maxBytes': None, 'maxFiles': None, 'compressed': 'UNKNOWN',
               'delivery': 'UNKNOWN', 'bufferBytes': None, 'retentionDays': None,
               'readerPolicy': 'NOT_OBSERVED', 'collectorPolicy': 'NOT_OBSERVED',
               'filterPolicy': 'NOT_OBSERVED', 'effectiveTokenSafetyProved': False}
    if not isinstance(raw, dict) or set(raw) != INPUT_FIELDS:
        return stopped
    driver = raw['driver']
    if driver not in ('json-file', 'local', 'none', 'journald', 'syslog', 'fluentd',
                      'gelf', 'awslogs', 'splunk', 'gcplogs'):
        return stopped
    item = dict(stopped, driver=driver.upper().replace('-', '_'))
    if type(raw['unknownOptions']) is not int or raw['unknownOptions'] != 0:
        return dict(item, status='STOP_UNKNOWN_OPTIONS_NO_VALUES_REQUESTED')
    if driver not in ('json-file', 'local', 'none'):
        return dict(item, status='STOP_EXTERNAL_OR_JOURNAL_RETENTION_UNKNOWN')
    try:
        item.update(maxBytes=size(raw['maxSize']), maxFiles=count(raw['maxFile']),
                    compressed=option(raw['compress'], {'true': 'TRUE', 'false': 'FALSE'}),
                    delivery=option(raw['mode'], {'blocking': 'BLOCKING', 'non-blocking': 'NON_BLOCKING'}),
                    bufferBytes=size(raw['maxBufferSize']))
    except (ValueError, TypeError):
        return dict(stopped, driver=item['driver'])
    if driver == 'none':
        if any(not missing(raw[key]) for key in ('maxSize', 'maxFile', 'compress', 'mode', 'maxBufferSize')):
            return dict(stopped, driver='NONE')
        return dict(item, status='DOCKER_STREAM_DISABLED_OTHER_SINKS_UNKNOWN')
    if driver == 'json-file' and not missing(raw['compress']):
        return dict(stopped, driver='JSON_FILE')
    if item['delivery'] != 'NON_BLOCKING' and item['bufferBytes'] is not None:
        return dict(stopped, driver=item['driver'])
    configured = item['maxBytes'] is not None and item['maxFiles'] is not None
    return dict(item, status='CONFIGURED_SIZE_COUNT_ONLY_OTHER_SINKS_UNKNOWN' if configured
                else 'STOP_ROTATION_DEFAULT_OR_UNSET_UNKNOWN')


def inventory_projection(raw):
    """Require exactly three admins and shared edge; never silently omit a channel."""
    if not isinstance(raw, dict) or set(raw) != set(CONTAINERS):
        raise ValueError('STOP_INVENTORY_SCOPE')
    return {'status': 'PARTIAL_DOCKER_ONLY_NOT_LOGS_TASK_CLOSURE',
            'containers': {name: docker_projection(raw[name]) for name in CONTAINERS},
            'pocketBaseEffectiveSettings': 'NOT_OBSERVED',
            'caddyRuntimeErrorWritersFilters': 'NOT_OBSERVED',
            'namedOrCustomChannels': 'NOT_OBSERVED',
            'restartPersistence': 'NOT_OBSERVED', 'taskClosureProved': False}
