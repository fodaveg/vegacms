package vegapreview

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// shareAstroResult projects the real HTTP consumer's checks without returning secrets or HTML.
type shareAstroResult struct {
	Ready          bool    `json:"ready"`
	Status         int     `json:"status"`
	Headers        bool    `json:"headers"`
	Robots         bool    `json:"robots"`
	PrivateHTML    bool    `json:"privateHtml"`
	Contains       *bool   `json:"contains"`
	NotFoundDigest *string `json:"notFoundDigest"`
}

// startShareAstro starts the opt-in Node 22 consumer using stdin for credentials, never argv.
// EOF/close lets the harness remove its temporary Astro copy before the fixture is closed.
func startShareAstro(t *testing.T, script, backend, loaderToken string) func(string, string) shareAstroResult {
	t.Helper()
	if !filepath.IsAbs(script) {
		t.Fatal("VEGA_ASTRO_SHARE_HARNESS must be an absolute path")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	t.Cleanup(cancel)
	command := exec.CommandContext(ctx, "node", script)
	command.Dir = filepath.Dir(filepath.Dir(script))
	command.Stderr = io.Discard
	command.WaitDelay = 5 * time.Second
	stdin, err := command.StdinPipe()
	if err != nil {
		t.Fatal("could not open Astro harness input")
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		t.Fatal("could not open Astro harness output")
	}
	if err := command.Start(); err != nil {
		t.Fatal("could not start Astro harness; Node 22 and existing Astro dependencies are required")
	}
	encoder, decoder := json.NewEncoder(stdin), json.NewDecoder(stdout)
	t.Cleanup(func() {
		_ = encoder.Encode(map[string]bool{"close": true})
		_ = stdin.Close()
		if err := command.Wait(); err != nil {
			t.Error("Astro harness did not close cleanly")
		}
	})
	if err := encoder.Encode(map[string]string{
		"pocketbaseUrl": backend, "secret": testSecret, "loaderToken": loaderToken,
	}); err != nil {
		t.Fatal("could not configure Astro harness")
	}
	var ready shareAstroResult
	if err := decoder.Decode(&ready); err != nil || !ready.Ready {
		t.Fatal("Astro harness did not become ready")
	}
	return func(token, contains string) shareAstroResult {
		t.Helper()
		if err := encoder.Encode(map[string]string{"token": token, "contains": contains}); err != nil {
			t.Fatal("could not send Astro visit")
		}
		var result shareAstroResult
		if err := decoder.Decode(&result); err != nil {
			t.Fatal("Astro visit did not return its HTTP checks")
		}
		return result
	}
}

// shareAstroManagement exercises authenticated management over the same real HTTP server
// Astro uses. It never includes the response body or the share URL in a failure message.
func shareAstroManagement(t *testing.T, backend, path, session string, body any, status int) *http.Response {
	t.Helper()
	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatal("could not encode share management request")
	}
	request, err := http.NewRequest(http.MethodPost, backend+sharePath+path, bytes.NewReader(payload))
	if err != nil {
		t.Fatal("could not construct share management request")
	}
	request.Header.Set("Authorization", session)
	request.Header.Set("Content-Type", "application/json")
	response, err := (&http.Client{Timeout: 10 * time.Second}).Do(request)
	if err != nil {
		t.Fatal("share management HTTP request failed")
	}
	if response.StatusCode != status {
		response.Body.Close()
		t.Fatalf("share management status: got %d, want %d", response.StatusCode, status)
	}
	return response
}

// TestShareAstroHTTPConsumer connects the real Go extension, PocketBase record API and Astro
// recipe/helper/renderer. It is opt-in so the ordinary Go suite needs no other repository.
func TestShareAstroHTTPConsumer(t *testing.T) {
	script := os.Getenv("VEGA_ASTRO_SHARE_HARNESS")
	if script == "" {
		t.Skip("set VEGA_ASTRO_SHARE_HARNESS to the Astro HTTP harness for the cross-runtime test")
	}
	fixture := newShareFixture(t)
	pages, err := fixture.app.FindCollectionByNameOrId("pages")
	if err != nil {
		t.Fatal(err)
	}
	pages.Fields.Add(&core.TextField{Name: "path"})
	if err := fixture.app.Save(pages); err != nil {
		t.Fatal(err)
	}
	page, err := fixture.app.FindRecordById("pages", fixture.pageA)
	if err != nil {
		t.Fatal(err)
	}
	page.Set("path", "/shared-draft")
	if err := fixture.app.Save(page); err != nil {
		t.Fatal(err)
	}
	blocks := core.NewBaseCollection("blocks")
	blocks.Fields.Add(
		&core.RelationField{Name: "parent", CollectionId: pages.Id, MaxSelect: 1},
		&core.TextField{Name: "type"},
		&core.JSONField{Name: "data"},
		&core.NumberField{Name: "order"},
	)
	if err := fixture.app.Save(blocks); err != nil {
		t.Fatal(err)
	}
	block := core.NewRecord(blocks)
	block.Set("parent", page.Id)
	block.Set("type", "hero")
	block.Set("order", 1)
	block.Set("data", map[string]string{"title": "Shared content A"})
	if err := fixture.app.Save(block); err != nil {
		t.Fatal(err)
	}

	var clockMu sync.RWMutex
	now := time.Now().UTC()
	fixture.extension.config.Clock = func() time.Time {
		clockMu.RLock()
		defer clockMu.RUnlock()
		return now
	}
	var requests sync.RWMutex
	var resolutions, recordLoads atomic.Int64
	backend := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requests.RLock()
		defer requests.RUnlock()
		if request.URL.Path == sharePath+"/resolve" {
			resolutions.Add(1)
		}
		if strings.HasPrefix(request.URL.Path, "/api/collections/") && strings.Contains(request.URL.Path, "/records") {
			recordLoads.Add(1)
		}
		fixture.mux.ServeHTTP(response, request)
	}))
	t.Cleanup(backend.Close)
	visit := startShareAstro(t, script, backend.URL, fixture.superuser)
	create := func() (string, string) {
		t.Helper()
		response := shareAstroManagement(t, backend.URL, "", fixture.editorA, map[string]any{
			"collection": "pages", "id": page.Id, "ttlSeconds": 300,
		}, http.StatusCreated)
		defer response.Body.Close()
		var link shareCreateResponse
		if err := json.NewDecoder(response.Body).Decode(&link); err != nil {
			t.Fatal("could not decode created share link")
		}
		parsed, err := url.Parse(link.URL)
		if err != nil || link.ID == "" || !strings.HasPrefix(parsed.Path, "/preview-share/") {
			t.Fatal("created share link has an invalid shape")
		}
		return link.ID, strings.TrimPrefix(parsed.Path, "/preview-share/")
	}
	var notFoundDigest string
	check := func(token, content string, status int) {
		t.Helper()
		beforeResolve, beforeLoads := resolutions.Load(), recordLoads.Load()
		result := visit(token, content)
		if result.Status != status || !result.Headers || !result.Robots || !result.PrivateHTML {
			t.Fatalf("Astro response failed status/privacy checks: status=%d headers=%v robots=%v privateHTML=%v", result.Status, result.Headers, result.Robots, result.PrivateHTML)
		}
		if result.Contains == nil || *result.Contains != (status == http.StatusOK) {
			t.Fatal("Astro response did not contain exactly the expected saved content")
		}
		if resolutions.Load() != beforeResolve+1 {
			t.Fatal("each Astro visit must resolve exactly once through the Go extension")
		}
		if status == http.StatusOK && recordLoads.Load() <= beforeLoads {
			t.Fatal("a valid share must load its saved record from the real PocketBase API")
		}
		if status != http.StatusOK && recordLoads.Load() != beforeLoads {
			t.Fatal("a refused share must not load any content record")
		}
		if status == http.StatusNotFound {
			if result.NotFoundDigest == nil || len(*result.NotFoundDigest) != 64 {
				t.Fatal("Astro must report a body digest for refused shares")
			}
			if notFoundDigest == "" {
				notFoundDigest = *result.NotFoundDigest
			} else if *result.NotFoundDigest != notFoundDigest {
				t.Fatal("every refused share must return the same 404 HTML")
			}
		} else if result.NotFoundDigest != nil {
			t.Fatal("the harness must not return a digest of private content")
		}
	}

	linkID, token := create()
	check(token, "Shared content A", http.StatusOK)
	block.Set("data", map[string]string{"title": "Shared content B"})
	if err := fixture.app.Save(block); err != nil {
		t.Fatal(err)
	}
	check(token, "Shared content B", http.StatusOK)
	response := shareAstroManagement(t, backend.URL, "/revoke", fixture.editorA, map[string]string{
		"collection": "pages", "id": page.Id, "linkId": linkID,
	}, http.StatusNoContent)
	response.Body.Close()
	check(token, "Shared content B", http.StatusNotFound)

	_, expired := create()
	clockMu.Lock()
	now = now.Add(301 * time.Second)
	clockMu.Unlock()
	check(expired, "Shared content B", http.StatusNotFound)
	_, unlisted := create()
	requests.Lock()
	fixture.extension.config.RecordCollections = []string{"notes"}
	requests.Unlock()
	check(unlisted, "Shared content B", http.StatusNotFound)
	requests.Lock()
	fixture.extension.config.RecordCollections = []string{"pages"}
	requests.Unlock()
	_, deleted := create()
	if err := fixture.app.Delete(page); err != nil {
		t.Fatal(err)
	}
	check(deleted, "Shared content B", http.StatusNotFound)
	check("not-a-share-token", "Shared content B", http.StatusNotFound)
	check("s1.000000000000000."+strings.Repeat("A", 43), "Shared content B", http.StatusNotFound)
}
