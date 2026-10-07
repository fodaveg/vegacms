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
- proof of possession (current TOTP code or a recent second-factor verification) before any
  factor is added, replaced or removed;
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
this automatically, but the legacy implementation predates that hardening. It also predates the
proof-of-possession rule and the `/passkey/verify` routes described below.

## Changing factors needs a fresh proof of possession

A session token alone cannot add, replace or remove a factor once the account has one (TOTP
enabled or at least one passkey). These routes are guarded:

| Route                          | What it changes                                |
| ------------------------------ | ---------------------------------------------- |
| `POST /totp/enroll`            | starts replacing the authenticator app         |
| `POST /totp/disable`           | removes TOTP                                   |
| `POST /recovery/generate`      | voids the recovery codes and issues new ones   |
| `POST /passkey/register/begin` | adds a passkey (`finish` needs this challenge) |
| `POST /passkey/delete`         | removes a passkey                              |

A guarded request goes through when either of these holds:

- this session proved possession of a second factor in the last **five minutes**: a login finished
  with TOTP, a recovery code or a passkey, a successful `POST /totp/verify`, or a passkey
  verification (below);
- its JSON body carries `"code"` with the account's current TOTP code. A right code also counts as
  a proof for the following five minutes.

Otherwise the answer is `428 {"error":"step_up_required","methods":["totp","passkey"],"message":…}`,
where `methods` lists what the account can prove with. The status is deliberately not 401/403:
Vega's client treats those as an expired session, and this session is valid. A wrong `code` is
`401 {"error":"invalid_code","code_source":"current"}` (the current authenticator rejected it)
and, after five of them, `429 {"error":"locked","wait":<seconds>}`; that budget is per account
(not per IP), is shared with `/totp/verify` and is separate from the login lock.

Passkey verification, for accounts without TOTP or without the authenticator app at hand, is a
normal assertion ceremony for the signed-in account, with user verification required:

- `POST /passkey/verify/begin` returns the request options (`400 no_passkeys` if there are none);
- `POST /passkey/verify/finish` takes the assertion and answers `{"ok":true}`, or
  `400 verify_failed`.

An account with **no** factor yet has nothing to prove with, so its first TOTP enrollment and its
first passkey need only the session, as before. A login finished with a recovery code counts as
proof on purpose: it is how the owner of a lost authenticator replaces it.

`POST /totp/enroll` no longer switches TOTP off. The new secret is kept in the hidden
`totp_pending_secret` field and only replaces the active one when `POST /totp/verify` accepts a
code generated from it; until then logins keep asking for the old authenticator.
An invalid pending-secret code returns `401 {"error":"invalid_code","code_source":"new"}`.
`code_source` is additive: older servers may omit it, so clients must keep their generic code
error in that case. A client must not infer which code failed from the submitted form. Abandoning the
enrollment changes nothing, and enrolling again overwrites the pending secret.

An unverified secret cannot outlive the moment it was created for. It expires ten minutes after
`/totp/enroll` (hidden `totp_pending_until`; `POST /totp/verify` then answers
`400 enrollment_expired` and discards it), and it is discarded whenever a passkey is registered or
deleted. Once the account has any factor, `POST /totp/verify` only activates a secret (a pending
one, or one an older version stored without enabling) for a session with a fresh proof; otherwise
it answers `428 step_up_required`. Its body may carry `"proof"` with the current code of the
active authenticator, next to `"code"`, which belongs to the secret being verified. So a secret
planted while the account had no factor cannot be switched on after the owner sets one up.

Recovery codes issued while TOTP was off are deleted the moment it is switched on, so codes a
bare session obtained earlier never become a second factor. The SPA asks for fresh ones right
after activating. Replacing the authenticator of an account that already had TOTP keeps them.

The factor routes save only the fields they change (`Record.IgnoreUnchangedFields`), and
`totp_last_step` is only ever moved by its own forward-only `UPDATE`: a request that read the
account before a login claimed a code cannot write the older step back.

The standard records API is not a way around this. `totp_enabled` stays readable (the SPA reads
it from the auth record), but a `PATCH` on the auth collection that changes `totp_enabled` or any
other `totp_*` field is refused with `400` unless a superuser sends it, whatever the collection's
update rule allows. The routes are bound in `RegisterRoutes`, together with the auth-refresh hook
below.

The proof belongs to the **session** that gave it, not to the account: it is stored in process
memory under the SHA-256 of the session token (never the token itself). Another token of the same
account, such as a stolen one or a login on another device, does not inherit it and gets `428`.
When PocketBase's `auth-refresh` replaces the token, which the SPA does every time it opens the
security screen, the proof moves to the new token with its original expiry: refreshing never
extends the five minutes and the replaced token stops carrying the proof. Every refreshable token
issued by this extension, including PocketBase auth-refresh, adds a cryptographically random
192-bit `jti` claim while preserving PocketBase's claims, expiry and signing key. Independent
logins within one second therefore remain separate sessions. No schema or client storage change
is required; normal PocketBase middleware and token-key revocation still apply. Failure to obtain
randomness rejects issuance/refresh without transferring the proof.

Concurrent refresh requests receive distinct tokens; at most one inherits the old token's proof,
with its original expiry. Other successful refreshes must prove possession again before changing
factors. The old token loses its **proof**, not its underlying PocketBase authentication validity;
this extension does not introduce session revocation. Non-refreshable tokens are returned unchanged,
as PocketBase specifies. Tokens already open before upgrading remain valid for normal PocketBase
reads/writes, but a refreshable token without a signed, well-formed nonce cannot mutate factors or
establish/use proof. All factor/proof routes reject it before consuming a code or challenge with
`428 {"error":"step_up_required","methods":[]}`. This uses the existing unavailable-step-up
contract, not an expired-session response: it does not sign the user out or discard editor state.

The remedy is the standard PocketBase `POST /api/collections/{authCollection}/auth-refresh`.
It returns a unique `jti` and discards, rather than inherits, any proof cached for the legacy token:
identical old tokens may have belonged to different logins. The owner then proves possession on
the new session normally; another copy of the legacy token gains no authority. Vega already
refreshes before loading security settings. Direct clients must also refresh before security
operations (or sign in again); merely resending a TOTP code on the legacy session is rejected
without spending that code. Non-refreshable static/impersonation tokens retain their existing
proof contract because they are a deliberate PocketBase capability, not independently issued
refreshable login sessions.

## Deployment: one process owns the authentication flow

Run this reference extension in **one PocketBase process per authentication service**. Pending
password/TOTP logins, WebAuthn challenges and recent proofs of possession are held in that
process's memory; sharing the PocketBase database does not share them.

A restart loses those pending challenges and proofs. Start an interrupted login or WebAuthn
ceremony again from its first step. A still-valid session token remains valid for normal
PocketBase requests, but when the account already has a factor, a change without a new proof
receives `428 step_up_required`: the session must prove possession again. A restart never turns
another session's proof into authority, and stored factors and recovery codes are not lost with
the in-memory state.

Before putting multiple replicas behind the same authentication service, provide **stable
affinity to the same process** across the whole flow: password login and its TOTP/recovery step,
WebAuthn `begin`/`finish`, PocketBase auth-refresh, proof verification and the factor changes
authorized during the five-minute proof window. Affinity must survive token renewal; routing by
the current `Authorization` token or its hash is unsuitable because refresh changes that token.
If the selected process restarts or disappears, restart pending ceremonies and ask for a fresh
proof on the replacement process rather than assuming the old in-memory state survived.

A shared proof **and challenge** store is the alternative, but this extension does not implement
one. Such a design must keep proofs isolated by session, preserve their original expiry when a
token is renewed and consume challenges only once. Sharing proof by account would let unrelated
sessions inherit authority and violates the proof-of-possession contract. Multiple replicas
without either stable affinity or a shared store are unsupported; enabling them also requires a
separate review of PocketBase's database and deployment constraints.

## Security notes

- `RPID` must be the effective site domain and every Vega origin must be listed exactly in
  `RPOrigins`; production passkeys require HTTPS.
- Set `TrustProxy` only when PocketBase is behind a proxy you control and that proxy overwrites
  `X-Real-IP`/`X-Forwarded-For`. Header values that are not IP addresses are ignored and the
  connection address is used instead.
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
- TOTP and recovery also share a persistent **account-wide** budget of five evaluated codes,
  regardless of IP, pending challenge or email changes. Both this budget and the identity/IP
  budget are reserved in one transaction; a refusal spends neither. Only a successful second
  factor clears the account budget: a correct password or a new challenge does not. It follows
  the same temporary, escalating locks below, and refused requests do not prolong a lock.
  Someone who already knows the password can therefore temporarily block the owner's TOTP and
  recovery login; passkey login keeps its existing independent policy. Once the lock expires,
  another code can be evaluated, and a successful TOTP or recovery login clears the lock.
- Passkey login requires **user verification** (PIN or biometrics): the options sent to the
  browser carry `userVerification: "required"` and an assertion without the UV flag is rejected.
  Registration already required it, so every stored passkey can satisfy it.
- A passkey whose signature counter does not advance (a possible cloned authenticator) is
  rejected with `verify_failed`, counted as a failed login and logged as a warning with the
  account ID and client IP only. The warning is stored with the passkey, survives later accepted
  logins and is reported as `cloneWarning` by `GET /passkey/list`; the stored counter is left
  untouched, so the authenticator that is ahead keeps working. Deleting the passkey clears it.
  Synced passkeys that always report counter `0` never trigger it.
- The two passkey `finish` bodies are buffered through `http.MaxBytesReader` with a 64 KiB cap;
  a larger payload gets `413 payload_too_large` and does not consume the pending challenge.
- Locks escalate (5, 10, 15… up to 60 minutes) for as long as the failures keep coming: the
  15-minute window is measured from the last attempt or from the end of the last lock, whichever
  is later, so sitting out a long lock does not reset the count.
- Pending password challenges and WebAuthn challenges live in process memory for five minutes,
  as do recent session proofs. Apply the [single-process deployment requirements](#deployment-one-process-owns-the-authentication-flow)
  before adding replicas.
- Anonymous challenge creation is rate-limited per IP; both MFA and WebAuthn stores prune expired
  entries and reject new work at a fixed capacity instead of growing without bound. WebAuthn has
  independent budgets of 2048 anonymous discoverable-login challenges and 2048 authenticated
  verify/register challenges (shared by those two operations). Filling either budget cannot block
  the other. Both retain the five-minute TTL, replacement of an existing slot and single-use
  consumption. The anonymous per-IP begin limit is unchanged.

## Upgrading an existing installation

`EnsureCollections` runs on every start and only ever adds what is missing; it never drops or
rewrites existing data.

- `totp_last_step` (hidden number) is added to the auth collection. PocketBase backfills existing
  accounts with `0`, meaning "no code used yet": enrolled users keep their secret, stay enabled
  and log in as before. No manual migration is needed.
- `totp_pending_secret` (hidden text) is added to the auth collection, empty for everyone. An
  account that an older version left enrolled halfway (`totp_secret` stored, `totp_enabled`
  false) can still finish with `POST /totp/verify`, which checks that stored secret.
- Stored passkeys are not rewritten. One that already carried a clone warning from an older
  version keeps it on record and keeps working while its counter advances.
- Sessions that were open before the upgrade have no recorded proof: their first change to a
  factor is answered with `step_up_required` until they prove possession.

## Verify

```sh
go vet ./...
go test -race -cover ./...
```

The suite drives the real HTTP routes against a PocketBase test app, including whole passkey
ceremonies signed by a software authenticator and bursts of concurrent login attempts, so run it
with `-race`.
