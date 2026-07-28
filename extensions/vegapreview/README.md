# Vega preview-token extension for PocketBase

Reference Go implementation of the optional endpoint advertised as
`preview.apiBasePath` in `docs/PROJECT-CONTRACT-v1.md`. It is the server half
used by Vega's `PreviewPanel`: an authenticated editor asks for one saved
record and receives a short-lived URL to the site's on-demand preview route.

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

`AuthCollections` must match the `auth.collection` advertised by that
deployment's discovery document. The example uses a dedicated
`vega_editors` auth collection; the current Astro starter advertises
`_superusers` instead.

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

## Security invariants

- `POST {RoutePrefix}/token` uses PocketBase's standard `RequireAuth`
  middleware. Vega sends `Authorization: <token>` with no `Bearer` prefix.
- Before signing, the extension loads the exact requested record and calls
  PocketBase `CanAccessRecord` with that collection's current `ViewRule`.
  Internal server access alone is never treated as editor permission.
- Missing, unsupported, nonexistent, and inaccessible records all return 404,
  so the endpoint does not become a record-enumeration oracle.
- `SigningSecret` is required and must contain at least 32 bytes. It never
  appears in discovery or in the signed URL.
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
