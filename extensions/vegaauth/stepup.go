package vegaauth

import (
	"net/http"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	// stepUpWindow is how long a verified second factor keeps authorizing changes to the
	// account's factors.
	stepUpWindow = 5 * time.Minute
	// maxStepUpProofs bounds the in-memory proof store; at capacity new proofs are not recorded
	// (the user is asked again) rather than letting the map grow without limit.
	maxStepUpProofs = 4096
	// stepUpScope replaces the client IP in the attempt counter: guesses at a step-up code are
	// limited per account, however many addresses a stolen session is replayed from.
	stepUpScope = "step-up"
)

// markProof records that userID has just proven possession of a second factor.
func (x *Extension) markProof(userID string) {
	x.proofMu.Lock()
	defer x.proofMu.Unlock()
	now := time.Now()
	for key, expires := range x.proofs {
		if !expires.After(now) {
			delete(x.proofs, key)
		}
	}
	if _, renewing := x.proofs[userID]; !renewing && len(x.proofs) >= maxStepUpProofs {
		return
	}
	x.proofs[userID] = now.Add(stepUpWindow)
}

func (x *Extension) hasRecentProof(userID string) bool {
	x.proofMu.Lock()
	defer x.proofMu.Unlock()
	expires, ok := x.proofs[userID]
	return ok && expires.After(time.Now())
}

// stepUpMethods lists the factors the account could prove possession with. A lookup failure
// is reported so callers fail closed.
func stepUpMethods(app core.App, record *core.Record) ([]string, error) {
	methods := []string{}
	if record.GetBool("totp_enabled") {
		methods = append(methods, "totp")
	}
	passkeys, err := app.FindRecordsByFilter(credentialsCollection, "user = {:uid}", "", 1, 0, dbx.Params{"uid": record.Id})
	if err != nil {
		return nil, err
	}
	if len(passkeys) > 0 {
		methods = append(methods, "passkey")
	}
	return methods, nil
}

// stepUpRefused guards every route that adds, replaces or removes a factor. A session token
// alone is not enough once the account has a second factor: the caller must have proven
// possession of one within stepUpWindow (second-factor login, enrollment, passkey verification)
// or send the current TOTP code with the request. An account that has no factor yet has nothing
// to prove with, so its first enrollment is allowed. It returns the response when refused.
func (x *Extension) stepUpRefused(e *core.RequestEvent, code string) (bool, error) {
	methods, err := stepUpMethods(e.App, e.Auth)
	if err != nil {
		return true, e.JSON(http.StatusInternalServerError, map[string]string{"error": "load_failed"})
	}
	if len(methods) == 0 || x.hasRecentProof(e.Auth.Id) {
		return false, nil
	}
	if code != "" && e.Auth.GetBool("totp_enabled") {
		return x.codeRefused(e, code)
	}
	// 428, not 401/403: Vega's client treats those two as an expired session and signs the user
	// out, while the session here is perfectly valid and only lacks a fresh proof.
	return true, e.JSON(http.StatusPreconditionRequired, map[string]any{
		"error":   "step_up_required",
		"methods": methods,
		"message": "Confirm with your current authenticator code or a passkey to change this.",
	})
}

// codeRefused checks the current TOTP code of the signed-in account under the per-account
// attempt limit and, when it is right, records the proof. A session token must not be a way to
// guess codes without limit.
func (x *Extension) codeRefused(e *core.RequestEvent, code string) (bool, error) {
	identity := loginIdentity(stepUpScope + ":" + e.Auth.Id)
	if refused, response := x.attemptRefused(e, identity, stepUpScope); refused {
		return true, response
	}
	valid, err := x.consumeTOTP(e.App, e.Auth, code)
	if err != nil {
		x.releaseLoginAttempt(e.App, identity, stepUpScope)
		return true, e.JSON(http.StatusInternalServerError, map[string]string{"error": "verify_failed"})
	}
	if !valid {
		return true, e.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid_code"})
	}
	x.resetLoginAttempts(e.App, identity, stepUpScope)
	x.markProof(e.Auth.Id)
	return false, nil
}

// beginPasskeyVerify starts a passkey ceremony for the signed-in account. It is the step-up path
// for accounts whose only factor is a passkey, or whose authenticator app is not at hand.
func (x *Extension) beginPasskeyVerify(e *core.RequestEvent) error {
	if e.Auth == nil || e.Auth.Collection().Name != x.config.AuthCollection {
		return unauthorized(e)
	}
	user, err := loadUser(e.App, e.Auth)
	if err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "load_failed"})
	}
	if len(user.creds) == 0 {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "no_passkeys"})
	}
	options, session, err := x.webAuthn.BeginLogin(user, webauthn.WithUserVerification(protocol.VerificationRequired))
	if err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "begin_failed"})
	}
	if !x.putSession("verify:"+e.Auth.Id, session) {
		return e.JSON(http.StatusServiceUnavailable, map[string]string{"error": "challenge_capacity"})
	}
	return e.JSON(http.StatusOK, options)
}

func (x *Extension) finishPasskeyVerify(e *core.RequestEvent) error {
	if e.Auth == nil || e.Auth.Collection().Name != x.config.AuthCollection {
		return unauthorized(e)
	}
	session := x.takeSession("verify:" + e.Auth.Id)
	if session == nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "no_session"})
	}
	user, err := loadUser(e.App, e.Auth)
	if err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "load_failed"})
	}
	if err := normalizeRequestBody(e.Response, e.Request); err != nil {
		return bodyError(e, err)
	}
	credential, err := x.webAuthn.FinishLogin(user, *session, e.Request)
	if err != nil || !credential.Flags.UserVerified {
		if err != nil {
			e.App.Logger().Error("vega passkey verification failed", "detail", webAuthnError(err))
		}
		// 400 like a failed registration, not 401/403: the session itself is still valid.
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "verify_failed"})
	}
	if x.cloneRefused(e, user, credential, x.clientIP(e)) {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "verify_failed"})
	}
	if err := storeAssertion(e.App, user, credential); err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "save_failed"})
	}
	x.markProof(e.Auth.Id)
	return e.JSON(http.StatusOK, map[string]bool{"ok": true})
}
