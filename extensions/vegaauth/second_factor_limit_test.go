package vegaauth

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// postFrom exercises the real route with a distinct connection address, without proxy headers.
func (s *testServer) postFrom(ip, path, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, "/api/vega-auth"+path, strings.NewReader(body))
	request.RemoteAddr = ip + ":1234"
	request.Header.Set("content-type", "application/json")
	response := httptest.NewRecorder()
	s.mux.ServeHTTP(response, request)
	return response
}

// pendingFrom completes the password step from the IP that will submit the second factor.
func (s *testServer) pendingFrom(email, ip string) string {
	s.t.Helper()
	response := s.postFrom(ip, "/login/password", `{"email":"`+email+`","password":"`+testPassword+`"}`)
	var challenge struct {
		Pending string `json:"pending"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &challenge); err != nil || challenge.Pending == "" {
		s.t.Fatalf("missing pending challenge: %d %s", response.Code, response.Body.String())
	}
	return challenge.Pending
}

// reloadAttempt reads the persisted limit state after a request has changed it.
func (s *testServer) reloadAttempt(row *core.Record) *core.Record {
	s.t.Helper()
	fresh, err := s.app.FindRecordById(attemptsCollection, row.Id)
	if err != nil {
		s.t.Fatal(err)
	}
	return fresh
}

func TestSecondFactorAccountLimitIsSharedAcrossIPsAndMethods(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	for i := 0; i < maxAttempts; i++ {
		ip := fmt.Sprintf("198.51.100.%d", i+1)
		pending := server.pendingFrom(user.Email(), ip)
		path := "/login/totp"
		if i%2 == 1 {
			path = "/login/recovery"
		}
		guess := server.postFrom(ip, path, `{"pending":"`+pending+`","code":"wrong"}`)
		if guess.Code != http.StatusUnauthorized {
			t.Fatalf("guess %d must be evaluated: %d", i+1, guess.Code)
		}
	}
	account, err := server.app.FindFirstRecordByFilter(attemptsCollection, "identity = {:identity} && ip = {:ip}", dbx.Params{
		"identity": secondFactorIdentity(user.Id), "ip": secondFactorAccountIP,
	})
	if err != nil {
		t.Fatal(err)
	}
	lockedUntil := account.GetInt("locked_until")
	updatedAt := account.GetInt("updated_at")
	for _, path := range []string{"/login/totp", "/login/recovery"} {
		// A correct password and a fresh IP/challenge cannot reset the account budget.
		ip := "198.51.100.100"
		pending := server.pendingFrom(user.Email(), ip)
		guess := server.postFrom(ip, path, `{"pending":"`+pending+`","code":"wrong"}`)
		if guess.Code != http.StatusTooManyRequests || errorCode(guess) != "locked" {
			t.Fatalf("the sixth distributed guess must be refused on %s: %d", path, guess.Code)
		}
	}
	account = server.reloadAttempt(account)
	if account.GetInt("attempts") != maxAttempts || account.GetInt("locked_until") != lockedUntil || account.GetInt("updated_at") != updatedAt {
		t.Fatal("refused guesses must neither consume the budget nor prolong the account lock")
	}
	other := server.newUser("other@example.com", true)
	pending := server.pendingFrom(other.Email(), "198.51.100.100")
	if login := server.postFrom("198.51.100.100", "/login/totp", `{"pending":"`+pending+`","code":"`+totpCode(t, testTOTPSecret, 0)+`"}`); login.Code != http.StatusOK {
		t.Fatalf("another account must still be able to log in: %d", login.Code)
	}
}

func TestParallelSecondFactorGuessesAcrossIPsHaveOneAccountBudget(t *testing.T) {
	server := newTestServer(t)
	// PocketBase 0.39.9 lazily initializes route middleware on the first request. Warm each
	// route before the burst without spending any account's second-factor budget.
	for _, path := range []string{"/login/totp", "/login/recovery"} {
		if warmup := server.post(path, "", `{}`); warmup.Code != http.StatusUnauthorized {
			t.Fatalf("route warmup failed: %d", warmup.Code)
		}
	}
	user := server.newUser("editor@example.com", true)
	const guesses = 40
	pending := make([]string, guesses)
	ips := make([]string, guesses)
	for i := range pending {
		ips[i] = fmt.Sprintf("198.51.100.%d", i+1)
		var err error
		pending[i], err = server.extension.newPending(user.Id, loginIdentity(user.Email()), ips[i])
		if err != nil {
			t.Fatal(err)
		}
	}
	var index atomic.Int32
	tally := parallel(guesses, func() *httptest.ResponseRecorder {
		i := int(index.Add(1)) - 1
		path := "/login/totp"
		if i%2 == 1 {
			path = "/login/recovery"
		}
		return server.postFrom(ips[i], path, `{"pending":"`+pending[i]+`","code":"wrong"}`)
	})
	if tally[http.StatusUnauthorized] != maxAttempts || tally[http.StatusTooManyRequests] != guesses-maxAttempts {
		t.Fatalf("expected exactly %d evaluated codes across IPs and methods, got %v", maxAttempts, tally)
	}
}

func TestSecondFactorIPLockDoesNotConsumeTheAccountBudget(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	pending := server.pending(user.Email())
	for i := 0; i < maxAttempts; i++ {
		server.post("/login/password", "", `{"email":"editor@example.com","password":"wrong"}`)
	}
	guess := server.post("/login/totp", "", `{"pending":"`+pending+`","code":"wrong"}`)
	if guess.Code != http.StatusTooManyRequests {
		t.Fatalf("the existing identity+IP lock must still apply: %d", guess.Code)
	}
	if _, err := server.app.FindFirstRecordByFilter(attemptsCollection, "identity = {:identity}", dbx.Params{"identity": secondFactorIdentity(user.Id)}); err == nil {
		t.Fatal("the account reservation must be rolled back when the IP is already locked")
	}
}

func TestExpiredSecondFactorChallengeDoesNotConsumeTheAccountBudget(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	pending := server.pending(user.Email())
	server.extension.pendingMu.Lock()
	entry := server.extension.pending[pending]
	entry.expires = time.Now().Add(-time.Second)
	server.extension.pending[pending] = entry
	server.extension.pendingMu.Unlock()
	for _, path := range []string{"/login/totp", "/login/recovery"} {
		guess := server.post(path, "", `{"pending":"`+pending+`","code":"wrong"}`)
		if guess.Code != http.StatusUnauthorized || errorCode(guess) != "pending_expired" {
			t.Fatalf("an expired challenge must stay expired on %s: %d", path, guess.Code)
		}
	}
	if _, err := server.app.FindFirstRecordByFilter(attemptsCollection, "identity = {:identity}", dbx.Params{"identity": secondFactorIdentity(user.Id)}); err == nil {
		t.Fatal("an expired challenge must not spend the account budget")
	}
}

func TestSecondFactorAccountLockExpiresAndEscalates(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	collection, err := server.app.FindCollectionByNameOrId(attemptsCollection)
	if err != nil {
		t.Fatal(err)
	}
	now := int(time.Now().Unix())
	account := core.NewRecord(collection)
	account.Set("identity", secondFactorIdentity(user.Id))
	account.Set("ip", secondFactorAccountIP)
	account.Set("attempts", maxAttempts)
	account.Set("updated_at", now-lockBase-1)
	account.Set("locked_until", now-1)
	if err := server.app.Save(account); err != nil {
		t.Fatal(err)
	}
	pending := server.pending(user.Email())
	guess := server.post("/login/totp", "", `{"pending":"`+pending+`","code":"wrong"}`)
	if guess.Code != http.StatusUnauthorized {
		t.Fatalf("an expired lock must allow another evaluated guess: %d", guess.Code)
	}
	account = server.reloadAttempt(account)
	if account.GetInt("attempts") != maxAttempts+1 || account.GetInt("locked_until") < now+2*lockBase {
		t.Fatal("a new failure after the first lock must escalate it to ten minutes")
	}
	// Once both the lock and its history are old, the normal five-attempt budget returns.
	account.Set("updated_at", now-2*attemptWindow)
	account.Set("locked_until", now-attemptWindow-1)
	if err := server.app.Save(account); err != nil {
		t.Fatal(err)
	}
	guess = server.post("/login/recovery", "", `{"pending":"`+pending+`","code":"wrong"}`)
	if guess.Code != http.StatusUnauthorized {
		t.Fatalf("stale account history must allow a recovery guess: %d", guess.Code)
	}
	account = server.reloadAttempt(account)
	if account.GetInt("attempts") != 1 || account.GetInt("locked_until") > now {
		t.Fatal("stale account history must restart at one attempt without a lock")
	}
}

func TestSuccessfulSecondFactorLoginClearsTheAccountBudget(t *testing.T) {
	for _, path := range []string{"/login/totp", "/login/recovery"} {
		t.Run(path, func(t *testing.T) {
			server := newTestServer(t)
			user := server.newUser("editor@example.com", true)
			code := totpCode(t, testTOTPSecret, 0)
			if path == "/login/recovery" {
				codes, err := server.extension.generateRecoveryCodes(server.app, user.Id)
				if err != nil {
					t.Fatal(err)
				}
				code = codes[0]
			}
			for i := 0; i < maxAttempts-1; i++ {
				ip := fmt.Sprintf("198.51.100.%d", i+1)
				pending := server.pendingFrom(user.Email(), ip)
				if guess := server.postFrom(ip, "/login/totp", `{"pending":"`+pending+`","code":"wrong"}`); guess.Code != http.StatusUnauthorized {
					t.Fatalf("failure %d: %d", i+1, guess.Code)
				}
			}
			pending := server.pending(user.Email())
			login := server.post(path, "", `{"pending":"`+pending+`","code":"`+code+`"}`)
			if login.Code != http.StatusOK {
				t.Fatalf("a correct fifth code must log in: %d", login.Code)
			}
			if _, err := server.app.FindFirstRecordByFilter(attemptsCollection, "identity = {:identity}", dbx.Params{"identity": secondFactorIdentity(user.Id)}); err == nil {
				t.Fatal("successful TOTP or recovery must clear the account budget")
			}
			if server.extension.loginLockRemaining(server.app, loginIdentity(user.Email()), testIP) != 0 {
				t.Fatal("successful second-factor login must also clear its IP budget")
			}
			if !server.extension.hasRecentProof(sessionKey(tokenOf(t, login))) {
				t.Fatal("the successful login must preserve proof of possession for factor recovery")
			}
		})
	}
}

// assertLockedPair checks that a failed paired write left both fifth-attempt reservations intact.
func (s *testServer) assertLockedPair(user *core.Record) {
	s.t.Helper()
	for _, bucket := range []struct{ identity, ip string }{
		{loginIdentity(user.Email()), testIP},
		{secondFactorIdentity(user.Id), secondFactorAccountIP},
	} {
		row, err := s.app.FindFirstRecordByFilter(attemptsCollection, "identity = {:identity} && ip = {:ip}", dbx.Params{
			"identity": bucket.identity, "ip": bucket.ip,
		})
		if err != nil {
			s.t.Fatalf("paired rollback must preserve the %s bucket: %v", bucket.ip, err)
		}
		if row.GetInt("attempts") != maxAttempts || row.GetInt("locked_until") <= int(time.Now().Unix()) {
			s.t.Fatalf("paired rollback must preserve the fifth-attempt lock for %s", bucket.ip)
		}
	}
}

func TestSecondFactorResetRollsBackBothBucketsWhenAccountDeleteFails(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	pending := server.pending(user.Email())
	for i := 0; i < maxAttempts-1; i++ {
		if guess := server.post("/login/totp", "", `{"pending":"`+pending+`","code":"wrong"}`); guess.Code != http.StatusUnauthorized {
			t.Fatalf("failure %d: %d", i+1, guess.Code)
		}
	}
	accountDeletes := 0
	server.app.OnRecordDelete(attemptsCollection).BindFunc(func(event *core.RecordEvent) error {
		if event.Record.GetString("ip") == secondFactorAccountIP {
			accountDeletes++
			return errors.New("account counter delete unavailable")
		}
		return event.Next()
	})
	login := server.post("/login/totp", "", `{"pending":"`+pending+`","code":"`+totpCode(t, testTOTPSecret, 0)+`"}`)
	if login.Code != http.StatusOK || accountDeletes != 1 {
		t.Fatalf("a successful login keeps its response despite counter reset failure: %d, deletes=%d", login.Code, accountDeletes)
	}
	server.assertLockedPair(user)
}

func TestSecondFactorReleaseRollsBackBothBucketsWhenAccountUpdateFails(t *testing.T) {
	server := newTestServer(t)
	user := server.newUser("editor@example.com", true)
	pending := server.pending(user.Email())
	for i := 0; i < maxAttempts-1; i++ {
		if guess := server.post("/login/totp", "", `{"pending":"`+pending+`","code":"wrong"}`); guess.Code != http.StatusUnauthorized {
			t.Fatalf("failure %d: %d", i+1, guess.Code)
		}
	}
	// TOTP claims use a conditional SQL UPDATE, bypassing record hooks. Force that write to
	// fail, then reject only the account bucket's release (the second paired UPDATE).
	if _, err := server.app.DB().NewQuery(`CREATE TRIGGER fail_totp_claim BEFORE UPDATE OF totp_last_step ON vega_editors
		BEGIN SELECT RAISE(ABORT, 'totp claim unavailable'); END`).Execute(); err != nil {
		t.Fatal(err)
	}
	accountUpdates := 0
	server.app.OnRecordUpdate(attemptsCollection).BindFunc(func(event *core.RecordEvent) error {
		if event.Record.GetString("ip") == secondFactorAccountIP && event.Record.GetInt("attempts") == maxAttempts-1 {
			accountUpdates++
			return errors.New("account counter update unavailable")
		}
		return event.Next()
	})
	login := server.post("/login/totp", "", `{"pending":"`+pending+`","code":"`+totpCode(t, testTOTPSecret, 0)+`"}`)
	if login.Code != http.StatusInternalServerError || errorCode(login) != "verify_failed" || accountUpdates != 1 {
		t.Fatalf("verification failure keeps its response: %d %s, updates=%d", login.Code, errorCode(login), accountUpdates)
	}
	server.assertLockedPair(user)
}

func TestSecondFactorFirstWriteFailurePreservesBothBuckets(t *testing.T) {
	for _, operation := range []string{"release", "reset"} {
		t.Run(operation, func(t *testing.T) {
			server := newTestServer(t)
			user := server.newUser("editor@example.com", true)
			pending := pendingEntry{userID: user.Id, identity: loginIdentity(user.Email()), ip: testIP}
			for i := 0; i < maxAttempts; i++ {
				if wait, err := server.extension.reserveSecondFactorAttempt(server.app, pending, testIP); err != nil || wait != 0 {
					t.Fatalf("reserve %d: wait=%d, err=%v", i+1, wait, err)
				}
			}
			failIP := func(event *core.RecordEvent) error {
				if event.Record.GetString("ip") == testIP {
					return errors.New("IP counter write unavailable")
				}
				return event.Next()
			}
			if operation == "reset" {
				server.app.OnRecordDelete(attemptsCollection).BindFunc(failIP)
				server.extension.resetSecondFactorAttempts(server.app, pending, testIP)
			} else {
				server.app.OnRecordUpdate(attemptsCollection).BindFunc(failIP)
				server.extension.releaseSecondFactorAttempt(server.app, pending, testIP)
			}
			server.assertLockedPair(user)
		})
	}
}
