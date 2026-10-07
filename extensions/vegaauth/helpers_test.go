package vegaauth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pquerna/otp/totp"
)

const (
	testIP         = "192.0.2.1"
	testPassword   = "correct horse battery staple"
	testTOTPSecret = "JBSWY3DPEHPK3PXP"
)

// testServer is a PocketBase test app with the extension installed and its routes mounted.
type testServer struct {
	t         *testing.T
	app       *tests.TestApp
	extension *Extension
	mux       http.Handler
}

func newTestServer(t *testing.T) *testServer {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
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
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	extension.RegisterRoutes(&core.ServeEvent{App: app, Router: router})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	return &testServer{t: t, app: app, extension: extension, mux: mux}
}

// newUser stores an editor; withTOTP leaves it with an enabled, already verified second factor.
func (s *testServer) newUser(email string, withTOTP bool) *core.Record {
	s.t.Helper()
	collection, err := s.app.FindCollectionByNameOrId("vega_editors")
	if err != nil {
		s.t.Fatal(err)
	}
	user := core.NewRecord(collection)
	user.SetEmail(email)
	user.SetPassword(testPassword)
	if withTOTP {
		user.Set("totp_enabled", true)
		user.Set("totp_secret", testTOTPSecret)
	}
	if err := s.app.Save(user); err != nil {
		s.t.Fatal(err)
	}
	return user
}

func (s *testServer) reload(user *core.Record) *core.Record {
	s.t.Helper()
	fresh, err := s.app.FindRecordById("vega_editors", user.Id)
	if err != nil {
		s.t.Fatal(err)
	}
	return fresh
}

// token models sessions issued by the current extension. Use legacyToken explicitly when
// testing pre-nonce sessions, which remain valid for ordinary PocketBase operations.
func (s *testServer) token(user *core.Record) string {
	s.t.Helper()
	token, err := s.extension.distinctAuthToken(user, s.legacyToken(user))
	if err != nil {
		s.t.Fatal("could not issue test session")
	}
	return token
}

func (s *testServer) legacyToken(user *core.Record) string {
	s.t.Helper()
	token, err := user.NewAuthToken()
	if err != nil {
		s.t.Fatal(err)
	}
	return token
}

// post sends a JSON request from testIP; token may be empty for anonymous routes.
func (s *testServer) post(path, token, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, "/api/vega-auth"+path, strings.NewReader(body))
	request.RemoteAddr = testIP + ":1234"
	request.Header.Set("content-type", "application/json")
	if token != "" {
		request.Header.Set("Authorization", token)
	}
	response := httptest.NewRecorder()
	s.mux.ServeHTTP(response, request)
	return response
}

// pending completes the password step of a TOTP account and returns its pending challenge.
func (s *testServer) pending(email string) string {
	s.t.Helper()
	response := s.post("/login/password", "", `{"email":"`+email+`","password":"`+testPassword+`"}`)
	var challenge struct {
		Pending string `json:"pending"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &challenge); err != nil || challenge.Pending == "" {
		s.t.Fatalf("missing pending challenge: %d %s", response.Code, response.Body.String())
	}
	return challenge.Pending
}

// tokenOf returns the session token a login answered with.
func tokenOf(t *testing.T, response *httptest.ResponseRecorder) string {
	t.Helper()
	var session struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &session); err != nil || session.Token == "" {
		t.Fatalf("missing session token: %d", response.Code)
	}
	return session.Token
}

// refresh calls PocketBase's own auth-refresh, as the SPA does, and returns the new token.
func (s *testServer) refresh(token string) string {
	s.t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/api/collections/vega_editors/auth-refresh", nil)
	request.RemoteAddr = testIP + ":1234"
	request.Header.Set("Authorization", token)
	response := httptest.NewRecorder()
	s.mux.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		s.t.Fatalf("auth-refresh failed: %d", response.Code)
	}
	return tokenOf(s.t, response)
}

func errorCode(response *httptest.ResponseRecorder) string {
	var body struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(response.Body.Bytes(), &body)
	return body.Error
}

// totpCode returns the code of the time step `steps` periods away from now.
func totpCode(t *testing.T, secret string, steps int) string {
	t.Helper()
	code, err := totp.GenerateCode(secret, time.Now().Add(time.Duration(steps*totpPeriod)*time.Second))
	if err != nil {
		t.Fatal(err)
	}
	return code
}
