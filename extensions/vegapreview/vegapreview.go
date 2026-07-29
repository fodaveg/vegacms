// Package vegapreview implements the optional draft-preview token endpoint documented in
// `docs/PROJECT-CONTRACT-v1.md#preview-endpoint-optional`.
//
// Vega sends the same PocketBase editor token it already uses for content requests to POST
// /token. This extension verifies that the authenticated editor may view the requested record,
// then returns a short-lived URL whose signature is bound to that exact collection, record id,
// and expiry. The site serving that URL must verify the same signature before loading a draft.
package vegapreview

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
)

const (
	defaultRoutePrefix   = "/api/vega-preview"
	defaultPreviewPath   = "/preview"
	defaultTokenTTL      = 5 * time.Minute
	maxTokenTTL          = time.Hour
	minSecretBytes       = 32
	timestampLayout      = "2006-01-02T15:04:05.000Z"
	tokenVersion         = "v1"
	draftTokenVersion    = "v2"
	payloadDelimiter     = "\n"
	defaultMaxDraftBytes = 256 * 1024
	maxRequestOverhead   = 16 * 1024
	draftKeyLabel        = "vega-preview-draft-v2\naes-256-gcm"
)

// Config carries every deployment-specific value. SigningSecret is shared only with the site
// preview route; it must never appear in discovery, a browser bundle, or a generated preview URL.
type Config struct {
	// RoutePrefix is where POST /token is mounted. Default: "/api/vega-preview".
	RoutePrefix string
	// SiteOrigin is the absolute public origin that serves the preview route, for example
	// "https://example.com". It must not contain credentials, a path, query, or fragment.
	SiteOrigin string
	// PreviewPath is the site route below SiteOrigin. Default: "/preview".
	PreviewPath string
	// SigningSecret is the server-only HMAC secret shared with the preview route (minimum 32
	// bytes). It is deliberately independent from PocketBase's own token keys.
	SigningSecret string
	// AuthCollections restricts which PocketBase auth collections may mint preview URLs. Empty
	// accepts any authenticated record, mirroring extensions/vegabuild.
	AuthCollections []string
	// RecordCollections restricts which content collections the site knows how to preview. Empty
	// accepts any collection whose record the editor may view.
	RecordCollections []string
	// TokenTTL controls the signed URL lifetime. Default: five minutes; maximum: one hour.
	TokenTTL time.Duration
	// MaxDraftBytes limits the canonical JSON encrypted into a draft token. Default: 256 KiB.
	// Oversized drafts fail with 413 and are never partially encrypted.
	MaxDraftBytes int
	// Clock is injectable for deterministic tests; default: time.Now.
	Clock func() time.Time
	// RandomSource is injectable only for deterministic cross-language vectors; default:
	// crypto/rand.Reader.
	RandomSource io.Reader
}

func (c Config) normalized() (Config, error) {
	c.RoutePrefix = strings.TrimRight(strings.TrimSpace(c.RoutePrefix), "/")
	if c.RoutePrefix == "" {
		c.RoutePrefix = defaultRoutePrefix
	}
	if !strings.HasPrefix(c.RoutePrefix, "/api/") || strings.Contains(c.RoutePrefix, "//") {
		return c, fmt.Errorf("vegapreview: RoutePrefix must be a relative /api/... path")
	}

	c.PreviewPath = strings.TrimRight(strings.TrimSpace(c.PreviewPath), "/")
	if c.PreviewPath == "" {
		c.PreviewPath = defaultPreviewPath
	}
	if !strings.HasPrefix(c.PreviewPath, "/") || strings.Contains(c.PreviewPath, "//") ||
		strings.ContainsAny(c.PreviewPath, "?#") {
		return c, fmt.Errorf("vegapreview: PreviewPath must be a relative absolute path")
	}

	c.SiteOrigin = strings.TrimRight(strings.TrimSpace(c.SiteOrigin), "/")
	origin, err := url.Parse(c.SiteOrigin)
	if err != nil || (origin.Scheme != "http" && origin.Scheme != "https") || origin.Host == "" ||
		origin.User != nil || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" {
		return c, fmt.Errorf("vegapreview: SiteOrigin must be an absolute http(s) origin without a path")
	}

	if len([]byte(c.SigningSecret)) < minSecretBytes {
		return c, fmt.Errorf("vegapreview: SigningSecret must be at least %d bytes", minSecretBytes)
	}
	if c.TokenTTL == 0 {
		c.TokenTTL = defaultTokenTTL
	}
	if c.TokenTTL <= 0 {
		return c, fmt.Errorf("vegapreview: TokenTTL must be greater than zero")
	}
	if c.TokenTTL > maxTokenTTL {
		return c, fmt.Errorf(
			"vegapreview: TokenTTL %s exceeds maximum %s",
			c.TokenTTL,
			maxTokenTTL,
		)
	}
	if c.MaxDraftBytes == 0 {
		c.MaxDraftBytes = defaultMaxDraftBytes
	}
	if c.MaxDraftBytes <= 0 {
		return c, fmt.Errorf("vegapreview: MaxDraftBytes must be greater than zero")
	}
	if c.Clock == nil {
		c.Clock = time.Now
	}
	if c.RandomSource == nil {
		c.RandomSource = rand.Reader
	}
	return c, nil
}

// Extension is the installed preview-token endpoint. Construct it with New and register it from
// the same PocketBase OnServe hook used by vegabuild and vegaauth.
type Extension struct {
	config Config
}

// New validates config and returns a ready-to-register extension. Misconfigured signing or URL
// state fails closed at startup instead of emitting URLs the site cannot safely verify.
func New(config Config) (*Extension, error) {
	normalized, err := config.normalized()
	if err != nil {
		return nil, err
	}
	return &Extension{config: normalized}, nil
}

// RegisterRoutes installs POST {RoutePrefix}/token behind PocketBase's standard record-auth
// middleware. Vega sends Authorization: <token> with no Bearer prefix, exactly as for vegabuild.
func (x *Extension) RegisterRoutes(event *core.ServeEvent) {
	event.Router.POST(x.config.RoutePrefix+"/token", x.tokenHandler).
		Bind(apis.RequireAuth(x.config.AuthCollections...))
}

type tokenRequest struct {
	Collection string        `json:"collection"`
	ID         string        `json:"id"`
	Draft      *previewDraft `json:"draft,omitempty"`
}

// previewDraft is the transport-neutral snapshot shared with @vega/astro. Fields are the
// editor's current values, while id stays structural and cannot be shadowed by a field named id.
type previewDraft struct {
	Record previewDraftRecord   `json:"record"`
	Blocks []previewDraftRecord `json:"blocks"`
}

type previewDraftRecord struct {
	ID     string         `json:"id"`
	Fields map[string]any `json:"fields"`
}

type tokenResponse struct {
	URL       string `json:"url"`
	ExpiresAt string `json:"expiresAt"`
	// PostToken is present only for an unsaved draft. Vega submits it as form field "token" to URL,
	// keeping the encrypted payload out of query strings, referrers, and intermediary URL logs.
	PostToken string `json:"postToken,omitempty"`
}

func tokenPayload(collection, id string, expiresUnix int64) string {
	return strings.Join(
		[]string{tokenVersion, collection, id, strconv.FormatInt(expiresUnix, 10)},
		payloadDelimiter,
	)
}

func signToken(secret, collection, id string, expiresUnix int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(tokenPayload(collection, id, expiresUnix)))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return tokenVersion + "." + strconv.FormatInt(expiresUnix, 10) + "." + signature
}

func draftPayload(collection, id string, expiresUnix int64) string {
	return strings.Join(
		[]string{draftTokenVersion, collection, id, strconv.FormatInt(expiresUnix, 10)},
		payloadDelimiter,
	)
}

func deriveDraftKey(secret string) []byte {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(draftKeyLabel))
	return mac.Sum(nil)
}

// encryptDraft seals the complete snapshot with AES-256-GCM. The route identity and expiry are
// additional authenticated data: moving the token to another collection/id or changing its
// lifetime makes decryption fail before any draft bytes are exposed.
func encryptDraft(
	secret, collection, id string,
	expiresUnix int64,
	plaintext []byte,
	randomSource io.Reader,
) (string, error) {
	block, err := aes.NewCipher(deriveDraftKey(secret))
	if err != nil {
		return "", err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(randomSource, nonce); err != nil {
		return "", fmt.Errorf("vegapreview: generate draft nonce: %w", err)
	}
	ciphertext := aead.Seal(
		nil,
		nonce,
		plaintext,
		[]byte(draftPayload(collection, id, expiresUnix)),
	)
	return strings.Join([]string{
		draftTokenVersion,
		strconv.FormatInt(expiresUnix, 10),
		base64.RawURLEncoding.EncodeToString(nonce),
		base64.RawURLEncoding.EncodeToString(ciphertext),
	}, "."), nil
}

func (x *Extension) previewURL(collection, id, token string) string {
	target, _ := url.Parse(x.config.SiteOrigin)
	target.Path = x.config.PreviewPath + "/" + collection + "/" + id
	query := target.Query()
	query.Set("token", token)
	target.RawQuery = query.Encode()
	return target.String()
}

func (x *Extension) draftPreviewURL(collection, id string) string {
	target, _ := url.Parse(x.config.SiteOrigin)
	target.Path = x.config.PreviewPath + "/" + collection + "/" + id
	return target.String()
}

func (x *Extension) collectionIsSupported(name string) bool {
	return len(x.config.RecordCollections) == 0 || slices.Contains(x.config.RecordCollections, name)
}

func logRecordLookupFailure(
	logger *slog.Logger,
	collection string,
	id string,
	err error,
) {
	if err == nil || errors.Is(err, sql.ErrNoRows) {
		return
	}
	logger.Error(
		"vegapreview: record lookup failed",
		"reason", "database_error",
		"collection", collection,
		"id", id,
		"error_type", fmt.Sprintf("%T", err),
	)
}

// tokenHandler mints a URL only after the request's authenticated editor is proven able to view
// this exact record under the collection's current PocketBase ViewRule. Missing, unsupported, and
// inaccessible records deliberately collapse to 404 so the endpoint is not an enumeration oracle.
func (x *Extension) tokenHandler(event *core.RequestEvent) error {
	maxRequestBytes := int64(x.config.MaxDraftBytes + maxRequestOverhead)
	if event.Request.ContentLength > maxRequestBytes {
		return apis.NewApiError(
			http.StatusRequestEntityTooLarge,
			fmt.Sprintf("preview request exceeds the %d byte request limit.", maxRequestBytes),
			nil,
		)
	}
	event.Request.Body = &router.RereadableReadCloser{
		ReadCloser: http.MaxBytesReader(event.Response, event.Request.Body, maxRequestBytes),
	}

	var body tokenRequest
	if err := event.BindBody(&body); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			return apis.NewApiError(
				http.StatusRequestEntityTooLarge,
				fmt.Sprintf("preview request exceeds the %d byte request limit.", maxRequestBytes),
				nil,
			)
		}
		return event.BadRequestError("Invalid preview request.", err)
	}
	body.Collection = strings.TrimSpace(body.Collection)
	body.ID = strings.TrimSpace(body.ID)
	if body.Collection == "" || body.ID == "" {
		return event.BadRequestError("collection and id are required.", nil)
	}
	// The v1 HMAC payload and v2 AES-GCM AAD borrow their field boundaries from PocketBase's
	// newline-free collection names and record ids. Enforce that invariant here so neither wire
	// format can become ambiguous if PocketBase's validation ever changes.
	if strings.Contains(body.Collection, payloadDelimiter) ||
		strings.Contains(body.ID, payloadDelimiter) {
		return event.BadRequestError("collection and id must not contain newlines.", nil)
	}
	if !x.collectionIsSupported(body.Collection) {
		return event.NotFoundError("", nil)
	}

	record, err := event.App.FindRecordById(body.Collection, body.ID)
	if err != nil || record == nil {
		logRecordLookupFailure(event.App.Logger(), body.Collection, body.ID, err)
		return event.NotFoundError("", err)
	}
	requestInfo, err := event.RequestInfo()
	if err != nil {
		return event.BadRequestError("Could not resolve request authorization.", err)
	}
	allowed, accessErr := event.App.CanAccessRecord(record, requestInfo, record.Collection().ViewRule)
	if accessErr != nil {
		return accessErr
	}
	if !allowed {
		return event.NotFoundError("", nil)
	}

	expires := x.config.Clock().UTC().Add(x.config.TokenTTL).Truncate(time.Second)
	event.Response.Header().Set("Cache-Control", "no-store")
	if body.Draft != nil {
		if strings.TrimSpace(body.Draft.Record.ID) != body.ID ||
			body.Draft.Record.Fields == nil {
			return event.BadRequestError("draft.record must describe the requested record.", nil)
		}
		for _, block := range body.Draft.Blocks {
			if strings.TrimSpace(block.ID) == "" || block.Fields == nil {
				return event.BadRequestError("draft.blocks must contain records with id and fields.", nil)
			}
		}
		plaintext, marshalErr := json.Marshal(body.Draft)
		if marshalErr != nil {
			return event.BadRequestError("draft must be valid JSON.", marshalErr)
		}
		if len(plaintext) > x.config.MaxDraftBytes {
			return apis.NewApiError(
				http.StatusRequestEntityTooLarge,
				fmt.Sprintf("draft exceeds the %d byte preview limit.", x.config.MaxDraftBytes),
				nil,
			)
		}
		token, encryptErr := encryptDraft(
			x.config.SigningSecret,
			body.Collection,
			body.ID,
			expires.Unix(),
			plaintext,
			x.config.RandomSource,
		)
		if encryptErr != nil {
			return encryptErr
		}
		return event.JSON(http.StatusOK, tokenResponse{
			URL:       x.draftPreviewURL(body.Collection, body.ID),
			ExpiresAt: expires.Format(timestampLayout),
			PostToken: token,
		})
	}

	token := signToken(x.config.SigningSecret, body.Collection, body.ID, expires.Unix())
	return event.JSON(http.StatusOK, tokenResponse{
		URL:       x.previewURL(body.Collection, body.ID, token),
		ExpiresAt: expires.Format(timestampLayout),
	})
}
