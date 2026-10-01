package vegaauth

import (
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
)

func TestTOTPCodeIsSingleUseInsideItsWindow(t *testing.T) {
	server := newTestServer(t)
	server.newUser("editor@example.com", true)
	code := totpCode(t, testTOTPSecret, 0)

	first := server.post("/login/totp", "", `{"pending":"`+server.pending("editor@example.com")+`","code":"`+code+`"}`)
	if first.Code != http.StatusOK {
		t.Fatalf("a fresh code must log in: %d %s", first.Code, first.Body.String())
	}
	replay := server.post("/login/totp", "", `{"pending":"`+server.pending("editor@example.com")+`","code":"`+code+`"}`)
	if replay.Code != http.StatusUnauthorized || errorCode(replay) != "invalid_code" {
		t.Fatalf("the same code must not be accepted twice: %d %s", replay.Code, errorCode(replay))
	}
	next := server.post("/login/totp", "", `{"pending":"`+server.pending("editor@example.com")+`","code":"`+totpCode(t, testTOTPSecret, 1)+`"}`)
	if next.Code != http.StatusOK {
		t.Fatalf("the following step's code must still log in: %d %s", next.Code, next.Body.String())
	}
	older := server.post("/login/totp", "", `{"pending":"`+server.pending("editor@example.com")+`","code":"`+code+`"}`)
	if older.Code != http.StatusUnauthorized {
		t.Fatalf("a code older than the last accepted step must be rejected: %d", older.Code)
	}
}

func TestParallelUsesOfOneTOTPCodeAcceptExactlyOne(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	code := totpCode(t, testTOTPSecret, 0)

	var accepted atomic.Int32
	var wait sync.WaitGroup
	for i := 0; i < 16; i++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			ok, err := server.extension.consumeTOTP(server.app, server.reload(user), code)
			if err != nil {
				t.Error(err)
			}
			if ok {
				accepted.Add(1)
			}
		}()
	}
	wait.Wait()
	if accepted.Load() != 1 {
		t.Fatalf("expected exactly one parallel use of the code to be accepted, got %d", accepted.Load())
	}
}

func TestEnsureCollectionsAddsLastStepToAnExistingInstallation(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)

	// Simulate an installation created before the field existed.
	collection, err := server.app.FindCollectionByNameOrId("vega_editors")
	if err != nil {
		t.Fatal(err)
	}
	collection.Fields.RemoveByName("totp_last_step")
	if err := server.app.Save(collection); err != nil {
		t.Fatal(err)
	}
	if err := server.extension.EnsureCollections(server.app); err != nil {
		t.Fatal(err)
	}
	fresh := server.reload(user)
	if !fresh.GetBool("totp_enabled") || fresh.GetString("totp_secret") != testTOTPSecret {
		t.Fatal("adding the field must not touch the existing second factor")
	}
	ok, err := server.extension.consumeTOTP(server.app, fresh, totpCode(t, testTOTPSecret, 0))
	if err != nil || !ok {
		t.Fatalf("an existing account must keep logging in after the upgrade: %v %v", ok, err)
	}
}
