/** Lámina autocontenida: tokens vigentes copiados del sistema de diseño del candidato. */
import { readFileSync, writeFileSync } from 'node:fs';
import { format } from 'prettier';
import config from '../../../prettier.config.js';
const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const tokens = read('src/lib/themes/themes.generated.css');
const base = read('src/lib/theme/base.css');
const rows = [
	['Desarrollo', 'Categoría principal', 1],
	['Web', 'Dentro de Desarrollo', 2],
	['Accesibilidad y experiencias inclusivas en interfaces de administración', 'Dentro de Web', 3],
	['Apple', 'Dentro de Desarrollo', 2],
	['Personal', 'Categoría principal', 1]
];
writeFileSync(
	new URL('lamina.html', import.meta.url),
	await format(
		`<!doctype html><html lang="es" data-theme="brasa" data-mode="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Categorías · árbol editorial</title><style>${tokens}\n${base}\nbody{margin:0;padding:24px;font-family:var(--sans);background:var(--bg);color:var(--ink)}main{max-width:960px;margin:auto}header{display:flex;flex-wrap:wrap;align-items:center;gap:16px}h1{font-size:24px;margin-right:auto}button{min-height:44px;min-width:44px;padding:8px 16px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface);color:var(--ink);font:inherit}button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.create{background:var(--accent);color:var(--accent-ink)}.card{border:1px solid var(--line);border-radius:var(--r);overflow:hidden;background:var(--surface)}.row{display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--line);min-height:72px;padding:8px 16px}.title{min-width:0;flex:1;padding-left:calc((var(--depth) - 1)*24px)}a{display:block;color:var(--ink);overflow-wrap:anywhere;font-weight:600}.sub,p{color:var(--ink-2)}.sub{display:block;font-size:13px;margin-top:4px}.menu{display:flex;flex-wrap:wrap;gap:8px;padding:16px;background:var(--surface-2)}.state{padding:16px}.error{color:var(--danger)}@media(max-width:640px){body{padding:12px}.create{width:100%}.row{padding:8px}.title{padding-left:calc((var(--depth) - 1)*16px)}}</style><main><header><h1>Categorías</h1><span>5 registros</span><button class="create">Nuevo: Categoría</button></header><p>Árbol editorial · hasta 3 niveles. Cambia la madre dentro del formulario.</p><div class="card">${rows.map(([title, parent, depth]) => `<div class="row"><div class="title" style="--depth:${depth}"><a href="#">${title}</a><span class="sub">${parent}</span></div><button aria-label="Acciones de ${title}">···</button></div>`).join('')}<div class="menu"><button>Subir entre hermanas</button><button>Bajar entre hermanas</button><button>Borrar…</button></div></div><div class="state"><p>Cargando categorías…</p><p>No hay categorías. <button>Nuevo: Categoría</button></p><p class="error">No se ha podido cargar el árbol. <button>Reintentar</button></p><p class="error">No puede estar dentro de sí misma ni de una de sus subcategorías.</p><p class="error">Pasaría de 3 niveles.</p></div></main></html>`,
		{ ...config, parser: 'html' }
	)
);
