package vegaauth

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"golang.org/x/crypto/bcrypt"
)

const (
	maxAttempts   = 5
	attemptWindow = 15 * 60
	lockBase      = 5 * 60
	lockMax       = 60 * 60
)

type passwordBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (x *Extension) loginPassword(e *core.RequestEvent) error {
	ip := x.clientIP(e)
	var body passwordBody
	if err := e.BindBody(&body); err != nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "bad_request"})
	}
	identity := loginIdentity(body.Email)
	if refused, response := x.attemptRefused(e, identity, ip); refused {
		return response
	}
	// From here the attempt is already counted as a failure; only success undoes it.
	record, err := e.App.FindAuthRecordByEmail(x.config.AuthCollection, body.Email)
	if err != nil || record == nil {
		_ = bcrypt.CompareHashAndPassword(x.dummy, []byte(body.Password))
		return e.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid_credentials"})
	}
	if !record.ValidatePassword(body.Password) {
		return e.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid_credentials"})
	}
	if record.GetBool("totp_enabled") {
		// The password was right, so this step is not a failure, but it must not wipe earlier
		// ones either: the second factor is still pending.
		x.releaseLoginAttempt(e.App, identity, ip)
		if allowed, wait := x.allowChallengeBegin(ip); !allowed {
			return lockedResponse(e, wait)
		}
		methods := []string{"totp"}
		if x.hasUnusedRecoveryCodes(e.App, record.Id) {
			methods = append(methods, "recovery")
		}
		pending, err := x.newPending(record.Id, identity, ip)
		if errors.Is(err, errChallengeCapacity) {
			return e.JSON(http.StatusServiceUnavailable, map[string]string{"error": "challenge_capacity"})
		}
		if err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "challenge_generate_failed"})
		}
		return e.JSON(http.StatusOK, map[string]any{
			"mfa_required": true,
			"pending":      pending,
			"methods":      methods,
		})
	}
	x.resetLoginAttempts(e.App, identity, ip)
	return x.authTokenResponse(e, record, false)
}

type totpStepBody struct {
	Pending string `json:"pending"`
	Code    string `json:"code"`
}

func (x *Extension) loginTOTP(e *core.RequestEvent) error {
	ip := x.clientIP(e)
	var body totpStepBody
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
	record, err := e.App.FindRecordById(x.config.AuthCollection, pending.userID)
	valid := false
	if err == nil {
		// A replayed code is answered exactly like a wrong one.
		if valid, err = x.consumeTOTP(e.App, record, body.Code); err != nil {
			x.releaseLoginAttempt(e.App, pending.identity, ip)
			return e.JSON(http.StatusInternalServerError, map[string]string{"error": "verify_failed"})
		}
	}
	if !valid {
		return e.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid_code"})
	}
	x.resetLoginAttempts(e.App, pending.identity, ip)
	x.deletePending(body.Pending)
	return x.authTokenResponse(e, record, true)
}

// attemptRefused reserves a login attempt and, when the identity is locked or the reservation
// cannot be stored, returns the response to send. It fails closed: no counter, no guess.
func (x *Extension) attemptRefused(e *core.RequestEvent, identity, ip string) (bool, error) {
	wait, err := x.reserveLoginAttempt(e.App, identity, ip)
	if err != nil {
		return true, e.JSON(http.StatusServiceUnavailable, map[string]string{"error": "attempt_failed"})
	}
	if wait > 0 {
		return true, lockedResponse(e, wait)
	}
	return false, nil
}

// authTokenResponse issues the session token. proven says the login was completed with a second
// factor; the proof of possession is then attached to this very token and to no other.
func (x *Extension) authTokenResponse(e *core.RequestEvent, record *core.Record, proven bool) error {
	token, err := record.NewAuthToken()
	if err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "token_failed"})
	}
	if proven {
		x.markProof(sessionKey(token))
	}
	return e.JSON(http.StatusOK, map[string]any{
		"token":  token,
		"record": map[string]any{"id": record.Id, "email": record.Email()},
	})
}

func (x *Extension) clientIP(e *core.RequestEvent) string {
	if x.config.TrustProxy {
		if realIP := strings.TrimSpace(e.Request.Header.Get("X-Real-Ip")); realIP != "" {
			return realIP
		}
		if forwarded := e.Request.Header.Get("X-Forwarded-For"); forwarded != "" {
			parts := strings.Split(forwarded, ",")
			for i := len(parts) - 1; i >= 0; i-- {
				if ip := strings.TrimSpace(parts[i]); ip != "" {
					return ip
				}
			}
		}
	}
	return e.RealIP()
}

func loginIdentity(email string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(email))))
	return hex.EncodeToString(sum[:])
}

func (x *Extension) loginLockRemaining(app core.App, identity, ip string) int {
	now := time.Now().Unix()
	row, err := app.FindFirstRecordByFilter(attemptsCollection, "identity = {:identity} && ip = {:ip}", dbx.Params{"identity": identity, "ip": ip})
	if err != nil || row == nil {
		return 0
	}
	lockedUntil := row.GetInt("locked_until")
	if int64(lockedUntil) > now {
		return lockedUntil - int(now)
	}
	if row.GetInt("updated_at") < int(now)-attemptWindow {
		_ = app.Delete(row)
	}
	return 0
}

// reserveLoginAttempt counts one attempt for identity+ip BEFORE the credential is checked and
// reports the remaining lock, if any. Checking the lock and counting happen in one write
// transaction (PocketBase serializes them), so parallel requests cannot all read "not locked
// yet" and then each spend a guess: at most maxAttempts are ever evaluated per window. The
// attempt is presumed failed; a success clears the row with resetLoginAttempts and a step that
// was not a credential failure hands it back with releaseLoginAttempt.
func (x *Extension) reserveLoginAttempt(app core.App, identity, ip string) (int, error) {
	return x.countLoginAttempt(app, identity, ip, true)
}

// recordLoginFailure counts a failure found after the fact (passkey assertions, whose identity
// is only known once parsed). It escalates even while locked.
func (x *Extension) recordLoginFailure(app core.App, identity, ip string) {
	_, _ = x.countLoginAttempt(app, identity, ip, false)
}

func (x *Extension) countLoginAttempt(app core.App, identity, ip string, respectLock bool) (int, error) {
	now := int(time.Now().Unix())
	wait := 0
	err := app.RunInTransaction(func(tx core.App) error {
		row, err := tx.FindFirstRecordByFilter(attemptsCollection, "identity = {:identity} && ip = {:ip}", dbx.Params{"identity": identity, "ip": ip})
		if err != nil {
			row = nil
		}
		if respectLock && row != nil && row.GetInt("locked_until") > now {
			wait = row.GetInt("locked_until") - now
			return nil
		}
		attempts := 1
		if row != nil && row.GetInt("updated_at") >= now-attemptWindow {
			attempts = row.GetInt("attempts") + 1
		}
		lockedUntil := 0
		if row != nil {
			lockedUntil = row.GetInt("locked_until")
		}
		if attempts >= maxAttempts {
			wait := lockBase * (attempts - maxAttempts + 1)
			if wait > lockMax {
				wait = lockMax
			}
			lockedUntil = now + wait
		}
		if row == nil {
			collection, err := tx.FindCollectionByNameOrId(attemptsCollection)
			if err != nil {
				return err
			}
			row = core.NewRecord(collection)
			row.Set("identity", identity)
			row.Set("ip", ip)
		}
		row.Set("attempts", attempts)
		row.Set("locked_until", lockedUntil)
		row.Set("updated_at", now)
		return tx.Save(row)
	})
	return wait, err
}

// releaseLoginAttempt hands back one reserved attempt. Only a request that reserved while the
// identity was unlocked can get here, so any lock on the row was set by that same reservation.
func (x *Extension) releaseLoginAttempt(app core.App, identity, ip string) {
	_ = app.RunInTransaction(func(tx core.App) error {
		row, err := tx.FindFirstRecordByFilter(attemptsCollection, "identity = {:identity} && ip = {:ip}", dbx.Params{"identity": identity, "ip": ip})
		if err != nil || row == nil {
			return nil
		}
		attempts := row.GetInt("attempts") - 1
		if attempts <= 0 {
			return tx.Delete(row)
		}
		row.Set("attempts", attempts)
		row.Set("locked_until", 0)
		return tx.Save(row)
	})
}

func (x *Extension) resetLoginAttempts(app core.App, identity, ip string) {
	row, err := app.FindFirstRecordByFilter(attemptsCollection, "identity = {:identity} && ip = {:ip}", dbx.Params{"identity": identity, "ip": ip})
	if err == nil && row != nil {
		_ = app.Delete(row)
	}
}

func lockedResponse(e *core.RequestEvent, wait int) error {
	return e.JSON(http.StatusTooManyRequests, map[string]any{"error": "locked", "wait": wait})
}
