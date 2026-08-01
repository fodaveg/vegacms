# Vega project contract v1

This document is the versioned integration contract between a PocketBase-based
project and a generic Vega build. It lets the connected project own its admin
configuration; Vega does not need a project-specific build or a copied
`vega.config.json` beyond locating a cross-origin backend.

## Discovery endpoint

After resolving the PocketBase URL, Vega requests:

```http
GET /api/vega/discovery
Accept: application/json
```

The endpoint is public because login depends on its response. It must not
contain credentials, tokens, internal URLs, or other secrets.

```json
{
	"protocolVersion": 1,
	"project": { "key": "default", "name": "Example site" },
	"auth": {
		"collection": "editors",
		"apiBasePath": "/api/vega-auth"
	},
	"manifest": {
		"collection": "vega",
		"key": "default",
		"schemaVersion": 1
	},
	"siteSettings": {
		"collection": "site_settings",
		"key": "default"
	},
	"blockTypes": ["hero", "rich-text", "gallery"]
}
```

Required behavior:

- Return `200` and the complete document when the project is ready.
- Use `protocolVersion` for the discovery envelope and
  `manifest.schemaVersion` for the manifest feature set. They evolve
  independently.
- Keep `manifest.collection` equal to `vega` in protocol v1.
- Return a stable, non-empty record key. The recommended key is `default`.
- Set `auth.apiBasePath` to `null` when the project uses PocketBase's standard
  auth endpoints.
- Omit secrets. Access control remains in PocketBase rules.

Vega treats an absent, invalid, or unsupported response as a legacy server and
falls back to its existing static/runtime configuration. An explicit
per-browser auth override still wins, so an operator can recover from an
incorrect server document.

### Block renderer vocabulary (optional)

An Astro site can advertise the block types for which it has a renderer by adding the
ADDITIVE `blockTypes` array shown above. Names use the same
`^[a-z][a-z0-9-]*$` vocabulary as the manifest's root `blockTypes` object.

- Omit the field (or set it to `null`) on legacy sites that do not expose this capability.
- Use `[]` when the site explicitly supports no block renderers yet.
- Vega emits one warning listing every manifest block type absent from this array.
- Because heterogeneous blocks keep their `type` in a real PocketBase column, Vega obtains the
  affected count with one grouped filter per block collection and its record total; it never
  parses each block's `data` JSON.

This is an additive field and therefore does not bump `protocolVersion`.

## Build trigger endpoint (optional)

Static sites (`output: 'static'`, e.g. Astro) don't reflect a saved record until
someone runs a build by hand. Discovery can advertise a bridge for that,
entirely inside the project's own PocketBase — Vega never learns the real
deploy webhook (a GitHub Actions dispatch URL, a Netlify deploy hook…): that
URL is a credential, and the discovery endpoint above is public. Add an
ADDITIVE `build` object:

```json
{
	"build": { "apiBasePath": "/api/vega-build" }
}
```

Omit `build`, or set it to `null`, when the project has no publish step to
trigger — Vega then renders nothing about publishing (the "Publish" control in
the shell chrome). Because this field is additive, it does not require a
`protocolVersion` bump (see "Compatibility policy" below): a server that adds
`build` to an existing discovery document stays fully compatible with older
Vega builds, which simply ignore the unknown key.

`apiBasePath` must follow the same `/api/...` absolute-path shape as
`auth.apiBasePath`. Behind it, the project exposes two routes, authenticated
with the SAME editor token Vega already sends to the rest of its own
PocketBase API (`Authorization: <token>`, no `Bearer` prefix — the PocketBase
SDK convention):

```http
POST {apiBasePath}/trigger
Authorization: <token>
```

Returns `202` with a JSON body `{ "id": "<string>" }` identifying the
triggered run. Any other status, or a body without a non-empty `id`, is
treated as a failed trigger.

```http
GET {apiBasePath}/status
Authorization: <token>
```

Returns `200` with:

```json
{
	"state": "idle",
	"startedAt": null,
	"finishedAt": null,
	"lastPublishedAt": "2026-07-20T09:00:00.000Z",
	"logUrl": null
}
```

- `state`: one of `"idle"`, `"running"`, `"ok"`, `"failed"`. Vega polls this
  endpoint while `state` is `"running"` and stops as soon as it sees any other
  value.
- `startedAt`/`finishedAt`: ISO 8601 UTC of the CURRENT or LAST run, or `null`.
- `lastPublishedAt`: ISO 8601 UTC of the last run that finished with
  `state: "ok"`, or `null` if none ever did. Vega compares this timestamp
  against recently edited records to flag unpublished changes.
- `logUrl`: an absolute URL to inspect the run's log (a CI job, a deploy
  log…), or `null`. Vega only links to it when `state` is `"failed"`.

Vega never stores or exposes the real deploy webhook; the project's own
backend owns that secret and decides how `/trigger` reaches it.
[`extensions/vegabuild`](../extensions/vegabuild/README.md) is a ready
reference implementation of both routes for a PocketBase Go application; see
[PocketBase integration](POCKETBASE-INTEGRATION.md#publicación-disparador-de-build)
for how to install it, and for the thin-proxy alternative when PocketBase runs
as a prebuilt binary.

## Preview endpoint (optional)

A draft has no public URL yet — that is exactly the moment a preview is useful.
`previewUrl` (the content manifest's §4.7 placeholder template) only resolves once every
placeholder already has a saved value, and for `output: 'static'` sites that in practice
also means "already built and deployed": the one case where a preview would help most is
the one case the existing link can't cover.

Discovery can advertise a bridge to a live, unpublished preview, following the SAME
pattern as `build` above and for the SAME reason: Vega must never learn a credential from
a public endpoint. Add an ADDITIVE `preview` object:

```json
{
	"preview": { "apiBasePath": "/api/vega-preview" }
}
```

Omit `preview`, or set it to `null`, when the project can't render unpublished content —
Vega then shows only the existing "View on site" link (`previewUrl`) and no preview
panel at all. Because this field is additive, it does not require a `protocolVersion`
bump (see "Compatibility policy" below): the same reasoning as `build` applies verbatim —
a server that adds `preview` to an existing discovery document stays fully compatible
with older Vega builds, which simply ignore the unknown key.

A long-lived preview token embedded in the (public) discovery document would be a
credential that grants read access to every draft on the site — arguably worse than the
deploy webhook `build` avoids, because it would be a standing key instead of a one-shot
trigger. So `preview` carries no token at all. Vega requests a short-lived one on demand,
the moment an editor opens the preview panel, authenticated with the SAME editor token it
already sends to the rest of its own PocketBase API (`Authorization: <token>`, no
`Bearer` prefix — the PocketBase SDK convention, same as `build`):

```http
POST {apiBasePath}/token
Authorization: <token>
Content-Type: application/json

{ "collection": "posts", "id": "6f2c1a90c1b2e34" }
```

Returns `200` with:

```json
{
	"url": "https://example.test/preview/posts/6f2c1a90c1b2e34?token=…",
	"expiresAt": "2026-07-25T10:15:00.000Z"
}
```

- `collection`/`id` identify the record Vega wants a preview of — the same collection
  name and record id the rest of the API already uses.
- `url`: an absolute URL Vega embeds in an `<iframe>` as-is. Vega treats it as fully
  opaque: it never parses, rewrites, decodes, or stores it beyond the lifetime of the
  open panel.
- `expiresAt`: ISO 8601 UTC. Vega uses it only to know when to request a fresh token
  while the panel stays open (a silent renewal, scheduled a little ahead of the
  deadline); it never extends, shortens, or otherwise second-guesses the token's
  validity — enforcing that stays entirely the project's call, server-side.

Any other status, or a body without a non-empty `url`, is a failed request: there is no
draft preview for this record right now (unsupported collection, a record that doesn't
exist, or a project that has no rendering opinion for this content type). Vega shows that
as an explicit, actionable error inside the panel — never a blank `<iframe>`.

#### Unsaved editor state (additive, optional)

Everything above previews a record that is already **saved**. A project may additionally
accept an optional `draft` object in the same request body, carrying the record and its
blocks exactly as they stand in the editor, so an author building a page out of blocks can
see what is on screen _now_:

```http
POST {apiBasePath}/token
{ "collection": "posts", "id": "6f2c1a90c1b2e34", "draft": { "record": {…}, "blocks": [{…}] } }
```

This is purely additive: a project that ignores `draft` keeps working, and Vega falls back
to previewing the saved record. Omitting it is a valid implementation of this contract.

A project that does accept it takes on four obligations, and they are the whole point of
writing them down here rather than leaving them to each implementation:

- **Previewing must not write.** The draft is content the author has not chosen to save.
  Materialising it — a temporary record, a drafts table — means writing what nobody asked
  to write and needing a cleanup whose failure leaves recoverable content behind. Carrying
  it inside the token avoids both.
- **The draft must be confidential and bound.** It is unpublished content, so it cannot
  travel in the clear. Vega's reference extension emits a `v2` token encrypted and
  authenticated with AES-256-GCM, under a key derived from the signing secret with domain
  separation (`HMAC-SHA256(secret, "vega-preview-draft-v2\naes-256-gcm")`), a fresh random
  96-bit nonce per token, and `{version, collection, id, expiresUnix}` as additional
  authenticated data — which is what stops a token being replayed against another record
  or with a stretched expiry. Reimplementing this loosely is worse than not offering it:
  the version prefix must be authenticated, never taken from what the caller sent.
- **It must not leak through the URL.** A token carrying content cannot sit in a query
  string, where it reaches history, referrers and access logs. Vega posts it to the
  preview route as a form field. The response is `Cache-Control: private, no-store`.
- **It must be bounded.** Vega's reference implementation rejects drafts over 256 KiB of
  JSON with `413`, and enforces the limit before parsing or decrypting on both ends.

Authorisation does not change: the saved record's `ViewRule` is still evaluated with the
editor's own identity before any token is issued, so previewing a draft never grants
access the editor did not already have.

#### Two limits the reference extension enforces on both paths

These bind `v1` and `v2` alike, and a project reimplementing `/token` should honour them.

- **A token lives at most one hour.** The `expiresAt` above is what Vega schedules renewals
  against, but the ceiling is the server's. The reference extension defaults to five
  minutes and refuses to start if it is configured above an hour, naming the value it got
  and the maximum. The short life of the token is the premise this whole section rests on
  when it argues that discovery must carry no credential; a units slip (minutes where
  seconds were meant) would quietly turn "short-lived" into a standing key, and that is
  precisely the mistake a configurable ceiling would not catch. **Upgrading:** a project
  already configured above an hour will now fail closed at startup instead of issuing
  long-lived URLs.
- **Collection names and record ids may not contain a newline.** Both wire formats separate
  their fields with `\n` — the `v1` HMAC payload and the `v2` additional authenticated
  data. PocketBase does not allow a newline in either identifier today, so the formats are
  unambiguous; but that is an invariant borrowed from somewhere else, and the extension now
  rejects such a request with `400` before signing or encrypting anything, rather than
  relying on it. Without that check, `("a\nb", "c")` and `("a", "b\nc")` would produce
  identical signed bytes.

Behind `/token`, the project decides how a request maps to a page (a per-collection route
table, a convention such as `/preview/{collection}/{id}`, anything else); Vega does not
need to know. For an `output: 'static'` site (Astro and similar), the URL that `/token`
returns has to point at an actual SSR route — a static build cannot reflect a record that
was never built — which is why this is explicitly the site's own responsibility, not
Vega's:

- The `/token` handler (a PocketBase Go extension, same shape as `/api/vega-build`) reads
  `{ collection, id }`, checks the caller authenticates as an editor (the same rule
  `/api/vega-build` already enforces), mints a short-lived signed value (e.g. an HMAC over
  `collection`, `id` and an expiry, with a server-only secret — never a bare database id,
  which would let anyone probe other drafts by guessing), and returns a URL such as
  `${SITE_ORIGIN}/preview/{collection}/{id}?token=…` alongside the matching `expiresAt`.
- The preview route itself needs SSR for that one path (`output: 'server'`, a hybrid
  `output: 'server'` page, or a server island — the rest of the site can stay fully
  static). It re-checks the signed token against the same secret, fetches the record from
  PocketBase directly by id (deliberately bypassing whatever "published" filter the public
  listing pages apply — this route's entire purpose is to show what isn't public yet), and
  renders it with the SAME template/component the public page uses, so a draft looks
  exactly like what publishing it would produce.

Vega never stores the preview token beyond the open panel's lifetime, and never fabricates
a preview URL on its own — unlike `previewUrl`, whose placeholder substitution is a pure
client-side string match (`$lib/model/preview-url.ts`), every draft preview URL comes from
a live `/token` response, requested fresh each time the panel opens or a save completes.

### Visual editing bridge (additive, optional)

Everything above renders a preview Vega can only look at. The `<iframe>` is cross-origin, so
Vega cannot read a single node of it, and the preview panel says so in its own header: it
never inspects, injects into, or instruments the embedded document.

Visual editing needs the opposite, and the only honest way to get it is for the **site to
volunteer what Vega cannot see**. A site that opts in annotates its rendered blocks and runs
a small bridge script that talks to Vega over `postMessage`. Vega then draws selection
outlines _over_ the iframe using the geometry the bridge reports, and an author clicking a
section on the page gets that block's fields opened beside it.

The division of labour is deliberate and it is the whole design:

- The site owns rendering. Vega never learns the site's CSS, never injects styles, and never
  makes any part of the page `contenteditable`. Text is typed in Vega's own form controls.
- Vega owns the editing UI. The bridge reports positions and clicks; it does not know what a
  field is, never writes to PocketBase, and has no opinion about content.
- Everything Vega believes about the canvas came from a message. There is no fallback path
  that reaches into the frame, because there cannot be one.

This capability is layered strictly on top of the draft preview above. A project that does
not implement `draft` cannot implement this, because a canvas that only reflects the last
saved record is not an editor.

Both halves are useful on their own schedule: a site can ship its bridge before any given
Vega build acts on it, and a bridge nobody ever contacts stays silent, so the site behaves
exactly like one that never had it. That property is not incidental, it is what lets the two
repositories move independently, and it is why the handshake decides the feature rather than
the announcement.

#### Advertising it

Add `visualEditing` to the existing `preview` object. Same additive rules as everywhere else
in this document, so no `protocolVersion` bump:

```json
{
	"preview": { "apiBasePath": "/api/vega-preview", "visualEditing": true }
}
```

Omit it, set it to `null`, or set it to `false` on sites without a bridge. A malformed value
degrades to `false` and never invalidates the surrounding `preview` object, matching how
`build` and `preview` themselves already degrade field by field
(`$lib/session/project-discovery.ts`).

**The announcement is a promise, not proof.** Discovery is written by the project and can
easily outlive the code it describes: a site that advertises `visualEditing` after removing
the bridge would leave Vega waiting on a frame that will never answer. So the handshake below
is what actually enables the feature, and a site that claims the capability but fails to
answer produces an explicit, actionable error, never a silent or half-drawn canvas.

#### Handshake and message envelope

Every message in both directions is a JSON-serialisable object carrying the protocol version:

```json
{ "vega": "vega-visual-1", "type": "ready", "...": "type-specific fields" }
```

Messages missing the `vega` key, or carrying an unknown version, are ignored. Neither side
attempts to interpret a version it does not implement.

Startup is racy in both directions: the site cannot know when Vega finished mounting, and
Vega cannot know when the document finished evaluating scripts. Both sides therefore speak
first and both sides tolerate repetition:

- The bridge posts `ready` to its parent as soon as it initialises.
- Vega posts `hello` when the frame fires `load`, and repeats it a small, bounded number of
  times until a `ready` arrives.
- `ready` is idempotent. A bridge that receives `hello` after it already announced itself
  answers `ready` again rather than assuming the first one was received.

If no `ready` arrives within the timeout, Vega reports that this site has no visual editing
bridge installed and offers the ordinary preview, which still works.

**Site to Vega**

| `type`   | Payload                                                          | When                                                    |
| -------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| `ready`  | `{ collection, id, blocks: [{ id, type, rect }], liveRefresh? }` | On init, after a live refresh, and in answer to `hello` |
| `layout` | `{ blocks: [{ id, type, rect }] }`                               | Geometry changed: scroll, resize, late-loading images   |
| `select` | `{ blockId }`                                                    | The author clicked inside that block                    |
| `error`  | `{ code, message }`                                              | The bridge cannot do its job (see below)                |

**Vega to site**

| `type`      | Payload               | Meaning                                               |
| ----------- | --------------------- | ----------------------------------------------------- |
| `hello`     | `{}`                  | Vega is listening; answer with `ready`                |
| `highlight` | `{ blockId }`         | Pointer is over this block in Vega's own outline list |
| `scroll-to` | `{ blockId }`         | Bring this block into view                            |
| `refresh`   | `{ url, postToken? }` | Re-render from this preview URL without reloading     |

`rect` is `{ top, left, width, height }` in CSS pixels, relative to the **frame's own
viewport**. Vega applies the frame's offset and any canvas zoom itself; the bridge never
needs to know it is being scaled.

`layout` is sent at most once per animation frame. Measuring on every scroll event is the
straightforward way to make a canvas stutter, and the site is the only side that can throttle
it, because the site is where the scrolling happens.

#### What the site must annotate

The bridge locates blocks through DOM attributes the renderer emits:

- `data-vega-block-id` and `data-vega-block-type` on each rendered block. Vega's own
  `VegaBlocks` component (`@vega/astro`) emits both, including on the visible fallback it
  renders for a block type the site has no component for. A block whose type is broken is
  precisely the one an author wants to open, so it stays selectable like any other.
- `data-vega-blocks-root` on the element wrapping the whole sequence. This is what live
  refresh replaces, so it has to be a single element that contains every block and nothing
  the surrounding page depends on keeping.

#### Security

The bridge is a control channel into a page that renders unpublished content, so it fails
closed in three independent ways.

- **It only exists in editor mode.** The bridge is never emitted on a published page. A
  project can verify this the blunt way, by grepping its built output for the bridge before
  deploying.
- **It requires an explicit origin allowlist**, configured on the site (an environment
  variable, exactly like the allowlist `vegapreview` already refuses to start without). The
  bridge ignores every message from an origin outside it and refuses to initialise when the
  list is empty. An empty list means nobody, never everybody.
- **It should be reinforced at the browser level.** The same list belongs in a
  `Content-Security-Policy: frame-ancestors` header on the preview route, so a page that is
  not allowed to embed the preview cannot embed it at all, rather than embedding it and being
  ignored afterwards.

Vega validates symmetrically: it checks `event.origin` against the origin of the URL that
`/token` returned, and discards anything else without letting it reset the handshake state.

The token already gates the route, so an attacker who cannot mint one sees a `404` and no
bridge. The allowlist is defence in depth for the case where a valid token leaks, and it is
cheap enough that leaving it out is not a trade-off worth making.

#### Live refresh

Reloading the whole frame on every edit loses scroll position and re-fetches the stylesheet
and every image. That is tolerable for a panel refreshed on save and unusable for a canvas
refreshed while typing.

The path that preserves every guarantee this document already makes:

1. Vega debounces edits, then requests a fresh token, carrying the current draft when it has
   one. The draft stays encrypted and bound to its record and expiry.
2. Vega hands the token to the bridge as `refresh`: `{ url, postToken? }`, the same two
   fields `POST {apiBasePath}/token` returned, forwarded without being parsed or rewritten.
3. The bridge requests that URL itself, exactly the way an ordinary navigation would have
   (`GET` when there is no `postToken`, otherwise a `POST` with the ciphertext as the `token`
   form field), parses the returned document, and replaces the contents of
   `data-vega-blocks-root` with the contents of the same element in the response. Scroll
   position survives untouched.
4. The bridge re-measures and posts `ready`. Not `layout`: the block sequence itself may have
   changed, and `ready` is already idempotent and already carries `{ collection, id }`, so a
   swap that somehow landed on another record is caught by the check Vega already makes.

Passing the draft to the frame in the clear would save one round trip and is explicitly not
recommended: it would break the "must be confidential and bound" obligation above, letting
anyone holding a valid token render arbitrary content into the preview.

**Both sides announce before they act, and neither trusts the announcement.** A bridge that
can do this sets `liveRefresh: true` in its `ready`; anything else (absent, `false`, a
malformed value) degrades to `false`, and Vega then keeps reloading the frame on every edit,
which is what it did before this section existed. Vega sends `refresh` only to a bridge that
claimed the capability, and still arms a deadline: if no `ready` arrives in time, it falls
back to a full reload. A site can therefore ship the capability before Vega uses it, and a
site that claims it and then fails to deliver costs the author one flicker, never a canvas
frozen on content that is no longer true.

Three limits worth stating rather than discovering:

- Scripts inside a block do not re-execute when its HTML is replaced. A block with its own
  client-side behaviour stays inert until the next full reload.
- If the replacement fails for any reason, the bridge reloads the frame completely. A flicker
  is strictly better than a canvas that keeps showing something that is no longer true. A
  bridge that cannot perform that reload on its own — a failed `postToken` refresh, which
  cannot be re-issued as a plain navigation — reports `error` with code `refresh-failed`
  instead. Vega treats that one code as "reload this yourself" rather than as a bridge that
  cannot do its job, so the author gets the reload immediately instead of waiting out the
  deadline, and the canvas never shows a bridge error for something it already recovered from.
- The swap replaces the blocks root and nothing else. A site whose `<head>`, navigation, or
  page-level markup depends on block content will show those parts stale until the next full
  reload. That is the price of keeping scroll position, and it is why the root is required to
  contain "every block and nothing the surrounding page depends on keeping".

## Canonical `vega` record

Protocol v1 recommends one record selected by `key = "default"`, with a unique
index on `key`:

| Field                    | PocketBase type        | Purpose                                   |
| ------------------------ | ---------------------- | ----------------------------------------- |
| `key`                    | text, required, unique | Stable record identity                    |
| `manifestVersion`        | number, integer        | Manifest feature version                  |
| `projectName`            | text                   | Human project name                        |
| `authCollection`         | text                   | PocketBase auth collection                |
| `authApiBasePath`        | text                   | Optional strong-auth API base             |
| `siteSettingsCollection` | text                   | Typed site-settings collection            |
| `manifest`               | json                   | Vega content manifest                     |
| `schemaSnapshot`         | json                   | `ContentType[]` for non-superuser editors |

Vega reads the keyed record first. For backward compatibility, it falls back
to the first legacy record only when no keyed record exists. Saving upgrades
that record by writing `key` and `manifestVersion` when those fields exist.

## Editable project settings

Project/site settings are normal PocketBase fields, not a JSON blob understood
only by Vega. The project creates a singleton such as
`site_settings/default`, and its manifest declares:

```json
{
	"collections": {
		"site_settings": {
			"label": "Site",
			"singleton": true,
			"titleField": "siteTitle",
			"fieldGroups": [
				{ "name": "Identity", "columns": 2 },
				{ "name": "Images", "columns": 2 }
			],
			"fields": {
				"key": { "hidden": true },
				"siteTitle": {
					"label": "Site title",
					"help": "Used in navigation, browser titles and metadata."
				},
				"contactEmail": {
					"label": "Contact email",
					"help": "Public address used by the contact page."
				}
			}
		}
	}
}
```

Use native PocketBase types whenever possible (`email`, `url`, `number`,
`select`, `file`, `date`). Vega then renders usable controls, validation, file
uploads, responsive field groups, placeholders, and help text automatically.
Legacy path/string fields may remain hidden as migration fallbacks.

The public site and every other consumer must read the same singleton. This is
what makes PocketBase, rather than a Vega deployment, the source of truth.

## Localized fields

Projects keep one typed PocketBase field per language and declare how those
physical fields form one editorial concept. Vega then renders a single
form-level language switcher; shared fields remain visible while only the
localized controls change.

```json
{
	"schemaVersion": 1,
	"locales": {
		"default": "es",
		"available": [
			{ "id": "es", "label": "Español" },
			{ "id": "en", "label": "English" }
		]
	},
	"collections": {
		"posts": {
			"localizedFields": {
				"title": {
					"label": "Title",
					"fields": { "es": "titleEs", "en": "titleEn" }
				},
				"body": {
					"label": "Body",
					"fields": { "es": "bodyEs", "en": "bodyEn" }
				}
			}
		}
	}
}
```

The order of `locales.available` is the tab order. `locales.default` selects
the initial tab and the physical field that anchors each localized control in
the existing form order/group. Every localized mapping must cover all declared
locales, reference real fields, and use structurally compatible field types
and widgets. Invalid groups degrade independently to normal physical fields
and produce a model warning.

Tabs expose missing content, unsaved changes, and validation errors. When save
validation fails in a hidden language, Vega switches to that tab before moving
focus to the first invalid control. Vega never copies or falls back content on
write; fallback policy remains the public site's responsibility.

## Compatibility policy

- Vega v1 consumes discovery protocol `1` and manifest schema `1`.
- Unknown discovery protocol versions are ignored safely.
- A manifest with a newer schema version is read in compatibility mode: known
  v1 keys continue to work and unsupported functionality is not assumed.
- Additive record fields are safe. A breaking envelope change requires a new
  `protocolVersion`; a breaking manifest change requires a new
  `schemaVersion` and matching versioned documentation.

## Deployment topology

Same-origin deployments need no Vega-side project file: PocketBase is resolved
from `window.location.origin`, then discovery supplies the project metadata.

For cross-origin deployments, Vega still needs the backend URL once (runtime
connection screen or a minimal static file containing only `backendUrl`). CORS
must allow the Vega origin to call both `/api/vega/discovery` and the normal
PocketBase API.
