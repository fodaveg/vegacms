package vegaauth

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type pbUser struct {
	record *core.Record
	creds  []webauthn.Credential
}

func (u *pbUser) WebAuthnID() []byte                         { return []byte(u.record.Id) }
func (u *pbUser) WebAuthnName() string                       { return u.record.Email() }
func (u *pbUser) WebAuthnCredentials() []webauthn.Credential { return u.creds }
func (u *pbUser) WebAuthnDisplayName() string {
	if name := u.record.GetString("name"); name != "" {
		return name
	}
	return u.record.Email()
}

func loadUser(app core.App, record *core.Record) (*pbUser, error) {
	rows, err := app.FindRecordsByFilter(credentialsCollection, "user = {:uid}", "", 0, 0, dbx.Params{"uid": record.Id})
	if err != nil {
		return nil, err
	}
	credentials := make([]webauthn.Credential, 0, len(rows))
	for _, row := range rows {
		var credential webauthn.Credential
		if err := json.Unmarshal([]byte(row.GetString("data")), &credential); err != nil {
			return nil, fmt.Errorf("decode stored passkey %s: %w", row.Id, err)
		}
		credentials = append(credentials, credential)
	}
	return &pbUser{record: record, creds: credentials}, nil
}

func saveCredential(app core.App, userID string, credential *webauthn.Credential, name string) error {
	raw, err := json.Marshal(credential)
	if err != nil {
		return err
	}
	credentialID := base64.RawURLEncoding.EncodeToString(credential.ID)
	existing, _ := app.FindFirstRecordByData(credentialsCollection, "credential_id", credentialID)
	if existing != nil {
		if existing.GetString("user") != userID {
			return errors.New("credential already belongs to another user")
		}
		existing.Set("data", string(raw))
		if name != "" {
			existing.Set("name", name)
		}
		return app.Save(existing)
	}
	collection, err := app.FindCollectionByNameOrId(credentialsCollection)
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("credential_id", credentialID)
	record.Set("data", string(raw))
	record.Set("name", name)
	return app.Save(record)
}

func (x *Extension) beginRegister(e *core.RequestEvent) error {
	if e.Auth == nil || e.Auth.Collection().Name != x.config.AuthCollection {
		return unauthorized(e)
	}
	user, err := loadUser(e.App, e.Auth)
	if err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "load_failed"})
	}
	options, session, err := x.webAuthn.BeginRegistration(user,
		webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
			ResidentKey:      protocol.ResidentKeyRequirementRequired,
			UserVerification: protocol.VerificationPreferred,
		}),
	)
	if err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "begin_failed"})
	}
	if !x.putSession("register:"+e.Auth.Id, session) {
		return e.JSON(http.StatusServiceUnavailable, map[string]string{"error": "challenge_capacity"})
	}
	return e.JSON(http.StatusOK, options)
}

func (x *Extension) finishRegister(e *core.RequestEvent) error {
	if e.Auth == nil || e.Auth.Collection().Name != x.config.AuthCollection {
		return unauthorized(e)
	}
	session := x.takeSession("register:" + e.Auth.Id)
	if session == nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "no_session"})
	}
	user, err := loadUser(e.App, e.Auth)
	if err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "load_failed"})
	}
	if err := normalizeRequestBody(e.Request); err != nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "bad_request"})
	}
	credential, err := x.webAuthn.FinishRegistration(user, *session, e.Request)
	if err != nil {
		e.App.Logger().Error("vega passkey registration failed", "detail", webAuthnError(err))
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "verify_failed"})
	}
	name := strings.TrimSpace(e.Request.URL.Query().Get("name"))
	if len(name) > 80 {
		name = name[:80]
	}
	if err := saveCredential(e.App, e.Auth.Id, credential, name); err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "save_failed"})
	}
	return e.JSON(http.StatusOK, map[string]bool{"ok": true})
}

func (x *Extension) beginDiscoverableLogin(e *core.RequestEvent) error {
	ip := x.clientIP(e)
	if allowed, wait := x.allowChallengeBegin(ip); !allowed {
		return lockedResponse(e, wait)
	}
	options, session, err := x.webAuthn.BeginDiscoverableLogin()
	if err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "begin_failed"})
	}
	// The challenge is also in clientDataJSON at finish, so concurrent anonymous ceremonies do
	// not overwrite one global slot.
	if !x.putSession("discoverable:"+session.Challenge, session) {
		return e.JSON(http.StatusServiceUnavailable, map[string]string{"error": "challenge_capacity"})
	}
	return e.JSON(http.StatusOK, options)
}

func (x *Extension) finishDiscoverableLogin(e *core.RequestEvent) error {
	ip := x.clientIP(e)
	challenge, err := assertionChallenge(e.Request)
	if err != nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "bad_request"})
	}
	session := x.takeSession("discoverable:" + challenge)
	if session == nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "no_session"})
	}
	var matched *core.Record
	handler := func(_ []byte, userHandle []byte) (webauthn.User, error) {
		record, err := e.App.FindRecordById(x.config.AuthCollection, string(userHandle))
		if err != nil {
			return nil, err
		}
		user, err := loadUser(e.App, record)
		if err == nil {
			matched = record
		}
		return user, err
	}
	credential, err := x.webAuthn.FinishDiscoverableLogin(handler, *session, e.Request)
	if err != nil || matched == nil {
		identity := "passkey:anonymous"
		if matched != nil {
			identity = loginIdentity(matched.Email())
		}
		x.recordLoginFailure(e.App, identity, ip)
		if err != nil {
			e.App.Logger().Error("vega passkey login failed", "detail", webAuthnError(err))
		}
		return e.JSON(http.StatusUnauthorized, map[string]string{"error": "verify_failed"})
	}
	identity := loginIdentity(matched.Email())
	if wait := x.loginLockRemaining(e.App, identity, ip); wait > 0 {
		return lockedResponse(e, wait)
	}
	if err := saveCredential(e.App, matched.Id, credential, ""); err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "save_failed"})
	}
	x.resetLoginAttempts(e.App, identity, ip)
	return authTokenResponse(e, matched)
}

// assertionChallenge reads clientDataJSON to choose the matching anonymous WebAuthn session,
// then restores the exact request bytes for go-webauthn's parser.
func assertionChallenge(request *http.Request) (string, error) {
	raw, err := io.ReadAll(request.Body)
	if err != nil {
		return "", err
	}
	request.Body = io.NopCloser(bytes.NewReader(raw))
	var assertion struct {
		Response struct {
			ClientData string `json:"clientDataJSON"`
		} `json:"response"`
	}
	if err := json.Unmarshal(raw, &assertion); err != nil || assertion.Response.ClientData == "" {
		return "", errors.New("missing clientDataJSON")
	}
	clientData, err := base64.RawURLEncoding.DecodeString(assertion.Response.ClientData)
	if err != nil {
		return "", err
	}
	var data struct {
		Challenge string `json:"challenge"`
	}
	if err := json.Unmarshal(clientData, &data); err != nil || data.Challenge == "" {
		return "", errors.New("missing challenge")
	}
	return data.Challenge, nil
}

func normalizeRequestBody(request *http.Request) error {
	raw, err := io.ReadAll(request.Body)
	if err != nil {
		return err
	}
	request.Body = io.NopCloser(bytes.NewReader(raw))
	return nil
}

func (x *Extension) listPasskeys(e *core.RequestEvent) error {
	if e.Auth == nil || e.Auth.Collection().Name != x.config.AuthCollection {
		return unauthorized(e)
	}
	rows, err := e.App.FindRecordsByFilter(credentialsCollection, "user = {:uid}", "-created", 0, 0, dbx.Params{"uid": e.Auth.Id})
	if err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "load_failed"})
	}
	result := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		result = append(result, map[string]any{"id": row.Id, "name": row.GetString("name"), "created": row.GetString("created")})
	}
	return e.JSON(http.StatusOK, map[string]any{"passkeys": result})
}

type deletePasskeyBody struct {
	ID string `json:"id"`
}

func (x *Extension) deletePasskey(e *core.RequestEvent) error {
	if e.Auth == nil || e.Auth.Collection().Name != x.config.AuthCollection {
		return unauthorized(e)
	}
	var body deletePasskeyBody
	if err := e.BindBody(&body); err != nil || body.ID == "" {
		return e.JSON(http.StatusBadRequest, map[string]string{"error": "bad_request"})
	}
	record, err := e.App.FindRecordById(credentialsCollection, body.ID)
	if err != nil {
		return e.JSON(http.StatusNotFound, map[string]string{"error": "not_found"})
	}
	if record.GetString("user") != e.Auth.Id {
		return e.JSON(http.StatusForbidden, map[string]string{"error": "forbidden"})
	}
	if err := e.App.Delete(record); err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"error": "delete_failed"})
	}
	return e.JSON(http.StatusOK, map[string]bool{"ok": true})
}

func webAuthnError(err error) string {
	var protocolError *protocol.Error
	if errors.As(err, &protocolError) {
		if protocolError.DevInfo != "" {
			return protocolError.Details + " | " + protocolError.DevInfo
		}
		return protocolError.Details
	}
	return err.Error()
}
