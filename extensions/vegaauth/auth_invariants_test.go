package vegaauth

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
)

func TestAnonymousChallengeCapacityDoesNotBlockAuthenticatedCeremonies(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", false)
	authenticator := newAuthenticator(t)
	authenticator.store(server.app, user)
	token := server.token(user)
	for i := 0; i < maxWebAuthnChallenges; i++ {
		if !server.extension.putSession(fmt.Sprintf("discoverable:full-%d", i), &webauthn.SessionData{}) {
			t.Fatal("anonymous capacity filled early")
		}
	}
	full := server.post("/passkey/login/discoverable/begin", "", "")
	if full.Code != http.StatusServiceUnavailable || errorCode(full) != "challenge_capacity" {
		t.Fatalf("anonymous capacity not enforced: %d %s", full.Code, errorCode(full))
	}
	begin := server.post("/passkey/verify/begin", token, "")
	if begin.Code != http.StatusOK {
		t.Fatalf("anonymous capacity blocked authenticated verification: %d %s", begin.Code, errorCode(begin))
	}
	body := authenticator.assertion(challengeOf(t, begin.Body.Bytes()), user.Id)
	if finish := server.post("/passkey/verify/finish", token, body); finish.Code != http.StatusOK {
		t.Fatalf("verification failed: %d %s", finish.Code, errorCode(finish))
	}
	if replay := server.post("/passkey/verify/finish", token, body); errorCode(replay) != "no_session" {
		t.Fatal("verification challenge was not single-use")
	}
	register := server.post("/passkey/register/begin", token, "")
	if register.Code != http.StatusOK {
		t.Fatalf("anonymous capacity blocked authenticated registration: %d %s", register.Code, errorCode(register))
	}
	registration := newAuthenticator(t).attestation(challengeOf(t, register.Body.Bytes()))
	if finish := server.post("/passkey/register/finish", token, registration); finish.Code != http.StatusOK {
		t.Fatalf("registration failed: %d %s", finish.Code, errorCode(finish))
	}
	if replay := server.post("/passkey/register/finish", token, registration); errorCode(replay) != "no_session" {
		t.Fatal("registration challenge was not single-use")
	}
}

// Exercise the exact issuance boundary used after password/TOTP/recovery/passkey checks. No
// credential timing or wall-clock sleeps are used to manufacture different JWT expiry seconds.
func issuedSession(t *testing.T, server *testServer, user *core.Record, proven bool) string {
	t.Helper()
	e := new(core.RequestEvent)
	e.App = server.app
	e.Request = httptest.NewRequest(http.MethodPost, "/issued-session", nil)
	response := httptest.NewRecorder()
	e.Response = response
	if err := server.extension.authTokenResponse(e, user, proven); err != nil || response.Code != http.StatusOK {
		t.Fatalf("session issuance failed: status %d", response.Code)
	}
	return tokenOf(t, response)
}

func TestParallelSessionIssuanceKeepsProofIsolatedWithinTheSameSecond(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	const count = 32
	tokens := make([]string, count)
	var group sync.WaitGroup
	start := make(chan struct{})
	for i := range tokens {
		group.Add(1)
		go func(i int) {
			defer group.Done()
			<-start
			tokens[i] = issuedSession(t, server, user, i == 0)
		}(i)
	}
	close(start)
	group.Wait()
	seen := map[string]bool{}
	expiries := map[float64]int{}
	for i, token := range tokens {
		if seen[token] {
			t.Fatal("independent concurrent logins received the same token")
		}
		seen[token] = true
		claims, err := security.ParseUnverifiedJWT(token)
		if err != nil {
			t.Fatal("issued token claims are invalid")
		}
		expiries[claims["exp"].(float64)]++
		if _, err := server.app.FindAuthRecordByToken(token, core.TokenTypeAuth); err != nil {
			t.Fatal("PocketBase rejected an issued session token")
		}
		if server.extension.hasRecentProof(sessionKey(token)) != (i == 0) {
			t.Fatal("proof crossed between independent session issuances")
		}
	}
	sharedSecond := false
	for _, n := range expiries {
		sharedSecond = sharedSecond || n > 1
	}
	if !sharedSecond {
		t.Fatal("probe did not exercise issuances within the same second")
	}
	expectStepUp(t, "another independent session", server.post("/totp/enroll", tokens[1], ""), "totp")
	if response := server.post("/totp/enroll", tokens[0], ""); response.Code != http.StatusOK {
		t.Fatalf("proven session could not change factors: %d", response.Code)
	}
}

func TestParallelRefreshMovesProofOnceWithoutChangingExpiry(t *testing.T) {
	server := newTestServer(t)
	// PB's auth-refresh middleware initializes its collection parameter on first use.
	// Warm a different session so this probe isolates Vega's concurrent PoP transfer.
	warmup := server.newUser("warmup@example.com", false)
	server.refresh(server.token(warmup))
	user := server.newUser("editor@example.com", true)
	token := issuedSession(t, server, user, true)
	expiry := time.Now().Add(time.Minute)
	server.extension.proofs[sessionKey(token)] = expiry
	const count = 8
	tokens := make([]string, count)
	var group sync.WaitGroup
	for i := range tokens {
		group.Add(1)
		go func(i int) { defer group.Done(); tokens[i] = server.refresh(token) }(i)
	}
	group.Wait()
	seen := map[string]bool{token: true}
	proven := 0
	for _, next := range tokens {
		if seen[next] {
			t.Fatal("refresh did not issue a distinct replacement token")
		}
		seen[next] = true
		if _, err := server.app.FindAuthRecordByToken(next, core.TokenTypeAuth); err != nil {
			t.Fatal("PocketBase rejected refreshed token")
		}
		if server.extension.hasRecentProof(sessionKey(next)) {
			proven++
			if !server.extension.proofs[sessionKey(next)].Equal(expiry) {
				t.Fatal("refresh extended proof expiry")
			}
		}
	}
	if proven != 1 || server.extension.hasRecentProof(sessionKey(token)) {
		t.Fatalf("expected one proof handoff and no proof on old token, got %d recipients", proven)
	}
	expectStepUp(t, "replaced session token", server.post("/totp/enroll", token, ""), "totp")
}

func TestAuthenticatedChallengeBudgetIsBoundedAndIndependent(t *testing.T) {
	extension, err := New(Config{})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < maxWebAuthnChallenges; i++ {
		kind := "verify"
		if i%2 == 0 {
			kind = "register"
		}
		if !extension.putSession(fmt.Sprintf("%s:user-%d", kind, i), &webauthn.SessionData{}) {
			t.Fatal("authenticated capacity filled early")
		}
	}
	if extension.putSession("verify:overflow", &webauthn.SessionData{}) {
		t.Fatal("authenticated challenge budget was not enforced")
	}
	if !extension.putSession("discoverable:available", &webauthn.SessionData{}) {
		t.Fatal("authenticated challenges consumed the anonymous budget")
	}
	if !extension.putSession("register:user-0", &webauthn.SessionData{Challenge: "replacement"}) {
		t.Fatal("replacing an existing authenticated challenge needs no extra slot")
	}
	entry := extension.sessions["verify:user-1"]
	entry.expires = time.Now().Add(-time.Second)
	extension.sessions["verify:user-1"] = entry
	if !extension.putSession("verify:after-expiry", &webauthn.SessionData{}) {
		t.Fatal("expired authenticated challenges were not pruned")
	}
	if extension.takeSession("verify:user-1") != nil {
		t.Fatal("expired challenge survived")
	}
	if data := extension.takeSession("register:user-0"); data == nil || data.Challenge != "replacement" {
		t.Fatal("replacement challenge was lost")
	}
	if extension.takeSession("register:user-0") != nil {
		t.Fatal("authenticated challenge was not consumed exactly once")
	}
}

func TestSessionNoncePreservesPBClaimsAndTokenKeyRevocation(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", false)
	original := server.legacyToken(user)
	token, err := server.extension.distinctAuthToken(user, original)
	if err != nil {
		t.Fatal("could not randomize issued token")
	}
	before, _ := security.ParseUnverifiedJWT(original)
	after, _ := security.ParseUnverifiedJWT(token)
	if len(after) != len(before)+1 {
		t.Fatal("unexpected change in token claims")
	}
	for key, value := range before {
		if after[key] != value {
			t.Fatalf("changed PocketBase claim %s", key)
		}
	}
	if nonce, ok := after["jti"].(string); !ok || len(nonce) != 48 {
		t.Fatal("missing session nonce")
	}
	if response := server.post("/totp/enroll", token, ""); response.Code != http.StatusOK {
		t.Fatalf("normal PB middleware rejected issued token: %d", response.Code)
	}
	user.SetPassword("replacement test password")
	if err := server.app.Save(user); err != nil {
		t.Fatal(err)
	}
	if _, err := server.app.FindAuthRecordByToken(token, core.TokenTypeAuth); err == nil {
		t.Fatal("randomized token survived PocketBase token-key revocation")
	}
}

func TestSessionNonceEntropyFailureIsClosedWithoutMovingProof(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	token := issuedSession(t, server, user, true)
	server.extension.random = failingReader{}
	e := new(core.RequestEvent)
	e.App = server.app
	e.Request = httptest.NewRequest(http.MethodPost, "/issued-session", nil)
	response := httptest.NewRecorder()
	e.Response = response
	if err := server.extension.authTokenResponse(e, user, true); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusInternalServerError || errorCode(response) != "token_failed" {
		t.Fatalf("failed entropy emitted a session: %d %s", response.Code, errorCode(response))
	}
	request := httptest.NewRequest(http.MethodPost, "/api/collections/vega_editors/auth-refresh", nil)
	request.Header.Set("Authorization", token)
	response = httptest.NewRecorder()
	server.mux.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError || !server.extension.hasRecentProof(sessionKey(token)) {
		t.Fatal("failed refresh must not hand off or discard the original proof")
	}
}

func TestNonRefreshableTokenRemainsUnchanged(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	token, err := user.NewStaticAuthToken(time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	server.extension.markProof(sessionKey(token))
	server.extension.random = failingReader{}
	if next := server.refresh(token); next != token {
		t.Fatal("auth-refresh changed a non-refreshable token")
	}
	if !server.extension.hasRecentProof(sessionKey(token)) {
		t.Fatal("non-refreshable token lost its proof")
	}
}

// EnsureCollections closes native issuers for this dedicated collection. Exercise the actual
// routes, not only the saved settings: they must not mint deterministic tokens around Vega MFA.
func TestNativeTokenIssuersCannotBypassTheExtension(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	for _, endpoint := range []string{"auth-with-password", "auth-with-password", "auth-with-otp", "auth-with-oauth2"} {
		body := `{"identity":"` + user.Email() + `","password":"` + testPassword + `"}`
		request := httptest.NewRequest(http.MethodPost, "/api/collections/vega_editors/"+endpoint, strings.NewReader(body))
		request.Header.Set("content-type", "application/json")
		response := httptest.NewRecorder()
		server.mux.ServeHTTP(response, request)
		var result map[string]any
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatal("invalid native auth response")
		}
		if response.Code != http.StatusForbidden || result["token"] != nil {
			t.Fatalf("native issuer %s was not blocked: HTTP %d", endpoint, response.Code)
		}
	}
	if len(server.extension.proofs) != 0 {
		t.Fatal("blocked native login created proof")
	}
}
