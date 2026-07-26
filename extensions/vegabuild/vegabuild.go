// Package vegabuild is the reference implementation of the optional "build trigger" server
// contract documented in `docs/PROJECT-CONTRACT-v1.md#build-trigger-endpoint-optional`: it is the
// server-side counterpart of `src/lib/backend/build-client.ts` and the "Publish" button
// (`src/lib/shell/PublishButton.svelte`). A project declares `build.apiBasePath` in its discovery
// document and points it at a PocketBase running this extension (or an equivalent implementation,
// see `docs/POCKETBASE-INTEGRATION.md#publicación-disparador-de-build`); Vega itself never learns
// the real deploy webhook, only this project-owned route.
//
// `/trigger` and `/status` implement the contract above and nothing more. `POST /callback` is an
// extension of THIS module, not part of the Vega<->project contract: it exists so an asynchronous
// Runner (a CI pipeline that runs somewhere else entirely, see WebhookRunner in webhook.go) has a
// way to report its outcome back into PocketBase. `PROJECT-CONTRACT-v1.md` doesn't know this route
// exists and doesn't need to: Vega never calls it.
package vegabuild

import (
	"context"
	"crypto/subtle"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// defaultStaleRunAfter is how long a run may sit in "running" before reconcileStaleRun gives up
// on ever hearing back about it and closes it as failed. See Config.StaleRunAfter.
const defaultStaleRunAfter = time.Hour

// closeSaveRetries/closeSaveBackoff bound the short retry closeRun attempts before giving up on
// persisting a terminal state. report is called AT MOST ONCE per run (see the Runner contract), so
// if that single write fails outright nobody will retry it for us on their own; a couple of quick
// attempts are cheap insurance against a transient blip. reconcileStaleRun is the real backstop if
// every attempt here still fails — the run is not stuck forever, just slower to be noticed.
const (
	closeSaveRetries = 3
	closeSaveBackoff = 20 * time.Millisecond
)

// Text field length caps enforced on values written by POST /callback (see schema.go and
// closeRun/applyHandoff): that route is called by CI infrastructure, not by Vega itself, and
// nothing about its authentication limits how large a body it can send.
const (
	maxDetailLength      = 4096
	maxLogURLLength      = 2048
	maxExternalRefLength = 512
)

// Run states, stored verbatim in the `state` field of RunsCollection and emitted verbatim in the
// `state` key of `GET /status`.
const (
	runStateIdle    = "idle"
	runStateRunning = "running"
	runStateOK      = "ok"
	runStateFailed  = "failed"
)

// timestampLayout is the ONLY timestamp shape this extension ever writes or emits: RFC 3339 with
// millisecond precision and a literal "Z" (UTC), e.g. "2026-07-20T09:00:00.000Z".
//
// This is deliberately NOT a PocketBase `date` field: PocketBase serializes those as
// "2006-01-02 15:04:05.000Z" (a space instead of "T"), which is not valid ISO 8601. The client
// (`src/lib/backend/unpublished-changes.ts#isAfter`) feeds these strings straight into
// `Date.parse` without any adapter in between, and an unparseable string does NOT throw there: it
// silently degrades to "no pending changes", i.e. a lie in the UI that nobody would notice until
// an editor loses real unpublished work off their radar. So these fields are plain TEXT columns
// (see schema.go) and this exact layout is the only thing ever written to them or read from them.
const timestampLayout = "2006-01-02T15:04:05.000Z"

// Result is what a Runner reports once a run is known to have finished, through the `report`
// callback handed to Start.
type Result struct {
	// OK is true when the build/deploy succeeded. Anything else is reported as "failed".
	OK bool
	// LogURL, if non-empty, overrides the log URL recorded for the run (the CommandRunner's own
	// log page, or a CI job URL for a Runner that only learns it once the run is under way).
	LogURL string
	// Detail is a short human-readable explanation, stored and surfaced only for a failed run.
	Detail string
}

// Handoff is what a Runner returns from a successful Start call: whatever it already knows about
// the run before it has actually finished.
type Handoff struct {
	// ExternalRef is the run identifier assigned by the underlying provider (a GitHub Actions run
	// id, a Netlify deploy id...), if the provider hands one back synchronously. It is NEVER the id
	// returned to the HTTP caller of `/trigger` — that is always the id of PocketBase's own run
	// record, because some providers (a GitHub `workflow_dispatch`) answer with 204 and no id at
	// all, so there may be nothing here to expose.
	ExternalRef string
	// LogURL, if already known when Start returns, is recorded on the run immediately instead of
	// waiting for the eventual report.
	LogURL string
}

// Runner abstracts over how a build is actually triggered. See command.go (CommandRunner, for a
// self-hosted PocketBase + static site on the same machine) and webhook.go (WebhookRunner, for a
// server-to-server dispatch against a secret CI/deploy webhook) for the two implementations this
// module ships.
type Runner interface {
	// Start triggers the run and MUST return without waiting for the build to finish — `/trigger`
	// answers the HTTP caller as soon as Start returns.
	//
	// report may be called from another goroutine, at most once per run: extra calls, or a call
	// once the run is already terminal, are silently ignored (they are not an error — a Runner
	// racing itself, or retried by its own transport, must never panic or corrupt state).
	Start(ctx context.Context, runID string, report func(Result)) (Handoff, error)
	// Completes reports whether this Runner closes its own runs by calling report. A Runner that
	// answers false leaves every run in "running" forever unless something else (POST /callback)
	// closes it — see the fail-closed guard in New.
	Completes() bool
}

// Config carries every deployment-specific value. No hostname, secret or collection name from
// Vega's own dogfood project is embedded in the extension.
type Config struct {
	// RoutePrefix is where the three routes below are mounted, e.g. "/api/vega-build" (default).
	RoutePrefix string
	// Runner is required: it is the actual mechanism that triggers a build.
	Runner Runner
	// AuthCollections restricts which auth collections may call /trigger and /status. Empty means
	// any authenticated record, of any auth collection, is accepted.
	AuthCollections []string
	// RunsCollection is the PocketBase collection backing every run record, default
	// "vega_build_runs".
	RunsCollection string
	// CallbackSecret gates POST /callback (see the header comment for why that route has no
	// PocketBase Authorization to check instead). Required whenever Runner.Completes() is false.
	CallbackSecret string
	// StaleRunAfter bounds how long a run may stay "running" before reconcileStaleRun gives up on
	// it and closes it as failed (see that method's docstring for why this exists at all).
	// Default 1 hour when left zero; a negative value is rejected by New.
	//
	// This MUST stay comfortably above how long a real run can legitimately take, or a live build
	// gets marked abandoned while it is still working. In particular, if Runner is a CommandRunner,
	// keep StaleRunAfter greater than CommandConfig.Timeout: CommandRunner already kills and
	// reports a run that overruns its own Timeout, so StaleRunAfter only needs to cover the gap
	// between that and "the whole PocketBase process died and nobody is left to report anything at
	// all" — a WebhookRunner build's real end-to-end duration is a project-specific question only
	// the operator configuring this Config can answer.
	StaleRunAfter time.Duration
	// Clock is injectable for tests; defaults to time.Now.
	Clock func() time.Time
}

func (c Config) normalized() (Config, error) {
	c.RoutePrefix = strings.TrimRight(strings.TrimSpace(c.RoutePrefix), "/")
	if c.RoutePrefix == "" {
		c.RoutePrefix = "/api/vega-build"
	}
	if !strings.HasPrefix(c.RoutePrefix, "/api/") {
		return c, fmt.Errorf("vegabuild: RoutePrefix must be a relative /api/... path")
	}
	if strings.Contains(c.RoutePrefix, "//") {
		return c, fmt.Errorf("vegabuild: RoutePrefix must not contain \"//\"")
	}
	c.RunsCollection = strings.TrimSpace(c.RunsCollection)
	if c.RunsCollection == "" {
		c.RunsCollection = "vega_build_runs"
	}
	if c.StaleRunAfter == 0 {
		c.StaleRunAfter = defaultStaleRunAfter
	}
	if c.Clock == nil {
		c.Clock = time.Now
	}
	return c, nil
}

// Extension is the installed build-trigger endpoint. Construct it with New, then call
// EnsureCollections and RegisterRoutes from an `OnServe` hook, mirroring extensions/vegaauth.
type Extension struct {
	config Config

	// reportMu serializes every state transition of a run (the HTTP trigger/callback handlers and
	// a Runner's own asynchronous report callback all go through closeRun), so "at most once" in
	// the Runner contract above is actually true even under a concurrent retry.
	reportMu sync.Mutex

	// triggerMu serializes the "is a run already in progress" check and the creation of a new run
	// record in startNewRun. It is a SEPARATE lock from reportMu (never held at the same time by
	// the same goroutine: startNewRun's own call into reconcileStaleRun/closeRun would otherwise
	// deadlock against itself) and is scoped tightly to that check-then-create, never held across
	// the (potentially slow) call to Runner.Start.
	triggerMu sync.Mutex
}

// New validates config and returns a ready-to-install Extension. Every guard here is fail-closed:
// an ambiguous or half-configured Extension refuses to exist rather than silently misbehave once
// installed.
func New(config Config) (*Extension, error) {
	config, err := config.normalized()
	if err != nil {
		return nil, err
	}
	if config.Runner == nil {
		return nil, fmt.Errorf("vegabuild: Runner is required")
	}
	if !config.Runner.Completes() && config.CallbackSecret == "" {
		return nil, fmt.Errorf(
			"vegabuild: CallbackSecret is required when Runner does not complete its own runs " +
				"(every run would stay \"running\" forever and the Publish button would poll " +
				"without end)",
		)
	}
	if config.CallbackSecret != "" && len(config.CallbackSecret) < 16 {
		return nil, fmt.Errorf(
			"vegabuild: CallbackSecret must be at least 16 characters (it is the only gate of an " +
				"unauthenticated route)",
		)
	}
	if config.StaleRunAfter <= 0 {
		return nil, fmt.Errorf("vegabuild: StaleRunAfter must be greater than zero")
	}
	return &Extension{config: config}, nil
}

// RegisterRoutes installs the routes under Config.RoutePrefix. /trigger and /status require a
// valid PocketBase record token (the SAME token Vega already sends to the rest of its own API,
// with no "Bearer" prefix — see build-client.ts). /callback is registered only when a
// CallbackSecret is configured, and deliberately carries no RequireAuth: the caller is a CI system
// with no PocketBase account, gated by X-Vega-Build-Secret instead (see callbackHandler).
func (x *Extension) RegisterRoutes(se *core.ServeEvent) {
	prefix := x.config.RoutePrefix
	se.Router.POST(prefix+"/trigger", x.triggerHandler).Bind(apis.RequireAuth(x.config.AuthCollections...))
	se.Router.GET(prefix+"/status", x.statusHandler).Bind(apis.RequireAuth(x.config.AuthCollections...))
	if x.config.CallbackSecret != "" {
		se.Router.POST(prefix+"/callback", x.callbackHandler)
	}
}

// now formats the current time (or Config.Clock, in tests) using timestampLayout — the single
// choke point that guarantees every timestamp this extension writes has that exact shape.
func (x *Extension) now() string {
	clock := x.config.Clock
	if clock == nil {
		clock = time.Now
	}
	return clock().UTC().Format(timestampLayout)
}

// currentRun returns the run of record: the one with the greatest `created`, ties broken by the
// greatest id. nil, nil means no run has ever been created.
//
// PocketBase ids are NOT chronological: `core.GenerateDefaultRandomId` is pure randomness, not a
// monotonic counter (verified against `core/db.go` while building this extension). So this
// tiebreaker is deterministic — the query always resolves to exactly one row — but NOT guaranteed
// to pick the temporally later of two runs that land in the same millisecond of `created` (the
// precision that field is truncated to, see timestampLayout). That is fine in practice: the only
// way two runs can share a millisecond at all is starting a new run within a millisecond of the
// previous one's real close, and startNewRun's lock means the previous run must already be
// terminal before a new one can be created — a database round trip alone reliably takes longer
// than that. A test that fires two triggers back-to-back in the same process, with nothing but an
// in-memory sqlite round trip between them, is the one place fast enough to actually hit this tie;
// see vegabuild_test.go for the explicit `time.Sleep` that avoids it there.
func (x *Extension) currentRun(app core.App) (*core.Record, error) {
	records, err := app.FindRecordsByFilter(x.config.RunsCollection, "", "-created,-id", 1, 0)
	if err != nil {
		return nil, fmt.Errorf("vegabuild: query current run: %w", err)
	}
	if len(records) == 0 {
		return nil, nil
	}
	return records[0], nil
}

// lastOkRun returns the most recently created run whose state is "ok", or nil if none ever
// succeeded. This can be, and often is, an OLDER run than currentRun: a build that later fails
// must never erase the record of the last good publish.
func (x *Extension) lastOkRun(app core.App) (*core.Record, error) {
	records, err := app.FindRecordsByFilter(
		x.config.RunsCollection, "state = {:state}", "-created,-id", 1, 0,
		dbx.Params{"state": runStateOK},
	)
	if err != nil {
		return nil, fmt.Errorf("vegabuild: query last successful run: %w", err)
	}
	if len(records) == 0 {
		return nil, nil
	}
	return records[0], nil
}

// statusResponse is the exact, always-complete shape of GET /status (§contract). Every field is a
// pointer (or the plain string for the required "state") so an absent value marshals as JSON
// `null`, never an omitted key or an empty string — a caller doing `if (status.logUrl)` must see a
// real absence, not a truthy empty string.
type statusResponse struct {
	State           string  `json:"state"`
	StartedAt       *string `json:"startedAt"`
	FinishedAt      *string `json:"finishedAt"`
	LastPublishedAt *string `json:"lastPublishedAt"`
	LogURL          *string `json:"logUrl"`
}

// stringOrNil turns PocketBase's zero value for an unset text field ("") into a real nil, so it
// serializes as JSON null instead of an empty string.
func stringOrNil(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

// truncate caps value at max bytes. Used on every string POST /callback (an untrusted CI system,
// not Vega itself) can influence before it reaches a TEXT field — see the matching Max on the
// field itself in schema.go — so an oversized value is silently capped instead of failing the
// save outright and leaving the run stuck.
func truncate(value string, max int) string {
	if max <= 0 || len(value) <= max {
		return value
	}
	return value[:max]
}

// buildStatus derives the full GET /status response.
//
// The derivation, spelled out because none of it is obvious from the schema alone:
//   - the "current" run is the one with the greatest `created` (ties broken by id, see
//     currentRun); `state` is idle ONLY when there has never been any run at all.
//   - startedAt/finishedAt/logUrl always describe the CURRENT run, even a failed or still-running
//     one — a caller must be able to see "the last thing that happened", not just the last success.
//   - lastPublishedAt is the finishedAt of the most recent run that finished "ok", which can be
//     OLDER than the current run: a build that fails after a previous success must not make it
//     look like nothing has ever been published.
func (x *Extension) buildStatus(app core.App) (statusResponse, error) {
	status := statusResponse{State: runStateIdle}

	current, err := x.currentRun(app)
	if err != nil {
		return statusResponse{}, err
	}
	if current != nil {
		status.State = current.GetString("state")
		status.StartedAt = stringOrNil(current.GetString("startedAt"))
		status.FinishedAt = stringOrNil(current.GetString("finishedAt"))
		status.LogURL = stringOrNil(current.GetString("logUrl"))
	}

	lastOK, err := x.lastOkRun(app)
	if err != nil {
		return statusResponse{}, err
	}
	if lastOK != nil {
		status.LastPublishedAt = stringOrNil(lastOK.GetString("finishedAt"))
	}

	return status, nil
}

// reconcileStaleRun closes the current run as failed if it has been "running" for longer than
// Config.StaleRunAfter.
//
// Without this, a run that nobody ever reports on (PocketBase itself dies mid-build — the very
// build this module triggers can take the process down with it; a WebhookRunner's CI never calls
// back because its secret was mistyped or its own script has a bug) stays "running" FOREVER: that
// is the worst failure mode of this whole module, because it makes /trigger answer 409 forever
// too, and "Publish" stays dead until someone edits the database by hand.
//
// This is deliberately LAZY: no background timer, no OnServe hook, nothing running while no one is
// asking. It runs inline on every request that needs to know the truth about the current run —
// GET /status, and POST /trigger's startNewRun BEFORE its own "already running" 409 guard, since
// that guard is exactly what a stuck row would leave permanently closed.
//
// A `startedAt` that fails to parse is treated as abandoned TOO, closed the exact same way,
// instead of returning an error. This is the third time this module has had to learn the same
// lesson (see applyHandoff and startNewRun's own docstrings for the first two): both callers of
// this method are themselves the only two roads back to a healthy state (GET /status and
// /trigger's own guard), so an error propagated out of here does not just fail one request — it
// makes the run permanently unrecoverable through EITHER of them, which is worse than the "stuck
// running" failure mode this method exists to cure in the first place, because now the state
// cannot even be read. No value that can ever land in that column is allowed to wedge the module
// shut; a garbled timestamp is just another way for a run to have gone wrong, not a reason to stop
// being able to say so.
func (x *Extension) reconcileStaleRun(app core.App) error {
	current, err := x.currentRun(app)
	if err != nil {
		return err
	}
	if current == nil || current.GetString("state") != runStateRunning {
		return nil
	}
	startedAt, parseErr := time.Parse(timestampLayout, current.GetString("startedAt"))
	var detail string
	switch {
	case parseErr != nil:
		detail = fmt.Sprintf("abandoned: its startedAt (%q) could not be parsed", current.GetString("startedAt"))
	case x.config.Clock().Sub(startedAt) >= x.config.StaleRunAfter:
		detail = fmt.Sprintf("abandoned: no report or callback within %s of starting", x.config.StaleRunAfter)
	default:
		return nil
	}
	_, err = x.closeRun(app, current.Id, runStateFailed, "", detail)
	return err
}

func (x *Extension) statusHandler(e *core.RequestEvent) error {
	if err := x.reconcileStaleRun(e.App); err != nil {
		return err
	}
	status, err := x.buildStatus(e.App)
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, status)
}

// startNewRun atomically reconciles any abandoned run, checks whether a run is already in
// progress and, if not, creates the new "running" record — all under triggerMu, so two /trigger
// requests separated only by real network latency can never both pass the check and have, say,
// CommandRunner execute the same deploy twice. Returns (nil, nil) when a run is already in
// progress (the caller turns that into 409); the lock is released before Runner.Start is ever
// called, so a slow build never blocks a concurrent status check or the next trigger's 409.
//
// This lock is per-PROCESS ONLY: a multi-replica deployment (several PocketBase processes behind a
// load balancer) would need a database-level guard instead — e.g. a partial unique index enforcing
// at most one row with state = 'running' — since separate processes share no memory. That is out
// of scope for this reference implementation, which assumes a single PocketBase process, the same
// assumption extensions/vegaauth makes for its in-memory challenge stores.
func (x *Extension) startNewRun(app core.App) (*core.Record, error) {
	x.triggerMu.Lock()
	defer x.triggerMu.Unlock()

	if err := x.reconcileStaleRun(app); err != nil {
		return nil, err
	}
	current, err := x.currentRun(app)
	if err != nil {
		return nil, err
	}
	if current != nil && current.GetString("state") == runStateRunning {
		return nil, nil
	}

	collection, err := app.FindCollectionByNameOrId(x.config.RunsCollection)
	if err != nil {
		return nil, fmt.Errorf("vegabuild: runs collection %q not found: %w", x.config.RunsCollection, err)
	}
	run := core.NewRecord(collection)
	run.Set("state", runStateRunning)
	run.Set("startedAt", x.now())
	if err := app.Save(run); err != nil {
		return nil, fmt.Errorf("vegabuild: create run record: %w", err)
	}
	return run, nil
}

// applyHandoff records what a Runner already knows right after a successful Start: an
// ExternalRef and/or a LogURL. It rereads the run FRESH under reportMu and writes only if it is
// still "running".
//
// This matters because Start can return successfully AFTER report has already been called and the
// run closed — a Runner that completes synchronously inside Start (a fast CommandRunner, say) is
// explicitly allowed to do this by the Runner contract. Blindly saving the stale in-memory `run`
// this handler still holds (state "running", no finishedAt) would silently resurrect an already
// finished run back to "running" forever — the same two-writers-of-one-record landmine that once
// bit the settings SPA, fixed here the same way it was fixed there: reread fresh under the lock and
// refuse to write over a state that has moved on, rather than merely narrowing the window.
func (x *Extension) applyHandoff(app core.App, runID string, handoff Handoff) error {
	if handoff.ExternalRef == "" && handoff.LogURL == "" {
		return nil
	}
	x.reportMu.Lock()
	defer x.reportMu.Unlock()

	run, err := app.FindRecordById(x.config.RunsCollection, runID)
	if err != nil {
		return fmt.Errorf("vegabuild: reload run for handoff: %w", err)
	}
	if run.GetString("state") != runStateRunning {
		// Already closed by report/callback in the meantime; that report is more current than a
		// Handoff formed before Start even returned. Leave it alone.
		return nil
	}
	if handoff.ExternalRef != "" {
		run.Set("externalRef", truncate(handoff.ExternalRef, maxExternalRefLength))
	}
	if handoff.LogURL != "" {
		run.Set("logUrl", truncate(handoff.LogURL, maxLogURLLength))
	}
	if err := app.Save(run); err != nil {
		return fmt.Errorf("vegabuild: save run handoff: %w", err)
	}
	return nil
}

func (x *Extension) triggerHandler(e *core.RequestEvent) error {
	run, err := x.startNewRun(e.App)
	if err != nil {
		return err
	}
	if run == nil {
		return apis.NewApiError(http.StatusConflict, "a build is already running", nil)
	}
	runID := run.Id

	// Start MUST NOT be tied to this HTTP request's context: the request handler (and its context)
	// is about to return, but the build itself, and the goroutine that eventually calls report,
	// keeps running well beyond that.
	app := e.App
	handoff, startErr := x.config.Runner.Start(context.Background(), runID, func(result Result) {
		state := runStateFailed
		if result.OK {
			state = runStateOK
		}
		if _, err := x.closeRun(app, runID, state, result.LogURL, result.Detail); err != nil {
			app.Logger().Error("vegabuild: failed to record run outcome", "run", runID, "error", err)
		}
	})
	if startErr != nil {
		// Route the failure through closeRun (not a direct Set+Save on the stale in-memory `run`):
		// the same reread-fresh discipline as applyHandoff, in case a Runner that errors out of
		// Start still managed to call report first.
		if _, err := x.closeRun(app, runID, runStateFailed, "", startErr.Error()); err != nil {
			return err
		}
		return apis.NewApiError(http.StatusBadGateway, "failed to start the build: "+startErr.Error(), nil)
	}

	if err := x.applyHandoff(app, runID, handoff); err != nil {
		return err
	}

	return e.JSON(http.StatusAccepted, map[string]string{"id": runID})
}

// closeOutcome is the internal result of attempting to close a run, shared by the Runner-driven
// report path (triggerHandler) and the CI-driven callback path (callbackHandler) so both apply the
// exact same "at most once, ignore the rest" rule.
type closeOutcome int

const (
	closeApplied closeOutcome = iota
	closeAlreadySame
	closeConflict
	closeNotFound
)

// closeRun transitions a single run to a terminal state, or reports why it did not:
//   - the run does not exist at all: closeNotFound;
//   - the run is already terminal with the SAME state: closeAlreadySame (an idempotent retry, e.g.
//     the CI callback firing twice, is not an error);
//   - the run is already terminal with a DIFFERENT state: closeConflict (two contradictory reports
//     about the same run — surfaced, never silently overwritten);
//   - the run is still "running": closeApplied, and it is transitioned.
//
// The whole read-decide-write sequence is under reportMu so a Runner's own report callback and a
// concurrent /callback (or a retried one) can never race each other into a double transition.
func (x *Extension) closeRun(app core.App, runID, state, logURL, detail string) (closeOutcome, error) {
	x.reportMu.Lock()
	defer x.reportMu.Unlock()

	run, err := app.FindRecordById(x.config.RunsCollection, runID)
	if err != nil {
		return closeNotFound, nil
	}

	current := run.GetString("state")
	if current != runStateRunning {
		if current == state {
			return closeAlreadySame, nil
		}
		return closeConflict, nil
	}

	run.Set("state", state)
	run.Set("finishedAt", x.now())
	if logURL != "" {
		run.Set("logUrl", truncate(logURL, maxLogURLLength))
	}
	if detail != "" {
		run.Set("detail", truncate(detail, maxDetailLength))
	}

	// report is called AT MOST ONCE per run, so a save failure here has no one left to retry it —
	// a short retry with backoff is cheap insurance against a transient blip (a momentary
	// SQLITE_BUSY under load, say) before giving up. reconcileStaleRun is the real backstop if
	// every attempt below still fails: the run is not stuck forever, just slower to be noticed.
	// There is no cheap, honest way to force a real app.Save failure in this module's test suite
	// (see the header comment in vegabuild_test.go), so this retry path itself is untested.
	var saveErr error
	for attempt := 0; attempt < closeSaveRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(closeSaveBackoff * time.Duration(attempt))
		}
		if saveErr = app.Save(run); saveErr == nil {
			return closeApplied, nil
		}
	}
	return closeApplied, fmt.Errorf("vegabuild: save closed run after %d attempts: %w", closeSaveRetries, saveErr)
}

// callbackBody is the JSON body a CI system posts to close a run it owns (a WebhookRunner run,
// see webhook.go). Not part of PROJECT-CONTRACT-v1.md — see the package doc.
type callbackBody struct {
	ID     string `json:"id"`
	State  string `json:"state"`
	LogURL string `json:"logUrl"`
	Detail string `json:"detail"`
}

// callbackHandler closes a run reported by an external CI system. It carries no RequireAuth: the
// caller is CI infrastructure, which has no PocketBase editor token to send. X-Vega-Build-Secret,
// compared in constant time, is the ONLY gate on this route — get it wrong and the request is
// rejected before the state of any run is even looked at.
func (x *Extension) callbackHandler(e *core.RequestEvent) error {
	secret := e.Request.Header.Get("X-Vega-Build-Secret")
	if subtle.ConstantTimeCompare([]byte(secret), []byte(x.config.CallbackSecret)) != 1 {
		return e.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid_secret"})
	}

	var body callbackBody
	if err := e.BindBody(&body); err != nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "bad_request"})
	}
	if body.ID == "" || (body.State != runStateOK && body.State != runStateFailed) {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "invalid_body"})
	}

	outcome, err := x.closeRun(e.App, body.ID, body.State, body.LogURL, body.Detail)
	if err != nil {
		return err
	}
	switch outcome {
	case closeApplied, closeAlreadySame:
		return e.JSON(http.StatusOK, map[string]bool{"ok": true})
	case closeConflict:
		return e.JSON(http.StatusConflict, map[string]string{"error": "state_conflict"})
	default: // closeNotFound
		return e.JSON(http.StatusNotFound, map[string]string{"error": "unknown_run"})
	}
}
