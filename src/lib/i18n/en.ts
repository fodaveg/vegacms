/**
 * English dictionary (Vega chrome, §2.5 of the P3 contract). Same key set as `es.ts` — see the
 * doc there for the scope rule (chrome only, never content, never `ModelWarning.message`).
 */
export const en: Record<keyof typeof import('./es').es, string> = {
	// ————— Nav / index —————
	'nav.emptyTitle': "There's nothing to show yet",
	'nav.emptyBody': 'Create collections in your PocketBase, or check the manifest in Settings.',
	'nav.emptyCta': 'Go to Settings',
	'nav.media': 'Media',
	'nav.trash': 'Trash',
	'nav.settings': 'Settings',
	'nav.sidebarLabel': 'Main navigation',
	'nav.warningsBadge': '{count} warnings',
	'nav.singletonManyRecords':
		'"{label}" is marked as a settings page but has {count} records. Editing the first one.',
	'nav.readonlyBadge': 'Read only',

	// ————— Topbar —————
	'topbar.logout': 'Log out',
	'topbar.menu.open': 'Open navigation',
	'topbar.menu.close': 'Close navigation',
	'topbar.density.toggleLabel': 'Density',
	'topbar.density.comfortable': 'Comfortable',
	'topbar.density.compact': 'Compact',
	'topbar.connection.connected': 'Connected',
	'topbar.connection.disconnected': 'Disconnected',
	'topbar.connection.retrying': 'Retrying…',
	'topbar.connection.retry': 'Retry',
	'topbar.search.ariaLabel': 'Global search',
	'topbar.search.placeholder': 'Search all content…',
	'topbar.avatar.label': 'Signed in as {email}',
	// User chip → "Settings" menu (#l12-ux, item 3): label of the trigger button itself, DIFFERENT
	// from `topbar.avatar.label` above (that one describes the session identity of the inner
	// `<span role="img">`; this one describes the ACTION of opening the menu).
	'topbar.userMenu.toggle': 'Account menu',

	// ————— Publish ("publication" batch, phase A): `PublishButton.svelte` —————
	// Absent entirely (see the component header) when the connected project didn't declare
	// `build` in its discovery — these keys only render when the feature actually exists.
	'topbar.publish.loading': 'Checking publish status…',
	'topbar.publish.running': 'Publishing…',
	'topbar.publish.failed': 'Retry publish',
	'topbar.publish.noChanges': 'No changes',
	'topbar.publish.ok': 'Published',
	'topbar.publish.ready': 'Publish',
	'topbar.publish.viewLog': 'View log',
	'topbar.publish.triggerError': 'Could not start the publish.',
	'topbar.publish.lastPublished': 'Last published: {date}',

	// ————— Login / session —————
	'login.title': 'Sign in to Vega',
	'login.email': 'Email',
	'login.password': 'Password',
	'login.submit': 'Sign in',
	'login.submitting': 'Signing in…',
	'login.invalidCredentials': 'Invalid credentials.',
	'login.networkError': 'Could not reach the backend.',
	'login.or': 'or',
	'login.passkey': 'Sign in with a passkey',
	'login.mfa.title': 'Two-step verification',
	'login.mfa.body': 'Confirm your identity to finish signing in.',
	'login.mfa.totpLabel': 'Authenticator app code',
	'login.mfa.verifying': 'Verifying…',
	'login.mfa.verify': 'Verify',
	'login.mfa.invalidCode': 'That code is not valid.',
	'login.mfa.useRecovery': 'Use a recovery code',
	'login.mfa.recoveryLabel': 'Recovery code',
	'login.mfa.recoverySubmit': 'Sign in with a recovery code',
	'login.mfa.cancel': 'Cancel and return to sign in',
	'session.reloginTitle': 'Your session has expired',
	'session.reloginBody': 'Sign in again to pick up where you left off. Nothing is lost.',
	'session.reloginSubmit': 'Re-authenticate',
	'session.logoutConfirm': 'There are unsaved changes. Log out anyway?',

	// ————— Backend connection / generic onboarding (batch L5) —————
	// `BackendUrlForm.svelte`: runtime override of the PocketBase URL, saved to `localStorage`.
	// Mounted on `/login` (disclosure, first launch) and `/settings` (reconfiguration, already
	// signed in).
	'connect.disclosureLabel': 'PocketBase on another server? Configure it',
	'connect.title': 'Backend / connection',
	'connect.description': 'Point Vega to a PocketBase other than this same server, no rebuild.',
	'connect.urlLabel': 'PocketBase URL',
	'connect.urlPlaceholder': 'https://pb.yourdomain.com',
	'connect.invalidUrl': 'Enter a valid URL (http:// or https://).',
	'connect.current.sameOrigin': 'Using the same origin as this page (default).',
	'connect.current.override': 'Connected to: {url}',
	'connect.test': 'Test connection',
	'connect.testing': 'Testing…',
	'connect.testOk': 'Connection succeeded.',
	'connect.testFail': 'Could not confirm the connection (could be CORS). You can still save.',
	'connect.save': 'Save and reload',
	'connect.reset': 'Reset to defaults',
	'connect.reloadConfirm':
		'The page will reload to apply the backend change. Any unsaved changes in the editor will be lost. Continue?',
	// `authCollection` (batch L6c): auth collection the `pocketbase` adapter authenticates against
	// — empty/absent ⇒ `_superusers` (superuser, previous behavior). An operator setting up the
	// plain editor role (dedicated collection, e.g. `vega_editors`) fills it here to sign in as an
	// editor instead of a superuser.
	'connect.authCollectionLabel': 'Authentication collection',
	'connect.authCollectionPlaceholder': '_superusers',
	'connect.authCollectionHint':
		'Leave blank to sign in as superuser. Editors use a dedicated collection (e.g. "vega_editors") that whoever administers this PocketBase will give you.',
	'connect.current.authCollectionDefault': 'Authenticating as superuser (_superusers).',
	'connect.current.authCollectionOverride': 'Authenticating against collection: {authCollection}',

	// ————— Account security (L6: TOTP, recovery and passkeys) —————
	'security.title': 'Account security',
	'security.description': 'Manage two-step verification and passkeys for this account.',
	'security.refresh': 'Refresh',
	'security.loading': 'Loading security factors…',
	'security.error.generic': 'The security operation could not be completed.',
	'security.status.enabled': 'Enabled',
	'security.status.disabled': 'Disabled',
	'security.totp.title': 'Authenticator app (TOTP)',
	'security.totp.enabled': 'The authenticator app is enabled.',
	'security.totp.disabled': 'The authenticator app is disabled.',
	'security.totp.disableConfirm': 'Disable the authenticator app?',
	'security.totp.disable': 'Disable TOTP',
	'security.totp.setupBody':
		'Open the link in your password manager or enter the secret manually. Then confirm a six-digit code.',
	'security.totp.openApp': 'Open in authenticator app',
	'security.totp.codeLabel': '6-digit code',
	'security.totp.verify': 'Enable and verify',
	'security.totp.disabledBody': 'Add a second sign-in step with any app that supports TOTP codes.',
	'security.totp.enroll': 'Set up TOTP',
	'security.recovery.remaining': '{count} recovery codes available.',
	'security.recovery.regenerate': 'Regenerate codes',
	'security.recovery.regenerateConfirm':
		'Your current codes will stop working. Generate a new set?',
	'security.recovery.saveTitle': 'Save your recovery codes',
	'security.recovery.saveBody':
		'Each code can be used once. This is the only time they will be shown.',
	'security.recovery.copy': 'Copy all',
	'security.recovery.copied': 'Copied',
	'security.recovery.copyError': 'The codes could not be copied. Copy them manually.',
	'security.passkeys.title': 'Passkeys',
	'security.passkeys.body':
		'Sign in without a password using Touch ID, a security key or your password manager.',
	'security.passkeys.defaultName': 'Passkey',
	'security.passkeys.added': 'Passkey added.',
	'security.passkeys.deleted': 'Passkey deleted.',
	'security.passkeys.deleteConfirm': 'Delete this passkey?',
	'security.passkeys.delete': 'Delete',
	'security.passkeys.empty': 'No passkeys have been registered yet.',
	'security.passkeys.nameLabel': 'Passkey name',
	'security.passkeys.namePlaceholder': 'e.g. MacBook (Touch ID)',
	'security.passkeys.add': 'Add passkey',

	// ————— Global transport states (§3.4) —————
	'errors.network.title': 'Could not reach the backend',
	'errors.network.body': 'The server could not be reached. Check your connection.',
	'errors.network.retry': 'Retry',
	'errors.backend.title': 'The backend returned something unexpected',
	'errors.forbidden.title': "You don't have permission",
	'errors.forbidden.body': "Your session can't access this resource.",
	'errors.forbidden.readonlyType.body':
		'"{label}" is a read-only collection: new records cannot be created.',
	'errors.notFoundType.title': 'Collection not found',
	'errors.notFoundType.body': 'The content type "{type}" does not exist (or is hidden).',
	'errors.notFoundRecord.title': 'Record not found',
	'errors.notFoundRecord.body': 'This record no longer exists.',
	'errors.notFoundRecord.backToList': 'Back to list',
	'errors.backToIndex': 'Back to index',
	// ————— Merged views (mergedViews, Phase L7c) —————
	'errors.notFoundView.title': 'View not found',
	'errors.notFoundView.body': 'The merged view "{view}" does not exist.',

	// ————— Record editor (P5 contract, Phase F5-a) —————
	// `editor.create.title`/`editor.edit.title`: since redesign C2's R7, these only feed the
	// VISUALLY HIDDEN `<h1>` of `RecordForm.svelte` (heading-hierarchy a11y) — the editor's visible
	// title is now the `EditTopBar` crumb, not an on-screen heading.
	'editor.create.title': 'Create «{label}»',
	'editor.edit.title': 'Edit «{label}»',
	'editor.save': 'Save',
	'editor.saving': 'Saving…',
	'editor.saveSuccess': 'Saved.',
	'editor.leaveConfirm': 'There are unsaved changes. Leave anyway?',
	'editor.readonlyNotice': 'This collection is read-only: it cannot be edited.',
	'editor.load.error.body': 'Could not load the record. {message}',

	// ————— Editor sticky bar (redesign C2, Part R7, `.edit-top` mockup) —————
	'editor.new': 'new',
	'editor.dirty': 'unsaved',
	'editor.savedAt': 'last saved {time}',
	'editor.previewLink': 'View on site',
	'editor.previewDisabledTitle': 'The draft has no public URL yet',

	// ————— Draft preview panel ("publishing" batch, phase B) —————
	// Only rendered when the connected project declared `preview` in its discovery
	// (`ctx.port.previewApiUrl`, see `RecordForm.svelte`'s header) — same criteria as the
	// `topbar.publish.*` keys with `build`.
	'editor.preview.toggle': 'Preview',
	'editor.preview.panel.label': 'Preview panel',
	'editor.preview.panel.title': 'Draft preview',
	'editor.preview.panel.refresh': 'Refresh preview',
	'editor.preview.panel.close': 'Close preview',
	'editor.preview.panel.frameTitle': 'Draft preview on the site',
	'editor.preview.panel.loading': 'Loading preview…',
	'editor.preview.panel.loadError': 'Could not load the preview.',
	'editor.preview.panel.genericError': 'Could not generate the preview.',

	// ————— Master-detail editor (final `aquelarre-detalle-post.html` mockup) —————
	// Sibling rail (`.rail`), metadata aside (`.kv`) and danger zone: GENERIC opt-in renderer
	// pieces — the aside card headings come from `fieldGroups` (manifest data), so only literals
	// that are NOT collection data live here.
	'editor.rail.label': 'Collection records',
	'editor.meta.title': 'Record',
	'editor.meta.id': 'id',
	'editor.meta.created': 'Created',
	'editor.meta.updated': 'Updated',
	'editor.dangerZone.title': 'Danger zone',
	'editor.delete': 'Delete {label}…',
	'editor.slug.regenerate': 'Regenerate',

	// ————— Embedded orderable blocks (`blocks` capability, "editor" batch, Phase A) —————
	// Deliberately reuses existing keys for the rest of a block's lifecycle:
	// `editor.save`/`editor.saving`/`editor.saveSuccess` (saving a block is the same as saving
	// any record, just a miniature of it), `list.delete.rowButton*`/`.confirm*`/`.success`
	// (deleting a block is the same as deleting a list row, same `DeleteConfirm` dialog) and
	// `list.reorder.handleLabel`/`.error` (the drag handle is the SAME piece as the list's).
	// Only literals without an existing key live here.
	'editor.blocks.add': 'Add {label}',
	'editor.blocks.empty': 'There are no {label} yet.',
	'editor.blocks.expandLabel': 'Expand «{label}»',
	'editor.blocks.collapseLabel': 'Collapse «{label}»',
	'editor.blocks.reorder.moved': '«{label}» moved to position {position} of {total}',
	'editor.blocks.notice.saveParentFirst': 'Save the record to be able to add {label}.',

	// ————— Social card preview (`social` capability, "editor" batch, Phase B) —————
	'editor.social.title': 'Social preview',

	// ————— Content locale selector (manifest-declared localized fields) —————
	'form.locale.tabsLabel': 'Content language',
	'form.locale.status.error': '{label}: contains errors',
	'form.locale.status.dirty': '{label}: has unsaved changes',
	'form.locale.status.missing': '{label}: translations are missing',
	'form.locale.status.complete': '{label}: translation complete',

	// ————— Field widgets (P5 contract, Phase F5-a/F5-b) —————
	'form.unsupported': 'Field not editable in Vega',
	'form.select.empty': '— no selection —',
	'form.errorCode.validation_required': 'This field is required.',
	'form.errorCode.validation_min_text_constraint': 'The text is too short.',
	'form.errorCode.validation_max_text_constraint': 'The text is too long.',
	'form.errorCode.validation_invalid_format': 'The format is not valid.',
	'form.errorCode.validation_min_number_constraint': 'The value is too low.',
	'form.errorCode.validation_max_number_constraint': 'The value is too high.',
	'form.errorCode.validation_min_greater_equal_than_required': 'The date is too early.',
	'form.errorCode.validation_max_less_equal_than_required': 'The date is too late.',
	'form.errorCode.validation_invalid_value': 'The selected value is not valid.',
	'form.errorCode.validation_too_many_values': 'You have selected too many items.',
	'form.errorCode.validation_missing_rel_records': 'Some of the related records no longer exist.',
	'form.errorCode.vega_unsupported_field': 'Vega cannot write this field.',
	'form.errorCode.vega_readonly_field': 'This field is read-only.',
	'form.errorCode.vega_unknown_field': 'This field does not exist on the content type.',
	'form.errorCode.vega_foreign_file_ref': 'That file does not belong to this record.',

	// ————— Relation widget (P5 contract, Phase F5-e) —————
	'form.relation.searchAriaLabel': 'Search «{label}»',
	'form.relation.searchPlaceholder': 'Search by title…',
	'form.relation.typeToSearch': 'Type to search…',
	'form.relation.searching': 'Searching…',
	'form.relation.noResults': 'No results',
	'form.relation.emptySelection': '— no selection —',
	'form.relation.remove': 'Remove',
	'form.relation.removeLabel': 'Remove «{title}»',
	'form.relation.notFound': 'not found',
	'form.relation.degradedNote': 'This type has no title field to search by: pick from the list.',

	// ————— File widget (P5 contract, Phase F5-f) —————
	'form.file.dropHint': 'Drag files here or click to choose',
	'form.file.empty': 'No files',
	'form.file.remove': 'Remove',
	'form.file.removeLabel': 'Remove «{name}»',
	'form.file.tooLarge': '«{name}» is too large.',
	'form.file.invalidType': '«{name}» is not an allowed file type.',
	'form.file.tooMany': '«{name}» was not added: file limit reached.',
	// Phase P6·6e (D-P6.6): button that opens `MediaPicker.svelte`. Fully hidden without
	// `ctx.mediaPicker` (L-P6.9), never shown disabled without explanation.
	'form.file.pickFromLibrary': 'Choose from the library',

	// ————— Richtext/markdown editor (P5 contract, Phase F5-d) —————
	'form.editor.toolbarLabel': 'Formatting tools',
	'form.editor.paragraph': 'Paragraph',
	'form.editor.heading': 'Heading {level}',
	'form.editor.headingLabel': 'Paragraph style',
	'form.editor.bold': 'Bold',
	'form.editor.italic': 'Italic',
	'form.editor.strike': 'Strikethrough',
	'form.editor.code': 'Code',
	'form.editor.codeBlock': 'Code block',
	'form.editor.blockquote': 'Quote',
	'form.editor.bulletList': 'Bulleted list',
	'form.editor.orderedList': 'Numbered list',
	'form.editor.horizontalRule': 'Horizontal rule',
	'form.editor.link': 'Link',
	'form.editor.linkRemove': 'Remove link',
	'form.editor.linkPrompt': 'Link URL',
	'form.editor.image': 'Image',
	'form.editor.imagePrompt': 'Image URL',
	'form.editor.imageAltPrompt': 'Image alt text',
	'form.editor.heading1': 'Heading 1',
	'form.editor.heading2': 'Heading 2',
	'form.richtext.loading': 'Loading the editor…',
	'form.markdown.modeLabel': 'Editor view',
	'form.markdown.mode.write': 'Write',
	'form.markdown.mode.split': 'Split',
	'form.markdown.mode.preview': 'Preview',
	'form.markdown.previewRegion': 'Markdown preview',
	'form.markdown.previewEmpty': 'The preview will appear here.',
	'form.markdown.previewLoading': 'Preparing preview…',
	'form.markdown.wordCountOne': '1 word',
	'form.markdown.wordCountMany': '{count} words',
	'form.markdown.shortcutHint': 'Markdown · ⌘/Ctrl B · I · K',
	'form.markdown.placeholderText': 'text',
	'form.markdown.placeholderCode': 'code',
	'form.markdown.placeholderAlt': 'description',
	'form.markdown.unsafeUri':
		'The Markdown contains HTML or a disallowed address. Use Markdown syntax and http, https, mailto, or relative links.',

	// ————— List (P4 contract, Phase 4c) —————
	'list.empty.title': "There's nothing here yet",
	'list.empty.body': 'Create the first "{label}" record to get started.',
	'list.empty.cta': 'Create',
	'list.error.title': 'The list could not be loaded',
	'list.error.body': '{message}',
	'list.pagination.prev': 'Previous',
	'list.pagination.next': 'Next',
	// Visible-records range (1:1 match with the `.table-foot .range` mockup, "1–20 of 24"):
	// replaces `list.pagination.total`/`.perPage` (separate count + page-size strings).
	'list.pagination.range': '{first}–{last} of {total}',
	'list.cell.yes': 'Yes',
	'list.cell.no': 'No',
	'list.untitled': '(untitled)',

	// ————— List toolbar (P4 contract, Phase 4d) —————
	'list.search.placeholder': 'Filter by title or slug…',
	'list.search.ariaLabel': 'Search the list',
	'list.sort.ariaLabel': 'Sort by {column}',
	'list.emptySearch.title': 'No results',
	'list.emptySearch.body': 'No "{label}" record matches the search or the active filters.',
	'list.emptySearch.clear': 'Clear filters',
	// "Filter" menu (M6, reopens R2): button that opens the raw options of the `statusField`
	// (`ListToolbar.svelte`); `list.filter.groupLabel` (below) labels the popup itself.
	'list.filter.menu.trigger': 'Filter',
	// Always-visible "Clear filters" in the toolbar while any filter/search is active (mockup
	// `.toolbar .clear-filters`) — DISTINCT key from `list.emptySearch.clear` (same text,
	// different context: that one lives inside the empty-search state).
	'list.filter.clearAll': 'Clear filters',

	// ————— List header (redesign C2, Part R2, `.listhead` mockup) —————
	// Label of the "Filter" menu POPUP (M6): used to describe the extinct `FilterChips.svelte`
	// chip group; now describes the `role="menu"` with the options to CHOOSE a new filter (see
	// `ListToolbar.svelte`).
	'list.filter.groupLabel': 'Filter by status',
	'list.new.button': 'Create «{label}»',

	// ————— Header meta + export (M2, `.page-head .meta`/`.btn` mockup) —————
	'list.meta.records': 'records',
	'list.meta.filters': 'filters',
	'list.export.button': 'Export',

	// ————— Active filter chips (M6, reopens R2, mockup `.toolbar .chip`) —————
	'list.activeFilter.groupLabel': 'Active filters',
	'list.activeFilter.status.key': 'Status:',
	'list.activeFilter.status.remove': 'Remove status filter',

	// ————— Delete (P4 contract, Phase 4e) —————
	'list.delete.rowButton': 'Delete',
	'list.delete.rowButtonLabel': 'Delete "{label}"',
	'list.delete.confirmTitle': 'Delete this record?',
	'list.delete.confirmBody': '"{label}" will be permanently deleted. This action cannot be undone.',
	'list.delete.confirm': 'Delete',
	'list.delete.deleting': 'Deleting…',
	'list.delete.success': '"{label}" was deleted.',

	// ————— Manual reorder (orderField) —————
	'list.reorder.columnHeader': 'Order',
	'list.reorder.handleLabel': 'Drag to reorder "{label}"',
	'list.reorder.error': 'Could not save the new order. Please try again.',

	// ————— Merged view (mergedViews, Phase L7c) —————
	'list.merged.typeHeader': 'Type',
	'list.merged.titleHeader': 'Title',
	'list.merged.empty.title': "There's nothing here yet",
	'list.merged.empty.body': "No record from this view's collections matches yet.",
	'list.merged.truncatedNotice': "One of this view's collections has more records than shown.",

	// ————— Media: bootstrap + schema (Phase P6·6a) —————
	'media.loadErrorBody': 'Could not load the media library. Try again.',
	'media.empty.title': 'The media library is empty',
	'media.empty.body': 'There are no files yet. Upload the first one from the section above.',
	'media.bootstrap.confirmBody':
		'Vega is going to create the "vega_media" collection in your PocketBase. Continue?',
	'media.bootstrap.confirm': 'Create collection',
	'media.bootstrap.creating': 'Creating…',
	'media.bootstrap.create': 'Create the media collection',
	'media.bootstrap.manualBody':
		'The "vega_media" collection does not exist in this backend yet and cannot be created automatically. This section stays disabled until you create it by hand.',
	'media.bootstrap.manualImportHint':
		'In the PocketBase Admin: Collections → Import collections, paste the following JSON and confirm.',
	// Editor role (batch L6c): an editor never has access to the PocketBase Admin, so the import
	// JSON above is of no use to them.
	'media.bootstrap.editorBody':
		'Ask an administrator to set up the media collection ("vega_media") in PocketBase.',

	// ————— Referential integrity (`#lote-integridad`, Phase A): "where is this used?" engine —————
	// Shared by `UsedInPanel`/`ReferencesSummary` (passive panel) and by `DeleteConfirm`/
	// `MediaDeleteConfirm`'s pre-delete warning (gate before deleting) — hence the `integrity.*`
	// namespace instead of `list.*`/`media.*`: the SAME copy works for a content record or an asset.
	'integrity.usedIn.toggle': 'Used in',
	'integrity.usedIn.loading': 'Checking where this is used…',
	'integrity.usedIn.empty': 'Nothing points to this yet.',
	'integrity.usedIn.error': 'Could not check where this is used.',
	'integrity.usedIn.retry': 'Retry',
	'integrity.usedIn.partial':
		'Notice: not everything could be checked. There may be more references than shown here.',
	'integrity.usedIn.countLabel': '{count} record(s)',
	'integrity.usedIn.moreCount': 'and {count} more',
	'integrity.usedIn.collectionDegraded': 'Could not check "{collection}" ({reason}).',
	// Translation of `VegaErrorKind` (plus `'unknown'`, see `ReferenceMatchDegraded`) into the
	// human reason that fills `integrity.usedIn.collectionDegraded` — NEVER the raw `VegaError`
	// `message` (P1 §5: it may carry backend syntax/URLs).
	'integrity.usedIn.reason.forbidden': 'no permission to read this collection',
	'integrity.usedIn.reason.network': 'no connection to the backend',
	'integrity.usedIn.reason.backend': 'the backend responded with something unexpected',
	'integrity.usedIn.reason.not-found': 'the collection no longer exists',
	'integrity.usedIn.reason.auth-expired': 'the session expired mid-check',
	'integrity.usedIn.reason.validation': 'the query is not valid against this backend',
	'integrity.usedIn.reason.unknown': 'unknown reason',

	// ————— References warning BEFORE deleting (same engine, `DeleteConfirm`/`MediaDeleteConfirm`) —————
	'integrity.deleteGuard.checking': 'Checking for references…',
	'integrity.deleteGuard.checkFailed':
		'Could not check for active references; you can still delete.',
	'integrity.deleteGuard.warning': 'There are active references to this. Delete it knowingly:',
	// Only shown when some reference is BY RELATION (`hasRelationMatches`, code-review fix against
	// PocketBase 0.39.6): PocketBase clears those fields the instant you delete, and restoring from
	// the trash does NOT reconnect them — text/URL references DO benefit from the id being alive
	// again, so this line would be false for them and stays hidden in that case.
	'integrity.deleteGuard.relationWarning':
		'When you delete this, PocketBase clears those relations right away (empties the field or removes the id from the array). If you restore this record from the trash later, those links will NOT come back.',
	'integrity.deleteGuard.confirmCheckbox':
		'I understand there are active references and I want to delete anyway.',

	// ————— Version history (`#lote-integridad`, Phase B) — editor panel —————
	'revisions.panel.toggle': 'History',
	'revisions.panel.loading': 'Loading history…',
	'revisions.panel.empty': 'No saved versions yet.',
	'revisions.panel.error': 'Could not load the history.',
	'revisions.panel.retry': 'Retry',
	'revisions.panel.unavailable': 'Version history is not enabled for this project.',
	'revisions.panel.unknownDate': 'Unknown date',
	'revisions.panel.unknownAuthor': 'someone',
	'revisions.restoredToast': 'Values loaded into the form. Review and save to keep them.',

	// ————— Version history — diff of one revision —————
	'revisions.diff.back': 'Back to history',
	'revisions.diff.loading': 'Comparing versions…',
	'revisions.diff.error': 'Could not compare this version.',
	'revisions.diff.noChanges': 'No differences with the current version.',
	'revisions.diff.restore': 'Restore into the form',
	'revisions.diff.empty': '(empty)',
	'revisions.diff.absent': '(did not exist)',
	'revisions.diff.relationCount': '{count} linked',
	'revisions.diff.retry': 'Retry',

	// ————— Version history — Settings (bootstrap + retention + count) —————
	'revisions.settings.title': 'History and trash',
	'revisions.settings.description':
		'Keeps a previous version of each record before it gets overwritten, so it can be compared or recovered.',
	'revisions.settings.count': '{count} version(s) saved right now.',
	'revisions.settings.countError': 'Could not get the version count.',
	'revisions.settings.enabled': 'History enabled',
	'revisions.settings.keepPerRecord': 'Versions to keep per record',
	'revisions.settings.trashDays': 'Days in the trash',
	'revisions.settings.save': 'Save retention',
	'revisions.settings.saving': 'Saving…',
	'revisions.settings.creatableBody':
		'The "vega_revisions" collection does not exist yet on this backend.',
	'revisions.settings.create': 'Create history collection',
	'revisions.settings.confirmBody':
		'Vega is going to create the "vega_revisions" collection in your PocketBase. Continue?',
	'revisions.settings.confirm': 'Create collection',
	'revisions.settings.creating': 'Creating…',
	'revisions.settings.manualBody':
		'The "vega_revisions" collection cannot be created automatically. In the PocketBase Admin: Collections → Import collections, paste the JSON below and confirm.',
	'revisions.settings.staleReadError':
		'Could not check the current manifest before saving. Try again: nothing was saved.',

	// ————— Trash (`#lote-integridad`, Phase B2) — shared line in the 4 delete dialogs —————
	'revisions.trash.deleteHint': 'You can recover this from the trash for {days} day(s).',
	'revisions.trash.deleteHintUnavailable':
		'This deletion will be PERMANENT: the trash is not enabled on this project.',
	'revisions.trash.deleteFilesHint':
		'Attached files are not recovered, even if you restore the record.',

	// ————— Trash — /trash route —————
	'revisions.trash.pageTitle': 'Trash',
	'revisions.trash.description':
		'Deleted records and assets. You can restore them with their original id as long as they are still within the retention set in Settings.',
	'revisions.trash.loading': 'Loading trash…',
	'revisions.trash.error': 'Could not load the trash.',
	'revisions.trash.retry': 'Retry',
	'revisions.trash.unavailable': 'The trash is not enabled on this project.',
	'revisions.trash.empty': 'The trash is empty.',
	'revisions.trash.itemCollection': 'Collection: {collection}',
	'revisions.trash.itemFilesLost': 'Had attached files: they will not be restored.',
	'revisions.trash.restore': 'Restore',
	'revisions.trash.restoring': 'Restoring…',
	'revisions.trash.restoreUnavailable':
		'This backend does not allow restoring with the original id: "Restore" is not available.',
	'revisions.trash.restoreUnknownSchema':
		'The "{collection}" collection no longer exists in the schema: it cannot be safely restored.',
	// `requiredFileFieldName` (`revisions/restore.ts`): no `file` field survives a restore (PB
	// destroys the binary on delete, §0.3), so a collection with a REQUIRED one can never be fully
	// recreated — derived from the schema, not a special case for "vega_media".
	'revisions.trash.restoreBlockedRequiredFile':
		'The "{field}" field in "{collection}" is a required file: files are never restored (§0.3), so this record cannot be fully recreated. "Restore" is not available.',
	'revisions.trash.restoreSuccess': '"{label}" has been restored.',
	'revisions.trash.deleteForever': 'Delete permanently',
	'revisions.trash.deleteForeverConfirmTitle': 'Permanently delete "{label}"?',
	'revisions.trash.deleteForeverConfirmBody':
		'This trash entry will be gone for good: you will no longer be able to restore this record.',
	'revisions.trash.deleteForeverConfirm': 'Delete permanently',
	'revisions.trash.deleteForeverDeleting': 'Deleting…',
	'revisions.trash.deleteForeverSuccess': '"{label}" has been permanently deleted from the trash.',
	'revisions.trash.emptyTrash': 'Empty trash',
	'revisions.trash.emptyTrashConfirmTitle': 'Empty the trash?',
	'revisions.trash.emptyTrashConfirmBody':
		'The {count} trash entries will be permanently deleted: you will no longer be able to restore any of these records.',
	'revisions.trash.emptyTrashConfirm': 'Empty trash',
	'revisions.trash.emptyTrashEmptying': 'Emptying…',
	'revisions.trash.emptyTrashSuccess': 'Trash emptied.',
	// A failure cut the `emptyTrash` loop mid-way (revisions/empty-trash.ts): never "emptied"
	// while something is left — says what really happened, `remaining` is the backend's last
	// reliable count.
	'revisions.trash.emptyTrashPartial':
		'{deleted} entry/entries deleted; {remaining} left because of an error. Try again.',

	// ————— Media: grid + detail (Phase P6·6b) —————
	'media.detail.title': 'Edit media',
	'media.detail.alt': 'Alt text',
	'media.detail.titleLabel': 'Title',
	'media.detail.tags': 'Tags',
	'media.detail.tagPlaceholder': 'Add a tag…',
	'media.detail.tagInputLabel': 'New tag',
	'media.detail.addTag': 'Add',
	'media.detail.removeTag': 'Remove «{tag}»',
	'media.detail.saveSuccess': 'Media updated.',

	// ————— Media: delete (Phase P6·6d) —————
	// D-P6.5/audit H3: the media model COPIES bytes, it never references (`filePerRecord`) —
	// deleting the original from the library does not break copies already inserted into records.
	// Since `#lote-integridad` Phase A, `MediaDeleteConfirm` also checks vía (b) of the reference
	// engine (`contains <filename>` on text/richtext fields): the generic warning below is still
	// true for copies, but a direct URL pasted by hand into a text field CAN break — that's what
	// the `integrity.deleteGuard.*` keys warn about.
	'media.detail.delete': 'Delete',
	'media.delete.confirmTitle': 'Delete "{label}"?',
	'media.delete.confirmBody':
		'This deletes the original from the library. Copies already inserted by the library into records are not affected.',
	'media.delete.confirm': 'Delete',
	'media.delete.deleting': 'Deleting…',
	'media.delete.success': '"{label}" was deleted from the library.',

	// ————— Media: replace file (`#lote-integridad`, Phase A) —————
	// CORRECTED premise (see contract header): PB renames the stored file with a random suffix, so
	// "keeps its URL" CANNOT be promised — only the record's id and metadata (`alt`/`title`/`tags`)
	// survive, which is why `warningIdentity`/`warningUrl` are two SEPARATE messages and neither
	// mentions caching (not applicable: the URL changes name, not value).
	'media.detail.replace': 'Replace file',
	'media.replace.rejectedTooLarge': 'The chosen file exceeds the maximum allowed size.',
	'media.replace.rejectedInvalidType': 'The chosen file is not an allowed type.',
	'media.replace.confirmTitle': 'Replace the file of «{label}»?',
	'media.replace.warningIdentity':
		'The record keeps its id and its metadata (alt, title, tags): any reference by relation stays valid.',
	'media.replace.warningUrl':
		'The direct file URL WILL CHANGE: anyone with it pasted by hand will lose it.',
	'media.replace.usedInIntro': 'This is what used the current URL, before replacing it:',
	'media.replace.confirm': 'Replace',
	'media.replace.replacing': 'Replacing…',
	'media.replace.success': 'File replaced. The direct URL has changed.',

	// ————— Media: library header + toolbar («aquelarre-medios» redesign) —————
	// The header count is the library TOTAL (`totalItems` of the listing), never the page's nor the
	// filter's. The mockup also shows the total weight in MB: Vega does not know it (§4.4, the port
	// does not expose the size of an already stored file) and does not make it up.
	'media.meta.files': 'files',
	'media.search.placeholder': 'Search by file name…',
	'media.search.ariaLabel': 'Search the library by file name',
	'media.filter.groupLabel': 'Filter by type',
	'media.filter.all': 'All',
	'media.filter.images': 'Images',
	'media.filter.video': 'Video',
	'media.filter.documents': 'Documents',
	'media.filter.empty': 'No file on this page matches the search or the chosen type.',
	'media.filter.clear': 'Clear filters',

	// ————— Media: selection bar («aquelarre-medios» redesign) —————
	// No "Insert" (see `MediaSelectionBar.svelte`): inserting into a field only exists when the
	// library is opened as a picker from a form (`MediaPicker`).
	'media.selection.toggle': 'Select «{label}»',
	// Two keys instead of a "(s)" — see the Spanish file. In English both read the same, but the
	// key pair has to exist in every locale (es/en parity is a test).
	'media.selection.labelOne': 'selected',
	'media.selection.labelMany': 'selected',
	'media.selection.copy': 'Copy URL',
	'media.selection.copySuccess': '{count} URL(s) copied to the clipboard.',
	'media.selection.copyError': 'Could not copy to the clipboard.',
	'media.selection.delete': 'Delete',
	'media.selection.deleteTitle': 'Delete {count} files from the library?',
	'media.selection.deleteSuccess': '{count} file(s) deleted from the library.',

	// ————— Media: drag&drop upload (Phase P6·6c) —————
	'media.upload.inputLabel': 'Upload files',
	'media.upload.button': 'Upload files',
	// Drop band (mockup `.dropzone`), split up because each part is painted differently: the
	// gesture in bold and the limit in `--mono` (canonical value). `{max}` comes from the REAL
	// `vega_media` schema (`file.maxSizeBytes`), never from a hand-written constant.
	'media.upload.dropzoneLead': 'Drag files here or',
	'media.upload.dropzoneAction': 'click to pick them',
	'media.upload.dropzoneMax': 'max. {max}',
	'media.upload.dropzoneMaxSuffix': 'per file',
	'media.upload.retry': 'retry',
	'media.upload.status.pending': 'Pending',
	'media.upload.status.uploading': 'Uploading…',
	'media.upload.status.done': 'Uploaded',
	'media.upload.status.error': 'Error: {message}',
	'media.upload.reason.tooLarge': 'exceeds the maximum allowed size',
	'media.upload.reason.invalidType': 'file type not allowed',
	'media.upload.aborted':
		'upload cancelled: an earlier file in the batch failed (connection/permission)',
	'media.upload.summary': '{uploaded} file(s) uploaded, {failed} failed.',

	// ————— Media: library picker (Phase P6·6e) —————
	// D-P6.6/L-P6.8: the picker COPIES bytes (a record never references a `vega_media` asset), so
	// the notice is honest about exactly that (D-P6.7, byte duplication is accepted in v1).
	'media.picker.title': 'Choose from the library',
	'media.picker.copyNotice': 'A copy of the chosen file will be inserted into this field.',
	'media.picker.searchLabel': 'Search by title or alt text',
	'media.picker.searchPlaceholder': 'Search…',
	'media.picker.empty': 'No asset matches the search or the allowed file type.',
	'media.picker.selectedCount': '{count} selected',
	'media.picker.insert': 'Insert',
	'media.picker.inserting': 'Inserting…',

	// ————— Warnings (P2's L10) —————
	'warnings.title': 'Model warnings',
	'warnings.empty': 'No warnings.',

	// ————— Settings / manifest editor (§3.5 of the P3 contract) —————
	'settings.reload': 'Reload model',
	'settings.reloading': 'Reloading…',
	'settings.saveSuccess': 'Manifest saved.',
	'settings.loadErrorBody': 'Could not load Settings. Try again.',

	// ————— Schema authoring ("schema" batch, Phase 1): create collections/add fields —————
	// Visible only when `capabilities.schemaBootstrap`/`schemaFieldBootstrap` allow it (law of
	// capabilities) — without superuser, this whole section is not offered (same gate as the
	// manifest editor, see L6c below). See `SchemaAuthoringPanel.svelte`.
	'settings.schema.title': 'Schema',
	'settings.schema.description':
		'Create new collections or add fields to one that already exists. Strictly additive: it never renames or deletes anything (in PocketBase that destroys the column and its data, with no undo).',
	'settings.schema.create.title': 'Create collection',
	'settings.schema.create.nameLabel': 'Collection name',
	'settings.schema.create.namePlaceholder': 'e.g. posts',
	'settings.schema.create.nameInvalid':
		'Must start with a letter and use only letters, digits or underscore.',
	'settings.schema.create.submit': 'Create collection',
	'settings.schema.create.submitting': 'Creating…',
	'settings.schema.create.nameReserved':
		'That name belongs to Vega ("vega" and anything starting with "vega_"): those collections are created and maintained by Vega itself. Pick another one.',
	'settings.schema.create.success': 'Collection "{name}" created.',
	'settings.schema.create.alreadyExists':
		'Collection "{name}" already existed: it was not modified (an existing collection is never overwritten). Use "Add fields" to extend it.',
	'settings.schema.addFields.title': 'Add fields',
	'settings.schema.addFields.targetLabel': 'Collection',
	'settings.schema.addFields.targetPlaceholder': 'Choose a collection…',
	'settings.schema.addFields.submit': 'Add fields',
	'settings.schema.addFields.submitting': 'Adding…',
	'settings.schema.addFields.success': '{count} field(s) added to "{collection}".',
	'settings.schema.addFields.noneAdded':
		'No new fields: all of the ones listed already existed in "{collection}" and were left untouched.',
	'settings.schema.addFields.empty':
		'There are no collections of your own yet. Create one first in "Create collection".',
	'settings.schema.fields.nameLabel': 'Field name',
	'settings.schema.fields.namePlaceholder': 'e.g. title',
	'settings.schema.fields.typeLabel': 'Type',
	'settings.schema.fields.requiredLabel': 'Required',
	'settings.schema.fields.maxLabel': 'Max length (optional)',
	'settings.schema.fields.addRow': 'Add field',
	'settings.schema.fields.removeRow': 'Remove field',
	// Real PocketBase landmine, already caught in production: a required `number` rejects the
	// value 0 (PB treats "required" as "different from the zero-value", and 0 IS the zero-value
	// of number). A warning, not a block: there are legitimate ranges that need 0 (e.g. a 0-5
	// rating) without marking the field as required.
	'settings.schema.fields.numberRequiredWarning':
		'PocketBase rejects the value 0 on a number field marked as required. If you need to allow 0 (e.g. a 0-5 rating), do not mark the field as required.',
	'settings.schema.fields.type.text': 'Text',
	'settings.schema.fields.type.number': 'Number',
	'settings.schema.fields.type.bool': 'Yes/No',
	'settings.schema.fields.type.date': 'Date',
	'settings.schema.fields.type.json': 'JSON',
	'settings.schema.error': 'Error: {message}',
	// JS migration emitted after a successful create/add (schema batch, half 2): without this,
	// every schema edit made from Vega drifts production away from the repo SILENTLY.
	'settings.schema.migration.title': 'Migration generated',
	'settings.schema.migration.instructions':
		'Save this file as pb_migrations/{filename} in your project repository and commit it: without it, this schema change only exists in your PocketBase, not in your version control.',
	'settings.schema.migration.copy': 'Copy',
	'settings.schema.migration.copied': 'Copied',

	// ————— Editor role (batch L6c): manifest-editing gate —————
	// Without `schemaBootstrap` (auth collection other than `_superusers`) an editor cannot
	// introspect nor create/migrate schema — editing the manifest is, by definition, a superuser
	// operation. See `computeCollectionState`/`Capabilities.schemaBootstrap`.
	'settings.manifest.editorGateTitle': 'Content model',
	'settings.manifest.editorGateBody':
		'Editing the manifest requires an administrator (superuser) account. Ask whoever administers this PocketBase to adjust the content model from this same panel.',

	// ————— Appearance: theme + mode picker (Phase F7w-a, "turning the themes on") —————
	'settings.appearance.title': 'Appearance',
	'settings.appearance.theme': 'Theme',
	'settings.appearance.mode': 'Mode',
	'settings.appearance.light': 'Light',
	'settings.appearance.dark': 'Dark',

	// ————— About (P8·F2) —————
	'settings.about.title': 'About',
	'settings.about.line': 'Vega v{version} · PocketBase {pbServer}',

	// ————— Update check (P8, opt-in): see `update/check-update.ts` —————
	'settings.about.checkUpdate': 'Check for updates',
	'settings.about.checking': 'Checking…',
	'settings.about.upToDate': "You're on the latest version (v{version}).",
	'settings.about.updateAvailable': 'A new version is available: v{version}.',
	'settings.about.updateAvailableLink': 'View the release',
	'settings.about.checkError': "Couldn't check (check your connection).",
	'settings.about.autoCheckLabel': 'Automatically check for updates on startup',
	'settings.about.autoCheckHelp':
		"Turning this on makes Vega contact api.github.com every time you open the app, to see if there's a new version. Off by default: Vega never reaches out to the internet unless you ask it to.",

	// ————— Update available banner (`UpdateBanner.svelte`, P8) —————
	'update.banner.message': 'A new version of Vega is available: v{version}.',
	'update.banner.link': 'View the release',
	'update.banner.dismiss': 'Dismiss update notice',

	// ————— Toasts (§2.3) —————
	'toast.dismiss': 'Dismiss notification',

	// ————— Generic —————
	'common.retry': 'Retry',
	'common.cancel': 'Cancel',
	'common.close': 'Close',
	'common.loading': 'Loading…'
};
