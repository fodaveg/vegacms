package vegaauth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTheRecordsAPICannotSwitchOffTheSecondFactor(t *testing.T) {
	server := newTestServer(t)
	// A deployment whose editors may edit their own record through the standard API.
	collection, err := server.app.FindCollectionByNameOrId("vega_editors")
	if err != nil {
		t.Fatal(err)
	}
	own := "id = @request.auth.id"
	collection.UpdateRule = &own
	if err := server.app.Save(collection); err != nil {
		t.Fatal(err)
	}
	user := server.newUser("editor@example.com", true)
	token := server.token(user)
	patch := func(body string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPatch, "/api/collections/vega_editors/records/"+user.Id, strings.NewReader(body))
		request.Header.Set("content-type", "application/json")
		request.Header.Set("Authorization", token)
		response := httptest.NewRecorder()
		server.mux.ServeHTTP(response, request)
		return response
	}

	if response := patch(`{"totp_enabled":false}`); response.Code != http.StatusBadRequest {
		t.Fatalf("switching TOTP off must be refused on the records API: %d", response.Code)
	}
	// PocketBase already drops hidden fields sent by non-superusers; whatever the status, the
	// stored values must not move.
	patch(`{"totp_secret":""}`)
	patch(`{"totp_last_step":0,"totp_pending_secret":"JBSWY3DPEHPK3PXQ"}`)
	fresh := server.reload(user)
	if !fresh.GetBool("totp_enabled") || fresh.GetString("totp_secret") != testTOTPSecret || fresh.GetString("totp_pending_secret") != "" {
		t.Fatal("the second factor was changed through the records API")
	}
	if response := patch(`{"emailVisibility":true}`); response.Code != http.StatusOK {
		t.Fatalf("an ordinary profile update must still work: %d %s", response.Code, response.Body.String())
	}
}
