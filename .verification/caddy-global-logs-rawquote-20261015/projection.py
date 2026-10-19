"""Finite public receipt validator. It accepts no arbitrary remote text."""
import re

FIELDS = {'status', 'failureClass', 'sourceFiles', 'referencedCount', 'presentCount', 'adaptExit', 'validateExit',
          'writersRemapped', 'storageExplicit', 'nativePatchChecks', 'commandVerified', 'closureVerified',
          'globalLogMerged', 'globalLogFilterVerified', 'policyRestored', 'scratchRemoved',
          'knownGuards', 'composeGuards', 'imageId', 'diskBefore', 'diskAfter'}
FAILURES = {'CLIENT_UNAVAILABLE', 'CLI_FAILED', 'SOURCE_LIMIT_OR_TYPE', 'UNSAFE_OR_MISSING_PATH', 'GUARD_CHANGED',
            'COMMAND_UNKNOWN', 'IMAGE_SOURCE_UNVERIFIED', 'MAPPING_UNKNOWN', 'EXECUTABLE_MOUNT_SHADOW', 'VERSION_UNKNOWN',
            'REFERENCE_UNSUPPORTED', 'REFERENCE_EXCLUDED', 'ENV_LIMIT', 'REFERENCE_UNRESOLVED', 'SYNTAX_UNSUPPORTED',
            'IMPORT_UNAPPROVED', 'IMPORT_CYCLE', 'RESOURCE_REFERENCE_UNSUPPORTED', 'TARGET_NOT_REACHABLE',
            'MODULE_UNSUPPORTED', 'MODULE_RESOURCE', 'POLICY_CHANGED', 'SCRATCH_BUDGET', 'ADAPT_FAILED', 'VALIDATE_FAILED',
            'OPERATION_ERROR', 'CLEANUP_UNCONFIRMED', 'OUTSIDE_SCOPE', 'HOST_ANCHOR', 'PATCH_SHAPE', 'OUTSIDE_HOST_CHANGE',
            'PATCH_CONTEXT', 'CAPTURE_LIMIT_OR_TIMEOUT', 'RUNTIME_MAPPING_UNKNOWN',
            'LOG_FRAGMENT_CHANGED', 'LOG_BLOCK_AMBIGUOUS', 'LOG_FORMAT_AMBIGUOUS'}


def validate(value, expected_guards, compose_guards):
    """Reject every unknown field/string/hash, including hashes derived from secrets."""
    if not isinstance(value, dict) or set(value) != FIELDS:
        raise ValueError('PROJECTION_REJECTED')
    if value['status'] not in {'STOPPED', 'VALIDATED_RESOURCE_TEST_COPY_NOT_LITERAL_PRODUCTION'}:
        raise ValueError('PROJECTION_REJECTED')
    if value['failureClass'] is not None and value['failureClass'] not in FAILURES:
        raise ValueError('PROJECTION_REJECTED')
    for key in ('sourceFiles', 'referencedCount', 'presentCount', 'writersRemapped', 'storageExplicit', 'nativePatchChecks', 'diskBefore', 'diskAfter'):
        if type(value[key]) is not int or not 0 <= value[key] <= 2**63 - 1:
            raise ValueError('PROJECTION_REJECTED')
    if value['referencedCount'] > 128 or value['presentCount'] > value['referencedCount'] or value['sourceFiles'] > 100 or value['nativePatchChecks'] > 6:
        raise ValueError('PROJECTION_REJECTED')
    for key in ('adaptExit', 'validateExit'):
        if value[key] is not None and (type(value[key]) is not int or not -128 <= value[key] <= 255):
            raise ValueError('PROJECTION_REJECTED')
    for key in ('commandVerified', 'closureVerified', 'globalLogMerged', 'globalLogFilterVerified',
                'policyRestored', 'scratchRemoved'):
        if type(value[key]) is not bool:
            raise ValueError('PROJECTION_REJECTED')
    guards = value['knownGuards']
    if not isinstance(guards, dict) or any(k not in expected_guards or v != expected_guards[k] for k, v in guards.items()):
        raise ValueError('PROJECTION_REJECTED')
    if value['composeGuards'] != compose_guards:
        raise ValueError('PROJECTION_REJECTED')
    if value['imageId'] is not None and not re.fullmatch(r'sha256:[0-9a-f]{64}', value['imageId']):
        raise ValueError('PROJECTION_REJECTED')
    if value['status'].startswith('VALIDATED') and (value['failureClass'] is not None or value['adaptExit'] != 0 or value['validateExit'] != 0
            or any(not value[k] for k in ('commandVerified', 'closureVerified', 'globalLogMerged',
                                          'globalLogFilterVerified', 'policyRestored', 'scratchRemoved'))):
        raise ValueError('PROJECTION_REJECTED')
    return value
