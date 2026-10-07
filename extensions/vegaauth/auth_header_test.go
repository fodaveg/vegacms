package vegaauth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

var authHeaderPrefixes = []string{"", "Bearer ", "bearer ", "BEARER ", "bEaReR "}

func TestAuthorizationHeaderVariantsShareProofAndRefresh(t *testing.T) {
	for _, kind := range []string{"modern", "static"} {
		t.Run(kind, func(t *testing.T) {
			server := newTestServer(t)
			user := server.newUser("editor@example.com", true)
			token := server.token(user)
			if kind == "static" {
				var err error
				token, err = user.NewStaticAuthToken(time.Minute)
				if err != nil {
					t.Fatal(err)
				}
			}
			proof := `{"code":"` + totpCode(t, testTOTPSecret, 0) + `"}`
			if response := server.post("/totp/enroll", "bearer "+token, proof); response.Code != http.StatusOK {
				t.Fatalf("lowercase Bearer could not establish proof: %d", response.Code)
			}
			expires, ok := server.extension.proofs[sessionKey(token)]
			if !ok {
				t.Fatal("proof was not indexed by the raw token")
			}
			for _, prefix := range authHeaderPrefixes {
				if response := server.post("/totp/enroll", prefix+token, ""); response.Code != http.StatusOK {
					t.Fatalf("prefix %q lost proof: %d", prefix, response.Code)
				}
				next := server.refresh(prefix + token)
				if (next == token) != (kind == "static") {
					t.Fatalf("prefix %q changed refresh/static token semantics", prefix)
				}
				if next != token {
					for _, oldPrefix := range authHeaderPrefixes {
						if server.extension.hasRecentProof(sessionKey(oldPrefix + token)) {
							t.Fatalf("replaced token retained proof with prefix %q", oldPrefix)
						}
					}
				}
				for _, nextPrefix := range authHeaderPrefixes {
					if got := server.extension.proofs[sessionKey(nextPrefix+next)]; !got.Equal(expires) {
						t.Fatalf("refresh lost or extended proof with prefix %q", nextPrefix)
					}
				}
				token = next
			}
		})
	}
}

func TestLegacyAuthorizationHeaderVariantsRequireRefresh(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	legacy := server.legacyToken(user)
	body := `{"code":"` + totpCode(t, testTOTPSecret, 0) + `"}`
	for _, prefix := range authHeaderPrefixes {
		t.Run(prefix, func(t *testing.T) {
			server.extension.markProof(sessionKey(legacy))
			expectStepUp(t, "legacy header variant", server.post("/totp/enroll", prefix+legacy, body))
			if server.reload(user).GetInt("totp_last_step") != 0 {
				t.Fatal("legacy header variant consumed the TOTP code")
			}
			next := server.refresh(prefix + legacy)
			if next == legacy || server.extension.hasRecentProof(sessionKey(next)) {
				t.Fatal("legacy refresh retained the token or inherited shared proof")
			}
			for _, oldPrefix := range authHeaderPrefixes {
				if server.extension.hasRecentProof(sessionKey(oldPrefix + legacy)) {
					t.Fatal("legacy proof survived under a different header prefix")
				}
			}
		})
	}
}

func TestAuthorizationHeaderWhitespaceMatchesPocketBase(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	token := server.token(user)
	// PB accepts a single ASCII space after the optional case-insensitive scheme.
	// Its router does not trim extra whitespace or treat a tab as that separator.
	for _, header := range []string{" " + token, token + " ", "Bearer  " + token, "Bearer\t" + token, "\tBearer " + token} {
		for _, path := range []string{"/api/vega-auth/passkey/list", "/api/vega-auth/totp/enroll", "/api/collections/vega_editors/auth-refresh"} {
			method := http.MethodPost
			if path == "/api/vega-auth/passkey/list" {
				method = http.MethodGet
			}
			request := httptest.NewRequest(method, path, nil)
			request.Header.Set("Authorization", header)
			response := httptest.NewRecorder()
			server.mux.ServeHTTP(response, request)
			if response.Code != http.StatusUnauthorized {
				t.Fatalf("unsupported header whitespace changed PB rejection at %s: %d", path, response.Code)
			}
		}
	}
}
