"""Classify the already observed root merge STOP. No private bytes leave RAM."""
import hashlib
import json
from pathlib import Path

VALIDATOR_SHA = 'd980095b44a9d5c53940fea86dc4863619273bafed8c64798247516c5e37503f'
ROOT_SHA = 'ff093f30330f8a7fa536bffcafb12cc316b096e4210142461889da66eaabb09b'
FRAGMENT_SHA = '79cb9a1ac82ef4dda07c822794a8ca3e9091f3a0cab1a854ea8a20941492c441'


def token_reason(line):
    """Classify only the first rejection by the sealed tokens() lexical rules."""
    def active(value, quoted):
        if '`' in value or '\ufeff' in value:
            return 'TOKEN_FORBIDDEN_MARKER'
        if '<<' in value:
            return 'TOKEN_HEREDOC'
        if any(c.isspace() and c not in ' \t\r' for c in value):
            return 'TOKEN_UNSUPPORTED_SPACE'
        for index, char in enumerate(value):
            if char != '\\':
                continue
            if quoted:
                return 'QUOTED_BACKSLASH'
            if index + 1 == len(value):
                return 'BARE_BACKSLASH_FINAL'
            after = value[index + 1]
            if after.isspace():
                return 'BARE_BACKSLASH_SPACE'
            if after in '#<"\\`\ufeff':
                return 'BARE_BACKSLASH_DELIMITER'
        return None

    index = 0
    while index < len(line):
        if line[index] in ' \t\r':
            index += 1
            continue
        if line[index] == '#':
            return 'TOKEN_UNKNOWN'
        if line[index] == '"':
            end = line.find('"', index + 1)
            if end < 0:
                return 'QUOTE_UNCLOSED'
            if end + 1 < len(line) and line[end + 1] not in ' \t\r':
                return 'QUOTE_BOUNDARY'
            reason = active(line[index + 1:end], True)
            if reason:
                return reason
            index = end + 1
        else:
            end = index
            while end < len(line) and line[end] not in ' \t\r':
                end += 1
            value = line[index:end]
            reason = active(value, False)
            if reason:
                return reason
            if '"' in value:
                return 'QUOTE_INSIDE_BARE'
            index = end
    return 'TOKEN_UNKNOWN'


def context(depth, in_default):
    if in_default:
        return 'GLOBAL_LOG_DEFAULT'
    if depth == 0:
        return 'ROOT_TOP'
    if depth == 1:
        return 'GLOBAL_OTHER'
    return 'ROOT_NESTED'


def classify(data, fragment, validator, expected_root_sha=ROOT_SHA):
    result = {'status': 'STOPPED', 'failureClass': None, 'stage': 'UNKNOWN',
              'category': 'UNKNOWN', 'context': 'UNKNOWN',
              'rootGuardMatched': False, 'validatorMatched': False,
              'fragmentMatched': False,
              'blanketFlags': {'cr': False, 'nul': False, 'quotedOpenBrace': False,
                               'quotedCloseBrace': False}}
    if hashlib.sha256(validator).hexdigest() != VALIDATOR_SHA:
        result.update(failureClass='VALIDATOR_CHANGED', stage='GUARD', category='GUARD_CHANGED')
        return result
    result['validatorMatched'] = True
    if hashlib.sha256(data).hexdigest() != expected_root_sha:
        result.update(failureClass='GUARD_CHANGED', stage='GUARD', category='GUARD_CHANGED')
        return result
    result['rootGuardMatched'] = True
    if hashlib.sha256(fragment).hexdigest() != FRAGMENT_SHA:
        result.update(failureClass='FRAGMENT_CHANGED', stage='GUARD', category='GUARD_CHANGED')
        return result
    result['fragmentMatched'] = True
    module = {'__name__': 'sealed_validator'}
    try:
        exec(compile(validator, '<sealed-validator>', 'exec'), module)
        try:
            module['merge_default_log'](data, fragment)
        except module['Stop'] as error:
            observed = str(error)
            result['failureClass'] = observed if observed in {
                'SYNTAX_UNSUPPORTED', 'LOG_BLOCK_AMBIGUOUS', 'LOG_FORMAT_AMBIGUOUS',
                'POLICY_CHANGED', 'LOG_FRAGMENT_CHANGED'} else 'UNKNOWN_STOP'
        else:
            result.update(status='NOT_REPRODUCED', stage='MERGE', category='NO_STOP', context='WHOLE_SOURCE')
            return result
    except Exception:
        result.update(failureClass='OPERATION_ERROR', stage='MERGE', category='UNKNOWN')
        return result
    if result['failureClass'] != 'SYNTAX_UNSUPPORTED':
        result.update(stage='MERGE', category='OTHER_STOP', context='WHOLE_SOURCE')
        return result
    try:
        source = data.decode('utf8')
    except UnicodeError:
        result.update(stage='DECODE', category='INVALID_UTF8', context='WHOLE_SOURCE')
        return result
    flags = {'cr': '\r' in source, 'nul': '\0' in source,
             'quotedOpenBrace': '"{"' in source, 'quotedCloseBrace': '"}"' in source}
    result['blanketFlags'] = flags
    if any(flags.values()):
        selected = [name for name, present in flags.items() if present]
        result.update(stage='BLANKET', category={
            'cr': 'CR', 'nul': 'NUL', 'quotedOpenBrace': 'QUOTED_OPEN_BRACE',
            'quotedCloseBrace': 'QUOTED_CLOSE_BRACE'}[selected[0]] if len(selected) == 1 else 'MULTIPLE',
            context='WHOLE_SOURCE')
        return result

    depth, in_default = 0, False
    for raw in data.splitlines(keepends=True):
        line = raw.decode('utf8').removesuffix('\n')
        try:
            parts = module['tokens'](line)
        except module['Stop']:
            result.update(stage='TOKEN', category=token_reason(line), context=context(depth, in_default))
            return result
        if not parts:
            continue
        if depth == 1 and parts[:2] == ['log', 'default']:
            in_default = True
        if parts == ['}']:
            depth -= 1
            if depth < 0:
                result.update(stage='STRUCTURE', category='UNBALANCED_CLOSE', context=context(0, in_default))
                return result
            if in_default and depth == 1:
                in_default = False
        elif parts[-1] == '{' and parts.count('{') == 1 and '}' not in parts:
            depth += 1
        elif '{' in parts or '}' in parts:
            result.update(stage='STRUCTURE', category='INLINE_OR_MULTIPLE_BRACE', context=context(depth, in_default))
            return result
    result.update(stage='MERGE', category='UNCLASSIFIED_SYNTAX', context='WHOLE_SOURCE')
    return result


def main(validator, fragment):
    try:
        module = {'__name__': 'sealed_validator'}
        if hashlib.sha256(validator).hexdigest() != VALIDATOR_SHA:
            raise ValueError('VALIDATOR_CHANGED')
        exec(compile(validator, '<sealed-validator>', 'exec'), module)
        root = module['read_source'](module['ROOT'], Path('Caddyfile'))
        result = classify(root, fragment, validator)
    except Exception:
        result = {'status': 'STOPPED', 'failureClass': 'OPERATION_ERROR', 'stage': 'READ',
                  'category': 'UNKNOWN', 'context': 'UNKNOWN',
                  'rootGuardMatched': False, 'validatorMatched': False,
                  'fragmentMatched': False,
                  'blanketFlags': {'cr': False, 'nul': False, 'quotedOpenBrace': False,
                                   'quotedCloseBrace': False}}
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main(VALIDATOR_SOURCE, LOG_FRAGMENT)
