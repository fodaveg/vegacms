"""Project only public module classes and token rules from one Caddy logger.

Input is exclusively the active logging.logs.default subtree in remote RAM.
This projection reports configuration, never effective absence of a token.
"""


WRITERS = {"stdout": "STDOUT", "stderr": "STDERR", "file": "FILE",
           "net": "NET", "discard": "DISCARD"}
ENCODERS = {"json": "JSON", "console": "CONSOLE", "filter": "FILTER"}


def uri_rule(rule):
    """Classify the exact token key without reading replacements or patterns."""
    if rule is None:
        return "NOT_CONFIGURED"
    if not isinstance(rule, dict):
        return "UNRESOLVED"
    kind = rule.get("filter")
    if kind == "delete":
        return "DELETE_URI_FIELD"
    if kind != "query":
        return "OTHER_URI_FILTER_UNRESOLVED"
    actions = rule.get("actions")
    if not isinstance(actions, list) or len(actions) > 64 or \
            any(not isinstance(action, dict) for action in actions):
        return "UNRESOLVED"
    selected = [action for action in actions if action.get("key") == "token"]
    if not selected:
        return "NO_LITERAL_TOKEN_ACTION"
    if all(action.get("type") == "delete" and set(action) == {"type", "key"}
           for action in selected):
        return "DELETE_LITERAL_TOKEN_QUERY"
    return "OTHER_TOKEN_ACTION_UNRESOLVED"


def referer_rule(rule):
    if rule is None:
        return "NOT_CONFIGURED"
    return "DELETE_REFERER_FIELD" if isinstance(rule, dict) and rule.get("filter") == "delete" else \
        "OTHER_REFERER_FILTER_UNRESOLVED"


def project_default(logger):
    """Never export raw keys, values, modules, paths, namespaces or errors."""
    if not isinstance(logger, dict):
        raise ValueError("DEFAULT_SHAPE_UNRESOLVED")
    writer = logger.get("writer")
    writer_type = "OMITTED_EFFECTIVE_DEFAULT_UNRESOLVED" if writer is None else \
        WRITERS.get(writer.get("output"), "OTHER_MODULE_UNRESOLVED") if isinstance(writer, dict) else \
        "OTHER_MODULE_UNRESOLVED"
    encoder = logger.get("encoder")
    chain, rules = [], []
    while encoder is not None:
        if len(chain) >= 4 or not isinstance(encoder, dict):
            raise ValueError("ENCODER_SHAPE_UNRESOLVED")
        kind = ENCODERS.get(encoder.get("format"), "OTHER_MODULE_UNRESOLVED")
        chain.append(kind)
        if kind != "FILTER":
            break
        fields = encoder.get("fields")
        if not isinstance(fields, dict) or len(fields) > 128:
            raise ValueError("FILTER_SHAPE_UNRESOLVED")
        rules.append({"uriToken": uri_rule(fields.get("request>uri")),
                      "referer": referer_rule(fields.get("request>headers>Referer"))})
        encoder = encoder.get("wrap")
    return {"writerType": writer_type,
            "encoderTypes": chain or ["OMITTED_EFFECTIVE_DEFAULT_UNRESOLVED"],
            "tokenFilterRules": rules,
            "effectiveTokenSafetyProved": False,
            "customProducerMessageSafetyProved": False,
            "namedLoggerCoverageProved": False}
