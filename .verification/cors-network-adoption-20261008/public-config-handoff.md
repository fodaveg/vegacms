# Public Vega config classifier — candidate, 8 Oct 2026

The prior CORS/network projection returned `UNKNOWN` for all three public
`/vega.config.json` requests because its narrow classifier did not distinguish
an SPA HTML fallback from valid JSON. The Vega runtime's
`fetchVegaConfig()` returns `null` on a non-OK HTTP response or JSON parse
failure. `resolveBackendUrl()` then selects `window.location.origin` unless a
valid browser-local override exists. An HTTP 200 HTML fallback therefore
selects same-origin for a default browser, but this probe does not inspect
browser-local overrides or authenticate a user.

`public_config_probe.py` performs one unauthenticated GET on that exact path
for each of the three known admin origins, without proxy or redirects, and
reads at most 8193 bytes. It emits only HTTP status, an allowlisted MIME
class, an allowlisted JSON/parse shape, and a known backend class. It never
exports body, raw header, unknown URL, URL hash, credentials, or response
error text. An unknown object `backendUrl` stays `UNDETERMINED` rather than
assuming it is same-origin. `run_public_config_probe.py` pins the source SHA,
validates a closed output schema, discards remote stderr and keeps any
unvalidated stdout in local RAM. It writes a new JSON receipt mode 0600 only
after validation. Both scripts are candidates for independent review; only
the release owner may run the SSH wrapper.

HTTP 2xx responses are parsed, matching `Response.ok`; redirects that this
probe refuses to follow remain `UNDETERMINED` because browser `fetch` may
follow them. This prevents a false same-origin conclusion for a valid 206
config or a 302/307.

Source SHA-256: `577868ffde2a6bdb8a504bb397b7538fad9150d58c091f87f37cd54e65530915`.
Wrapper SHA-256: `06bc69be767b456486f3fbaa05d9f7a0b93e685d34ebf91c9c7ffad3b0610ad4`.

After review, the release owner can execute once with a new output name:

```sh
python3 -B .verification/cors-network-adoption-20261008/run_public_config_probe.py \
  --execute \
  --script-sha256 577868ffde2a6bdb8a504bb397b7538fad9150d58c091f87f37cd54e65530915 \
  --out .verification/cors-network-adoption-20261008/public-config-projection-20261008.json
```

Local synthetic checks covered 200 HTML parse failure, 404, 206 JSON with
another known backend, 302/307 redirects, empty JSON object, unknown backend,
JSON array, a private marker in the response, and a private field injected
into the projected schema.
No live HTTP result is attributed here.
