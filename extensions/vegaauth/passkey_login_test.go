package vegaauth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// passkeyLogin runs a whole discoverable login ceremony with the authenticator's current state.
func (s *testServer) passkeyLogin(authenticator *virtualAuthenticator, userID string) *httptest.ResponseRecorder {
	s.t.Helper()
	begin := s.post("/passkey/login/discoverable/begin", "", "")
	if begin.Code != http.StatusOK {
		s.t.Fatalf("begin failed: %d %s", begin.Code, begin.Body.String())
	}
	return s.post("/passkey/login/discoverable/finish", "", authenticator.assertion(challengeOf(s.t, begin.Body.Bytes()), userID))
}

func TestPasskeyLoginRequiresUserVerification(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", false)
	authenticator := newAuthenticator(t)
	authenticator.store(server.app, user)

	begin := server.post("/passkey/login/discoverable/begin", "", "")
	if !strings.Contains(begin.Body.String(), `"userVerification":"required"`) {
		t.Errorf("the login options must ask the authenticator for user verification: %s", begin.Body.String())
	}

	authenticator.verifyUser = false
	authenticator.counter = 1
	presenceOnly := server.passkeyLogin(authenticator, user.Id)
	if presenceOnly.Code != http.StatusUnauthorized || errorCode(presenceOnly) != "verify_failed" {
		t.Fatalf("an assertion without user verification must be rejected: %d %s", presenceOnly.Code, errorCode(presenceOnly))
	}
	if stored := authenticator.storedCredential(server.app); stored.Authenticator.SignCount != 0 {
		t.Fatal("a rejected assertion must not advance the stored counter")
	}

	authenticator.verifyUser = true
	authenticator.counter = 2
	verified := server.passkeyLogin(authenticator, user.Id)
	if verified.Code != http.StatusOK {
		t.Fatalf("a verified assertion must log in: %d %s", verified.Code, errorCode(verified))
	}
	if stored := authenticator.storedCredential(server.app); stored.Authenticator.SignCount != 2 {
		t.Fatalf("expected the stored counter to advance to 2, got %d", stored.Authenticator.SignCount)
	}
}

func TestPasskeyLoginRejectsAndRecordsACounterThatGoesBackwards(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", false)
	authenticator := newAuthenticator(t)
	authenticator.counter = 10
	authenticator.store(server.app, user)

	// A copy of the authenticator that is behind the one the server last saw.
	authenticator.counter = 5
	cloned := server.passkeyLogin(authenticator, user.Id)
	if cloned.Code != http.StatusUnauthorized || errorCode(cloned) != "verify_failed" {
		t.Fatalf("a counter that goes backwards must be rejected: %d %s", cloned.Code, errorCode(cloned))
	}
	stored := authenticator.storedCredential(server.app)
	if !stored.Authenticator.CloneWarning || stored.Authenticator.SignCount != 10 {
		t.Fatalf("the warning must be stored and the counter left untouched: %+v", stored.Authenticator)
	}
	row, err := server.app.FindFirstRecordByFilter(attemptsCollection, "identity = {:identity}", map[string]any{"identity": loginIdentity("editor@example.com")})
	if err != nil || row.GetInt("attempts") != 1 {
		t.Fatalf("the rejected assertion must count as a failed login: %v", err)
	}

	// The authenticator that is ahead keeps working, and the warning stays on record.
	authenticator.counter = 11
	ahead := server.passkeyLogin(authenticator, user.Id)
	if ahead.Code != http.StatusOK {
		t.Fatalf("a counter that advances must log in: %d %s", ahead.Code, errorCode(ahead))
	}
	stored = authenticator.storedCredential(server.app)
	if !stored.Authenticator.CloneWarning || stored.Authenticator.SignCount != 11 {
		t.Fatalf("the warning must survive a later accepted login: %+v", stored.Authenticator)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/vega-auth/passkey/list", nil)
	request.Header.Set("Authorization", server.token(user))
	response := httptest.NewRecorder()
	server.mux.ServeHTTP(response, request)
	var list struct {
		Passkeys []struct {
			CloneWarning bool `json:"cloneWarning"`
		} `json:"passkeys"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &list); err != nil || len(list.Passkeys) != 1 || !list.Passkeys[0].CloneWarning {
		t.Fatalf("the owner must see the warning in the passkey list: %d %s", response.Code, response.Body.String())
	}
}

func TestSyncedPasskeysWithoutCounterKeepLoggingIn(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", false)
	authenticator := newAuthenticator(t) // counter 0, as platform-synced passkeys report
	authenticator.store(server.app, user)
	for i := 0; i < 2; i++ {
		if login := server.passkeyLogin(authenticator, user.Id); login.Code != http.StatusOK {
			t.Fatalf("login %d with a counter-less passkey failed: %d %s", i+1, login.Code, errorCode(login))
		}
	}
	if authenticator.storedCredential(server.app).Authenticator.CloneWarning {
		t.Fatal("a passkey that never reports a counter must not raise a clone warning")
	}
}
