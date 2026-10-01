# Vega strong-auth extension for PocketBase

Optional Go extension implementing the server contract used when Vega has
`authApiBasePath` configured. It was extracted from the production authentication flow of the
previous bespoke admin and made deployment-neutral.

Requires **PocketBase 0.39.7 or newer** and Go 1.26 or newer. Vega without this optional module
continues to support the wider PocketBase server range documented by the SPA.

It adds:

- password login with optional TOTP second step;
- single-use recovery codes stored as bcrypt hashes;
- discoverable passkey login and passkey registration/management;
- persistent, escalating IP rate limiting;
- idempotent PocketBase schema setup.

The extension is deliberately a separate Go module because vanilla PocketBase cannot implement
WebAuthn ceremonies or the password-to-TOTP pending-login flow. Vega itself remains a static SPA
and continues to support vanilla PocketBase when the extension is not configured.

## Integrate it

Add the module to your PocketBase Go application and construct it before `app.Start()`:

```go
package main

import (
	"log"

	"github.com/fodaveg/vegacms/extensions/vegaauth"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func main() {
	app := pocketbase.New()
	auth, err := vegaauth.New(vegaauth.Config{
		AuthCollection: "vega_editors",
		RoutePrefix:    "/api/vega-auth",
		TOTPIssuer:     "Example CMS",
		RPID:           "admin.example.com",
		RPDisplayName:  "Example CMS",
		RPOrigins:      []string{"https://admin.example.com"},
		TrustProxy:     true, // only behind a proxy you control
	})
	if err != nil {
		log.Fatal(err)
	}

	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		if err := auth.EnsureCollections(event.App); err != nil {
			return err
		}
		auth.RegisterRoutes(event)
		return event.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
```

Then configure the SPA served to users:

```json
{
	"authCollection": "vega_editors",
	"authApiBasePath": "/api/vega-auth"
}
```

The old fodaveg backend's `/api/fodaveg` routes implement the same client contract, so
`"authApiBasePath": "/api/fodaveg"` reuses them directly. Before treating TOTP as enforced,
also disable every native token issuer on its `users` collection; the generic extension does
this automatically, but the legacy implementation predates that hardening.

## Security notes

- `RPID` must be the effective site domain and every Vega origin must be listed exactly in
  `RPOrigins`; production passkeys require HTTPS.
- Set `TrustProxy` only when PocketBase is behind a proxy you control and that proxy overwrites
  `X-Real-IP`/`X-Forwarded-For`.
- The three `vega_*` support collections have no public API rules and are server-only.
- `EnsureCollections` disables PocketBase's native password, OTP, OAuth and built-in MFA token
  endpoints for the dedicated auth collection. This prevents bypassing Vega's TOTP challenge;
  do not point the extension at a collection that other applications authenticate against.
- TOTP secrets use PocketBase's hidden-field protection; recovery codes are never stored in
  plaintext and are returned only once when generated.
- A TOTP code is single-use. The last accepted time step is stored per account in the hidden
  `totp_last_step` field and claimed with one conditional `UPDATE`, so the same code (or an older
  one) is answered with `invalid_code` even when two requests carry it at the same time. A user
  who needs a second code right away waits for the next 30-second step.
- Password, TOTP and recovery attempts are counted **before** the credential is checked: checking
  the lock and reserving the attempt is a single write transaction, so a burst of parallel
  requests gets exactly five evaluated guesses per identity and IP and `429` for the rest. A
  successful login clears the counter; a correct password that still needs its second factor
  hands its reservation back without clearing earlier failures. If the counter cannot be stored
  the request is refused with `503 attempt_failed` instead of being evaluated uncounted.
- Pending password challenges and WebAuthn challenges live in process memory for five minutes.
  A multi-replica deployment therefore needs sticky routing or a shared challenge store.
- Anonymous challenge creation is rate-limited per IP; both MFA and WebAuthn stores prune expired
  entries and reject new work at a fixed capacity instead of growing without bound.

## Upgrading an existing installation

`EnsureCollections` runs on every start and only ever adds what is missing; it never drops or
rewrites existing data.

- `totp_last_step` (hidden number) is added to the auth collection. PocketBase backfills existing
  accounts with `0`, meaning "no code used yet": enrolled users keep their secret, stay enabled
  and log in as before. No manual migration is needed.

## Verify

```sh
go test ./...
```
