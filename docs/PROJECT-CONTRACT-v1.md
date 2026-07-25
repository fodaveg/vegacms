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
