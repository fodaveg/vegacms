package vegaauth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
)

func TestLegacySessionMustRefreshBeforeAnyFactorOrProofOperation(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	legacy := server.legacyToken(user)
	// Two copies of an old deterministic JWT cannot be distinguished. Even a proof cached
	// before upgrading must not let either copy mutate factors or accumulate new proof.
	server.extension.markProof(sessionKey(legacy))
	body := `{"code":"` + totpCode(t, testTOTPSecret, 0) + `"}`
	for _, route := range []string{"/totp/enroll", "/totp/verify", "/totp/disable", "/recovery/generate", "/passkey/register/begin", "/passkey/register/finish", "/passkey/verify/begin", "/passkey/verify/finish", "/passkey/delete"} {
		t.Run(route, func(t *testing.T) {
			expectStepUp(t, "legacy security operation", server.post(route, legacy, body))
		})
	}
	fresh := server.reload(user)
	if !fresh.GetBool("totp_enabled") || fresh.GetString("totp_secret") != testTOTPSecret || fresh.GetString("totp_pending_secret") != "" || fresh.GetInt("totp_last_step") != 0 {
		t.Fatal("refresh requirement changed factors or consumed a TOTP code")
	}
	for _, collection := range []string{credentialsCollection, recoveryCollection, attemptsCollection} {
		rows, err := server.app.FindRecordsByFilter(collection, "", "", 0, 0)
		if err != nil || len(rows) != 0 {
			t.Fatalf("refresh requirement wrote to %s", collection)
		}
	}
}

func TestLegacyRefreshDropsSharedProofAndOwnerCanProveTheNewSession(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	legacy := server.legacyToken(user)
	server.extension.markProof(sessionKey(legacy))
	fresh := server.refresh(legacy)
	if fresh == legacy {
		t.Fatal("legacy refresh did not issue a new session")
	}
	if server.extension.hasRecentProof(sessionKey(fresh)) || server.extension.hasRecentProof(sessionKey(legacy)) {
		t.Fatal("legacy refresh inherited or retained a shared proof")
	}
	expectStepUp(t, "fresh session still needs possession", server.post("/totp/enroll", fresh, ""), "totp")
	proof := `{"code":"` + totpCode(t, testTOTPSecret, 0) + `"}`
	if response := server.post("/totp/enroll", fresh, proof); response.Code != http.StatusOK {
		t.Fatalf("owner could not prove the refreshed session: %d", response.Code)
	}
	step := server.reload(user).GetInt("totp_last_step")
	expectStepUp(t, "legacy copy after owner proves", server.post("/totp/enroll", legacy, `{"code":"`+totpCode(t, testTOTPSecret, 1)+`"}`))
	if server.reload(user).GetInt("totp_last_step") != step {
		t.Fatal("legacy copy consumed a TOTP step")
	}
	other := server.refresh(legacy)
	if other == fresh || server.extension.hasRecentProof(sessionKey(other)) {
		t.Fatal("another legacy copy inherited the owner's new session")
	}
	if !server.extension.hasRecentProof(sessionKey(fresh)) {
		t.Fatal("owner lost the newly proven session")
	}
}

func TestLegacySessionKeepsOrdinaryPBAccess(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	legacy := server.legacyToken(user)
	collection := user.Collection()
	own := "id = @request.auth.id"
	collection.UpdateRule = &own
	if err := server.app.Save(collection); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPatch, "/api/collections/vega_editors/records/"+user.Id, strings.NewReader(`{"emailVisibility":true}`))
	request.Header.Set("content-type", "application/json")
	request.Header.Set("Authorization", legacy)
	response := httptest.NewRecorder()
	server.mux.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !server.reload(user).GetBool("emailVisibility") {
		t.Fatalf("legacy session lost ordinary PB write access: %d", response.Code)
	}
	if _, err := server.app.FindAuthRecordByToken(legacy); err != nil {
		t.Fatal("legacy session lost authentication validity")
	}
	request = httptest.NewRequest(http.MethodGet, "/api/vega-auth/passkey/list", nil)
	request.Header.Set("Authorization", legacy)
	response = httptest.NewRecorder()
	server.mux.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("legacy session lost read access: %d", response.Code)
	}
}

func TestLegacyPasskeyFinishDoesNotConsumeAModernChallenge(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", false)
	authenticator := newAuthenticator(t)
	authenticator.store(server.app, user)
	modern, legacy := server.token(user), server.legacyToken(user)
	begin := server.post("/passkey/verify/begin", modern, "")
	body := authenticator.assertion(challengeOf(t, begin.Body.Bytes()), user.Id)
	expectStepUp(t, "legacy passkey proof", server.post("/passkey/verify/finish", legacy, body))
	if server.extension.hasRecentProof(sessionKey(legacy)) {
		t.Fatal("legacy finish accumulated proof")
	}
	if response := server.post("/passkey/verify/finish", modern, body); response.Code != http.StatusOK {
		t.Fatalf("legacy request consumed another session's challenge: %d", response.Code)
	}
	begin = server.post("/passkey/register/begin", modern, "")
	body = newAuthenticator(t).attestation(challengeOf(t, begin.Body.Bytes()))
	expectStepUp(t, "legacy passkey registration", server.post("/passkey/register/finish", legacy, body))
	if passkeyCount(t, server, user.Id) != 1 {
		t.Fatal("legacy finish persisted a passkey")
	}
	if response := server.post("/passkey/register/finish", modern, body); response.Code != http.StatusOK {
		t.Fatalf("modern registration could not finish: %d", response.Code)
	}
}

func TestNonceEligibilityRequiresSignedAndWellFormedClaims(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	claims, err := security.ParseUnverifiedJWT(server.legacyToken(user))
	if err != nil {
		t.Fatal(err)
	}
	claims["jti"] = "arbitrary-nonce"
	key := user.TokenKey() + user.Collection().AuthToken.Secret
	token, err := security.NewJWT(claims, key, 0)
	if err != nil {
		t.Fatal(err)
	}
	expectStepUp(t, "malformed signed nonce", server.post("/totp/enroll", token, ""))
	claims["jti"] = strings.Repeat("a", 48)
	token, err = security.NewJWT(claims, "untrusted-test-signing-key", 0)
	if err != nil {
		t.Fatal(err)
	}
	if response := server.post("/totp/enroll", token, ""); response.Code != http.StatusUnauthorized {
		t.Fatalf("unsigned nonce bypassed PB authentication: %d", response.Code)
	}
}

func TestStaticSessionKeepsItsExistingProofContract(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	token, err := user.NewStaticAuthToken(time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	proof := `{"code":"` + totpCode(t, testTOTPSecret, 0) + `"}`
	if response := server.post("/totp/enroll", token, proof); response.Code != http.StatusOK {
		t.Fatalf("static session could not prove possession: %d", response.Code)
	}
	if !server.extension.hasRecentProof(sessionKey(token)) {
		t.Fatal("static session did not retain its proof")
	}
	if next := server.refresh(token); next != token {
		t.Fatal("static token was made refreshable")
	}
	if response := server.post("/recovery/generate", token, ""); response.Code != http.StatusOK {
		t.Fatalf("static session lost existing proof semantics: %d", response.Code)
	}
}

func TestLegacyActivationCannotConsumeTheNewAuthenticatorCode(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", false)
	modern, legacy := server.token(user), server.legacyToken(user)
	secret := plantPending(t, server, modern)
	body := `{"code":"` + totpCode(t, secret, 0) + `"}`
	expectStepUp(t, "legacy first activation", server.post("/totp/verify", legacy, body))
	fresh := server.reload(user)
	if fresh.GetBool("totp_enabled") || fresh.GetString("totp_pending_secret") != secret || fresh.GetInt("totp_last_step") != 0 || server.extension.hasRecentProof(sessionKey(legacy)) {
		t.Fatal("legacy activation changed enrollment, consumed code or accumulated proof")
	}
	if response := server.post("/totp/verify", modern, body); response.Code != http.StatusOK {
		t.Fatalf("same code was not available to the modern session: %d", response.Code)
	}
}

func TestProofSessionGuardPreservesUnauthenticatedAndOtherCollectionStatus(t *testing.T) {
	server := newTestServer(t)
	collection := core.NewAuthCollection("other_editors")
	if err := server.app.Save(collection); err != nil {
		t.Fatal(err)
	}
	user := core.NewRecord(collection)
	user.SetEmail("other@example.com")
	user.SetPassword(testPassword)
	if err := server.app.Save(user); err != nil {
		t.Fatal(err)
	}
	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	for _, auth := range []string{"", token} {
		if response := server.post("/totp/enroll", auth, ""); response.Code != http.StatusUnauthorized {
			t.Fatalf("guard changed existing authentication rejection: %d", response.Code)
		}
	}
}

func TestParallelLegacyRefreshNeverHandsOffSharedProof(t *testing.T) {
	server := newTestServer(t)
	// Isolate Vega's proof handoff from PB0.39.7/0.39.9's lazy initialization race in
	// RequireSameCollectionContextAuth. The cold-start probe/log is retained separately.
	warmup := server.newUser("warmup@example.com", false)
	server.refresh(server.token(warmup))
	user := server.newUser("editor@example.com", true)
	legacy := server.legacyToken(user)
	server.extension.markProof(sessionKey(legacy))
	tokens := make([]string, 8)
	var group sync.WaitGroup
	for i := range tokens {
		group.Add(1)
		go func(i int) { defer group.Done(); tokens[i] = server.refresh(legacy) }(i)
	}
	group.Wait()
	seen := map[string]bool{legacy: true}
	for _, token := range tokens {
		if seen[token] || server.extension.hasRecentProof(sessionKey(token)) {
			t.Fatal("parallel legacy refresh reused identity or inherited shared proof")
		}
		seen[token] = true
	}
	if server.extension.hasRecentProof(sessionKey(legacy)) {
		t.Fatal("legacy shared proof was retained")
	}
}
