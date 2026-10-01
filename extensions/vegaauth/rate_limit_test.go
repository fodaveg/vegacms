package vegaauth

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// parallel fires n simultaneous requests and tallies the response codes.
func parallel(n int, send func() *httptest.ResponseRecorder) map[int]int {
	start := make(chan struct{})
	codes := make(chan int, n)
	var wait sync.WaitGroup
	for i := 0; i < n; i++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			codes <- send().Code
		}()
	}
	close(start)
	wait.Wait()
	close(codes)
	tally := map[int]int{}
	for code := range codes {
		tally[code]++
	}
	return tally
}

func TestParallelPasswordGuessesCannotExceedTheAttemptLimit(t *testing.T) {
	server := newTestServer(t)
	server.newUser("editor@example.com", false)

	tally := parallel(40, func() *httptest.ResponseRecorder {
		return server.post("/login/password", "", `{"email":"editor@example.com","password":"wrong"}`)
	})
	if tally[http.StatusUnauthorized] != maxAttempts || tally[http.StatusTooManyRequests] != 40-maxAttempts {
		t.Fatalf("expected exactly %d evaluated guesses and the rest locked, got %v", maxAttempts, tally)
	}
	locked := server.post("/login/password", "", `{"email":"editor@example.com","password":"`+testPassword+`"}`)
	if locked.Code != http.StatusTooManyRequests {
		t.Fatalf("the identity must stay locked after the burst: %d", locked.Code)
	}
}

func TestParallelSecondFactorGuessesCannotExceedTheAttemptLimit(t *testing.T) {
	server := newTestServer(t)
	server.newUser("editor@example.com", true)
	pending := server.pending("editor@example.com")

	tally := parallel(40, func() *httptest.ResponseRecorder {
		return server.post("/login/totp", "", `{"pending":"`+pending+`","code":"000000"}`)
	})
	if tally[http.StatusUnauthorized] != maxAttempts || tally[http.StatusTooManyRequests] != 40-maxAttempts {
		t.Fatalf("expected exactly %d evaluated codes and the rest locked, got %v", maxAttempts, tally)
	}

	recovery := newTestServer(t)
	recovery.newUser("editor@example.com", true)
	pending = recovery.pending("editor@example.com")
	tally = parallel(40, func() *httptest.ResponseRecorder {
		return recovery.post("/login/recovery", "", `{"pending":"`+pending+`","code":"AAAAA-BBBBB"}`)
	})
	if tally[http.StatusUnauthorized] != maxAttempts || tally[http.StatusTooManyRequests] != 40-maxAttempts {
		t.Fatalf("expected exactly %d evaluated recovery codes and the rest locked, got %v", maxAttempts, tally)
	}
}

func TestProxyHeadersThatAreNotAddressesDoNotMintRateLimitBuckets(t *testing.T) {
	server := newTestServer(t)
	server.extension.config.TrustProxy = true
	server.newUser("editor@example.com", false)
	guess := func(header, value string) int {
		request := httptest.NewRequest(http.MethodPost, "/api/vega-auth/login/password", strings.NewReader(`{"email":"editor@example.com","password":"wrong"}`))
		request.RemoteAddr = testIP + ":1234"
		request.Header.Set("content-type", "application/json")
		request.Header.Set(header, value)
		response := httptest.NewRecorder()
		server.mux.ServeHTTP(response, request)
		return response.Code
	}
	for i := 0; i < maxAttempts; i++ {
		header := "X-Real-Ip"
		if i%2 == 1 {
			header = "X-Forwarded-For"
		}
		if code := guess(header, fmt.Sprintf("made-up-%d", i)); code != http.StatusUnauthorized {
			t.Fatalf("guess %d: %d", i+1, code)
		}
	}
	if code := guess("X-Real-Ip", "another-made-up-value"); code != http.StatusTooManyRequests {
		t.Fatalf("made-up header values must all count against the real address: %d", code)
	}
	// A real address from the proxy is still honoured, in canonical form.
	if code := guess("X-Forwarded-For", "garbage, 2001:DB8::1"); code != http.StatusUnauthorized {
		t.Fatalf("a valid forwarded address is its own bucket: %d", code)
	}
	if _, err := server.app.FindFirstRecordByFilter(attemptsCollection, "ip = '2001:db8::1'"); err != nil {
		t.Fatalf("the forwarded address must be stored in canonical form: %v", err)
	}
}

func TestTheLockKeepsEscalatingAfterALockAsLongAsTheWindow(t *testing.T) {
	server := newTestServer(t)
	server.newUser("editor@example.com", false)
	identity := loginIdentity("editor@example.com")
	// The state right after the third lock (15 minutes, as long as the window) has run out: the
	// last attempt is older than the window, the lock ended ten seconds ago.
	collection, err := server.app.FindCollectionByNameOrId(attemptsCollection)
	if err != nil {
		t.Fatal(err)
	}
	now := int(time.Now().Unix())
	row := core.NewRecord(collection)
	row.Set("identity", identity)
	row.Set("ip", testIP)
	row.Set("attempts", maxAttempts+2)
	row.Set("updated_at", now-3*lockBase-10)
	row.Set("locked_until", now-10)
	if err := server.app.Save(row); err != nil {
		t.Fatal(err)
	}
	// The existing lock check must not throw the history away either.
	if wait := server.extension.loginLockRemaining(server.app, identity, testIP); wait != 0 {
		t.Fatalf("the lock has expired: %d", wait)
	}
	if guess := server.post("/login/password", "", `{"email":"editor@example.com","password":"wrong"}`); guess.Code != http.StatusUnauthorized {
		t.Fatalf("one guess is allowed once the lock expires: %d", guess.Code)
	}
	wait := server.extension.loginLockRemaining(server.app, identity, testIP)
	if wait <= 3*lockBase {
		t.Fatalf("the next lock must be longer than the previous 15 minutes, got %d seconds", wait)
	}

	// Failures that are really old (no recent lock either) still start over.
	old, err := server.app.FindFirstRecordByFilter(attemptsCollection, "identity = {:identity}", map[string]any{"identity": identity})
	if err != nil {
		t.Fatal(err)
	}
	old.Set("updated_at", now-2*attemptWindow)
	old.Set("locked_until", now-attemptWindow-10)
	if err := server.app.Save(old); err != nil {
		t.Fatal(err)
	}
	if guess := server.post("/login/password", "", `{"email":"editor@example.com","password":"wrong"}`); guess.Code != http.StatusUnauthorized {
		t.Fatalf("an old history must not lock: %d", guess.Code)
	}
	if wait := server.extension.loginLockRemaining(server.app, identity, testIP); wait != 0 {
		t.Fatalf("a stale history must start over at one attempt, got a %d second lock", wait)
	}
}

func TestSuccessfulLoginsDoNotConsumeTheAttemptBudget(t *testing.T) {
	server := newTestServer(t)
	server.newUser("editor@example.com", true)
	// More full logins than maxAttempts: neither the password step nor the code may leave a
	// counted attempt behind. Codes are single-use, so the stored step is rewound between logins
	// to let the current code be accepted again.
	for i := 0; i < maxAttempts+2; i++ {
		pending := server.pending("editor@example.com")
		login := server.post("/login/totp", "", `{"pending":"`+pending+`","code":"`+totpCode(t, testTOTPSecret, 0)+`"}`)
		if login.Code != http.StatusOK {
			t.Fatalf("login %d failed: %d %s", i+1, login.Code, errorCode(login))
		}
		if _, err := server.app.DB().NewQuery("UPDATE vega_editors SET totp_last_step = 0").Execute(); err != nil {
			t.Fatal(err)
		}
	}
	if wait := server.extension.loginLockRemaining(server.app, loginIdentity("editor@example.com"), testIP); wait != 0 {
		t.Fatalf("successful logins must not lock the account, got %d seconds", wait)
	}
}
