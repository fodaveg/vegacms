import prettier from 'prettier';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { BASE_NEUTRALS, resolveNeutral, contrastRatio } from '../../../scripts/build-themes.mjs';

// Pure design probe. Mutates only imported in-memory data; never writes product sources.
const dir = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(dir, '../../..');
const formatConfig = await prettier.resolveConfig(resolve(root, 'package.json'));
const writeHtml = async (name, html) =>
	writeFileSync(
		resolve(dir, name),
		await prettier.format(html, { ...formatConfig, parser: 'html' })
	);
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const themes = JSON.parse(read('src/lib/themes/index.json')).map((id) =>
	JSON.parse(read(`src/lib/themes/${id}.theme.json`))
);
const surfaces = ['bg', 'sidebar', 'surface', 'paper', 'surface-2'];
const proposed = { sharedLightBase: '#625e56', aquelarreLightOverride: '#605a57' };
const base = BASE_NEUTRALS.light['ink-2'];
const aq = themes.find((t) => t.id === 'aquelarre');
const aqBase = aq.modes.light.neutrals['ink-2'];
const samples = [];
for (const variant of ['before', 'after']) {
	BASE_NEUTRALS.light['ink-2'] = variant === 'before' ? base : proposed.sharedLightBase;
	aq.modes.light.neutrals['ink-2'] =
		variant === 'before' ? aqBase : proposed.aquelarreLightOverride;
	for (const theme of themes)
		for (const mode of ['light', 'dark']) {
			const ink = resolveNeutral(theme, mode, 'ink-2');
			samples.push({
				variant,
				theme: theme.id,
				name: theme.name,
				mode,
				ink,
				surfaces: Object.fromEntries(
					surfaces.map((surface) => {
						const background = resolveNeutral(theme, mode, surface);
						return [surface, { background, ratio: contrastRatio(ink, background) }];
					})
				)
			});
		}
}
BASE_NEUTRALS.light['ink-2'] = base;
aq.modes.light.neutrals['ink-2'] = aqBase;
const rows = (variant, mode) => samples.filter((r) => r.variant === variant && r.mode === mode);
const summary = Object.fromEntries(
	['before', 'after'].map((variant) => [
		variant,
		Object.fromEntries(
			['light', 'dark'].map((mode) => {
				const rs = rows(variant, mode).flatMap((r) =>
					Object.values(r.surfaces).map((s) => s.ratio)
				);
				return [
					mode,
					{
						pairs: rs.length,
						fail: rs.filter((r) => r < 4.5).length,
						min: Math.min(...rs),
						max: Math.max(...rs)
					}
				];
			})
		)
	])
);
const report = {
	baseline: '8a10f7f61da35a777b51d6cd8b3290e136660636',
	method:
		'Existing resolveNeutral + contrastRatio; OKLab mix rounded to sRGB 8-bit. Not browser computed styles.',
	proposed,
	summary,
	samples
};
writeFileSync(
	resolve(dir, 'measurements.json'),
	await prettier.format(JSON.stringify(report), { ...formatConfig, parser: 'json' })
);
const themeCss = read('src/lib/themes/themes.generated.css');
const css = readFileSync(resolve(dir, 'mockup.css'), 'utf8');
const template = readFileSync(resolve(dir, 'screen.html.tpl'), 'utf8');
const selected = ['niebla', 'miel', 'aquelarre'];
const frames = [];
for (const id of selected)
	for (const variant of ['before', 'after']) {
		const override =
			variant === 'after'
				? `[data-mode="light"] { --ink-2: ${id === 'aquelarre' ? proposed.aquelarreLightOverride : `color-mix(in oklab, var(--tint) 5%, ${proposed.sharedLightBase})`}; }`
				: '';
		const doc = template
			.replaceAll('{{THEME}}', id)
			.replace('{{CSS}}', themeCss + '\n' + css + '\n' + override)
			.replaceAll('{{VARIANT}}', variant);
		await writeHtml(`${id}-${variant}.html`, doc);
		frames.push({ id, variant, doc });
	}
const rat = (r) => r.toFixed(2).replace('.', ',');
const cards = selected
	.map((id) => {
		const theme = themes.find((t) => t.id === id);
		const before = rows('before', 'light').find((r) => r.theme === id);
		const after = rows('after', 'light').find((r) => r.theme === id);
		return `<section><h2>${theme.name}</h2><p>${id === 'niebla' ? 'Referencia fría del sistema' : id === 'miel' ? 'Papel cálido; conserva su matiz' : 'Caso exigente: tinte de fondo al 13% y tinta sobrescrita'}</p><div class="comparison">${['before', 'after'].map((variant) => `<article><h3>${variant === 'before' ? 'Antes · actual' : 'Después · propuesta'}</h3><div class="viewport"><iframe title="${theme.name}: ${variant === 'before' ? 'antes' : 'después'}" data-frame="${id}-${variant}" sandbox="allow-scripts"></iframe></div><p class="ratio">${['bg', 'sidebar', 'surface'].map((s) => `${s}: <strong>${rat((variant === 'before' ? before : after).surfaces[s].ratio)}:1</strong>`).join(' · ')}</p></article>`).join('')}</div></section>`;
	})
	.join('');
const table = rows('before', 'light')
	.map((r) => {
		const a = rows('after', 'light').find((a) => a.theme === r.theme);
		return `<tr><th scope="row">${r.name}</th>${surfaces.map((s) => `<td>${rat(r.surfaces[s].ratio)} → <strong>${rat(a.surfaces[s].ratio)}</strong></td>`).join('')}</tr>`;
	})
	.join('');
const board = readFileSync(resolve(dir, 'board.html.tpl'), 'utf8')
	.replace('{{CARDS}}', cards)
	.replace('{{ROWS}}', table)
	.replace('{{PAYLOAD}}', JSON.stringify(frames).replaceAll('<', '\\u003c'));
await writeHtml('lamina.html', board);
console.log(JSON.stringify({ summary, proposed }, null, 2));
