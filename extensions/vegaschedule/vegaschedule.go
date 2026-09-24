// Package vegaschedule publishes scheduled content: a PocketBase cron job that, once a minute,
// moves every draft whose "publish at" date has passed to "published".
//
// What is schedulable is declared in Vega's own content manifest (the `vega` collection, see
// `docs/PROJECT-CONTRACT-v1.md#canonical-vega-record`), not in this extension's Config: a type
// opts in with `collections.<name>.publishAtField`, next to the `statusField` it already declares
// (`docs/CONFIG.md#publicación-programada-publishatfield`). The manifest is re-read on every tick,
// so declaring a new schedulable type in Vega's settings needs no restart.
//
// Without this extension a scheduled date is inert data. Vega tells: a superuser session reads
// PocketBase's `GET /api/crons` looking for the job id `vegaschedule` (Config.JobID's default) and
// leaves the answer in `vega.schemaSnapshot` for editors (`src/lib/backend/scheduled-publishing.ts`).
//
// The date is CLEARED when the record is published. It is an instruction ("publish at"), not a
// record of history: leaving a past date in place would make an editor's later "back to draft"
// be undone by this job within a minute. "Was it published?" is answered by the status itself
// (plus the record's own `updated`, when the collection has one, and this job's log line).
package vegaschedule

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	defaultJobID              = "vegaschedule"
	defaultSchedule           = "* * * * *"
	defaultManifestCollection = "vega"
	defaultManifestKey        = "default"

	// statusDraft/statusPublished are the two values of Vega's publication convention (§4.5 of
	// the content model: a single select with both options). Nothing else is ever written.
	statusDraft     = "draft"
	statusPublished = "published"

	// defaultStatusField is the convention's field name, used when the manifest does not declare
	// statusField (or declares an invalid one), exactly like Vega's own resolveStatusField.
	defaultStatusField = "status"
)

// ErrRetryLater, returned (or wrapped) by Config.OnPublished, keeps the publications it was
// told about pending and hands them to OnPublished again on the next tick, together with any new
// ones. Any other error drops them after logging it.
var ErrRetryLater = errors.New("vegaschedule: retry the publish hook on the next tick")

// fieldNamePattern is PocketBase's own field name rule. Names come from the collection schema,
// not from the manifest, but they are interpolated into a column expression, so they are checked
// again here instead of trusted.
var fieldNamePattern = regexp.MustCompile(`^\w+$`)

// Published identifies one record this extension moved to "published".
type Published struct {
	Collection string
	RecordID   string
	// ScheduledAt is the date the record was scheduled for, as PocketBase stores it
	// ("2006-01-02 15:04:05.000Z"). The field itself is cleared on publication.
	ScheduledAt string
}

// Config carries every deployment-specific value. Everything is optional.
type Config struct {
	// ManifestCollection is the collection holding Vega's manifest record. Default: "vega".
	ManifestCollection string
	// ManifestKey selects the manifest record by its `key` field, as the discovery document's
	// `manifest.key` does. Default: "default". A collection without a `key` field, or without a
	// record with that key, falls back to its first record — the same legacy rule Vega follows.
	ManifestKey string
	// JobID is the cron job id (it shows up in PocketBase's dashboard, under Crons). Default:
	// "vegaschedule". Vega detects the extension by this exact id in `GET /api/crons`: change it
	// and Vega reports scheduled publishing as absent.
	JobID string
	// Schedule is the cron expression. Default: every minute ("* * * * *").
	Schedule string
	// OnPublished, if set, runs after a tick that published at least one record (or that has
	// publications left pending by an earlier ErrRetryLater). It is how a prerendered site gets
	// rebuilt: wire it to vegabuild's Extension.Trigger (see README). Returning ErrRetryLater
	// keeps the publications pending for the next tick; any other error is logged and dropped.
	// Not called at all when nothing was published.
	OnPublished func(app core.App, published []Published) error
	// Clock is injectable for tests; default: time.Now.
	Clock func() time.Time
}

func (c Config) normalized() (Config, error) {
	c.ManifestCollection = strings.TrimSpace(c.ManifestCollection)
	if c.ManifestCollection == "" {
		c.ManifestCollection = defaultManifestCollection
	}
	c.ManifestKey = strings.TrimSpace(c.ManifestKey)
	if c.ManifestKey == "" {
		c.ManifestKey = defaultManifestKey
	}
	c.JobID = strings.TrimSpace(c.JobID)
	if c.JobID == "" {
		c.JobID = defaultJobID
	}
	c.Schedule = strings.TrimSpace(c.Schedule)
	if c.Schedule == "" {
		c.Schedule = defaultSchedule
	}
	if c.Clock == nil {
		c.Clock = time.Now
	}
	return c, nil
}

// Extension is the installed scheduler. Construct it with New, then call Register from an
// `OnServe` hook, mirroring the other Vega extensions.
type Extension struct {
	config Config

	// tickMu serializes ticks: a tick still running when the next minute fires makes that next
	// one a no-op (TryLock) instead of a second writer over the same records. It also guards
	// pending.
	tickMu  sync.Mutex
	pending []Published
}

// New validates config and returns a ready-to-register Extension.
func New(config Config) (*Extension, error) {
	normalized, err := config.normalized()
	if err != nil {
		return nil, err
	}
	return &Extension{config: normalized}, nil
}

// Register adds the cron job to app. PocketBase starts its cron scheduler when it serves, so call
// this from `OnServe` (or before `app.Start`). A panic inside a tick is recovered and logged: the
// scheduler is a background goroutine and must never take the whole process down.
func (x *Extension) Register(app core.App) error {
	return app.Cron().Add(x.config.JobID, x.config.Schedule, func() {
		defer func() {
			if recovered := recover(); recovered != nil {
				app.Logger().Error("vegaschedule: tick panicked", "panic", fmt.Sprint(recovered))
			}
		}()
		if _, err := x.Tick(app); err != nil {
			app.Logger().Error("vegaschedule: tick failed", "error", err)
		}
	})
}

// Failure is a record the tick could not publish. It stays a draft with its date, so the next
// tick tries again; the other records of the same tick are unaffected.
type Failure struct {
	Collection string
	RecordID   string
	Err        error
}

// TickResult reports what one tick did. Exposed for tests and for anyone running Tick by hand.
type TickResult struct {
	// Busy is true when a previous tick was still running, so this one did nothing.
	Busy bool
	// Published lists the records moved to "published" by THIS tick.
	Published []Published
	// Failures lists records that were due but whose save failed.
	Failures []Failure
	// Problems describes manifest declarations that cannot be honoured (a missing collection, a
	// publishAtField that is not a date...). Each one skips only its own collection.
	Problems []string
	// HookErr is the error OnPublished returned, if any (ErrRetryLater included).
	HookErr error
}

// target is one schedulable collection, already checked against the real schema.
type target struct {
	collection     string
	statusField    string
	publishAtField string
}

// Tick runs one pass: read the manifest, resolve every schedulable collection, publish what is
// due, then call OnPublished. It returns an error only when the manifest itself cannot be read;
// everything narrower (one collection, one record) is reported in TickResult and skipped.
func (x *Extension) Tick(app core.App) (TickResult, error) {
	if !x.tickMu.TryLock() {
		return TickResult{Busy: true}, nil
	}
	defer x.tickMu.Unlock()

	var result TickResult
	targets, problems, err := x.loadTargets(app)
	result.Problems = problems
	for _, problem := range problems {
		app.Logger().Warn("vegaschedule: collection skipped", "problem", problem)
	}
	if err != nil {
		return result, err
	}

	now, err := types.ParseDateTime(x.config.Clock().UTC())
	if err != nil {
		return result, fmt.Errorf("vegaschedule: current time: %w", err)
	}
	for _, t := range targets {
		published, failures, err := x.publishDue(app, t, now)
		result.Published = append(result.Published, published...)
		result.Failures = append(result.Failures, failures...)
		if err != nil {
			// A query failure on one collection must not hide the others' due records.
			result.Problems = append(result.Problems, fmt.Sprintf("%s: %v", t.collection, err))
			app.Logger().Error("vegaschedule: could not list due records", "collection", t.collection, "error", err)
		}
	}
	for _, item := range result.Published {
		app.Logger().Info(
			"vegaschedule: published",
			"collection", item.Collection, "record", item.RecordID, "scheduledAt", item.ScheduledAt,
		)
	}
	for _, failure := range result.Failures {
		app.Logger().Error(
			"vegaschedule: could not publish a due record; it stays a draft and is retried next tick",
			"collection", failure.Collection, "record", failure.RecordID, "error", failure.Err,
		)
	}

	result.HookErr = x.notify(app, result.Published)
	return result, nil
}

// notify hands the tick's publications (plus any left pending by ErrRetryLater) to OnPublished.
// Called with tickMu held.
func (x *Extension) notify(app core.App, published []Published) error {
	if x.config.OnPublished == nil {
		return nil
	}
	x.pending = append(x.pending, published...)
	if len(x.pending) == 0 {
		return nil
	}
	err := x.config.OnPublished(app, slices.Clone(x.pending))
	switch {
	case err == nil:
		x.pending = nil
	case errors.Is(err, ErrRetryLater):
		app.Logger().Info("vegaschedule: publish hook deferred to the next tick", "pending", len(x.pending), "error", err)
	default:
		app.Logger().Error("vegaschedule: publish hook failed; not retried", "published", len(x.pending), "error", err)
		x.pending = nil
	}
	return err
}

// manifestDocument is the part of Vega's manifest this extension reads. Each collection entry
// is decoded on its own so a malformed one cannot hide the rest.
type manifestDocument struct {
	Collections map[string]json.RawMessage `json:"collections"`
}

type manifestCollection struct {
	StatusField    json.RawMessage `json:"statusField"`
	PublishAtField json.RawMessage `json:"publishAtField"`
}

// loadTargets reads the manifest and resolves every collection that declares publishAtField.
// No manifest collection or record at all is not an error: there is simply nothing scheduled.
func (x *Extension) loadTargets(app core.App) ([]target, []string, error) {
	record, err := x.findManifestRecord(app)
	if err != nil || record == nil {
		return nil, nil, err
	}
	var document manifestDocument
	if err := record.UnmarshalJSONField("manifest", &document); err != nil {
		return nil, nil, fmt.Errorf("vegaschedule: manifest is not a JSON object: %w", err)
	}

	names := make([]string, 0, len(document.Collections))
	for name := range document.Collections {
		names = append(names, name)
	}
	slices.Sort(names) // deterministic order for logs and tests

	var targets []target
	var problems []string
	for _, name := range names {
		var entry manifestCollection
		if err := json.Unmarshal(document.Collections[name], &entry); err != nil {
			// Not an object: Vega already warns about it; nothing to schedule here.
			continue
		}
		if len(entry.PublishAtField) == 0 || string(entry.PublishAtField) == "null" {
			continue
		}
		resolved, problem := resolveTarget(app, name, entry)
		if problem != "" {
			problems = append(problems, problem)
			continue
		}
		targets = append(targets, resolved)
	}
	return targets, problems, nil
}

func (x *Extension) findManifestRecord(app core.App) (*core.Record, error) {
	collection, err := app.FindCollectionByNameOrId(x.config.ManifestCollection)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("vegaschedule: manifest collection %q: %w", x.config.ManifestCollection, err)
	}
	if collection.Fields.GetByName("manifest") == nil {
		return nil, nil
	}
	if collection.Fields.GetByName("key") != nil {
		record, err := app.FindFirstRecordByData(collection, "key", x.config.ManifestKey)
		if err == nil {
			return record, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("vegaschedule: manifest record: %w", err)
		}
	}
	records, err := app.FindRecordsByFilter(collection, "", "", 1, 0)
	if err != nil {
		return nil, fmt.Errorf("vegaschedule: manifest record: %w", err)
	}
	if len(records) == 0 {
		return nil, nil
	}
	return records[0], nil
}

// resolveTarget checks one declaration against the real schema. It returns a non-empty problem
// (and a zero target) when the collection cannot be scheduled.
func resolveTarget(app core.App, name string, entry manifestCollection) (target, string) {
	var publishAtField string
	if err := json.Unmarshal(entry.PublishAtField, &publishAtField); err != nil || publishAtField == "" {
		return target{}, fmt.Sprintf("%s: publishAtField must be a non-empty string", name)
	}

	collection, err := app.FindCollectionByNameOrId(name)
	if err != nil {
		return target{}, fmt.Sprintf("%s: collection not found", name)
	}
	if collection.IsView() {
		return target{}, fmt.Sprintf("%s: a view collection cannot be written", name)
	}

	statusField, problem := resolveStatusField(collection, entry.StatusField)
	if problem != "" {
		return target{}, fmt.Sprintf("%s: %s", name, problem)
	}

	dateField, ok := collection.Fields.GetByName(publishAtField).(*core.DateField)
	if !ok || !fieldNamePattern.MatchString(publishAtField) {
		return target{}, fmt.Sprintf("%s: publishAtField %q is not a date field of the collection", name, publishAtField)
	}
	if dateField.Required {
		// Every draft would carry a date, so every draft would eventually publish itself; and the
		// date could not be cleared on publication (see the package doc) without failing validation.
		return target{}, fmt.Sprintf("%s: publishAtField %q must be optional, not required", name, publishAtField)
	}

	return target{collection: collection.Name, statusField: statusField, publishAtField: publishAtField}, ""
}

// resolveStatusField mirrors Vega's resolveStatusField (src/lib/model/conventions.ts): `false`
// disables publication, a valid declared field wins, and anything else falls back to a valid
// field named "status".
func resolveStatusField(collection *core.Collection, raw json.RawMessage) (string, string) {
	if string(raw) == "false" {
		return "", "statusField is false: the type has no publication status to set"
	}
	var declared string
	if len(raw) > 0 && string(raw) != "null" {
		_ = json.Unmarshal(raw, &declared)
	}
	if declared != "" && isStatusField(collection, declared) {
		return declared, ""
	}
	if isStatusField(collection, defaultStatusField) {
		return defaultStatusField, ""
	}
	if declared != "" {
		return "", fmt.Sprintf("statusField %q is not a single select with draft and published", declared)
	}
	return "", "no statusField: declare one, or add a single select \"status\" with draft and published"
}

func isStatusField(collection *core.Collection, name string) bool {
	field, ok := collection.Fields.GetByName(name).(*core.SelectField)
	return ok && field.MaxSelect <= 1 && fieldNamePattern.MatchString(name) &&
		slices.Contains(field.Values, statusDraft) && slices.Contains(field.Values, statusPublished)
}

// publishDue lists the ids of every due draft in t and publishes them one by one. Only ids are
// listed (cheap even for a large backlog) and there is no page limit: a record that keeps failing
// would otherwise occupy the first slots of every tick and starve the ones behind it.
func (x *Extension) publishDue(app core.App, t target, now types.DateTime) ([]Published, []Failure, error) {
	var ids []string
	err := app.DB().
		Select("id").
		From(t.collection).
		Where(dbx.HashExp{t.statusField: statusDraft}).
		AndWhere(dbx.NewExp(
			fmt.Sprintf("[[%s]] != '' AND [[%s]] <= {:now}", t.publishAtField, t.publishAtField),
			dbx.Params{"now": now.String()},
		)).
		OrderBy(t.publishAtField+" ASC", "id ASC").
		Column(&ids)
	if err != nil {
		return nil, nil, err
	}

	var published []Published
	var failures []Failure
	for _, id := range ids {
		item, err := x.publishOne(app, t, id, now)
		switch {
		case err != nil:
			failures = append(failures, Failure{Collection: t.collection, RecordID: id, Err: err})
		case item != nil:
			published = append(published, *item)
		}
	}
	return published, failures, nil
}

// publishOne is the conditional write. Inside a transaction (PocketBase runs every write,
// transactions included, through a single connection, so nothing else can write between the read
// and the save below) it rereads the record FRESH and publishes it only if it is STILL a draft
// with a date that has passed. An editor who, between the listing and this write, published it by
// hand, moved the date forward or cleared it wins: the record is left alone (nil, nil). Anything
// else the editor changed meanwhile is kept, because the save starts from the fresh record.
//
// The save goes through app.Save, so the record's own validation and every record hook
// (realtime, OnRecordUpdate...) run as for an edit made through the API.
func (x *Extension) publishOne(app core.App, t target, id string, now types.DateTime) (*Published, error) {
	var published *Published
	err := app.RunInTransaction(func(txApp core.App) error {
		record, err := txApp.FindRecordById(t.collection, id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil // deleted meanwhile
		}
		if err != nil {
			return err
		}
		if record.GetString(t.statusField) != statusDraft {
			return nil
		}
		scheduledAt := record.GetDateTime(t.publishAtField)
		if scheduledAt.IsZero() || scheduledAt.Time().After(now.Time()) {
			return nil
		}
		record.Set(t.statusField, statusPublished)
		record.Set(t.publishAtField, "")
		if err := txApp.Save(record); err != nil {
			return err
		}
		published = &Published{Collection: t.collection, RecordID: id, ScheduledAt: scheduledAt.String()}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return published, nil
}
