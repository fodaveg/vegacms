package vegapreview

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/router"
)

const testSecret = "0123456789abcdef0123456789abcdef"

type previewFixture struct {
	app       core.App
	mux       http.Handler
	extension *Extension
	editorA   string
	editorB   string
	pageA     string
	pageB     string
	blockA    string
	now       time.Time
}

func newPreviewFixture(t *testing.T) previewFixture {
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

	pages := core.NewBaseCollection("pages")
	viewRule := "owner = @request.auth.id"
	pages.ViewRule = &viewRule
	// Sending a draft requires the UpdateRule too (see TestDraftRequiresTheUpdateRule); the fixture
	// gives the owner both rights so the draft tests exercise everything past that check.
	updateRule := "owner = @request.auth.id"
	pages.UpdateRule = &updateRule
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

	blocks := core.NewBaseCollection("page_blocks")
	blocks.Fields.Add(
		&core.TextField{Name: "parent", Required: true},
		&core.NumberField{Name: "order", Required: true},
		&core.TextField{Name: "kind", Required: true},
		&core.TextField{Name: "body", Required: true},
	)
	if err := app.Save(blocks); err != nil {
		t.Fatal(err)
	}
	blockA := core.NewRecord(blocks)
	blockA.Set("parent", pageA.Id)
	blockA.Set("order", 1)
	blockA.Set("kind", "text")
	blockA.Set("body", "saved block text")
	if err := app.Save(blockA); err != nil {
		t.Fatal(err)
	}

	now := time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC)
	extension, err := New(Config{
		SiteOrigin:        "https://site.example",
		SigningSecret:     testSecret,
		AuthCollections:   []string{"vega_editors"},
		RecordCollections: []string{"pages"},
		TokenTTL:          5 * time.Minute,
		Clock:             func() time.Time { return now },
	})
	if err != nil {
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

	return previewFixture{
		app:       app,
		mux:       mux,
		extension: extension,
		editorA:   authToken(t, editorA),
		editorB:   authToken(t, editorB),
		pageA:     pageA.Id,
		pageB:     pageB.Id,
		blockA:    blockA.Id,
		now:       now,
	}
}

func newEditor(t *testing.T, app core.App, collection *core.Collection, email string) *core.Record {
	t.Helper()
	record := core.NewRecord(collection)
	record.SetEmail(email)
	record.SetPassword("password for preview tests")
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func newDraft(
	t *testing.T,
	app core.App,
	collection *core.Collection,
	ownerID string,
	title string,
) *core.Record {
	t.Helper()
	record := core.NewRecord(collection)
	record.Set("owner", ownerID)
	record.Set("status", "draft")
	record.Set("title", title)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func authToken(t *testing.T, record *core.Record) string {
	t.Helper()
	token, err := record.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func requestToken(mux http.Handler, token, collection, id string) *httptest.ResponseRecorder {
	return requestTokenWithDraft(mux, token, collection, id, nil)
}

func requestTokenWithDraft(
	mux http.Handler,
	token, collection, id string,
	draft *previewDraft,
) *httptest.ResponseRecorder {
	body, err := json.Marshal(tokenRequest{Collection: collection, ID: id, Draft: draft})
	if err != nil {
		panic(err)
	}
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/vega-preview/token",
		bytes.NewReader(body),
	)
	request.Header.Set("Content-Type", "application/json")
	if token != "" {
		request.Header.Set("Authorization", token)
	}
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}

func decryptDraftTokenForTest(
	t *testing.T,
	token, collection, id string,
	now time.Time,
) previewDraft {
	t.Helper()
	parts := strings.Split(token, ".")
	if len(parts) != 4 || parts[0] != draftTokenVersion {
		t.Fatalf("unexpected draft token shape: %q", token)
	}
	expiresUnix, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	if expiresUnix <= now.Unix() {
		t.Fatal("draft token was already expired")
	}
	nonce, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		t.Fatal(err)
	}
	ciphertext, err := base64.RawURLEncoding.DecodeString(parts[3])
	if err != nil {
		t.Fatal(err)
	}
	block, err := aes.NewCipher(deriveDraftKey(testSecret))
	if err != nil {
		t.Fatal(err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatal(err)
	}
	plaintext, err := aead.Open(
		nil,
		nonce,
		ciphertext,
		[]byte(draftPayload(collection, id, expiresUnix)),
	)
	if err != nil {
		t.Fatal(err)
	}
	var draft previewDraft
	if err := json.Unmarshal(plaintext, &draft); err != nil {
		t.Fatal(err)
	}
	return draft
}

func TestEditorMintsPreviewForSavedUnpublishedRecord(t *testing.T) {
	fixture := newPreviewFixture(t)
	response := requestToken(fixture.mux, fixture.editorA, "pages", fixture.pageA)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if cacheControl := response.Header().Get("Cache-Control"); cacheControl != "no-store" {
		t.Fatalf("preview credentials must not be cached, got Cache-Control %q", cacheControl)
	}

	var body tokenResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.ExpiresAt != "2026-07-28T12:05:00.000Z" {
		t.Fatalf("unexpected expiry: %q", body.ExpiresAt)
	}
	preview, err := url.Parse(body.URL)
	if err != nil {
		t.Fatal(err)
	}
	if preview.Scheme != "https" || preview.Host != "site.example" ||
		preview.Path != "/preview/pages/"+fixture.pageA {
		t.Fatalf("unexpected preview URL: %s", body.URL)
	}
	expected := signToken(testSecret, "pages", fixture.pageA, fixture.now.Add(5*time.Minute).Unix())
	if preview.Query().Get("token") != expected {
		t.Fatal("preview URL did not carry the signature for the requested draft")
	}
}

func TestUnsavedBlockPreviewIsEncryptedEndToEndAndDoesNotWritePocketBase(t *testing.T) {
	fixture := newPreviewFixture(t)
	pageBefore, err := fixture.app.FindRecordById("pages", fixture.pageA)
	if err != nil {
		t.Fatal(err)
	}
	pageBeforeBytes, err := json.Marshal(pageBefore)
	if err != nil {
		t.Fatal(err)
	}
	savedBefore, err := fixture.app.FindRecordById("page_blocks", fixture.blockA)
	if err != nil {
		t.Fatal(err)
	}
	beforeBytes, err := json.Marshal(savedBefore)
	if err != nil {
		t.Fatal(err)
	}

	draft := &previewDraft{
		Record: previewDraftRecord{
			ID: fixture.pageA,
			Fields: map[string]any{
				"owner":  pageBefore.GetString("owner"),
				"status": "draft",
				"title":  "Draft A",
			},
		},
		Blocks: []previewDraftRecord{{
			ID: fixture.blockA,
			Fields: map[string]any{
				"parent": fixture.pageA,
				"order":  0,
				"kind":   "text",
				"body":   "new unsaved block text",
			},
		}},
	}
	response := requestTokenWithDraft(
		fixture.mux,
		fixture.editorA,
		"pages",
		fixture.pageA,
		draft,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("draft credentials must not be cached, got Cache-Control %q", got)
	}

	var body tokenResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	preview, err := url.Parse(body.URL)
	if err != nil {
		t.Fatal(err)
	}
	if preview.RawQuery != "" {
		t.Fatalf("draft token must travel in a POST body, got query %q", preview.RawQuery)
	}
	if body.PostToken == "" {
		t.Fatal("draft response did not contain the encrypted POST token")
	}
	if strings.Contains(body.PostToken, "new unsaved block text") ||
		strings.Contains(body.PostToken, base64.RawURLEncoding.EncodeToString(
			[]byte("new unsaved block text"),
		)) {
		t.Fatal("draft plaintext is legible in the token")
	}

	opened := decryptDraftTokenForTest(
		t,
		body.PostToken,
		"pages",
		fixture.pageA,
		fixture.now,
	)
	if got := opened.Blocks[0].Fields["body"]; got != "new unsaved block text" {
		t.Fatalf("preview rendered %q instead of the editor's unsaved text", got)
	}

	savedAfter, err := fixture.app.FindRecordById("page_blocks", fixture.blockA)
	if err != nil {
		t.Fatal(err)
	}
	afterBytes, err := json.Marshal(savedAfter)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(beforeBytes, afterBytes) {
		t.Fatalf("preview changed the saved block:\nbefore %s\nafter  %s", beforeBytes, afterBytes)
	}
	if got := savedAfter.GetString("body"); got != "saved block text" {
		t.Fatalf("saved block changed to %q", got)
	}
	pageAfter, err := fixture.app.FindRecordById("pages", fixture.pageA)
	if err != nil {
		t.Fatal(err)
	}
	pageAfterBytes, err := json.Marshal(pageAfter)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(pageBeforeBytes, pageAfterBytes) {
		t.Fatalf("preview changed the saved page:\nbefore %s\nafter  %s",
			pageBeforeBytes, pageAfterBytes)
	}
}

func TestEditorCannotMintTokenForARecordTheyCannotView(t *testing.T) {
	fixture := newPreviewFixture(t)
	response := requestToken(fixture.mux, fixture.editorA, "pages", fixture.pageB)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected inaccessible records to collapse to 404, got %d: %s",
			response.Code, response.Body.String())
	}
}

func TestEditorCannotMintAnotherEditorsDraft(t *testing.T) {
	fixture := newPreviewFixture(t)
	draft := &previewDraft{
		Record: previewDraftRecord{ID: fixture.pageB, Fields: map[string]any{"title": "stolen"}},
		Blocks: []previewDraftRecord{},
	}
	response := requestTokenWithDraft(
		fixture.mux,
		fixture.editorA,
		"pages",
		fixture.pageB,
		draft,
	)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected editor B's draft to collapse to 404, got %d: %s",
			response.Code, response.Body.String())
	}
}

// setPagesRules rewrites the view and update rules of the fixture's pages collection. A nil rule
// is PocketBase's "superusers only"; a pointer to "" is "any authenticated caller".
func setPagesRules(t *testing.T, app core.App, viewRule, updateRule *string) {
	t.Helper()
	pages, err := app.FindCollectionByNameOrId("pages")
	if err != nil {
		t.Fatal(err)
	}
	pages.ViewRule = viewRule
	pages.UpdateRule = updateRule
	if err := app.Save(pages); err != nil {
		t.Fatal(err)
	}
}

// TestDraftRequiresTheUpdateRule: a draft is content proposed for the record, so minting a token
// that carries one takes the collection's UpdateRule on top of its ViewRule. Every editor here may
// VIEW page A; only the UpdateRule varies. Without a draft nothing changes: the ViewRule alone
// still decides, whatever the UpdateRule says.
func TestDraftRequiresTheUpdateRule(t *testing.T) {
	const unsavedText = "unsaved text that must not leave the server"
	anyEditor := `@request.auth.id != ""`
	open := ""
	ownerOnly := "owner = @request.auth.id"

	cases := []struct {
		name       string
		updateRule *string
		// editor B is not the owner of page A.
		asOwner   bool
		wantDraft int
	}{
		{name: "nil rule is superusers only", updateRule: nil, asOwner: true, wantDraft: http.StatusForbidden},
		{name: "empty rule admits any editor", updateRule: &open, asOwner: false, wantDraft: http.StatusOK},
		{name: "filter that passes", updateRule: &ownerOnly, asOwner: true, wantDraft: http.StatusOK},
		{name: "filter that does not pass", updateRule: &ownerOnly, asOwner: false, wantDraft: http.StatusForbidden},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := newPreviewFixture(t)
			setPagesRules(t, fixture.app, &anyEditor, testCase.updateRule)
			editor := fixture.editorB
			if testCase.asOwner {
				editor = fixture.editorA
			}

			draft := &previewDraft{
				Record: previewDraftRecord{
					ID:     fixture.pageA,
					Fields: map[string]any{"title": unsavedText},
				},
				Blocks: []previewDraftRecord{},
			}
			withDraft := requestTokenWithDraft(fixture.mux, editor, "pages", fixture.pageA, draft)
			if withDraft.Code != testCase.wantDraft {
				t.Fatalf("draft request: expected %d, got %d: %s",
					testCase.wantDraft, withDraft.Code, withDraft.Body.String())
			}
			var body tokenResponse
			if err := json.Unmarshal(withDraft.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if testCase.wantDraft == http.StatusOK {
				opened := decryptDraftTokenForTest(
					t, body.PostToken, "pages", fixture.pageA, fixture.now,
				)
				if got := opened.Record.Fields["title"]; got != unsavedText {
					t.Fatalf("expected the draft to be sealed into the token, got %q", got)
				}
			} else {
				if body.PostToken != "" || body.URL != "" {
					t.Fatalf("a refused draft must not receive any token: %s", withDraft.Body.String())
				}
				if strings.Contains(withDraft.Body.String(), unsavedText) {
					t.Fatalf("the refusal echoes the draft: %s", withDraft.Body.String())
				}
			}

			// Same editor, same record, no draft: the ViewRule alone decides, as before.
			withoutDraft := requestToken(fixture.mux, editor, "pages", fixture.pageA)
			if withoutDraft.Code != http.StatusOK {
				t.Fatalf("request without draft: expected 200, got %d: %s",
					withoutDraft.Code, withoutDraft.Body.String())
			}
			var saved tokenResponse
			if err := json.Unmarshal(withoutDraft.Body.Bytes(), &saved); err != nil {
				t.Fatal(err)
			}
			preview, err := url.Parse(saved.URL)
			if err != nil {
				t.Fatal(err)
			}
			expected := signToken(
				testSecret, "pages", fixture.pageA, fixture.now.Add(5*time.Minute).Unix(),
			)
			if saved.PostToken != "" || preview.Query().Get("token") != expected {
				t.Fatalf("request without draft must keep the v1 response, got %s",
					withoutDraft.Body.String())
			}
		})
	}
}

// TestDraftUpdateRuleEvaluatesProposedFields checks both field-change restrictions and rules that
// explicitly admit a proposed value. The HTTP envelope must not stand in for the record fields.
func TestDraftUpdateRuleEvaluatesProposedFields(t *testing.T) {
	cases := []struct {
		name       string
		updateRule string
		fields     map[string]any
		wantDraft  int
	}{
		{
			name:       "unchanged title is allowed",
			updateRule: "@request.body.title:changed = false",
			fields:     map[string]any{"title": "Draft A"},
			wantDraft:  http.StatusOK,
		},
		{
			name:       "changed title is forbidden",
			updateRule: "@request.body.title:changed = false",
			fields:     map[string]any{"title": "unsaved forbidden title"},
			wantDraft:  http.StatusForbidden,
		},
		{
			name:       "explicit proposed title is allowed with the saved owner",
			updateRule: `owner = @request.auth.id && @request.body.title = "permitido"`,
			fields:     map[string]any{"title": "permitido", "owner": "unsaved owner"},
			wantDraft:  http.StatusOK,
		},
		{
			name:       "other proposed title is forbidden",
			updateRule: `@request.body.title = "permitido"`,
			fields:     map[string]any{"title": "prohibido"},
			wantDraft:  http.StatusForbidden,
		},
		{
			name:       "omitted title is unchanged",
			updateRule: "@request.body.title:changed = false",
			fields:     map[string]any{"status": "draft"},
			wantDraft:  http.StatusOK,
		},
		{
			name: "only proposed fields are in the update body",
			updateRule: "@request.body.title:isset = true && " +
				"@request.body.collection:isset = false && @request.body.draft:isset = false",
			fields:    map[string]any{"title": "permitido"},
			wantDraft: http.StatusOK,
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := newPreviewFixture(t)
			viewRule := `@request.auth.id != ""`
			setPagesRules(t, fixture.app, &viewRule, &testCase.updateRule)
			before, err := fixture.app.FindRecordById("pages", fixture.pageA)
			if err != nil {
				t.Fatal(err)
			}
			beforeBytes, err := json.Marshal(before)
			if err != nil {
				t.Fatal(err)
			}
			draft := &previewDraft{
				Record: previewDraftRecord{ID: fixture.pageA, Fields: testCase.fields},
				Blocks: []previewDraftRecord{},
			}
			response := requestTokenWithDraft(fixture.mux, fixture.editorA, "pages", fixture.pageA, draft)
			if response.Code != testCase.wantDraft {
				t.Fatalf("expected %d, got %d: %s", testCase.wantDraft, response.Code, response.Body.String())
			}
			var body tokenResponse
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if testCase.wantDraft == http.StatusOK {
				opened := decryptDraftTokenForTest(t, body.PostToken, "pages", fixture.pageA, fixture.now)
				if got := opened.Record.Fields["title"]; got != testCase.fields["title"] {
					t.Fatalf("draft title changed before encryption: %v", got)
				}
			} else if body.PostToken != "" || body.URL != "" {
				t.Fatalf("a refused draft must not receive any token: %s", response.Body.String())
			}
			after, err := fixture.app.FindRecordById("pages", fixture.pageA)
			if err != nil {
				t.Fatal(err)
			}
			afterBytes, err := json.Marshal(after)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(beforeBytes, afterBytes) {
				t.Fatalf("preview changed the persisted record:\nbefore %s\nafter %s", beforeBytes, afterBytes)
			}
			withoutDraft := requestToken(fixture.mux, fixture.editorA, "pages", fixture.pageA)
			if withoutDraft.Code != http.StatusOK {
				t.Fatalf("request without draft: expected 200, got %d: %s", withoutDraft.Code, withoutDraft.Body.String())
			}
			var saved tokenResponse
			if err := json.Unmarshal(withoutDraft.Body.Bytes(), &saved); err != nil {
				t.Fatal(err)
			}
			preview, err := url.Parse(saved.URL)
			if err != nil {
				t.Fatal(err)
			}
			expected := signToken(testSecret, "pages", fixture.pageA, fixture.now.Add(5*time.Minute).Unix())
			if saved.PostToken != "" || preview.Query().Get("token") != expected {
				t.Fatalf("request without draft must keep the v1 response: %s", withoutDraft.Body.String())
			}
		})
	}
}

// TestDraftUpdateRulePreparesFieldValues compares ISO dates with PocketBase timestamps and file
// references with saved filenames. The ciphertext keeps the original draft values.
func TestDraftUpdateRulePreparesFieldValues(t *testing.T) {
	fixture := newPreviewFixture(t)
	pages, err := fixture.app.FindCollectionByNameOrId("pages")
	if err != nil {
		t.Fatal(err)
	}
	pages.Fields.Add(&core.DateField{Name: "publishAt"}, &core.FileField{Name: "cover"})
	if err := fixture.app.Save(pages); err != nil {
		t.Fatal(err)
	}
	page, err := fixture.app.FindRecordById("pages", fixture.pageA)
	if err != nil {
		t.Fatal(err)
	}
	page.Set("publishAt", "2026-10-07 08:00:00.000Z")
	file, err := filesystem.NewFileFromBytes([]byte("saved preview fixture"), "cover.txt")
	if err != nil {
		t.Fatal(err)
	}
	page.Set("cover", file)
	if err := fixture.app.Save(page); err != nil {
		t.Fatal(err)
	}
	viewRule := "owner = @request.auth.id"
	savedFilename := page.GetString("cover")
	cases := []struct {
		name  string
		field string
		value string
		want  int
	}{
		{name: "same instant in Vega ISO format", field: "publishAt", value: "2026-10-07T08:00:00.000Z", want: http.StatusOK},
		{name: "same instant with timezone offset", field: "publishAt", value: "2026-10-07T10:00:00.000+02:00", want: http.StatusOK},
		{name: "changed instant", field: "publishAt", value: "2026-10-07T09:00:00.000Z", want: http.StatusForbidden},
		{name: "same file reference", field: "cover", value: savedFilename, want: http.StatusOK},
		{name: "changed file reference", field: "cover", value: "other.txt", want: http.StatusForbidden},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			updateRule := "@request.body." + testCase.field + ":changed = false"
			setPagesRules(t, fixture.app, &viewRule, &updateRule)
			draft := &previewDraft{
				Record: previewDraftRecord{ID: fixture.pageA, Fields: map[string]any{testCase.field: testCase.value}},
				Blocks: []previewDraftRecord{},
			}
			response := requestTokenWithDraft(fixture.mux, fixture.editorA, "pages", fixture.pageA, draft)
			if response.Code != testCase.want {
				t.Fatalf("expected %d, got %d: %s", testCase.want, response.Code, response.Body.String())
			}
			var body tokenResponse
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if testCase.want == http.StatusOK {
				opened := decryptDraftTokenForTest(t, body.PostToken, "pages", fixture.pageA, fixture.now)
				if opened.Record.Fields[testCase.field] != testCase.value {
					t.Fatal("authorization changed the field value encrypted into the draft")
				}
			} else if body.PostToken != "" || body.URL != "" {
				t.Fatal("a refused draft received a token")
			}
			persisted, err := fixture.app.FindRecordById("pages", fixture.pageA)
			if err != nil {
				t.Fatal(err)
			}
			if persisted.GetString("publishAt") != "2026-10-07 08:00:00.000Z" ||
				persisted.GetString("cover") != savedFilename {
				t.Fatal("authorization changed the persisted date or file")
			}
		})
	}
}

// TestDraftViewRuleUsesTheOriginalRequest makes the read check discriminate between the HTTP
// envelope and the proposed update body. A draft cannot make an inaccessible record viewable.
func TestDraftViewRuleUsesTheOriginalRequest(t *testing.T) {
	cases := []struct {
		name     string
		viewRule string
		want     int
	}{
		{
			name:     "view rule still sees the HTTP envelope",
			viewRule: `owner = @request.auth.id && @request.body.collection = "pages" && @request.body.title:isset = false`,
			want:     http.StatusOK,
		},
		{
			name:     "proposed title does not grant view access",
			viewRule: `@request.body.title = "permitido"`,
			want:     http.StatusNotFound,
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := newPreviewFixture(t)
			updateRule := `@request.body.title = "permitido"`
			setPagesRules(t, fixture.app, &testCase.viewRule, &updateRule)
			draft := &previewDraft{
				Record: previewDraftRecord{ID: fixture.pageA, Fields: map[string]any{"title": "permitido"}},
				Blocks: []previewDraftRecord{},
			}
			response := requestTokenWithDraft(fixture.mux, fixture.editorA, "pages", fixture.pageA, draft)
			if response.Code != testCase.want {
				t.Fatalf("expected %d, got %d: %s", testCase.want, response.Code, response.Body.String())
			}
		})
	}
}

// TestDraftAuthorizationKeepsTheOriginalRequestInfo protects middleware that reuses the cached
// request info: update authorization must preserve its HTTP body, query, headers and editor.
func TestDraftAuthorizationKeepsTheOriginalRequestInfo(t *testing.T) {
	fixture := newPreviewFixture(t)
	viewRule := "owner = @request.auth.id"
	updateRule := `owner = @request.auth.id && @request.body.title = "permitido" && ` +
		`@request.query.preview_probe = "original" && @request.headers.x_preview_probe = "original"`
	setPagesRules(t, fixture.app, &viewRule, &updateRule)
	page, err := fixture.app.FindRecordById("pages", fixture.pageA)
	if err != nil {
		t.Fatal(err)
	}
	editor, err := fixture.app.FindRecordById("vega_editors", page.GetString("owner"))
	if err != nil {
		t.Fatal(err)
	}
	body, err := json.Marshal(tokenRequest{
		Collection: "pages",
		ID:         fixture.pageA,
		Draft: &previewDraft{
			Record: previewDraftRecord{ID: fixture.pageA, Fields: map[string]any{"title": "permitido"}},
			Blocks: []previewDraftRecord{},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/vega-preview/token?preview_probe=original", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Preview-Probe", "original")
	response := httptest.NewRecorder()
	event := &core.RequestEvent{
		App:   fixture.app,
		Auth:  editor,
		Event: router.Event{Request: request, Response: response},
	}
	if err := fixture.extension.tokenHandler(event); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	info, err := event.RequestInfo()
	if err != nil {
		t.Fatal(err)
	}
	if info.Body["collection"] != "pages" || info.Body["id"] != fixture.pageA ||
		info.Body["draft"] == nil || info.Body["title"] != nil {
		t.Fatalf("update authorization replaced the original HTTP body: %v", info.Body)
	}
	if info.Auth != editor || info.Query["preview_probe"] != "original" ||
		info.Headers["x_preview_probe"] != "original" || info.Method != http.MethodPost {
		t.Fatal("update authorization changed the original request identity or metadata")
	}
}

// TestDraftOnAnUnviewableRecordStillCollapsesTo404: the UpdateRule check never runs ahead of the
// ViewRule, so a record the editor cannot view stays indistinguishable from a missing one even
// when its UpdateRule would have admitted them.
func TestDraftOnAnUnviewableRecordStillCollapsesTo404(t *testing.T) {
	fixture := newPreviewFixture(t)
	ownerOnly := "owner = @request.auth.id"
	open := ""
	setPagesRules(t, fixture.app, &ownerOnly, &open)

	draft := &previewDraft{
		Record: previewDraftRecord{ID: fixture.pageB, Fields: map[string]any{"title": "x"}},
		Blocks: []previewDraftRecord{},
	}
	response := requestTokenWithDraft(fixture.mux, fixture.editorA, "pages", fixture.pageB, draft)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", response.Code, response.Body.String())
	}
}

func TestTokenIsBoundToTheExactRecord(t *testing.T) {
	fixture := newPreviewFixture(t)
	expiry := fixture.now.Add(5 * time.Minute).Unix()
	tokenForA := signToken(testSecret, "pages", fixture.pageA, expiry)
	tokenForB := signToken(testSecret, "pages", fixture.pageB, expiry)
	if hmac.Equal([]byte(tokenForA), []byte(tokenForB)) {
		t.Fatal("a token for record A must not validate as a token for record B")
	}
}

func TestMissingOrInvalidEditorSessionCannotMintToken(t *testing.T) {
	fixture := newPreviewFixture(t)
	draft := &previewDraft{
		Record: previewDraftRecord{ID: fixture.pageA, Fields: map[string]any{"title": "unsaved"}},
		Blocks: []previewDraftRecord{},
	}
	for name, token := range map[string]string{"missing": "", "invalid": "not-a-pocketbase-token"} {
		t.Run(name, func(t *testing.T) {
			response := requestTokenWithDraft(
				fixture.mux,
				token,
				"pages",
				fixture.pageA,
				draft,
			)
			if response.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401, got %d: %s", response.Code, response.Body.String())
			}
		})
	}
}

func TestAuthAllowlistClosesSuperuserBypassAgainstRealPocketBase(t *testing.T) {
	fixture := newPreviewFixture(t)
	superuser, err := fixture.app.FindAuthRecordByEmail(
		core.CollectionNameSuperusers,
		"test@example.com",
	)
	if err != nil {
		t.Fatal(err)
	}
	superuserToken := authToken(t, superuser)

	editorResponse := requestToken(fixture.mux, fixture.editorA, "pages", fixture.pageA)
	if editorResponse.Code != http.StatusOK {
		t.Fatalf(
			"expected allowed editor to receive 200, got %d: %s",
			editorResponse.Code,
			editorResponse.Body.String(),
		)
	}
	var editorBody tokenResponse
	if err := json.Unmarshal(editorResponse.Body.Bytes(), &editorBody); err != nil {
		t.Fatal(err)
	}
	if editorBody.URL == "" {
		t.Fatal("allowed editor response did not contain a preview token URL")
	}

	superuserResponse := requestToken(fixture.mux, superuserToken, "pages", fixture.pageA)
	if superuserResponse.Code != http.StatusForbidden {
		t.Fatalf(
			"expected authenticated superuser to receive exact 403, got %d: %s",
			superuserResponse.Code,
			superuserResponse.Body.String(),
		)
	}
	if strings.Contains(superuserResponse.Body.String(), `"url"`) ||
		strings.Contains(superuserResponse.Body.String(), `"postToken"`) {
		t.Fatalf("403 response exposed a preview token: %s", superuserResponse.Body.String())
	}

	// This branch is reachable only if the constructor guard is removed. Keeping the real
	// PocketBase request here makes the guardrail fail on the actual superuser bypass, not merely
	// on a unit assertion that New returned the wrong error.
	unsafeExtension, err := New(Config{
		SiteOrigin:        "https://site.example",
		SigningSecret:     testSecret,
		AuthCollections:   []string{"vega_editors", core.CollectionNameSuperusers},
		RecordCollections: []string{"pages"},
	})
	if err != nil {
		return
	}
	unsafeRouter, err := apis.NewRouter(fixture.app)
	if err != nil {
		t.Fatal(err)
	}
	unsafeExtension.RegisterRoutes(&core.ServeEvent{App: fixture.app, Router: unsafeRouter})
	unsafeMux, err := unsafeRouter.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	bypassResponse := requestToken(unsafeMux, superuserToken, "pages", fixture.pageA)
	t.Fatalf(
		"constructor accepted _superusers and real PocketBase returned %d: %s",
		bypassResponse.Code,
		bypassResponse.Body.String(),
	)
}

func TestUnsupportedCollectionDoesNotReceiveToken(t *testing.T) {
	fixture := newPreviewFixture(t)
	response := requestToken(fixture.mux, fixture.editorA, "other", fixture.pageA)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected unsupported collections to return 404, got %d", response.Code)
	}
}

func TestTokenIdentityRejectsTheBorrowedPayloadDelimiter(t *testing.T) {
	fixture := newPreviewFixture(t)
	for name, identity := range map[string][2]string{
		"collection": {"pages\narchive", fixture.pageA},
		"id":         {"pages", fixture.pageA + "\nother"},
	} {
		t.Run(name, func(t *testing.T) {
			response := requestToken(fixture.mux, fixture.editorA, identity[0], identity[1])
			if response.Code != http.StatusBadRequest {
				t.Fatalf(
					"expected newline-bearing identity to fail with 400, got %d: %s",
					response.Code,
					response.Body.String(),
				)
			}
		})
	}
}

func TestDraftLimitReturns413WithoutIssuingAToken(t *testing.T) {
	fixture := newPreviewFixture(t)
	draft := &previewDraft{
		Record: previewDraftRecord{
			ID:     fixture.pageA,
			Fields: map[string]any{"title": strings.Repeat("x", defaultMaxDraftBytes)},
		},
		Blocks: []previewDraftRecord{},
	}
	response := requestTokenWithDraft(
		fixture.mux,
		fixture.editorA,
		"pages",
		fixture.pageA,
		draft,
	)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d: %s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), draftTokenVersion+".") {
		t.Fatal("oversized draft response must not contain a partial token")
	}
}

func TestRawRequestLimitReturns413BeforeBindingUnknownJSON(t *testing.T) {
	fixture := newPreviewFixture(t)
	body := `{"collection":"pages","id":"` + fixture.pageA +
		`","ignored":"` + strings.Repeat("x", defaultMaxDraftBytes+maxRequestOverhead) + `"}`
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/vega-preview/token",
		strings.NewReader(body),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", fixture.editorA)
	response := httptest.NewRecorder()
	fixture.mux.ServeHTTP(response, request)

	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413 before binding an oversized body, got %d: %s",
			response.Code, response.Body.String())
	}
}

func TestConfigDefaultsAndFailClosedGuards(t *testing.T) {
	valid := Config{
		SiteOrigin:      "https://site.example",
		SigningSecret:   testSecret,
		AuthCollections: []string{"vega_editors"},
	}
	extension, err := New(valid)
	if err != nil {
		t.Fatal(err)
	}
	if extension.config.RoutePrefix != defaultRoutePrefix ||
		extension.config.PreviewPath != defaultPreviewPath ||
		extension.config.TokenTTL != defaultTokenTTL ||
		extension.config.MaxDraftBytes != defaultMaxDraftBytes {
		t.Fatalf("unexpected defaults: %#v", extension.config)
	}

	invalid := []Config{
		{
			SiteOrigin: "https://site.example/path", SigningSecret: testSecret,
			AuthCollections: []string{"vega_editors"},
		},
		{
			SiteOrigin: "ftp://site.example", SigningSecret: testSecret,
			AuthCollections: []string{"vega_editors"},
		},
		{
			SiteOrigin: "https://site.example", SigningSecret: "short",
			AuthCollections: []string{"vega_editors"},
		},
		{
			SiteOrigin: "https://site.example", SigningSecret: testSecret,
			AuthCollections: []string{"vega_editors"}, TokenTTL: -time.Second,
		},
		{
			SiteOrigin: "https://site.example", SigningSecret: testSecret,
			AuthCollections: []string{"vega_editors"}, MaxDraftBytes: -1,
		},
		{
			SiteOrigin: "https://site.example", SigningSecret: testSecret,
			AuthCollections: []string{"vega_editors"}, RoutePrefix: "/preview",
		},
	}
	for _, config := range invalid {
		if _, err := New(config); err == nil {
			t.Fatalf("expected invalid config to fail closed: %#v", config)
		}
	}

	received := maxTokenTTL + time.Second
	_, err = New(Config{
		SiteOrigin:      "https://site.example",
		SigningSecret:   testSecret,
		AuthCollections: []string{"vega_editors"},
		TokenTTL:        received,
	})
	if err == nil {
		t.Fatal("expected TokenTTL above one hour to fail closed")
	}
	if !strings.Contains(err.Error(), received.String()) ||
		!strings.Contains(err.Error(), maxTokenTTL.String()) {
		t.Fatalf("TTL error must include received and maximum values, got %q", err)
	}
}

func TestAuthCollectionsRejectInvalidEntriesWithActionableErrors(t *testing.T) {
	testCases := []struct {
		name            string
		authCollections []string
		errorContains   string
	}{
		{"nil", nil, "must name at least one dedicated editor auth collection"},
		{"empty", []string{}, "must name at least one dedicated editor auth collection"},
		{"empty entry", []string{""}, "entries must not be blank"},
		{"blank entry", []string{"   "}, "entries must not be blank"},
		{
			"superuser",
			[]string{core.CollectionNameSuperusers},
			"must not include _superusers",
		},
		{
			"superuser beside editor",
			[]string{"vega_editors", core.CollectionNameSuperusers},
			"must not include _superusers",
		},
		{"superuser different case", []string{"_Superusers"}, "must not include _superusers"},
		{"superuser with spaces", []string{" _superusers "}, "must not include _superusers"},
		{
			"editor with surrounding spaces",
			[]string{" vega_editors "},
			"has surrounding whitespace",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			extension, err := New(Config{
				SiteOrigin:      "https://site.example",
				SigningSecret:   testSecret,
				AuthCollections: testCase.authCollections,
			})
			if err == nil {
				t.Fatalf("expected invalid AuthCollections to fail closed: %#v", testCase.authCollections)
			}
			if extension != nil {
				t.Fatal("invalid AuthCollections returned a mountable extension")
			}
			if !strings.Contains(err.Error(), testCase.errorContains) {
				t.Fatalf("expected actionable error containing %q, got %q", testCase.errorContains, err)
			}
		})
	}
}

func TestAuthCollectionsValidationIsSyntacticAndDoesNotRewrite(t *testing.T) {
	authCollections := []string{"not_provisioned_yet", "not_provisioned_yet"}
	before := slices.Clone(authCollections)
	normalized, err := (Config{
		SiteOrigin:      "https://site.example",
		SigningSecret:   testSecret,
		AuthCollections: authCollections,
	}).normalized()
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(normalized.AuthCollections, before) {
		t.Fatalf(
			"normalized rewrote AuthCollections:\nbefore %#v\nafter  %#v",
			before,
			normalized.AuthCollections,
		)
	}
	if !slices.Equal(authCollections, before) {
		t.Fatalf("normalized mutated its input slice:\nbefore %#v\nafter  %#v", before, authCollections)
	}

	normalizedAgain, err := normalized.normalized()
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(normalizedAgain.AuthCollections, before) {
		t.Fatalf("second normalization rewrote AuthCollections: %#v", normalizedAgain.AuthCollections)
	}
}

func TestRecordLookupLoggingSkipsNotFoundAndRedactsErrorDetails(t *testing.T) {
	var output bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&output, nil))

	logRecordLookupFailure(logger, "pages", "missing", sql.ErrNoRows)
	if output.Len() != 0 {
		t.Fatalf("record-not-found must stay silent, got %q", output.String())
	}

	sensitive := "draft plaintext " + testSecret
	logRecordLookupFailure(logger, "pages", "draft-a", errors.New(sensitive))
	logged := output.String()
	for _, expected := range []string{
		"vegapreview: record lookup failed",
		"reason=database_error",
		"collection=pages",
		"id=draft-a",
	} {
		if !strings.Contains(logged, expected) {
			t.Fatalf("operational log is missing %q: %s", expected, logged)
		}
	}
	if strings.Contains(logged, sensitive) || strings.Contains(logged, testSecret) {
		t.Fatalf("operational log exposed sensitive error details: %s", logged)
	}
}

func TestCrossLanguageSigningVector(t *testing.T) {
	const expected = "v1.1785240300.peJi1urQKJJzW6JD4IEMOPUMss2eJYqSoyGDMBe9Wa0"
	actual := signToken(testSecret, "pages", "draft-a", 1785240300)
	if actual != expected {
		t.Fatalf("signing vector changed:\nwant %s\ngot  %s", expected, actual)
	}
}

func TestDraftCrossLanguageEncryptionVector(t *testing.T) {
	draft := previewDraft{
		Record: previewDraftRecord{
			ID: "draft-a",
			Fields: map[string]any{
				"path":   "/draft",
				"status": "draft",
				"title":  "Unsaved",
			},
		},
		Blocks: []previewDraftRecord{{
			ID: "block-a",
			Fields: map[string]any{
				"parent": "draft-a",
				"order":  0,
				"type":   "text",
				"data":   map[string]any{"body": "new unsaved block text"},
			},
		}},
	}
	plaintext, err := json.Marshal(draft)
	if err != nil {
		t.Fatal(err)
	}
	actual, err := encryptDraft(
		testSecret,
		"pages",
		"draft-a",
		1785240300,
		plaintext,
		bytes.NewReader([]byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11}),
	)
	if err != nil {
		t.Fatal(err)
	}
	const expected = "v2.1785240300.AAECAwQFBgcICQoL.Oq1lUlDnhT2sgArfEeSdkMf_dLAwRA1iXzCSZCgGUw0RmVrY1rgC50kIvW27kTvwt7dgUBwKh8Q9zB7qFP56lFQ9yYIC-zbHpilKY9l0RlfWbsu9WOeNofyEP0M7lDc_qbxt8o83uRhdoer6fN2fPmImYtafarUedxpe1nF4Acf_SbwhW8vIPogSB4XQ0HtNHZAYiD6R0mADRNqBquSftTCHRDriDXb9jFhHbaGSaPdTm5PaZSB8mhyn0upHWxtgITMI3LwMX2oBCXKNNy_Itz_VlkkF_LI8k0lcnh3Raqxsv3_P"
	if actual != expected {
		t.Fatalf("draft encryption vector changed:\nwant %s\ngot  %s", expected, actual)
	}
}

// TestRecordLookupSilenceRestsOnARealPocketBaseInvariant pins the invariant that
// logRecordLookupFailure borrows from PocketBase: a record that simply is not there arrives as
// sql.ErrNoRows, so the ordinary 404 stays out of the operational log.
//
// The sibling unit test hands the function a synthetic sql.ErrNoRows, which proves the redaction
// but cannot notice PocketBase changing the shape of that error. That difference is not academic:
// with the default empty RecordCollections allowlist, an unauthenticated caller reaches
// FindRecordById with any collection name it likes, and the identity check happens afterwards. If
// this invariant ever broke, every routine miss would log at Error level and an anonymous client
// could flood the log at will. Hence the real app, and hence the missing collection as its own case.
func TestRecordLookupSilenceRestsOnARealPocketBaseInvariant(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatalf("failed to start the test PocketBase app: %v", err)
	}
	defer app.Cleanup()

	for _, testCase := range []struct {
		name       string
		collection string
		id         string
	}{
		{"existing collection, missing id", "users", "thisidwillneverexist"},
		{"missing collection", "no_such_collection", "anything"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			if _, err := app.FindRecordById(testCase.collection, testCase.id); !errors.Is(err, sql.ErrNoRows) {
				t.Fatalf(
					"PocketBase no longer reports a missing record as sql.ErrNoRows (%T: %v); "+
						"logRecordLookupFailure would log every ordinary 404 as database_error",
					err, err,
				)
			}
		})
	}
}
