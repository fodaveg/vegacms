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
	'nav.editors': 'Editors',
	'nav.backups': 'Backups',
	'nav.settings': 'Settings',
	'nav.sidebarLabel': 'Main navigation',
	'nav.warningsBadge': '{count} warnings',
	'nav.singletonManyRecords':
		'"{label}" only allows a single entry, but has {count}. Editing the first one.',
	'nav.readonlyBadge': 'Read only',
	// Empty home/sidebar for editors (no admin rights): they cannot create content types or use
	// Settings, so they are told what to do instead.
	'nav.emptyBodyEditor': 'There is no content to edit yet. Talk to whoever manages the site.',

	// ————— Home (`/`) —————
	'home.title': 'Home',
	'home.create.title': 'Create',
	'home.create.button': 'New: {label}',
	'home.pending.title': 'To do',
	'home.pending.drafts': '{label} in draft',
	'home.pending.scheduled': '{label} scheduled to publish',
	'home.pending.description': '{label} without a description',
	'home.pending.mediaAlt': 'Media without alt text',
	'home.pending.unpublished': 'Unpublished changes on the site',
	'home.pending.unpublishedYes': 'Yes',
	'home.pending.unpublishedNo': 'No',
	'home.recent.title': 'What you edited last',
	'home.recent.emptyTitle': "You haven't edited anything yet",
	'home.recent.emptyBody': 'What you edit in this browser will show up here so you can pick it up.',
	'home.recent.errorTitle': "Couldn't load what you edited last",
	'home.recent.errorBody': 'The server replied: {message}',
	'home.recent.column.title': 'Title',
	'home.recent.column.type': 'Type',
	'home.recent.column.status': 'Status',
	'home.recent.column.edited': 'Edited',

	// ————— Topbar —————
	'topbar.logout': 'Log out',
	'topbar.menu.open': 'Open navigation',
	'topbar.menu.close': 'Close navigation',
	'topbar.sidebarCollapse.collapse': 'Collapse the sidebar',
	'topbar.sidebarCollapse.expand': 'Expand the sidebar',
	'topbar.density.toggleLabel': 'Density',
	'topbar.density.comfortable': 'Comfortable',
	'topbar.density.compact': 'Compact',
	'topbar.connection.connected': 'Connected',
	'topbar.connection.disconnected': 'Disconnected',
	'topbar.connection.retrying': 'Retrying…',
	'topbar.connection.retry': 'Retry',
	'topbar.search.ariaLabel': 'Global search',
	'topbar.search.placeholder': 'Search all content…',
	'topbar.search.results': 'Global search results',
	'topbar.search.searching': 'Searching…',
	'topbar.search.empty': 'No results for “{q}”',
	'topbar.search.error': 'Search failed. Check your connection and try again.',
	'topbar.search.minChars': 'Type at least {count} characters',
	'topbar.search.seeAll': 'See the remaining {count}',
	'topbar.search.partial': 'Could not search {count} content type(s).',
	'topbar.avatar.label': 'Signed in as {email}',
	// User chip → "Settings" menu (#l12-ux, item 3): label of the trigger button itself, DIFFERENT
	// from `topbar.avatar.label` above (that one describes the session identity of the inner
	// `<span role="img">`; this one describes the ACTION of opening the menu).
	'topbar.userMenu.toggle': 'Account menu',
	// The «Vega» brand in the bar is a link to the home page (batch 12, plate 1, state 1.7).
	'topbar.home.label': 'Home',

	// ————— Publish ("publication" batch, phase A): `PublishButton.svelte` —————
	// Absent entirely (see the component header) when the connected project didn't declare
	// `build` in its discovery — these keys only render when the feature actually exists.
	'topbar.publish.loading': 'Checking publish status…',
	'topbar.publish.unavailableDenied': 'Publishing unavailable: your account has no permission',
	'topbar.publish.unavailableOffline': 'Publishing unavailable: the server cannot be reached',
	'topbar.publish.running': 'Publishing…',
	'topbar.publish.failed': 'Retry publish',
	'topbar.publish.noChanges': 'No changes',
	'topbar.publish.ok': 'Site up to date',
	'topbar.publish.ready': 'Publish',
	'topbar.publish.viewLog': 'View log',
	'topbar.publish.triggerError': 'Could not start the publish.',
	'topbar.publish.lastPublished': 'Last published: {date}',
	'topbar.publish.again': 'Publish again',

	// ————— Login / session —————
	'login.title': 'Sign in to Vega',
	'login.email': 'Email',
	'login.password': 'Password',
	'login.submit': 'Sign in',
	'login.submitting': 'Signing in…',
	'login.invalidCredentials': 'Invalid credentials.',
	'login.networkError': 'Could not connect to the server. Check your connection.',
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
	'session.reloginBackToPassword': 'Back to password',
	'session.logoutConfirm': 'There are unsaved changes. Log out anyway?',
	// `ReloginModal.svelte`: whoever signed back in is not who held the session that expired.
	'session.reloginOtherAccount':
		'You signed in with a different account. Vega needs to reload so its work is not mixed with the previous session; anything left unsaved is lost.',
	'session.reloginReload': 'Reload',

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
	// `authCollection` (batch L6c): override for the auth collection used by the `pocketbase`
	// adapter. Empty/absent ⇒ project discovery/configuration and, only if neither declares one,
	// the runtime's compatible fallback.
	'connect.authCollectionLabel': 'Authentication collection',
	'connect.authCollectionPlaceholder': 'vega_editors',
	'connect.authCollectionHint':
		'Leave blank to use the collection advertised by the project. Fill it only to keep an override for this browser.',
	'connect.current.authCollectionResolving': 'Resolving the authentication collection…',
	'connect.current.authCollectionEffective':
		'Effective authentication collection: {authCollection}',

	// ————— Account security (L6: TOTP, recovery and passkeys) —————
	'security.title': 'Account security',
	'security.description': 'Manage two-step verification and passkeys for this account.',
	'security.refresh': 'Refresh',
	'security.loading': 'Loading security factors…',
	'security.error.generic': 'The security operation could not be completed.',
	'security.error.stepUpRequired': 'You need to confirm it is you to change this.',
	'security.error.invalidCode':
		'The code is not valid. Wait for the app to show the next one and try again.',
	'security.error.locked': 'Too many attempts. Wait a few minutes and try again.',
	'security.error.lockedWait': 'Too many attempts. Wait {minutes} min and try again.',
	'security.error.payloadTooLarge':
		'The passkey response is too large and the server did not accept it. Try another passkey.',
	'security.error.attemptFailed':
		'The server could not record the attempt and did not check it. Try again in a moment.',
	'security.error.passkeyVerifyFailed':
		'The passkey could not be verified. Try again or use another method.',
	'security.error.noPasskeys': 'This account has no registered passkeys.',
	'security.error.enrollmentExpired': 'The setup has expired. Start again.',
	'security.error.notEnrolled':
		'The setup was discarded because the passkeys of the account changed. Start again.',
	'security.stepUp.title': 'Confirm it is you',
	'security.stepUp.bodyTotp':
		'To change this, enter the code your authenticator app is showing now.',
	'security.stepUp.bodyPasskey': 'To change this, confirm with one of your passkeys.',
	'security.stepUp.bodyBoth':
		'To change this, enter the code your authenticator app is showing now or confirm with a passkey.',
	'security.stepUp.unavailable':
		'Your identity cannot be confirmed from here. Sign out, sign back in with your second step and repeat the change.',
	'security.stepUp.confirm': 'Confirm',
	'security.stepUp.working': 'Checking…',
	'security.stepUp.usePasskey': 'Use passkey',
	'security.status.enabled': 'Enabled',
	'security.status.disabled': 'Disabled',
	'security.totp.title': 'Authenticator app (TOTP)',
	'security.totp.enabled': 'The authenticator app is enabled.',
	'security.totp.enabledNoCodes':
		'The authenticator app is now enabled, but the recovery codes could not be created. Press "Regenerate codes" to get them and save them.',
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
	'security.totp.replace': 'Change app',
	'security.totp.replaceBody':
		'Your current app stays active and you will keep being asked for its code until you confirm one from the new app.',
	'security.totp.replaceCancel': 'Keep the current app',
	'security.totp.replaced': 'The authenticator app has been changed.',
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
	'security.passkeys.cloneWarning':
		'This passkey may have been copied to another device. Delete it and register it again.',

	// ————— Global transport states (§3.4) —————
	'errors.network.title': 'No connection to the server',
	'errors.network.body': 'The server could not be reached. Check your connection.',
	'errors.network.retry': 'Retry',
	'errors.banner.detailShow': 'Show details',
	'errors.banner.detailHide': 'Hide details',
	'errors.backend.title': 'The server returned something unexpected',
	'errors.forbidden.title': "You don't have permission",
	'errors.forbidden.body': "Your session can't access this resource.",
	'errors.forbidden.readonlyType.body':
		'"{label}" is read-only: no new content can be created here.',
	'errors.forbidden.noCreate.body': 'You do not have permission to create content in "{label}".',
	'errors.forbidden.noList.body': 'You do not have permission to view the content of "{label}".',
	'errors.forbidden.noView.body': 'You do not have permission to view this item of "{label}".',
	'errors.notFoundType.title': 'Content not found',
	'errors.notFoundType.body': 'The content type "{type}" does not exist (or is hidden).',
	'errors.notFoundRecord.title': 'Item not found',
	'errors.notFoundRecord.body': 'This item no longer exists.',
	'errors.notFoundRecord.backToList': 'Back to list',
	'errors.backToIndex': 'Back to Home',
	// ————— Merged views (mergedViews, Phase L7c) —————
	'errors.notFoundView.title': 'View not found',
	'errors.notFoundView.body': 'The merged view "{view}" does not exist.',

	// ————— Record editor (P5 contract, Phase F5-a) —————
	// `editor.create.title`/`editor.edit.title`: since redesign C2's R7, these only feed the
	// VISUALLY HIDDEN `<h1>` of `RecordForm.svelte` (heading-hierarchy a11y) — the editor's visible
	// title is now the `EditTopBar` crumb, not an on-screen heading.
	'editor.create.title': 'New {label}',
	'editor.edit.title': 'Edit «{label}»',
	'editor.save': 'Save',
	'editor.saving': 'Saving…',
	'editor.saveSuccess': 'Saved.',
	'editor.duplicate': 'Duplicate',
	'editor.duplicating': 'Duplicating…',
	'editor.duplicate.saveFirst': 'Save your changes before duplicating.',
	'editor.duplicate.success': 'Page and blocks duplicated.',
	'editor.leaveConfirm': 'There are unsaved changes. Leave anyway?',
	'editor.readonlyNotice': 'This content is read-only: it cannot be edited.',
	'editor.noUpdateNotice':
		'You do not have permission to edit this content: you can view it, but not save changes.',
	'editor.load.error.body': 'Could not load this item. {message}',

	// ————— Concurrent-edit notice (`ConflictNotice.svelte`, audit sheet p1): the save failed
	// closed because the record changed on the server after it was opened.
	'editor.conflict.title': '“{name}” changed while you were editing it',
	'editor.conflict.titleNarrow': '“{name}” changed',
	'editor.conflict.byAuthor': 'Saved by {author} at {time}.',
	'editor.conflict.byAuthorNoTime': 'Saved by {author}.',
	'editor.conflict.atTime': 'Another version was saved at {time}.',
	'editor.conflict.unknown': 'Another version was saved while you were editing.',
	'editor.conflict.nothingSaved':
		'Nothing of yours has been saved yet: your changes are still in the form.',
	'editor.conflict.showDiff': 'Show differences',
	'editor.conflict.hideDiff': 'Hide differences',
	'editor.conflict.discard': 'Discard my changes and reload',
	'editor.conflict.discardNarrow': 'Discard and reload',
	'editor.conflict.force': 'Save anyway',
	'editor.conflict.diffHead': 'If you save anyway, this is the result:',
	'editor.conflict.noDiff':
		'No differences in editable fields: the change was in data managed by the server.',
	'editor.conflict.scope.both': 'You both changed it',
	'editor.conflict.scope.server': 'Changed only on the server',
	'editor.conflict.scope.mine': 'Only you',
	'editor.conflict.error.title': 'Could not save',
	'editor.conflict.error.body':
		'{message} Your changes are still in the form; nothing was overwritten.',
	'editor.conflict.topbar': 'changed on the server',

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
	'editor.preview.panel.savedOnly':
		'You are viewing the saved version: you do not have permission to edit this item, so your changes are not previewed.',

	// ————— Visual editor screen (see `es.ts` for the full rationale) —————
	'editor.visual.open': 'Visual editor',
	'editor.visual.title': 'Visual editor',
	'editor.visual.back': 'Back to the form',
	// Page status in the visual editor header (`VisualPublishControl.svelte`, audit sheet p2).
	// Worded DIFFERENTLY from the top bar's «Publish» (`topbar.publish.*`, which rebuilds the site):
	// this only changes the record's `statusField` value.
	'editor.visual.status.groupLabel': 'Page status',
	'editor.visual.status.publish': 'Mark as published',
	'editor.visual.status.unpublish': 'Switch to draft',
	'editor.visual.status.changing': 'Changing status…',
	'editor.visual.status.error.publish': 'Could not mark as published',
	'editor.visual.status.error.unpublish': 'Could not switch to draft',
	'editor.visual.status.error.conflict':
		'The page changed on the server: check its status before trying again',
	'editor.visual.status.confirm.title.many': '{count} blocks not saved',
	'editor.visual.status.confirm.body':
		'The page will be published with what was last saved. Those changes will not go out until you save them.',
	'editor.visual.status.confirm.publish': 'Publish anyway',
	'editor.visual.review.title.one': 'Before publishing: 1 warning',
	'editor.visual.review.title.many': 'Before publishing: {count} warnings',
	'editor.visual.review.title.mixed': 'Before publishing',
	'editor.visual.review.title.incomplete': 'Before publishing: incomplete review',
	'editor.visual.review.body':
		'No warning prevents publishing. You can publish anyway or fix them first.',
	'editor.visual.review.checking.title': 'Reviewing the page…',
	'editor.visual.review.checking.body':
		'It takes a moment. You can wait or publish without the review.',
	'editor.visual.review.skipWait': 'Publish without waiting',
	'editor.visual.review.error': 'The page could not be reviewed',
	'editor.visual.review.canPublish': 'You can publish anyway.',
	'editor.visual.review.scrollLabel': 'Review details before publishing',
	'editor.visual.review.scrollMore': 'Scroll to see more',
	'editor.visual.status.success': '“{name}” is now “{label}”.',
	'editor.visual.status.success.rebuild': 'It will show on the site after the next publish.',
	'editor.visual.frameTitle': 'The site page, inside the visual editor',
	'editor.visual.connecting': 'Connecting to the site…',
	'editor.visual.connected.many': 'Connected to the site: {count} blocks on the page.',
	'editor.visual.token.error': 'Could not load the site page: {message}',
	'editor.visual.error.noBridge.title':
		'This site does not have the visual editing bridge installed',
	'editor.visual.error.noBridge.body':
		'Vega got no response from the page. The usual preview still works, and so does the form.',
	'editor.visual.error.protocolVersion.title': 'The site speaks another version of the bridge',
	'editor.visual.error.protocolVersion.body':
		'The page uses "{found}" and Vega understands "{expected}". One of the two needs updating.',
	'editor.visual.error.siteError.title': "The site's bridge cannot do its job",
	'editor.visual.error.siteError.body': 'The page reported the code "{code}".',
	'editor.visual.error.recordMismatch.title': 'The preview is showing a different record',
	'editor.visual.error.recordMismatch.body':
		"The page says it's rendering {collection}/{id}, which is not the one you're editing.",
	'editor.visual.error.badPreviewUrl.title': "The preview's address does not work",
	'editor.visual.error.badPreviewUrl.body':
		"Without a valid address there's no way to check where the site's messages come from, so the visual editor will not start.",
	'editor.visual.unavailable.title': 'This project has no visual editor',
	'editor.visual.unavailable.noPreview':
		'The connected site does not declare a preview, which is what the visual editor hangs off.',
	'editor.visual.unavailable.noVisualEditing':
		'The connected site does not advertise visual editing. It needs the bridge installed and declared in its discovery.',
	'editor.visual.unavailable.noBlocks':
		'The content type "{label}" is not made of blocks, so there is nothing to select on the canvas.',
	// "Text only" mode (batch 12, sheet 8), see `es.ts` for the full rationale.
	'editor.visual.texts.title': 'Text only',
	'editor.visual.texts.intro':
		'Here you can fix the text of each section. To see the page, move sections or change images you need a window 900px wide or more.',
	'editor.visual.texts.rest.one':
		'This section has 1 more field ({fields}) that is edited on a wide screen or in the form.',
	'editor.visual.texts.rest.many':
		'This section has {count} more fields ({fields}) that are edited on a wide screen or in the form.',
	'editor.visual.texts.none':
		'This section has no text. It is edited on a wide screen or in the form.',
	'editor.visual.texts.hiddenErrors':
		'Could not save: there is an error in {fields}, which is not edited here. Fix it on a wide screen or in the form.',
	'editor.visual.texts.empty.title': 'This page has no sections yet',
	'editor.visual.texts.empty.body':
		'To add the first one you need a window 900px wide or more, or the form.',
	// ————— Selection outlines (`VisualOverlay.svelte`), see `es.ts` for the full rationale —————
	'editor.visual.overlay.waiting': 'Waiting for the page to describe its blocks…',
	'editor.visual.overlay.empty': 'This page has no blocks to select yet.',
	'editor.visual.overlay.skipped.many':
		"{count} blocks the site described badly: can't be selected.",
	'editor.visual.overlay.missing.many': "{count} blocks that exist but the site isn't rendering.",
	'editor.visual.overlay.unsupported': 'unsupported',
	// Block the SITE says is not public (bridge `unpublished`): see `es.ts` for the rationale.
	'editor.visual.unpublished': 'Not public',
	// "Draggable block palette" task: the empty-canvas drop target, ONLY while a palette drag is in
	// flight (see `es.ts` for the full rationale).
	'editor.visual.overlay.emptyDrop': 'Drop here to create the first block',
	// ————— Block tree (`VisualBlockTree.svelte`) and inspector (`VisualInspector.svelte`): the
	// ACCESSIBLE way to select a block (the overlay above is `aria-hidden`) and the selected
	// block's form. See `es.ts` for the full rationale, incl. which existing keys are reused.
	'editor.visual.tree.title': 'Blocks',
	'editor.visual.tree.selectLabel': 'Select "{label}"',
	// The row's `aria-label` replaces its visible text, so the state has to be in it (see `es.ts`).
	'editor.visual.tree.selectLabelUnpublished': 'Select "{label}" (not public)',
	'editor.visual.tree.unavailable': 'Could not load the block tree.',
	// Selection announcement ("accessibility" task, D3): see `es.ts` for the full rationale (same
	// `aria-live` region as `editor.blocks.reorder.moved`).
	'editor.visual.tree.announceSelect': 'Block "{label}" selected, {position} of {total}',
	// Creation announcement ("draggable block palette" task, §6): same `aria-live` region, see
	// `es.ts` for the full rationale.
	'editor.visual.tree.announceCreate': 'Block "{label}" created, {position} of {total}',
	// ————— Structural tree actions ("structural actions from the visual editor" task): see
	// `es.ts` for the full rationale (same keys reused by the floating toolbar in
	// `VisualOverlay.svelte`).
	'editor.blocks.moveUpLabel': 'Move up «{label}»',
	'editor.blocks.moveDownLabel': 'Move down «{label}»',
	'editor.visual.overlay.toolbar.label': 'Actions for «{label}»',
	'editor.visual.overlay.insertLabel': 'Insert block at position {position} of {total}',
	'editor.visual.inspector.title': 'Inspector',
	'editor.visual.inspector.empty': 'Select a block in the tree or on the canvas to edit it here.',
	'editor.visual.inspector.unknownBlock':
		"The site points to a block that's no longer in this record.",

	// Column-width resize handles (David's request after using the visual editor in prod): one
	// between the tree and the canvas, another between the canvas and the inspector.
	'editor.visual.resize.tree': 'Resize the block tree',
	'editor.visual.resize.inspector': 'Resize the block panel',

	// ————— The finishing touches (screen sizes, zoom, shortcuts, save status): see the header of
	// `VisualEditorScreen.svelte` for why —————
	'editor.visual.breadcrumbs.label': 'Where you are',
	'editor.visual.screen.groupLabel': 'Screen size',
	'editor.visual.screen.mobile': 'Mobile',
	'editor.visual.screen.tablet': 'Tablet',
	'editor.visual.screen.desktop': 'Desktop',
	'editor.visual.screen.width': '{width} px',
	'editor.visual.zoom.groupLabel': 'Zoom',
	'editor.visual.zoom.level': '{percent} %',
	'editor.visual.zoom.fit': 'Fit',
	'editor.visual.help.toggle': 'Keyboard shortcuts',
	'editor.visual.help.title': 'Keyboard shortcuts',
	'editor.visual.help.deselect': 'Deselect the block',
	'editor.visual.help.move': 'Move the selected block up/down',
	'editor.visual.help.delete': 'Ask to delete the selected block',
	'editor.visual.help.save': 'Save the selected block',
	'editor.visual.help.toggleHelp': 'Open or close this panel',
	'editor.visual.help.asymmetry':
		'Moving, duplicating, deleting and adding blocks save on their own, the moment they happen. A block’s field text saves with the "Save" button on its panel.',
	// Singular of the `.many` keys above (confirm.title, connected, overlay.skipped,
	// overlay.missing): the caller picks with `count === 1`, like `list.export.success.one/many`.
	'editor.visual.status.confirm.title.one': '1 block not saved',
	'editor.visual.connected.one': 'Connected to the site: 1 block on the page.',
	'editor.visual.overlay.skipped.one': "1 block the site described badly: can't be selected.",
	'editor.visual.overlay.missing.one': "1 block that exists but the site isn't rendering.",

	// ————— Master-detail editor (final `aquelarre-detalle-post.html` mockup) —————
	// Sibling rail (`.rail`), metadata aside (`.kv`) and danger zone: GENERIC opt-in renderer
	// pieces — the aside card headings come from `fieldGroups` (manifest data), so only literals
	// that are NOT collection data live here.
	'editor.rail.label': 'Other items in the list',
	'editor.meta.title': 'Details',
	'editor.meta.id': 'Internal code',
	'editor.meta.created': 'Created',
	'editor.meta.updated': 'Updated',
	'editor.dangerZone.title': 'Danger zone',
	'editor.delete': 'Delete {label}…',
	'editor.slug.regenerate': 'Regenerate',

	// ————— Page model (`page` capability, p1 task `1dc63001`) —————
	// "Suggest route" (`RecordForm.svelte`, see its header): CREATION only, derives `/` +
	// slugify(current slug or title) — never resyncs after saving, see the header of
	// `ResolvedContentType.page` in `types.ts` for why.
	'editor.page.proposePath': 'Suggest route',

	// Redirect when the route of a PUBLISHED page changes (`RedirectOffer.svelte`, sheet C of
	// 2026-10-01). Routes are interpolated and the component renders them in `<code>`.
	'editor.redirect.groupLabel': 'Redirect from the old route',
	'editor.redirect.offer': 'Create a redirect from {from} to {to}',
	'editor.redirect.offerBody':
		'Anyone opening the old address will land on the new one. It is created on save.',
	'editor.redirect.declinedBody':
		'Without a redirect, anyone opening {from} will see "page not found".',
	'editor.redirect.chainOne':
		'A redirect already leads to the old route: {source} → {target}. On save it will lead straight to {to}, so nobody takes two hops.',
	'editor.redirect.chainMany':
		'{count} redirects already lead to the old route. On save they will lead straight to {to}, so nobody takes two hops:',
	'editor.redirect.conflict.title': 'A redirect from {from} already exists',
	'editor.redirect.conflict.body':
		'It leads to {target}. While the page was on that route it did nothing; as soon as you move it, it will start to act.',
	'editor.redirect.conflict.legend': 'What to do with the redirect that already exists',
	'editor.redirect.conflict.repoint': 'Change it to lead to {to}',
	'editor.redirect.conflict.keep': 'Leave it as it is: {from} will lead to {target}',
	'editor.redirect.removeLoop':
		'A redirect from {live} to {old} exists. It will be deleted on save: the page lives at {live} again and the redirect would go in circles.',
	'editor.redirect.removeShadow':
		'A redirect from {live} to {target} exists. It will be deleted on save: that address now belongs to the page.',
	'editor.redirect.failed.title': 'The page was saved, but the redirect was not',
	'editor.redirect.failed.body': '{from} no longer leads anywhere. The server replied: {message}',
	'editor.redirect.created': 'Redirect created from {from} to {to}.',
	'editor.redirect.repointed': 'Redirect from {from} changed to lead to {to}.',

	// ————— Scheduled publishing (`publishAtField`) —————
	// Default help of the "Publish on" field when the manifest declares none. Vega cannot tell
	// from the browser whether the server runs `vegaschedule`: the help says so.
	'editor.publishAt.help':
		'If it is a draft, it publishes itself at this time. This only works if the site has scheduled publishing turned on; without it, the date does nothing.',
	// VISIBLE notice under the field when the server will not honour it (`ContentModel.scheduledPublishing`).
	'editor.publishAt.inactive':
		'This site does not have scheduled publishing turned on: the date will not publish anything. Publish by hand or ask whoever manages the site to turn it on.',
	'editor.publishAt.unknown':
		'Could not check whether this server publishes scheduled dates (an administrator checks it when signing in to Vega). Until then, do not count on it publishing itself.',

	// ————— "Schedule…" next to the Status field (batch 12, sheet 2) —————
	'editor.schedule.open': 'Schedule…',
	'editor.schedule.change': 'Change date…',
	'editor.schedule.remove': 'Remove schedule',
	'editor.schedule.removed': 'Schedule removed.',
	'editor.schedule.removeFailed': 'Could not remove the schedule',
	'editor.schedule.publishNow': 'Publish now',
	// The `{when}` in sentences with a date is shown in bold; with no `{when}` there is no bold.
	'editor.schedule.summary': 'It will publish itself on {when}.',
	'editor.schedule.summaryUnconfirmed':
		'Date set for {when}; it has not been checked that the server will publish it.',
	'editor.schedule.overdue': 'It was due to be published on {when} and is still a draft.',
	// "Saved." + this sentence in the notice after scheduling.
	'editor.schedule.savedNote': 'It will be published on {when}.',
	'editor.schedule.when': '{date} at {time}',
	'editor.schedule.title': 'Schedule publication',
	'editor.schedule.description':
		'"{name}" stays a draft and publishes itself at the time you choose.',
	'editor.schedule.field': 'Publish on',
	'editor.schedule.hint': "This computer's time.",
	'editor.schedule.hintProposal': "This computer's time. Suggestion: tomorrow at 09:00.",
	'editor.schedule.error.empty': 'Choose a date and a time.',
	'editor.schedule.error.past': 'That time has already passed. Choose a later one.',
	'editor.schedule.confirm': 'Schedule',
	'editor.schedule.confirming': 'Scheduling…',
	'editor.schedule.retry': 'Try again',
	'editor.schedule.failed.title': 'Could not schedule',
	'editor.schedule.failed.body': 'The server answered: {message}. The record is as it was.',

	// ————— Embedded orderable blocks (`blocks` capability, "editor" batch, Phase A) —————
	// Deliberately reuses existing keys for the rest of a block's lifecycle:
	// `editor.save`/`editor.saving`/`editor.saveSuccess` (saving a block is the same as saving
	// any record, just a miniature of it), `list.delete.rowButton*`/`.confirm*`/`.success`
	// (deleting a block is the same as deleting a list row, same `DeleteConfirm` dialog) and
	// `list.reorder.handleLabel`/`.error` (the drag handle is the SAME piece as the list's).
	// Only literals without an existing key live here.
	'editor.blocks.add': 'Add {label}',
	'editor.blocks.addMenu.label': 'Block types',
	'editor.blocks.type.unknown': 'Unknown type: {name}',
	'editor.blocks.type.none': 'No type',
	'editor.blocks.form.unknownType':
		'The “{name}” type no longer exists in the manifest. This block is read-only so its data stays intact.',
	'editor.blocks.form.noType':
		'This block has no type. It stays read-only until the model says how to edit it.',
	'editor.blocks.form.invalidData':
		'The “{field}” column does not contain a JSON object. Saving would replace the existing value, so Vega has blocked this block.',
	'editor.blocks.form.rawData': 'Raw value of “{field}”',
	'editor.blocks.form.missingRecordField':
		'The “{field}” column does not exist in the schema yet. Create it from block reconciliation in Settings.',
	'editor.blocks.form.openSettings': 'Open Settings',
	'editor.blocks.empty': 'There are no {label} yet.',
	'editor.blocks.duplicateLabel': 'Duplicate “{label}”',
	'editor.blocks.duplicateSuccess': 'Block duplicated.',
	'editor.blocks.expandLabel': 'Expand «{label}»',
	'editor.blocks.collapseLabel': 'Collapse «{label}»',
	'editor.blocks.reorder.moved': '«{label}» moved to position {position} of {total}',
	'editor.blocks.notice.saveParentFirst': 'Save first to be able to add {label}.',

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
	'form.errorCode.validation_missing_rel_records': 'Some of the related items no longer exist.',
	'form.errorCode.validation_is_email': 'That value is not a valid email address.',
	'form.errorCode.validation_not_unique': 'Another item with that value already exists.',
	'form.errorCode.vega_unsupported_field': 'Vega cannot write this field.',
	'form.errorCode.vega_readonly_field': 'This field is read-only.',
	'form.errorCode.vega_unknown_field': 'This field does not exist on the content type.',
	'form.errorCode.vega_foreign_file_ref': 'That file does not belong to this item.',
	// LOCAL code, not from PB (`page-path.ts`): format of a page's public route, validated
	// client-side (§2 of the "create and edit pages" batch) — PocketBase does not know it,
	// `pathField` is just a `text` field to it.
	'form.errorCode.vega_page_path_invalid':
		'The route must start with "/", contain no spaces, and not end with "/" unless it is the root "/".',

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
	'form.relation.media.note': 'Choose a file from the media library.',
	'form.relation.media.loading': 'Loading files from the media library…',
	'form.relation.media.empty': 'The media library is empty. Upload files from the Media section.',
	'form.relation.media.error':
		'The media library could not be loaded. Check your connection and permissions.',
	'form.relation.media.pageError':
		'This media library page could not be loaded. Already-loaded files are still available.',
	'form.relation.media.targetMissing':
		'The media library is not available yet. Reload Vega to update it.',
	'form.relation.media.type.image': 'Image',
	'form.relation.media.type.video': 'Video',
	'form.relation.media.type.document': 'File',

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
	// INFORMATIVE notice (audit sheet, piece 3): only in the session where the file is picked from
	// the library. The `file` field stores neither the alt nor the `mediaId` (L-P6.8, [SUP-5]).
	'form.file.libraryMissingAltOne': 'This image has no alt text in the library.',
	'form.file.libraryMissingAltMany': '{count} images have no alt text in the library.',
	// Batch 12, sheet 5: an image uploaded from the field asks for its alt text and, when the
	// record is saved, is copied to Media with it (`file-library-copy.ts`). The text lives in the
	// Media entry, not in the field: after saving, the row only says where it is.
	'form.file.altLabel': 'Alt text',
	'form.file.libraryPending': 'It will be saved to Media when the record is saved.',
	'form.file.libraryUploading': 'Saving to Media…',
	'form.file.libraryDone': 'In Media, with alt text',
	'form.file.libraryDoneNoAlt': 'Image added to Media, without alt text.',
	'form.file.libraryError': 'Could not save to Media: {message}',
	'form.file.libraryRetry': 'retry',
	'form.file.libraryRetryLabel': 'Retry saving «{name}» to Media',
	// Phrases appended to the «Saved.» toast.
	'form.file.copiedOne': 'Image added to Media.',
	'form.file.copiedOneFile': 'File added to Media.',
	'form.file.copiedMany': '{count} files added to Media.',

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
	'form.editor.image': 'Image',
	// Link dialog (`RichtextLinkDialog.svelte`): a page of the site, by its path, or an external
	// address.
	'form.editor.linkDialog.title': 'Link',
	'form.editor.linkDialog.modeLabel': 'Where the link goes',
	'form.editor.linkDialog.modePage': 'Page of the site',
	'form.editor.linkDialog.modePageHint': 'Links its path, for example /about.',
	'form.editor.linkDialog.modeExternal': 'External address',
	'form.editor.linkDialog.modeExternalHint': 'Another website, an email or a phone number.',
	'form.editor.linkDialog.searchLabel': 'Search pages',
	'form.editor.linkDialog.searchPlaceholder': 'Title, or /path',
	'form.editor.linkDialog.loading': 'Searching pages…',
	'form.editor.linkDialog.empty': 'No page matches the search.',
	'form.editor.linkDialog.loadError': 'The pages could not be loaded. {message}',
	'form.editor.linkDialog.noPageTypes':
		'This site has no content type with a path. Choose "External address": you can also type a path starting with / there.',
	'form.editor.linkDialog.noPath': 'No path yet',
	'form.editor.linkDialog.selected': 'The link goes to',
	'form.editor.linkDialog.urlLabel': 'Address',
	'form.editor.linkDialog.urlHelp':
		'Start with https://, http://, mailto: or tel:. A site path starting with / works too.',
	'form.editor.linkDialog.apply': 'Add link',
	'form.editor.linkDialog.error.empty': 'Type an address.',
	'form.editor.linkDialog.error.scheme':
		'That kind of address is not allowed. Use https://, http://, mailto:, tel: or a path starting with /.',
	'form.editor.linkDialog.error.format':
		'The address is not complete. It has to start with https://, http://, mailto:, tel: or /, with no spaces.',
	'form.editor.linkDialog.error.noPage': 'Choose a page from the list.',
	// Alt text dialog (`RichtextImageDialog.svelte`): only shown when the chosen asset has none.
	'form.editor.imageDialog.title': 'Alt text',
	'form.editor.imageDialog.altLabel': 'Alt text (optional)',
	'form.editor.imageDialog.altHelp':
		'Describe what the image shows. If it is decorative, leave it empty.',
	'form.editor.imageDialog.insert': 'Insert image',
	// Notice the toolbar hands to the media picker instead of `media.picker.copyNotice`: here the
	// file is not copied, it is linked by its URL.
	'form.editor.imageDialog.libraryNotice':
		'The image is linked from the library. If you delete or replace it there, it changes here too.',
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
	'form.json.invalid': 'The JSON is not valid: fix it to be able to save.',

	// ————— List (P4 contract, Phase 4c) —————
	'list.empty.title': "There's nothing here yet",
	'list.empty.body': 'Create the first one with "New {label}".',
	'list.empty.bodyReadonly': 'There is nothing in "{label}" yet.',
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
	// Draft whose "Publish on" date is in the future (`publishAtField`, `describeStatusBadge` in
	// `list/cell.ts`): list, rail and form header. `{date}` = "Oct 12 10:00 AM".
	'list.status.scheduled': 'Scheduled · {date}',
	// Same draft when the server does NOT run `vegaschedule` (checked) or it could not be checked
	// (`ContentModel.scheduledPublishing`). `{status}` = the "draft" label.
	'list.status.scheduledInactive': '{status} · date has no effect',
	'list.status.scheduledUnconfirmed': '{status} · {date} unconfirmed',
	// Draft whose "Publish on" date has passed and is still unpublished (the server clears the
	// date when it publishes): flagged so it does not look like an ordinary draft.
	'list.status.overdue': 'Scheduled, not published',
	// Default labels when the manifest gives none (`model/default-labels.ts`).
	'status.value.draft': 'Draft',
	'status.value.published': 'Published',
	'form.field.default.title': 'Title',
	'form.field.default.status': 'Status',
	'form.field.default.name': 'Name',
	'form.field.default.description': 'Description',
	'form.field.default.path': 'Path',
	'form.field.default.layout': 'Layout',

	// ————— List toolbar (P4 contract, Phase 4d) —————
	'list.search.placeholder': 'Search in {label}…',
	'list.search.ariaLabel': 'Search the list',
	'list.sort.ariaLabel': 'Sort by {column}',
	'list.emptySearch.title': 'No results',
	'list.emptySearch.body': 'Nothing in "{label}" matches the search or the active filters.',
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
	'list.new.button': 'New {label}',

	// ————— Header meta + export (M2, `.page-head .meta`/`.btn` mockup) —————
	'list.meta.records': 'items',
	'list.meta.filters': 'filters',
	'list.export.button': 'Export',

	// ————— Export: scope + progress dialog (`#lote-esquema`, Phase 1) —————
	'list.export.dialog.title': 'Export «{label}»',
	'list.export.dialog.scopeLabel': 'What to export',
	'list.export.scope.all': 'All the content',
	'list.export.scope.filtered': 'Only the current filter or search',
	'list.export.scope.filteredDisabledHint': 'No filter or search is currently active.',
	'list.export.dialog.confirm': 'Export',
	'list.export.progress.starting': 'Preparing the export…',
	'list.export.progress': 'Exporting… {fetched} of {total}',
	// Two keys, not a generic plural (out of scope for v1 i18n on purpose, see `$lib/i18n/
	// index.ts`) — same idiom as `media.selection.labelOne`/`labelMany`
	// (`MediaSelectionBar.svelte`): the caller picks with `count === 1`.
	'list.export.success.one': 'Exported 1 item from "{label}".',
	'list.export.success.many': 'Exported {count} items from "{label}".',
	'list.export.error': 'The export could not be completed. Please try again.',

	// ————— Import (`#lote-esquema`, Phase 2): button + dialog (see `ImportDialog.svelte`) —————
	'list.import.button': 'Import',
	'list.import.dialog.title': 'Import a .vega.json file',
	'list.import.pick.label': 'Choose a .vega.json file',
	'list.import.pick.hint':
		'Only .vega.json files generated by "Export". May carry several content types.',
	'list.import.reading': 'Reading "{fileName}"…',

	// ————— Invalid file (§4.1: header/collections/fields, all-or-nothing) —————
	'list.import.invalid.title': 'This file cannot be imported',
	'list.import.invalid.malformed': "The file doesn't have the shape of a valid .vega.json.",
	'list.import.invalid.unrecognizedVersion':
		"This file is from a format version this build of Vega doesn't recognize.",
	'list.import.invalid.unknownCollection':
		'The content type "{type}" does not exist in this project.',
	'list.import.invalid.unknownField':
		'Field "{field}" of "{type}" no longer exists in the current schema.',

	// ————— Preview (§4.2): the three states + the separate overwrite confirmation —————
	'list.import.status.create': 'New',
	'list.import.status.overwrite': 'Overwrites',
	'list.import.status.blocked': 'Blocked',
	'list.import.preview.summary': '{create} new · {overwrite} overwrite · {blocked} blocked',
	'list.import.preview.confirmOverwrite':
		'I confirm I want to overwrite these {count} already-existing items.',
	'list.import.preview.nothingToImport': 'Nothing to import: every item is blocked.',
	'list.import.blockedReason.noCreatePermission': 'no permission to create in this content type',
	'list.import.blockedReason.noUpdatePermission': 'no permission to update in this content type',
	'list.import.blockedReason.danglingRelation':
		'field "{field}" points to an item that does not exist',
	'list.import.blockedReason.requiredEmpty': 'required field "{field}" has no value',
	'list.import.blockedReason.unreachableRequiredFile':
		'the required file in field "{field}" could not be fetched from its source',

	// ————— Write + report (§4.3/§4.4) —————
	'list.import.dialog.confirm': 'Import',
	'list.import.progress': 'Importing…',
	'list.import.report.summary':
		'{created} created · {updated} updated · {failed} failed · {skipped} skipped',
	'list.import.report.failedTitle': 'Items that failed',
	'list.import.blockedReason.requiredRelationCycle':
		'the required relations form a cycle that cannot be created in an empty destination',
	'list.import.report.relationsPending':
		'The item was created, but its relations are still pending. Import the file again and confirm updating existing items.',
	// Same "two keys, no generic plural" idiom as `list.export.success.*` above.
	'list.import.success.one': 'Imported 1 item.',
	'list.import.success.many': 'Imported {count} items.',
	'list.import.partial': 'The import finished with {failed} failed items. Check the report.',
	'list.import.error': 'The preview could not be prepared. Please try again.',
	'list.import.runError':
		'The import stopped because of an unexpected error. Check which items were written and try again.',
	'list.import.reading.bar': 'File reading progress',
	'list.import.progress.count': 'Importing… {done} of {total}',

	// ————— Active filter chips (M6, reopens R2, mockup `.toolbar .chip`) —————
	'list.activeFilter.groupLabel': 'Active filters',
	'list.activeFilter.status.key': 'Status:',
	'list.activeFilter.status.remove': 'Remove status filter',

	// ————— Delete (P4 contract, Phase 4e) —————
	'list.delete.rowButton': 'Delete',
	'list.delete.rowButtonLabel': 'Delete "{label}"',
	'list.delete.confirmTitle': 'Delete this entry?',
	// ONE sentence depending on whether the trash can keep its promise (`isDeleteRecoverable`).
	'list.delete.confirmBody':
		'"{label}" will be moved to the trash and you can recover it for {days} day(s).',
	'list.delete.confirmBodyForever': '"{label}" will be deleted and cannot be recovered.',
	'list.delete.confirm': 'Delete',
	'list.delete.deleting': 'Deleting…',
	'list.delete.success': '"{label}" was deleted.',

	// ————— Row actions menu (Batch 12, sheet 7) —————
	'list.rowMenu.columnHeader': 'Actions',
	'list.rowMenu.trigger': 'Actions for "{label}"',
	'list.rowMenu.hint': 'Right arrow: row actions',
	'list.rowMenu.duplicate': 'Duplicate',
	'list.rowMenu.delete': 'Delete…',
	'list.duplicate.success': '"{label}" was duplicated.',
	'list.duplicate.error': 'Could not duplicate "{label}".',

	// ————— "More" in the list header on mobile (Batch 12, sheet 6) —————
	'list.more.trigger': 'More',
	'list.more.label': 'More list actions',

	// ————— Manual reorder (orderField) —————
	'list.reorder.columnHeader': 'Order',
	'list.reorder.handleLabel': 'Drag to reorder "{label}"',
	'list.reorder.error': 'Could not save the new order. Please try again.',

	// ————— Merged view (mergedViews, Phase L7c) —————
	'list.merged.typeHeader': 'Type',
	'list.merged.titleHeader': 'Title',
	'list.merged.empty.title': "There's nothing here yet",
	'list.merged.empty.body': "No item from this view's content types matches yet.",
	'list.merged.truncatedNotice': "One of this view's content types has more items than shown.",
	// Why dragging to reorder is unavailable (view notice and handle help text).
	'list.merged.reorderBlocked.failed':
		"Can't reorder while a content type is missing: the order would be incomplete.",
	'list.merged.reorderBlocked.truncated':
		"Can't reorder: there are more items than fit on screen and the order would be incomplete.",
	'list.merged.reorderBlocked.forbidden':
		"Can't reorder: you don't have permission to edit some of this view's content types.",
	'list.merged.failedNotice':
		"Couldn't load: {sources}. Showing the items from the other content types.",

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
	'media.bootstrap.editorBody': 'Ask whoever manages the site to turn on the media library.',
	// A library created before a new field (today, `focal`): completing it is additive and the
	// superuser decides it with a button, never Vega on its own.
	'media.fields.missingBody':
		'The library lacks fields this version of Vega can use: {fields}. Adding them leaves the existing media untouched.',
	'media.fields.add': 'Add fields',
	'media.fields.adding': 'Adding…',
	'media.fields.added': 'Fields added to the library.',

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
	'integrity.usedIn.countLabel': '{count} item(s)',
	'integrity.usedIn.moreCount': 'and {count} more',
	'integrity.usedIn.collectionDegraded': 'Could not check "{collection}" ({reason}).',
	// Translation of `VegaErrorKind` (plus `'unknown'`, see `ReferenceMatchDegraded`) into the
	// human reason that fills `integrity.usedIn.collectionDegraded` — NEVER the raw `VegaError`
	// `message` (P1 §5: it may carry backend syntax/URLs).
	'integrity.usedIn.reason.forbidden': 'no permission to read this content type',
	'integrity.usedIn.reason.network': 'no connection to the server',
	'integrity.usedIn.reason.backend': 'the server responded with something unexpected',
	'integrity.usedIn.reason.not-found': 'that content type no longer exists',
	'integrity.usedIn.reason.auth-expired': 'the session expired mid-check',
	'integrity.usedIn.reason.validation': 'the server does not accept the query',
	// A read never produces it; it is here so the table covers every `VegaErrorKind`.
	'integrity.usedIn.reason.conflict': 'the item changed during the check',
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
		'When you delete this, PocketBase clears those relations right away (empties the field or removes the id from the array). If you restore this item from the trash later, those links will NOT come back.',
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
	'revisions.panel.loadMore': 'Show more',
	'revisions.panel.loadingMore': 'Loading…',
	'revisions.panel.loadMoreError': 'Could not load more versions. Please try again.',
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
	'revisions.trash.deleteFilesHint':
		'Attached files are not recovered, even if you restore the entry.',

	// ————— Trash — /trash route —————
	'revisions.trash.pageTitle': 'Trash',
	'revisions.trash.description':
		'Here are the items and files you have deleted. You can restore them as they were until the retention period set in Settings runs out.',
	'revisions.trash.loading': 'Loading trash…',
	'revisions.trash.error': 'Could not load the trash.',
	'revisions.trash.retry': 'Retry',
	'revisions.trash.unavailable': 'The trash is not enabled on this project.',
	'revisions.trash.empty': 'The trash is empty.',
	'revisions.trash.itemCollection': 'Type: {collection}',
	'revisions.trash.itemFilesLost': 'Had attached files: they will not be restored.',
	'revisions.trash.restore': 'Restore',
	'revisions.trash.restoring': 'Restoring…',
	'revisions.trash.restoreUnavailable':
		'This site does not allow restoring this item as it was: "Restore" is not available.',
	'revisions.trash.restoreUnknownSchema':
		'The content type "{collection}" no longer exists: it cannot be restored safely.',
	// `requiredFileFieldName` (`revisions/restore.ts`): no `file` field survives a restore (PB
	// destroys the binary on delete, §0.3), so a collection with a REQUIRED one can never be fully
	// recreated — derived from the schema, not a special case for "vega_media".
	'revisions.trash.restoreBlockedRequiredFile':
		'The field "{field}" of "{collection}" is a required file, and deleted files cannot be recovered, so this item cannot be fully restored. "Restore" is not available.',
	'revisions.trash.restoreSuccess': '"{label}" has been restored.',
	'revisions.trash.deleteForever': 'Delete permanently',
	'revisions.trash.deleteForeverConfirmTitle': 'Permanently delete "{label}"?',
	'revisions.trash.deleteForeverConfirmBody':
		'This trash entry will be gone for good: you will no longer be able to restore this item.',
	'revisions.trash.deleteForeverConfirm': 'Delete permanently',
	'revisions.trash.deleteForeverDeleting': 'Deleting…',
	'revisions.trash.deleteForeverSuccess': '"{label}" has been permanently deleted from the trash.',
	'revisions.trash.emptyTrash': 'Empty trash',
	'revisions.trash.emptyTrashConfirmTitle': 'Empty the trash?',
	'revisions.trash.emptyTrashConfirmBody':
		'The {count} trash entries will be permanently deleted: you will no longer be able to restore any of these items.',
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
	// Alt text (audit sheet, piece 3): a non-blocking notice, images only.
	'media.alt.missing': 'No alt text',
	'media.detail.altMissingHint': 'No alt text: a screen reader will read «{name}».',
	'media.detail.altHelp': 'Describe what is shown, not the file name.',
	// Focal point (audit, 23 Sep): what the site keeps in view when it crops the image. Empty = centre.
	'media.focal.label': 'Focal point',
	'media.focal.help':
		'Click the image to mark what must stay in view when the site crops it. With the keyboard: arrows move it (Shift for finer steps), Enter sets it.',
	'media.focal.center': 'Focal point: centre',
	'media.focal.value': 'Focal point: {x} % across, {y} % down',
	'media.focal.pending': 'Moving to {x} % across, {y} % down. Press Enter to set it.',
	'media.focal.reset': 'Centre',

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
		'The original will be moved to the trash and you can recover it for {days} day(s). Copies already inserted into entries are not affected.',
	'media.delete.confirmBodyForever':
		'The original will be deleted from the library and cannot be recovered. Copies already inserted into entries are not affected.',
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
	'media.replace.warningDrafts':
		'Unsaved changes in this panel (alt text, title, tags, focal point) will be saved together with the file.',

	// ————— Media: library header + toolbar («aquelarre-medios» redesign) —————
	// The header count is the library TOTAL (`totalItems` of the listing), never the page's nor the
	// filter's. The mockup also shows the total weight in MB: Vega does not know it (§4.4, the port
	// does not expose the size of an already stored file) and does not make it up.
	'media.meta.files': 'files',
	'media.filter.groupLabel': 'Filter by type',
	'media.filter.all': 'All',
	'media.filter.images': 'Images',
	'media.filter.video': 'Videos',
	'media.filter.documents': 'Documents',
	'media.filter.empty': 'No file on this page matches the search or the chosen type.',
	'media.filter.clear': 'Clear filters',
	'media.search.empty': 'No file in the library matches the search.',

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
	'media.upload.summaryPending':
		'{uploaded} file(s) uploaded, {failed} failed, {pending} pending because the session expired.',
	'media.upload.keepOriginal': 'Upload the original',
	'media.upload.shrinkNotice':
		'Large images are reduced when uploaded. Camera data, including location, is lost.',
	'media.upload.shrunk': '{from} → {to}',
	'media.upload.shrinkFailed': 'could not be reduced ({reason})',
	'media.upload.shrinkWhy.error': 'processing failed',
	'media.upload.shrinkWhy.no-blob': 'the browser could not encode it',
	'media.upload.shrinkWhy.wrong-type': 'the browser does not support this format',
	'media.upload.shrinkWhy.not-smaller': 'it was not smaller',
	'media.upload.shrinkWhy.empty': 'no dimensions',
	'media.upload.shrinkWhy.blank': 'it came out blank',

	// ————— Media: library picker (Phase P6·6e) —————
	// D-P6.6/L-P6.8: the picker COPIES bytes (a record never references a `vega_media` asset), so
	// the notice is honest about exactly that (D-P6.7, byte duplication is accepted in v1).
	'media.picker.title': 'Choose from the library',
	'media.picker.copyNotice': 'A copy of the chosen file will be inserted into this field.',
	'media.picker.searchLabel': 'Search by title or alt text',
	'media.picker.searchPlaceholder': 'Search…',
	'media.picker.empty': 'No asset matches the search or the allowed file type.',
	'media.picker.selectedCount': '{count} selected',
	'media.picker.missingAltCount': '{count} without alt text',
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
	'settings.schema.fields.type.editor': 'Rich text',
	'settings.schema.fields.type.url': 'Web address',
	'settings.schema.fields.type.email': 'Email',
	'settings.schema.fields.type.image': 'Image',
	'settings.schema.fields.uniqueLabel': 'Cannot be repeated',
	'settings.schema.fields.image.unavailable':
		'There is no media library yet. Open "Media" once to create it, then come back here.',
	'settings.schema.fields.type.number': 'Number',
	'settings.schema.fields.type.bool': 'Yes/No',
	'settings.schema.fields.type.date': 'Date',
	'settings.schema.fields.type.json': 'JSON',
	'settings.schema.fields.type.select': 'Select',
	'settings.schema.fields.type.relation': 'Relation',
	'settings.schema.fields.select.optionPlaceholder': 'Option',
	'settings.schema.fields.select.optionLabel': 'Option {index}',
	'settings.schema.fields.select.addOption': 'Add option',
	'settings.schema.fields.select.removeOption': 'Remove option {index}',
	'settings.schema.fields.select.moveUpLabel': 'Move option {index} up',
	'settings.schema.fields.select.moveDownLabel': 'Move option {index} down',
	'settings.schema.fields.select.moved': '"{value}" moved to position {position} of {total}',
	'settings.schema.fields.select.multipleLabel': 'Allow several options',
	'settings.schema.fields.select.optionsRequired': 'Add at least one option.',
	'settings.schema.fields.select.optionDuplicate': 'This option is repeated.',
	'settings.schema.fields.relation.targetLabel': 'Related collection',
	'settings.schema.fields.relation.targetPlaceholder': 'Choose a collection…',
	'settings.schema.fields.relation.targetEmpty': 'No writable collections available',
	'settings.schema.fields.relation.targetRequired': 'Choose the collection this field relates to.',
	'settings.schema.fields.relation.multipleLabel': 'Allow several records',
	'settings.schema.fields.relation.onDeleteLabel': 'When the related record is deleted',
	'settings.schema.fields.relation.onDeleteUnlink': 'Keep this record',
	'settings.schema.fields.relation.onDeleteCascade': 'Delete this record',
	'settings.schema.fields.relation.cascadeWarning':
		'PocketBase will delete this record when deleting its last related record. This cannot be undone.',
	'settings.schema.error': 'Error: {message}',
	// JS migration emitted after a successful create/add (schema batch, half 2): without this,
	// every schema edit made from Vega drifts production away from the repo SILENTLY.
	'settings.schema.migration.title': 'Migration generated',
	'settings.schema.migration.instructions':
		'Save this file as pb_migrations/{filename} in your project repository and commit it: without it, this schema change only exists in your PocketBase, not in your version control.',
	'settings.schema.migration.pendingTitle': 'Migration generated — not applied yet',
	'settings.schema.migration.pendingInstructions':
		'Save this file as pb_migrations/{filename}, review it, and apply it outside Vega: generating or copying it does not change PocketBase. Generating it again before applying it creates another file for the same columns. If the schema changes in the meantime, the migration may fail when applied. Its down removes these columns and any data written to them after the up.',
	'settings.schema.migration.copy': 'Copy',
	'settings.schema.migration.copied': 'Copied',

	// ————— Physical block-column divergence —————
	'settings.blockColumns.title': 'Block columns',
	'settings.blockColumns.missingSummary':
		'This manifest declares {count} physical column(s) that do not exist.',
	'settings.blockColumns.migrationPerCollection':
		'Vega generates a separate file for each block collection and includes only its missing columns.',
	'settings.blockColumns.collectionMissingTitle': 'Block collection unavailable',
	'settings.blockColumns.collectionMissingBody':
		'The child collection declared by "{collection}" does not exist in the schema or is reserved. Vega cannot diagnose or generate a reconciliation until it is created elsewhere.',
	'settings.blockColumns.collectionMissingCount': '{count} missing column(s) in "{collection}".',
	'settings.blockColumns.generate': 'Generate migration for {collection}',
	'settings.blockColumns.incompatibleTitle': '{count} incompatible column(s)',
	'settings.blockColumns.incompatibleBody':
		'These columns already exist with a different shape. They are not included in any migration: changing a column that may contain data requires a human decision.',
	'settings.blockColumns.conflictTitle': 'Conflict in the block manifest',
	'settings.blockColumns.conflictBody':
		'Collection "{collection}" cannot be diagnosed: column name "{field}" has incompatible declarations within the manifest itself ({declarations}). Fix the manifest before generating any migration.',
	'settings.blockColumns.value.yes': 'yes',
	'settings.blockColumns.value.no': 'no',
	'settings.blockColumns.type.text': 'text',
	'settings.blockColumns.type.richtext': 'rich text',
	'settings.blockColumns.type.number': 'number',
	'settings.blockColumns.type.bool': 'yes/no',
	'settings.blockColumns.type.email': 'email',
	'settings.blockColumns.type.url': 'URL',
	'settings.blockColumns.type.date': 'date',
	'settings.blockColumns.type.select': 'select',
	'settings.blockColumns.type.relation': 'relation',
	'settings.blockColumns.type.file': 'file',
	'settings.blockColumns.type.json': 'JSON',
	'settings.blockColumns.type.unsupported': 'unsupported type',
	'settings.blockColumns.type.autodate': 'automatic date',
	'settings.blockColumns.reason.type': 'expected {expected}, but found {actual}',
	'settings.blockColumns.reason.required':
		'expected required is "{expected}" while the actual value is "{actual}"',
	'settings.blockColumns.reason.readonly': 'the actual column is read-only',
	'settings.blockColumns.reason.unique': 'the actual column has a UNIQUE constraint',
	'settings.blockColumns.reason.textConstraints':
		'text constraints differ (expected maximum {expectedMax}, actual {actualMax})',
	'settings.blockColumns.reason.numberConstraints':
		'the actual number column has bounds or requires integers',
	'settings.blockColumns.reason.dateConstraints': 'the actual date column has bounds',
	'settings.blockColumns.reason.relationTarget':
		'expected target is "{expected}" while the actual target is "{actual}"',
	'settings.blockColumns.reason.cardinality': 'cardinality or its maxima differ',
	'settings.blockColumns.reason.cascadeDelete': 'cascade-delete policy differs',
	'settings.blockColumns.reason.fileConstraints':
		'file constraints (size, MIME types, or protection) differ',
	'settings.blockColumns.reason.constraints':
		'the expected physical shape and the actual column have different constraints',

	// ————— Editor role (batch L6c): manifest-editing gate —————
	// Without `schemaBootstrap` (auth collection other than `_superusers`) an editor cannot
	// introspect nor create/migrate schema: the content-model section is NOT rendered and the
	// connection one is folded under «Advanced» (batch 11). See `Capabilities.schemaBootstrap`.
	'settings.advanced.title': 'Advanced',

	// ————— Site base: prepare and update the site's PocketBase (audit batch 2) —————
	// The word "seeding" never shows in the UI. Mockup: design/mockups/2026-10-01-ajustes-y-sembrado.
	'settings.site.title': 'Site base',
	'settings.site.checking': 'Checking the site…',
	'settings.site.listAnd': 'and',
	'settings.site.tag.unprepared': 'Not set up',
	'settings.site.tag.update': 'Update available',
	'settings.site.tag.current': 'Up to date',
	'settings.site.desc.unprepared':
		'Creates in your PocketBase what a Vega site needs: pages, blocks, media, redirects and the accounts of whoever edits. Before creating anything it shows you the list.',
	'settings.site.desc.partial':
		'{missing} of the {total} collections of a Vega site are missing: {names}. Before creating anything it shows you the list.',
	'settings.site.desc.update':
		'This version of Vega needs changes in your PocketBase: {changes}. Before changing anything it shows you the list.',
	'settings.site.desc.current':
		'This PocketBase has everything this version of Vega needs. There is nothing to create or update.',
	'settings.site.change.addFields': 'add fields to {names}',
	'settings.site.change.constrain': 'set the format of the paths in {names}',
	'settings.site.change.manifest': 'add entries to the content model',
	'settings.site.change.page': 'create the "Home" page',
	'settings.site.blocked.title': 'Vega cannot update this site as it is',
	'settings.site.blocked.bodyOne':
		'1 piece already exists with a different shape, and Vega does not change what already exists. Nothing has been written.',
	'settings.site.blocked.body':
		'{count} pieces already exist with a different shape, and Vega does not change what already exists. Nothing has been written.',
	'settings.site.loadError': 'Could not check the state of the site.',
	'settings.site.btn.prepare': 'Set up the site',
	'settings.site.btn.update': 'Update the site',
	'settings.site.btn.recheck': 'Check again',
	'settings.site.btn.why': 'See why',
	'settings.site.btn.copy': 'Copy the detail',
	'settings.site.btn.preparing': 'Setting up…',
	'settings.site.btn.updating': 'Updating…',
	'settings.site.copied': 'Detail copied.',
	'settings.site.copyFailed': 'Could not copy the detail.',
	'settings.site.dialog.prepareTitle': 'Set up the site',
	'settings.site.dialog.updateTitle': 'Update the site',
	'settings.site.dialog.prepareIntro':
		'This is what Vega will create in your PocketBase. What already exists is left alone.',
	'settings.site.dialog.updateIntro':
		'This is what changes. The content you already have is left alone.',
	'settings.site.dialog.irreversible':
		'Vega cannot undo this: what is created stays in PocketBase.',
	'settings.site.dialog.prepareRunning': 'Setting up the site… {elapsed}',
	'settings.site.dialog.updateRunning': 'Updating the site… {elapsed}',
	'settings.site.group.create': 'Will be created',
	'settings.site.group.add': 'Will be added',
	'settings.site.collection.pages': 'Pages',
	'settings.site.collection.vega_media': 'Media',
	'settings.site.collection.blocks': 'Blocks',
	'settings.site.collection.redirects': 'Redirects',
	'settings.site.collection.vega': 'Content model',
	'settings.site.create.pages': 'title, path, layout, status, publish date and SEO',
	'settings.site.create.vega_media': 'the images and files that get uploaded',
	'settings.site.create.blocks': 'the sections of each page',
	'settings.site.create.redirects': 'from an old path to a new one',
	'settings.site.create.vega': 'how fields are named and ordered in the forms',
	'settings.site.editors.title': 'Editors',
	'settings.site.editors.create':
		'the accounts of whoever edits. If it already exists, it is left as it is',
	'settings.site.editors.addCreatedTitle': 'The sign-up date in Editors',
	'settings.site.editors.addCreatedText':
		'only if missing. Accounts that already exist stay without a date',
	'settings.site.page.title': 'The "Home" page',
	'settings.site.page.text': 'At the path /, as a draft',
	'settings.site.page.rest': 'the "Home" page',
	'settings.site.addFields.one': '1 field in {collection}',
	'settings.site.addFields.many': '{count} fields in {collection}',
	'settings.site.field.publishAt': 'Publish on',
	'settings.site.field.description': 'Description',
	'settings.site.field.socialImage': 'Image for social networks',
	'settings.site.field.noindex': 'Do not index',
	'settings.site.field.created': 'Sign-up date',
	'settings.site.field.updated': 'Last edited',
	'settings.site.constrain.title': 'Path format in {collection}',
	'settings.site.constrain.text': 'only where there is none yet',
	'settings.site.replace.manifest':
		'The missing entries are added; what it already has is left alone.',
	'settings.site.plan.rest': '{names} are already up to date.',
	'settings.site.plan.restOne': '{names} is already up to date.',
	'settings.site.blockedDialog.title': 'The site cannot be updated',
	'settings.site.blockedDialog.intro':
		'These pieces already exist with a different shape, and Vega does not change what already exists. Nothing has been written.',
	'settings.site.blockedDialog.group': 'What does not fit',
	'settings.site.blockedDialog.fix': 'Fix those pieces in the PocketBase Admin and check again.',
	'settings.site.detail': 'Technical detail',
	'settings.site.div.field.title': 'The "{field}" field of {collection}',
	'settings.site.div.field.body': 'It exists, but not with the shape Vega expects.',
	'settings.site.div.collection.title': 'The "{collection}" collection',
	'settings.site.div.collection.body': 'It is a view, not a regular collection.',
	'settings.site.div.manifest.title': 'The content model',
	'settings.site.div.manifest.edited':
		'It has been edited by hand and ended up in a format Vega cannot add the missing entries to. It has not been touched.',
	'settings.site.div.manifest.other': 'Its record is not the one Vega expects.',
	'settings.site.div.page.body': 'There is more than one with the path /.',
	'settings.site.div.blocks.title': 'The blocks',
	'settings.site.div.blocks.body':
		'The existing pages cannot be read, and without that Vega cannot create the blocks.',
	'settings.site.div.other.body': 'It exists with a different shape.',
	'settings.site.error.title': 'It could not be finished',
	'settings.site.error.body':
		'What was created before the failure stays as it is. When you retry, Vega only creates what is missing.',
	'settings.site.error.rulesMismatchNull':
		'The "{collection}" collection already exists with access rules different from the ones Vega expects: {rules}. Nothing has been changed. In PocketBase, go to Collections → {collection} → API Rules, leave them empty (null: superusers only) and run the operation again.',
	'settings.site.error.rulesMismatchDeclared':
		'The "{collection}" collection already exists with access rules different from the ones Vega expects: {rules}. Nothing has been changed. In PocketBase, go to Collections → {collection} → API Rules, set them as Vega declares them and run the operation again.',
	'settings.site.result.done': 'Done: {summary}.',
	'settings.site.result.nothing': 'Everything was already in place: nothing needed changing.',
	'settings.site.result.collectionOne': '1 collection',
	'settings.site.result.collections': '{count} collections',
	'settings.site.result.fields': 'the new fields of {names}',
	'settings.site.result.constrained': 'the path format of {names}',
	'settings.site.result.manifest': 'the content model',
	'settings.site.result.manifestUpgraded': 'the new entries of the content model',
	'settings.site.result.page': 'the "Home" page, which stays as a draft',
	'settings.site.result.next': 'The next step is to give access to whoever will edit, in',
	'settings.site.toast.prepared': 'Site set up.',
	'settings.site.toast.updated': 'Site updated.',
	'settings.site.group.manifest': 'Will be added to the content model',
	'settings.site.group.skipped': 'Will not be added',
	'settings.site.entry.collection': 'Collection "{name}"',
	'settings.site.entry.field': 'Field "{field}" of {collection}',
	'settings.site.entry.pageOption': '{collection}: each one has its own address on the site',
	'settings.site.entry.option': 'Option "{option}" of {collection}',
	'settings.site.entry.blockType': 'Block type "{name}"',
	'settings.site.entry.navGroup': 'Menu group "{name}"',
	'settings.site.entry.nav': 'The menu',
	'settings.site.entry.other': '"{name}"',
	'settings.site.manifest.hiddenHelp':
		'A deleted entry comes back on every update. To keep one from showing, mark it as hidden ("hidden": true) instead of deleting it.',
	'settings.site.skipped.note':
		'Vega does not change what is already in the content model. If you want it, add it by hand in "Content model".',
	'settings.site.skipped.navGroup':
		'The saved menu has a shape Vega does not know how to complete.',
	'settings.site.skipped.fieldGroupTitle': 'Field group "{name}" of {collection}',
	'settings.site.skipped.fieldGroup': 'The collection already has its own field groups.',
	'settings.site.skipped.blockFieldTitle': 'Field "{name}" of the "{block}" block',
	'settings.site.skipped.blockField': 'The block type already exists and is kept whole.',
	'settings.site.result.skipped':
		'Could not be added to the content model: {names}. What was already there has been kept as it was.',
	'settings.site.modules.title': 'Modules',
	'settings.site.modules.state.absent': 'Not added',
	'settings.site.modules.state.incomplete': 'Incomplete',
	'settings.site.modules.state.added': 'Added',
	'settings.site.modules.state.blocked': 'Cannot be added as things are',
	'settings.site.modules.btn.add': 'Add',
	'settings.site.modules.btn.adding': 'Adding…',
	'settings.site.modules.needsBase.unprepared': 'The site has to be set up first.',
	'settings.site.modules.needsBase.update': 'The site has to be updated first.',
	'settings.site.modules.needsBase.blocked': 'What does not fit in the site has to be fixed first.',
	'settings.site.modules.dialog.title': 'Add: {name}',
	'settings.site.modules.dialog.intro':
		'This is what Vega will add to your PocketBase. No field, rule, record or entry that already exists is deleted or changed; if a collection of the module already exists, the fields it lacks are added to it.',
	'settings.site.group.rules': 'Different access rules',
	'settings.site.rules.title': '{collection} · {rule}',
	'settings.site.rules.item': 'Now: {actual} · Vega expects: {expected}',
	'settings.site.rules.none': 'no rule (superusers only)',
	'settings.site.rules.open': '"" (open to everyone)',
	'settings.site.rules.note':
		'These collections already existed with other access rules. Vega does not change them: if you add the module they stay as they are, and everything else is added anyway. Review them in PocketBase before going on.',
	'settings.site.rules.confirm':
		'I want to add the module with the access rules these collections already have.',
	'settings.site.rules.listRule': 'list',
	'settings.site.rules.viewRule': 'view a record',
	'settings.site.rules.createRule': 'create',
	'settings.site.rules.updateRule': 'edit',
	'settings.site.rules.deleteRule': 'delete',
	'settings.site.modules.rulesHint':
		'It has collections whose access rules differ from the module’s.',
	'settings.site.modules.dialog.running': 'Adding… {elapsed}',
	'settings.site.modules.blockedDialog.title': 'Cannot add: {name}',
	'settings.site.modules.toast.added': 'Added: {name}.',
	'settings.site.module.blog.name': 'Blog',
	'settings.site.module.blog.desc': 'Posts with tags, cover, date and SEO.',
	'settings.site.module.contacto.name': 'Contact form',
	'settings.site.module.contacto.desc':
		'An inbox with the messages that arrive from the form on the site.',
	'settings.site.module.contacto.note':
		'The email notice for each message is configured on the server, not here. How to do it is in the Vega documentation, under "Formulario de contacto".',
	'settings.site.collection.posts': 'Posts',
	'settings.site.collection.tags': 'Tags',
	'settings.site.collection.messages': 'Messages',
	'settings.site.create.posts':
		'title, address, summary, content, cover, status, dates, tags and SEO',
	'settings.site.create.tags': 'the name and address of each tag',
	'settings.site.create.messages':
		'name, email and message of whoever writes, and whether it has been read',

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

	// ————— Administration: superuser screens (`/editores`, `/copias`) —————
	// Only visible with `capabilities.administration` (`BackendPort.administration`). Help text is
	// painted in `--ink-2`: `--ink-3` does not reach AA on light themes.
	'admin.gate.title': 'Superusers only',
	'admin.editors.gateBody':
		'Managing editors requires signing in as a PocketBase superuser. Your account is an editor account.',
	'admin.editors.title': 'Editors',
	'admin.editors.description':
		'People who can sign in to this admin and edit content. They cannot touch the schema, the manifest or this screen.',
	'admin.editors.add': 'Add editor',
	'admin.editors.loading': 'Loading editors…',
	'admin.editors.loadError': 'Could not load the list of editors.',
	'admin.editors.emptyTitle': 'No editors yet',
	'admin.editors.emptyBody':
		'Right now only the superuser can sign in. Add whoever is going to write or proofread content.',
	// The collection is created when the site is prepared, from the «Site base» card in Settings.
	'admin.editors.missingCollection':
		'This site has nowhere to keep the editors’ accounts yet. It is created when the site is prepared.',
	'admin.editors.col.email': 'Email',
	'admin.editors.col.status': 'Status',
	'admin.editors.col.created': 'Added',
	'admin.editors.col.actions': 'Actions',
	'admin.editors.createdMobile': 'Added {date}',
	'admin.editors.createdUnknown': 'No creation date: the collection has no “created” field.',
	'admin.editors.status.active': 'Active',
	'admin.editors.status.pending': 'Pending',
	'admin.editors.status.pendingHint':
		'They have not confirmed their email by choosing a password yet.',
	'admin.editors.you': 'your account',
	'admin.editors.resend': 'Resend invitation',
	'admin.editors.resendFor': 'Resend the invitation to {email}',
	'admin.editors.resending': 'Sending…',
	'admin.editors.resendSuccess':
		'Invitation requested again for {email}. PocketBase sends the email in the background.',
	'admin.editors.changePassword': 'Change password',
	'admin.editors.changePasswordFor': 'Change the password of {email}',
	'admin.editors.remove': 'Remove access',
	'admin.editors.removeFor': 'Remove access for {email}',
	'admin.editors.addDialog.title': 'Add editor',
	'admin.editors.addDialog.email': 'Email',
	'admin.editors.addDialog.accessLabel': 'How they will sign in',
	'admin.editors.addDialog.invite': 'Send them an invitation',
	'admin.editors.addDialog.inviteHint': 'They get an email and choose their password.',
	'admin.editors.addDialog.password': 'Set the password myself',
	'admin.editors.addDialog.passwordHint': 'You give it to them through another channel.',
	'admin.editors.addDialog.noMail':
		'This server has no email configured, so no invitation can be sent. Set the password yourself and give it to them through another channel, or set up email on this same screen, below the list.',
	'admin.editors.addDialog.submitInvite': 'Send invitation',
	'admin.editors.addDialog.submitPassword': 'Add editor',
	'admin.editors.addDialog.saving': 'Saving…',
	'admin.editors.addDialog.successPassword': 'Editor added: {email}.',
	'admin.editors.addDialog.inviteMailFailed':
		'Editor added: {email}, but the invitation email could not be requested. Use "Resend invitation" on their row to try again.',
	'admin.editors.addDialog.successInvite':
		'Editor added: {email}. PocketBase will send them the email to choose their password.',
	'admin.editors.passwordDialog.title': 'Change password',
	'admin.editors.passwordDialog.owner': 'For',
	'admin.editors.passwordDialog.sessionNote': 'Their open session will be closed.',
	'admin.editors.passwordDialog.submit': 'Save password',
	'admin.editors.passwordDialog.success': 'Password of {email} changed.',
	'admin.editors.removeDialog.title': 'Remove access for {email}?',
	'admin.editors.removeDialog.body':
		'They will no longer be able to sign in to this admin. Their PocketBase account is deleted; the content they edited stays as it is.',
	'admin.editors.removeDialog.confirm': 'Remove access',
	'admin.editors.removeDialog.removing': 'Removing…',
	'admin.editors.removeDialog.success': 'Access removed for {email}.',
	'admin.backups.gateBody':
		'Backups require signing in as a PocketBase superuser. Your account is an editor account.',
	'admin.backups.title': 'Backups',
	'admin.backups.description':
		'A full copy of the database and the uploaded files, stored on the server. Download it to keep another one somewhere else.',
	'admin.backups.create': 'Create backup',
	'admin.backups.creating': 'Creating…',
	'admin.backups.running': 'Creating backup… {elapsed}',
	'admin.backups.runningWhen': 'now',
	'admin.backups.announceStart': 'Creating the backup. It may take a few minutes.',
	'admin.backups.announceDone': 'Backup created.',
	'admin.backups.createdToast': 'Backup created ({size}).',
	'admin.backups.createdToastNoSize': 'Backup created.',
	'admin.backups.createErrorTitle': 'Could not create the backup',
	'admin.backups.busy':
		'Another backup or restore is already running on the server. Wait for it to finish and try again.',
	'admin.backups.loading': 'Loading backups…',
	'admin.backups.loadError': 'Could not load the list of backups.',
	'admin.backups.emptyTitle': 'There are no backups on this server yet',
	'admin.backups.emptyBody': 'Create the first one now; then you will be able to download it.',
	'admin.backups.col.name': 'Name',
	'admin.backups.col.size': 'Size',
	'admin.backups.col.date': 'Date',
	'admin.backups.col.actions': 'Actions',
	'admin.backups.download': 'Download',
	'admin.backups.downloadFor': 'Download {key}',
	'admin.backups.preparing': 'Preparing…',
	'admin.settings.change': 'Change',
	'admin.settings.save': 'Save',
	'admin.settings.saving': 'Saving…',
	'admin.settings.loading': 'Loading the settings…',
	'admin.settings.loadError': 'Could not load the backup settings.',
	'admin.settings.fieldRejected': 'The server does not accept this value: {message}',
	'admin.settings.rejected': 'The server rejected the data: {message}',
	'admin.settings.test': 'Test connection',
	'admin.settings.testing': 'Testing…',
	'admin.settings.testingStatus': 'Testing the connection…',
	'admin.settings.testOk': 'Connection works',
	'admin.settings.localTime': '{time} here',
	'admin.backups.auto.title': 'Automatic backups',
	'admin.backups.auto.on': 'On',
	'admin.backups.auto.offBody':
		'Right now a backup is only made when someone presses “Create backup”.',
	'admin.backups.auto.schedule': 'Schedule backups',
	'admin.backups.auto.frequency': 'Frequency',
	'admin.backups.auto.keep': 'Kept',
	'admin.backups.auto.keepValue': 'The last {count} automatic ones',
	'admin.backups.auto.never': 'Never',
	'admin.backups.auto.daily': 'Every day, at 00:00 UTC',
	'admin.backups.auto.weekly': 'Every week, on Sundays at 00:00 UTC',
	'admin.backups.auto.custom': 'Custom…',
	'admin.backups.auto.customSummary': 'Custom',
	'admin.backups.auto.localHelp': '00:00 UTC is {time} here.',
	'admin.backups.auto.neverHelp': 'It stops making backups on its own. The ones you have stay.',
	'admin.backups.auto.cron': 'Cron expression',
	'admin.backups.auto.cronHelpPre':
		'Five values: minute, hour, day of the month, month and day of the week. The time is UTC. For example, ',
	'admin.backups.auto.cronHelpPost': ' is every Monday at 3:00.',
	'admin.backups.auto.cronRequired': 'Type an expression or choose “Never”.',
	'admin.backups.auto.cronRejected': 'The server does not accept this expression: {message}',
	'admin.backups.auto.keepLabel': 'Automatic backups to keep',
	'admin.backups.auto.keepHelp':
		'When there are more, the oldest automatic one is deleted. The ones you create by hand are never deleted automatically.',
	'admin.backups.auto.keepMin': 'It has to be 1 or more.',
	'admin.backups.auto.saved': 'Automatic backups saved.',
	'admin.backups.dest.title': 'Where they are stored',
	'admin.backups.dest.local':
		'On this server, next to the website. If the server is lost, the backups are lost with it.',
	'admin.backups.dest.external': 'External storage',
	'admin.backups.dest.server': 'Server',
	'admin.backups.dest.bucket': 'Bucket',
	'admin.backups.dest.regionJoin': ' · region ',
	'admin.backups.dest.testOkAt': 'The storage answered at {time}.',
	'admin.backups.dest.testFailTitle': 'Could not connect to the storage',
	'admin.backups.dest.testFailBody':
		'Until it connects, new backups will fail. This is what the server answered:',
	'admin.backups.dest.testFailChange': 'Change the details',
	'admin.backups.dest.legend': 'Where the backups are stored',
	'admin.backups.dest.optLocal': 'On this server',
	'admin.backups.dest.optLocalHint': 'Next to the website. Nothing to set up.',
	'admin.backups.dest.optS3': 'In external storage',
	'admin.backups.dest.optS3Hint': 'An S3-compatible service, outside this server.',
	'admin.backups.dest.endpoint': 'Storage server',
	'admin.backups.dest.endpointHelp': 'The address your provider gives you (endpoint).',
	'admin.backups.dest.bucketLabel': 'Bucket',
	'admin.backups.dest.region': 'Region',
	'admin.backups.dest.accessKey': 'Access key',
	'admin.backups.dest.secret': 'Secret key',
	'admin.backups.dest.secretHelp':
		'Leave it empty to keep the one that is saved. Type only if you want to change it.',
	'admin.backups.dest.pathStyle': 'Force path-style addresses',
	'admin.backups.dest.pathStyleHint': 'Tick it only if your provider requires it.',
	'admin.backups.dest.noteToExternal':
		'The backups you already have are not moved. After saving, the list above will show the ones in the storage; the ones on this server stay there.',
	'admin.backups.dest.noteToLocal':
		'The backups you already have are not moved. After saving, the list above will show the ones on this server; the ones in the storage stay there. Its connection details are kept in case you go back.',
	'admin.backups.dest.saved': 'Backup location saved.',
	'admin.editors.addDialog.inviteLinkCustom':
		'The PocketBase password reset email template is customised: the link in the email is whatever it says, not the Vega page to choose a password.',
	'admin.editors.addDialog.inviteLinkForeignOrigin':
		'The link in the email still leads to the PocketBase dashboard, not to the Vega page to choose a password. Vega only changes it when you open it from the https address PocketBase has as its “Application URL”.',
	'admin.editors.addDialog.inviteLinkUnknown':
		'Could not check where the link in the invitation email leads.',
	'admin.editors.goToSettings': 'Go to Settings',
	'admin.mail.title': 'Email for invitations',
	'admin.mail.loading': 'Loading the email settings…',
	'admin.mail.loadError': 'Could not load the email settings.',
	'admin.mail.configured': 'Configured',
	'admin.mail.unconfiguredBody':
		'This server cannot send emails yet. Without email there are no invitations: you have to set each editor’s password yourself.',
	'admin.mail.configure': 'Set up email',
	'admin.mail.summary.server': 'Server',
	'admin.mail.summary.sender': 'Sender',
	'admin.mail.summary.links': 'Links lead to',
	'admin.mail.summary.senderJoin': ' · ',
	'admin.mail.testTo': 'Send a test to',
	'admin.mail.testSend': 'Send test',
	'admin.mail.testSending': 'Sending…',
	'admin.mail.testingStatus': 'Sending the test…',
	'admin.mail.testToInvalid': 'Type the address to send the test to.',
	'admin.mail.testOk': 'Test sent',
	'admin.mail.testOkAt':
		'The mail server accepted it at {time}. Check whether it has reached {email}.',
	'admin.mail.testFailTitle': 'The test did not go out',
	'admin.mail.testFailBody': 'This is what the server answered:',
	'admin.mail.testFailChange': 'Change the details',
	'admin.mail.legendSender': 'Who sends',
	'admin.mail.senderName': 'Sender name',
	'admin.mail.senderAddress': 'Sender address',
	'admin.mail.senderAddressInvalid': 'Type a valid email address.',
	'admin.mail.legendServer': 'Mail server (SMTP)',
	'admin.mail.host': 'Server',
	'admin.mail.hostRequired': 'Type the mail server.',
	'admin.mail.port': 'Port',
	'admin.mail.portInvalid': 'The port is a number between 1 and 65535.',
	'admin.mail.username': 'Username',
	'admin.mail.password': 'Password',
	'admin.mail.passwordHelp':
		'Leave it empty to keep the one that is there. Type only if you want to change it.',
	'admin.mail.removePassword': 'Remove the saved password',
	'admin.mail.tls': 'Always use TLS',
	'admin.mail.tlsHint':
		'Tick it if your provider uses port 465. With 587 leave it unticked: the connection is encrypted anyway.',
	'admin.mail.saved': 'Email saved. Send a test to check it.',
	'admin.mail.removeDialog.title': 'Remove the saved password?',
	'admin.mail.removeDialog.body':
		'The server will try to send without a password. If your provider requires one, invitations will stop going out until you set another.',
	'admin.mail.removeDialog.confirm': 'Remove the password',
	'admin.mail.removeDialog.removing': 'Removing…',
	'admin.mail.removeDialog.success': 'Password removed.',
	'admin.appUrl.label': 'Vega address',
	'admin.appUrl.help': 'The links in the emails start with it, like the one in the invitation.',
	'admin.appUrl.mismatch':
		'This is not the address you are using Vega from right now ({origin}). If it stays like this, the invitation link may lead to a place where Vega is not.',
	'admin.appUrl.mismatchClosed':
		'The links in the emails do not lead to the address you are using Vega from right now ({origin}).',
	'admin.appUrl.useCurrent': 'Use the current one',
	'admin.appUrl.http':
		'It starts with http://: whoever opens the link will choose their password over an unencrypted connection. Use https:// if the site has it.',
	'admin.appUrl.notHttp': 'Type the full address, starting with https://.',
	'admin.appUrl.linkFixed': 'The invitation email template now points to this address.',
	'admin.reset.title': 'Choose your password',
	'admin.reset.intro': 'It is the password you will use to sign in to this admin.',
	'admin.reset.submit': 'Save password',
	'admin.reset.saving': 'Saving…',
	'admin.reset.successTitle': 'Password saved',
	'admin.reset.successBody': 'You can now sign in with your email and the new password.',
	'admin.reset.toLogin': 'Go to sign in',
	'admin.reset.expiredTitle': 'This link no longer works',
	'admin.reset.expiredBody':
		'It has expired or was already used. Ask whoever manages this site to resend the invitation.',
	'admin.reset.missingToken':
		'The link is missing the code to choose a password. Open it exactly as it arrived in the email.',
	'admin.reset.errorTitle': 'Could not save the password',
	'admin.reset.unavailable': 'This server does not allow choosing the password from here.',
	'admin.form.password': 'Password',
	'admin.form.newPassword': 'New password',
	'admin.form.repeatPassword': 'Repeat it',
	'admin.form.passwordHint': 'At least {min} characters.',
	'admin.form.passwordTooShort': 'At least {min} characters.',
	'admin.form.passwordMismatch': 'It does not match the one above.',
	'admin.form.passwordRejected': 'The server does not accept this password: {message}',
	'admin.form.emailInvalid': 'Enter a valid email.',
	'admin.form.emailTaken': 'There is already an editor with that email.',
	'admin.form.emailRejected': 'The server does not accept this email: {message}',
	'admin.form.rejected': 'The server rejected the data: {message}',

	// ————— Toasts (§2.3) —————
	'toast.dismiss': 'Dismiss notification',

	// ————— Generic —————
	'common.retry': 'Retry',
	'common.cancel': 'Cancel',
	'common.close': 'Close',
	'common.loading': 'Loading…',
	'common.networkError': 'Could not connect to the site. Check your connection and try again.',

	// ————— Translated backend errors (`VegaError.backendCode`) —————
	'errors.backendCode.recordInUse':
		'It cannot be deleted: other content depends on this item. Remove that reference first.',
	'errors.backendCode.badRequest': 'The request is not valid. Reload the page and try again.',
	'errors.backendCode.serverError': 'The server failed. Try again in a few minutes.',

	// ————— Review before publishing (`$lib/publish-review`, warnings only) —————
	'review.seo.descriptionEmpty':
		'The search description is empty: the general site description will be used.',
	'review.seo.descriptionLong':
		'The description is {length} characters long and search engines usually cut it after {max}.',
	'review.seo.socialImageMissing': 'There is no social image: the page will be shared without one.',
	'review.seo.noindex':
		'It is marked «Do not index»: search engines will not show it and it will not appear in the sitemap.',
	'review.link.notFound': 'The link to {href} does not lead to any page or redirect on the site.',
	'review.link.redirectDeadEnd':
		'The link to {href} goes through a redirect that ends at {to}, and that path does not exist.',
	'review.link.redirectLoop': 'The link to {href} enters a redirect loop.',
	'review.link.draftTarget':
		'The link to {href} leads to a page that is still a draft and will not be visible on the site.',
	'review.media.altMissing': 'The image «{file}» has no alt text.',
	'review.media.altMissingInline':
		'The image «{file}» in the text declares no alt text: describe it, or leave it empty if it is decorative.',
	// The «Review» card of the form and the popover of the visual editor (batch 13).
	'review.title': 'Review',
	'review.count.one': '1 warning',
	'review.count.many': '{count} warnings',
	'review.count.none': 'No warnings',
	'review.count.incomplete': 'Incomplete',
	'review.checking': 'Checking…',
	'review.group.seo': 'SEO',
	'review.group.links': 'Links',
	'review.group.media': 'Images',
	'review.group.skipped': 'Not checked',
	'review.skipped.links':
		'Vega could not find out which pages and redirects the site has, so links were not checked.',
	'review.skipped.media':
		'The media library could not be read, so the alt text of the images was not checked.',
	'review.skipped.mediaPartial':
		'The media library could not be read, so the alt text of its images was not checked.',
	'review.recheck': 'Check again',
	'review.loadError': 'The page blocks could not be read: links and images were not checked.',
	'review.notBlocking': 'No warning prevents publishing.',
	'review.more': 'Show {count} more',
	'review.less': 'Show less',
	'review.go.field': '{label}',
	'review.go.field.a11y': 'Go to the {label} field',
	'review.go.block': 'Block {position} · {block} › {label}',
	'review.go.block.a11y': 'Block {position} · {block} › {label}: go to the field',
	'review.go.form': 'Open {label} in the form',
	'review.go.visualBlock': 'Block {position} · {block}',
	'review.go.visualBlock.a11y': 'Block {position} · {block}: select it in the tree',
	'review.where.block': 'Block {position} · {block}',
	'review.describeImage': 'Describe the image…',
	'review.statusLine.one': 'The review has {count} warning.',
	'review.statusLine.many': 'The review has {count} warnings.',
	'review.statusLine.incomplete': 'The review could not be completed.',
	'review.statusLine.open': 'See the review'
};
