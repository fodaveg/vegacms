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
	"github.com/pquerna/otp/totp"
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
	if wait := x.loginLockRemaining(e.App, identity, ip); wait > 0 {
		return lockedResponse(e, wait)
	}
	record, err := e.App.FindAuthRecordByEmail(x.config.AuthCollection, body.Email)
	if err != nil || record == nil {
		_ = bcrypt.CompareHashAndPassword(x.dummy, []byte(body.Password))
		x.recordLoginFailure(e.App, identity, ip)
		return e.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid_credentials"})
	}
	if !record.ValidatePassword(body.Password) {
		x.recordLoginFailure(e.App, identity, ip)
		return e.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid_credentials"})
	}
	if record.GetBool("totp_enabled") {
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
	return authTokenResponse(e, record)
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
	if wait := x.loginLockRemaining(e.App, pending.identity, ip); wait > 0 {
		return lockedResponse(e, wait)
	}
	record, err := e.App.FindRecordById(x.config.AuthCollection, pending.userID)
	if err != nil || !totp.Validate(body.Code, record.GetString("totp_secret")) {
		x.recordLoginFailure(e.App, pending.identity, ip)
		return e.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid_code"})
	}
	x.resetLoginAttempts(e.App, pending.identity, ip)
	x.deletePending(body.Pending)
	return authTokenResponse(e, record)
}

func authTokenResponse(e *core.RequestEvent, record *core.Record) error {
	token, err := record.NewAuthToken()
	if err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "token_failed"})
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

func (x *Extension) recordLoginFailure(app core.App, identity, ip string) {
	now := int(time.Now().Unix())
	_ = app.RunInTransaction(func(tx core.App) error {
		row, err := tx.FindFirstRecordByFilter(attemptsCollection, "identity = {:identity} && ip = {:ip}", dbx.Params{"identity": identity, "ip": ip})
		if err != nil {
			row = nil
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
