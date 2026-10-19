"""Finite outbound schema. Any unexpected string or shape rejects the receipt."""
import re

FAILURES = {
    'CLIENT_UNAVAILABLE', 'CLI_FAILED', 'SOURCE_LIMIT_OR_TYPE', 'UNSAFE_OR_MISSING_PATH',
    'GUARD_CHANGED', 'COMMAND_UNKNOWN', 'IMAGE_SOURCE_UNVERIFIED', 'MAPPING_UNKNOWN',
    'EXECUTABLE_MOUNT_SHADOW', 'VERSION_UNKNOWN', 'REFERENCE_UNSUPPORTED',
    'REFERENCE_EXCLUDED', 'ENV_LIMIT', 'REFERENCE_UNRESOLVED', 'SYNTAX_UNSUPPORTED',
    'IMPORT_UNAPPROVED', 'IMPORT_CYCLE', 'RESOURCE_REFERENCE_UNSUPPORTED',
    'TARGET_NOT_REACHABLE', 'MODULE_UNSUPPORTED', 'SCRATCH_BUDGET', 'ADAPT_FAILED',
    'OPERATION_ERROR', 'CLEANUP_UNCONFIRMED', 'OUTSIDE_SCOPE', 'CAPTURE_LIMIT_OR_TIMEOUT',
    'RUNTIME_MAPPING_UNKNOWN', 'ADAPTED_SCHEMA_UNKNOWN', 'LOG_DECLARATION_UNKNOWN',
}
CHANNELS = {'ERROR', 'ACCESS', 'REVERSEPROXY_DEBUG', 'TRACE'}
ROUTES = {'ALLOW', 'DENY', 'LEVEL_DISABLED', 'NOT_EMITTED', 'UNKNOWN'}
URI = {'ABSENT', 'KNOWN_COVERED', 'CONFLICT', 'UNKNOWN'}
REFERER = {'ABSENT', 'DELETE', 'OTHER'}
WRITERS = {'OMITTED_STDERR', 'STDERR', 'STDOUT', 'FILE', 'NET', 'DISCARD', 'OTHER'}
ENCODERS = {'OMITTED', 'FILTER', 'OTHER'}


def reject():
    raise ValueError('PROJECTION_REJECTED')


def boolean(value):
    if type(value) is not bool:
        reject()


def count(value, maximum):
    if type(value) is not int or not 0 <= value <= maximum:
        reject()


def validate(value):
    fields = {'status', 'failureClass', 'sourceGuards', 'composeGuards', 'commandVerified',
              'closureVerified', 'imageVerified', 'sourceFiles', 'referencedCount',
              'presentCount', 'adaptExit', 'scratchRemoved', 'analysis'}
    if not isinstance(value, dict) or set(value) != fields or value['status'] not in {'STOPPED', 'DIAGNOSED'}:
        reject()
    if value['failureClass'] is not None and value['failureClass'] not in FAILURES:
        reject()
    for key in ('sourceGuards', 'composeGuards', 'commandVerified', 'closureVerified',
                'imageVerified', 'scratchRemoved'):
        boolean(value[key])
    count(value['sourceFiles'], 100)
    count(value['referencedCount'], 128)
    count(value['presentCount'], value['referencedCount'])
    if value['adaptExit'] is not None and (type(value['adaptExit']) is not int or
                                         not -128 <= value['adaptExit'] <= 255):
        reject()
    if value['status'] == 'DIAGNOSED' and (value['failureClass'] is not None or value['adaptExit'] != 0 or
        value['analysis'] is None or not all(value[k] for k in ('sourceGuards', 'composeGuards',
        'commandVerified', 'closureVerified', 'imageVerified', 'scratchRemoved'))):
        reject()
    if value['analysis'] is None:
        return value
    analysis = value['analysis']
    if not isinstance(analysis, dict) or set(analysis) != {'declarations', 'defaultOrigin',
        'mappingUnambiguous', 'destinations', 'extraLoggingUnknown', 'hosts'}:
        reject()
    if analysis['defaultOrigin'] not in {'DECLARED', 'ADAPTER_GENERATED', 'RUNTIME_IMPLICIT', 'UNKNOWN'}:
        reject()
    boolean(analysis['mappingUnambiguous']); boolean(analysis['extraLoggingUnknown'])
    declarations = analysis['declarations']
    if not isinstance(declarations, dict) or len(declarations) > 32:
        reject()
    for key, total in declarations.items():
        if not isinstance(key, str) or not re.fullmatch(
            r'(OMITTED|LITERAL|ENVREF|MIXED)/(DEFAULT|OTHER|INVALID)/(BARE|QUOTED)', key):
            reject()
        count(total, 128)
    destinations = analysis['destinations']
    if not isinstance(destinations, list) or len(destinations) > 128:
        reject()
    for item in destinations:
        if not isinstance(item, dict) or set(item) != {'class', 'writer', 'encoder', 'corePresent',
                                                      'samplingPresent', 'count'}:
            reject()
        if item['class'] not in {'DEFAULT', 'NAMED'} or item['writer'] not in WRITERS or item['encoder'] not in ENCODERS:
            reject()
        boolean(item['corePresent']); boolean(item['samplingPresent']); count(item['count'], 128)
    hosts = analysis['hosts']
    if not isinstance(hosts, dict) or set(hosts) != {'vega', 'lumbre', 'fodaveg'}:
        reject()
    for host in hosts.values():
        if not isinstance(host, dict) or set(host) != {'accessEffective', 'hostMapped', 'hostSkipped',
            'logNameOverride', 'accessLoggerNamesOverride', 'trace', 'channels'}:
            reject()
        if host['accessEffective'] not in {'DISABLED', 'ENABLED', 'UNKNOWN'}:
            reject()
        for key in ('hostMapped', 'hostSkipped', 'logNameOverride', 'accessLoggerNamesOverride', 'trace'):
            boolean(host[key])
        if not isinstance(host['channels'], dict) or set(host['channels']) != CHANNELS:
            reject()
        for channel in host['channels'].values():
            if not isinstance(channel, dict) or set(channel) != {'route', 'uri', 'referer', 'wrapOrForeignFilters'}:
                reject()
            if channel['route'] not in ROUTES or channel['uri'] not in URI or channel['referer'] not in REFERER:
                reject()
            boolean(channel['wrapOrForeignFilters'])
    return value
