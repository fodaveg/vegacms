import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
const dir = dirname(fileURLToPath(import.meta.url)),
	root = resolve(dir, '../../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const config = await prettier.resolveConfig(resolve(root, 'package.json'));
const css =
	read('src/lib/themes/themes.generated.css') +
	'\n' +
	read('src/lib/admin/admin.css') +
	'\n' +
	readFileSync(resolve(dir, 'prototype.css'), 'utf8');
const template = readFileSync(resolve(dir, 'prototype.html.tpl'), 'utf8');
const js = readFileSync(resolve(dir, 'prototype.js'), 'utf8');
const frames = [];
for (const [name, stage] of [
	['01-enlaces', 'manage'],
	['02-crear', 'create'],
	['03-copiar', 'success']
]) {
	const html = template
		.replace('{{CSS}}', css)
		.replace('{{SCRIPT}}', js.replace('{{STAGE}}', stage));
	frames.push({ name, html });
	writeFileSync(
		resolve(dir, name + '.html'),
		await prettier.format(html, { ...config, parser: 'html' })
	);
}
console.log('Three self-contained anchor screens generated; no product source modified.');

const titles = ['01 · Enlaces activos', '02 · Elegir duración', '03 · Copiar una sola vez'];
const panels = frames
	.map(
		(f, i) =>
			`<section><h2>${titles[i]}</h2><div class="viewport"><iframe sandbox="allow-scripts" title="${titles[i]}" data-frame="${f.name}"></iframe></div><a data-screen="${f.name}" href="${f.name}.html">Abrir pantalla a tamaño natural</a></section>`
	)
	.join('');
const board = readFileSync(resolve(dir, 'board.html.tpl'), 'utf8')
	.replace('{{PANELS}}', panels)
	.replace('{{FRAMES}}', JSON.stringify(frames).replaceAll('<', '\\u003c'));
writeFileSync(
	resolve(dir, 'lamina.html'),
	await prettier.format(board, { ...config, parser: 'html' })
);
