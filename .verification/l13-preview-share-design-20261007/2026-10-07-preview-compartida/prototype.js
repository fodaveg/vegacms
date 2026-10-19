// Local simulation. Reserved .test URL is a synthetic fixture, never a live secret.
const copy = {
	es: {
		mockup:
			'Montaje con página real de fixture y datos del contrato · simulación local · no crea enlaces reales ni modifica el portapapeles.',
		open: 'Compartir vista previa',
		save: 'Guardar',
		saved: 'Guardado',
		dirty: 'sin guardar',
		dirtyNotice:
			'Hay cambios sin guardar. El enlace muestra lo guardado, no estos cambios. Cada vez que guardes después, el enlace mostrará esa versión.',
		scope:
			'Quien tenga un enlace verá lo que esté guardado al abrirlo, aunque la página no esté publicada.',
		manageTitle: 'Enlaces de vista previa',
		createTitle: 'Crear enlace',
		successTitle: 'Copia el enlace ahora',
		revokeTitle: '¿Anular este enlace?',
		closeTitle: '¿Cerrar sin copiar?',
		label: 'Etiqueta (opcional)',
		labelHelp: 'Para reconocer el enlace. No cambia quién puede abrirlo.',
		duration: 'Duración',
		durationHelp: 'Máximo 30 días. El servidor valida la duración permitida.',
		days: 'Días',
		hours: 'Horas',
		minutes: 'Minutos',
		seconds: 'Segundos',
		publicScope:
			'Cualquiera que reciba el enlace podrá ver la página guardada. Puedes anularlo; dejará de funcionar en la siguiente visita.',
		active: 'Activo',
		expired: 'Caducado',
		createdAt: 'Creado: {date}',
		expiresAt: 'Caduca: {date}',
		expiredAt: 'Caducó: {date}',
		emptyTitle: 'No hay enlaces activos',
		emptyBody: 'Crea uno cuando quieras compartir la página guardada.',
		revoked: 'Enlace anulado. Ya no funcionará en la siguiente visita.',
		listNoUrl:
			'Las direcciones no se pueden recuperar. Si has perdido una, crea otro enlace y anula el anterior.',
		newLink: 'Crear enlace',
		create: 'Crear enlace',
		cancel: 'Cancelar',
		close: 'Cerrar',
		revoke: 'Anular',
		revokeConfirm: 'Anular enlace',
		revokeWarning:
			'Quien lo abra a partir de ahora ya no podrá ver la página. Anular no borra la página ni se puede deshacer.',
		createdSuccess: 'Enlace creado',
		url: 'Enlace para compartir',
		oneTime:
			'Esta dirección solo se muestra ahora. Cópiala antes de cerrar: después no podrás recuperarla.',
		copy: 'Copiar enlace',
		copied: 'Copiado (simulación)',
		closeWarning:
			'No volverás a ver esta dirección. El enlace seguirá activo hasta que caduque o lo anules.',
		keep: 'Volver al enlace',
		closeLose: 'Cerrar sin copiar',
		loading: 'Cargando enlaces…',
		creating: 'Creando…',
		listError:
			'No se pudieron cargar los enlaces. La lista puede estar incompleta; vuelve a intentarlo.',
		retry: 'Reintentar',
		ttlLocal: 'Escribe una duración entera positiva, de 30 días como máximo.',
		ttlServer: 'El servidor no acepta esta duración. Elige otra; el valor no se ha cambiado.',
		createError: 'No se pudo crear el enlace. Se conservan la etiqueta y la duración.',
		uncertain:
			'No sabemos si el enlace llegó a crearse. Consulta los enlaces activos antes de repetir: si aparece el nuevo pero no recibiste su URL, anúlalo y crea otro.',
		denied: 'Compartir requiere permiso para editar esta página.',
		new: 'Guarda la página antes de compartir una vista previa.',
		unsupported: 'Este sitio no ofrece enlaces de vista previa.',
		unlabeled: 'Sin etiqueta',
		limit: 'Esta página ya tiene 20 enlaces activos. Anula uno antes de crear otro.'
	},
	en: {
		mockup:
			'Composition with a real fixture page and contract data · local simulation · no real links or clipboard changes.',
		open: 'Share preview',
		save: 'Save',
		saved: 'Saved',
		dirty: 'unsaved',
		dirtyNotice:
			'There are unsaved changes. The link shows saved content, not these changes. Each later save will be visible through the link.',
		scope:
			'Anyone with a link sees what is saved when they open it, even if the page is not published.',
		manageTitle: 'Preview links',
		createTitle: 'Create link',
		successTitle: 'Copy the link now',
		revokeTitle: 'Revoke this link?',
		closeTitle: 'Close without copying?',
		label: 'Label (optional)',
		labelHelp: 'To recognise this link. It does not change who can open it.',
		duration: 'Lifetime',
		durationHelp: 'Up to 30 days. The server validates the allowed lifetime.',
		days: 'Days',
		hours: 'Hours',
		minutes: 'Minutes',
		seconds: 'Seconds',
		publicScope:
			'Anyone who receives the link can view the saved page. You can revoke it; it stops working on the next visit.',
		active: 'Active',
		expired: 'Expired',
		createdAt: 'Created: {date}',
		expiresAt: 'Expires: {date}',
		expiredAt: 'Expired: {date}',
		emptyTitle: 'No active links',
		emptyBody: 'Create one when you want to share the saved page.',
		revoked: 'Link revoked. It will no longer work on the next visit.',
		listNoUrl:
			'Link addresses cannot be recovered. If you lose one, create a new link and revoke the old one.',
		newLink: 'Create link',
		create: 'Create link',
		cancel: 'Cancel',
		close: 'Close',
		revoke: 'Revoke',
		revokeConfirm: 'Revoke link',
		revokeWarning:
			'Anyone opening it from now on will no longer see the page. Revoking does not delete the page and cannot be undone.',
		createdSuccess: 'Link created',
		url: 'Link to share',
		oneTime:
			'This address is only shown now. Copy it before closing: you cannot recover it afterwards.',
		copy: 'Copy link',
		copied: 'Copied (simulation)',
		closeWarning:
			'You will not see this address again. The link remains active until it expires or you revoke it.',
		keep: 'Back to the link',
		closeLose: 'Close without copying',
		loading: 'Loading links…',
		creating: 'Creating…',
		listError: 'Links could not be loaded. The list may be incomplete; please try again.',
		retry: 'Retry',
		ttlLocal: 'Enter a positive whole lifetime, up to 30 days.',
		ttlServer:
			'The server does not accept this lifetime. Choose another; the value has not been changed.',
		createError: 'The link could not be created. Label and lifetime have been kept.',
		uncertain:
			'We do not know whether the link was created. Check active links before retrying. If it appears but you did not receive its URL, revoke it and create another.',
		denied: 'Sharing requires permission to edit this page.',
		new: 'Save the page before sharing a preview.',
		unsupported: 'This site does not offer preview links.',
		unlabeled: 'No label',
		limit: 'This page already has 20 active links. Revoke one before creating another.'
	}
};
const $ = (id) => document.getElementById(id),
	params = new URLSearchParams(location.search),
	mq = matchMedia('(prefers-color-scheme:dark)');
let lang = params.get('lang') || 'es',
	scenario = params.get('state') || 'normal',
	stage = '{{STAGE}}',
	view = 'manage',
	secret = null,
	copied = false,
	busy = false,
	rowExists = true,
	label = 'Ana (client)';
const fixtureCreated = '2026-10-01T12:00:00.000Z',
	fixtureExpires = '2026-10-08T12:00:00.000Z',
	clock = '2026-10-07T08:00:00.000Z';
const t = (k, v = '') => copy[lang][k].replace('{date}', v);
const fmt = (iso) =>
	new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-GB', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Europe/Madrid'
	}).format(new Date(iso)) + ' · Europe/Madrid';
function translate() {
	document.documentElement.lang = lang;
	document.querySelectorAll('[data-copy]').forEach((el) => (el.textContent = t(el.dataset.copy)));
	$('close').ariaLabel = t('close');
	$('unit').ariaLabel = lang === 'es' ? 'Unidad de duración' : 'Lifetime unit';
	$('saved-state').textContent = t(scenario === 'dirty' ? 'dirty' : 'saved');
}
function theme() {
	document.documentElement.dataset.theme = $('theme').value;
	document.documentElement.dataset.mode =
		$('mode').value === 'system' ? (mq.matches ? 'dark' : 'light') : $('mode').value;
}
function setView(next) {
	view = next;
	for (const id of ['manage', 'create', 'success', 'close-confirm', 'revoke-confirm'])
		$(id).hidden = id !== next;
	const key = {
		manage: 'manageTitle',
		create: 'createTitle',
		success: 'successTitle',
		'close-confirm': 'closeTitle',
		'revoke-confirm': 'revokeTitle'
	}[next];
	$('dialog-title').textContent = t(key);
	$('dirty-notice').hidden = scenario !== 'dirty';
	requestAnimationFrame(() => {
		const first = $(next).querySelector('input,textarea,button');
		(first || $('close')).focus();
	});
}
function manage() {
	setView('manage');
	const loading = scenario === 'loading',
		error = scenario === 'error',
		expired = scenario === 'expired';
	$('load-status').hidden = !loading;
	$('load-status').textContent = t('loading');
	$('list-error').hidden = !error;
	$('link-row').hidden = !rowExists || loading || error;
	$('empty').hidden = rowExists || loading || error;
	$('link-label').textContent = label || t('unlabeled');
	$('created').textContent = t('createdAt', fmt(fixtureCreated));
	$('expires').textContent = t(expired ? 'expiredAt' : 'expiresAt', fmt(fixtureExpires));
	$('link-state').textContent = t(expired ? 'expired' : 'active');
	$('link-state').classList.toggle('expired', expired);
	$('revoke').hidden = expired;
	$('new-link').disabled = loading || error;
	$('revoked-notice').hidden = scenario !== 'revoked';
}
function showSuccess(ttl = 86400) {
	secret = 'https://example.test/preview-share/s1.k3j9x0q2m5n8p1r.Zm9vYmFyLW1vY2t1cC1vbmx5';
	copied = false;
	$('url').value = secret;
	$('copy-status').textContent = '';
	$('new-expires').textContent = t(
		'expiresAt',
		fmt(new Date(Date.parse(clock) + ttl * 1000).toISOString())
	);
	setView('success');
}
function clearAndClose() {
	secret = null;
	$('url').value = '';
	$('copy-status').textContent = '';
	$('modal').hidden = true;
	$('parent-screen').inert = false;
	$('open').focus();
}
function requestClose() {
	if (busy) return;
	if (secret && !copied) {
		setView('close-confirm');
		return;
	}
	clearAndClose();
}
function open() {
	if (['denied', 'new', 'unsupported'].includes(scenario)) return;
	$('modal').hidden = false;
	$('parent-screen').inert = true;
	if (scenario === 'expired' || scenario === 'revoked') {
		rowExists = false;
		scenario = 'empty';
	}
	manage();
}
function reset() {
	lang = $('language').value;
	scenario = $('scenario').value;
	translate();
	theme();
	busy = scenario === 'busy';
	rowExists = !['empty', 'revoked'].includes(scenario);
	label =
		scenario === 'long'
			? 'Migrar el blog de Hugo a Astro sin romper las URLs · revisión de contenido y enlaces existentes'
			: 'Ana (client)';
	secret = null;
	copied = false;
	$('url').value = '';
	$('label').value = scenario === 'long' ? label : '';
	$('create-error').hidden = true;
	$('ttl-error').hidden = true;
	$('quantity').removeAttribute('aria-invalid');
	$('create').ariaBusy = String(busy);
	$('close').ariaDisabled = String(busy);
	$('create-submit').disabled = busy;
	$('back').disabled = busy;
	$('label').readOnly = busy;
	$('quantity').readOnly = busy;
	$('unit').disabled = busy;
	const unavailable = ['denied', 'new', 'unsupported'].includes(scenario);
	$('open').hidden = unavailable;
	$('availability').hidden = !unavailable;
	if (unavailable) $('availability').textContent = t(scenario);
	$('modal').hidden = unavailable;
	$('parent-screen').inert = !unavailable;
	if (unavailable) return;
	manage();
	if (stage === 'create' || ['busy', 'ttl', 'uncertain'].includes(scenario)) {
		setView('create');
		if (busy) $('create-submit').textContent = t('creating');
		if (scenario === 'ttl') {
			$('ttl-error').hidden = false;
			$('ttl-error').textContent = t('ttlServer');
			$('quantity').setAttribute('aria-invalid', 'true');
		}
		if (scenario === 'uncertain') {
			$('create-error').hidden = false;
			$('create-error').textContent = t('uncertain');
			$('create-submit').disabled = true;
			$('back').textContent = lang === 'es' ? 'Consultar enlaces activos' : 'Check active links';
		}
	}
	if (stage === 'success') showSuccess();
}
$('open').onclick = open;
for (const id of ['close', 'done', 'success-close']) $(id).onclick = requestClose;
$('keep').onclick = () => setView('success');
$('lose').onclick = clearAndClose;
$('new-link').onclick = () => setView('create');
$('back').onclick = () => {
	if (busy) return;
	scenario = 'normal';
	manage();
};
$('copy').onclick = () => {
	copied = true;
	$('copy-status').textContent = t('copied');
};
$('retry').onclick = () => {
	scenario = 'normal';
	manage();
};
$('revoke').onclick = () => {
	$('revoke-label').textContent = label || t('unlabeled');
	setView('revoke-confirm');
};
$('revoke-cancel').onclick = () => {
	manage();
	requestAnimationFrame(() => $('revoke').focus());
};
$('revoke-submit').onclick = () => {
	rowExists = false;
	scenario = 'revoked';
	manage();
};
$('create').onsubmit = (e) => {
	e.preventDefault();
	if (busy) return;
	const qty = Number($('quantity').value),
		ttl = qty * Number($('unit').value);
	if (!Number.isInteger(qty) || qty <= 0 || !Number.isInteger(ttl) || ttl > 2592000) {
		$('ttl-error').hidden = false;
		$('ttl-error').textContent = t('ttlLocal');
		$('quantity').setAttribute('aria-invalid', 'true');
		$('quantity').focus();
		return;
	}
	if (scenario === 'ttl') {
		$('ttl-error').hidden = false;
		$('ttl-error').textContent = t('ttlServer');
		$('quantity').focus();
		return;
	}
	if (scenario === 'error') {
		$('create-error').hidden = false;
		$('create-error').textContent = t('createError');
		return;
	}
	label = $('label').value.trim();
	rowExists = true;
	showSuccess(ttl);
};
$('quantity').ariaDescribedBy = 'ttl-error';
$('modal').addEventListener('keydown', (e) => {
	if (e.key === 'Escape') {
		e.preventDefault();
		requestClose();
	}
	if (e.key === 'Tab') {
		const els = [...$('modal').querySelectorAll('button,input,select,textarea')].filter(
			(el) => !el.disabled && el.getClientRects().length
		);
		const first = els[0],
			last = els.at(-1);
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
});
$('language').value = ['es', 'en'].includes(lang) ? lang : 'es';
$('scenario').value = scenario;
$('theme').value = params.get('theme') || 'niebla';
$('mode').value = params.get('mode') || 'system';
for (const id of ['language', 'scenario']) $(id).onchange = reset;
for (const id of ['theme', 'mode']) $(id).onchange = theme;
mq.addEventListener('change', theme);
window.addEventListener('message', (e) => {
	if (e.source !== parent || e.data?.type !== 'preview-design') return;
	for (const key of ['theme', 'mode']) if (e.data[key]) $(key).value = e.data[key];
	if (e.data.lang) $('language').value = e.data.lang;
	reset();
});
reset();
