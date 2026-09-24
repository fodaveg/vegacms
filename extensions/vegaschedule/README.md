# Vega scheduled publishing extension for PocketBase

A PocketBase cron job that, once a minute, publishes scheduled content: every record still in
`draft` whose "publish at" date has passed becomes `published`, and the date is cleared. It is the
server half of the «Publicar el» field Vega shows in the form; without it that date is inert data.

Vega checks whether it is there: a superuser session reads `GET /api/crons` (superuser-only in
PocketBase) and looks for the job id `vegaschedule`, then writes the answer into
`vega.schemaSnapshot` for editors, who cannot call that route. Without the job, a scheduled draft
reads «Borrador · fecha sin efecto» and the field shows a warning, instead of «Programada». Keep
the default `JobID` so Vega can find it.

Requires **PocketBase 0.39.7 or newer** and Go 1.26 or newer. Separate Go module, same reasoning
as `extensions/vegaauth` and `extensions/vegabuild`: a PocketBase without it keeps working.

## What gets scheduled

Nothing is configured here. A content type opts in from Vega's own manifest (`vega` collection,
editable in `/settings`), next to its `statusField`:

```json
{
	"collections": {
		"pages": {
			"statusField": "status",
			"publishAtField": "publishAt",
			"fields": {
				"publishAt": {
					"label": "Publicar el",
					"help": "Si la página está en borrador, se publica sola a esta hora. Requiere la extensión vegaschedule en el servidor."
				}
			}
		}
	}
}
```

`publishAtField` must be an optional PocketBase `date` column of that collection, and the type must
have a publication status: a single `select` with `draft` and `published` (the declared
`statusField`, or a field named `status` by convention, exactly as Vega resolves it). A declaration
that does not meet this is logged and skips only its own collection. The manifest is re-read on
every tick: declaring a new type needs no restart. The site seeding (`seedSiteProject`) already
creates `pages.publishAt` and declares it.

## Behaviour

- **Due** means `status = "draft"`, a non-empty date, and `date <= now` (UTC). Published records
  and drafts without a date are never touched.
- **The date is cleared on publication.** It is an instruction, not history: if it stayed, an
  editor sending the page back to draft would see it republished within a minute. Whether it was
  published is the status itself (plus the record's `updated`, if the collection has one, and the
  `vegaschedule: published` log line with the scheduled date).
- **No race with an editor.** Each record is published in its own transaction that rereads it and
  writes only if it is still a due draft. PocketBase funnels every write through one connection,
  so an editor who published it by hand, moved the date or cleared it in the meantime wins; any
  other change they made is kept, because the write starts from the fresh record.
- **One bad record does not stop the others.** The save goes through `app.Save`, so validation and
  every record hook (realtime included) run as for an API edit. A record that fails is logged,
  stays a draft with its date and is retried on the next tick; it never blocks the ones after it.
- **Idempotent.** Once published, a record no longer matches. A tick that starts while the
  previous one is still running does nothing.

## Integrate it

```go
package main

import (
	"log"

	"github.com/fodaveg/vegacms/extensions/vegaschedule"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func main() {
	app := pocketbase.New()

	schedule, err := vegaschedule.New(vegaschedule.Config{})
	if err != nil {
		log.Fatal(err)
	}

	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		if err := schedule.Register(event.App); err != nil {
			return err
		}
		return event.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
```

In a binary that already registers other Vega extensions in its `OnServe` hook (for example a
project's own `internal/project` package), add the `vegaschedule.New` call next to theirs and the
`Register` line inside the same hook. The job shows up in PocketBase's dashboard under
**Settings → Crons** as `vegaschedule`, where it can also be run by hand.

`Config` is optional: `ManifestCollection` (default `vega`), `ManifestKey` (default `default`,
the discovery document's `manifest.key`), `JobID` (default `vegaschedule`; Vega detects the
extension by this id, so changing it makes Vega report it as absent), `Schedule` (default
`* * * * *`) and `OnPublished` below.

### With `vegabuild` in the same binary

A server-rendered site needs nothing else: it reads the new status on the next request. A
prerendered site only shows it after a rebuild, which today a human starts with the Publish button
(`POST /api/vega-build/trigger`). To make a scheduled publication do the same, wire `OnPublished`
to `vegabuild`'s `Trigger`:

```go
build, err := vegabuild.New(vegabuild.Config{ /* as in the vegabuild README */ })
if err != nil {
	log.Fatal(err)
}

schedule, err := vegaschedule.New(vegaschedule.Config{
	OnPublished: func(app core.App, _ []vegaschedule.Published) error {
		_, err := build.Trigger(app)
		if errors.Is(err, vegabuild.ErrRunInProgress) {
			// A build already running may have started before this publication: ask for another
			// one on the next tick instead of assuming it covers it.
			return fmt.Errorf("%w: %w", vegaschedule.ErrRetryLater, err)
		}
		return err
	},
})
if err != nil {
	log.Fatal(err)
}

app.OnServe().BindFunc(func(event *core.ServeEvent) error {
	if err := build.EnsureCollections(event.App); err != nil {
		return err
	}
	build.RegisterRoutes(event)
	if err := schedule.Register(event.App); err != nil {
		return err
	}
	return event.Next()
})
```

`OnPublished` runs once per tick that published something (never on an empty tick). Returning
`vegaschedule.ErrRetryLater` keeps those publications pending and calls it again on the next tick
with them plus any new ones; any other error (a webhook answering 502, say) is logged and not
retried every minute. If the collection has an `updated` autodate field, the Publish button's
pending-changes indicator still shows the publication as unpublished work.

Without `vegabuild`, leave `OnPublished` unset: nothing else happens.

## Limits

- Minute granularity: a page scheduled for 10:00 goes live between 10:00 and 10:01.
- The pending `OnPublished` retry lives in memory: a restart while a build was running drops it
  (the content is published; only the automatic rebuild is lost).
- Single process, like `vegabuild`: several PocketBase replicas would each run the job. The
  per-record transaction keeps that correct (a record is published once), but `OnPublished` could
  fire on more than one replica.

## Verify

```sh
go vet ./...
go test ./...
```
