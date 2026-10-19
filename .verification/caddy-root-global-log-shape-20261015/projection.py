"""Strict allowlist for the content-free root logger shape projection."""

FIELDS = {'status', 'diagnosis', 'firstBlock', 'globalBlocks', 'unnamedLogs',
          'explicitDefaultLogs', 'otherLogs', 'globalImport',
          'rootGuardMatched', 'validatorMatched', 'fragmentMatched', 'mergeReproduced'}
DIAGNOSES = {'UNKNOWN', 'VALIDATOR_CHANGED', 'FRAGMENT_CHANGED', 'ROOT_CHANGED',
             'MERGE_FAILURE_CHANGED', 'MERGE_NOW_SUCCEEDS', 'STRUCTURE_UNSUPPORTED',
             'GLOBAL_NOT_FIRST', 'GLOBAL_COUNT_UNEXPECTED', 'NO_ROOT_LOG',
             'UNNAMED_DEFAULT', 'EXPLICIT_DEFAULT', 'MULTIPLE_ROOT_LOGS',
             'OTHER_ROOT_LOG', 'OPERATION_ERROR', 'READ_ERROR'}


def validate(value):
    if not isinstance(value, dict) or set(value) != FIELDS:
        raise ValueError('PROJECTION_REJECTED')
    if (value['status'] != 'STOPPED' or value['diagnosis'] not in DIAGNOSES or
            value['firstBlock'] not in {'EMPTY', 'GLOBAL', 'OTHER'} or
            any(value[key] not in {'ZERO', 'ONE', 'MANY'} for key in
                ('globalBlocks', 'unnamedLogs', 'explicitDefaultLogs', 'otherLogs')) or
            any(type(value[key]) is not bool for key in
                ('globalImport', 'rootGuardMatched', 'validatorMatched',
                 'fragmentMatched', 'mergeReproduced'))):
        raise ValueError('PROJECTION_REJECTED')
    if value['diagnosis'] in {'UNNAMED_DEFAULT', 'EXPLICIT_DEFAULT', 'MULTIPLE_ROOT_LOGS',
                              'OTHER_ROOT_LOG', 'NO_ROOT_LOG', 'GLOBAL_NOT_FIRST',
                              'GLOBAL_COUNT_UNEXPECTED', 'STRUCTURE_UNSUPPORTED'} and not (
            value['rootGuardMatched'] and value['validatorMatched'] and
            value['fragmentMatched'] and value['mergeReproduced']):
        raise ValueError('PROJECTION_REJECTED')
    return value
