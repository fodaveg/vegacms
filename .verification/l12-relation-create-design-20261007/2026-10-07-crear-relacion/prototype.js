// Local interaction sketch only. No requests, persistence, or product code.
const copy = {
	es: {
		mockup:
			'Propuesta sin aprobar · montaje con esquema y valores de fixtures reales · simulación local, no guarda en Vega.',
		dirty: '● sin guardar',
		saveParent: 'Guardar',
		title: 'Título',
		search: 'Buscar por título…',
		empty: '— sin selección —',
		noResults: 'Sin resultados',
		typeSearch: 'Escribe para buscar…',
		createAction: 'Crear etiqueta «{name}»…',
		createBlank: 'Crear etiqueta…',
		help: 'Elige una etiqueta existente o crea una nueva.',
		readonly: 'Solo lectura',
		denied: 'Puedes elegir etiquetas existentes. No puedes crear etiquetas.',
		hidden: 'Puedes elegir etiquetas existentes.',
		limit: 'Quita una etiqueta para poder seleccionar otra.',
		dialog: 'Crear etiqueta',
		returnTo: 'Vuelves a esta entrada al terminar.',
		name: 'Nombre *',
		slugHelp:
			'La parte de la dirección del sitio que identifica la etiqueta. Se puede regenerar a partir del nombre.',
		independent:
			'La etiqueta se guarda ahora. La entrada se guarda después, con «Guardar». Si descartas la entrada, la etiqueta seguirá existiendo.',
		create: 'Crear y seleccionar',
		cancel: 'Cancelar',
		close: 'Cerrar',
		saving: 'Creando…',
		required: 'Completa este campo.',
		duplicateError: 'Esta dirección ya está en uso.',
		duplicate:
			'Hay una etiqueta visible con esta dirección. Puedes seleccionarla o cambiar la dirección para crear otra.',
		useExisting: 'Usar «Taller» existente',
		network:
			'Se perdió la conexión. No sabemos si se creó la etiqueta. Conservamos lo que has escrito; busca primero si ya existe antes de volver a crearla.',
		check: 'Buscar si ya existe',
		success: 'Etiqueta «{name}» creada y seleccionada. La entrada sigue sin guardar.',
		selected: 'Seleccionada: {name}',
		remove: 'Quitar',
		discardTitle: '¿Descartar esta etiqueta?',
		discardBody:
			'Se perderán los cambios de esta etiqueta. Los cambios de la entrada se conservan.',
		keep: 'Seguir editando',
		discard: 'Descartar etiqueta',
		parentDemo: 'Mockup: el guardado de la entrada no está conectado.',
		existingSuccess: 'Etiqueta existente seleccionada. La entrada sigue sin guardar.'
	},
	en: {
		mockup:
			'Unapproved proposal · composition with real schema and fixture values · local simulation; does not save to Vega.',
		dirty: '● unsaved',
		saveParent: 'Save',
		title: 'Title',
		search: 'Search by title…',
		empty: '— no selection —',
		noResults: 'No results',
		typeSearch: 'Type to search…',
		createAction: 'Create tag “{name}”…',
		createBlank: 'Create tag…',
		help: 'Choose an existing tag or create a new one.',
		readonly: 'Read only',
		denied: 'You can choose existing tags. You cannot create tags.',
		hidden: 'You can choose existing tags.',
		limit: 'Remove a tag before selecting another.',
		dialog: 'Create tag',
		returnTo: 'Return to this entry when you finish.',
		name: 'Name *',
		slugHelp:
			'La parte de la dirección del sitio que identifica la etiqueta. Se puede regenerar a partir del nombre.',
		independent:
			'The tag is saved now. Save the entry afterwards using “Save”. If you discard the entry, the tag will still exist.',
		create: 'Create and select',
		cancel: 'Cancel',
		close: 'Close',
		saving: 'Creating…',
		required: 'Complete this field.',
		duplicateError: 'This address is already in use.',
		duplicate:
			'There is a visible tag with this address. Select it, or change the address to create another.',
		useExisting: 'Use existing “Taller”',
		network:
			'The connection was lost. We do not know whether the tag was created. Your input is preserved; check whether it already exists before trying again.',
		check: 'Check whether it exists',
		success: 'Tag “{name}” created and selected. The entry is still unsaved.',
		selected: 'Selected: {name}',
		remove: 'Remove',
		discardTitle: 'Discard this tag?',
		discardBody: 'Changes to this tag will be lost. Changes to the entry will be kept.',
		keep: 'Keep editing',
		discard: 'Discard tag',
		parentDemo: 'Mockup: saving the entry is not connected.',
		existingSuccess: 'Existing tag selected. The entry is still unsaved.'
	}
};
const byId = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const mq = matchMedia('(prefers-color-scheme:dark)');
let lang = params.get('lang') || 'es',
	scenario = params.get('state') || 'normal',
	initialStage = '{{STAGE}}';
let selected = '',
	childBaseline = '',
	discarding = false,
	busy = false,
	returnFocus = null;
const t = (key, name = '') => copy[lang][key].replace('{name}', name);
const longText = 'Migrar el blog de Hugo a Astro sin romper las URLs';
byId('language').value = lang;
byId('scenario').value = scenario;
byId('mode').value = params.get('mode') || 'system';
byId('theme').value = params.get('theme') || 'niebla';
function applyTheme() {
	document.documentElement.dataset.theme = byId('theme').value;
	document.documentElement.dataset.mode =
		byId('mode').value === 'system' ? (mq.matches ? 'dark' : 'light') : byId('mode').value;
}
function translate() {
	document.documentElement.lang = lang;
	document.querySelectorAll('[data-copy]').forEach((el) => (el.textContent = t(el.dataset.copy)));
	byId('search').placeholder = t('search');
	byId('close').ariaLabel = t('close');
}
function renderSelected() {
	const box = byId('selected');
	box.replaceChildren();
	if (!selected) {
		box.textContent = t('empty');
		box.className = 'status';
		return;
	}
	box.className = 'selected';
	const chip = document.createElement('span');
	chip.className = 'chip';
	const label = document.createElement('span');
	label.textContent = selected;
	const remove = document.createElement('button');
	remove.type = 'button';
	remove.textContent = t('remove');
	remove.ariaLabel = t('remove') + ' ' + selected;
	remove.hidden = scenario === 'readonly';
	remove.onclick = () => {
		selected = '';
		renderSelected();
		byId('success').hidden = true;
	};
	chip.append(label, remove);
	box.append(chip);
}
function updateSearch() {
	const query = byId('search').value.trim();
	byId('search-status').textContent = t(query ? 'noResults' : 'typeSearch');
	byId('open-create').textContent = query ? t('createAction', query) : t('createBlank');
	byId('open-create').hidden = ['readonly', 'denied', 'hidden'].includes(scenario);
	byId('open-create').disabled = scenario === 'limit';
	byId('search').readOnly = scenario === 'readonly';
	byId('search').hidden = scenario === 'readonly';
	byId('search-status').hidden = scenario === 'readonly';
	byId('relation-help').textContent = t(
		['readonly', 'denied', 'hidden', 'limit'].includes(scenario) ? scenario : 'help'
	);
}
function resetMessages() {
	for (const id of ['name-error', 'slug-error', 'form-error', 'duplicate', 'discard'])
		byId(id).hidden = true;
	for (const id of ['name', 'slug']) {
		byId(id).removeAttribute('aria-invalid');
		byId(id).removeAttribute('aria-describedby');
	}
	byId('child-fields').hidden = false;
	byId('modal-note').hidden = false;
	discarding = false;
	busy = false;
	byId('name').readOnly = false;
	byId('slug').readOnly = false;
	for (const id of ['submit', 'cancel', 'close']) byId(id).setAttribute('aria-disabled', 'false');
	byId('submit').textContent = t('create');
	byId('cancel').textContent = t('cancel');
}
function showModal() {
	if (['readonly', 'denied', 'hidden', 'limit'].includes(scenario)) return;
	returnFocus = document.activeElement;
	resetMessages();
	byId('name').value = byId('search').value.trim();
	byId('slug').value = byId('name').value === 'Taller' ? 'taller' : '';
	childBaseline = byId('name').value + '|' + byId('slug').value;
	byId('modal-title').textContent = t('dialog');
	byId('modal').hidden = false;
	byId('parent-screen').inert = true;
	byId('name').focus();
	if (scenario === 'loading') {
		busy = true;
		byId('submit').textContent = t('saving');
		for (const id of ['submit', 'cancel', 'close']) byId(id).setAttribute('aria-disabled', 'true');
		byId('child-form').setAttribute('aria-busy', 'true');
		byId('name').readOnly = true;
		byId('slug').readOnly = true;
	} else byId('child-form').removeAttribute('aria-busy');
	if (scenario === 'validation') {
		byId('slug').value = '';
		fieldError('slug', t('required'));
	}
	if (scenario === 'duplicate') {
		fieldError('slug', t('duplicateError'));
		byId('duplicate').hidden = false;
	}
	if (scenario === 'network') {
		byId('form-error').textContent = t('network');
		byId('form-error').hidden = false;
		byId('submit').textContent = t('check');
	}
}
function closeModal() {
	byId('modal').hidden = true;
	byId('parent-screen').inert = false;
	discarding = false;
	(returnFocus?.isConnected ? returnFocus : byId('open-create')).focus();
}
function cancel() {
	if (busy) return;
	if (discarding) {
		resetMessages();
		byId('modal-title').textContent = t('dialog');
		byId('name').focus();
		return;
	}
	if (childBaseline !== byId('name').value + '|' + byId('slug').value) {
		discarding = true;
		byId('modal-title').textContent = t('discardTitle');
		byId('child-fields').hidden = true;
		byId('modal-note').hidden = true;
		byId('discard').hidden = false;
		byId('cancel').textContent = t('keep');
		byId('submit').textContent = t('discard');
		byId('cancel').focus();
	} else closeModal();
}
function fieldError(id, message) {
	byId(id).setAttribute('aria-invalid', 'true');
	byId(id).setAttribute('aria-describedby', id + '-error');
	byId(id + '-error').textContent = message;
	byId(id + '-error').hidden = false;
	byId(id).focus();
}
function selectCreated(existing = false) {
	selected = byId('name').value.trim() || 'Taller';
	byId('search').value = '';
	updateSearch();
	renderSelected();
	byId('success').textContent = existing ? t('existingSuccess') : t('success', selected);
	byId('success').hidden = false;
	closeModal();
	byId('selected').querySelector('button')?.focus();
}
byId('child-form').onsubmit = (e) => {
	e.preventDefault();
	if (busy) return;
	if (discarding) {
		closeModal();
		return;
	}
	if (scenario === 'network') {
		byId('duplicate').hidden = false;
		return;
	}
	if (!byId('name').value.trim()) {
		fieldError('name', t('required'));
		return;
	}
	if (!byId('slug').value.trim()) {
		fieldError('slug', t('required'));
		return;
	}
	if (scenario === 'duplicate' && byId('slug').value === 'taller') {
		fieldError('slug', t('duplicateError'));
		return;
	}
	selectCreated();
};
byId('open-create').onclick = showModal;
byId('cancel').onclick = cancel;
byId('close').onclick = cancel;
byId('use-existing').onclick = () => selectCreated(true);
byId('search').oninput = updateSearch;
byId('search').onkeydown = (e) => {
	if (e.key === 'Enter') e.preventDefault();
};
byId('language').onchange = () => {
	lang = byId('language').value;
	translate();
	renderSelected();
	updateSearch();
	if (!byId('modal').hidden) showModal();
};
byId('theme').onchange = applyTheme;
byId('mode').onchange = applyTheme;
mq.addEventListener('change', applyTheme);
byId('scenario').onchange = () => {
	scenario = byId('scenario').value;
	byId('modal').hidden = true;
	byId('parent-screen').inert = false;
	selected = scenario === 'readonly' ? 'Taller' : '';
	byId('search').value = scenario === 'empty' ? '' : scenario === 'long' ? longText : 'Taller';
	translate();
	renderSelected();
	updateSearch();
	if (
		['loading', 'validation', 'duplicate', 'network'].includes(scenario) ||
		initialStage === 'create'
	)
		showModal();
};
document.querySelector('.save-parent').onclick = () => {
	byId('success').hidden = false;
	byId('success').textContent = t('parentDemo');
};
document.addEventListener('keydown', (e) => {
	if (byId('modal').hidden) return;
	if (e.key === 'Escape') {
		e.preventDefault();
		cancel();
	}
	if (e.key === 'Tab') {
		const items = [...byId('modal').querySelectorAll('button,input')].filter(
			(x) => x.getClientRects().length && !x.disabled
		);
		const first = items[0],
			last = items.at(-1);
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
});
applyTheme();
translate();
renderSelected();
updateSearch();
if (scenario !== 'normal') byId('scenario').onchange();
else if (initialStage === 'create') showModal();
else if (initialStage === 'selected') {
	selected = 'Taller';
	byId('search').value = '';
	updateSearch();
	renderSelected();
	byId('success').textContent = t('success', selected);
	byId('success').hidden = false;
}

addEventListener('message', (e) => {
	if (e.source !== parent || e.data?.type !== 'review-config') return;
	const c = e.data;
	lang = c.lang;
	byId('language').value = lang;
	byId('mode').value = c.mode;
	byId('theme').value = c.theme;
	byId('scenario').value = c.scenario;
	applyTheme();
	byId('scenario').onchange();
	if (initialStage === 'selected' && scenario === 'normal') {
		selected = 'Taller';
		byId('search').value = '';
		updateSearch();
		renderSelected();
		byId('success').textContent = t('success', selected);
		byId('success').hidden = false;
	}
});
