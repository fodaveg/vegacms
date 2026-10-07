package vegapreview

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// Opt-in LOCAL fixture, invoked as a compiled test binary by the network harness.
// Credentials stay in a mode0600 readiness file; no token/URL payload is printed.
func TestL9NetworkServer(t *testing.T) {
	ready := os.Getenv("L9_PB_READY_FILE")
	siteOrigin := os.Getenv("L9_SITE_ORIGIN")
	if ready == "" || siteOrigin == "" {
		t.Skip("local network measurement fixture only")
	}
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal("fixture bootstrap failed")
	}
	defer app.Cleanup()
	collection, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		t.Fatal("fixture auth collection unavailable")
	}
	admin := core.NewRecord(collection)
	admin.SetEmail("network-admin@vega.test")
	admin.SetPassword("network-superuser-fixture-password")
	if err := app.Save(admin); err != nil {
		t.Fatal("fixture superuser creation failed")
	}
	extension, err := New(Config{SiteOrigin: siteOrigin, SigningSecret: testSecret, AuthCollections: []string{"vega_editors"}, RecordCollections: []string{"pages"}, TokenTTL: 30 * time.Second})
	if err != nil {
		t.Fatal("preview fixture configuration failed")
	}
	routes, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal("fixture routing failed")
	}
	// Match apis.Serve's real browser CORS middleware; NewRouter alone omits it.
	routes.Bind(apis.CORS(apis.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{http.MethodGet, http.MethodHead, http.MethodPut, http.MethodPatch, http.MethodPost, http.MethodDelete},
	}))
	routes.GET("/api/vega/discovery", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]any{
			"protocolVersion": 1, "project": map[string]any{"key": "default", "name": "Network measurement"},
			"auth":         map[string]any{"collection": "vega_editors", "apiBasePath": nil},
			"manifest":     map[string]any{"collection": "vega", "key": "default", "schemaVersion": 1},
			"siteSettings": nil, "preview": map[string]any{"apiBasePath": "/api/vega-preview", "visualEditing": true}, "blockTypes": []string{"hero"},
		})
	})
	extension.RegisterRoutes(&core.ServeEvent{App: app, Router: routes})
	mux, err := routes.BuildMux()
	if err != nil {
		t.Fatal("fixture mux failed")
	}
	server := httptest.NewServer(mux)
	defer server.Close()
	body, err := json.Marshal(map[string]string{"url": server.URL, "adminEmail": "network-admin@vega.test", "adminPassword": "network-superuser-fixture-password", "fixture": "l9-local-only"})
	if err != nil {
		t.Fatal("fixture readiness failed")
	}
	if err := os.WriteFile(ready, body, 0600); err != nil {
		t.Fatal("fixture readiness unavailable")
	}
	defer os.Remove(ready)
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Scan() // parent sends stop or closes stdin; all fixture resources then close
}
