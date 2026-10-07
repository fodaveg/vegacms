package vegaauth

import (
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
	"github.com/spf13/cast"
)

// distinctAuthToken preserves PocketBase's signed auth claims and expiry, adding a random jti
// so independent logins/refreshes within one second never share proof of possession. The key
// and HS256 signature remain PocketBase's: normal middleware and token-key revocation still
// apply. This introduces no account field or client-side session identifier.
//
// Static/impersonation tokens explicitly cannot be refreshed. PocketBase returns those tokens
// unchanged from auth-refresh, and so do we. Only refreshable auth tokens receive a nonce.
func (x *Extension) distinctAuthToken(record *core.Record, token string) (string, error) {
	key := record.TokenKey() + record.Collection().AuthToken.Secret
	claims, err := security.ParseJWT(token, key)
	if err != nil {
		return "", fmt.Errorf("parse issued auth token: %w", err)
	}
	if !cast.ToBool(claims[core.TokenClaimRefreshable]) {
		return token, nil
	}
	nonce := make([]byte, 24)
	if _, err := io.ReadFull(x.random, nonce); err != nil {
		return "", fmt.Errorf("generate session nonce: %w", err)
	}
	claims["jti"] = hex.EncodeToString(nonce)
	// NewJWT preserves an explicit exp in payload; zero duration does not change that claim.
	return security.NewJWT(claims, key, 0)
}

// authTokenFromHeader matches PocketBase's getAuthTokenFromRequest: the optional
// Bearer scheme is case-insensitive and followed by exactly one ASCII space.
// Use the same extraction for signature validation and proof keys so changing the
// header representation cannot create a different proof identity.
func authTokenFromHeader(header string) string {
	if len(header) > 7 && strings.EqualFold(header[:7], "Bearer ") {
		return header[7:]
	}
	return header
}

// proofSessionEligible verifies signed claims, not a client-provided identifier. Matching PB's
// refreshable coercion also prevents a noncanonical signed "true" from posing as a static token.
// Static tokens are a deliberate PB capability, not new login sessions, and keep their contract.
func proofSessionEligible(record *core.Record, token string) (bool, error) {
	token = authTokenFromHeader(token)
	claims, err := security.ParseJWT(token, record.TokenKey()+record.Collection().AuthToken.Secret)
	if err != nil {
		return false, err
	}
	if claims[core.TokenClaimType] != core.TokenTypeAuth || claims[core.TokenClaimId] != record.Id || claims[core.TokenClaimCollectionId] != record.Collection().Id {
		return false, fmt.Errorf("auth token identity mismatch")
	}
	if !cast.ToBool(claims[core.TokenClaimRefreshable]) {
		return true, nil
	}
	jti, ok := claims["jti"].(string)
	nonce, err := hex.DecodeString(jti)
	return ok && err == nil && len(nonce) == 24, nil
}

// requireProofSession runs before any factor write or proof/code/challenge consumption. Normal
// CRUD and read-only routes are unaffected. Missing/wrong-collection auth reaches the original
// handler unchanged so existing 401 behavior is preserved.
func (x *Extension) requireProofSession(e *core.RequestEvent) error {
	if e.Auth == nil || e.Auth.Collection().Name != x.config.AuthCollection {
		return e.Next()
	}
	eligible, err := proofSessionEligible(e.Auth, e.Request.Header.Get("Authorization"))
	if err != nil {
		return unauthorized(e)
	}
	if !eligible {
		return e.JSON(http.StatusPreconditionRequired, map[string]any{
			"error":   "step_up_required",
			"methods": []string{},
			"message": "Refresh the session before changing security factors.",
		})
	}
	return e.Next()
}
