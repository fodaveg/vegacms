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
