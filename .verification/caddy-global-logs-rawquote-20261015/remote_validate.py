"""Reduced private Caddy reader. Execute only after a new runtime approval.

No environment inventory: only individually referenced, validated names are queried.
Raw data and diagnostic output remain in remote RAM; final output is finite.
"""

import copy
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import stat
import subprocess
import tempfile
import time
import uuid

ROOT = Path('/srv/edge')
FILES = {
    'root': ('Caddyfile', 'ff093f30330f8a7fa536bffcafb12cc316b096e4210142461889da66eaabb09b'),
    'vega': ('conf.d/vega.caddy', '772440180332741a8716b440cc699dfe117f1fe716ab7a38458a9e7eea9c7b06'),
    'lumbre': ('conf.d/admin-lumbre-pro.caddy', '9a3322ce14562e20bfb5bdc10eac6a63c077120a327aafcf4a222492cc0c1f53'),
    'fodaveg': ('conf.d/fodaveg.caddy', '0bdaa9f5ef1af907f7a4746ad2be5af22c7553457af8871563de00fe56e171f0'),
}
BLOCKS = {'vega': ('admin.vegacms.com', 1, 44), 'lumbre': ('admin.lumbre.pro', 15, 49), 'fodaveg': ('admin.fodaveg.net', 24, 68)}
IMAGE = 'caddy@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648'
MAX_FILES = 100
MAX_BYTES = 16 * 1024 * 1024
sha = lambda data: hashlib.sha256(data).hexdigest()

class Stop(Exception):
    """Only finite public classes are projected; never include raw errors or operands."""

def relative(path):
    path = Path(path)
    if path.is_absolute():
        try:
            path = path.relative_to(ROOT)
        except ValueError:
            raise Stop('OUTSIDE_SCOPE') from None
    if not path.parts or '..' in path.parts or any('\x00' in part for part in path.parts):
        raise Stop('OUTSIDE_SCOPE')
    return path

def open_directory(root, parts):
    """Open each directory without following symlinks, including the fixed root chain."""
    descriptor = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in (*root.parts[1:], *parts):
            following = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = following
        return descriptor
    except OSError:
        os.close(descriptor)
        raise Stop('UNSAFE_OR_MISSING_PATH') from None

def read_source(root, path):
    if path.name != 'Caddyfile' and path.suffix != '.caddy':
        raise Stop('IMPORT_RESOURCE_UNAPPROVED')
    parent = open_directory(root, path.parts[:-1])
    descriptor = None
    try:
        descriptor = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_BYTES:
            raise Stop('SOURCE_LIMIT_OR_TYPE')
        with os.fdopen(descriptor, 'rb') as stream:
            descriptor = None
            value = stream.read(MAX_BYTES + 1)
        if len(value) > MAX_BYTES:
            raise Stop('SOURCE_LIMIT_OR_TYPE')
        return value
    except OSError:
        raise Stop('UNSAFE_OR_MISSING_PATH') from None
    finally:
        if descriptor is not None:
            os.close(descriptor)
        os.close(parent)

def staged_patch(label, data, patch):
    """Apply exact original hunk lines, then prove byte identity outside the target block."""
    host, first, last = BLOCKS[label]
    lines = data.decode('utf8').splitlines(keepends=True)
    if lines[first - 1].strip() != host + ' {' or lines[last - 1].strip() != '}':
        raise Stop('HOST_ANCHOR')
    depth = 0
    for index, line in enumerate(lines[first - 1:last]):
        # splitlines(keepends=True) retains the separator for patch byte fidelity.
        # The lexer helper receives the line body, as it does in closure().
        for token in tokens(line.removesuffix('\n')):
            if not token.quoted and token and set(token) <= {'{', '}'}:
                depth += token.count('{') - token.count('}')
        if depth <= 0 and index != last - first:
            raise Stop('HOST_ANCHOR')
    if depth != 0:
        raise Stop('HOST_ANCHOR')
    output, consumed, delta = [], 0, 0
    hunks = patch.splitlines(keepends=True)[2:]
    cursor = 0
    while cursor < len(hunks):
        match = re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n', hunks[cursor])
        if not match:
            raise Stop('PATCH_SHAPE')
        start = int(match[1]) - 1
        if start < consumed:
            raise Stop('PATCH_SHAPE')
        old, new = [], []
        original_position = start
        cursor += 1
        while cursor < len(hunks) and not hunks[cursor].startswith('@@ '):
            line = hunks[cursor]
            if line[0] not in ' +-':
                raise Stop('PATCH_SHAPE')
            if line[0] in '+-' and not first - 1 <= original_position < last:
                raise Stop('OUTSIDE_HOST_CHANGE')
            if line[0] in ' -':
                old.append(line[1:])
                original_position += 1
            if line[0] in ' +':
                new.append(line[1:])
            cursor += 1
        if len(old) != int(match[2] or 1) or len(new) != int(match[4] or 1) or lines[start:start + len(old)] != old:
            raise Stop('PATCH_CONTEXT')
        output.extend(lines[consumed:start])
        output.extend(new)
        consumed = start + len(old)
        delta += len(new) - len(old)
    output.extend(lines[consumed:])
    if output[:first - 1] != lines[:first - 1] or output[last + delta:] != lines[last:]:
        raise Stop('OUTSIDE_HOST_CHANGE')
    return ''.join(output).encode()

def capture_process(command, input=None, timeout=20, limit=1024 * 1024, env=None, cwd=None):
    """Bound stdout/stderr while streaming; terminate only this child on limit/timeout."""
    process = subprocess.Popen(command, stdin=subprocess.PIPE if input is not None else subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, cwd=cwd)
    selector = selectors.DefaultSelector()
    output, error_bytes, offset = bytearray(), 0, 0
    deadline = time.monotonic() + timeout
    try:
        for stream, label in ((process.stdout, 'out'), (process.stderr, 'err')):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, label)
        if input is not None:
            os.set_blocking(process.stdin.fileno(), False)
            selector.register(process.stdin, selectors.EVENT_WRITE, 'in')
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise Stop('CAPTURE_LIMIT_OR_TIMEOUT')
            for key, event in selector.select(min(remaining, 1)):
                if key.data == 'in':
                    try:
                        offset += os.write(key.fd, input[offset:offset + 32768])
                    except BrokenPipeError:
                        offset = len(input)
                    if offset == len(input):
                        selector.unregister(key.fileobj); key.fileobj.close()
                    continue
                chunk = os.read(key.fd, 32768)
                if not chunk:
                    selector.unregister(key.fileobj); key.fileobj.close()
                elif key.data == 'out':
                    if len(output) + len(chunk) > limit:
                        raise Stop('CAPTURE_LIMIT_OR_TIMEOUT')
                    output.extend(chunk)
                else:
                    error_bytes += len(chunk)
                    if error_bytes > 128 * 1024:
                        raise Stop('CAPTURE_LIMIT_OR_TIMEOUT')
                    # Raw stderr is drained and discarded, never stored or projected.
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise Stop('CAPTURE_LIMIT_OR_TIMEOUT')
        try:
            exit_code = process.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            raise Stop('CAPTURE_LIMIT_OR_TIMEOUT') from None
        return subprocess.CompletedProcess(command, exit_code, bytes(output), b'')
    finally:
        selector.close()
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream is not None and not stream.closed:
                stream.close()

def logical_to_relative(logical, mapping):
    matches = []
    for physical, destination in mapping:
        try:
            matches.append(physical / logical.relative_to(destination))
        except ValueError:
            continue
    if len(matches) != 1:
        raise Stop('RUNTIME_MAPPING_UNKNOWN')
    return relative(matches[0])

def relative_to_logical(physical, mapping):
    matches = []
    for prefix, destination in mapping:
        try:
            matches.append(destination / physical.relative_to(prefix))
        except ValueError:
            continue
    if len(matches) != 1:
        raise Stop('RUNTIME_MAPPING_UNKNOWN')
    return matches[0]

EDGE_GUARD = 'c6c47d481ff63296d8818680e6b20d351a73b34d00b9339b2654df7679abbee2'
VEGA_GUARD = '11593d1da51e580f988058bfac8288194eaeb7697ac7db2f6926815f8d14dcde'
LUMBRE_GUARD = '56caa1a1273feaa3c56b34db7724177c448190d1c28d723d53a5b62fbe110ae9'
FODAVEG_GUARD = 'eb62c0447d4cce8a8af1ceedeeabb11602770d48d6bf952618ef19e7b8a1008b'
COMPOSE_GUARDS = {
    'edge': (Path('/srv/edge/compose.yml'), EDGE_GUARD),
    'vega': (Path('/srv/vega/infra/production/compose.yml'), VEGA_GUARD),
    'lumbre': (Path('/srv/lumbre-admin/compose.yml'), LUMBRE_GUARD),
    'fodaveg': (Path('/root/fodaveg/compose.yml'), FODAVEG_GUARD),
}
CONTAINER = 'edge-caddy'
CADDY_ID = 'ae97fc0c57fbe4c3a97f5dce15dfc9da92f33f527b60d95c3f74de9d2a160a7a'
CONSUMERS = {
    'vega-pb': ('007b755b8de76195d857181ce985a9522fe71c5d2941a2c1597b310d12d56881',
                'sha256:dd978b8d23081d2e3c69ebf6ef8ff4599a1acdd3f38dc559ae6fa379e46449b4'),
    'lumbre-admin-pb': ('3774856bc7cbb6aa193b3db9ad2d0545d25bd4a66a35ef53c398b786d89ca9ca',
                        'sha256:40df6a9bbcfd4edbc93680b0f45946d0be7c50c4e5c470167e33646fe499c1b7'),
    'fodaveg': ('c25a7858f2692b395925d5b7f8d80512378dccbaa58ec55e432d8c5f186b73e6',
                'sha256:22cf0983980e3bf9562a0a518f258e6e69cdd58cb3d23a19516f1da60a6d403e'),
}
MAX_NAMES = 128
MAX_VALUE = 65536
IMPORT_PREFIX = Path('conf.d')
INSPECT = '{"id":{{json .Id}},"name":{{json .Name}},"imageId":{{json .Image}},"entrypoint":{{json .Config.Entrypoint}},"cmd":{{json .Config.Cmd}},"workingDir":{{json .Config.WorkingDir}},"mounts":[{{range $i,$m := .Mounts}}{{if $i}},{{end}}{"source":{{json $m.Source}},"destination":{{json $m.Destination}},"type":{{json $m.Type}}}{{end}}]}'
CONSUMER_INSPECT = '{"id":{{json .Id}},"name":{{json .Name}},"imageId":{{json .Image}}}'
CONTROL_NAMES = {b'PATH', b'ENV', b'BASH_ENV', b'LD_PRELOAD', b'LD_LIBRARY_PATH', b'PYTHONPATH', b'PYTHONHOME', b'PWD', b'OLDPWD', b'SHLVL', b'IFS', b'HOME', b'CDPATH', b'SHELLOPTS', b'BASHOPTS', b'PPID', b'UID', b'EUID', b'RANDOM', b'SECONDS', b'LINENO', b'OPTIND', b'OPTARG', b'PS1', b'PS2', b'PS4', b'HISTFILE', b'MAIL', b'MAILPATH', b'MAILCHECK', b'_'}
CLIENT_ENV = None
DEADLINE = None


def bounded(command, limit=1024 * 1024, timeout=20, **kwargs):
    """All CLI output remains private; stderr is drained without retaining bytes."""
    if CLIENT_ENV is None:
        raise Stop('CLIENT_UNAVAILABLE')
    if DEADLINE is not None:
        timeout = min(timeout, DEADLINE - time.monotonic())
        if timeout <= 0:
            raise Stop('CAPTURE_LIMIT_OR_TIMEOUT')
    result = capture_process(command, timeout=timeout, limit=limit, env=CLIENT_ENV, **kwargs)
    if result.returncode:
        raise Stop('CLI_FAILED')
    return result.stdout


def read_guard(path, expected):
    """Read only the explicitly proposed Compose files, without following any links."""
    parent = open_directory(path.parent, ())
    try:
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        with os.fdopen(fd, 'rb') as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_size > 2 * 1024 * 1024:
                raise Stop('SOURCE_LIMIT_OR_TYPE')
            data = stream.read(2 * 1024 * 1024 + 1)
        if len(data) > 2 * 1024 * 1024 or sha(data) != expected:
            raise Stop('GUARD_CHANGED')
    except OSError:
        raise Stop('UNSAFE_OR_MISSING_PATH') from None
    finally:
        os.close(parent)


def direct_command(args):
    """Accept only the reviewed direct run shape. Never resolve wrappers or envfiles."""
    if not isinstance(args, list) or any(not isinstance(a, str) for a in args):
        raise Stop('COMMAND_UNKNOWN')
    if len(args) != 6 or args[:2] not in (['caddy', 'run'], ['/usr/bin/caddy', 'run']):
        raise Stop('COMMAND_UNKNOWN')
    if args[2] != '--config' or args[4:] != ['--adapter', 'caddyfile']:
        raise Stop('COMMAND_UNKNOWN')
    config = Path(args[3])
    if not config.is_absolute() or '..' in config.parts or '\x00' in args[3]:
        raise Stop('COMMAND_UNKNOWN')
    return config


def provenance():
    """Selected Docker fields plus PID 1 cmdline, before the first value query."""
    for path, expected in COMPOSE_GUARDS.values():
        read_guard(path, expected)
    for name, (container_id, image_id) in CONSUMERS.items():
        selected = json.loads(bounded(['docker', 'inspect', '--format', CONSUMER_INSPECT, name], 4096))
        if selected != {'id': container_id, 'name': '/' + name, 'imageId': image_id}:
            raise Stop('IMAGE_SOURCE_UNVERIFIED')
    observed = json.loads(bounded(['docker', 'inspect', '--format', INSPECT, CONTAINER]))
    if observed.get('name') != '/' + CONTAINER or observed.get('id') != CADDY_ID:
        raise Stop('IMAGE_SOURCE_UNVERIFIED')
    image = observed.get('imageId')
    if not isinstance(image, str) or not re.fullmatch(r'sha256:[a-f0-9]{64}', image):
        raise Stop('IMAGE_SOURCE_UNVERIFIED')
    digests = json.loads(bounded(['docker', 'image', 'inspect', '--format', '{{json .RepoDigests}}', image]))
    if not isinstance(digests, list) or not any(isinstance(d, str) and d.endswith('@' + IMAGE.split('@')[1]) for d in digests):
        raise Stop('IMAGE_SOURCE_UNVERIFIED')
    entry, cmd = observed.get('entrypoint'), observed.get('cmd')
    if entry is None:
        entry = []
    if not isinstance(entry, list) or not isinstance(cmd, list):
        raise Stop('COMMAND_UNKNOWN')
    args = entry + cmd
    config = direct_command(args)
    # A process at any other PID, a wrapper, or a changed argv does not qualify.
    current = bounded(['docker', 'exec', CONTAINER, '/bin/busybox', 'cat', '/proc/1/cmdline'], 4096)
    expected = b'\0'.join(a.encode() for a in args) + b'\0'
    if current != expected:
        raise Stop('COMMAND_UNKNOWN')
    mappings = []
    mounts = observed.get('mounts')
    if not isinstance(mounts, list) or len(mounts) > 32:
        raise Stop('MAPPING_UNKNOWN')
    for mount in mounts:
        if not isinstance(mount, dict):
            raise Stop('MAPPING_UNKNOWN')
        src, dest = mount.get('source'), mount.get('destination')
        if not isinstance(src, str) or not isinstance(dest, str) or not dest.startswith('/') or '..' in Path(dest).parts:
            raise Stop('MAPPING_UNKNOWN')
        if any(Path(dest) == Path(runtime) or Path(dest) in Path(runtime).parents or Path(runtime) in Path(dest).parents
               for runtime in ('/lib', '/lib64', '/usr/lib', '/etc/ld.so.preload')):
            raise Stop('EXECUTABLE_MOUNT_SHADOW')
        if any(Path(dest) == Path(binary) or Path(dest) in Path(binary).parents
               for binary in ('/usr/bin/caddy', '/bin/sh', '/bin/busybox')):
            raise Stop('EXECUTABLE_MOUNT_SHADOW')
        if src == str(ROOT) or src.startswith(str(ROOT) + '/'):
            if mount.get('type') != 'bind':
                raise Stop('MAPPING_UNKNOWN')
            mappings.append((Path('') if src == str(ROOT) else relative(src), Path(dest)))
    if not mappings or len(mappings) > 16 or logical_to_relative(config, mappings) != Path('Caddyfile'):
        raise Stop('MAPPING_UNKNOWN')
    if observed.get('workingDir') not in ('', '/', '/srv'):
        raise Stop('COMMAND_UNKNOWN')
    version = bounded(['docker', 'exec', CONTAINER, '/usr/bin/caddy', 'version'], 4096)
    if not re.fullmatch(rb'v2\.11\.4(?: h1:[A-Za-z0-9+/=]+)?\n', version):
        raise Stop('VERSION_UNKNOWN')
    return image, config, mappings, expected


def valid_name(name):
    """Only literal uppercase shell identifiers; startup/process-control names are excluded."""
    if not re.fullmatch(rb'[A-Z_][A-Z0-9_]*', name):
        raise Stop('REFERENCE_UNSUPPORTED')
    if name in CONTROL_NAMES or name.startswith((b'LD_', b'DYLD_')) or b'SMTP' in name:
        raise Stop('REFERENCE_EXCLUDED')


def references(data):
    """Scan original bytes including comments before any lexer or import processing."""
    names, offset = set(), 0
    while True:
        start = data.find(b'{$', offset)
        if start < 0:
            break
        end = data.find(b'}', start + 2)
        if end < 0:
            raise Stop('REFERENCE_UNSUPPORTED')
        expression = data[start + 2:end]
        if not expression:
            raise Stop('REFERENCE_UNSUPPORTED')
        name = expression.split(b':', 1)[0]
        valid_name(name)
        names.add(name)
        offset = end + 1
    if len(names) > MAX_NAMES:
        raise Stop('ENV_LIMIT')
    return names


def query_value(name):
    """One inherited creation-environment variable per exec; no dynamic evaluation."""
    valid_name(name)
    literal = name.decode('ascii')
    # Literal name is validated before script construction; values never become shell code.
    # Builtin printf preserves newlines and distinguishes unset from present-but-empty.
    script = ('if [ "${' + literal + '+x}" = x ]; then printf "P"; '
              'printf "%s" "${' + literal + '}"; else printf "U"; fi')
    raw = bounded(['docker', 'exec', CONTAINER, '/bin/sh', '-c', script], MAX_VALUE + 1)
    if raw == b'U':
        return None
    if not raw.startswith(b'P') or b'\0' in raw[1:] or len(raw) > MAX_VALUE + 1:
        raise Stop('ENV_LIMIT')
    return raw[1:]


def expand(data, values):
    """v2.11.4 LookupEnv substitution: empty is present, defaults apply only if absent."""
    offset = 0
    while True:
        start = data.find(b'{$', offset)
        if start < 0:
            return data
        end = data.find(b'}', start + 2)
        if end < 0:
            raise Stop('REFERENCE_UNSUPPORTED')
        name, separator, default = data[start + 2:end].partition(b':')
        valid_name(name)
        if name not in values:
            raise Stop('REFERENCE_UNRESOLVED')
        value = values[name]
        replacement = value if value is not None else (default if separator else b'')
        data = data[:start] + replacement + data[end + 1:]
        if len(data) > MAX_BYTES:
            raise Stop('SOURCE_LIMIT_OR_TYPE')
        offset = start + len(replacement)


class CaddyToken(str):
    """Token text plus quote origin; quoted braces are data, never structure."""
    def __new__(cls, text, quoted=False):
        token = str.__new__(cls, text)
        token.quoted = quoted
        return token


def brace(token):
    return str(token) if not token.quoted and token in ('{', '}') else None


def tokens(line):
    """Conservative Caddy lexer subset, including single-line raw quotes."""
    def active_token(value, quoted=False):
        # Caddy ignores text after # at the start of a token. Check only text
        # the parser will actually consume. Only bare backslashes followed by
        # ordinary non-delimiters have the same literal value in v2.11.4.
        if any(c in value for c in ('`', '\ufeff')) or '<<' in value:
            raise Stop('SYNTAX_UNSUPPORTED')
        if any(c.isspace() and c not in ' \t\r' for c in value):
            raise Stop('SYNTAX_UNSUPPORTED')
        for position, char in enumerate(value):
            if char == '\\' and (quoted or position + 1 == len(value)
                    or value[position + 1].isspace()
                    or value[position + 1] in '#<"\\`\ufeff'):
                raise Stop('SYNTAX_UNSUPPORTED')
    result, index = [], 0
    while index < len(line):
        if line[index] in ' \t\r':
            index += 1
            continue
        if line[index] == '#':
            break
        if line[index] == '`':
            end = line.find('`', index + 1)
            if end < 0 or end + 1 < len(line) and line[end + 1] not in ' \t\r':
                # The official lexer also permits multiline raw strings and
                # adjacent tokens. This bounded reader stops on those forms.
                raise Stop('SYNTAX_UNSUPPORTED')
            value = line[index + 1:end]
            if any(c in value for c in ('\0', '\n', '\r', '\ufeff', '\v', '\f', '\u0085', '\u2028', '\u2029')):
                raise Stop('SYNTAX_UNSUPPORTED')
            result.append(CaddyToken(value, quoted=True)); index = end + 1
            continue
        if line[index] == '"':
            end = line.find('"', index + 1)
            if end < 0 or end + 1 < len(line) and line[end + 1] not in ' \t\r':
                raise Stop('SYNTAX_UNSUPPORTED')
            value = line[index + 1:end]
            active_token(value, quoted=True)
            result.append(CaddyToken(value, quoted=True)); index = end + 1
        else:
            end = index
            while end < len(line) and line[end] not in ' \t\r':
                end += 1
            value = line[index:end]
            active_token(value)
            if '"' in value:
                raise Stop('SYNTAX_UNSUPPORTED')
            result.append(CaddyToken(value)); index = end
    return result


LOG_FRAGMENT_SHA = '79cb9a1ac82ef4dda07c822794a8ca3e9091f3a0cab1a854ea8a20941492c441'
DEFAULT_FILTER_ENCODER = {
    'format': 'filter',
    'fields': {
        'request>uri': {'filter': 'regexp', 'regexp': '(?s)[?].*', 'value': '?REDACTED'},
        'request>headers>Referer': {'filter': 'delete'},
    },
}


def merge_default_log(data, fragment):
    """Insert the reviewed filter in the sole existing global log default block."""
    if sha(fragment) != LOG_FRAGMENT_SHA:
        raise Stop('LOG_FRAGMENT_CHANGED')
    try:
        fragment_lines = [line for line in fragment.decode('utf8').splitlines()
                          if line and not line.startswith('#')]
        source = data.decode('utf8')
    except UnicodeError:
        raise Stop('SYNTAX_UNSUPPORTED') from None
    if fragment_lines != ['format filter {', '\trequest>uri regexp (?s)[?].* "?REDACTED"',
                          '\trequest>headers>Referer delete', '}']:
        raise Stop('LOG_FRAGMENT_CHANGED')
    if '\r' in source or '\0' in source:
        raise Stop('SYNTAX_UNSUPPORTED')
    lines = data.splitlines(keepends=True)
    depth = 0
    global_seen = False
    target_open = None
    target_close = None
    log_indent = None
    for index, line in enumerate(lines):
        parts = tokens(line.decode('utf8').removesuffix('\n'))
        if not parts:
            continue
        if depth == 0 and not global_seen:
            if len(parts) != 1 or brace(parts[0]) != '{':
                raise Stop('LOG_BLOCK_AMBIGUOUS')
            global_seen = True
        elif depth == 0 and len(parts) == 1 and brace(parts[0]) == '{':
            raise Stop('LOG_BLOCK_AMBIGUOUS')
        if depth == 1 and parts[:2] == ['log', 'default']:
            if parts != ['log', 'default', '{'] or brace(parts[-1]) != '{' or target_open is not None:
                raise Stop('LOG_BLOCK_AMBIGUOUS')
            target_open = index
            log_indent = line[:len(line) - len(line.lstrip(b' \t'))]
        if target_open is not None and target_close is None and depth >= 2:
            if parts[0] in ('format', 'import'):
                # Any existing encoder/filter or import could change the merge.
                raise Stop('LOG_FORMAT_AMBIGUOUS')
        if len(parts) == 1 and brace(parts[0]) == '}':
            depth -= 1
            if depth < 0:
                raise Stop('SYNTAX_UNSUPPORTED')
            if target_open is not None and target_close is None and depth == 1:
                target_close = index
        elif brace(parts[-1]) == '{' and sum(brace(part) == '{' for part in parts) == 1 and not any(brace(part) == '}' for part in parts):
            depth += 1
        elif any(brace(part) for part in parts):
            raise Stop('SYNTAX_UNSUPPORTED')
    if depth or not global_seen or target_open is None or target_close is None:
        raise Stop('LOG_BLOCK_AMBIGUOUS')
    insertion = b''.join(log_indent + b'\t' + line.encode('utf8') + b'\n'
                         for line in fragment_lines)
    offset = sum(len(line) for line in lines[:target_close])
    merged = data[:offset] + insertion + data[offset:]
    if merged[:offset] != data[:offset] or merged[offset + len(insertion):] != data[offset:]:
        raise Stop('POLICY_CHANGED')
    return merged


def reject_imported_default_log(expanded):
    """An import must not introduce a second default logger declaration."""
    for path, data in expanded.items():
        if path == Path('Caddyfile'):
            continue
        for line in data.decode('utf8').split('\n'):
            if tokens(line)[:2] == ['log', 'default']:
                raise Stop('LOG_BLOCK_AMBIGUOUS')


def import_targets(root, source, operand, mapping):
    """Reject scope before directory listing/opening; only conf.d/*.caddy imports qualify."""
    if not re.fullmatch(r'[/A-Za-z0-9_.?*\-]+', operand) or '..' in Path(operand).parts:
        raise Stop('IMPORT_UNAPPROVED')
    logical = Path(operand) if operand.startswith('/') else relative_to_logical(source, mapping).parent / operand
    path = logical_to_relative(logical, mapping)
    if path.parent != IMPORT_PREFIX or not path.name.endswith('.caddy'):
        raise Stop('IMPORT_UNAPPROVED')
    if path.name.count('*') > 1 or path.name.count('?') > 1:
        raise Stop('IMPORT_UNAPPROVED')
    if '*' not in path.name and '?' not in path.name:
        return [path]
    import fnmatch
    descriptor = open_directory(root, path.parts[:-1])
    try:
        names = os.listdir(descriptor)
        if len(names) > 1024:
            raise Stop('SOURCE_LIMIT_OR_TYPE')
        matches = sorted(n for n in names if fnmatch.fnmatchcase(n, path.name)
                         and not (path.name.startswith('*') and n.startswith('.')))
    finally:
        os.close(descriptor)
    if not matches or len(matches) > MAX_FILES:
        raise Stop('IMPORT_UNAPPROVED')
    return [path.parent / n for n in matches]


def closure(snapshots, root, config, mapping, lookup):
    """Resolve all referenced values before imports; retain finite exact expanded snapshot."""
    values, expanded, active, visited, patterns = {}, {}, set(), set(), []
    def visit(path):
        if path in active:
            raise Stop('IMPORT_CYCLE')
        if path in visited:
            return
        if path not in snapshots:
            # The only call site for added files follows the prefix check in import_targets.
            if path.parent != IMPORT_PREFIX or path.suffix != '.caddy':
                raise Stop('IMPORT_UNAPPROVED')
            if len(snapshots) >= MAX_FILES:
                raise Stop('SOURCE_LIMIT_OR_TYPE')
            snapshots[path] = read_source(root, path)
        if sum(len(d) for d in snapshots.values()) > MAX_BYTES:
            raise Stop('SOURCE_LIMIT_OR_TYPE')
        names = references(snapshots[path])
        if len(values.keys() | names) > MAX_NAMES:
            raise Stop('ENV_LIMIT')
        for name in sorted(names - values.keys()):
            values[name] = lookup(name)
        data = expand(snapshots[path], values)
        if any(marker in data for marker in (b'{$', b'{env.', b'{file.', b'{args', b'{block', b'\0')):
            raise Stop('RESOURCE_REFERENCE_UNSUPPORTED')
        try:
            text = data.decode('utf8')
        except UnicodeError:
            raise Stop('SYNTAX_UNSUPPORTED') from None
        if '\r' in text or any(c in text for c in ('\v', '\f', '\u0085', '\u2028', '\u2029')):
            raise Stop('SYNTAX_UNSUPPORTED')
        active.add(path)
        for line in text.split('\n'):
            parts = tokens(line)
            if parts and (parts[0].startswith('(') or parts[0].startswith('&')):
                raise Stop('SYNTAX_UNSUPPORTED')
            # Conservatively reject import tokens anywhere other than the line start.
            if 'import' in parts[1:]:
                raise Stop('SYNTAX_UNSUPPORTED')
            if parts and parts[0] == 'import':
                if len(parts) != 2:
                    raise Stop('SYNTAX_UNSUPPORTED')
                targets = import_targets(root, path, parts[1], mapping)
                patterns.append((path, parts[1], tuple(targets)))
                for target in targets:
                    visit(target)
        active.remove(path); visited.add(path); expanded[path] = data
    if logical_to_relative(config, mapping) != Path('Caddyfile'):
        raise Stop('MAPPING_UNKNOWN')
    visit(Path('Caddyfile'))
    if not {Path(FILES[label][0]) for label in BLOCKS} <= visited:
        raise Stop('TARGET_NOT_REACHABLE')
    if sum(len(d) for d in expanded.values()) > MAX_BYTES:
        raise Stop('SOURCE_LIMIT_OR_TYPE')
    return expanded, values, patterns


def preadapt_modules(expanded):
    """Reviewed no-external-read subset. Unknown directives/options STOP before adaptation."""
    directives = {'email', 'admin', 'auto_https', 'storage', 'root', 'log', 'output', 'format', 'level',
                  'roll_size', 'roll_keep', 'roll_keep_for', 'roll_uncompressed', 'roll_local_time',
                  'header', 'respond', 'reverse_proxy', 'handle', 'handle_path', 'route', 'redir',
                  'rewrite', 'uri', 'encode', 'import', 'method', 'path', 'host', 'not', 'protocol',
                  'request_body', 'max_size', 'transport', 'read_timeout', 'write_timeout', 'dial_timeout',
                  'response_header_timeout', 'header_up', 'header_down'}
    for data in expanded.values():
        depth, contexts = 0, []
        for line in data.decode().split('\n'):
            parts = tokens(line)
            if not parts:
                continue
            first = parts[0]
            if brace(first) in ('{', '}'):
                if len(parts) != 1:
                    raise Stop('MODULE_UNSUPPORTED')
            elif first.startswith('@'):
                if not (len(parts) == 2 and brace(parts[1]) == '{') and (len(parts) < 3 or parts[1] not in {'host', 'path', 'method', 'protocol'}):
                    raise Stop('MODULE_UNSUPPORTED')
            elif depth == 0 and brace(parts[-1]) == '{':
                if not re.fullmatch(r'[A-Za-z0-9.*:/,_\-]+', first):
                    raise Stop('MODULE_UNSUPPORTED')
            elif first not in directives:
                logger_option = bool(contexts and
                    ((contexts[-1] == 'log' and first in {'include', 'exclude', 'sampling'}) or
                     (contexts[-1] == 'sampling' and first in {'interval', 'first', 'thereafter'})))
                header_option = bool(contexts and contexts[-1] == 'header' and
                                     re.fullmatch(r'[+?\-]?[A-Za-z0-9-]+', first))
                if not logger_option and not header_option:
                    raise Stop('MODULE_UNSUPPORTED')
            if first == 'root':
                # root influences later filesystem modules; reject rather than assume inertness.
                raise Stop('MODULE_UNSUPPORTED')
            if first == 'storage' and parts[1:2] != ['file_system']:
                raise Stop('MODULE_UNSUPPORTED')
            if first == 'output' and parts[1:2] not in (['file'], ['stdout'], ['stderr'], ['discard']):
                raise Stop('MODULE_UNSUPPORTED')
            if first == 'format' and parts[1:2] not in (['json'], ['console']):
                raise Stop('MODULE_UNSUPPORTED')
            if first == 'encode' and any(p not in {'gzip', 'zstd'} for p in parts[1:]):
                raise Stop('MODULE_UNSUPPORTED')
            if first == 'admin' and parts[1:] != ['off']:
                raise Stop('MODULE_UNSUPPORTED')
            if first == 'transport' and (parts[1:] != ['http', '{'] or brace(parts[-1]) != '{'):
                raise Stop('MODULE_UNSUPPORTED')
            # Only unquoted standalone braces delimit blocks; quoted braces are data.
            for p in parts:
                if brace(p) == '{':
                    depth += 1; contexts.append(first)
                elif brace(p) == '}':
                    depth -= 1
                    if contexts:
                        contexts.pop()
            if depth < 0:
                raise Stop('SYNTAX_UNSUPPORTED')
        if depth:
            # Imported files must be independently balanced; spanning blocks are unsupported.
            raise Stop('SYNTAX_UNSUPPORTED')


def object_keys(value, allowed, required=()):
    """Strict schema gate: no unclassified JSON fields can pass to provisioning."""
    if not isinstance(value, dict) or set(value) - set(allowed) or set(required) - set(value):
        raise Stop('MODULE_RESOURCE')


def validate_global_log_filter(candidate):
    """The adapted default logger must contain exactly the reviewed filter."""
    try:
        encoder = candidate['logging']['logs']['default']['encoder']
    except (KeyError, TypeError):
        raise Stop('MODULE_RESOURCE') from None
    if encoder != DEFAULT_FILTER_ENCODER:
        raise Stop('MODULE_RESOURCE')


def strings(value):
    if not isinstance(value, list) or any(not isinstance(v, str) for v in value):
        raise Stop('MODULE_RESOURCE')


def string_map(value):
    if not isinstance(value, dict):
        raise Stop('MODULE_RESOURCE')
    for key, item in value.items():
        if not isinstance(key, str):
            raise Stop('MODULE_RESOURCE')
        strings(item)


def match_object(matcher):
    """Only core request matchers, recursively allowing the core not matcher."""
    object_keys(matcher, {'host', 'path', 'method', 'protocol', 'header', 'not'})
    for key, value in matcher.items():
        if key == 'not':
            if not isinstance(value, list):
                raise Stop('MODULE_RESOURCE')
            for nested in value:
                match_object(nested)
        elif key == 'header':
            string_map(value)
        else:
            strings(value)


def routes(items):
    if not isinstance(items, list):
        raise Stop('MODULE_RESOURCE')
    for route in items:
        object_keys(route, {'match', 'handle', 'terminal', 'group'})
        for matcher in route.get('match', []):
            match_object(matcher)
        for handler in route.get('handle', []):
            name = handler.get('handler') if isinstance(handler, dict) else None
            if name == 'subroute':
                object_keys(handler, {'handler', 'routes'}); routes(handler.get('routes', []))
            elif name == 'static_response':
                object_keys(handler, {'handler', 'body', 'status_code', 'headers', 'close', 'abort'})
                if 'headers' in handler:
                    string_map(handler['headers'])
            elif name == 'headers':
                object_keys(handler, {'handler', 'request', 'response'})
                for location in ('request', 'response'):
                    if location in handler:
                        object_keys(handler[location], {'set', 'add', 'delete', 'deferred'})
                        for key in ('set', 'add'):
                            if key in handler[location]:
                                string_map(handler[location][key])
                        if 'delete' in handler[location]:
                            strings(handler[location]['delete'])
            elif name == 'reverse_proxy':
                object_keys(handler, {'handler', 'upstreams', 'transport', 'headers'})
                if 'transport' in handler:
                    object_keys(handler['transport'], {'protocol', 'read_timeout', 'write_timeout', 'dial_timeout', 'response_header_timeout'})
                    if handler['transport'].get('protocol') != 'http':
                        raise Stop('MODULE_RESOURCE')
                if 'headers' in handler:
                    object_keys(handler['headers'], {'request', 'response'})
                    for location in handler['headers'].values():
                        object_keys(location, {'set', 'add', 'delete'})
                        for key, value in location.items():
                            strings(value) if key == 'delete' else string_map(value)
                for upstream in handler.get('upstreams', []):
                    object_keys(upstream, {'dial'}, {'dial'})
                    if not isinstance(upstream['dial'], str) or '/' in upstream['dial']:
                        raise Stop('MODULE_RESOURCE')
            elif name == 'encode':
                object_keys(handler, {'handler', 'encodings', 'prefer', 'minimum_length'})
                object_keys(handler.get('encodings', {}), {'gzip', 'zstd'})
                for encoding in handler.get('encodings', {}).values():
                    object_keys(encoding, {'level'})
                if 'prefer' in handler:
                    strings(handler['prefer'])
            elif name == 'request_body':
                object_keys(handler, {'handler', 'max_size'})
            elif name == 'rewrite':
                object_keys(handler, {'handler', 'uri', 'strip_path_prefix', 'strip_path_suffix'})
            else:
                raise Stop('MODULE_RESOURCE')


def isolated_test_copy(candidate):
    """Whitelist modules/resources, remap only log/storage destinations, prove exact reversal."""
    object_keys(candidate, {'admin', 'logging', 'apps', 'storage'})
    if 'admin' in candidate:
        object_keys(candidate['admin'], {'disabled'})
        if candidate['admin'].get('disabled') is not True:
            raise Stop('MODULE_RESOURCE')
    object_keys(candidate.get('apps', {}), {'http', 'tls'})
    http = candidate.get('apps', {}).get('http', {})
    object_keys(http, {'servers', 'http_port', 'https_port', 'grace_period'})
    if not isinstance(http.get('servers', {}), dict):
        raise Stop('MODULE_RESOURCE')
    for server in http.get('servers', {}).values():
        object_keys(server, {'listen', 'routes', 'logs', 'automatic_https', 'tls_connection_policies'})
        strings(server.get('listen', [])); routes(server.get('routes', []))
        if 'logs' in server:
            object_keys(server['logs'], {'logger_names', 'default_logger_name', 'skip_hosts', 'skip_unmapped_hosts'})
        if 'automatic_https' in server:
            object_keys(server['automatic_https'], {'disable', 'disable_redirects', 'disable_certificates', 'skip', 'skip_certificates'})
        for policy in server.get('tls_connection_policies', []):
            object_keys(policy, {'match', 'default_sni', 'protocol_min', 'protocol_max', 'cipher_suites', 'curves', 'alpn'})
            if 'match' in policy:
                object_keys(policy['match'], {'sni'}); strings(policy['match'].get('sni', []))
    tls = candidate.get('apps', {}).get('tls', {})
    object_keys(tls, {'automation', 'disable_ocsp_stapling', 'session_tickets'})
    if 'session_tickets' in tls:
        object_keys(tls['session_tickets'], {'disabled', 'rotation_interval', 'max_keys'})
    if 'automation' in tls:
        object_keys(tls['automation'], {'policies'})
        for policy in tls['automation'].get('policies', []):
            object_keys(policy, {'subjects', 'issuers'})
            strings(policy.get('subjects', []))
            for issuer in policy.get('issuers', []):
                object_keys(issuer, {'module', 'email', 'ca', 'test_ca', 'preferred_chains'})
                if issuer.get('module') != 'acme' or 'preferred_chains' in issuer:
                    raise Stop('MODULE_RESOURCE')
    logging = candidate.get('logging', {})
    object_keys(logging, {'logs'})
    if not isinstance(logging.get('logs', {}), dict):
        raise Stop('MODULE_RESOURCE')
    result, destinations, changes = copy.deepcopy(candidate), {}, []
    for name, logger in result.get('logging', {}).get('logs', {}).items():
        object_keys(logger, {'writer', 'encoder', 'level', 'include', 'exclude', 'sampling'})
        if 'sampling' in logger:
            object_keys(logger['sampling'], {'interval', 'first', 'thereafter'})
        if 'encoder' in logger:
            encoder = logger['encoder']
            if encoder.get('format') == 'filter':
                if name != 'default':
                    raise Stop('MODULE_RESOURCE')
                object_keys(encoder, {'format', 'fields'}, {'format', 'fields'})
                if encoder != DEFAULT_FILTER_ENCODER:
                    raise Stop('MODULE_RESOURCE')
            else:
                object_keys(encoder, {'format', 'time_format', 'time_key', 'level_key', 'name_key', 'caller_key', 'message_key', 'stacktrace_key', 'line_ending'})
                if encoder.get('format') not in ('json', 'console'):
                    raise Stop('MODULE_RESOURCE')
        writer = logger.get('writer', {})
        object_keys(writer, {'output', 'filename', 'mode', 'roll', 'roll_size_mb', 'roll_keep', 'roll_keep_days', 'roll_compress', 'roll_local_time'})
        if writer.get('output') not in (None, 'stderr', 'stdout', 'discard', 'file'):
            raise Stop('MODULE_RESOURCE')
        if writer.get('output') == 'file':
            original = writer.get('filename')
            if not isinstance(original, str) or not original or '{' in original:
                raise Stop('MODULE_RESOURCE')
            destinations.setdefault(original, '/scratch/log-' + str(len(destinations)) + '.log')
            writer['filename'] = destinations[original]; changes.append((name, original))
        elif 'filename' in writer:
            raise Stop('MODULE_RESOURCE')
    had_storage = 'storage' in result
    original_storage = copy.deepcopy(result.get('storage'))
    if had_storage:
        object_keys(result['storage'], {'module', 'root'}, {'module', 'root'})
        if result['storage']['module'] != 'file_system' or not isinstance(result['storage']['root'], str) or '{' in result['storage']['root']:
            raise Stop('MODULE_RESOURCE')
        result['storage']['root'] = '/scratch/storage'
    else:
        result['storage'] = {'module': 'file_system', 'root': '/scratch/storage'}
    # Placeholder references cannot introduce file/env providers during provisioning.
    encoded = json.dumps(candidate).encode()
    if any(marker in encoded for marker in (b'{env.', b'{file.', b'{$')):
        raise Stop('MODULE_RESOURCE')
    restored = copy.deepcopy(result)
    for name, original in changes:
        restored['logging']['logs'][name]['writer']['filename'] = original
    if had_storage:
        restored['storage'] = original_storage
    else:
        del restored['storage']
    if restored != candidate:
        raise Stop('POLICY_CHANGED')
    return result, len(changes), len(destinations), int(had_storage)


def main(patches, fragment):
    """One proposed remote operation. No reload, publication or active-container adaptation."""
    global CLIENT_ENV, DEADLINE
    DEADLINE = time.monotonic() + 480
    result = {'status': 'STOPPED', 'failureClass': None, 'sourceFiles': 0, 'referencedCount': 0,
              'presentCount': 0, 'adaptExit': None, 'validateExit': None, 'writersRemapped': 0,
              'storageExplicit': 0, 'nativePatchChecks': 0, 'commandVerified': False,
              'closureVerified': False, 'globalLogMerged': False, 'globalLogFilterVerified': False,
              'policyRestored': False, 'scratchRemoved': True,
              'knownGuards': {}, 'composeGuards': {name: guard for name, (_, guard) in COMPOSE_GUARDS.items()},
              'imageId': None, 'diskBefore': 0, 'diskAfter': 0}
    containers, stage = [], None
    try:
        # Only isolated Docker CLI configuration; do not read the host's client environment.
        with tempfile.TemporaryDirectory(prefix='caddy-referenced-', dir='/dev/shm') as temporary:
            stage = Path(temporary)
            client = stage / 'docker-client'; client.mkdir(); (client / 'config.json').write_text('{}')
            CLIENT_ENV = {'PATH': os.defpath, 'HOME': str(stage), 'DOCKER_CONFIG': str(client)}
            result['diskBefore'] = os.statvfs('/dev/shm').f_bavail * os.statvfs('/dev/shm').f_frsize
            # Budget is 128 MiB tmpfs staging plus each bounded ephemeral container.
            if result['diskBefore'] < 128 * 1024 * 1024:
                raise Stop('SCRATCH_BUDGET')
            image, config, mapping, command = provenance()
            result['imageId'], result['commandVerified'] = image, True
            originals, candidate = {}, {}
            for label, (path, expected) in FILES.items():
                data = read_source(ROOT, Path(path))
                if sha(data) != expected:
                    raise Stop('GUARD_CHANGED')
                result['knownGuards'][label] = expected
                originals[Path(path)] = data
                candidate[Path(path)] = staged_patch(label, data, patches[label]) if label in BLOCKS else data
            # The unexpanded private root source is only inspected in memory.
            # The same exact merge is repeated after reference expansion below.
            merge_default_log(originals[Path('Caddyfile')], fragment)
            source = stage / 'inputs'
            for path, data in originals.items():
                if path == Path('Caddyfile'):
                    # Keep the private unexpanded root source solely in RAM.
                    continue
                target = source / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
            for label in BLOCKS:
                path = Path(FILES[label][0])
                import difflib
                patch = ''.join(difflib.unified_diff(originals[path].decode().splitlines(True), candidate[path].decode().splitlines(True),
                    fromfile='a/' + str(path), tofile='b/' + str(path), n=3))
                target = stage / (label + '.patch'); target.write_text(patch)
                for args in (['git', 'apply', '--check', str(target)], ['git', 'apply', str(target)]):
                    bounded(args, 65536, timeout=10, cwd=source); result['nativePatchChecks'] += 1
                if (source / path).read_bytes() != candidate[path]:
                    raise Stop('POLICY_CHANGED')
            expanded, values, patterns = closure(candidate, ROOT, config, mapping, query_value)
            result.update(sourceFiles=len(expanded), referencedCount=len(values), presentCount=sum(v is not None for v in values.values()))
            reject_imported_default_log(expanded)
            preadapt_modules(expanded)
            expanded[Path('Caddyfile')] = merge_default_log(expanded[Path('Caddyfile')], fragment)
            result['globalLogMerged'] = True
            result['closureVerified'] = True
            # Resolved bytes live only in server tmpfs, never in argv, a Docker Env record or Mac.
            for path, data in expanded.items():
                target = source / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
            def isolated(operation, target):
                name = 'caddy-referenced-' + operation + '-' + uuid.uuid4().hex; containers.append(name)
                args = ['docker', 'run', '--rm', '--pull=never', '--name', name, '--network=none', '--read-only',
                        '--log-driver=none', '--memory=256m', '--memory-swap=256m', '--pids-limit=64', '--cpus=1',
                        '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=65534:65534',
                        '--tmpfs', '/data:rw,noexec,nosuid,size=16m,mode=1777', '--tmpfs', '/config:rw,noexec,nosuid,size=16m,mode=1777',
                        '--tmpfs', '/scratch:rw,noexec,nosuid,size=16m,mode=1777', '--entrypoint', '/usr/bin/caddy']
                if operation == 'adapt':
                    for prefix, destination in mapping:
                        host_path = source / prefix
                        if not host_path.exists():
                            raise Stop('MAPPING_UNKNOWN')
                        args.extend(['--mount', 'type=bind,source=' + str(host_path) + ',target=' + str(destination) + ',readonly'])
                else:
                    args.extend(['--mount', 'type=bind,source=' + str(stage / 'test.json') + ',target=/scratch/test.json,readonly'])
                args.extend([image, operation, '--config', str(target)])
                if operation == 'adapt':
                    args.extend(['--adapter', 'caddyfile'])
                remaining = min(60, DEADLINE - time.monotonic())
                if remaining <= 0:
                    raise Stop('CAPTURE_LIMIT_OR_TIMEOUT')
                return capture_process(args, timeout=remaining, limit=MAX_BYTES, env=CLIENT_ENV)
            adapted = isolated('adapt', config); result['adaptExit'] = adapted.returncode
            if adapted.returncode:
                raise Stop('ADAPT_FAILED')
            compiled = json.loads(adapted.stdout)
            validate_global_log_filter(compiled)
            test, result['writersRemapped'], _, result['storageExplicit'] = isolated_test_copy(compiled)
            result['globalLogFilterVerified'] = True
            result['policyRestored'] = True
            (stage / 'test.json').write_text(json.dumps(test, separators=(',', ':')))
            validated = isolated('validate', Path('/scratch/test.json')); result['validateExit'] = validated.returncode
            if validated.returncode:
                raise Stop('VALIDATE_FAILED')
            # Requery only the same selected names; never inventory the environment at drift check.
            if any(query_value(name) != value for name, value in values.items()):
                raise Stop('GUARD_CHANGED')
            for path, data in candidate.items():
                original = originals.get(path, data)
                if read_source(ROOT, path) != original:
                    raise Stop('GUARD_CHANGED')
            for path, operand, targets in patterns:
                if tuple(import_targets(ROOT, path, operand, mapping)) != targets:
                    raise Stop('GUARD_CHANGED')
            if provenance() != (image, config, mapping, command):
                raise Stop('GUARD_CHANGED')
            for path, expected in COMPOSE_GUARDS.values():
                read_guard(path, expected)
            result['status'] = 'VALIDATED_RESOURCE_TEST_COPY_NOT_LITERAL_PRODUCTION'
    except Stop as error:
        result['failureClass'] = str(error)
    except Exception:
        result['failureClass'] = 'OPERATION_ERROR'
    finally:
        DEADLINE = None  # Cleanup has its own bounded budget after operation timeout.
        clean = True
        for name in containers:
            try:
                bounded(['docker', 'rm', '--force', name], 65536, timeout=10)
            except Stop:
                # --rm may already have removed it; only a fresh absence check proves cleanup.
                pass
            try:
                if bounded(['docker', 'ps', '--all', '--filter', 'name=^/' + name + '$', '--format', '{{.Names}}'], 4096):
                    clean = False
            except Exception:
                clean = False
        result['scratchRemoved'] = clean and (stage is None or not stage.exists())
        result['diskAfter'] = os.statvfs('/dev/shm').f_bavail * os.statvfs('/dev/shm').f_frsize
        if not result['scratchRemoved']:
            result.update(status='STOPPED', failureClass='CLEANUP_UNCONFIRMED')
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main(PATCH_INPUTS, LOG_FRAGMENT)
