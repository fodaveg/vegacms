"""Closed, content-free marker projection."""

FIELDS = {'status', 'failureClass', 'stage', 'kind', 'form', 'position', 'context',
          'rootGuardMatched', 'validatorMatched', 'fragmentMatched'}
FAILURES = {'UNKNOWN', 'VALIDATOR_CHANGED', 'FRAGMENT_CHANGED', 'GUARD_CHANGED',
            'OTHER_MERGE_STOP', 'BASELINE_CHANGED', 'SYNTAX_UNSUPPORTED',
            'OPERATION_ERROR', 'NONE'}
STAGES = {'UNKNOWN', 'GUARD', 'READ', 'MERGE', 'BLANKET', 'TOKEN'}
KINDS = {'NONE', 'BACKTICK', 'BOM', 'BOTH'}
FORMS = {'UNKNOWN', 'MULTIPLE_MARKERS', 'DOUBLE_QUOTED_INTERIOR',
         'RAW_QUOTE_EOF', 'RAW_QUOTE_SINGLE_LINE', 'RAW_QUOTE_MULTILINE',
         'BARE_INTERIOR_ESCAPED', 'BARE_INTERIOR', 'FILE_PREFIX',
         'BARE_TOKEN_START', 'BARE_TOKEN_INTERIOR', 'NO_ACTIVE_MARKER',
         'COMMENT_INACTIVE', 'OTHER_TOKEN_REJECTION'}
POSITIONS = {'UNKNOWN', 'MIXED', 'DOUBLE_QUOTED', 'TOKEN_INITIAL',
             'TOKEN_INTERIOR', 'FILE_PREFIX', 'COMMENT'}
CONTEXTS = {'UNKNOWN', 'WHOLE_SOURCE', 'ROOT_TOP', 'GLOBAL_OTHER',
            'GLOBAL_LOG_DEFAULT', 'ROOT_NESTED'}


def validate(value):
    if not isinstance(value, dict) or set(value) != FIELDS:
        raise ValueError('PROJECTION_REJECTED')
    if (value['status'] not in {'STOPPED', 'NOT_REPRODUCED'} or
            value['failureClass'] not in FAILURES or value['stage'] not in STAGES or
            value['kind'] not in KINDS or value['form'] not in FORMS or
            value['position'] not in POSITIONS or value['context'] not in CONTEXTS or
            any(type(value[key]) is not bool for key in
                ('rootGuardMatched', 'validatorMatched', 'fragmentMatched'))):
        raise ValueError('PROJECTION_REJECTED')
    if value['status'] == 'NOT_REPRODUCED' and not (
            value['failureClass'] == 'NONE' and value['stage'] == 'MERGE' and
            value['kind'] == 'NONE' and value['form'] == 'NO_ACTIVE_MARKER'):
        raise ValueError('PROJECTION_REJECTED')
    if value['failureClass'] == 'SYNTAX_UNSUPPORTED' and not (
            value['stage'] == 'TOKEN' and value['kind'] in {'BACKTICK', 'BOM', 'BOTH'} and
            value['rootGuardMatched'] and value['validatorMatched'] and value['fragmentMatched']):
        raise ValueError('PROJECTION_REJECTED')
    return value
