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
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
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
	valid := Config{SiteOrigin: "https://site.example", SigningSecret: testSecret}
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
		{SiteOrigin: "https://site.example/path", SigningSecret: testSecret},
		{SiteOrigin: "ftp://site.example", SigningSecret: testSecret},
		{SiteOrigin: "https://site.example", SigningSecret: "short"},
		{SiteOrigin: "https://site.example", SigningSecret: testSecret, TokenTTL: -time.Second},
		{SiteOrigin: "https://site.example", SigningSecret: testSecret, MaxDraftBytes: -1},
		{SiteOrigin: "https://site.example", SigningSecret: testSecret, RoutePrefix: "/preview"},
	}
	for _, config := range invalid {
		if _, err := New(config); err == nil {
			t.Fatalf("expected invalid config to fail closed: %#v", config)
		}
	}

	received := maxTokenTTL + time.Second
	_, err = New(Config{
		SiteOrigin:    "https://site.example",
		SigningSecret: testSecret,
		TokenTTL:      received,
	})
	if err == nil {
		t.Fatal("expected TokenTTL above one hour to fail closed")
	}
	if !strings.Contains(err.Error(), received.String()) ||
		!strings.Contains(err.Error(), maxTokenTTL.String()) {
		t.Fatalf("TTL error must include received and maximum values, got %q", err)
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
