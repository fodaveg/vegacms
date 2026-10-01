package vegaauth

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// oversizedCeremony is a well-formed ceremony payload (so it only fails for its size) padded past
// maxWebAuthnBody with an ignored member.
func oversizedCeremony(t *testing.T, challenge string) string {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"id": "AA", "rawId": "AA", "type": "public-key",
		"response": map[string]string{"clientDataJSON": b64(clientData(t, "webauthn.get", challenge))},
		"padding":  strings.Repeat("a", maxWebAuthnBody),
	})
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestPasskeyCeremonyBodiesAreSizeLimited(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", false)

	begin := server.post("/passkey/login/discoverable/begin", "", "")
	challenge := challengeOf(t, begin.Body.Bytes())
	login := server.post("/passkey/login/discoverable/finish", "", oversizedCeremony(t, challenge))
	if login.Code != http.StatusRequestEntityTooLarge || errorCode(login) != "payload_too_large" {
		t.Fatalf("an oversized assertion must be refused before it is processed: %d %s", login.Code, errorCode(login))
	}
	if server.extension.takeSession("discoverable:"+challenge) == nil {
		t.Fatal("an oversized assertion must not reach (and consume) the challenge")
	}

	token := server.token(user)
	if begin := server.post("/passkey/register/begin", token, ""); begin.Code != http.StatusOK {
		t.Fatalf("register begin failed: %d %s", begin.Code, errorCode(begin))
	}
	register := server.post("/passkey/register/finish", token, oversizedCeremony(t, "ignored"))
	if register.Code != http.StatusRequestEntityTooLarge || errorCode(register) != "payload_too_large" {
		t.Fatalf("an oversized attestation must be refused: %d %s", register.Code, errorCode(register))
	}

	atLimit := server.post("/passkey/login/discoverable/finish", "", `{"response":{"clientDataJSON":"`+
		b64(clientData(t, "webauthn.get", "unknown"))+`"}}`)
	if atLimit.Code != http.StatusBadRequest || errorCode(atLimit) != "no_session" {
		t.Fatalf("a normal-sized assertion must still be processed: %d %s", atLimit.Code, errorCode(atLimit))
	}
}
