package vegabuild

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// defaultWebhookTimeout bounds how long WebhookRunner waits for the webhook call itself to
// complete (NOT how long the triggered build takes — that is reported later through /callback).
// Kept short on purpose: Start runs synchronously inside the /trigger request (see its docstring),
// so this is also how long an editor's "Publish" click can sit waiting on this one HTTP call.
const defaultWebhookTimeout = 15 * time.Second

// WebhookConfig configures a WebhookRunner: Opción B of the integration doc, a server-to-server
// dispatch against a deploy/CI webhook (a GitHub Actions `workflow_dispatch`, a Netlify/Vercel
// deploy hook...).
type WebhookConfig struct {
	// URL is the real webhook endpoint. It is a SECRET: whoever has it can trigger a build without
	// ever touching PocketBase, which is exactly why Vega's own discovery document never carries
	// it (see the package doc and docs/PROJECT-CONTRACT-v1.md). It is required.
	URL string
	// Method defaults to POST.
	Method string
	// Headers are sent verbatim (e.g. an API token for the CI provider).
	Headers map[string]string
	// Body is sent verbatim as the request body; empty means no body at all.
	Body string
	// ContentType defaults to "application/json" whenever Body is non-empty.
	ContentType string
	// Timeout bounds the webhook HTTP call itself. Default 15s.
	Timeout time.Duration
	// Client lets a caller inject their own *http.Client (proxies, custom TLS...); defaults to one
	// scoped to Timeout.
	Client *http.Client
	// LogURL, if set, is recorded as the run's log URL as soon as Start succeeds (a fixed CI job
	// list page, say) — WebhookRunner has no way to learn a per-run log URL synchronously.
	LogURL string
}

func (c WebhookConfig) normalized() (WebhookConfig, error) {
	c.URL = strings.TrimSpace(c.URL)
	if c.URL == "" {
		return c, fmt.Errorf("vegabuild: WebhookConfig.URL is required")
	}
	if c.Method == "" {
		c.Method = http.MethodPost
	}
	if c.ContentType == "" && c.Body != "" {
		c.ContentType = "application/json"
	}
	if c.Timeout <= 0 {
		c.Timeout = defaultWebhookTimeout
	}
	if c.Client == nil {
		c.Client = &http.Client{Timeout: c.Timeout}
	}
	return c, nil
}

// WebhookRunner triggers a build by calling a secret webhook and does NOT complete its own runs:
// Completes() is false, so New requires a CallbackSecret and the run stays "running" until the CI
// system posts back to POST /callback.
type WebhookRunner struct {
	config WebhookConfig
}

// NewWebhookRunner validates config and returns a ready WebhookRunner.
func NewWebhookRunner(config WebhookConfig) (*WebhookRunner, error) {
	config, err := config.normalized()
	if err != nil {
		return nil, err
	}
	return &WebhookRunner{config: config}, nil
}

// Completes always returns false: only POST /callback (or a manual close) can end a run started
// this way.
func (r *WebhookRunner) Completes() bool { return false }

// Start calls the configured webhook once, synchronously, and returns as soon as it gets a
// response — it never itself waits for the triggered build to finish.
//
// This is SYNCHRONOUS on purpose, not a shortcut: making it fire-and-forget would mean /trigger
// always answers 202 even when the webhook call itself fails outright (a typo'd URL, the CI
// provider down, an expired token), and an editor's "Publish" button would show "Publishing…"
// forever for a build that never started at all. An honest 502 right there, within Timeout, is
// worth more than a 202 that lies. Timeout is kept short (15s default) precisely because it is on
// this synchronous path — see WebhookConfig.Timeout.
//
// The error returned for anything other than a 2xx response (or for the call failing outright)
// NEVER includes the URL, headers or body: that error message is surfaced to editors in Vega's own
// UI, and URL/headers/body are exactly the credential this Runner exists to keep away from Vega.
// Only the HTTP status code (or a generic "request failed") is safe to expose.
func (r *WebhookRunner) Start(ctx context.Context, _ string, _ func(Result)) (Handoff, error) {
	requestCtx, cancel := context.WithTimeout(ctx, r.config.Timeout)
	defer cancel()

	var body io.Reader
	if r.config.Body != "" {
		body = strings.NewReader(r.config.Body)
	}
	request, err := http.NewRequestWithContext(requestCtx, r.config.Method, r.config.URL, body)
	if err != nil {
		return Handoff{}, fmt.Errorf("vegabuild: build webhook request could not be constructed")
	}
	if r.config.ContentType != "" {
		request.Header.Set("Content-Type", r.config.ContentType)
	}
	for key, value := range r.config.Headers {
		request.Header.Set(key, value)
	}

	response, err := r.config.Client.Do(request)
	if err != nil {
		return Handoff{}, fmt.Errorf("vegabuild: build webhook request failed")
	}
	defer func() { _ = response.Body.Close() }()
	_, _ = io.Copy(io.Discard, response.Body)

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return Handoff{}, fmt.Errorf("vegabuild: build webhook responded with status %d", response.StatusCode)
	}

	return Handoff{LogURL: r.config.LogURL}, nil
}
