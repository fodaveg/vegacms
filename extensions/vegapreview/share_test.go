package vegapreview

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

const sharePath = "/api/vega-preview/share"

type shareFixture struct {
	app       core.App
	mux       http.Handler
	extension *Extension
	editorA   string
	editorB   string
	outsider  string
	superuser string
	editorAID string
	pageA     string
	pageB     string
	clock     *time.Time
	siteKey   string
}

// newShareFixture mirrors newPreviewFixture with ShareLinks on. Editor A owns page A and editor B
// owns page B; the pages collection lets only the owner view and update. The clock is a pointer so
// a test can move time forward.
func newShareFixture(t *testing.T) shareFixture {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)

	editors := core.NewAuthCollection("vega_editors")
	if err := app.Save(editors); err != nil {
		t.Fatal(err)
	}
	editorA := newEditor(t, app, editors, "a@example.com")
	editorB := newEditor(t, app, editors, "b@example.com")

	// An authenticated record of a collection the extension was never told about.
	visitors := core.NewAuthCollection("site_visitors")
	if err := app.Save(visitors); err != nil {
		t.Fatal(err)
	}
	outsider := newEditor(t, app, visitors, "visitor@example.com")

	superuser, err := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, "test@example.com")
	if err != nil {
		t.Fatal(err)
	}

	pages := core.NewBaseCollection("pages")
	ownerOnly := "owner = @request.auth.id"
	pages.ViewRule = &ownerOnly
	pages.UpdateRule = &ownerOnly
	pages.Fields.Add(
		&core.TextField{Name: "owner", Required: true},
		&core.TextField{Name: "status", Required: true},
		&core.TextField{Name: "title", Required: true},
	)
	if err := app.Save(pages); err != nil {
		t.Fatal(err)
	}
	pageA := newDraft(t, app, pages, editorA.Id, "Draft A")
	pageB := newDraft(t, app, pages, editorB.Id, "Draft B")

	// A collection editors can read and write but the site was not configured to share.
	notes := core.NewBaseCollection("notes")
	open := ""
	notes.ViewRule = &open
	notes.UpdateRule = &open
	notes.Fields.Add(&core.TextField{Name: "title"})
	if err := app.Save(notes); err != nil {
		t.Fatal(err)
	}

	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	clock := &now
	extension, err := New(Config{
		SiteOrigin:        "https://site.example",
		SigningSecret:     testSecret,
		AuthCollections:   []string{"vega_editors"},
		RecordCollections: []string{"pages"},
		ShareLinks:        true,
		Clock:             func() time.Time { return *clock },
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	extension.RegisterRoutes(&core.ServeEvent{App: app, Router: router})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}

	return shareFixture{
		app:       app,
		mux:       mux,
		extension: extension,
		editorA:   authToken(t, editorA),
		editorB:   authToken(t, editorB),
		outsider:  authToken(t, outsider),
		superuser: authToken(t, superuser),
		editorAID: editorA.Id,
		pageA:     pageA.Id,
		pageB:     pageB.Id,
		clock:     clock,
		siteKey:   ShareResolveKey(testSecret),
	}
}

func (f shareFixture) do(
	method, path, session string,
	headers map[string]string,
	body any,
) *httptest.ResponseRecorder {
	var reader *bytes.Reader
	switch typed := body.(type) {
	case nil:
		reader = bytes.NewReader(nil)
	case string:
		reader = bytes.NewReader([]byte(typed))
	default:
		encoded, err := json.Marshal(typed)
		if err != nil {
			panic(err)
		}
		reader = bytes.NewReader(encoded)
	}
	request := httptest.NewRequest(method, path, reader)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if session != "" {
		request.Header.Set("Authorization", session)
	}
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	response := httptest.NewRecorder()
	f.mux.ServeHTTP(response, request)
	return response
}

func (f shareFixture) create(session, collection, id string, ttlSeconds int64, label string) *httptest.ResponseRecorder {
	return f.do(http.MethodPost, sharePath, session, nil, map[string]any{
		"collection": collection, "id": id, "ttlSeconds": ttlSeconds, "label": label,
	})
}

func (f shareFixture) list(session, collection, id string) *httptest.ResponseRecorder {
	return f.do(http.MethodGet, sharePath+"?collection="+collection+"&id="+id, session, nil, nil)
}

func (f shareFixture) revoke(session, collection, id, linkID string) *httptest.ResponseRecorder {
	return f.do(http.MethodPost, sharePath+"/revoke", session, nil, map[string]any{
		"collection": collection, "id": id, "linkId": linkID,
	})
}

// resolve calls the route the way the site does: with its key and the visitor's address.
func (f shareFixture) resolve(token, clientIP string) *httptest.ResponseRecorder {
	return f.do(
		http.MethodPost, sharePath+"/resolve", "",
		map[string]string{ShareResolveKeyHeader: f.siteKey},
		map[string]any{"token": token, "clientIp": clientIP},
	)
}

// mustCreate creates a link as editor A's owner session and returns its id and its token.
func (f shareFixture) mustCreate(t *testing.T, session, id string, ttlSeconds int64) (string, string) {
	t.Helper()
	response := f.create(session, "pages", id, ttlSeconds, "")
	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", response.Code, response.Body.String())
	}
	var body shareCreateResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	const prefix = "https://site.example/preview-share/"
	if !strings.HasPrefix(body.URL, prefix) {
		t.Fatalf("unexpected share URL shape: prefix %q is missing", prefix)
	}
	return body.ID, strings.TrimPrefix(body.URL, prefix)
}

func (f shareFixture) storedLinks(t *testing.T) []*core.Record {
	t.Helper()
	links, err := f.app.FindAllRecords(shareLinksCollection)
	if err != nil {
		t.Fatal(err)
	}
	return links
}

func TestShareCreateReturnsTheURLOnceAndStoresOnlyAHash(t *testing.T) {
	fixture := newShareFixture(t)
	response := fixture.create(fixture.editorA, "pages", fixture.pageA, 3600, "  Cliente Ana  ")
	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("the response carrying the secret must not be cached, got %q", got)
	}
	var body shareCreateResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Label != "Cliente Ana" || body.ExpiresAt != "2026-10-01T13:00:00.000Z" ||
		body.CreatedBy != fixture.editorAID || body.CreatedByCollection != "vega_editors" {
		t.Fatalf("unexpected link description: %#v", body.shareLink)
	}
	token := strings.TrimPrefix(body.URL, "https://site.example/preview-share/")
	linkID, secret, ok := parseShareToken(token)
	if !ok || linkID != body.ID {
		t.Fatal("the URL does not carry a well-formed token for the created link")
	}
	if len(secret) != 43 {
		t.Fatalf("expected 32 random bytes as 43 base64url characters, got %d", len(secret))
	}
	if strings.Contains(body.URL, "pages") || strings.Contains(body.URL, fixture.pageA) {
		t.Fatal("the share URL must not name the collection or the record")
	}

	links := fixture.storedLinks(t)
	if len(links) != 1 {
		t.Fatalf("expected one stored link, got %d", len(links))
	}
	if got := links[0].GetString("secretHash"); got != hashShareSecret(linkID, secret) {
		t.Fatal("the stored value is not the hash of the secret")
	}
	// Every stored column, read straight from the row: none may hold the secret or the token.
	stored := dbx.NullStringMap{}
	if err := fixture.app.DB().
		NewQuery("SELECT * FROM " + shareLinksCollection).
		One(stored); err != nil {
		t.Fatal(err)
	}
	if len(stored) == 0 {
		t.Fatal("the raw row was not read")
	}
	for column, value := range stored {
		if strings.Contains(value.String, secret) {
			t.Fatalf("column %s stores the secret", column)
		}
	}

	// Nothing after creation can read the secret back, and the hash never leaves the server.
	listed := fixture.list(fixture.editorA, "pages", fixture.pageA)
	if listed.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", listed.Code, listed.Body.String())
	}
	for _, forbidden := range []string{secret, hashShareSecret(linkID, secret), "secretHash", "url"} {
		if strings.Contains(listed.Body.String(), forbidden) {
			t.Fatalf("the list response exposes %q", forbidden)
		}
	}

	resolved := fixture.resolve(token, "203.0.113.7")
	if resolved.Code != http.StatusOK {
		t.Fatalf("expected the fresh link to resolve, got %d: %s", resolved.Code, resolved.Body.String())
	}
	if got := resolved.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("a resolution must not be cached, got %q", got)
	}
	var target shareResolveResponse
	if err := json.Unmarshal(resolved.Body.Bytes(), &target); err != nil {
		t.Fatal(err)
	}
	if target.Collection != "pages" || target.ID != fixture.pageA ||
		target.ExpiresAt != "2026-10-01T13:00:00.000Z" {
		t.Fatalf("unexpected resolution: %#v", target)
	}
}

func TestShareSecretsAreNotReused(t *testing.T) {
	fixture := newShareFixture(t)
	_, first := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 3600)
	_, second := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 3600)
	_, firstSecret, _ := parseShareToken(first)
	_, secondSecret, _ := parseShareToken(second)
	if firstSecret == secondSecret {
		t.Fatal("two links received the same secret")
	}
}

func TestShareManagementRequiresASession(t *testing.T) {
	fixture := newShareFixture(t)
	linkID, _ := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 3600)
	for name, session := range map[string]string{"missing": "", "invalid": "not-a-pocketbase-token"} {
		t.Run(name, func(t *testing.T) {
			for route, response := range map[string]*httptest.ResponseRecorder{
				"create": fixture.create(session, "pages", fixture.pageA, 3600, ""),
				"list":   fixture.list(session, "pages", fixture.pageA),
				"revoke": fixture.revoke(session, "pages", fixture.pageA, linkID),
			} {
				if response.Code != http.StatusUnauthorized {
					t.Fatalf("%s: expected 401, got %d: %s", route, response.Code, response.Body.String())
				}
			}
		})
	}
	if len(fixture.storedLinks(t)) != 1 {
		t.Fatal("a request without a session created or deleted a link")
	}
}

func TestShareManagementRefusesOtherAuthCollectionsAndAdmitsSuperusers(t *testing.T) {
	fixture := newShareFixture(t)
	// The notes-style open rules are not what stops this caller: page rules would also refuse it,
	// so open them to prove the collection allowlist is the check.
	open := ""
	setPagesRules(t, fixture.app, &open, &open)

	for route, response := range map[string]*httptest.ResponseRecorder{
		"create": fixture.create(fixture.outsider, "pages", fixture.pageA, 3600, ""),
		"list":   fixture.list(fixture.outsider, "pages", fixture.pageA),
		"revoke": fixture.revoke(fixture.outsider, "pages", fixture.pageA, "aaaaaaaaaaaaaaa"),
	} {
		if response.Code != http.StatusForbidden {
			t.Fatalf("%s: expected 403 for a foreign auth collection, got %d: %s",
				route, response.Code, response.Body.String())
		}
	}
	if len(fixture.storedLinks(t)) != 0 {
		t.Fatal("a foreign auth record created a link")
	}

	ownerOnly := "owner = @request.auth.id"
	setPagesRules(t, fixture.app, &ownerOnly, &ownerOnly)
	response := fixture.create(fixture.superuser, "pages", fixture.pageA, 3600, "")
	if response.Code != http.StatusCreated {
		t.Fatalf("expected a superuser to create a link, got %d: %s",
			response.Code, response.Body.String())
	}
}

// TestShareManagementRequiresTheUpdateRule: every editor here may VIEW page A, only its owner may
// update it. Sharing publishes the record, so viewing is not enough for any of the three routes.
func TestShareManagementRequiresTheUpdateRule(t *testing.T) {
	fixture := newShareFixture(t)
	anyEditor := `@request.auth.id != ""`
	ownerOnly := "owner = @request.auth.id"
	setPagesRules(t, fixture.app, &anyEditor, &ownerOnly)
	linkID, token := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 3600)

	created := fixture.create(fixture.editorB, "pages", fixture.pageA, 3600, "")
	if created.Code != http.StatusForbidden {
		t.Fatalf("create: expected 403, got %d: %s", created.Code, created.Body.String())
	}
	if strings.Contains(created.Body.String(), "preview-share") {
		t.Fatalf("a refused request received a URL: %s", created.Body.String())
	}
	listed := fixture.list(fixture.editorB, "pages", fixture.pageA)
	if listed.Code != http.StatusForbidden {
		t.Fatalf("list: expected 403, got %d: %s", listed.Code, listed.Body.String())
	}
	if strings.Contains(listed.Body.String(), linkID) {
		t.Fatalf("a refused list exposed a link: %s", listed.Body.String())
	}
	revoked := fixture.revoke(fixture.editorB, "pages", fixture.pageA, linkID)
	if revoked.Code != http.StatusForbidden {
		t.Fatalf("revoke: expected 403, got %d: %s", revoked.Code, revoked.Body.String())
	}

	if len(fixture.storedLinks(t)) != 1 {
		t.Fatal("an editor without the UpdateRule created or deleted a link")
	}
	if response := fixture.resolve(token, "203.0.113.7"); response.Code != http.StatusOK {
		t.Fatalf("the owner's link must survive a refused revoke, got %d", response.Code)
	}
}

// TestShareManagementHidesRecordsTheEditorCannotView: with owner-only rules, page B looks to
// editor A exactly like a record that does not exist.
func TestShareManagementHidesRecordsTheEditorCannotView(t *testing.T) {
	fixture := newShareFixture(t)
	// The UpdateRule would let editor A through; the ViewRule alone must stop the request.
	ownerOnly := "owner = @request.auth.id"
	open := ""
	setPagesRules(t, fixture.app, &ownerOnly, &open)
	linkID, token := fixture.mustCreate(t, fixture.editorB, fixture.pageB, 3600)

	for route, pair := range map[string][2]*httptest.ResponseRecorder{
		"create": {
			fixture.create(fixture.editorA, "pages", fixture.pageB, 3600, ""),
			fixture.create(fixture.editorA, "pages", "missingrecord00", 3600, ""),
		},
		"list": {
			fixture.list(fixture.editorA, "pages", fixture.pageB),
			fixture.list(fixture.editorA, "pages", "missingrecord00"),
		},
		"revoke": {
			fixture.revoke(fixture.editorA, "pages", fixture.pageB, linkID),
			fixture.revoke(fixture.editorA, "pages", "missingrecord00", linkID),
		},
	} {
		hidden, missing := pair[0], pair[1]
		if hidden.Code != http.StatusNotFound {
			t.Fatalf("%s: expected 404, got %d: %s", route, hidden.Code, hidden.Body.String())
		}
		if hidden.Body.String() != missing.Body.String() {
			t.Fatalf("%s: an unviewable record is distinguishable from a missing one:\n%s\n%s",
				route, hidden.Body.String(), missing.Body.String())
		}
	}
	if len(fixture.storedLinks(t)) != 1 {
		t.Fatal("an editor who cannot view the record created or deleted a link")
	}
	if response := fixture.resolve(token, "203.0.113.7"); response.Code != http.StatusOK {
		t.Fatalf("editor B's link must survive, got %d", response.Code)
	}
}

func TestShareRefusesCollectionsOutsideRecordCollections(t *testing.T) {
	fixture := newShareFixture(t)
	notes, err := fixture.app.FindCollectionByNameOrId("notes")
	if err != nil {
		t.Fatal(err)
	}
	note := core.NewRecord(notes)
	note.Set("title", "readable and writable by any editor")
	if err := fixture.app.Save(note); err != nil {
		t.Fatal(err)
	}

	for route, response := range map[string]*httptest.ResponseRecorder{
		"create": fixture.create(fixture.editorA, "notes", note.Id, 3600, ""),
		"list":   fixture.list(fixture.editorA, "notes", note.Id),
		"revoke": fixture.revoke(fixture.editorA, "notes", note.Id, "aaaaaaaaaaaaaaa"),
	} {
		if response.Code != http.StatusNotFound {
			t.Fatalf("%s: expected 404 for an unlisted collection, got %d: %s",
				route, response.Code, response.Body.String())
		}
	}
	if len(fixture.storedLinks(t)) != 0 {
		t.Fatal("a link was created for a collection outside RecordCollections")
	}
}

// TestShareResolveRefusesALinkWhoseCollectionWasUnlisted: a row left behind by an earlier
// configuration (or written by hand) must not resolve once its collection is no longer shareable.
func TestShareResolveRefusesALinkWhoseCollectionWasUnlisted(t *testing.T) {
	fixture := newShareFixture(t)
	notes, err := fixture.app.FindCollectionByNameOrId("notes")
	if err != nil {
		t.Fatal(err)
	}
	note := core.NewRecord(notes)
	note.Set("title", "not shareable")
	if err := fixture.app.Save(note); err != nil {
		t.Fatal(err)
	}
	linkID, token := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 3600)
	link, err := fixture.app.FindRecordById(shareLinksCollection, linkID)
	if err != nil {
		t.Fatal(err)
	}
	link.Set("collection", "notes")
	link.Set("recordId", note.Id)
	if err := fixture.app.Save(link); err != nil {
		t.Fatal(err)
	}
	if response := fixture.resolve(token, "203.0.113.7"); response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", response.Code, response.Body.String())
	}
}

func TestShareDurationIsBoundedByTheConfiguredRange(t *testing.T) {
	fixture := newShareFixture(t)
	thirtyDays := int64(30 * 24 * 60 * 60)
	for name, testCase := range map[string]struct {
		ttl  int64
		want int
	}{
		"missing":             {0, http.StatusBadRequest},
		"negative":            {-3600, http.StatusBadRequest},
		"below the minimum":   {299, http.StatusBadRequest},
		"the minimum":         {300, http.StatusCreated},
		"the maximum":         {thirtyDays, http.StatusCreated},
		"one second too long": {thirtyDays + 1, http.StatusBadRequest},
		"absurdly long":       {1 << 62, http.StatusBadRequest},
	} {
		t.Run(name, func(t *testing.T) {
			before := len(fixture.storedLinks(t))
			response := fixture.create(fixture.editorA, "pages", fixture.pageA, testCase.ttl, "")
			if response.Code != testCase.want {
				t.Fatalf("expected %d, got %d: %s", testCase.want, response.Code, response.Body.String())
			}
			created := len(fixture.storedLinks(t)) - before
			if (testCase.want == http.StatusCreated) != (created == 1) {
				t.Fatalf("status %d but %d links were stored", response.Code, created)
			}
		})
	}

	fractional := fixture.do(http.MethodPost, sharePath, fixture.editorA, nil,
		`{"collection":"pages","id":"`+fixture.pageA+`","ttlSeconds":3600.5}`)
	if fractional.Code != http.StatusBadRequest {
		t.Fatalf("expected a fractional ttlSeconds to fail with 400, got %d", fractional.Code)
	}
}

func TestShareLabelIsShortPlainText(t *testing.T) {
	fixture := newShareFixture(t)
	for name, label := range map[string]string{
		"too long":          strings.Repeat("ñ", maxShareLabelRunes+1),
		"control character": "línea\nnueva",
	} {
		t.Run(name, func(t *testing.T) {
			response := fixture.create(fixture.editorA, "pages", fixture.pageA, 3600, label)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
			}
		})
	}
	longest := fixture.create(
		fixture.editorA, "pages", fixture.pageA, 3600, strings.Repeat("ñ", maxShareLabelRunes),
	)
	if longest.Code != http.StatusCreated {
		t.Fatalf("expected a %d character label to be accepted, got %d: %s",
			maxShareLabelRunes, longest.Code, longest.Body.String())
	}
}

func TestShareConfigFailsClosed(t *testing.T) {
	base := func() Config {
		return Config{
			SiteOrigin:        "https://site.example",
			SigningSecret:     testSecret,
			AuthCollections:   []string{"vega_editors"},
			RecordCollections: []string{"pages"},
			ShareLinks:        true,
		}
	}
	extension, err := New(base())
	if err != nil {
		t.Fatal(err)
	}
	if extension.config.ShareMaxTTL != 30*24*time.Hour ||
		extension.config.ShareMinTTL != defaultShareMinTTL ||
		extension.config.SharePath != defaultSharePath {
		t.Fatalf("unexpected share defaults: %#v", extension.config)
	}

	for name, mutate := range map[string]func(*Config){
		"maximum above 30 days":             func(c *Config) { c.ShareMaxTTL = 30*24*time.Hour + time.Second },
		"negative maximum":                  func(c *Config) { c.ShareMaxTTL = -time.Hour },
		"negative minimum":                  func(c *Config) { c.ShareMinTTL = -time.Hour },
		"minimum below one second":          func(c *Config) { c.ShareMinTTL = time.Millisecond },
		"minimum above maximum":             func(c *Config) { c.ShareMinTTL = 2 * time.Hour; c.ShareMaxTTL = time.Hour },
		"no shareable collections":          func(c *Config) { c.RecordCollections = nil },
		"links collection listed":           func(c *Config) { c.RecordCollections = []string{"pages", shareLinksCollection} },
		"share path equals preview path":    func(c *Config) { c.SharePath = "/preview" },
		"share path below the preview path": func(c *Config) { c.SharePath = "/preview/share" },
		"share path with a query":           func(c *Config) { c.SharePath = "/share?x=1" },
		"relative share path":               func(c *Config) { c.SharePath = "share" },
	} {
		t.Run(name, func(t *testing.T) {
			config := base()
			mutate(&config)
			extension, err := New(config)
			if err == nil {
				t.Fatalf("expected the configuration to fail closed: %#v", config)
			}
			if extension != nil {
				t.Fatal("an invalid configuration returned a mountable extension")
			}
		})
	}

	// The ceiling is checked even when the feature is off, and the error names both values.
	received := 31 * 24 * time.Hour
	disabled := base()
	disabled.ShareLinks = false
	disabled.ShareMaxTTL = received
	_, err = New(disabled)
	if err == nil {
		t.Fatal("expected ShareMaxTTL above 30 days to fail closed with ShareLinks off")
	}
	if !strings.Contains(err.Error(), received.String()) ||
		!strings.Contains(err.Error(), shareHardMaxTTL.String()) {
		t.Fatalf("the error must include the received and maximum values, got %q", err)
	}
}

func TestShareRoutesAreNotMountedUnlessEnabled(t *testing.T) {
	fixture := newPreviewFixture(t)
	if err := fixture.extension.EnsureCollections(fixture.app); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.app.FindCollectionByNameOrId(shareLinksCollection); err == nil {
		t.Fatal("EnsureCollections created the links collection with ShareLinks off")
	}
	for _, route := range []struct{ method, path string }{
		{http.MethodPost, sharePath},
		{http.MethodGet, sharePath + "?collection=pages&id=" + fixture.pageA},
		{http.MethodPost, sharePath + "/revoke"},
		{http.MethodPost, sharePath + "/resolve"},
	} {
		request := httptest.NewRequest(route.method, route.path, strings.NewReader("{}"))
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Authorization", fixture.editorA)
		request.Header.Set(ShareResolveKeyHeader, ShareResolveKey(testSecret))
		response := httptest.NewRecorder()
		fixture.mux.ServeHTTP(response, request)
		if response.Code != http.StatusNotFound {
			t.Fatalf("%s %s: expected 404 with ShareLinks off, got %d",
				route.method, route.path, response.Code)
		}
	}
}

func TestShareCollectionIsPrivateAndEnsureIsIdempotent(t *testing.T) {
	fixture := newShareFixture(t)
	links, err := fixture.app.FindCollectionByNameOrId(shareLinksCollection)
	if err != nil {
		t.Fatal(err)
	}
	if links.ListRule != nil || links.ViewRule != nil || links.CreateRule != nil ||
		links.UpdateRule != nil || links.DeleteRule != nil {
		t.Fatal("the links collection must keep its five API rules locked")
	}
	if err := fixture.extension.EnsureCollections(fixture.app); err != nil {
		t.Fatalf("a second EnsureCollections must be a no-op, got %v", err)
	}

	// PocketBase's own records API must refuse an editor, whatever the extension's routes do.
	request := httptest.NewRequest(
		http.MethodGet, "/api/collections/"+shareLinksCollection+"/records", nil,
	)
	request.Header.Set("Authorization", fixture.editorA)
	response := httptest.NewRecorder()
	fixture.mux.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected the records API to refuse an editor with 403, got %d: %s",
			response.Code, response.Body.String())
	}

	open := ""
	links.ListRule = &open
	if err := fixture.app.Save(links); err != nil {
		t.Fatal(err)
	}
	if err := fixture.extension.EnsureCollections(fixture.app); err == nil {
		t.Fatal("EnsureCollections accepted a links collection with an open API rule")
	}
}

func TestShareListReturnsOnlyLiveLinksOfThatRecordAndPurgesExpiredOnes(t *testing.T) {
	fixture := newShareFixture(t)
	shortID, _ := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 600)
	longID, _ := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 7200)
	otherID, _ := fixture.mustCreate(t, fixture.editorB, fixture.pageB, 600)

	*fixture.clock = fixture.clock.Add(time.Hour)
	response := fixture.list(fixture.editorA, "pages", fixture.pageA)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body shareListResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 1 || body.Items[0].ID != longID {
		t.Fatalf("expected only the live link %s (not %s nor %s), got %s",
			longID, shortID, otherID, response.Body.String())
	}
	// Both expired rows are gone from the database, including the one of another record.
	stored := fixture.storedLinks(t)
	if len(stored) != 1 || stored[0].Id != longID {
		t.Fatalf("expected the expired rows to be deleted, %d rows remain", len(stored))
	}
}

func TestShareCreatePurgesExpiredLinks(t *testing.T) {
	fixture := newShareFixture(t)
	fixture.mustCreate(t, fixture.editorB, fixture.pageB, 600)
	*fixture.clock = fixture.clock.Add(time.Hour)
	freshID, _ := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 600)
	stored := fixture.storedLinks(t)
	if len(stored) != 1 || stored[0].Id != freshID {
		t.Fatalf("expected creating a link to delete the expired one, %d rows remain", len(stored))
	}
}

func TestShareLinkStopsResolvingWhenItExpires(t *testing.T) {
	fixture := newShareFixture(t)
	_, token := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 600)

	*fixture.clock = fixture.clock.Add(10*time.Minute - time.Second)
	if response := fixture.resolve(token, "203.0.113.7"); response.Code != http.StatusOK {
		t.Fatalf("expected the link to resolve one second before expiry, got %d", response.Code)
	}
	*fixture.clock = fixture.clock.Add(time.Second)
	if response := fixture.resolve(token, "203.0.113.7"); response.Code != http.StatusNotFound {
		t.Fatalf("expected 404 at the expiry instant, got %d: %s", response.Code, response.Body.String())
	}
	// The row is still there (nothing purged it): the refusal came from the expiry check.
	if len(fixture.storedLinks(t)) != 1 {
		t.Fatal("this test needs the expired row to still exist")
	}
}

func TestShareRevokeIsImmediateIdempotentAndScopedToTheRecord(t *testing.T) {
	fixture := newShareFixture(t)
	linkID, token := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 3600)
	otherID, otherToken := fixture.mustCreate(t, fixture.editorB, fixture.pageB, 3600)

	// Editor A may manage page A's links, and names editor B's link: it must be left alone.
	crossed := fixture.revoke(fixture.editorA, "pages", fixture.pageA, otherID)
	if crossed.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", crossed.Code, crossed.Body.String())
	}
	if response := fixture.resolve(otherToken, "203.0.113.7"); response.Code != http.StatusOK {
		t.Fatalf("a link of another record was revoked through page A, got %d", response.Code)
	}

	for attempt := range 2 {
		response := fixture.revoke(fixture.editorA, "pages", fixture.pageA, linkID)
		if response.Code != http.StatusNoContent {
			t.Fatalf("attempt %d: expected 204, got %d: %s", attempt, response.Code, response.Body.String())
		}
	}
	unknown := fixture.revoke(fixture.editorA, "pages", fixture.pageA, "neverexisted000")
	if unknown.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for an unknown link, got %d", unknown.Code)
	}
	if response := fixture.resolve(token, "203.0.113.7"); response.Code != http.StatusNotFound {
		t.Fatalf("expected a revoked link to answer 404, got %d", response.Code)
	}
	listed := fixture.list(fixture.editorA, "pages", fixture.pageA)
	if strings.Contains(listed.Body.String(), linkID) {
		t.Fatalf("a revoked link is still listed: %s", listed.Body.String())
	}
	missing := fixture.revoke(fixture.editorA, "pages", fixture.pageA, "")
	if missing.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 without linkId, got %d", missing.Code)
	}
}

func TestShareSecretOfOneLinkDoesNotOpenAnother(t *testing.T) {
	fixture := newShareFixture(t)
	_, tokenA := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 3600)
	_, tokenB := fixture.mustCreate(t, fixture.editorB, fixture.pageB, 3600)
	idA, secretA, _ := parseShareToken(tokenA)
	idB, secretB, _ := parseShareToken(tokenB)

	for name, token := range map[string]string{
		"link B with the secret of link A": shareTokenVersion + "." + idB + "." + secretA,
		"link A with the secret of link B": shareTokenVersion + "." + idA + "." + secretB,
	} {
		t.Run(name, func(t *testing.T) {
			response := fixture.resolve(token, "203.0.113.7")
			if response.Code != http.StatusNotFound {
				t.Fatalf("expected 404, got %d: %s", response.Code, response.Body.String())
			}
		})
	}

	// Even a row holding the bare SHA-256 of another link's secret would not match: the link id
	// is part of what is hashed.
	if hashShareSecret(idA, secretA) == hashShareSecret(idB, secretA) {
		t.Fatal("the stored hash does not depend on the link id")
	}
}

func TestShareLinkOfADeletedRecordDoesNotResolveAndIsDropped(t *testing.T) {
	fixture := newShareFixture(t)
	_, token := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 3600)
	page, err := fixture.app.FindRecordById("pages", fixture.pageA)
	if err != nil {
		t.Fatal(err)
	}
	if err := fixture.app.Delete(page); err != nil {
		t.Fatal(err)
	}
	response := fixture.resolve(token, "203.0.113.7")
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for a deleted record, got %d: %s", response.Code, response.Body.String())
	}
	if len(fixture.storedLinks(t)) != 0 {
		t.Fatal("the link of a deleted record was kept")
	}
}

// TestShareResolveRefusalsAreIndistinguishable: every reason to refuse a token must look the same
// from outside, so the route cannot be used to learn whether a link ever existed.
func TestShareResolveRefusalsAreIndistinguishable(t *testing.T) {
	fixture := newShareFixture(t)
	_, expiredToken := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 300)
	revokedID, revokedToken := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 3600)
	_, liveToken := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 3600)
	_, orphanToken := fixture.mustCreate(t, fixture.editorB, fixture.pageB, 3600)

	if response := fixture.revoke(fixture.editorA, "pages", fixture.pageA, revokedID); response.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", response.Code)
	}
	pageB, err := fixture.app.FindRecordById("pages", fixture.pageB)
	if err != nil {
		t.Fatal(err)
	}
	if err := fixture.app.Delete(pageB); err != nil {
		t.Fatal(err)
	}
	*fixture.clock = fixture.clock.Add(10 * time.Minute)

	liveID, _, _ := parseShareToken(liveToken)
	refusals := map[string]string{
		"expired":        expiredToken,
		"revoked":        revokedToken,
		"deleted record": orphanToken,
		"unknown link":   shareTokenVersion + ".neverexisted000." + strings.Repeat("A", 43),
		"wrong secret":   shareTokenVersion + "." + liveID + "." + strings.Repeat("A", 43),
		"malformed":      "not-a-token",
		"empty":          "",
		"old version":    "v1.1785240300.peJi1urQKJJzW6JD4IEMOPUMss2eJYqSoyGDMBe9Wa0",
	}
	var reference *httptest.ResponseRecorder
	var referenceName string
	visitor := 0
	for name, token := range refusals {
		visitor++
		response := fixture.resolve(token, fmt.Sprintf("203.0.113.%d", visitor))
		if response.Code != http.StatusNotFound {
			t.Fatalf("%s: expected 404, got %d: %s", name, response.Code, response.Body.String())
		}
		if got := response.Header().Get("Cache-Control"); got != "no-store" {
			t.Fatalf("%s: a refusal must not be cached, got %q", name, got)
		}
		if reference == nil {
			reference, referenceName = response, name
			continue
		}
		if response.Body.String() != reference.Body.String() {
			t.Fatalf("%q and %q are distinguishable by body:\n%s\n%s",
				name, referenceName, response.Body.String(), reference.Body.String())
		}
		for header, values := range reference.Header() {
			if got := response.Header().Values(header); strings.Join(got, ",") != strings.Join(values, ",") {
				t.Fatalf("%q and %q differ in header %s: %v vs %v",
					name, referenceName, header, got, values)
			}
		}
		if len(response.Header()) != len(reference.Header()) {
			t.Fatalf("%q and %q carry a different set of headers", name, referenceName)
		}
	}
	if response := fixture.resolve(liveToken, "203.0.113.200"); response.Code != http.StatusOK {
		t.Fatalf("the live link must still resolve, got %d", response.Code)
	}
}

func TestShareResolveRequiresTheSiteKey(t *testing.T) {
	fixture := newShareFixture(t)
	_, token := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 3600)
	body := map[string]any{"token": token}

	for name, headers := range map[string]map[string]string{
		"missing":             nil,
		"wrong":               {ShareResolveKeyHeader: ShareResolveKey("another secret of thirty-two bytes!!")},
		"the secret itself":   {ShareResolveKeyHeader: testSecret},
		"an editor's session": {"Authorization": fixture.editorA},
	} {
		t.Run(name, func(t *testing.T) {
			response := fixture.do(http.MethodPost, sharePath+"/resolve", "", headers, body)
			if response.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401, got %d: %s", response.Code, response.Body.String())
			}
			if strings.Contains(response.Body.String(), fixture.pageA) {
				t.Fatalf("a refused caller learned the target: %s", response.Body.String())
			}
		})
	}
	if ShareResolveKey(testSecret) == testSecret ||
		strings.Contains(ShareResolveKey(testSecret), testSecret) {
		t.Fatal("the site key must be derived from the signing secret, not be it")
	}
}

func TestShareResolveLimitsFailedAttemptsPerVisitor(t *testing.T) {
	fixture := newShareFixture(t)
	_, token := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 3600)
	const attacker = "198.51.100.9"
	guess := shareTokenVersion + ".neverexisted000." + strings.Repeat("A", 43)

	for attempt := range shareResolveMaxFailures {
		response := fixture.resolve(guess, attacker)
		if response.Code != http.StatusNotFound {
			t.Fatalf("attempt %d: expected 404, got %d", attempt, response.Code)
		}
	}
	blocked := fixture.resolve(guess, attacker)
	if blocked.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after %d failures, got %d: %s",
			shareResolveMaxFailures, blocked.Code, blocked.Body.String())
	}
	if blocked.Header().Get("Retry-After") != "60" {
		t.Fatalf("expected Retry-After: 60, got %q", blocked.Header().Get("Retry-After"))
	}
	// While blocked, not even a valid token gets an answer: the limit is on the visitor.
	if response := fixture.resolve(token, attacker); response.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 for a blocked visitor with a valid token, got %d", response.Code)
	}
	// The same address written as an IPv4-mapped IPv6 is the same visitor.
	if response := fixture.resolve(token, "::ffff:"+attacker); response.Code != http.StatusTooManyRequests {
		t.Fatalf("expected the mapped form of the address to share the bucket, got %d", response.Code)
	}
	// Another visitor is unaffected, and successes never count as failures.
	for range shareResolveMaxFailures * 2 {
		if response := fixture.resolve(token, "203.0.113.7"); response.Code != http.StatusOK {
			t.Fatalf("expected another visitor to keep resolving, got %d", response.Code)
		}
	}
	*fixture.clock = fixture.clock.Add(shareResolveWindow)
	if response := fixture.resolve(token, attacker); response.Code != http.StatusOK {
		t.Fatalf("expected the block to lift after the window, got %d", response.Code)
	}

	invalid := fixture.resolve(token, "not-an-address")
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a malformed clientIp, got %d", invalid.Code)
	}
}

func TestShareResolveLimitsCallersWithoutTheSiteKey(t *testing.T) {
	fixture := newShareFixture(t)
	_, token := fixture.mustCreate(t, fixture.editorA, fixture.pageA, 3600)
	wrong := map[string]string{ShareResolveKeyHeader: "guess"}
	body := map[string]any{"token": token}
	for attempt := range shareResolveMaxFailures {
		response := fixture.do(http.MethodPost, sharePath+"/resolve", "", wrong, body)
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected 401, got %d", attempt, response.Code)
		}
	}
	response := fixture.do(http.MethodPost, sharePath+"/resolve", "", wrong, body)
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after %d bad keys, got %d", shareResolveMaxFailures, response.Code)
	}
}

func TestAttemptLimiterIsBoundedAndSafeForConcurrentUse(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	limiter := newAttemptLimiter(2, time.Minute, 3)
	for _, key := range []string{"a", "b", "c", "d", "e"} {
		limiter.fail(key, now)
	}
	if len(limiter.buckets) != 3 {
		t.Fatalf("expected the limiter to stop at its capacity of 3, it holds %d", len(limiter.buckets))
	}
	// A key the full limiter could not record is refused rather than let through uncounted.
	if limiter.blockedFor("e", now) == 0 {
		t.Fatal("an untracked key passed a full limiter")
	}
	if limiter.blockedFor("a", now) != 0 {
		t.Fatal("a tracked key below the limit must still pass")
	}
	later := now.Add(time.Minute)
	if limiter.blockedFor("e", later) != 0 {
		t.Fatal("expired buckets were not swept to make room")
	}

	shared := newAttemptLimiter(1000, time.Minute, 100)
	var wait sync.WaitGroup
	for worker := range 8 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			for attempt := range 100 {
				key := fmt.Sprintf("key-%d", (worker+attempt)%10)
				shared.fail(key, now)
				shared.blockedFor(key, now)
			}
		}()
	}
	wait.Wait()
	total := 0
	for _, bucket := range shared.buckets {
		total += bucket.failures
	}
	if total != 800 {
		t.Fatalf("expected 800 counted failures, got %d", total)
	}
}

func TestShareRequestBodiesAreBounded(t *testing.T) {
	fixture := newShareFixture(t)
	padding := strings.Repeat("x", maxShareRequestBytes)
	siteKey := map[string]string{ShareResolveKeyHeader: fixture.siteKey}
	for name, response := range map[string]*httptest.ResponseRecorder{
		"create": fixture.do(http.MethodPost, sharePath, fixture.editorA, nil,
			`{"collection":"pages","id":"`+fixture.pageA+`","ttlSeconds":3600,"ignored":"`+padding+`"}`),
		"revoke": fixture.do(http.MethodPost, sharePath+"/revoke", fixture.editorA, nil,
			`{"collection":"pages","id":"`+fixture.pageA+`","linkId":"x","ignored":"`+padding+`"}`),
		"resolve": fixture.do(http.MethodPost, sharePath+"/resolve", "", siteKey,
			`{"token":"`+padding+`"}`),
	} {
		if response.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("%s: expected 413, got %d: %s", name, response.Code, response.Body.String())
		}
	}
	if len(fixture.storedLinks(t)) != 0 {
		t.Fatal("an oversized request created a link")
	}

	// A body that lies about its length (chunked, no Content-Length) hits the reader limit instead.
	request := httptest.NewRequest(
		http.MethodPost, sharePath+"/resolve",
		struct{ *strings.Reader }{strings.NewReader(`{"token":"` + padding + `"}`)},
	)
	request.ContentLength = -1
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(ShareResolveKeyHeader, fixture.siteKey)
	response := httptest.NewRecorder()
	fixture.mux.ServeHTTP(response, request)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413 from the reader limit, got %d: %s", response.Code, response.Body.String())
	}
}

// TestShareLinksDoNotChangeTheSignedTokenRoute: POST /token keeps refusing superusers and keeps
// its v1 response with ShareLinks on.
func TestShareLinksDoNotChangeTheSignedTokenRoute(t *testing.T) {
	fixture := newShareFixture(t)
	if response := requestToken(fixture.mux, fixture.superuser, "pages", fixture.pageA); response.Code != http.StatusForbidden {
		t.Fatalf("expected /token to keep refusing superusers, got %d", response.Code)
	}
	response := requestToken(fixture.mux, fixture.editorA, "pages", fixture.pageA)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "token=v1.") {
		t.Fatalf("expected the v1 response, got %d: %s", response.Code, response.Body.String())
	}
}
