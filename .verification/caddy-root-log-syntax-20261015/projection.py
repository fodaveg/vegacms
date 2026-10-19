"""Reject anything except the finite classifier schema."""

FIELDS = {'status', 'failureClass', 'stage', 'category', 'context',
          'rootGuardMatched', 'validatorMatched', 'fragmentMatched', 'blanketFlags'}
FAILURES = {'SYNTAX_UNSUPPORTED', 'LOG_BLOCK_AMBIGUOUS', 'LOG_FORMAT_AMBIGUOUS',
            'POLICY_CHANGED', 'LOG_FRAGMENT_CHANGED', 'UNKNOWN_STOP',
            'VALIDATOR_CHANGED', 'GUARD_CHANGED', 'FRAGMENT_CHANGED', 'OPERATION_ERROR'}
STAGES = {'GUARD', 'READ', 'DECODE', 'BLANKET', 'TOKEN', 'STRUCTURE', 'MERGE', 'UNKNOWN'}
CATEGORIES = {'GUARD_CHANGED', 'UNKNOWN', 'INVALID_UTF8', 'CR', 'NUL',
              'QUOTED_OPEN_BRACE', 'QUOTED_CLOSE_BRACE', 'MULTIPLE',
              'TOKEN_FORBIDDEN_MARKER', 'TOKEN_HEREDOC', 'TOKEN_UNSUPPORTED_SPACE',
              'QUOTED_BACKSLASH', 'BARE_BACKSLASH_FINAL', 'BARE_BACKSLASH_SPACE',
              'BARE_BACKSLASH_DELIMITER', 'QUOTE_UNCLOSED', 'QUOTE_BOUNDARY',
              'QUOTE_INSIDE_BARE', 'TOKEN_UNKNOWN', 'UNBALANCED_CLOSE',
              'INLINE_OR_MULTIPLE_BRACE', 'UNCLASSIFIED_SYNTAX', 'OTHER_STOP', 'NO_STOP'}
CONTEXTS = {'UNKNOWN', 'WHOLE_SOURCE', 'ROOT_TOP', 'GLOBAL_OTHER',
            'GLOBAL_LOG_DEFAULT', 'ROOT_NESTED'}


def validate(value):
    if not isinstance(value, dict) or set(value) != FIELDS:
        raise ValueError('PROJECTION_REJECTED')
    if value['status'] not in {'STOPPED', 'NOT_REPRODUCED'} or value['failureClass'] not in FAILURES | {None}:
        raise ValueError('PROJECTION_REJECTED')
    if value['stage'] not in STAGES or value['category'] not in CATEGORIES or value['context'] not in CONTEXTS:
        raise ValueError('PROJECTION_REJECTED')
    if any(type(value[key]) is not bool for key in ('rootGuardMatched', 'validatorMatched', 'fragmentMatched')):
        raise ValueError('PROJECTION_REJECTED')
    if not isinstance(value['blanketFlags'], dict) or set(value['blanketFlags']) != {
            'cr', 'nul', 'quotedOpenBrace', 'quotedCloseBrace'} or any(
            type(flag) is not bool for flag in value['blanketFlags'].values()):
        raise ValueError('PROJECTION_REJECTED')
    if value['status'] == 'NOT_REPRODUCED' and (value['failureClass'] is not None or
            value['category'] != 'NO_STOP'):
        raise ValueError('PROJECTION_REJECTED')
    if value['stage'] in {'DECODE', 'BLANKET', 'TOKEN', 'STRUCTURE'} and value['failureClass'] != 'SYNTAX_UNSUPPORTED':
        raise ValueError('PROJECTION_REJECTED')
    return value
