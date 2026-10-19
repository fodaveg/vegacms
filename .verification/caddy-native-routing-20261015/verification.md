# Offline verification

Candidate worktree: `codex/network-durable-20261009`, base HEAD
`b00186ce5587fcc7323aefdd9d3cdcbfea281750` before this addition.

Command: `python3 -B .verification/caddy-native-routing-20261015/probe.py`

Result: 11 tests OK, exit 0. Cases cover adapter-generated default with
named exclusion, environment and raw-quoted declaration classification,
host mapping overriding `skip_hosts`, ERROR suffix routing by mapped logger name,
wildcard specificity, reverse-proxy DEBUG,
unknown logging core and arbitrary regex, absent access server logging,
finite outbound rejection, no-approval zero connection, and an early
controlled transport throw preserving its finite class without leaking the
exception text. Local `run_once.py` without approval also stops before SSH.

No SSH, Docker, remote Caddy, product build or live configuration read was
performed by this worktree. `nativeadapt` and logger routing against the
pinned production bytes are pending root-only execution. The resulting JSON
will be a diagnostic, not native runtime validation or device QA.
