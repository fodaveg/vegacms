package vegaschedule

import (
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"
)

// now is the fixed "current time" of every test: 12 Oct 2026, 10:00 UTC.
var now = time.Date(2026, time.October, 12, 10, 0, 0, 0, time.UTC)

func fixedClock() time.Time { return now }

func newTestApp(t *testing.T) core.App {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	return app
}

func newExtension(t *testing.T, config Config) *Extension {
	t.Helper()
	if config.Clock == nil {
		config.Clock = fixedClock
	}
	extension, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	return extension
}

// createPublishable creates a base collection shaped like the seeded `pages`: a title, the
// publication select and an optional date. Extra fields can be appended by the caller.
func createPublishable(t *testing.T, app core.App, name string, extra ...core.Field) *core.Collection {
	t.Helper()
	collection := core.NewBaseCollection(name)
	collection.Fields.Add(
		&core.TextField{Name: "title"},
		&core.SelectField{Name: "status", Values: []string{"draft", "published"}, MaxSelect: 1},
		&core.DateField{Name: "publishAt"},
	)
	collection.Fields.Add(extra...)
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}
	return collection
}

// createManifest creates the `vega` collection (with or without the `key` field) and one record
// per manifest given, keyed "default", "other"... in order.
func createManifest(t *testing.T, app core.App, withKey bool, manifests ...map[string]any) {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId("vega")
	if err != nil {
		collection = core.NewBaseCollection("vega")
		if withKey {
			collection.Fields.Add(&core.TextField{Name: "key"})
		}
		collection.Fields.Add(&core.JSONField{Name: "manifest"})
		if err := app.Save(collection); err != nil {
			t.Fatal(err)
		}
	}
	keys := []string{"default", "other", "third"}
	for i, manifest := range manifests {
		raw, err := json.Marshal(manifest)
		if err != nil {
			t.Fatal(err)
		}
		record := core.NewRecord(collection)
		if withKey {
			record.Set("key", keys[i])
		}
		record.Set("manifest", types.JSONRaw(raw))
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
	}
}

func schedules(collections ...string) map[string]any {
	entries := map[string]any{}
	for _, name := range collections {
		entries[name] = map[string]any{"statusField": "status", "publishAtField": "publishAt"}
	}
	return map[string]any{"schemaVersion": 1, "collections": entries}
}

func createRecord(t *testing.T, app core.App, collection, title, status string, publishAt time.Time) *core.Record {
	t.Helper()
	record := core.NewRecord(mustCollection(t, app, collection))
	record.Set("title", title)
	record.Set("status", status)
	if !publishAt.IsZero() {
		record.Set("publishAt", publishAt)
	}
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func mustCollection(t *testing.T, app core.App, name string) *core.Collection {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(name)
	if err != nil {
		t.Fatal(err)
	}
	return collection
}

func reload(t *testing.T, app core.App, record *core.Record) *core.Record {
	t.Helper()
	fresh, err := app.FindRecordById(record.Collection().Name, record.Id)
	if err != nil {
		t.Fatal(err)
	}
	return fresh
}

func publishedIDs(result TickResult) []string {
	ids := make([]string, 0, len(result.Published))
	for _, item := range result.Published {
		ids = append(ids, item.RecordID)
	}
	return ids
}

func mustTick(t *testing.T, extension *Extension, app core.App) TickResult {
	t.Helper()
	result, err := extension.Tick(app)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestPublishesDueDraftsClearsTheDateAndIsIdempotent(t *testing.T) {
	app := newTestApp(t)
	createPublishable(t, app, "pages")
	createManifest(t, app, true, schedules("pages"))

	due := createRecord(t, app, "pages", "due", "draft", now.Add(-time.Minute))
	exact := createRecord(t, app, "pages", "exact", "draft", now)
	future := createRecord(t, app, "pages", "future", "draft", now.Add(time.Minute))
	alreadyPublished := createRecord(t, app, "pages", "published", "published", now.Add(-time.Hour))
	undated := createRecord(t, app, "pages", "undated", "draft", time.Time{})

	extension := newExtension(t, Config{})
	result := mustTick(t, extension, app)

	if got, want := publishedIDs(result), []string{due.Id, exact.Id}; !slices.Equal(got, want) {
		t.Fatalf("published %v, want %v (oldest date first)", got, want)
	}
	if len(result.Failures) != 0 || len(result.Problems) != 0 {
		t.Fatalf("unexpected failures %v / problems %v", result.Failures, result.Problems)
	}
	if result.Published[0].ScheduledAt != "2026-10-12 09:59:00.000Z" {
		t.Fatalf("ScheduledAt must keep the date that was due, got %q", result.Published[0].ScheduledAt)
	}
	for _, record := range []*core.Record{due, exact} {
		fresh := reload(t, app, record)
		if fresh.GetString("status") != "published" || !fresh.GetDateTime("publishAt").IsZero() {
			t.Fatalf("%s: want published with the date cleared, got %q / %q",
				record.GetString("title"), fresh.GetString("status"), fresh.GetString("publishAt"))
		}
	}
	if fresh := reload(t, app, future); fresh.GetString("status") != "draft" || fresh.GetDateTime("publishAt").IsZero() {
		t.Fatal("a future draft must stay a draft with its date")
	}
	if fresh := reload(t, app, alreadyPublished); fresh.GetString("publishAt") != alreadyPublished.GetString("publishAt") {
		t.Fatal("an already published record must not be touched, date included")
	}
	if fresh := reload(t, app, undated); fresh.GetString("status") != "draft" {
		t.Fatal("a draft without a date must stay a draft")
	}

	if again := mustTick(t, extension, app); len(again.Published) != 0 {
		t.Fatalf("a second tick must publish nothing, got %v", publishedIDs(again))
	}
}

// TestUnpublishingAfterAScheduledPublicationSticks is the reason the date is cleared: an editor
// who sends a scheduled page back to draft must not see it republished a minute later.
func TestUnpublishingAfterAScheduledPublicationSticks(t *testing.T) {
	app := newTestApp(t)
	createPublishable(t, app, "pages")
	createManifest(t, app, true, schedules("pages"))
	record := createRecord(t, app, "pages", "page", "draft", now.Add(-time.Minute))
	extension := newExtension(t, Config{})

	if result := mustTick(t, extension, app); len(result.Published) != 1 {
		t.Fatalf("expected one publication, got %v", publishedIDs(result))
	}
	fresh := reload(t, app, record)
	fresh.Set("status", "draft")
	if err := app.Save(fresh); err != nil {
		t.Fatal(err)
	}

	if result := mustTick(t, extension, app); len(result.Published) != 0 {
		t.Fatal("a record the editor sent back to draft was republished")
	}
	if reload(t, app, record).GetString("status") != "draft" {
		t.Fatal("the editor's draft did not stick")
	}
}

// TestConditionalWriteLetsTheEditorWin reproduces the race: the record was listed as due, and
// before the write an editor changed it. publishOne rereads inside the transaction and only
// publishes what is STILL a due draft.
func TestConditionalWriteLetsTheEditorWin(t *testing.T) {
	app := newTestApp(t)
	createPublishable(t, app, "pages")
	pages := target{collection: "pages", statusField: "status", publishAtField: "publishAt"}
	extension := newExtension(t, Config{})
	nowDT, err := types.ParseDateTime(now)
	if err != nil {
		t.Fatal(err)
	}

	edit := func(record *core.Record, values map[string]any) {
		fresh := reload(t, app, record)
		for key, value := range values {
			fresh.Set(key, value)
		}
		if err := app.Save(fresh); err != nil {
			t.Fatal(err)
		}
	}

	publishedByHand := createRecord(t, app, "pages", "by hand", "draft", now.Add(-time.Minute))
	edit(publishedByHand, map[string]any{"status": "published"})
	postponed := createRecord(t, app, "pages", "postponed", "draft", now.Add(-time.Minute))
	edit(postponed, map[string]any{"publishAt": now.Add(24 * time.Hour)})
	unscheduled := createRecord(t, app, "pages", "unscheduled", "draft", now.Add(-time.Minute))
	edit(unscheduled, map[string]any{"publishAt": ""})
	retitled := createRecord(t, app, "pages", "old title", "draft", now.Add(-time.Minute))
	edit(retitled, map[string]any{"title": "new title"})

	for _, record := range []*core.Record{publishedByHand, postponed, unscheduled} {
		before := reload(t, app, record)
		item, err := extension.publishOne(app, pages, record.Id, nowDT)
		if err != nil || item != nil {
			t.Fatalf("%s: the editor's change must win, got %v, %v", record.GetString("title"), item, err)
		}
		after := reload(t, app, record)
		if after.GetString("status") != before.GetString("status") ||
			after.GetString("publishAt") != before.GetString("publishAt") {
			t.Fatalf("%s: the record was written anyway", record.GetString("title"))
		}
	}

	item, err := extension.publishOne(app, pages, retitled.Id, nowDT)
	if err != nil || item == nil {
		t.Fatalf("a still-due draft must be published, got %v, %v", item, err)
	}
	if after := reload(t, app, retitled); after.GetString("title") != "new title" || after.GetString("status") != "published" {
		t.Fatalf("the publication must keep the editor's other changes, got %q / %q",
			after.GetString("title"), after.GetString("status"))
	}

	if item, err := extension.publishOne(app, pages, "missingid123456", nowDT); err != nil || item != nil {
		t.Fatalf("a record deleted meanwhile is skipped silently, got %v, %v", item, err)
	}
}

// TestAnInvalidRecordDoesNotStopTheOthers: a record that fails validation (a field made required
// after it was created empty) is reported, stays a draft, and neither blocks the records after it
// in this tick nor the ones in later ticks.
func TestAnInvalidRecordDoesNotStopTheOthers(t *testing.T) {
	app := newTestApp(t)
	createPublishable(t, app, "pages")
	createManifest(t, app, true, schedules("pages"))
	invalid := createRecord(t, app, "pages", "", "draft", now.Add(-2*time.Hour))
	first := createRecord(t, app, "pages", "first", "draft", now.Add(-time.Hour))
	second := createRecord(t, app, "pages", "second", "draft", now.Add(-time.Minute))

	pages := mustCollection(t, app, "pages")
	pages.Fields.GetByName("title").(*core.TextField).Required = true
	if err := app.Save(pages); err != nil {
		t.Fatal(err)
	}

	extension := newExtension(t, Config{})
	result := mustTick(t, extension, app)
	if got, want := publishedIDs(result), []string{first.Id, second.Id}; !slices.Equal(got, want) {
		t.Fatalf("published %v, want %v", got, want)
	}
	if len(result.Failures) != 1 || result.Failures[0].RecordID != invalid.Id || result.Failures[0].Err == nil {
		t.Fatalf("expected exactly the invalid record as a failure, got %+v", result.Failures)
	}
	if fresh := reload(t, app, invalid); fresh.GetString("status") != "draft" || fresh.GetDateTime("publishAt").IsZero() {
		t.Fatal("the invalid record must stay a draft with its date, for the next tick")
	}

	late := createRecord(t, app, "pages", "late", "draft", now.Add(-time.Second))
	result = mustTick(t, extension, app)
	if got := publishedIDs(result); !slices.Equal(got, []string{late.Id}) {
		t.Fatalf("a failing record must not starve later ones, published %v", got)
	}
}

func TestManifestDeclarationsAreCheckedAgainstTheSchema(t *testing.T) {
	app := newTestApp(t)
	createPublishable(t, app, "pages")
	createPublishable(t, app, "conventional")
	createPublishable(t, app, "fallback")
	createPublishable(t, app, "disabled")
	createPublishable(t, app, "textdate", &core.TextField{Name: "when"})
	createPublishable(t, app, "requireddate", &core.DateField{Name: "mustPublishAt", Required: true})
	nostatus := core.NewBaseCollection("nostatus")
	nostatus.Fields.Add(&core.TextField{Name: "title"}, &core.DateField{Name: "publishAt"})
	if err := app.Save(nostatus); err != nil {
		t.Fatal(err)
	}
	createManifest(t, app, true, map[string]any{
		"collections": map[string]any{
			"pages":        map[string]any{"statusField": "status", "publishAtField": "publishAt"},
			"conventional": map[string]any{"publishAtField": "publishAt"},
			"fallback":     map[string]any{"statusField": "title", "publishAtField": "publishAt"},
			"disabled":     map[string]any{"statusField": false, "publishAtField": "publishAt"},
			"textdate":     map[string]any{"publishAtField": "when"},
			"requireddate": map[string]any{"publishAtField": "mustPublishAt"},
			"nostatus":     map[string]any{"publishAtField": "publishAt"},
			"missing":      map[string]any{"publishAtField": "publishAt"},
			"emptyname":    map[string]any{"publishAtField": ""},
			"notscheduled": map[string]any{"statusField": "status"},
			"garbage":      "not an object",
		},
	})
	var wantPublished []string
	for _, name := range []string{"conventional", "disabled", "fallback", "pages", "textdate"} {
		record := createRecord(t, app, name, name, "draft", now.Add(-time.Minute))
		if name == "conventional" || name == "fallback" || name == "pages" {
			wantPublished = append(wantPublished, record.Id)
		}
	}

	result := mustTick(t, newExtension(t, Config{}), app)
	if got := publishedIDs(result); !slices.Equal(got, wantPublished) {
		t.Fatalf("published %v, want %v", got, wantPublished)
	}
	wantProblems := []string{
		"disabled: statusField is false",
		"emptyname: publishAtField must be a non-empty string",
		"missing: collection not found",
		"nostatus: no statusField",
		"requireddate: publishAtField \"mustPublishAt\" must be optional",
		"textdate: publishAtField \"when\" is not a date field",
	}
	if len(result.Problems) != len(wantProblems) {
		t.Fatalf("problems %q, want %d entries", result.Problems, len(wantProblems))
	}
	for i, want := range wantProblems {
		if !strings.HasPrefix(result.Problems[i], want) {
			t.Fatalf("problem %d = %q, want prefix %q", i, result.Problems[i], want)
		}
	}
}

func TestNothingToDoWithoutAManifest(t *testing.T) {
	app := newTestApp(t)
	createPublishable(t, app, "pages")
	record := createRecord(t, app, "pages", "page", "draft", now.Add(-time.Minute))
	extension := newExtension(t, Config{})

	result := mustTick(t, extension, app)
	if len(result.Published) != 0 || len(result.Problems) != 0 {
		t.Fatalf("without a vega collection nothing happens, got %+v", result)
	}

	createManifest(t, app, true) // the collection, no record yet
	if result := mustTick(t, extension, app); len(result.Published) != 0 {
		t.Fatalf("without a manifest record nothing happens, got %+v", result)
	}
	if reload(t, app, record).GetString("status") != "draft" {
		t.Fatal("the record must be untouched")
	}
}

func TestManifestRecordIsSelectedByKeyWithLegacyFallback(t *testing.T) {
	t.Run("the keyed record wins", func(t *testing.T) {
		app := newTestApp(t)
		createPublishable(t, app, "pages")
		createManifest(t, app, true, map[string]any{"collections": map[string]any{}}, schedules("pages"))
		createRecord(t, app, "pages", "page", "draft", now.Add(-time.Minute))

		if result := mustTick(t, newExtension(t, Config{}), app); len(result.Published) != 0 {
			t.Fatal("the \"default\" record declares nothing; the \"other\" record must not be read")
		}
		if result := mustTick(t, newExtension(t, Config{ManifestKey: "other"}), app); len(result.Published) != 1 {
			t.Fatal("ManifestKey must select the \"other\" record")
		}
	})
	t.Run("legacy: no key field reads the first record", func(t *testing.T) {
		app := newTestApp(t)
		createPublishable(t, app, "pages")
		createManifest(t, app, false, schedules("pages"))
		createRecord(t, app, "pages", "page", "draft", now.Add(-time.Minute))

		if result := mustTick(t, newExtension(t, Config{}), app); len(result.Published) != 1 {
			t.Fatalf("expected the legacy record to be read, got %+v", result)
		}
	})
}

func TestUnreadableManifestIsAnError(t *testing.T) {
	app := newTestApp(t)
	createManifest(t, app, true)
	collection := mustCollection(t, app, "vega")
	record := core.NewRecord(collection)
	record.Set("key", "default")
	record.Set("manifest", types.JSONRaw(`["not", "an", "object"]`))
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	if _, err := newExtension(t, Config{}).Tick(app); err == nil {
		t.Fatal("a manifest that is not an object must surface as a tick error")
	}
}

func TestOnPublishedRunsOnlyAfterPublicationsAndRetriesOnRequest(t *testing.T) {
	app := newTestApp(t)
	createPublishable(t, app, "pages")
	createManifest(t, app, true, schedules("pages"))

	var calls [][]Published
	var answer error
	extension := newExtension(t, Config{
		OnPublished: func(_ core.App, published []Published) error {
			calls = append(calls, published)
			return answer
		},
	})

	mustTick(t, extension, app)
	if len(calls) != 0 {
		t.Fatal("OnPublished must not run when nothing was published")
	}

	first := createRecord(t, app, "pages", "first", "draft", now.Add(-time.Minute))
	answer = errors.Join(errors.New("a build is already running"), ErrRetryLater)
	result := mustTick(t, extension, app)
	if len(calls) != 1 || len(calls[0]) != 1 || calls[0][0].RecordID != first.Id || !errors.Is(result.HookErr, ErrRetryLater) {
		t.Fatalf("expected one deferred call with the first publication, got %+v / %v", calls, result.HookErr)
	}

	second := createRecord(t, app, "pages", "second", "draft", now.Add(-time.Minute))
	answer = nil
	mustTick(t, extension, app)
	if len(calls) != 2 || len(calls[1]) != 2 || calls[1][0].RecordID != first.Id || calls[1][1].RecordID != second.Id {
		t.Fatalf("the retried call must carry the pending publication plus the new one, got %+v", calls)
	}

	mustTick(t, extension, app)
	if len(calls) != 2 {
		t.Fatal("after a successful call nothing is pending")
	}

	createRecord(t, app, "pages", "third", "draft", now.Add(-time.Minute))
	answer = errors.New("webhook answered 502")
	mustTick(t, extension, app)
	answer = nil
	mustTick(t, extension, app)
	if len(calls) != 3 {
		t.Fatalf("an error other than ErrRetryLater is not retried, got %d calls", len(calls))
	}
}

func TestBusyTickIsSkipped(t *testing.T) {
	app := newTestApp(t)
	extension := newExtension(t, Config{})
	extension.tickMu.Lock()
	result, err := extension.Tick(app)
	extension.tickMu.Unlock()
	if err != nil || !result.Busy {
		t.Fatalf("a tick overlapping a running one must be a no-op, got %+v, %v", result, err)
	}
}

func TestRegisterAddsTheCronJob(t *testing.T) {
	app := newTestApp(t)
	createPublishable(t, app, "pages")
	createManifest(t, app, true, schedules("pages"))
	record := createRecord(t, app, "pages", "page", "draft", now.Add(-time.Minute))

	extension := newExtension(t, Config{})
	if err := extension.Register(app); err != nil {
		t.Fatal(err)
	}
	var job interface {
		Id() string
		Expression() string
		Run()
	}
	for _, candidate := range app.Cron().Jobs() {
		if candidate.Id() == "vegaschedule" {
			job = candidate
		}
	}
	if job == nil || job.Expression() != "* * * * *" {
		t.Fatalf("expected the vegaschedule job every minute, got %v", job)
	}
	job.Run()
	if reload(t, app, record).GetString("status") != "published" {
		t.Fatal("running the registered job must publish the due record")
	}

	if err := newExtension(t, Config{JobID: "custom", Schedule: "*/5 * * * *"}).Register(app); err != nil {
		t.Fatal(err)
	}
	if err := newExtension(t, Config{JobID: "broken", Schedule: "not a cron"}).Register(app); err == nil {
		t.Fatal("an invalid cron expression must be rejected")
	}
}

func TestPanicInsideATickIsRecovered(t *testing.T) {
	app := newTestApp(t)
	createPublishable(t, app, "pages")
	createManifest(t, app, true, schedules("pages"))
	createRecord(t, app, "pages", "page", "draft", now.Add(-time.Minute))
	extension := newExtension(t, Config{
		OnPublished: func(core.App, []Published) error { panic("hook exploded") },
	})
	if err := extension.Register(app); err != nil {
		t.Fatal(err)
	}
	for _, job := range app.Cron().Jobs() {
		if job.Id() == "vegaschedule" {
			job.Run() // must not panic out of the job
		}
	}
	if !extension.tickMu.TryLock() {
		t.Fatal("the tick lock must be released after a panic")
	}
	extension.tickMu.Unlock()
}
