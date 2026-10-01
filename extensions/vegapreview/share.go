package vegapreview

// Share links: a preview URL an editor hands to someone outside Vega (a client), documented in
// `docs/PROJECT-CONTRACT-v1.md#share-links-optional`.
//
// They are a separate mechanism from the signed `v1`/`v2` tokens of vegapreview.go, which stay
// stateless and live at most one hour. A share link has state on the server: one row per link in
// a private collection, holding only a hash of its secret, an expiry chosen by the editor (30 days
// at most) and who created it. Revoking deletes the row. The site resolves a link on every visit
// through POST {RoutePrefix}/share/resolve, so a revoked or expired link stops working at once.

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/netip"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/dbutils"
	"github.com/pocketbase/pocketbase/tools/router"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	shareLinksCollection = "vega_preview_links"
	shareLinksIndex      = "idx_vega_preview_links_record"
	defaultSharePath     = "/preview-share"
	defaultShareMinTTL   = 5 * time.Minute
	// shareHardMaxTTL is David's decision of 1 Oct 2026: configuration may lower it, never raise it.
	shareHardMaxTTL      = 30 * 24 * time.Hour
	shareSecretBytes     = 32
	shareTokenVersion    = "s1"
	shareHashLabel       = "vega-preview-share-s1"
	shareResolveKeyLabel = "vega-preview-share-resolve-v1"
	// ShareResolveKeyHeader carries the site's server-only key on POST /share/resolve.
	ShareResolveKeyHeader = "X-Vega-Preview-Key"
	maxShareRequestBytes  = 4 * 1024
	maxShareLabelRunes    = 120
	// A record may hold this many live links. The cap exists so that every live link fits in the
	// list response: a link the list could not show could not be revoked from Vega for up to 30
	// days. maxShareLinksListed stays well above it for rows written before the cap existed.
	maxShareLinksPerRecord = 20
	shareLinkLimitCode     = "share_link_limit"
	maxShareLinksListed    = 200
	sharePurgeBatch        = 500
	// Failed resolutions allowed per visitor address inside one window, and how many distinct
	// addresses the in-memory limiter remembers at once.
	shareResolveMaxFailures = 10
	shareResolveWindow      = time.Minute
	shareResolveMaxBuckets  = 10000
)

var errShareLinkLimit = errors.New("vegapreview: share link limit reached for this record")

var (
	shareLinkIDPattern = regexp.MustCompile(`^[a-z0-9]{15}$`)
	shareSecretPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
)

// normalizedShare validates the share-link settings. It runs whether or not ShareLinks is on, so a
// lifetime above the ceiling is refused at startup instead of waiting for the feature to be
// enabled.
func (c Config) normalizedShare() (Config, error) {
	// SharePath is only looked at with ShareLinks on. A deployment that predates share links and
	// happens to use PreviewPath "/preview-share" (the SharePath default) must keep starting.
	if c.ShareLinks {
		c.SharePath = strings.TrimRight(strings.TrimSpace(c.SharePath), "/")
		if c.SharePath == "" {
			c.SharePath = defaultSharePath
		}
		if !strings.HasPrefix(c.SharePath, "/") || strings.Contains(c.SharePath, "//") ||
			strings.ContainsAny(c.SharePath, "?#") {
			return c, fmt.Errorf("vegapreview: SharePath must be a relative absolute path")
		}
		// {PreviewPath}/{collection}/{id} already owns everything below PreviewPath: a share
		// route there would be read as a collection name by the signed-token route.
		if c.SharePath == c.PreviewPath || strings.HasPrefix(c.SharePath, c.PreviewPath+"/") {
			return c, fmt.Errorf("vegapreview: SharePath must not be PreviewPath nor live below it")
		}
	}

	if c.ShareMaxTTL == 0 {
		c.ShareMaxTTL = shareHardMaxTTL
	}
	if c.ShareMaxTTL < 0 {
		return c, fmt.Errorf("vegapreview: ShareMaxTTL must be greater than zero")
	}
	if c.ShareMaxTTL > shareHardMaxTTL {
		return c, fmt.Errorf(
			"vegapreview: ShareMaxTTL %s exceeds maximum %s",
			c.ShareMaxTTL,
			shareHardMaxTTL,
		)
	}
	if c.ShareMinTTL == 0 {
		c.ShareMinTTL = min(defaultShareMinTTL, c.ShareMaxTTL)
	}
	if c.ShareMinTTL < time.Second {
		return c, fmt.Errorf("vegapreview: ShareMinTTL must be at least one second")
	}
	if c.ShareMinTTL > c.ShareMaxTTL {
		return c, fmt.Errorf(
			"vegapreview: ShareMinTTL %s exceeds ShareMaxTTL %s",
			c.ShareMinTTL,
			c.ShareMaxTTL,
		)
	}

	if c.ShareLinks {
		// A share link is a standing public URL. With an empty allowlist the signed-token route
		// accepts any collection the editor may view; that default is too wide here.
		if len(c.RecordCollections) == 0 {
			return c, fmt.Errorf(
				"vegapreview: ShareLinks requires RecordCollections to name the collections " +
					"that may be shared",
			)
		}
		if slices.Contains(c.RecordCollections, shareLinksCollection) {
			return c, fmt.Errorf(
				"vegapreview: RecordCollections must not include %s",
				shareLinksCollection,
			)
		}
	}
	return c, nil
}

// EnsureCollections idempotently creates the private collection that stores share links. It is a
// no-op when ShareLinks is off. An existing collection with that name is accepted only when its
// rules and fields match: a name collision never turns link hashes into data the API serves.
//
// The share routes answer 503 until a call to EnsureCollections has succeeded, and go back to 503
// if a later call fails: they never run against a collection nobody validated.
func (x *Extension) EnsureCollections(app core.App) error {
	if !x.config.ShareLinks {
		return nil
	}
	err := x.ensureShareCollection(app)
	x.shareReady.Store(err == nil)
	if err == nil && x.shareHookBound.CompareAndSwap(false, true) {
		app.OnRecordAfterDeleteSuccess(x.config.RecordCollections...).BindFunc(x.dropLinksOfDeletedRecord)
	}
	return err
}

// dropLinksOfDeletedRecord deletes the share links of a record as soon as the record is deleted.
// A link names its record by id only, so one left behind would open whatever record is later
// created with that id. Resolution drops such a link too, but only if somebody tries to open it.
func (x *Extension) dropLinksOfDeletedRecord(event *core.RecordEvent) error {
	links, err := event.App.FindRecordsByFilter(
		shareLinksCollection,
		"collection = {:collection} && recordId = {:recordId}",
		"",
		0,
		0,
		dbx.Params{"collection": event.Record.Collection().Name, "recordId": event.Record.Id},
	)
	if err != nil {
		logShareFailure(event.App, "record_delete_lookup", err)
		return event.Next()
	}
	for _, link := range links {
		if err := event.App.Delete(link); err != nil {
			logShareFailure(event.App, "record_delete", err)
		}
	}
	return event.Next()
}

func (x *Extension) ensureShareCollection(app core.App) error {
	links, err := app.FindCollectionByNameOrId(shareLinksCollection)
	if err != nil {
		links = core.NewBaseCollection(shareLinksCollection)
		links.Fields.Add(
			&core.TextField{Name: "collection", Required: true, Hidden: true},
			&core.TextField{Name: "recordId", Required: true, Hidden: true},
			&core.TextField{Name: "secretHash", Required: true, Hidden: true},
			&core.DateField{Name: "expires", Required: true, Hidden: true},
			&core.TextField{Name: "createdBy", Required: true, Hidden: true},
			&core.TextField{Name: "createdByCollection", Required: true, Hidden: true},
			&core.TextField{Name: "label", Max: maxShareLabelRunes},
			&core.AutodateField{Name: "created", OnCreate: true},
		)
		links.AddIndex(shareLinksIndex, false, "collection, recordId", "")
		if err := app.Save(links); err != nil {
			return fmt.Errorf("vegapreview: create %s: %w", shareLinksCollection, err)
		}
	}
	return validateShareCollection(links)
}

func validateShareCollection(links *core.Collection) error {
	if links.Type != core.CollectionTypeBase {
		return fmt.Errorf("vegapreview: reserved collection %s must be a base collection", links.Name)
	}
	if links.ListRule != nil || links.ViewRule != nil || links.CreateRule != nil ||
		links.UpdateRule != nil || links.DeleteRule != nil {
		return fmt.Errorf(
			"vegapreview: reserved collection %s must keep all API rules locked",
			links.Name,
		)
	}
	for _, name := range []string{
		"collection", "recordId", "secretHash", "createdBy", "createdByCollection",
	} {
		field, ok := links.Fields.GetByName(name).(*core.TextField)
		if !ok || !field.Required || !field.Hidden {
			return fmt.Errorf("vegapreview: incompatible text field %s.%s", links.Name, name)
		}
	}
	if field, ok := links.Fields.GetByName("label").(*core.TextField); !ok || field.Required {
		return fmt.Errorf("vegapreview: incompatible text field %s.label", links.Name)
	}
	if field, ok := links.Fields.GetByName("expires").(*core.DateField); !ok || !field.Required ||
		!field.Hidden {
		return fmt.Errorf("vegapreview: incompatible date field %s.expires", links.Name)
	}
	if field, ok := links.Fields.GetByName("created").(*core.AutodateField); !ok || !field.OnCreate {
		return fmt.Errorf("vegapreview: incompatible autodate field %s.created", links.Name)
	}
	index := dbutils.ParseIndex(links.GetIndex(shareLinksIndex))
	if !index.IsValid() || index.Unique || index.Where != "" || len(index.Columns) != 2 ||
		index.Columns[0].Name != "collection" || index.Columns[1].Name != "recordId" {
		return fmt.Errorf("vegapreview: incompatible index %s.%s", links.Name, shareLinksIndex)
	}
	return nil
}

// registerShareRoutes mounts the four share routes when ShareLinks is on. The three management
// routes take an editor session or a superuser session; the resolution route takes no PocketBase
// session at all, only the site's server-only key (see shareResolveHandler).
func (x *Extension) registerShareRoutes(event *core.ServeEvent) {
	if !x.config.ShareLinks {
		return
	}
	// Unlike POST /token, a superuser is admitted here. CanAccessRecord lets a superuser through
	// every rule, which is what a superuser can already do with the records themselves.
	allowed := append(slices.Clone(x.config.AuthCollections), core.CollectionNameSuperusers)
	prefix := x.config.RoutePrefix + "/share"
	event.Router.POST(prefix, x.whenShareReady(x.shareCreateHandler)).
		Bind(apis.RequireAuth(allowed...))
	event.Router.GET(prefix, x.whenShareReady(x.shareListHandler)).
		Bind(apis.RequireAuth(allowed...))
	event.Router.POST(prefix+"/revoke", x.whenShareReady(x.shareRevokeHandler)).
		Bind(apis.RequireAuth(allowed...))
	event.Router.POST(prefix+"/resolve", x.whenShareReady(x.shareResolveHandler))
}

// whenShareReady refuses a share request with 503 unless EnsureCollections has validated the
// links collection. Registering routes and ensuring collections are two calls the integrator
// makes; forgetting the second, or ignoring its error, must not leave the routes serving from a
// collection whose rules were never checked (it may be open to the records API).
func (x *Extension) whenShareReady(
	handler func(*core.RequestEvent) error,
) func(*core.RequestEvent) error {
	return func(event *core.RequestEvent) error {
		if !x.shareReady.Load() {
			event.Response.Header().Set("Cache-Control", "no-store")
			return apis.NewApiError(
				http.StatusServiceUnavailable,
				"Share links are not available: their collection has not been validated.",
				nil,
			)
		}
		return handler(event)
	}
}

// ShareResolveKey derives the key the site sends in ShareResolveKeyHeader from the signing secret
// it already shares with this extension, with domain separation so the header value cannot be used
// to sign or decrypt a preview token:
//
//	base64url(HMAC-SHA256(secret, "vega-preview-share-resolve-v1"))
//
// It refuses a secret shorter than the 32 bytes New requires. HMAC accepts an empty key without
// complaint, so a site whose environment variable was never set would otherwise derive a
// well-formed, publicly computable key and never notice.
func ShareResolveKey(secret string) (string, error) {
	if len([]byte(secret)) < minSecretBytes {
		return "", fmt.Errorf("vegapreview: the signing secret must be at least %d bytes", minSecretBytes)
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(shareResolveKeyLabel))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

// hashShareSecret is what the collection stores instead of the secret. Plain SHA-256 is enough:
// the secret is 32 bytes from crypto/rand, so there is no dictionary to try and a slow KDF would
// only add a CPU cost an unauthenticated visitor could trigger on every resolution. The link id is
// part of the hashed bytes, so the secret of one link never validates against another row.
func hashShareSecret(linkID, secret string) string {
	sum := sha256.Sum256([]byte(shareHashLabel + "\n" + linkID + "\n" + secret))
	return hex.EncodeToString(sum[:])
}

// parseShareToken splits "s1.<linkId>.<secret>". The id only locates the row; the secret is what
// proves possession.
func parseShareToken(token string) (linkID, secret string, ok bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 || parts[0] != shareTokenVersion ||
		!shareLinkIDPattern.MatchString(parts[1]) || !shareSecretPattern.MatchString(parts[2]) {
		return "", "", false
	}
	return parts[1], parts[2], true
}

func (x *Extension) shareURL(token string) string {
	target, _ := url.Parse(x.config.SiteOrigin)
	target.Path = x.config.SharePath + "/" + token
	return target.String()
}

// bindShareBody reads a JSON body no larger than maxShareRequestBytes into target.
func bindShareBody(event *core.RequestEvent, target any) error {
	tooLarge := func() error {
		return apis.NewApiError(
			http.StatusRequestEntityTooLarge,
			fmt.Sprintf("share request exceeds the %d byte request limit.", maxShareRequestBytes),
			nil,
		)
	}
	if event.Request.ContentLength > maxShareRequestBytes {
		return tooLarge()
	}
	event.Request.Body = &router.RereadableReadCloser{
		ReadCloser: http.MaxBytesReader(event.Response, event.Request.Body, maxShareRequestBytes),
	}
	if err := event.BindBody(target); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			return tooLarge()
		}
		return event.BadRequestError("Invalid share request.", err)
	}
	return nil
}

// authorizeShare is the one access check behind create, list and revoke. A share link publishes
// the record to whoever holds the URL, so it takes the right to change the record, not just to
// read it: the collection must be in RecordCollections, and the caller must pass the record's
// ViewRule (404 otherwise, as for a missing record) and its UpdateRule (403 otherwise).
func (x *Extension) authorizeShare(event *core.RequestEvent, collection, id string) error {
	// RequireAuth already guarantees a session; this keeps the handlers closed if a route is ever
	// mounted without it.
	if event.Auth == nil {
		return event.UnauthorizedError("The request requires valid record authorization token.", nil)
	}
	if collection == "" || id == "" {
		return event.BadRequestError("collection and id are required.", nil)
	}
	if !slices.Contains(x.config.RecordCollections, collection) {
		return event.NotFoundError("", nil)
	}
	record, err := event.App.FindRecordById(collection, id)
	if err != nil || record == nil {
		logRecordLookupFailure(event.App.Logger(), collection, id, err)
		return event.NotFoundError("", nil)
	}
	requestInfo, err := event.RequestInfo()
	if err != nil {
		return event.BadRequestError("Could not resolve request authorization.", err)
	}
	canView, err := event.App.CanAccessRecord(record, requestInfo, record.Collection().ViewRule)
	if err != nil {
		return err
	}
	if !canView {
		return event.NotFoundError("", nil)
	}
	canUpdate, err := event.App.CanAccessRecord(record, requestInfo, record.Collection().UpdateRule)
	if err != nil {
		return err
	}
	if !canUpdate {
		return event.ForbiddenError(
			"Only editors who may update this record can manage its share links.",
			nil,
		)
	}
	return nil
}

// purgeExpiredShareLinks deletes every expired row. It runs on create and on list, which is all
// the cleanup there is: resolution never trusts a row's presence, it checks the expiry itself.
func (x *Extension) purgeExpiredShareLinks(app core.App, now time.Time) {
	expired, err := app.FindRecordsByFilter(
		shareLinksCollection,
		"expires <= {:now}",
		"",
		sharePurgeBatch,
		0,
		dbx.Params{"now": now.UTC().Format(types.DefaultDateLayout)},
	)
	if err != nil {
		logShareFailure(app, "purge_lookup", err)
		return
	}
	for _, link := range expired {
		if err := app.Delete(link); err != nil {
			logShareFailure(app, "purge_delete", err)
		}
	}
}

// logShareFailure records that a storage operation failed, with the error TYPE only. Error text,
// link ids, hashes, secrets and URLs never reach the log.
func logShareFailure(app core.App, operation string, err error) {
	app.Logger().Error(
		"vegapreview: share link storage failed",
		"operation", operation,
		"error_type", fmt.Sprintf("%T", err),
	)
}

type shareCreateRequest struct {
	Collection string `json:"collection"`
	ID         string `json:"id"`
	TTLSeconds int64  `json:"ttlSeconds"`
	Label      string `json:"label"`
}

type shareLink struct {
	ID                  string `json:"id"`
	Label               string `json:"label"`
	CreatedAt           string `json:"createdAt"`
	ExpiresAt           string `json:"expiresAt"`
	CreatedBy           string `json:"createdBy"`
	CreatedByCollection string `json:"createdByCollection"`
}

type shareCreateResponse struct {
	shareLink
	// URL carries the secret. It is returned by this one response and cannot be read again.
	URL string `json:"url"`
}

type shareListResponse struct {
	Items []shareLink `json:"items"`
}

func describeShareLink(link *core.Record) shareLink {
	return shareLink{
		ID:                  link.Id,
		Label:               link.GetString("label"),
		CreatedAt:           link.GetDateTime("created").Time().UTC().Format(timestampLayout),
		ExpiresAt:           link.GetDateTime("expires").Time().UTC().Format(timestampLayout),
		CreatedBy:           link.GetString("createdBy"),
		CreatedByCollection: link.GetString("createdByCollection"),
	}
}

// shareCreateHandler stores a new link and returns its URL once.
func (x *Extension) shareCreateHandler(event *core.RequestEvent) error {
	event.Response.Header().Set("Cache-Control", "no-store")
	var body shareCreateRequest
	if err := bindShareBody(event, &body); err != nil {
		return err
	}
	body.Collection = strings.TrimSpace(body.Collection)
	body.ID = strings.TrimSpace(body.ID)
	if err := x.authorizeShare(event, body.Collection, body.ID); err != nil {
		return err
	}

	minSeconds := int64(math.Ceil(x.config.ShareMinTTL.Seconds()))
	maxSeconds := int64(x.config.ShareMaxTTL / time.Second)
	if body.TTLSeconds < minSeconds || body.TTLSeconds > maxSeconds {
		return event.BadRequestError(
			fmt.Sprintf("ttlSeconds must be between %d and %d.", minSeconds, maxSeconds),
			nil,
		)
	}
	label := strings.TrimSpace(body.Label)
	if utf8.RuneCountInString(label) > maxShareLabelRunes ||
		strings.ContainsFunc(label, unicode.IsControl) {
		return event.BadRequestError(
			fmt.Sprintf("label must be at most %d characters of plain text.", maxShareLabelRunes),
			nil,
		)
	}

	now := x.config.Clock().UTC()
	x.purgeExpiredShareLinks(event.App, now)

	secretBytes := make([]byte, shareSecretBytes)
	if _, err := io.ReadFull(x.config.RandomSource, secretBytes); err != nil {
		return fmt.Errorf("vegapreview: generate share secret: %w", err)
	}
	secret := base64.RawURLEncoding.EncodeToString(secretBytes)

	links, err := event.App.FindCollectionByNameOrId(shareLinksCollection)
	if err != nil {
		logShareFailure(event.App, "collection_lookup", err)
		return event.InternalServerError("Share links are not available.", nil)
	}
	expires, err := types.ParseDateTime(
		now.Add(time.Duration(body.TTLSeconds) * time.Second).Truncate(time.Second),
	)
	if err != nil {
		return err
	}
	link := core.NewRecord(links)
	link.Id = core.GenerateDefaultRandomId()
	link.Set("collection", body.Collection)
	link.Set("recordId", body.ID)
	link.Set("secretHash", hashShareSecret(link.Id, secret))
	link.Set("expires", expires)
	link.Set("createdBy", event.Auth.Id)
	link.Set("createdByCollection", event.Auth.Collection().Name)
	link.Set("label", label)

	// Count and insert inside one transaction, so two simultaneous requests cannot both take the
	// last free slot of a record.
	err = event.App.RunInTransaction(func(txApp core.App) error {
		live, err := txApp.FindRecordsByFilter(
			shareLinksCollection,
			"collection = {:collection} && recordId = {:recordId} && expires > {:now}",
			"",
			maxShareLinksPerRecord,
			0,
			dbx.Params{
				"collection": body.Collection,
				"recordId":   body.ID,
				"now":        now.Format(types.DefaultDateLayout),
			},
		)
		if err != nil {
			return err
		}
		if len(live) >= maxShareLinksPerRecord {
			return errShareLinkLimit
		}
		return txApp.Save(link)
	})
	if errors.Is(err, errShareLinkLimit) {
		limit := apis.NewApiError(
			http.StatusConflict,
			fmt.Sprintf(
				"This record already has %d live share links. Revoke one before creating another.",
				maxShareLinksPerRecord,
			),
			nil,
		)
		limit.Data = map[string]any{"code": shareLinkLimitCode, "limit": maxShareLinksPerRecord}
		return limit
	}
	if err != nil {
		logShareFailure(event.App, "create", err)
		return event.InternalServerError("Could not create the share link.", nil)
	}

	return event.JSON(http.StatusCreated, shareCreateResponse{
		shareLink: describeShareLink(link),
		URL:       x.shareURL(shareTokenVersion + "." + link.Id + "." + secret),
	})
}

// shareListHandler returns the live links of one record, newest first, without secret or hash.
func (x *Extension) shareListHandler(event *core.RequestEvent) error {
	event.Response.Header().Set("Cache-Control", "no-store")
	collection := strings.TrimSpace(event.Request.URL.Query().Get("collection"))
	id := strings.TrimSpace(event.Request.URL.Query().Get("id"))
	if err := x.authorizeShare(event, collection, id); err != nil {
		return err
	}

	now := x.config.Clock().UTC()
	x.purgeExpiredShareLinks(event.App, now)
	links, err := event.App.FindRecordsByFilter(
		shareLinksCollection,
		"collection = {:collection} && recordId = {:recordId}",
		"-created",
		maxShareLinksListed,
		0,
		dbx.Params{"collection": collection, "recordId": id},
	)
	if err != nil {
		logShareFailure(event.App, "list", err)
		return event.InternalServerError("Could not list the share links.", nil)
	}
	response := shareListResponse{Items: []shareLink{}}
	for _, link := range links {
		// The purge above is best effort; the expiry is checked again here so a row that
		// survived it is never reported as live.
		if !now.Before(link.GetDateTime("expires").Time()) {
			continue
		}
		response.Items = append(response.Items, describeShareLink(link))
	}
	return event.JSON(http.StatusOK, response)
}

type shareRevokeRequest struct {
	Collection string `json:"collection"`
	ID         string `json:"id"`
	LinkID     string `json:"linkId"`
}

// shareRevokeHandler deletes a link. The request names the record as well as the link so the
// access check never depends on the link existing: once the caller is proven able to manage that
// record's links, the answer is 204 whether the link was there, was already revoked, never
// existed, or belongs to another record (in which case it is left alone).
func (x *Extension) shareRevokeHandler(event *core.RequestEvent) error {
	event.Response.Header().Set("Cache-Control", "no-store")
	var body shareRevokeRequest
	if err := bindShareBody(event, &body); err != nil {
		return err
	}
	body.Collection = strings.TrimSpace(body.Collection)
	body.ID = strings.TrimSpace(body.ID)
	body.LinkID = strings.TrimSpace(body.LinkID)
	if body.LinkID == "" {
		return event.BadRequestError("linkId is required.", nil)
	}
	if err := x.authorizeShare(event, body.Collection, body.ID); err != nil {
		return err
	}

	link, err := event.App.FindRecordById(shareLinksCollection, body.LinkID)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			logShareFailure(event.App, "revoke_lookup", err)
			return event.InternalServerError("Could not revoke the share link.", nil)
		}
		return event.NoContent(http.StatusNoContent)
	}
	if link.GetString("collection") != body.Collection || link.GetString("recordId") != body.ID {
		return event.NoContent(http.StatusNoContent)
	}
	if err := event.App.Delete(link); err != nil {
		logShareFailure(event.App, "revoke", err)
		return event.InternalServerError("Could not revoke the share link.", nil)
	}
	return event.NoContent(http.StatusNoContent)
}

type shareResolveRequest struct {
	Token string `json:"token"`
	// ClientIP is the visitor's address as the site saw it. The site is the only caller that can
	// reach this field (it must present the resolve key first), so it is trusted for rate limiting.
	ClientIP string `json:"clientIp"`
}

type shareResolveResponse struct {
	Collection string `json:"collection"`
	ID         string `json:"id"`
	ExpiresAt  string `json:"expiresAt"`
}

// shareResolveHandler tells the site which record a share token points at. It is called by the
// site's server-side route on every visit, never by a browser.
//
// The caller proves it is the site with ShareResolveKeyHeader. Every reason a token may be
// refused (malformed, unknown link, wrong secret, expired, revoked, target record deleted, target
// collection no longer shareable) produces the same 404 with the same body, so the route cannot be
// used to learn which of those happened. Failed resolutions are counted per visitor address.
func (x *Extension) shareResolveHandler(event *core.RequestEvent) error {
	event.Response.Header().Set("Cache-Control", "no-store")
	now := x.config.Clock().UTC()

	// The key is checked FIRST, and a caller holding it never touches the "caller:" bucket.
	// Behind a reverse proxy with no trusted-proxy headers configured, RealIP is the proxy's
	// address for everybody: if keyless requests could fill a bucket the site also had to pass,
	// ten of them a minute from anywhere would lock the site out of every share link.
	presented := event.Request.Header.Get(ShareResolveKeyHeader)
	if subtle.ConstantTimeCompare([]byte(presented), []byte(x.shareResolveKey)) != 1 {
		callerKey := limiterAddress(event.RealIP())
		if retry := x.shareCallerLimiter.blockedFor(callerKey, now); retry > 0 {
			return shareTooManyAttempts(event, retry)
		}
		x.shareCallerLimiter.fail(callerKey, now)
		return event.UnauthorizedError("The request requires the site's preview key.", nil)
	}

	var body shareResolveRequest
	if err := bindShareBody(event, &body); err != nil {
		return err
	}
	visitorKey := limiterAddress(event.RealIP())
	if clientIP := strings.TrimSpace(body.ClientIP); clientIP != "" {
		if _, err := netip.ParseAddr(clientIP); err != nil {
			return event.BadRequestError("clientIp must be an IP address.", nil)
		}
		visitorKey = limiterAddress(clientIP)
	}
	if retry := x.shareVisitorLimiter.blockedFor(visitorKey, now); retry > 0 {
		return shareTooManyAttempts(event, retry)
	}

	resolved, ok := x.resolveShareToken(event.App, body.Token, now)
	if !ok {
		x.shareVisitorLimiter.fail(visitorKey, now)
		return event.NotFoundError("", nil)
	}
	return event.JSON(http.StatusOK, resolved)
}

func shareTooManyAttempts(event *core.RequestEvent, retry time.Duration) error {
	seconds := int(math.Ceil(retry.Seconds()))
	event.Response.Header().Set("Retry-After", strconv.Itoa(seconds))
	return event.TooManyRequestsError("Too many failed attempts.", nil)
}

// absentShareHash stands in for the stored hash when the link id matches no row, so an unknown id
// costs the same comparison as a known one.
var absentShareHash = hashShareSecret("", "")

// resolveShareToken returns the target of a valid token. It reports only yes or no: the caller
// must not be able to tell the refusals apart.
func (x *Extension) resolveShareToken(
	app core.App,
	token string,
	now time.Time,
) (shareResolveResponse, bool) {
	var none shareResolveResponse
	linkID, secret, ok := parseShareToken(token)
	if !ok {
		return none, false
	}

	storedHash := absentShareHash
	link, err := app.FindRecordById(shareLinksCollection, linkID)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			logShareFailure(app, "resolve_lookup", err)
		}
		link = nil
	} else {
		storedHash = link.GetString("secretHash")
	}
	// Constant-time comparison of the two hex digests; evaluated even when there is no row.
	matches := subtle.ConstantTimeCompare(
		[]byte(hashShareSecret(linkID, secret)),
		[]byte(storedHash),
	) == 1
	if link == nil || !matches {
		return none, false
	}

	expires := link.GetDateTime("expires").Time()
	if expires.IsZero() || !now.Before(expires) {
		return none, false
	}
	collection := link.GetString("collection")
	recordID := link.GetString("recordId")
	if !slices.Contains(x.config.RecordCollections, collection) {
		return none, false
	}
	if _, err := app.FindRecordById(collection, recordID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// The record is gone. Drop the link too, so it cannot come back to life if a record
			// is ever created again with the same id.
			if deleteErr := app.Delete(link); deleteErr != nil {
				logShareFailure(app, "resolve_orphan_delete", deleteErr)
			}
		} else {
			logShareFailure(app, "resolve_target_lookup", err)
		}
		return none, false
	}
	return shareResolveResponse{
		Collection: collection,
		ID:         recordID,
		ExpiresAt:  expires.UTC().Format(timestampLayout),
	}, true
}

// limiterAddress is the limiter key for an address. An IPv4 address (also in its IPv4-mapped IPv6
// form) is its own key. IPv6 addresses are grouped by /64: one subscriber routinely owns a whole
// /64, so counting each address apart would hand a single machine 2^64 fresh allowances and let
// it fill the limiter by itself. Text that is not an address is kept as it is.
func limiterAddress(raw string) string {
	address, err := netip.ParseAddr(strings.TrimSpace(raw))
	if err != nil {
		return raw
	}
	address = address.Unmap()
	if address.Is4() {
		return address.String()
	}
	prefix, err := address.WithZone("").Prefix(64)
	if err != nil {
		return address.String()
	}
	return prefix.String()
}

// attemptLimiter counts failures per key in fixed windows, in memory, and remembers at most
// capacity keys. When it is full and nothing has expired it FAILS OPEN: a key it has no room for
// is neither counted nor blocked, while the keys it already tracks stay blocked as usual.
//
// It used to refuse untracked keys instead. That turned the bound into a switch anyone could
// throw: fill the table (cheap, with many addresses) and every new visitor, and the site itself,
// got 429. The limiter is not what keeps a share link safe (the secret's 256 bits are); it only
// bounds noise, so when it cannot keep count it must not take the feature down.
type attemptLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*attemptBucket
	max      int
	window   time.Duration
	capacity int
}

type attemptBucket struct {
	failures int
	resetAt  time.Time
}

func newAttemptLimiter(max int, window time.Duration, capacity int) *attemptLimiter {
	return &attemptLimiter{
		buckets:  make(map[string]*attemptBucket),
		max:      max,
		window:   window,
		capacity: capacity,
	}
}

// sweep drops expired buckets. The caller holds mu.
func (l *attemptLimiter) sweep(now time.Time) {
	for key, bucket := range l.buckets {
		if !now.Before(bucket.resetAt) {
			delete(l.buckets, key)
		}
	}
}

// blockedFor returns how long key must wait, or zero when it may try.
func (l *attemptLimiter) blockedFor(key string, now time.Time) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	bucket, ok := l.buckets[key]
	if ok && !now.Before(bucket.resetAt) {
		delete(l.buckets, key)
		ok = false
	}
	if ok {
		if bucket.failures >= l.max {
			return bucket.resetAt.Sub(now)
		}
		return 0
	}
	return 0
}

// fail records one failed attempt for key. With the table full of live buckets, a new key is
// dropped (see the type comment).
func (l *attemptLimiter) fail(key string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	bucket, ok := l.buckets[key]
	if ok && now.Before(bucket.resetAt) {
		bucket.failures++
		return
	}
	if !ok && len(l.buckets) >= l.capacity {
		l.sweep(now)
		if len(l.buckets) >= l.capacity {
			return
		}
	}
	l.buckets[key] = &attemptBucket{failures: 1, resetAt: now.Add(l.window)}
}
