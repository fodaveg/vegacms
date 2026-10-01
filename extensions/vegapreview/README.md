# Vega preview-token extension for PocketBase

Reference Go implementation of the optional endpoint advertised as
`preview.apiBasePath` in `docs/PROJECT-CONTRACT-v1.md`. It is the server half
used by Vega's `PreviewPanel`: an authenticated editor asks for one saved
record and receives a short-lived URL to the site's on-demand preview route.
When the optional request field `draft` is present, the response instead adds
an encrypted `postToken` that Vega submits to that same route by `POST`; that
path additionally requires the editor to be allowed to update the record (see
[Security invariants](#security-invariants)).

Requires PocketBase **0.39.7 or newer** and Go 1.26 or newer.

## Integrate it

```go
package main

import (
	"log"
	"os"
	"time"

	"github.com/fodaveg/vegacms/extensions/vegapreview"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func main() {
	app := pocketbase.New()

	preview, err := vegapreview.New(vegapreview.Config{
		RoutePrefix:       "/api/vega-preview",
		SiteOrigin:        "https://example.com",
		PreviewPath:       "/preview",
		SigningSecret:     os.Getenv("VEGA_PREVIEW_SECRET"),
		AuthCollections:   []string{"vega_editors"},
		RecordCollections: []string{"pages"},
		TokenTTL:          5 * time.Minute,
		MaxDraftBytes:     256 * 1024,
	})
	if err != nil {
		log.Fatal(err)
	}

	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		preview.RegisterRoutes(event)
		return event.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
```

> [!IMPORTANT]
> **Breaking configuration change:** `AuthCollections` is required. `New`
> returns an error for a nil or empty list, blank entries, surrounding
> whitespace, and `_superusers` in any letter case. Before upgrading, create
> and seed a dedicated editor auth collection such as `vega_editors`, point
> the deployment discovery document's `auth.collection` at it, and configure
> that exact name here. Deployments that already use a valid dedicated
> allowlist need no change.

`AuthCollections` must match the dedicated editor `auth.collection`
advertised by that deployment's discovery document. The example assumes the
`vega_editors` migration and seeding are complete. The current Astro starter
advertises `vega_editors`; existing projects that still advertise `_superusers`
must migrate before enabling or upgrading this extension. `_superusers` is deliberately
rejected because PocketBase superusers bypass record `ViewRule` checks.

Then advertise the route from the project's public discovery document:

```json
{
	"preview": { "apiBasePath": "/api/vega-preview" }
}
```

The site preview route needs the same `VEGA_PREVIEW_SECRET`, kept server-side.
It verifies tokens with this wire format:

```text
token   = "v1." + expiresUnix + "." + base64url(hmacSha256(secret, payload))
payload = "v1\n" + collection + "\n" + id + "\n" + expiresUnix
```

`expiresUnix` is whole UTC seconds and base64url is unpadded. The version,
collection, id, and expiry are all covered by the HMAC. A verifier must reject
unknown versions, malformed or expired timestamps, invalid signatures, and a
token presented for any collection/id other than the signed pair.

An unsaved draft uses a separate, confidential wire format:

```text
key        = hmacSha256(secret, "vega-preview-draft-v2\naes-256-gcm")
aad        = "v2\n" + collection + "\n" + id + "\n" + expiresUnix
postToken  = "v2." + expiresUnix + "." + base64url(nonce) + "." +
             base64url(aes256gcm(key, nonce, json(draft), aad))
```

`draft` has the canonical shape
`{record:{id,fields},blocks:[{id,fields}]}`. Its JSON is limited to 256 KiB by
default; an oversized request returns 413 and no token. The ciphertext travels
as form field `token` in a POST body, never in the preview URL. A request
without `draft` still receives the exact v1 response above.

## Security invariants

- `POST {RoutePrefix}/token` uses PocketBase's standard `RequireAuth`
  middleware. Vega sends `Authorization: <token>` with no `Bearer` prefix.
- `AuthCollections` must explicitly name at least one dedicated editor auth
  collection. Empty lists and `_superusers` fail at startup.
- Before signing, the extension loads the exact requested record and calls
  PocketBase `CanAccessRecord` with that collection's current `ViewRule`.
  Internal server access alone is never treated as editor permission.
- A request that carries `draft` must also satisfy that collection's current
  `UpdateRule`, checked with the same `CanAccessRecord` call: a draft is
  content proposed for the record, and the site renders it as if it were the
  record, so reading rights are not enough. PocketBase semantics apply as
  usual: a `nil` rule admits only superusers (which `AuthCollections` never
  lets in, so drafts are refused for everyone), an empty rule admits any
  authenticated editor, and anything else is a filter evaluated against the
  saved record and the editor's session. An editor who may view but not
  update gets `403` and no token; the same request without `draft` still
  returns the v1 URL. `@request.body.*` clauses in an `UpdateRule` see the
  body of this preview request (`collection`, `id`, `draft`), not the fields
  inside the draft, so a rule that restricts WHICH fields may change is not
  enforced here; it is enforced by PocketBase when the editor actually saves.
- Missing, unsupported, nonexistent, and inaccessible records all return 404,
  so the endpoint does not become a record-enumeration oracle. The `403`
  above is only ever returned for a record the caller was already proven able
  to view.
- Nothing in this extension logs a token, the signing secret, or draft
  content; the only log line is a failed record lookup, with the collection,
  the id and the error type.
- `SigningSecret` is required and must contain at least 32 bytes. It never
  appears in discovery or in the signed URL.
- Draft bytes are never written to PocketBase or a server cache. AES-GCM keeps
  them unreadable without the shared secret, and the route must reject them at
  `expiresUnix` even if a client retains the ciphertext.
- `RecordCollections` is the fail-closed map of content the site can render.
  Leave it empty only when the preview route genuinely handles every
  collection that an editor can view.
- The route secret authenticates a single signed preview request; it is not a
  standing PocketBase credential. If the site needs credentials to read
  non-public records from PocketBase, configure those separately and keep them
  server-only.

## Share links (optional, off by default)

A share link is a preview URL an editor sends to someone who has no Vega account. It is a
separate mechanism from the tokens above, which it does not change: it has state on the server,
lasts as long as the editor chooses (30 days at most) and can be revoked. The wire contract of the
four routes is in
[`docs/PROJECT-CONTRACT-v1.md`](../../docs/PROJECT-CONTRACT-v1.md#share-links-optional).

### Enable it

```go
preview, err := vegapreview.New(vegapreview.Config{
	// ...everything above...
	RecordCollections: []string{"pages"}, // required with ShareLinks
	ShareLinks:        true,
	SharePath:         "/preview-share",   // default
	ShareMinTTL:       5 * time.Minute,    // default
	ShareMaxTTL:       30 * 24 * time.Hour, // default and hard ceiling
})
if err != nil {
	log.Fatal(err)
}

app.OnServe().BindFunc(func(event *core.ServeEvent) error {
	if err := preview.EnsureCollections(event.App); err != nil {
		return err
	}
	preview.RegisterRoutes(event)
	return event.Next()
})
```

Then add `"share": true` to the `preview` object of the discovery document.

`EnsureCollections` creates the private collection `vega_preview_links` if it is missing and
never alters an existing one; it returns an error if a collection with that name has any API
rule open or fields of another shape. With `ShareLinks: false` it does nothing and
`RegisterRoutes` mounts only `POST /token`, exactly as before.

`New` fails, rather than adjusting the value, when:

- `ShareMaxTTL` is above 30 days or negative. This is checked even with `ShareLinks: false`.
- `ShareMinTTL` is negative, below one second, or above `ShareMaxTTL`.
- `ShareLinks` is on and `RecordCollections` is empty or contains `vega_preview_links`. An
  empty allowlist means "any collection" for `/token`; a standing public URL does not get that
  default.
- `SharePath` is not an absolute path, equals `PreviewPath`, or lives below it (the signed-token
  route `{PreviewPath}/{collection}/{id}` would read it as a collection name).

### Routes

| Route                              | Caller                        | Purpose                         |
| ---------------------------------- | ----------------------------- | ------------------------------- |
| `POST {RoutePrefix}/share`         | editor or superuser session   | create; returns the URL once    |
| `GET {RoutePrefix}/share`          | editor or superuser session   | list one record's live links    |
| `POST {RoutePrefix}/share/revoke`  | editor or superuser session   | revoke by link id; idempotent   |
| `POST {RoutePrefix}/share/resolve` | the site's server, with a key | tell the site what a link opens |

The site key for `/share/resolve` is `vegapreview.ShareResolveKey(secret)`, that is
`base64url(HMAC-SHA256(SigningSecret, "vega-preview-share-resolve-v1"))`, sent in the
`X-Vega-Preview-Key` header. No new secret has to be provisioned.

### What is stored

One row per link in `vega_preview_links`, whose five API rules are `nil`, so only this extension
and superusers reach it:

| Field                 | Content                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `collection`          | target collection                                                 |
| `recordId`            | target record id                                                  |
| `secretHash`          | hex SHA-256 of the secret, bound to the link id. Never the secret |
| `expires`             | when the link stops working                                       |
| `createdBy`           | id of the auth record that created it                             |
| `createdByCollection` | its auth collection (the editors' one, or `_superusers`)          |
| `label`               | optional short text                                               |
| `created`             | creation time                                                     |

The URL is `{SiteOrigin}{SharePath}/s1.{linkId}.{secret}`. The link id only locates the row; the
secret is 32 bytes from `crypto/rand`, base64url encoded.

### Security invariants of share links

- The three management routes take a session of `AuthCollections` **or a superuser session**.
  This differs from `POST /token`, which keeps refusing superusers. A superuser passes every
  record rule, which is no more than a superuser can already do with the records themselves.
- Create, list and revoke all require the caller to pass the record's `ViewRule` (else `404`,
  like a missing record) **and** its `UpdateRule` (else `403`), through the same
  `CanAccessRecord` call `/token` uses. Reading rights are not enough to publish a record to
  whoever holds a URL.
- Only collections named in `RecordCollections` can be shared, and a stored link whose
  collection is no longer listed stops resolving.
- The database holds a hash, never the secret, and the URL is returned by the create response
  only. Plain SHA-256 is sufficient because the secret has 256 bits of entropy from a CSPRNG:
  there is no dictionary to try, so a slow KDF would add nothing except a CPU cost that any
  visitor could trigger on every resolution. The hash covers the link id, so one link's secret
  never validates another row, and it is compared in constant time (also when the link id
  matches no row).
- **Revoking deletes the row** instead of setting a flag. Nothing in the contract needs a
  history of revoked links, and absence fails closed: a revoked link takes the very same code
  path as one that never existed, so no later change can forget to check a `revoked` column.
- A malformed, unknown, wrong-secret, expired, revoked or orphaned (record deleted) token gets
  the same `404`, byte for byte. A link whose record is gone is deleted on that lookup, so it
  cannot come back if a record is later created with the same id.
- Resolution is limited to 10 failed attempts per minute per address: the visitor's address
  the site forwards in `clientIp`, or the caller's own address when the site key is missing or
  wrong (and when `clientIp` is absent). The limiter is in memory, per process, and bounded to
  10 000 addresses; when it is full and nothing has expired, an address it cannot track is
  refused rather than let through uncounted. The caller's address comes from PocketBase's
  `RealIP`, so it honours the trusted-proxy headers configured in PocketBase's settings.
- Share request bodies are limited to 4 KiB.
- Expired rows are deleted whenever a link is created or listed. There is no cron job; a row
  that outlives its expiry is harmless because resolution checks the expiry itself.
- Nothing logs a secret, a hash, a token, a link id or a URL. Storage failures are logged with
  the operation name and the Go error type only.
- Every response of the four routes carries `Cache-Control: no-store`.

### Limits

- The secret is in the URL, so it stays in browser history and in whatever channel was used to
  send it. Anyone who obtains it sees the record until the link expires or is revoked.
- Revocation depends on the site calling `/share/resolve` on every visit. A site that caches
  the page or the answer keeps serving a revoked link.
- The official PocketBase image has none of this, and a fully static site cannot use it.
- The attempt limiter resets on restart and is not shared between replicas.
- There is no cap on how many links a record may have; the list route returns the 200 newest.

## Verify

```sh
go vet ./...
go test -race ./...
```
