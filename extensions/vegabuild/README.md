# Vega build-trigger extension for PocketBase

Reference Go implementation of the optional server contract used when a Vega project's discovery
document declares `build.apiBasePath`
(`docs/PROJECT-CONTRACT-v1.md#build-trigger-endpoint-optional`). It is the server-side counterpart
of `src/lib/backend/build-client.ts` and the "Publish" button
(`src/lib/shell/PublishButton.svelte`): without it, the button has nothing to talk to.

Requires **PocketBase 0.39.7 or newer** and Go 1.26 or newer.

It adds:

- `POST {RoutePrefix}/trigger` and `GET {RoutePrefix}/status`, exactly as specified by
  `PROJECT-CONTRACT-v1.md`, authenticated with the same PocketBase record token Vega already sends
  to the rest of its own API;
- a `Runner` abstraction with two ready implementations: `CommandRunner` (run a local command,
  e.g. `npm run build && rsync ...`, on the same machine as PocketBase) and `WebhookRunner`
  (dispatch a secret CI/deploy webhook such as a GitHub Actions `workflow_dispatch`);
- `POST {RoutePrefix}/callback`, an extension of this module and NOT part of
  `PROJECT-CONTRACT-v1.md`, so an asynchronous CI system can report a run's outcome back;
- idempotent PocketBase schema setup for the private `vega_build_runs` support collection;
- automatic reconciliation of a run abandoned mid-flight (PocketBase itself dying, a CI callback
  that never arrives) so "Publish" cannot get stuck forever — see `Config.StaleRunAfter` below.

The extension is deliberately a separate Go module, same reasoning as `extensions/vegaauth`: Vega
itself remains a static SPA and continues to work without a publish step configured at all when
`build` is absent from discovery.

## When you do NOT need this

**A site rendered on the server does not need a publish step at all.** If the Astro project runs
with `output: "server"` and reads its content from PocketBase per request, an editor's save is
already live: there is no artifact to rebuild, and wiring the Publish button would trigger a build
nobody is waiting for. What gates public visibility there is the content itself — the `status`
field and the collection's read rules that `seedSiteProject` writes.

This is not hypothetical. It is exactly the case of Vega's own dogfood site (`astro_fodaveg`,
measured 2026-07-29: `output: "server"`, Node adapter, no page prerendered), and the reason
`vegabuild` is deliberately NOT installed there.

Install it when the site is **prerendered, in whole or in part**, so that content changes only
reach the public after a rebuild — the starter in `vega-astro` being the canonical case.

Second precondition, easy to miss: whatever runs the build has to be _reachable from the server_.
A pipeline that builds an immutable image on the maintainer's laptop and ships it over SSH leaves
the running container with no sources and no toolchain, so neither `CommandRunner` nor
`WebhookRunner` has anything to call. Decide that path before installing, not after.

## Integrate it

### Option A: `CommandRunner`, self-hosted PocketBase + static site build

```go
package main

import (
	"log"
	"time"

	"github.com/fodaveg/vegacms/extensions/vegabuild"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func main() {
	app := pocketbase.New()

	runner, err := vegabuild.NewCommandRunner(vegabuild.CommandConfig{
		Command:        "/opt/example/deploy.sh",
		Dir:            "/opt/example/site",
		LogDir:         "/var/log/vega-build",
		LogURLTemplate: "https://admin.example.com/build-logs/{id}.log",
	})
	if err != nil {
		log.Fatal(err)
	}

	build, err := vegabuild.New(vegabuild.Config{
		RoutePrefix:     "/api/vega-build",
		Runner:          runner,
		AuthCollections: []string{"vega_editors"},
		// Must stay comfortably above CommandConfig.Timeout above, or a legitimate long build gets
		// marked abandoned while it is still running — see Config.StaleRunAfter's doc comment.
		StaleRunAfter: 30 * time.Minute,
	})
	if err != nil {
		log.Fatal(err)
	}

	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		if err := build.EnsureCollections(event.App); err != nil {
			return err
		}
		build.RegisterRoutes(event)
		return event.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
```

### Option B: `WebhookRunner`, dispatch a CI webhook and wait for its callback

```go
package main

import (
	"log"
	"os"

	"github.com/fodaveg/vegacms/extensions/vegabuild"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func main() {
	app := pocketbase.New()

	runner, err := vegabuild.NewWebhookRunner(vegabuild.WebhookConfig{
		URL:     os.Getenv("VEGA_DEPLOY_WEBHOOK_URL"), // a secret, never hardcoded or logged
		Headers: map[string]string{"Authorization": "Bearer " + os.Getenv("VEGA_DEPLOY_WEBHOOK_TOKEN")},
		Body:    `{"ref":"main"}`,
	})
	if err != nil {
		log.Fatal(err)
	}

	build, err := vegabuild.New(vegabuild.Config{
		RoutePrefix:     "/api/vega-build",
		Runner:          runner,
		AuthCollections: []string{"vega_editors"},
		CallbackSecret:  os.Getenv("VEGA_BUILD_CALLBACK_SECRET"), // >= 16 chars, required here
	})
	if err != nil {
		log.Fatal(err)
	}

	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		if err := build.EnsureCollections(event.App); err != nil {
			return err
		}
		build.RegisterRoutes(event)
		return event.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
```

Your CI pipeline then reports back at the end of its own run:

```http
POST /api/vega-build/callback
X-Vega-Build-Secret: <VEGA_BUILD_CALLBACK_SECRET>
Content-Type: application/json

{ "id": "<the id /trigger returned>", "state": "ok", "logUrl": "https://ci.example/run/123" }
```

Then configure the project's discovery document:

```json
{
	"build": { "apiBasePath": "/api/vega-build" }
}
```

## Security notes

- The webhook URL (and any header/body configured on `WebhookRunner`) is a credential. It is never
  embedded in Vega's discovery document, and any error this extension surfaces to editors never
  quotes it: a non-2xx webhook response is reported only as an HTTP status code.
- `POST {RoutePrefix}/callback` is the only route with no `RequireAuth`: the caller is CI
  infrastructure with no PocketBase account. `X-Vega-Build-Secret`, compared in constant time, is
  its ONLY gate — keep it as secret as the webhook URL itself, and at least 16 characters (`New`
  refuses shorter ones). `logUrl`/`detail` sent through it are capped (a few KB) and silently
  truncated, never allowed to grow a run record without bound.
- `CommandRunner.Command`/`Args` are fixed by the operator at process startup. Nothing from an
  HTTP request ever reaches the command line or environment of the spawned process. A panic inside
  the goroutine that waits for the child process is recovered and reported as a failed run instead
  of crashing the whole PocketBase process.
- `WebhookRunner.Start` calls the webhook **synchronously**, inside the `/trigger` request, on
  purpose: an honest `502` when the dispatch itself fails is worth more than a `202` that lies.
  Keep `WebhookConfig.Timeout` short (default 15s) since it is on that request's critical path.
- `vega_build_runs` (configurable via `RunsCollection`) has no public API rules: the only sanctioned
  way to read a run's state is `GET {RoutePrefix}/status`.
- `Config.StaleRunAfter` (default 1h) closes a run stuck in `"running"` — nobody ever reporting or
  calling back — as failed, so `/trigger` cannot stay `409` forever. Keep it comfortably above how
  long a run can legitimately take (in particular, above `CommandConfig.Timeout` for a
  `CommandRunner`), or a live build can be marked abandoned while still working.
- `startNewRun`'s "one run at a time" guard is a **process-local** lock: a multi-replica deployment
  (several PocketBase processes behind a load balancer) needs a database-level guard instead, e.g.
  a partial unique index enforcing at most one `vega_build_runs` row with `state = 'running'`. Out
  of scope for this reference implementation, same assumption `extensions/vegaauth` makes for its
  in-memory challenge stores.

## Verify

```sh
go vet ./...
go test ./...
```
