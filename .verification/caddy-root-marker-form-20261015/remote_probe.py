"""Classify the first active marker rejected by the sealed Caddy subset."""
import hashlib
import json
from pathlib import Path

VALIDATOR_SHA = 'd980095b44a9d5c53940fea86dc4863619273bafed8c64798247516c5e37503f'
FRAGMENT_SHA = '79cb9a1ac82ef4dda07c822794a8ca3e9091f3a0cab1a854ea8a20941492c441'
ROOT_SHA = 'ff093f30330f8a7fa536bffcafb12cc316b096e4210142461889da66eaabb09b'


def location(depth, in_default):
    if in_default:
        return 'GLOBAL_LOG_DEFAULT'
    if depth == 0:
        return 'ROOT_TOP'
    if depth == 1:
        return 'GLOBAL_OTHER'
    return 'ROOT_NESTED'


def marker_form(value, quoted, token_offset, full_source, line_end):
    """No value, offset or line data is returned; only a closed enum."""
    ticks, boms = '`' in value, '\ufeff' in value
    if ticks and boms:
        return 'BOTH', 'MULTIPLE_MARKERS', 'MIXED'
    if ticks:
        if quoted:
            return 'BACKTICK', 'DOUBLE_QUOTED_INTERIOR', 'DOUBLE_QUOTED'
        position = value.index('`')
        if position == 0:
            end = full_source.find('`', token_offset + 1)
            form = ('RAW_QUOTE_EOF' if end < 0 else
                    'RAW_QUOTE_SINGLE_LINE' if end < line_end else
                    'RAW_QUOTE_MULTILINE')
            return 'BACKTICK', form, 'TOKEN_INITIAL'
        if value[position - 1] == '\\':
            return 'BACKTICK', 'BARE_INTERIOR_ESCAPED', 'TOKEN_INTERIOR'
        return 'BACKTICK', 'BARE_INTERIOR', 'TOKEN_INTERIOR'
    if boms:
        if quoted:
            return 'BOM', 'DOUBLE_QUOTED_INTERIOR', 'DOUBLE_QUOTED'
        position = value.index('\ufeff')
        if token_offset + position == 0:
            return 'BOM', 'FILE_PREFIX', 'FILE_PREFIX'
        if position == 0:
            return 'BOM', 'BARE_TOKEN_START', 'TOKEN_INITIAL'
        return 'BOM', 'BARE_TOKEN_INTERIOR', 'TOKEN_INTERIOR'
    return 'NONE', 'NO_ACTIVE_MARKER', 'UNKNOWN'


def first_marker(line, offset, full_source):
    """Mirror sealed tokens() boundaries, including comments at token start."""
    index, line_end = 0, offset + len(line)
    while index < len(line):
        if line[index] in ' \t\r':
            index += 1
            continue
        if line[index] == '#':
            return 'NONE', 'COMMENT_INACTIVE', 'COMMENT'
        if line[index] == '"':
            end = line.find('"', index + 1)
            if end < 0:
                return 'NONE', 'OTHER_TOKEN_REJECTION', 'UNKNOWN'
            value = line[index + 1:end]
            kind, form, position = marker_form(value, True, offset + index + 1, full_source, line_end)
            if kind != 'NONE':
                return kind, form, position
            index = end + 1
        else:
            end = index
            while end < len(line) and line[end] not in ' \t\r':
                end += 1
            value = line[index:end]
            kind, form, position = marker_form(value, False, offset + index, full_source, line_end)
            if kind != 'NONE':
                return kind, form, position
            index = end
    return 'NONE', 'OTHER_TOKEN_REJECTION', 'UNKNOWN'


def diagnose(data, validator, fragment, expected_root_sha=ROOT_SHA):
    result = {'status': 'STOPPED', 'failureClass': 'UNKNOWN', 'stage': 'UNKNOWN',
              'kind': 'NONE', 'form': 'UNKNOWN', 'position': 'UNKNOWN',
              'context': 'UNKNOWN', 'rootGuardMatched': False,
              'validatorMatched': False, 'fragmentMatched': False}
    if hashlib.sha256(validator).hexdigest() != VALIDATOR_SHA:
        result.update(failureClass='VALIDATOR_CHANGED', stage='GUARD')
        return result
    result['validatorMatched'] = True
    if hashlib.sha256(fragment).hexdigest() != FRAGMENT_SHA:
        result.update(failureClass='FRAGMENT_CHANGED', stage='GUARD')
        return result
    result['fragmentMatched'] = True
    if hashlib.sha256(data).hexdigest() != expected_root_sha:
        result.update(failureClass='GUARD_CHANGED', stage='GUARD')
        return result
    result['rootGuardMatched'] = True
    module = {'__name__': 'sealed_validator'}
    try:
        exec(compile(validator, '<sealed-validator>', 'exec'), module)
        try:
            module['merge_default_log'](data, fragment)
        except module['Stop'] as error:
            if str(error) != 'SYNTAX_UNSUPPORTED':
                result.update(failureClass='OTHER_MERGE_STOP', stage='MERGE')
                return result
        else:
            result.update(status='NOT_REPRODUCED', failureClass='NONE', stage='MERGE',
                          form='NO_ACTIVE_MARKER', context='WHOLE_SOURCE')
            return result
        source = data.decode('utf8')
        if any(marker in source for marker in ('\r', '\0', '"{"', '"}"')):
            result.update(failureClass='BASELINE_CHANGED', stage='BLANKET')
            return result
        depth, in_default, offset = 0, False, 0
        for raw in data.splitlines(keepends=True):
            line = raw.decode('utf8').removesuffix('\n')
            try:
                parts = module['tokens'](line)
            except module['Stop']:
                kind, form, position = first_marker(line, offset, source)
                result.update(failureClass='SYNTAX_UNSUPPORTED' if kind != 'NONE' else 'BASELINE_CHANGED',
                              stage='TOKEN', kind=kind,
                              form=form, position=position, context=location(depth, in_default))
                return result
            if parts:
                if depth == 1 and parts[:2] == ['log', 'default']:
                    in_default = True
                if parts == ['}']:
                    depth -= 1
                    if in_default and depth == 1:
                        in_default = False
                elif parts[-1] == '{' and parts.count('{') == 1 and '}' not in parts:
                    depth += 1
            offset += len(line) + int(raw.endswith(b'\n'))
        result.update(failureClass='BASELINE_CHANGED', stage='MERGE')
        return result
    except Exception:
        result.update(failureClass='OPERATION_ERROR', stage='UNKNOWN')
        return result


def main(validator, fragment):
    try:
        if hashlib.sha256(validator).hexdigest() != VALIDATOR_SHA:
            raise ValueError('changed')
        module = {'__name__': 'sealed_validator'}
        exec(compile(validator, '<sealed-validator>', 'exec'), module)
        root = module['read_source'](module['ROOT'], Path('Caddyfile'))
        result = diagnose(root, validator, fragment)
    except Exception:
        result = {'status': 'STOPPED', 'failureClass': 'OPERATION_ERROR', 'stage': 'READ',
                  'kind': 'NONE', 'form': 'UNKNOWN', 'position': 'UNKNOWN',
                  'context': 'UNKNOWN', 'rootGuardMatched': False,
                  'validatorMatched': False, 'fragmentMatched': False}
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main(VALIDATOR_SOURCE, LOG_FRAGMENT)
