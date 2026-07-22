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
		begins: map[string]beginEntry{},
	}, nil
}

// RegisterRoutes installs the API contract consumed by Vega's PocketBase adapter.
func (x *Extension) RegisterRoutes(se *core.ServeEvent) {
	p := x.config.RoutePrefix
	se.Router.POST(p+"/login/password", x.loginPassword)
	se.Router.POST(p+"/login/totp", x.loginTOTP)
	se.Router.POST(p+"/login/recovery", x.loginRecovery)
	se.Router.POST(p+"/totp/enroll", x.enrollTOTP)
	se.Router.POST(p+"/totp/verify", x.verifyTOTP)
	se.Router.POST(p+"/totp/disable", x.disableTOTP)
	se.Router.POST(p+"/recovery/generate", x.generateRecoveryHandler)
	se.Router.GET(p+"/recovery/count", x.recoveryCountHandler)
	se.Router.POST(p+"/passkey/register/begin", x.beginRegister)
	se.Router.POST(p+"/passkey/register/finish", x.finishRegister)
	se.Router.POST(p+"/passkey/login/discoverable/begin", x.beginDiscoverableLogin)
	se.Router.POST(p+"/passkey/login/discoverable/finish", x.finishDiscoverableLogin)
	se.Router.GET(p+"/passkey/list", x.listPasskeys)
	se.Router.POST(p+"/passkey/delete", x.deletePasskey)
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

func (x *Extension) putSession(key string, data *webauthn.SessionData) bool {
	x.sessionMu.Lock()
	defer x.sessionMu.Unlock()
	now := time.Now()
	for storedKey, entry := range x.sessions {
		if !entry.expires.After(now) {
			delete(x.sessions, storedKey)
		}
	}
	if _, replacing := x.sessions[key]; !replacing && len(x.sessions) >= maxWebAuthnChallenges {
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
