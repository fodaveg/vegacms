// Monta las láminas autocontenidas del Lote 12 «Mejoras de UX» a partir de `fuente/*.html`.
//
// Misma mecánica que `design/mockups/2026-10-01-ajustes-y-sembrado/build.mjs`: los tokens y el
// «antes» salen del CÓDIGO, no de la memoria. En cada montaje se copian tal cual:
//   - `src/lib/themes/themes.generated.css` (los 21 temas, claro y oscuro)
//   - `src/lib/theme/base.css` y `src/lib/admin/admin.css`
//   - los bloques `<style>` de los componentes Svelte de COMPONENTES (el CSS con ámbito de Svelte
//     se vuelve global quitando `:global(...)`; todos usan prefijo `.vega-`)
//   - los trazos de `src/lib/icons/Icon.svelte` (ningún icono existente se dibuja a mano)
// Lo único escrito para las láminas es `fuente/lamina.css` (cromo de la lámina + composiciones
// PROPUESTAS, sin tokens nuevos) y el icono propuesto `more`, marcado como tal más abajo.
//
// Uso: node design/mockups/2026-10-01-lote-12/build.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const read = (path) => readFileSync(join(repo, path), 'utf8');

const COMPONENTES = [
	'src/lib/shell/AppShell.svelte',
	'src/lib/shell/Topbar.svelte',
	'src/lib/shell/GlobalSearch.svelte',
	'src/lib/shell/PublishButton.svelte',
	'src/lib/shell/ConnectionStatus.svelte',
	'src/lib/shell/DensityToggle.svelte',
	'src/lib/shell/VegaLogo.svelte',
	'src/lib/shell/Sidebar.svelte',
	'src/lib/shell/EditTopBar.svelte',
	'src/lib/shell/ToastHost.svelte',
	'src/lib/admin/AdminDialog.svelte',
	'src/routes/+page.svelte',
	'src/routes/c/[type]/+page.svelte',
	'src/lib/list/ListToolbar.svelte',
	'src/lib/list/RecordTable.svelte',
	'src/lib/list/Pagination.svelte',
	'src/lib/form/FieldRow.svelte',
	'src/lib/form/widgets/Text.svelte',
	'src/lib/form/widgets/Textarea.svelte',
	'src/lib/form/widgets/Select.svelte',
	'src/lib/form/widgets/Datetime.svelte',
	'src/lib/form/widgets/FileInput.svelte',
	'src/lib/form/RecordForm.svelte',
	'src/lib/form/BlockEditor.svelte',
	'src/lib/media/MediaUpload.svelte',
	'src/lib/visual/VisualPublishControl.svelte',
	'src/lib/visual/VisualEditorScreen.svelte'
];

function estiloDe(path) {
	const source = read(path);
	// `lastIndexOf`: algún componente menciona `<style>` dentro de un comentario de su cabecera.
	const inicio = source.lastIndexOf('<style>');
	const fin = source.lastIndexOf('</style>');
	if (inicio === -1 || fin === -1) throw new Error(`Sin <style> en ${path}`);
	// `:global(.x)` → `.x`: fuera de Svelte no hay ámbito que saltarse.
	const css = source
		.slice(inicio + '<style>'.length, fin)
		.replace(/:global\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '$1');
	return `/* ===== ${path} (copiado tal cual) ===== */\n${css}`;
}

function iconos() {
	const source = read('src/lib/icons/Icon.svelte');
	const cuerpo = source.slice(
		source.indexOf("{#if resolvedId === 'archive'}"),
		source.lastIndexOf('{/if}')
	);
	const partes = cuerpo.split(
		/\{#if resolvedId === '(\w+)'\}|\{:else if resolvedId === '(\w+)'\}|\{:else\}/
	);
	const mapa = new Map();
	for (let i = 1; i < partes.length; i += 3) {
		const id = partes[i] ?? partes[i + 1] ?? 'generic';
		const trazos = (partes[i + 2] ?? '').replace(/<!--[\s\S]*?-->/g, '').trim();
		mapa.set(id, trazos);
	}
	return mapa;
}

const ICONOS = iconos();
const EXISTENTES = [...ICONOS.keys()];

// ÚNICO icono PROPUESTO (lámina 7): no existe en `src/lib/icons/Icon.svelte`. Mismo lienzo de 24,
// trazo 2 y remates redondos que el resto; tres círculos de radio 1 (4 px de punto con el trazo),
// que es el peso al que se leen junto a los demás: como trazos de longitud cero quedaban finos.
ICONOS.set(
	'more',
	'<circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />'
);

function icono(id, size) {
	if (!ICONOS.has(id)) throw new Error(`El icono «${id}» no existe en src/lib/icons/Icon.svelte`);
	return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONOS.get(id)}</svg>`;
}

/** Isotipo: el SVG de `src/lib/shell/VegaLogo.svelte`, sin tocar. */
function logo() {
	const source = read('src/lib/shell/VegaLogo.svelte');
	const svg = source.slice(source.indexOf('<svg'), source.indexOf('</svg>') + '</svg>'.length);
	return svg.replace('width={size}', 'width="20"').replace('height={size}', 'height="20"');
}

// Navegación del sitio de muestra del repo (`SHOWCASE_MANIFEST`, `src/lib/session/demo-seed.ts`).
const NAV = [
	[
		'Contenido',
		[
			['entradas', 'list', 'Entradas'],
			['paginas', 'document', 'Páginas'],
			['proyectos', 'box', 'Proyectos']
		]
	],
	[
		'Estructura',
		[
			['autores', 'user', 'Autores'],
			['etiquetas', 'tag', 'Etiquetas']
		]
	]
];

const NAV_FIJA = [
	['media', 'media', 'Medios'],
	['trash', 'trash', 'Papelera'],
	['editors', 'user', 'Editores'],
	['backups', 'archive', 'Copias'],
	['settings', 'settings', 'Ajustes']
];

const DENSIDAD = `<span class="vega-density-toggle" role="group" aria-label="Densidad"><button type="button" aria-pressed="true">Cómoda</button><button type="button" aria-pressed="false">Compacta</button></span>`;

/** Menú de cuenta PROPUESTO (lámina 3): grupo «Densidad» + la entrada «Ajustes» de hoy. */
function menuCuenta(densidad) {
	const opcion = (id, label) =>
		`<button type="button" role="menuitemradio" class="vega-topbar-user-menu-item" aria-checked="${densidad === id}"><span class="vega-topbar-user-menu-check">${densidad === id ? icono('check', 16) : ''}</span>${label}</button>`;
	return `<div class="vega-topbar-user-menu" role="menu" aria-label="Menú de cuenta">
		<div role="group" aria-labelledby="lam-densidad">
			<p class="vega-topbar-user-menu-group" id="lam-densidad">Densidad</p>
			${opcion('comfortable', 'Cómoda')}${opcion('compact', 'Compacta')}
		</div>
		<div class="vega-topbar-user-menu-sep" role="separator"></div>
		<a role="menuitem" class="vega-topbar-user-menu-item" href="#">${icono('settings', 16)} Ajustes</a>
	</div>`;
}

/** Menú de cuenta de HOY (`Topbar.svelte`): una sola entrada. */
const MENU_HOY = `<div class="vega-topbar-user-menu" role="menu" aria-label="Menú de cuenta"><a role="menuitem" class="vega-topbar-user-menu-item" href="#">${icono('settings', 16)} Ajustes</a></div>`;

/**
 * Barra superior con el MISMO marcado que `Topbar.svelte`.
 * `variante`: `hoy` (con el control de densidad) · `hoy-menu` (hoy, menú de cuenta abierto) ·
 * `sin` (propuesta: sin densidad) · `sin-menu` / `sin-menu-compacta` (propuesta, menú abierto) ·
 * `enlace` (lámina 1: la marca pasa a ser un enlace a la portada).
 */
function topbar(variante) {
	const conDensidad = variante.startsWith('hoy');
	const abierto = variante.includes('menu');
	const menu = !abierto
		? ''
		: conDensidad
			? MENU_HOY
			: menuCuenta(variante.endsWith('compacta') ? 'compact' : 'comfortable');
	const marca = `${logo()}<span class="vega-topbar-brand">Vega</span><span class="vega-topbar-sitename">fodaveg.net</span>`;
	const sitio =
		variante === 'enlace'
			? `<a class="vega-topbar-site" href="#" title="fodaveg.net" aria-label="Vega, fodaveg.net: ir a la portada">${marca}</a>`
			: `<span class="vega-topbar-site" title="fodaveg.net">${marca}</span>`;
	return `<header class="vega-topbar">
	<button type="button" class="vega-topbar-menu" aria-label="Abrir menú">${icono('menu', 18)}</button>
	${sitio}
	<div class="vega-search-root"><label class="vega-search">${icono('search', 14)}<input type="search" placeholder="Buscar en todo el contenido…" aria-label="Buscar en todo el contenido" /><kbd aria-hidden="true">/</kbd></label></div>
	<div class="vega-topbar-actions">
		<div class="vega-publish"><button type="button" class="vega-publish-trigger" data-state="ready" aria-label="Publicar">${icono('upload', 14)}<span role="status">Publicar</span></button></div>
		<span class="vega-connection-status" data-state="connected"><span class="vega-connection-dot" aria-hidden="true"></span><span class="vega-connection-label">Conectado</span></span>
		${conDensidad ? DENSIDAD : ''}
		<button type="button" class="vega-topbar-collapse" aria-label="Plegar el menú">${icono('menu', 16)}</button>
		<div class="vega-topbar-user">
			<button type="button" class="vega-topbar-user-trigger" aria-haspopup="menu" aria-expanded="${abierto}" aria-label="Menú de cuenta"><span class="vega-topbar-avatar" role="img" aria-label="Sesión de david@fodaveg.net">D</span>${icono('chevron', 14)}</button>
			${menu}
		</div>
		<button type="button" class="vega-topbar-logout" aria-label="Cerrar sesión">${icono('logout', 16)}</button>
	</div>
</header>`;
}

/** Marco de la app: mismas clases que `AppShell`/`Topbar`/`Sidebar`. */
function shell(activo, variante, contenido) {
	const grupos = NAV.map(
		([label, items], index) => `<div class="vega-nav-group">
			<p class="vega-nav-group-label" data-brand="${index % 3}">${label}</p>
			<ul>${items
				.map(
					([id, icon, texto]) =>
						`<li><a href="#"${id === activo ? ' aria-current="page"' : ''}>${icono(icon, 16)}<span class="vega-nav-item-label">${texto}</span></a></li>`
				)
				.join('')}</ul>
		</div>`
	).join('');
	const fija = NAV_FIJA.map(
		([id, icon, label]) =>
			`<li><a href="#"${id === activo ? ' aria-current="page"' : ''}>${icono(icon, 16)}<span class="vega-nav-fixed-label">${label}</span></a></li>`
	).join('');
	return `<div class="lam-frame"><div class="vega-shell">
${topbar(variante)}
<div class="vega-body">
	<nav class="vega-sidebar" aria-label="Navegación principal">
		${grupos}
		<ul class="vega-nav-fixed">${fija}</ul>
	</nav>
	<main class="vega-main">${contenido}</main>
</div>
</div></div>`;
}

// ————— Datos de las tablas —————
// Las 12 primeras son las entradas de la semilla del repo (`ENTRADAS_RECORDS`, demo-seed.ts):
// mismos títulos, slugs, estados y autores. Las 18 siguientes son RELLENO escrito para la lámina
// (la semilla solo trae 12 y la página real es de 30, `DEFAULT_PER_PAGE`): se avisa en el README.
// Las fechas son las que pintaría `formatDateCell` el 1 oct 2026 (relativo dentro de la semana).
const ENTRADAS = [
	[
		'Cómo medir el contraste de un tema sin fiarte del ojo y sin volverte loco con las hojas de cálculo',
		'medir-contraste-tema-sin-fiarte-del-ojo',
		'draft',
		'Marta',
		'hace 2 horas'
	],
	[
		'Lo que cuesta de verdad mantener un servidor propio durante un año entero',
		'coste-real-servidor-propio-un-ano',
		'draft',
		'David',
		'ayer'
	],
	[
		'Tipografía del sistema: cuándo basta y cuándo se queda corta',
		'tipografia-del-sistema-cuando-basta',
		'published',
		'Marta',
		'anteayer'
	],
	[
		'Diez errores de accesibilidad que encontré en mi propio formulario de contacto',
		'diez-errores-accesibilidad-formulario-contacto',
		'published',
		'David',
		'hace 4 días'
	],
	[
		'Notas del huerto: septiembre',
		'notas-del-huerto-septiembre',
		'scheduled',
		'Marta',
		'hace 6 días'
	],
	[
		'Una copia de seguridad que no has restaurado nunca no es una copia de seguridad',
		'copia-sin-restaurar-no-es-copia',
		'published',
		'David',
		'19 sept 2026'
	],
	[
		'Redirecciones 301 sin cadenas: la regla de un solo salto',
		'redirecciones-301-un-solo-salto',
		'published',
		'David',
		'12 sept 2026'
	],
	[
		'Escribir para lectores de pantalla: textos alternativos que dicen algo',
		'textos-alternativos-que-dicen-algo',
		'draft',
		'Marta',
		'4 sept 2026'
	],
	['Notas del huerto: agosto', 'notas-del-huerto-agosto', 'published', 'Marta', '30 ago 2026'],
	[
		'Por qué dejé de usar un generador de sitios distinto para cada proyecto',
		'un-solo-generador-para-todo',
		'published',
		'David',
		'22 ago 2026'
	],
	[
		'El editor visual por dentro: un puente de mensajes entre dos orígenes',
		'editor-visual-puente-mensajes',
		'draft',
		'David',
		'14 ago 2026'
	],
	[
		'Backups 3-2-1 para un self-host de un solo servidor',
		'backups-3-2-1-selfhost',
		'scheduled',
		'David',
		'1 ago 2026'
	],
	[
		'Migrar el blog de Hugo a Astro sin romper las URLs',
		'migrar-blog-hugo-astro-sin-romper-urls',
		'published',
		'David',
		'23 jul 2026'
	],
	[
		'Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega',
		'temas-claro-oscuro-vocabulario-tokens-motor-paletas',
		'draft',
		'David',
		'23 jul 2026'
	],
	[
		'PocketBase como backend de un CMS editor-first',
		'pocketbase-backend-cms-editor-first',
		'published',
		'David',
		'18 jul 2026'
	],
	['Notas del huerto: julio', 'notas-del-huerto-julio', 'scheduled', 'Marta', '15 jul 2026'],
	[
		'Passkeys en un backend Go: TOTP, WebAuthn y tres factores',
		'passkeys-backend-go-totp-webauthn',
		'published',
		'David',
		'11 jul 2026'
	],
	['Sin título', '', 'draft', '', '2 jul 2026'],
	[
		'Reseña: teclados de perfil bajo para escribir mucho',
		'resena-teclados-perfil-bajo',
		'published',
		'Marta',
		'28 jun 2026'
	],
	[
		'Autoalojar sin dolor: mi checklist de higiene de servidor',
		'autoalojar-checklist-higiene-servidor',
		'published',
		'David',
		'20 jun 2026'
	],
	[
		'Por qué elegimos Svelte 5 runes para el admin',
		'por-que-svelte-5-runes-admin',
		'draft',
		'David',
		'14 jun 2026'
	],
	[
		'Accesibilidad AA de verdad: contraste medido, no adivinado',
		'accesibilidad-aa-contraste-medido',
		'published',
		'Marta',
		'5 jun 2026'
	],
	[
		'Diario de un rediseño: del wireframe al pixel',
		'diario-rediseno-wireframe-pixel',
		'draft',
		'Marta',
		'30 may 2026'
	],
	[
		'Un formulario largo no es un formulario malo si sabes dónde estás',
		'formulario-largo-no-es-malo',
		'published',
		'Marta',
		'21 may 2026'
	],
	['Notas del huerto: mayo', 'notas-del-huerto-mayo', 'published', 'Marta', '9 may 2026'],
	[
		'Tres maneras de romper un sitio estático al cambiar de dominio',
		'romper-sitio-estatico-cambio-dominio',
		'published',
		'David',
		'27 abr 2026'
	],
	[
		'Imágenes responsivas sin perder la tarde: tamaños, formatos y un solo componente',
		'imagenes-responsivas-sin-perder-la-tarde',
		'published',
		'David',
		'12 abr 2026'
	],
	[
		'Qué pongo en un README para acordarme yo mismo dentro de un año',
		'readme-para-acordarme-yo-mismo',
		'published',
		'David',
		'30 mar 2026'
	],
	['Notas del huerto: marzo', 'notas-del-huerto-marzo', 'published', 'Marta', '14 mar 2026'],
	[
		'El primer mes con el sitio nuevo: lo que salió bien y lo que no',
		'primer-mes-sitio-nuevo',
		'published',
		'David',
		'2 mar 2026'
	]
];

const ESTADO = {
	draft: ['draft', 'Borrador'],
	published: ['pub', 'Publicado'],
	scheduled: ['other', 'Programado']
};

/**
 * Tabla de «Entradas» con el marcado de `RecordTable.svelte`.
 * `variante`: `antes` (botón «Borrar» por fila, hoy) · `despues` (un botón de menú por fila).
 * `foco`: fila (1…n) que se enseña con el foco dentro; `abierta`: fila con el menú desplegado.
 */
function tabla(variante, filas, { foco = 0, abierta = 0 } = {}) {
	const cuerpo = ENTRADAS.slice(0, filas)
		.map(([titulo, slug, estado, autor, fecha], index) => {
			const n = index + 1;
			const [kind, etiqueta] = ESTADO[estado];
			const antes = variante === 'antes';
			const borrar = `<button type="button" class="vega-delete-button" data-action="delete" aria-label="Borrar &quot;${titulo}&quot;">Borrar</button>`;
			const menu = `<td class="vega-cell-menu"><button type="button" class="vega-row-menu-trigger" tabindex="-1" aria-haspopup="menu" aria-expanded="${abierta === n}" aria-label="Acciones de «${titulo}»">${icono('more', 16)}</button></td>`;
			const clases = [foco === n ? 'lam-fila-foco' : '', abierta === n ? 'lam-fila-abierta' : '']
				.filter(Boolean)
				.join(' ');
			return `<tr${clases ? ` class="${clases}"` : ''}>
				<td class="vega-cell-title"><a href="#" title="${titulo}">${titulo}</a>${slug ? `<span class="vega-cell-subtitle">${slug}</span>` : ''}<span class="vega-status-badge-inline" aria-hidden="true" data-inline-status-kind="${kind}">${etiqueta}</span></td>
				<td class="vega-col-status"><span class="vega-status-badge" data-status="${estado}" data-status-kind="${kind}">${etiqueta}</span></td>
				<td>${autor ? `<span title="${autor}">${autor}</span>` : '<span class="vega-cell-empty">—</span>'}</td>
				<td class="vega-cell-mono vega-cell-right${antes ? ' vega-cell-actions-anchor' : ''}"><span>${fecha}</span>${antes ? borrar : ''}</td>
				${antes ? '' : menu}
			</tr>`;
		})
		.join('');
	const th = (label, extra = '') =>
		`<th scope="col"${extra}><button type="button" class="vega-sort-button" aria-label="Ordenar por ${label}">${label}</button></th>`;
	return `<div class="vega-record-table-wrap"><table class="vega-record-table${variante === 'despues' ? ' vega-record-table--menu' : ''}">
		<thead><tr>
			${th('Título')}
			${th('Estado', ' class="vega-col-status"')}
			${th('Autor')}
			<th scope="col" class="vega-th-right${variante === 'antes' ? ' vega-th-delete-slot' : ''}" aria-sort="descending"><button type="button" class="vega-sort-button" aria-label="Ordenar por Actualizado">Actualizado <span aria-hidden="true" class="vega-sort-indicator">↓</span></button></th>
			${variante === 'antes' ? '' : '<th scope="col" class="vega-th-menu"><span class="vega-visually-hidden">Acciones</span></th>'}
		</tr></thead>
		<tbody>${cuerpo}</tbody>
	</table></div>
	<div class="vega-pagination" data-pagination>
		<span class="vega-pagination-status">1–${filas} de ${filas === 30 ? 42 : filas}</span>
		<span class="vega-pagination-nav">
			<button type="button" class="vega-pagination-chevron" aria-label="Anterior" disabled><span aria-hidden="true">‹</span></button>
			<button type="button" class="vega-pagination-chevron" aria-label="Siguiente"${filas === 30 ? '' : ' disabled'}><span aria-hidden="true">›</span></button>
		</span>
	</div>`;
}

/** Lámina de iconos: los que YA existen, con su nombre, para comparar el propuesto a su lado. */
function laminaIconos() {
	return EXISTENTES.filter((id) => id !== 'generic')
		.map((id) => `<li>${icono(id, 18)} ${id}</li>`)
		.join('');
}

const css = [
	read('src/lib/themes/themes.generated.css'),
	read('src/lib/theme/base.css'),
	read('src/lib/admin/admin.css'),
	...COMPONENTES.map(estiloDe),
	readFileSync(join(here, 'fuente/lamina.css'), 'utf8')
].join('\n\n');

const cabecera = readFileSync(join(here, 'fuente/_cabecera.html'), 'utf8');

for (const file of readdirSync(join(here, 'fuente'))) {
	if (!file.endsWith('.html') || file.startsWith('_')) continue;
	let cuerpo = readFileSync(join(here, 'fuente', file), 'utf8');
	const titulo = cuerpo.match(/<!--TITULO (.*?)-->/)?.[1] ?? file;
	// `<!--PIEZA x-->…<!--/PIEZA-->` define un trozo y `<!--USA x-->` lo repite: la misma pantalla
	// se enseña dentro del marco real (a 390 px) y en un escenario estrecho (a 1440 px).
	const piezas = new Map();
	cuerpo = cuerpo.replace(
		/<!--PIEZA ([\w-]+)-->([\s\S]*?)<!--\/PIEZA-->/g,
		(_, nombre, contenido) => {
			piezas.set(nombre, contenido);
			return '';
		}
	);
	// En bucle: una pieza puede usar otra.
	while (/<!--USA ([\w-]+)-->/.test(cuerpo)) {
		cuerpo = cuerpo.replace(/<!--USA ([\w-]+)-->/g, (_, nombre) => {
			if (!piezas.has(nombre)) throw new Error(`${file}: la pieza «${nombre}» no está definida`);
			return piezas.get(nombre);
		});
	}
	cuerpo = cuerpo.replace(
		/<!--TABLA (\w+) (\d+)((?: \w+=\d+)*)-->/g,
		(_, variante, filas, opciones) =>
			tabla(
				variante,
				Number(filas),
				Object.fromEntries(
					opciones
						.trim()
						.split(' ')
						.filter(Boolean)
						.map((par) => par.split('='))
						.map(([clave, valor]) => [clave, Number(valor)])
				)
			)
	);
	cuerpo = cuerpo.replace(
		/<!--SHELL ([\w-]+) ([\w-]+)-->([\s\S]*?)<!--\/SHELL-->/g,
		(_, activo, variante, contenido) => shell(activo, variante, contenido)
	);
	cuerpo = cuerpo.replace(/<!--TOPBAR ([\w-]+)-->/g, (_, variante) => topbar(variante));
	cuerpo = cuerpo.replace('<!--ICONOS-->', laminaIconos());
	cuerpo = cuerpo.replace(/\{\{i:(\w+):(\d+)\}\}/g, (_, id, size) => icono(id, Number(size)));
	const html = `<!doctype html>
<html lang="es" data-theme="aquelarre" data-mode="light" data-density="comfortable">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${titulo} · Vega</title>
<style>
${css}
</style>
</head>
<body class="lam">
${cabecera.replace('{{TITULO}}', titulo)}
${cuerpo}
</body>
</html>
`;
	writeFileSync(join(here, file), html);
	console.log(`${file}: ${(html.length / 1024).toFixed(0)} kB`);
}
