package vegaauth

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
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
