// Monta la lámina autocontenida del Lote 13 «Revisión antes de publicar» a partir de `fuente/*.html`.
//
// Misma mecánica que `design/mockups/2026-10-01-lote-12/build.mjs`: los tokens y el «antes» salen
// del CÓDIGO, no de la memoria. En cada montaje se copian tal cual:
//   - `src/lib/themes/themes.generated.css` (los 21 temas, claro y oscuro)
//   - `src/lib/theme/base.css` y `src/lib/admin/admin.css`
//   - los bloques `<style>` de los componentes Svelte de COMPONENTES (el CSS con ámbito de Svelte
//     se vuelve global quitando `:global(...)`; todos usan prefijo `.vega-`)
//   - los trazos de `src/lib/icons/Icon.svelte` (ningún icono se dibuja a mano; esta lámina no
//     propone ninguno nuevo)
// Lo único escrito para la lámina es `fuente/lamina.css` (cromo de la lámina + composiciones
// PROPUESTAS, sin tokens nuevos).
//
// Uso: node design/mockups/2026-10-02-revision-antes-de-publicar/build.mjs
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
	'src/lib/shell/VegaLogo.svelte',
	'src/lib/shell/Sidebar.svelte',
	'src/lib/shell/EditTopBar.svelte',
	'src/lib/shell/ToastHost.svelte',
	'src/lib/admin/AdminDialog.svelte',
	'src/lib/form/FieldRow.svelte',
	'src/lib/form/widgets/Text.svelte',
	'src/lib/form/widgets/Textarea.svelte',
	'src/lib/form/widgets/Select.svelte',
	'src/lib/form/widgets/Datetime.svelte',
	'src/lib/form/widgets/Switch.svelte',
	'src/lib/form/widgets/Relation.svelte',
	'src/lib/form/PageLayoutSelect.svelte',
	'src/lib/form/RecordForm.svelte',
	'src/lib/form/RecordBlocks.svelte',
	'src/lib/form/BlockEditor.svelte',
	'src/lib/integrity/UsedInPanel.svelte',
	'src/lib/revisions/RevisionsPanel.svelte',
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

// Navegación de un sitio SEMBRADO (`seedSiteProject` + módulo de blog): grupo «Sitio» con las
// colecciones de `site-seeding-manifest.json` y `site-seeding-blog.ts`, en su `order`.
const NAV = [
	[
		'Sitio',
		[
			['pages', 'document', 'Páginas'],
			['redirects', 'chevron', 'Redirecciones'],
			['posts', 'document', 'Entradas'],
			['tags', 'tag', 'Etiquetas']
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

/**
 * Barra superior con el MISMO marcado que `Topbar.svelte` tras el lote 12: la marca enlaza a
 * Inicio y la densidad vive en el menú de cuenta (cerrado aquí).
 */
function topbar() {
	const marca = `${logo()}<span class="vega-topbar-brand">Vega</span><span class="vega-topbar-sitename">Aguja</span>`;
	return `<header class="vega-topbar">
	<button type="button" class="vega-topbar-menu" aria-label="Abrir menú">${icono('menu', 18)}</button>
	<a class="vega-topbar-site" href="#" title="Aguja" aria-label="Vega, Aguja: ir a la portada">${marca}</a>
	<div class="vega-search-root"><label class="vega-search">${icono('search', 14)}<input type="search" placeholder="Buscar en todo el contenido…" aria-label="Buscar en todo el contenido" /><kbd aria-hidden="true">/</kbd></label></div>
	<div class="vega-topbar-actions">
		<div class="vega-publish"><button type="button" class="vega-publish-trigger" data-state="ready" aria-label="Publicar">${icono('upload', 14)}<span role="status">Publicar</span></button></div>
		<span class="vega-connection-status" data-state="connected"><span class="vega-connection-dot" aria-hidden="true"></span><span class="vega-connection-label">Conectado</span></span>
		<button type="button" class="vega-topbar-collapse" aria-label="Plegar el menú">${icono('menu', 16)}</button>
		<div class="vega-topbar-user">
			<button type="button" class="vega-topbar-user-trigger" aria-haspopup="menu" aria-expanded="false" aria-label="Menú de cuenta"><span class="vega-topbar-avatar" role="img" aria-label="Sesión de marta@aguja.test">M</span>${icono('chevron', 14)}</button>
		</div>
		<button type="button" class="vega-topbar-logout" aria-label="Cerrar sesión">${icono('logout', 16)}</button>
	</div>
</header>`;
}

/** Marco de la app: mismas clases que `AppShell`/`Topbar`/`Sidebar`. */
function shell(activo, contenido) {
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
${topbar()}
<div class="vega-body">
	<nav class="vega-sidebar" aria-label="Navegación principal">
		${grupos}
		<ul class="vega-nav-fixed">${fija}</ul>
	</nav>
	<main class="vega-main">${contenido}</main>
</div>
</div></div>`;
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
	// `<!--PIEZA x-->…<!--/PIEZA-->` define un trozo y `<!--USA x-->` lo repite.
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
		/<!--SHELL ([\w-]+)-->([\s\S]*?)<!--\/SHELL-->/g,
		(_, activo, contenido) => shell(activo, contenido)
	);
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
