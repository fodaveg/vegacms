package vegaauth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
)

func passkeyCount(t *testing.T, server *testServer, userID string) int {
	t.Helper()
	rows, err := server.app.FindRecordsByFilter(credentialsCollection, "user = {:uid}", "", 0, 0, dbx.Params{"uid": userID})
	if err != nil {
		t.Fatal(err)
	}
	return len(rows)
}

// expectStepUp asserts the response is the step-up refusal offering exactly these methods.
func expectStepUp(t *testing.T, what string, response *httptest.ResponseRecorder, methods ...string) {
	t.Helper()
	var refusal struct {
		Error   string   `json:"error"`
		Methods []string `json:"methods"`
	}
	_ = json.Unmarshal(response.Body.Bytes(), &refusal)
	// Never 401/403: the SPA reads those as an expired session and signs the user out.
	if response.Code != http.StatusPreconditionRequired || refusal.Error != "step_up_required" {
		t.Fatalf("%s must require a fresh proof of possession: %d %s", what, response.Code, refusal.Error)
	}
	if len(refusal.Methods) != len(methods) {
		t.Fatalf("%s: expected methods %v, got %v", what, methods, refusal.Methods)
	}
	for i, method := range methods {
		if refusal.Methods[i] != method {
			t.Fatalf("%s: expected methods %v, got %v", what, methods, refusal.Methods)
		}
	}
}

func TestASessionTokenAloneCannotChangeTheFactorsOfATOTPAccount(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	token := server.token(user) // a stolen or long-lived session: no recent proof

	for _, path := range []string{"/totp/disable", "/totp/enroll", "/recovery/generate", "/passkey/register/begin"} {
		response := server.post(path, token, "")
		expectStepUp(t, path, response, "totp")
	}
	fresh := server.reload(user)
	if !fresh.GetBool("totp_enabled") || fresh.GetString("totp_secret") != testTOTPSecret || fresh.GetString("totp_pending_secret") != "" {
		t.Fatal("refused requests must leave the second factor exactly as it was")
	}

	wrong := server.post("/totp/disable", token, `{"code":"000000"}`)
	if wrong.Code != http.StatusUnauthorized || errorCode(wrong) != "invalid_code" {
		t.Fatalf("a wrong code must not disable TOTP: %d %s", wrong.Code, errorCode(wrong))
	}
	if !server.reload(user).GetBool("totp_enabled") {
		t.Fatal("TOTP was disabled with a wrong code")
	}
	right := server.post("/totp/disable", token, `{"code":"`+totpCode(t, testTOTPSecret, 0)+`"}`)
	if right.Code != http.StatusOK {
		t.Fatalf("the current code must authorize disabling TOTP: %d %s", right.Code, errorCode(right))
	}
	fresh = server.reload(user)
	if fresh.GetBool("totp_enabled") || fresh.GetString("totp_secret") != "" {
		t.Fatal("TOTP was not disabled")
	}
}

func TestRedoingTheTOTPEnrollmentKeepsTheSecondFactorUntilTheNewSecretIsVerified(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	token := server.token(user)

	enroll := server.post("/totp/enroll", token, `{"code":"`+totpCode(t, testTOTPSecret, 0)+`"}`)
	if enroll.Code != http.StatusOK {
		t.Fatalf("re-enrollment with the current code failed: %d %s", enroll.Code, errorCode(enroll))
	}
	var enrollment struct {
		Secret string `json:"secret"`
		URL    string `json:"otpauth_url"`
	}
	if err := json.Unmarshal(enroll.Body.Bytes(), &enrollment); err != nil || enrollment.Secret == "" || enrollment.URL == "" {
		t.Fatal("the enrollment response must keep returning secret and otpauth_url")
	}
	fresh := server.reload(user)
	if !fresh.GetBool("totp_enabled") || fresh.GetString("totp_secret") != testTOTPSecret {
		t.Fatal("starting a re-enrollment must not switch off or replace the active second factor")
	}
	if challenge := server.post("/login/password", "", `{"email":"editor@example.com","password":"`+testPassword+`"}`); errorCode(challenge) != "" ||
		!json.Valid(challenge.Body.Bytes()) || !containsMFA(challenge.Body.Bytes()) {
		t.Fatalf("a login during the re-enrollment must still ask for the second factor: %d", challenge.Code)
	}

	oldCode := server.post("/totp/verify", token, `{"code":"`+totpCode(t, testTOTPSecret, 1)+`"}`)
	if oldCode.Code != http.StatusUnauthorized {
		t.Fatalf("a code from the OLD secret must not confirm the new one: %d", oldCode.Code)
	}
	verify := server.post("/totp/verify", token, `{"code":"`+totpCode(t, enrollment.Secret, 0)+`"}`)
	if verify.Code != http.StatusOK {
		t.Fatalf("verifying the new secret failed: %d %s", verify.Code, errorCode(verify))
	}
	fresh = server.reload(user)
	if !fresh.GetBool("totp_enabled") || fresh.GetString("totp_secret") != enrollment.Secret || fresh.GetString("totp_pending_secret") != "" {
		t.Fatal("the verified secret must become the active one")
	}
	stale := server.post("/login/totp", "", `{"pending":"`+server.pending("editor@example.com")+`","code":"`+totpCode(t, testTOTPSecret, 1)+`"}`)
	if stale.Code != http.StatusUnauthorized {
		t.Fatalf("the replaced secret must stop working: %d", stale.Code)
	}
}

func containsMFA(body []byte) bool {
	var challenge struct {
		Required bool `json:"mfa_required"`
	}
	return json.Unmarshal(body, &challenge) == nil && challenge.Required
}

func TestAnAccountWithoutFactorsEnrollsItsFirstOnesWithoutProof(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", false)
	token := server.token(user)

	enroll := server.post("/totp/enroll", token, "")
	if enroll.Code != http.StatusOK {
		t.Fatalf("first enrollment failed: %d %s", enroll.Code, errorCode(enroll))
	}
	var enrollment struct {
		Secret string `json:"secret"`
	}
	_ = json.Unmarshal(enroll.Body.Bytes(), &enrollment)
	if server.reload(user).GetBool("totp_enabled") {
		t.Fatal("TOTP must not be enabled before its first code is verified")
	}
	if verify := server.post("/totp/verify", token, `{"code":"`+totpCode(t, enrollment.Secret, 0)+`"}`); verify.Code != http.StatusOK {
		t.Fatalf("first verification failed: %d %s", verify.Code, errorCode(verify))
	}
	if !server.reload(user).GetBool("totp_enabled") {
		t.Fatal("TOTP must be enabled once verified")
	}
	// The SPA asks for recovery codes right after the verification, without another code.
	if codes := server.post("/recovery/generate", token, ""); codes.Code != http.StatusOK {
		t.Fatalf("recovery codes right after enrolling must not need another proof: %d %s", codes.Code, errorCode(codes))
	}

	other := server.newUser("other@example.com", false)
	otherToken := server.token(other)
	authenticator := newAuthenticator(t)
	begin := server.post("/passkey/register/begin", otherToken, "")
	if begin.Code != http.StatusOK {
		t.Fatalf("first passkey registration failed to start: %d %s", begin.Code, errorCode(begin))
	}
	finish := server.post("/passkey/register/finish?name=Laptop", otherToken, authenticator.attestation(challengeOf(t, begin.Body.Bytes())))
	if finish.Code != http.StatusOK {
		t.Fatalf("first passkey registration failed: %d %s", finish.Code, errorCode(finish))
	}
	if passkeyCount(t, server, other.Id) != 1 {
		t.Fatal("the registered passkey was not stored")
	}
	if login := server.passkeyLogin(authenticator, other.Id); login.Code != http.StatusOK {
		t.Fatalf("the registered passkey must log in: %d %s", login.Code, errorCode(login))
	}
}

func TestAPasskeyOnlyAccountProvesPossessionWithAPasskeyCeremony(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", false)
	token := server.token(user)
	authenticator := newAuthenticator(t)
	authenticator.counter = 10
	authenticator.store(server.app, user)
	row, err := server.app.FindFirstRecordByData(credentialsCollection, "user", user.Id)
	if err != nil {
		t.Fatal(err)
	}

	begin := server.post("/passkey/register/begin", token, "")
	expectStepUp(t, "registering another passkey", begin, "passkey")
	remove := server.post("/passkey/delete", token, `{"id":"`+row.Id+`"}`)
	expectStepUp(t, "deleting a passkey", remove, "passkey")
	if passkeyCount(t, server, user.Id) != 1 {
		t.Fatal("a refused delete must keep the passkey")
	}

	verify := func() int {
		t.Helper()
		begin := server.post("/passkey/verify/begin", token, "")
		if begin.Code != http.StatusOK {
			t.Fatalf("passkey verification failed to start: %d %s", begin.Code, errorCode(begin))
		}
		return server.post("/passkey/verify/finish", token, authenticator.assertion(challengeOf(t, begin.Body.Bytes()), user.Id)).Code
	}

	authenticator.counter, authenticator.verifyUser = 11, false
	if code := verify(); code != http.StatusBadRequest {
		t.Fatalf("a verification without user verification must be refused: %d", code)
	}
	authenticator.counter, authenticator.verifyUser = 5, true
	if code := verify(); code != http.StatusBadRequest {
		t.Fatalf("a verification with a counter that goes backwards must be refused: %d", code)
	}
	if again := server.post("/passkey/register/begin", token, ""); again.Code != http.StatusPreconditionRequired {
		t.Fatalf("refused verifications must not count as proof: %d", again.Code)
	}

	authenticator.counter = 12
	if code := verify(); code != http.StatusOK {
		t.Fatalf("a valid passkey verification must succeed: %d", code)
	}
	if proven := server.post("/passkey/register/begin", token, ""); proven.Code != http.StatusOK {
		t.Fatalf("a fresh passkey verification must authorize adding a passkey: %d %s", proven.Code, errorCode(proven))
	}
	if removed := server.post("/passkey/delete", token, `{"id":"`+row.Id+`"}`); removed.Code != http.StatusOK {
		t.Fatalf("a fresh passkey verification must authorize deleting a passkey: %d %s", removed.Code, errorCode(removed))
	}

	if none := server.post("/passkey/verify/begin", token, ""); none.Code != http.StatusBadRequest || errorCode(none) != "no_passkeys" {
		t.Fatalf("an account without passkeys cannot start a passkey verification: %d %s", none.Code, errorCode(none))
	}
	if unauthenticated := server.post("/passkey/verify/begin", "", ""); unauthenticated.Code != http.StatusUnauthorized {
		t.Fatalf("passkey verification needs a session: %d", unauthenticated.Code)
	}
}

func TestASecondFactorLoginCountsAsProofOnlyForAWhile(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	token := server.token(user)

	login := server.post("/login/totp", "", `{"pending":"`+server.pending("editor@example.com")+`","code":"`+totpCode(t, testTOTPSecret, 0)+`"}`)
	if login.Code != http.StatusOK {
		t.Fatalf("login failed: %d %s", login.Code, errorCode(login))
	}
	if begin := server.post("/passkey/register/begin", token, ""); begin.Code != http.StatusOK {
		t.Fatalf("right after a second-factor login no extra proof is needed: %d %s", begin.Code, errorCode(begin))
	}

	// Let the proof age past the window.
	server.extension.proofMu.Lock()
	server.extension.proofs[user.Id] = time.Now().Add(-time.Second)
	server.extension.proofMu.Unlock()
	expired := server.post("/totp/disable", token, "")
	expectStepUp(t, "an aged proof", expired, "totp")
	if !server.reload(user).GetBool("totp_enabled") {
		t.Fatal("TOTP was disabled with an expired proof")
	}
}

func TestARecoveryCodeLoginLetsTheOwnerReplaceALostAuthenticator(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	codes, err := server.extension.generateRecoveryCodes(server.app, user.Id)
	if err != nil {
		t.Fatal(err)
	}
	login := server.post("/login/recovery", "", `{"pending":"`+server.pending("editor@example.com")+`","code":"`+codes[0]+`"}`)
	if login.Code != http.StatusOK {
		t.Fatalf("recovery login failed: %d %s", login.Code, errorCode(login))
	}
	if enroll := server.post("/totp/enroll", server.token(user), ""); enroll.Code != http.StatusOK {
		t.Fatalf("after a recovery login the owner must be able to enroll a new authenticator: %d %s", enroll.Code, errorCode(enroll))
	}
	if !server.reload(user).GetBool("totp_enabled") {
		t.Fatal("the account must stay protected while the new authenticator is pending")
	}
}

func TestStepUpCodeGuessesAreLimitedPerAccount(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	token := server.token(user)

	for i := 0; i < maxAttempts; i++ {
		// Alternate the two routes that check a code: they share one budget.
		path := "/totp/disable"
		if i%2 == 1 {
			path = "/totp/verify"
		}
		if guess := server.post(path, token, `{"code":"000000"}`); guess.Code != http.StatusUnauthorized {
			t.Fatalf("guess %d: expected invalid_code, got %d %s", i+1, guess.Code, errorCode(guess))
		}
	}
	locked := server.post("/totp/disable", token, `{"code":"`+totpCode(t, testTOTPSecret, 0)+`"}`)
	if locked.Code != http.StatusTooManyRequests {
		t.Fatalf("after %d wrong codes even the right one must wait: %d %s", maxAttempts, locked.Code, errorCode(locked))
	}
	if !server.reload(user).GetBool("totp_enabled") {
		t.Fatal("TOTP was disabled while the account was locked")
	}
	// The step-up lock is separate from the login lock.
	if wait := server.extension.loginLockRemaining(server.app, loginIdentity("editor@example.com"), testIP); wait != 0 {
		t.Fatalf("step-up guesses must not lock the login, got %d seconds", wait)
	}
}

func TestAnAccountEnrolledHalfwayByAnOlderVersionCanStillFinish(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", false)
	// What the previous /totp/enroll left behind: a secret stored directly, not yet enabled.
	user.Set("totp_secret", testTOTPSecret)
	if err := server.app.Save(user); err != nil {
		t.Fatal(err)
	}
	verify := server.post("/totp/verify", server.token(user), `{"code":"`+totpCode(t, testTOTPSecret, 0)+`"}`)
	if verify.Code != http.StatusOK || !server.reload(user).GetBool("totp_enabled") {
		t.Fatalf("a half-finished enrollment from before the upgrade must still verify: %d %s", verify.Code, errorCode(verify))
	}

	// And the pending-secret field is added in place to an installation that lacks it.
	collection, err := server.app.FindCollectionByNameOrId("vega_editors")
	if err != nil {
		t.Fatal(err)
	}
	collection.Fields.RemoveByName("totp_pending_secret")
	if err := server.app.Save(collection); err != nil {
		t.Fatal(err)
	}
	if err := server.extension.EnsureCollections(server.app); err != nil {
		t.Fatal(err)
	}
	fresh := server.reload(user)
	if !fresh.GetBool("totp_enabled") || fresh.GetString("totp_secret") != testTOTPSecret {
		t.Fatal("adding the field must not touch the existing second factor")
	}
	stored, err := server.app.FindCollectionByNameOrId("vega_editors")
	if err != nil {
		t.Fatal(err)
	}
	if field := stored.Fields.GetByName("totp_pending_secret"); field == nil || !field.GetHidden() {
		t.Fatal("totp_pending_secret must exist and be hidden from the API")
	}
}
