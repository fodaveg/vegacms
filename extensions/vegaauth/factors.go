package vegaauth

import (
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/bcrypt"
)

func (x *Extension) enrollTOTP(e *core.RequestEvent) error {
	if e.Auth == nil || e.Auth.Collection().Name != x.config.AuthCollection {
		return unauthorized(e)
	}
	var body codeBody
	if err := e.BindBody(&body); err != nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "bad_request"})
	}
	if refused, response := x.stepUpRefused(e, body.Code); refused {
		return response
	}
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer: x.config.TOTPIssuer, AccountName: e.Auth.Email(),
	})
	if err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "totp_generate_failed"})
	}
	// The new secret waits in totp_pending_secret until /totp/verify proves the authenticator
	// app has it. The active secret and totp_enabled are not touched, so redoing the enrollment
	// (or abandoning it halfway) never leaves the account without its second factor.
	e.Auth.Set("totp_pending_secret", key.Secret())
	if err := e.App.Save(e.Auth); err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "save_failed"})
	}
	return e.JSON(http.StatusOK, map[string]string{"otpauth_url": key.URL(), "secret": key.Secret()})
}

const totpPeriod = 30

// matchTOTPStep reports which time step produced passcode. Like totp.Validate it tolerates one
// period of clock drift in either direction, but it tells the caller which step matched.
func matchTOTPStep(passcode, secret string, now time.Time) (int64, bool) {
	opts := totp.ValidateOpts{Period: totpPeriod, Skew: 0, Digits: otp.DigitsSix, Algorithm: otp.AlgorithmSHA1}
	for _, offset := range []int64{0, -1, 1} {
		at := now.Add(time.Duration(offset*totpPeriod) * time.Second)
		if ok, err := totp.ValidateCustom(passcode, secret, at, opts); err == nil && ok {
			return at.Unix() / totpPeriod, true
		}
	}
	return 0, false
}

// consumeTOTP validates passcode against the account secret and claims its time step. The claim
// is one conditional UPDATE, so of several parallel requests carrying the same code exactly one
// wins; a code (or an older one) can never be accepted twice.
func (x *Extension) consumeTOTP(app core.App, record *core.Record, passcode string) (bool, error) {
	secret := record.GetString("totp_secret")
	if secret == "" {
		return false, nil
	}
	step, ok := matchTOTPStep(passcode, secret, time.Now())
	if !ok {
		return false, nil
	}
	result, err := app.DB().Update(record.Collection().Name, dbx.Params{"totp_last_step": step},
		dbx.NewExp("[[id]] = {:id} AND COALESCE([[totp_last_step]], 0) < {:step}", dbx.Params{"id": record.Id, "step": step}),
	).Execute()
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	if count != 1 {
		return false, nil
	}
	record.Set("totp_last_step", step)
	return true, nil
}

type codeBody struct {
	Code string `json:"code"`
}

func (x *Extension) verifyTOTP(e *core.RequestEvent) error {
	if e.Auth == nil || e.Auth.Collection().Name != x.config.AuthCollection {
		return unauthorized(e)
	}
	var body codeBody
	if err := e.BindBody(&body); err != nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "bad_request"})
	}
	pendingSecret := e.Auth.GetString("totp_pending_secret")
	if pendingSecret == "" && e.Auth.GetString("totp_secret") == "" {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "not_enrolled"})
	}
	// Guesses are limited per account: a session token must not be a way to brute-force a code.
	identity := loginIdentity(stepUpScope + ":" + e.Auth.Id)
	if refused, response := x.attemptRefused(e, identity, stepUpScope); refused {
		return response
	}
	if pendingSecret != "" {
		// Enrollment in progress: only now does the new secret replace the active one.
		step, ok := matchTOTPStep(body.Code, pendingSecret, time.Now())
		if !ok {
			return e.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid_code"})
		}
		e.Auth.Set("totp_secret", pendingSecret)
		e.Auth.Set("totp_pending_secret", "")
		if int64(e.Auth.GetInt("totp_last_step")) < step {
			e.Auth.Set("totp_last_step", step)
		}
	} else {
		// No enrollment in progress: either an account enrolled halfway by an older version
		// (secret stored, never enabled) or a re-check of the active secret.
		valid, err := x.consumeTOTP(e.App, e.Auth, body.Code)
		if err != nil {
			x.releaseLoginAttempt(e.App, identity, stepUpScope)
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "verify_failed"})
		}
		if !valid {
			return e.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid_code"})
		}
	}
	e.Auth.Set("totp_enabled", true)
	if err := e.App.Save(e.Auth); err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "save_failed"})
	}
	x.resetLoginAttempts(e.App, identity, stepUpScope)
	x.markProof(requestSessionKey(e))
	return e.JSON(http.StatusOK, map[string]bool{"ok": true})
}

func (x *Extension) disableTOTP(e *core.RequestEvent) error {
	if e.Auth == nil || e.Auth.Collection().Name != x.config.AuthCollection {
		return unauthorized(e)
	}
	var body codeBody
	if err := e.BindBody(&body); err != nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "bad_request"})
	}
	if refused, response := x.stepUpRefused(e, body.Code); refused {
		return response
	}
	e.Auth.Set("totp_secret", "")
	e.Auth.Set("totp_pending_secret", "")
	e.Auth.Set("totp_enabled", false)
	if err := e.App.Save(e.Auth); err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "save_failed"})
	}
	return e.JSON(http.StatusOK, map[string]bool{"ok": true})
}

const recoveryAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func randomRecoveryCode(random io.Reader) (string, error) {
	raw := make([]byte, 10)
	if _, err := io.ReadFull(random, raw); err != nil {
		return "", err
	}
	var out strings.Builder
	for i, value := range raw {
		if i == 5 {
			out.WriteByte('-')
		}
		out.WriteByte(recoveryAlphabet[int(value)&31])
	}
	return out.String(), nil
}

func normalizeRecoveryCode(input string) string {
	var out strings.Builder
	for _, r := range strings.ToUpper(input) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			out.WriteRune(r)
		}
	}
	clean := out.String()
	if len(clean) == 10 {
		return clean[:5] + "-" + clean[5:]
	}
	return clean
}

func (x *Extension) generateRecoveryCodes(app core.App, userID string) ([]string, error) {
	codes := make([]string, 0, 10)
	hashes := make([]string, 0, 10)
	for i := 0; i < 10; i++ {
		code, err := randomRecoveryCode(x.random)
		if err != nil {
			return nil, err
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		codes = append(codes, code)
		hashes = append(hashes, string(hash))
	}
	err := app.RunInTransaction(func(tx core.App) error {
		old, err := tx.FindRecordsByFilter(recoveryCollection, "user = {:uid}", "", 0, 0, dbx.Params{"uid": userID})
		if err != nil {
			return err
		}
		for _, record := range old {
			if err := tx.Delete(record); err != nil {
				return err
			}
		}
		collection, err := tx.FindCollectionByNameOrId(recoveryCollection)
		if err != nil {
			return err
		}
		for i, hash := range hashes {
			record := core.NewRecord(collection)
			record.Set("user", userID)
			record.Set("code_hash", hash)
			record.Set("used", false)
			if err := tx.Save(record); err != nil {
				return err
			}
			hashes[i] = ""
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return codes, nil
}

func (x *Extension) hasUnusedRecoveryCodes(app core.App, userID string) bool {
	_, err := app.FindFirstRecordByFilter(recoveryCollection, "user = {:uid} && used = false", dbx.Params{"uid": userID})
	return err == nil
}

func (x *Extension) verifyRecoveryCode(app core.App, userID, input string) (bool, error) {
	code := normalizeRecoveryCode(input)
	if code == "" {
		return false, nil
	}
	records, err := app.FindRecordsByFilter(recoveryCollection, "user = {:uid} && used = false", "", 0, 0, dbx.Params{"uid": userID})
	if err != nil {
		return false, err
	}
	for _, record := range records {
		if bcrypt.CompareHashAndPassword([]byte(record.GetString("code_hash")), []byte(code)) != nil {
			continue
		}
		result, err := app.DB().Update(recoveryCollection, dbx.Params{"used": true}, dbx.HashExp{"id": record.Id, "used": false}).Execute()
		if err != nil {
			return false, err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return false, err
		}
		if count == 1 {
			return true, nil
		}
	}
	return false, nil
}

func (x *Extension) generateRecoveryHandler(e *core.RequestEvent) error {
	if e.Auth == nil || e.Auth.Collection().Name != x.config.AuthCollection {
		return unauthorized(e)
	}
	// Fresh recovery codes are a usable second factor and void the owner's printed ones.
	var body codeBody
	if err := e.BindBody(&body); err != nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "bad_request"})
	}
	if refused, response := x.stepUpRefused(e, body.Code); refused {
		return response
	}
	codes, err := x.generateRecoveryCodes(e.App, e.Auth.Id)
	if err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "generate_failed"})
	}
	return e.JSON(http.StatusOK, map[string]any{"codes": codes})
}

func (x *Extension) recoveryCountHandler(e *core.RequestEvent) error {
	if e.Auth == nil || e.Auth.Collection().Name != x.config.AuthCollection {
		return unauthorized(e)
	}
	records, err := e.App.FindRecordsByFilter(recoveryCollection, "user = {:uid} && used = false", "", 0, 0, dbx.Params{"uid": e.Auth.Id})
	if err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "count_failed"})
	}
	return e.JSON(http.StatusOK, map[string]int{"remaining": len(records)})
}

type recoveryStepBody struct {
	Pending string `json:"pending"`
	Code    string `json:"code"`
}

func (x *Extension) loginRecovery(e *core.RequestEvent) error {
	ip := x.clientIP(e)
	var body recoveryStepBody
	if err := e.BindBody(&body); err != nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "bad_request"})
	}
	pending, ok := x.peekPending(body.Pending, ip)
	if !ok {
		return e.JSON(http.StatusUnauthorized, map[string]string{"error": "pending_expired"})
	}
	if refused, response := x.attemptRefused(e, pending.identity, ip); refused {
		return response
	}
	verified, err := x.verifyRecoveryCode(e.App, pending.userID, body.Code)
	if err != nil {
		x.releaseLoginAttempt(e.App, pending.identity, ip)
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "verify_failed"})
	}
	if !verified {
		return e.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid_code"})
	}
	record, err := e.App.FindRecordById(x.config.AuthCollection, pending.userID)
	if err != nil {
		x.releaseLoginAttempt(e.App, pending.identity, ip)
		return e.JSON(http.StatusUnauthorized, map[string]string{"error": "unknown_user"})
	}
	x.resetLoginAttempts(e.App, pending.identity, ip)
	x.deletePending(body.Pending)
	// A recovery code stands in for the lost authenticator, so it must also let its owner
	// replace that authenticator right after logging in.
	return x.authTokenResponse(e, record, true)
}

func unauthorized(e *core.RequestEvent) error {
	return e.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}
