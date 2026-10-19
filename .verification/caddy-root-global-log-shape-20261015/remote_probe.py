"""Classify the global logger shape in the guarded root Caddyfile, in RAM."""
import hashlib
import json
from pathlib import Path

VALIDATOR_SHA = 'b9a4cc3ef38919409348509d0b6af8312655a795a3ec1caf0ffe4372cf032b6e'
FRAGMENT_SHA = '79cb9a1ac82ef4dda07c822794a8ca3e9091f3a0cab1a854ea8a20941492c441'
ROOT_SHA = 'ff093f30330f8a7fa536bffcafb12cc316b096e4210142461889da66eaabb09b'


def bucket(value):
    return 'ZERO' if value == 0 else 'ONE' if value == 1 else 'MANY'


def shape(data, module):
    depth = 0
    first = 'EMPTY'
    globals_found = 0
    global_active = False
    unnamed = explicit = other = 0
    imported = False
    try:
        for raw in data.splitlines(keepends=True):
            parts = module['tokens'](raw.decode('utf8').removesuffix('\n'))
            if not parts:
                continue
            opening = module['brace'](parts[-1]) == '{' and sum(module['brace'](part) == '{' for part in parts) == 1 and not any(module['brace'](part) == '}' for part in parts)
            closing = len(parts) == 1 and module['brace'](parts[0]) == '}'
            if first == 'EMPTY':
                first = 'GLOBAL' if depth == 0 and len(parts) == 1 and module['brace'](parts[0]) == '{' else 'OTHER'
            if depth == 0 and len(parts) == 1 and module['brace'](parts[0]) == '{':
                globals_found += 1
                global_active = True
            if global_active and depth == 1 and parts[0] == 'import':
                imported = True
            if global_active and depth == 1 and parts[0] == 'log':
                if len(parts) == 2 and parts[1] == '{' and module['brace'](parts[1]) == '{':
                    unnamed += 1
                elif len(parts) == 3 and parts[1] == 'default' and parts[2] == '{' and module['brace'](parts[2]) == '{':
                    explicit += 1
                else:
                    other += 1
            if closing:
                depth -= 1
                if depth < 0:
                    raise ValueError('shape')
                if depth == 0:
                    global_active = False
            elif opening:
                depth += 1
            elif any(module['brace'](part) for part in parts):
                raise ValueError('shape')
        if depth:
            raise ValueError('shape')
    except (UnicodeError, module['Stop'], ValueError):
        return 'STRUCTURE_UNSUPPORTED', first, bucket(globals_found), bucket(unnamed), bucket(explicit), bucket(other), imported
    if first != 'GLOBAL':
        diagnosis = 'GLOBAL_NOT_FIRST'
    elif globals_found != 1:
        diagnosis = 'GLOBAL_COUNT_UNEXPECTED'
    elif unnamed + explicit + other == 0:
        diagnosis = 'NO_ROOT_LOG'
    elif unnamed == 1 and not explicit and not other:
        diagnosis = 'UNNAMED_DEFAULT'
    elif explicit == 1 and not unnamed and not other:
        diagnosis = 'EXPLICIT_DEFAULT'
    elif unnamed + explicit + other > 1:
        diagnosis = 'MULTIPLE_ROOT_LOGS'
    else:
        diagnosis = 'OTHER_ROOT_LOG'
    return diagnosis, first, bucket(globals_found), bucket(unnamed), bucket(explicit), bucket(other), imported


def diagnose(data, validator, fragment, expected_root_sha=ROOT_SHA):
    result = dict(status='STOPPED', diagnosis='UNKNOWN', firstBlock='EMPTY',
                  globalBlocks='ZERO', unnamedLogs='ZERO', explicitDefaultLogs='ZERO',
                  otherLogs='ZERO', globalImport=False, rootGuardMatched=False,
                  validatorMatched=False, fragmentMatched=False,
                  mergeReproduced=False)
    if hashlib.sha256(validator).hexdigest() != VALIDATOR_SHA:
        result['diagnosis'] = 'VALIDATOR_CHANGED'
        return result
    result['validatorMatched'] = True
    if hashlib.sha256(fragment).hexdigest() != FRAGMENT_SHA:
        result['diagnosis'] = 'FRAGMENT_CHANGED'
        return result
    result['fragmentMatched'] = True
    if hashlib.sha256(data).hexdigest() != expected_root_sha:
        result['diagnosis'] = 'ROOT_CHANGED'
        return result
    result['rootGuardMatched'] = True
    try:
        module = {'__name__': 'sealed_validator'}
        exec(compile(validator, '<sealed-validator>', 'exec'), module)
        try:
            module['merge_default_log'](data, fragment)
        except module['Stop'] as error:
            if str(error) != 'LOG_BLOCK_AMBIGUOUS':
                result['diagnosis'] = 'MERGE_FAILURE_CHANGED'
                return result
            result['mergeReproduced'] = True
        else:
            result['diagnosis'] = 'MERGE_NOW_SUCCEEDS'
            return result
        (result['diagnosis'], result['firstBlock'], result['globalBlocks'],
         result['unnamedLogs'], result['explicitDefaultLogs'], result['otherLogs'],
         result['globalImport']) = shape(data, module)
        return result
    except Exception:
        result['diagnosis'] = 'OPERATION_ERROR'
        return result


def main(validator, fragment):
    try:
        if hashlib.sha256(validator).hexdigest() != VALIDATOR_SHA:
            raise ValueError('validator')
        module = {'__name__': 'sealed_validator'}
        exec(compile(validator, '<sealed-validator>', 'exec'), module)
        root = module['read_source'](module['ROOT'], Path('Caddyfile'))
        result = diagnose(root, validator, fragment)
    except Exception:
        result = dict(status='STOPPED', diagnosis='READ_ERROR', firstBlock='EMPTY',
                      globalBlocks='ZERO', unnamedLogs='ZERO', explicitDefaultLogs='ZERO',
                      otherLogs='ZERO', globalImport=False, rootGuardMatched=False,
                      validatorMatched=False, fragmentMatched=False,
                      mergeReproduced=False)
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main(VALIDATOR_SOURCE, LOG_FRAGMENT)
