package vegaauth

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestConfigDefaultsAndRouteValidation(t *testing.T) {
	config, err := (Config{}).normalized()
	if err != nil {
		t.Fatal(err)
	}
	if config.AuthCollection != "vega_editors" || config.RoutePrefix != "/api/vega-auth" {
		t.Fatalf("unexpected defaults: %#v", config)
	}
	if _, err := (Config{RoutePrefix: "https://auth.example/api"}).normalized(); err == nil {
		t.Fatal("expected an absolute route prefix to be rejected")
	}
	config, err = (Config{RoutePrefix: "/api/custom///"}).normalized()
	if err != nil || config.RoutePrefix != "/api/custom" {
		t.Fatalf("expected trailing slashes to be normalized: %#v, %v", config, err)
	}
}

func TestRecoveryCodeFormatAndNormalization(t *testing.T) {
	extension, err := New(Config{})
	if err != nil {
		t.Fatal(err)
	}
	code, err := randomRecoveryCode(extension.random)
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$`).MatchString(code) {
		t.Fatalf("unexpected recovery code format: %q", code)
	}
	if got := normalizeRecoveryCode(" abcd e-f2345 "); got != "ABCDE-F2345" {
		t.Fatalf("unexpected normalized code: %q", got)
	}
}

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) {
	return 0, errors.New("rng unavailable")
}

func TestAssertionChallengeSelectsSessionAndRestoresBody(t *testing.T) {
	clientData, err := json.Marshal(map[string]string{"challenge": "challenge-123"})
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(map[string]any{
		"response": map[string]string{
			"clientDataJSON": base64.RawURLEncoding.EncodeToString(clientData),
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest("POST", "/finish", strings.NewReader(string(payload)))
	challenge, err := assertionChallenge(request)
	if err != nil {
		t.Fatal(err)
	}
	if challenge != "challenge-123" {
		t.Fatalf("unexpected challenge: %q", challenge)
	}
	restored, err := io.ReadAll(request.Body)
	if err != nil {
		t.Fatal(err)
	}
	if string(restored) != string(payload) {
		t.Fatal("assertionChallenge did not restore the request body")
	}
}

func TestEnsureCollectionsIsIdempotentAndClosesNativeAuthBypasses(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	authCollection := core.NewAuthCollection("vega_editors")
	if err := app.Save(authCollection); err != nil {
		t.Fatal(err)
	}
	extension, err := New(Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatalf("second idempotent setup failed: %v", err)
	}

	stored, err := app.FindCollectionByNameOrId("vega_editors")
	if err != nil {
		t.Fatal(err)
	}
	if stored.PasswordAuth.Enabled || stored.OTP.Enabled || stored.OAuth2.Enabled || stored.MFA.Enabled {
		t.Fatal("native PocketBase token issuers must be disabled for the strong-auth collection")
	}
	if stored.Fields.GetByName("totp_secret") == nil || stored.Fields.GetByName("totp_enabled") == nil {
		t.Fatal("TOTP fields were not installed")
	}
	for _, name := range []string{credentialsCollection, recoveryCollection, attemptsCollection} {
		if _, err := app.FindCollectionByNameOrId(name); err != nil {
			t.Fatalf("support collection %s was not installed: %v", name, err)
		}
	}
}

func TestEnsureCollectionsRejectsPublicReservedCollection(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	if err := app.Save(core.NewAuthCollection("vega_editors")); err != nil {
		t.Fatal(err)
	}
	public := core.NewBaseCollection(credentialsCollection)
	openRule := ""
	public.ListRule = &openRule
	if err := app.Save(public); err != nil {
		t.Fatal(err)
	}
	extension, err := New(Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err == nil || !strings.Contains(err.Error(), "API rules locked") {
		t.Fatalf("expected a fail-closed rule collision, got %v", err)
	}
}

func TestEnsureCollectionsRejectsWeakReservedIndexes(t *testing.T) {
	cases := []struct {
		name       string
		collection string
		index      string
		unique     bool
		columns    string
	}{
		{
			name: "credential index must be unique", collection: credentialsCollection,
			index: "idx_vega_webauthn_credential", unique: false, columns: "credential_id",
		},
		{
			name: "attempt index must cover identity and IP", collection: attemptsCollection,
			index: "idx_vega_login_attempts_identity_ip", unique: true, columns: "ip",
		},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			app, err := tests.NewTestApp()
			if err != nil {
				t.Fatal(err)
			}
			defer app.Cleanup()
			if err := app.Save(core.NewAuthCollection("vega_editors")); err != nil {
				t.Fatal(err)
			}
			extension, err := New(Config{})
			if err != nil {
				t.Fatal(err)
			}
			if err := extension.EnsureCollections(app); err != nil {
				t.Fatal(err)
			}
			collection, err := app.FindCollectionByNameOrId(test.collection)
			if err != nil {
				t.Fatal(err)
			}
			collection.AddIndex(test.index, test.unique, test.columns, "")
			if err := app.Save(collection); err != nil {
				t.Fatal(err)
			}
			if err := extension.EnsureCollections(app); err == nil || !strings.Contains(err.Error(), "incompatible index") {
				t.Fatalf("expected fail-closed index validation, got %v", err)
			}
		})
	}
}

func TestChallengeStoresAreBoundedPrunedAndIPBound(t *testing.T) {
	extension, err := New(Config{})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	for i := 0; i < maxWebAuthnChallenges; i++ {
		extension.sessions[string(rune(i+1))] = sessionEntry{
			data: &webauthn.SessionData{}, expires: now.Add(challengeTTL),
		}
	}
	if extension.putSession("overflow", &webauthn.SessionData{}) {
		t.Fatal("expected the WebAuthn challenge capacity to be enforced")
	}
	extension.sessions["expired"] = sessionEntry{data: &webauthn.SessionData{}, expires: now.Add(-time.Second)}
	delete(extension.sessions, string(rune(1)))
	if !extension.putSession("after-prune", &webauthn.SessionData{}) {
		t.Fatal("expected expired challenges to be pruned before enforcing capacity")
	}

	for i := 0; i < challengeBeginLimit; i++ {
		if allowed, _ := extension.allowChallengeBegin("192.0.2.1"); !allowed {
			t.Fatalf("challenge begin %d was rejected before the limit", i+1)
		}
	}
	if allowed, wait := extension.allowChallengeBegin("192.0.2.1"); allowed || wait < 1 {
		t.Fatalf("expected challenge begin rate limit, got allowed=%v wait=%d", allowed, wait)
	}

	token, err := extension.newPending("user-1", loginIdentity("user@example.com"), "192.0.2.1")
	if err != nil {
		t.Fatal("expected pending challenge capacity")
	}
	if _, ok := extension.peekPending(token, "198.51.100.1"); ok {
		t.Fatal("pending MFA challenge must be bound to the issuing IP")
	}
}

func TestRandomFailuresFailClosedBeforePersistingSecrets(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	if err := app.Save(core.NewAuthCollection("vega_editors")); err != nil {
		t.Fatal(err)
	}
	extension, err := New(Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	authCollection, err := app.FindCollectionByNameOrId("vega_editors")
	if err != nil {
		t.Fatal(err)
	}
	user := core.NewRecord(authCollection)
	user.SetEmail("user@example.com")
	user.SetPassword("password for rng test")
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}
	extension.random = failingReader{}
	user.Set("totp_enabled", true)
	user.Set("totp_secret", "JBSWY3DPEHPK3PXP")
	if err := app.Save(user); err != nil {
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
	request := httptest.NewRequest(http.MethodPost, "/api/vega-auth/login/password", strings.NewReader(`{"email":"user@example.com","password":"password for rng test"}`))
	request.Header.Set("content-type", "application/json")
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected RNG failure to return 500, got %d %s", response.Code, response.Body.String())
	}
	if _, err := extension.newPending(user.Id, loginIdentity(user.Email()), "192.0.2.1"); err == nil {
		t.Fatal("expected pending challenge generation to fail")
	}
	if len(extension.pending) != 0 {
		t.Fatal("an RNG failure must not create a pending challenge")
	}

	collection, err := app.FindCollectionByNameOrId(recoveryCollection)
	if err != nil {
		t.Fatal(err)
	}
	existing := core.NewRecord(collection)
	existing.Set("user", user.Id)
	existing.Set("code_hash", "existing-hash")
	existing.Set("used", false)
	if err := app.Save(existing); err != nil {
		t.Fatal(err)
	}
	if _, err := extension.generateRecoveryCodes(app, user.Id); err == nil {
		t.Fatal("expected recovery code generation to fail")
	}
	remaining, err := app.FindRecordsByFilter(recoveryCollection, "user = {:uid}", "", 0, 0, dbx.Params{"uid": user.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(remaining) != 1 || remaining[0].Id != existing.Id {
		t.Fatal("an RNG failure must not replace or create recovery codes")
	}
}

func TestCorrectPasswordCannotResetSecondFactorFailures(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	if err := app.Save(core.NewAuthCollection("vega_editors")); err != nil {
		t.Fatal(err)
	}
	extension, err := New(Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := extension.EnsureCollections(app); err != nil {
		t.Fatal(err)
	}
	authCollection, err := app.FindCollectionByNameOrId("vega_editors")
	if err != nil {
		t.Fatal(err)
	}
	user := core.NewRecord(authCollection)
	user.SetEmail("editor@example.com")
	user.SetPassword("correct horse battery staple")
	user.Set("totp_enabled", true)
	user.Set("totp_secret", "JBSWY3DPEHPK3PXP")
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}
	attacker := core.NewRecord(authCollection)
	attacker.SetEmail("attacker@example.com")
	attacker.SetPassword("attacker password")
	if err := app.Save(attacker); err != nil {
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
	post := func(path, body string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		request.RemoteAddr = "192.0.2.1:1234"
		request.Header.Set("content-type", "application/json")
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, request)
		return response
	}

	for i := 0; i < maxAttempts-1; i++ {
		failed := post("/api/vega-auth/login/password", `{"email":"editor@example.com","password":"wrong"}`)
		if failed.Code != http.StatusUnauthorized {
			t.Fatalf("victim failure %d was not rejected: %d", i+1, failed.Code)
		}
	}
	attackerLogin := post("/api/vega-auth/login/password", `{"email":"attacker@example.com","password":"attacker password"}`)
	if attackerLogin.Code != http.StatusOK {
		t.Fatalf("a second user on the same NAT should still log in: %d %s", attackerLogin.Code, attackerLogin.Body.String())
	}
	password := post("/api/vega-auth/login/password", `{"email":"editor@example.com","password":"correct horse battery staple"}`)
	if password.Code != http.StatusOK {
		t.Fatalf("password step failed: %d %s", password.Code, password.Body.String())
	}
	var challenge struct {
		Pending string `json:"pending"`
	}
	if err := json.Unmarshal(password.Body.Bytes(), &challenge); err != nil || challenge.Pending == "" {
		t.Fatalf("missing pending challenge: %v %s", err, password.Body.String())
	}
	victimIdentity := loginIdentity("editor@example.com")
	if wait := extension.loginLockRemaining(app, victimIdentity, "192.0.2.1"); wait != 0 {
		t.Fatalf("four failures should not lock yet, got %d seconds", wait)
	}
	invalid := post("/api/vega-auth/login/totp", `{"pending":"`+challenge.Pending+`","code":"not-a-code"}`)
	if invalid.Code != http.StatusUnauthorized {
		t.Fatalf("expected invalid TOTP to be rejected: %d %s", invalid.Code, invalid.Body.String())
	}
	if wait := extension.loginLockRemaining(app, victimIdentity, "192.0.2.1"); wait <= 0 {
		t.Fatal("fifth failure should lock the victim identity; another account must not reset it")
	}
	blocked := post("/api/vega-auth/login/password", `{"email":"editor@example.com","password":"correct horse battery staple"}`)
	if blocked.Code != http.StatusTooManyRequests {
		t.Fatalf("expected fresh password attempts to remain locked: %d %s", blocked.Code, blocked.Body.String())
	}
	attackerAgain := post("/api/vega-auth/login/password", `{"email":"attacker@example.com","password":"attacker password"}`)
	if attackerAgain.Code != http.StatusOK {
		t.Fatalf("the victim lock must not block another user on the same NAT: %d %s", attackerAgain.Code, attackerAgain.Body.String())
	}
}
