package vegabuild

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/hook"
)

// fakeRunner is a Runner whose Start behaviour and Completes() answer are entirely controlled by
// the test, so trigger/report/callback interactions can be exercised without a real process or
// network call.
type fakeRunner struct {
	mu         sync.Mutex
	completes  bool
	startErr   error
	handoff    Handoff
	startCount int
	// reportDuringStart, if non-nil, is reported (i.e. closes the run) SYNCHRONOUSLY inside Start,
	// before Start returns its own Handoff below — reproducing a Runner (a fast CommandRunner, say)
	// that completes before /trigger's handler even gets to look at the Handoff it returned.
	reportDuringStart *Result
}

func (r *fakeRunner) Start(_ context.Context, _ string, report func(Result)) (Handoff, error) {
	r.mu.Lock()
	r.startCount++
	reportDuringStart := r.reportDuringStart
	startErr := r.startErr
	handoff := r.handoff
	r.mu.Unlock()

	if reportDuringStart != nil {
		report(*reportDuringStart)
	}
	if startErr != nil {
		return Handoff{}, startErr
	}
	return handoff, nil
}

func (r *fakeRunner) Completes() bool { return r.completes }

func (r *fakeRunner) starts() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.startCount
}

func newTestApp(t *testing.T) core.App {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	return app
}

func newTestMux(t *testing.T, app core.App, extension *Extension) http.Handler {
	t.Helper()
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	extension.RegisterRoutes(&core.ServeEvent{App: app, Router: router})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	return mux
}

// newAuthToken creates a throwaway vega_editors record and returns a valid PocketBase token for
// it, ready to use in an Authorization header.
func newAuthToken(t *testing.T, app core.App) string {
	return newAuthTokenForCollection(t, app, "vega_editors")
}

func newAuthTokenForCollection(t *testing.T, app core.App, collectionName string) string {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		collection = core.NewAuthCollection(collectionName)
		if err := app.Save(collection); err != nil {
			t.Fatal(err)
		}
	}
	record := core.NewRecord(collection)
	record.SetEmail("editor@example.com")
	record.SetPassword("password for tests")
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	token, err := record.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func doRequest(mux http.Handler, method, path, token, body string) *httptest.ResponseRecorder {
	var reader *strings.Reader
	if body != "" {
		reader = strings.NewReader(body)
	} else {
		reader = strings.NewReader("")
	}
	request := httptest.NewRequest(method, path, reader)
	if token != "" {
		request.Header.Set("Authorization", token)
	}
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}

func decodeJSON(t *testing.T, response *httptest.ResponseRecorder, out any) {
	t.Helper()
	if err := json.Unmarshal(response.Body.Bytes(), out); err != nil {
		t.Fatalf("could not decode JSON body %q: %v", response.Body.String(), err)
	}
}

func TestConfigDefaultsAndGuards(t *testing.T) {
	config, err := (Config{
		Runner:          &fakeRunner{completes: true},
		AuthCollections: []string{"vega_editors"},
	}).normalized()
	if err != nil {
		t.Fatal(err)
	}
	if config.RoutePrefix != "/api/vega-build" || config.RunsCollection != "vega_build_runs" ||
		config.StaleRunAfter != time.Hour {
		t.Fatalf("unexpected defaults: %#v", config)
	}

	if _, err := (Config{RoutePrefix: "https://build.example/api"}).normalized(); err == nil {
		t.Fatal("expected an absolute route prefix to be rejected")
	}
	if _, err := (Config{RoutePrefix: "/api//build"}).normalized(); err == nil {
		t.Fatal(`expected a route prefix containing "//" to be rejected`)
	}

	if _, err := New(Config{AuthCollections: []string{"vega_editors"}}); err == nil {
		t.Fatal("expected a nil Runner to be rejected")
	}
	if _, err := New(Config{
		Runner:          &fakeRunner{completes: false},
		AuthCollections: []string{"vega_editors"},
	}); err == nil {
		t.Fatal("expected a non-completing Runner without CallbackSecret to be rejected")
	}
	if _, err := New(Config{
		Runner:          &fakeRunner{completes: false},
		AuthCollections: []string{"vega_editors"},
		CallbackSecret:  "short",
	}); err == nil {
		t.Fatal("expected a CallbackSecret under 16 characters to be rejected")
	}
	if _, err := New(Config{
		Runner:          &fakeRunner{completes: true},
		AuthCollections: []string{"vega_editors"},
		StaleRunAfter:   -time.Minute,
	}); err == nil {
		t.Fatal("expected a negative StaleRunAfter to be rejected")
	}
	if _, err := New(Config{
		Runner:          &fakeRunner{completes: true},
		AuthCollections: []string{"vega_editors"},
	}); err != nil {
		t.Fatalf("a completing Runner without CallbackSecret must be accepted: %v", err)
	}
}

func TestAuthCollectionsRejectInvalidEntriesWithActionableErrors(t *testing.T) {
	testCases := []struct {
		name       string
		allowlist  []string
		wantErrMsg string
	}{
		{
			name:       "nil",
			allowlist:  nil,
			wantErrMsg: "vegabuild: AuthCollections must contain at least one exact auth collection name; configure the allowlist before starting",
		},
		{
			name:       "empty",
			allowlist:  []string{},
			wantErrMsg: "vegabuild: AuthCollections must contain at least one exact auth collection name; configure the allowlist before starting",
		},
		{
			name:       "empty entry",
			allowlist:  []string{""},
			wantErrMsg: `vegabuild: AuthCollections[0] "" is empty; remove it or correct it to an exact auth collection name`,
		},
		{
			name:       "blank entry",
			allowlist:  []string{" "},
			wantErrMsg: `vegabuild: AuthCollections[0] " " is blank; remove it or correct it to an exact auth collection name`,
		},
		{
			name:       "surrounding whitespace",
			allowlist:  []string{" vega_editors "},
			wantErrMsg: `vegabuild: AuthCollections[0] " vega_editors " has leading or trailing whitespace; remove it or correct it to the exact auth collection name`,
		},
		{
			name:       "mixed valid and blank",
			allowlist:  []string{"vega_editors", " "},
			wantErrMsg: `vegabuild: AuthCollections[1] " " is blank; remove it or correct it to an exact auth collection name`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := New(Config{
				Runner:          &fakeRunner{completes: true},
				AuthCollections: testCase.allowlist,
			})
			if err == nil {
				t.Fatal("expected New to reject the invalid AuthCollections")
			}
			if err.Error() != testCase.wantErrMsg {
				t.Fatalf("unexpected error:\n got: %q\nwant: %q", err.Error(), testCase.wantErrMsg)
			}
		})
	}
}

func TestAuthCollectionsReachRequireAuthWithoutRewriteOrDeduplication(t *testing.T) {
	originalRequireAuth := requireAuth
	t.Cleanup(func() { requireAuth = originalRequireAuth })

	var received [][]string
	requireAuth = func(collections ...string) *hook.Handler[*core.RequestEvent] {
		received = append(received, collections)
		return apis.RequireAuth(collections...)
	}

	allowlist := []string{"vega_editors", "vega_editors"}
	extension, err := New(Config{
		Runner:          &fakeRunner{completes: true},
		AuthCollections: allowlist,
	})
	if err != nil {
		t.Fatalf("a duplicate allowlist entry must be accepted: %v", err)
	}
	newTestMux(t, newTestApp(t), extension)

	if len(received) != 2 {
		t.Fatalf("expected both protected routes to call RequireAuth, got %d calls", len(received))
	}
	for i, collections := range received {
		if !slices.Equal(collections, allowlist) {
			t.Fatalf("RequireAuth call %d received %#v, want %#v", i, collections, allowlist)
		}
		if &collections[0] != &allowlist[0] {
			t.Fatalf("RequireAuth call %d received a reassigned AuthCollections slice", i)
		}
	}
}

func TestSuperusersCollectionBuildsAndAuthorizes(t *testing.T) {
	app := newTestApp(t)
	extension, err := New(Config{
		Runner:          &fakeRunner{completes: true},
		AuthCollections: []string{core.CollectionNameSuperusers},
	})
	if err != nil {
		t.Fatalf("_superusers must remain a valid vegabuild allowlist: %v", err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	mux := newTestMux(t, app, extension)
	token := newAuthTokenForCollection(t, app, core.CollectionNameSuperusers)

	response := doRequest(mux, http.MethodGet, "/api/vega-build/status", token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected _superusers to be authorized, got %d %s", response.Code, response.Body.String())
	}
}

func TestEnsureCollectionsIsIdempotentAndRejectsHomonym(t *testing.T) {
	app := newTestApp(t)
	extension, err := New(Config{
		Runner:          &fakeRunner{completes: true},
		AuthCollections: []string{"vega_editors"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatalf("second idempotent setup failed: %v", err)
	}

	other := createPublicCollection(t, app)
	extension2, err := New(Config{
		Runner:          &fakeRunner{completes: true},
		AuthCollections: []string{"vega_editors"},
		RunsCollection:  other,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension2.EnsureCollections(app); err == nil {
		t.Fatal("expected a public homonym collection to be rejected")
	}
}

// createPublicCollection creates a base collection with a public ListRule under a distinct name
// and returns that name, so the caller can point a second Extension at it and confirm
// EnsureCollections refuses to treat it as its own.
func createPublicCollection(t *testing.T, app core.App) string {
	t.Helper()
	name := "vega_build_runs_public"
	collection := core.NewBaseCollection(name)
	publicRule := ""
	collection.ListRule = &publicRule
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}
	return name
}

func TestReadmeAuthCollectionBuildsAndServesIdleStatus(t *testing.T) {
	app := newTestApp(t)
	extension, err := New(Config{
		Runner:          &fakeRunner{completes: true},
		AuthCollections: []string{"vega_editors"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	mux := newTestMux(t, app, extension)
	token := newAuthToken(t, app)

	response := doRequest(mux, http.MethodGet, "/api/vega-build/status", token, "")
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d %s", response.Code, response.Body.String())
	}
	var status statusResponse
	decodeJSON(t, response, &status)
	if status.State != "idle" {
		t.Fatalf("expected idle state, got %q", status.State)
	}
	if status.StartedAt != nil || status.FinishedAt != nil || status.LastPublishedAt != nil || status.LogURL != nil {
		t.Fatalf("expected every other field to be null: %#v", status)
	}
}

func TestHappyPathCompletingRunner(t *testing.T) {
	app := newTestApp(t)
	runner := &fakeRunner{completes: true}
	extension, err := New(Config{
		Runner:          runner,
		AuthCollections: []string{"vega_editors"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	mux := newTestMux(t, app, extension)
	token := newAuthToken(t, app)

	trigger := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "")
	if trigger.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d %s", trigger.Code, trigger.Body.String())
	}
	var triggerBody map[string]string
	decodeJSON(t, trigger, &triggerBody)
	runID := triggerBody["id"]
	if runID == "" {
		t.Fatal("expected a non-empty run id")
	}

	statusResp := doRequest(mux, http.MethodGet, "/api/vega-build/status", token, "")
	var running statusResponse
	decodeJSON(t, statusResp, &running)
	if running.State != "running" {
		t.Fatalf("expected running state right after trigger, got %q", running.State)
	}

	if _, err := extension.closeRun(app, runID, runStateOK, "https://logs.example/ok", ""); err != nil {
		t.Fatal(err)
	}

	statusResp = doRequest(mux, http.MethodGet, "/api/vega-build/status", token, "")
	var ok statusResponse
	decodeJSON(t, statusResp, &ok)
	if ok.State != "ok" {
		t.Fatalf("expected ok state after report, got %q", ok.State)
	}
	if ok.FinishedAt == nil || ok.LastPublishedAt == nil || *ok.FinishedAt != *ok.LastPublishedAt {
		t.Fatalf("expected lastPublishedAt to equal finishedAt of the successful run: %#v", ok)
	}
}

func TestLastPublishedAtSurvivesALaterFailedRun(t *testing.T) {
	app := newTestApp(t)
	extension, err := New(Config{
		Runner:          &fakeRunner{completes: true},
		AuthCollections: []string{"vega_editors"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	mux := newTestMux(t, app, extension)
	token := newAuthToken(t, app)

	first := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "")
	var firstBody map[string]string
	decodeJSON(t, first, &firstBody)
	if _, err := extension.closeRun(app, firstBody["id"], runStateOK, "", ""); err != nil {
		t.Fatal(err)
	}
	firstStatus, err := extension.buildStatus(app)
	if err != nil {
		t.Fatal(err)
	}
	if firstStatus.LastPublishedAt == nil {
		t.Fatal("expected a lastPublishedAt after the first ok run")
	}
	goodPublish := *firstStatus.LastPublishedAt

	// `created` is truncated to millisecond precision (see the timestampLayout doc comment): a
	// real "publish" is never retriggered within the same millisecond as the previous run closing
	// (closing itself takes a database round trip), but this test issues both requests as fast as
	// the in-process router allows, so it has to force the same separation explicitly.
	time.Sleep(5 * time.Millisecond)

	second := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "")
	var secondBody map[string]string
	decodeJSON(t, second, &secondBody)
	if _, err := extension.closeRun(app, secondBody["id"], runStateFailed, "", "boom"); err != nil {
		t.Fatal(err)
	}

	finalStatus, err := extension.buildStatus(app)
	if err != nil {
		t.Fatal(err)
	}
	if finalStatus.State != runStateFailed {
		t.Fatalf("expected the current run to be failed, got %q", finalStatus.State)
	}
	if finalStatus.LastPublishedAt == nil || *finalStatus.LastPublishedAt != goodPublish {
		t.Fatalf("expected lastPublishedAt to survive the later failure: %#v vs %q", finalStatus, goodPublish)
	}
}

func TestTimestampFormat(t *testing.T) {
	app := newTestApp(t)
	extension, err := New(Config{
		Runner:          &fakeRunner{completes: true},
		AuthCollections: []string{"vega_editors"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	mux := newTestMux(t, app, extension)
	token := newAuthToken(t, app)

	trigger := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "")
	var triggerBody map[string]string
	decodeJSON(t, trigger, &triggerBody)
	if _, err := extension.closeRun(app, triggerBody["id"], runStateOK, "", ""); err != nil {
		t.Fatal(err)
	}

	response := doRequest(mux, http.MethodGet, "/api/vega-build/status", token, "")
	var status statusResponse
	decodeJSON(t, response, &status)

	pattern := regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`)
	for name, value := range map[string]*string{
		"startedAt": status.StartedAt, "finishedAt": status.FinishedAt, "lastPublishedAt": status.LastPublishedAt,
	} {
		if value == nil || !pattern.MatchString(*value) {
			t.Fatalf("field %s has an unexpected timestamp shape: %v", name, value)
		}
	}
}

func TestTriggerWhileRunningConflicts(t *testing.T) {
	app := newTestApp(t)
	runner := &fakeRunner{completes: true}
	extension, err := New(Config{
		Runner:          runner,
		AuthCollections: []string{"vega_editors"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	mux := newTestMux(t, app, extension)
	token := newAuthToken(t, app)

	first := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "")
	if first.Code != http.StatusAccepted {
		t.Fatalf("expected the first trigger to succeed, got %d", first.Code)
	}
	second := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "")
	if second.Code != http.StatusConflict {
		t.Fatalf("expected 409 while a run is in progress, got %d %s", second.Code, second.Body.String())
	}
	if runner.starts() != 1 {
		t.Fatalf("expected the runner to be started exactly once, got %d", runner.starts())
	}
}

// TestHandoffDoesNotResurrectAnAlreadyClosedRun exercises the two-writers race fixed by
// applyHandoff: a Runner allowed to call report SYNCHRONOUSLY inside Start, before Start itself
// returns a Handoff with its own (now stale) LogURL/ExternalRef. The run must stay closed with the
// report's information, never bounced back to "running" by the later, out-of-date Handoff.
func TestHandoffDoesNotResurrectAnAlreadyClosedRun(t *testing.T) {
	app := newTestApp(t)
	runner := &fakeRunner{
		completes:         true,
		reportDuringStart: &Result{OK: true, LogURL: "https://logs.example/from-report"},
		handoff:           Handoff{LogURL: "https://logs.example/stale-handoff", ExternalRef: "stale-ref"},
	}
	extension, err := New(Config{
		Runner:          runner,
		AuthCollections: []string{"vega_editors"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	mux := newTestMux(t, app, extension)
	token := newAuthToken(t, app)

	trigger := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "")
	if trigger.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d %s", trigger.Code, trigger.Body.String())
	}

	status, err := extension.buildStatus(app)
	if err != nil {
		t.Fatal(err)
	}
	if status.State != runStateOK {
		t.Fatalf("expected the run closed inside Start to still read ok, got %q", status.State)
	}
	if status.LogURL == nil || *status.LogURL != "https://logs.example/from-report" {
		t.Fatalf("expected the report's logUrl to win over a stale post-Start Handoff, got %#v", status.LogURL)
	}
}

// TestTriggerIsSerializedAgainstConcurrentRequests fires several /trigger requests at once (no
// sleep, no artificial ordering): without startNewRun's lock around check-then-create, more than
// one could read "no run in progress" before any of them managed to save its own "running" record,
// and a CommandRunner would execute the same deploy more than once.
func TestTriggerIsSerializedAgainstConcurrentRequests(t *testing.T) {
	app := newTestApp(t)
	runner := &fakeRunner{completes: true}
	extension, err := New(Config{
		Runner:          runner,
		AuthCollections: []string{"vega_editors"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	mux := newTestMux(t, app, extension)
	token := newAuthToken(t, app)

	const concurrency = 4
	var wg sync.WaitGroup
	codes := make([]int, concurrency)
	wg.Add(concurrency)
	for i := range codes {
		i := i
		go func() {
			defer wg.Done()
			codes[i] = doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "").Code
		}()
	}
	wg.Wait()

	accepted, conflicts := 0, 0
	for _, code := range codes {
		switch code {
		case http.StatusAccepted:
			accepted++
		case http.StatusConflict:
			conflicts++
		default:
			t.Fatalf("unexpected status code %d among concurrent triggers", code)
		}
	}
	if accepted != 1 || conflicts != concurrency-1 {
		t.Fatalf("expected exactly one 202 among %d concurrent triggers, got %d accepted / %d conflicts",
			concurrency, accepted, conflicts)
	}
	if runner.starts() != 1 {
		t.Fatalf("expected the runner to be started exactly once, got %d", runner.starts())
	}
}

// TestStaleRunIsReconciledAndUnblocksTrigger models PocketBase (or the build it triggers) dying
// mid-run: nothing ever calls report or POST /callback, so without reconciliation the row would
// stay "running" — and /trigger would answer 409 — forever.
func TestStaleRunIsReconciledAndUnblocksTrigger(t *testing.T) {
	app := newTestApp(t)
	current := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	clock := func() time.Time { return current }
	runner := &fakeRunner{completes: true}
	extension, err := New(Config{
		Runner:          runner,
		AuthCollections: []string{"vega_editors"},
		Clock:           clock,
		StaleRunAfter:   time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	mux := newTestMux(t, app, extension)
	token := newAuthToken(t, app)

	trigger := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "")
	if trigger.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d %s", trigger.Code, trigger.Body.String())
	}

	current = current.Add(2 * time.Hour)

	statusResp := doRequest(mux, http.MethodGet, "/api/vega-build/status", token, "")
	var staleStatus statusResponse
	decodeJSON(t, statusResp, &staleStatus)
	if staleStatus.State != runStateFailed {
		t.Fatalf("expected a stale run to be reconciled as failed by /status, got %q", staleStatus.State)
	}

	again := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "")
	if again.Code != http.StatusAccepted {
		t.Fatalf("expected /trigger to work again once the stale run is reconciled, got %d %s",
			again.Code, again.Body.String())
	}
	if runner.starts() != 2 {
		t.Fatalf("expected the runner to have been started twice (original + reconciled retry), got %d",
			runner.starts())
	}
}

// TestFreshRunningRunIsNotReconciled is the other half of the guard above: a run well within
// StaleRunAfter must be left alone by both /status and /trigger's own reconciliation pass.
func TestFreshRunningRunIsNotReconciled(t *testing.T) {
	app := newTestApp(t)
	current := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	clock := func() time.Time { return current }
	runner := &fakeRunner{completes: true}
	extension, err := New(Config{
		Runner:          runner,
		AuthCollections: []string{"vega_editors"},
		Clock:           clock,
		StaleRunAfter:   time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	mux := newTestMux(t, app, extension)
	token := newAuthToken(t, app)

	trigger := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "")
	if trigger.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d %s", trigger.Code, trigger.Body.String())
	}

	current = current.Add(1 * time.Minute)

	statusResp := doRequest(mux, http.MethodGet, "/api/vega-build/status", token, "")
	var freshStatus statusResponse
	decodeJSON(t, statusResp, &freshStatus)
	if freshStatus.State != runStateRunning {
		t.Fatalf("a recent run must not be reconciled away, got %q", freshStatus.State)
	}

	blocked := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "")
	if blocked.Code != http.StatusConflict {
		t.Fatalf("expected 409 while the fresh run is still within StaleRunAfter, got %d", blocked.Code)
	}
	if runner.starts() != 1 {
		t.Fatalf("expected the runner to have been started only once, got %d", runner.starts())
	}
}

// TestReconcileTreatsUnparsableStartedAtAsAbandoned is the third occurrence of the same lesson
// this module keeps re-learning (see applyHandoff and startNewRun's docstrings for the first two):
// a run record can end up with a `startedAt` that fails to parse, and treating that as an error
// instead of an abandoned run would leave BOTH /status and /trigger permanently unable to recover
// it — worse than the stuck-"running" failure mode reconcileStaleRun exists to cure, because the
// state could not even be read anymore.
func TestReconcileTreatsUnparsableStartedAtAsAbandoned(t *testing.T) {
	app := newTestApp(t)
	extension, err := New(Config{
		Runner:          &fakeRunner{completes: true},
		AuthCollections: []string{"vega_editors"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	mux := newTestMux(t, app, extension)
	token := newAuthToken(t, app)

	collection, err := app.FindCollectionByNameOrId(extension.config.RunsCollection)
	if err != nil {
		t.Fatal(err)
	}
	garbage := core.NewRecord(collection)
	garbage.Set("state", runStateRunning)
	garbage.Set("startedAt", "not-a-timestamp")
	if err := app.Save(garbage); err != nil {
		t.Fatal(err)
	}

	statusResp := doRequest(mux, http.MethodGet, "/api/vega-build/status", token, "")
	if statusResp.Code != http.StatusOK {
		t.Fatalf("expected 200 even with an unparsable startedAt, got %d %s", statusResp.Code, statusResp.Body.String())
	}
	var status statusResponse
	decodeJSON(t, statusResp, &status)
	if status.State != runStateFailed {
		t.Fatalf("expected the run with a garbage startedAt to be reconciled as failed, got %q", status.State)
	}

	trigger := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "")
	if trigger.Code != http.StatusAccepted {
		t.Fatalf("expected /trigger to accept a new run once the garbage one is reconciled, got %d %s",
			trigger.Code, trigger.Body.String())
	}
}

func TestStartFailureMarksRunFailed(t *testing.T) {
	app := newTestApp(t)
	runner := &fakeRunner{completes: true, startErr: errors.New("provider unreachable")}
	extension, err := New(Config{
		Runner:          runner,
		AuthCollections: []string{"vega_editors"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	mux := newTestMux(t, app, extension)
	token := newAuthToken(t, app)

	trigger := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "")
	if trigger.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 on a failed start, got %d %s", trigger.Code, trigger.Body.String())
	}

	status, err := extension.buildStatus(app)
	if err != nil {
		t.Fatal(err)
	}
	if status.State != runStateFailed {
		t.Fatalf("expected the run to be recorded as failed, got %q", status.State)
	}
}

func TestCallback(t *testing.T) {
	app := newTestApp(t)
	extension, err := New(Config{
		Runner:          &fakeRunner{completes: false},
		AuthCollections: []string{"vega_editors"},
		CallbackSecret:  "sixteen-char-secret!",
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	mux := newTestMux(t, app, extension)
	token := newAuthToken(t, app)

	trigger := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", token, "")
	if trigger.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d %s", trigger.Code, trigger.Body.String())
	}
	var triggerBody map[string]string
	decodeJSON(t, trigger, &triggerBody)
	runID := triggerBody["id"]

	callback := func(secret, body string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, "/api/vega-build/callback", strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		if secret != "" {
			request.Header.Set("X-Vega-Build-Secret", secret)
		}
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, request)
		return response
	}

	missing := callback("", `{"id":"`+runID+`","state":"ok"}`)
	if missing.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 with no secret, got %d", missing.Code)
	}
	wrong := callback("wrong-secret-but-long-enough", `{"id":"`+runID+`","state":"ok"}`)
	if wrong.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 with a wrong secret, got %d", wrong.Code)
	}
	statusAfterRejections, err := extension.buildStatus(app)
	if err != nil {
		t.Fatal(err)
	}
	if statusAfterRejections.State != runStateRunning {
		t.Fatalf("a rejected callback must not change state, got %q", statusAfterRejections.State)
	}

	unknown := callback("sixteen-char-secret!", `{"id":"does-not-exist","state":"ok"}`)
	if unknown.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for an unknown run id, got %d %s", unknown.Code, unknown.Body.String())
	}

	ok := callback("sixteen-char-secret!", `{"id":"`+runID+`","state":"ok","logUrl":"https://logs.example/`+runID+`"}`)
	if ok.Code != http.StatusOK {
		t.Fatalf("expected 200 on a valid callback, got %d %s", ok.Code, ok.Body.String())
	}

	retry := callback("sixteen-char-secret!", `{"id":"`+runID+`","state":"ok"}`)
	if retry.Code != http.StatusOK {
		t.Fatalf("expected an idempotent retry with the same state to return 200, got %d", retry.Code)
	}

	conflict := callback("sixteen-char-secret!", `{"id":"`+runID+`","state":"failed"}`)
	if conflict.Code != http.StatusConflict {
		t.Fatalf("expected 409 when the callback reports a different terminal state, got %d", conflict.Code)
	}
}

func TestUnauthenticatedRequestsAreRejected(t *testing.T) {
	app := newTestApp(t)
	extension, err := New(Config{
		Runner:          &fakeRunner{completes: true},
		AuthCollections: []string{"vega_editors"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	mux := newTestMux(t, app, extension)

	if response := doRequest(mux, http.MethodPost, "/api/vega-build/trigger", "", ""); response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for /trigger without Authorization, got %d", response.Code)
	}
	if response := doRequest(mux, http.MethodGet, "/api/vega-build/status", "", ""); response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for /status without Authorization, got %d", response.Code)
	}
}

func TestWebhookRunner(t *testing.T) {
	var gotMethod, gotContentType, gotBody, gotHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotContentType = r.Header.Get("Content-Type")
		gotHeader = r.Header.Get("X-Custom")
		body, _ := io.ReadAll(r.Body)
		gotBody = string(body)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	runner, err := NewWebhookRunner(WebhookConfig{
		URL:     server.URL,
		Headers: map[string]string{"X-Custom": "hello"},
		Body:    `{"ref":"main"}`,
		LogURL:  "https://ci.example/logs",
	})
	if err != nil {
		t.Fatal(err)
	}
	handoff, err := runner.Start(context.Background(), "run-1", func(Result) {})
	if err != nil {
		t.Fatal(err)
	}
	if handoff.LogURL != "https://ci.example/logs" {
		t.Fatalf("unexpected handoff: %#v", handoff)
	}
	if gotMethod != http.MethodPost || gotContentType != "application/json" || gotBody != `{"ref":"main"}` || gotHeader != "hello" {
		t.Fatalf("webhook did not receive the configured request: method=%q contentType=%q body=%q header=%q",
			gotMethod, gotContentType, gotBody, gotHeader)
	}

	failingServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer failingServer.Close()
	failingRunner, err := NewWebhookRunner(WebhookConfig{URL: failingServer.URL})
	if err != nil {
		t.Fatal(err)
	}
	_, err = failingRunner.Start(context.Background(), "run-2", func(Result) {})
	if err == nil {
		t.Fatal("expected a non-2xx response to be reported as an error")
	}
	if strings.Contains(err.Error(), failingServer.URL) {
		t.Fatalf("the error message must never contain the webhook URL: %q", err.Error())
	}
}

func TestCommandRunner(t *testing.T) {
	logDir := t.TempDir()

	okRunner, err := NewCommandRunner(CommandConfig{Command: "sh", Args: []string{"-c", "echo hello-from-build"}, LogDir: logDir})
	if err != nil {
		t.Fatal(err)
	}
	okResult := waitForReport(t, okRunner, "run-ok")
	if !okResult.OK {
		t.Fatalf("expected a zero exit command to be reported ok: %#v", okResult)
	}
	logBytes, err := os.ReadFile(filepath.Join(logDir, "run-ok.log"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(logBytes), "hello-from-build") {
		t.Fatalf("expected the log to contain the command output, got %q", string(logBytes))
	}

	failRunner, err := NewCommandRunner(CommandConfig{Command: "sh", Args: []string{"-c", "exit 7"}, LogDir: logDir})
	if err != nil {
		t.Fatal(err)
	}
	failResult := waitForReport(t, failRunner, "run-fail")
	if failResult.OK || failResult.Detail == "" {
		t.Fatalf("expected a non-zero exit to be reported failed with a detail: %#v", failResult)
	}

	timeoutRunner, err := NewCommandRunner(CommandConfig{
		Command: "sh", Args: []string{"-c", "sleep 5"}, LogDir: logDir, Timeout: 100 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	timeoutResult := waitForReport(t, timeoutRunner, "run-timeout")
	if timeoutResult.OK {
		t.Fatal("expected a run exceeding its timeout to be reported failed")
	}
}

// waitForReport starts runner and blocks until its report callback fires, returning the reported
// Result (or failing the test after a generous deadline).
func waitForReport(t *testing.T, runner Runner, runID string) Result {
	t.Helper()
	results := make(chan Result, 1)
	if _, err := runner.Start(context.Background(), runID, func(result Result) {
		results <- result
	}); err != nil {
		t.Fatal(err)
	}
	select {
	case result := <-results:
		return result
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for the runner to report")
		return Result{}
	}
}
