// Monta las láminas autocontenidas a partir de `fuente/*.html`.
//
// Por qué hay un montaje y no HTML a mano: el encargo exige tokens REALES y un «antes» fiel al
// código. Este script copia, tal cual y en cada montaje, las hojas de producto:
//   - `src/lib/themes/themes.generated.css` (los 21 temas, claro y oscuro)
//   - `src/lib/theme/base.css`
//   - `src/lib/admin/admin.css`
//   - los bloques `<style>` de los componentes Svelte listados en COMPONENTES (el CSS con ámbito
//     de Svelte se vuelve global quitando `:global(...)`; todos usan prefijo `.vega-`)
//   - los trazos de `src/lib/icons/Icon.svelte` (ningún icono dibujado a mano)
// Lo único escrito para la lámina es `fuente/lamina.css`, que separa el cromo de la lámina de las
// composiciones PROPUESTAS (sin tokens nuevos).
//
// Uso: node design/mockups/2026-10-01-ajustes-y-sembrado/build.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const read = (path) => readFileSync(join(repo, path), 'utf8');

const COMPONENTES = [
	'src/lib/shell/AppShell.svelte',
	'src/lib/shell/Topbar.svelte',
	'src/lib/shell/Sidebar.svelte',
	'src/lib/shell/EditTopBar.svelte',
	'src/lib/shell/ToastHost.svelte',
	'src/lib/admin/AdminDialog.svelte',
	'src/lib/form/FieldRow.svelte',
	'src/lib/form/widgets/Text.svelte',
	'src/lib/form/RecordForm.svelte',
	'src/lib/form/ConflictNotice.svelte',
	'src/routes/settings/+page.svelte'
];

function estiloDe(path) {
	const source = read(path);
	const match = source.match(/<style>([\s\S]*?)<\/style>\s*$/);
	if (!match) throw new Error(`Sin <style> en ${path}`);
	// `:global(.x)` → `.x`: fuera de Svelte no hay ámbito que saltarse.
	const css = match[1].replace(/:global\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '$1');
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
	// split con dos grupos: [previo, g1, g2, contenido, g1, g2, contenido, …, undefined, undefined, generic]
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

const NAV_FIJA = [
	['media', 'media', 'Medios'],
	['trash', 'trash', 'Papelera'],
	['editors', 'user', 'Editores'],
	['backups', 'archive', 'Copias'],
	['settings', 'settings', 'Ajustes']
];

/** Marco de la app: mismas clases que `AppShell`/`Topbar`/`Sidebar`, sin buscador ni logo. */
function shell(activo, rol, contenido) {
	const fija = NAV_FIJA.filter(([id]) => rol === 'super' || (id !== 'editors' && id !== 'backups'))
		.map(
			([id, icon, label]) =>
				`<li><a href="#"${id === activo ? ' aria-current="page"' : ''}>${icono(icon, 16)}<span class="vega-nav-fixed-label">${label}</span></a></li>`
		)
		.join('');
	const inicial = rol === 'super' ? 'D' : 'M';
	return `<div class="lam-frame"><div class="vega-shell">
<header class="vega-topbar">
	<button type="button" class="vega-topbar-menu" aria-label="Abrir menú">${icono('menu', 18)}</button>
	<span class="vega-topbar-site"><span class="vega-topbar-brand">Vega</span><span class="vega-topbar-sitename">Aguja</span></span>
	<div class="vega-topbar-actions">
		<span class="vega-topbar-avatar" role="img" aria-label="Sesión">${inicial}</span>
		<button type="button" class="vega-topbar-logout" aria-label="Cerrar sesión">${icono('logout', 16)}</button>
	</div>
</header>
<div class="vega-body">
	<nav class="vega-sidebar" aria-label="Navegación principal">
		<div class="vega-nav-group">
			<p class="vega-nav-group-label" data-brand="0">Sitio</p>
			<ul>
				<li><a href="#"${activo === 'pages' ? ' aria-current="page"' : ''}>${icono('document', 16)}<span class="vega-nav-fixed-label">Páginas</span></a></li>
				<li><a href="#">${icono('chevron', 16)}<span class="vega-nav-fixed-label">Redirecciones</span></a></li>
			</ul>
		</div>
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
	cuerpo = cuerpo.replace(
		/<!--SHELL (\w+) (\w+)-->([\s\S]*?)<!--\/SHELL-->/g,
		(_, activo, rol, contenido) => shell(activo, rol, contenido)
	);
	cuerpo = cuerpo.replace(/\{\{i:(\w+):(\d+)\}\}/g, (_, id, size) => icono(id, Number(size)));
	const html = `<!doctype html>
<html lang="es" data-theme="niebla" data-mode="light" data-density="comfortable">
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
