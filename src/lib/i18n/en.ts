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

	// ————— Login / session —————
	'login.title': 'Sign in to Vega',
	'login.email': 'Email',
	'login.password': 'Password',
	'login.submit': 'Sign in',
	'login.submitting': 'Signing in…',
	'login.invalidCredentials': 'Invalid credentials.',
	'login.networkError': 'Could not reach the backend.',
	'session.reloginTitle': 'Your session has expired',
	'session.reloginBody': 'Sign in again to pick up where you left off. Nothing is lost.',
	'session.reloginSubmit': 'Re-authenticate',
	'session.logoutConfirm': 'There are unsaved changes. Log out anyway?',

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

	// ————— Record editor (P5 contract, Phase F5-a) —————
	'editor.create.title': 'Create «{label}»',
	'editor.edit.title': 'Edit «{label}»',
	'editor.cancel': 'Back',
	'editor.save': 'Save',
	'editor.saving': 'Saving…',
	'editor.saveSuccess': 'Saved.',
	'editor.leaveConfirm': 'There are unsaved changes. Leave anyway?',
	'editor.readonlyNotice': 'This collection is read-only: it cannot be edited.',
	'editor.load.error.body': 'Could not load the record. {message}',

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

	// ————— List (P4 contract, Phase 4c) —————
	'list.empty.title': "There's nothing here yet",
	'list.empty.body': 'Create the first "{label}" record to get started.',
	'list.empty.cta': 'Create',
	'list.error.title': 'The list could not be loaded',
	'list.error.body': '{message}',
	'list.pagination.prev': 'Previous',
	'list.pagination.next': 'Next',
	'list.pagination.pageOf': '{page} of {totalPages}',
	'list.pagination.total': '{count} records',
	'list.cell.yes': 'Yes',
	'list.cell.no': 'No',
	'list.untitled': '(untitled)',

	// ————— List toolbar (P4 contract, Phase 4d) —————
	'list.search.placeholder': 'Search…',
	'list.search.ariaLabel': 'Search the list',
	'list.filter.status.label': 'Status',
	'list.filter.status.all': 'All',
	'list.sort.ariaLabel': 'Sort by {column}',
	'list.emptySearch.title': 'No results',
	'list.emptySearch.body': 'No "{label}" record matches the search or the active filters.',
	'list.emptySearch.clear': 'Clear filters',

	// ————— Delete (P4 contract, Phase 4e) —————
	'list.actions.header': 'Actions',
	'list.delete.rowButton': 'Delete',
	'list.delete.rowButtonLabel': 'Delete "{label}"',
	'list.delete.confirmTitle': 'Delete this record?',
	'list.delete.confirmBody': '"{label}" will be permanently deleted. This action cannot be undone.',
	'list.delete.confirm': 'Delete',
	'list.delete.deleting': 'Deleting…',
	'list.delete.success': '"{label}" was deleted.',

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
	// D-P6.5/audit H3: the media model COPIES bytes, it never references (`filePerRecord`) — deleting
	// the original from the library does not break copies already inserted into records, so the
	// warning is honest and generic, with NO usage counter (there is no reverse "who uses this asset"
	// query).
	'media.detail.delete': 'Delete',
	'media.delete.confirmTitle': 'Delete "{label}"?',
	'media.delete.confirmBody':
		'This deletes the original from the library. Copies already inserted by the library into records are not affected.',
	'media.delete.confirm': 'Delete',
	'media.delete.deleting': 'Deleting…',
	'media.delete.success': '"{label}" was deleted from the library.',

	// ————— Media: drag&drop upload (Phase P6·6c) —————
	'media.upload.inputLabel': 'Upload files',
	'media.upload.dropHint':
		'Drag files here or use the button above to pick them. You can select several at once.',
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

	// ————— Appearance: theme + mode picker (Phase F7w-a, "turning the themes on") —————
	'settings.appearance.title': 'Appearance',
	'settings.appearance.theme': 'Theme',
	'settings.appearance.mode': 'Mode',
	'settings.appearance.light': 'Light',
	'settings.appearance.dark': 'Dark',

	// ————— Toasts (§2.3) —————
	'toast.dismiss': 'Dismiss notification',

	// ————— Generic —————
	'common.retry': 'Retry',
	'common.cancel': 'Cancel',
	'common.close': 'Close',
	'common.loading': 'Loading…'
};
