"""Appended to the sealed reader in remote RAM. Only finite classes leave RAM.

The reader's __name__ is set to caddy_base while concatenating these modules,
so its old main (which merges a logger and patches sites) never runs.
"""

HOSTS = {'vega': 'admin.vegacms.com', 'lumbre': 'admin.lumbre.pro',
         'fodaveg': 'admin.fodaveg.net'}
LEVELS = {'DEBUG': 0, 'INFO': 1, 'WARN': 2, 'ERROR': 3, 'DPANIC': 4, 'PANIC': 5, 'FATAL': 6}
KNOWN_URI = {'filter': 'regexp', 'regexp': '(?s)[?].*', 'value': '?REDACTED'}
KNOWN_REFERER = {'filter': 'delete'}
MAX_LOGGERS = 128


def original_log_declarations(data):
    """Locate only global log headers; native JSON decides their effective names."""
    declarations, depth, global_seen = [], 0, False
    for line in data.decode('utf8').split('\n'):
        parts = tokens(line)
        if not parts:
            continue
        if depth == 0 and not global_seen and len(parts) == 1 and brace(parts[0]) == '{':
            global_seen = True
        if global_seen and depth == 1 and parts[0] == 'log':
            if brace(parts[-1]) != '{' or len(parts) not in (2, 3):
                declarations.append(('MIXED', False, ''))
            else:
                name = None if len(parts) == 2 else parts[1]
                if name is None:
                    kind = 'OMITTED'
                elif '{$' not in name:
                    kind = 'LITERAL'
                elif str(name).startswith('{$') and str(name).endswith('}'):
                    kind = 'ENVREF'
                else:
                    kind = 'MIXED'
                declarations.append((kind, bool(name.quoted) if name is not None else False,
                                     str(name) if name is not None else 'default'))
        for part in parts:
            if brace(part) == '{':
                depth += 1
            elif brace(part) == '}':
                depth -= 1
            if depth < 0:
                raise Stop('SYNTAX_UNSUPPORTED')
    if depth:
        raise Stop('SYNTAX_UNSUPPORTED')
    return declarations


def declarations_summary(original, expanded, logs):
    raw = original_log_declarations(original)
    effective = original_log_declarations(expanded)
    histogram = {}
    mapped = len(raw) == len(effective)
    effective_names = set()
    for (kind, quoted, _), (_, _, actual) in zip(raw, effective):
        classification = 'DEFAULT' if actual == 'default' else 'OTHER'
        if not actual or actual not in logs or actual in effective_names:
            classification = 'INVALID'
            mapped = False
        effective_names.add(actual)
        key = kind + '/' + classification + '/' + ('QUOTED' if quoted else 'BARE')
        histogram[key] = histogram.get(key, 0) + 1
    if len(raw) != len(effective):
        mapped = False
    if 'default' in effective_names:
        origin = 'DECLARED'
    elif 'default' in logs:
        origin = 'ADAPTER_GENERATED'
    elif logs:
        origin = 'RUNTIME_IMPLICIT'
    else:
        origin = 'UNKNOWN'
    return histogram, origin, mapped


def writer_class(writer):
    if writer is None or writer == {}:
        return 'OMITTED_STDERR'
    if not isinstance(writer, dict):
        return 'OTHER'
    output = writer.get('output')
    return {None: 'OMITTED_STDERR', 'stderr': 'STDERR', 'stdout': 'STDOUT',
            'file': 'FILE', 'net': 'NET', 'discard': 'DISCARD'}.get(output, 'OTHER')


def encoder_class(encoder):
    if encoder is None:
        return 'OMITTED'
    if isinstance(encoder, dict) and encoder.get('format') == 'filter':
        return 'FILTER'
    return 'OTHER'


def destination_summary(logs):
    counts = {}
    for name, logger in logs.items():
        if not isinstance(logger, dict):
            logger = {'writer': {'output': 'unknown'}, 'encoder': {'format': 'unknown'}, 'core': True}
        group = 'DEFAULT' if name == 'default' else 'NAMED'
        key = (group, writer_class(logger.get('writer')), encoder_class(logger.get('encoder')),
               'core' in logger or 'cores' in logger, 'sampling' in logger)
        counts[key] = counts.get(key, 0) + 1
    return [{'class': group, 'writer': writer, 'encoder': encoder,
             'corePresent': core, 'samplingPresent': sampling, 'count': count}
            for (group, writer, encoder, core, sampling), count in sorted(counts.items())]


def namespace_matches(prefix, namespace):
    return namespace == prefix or namespace.startswith(prefix + '.')


def logger_route(logger, namespace, event_level):
    if not isinstance(logger, dict) or set(logger) - {'writer', 'encoder', 'level', 'include',
                                                      'exclude', 'sampling'}:
        return 'UNKNOWN'
    if 'sampling' in logger:
        return 'UNKNOWN'
    include, exclude = logger.get('include', []), logger.get('exclude', [])
    if not isinstance(include, list) or not isinstance(exclude, list) or any(
            not isinstance(item, str) for item in include + exclude):
        return 'UNKNOWN'
    if include and not any(namespace_matches(p, namespace) for p in include):
        return 'DENY'
    if any(namespace_matches(p, namespace) for p in exclude):
        return 'DENY'
    level = logger.get('level', 'INFO')
    if not isinstance(level, str) or level.upper() not in LEVELS:
        return 'UNKNOWN'
    return 'LEVEL_DISABLED' if LEVELS[level.upper()] > LEVELS[event_level] else 'ALLOW'


def event_routes(logs, namespace, level):
    items = list(logs.items())
    routes = [logger_route(logger, namespace, level) for _, logger in items]
    if not routes:
        return 'UNKNOWN', []
    if 'UNKNOWN' in routes:
        return 'UNKNOWN', []
    recipients = [name for (name, _), route in zip(items, routes) if route == 'ALLOW']
    if recipients:
        return 'ALLOW', recipients
    if 'LEVEL_DISABLED' in routes:
        return 'LEVEL_DISABLED', []
    return 'DENY', []


def mapped_names(settings, host):
    mapping = settings.get('logger_names', {})
    if not isinstance(mapping, dict):
        return None, False
    parts = host.split('.')
    candidates = [host]
    wildcard = parts.copy()
    for index, label in enumerate(wildcard):
        if label:
            wildcard[index] = '*'
            candidates.append('.'.join(wildcard))
    for candidate in candidates:
        if candidate in mapping:
            names = mapping[candidate]
            if isinstance(names, str):
                names = [names]
            if not isinstance(names, list) or any(not isinstance(n, str) for n in names):
                return None, True
            return names, True
    default = settings.get('default_logger_name', '')
    if not isinstance(default, str):
        return None, False
    return [default], False


def mapped_routes(logs, prefix, names, level):
    if names is None:
        return 'UNKNOWN', []
    if not names:
        return 'NOT_EMITTED', []
    results = [event_routes(logs, prefix + ('.' + name if name else ''), level) for name in names]
    if any(route == 'UNKNOWN' for route, _ in results):
        return 'UNKNOWN', []
    recipients = sorted(set(name for _, targets in results for name in targets))
    if recipients:
        return 'ALLOW', recipients
    if any(route == 'LEVEL_DISABLED' for route, _ in results):
        return 'LEVEL_DISABLED', []
    return 'DENY', []


def filter_classes(encoder):
    if encoder is None:
        return 'ABSENT', 'ABSENT', False
    if not isinstance(encoder, dict):
        return 'UNKNOWN', 'OTHER', True
    if encoder.get('format') != 'filter':
        return 'ABSENT', 'ABSENT', False
    fields = encoder.get('fields')
    if not isinstance(fields, dict):
        return 'UNKNOWN', 'OTHER', True
    uri = fields.get('request>uri')
    referer = fields.get('request>headers>Referer')
    uri_class = 'KNOWN_COVERED' if uri == KNOWN_URI else ('ABSENT' if uri is None else 'UNKNOWN')
    referer_class = 'DELETE' if referer == KNOWN_REFERER else ('ABSENT' if referer is None else 'OTHER')
    # A filter may wrap another encoder. Any unrecognised filters can change
    # fields after the known rule, so they prevent a coverage claim.
    foreign = set(fields) - {'request>uri', 'request>headers>Referer'} or set(encoder) - {'format', 'fields', 'wrap'}
    wrapped = 'wrap' in encoder
    if foreign or wrapped and not isinstance(encoder['wrap'], dict):
        uri_class = 'UNKNOWN'
    return uri_class, referer_class, bool(foreign or wrapped)


def coverage_for(logs, recipients, route):
    if route != 'ALLOW':
        return {'uri': 'ABSENT' if route in ('DENY', 'LEVEL_DISABLED', 'NOT_EMITTED') else 'UNKNOWN',
                'referer': 'ABSENT' if route in ('DENY', 'LEVEL_DISABLED', 'NOT_EMITTED') else 'OTHER',
                'wrapOrForeignFilters': False}
    classes = [filter_classes(logs[name].get('encoder')) for name in recipients]
    uri_set = {item[0] for item in classes}
    uri = next(iter(uri_set)) if len(uri_set) == 1 else 'CONFLICT'
    referers = {item[1] for item in classes}
    referer = next(iter(referers)) if len(referers) == 1 else 'OTHER'
    return {'uri': uri, 'referer': referer,
            'wrapOrForeignFilters': any(item[2] for item in classes)}


def server_for_host(candidate, host):
    servers = candidate.get('apps', {}).get('http', {}).get('servers', {})
    if not isinstance(servers, dict) or len(servers) > 64:
        return None
    matches = []
    def contains_host(routes):
        if not isinstance(routes, list):
            return False
        for route in routes:
            if not isinstance(route, dict):
                continue
            if any(isinstance(match, dict) and isinstance(match.get('host'), list) and host in match['host']
                   for match in route.get('match', [])):
                return True
            for handler in route.get('handle', []):
                if isinstance(handler, dict) and handler.get('handler') == 'subroute' and contains_host(handler.get('routes')):
                    return True
        return False
    for server in servers.values():
        if not isinstance(server, dict):
            return None
        if contains_host(server.get('routes', [])):
            matches.append(server)
    return matches[0] if len(matches) == 1 else None


def host_summary(candidate, host, logs, extra_unknown):
    server = server_for_host(candidate, host)
    result = {'accessEffective': 'UNKNOWN', 'hostMapped': False, 'hostSkipped': False,
              'logNameOverride': False, 'accessLoggerNamesOverride': False, 'trace': False,
              'channels': {}}
    if server is None:
        for channel in ('ERROR', 'ACCESS', 'REVERSEPROXY_DEBUG', 'TRACE'):
            result['channels'][channel] = {'route': 'UNKNOWN', **coverage_for(logs, [], 'UNKNOWN')}
        return result
    def route_mentions(value, marker):
        if isinstance(value, dict):
            return any(marker in str(key) or route_mentions(item, marker) for key, item in value.items())
        if isinstance(value, list):
            return any(route_mentions(item, marker) for item in value)
        return isinstance(value, str) and marker in value
    result['logNameOverride'] = route_mentions(server.get('routes', []), 'log_name')
    result['accessLoggerNamesOverride'] = route_mentions(server.get('routes', []), 'access_logger_names')
    if 'logs' not in server:
        access_absent = True
    else:
        access_absent = False
    settings = server.get('logs', {})
    if not isinstance(settings, dict) or set(settings) - {'logger_names', 'default_logger_name',
                                                          'skip_hosts', 'skip_unmapped_hosts',
                                                          'should_log_credentials', 'trace'}:
        settings = None
    if settings is None:
        names, skipped = None, False
    else:
        result['trace'] = settings.get('trace') is True
        if settings.get('trace') not in (None, False, True) or settings.get('should_log_credentials') is True:
            extra_unknown = True
        skipped_list = settings.get('skip_hosts', [])
        if not isinstance(skipped_list, list) or any(not isinstance(item, str) for item in skipped_list):
            skipped_list = []
            extra_unknown = True
        names, mapped = mapped_names(settings, host)
        result['hostMapped'] = mapped
        result['hostSkipped'] = host in skipped_list
        # Caddy's shouldLogRequest returns immediately for a mapped host;
        # skip_hosts is consulted only for hosts without a logger mapping.
        skipped = not mapped and (result['hostSkipped'] or bool(settings.get('skip_unmapped_hosts')))
    if access_absent:
        access_route, access_recips = 'NOT_EMITTED', []
        result['accessEffective'] = 'DISABLED'
    elif (names is not None and not extra_unknown
          and not result['logNameOverride'] and not result['accessLoggerNamesOverride']):
        access_route, access_recips = mapped_routes(logs, 'http.log.access', names, 'INFO')
        result['accessEffective'] = 'DISABLED' if skipped else ('ENABLED' if access_route == 'ALLOW' else 'UNKNOWN')
        if skipped:
            access_route, access_recips = 'NOT_EMITTED', []
    else:
        access_route, access_recips = 'UNKNOWN', []
    if access_absent:
        route, recipients = event_routes(logs, 'http.log.error', 'ERROR')
    elif result['logNameOverride'] or result['accessLoggerNamesOverride']:
        route, recipients = 'UNKNOWN', []
    else:
        route, recipients = mapped_routes(logs, 'http.log.error', names, 'ERROR')
    debug_route, debug_recips = event_routes(logs, 'http.handlers.reverse_proxy', 'DEBUG')
    trace_route, trace_recips = ('UNKNOWN', []) if result['trace'] else ('NOT_EMITTED', [])
    for channel, state, targets in (('ERROR', route, recipients), ('ACCESS', access_route, access_recips),
                                    ('REVERSEPROXY_DEBUG', debug_route, debug_recips),
                                    ('TRACE', trace_route, trace_recips)):
        if extra_unknown:
            state, targets = 'UNKNOWN', []
        result['channels'][channel] = {'route': state, **coverage_for(logs, targets, state)}
    return result


def native_projection(candidate, original_root, expanded_root):
    if not isinstance(candidate, dict):
        raise Stop('ADAPTED_SCHEMA_UNKNOWN')
    logging = candidate.get('logging', {})
    logs = logging.get('logs', {}) if isinstance(logging, dict) else {}
    schema_unknown = not isinstance(logs, dict)
    if schema_unknown:
        logs = {}
    if len(logs) > MAX_LOGGERS:
        raise Stop('ADAPTED_SCHEMA_UNKNOWN')
    logs = {name: logger for name, logger in logs.items() if isinstance(name, str)}
    histogram, origin, mapped = declarations_summary(original_root, expanded_root, logs)
    extra_unknown = (schema_unknown or not mapped or not isinstance(logging, dict) or
                     bool(set(logging) - {'logs'}) or bool(set(candidate) - {'apps', 'logging', 'storage', 'admin'}))
    return {'declarations': histogram, 'defaultOrigin': origin, 'mappingUnambiguous': mapped,
            'destinations': destination_summary(logs),
            'extraLoggingUnknown': extra_unknown,
            'hosts': {label: host_summary(candidate, host, logs, extra_unknown)
                      for label, host in HOSTS.items()}}


def native_main():
    global CLIENT_ENV, DEADLINE
    DEADLINE = time.monotonic() + 480
    result = {'status': 'STOPPED', 'failureClass': None, 'sourceGuards': False,
              'composeGuards': False, 'commandVerified': False, 'closureVerified': False,
              'imageVerified': False, 'sourceFiles': 0, 'referencedCount': 0,
              'presentCount': 0, 'adaptExit': None, 'scratchRemoved': False,
              'analysis': None}
    stage, containers = None, []
    try:
        with tempfile.TemporaryDirectory(prefix='caddy-native-routing-', dir='/dev/shm') as temp:
            stage = Path(temp)
            client = stage / 'docker-client'; client.mkdir(); (client / 'config.json').write_text('{}')
            CLIENT_ENV = {'PATH': os.defpath, 'HOME': str(stage), 'DOCKER_CONFIG': str(client)}
            if os.statvfs('/dev/shm').f_bavail * os.statvfs('/dev/shm').f_frsize < 128 * 1024 * 1024:
                raise Stop('SCRATCH_BUDGET')
            image, config, mapping, command = provenance()
            result.update(composeGuards=True, imageVerified=True, commandVerified=True)
            originals = {}
            for label, (path, expected) in FILES.items():
                data = read_source(ROOT, Path(path))
                if sha(data) != expected:
                    raise Stop('GUARD_CHANGED')
                originals[Path(path)] = data
            result['sourceGuards'] = True
            snapshots = originals.copy()
            expanded, values, patterns = closure(snapshots, ROOT, config, mapping, query_value)
            preadapt_modules(expanded)
            result.update(closureVerified=True, sourceFiles=len(expanded),
                          referencedCount=len(values), presentCount=sum(v is not None for v in values.values()))
            source = stage / 'inputs'
            for path, data in expanded.items():
                target = source / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
            name = 'caddy-native-routing-' + uuid.uuid4().hex; containers.append(name)
            args = ['docker', 'run', '--rm', '--pull=never', '--name', name, '--network=none', '--read-only',
                    '--log-driver=none', '--memory=256m', '--memory-swap=256m', '--pids-limit=64', '--cpus=1',
                    '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=65534:65534',
                    '--tmpfs', '/data:rw,noexec,nosuid,size=16m,mode=1777',
                    '--tmpfs', '/config:rw,noexec,nosuid,size=16m,mode=1777',
                    '--tmpfs', '/scratch:rw,noexec,nosuid,size=16m,mode=1777',
                    '--entrypoint', '/usr/bin/caddy']
            for prefix, destination in mapping:
                host_path = source / prefix
                if not host_path.exists():
                    raise Stop('MAPPING_UNKNOWN')
                args.extend(['--mount', 'type=bind,source=' + str(host_path) + ',target=' + str(destination) + ',readonly'])
            args.extend([image, 'adapt', '--config', str(config), '--adapter', 'caddyfile'])
            adapted = capture_process(args, timeout=min(60, DEADLINE - time.monotonic()),
                                      limit=MAX_BYTES, env=CLIENT_ENV)
            result['adaptExit'] = adapted.returncode
            if adapted.returncode:
                raise Stop('ADAPT_FAILED')
            compiled = json.loads(adapted.stdout)
            result['analysis'] = native_projection(compiled, originals[Path('Caddyfile')], expanded[Path('Caddyfile')])
            if any(query_value(name) != value for name, value in values.items()):
                raise Stop('GUARD_CHANGED')
            if any(read_source(ROOT, path) != data for path, data in snapshots.items()):
                raise Stop('GUARD_CHANGED')
            if any(tuple(import_targets(ROOT, path, operand, mapping)) != targets for path, operand, targets in patterns):
                raise Stop('GUARD_CHANGED')
            if provenance() != (image, config, mapping, command):
                raise Stop('GUARD_CHANGED')
            result['status'] = 'DIAGNOSED'
    except Stop as error:
        result['failureClass'] = str(error)
    except Exception:
        result['failureClass'] = 'OPERATION_ERROR'
    finally:
        DEADLINE = None
        clean = True
        for name in containers:
            try:
                bounded(['docker', 'rm', '--force', name], 65536, timeout=10)
            except Stop:
                pass
            try:
                if bounded(['docker', 'ps', '--all', '--filter', 'name=^/' + name + '$', '--format', '{{.Names}}'], 4096):
                    clean = False
            except Exception:
                clean = False
        result['scratchRemoved'] = clean and (stage is None or not stage.exists())
        if not result['scratchRemoved']:
            result.update(status='STOPPED', failureClass='CLEANUP_UNCONFIRMED')
        # No config, stderr, source or private identifier is emitted.
        print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    native_main()
