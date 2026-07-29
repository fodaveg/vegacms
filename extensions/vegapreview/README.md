# Vega preview-token extension for PocketBase

Reference Go implementation of the optional endpoint advertised as
`preview.apiBasePath` in `docs/PROJECT-CONTRACT-v1.md`. It is the server half
used by Vega's `PreviewPanel`: an authenticated editor asks for one saved
record and receives a short-lived URL to the site's on-demand preview route.
When the optional request field `draft` is present, the response instead adds
an encrypted `postToken` that Vega submits to that same route by `POST`.

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
- Missing, unsupported, nonexistent, and inaccessible records all return 404,
  so the endpoint does not become a record-enumeration oracle.
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

## Verify

```sh
go vet ./...
go test ./...
```
