package vegapreview

import (
	"crypto/hmac"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
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
	body := `{"collection":"` + collection + `","id":"` + id + `"}`
	request := httptest.NewRequest(http.MethodPost, "/api/vega-preview/token", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if token != "" {
		request.Header.Set("Authorization", token)
	}
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
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

func TestEditorCannotMintTokenForARecordTheyCannotView(t *testing.T) {
	fixture := newPreviewFixture(t)
	response := requestToken(fixture.mux, fixture.editorA, "pages", fixture.pageB)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected inaccessible records to collapse to 404, got %d: %s",
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
	for name, token := range map[string]string{"missing": "", "invalid": "not-a-pocketbase-token"} {
		t.Run(name, func(t *testing.T) {
			response := requestToken(fixture.mux, token, "pages", fixture.pageA)
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

func TestConfigDefaultsAndFailClosedGuards(t *testing.T) {
	valid := Config{SiteOrigin: "https://site.example", SigningSecret: testSecret}
	extension, err := New(valid)
	if err != nil {
		t.Fatal(err)
	}
	if extension.config.RoutePrefix != defaultRoutePrefix ||
		extension.config.PreviewPath != defaultPreviewPath ||
		extension.config.TokenTTL != defaultTokenTTL {
		t.Fatalf("unexpected defaults: %#v", extension.config)
	}

	invalid := []Config{
		{SiteOrigin: "https://site.example/path", SigningSecret: testSecret},
		{SiteOrigin: "ftp://site.example", SigningSecret: testSecret},
		{SiteOrigin: "https://site.example", SigningSecret: "short"},
		{SiteOrigin: "https://site.example", SigningSecret: testSecret, TokenTTL: -time.Second},
		{SiteOrigin: "https://site.example", SigningSecret: testSecret, RoutePrefix: "/preview"},
	}
	for _, config := range invalid {
		if _, err := New(config); err == nil {
			t.Fatalf("expected invalid config to fail closed: %#v", config)
		}
	}
}

func TestCrossLanguageSigningVector(t *testing.T) {
	const expected = "v1.1785240300.peJi1urQKJJzW6JD4IEMOPUMss2eJYqSoyGDMBe9Wa0"
	actual := signToken(testSecret, "pages", "draft-a", 1785240300)
	if actual != expected {
		t.Fatalf("signing vector changed:\nwant %s\ngot  %s", expected, actual)
	}
}
