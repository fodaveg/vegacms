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
	}
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
backend owns that secret and decides how `/trigger` reaches it. See
[PocketBase integration](POCKETBASE-INTEGRATION.md#publicación-disparador-de-build)
for an implementation recipe (a PocketBase Go extension or a thin proxy).

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
