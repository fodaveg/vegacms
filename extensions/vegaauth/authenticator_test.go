package vegaauth

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"testing"

	"github.com/go-webauthn/webauthn/protocol/webauthncbor"
	"github.com/go-webauthn/webauthn/protocol/webauthncose"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/pocketbase/pocketbase/core"
)

const (
	testRPID   = "localhost"
	testOrigin = "http://localhost:5173"

	flagUserPresent  = 0x01
	flagUserVerified = 0x04
	flagAttested     = 0x40
)

// virtualAuthenticator is a software passkey: it signs real WebAuthn assertions and attestations
// with an ES256 key, so the tests drive the same verification code a browser would.
type virtualAuthenticator struct {
	t       *testing.T
	key     *ecdsa.PrivateKey
	id      []byte
	counter uint32
	// verifyUser controls the UV flag of what it signs (PIN/biometrics performed or not).
	verifyUser bool
}

func newAuthenticator(t *testing.T) *virtualAuthenticator {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	id := make([]byte, 16)
	if _, err := rand.Read(id); err != nil {
		t.Fatal(err)
	}
	return &virtualAuthenticator{t: t, key: key, id: id, verifyUser: true}
}

func (a *virtualAuthenticator) cosePublicKey() []byte {
	a.t.Helper()
	point, err := a.key.PublicKey.Bytes() // 0x04 || X || Y
	if err != nil {
		a.t.Fatal(err)
	}
	raw, err := webauthncbor.Marshal(webauthncose.EC2PublicKeyData{
		PublicKeyData: webauthncose.PublicKeyData{KeyType: 2, Algorithm: -7},
		Curve:         1, XCoord: point[1:33], YCoord: point[33:65],
	})
	if err != nil {
		a.t.Fatal(err)
	}
	return raw
}

// store saves this authenticator as an already registered passkey of user.
func (a *virtualAuthenticator) store(app core.App, user *core.Record) {
	a.t.Helper()
	credential := &webauthn.Credential{
		ID: a.id, PublicKey: a.cosePublicKey(),
		Flags:         webauthn.CredentialFlags{UserPresent: true, UserVerified: true},
		Authenticator: webauthn.Authenticator{SignCount: a.counter},
	}
	if err := saveCredential(app, user.Id, credential, "test passkey"); err != nil {
		a.t.Fatal(err)
	}
}

func (a *virtualAuthenticator) authenticatorData(attested bool) []byte {
	rpHash := sha256.Sum256([]byte(testRPID))
	flags := byte(flagUserPresent)
	if a.verifyUser {
		flags |= flagUserVerified
	}
	if attested {
		flags |= flagAttested
	}
	data := append([]byte{}, rpHash[:]...)
	data = append(data, flags)
	data = binary.BigEndian.AppendUint32(data, a.counter)
	if attested {
		data = append(data, make([]byte, 16)...) // AAGUID
		data = binary.BigEndian.AppendUint16(data, uint16(len(a.id)))
		data = append(data, a.id...)
		data = append(data, a.cosePublicKey()...)
	}
	return data
}

func clientData(t *testing.T, ceremony, challenge string) []byte {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"type": ceremony, "challenge": challenge, "origin": testOrigin})
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

// assertion answers a login challenge on behalf of userID, signing with the current counter.
func (a *virtualAuthenticator) assertion(challenge, userID string) string {
	a.t.Helper()
	client := clientData(a.t, "webauthn.get", challenge)
	authData := a.authenticatorData(false)
	clientHash := sha256.Sum256(client)
	digest := sha256.Sum256(append(append([]byte{}, authData...), clientHash[:]...))
	signature, err := ecdsa.SignASN1(rand.Reader, a.key, digest[:])
	if err != nil {
		a.t.Fatal(err)
	}
	return a.envelope(map[string]string{
		"clientDataJSON":    b64(client),
		"authenticatorData": b64(authData),
		"signature":         b64(signature),
		"userHandle":        b64([]byte(userID)),
	})
}

// attestation answers a registration challenge with a "none" attestation statement.
func (a *virtualAuthenticator) attestation(challenge string) string {
	a.t.Helper()
	object, err := webauthncbor.Marshal(map[string]any{
		"fmt": "none", "attStmt": map[string]any{}, "authData": a.authenticatorData(true),
	})
	if err != nil {
		a.t.Fatal(err)
	}
	return a.envelope(map[string]string{
		"clientDataJSON":    b64(clientData(a.t, "webauthn.create", challenge)),
		"attestationObject": b64(object),
	})
}

func (a *virtualAuthenticator) envelope(response map[string]string) string {
	a.t.Helper()
	raw, err := json.Marshal(map[string]any{
		"id": b64(a.id), "rawId": b64(a.id), "type": "public-key", "response": response,
	})
	if err != nil {
		a.t.Fatal(err)
	}
	return string(raw)
}

func b64(raw []byte) string {
	return base64.RawURLEncoding.EncodeToString(raw)
}

// storedCredential decodes what the server keeps for this authenticator.
func (a *virtualAuthenticator) storedCredential(app core.App) webauthn.Credential {
	a.t.Helper()
	row, err := app.FindFirstRecordByData(credentialsCollection, "credential_id", b64(a.id))
	if err != nil {
		a.t.Fatal(err)
	}
	var credential webauthn.Credential
	if err := json.Unmarshal([]byte(row.GetString("data")), &credential); err != nil {
		a.t.Fatal(err)
	}
	return credential
}

// challengeOf extracts publicKey.challenge from a begin response.
func challengeOf(t *testing.T, body []byte) string {
	t.Helper()
	var options struct {
		PublicKey struct {
			Challenge string `json:"challenge"`
		} `json:"publicKey"`
	}
	if err := json.Unmarshal(body, &options); err != nil || options.PublicKey.Challenge == "" {
		t.Fatalf("missing WebAuthn challenge: %v %s", err, body)
	}
	return options.PublicKey.Challenge
}
