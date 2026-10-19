# Original native routing diagnostic

The consumed rawquote candidate stopped at `LOG_BLOCK_AMBIGUOUS` before
closure/adaptation. That stop says nothing about the actual logging routes.
This independent candidate reads the same pinned four Caddy sources and four
Compose guards, resolves only referenced environment names one by one, and
runs `caddy adapt` on the **original** expanded Caddyfile and its bounded
import closure. It neither merges a global `log default` nor applies any site
patches. Nothing is reloaded or written to the active Caddy container.

The remote module is appended to the byte-identical sealed reader
`base_remote_validate.py` (SHA-256
`b9a4cc3ef38919409348509d0b6af8312655a795a3ec1caf0ffe4372cf032b6e`).
The reader's old main is suppressed by a private module name. Its guarded
source, Compose, image, process command, import closure, individual value
queries, lexical subset, module precheck, bounded capture and drift checks
are reused. Adaptation uses the same OCI image in a resource-limited,
network-disabled container with read-only imported sources in remote tmpfs.

Only enumerated classes leave remote RAM. The result covers all three fixed
public hosts and ERROR, ACCESS, REVERSEPROXY_DEBUG and TRACE. Unknown module
or routing semantics are projected as `UNKNOWN` after native adaptation when
possible. `DIAGNOSED` means the original adapted and the finite classification
was produced; it does **not** mean privacy coverage or a corrected policy.
Unknown coverage blocks any safe-to-apply conclusion. A source/module guard
failure before adaptation remains a `STOPPED` class.

The declaration histogram exposes only source-name kind, effective-name
class and quote class. Destinations expose counts by default/named, writer,
encoder, core and sampling classes. The wrapper rejects arbitrary outbound
fields or strings. No logger identifiers, environment names or values,
configuration bytes, JSON config, offsets or stderr are exported.

Limit: route classification is conservative. It does not certify what an
unprovisioned runtime logger would emit. The route for a host without one
unambiguous HTTP server is `UNKNOWN`; unknown Caddy logging fields and filter
wrappers prevent a coverage claim. A runtime trace handler is classified
`NOT_EMITTED` only under the bounded source/module subset that excludes a
`trace` directive; native configuration requiring another module stops.
