package vegaauth

import (
	"crypto/sha256"
	"encoding/hex"
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

// sessionKey identifies one session: the hash of its auth token. The proof of possession belongs
// to the session that gave it, so another token of the same account (a stolen one, another
// device) does not inherit it. Only the hash is kept in memory, never the token.
func sessionKey(token string) string {
	token = authTokenFromHeader(token)
	if token == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// requestSessionKey is the session key of the token the request authenticated with.
func requestSessionKey(e *core.RequestEvent) string {
	return sessionKey(e.Request.Header.Get("Authorization"))
}

// markProof records that the session has just proven possession of a second factor.
func (x *Extension) markProof(session string) {
	if session == "" {
		return
	}
	x.proofMu.Lock()
	defer x.proofMu.Unlock()
	now := time.Now()
	for key, expires := range x.proofs {
		if !expires.After(now) {
			delete(x.proofs, key)
		}
	}
	if _, renewing := x.proofs[session]; !renewing && len(x.proofs) >= maxStepUpProofs {
		return
	}
	x.proofs[session] = now.Add(stepUpWindow)
}

func (x *Extension) hasRecentProof(session string) bool {
	x.proofMu.Lock()
	defer x.proofMu.Unlock()
	expires, ok := x.proofs[session]
	return session != "" && ok && expires.After(time.Now())
}

// moveProof hands a still valid proof over to the token that replaces the session's token on
// auth-refresh. The expiry travels unchanged: refreshing never extends the window, and the old
// token stops carrying the proof.
func (x *Extension) moveProof(from, to string) {
	if from == "" || to == "" || from == to {
		return
	}
	x.proofMu.Lock()
	defer x.proofMu.Unlock()
	expires, ok := x.proofs[from]
	if !ok {
		return
	}
	delete(x.proofs, from)
	if expires.After(time.Now()) {
		x.proofs[to] = expires
	}
}

// factorFields are the auth-collection fields that make up the account's second factor.
var factorFields = []string{"totp_enabled", "totp_secret", "totp_pending_secret", "totp_pending_until", "totp_last_step"}

// bindFactorFieldGuard closes the standard records API as a way around the step-up rule. If the
// auth collection has an update rule that lets editors edit their own record, a bare session
// could otherwise send {"totp_enabled": false} and leave the account without factors. Only
// superusers may change these fields there; everyone else goes through this extension's routes.
func (x *Extension) bindFactorFieldGuard(app core.App) {
	app.OnRecordUpdateRequest(x.config.AuthCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		if !e.HasSuperuserAuth() {
			original := e.Record.Original()
			for _, field := range factorFields {
				if e.Record.GetString(field) != original.GetString(field) {
					return e.BadRequestError("Second-factor fields can only be changed through the auth extension.", nil)
				}
			}
		}
		return e.Next()
	})
}

// bindProofToRefresh keeps the proof with the session across PocketBase's auth-refresh, which
// the SPA calls every time it opens the security screen. The hook sees the old token in the
// request and the new one in the event; AuthMethod is empty only for a refresh.
func (x *Extension) bindProofToRefresh(app core.App) {
	app.OnRecordAuthRequest(x.config.AuthCollection).BindFunc(func(e *core.RecordAuthRequestEvent) error {
		if e.AuthMethod == "" {
			eligible, err := proofSessionEligible(e.Record, e.Request.Header.Get("Authorization"))
			if err != nil {
				return unauthorized(e.RequestEvent)
			}
			// PocketBase mints a deterministic JWT on refresh too. Distinguish each replacement
			// before transferring proof; parallel refreshes cannot merge back into one token.
			token, err := x.distinctAuthToken(e.Record, e.Token)
			if err != nil {
				return e.InternalServerError("Failed to refresh auth token.", nil)
			}
			e.Token = token
			if eligible {
				x.moveProof(requestSessionKey(e.RequestEvent), sessionKey(e.Token))
			} else {
				// A legacy token may have been shared by independent logins. Never hand its
				// cached proof to the first refresher; each new session must prove possession.
				x.proofMu.Lock()
				delete(x.proofs, requestSessionKey(e.RequestEvent))
				x.proofMu.Unlock()
			}
		}
		return e.Next()
	})
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
	if len(methods) == 0 || x.hasRecentProof(requestSessionKey(e)) {
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
		return true, e.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid_code", "code_source": "current"})
	}
	x.resetLoginAttempts(e.App, identity, stepUpScope)
	x.markProof(requestSessionKey(e))
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
	x.markProof(requestSessionKey(e))
	return e.JSON(http.StatusOK, map[string]bool{"ok": true})
}
