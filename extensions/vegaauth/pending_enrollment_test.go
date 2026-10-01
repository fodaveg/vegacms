package vegaauth

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

// plantPending starts an enrollment on a factor-less account, as a stolen session could, and
// returns the secret only the planter knows.
func plantPending(t *testing.T, server *testServer, token string) string {
	t.Helper()
	enroll := server.post("/totp/enroll", token, "")
	var enrollment struct {
		Secret string `json:"secret"`
	}
	if err := json.Unmarshal(enroll.Body.Bytes(), &enrollment); err != nil || enrollment.Secret == "" {
		t.Fatalf("enrollment failed: %d %s", enroll.Code, errorCode(enroll))
	}
	return enrollment.Secret
}

func TestAPendingSecretPlantedBeforeTheFirstFactorCannotBeActivatedAfterIt(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", false)
	token := server.token(user)
	planted := plantPending(t, server, token)

	// The owner registers a first passkey: the unverified enrollment is discarded.
	authenticator := newAuthenticator(t)
	begin := server.post("/passkey/register/begin", token, "")
	if finish := server.post("/passkey/register/finish", token, authenticator.attestation(challengeOf(t, begin.Body.Bytes()))); finish.Code != http.StatusOK {
		t.Fatalf("passkey registration failed: %d %s", finish.Code, errorCode(finish))
	}
	if server.reload(user).GetString("totp_pending_secret") != "" {
		t.Fatal("registering a passkey must discard an unverified TOTP enrollment")
	}
	verify := server.post("/totp/verify", token, `{"code":"`+totpCode(t, planted, 0)+`"}`)
	if verify.Code != http.StatusBadRequest || errorCode(verify) != "not_enrolled" || server.reload(user).GetBool("totp_enabled") {
		t.Fatalf("the planted secret must not be activated: %d %s", verify.Code, errorCode(verify))
	}
}

func TestVerifyingAPendingSecretNeedsProofOnceTheAccountHasAFactor(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", false)
	token := server.token(user)
	newAuthenticator(t).store(server.app, user)
	// A pending secret that is still there although the account now has a passkey.
	user.Set("totp_pending_secret", testTOTPSecret)
	user.Set("totp_pending_until", time.Now().Add(time.Minute).Unix())
	if err := server.app.Save(user); err != nil {
		t.Fatal(err)
	}
	verify := server.post("/totp/verify", token, `{"code":"`+totpCode(t, testTOTPSecret, 0)+`"}`)
	expectStepUp(t, "verifying a pending secret without proof", verify, "passkey")
	if server.reload(user).GetBool("totp_enabled") {
		t.Fatal("TOTP was enabled from a session that proved nothing")
	}

	// Same for the secret an older version stored before enabling.
	legacy := server.newUser("legacy@example.com", false)
	newAuthenticator(t).store(server.app, legacy)
	legacy.Set("totp_secret", testTOTPSecret)
	if err := server.app.Save(legacy); err != nil {
		t.Fatal(err)
	}
	old := server.post("/totp/verify", server.token(legacy), `{"code":"`+totpCode(t, testTOTPSecret, 0)+`"}`)
	expectStepUp(t, "verifying a half-enrolled secret without proof", old, "passkey")
	if server.reload(legacy).GetBool("totp_enabled") {
		t.Fatal("TOTP was enabled from a session that proved nothing")
	}
}

func TestAPendingEnrollmentExpiresAndDeletingAPasskeyDiscardsIt(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", false)
	token := server.token(user)
	planted := plantPending(t, server, token)
	if until := server.reload(user).GetInt("totp_pending_until"); int64(until) <= time.Now().Unix() {
		t.Fatal("a new enrollment must carry an expiry in the future")
	}

	if _, err := server.app.DB().NewQuery("UPDATE vega_editors SET totp_pending_until = 1").Execute(); err != nil {
		t.Fatal(err)
	}
	expired := server.post("/totp/verify", token, `{"code":"`+totpCode(t, planted, 0)+`"}`)
	fresh := server.reload(user)
	if expired.Code != http.StatusBadRequest || errorCode(expired) != "enrollment_expired" || fresh.GetBool("totp_enabled") || fresh.GetString("totp_pending_secret") != "" {
		t.Fatalf("an expired enrollment must be refused and discarded: %d %s", expired.Code, errorCode(expired))
	}

	// With TOTP active, a pending replacement is discarded when a passkey is deleted.
	owner := server.newUser("owner@example.com", true)
	authenticator := newAuthenticator(t)
	authenticator.store(server.app, owner)
	ownerToken := server.token(owner)
	proven := server.post("/totp/enroll", ownerToken, `{"code":"`+totpCode(t, testTOTPSecret, 0)+`"}`)
	if proven.Code != http.StatusOK || server.reload(owner).GetString("totp_pending_secret") == "" {
		t.Fatalf("re-enrollment failed: %d %s", proven.Code, errorCode(proven))
	}
	row, err := server.app.FindFirstRecordByData(credentialsCollection, "user", owner.Id)
	if err != nil {
		t.Fatal(err)
	}
	if removed := server.post("/passkey/delete", ownerToken, `{"id":"`+row.Id+`"}`); removed.Code != http.StatusOK {
		t.Fatalf("delete failed: %d %s", removed.Code, errorCode(removed))
	}
	fresh = server.reload(owner)
	if fresh.GetString("totp_pending_secret") != "" || !fresh.GetBool("totp_enabled") || fresh.GetString("totp_secret") != testTOTPSecret {
		t.Fatal("deleting a passkey must discard the pending secret and keep the active factor")
	}
}
