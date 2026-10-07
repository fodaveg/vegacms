// Package vegaauth adds password + optional TOTP/recovery and passkey authentication to a
// PocketBase Go application. It is optional: Vega keeps working with vanilla PocketBase when
// authApiBasePath is absent from vega.config.json.
package vegaauth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/pocketbase/pocketbase/core"
	"golang.org/x/crypto/bcrypt"
)

const (
	credentialsCollection = "vega_webauthn_credentials"
	recoveryCollection    = "vega_recovery_codes"
	attemptsCollection    = "vega_login_attempts"
	challengeTTL          = 5 * time.Minute
	maxPendingChallenges  = 512
	// Independent budgets: anonymous login and authenticated verify/register each get this cap.
	maxWebAuthnChallenges = 2048
	challengeBeginLimit   = 30
	challengeBeginWindow  = time.Minute
	maxChallengeClients   = 4096
)

var errChallengeCapacity = errors.New("challenge capacity reached")

// Config contains every deployment-specific value. No hostname, collection, issuer or route
// from Vega's dogfood site is embedded in the extension.
type Config struct {
	AuthCollection string
	RoutePrefix    string
	TOTPIssuer     string
	RPID           string
	RPDisplayName  string
	RPOrigins      []string
	TrustProxy     bool
}

func (c Config) normalized() (Config, error) {
	c.AuthCollection = strings.TrimSpace(c.AuthCollection)
	if c.AuthCollection == "" {
		c.AuthCollection = "vega_editors"
	}
	c.RoutePrefix = strings.TrimRight(strings.TrimSpace(c.RoutePrefix), "/")
	if c.RoutePrefix == "" {
		c.RoutePrefix = "/api/vega-auth"
	}
	if !strings.HasPrefix(c.RoutePrefix, "/api/") || strings.HasPrefix(c.RoutePrefix, "//") {
		return c, fmt.Errorf("vegaauth: RoutePrefix must be a relative /api/... path")
	}
	if c.TOTPIssuer == "" {
		c.TOTPIssuer = "Vega"
	}
	if c.RPID == "" {
		c.RPID = "localhost"
	}
	if c.RPDisplayName == "" {
		c.RPDisplayName = "Vega"
	}
	if len(c.RPOrigins) == 0 {
		c.RPOrigins = []string{"http://localhost:5173", "http://localhost:8090"}
	}
	return c, nil
}

type pendingEntry struct {
	userID   string
	identity string
	ip       string
	expires  time.Time
}

type sessionEntry struct {
	data    *webauthn.SessionData
	expires time.Time
}

type beginEntry struct {
	count int
	reset time.Time
}

// Extension owns only short-lived challenges in memory. Credentials, recovery codes and login
// throttling are persisted in PocketBase.
type Extension struct {
	config   Config
	webAuthn *webauthn.WebAuthn
	dummy    []byte
	random   io.Reader

	pendingMu sync.Mutex
	pending   map[string]pendingEntry
	sessionMu sync.Mutex
	sessions  map[string]sessionEntry
	beginMu   sync.Mutex
	begins    map[string]beginEntry
	// proofs maps a session (hash of its token) to the moment its second-factor proof expires.
	proofMu sync.Mutex
	proofs  map[string]time.Time
}

func New(config Config) (*Extension, error) {
	config, err := config.normalized()
	if err != nil {
		return nil, err
	}
	wa, err := webauthn.New(&webauthn.Config{
		RPID:          config.RPID,
		RPDisplayName: config.RPDisplayName,
		RPOrigins:     config.RPOrigins,
	})
	if err != nil {
		return nil, fmt.Errorf("vegaauth: configure WebAuthn: %w", err)
	}
	dummy, err := bcrypt.GenerateFromPassword([]byte("vega-no-such-user"), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("vegaauth: initialize password guard: %w", err)
	}
	return &Extension{
		config: config, webAuthn: wa, dummy: dummy, random: rand.Reader,
		pending: map[string]pendingEntry{}, sessions: map[string]sessionEntry{},
		begins: map[string]beginEntry{}, proofs: map[string]time.Time{},
	}, nil
}

// RegisterRoutes installs the API contract consumed by Vega's PocketBase adapter.
func (x *Extension) RegisterRoutes(se *core.ServeEvent) {
	p := x.config.RoutePrefix
	x.bindProofToRefresh(se.App)
	x.bindFactorFieldGuard(se.App)
	// Keep existing authentication/status handling in each handler; only the session format
	// requirement is shared by operations that mutate factors or establish proof.
	securityRoutes := se.Router.Group(p)
	securityRoutes.BindFunc(x.requireProofSession)
	se.Router.POST(p+"/login/password", x.loginPassword)
	se.Router.POST(p+"/login/totp", x.loginTOTP)
	se.Router.POST(p+"/login/recovery", x.loginRecovery)
	securityRoutes.POST("/totp/enroll", x.enrollTOTP)
	securityRoutes.POST("/totp/verify", x.verifyTOTP)
	securityRoutes.POST("/totp/disable", x.disableTOTP)
	securityRoutes.POST("/recovery/generate", x.generateRecoveryHandler)
	se.Router.GET(p+"/recovery/count", x.recoveryCountHandler)
	securityRoutes.POST("/passkey/register/begin", x.beginRegister)
	securityRoutes.POST("/passkey/register/finish", x.finishRegister)
	se.Router.POST(p+"/passkey/login/discoverable/begin", x.beginDiscoverableLogin)
	se.Router.POST(p+"/passkey/login/discoverable/finish", x.finishDiscoverableLogin)
	securityRoutes.POST("/passkey/verify/begin", x.beginPasskeyVerify)
	securityRoutes.POST("/passkey/verify/finish", x.finishPasskeyVerify)
	se.Router.GET(p+"/passkey/list", x.listPasskeys)
	securityRoutes.POST("/passkey/delete", x.deletePasskey)
	se.Router.GET(p+"/health", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})
}

func (x *Extension) newPending(userID, identity, ip string) (string, error) {
	raw := make([]byte, 24)
	if _, err := io.ReadFull(x.random, raw); err != nil {
		return "", fmt.Errorf("generate pending challenge: %w", err)
	}
	token := hex.EncodeToString(raw)
	x.pendingMu.Lock()
	defer x.pendingMu.Unlock()
	now := time.Now()
	for key, entry := range x.pending {
		if !entry.expires.After(now) {
			delete(x.pending, key)
		}
	}
	if len(x.pending) >= maxPendingChallenges {
		return "", errChallengeCapacity
	}
	x.pending[token] = pendingEntry{userID: userID, identity: identity, ip: ip, expires: now.Add(challengeTTL)}
	return token, nil
}

func (x *Extension) peekPending(token, ip string) (pendingEntry, bool) {
	x.pendingMu.Lock()
	defer x.pendingMu.Unlock()
	entry, ok := x.pending[token]
	if !ok || time.Now().After(entry.expires) {
		delete(x.pending, token)
		return pendingEntry{}, false
	}
	if entry.ip != ip {
		return pendingEntry{}, false
	}
	return entry, true
}

func (x *Extension) deletePending(token string) {
	x.pendingMu.Lock()
	delete(x.pending, token)
	x.pendingMu.Unlock()
}

func authenticatedChallenge(key string) bool {
	return strings.HasPrefix(key, "verify:") || strings.HasPrefix(key, "register:")
}

func (x *Extension) putSession(key string, data *webauthn.SessionData) bool {
	x.sessionMu.Lock()
	defer x.sessionMu.Unlock()
	now := time.Now()
	authenticated := authenticatedChallenge(key)
	active := 0
	for storedKey, entry := range x.sessions {
		if !entry.expires.After(now) {
			delete(x.sessions, storedKey)
		} else if authenticatedChallenge(storedKey) == authenticated {
			active++
		}
	}
	if _, replacing := x.sessions[key]; !replacing && active >= maxWebAuthnChallenges {
		return false
	}
	x.sessions[key] = sessionEntry{data: data, expires: now.Add(challengeTTL)}
	return true
}

func (x *Extension) takeSession(key string) *webauthn.SessionData {
	x.sessionMu.Lock()
	defer x.sessionMu.Unlock()
	entry, ok := x.sessions[key]
	delete(x.sessions, key)
	if !ok || time.Now().After(entry.expires) {
		return nil
	}
	return entry.data
}

func (x *Extension) allowChallengeBegin(ip string) (bool, int) {
	x.beginMu.Lock()
	defer x.beginMu.Unlock()
	now := time.Now()
	for key, entry := range x.begins {
		if !entry.reset.After(now) {
			delete(x.begins, key)
		}
	}
	entry, exists := x.begins[ip]
	if !exists {
		if len(x.begins) >= maxChallengeClients {
			return false, int(challengeBeginWindow.Seconds())
		}
		x.begins[ip] = beginEntry{count: 1, reset: now.Add(challengeBeginWindow)}
		return true, 0
	}
	if entry.count >= challengeBeginLimit {
		wait := int(time.Until(entry.reset).Seconds())
		if wait < 1 {
			wait = 1
		}
		return false, wait
	}
	entry.count++
	x.begins[ip] = entry
	return true, 0
}
