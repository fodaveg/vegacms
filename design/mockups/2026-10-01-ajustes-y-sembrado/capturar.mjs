// Capturas de las láminas: 390 y 1440 px, claro y oscuro. SIEMPRE headless.
// Uso: node design/mockups/2026-10-01-ajustes-y-sembrado/capturar.mjs [--trozos <dir>]
//   --trozos <dir>: además, trocea cada lámina por secciones en <dir> (para revisarlas de cerca).
import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'capturas');
mkdirSync(out, { recursive: true });

const trozosIndex = process.argv.indexOf('--trozos');
const trozos = trozosIndex > -1 ? process.argv[trozosIndex + 1] : null;
if (trozos) mkdirSync(trozos, { recursive: true });

const laminas = readdirSync(here).filter((file) => file.endsWith('.html'));
const anchos = [
	{ width: 390, height: 844, movil: true },
	{ width: 1440, height: 900, movil: false }
];

const browser = await chromium.launch({ headless: true });
const desbordes = [];
for (const { width, height, movil } of anchos) {
	const context = await browser.newContext({
		viewport: { width, height },
		deviceScaleFactor: 1,
		isMobile: movil,
		hasTouch: movil
	});
	const page = await context.newPage();
	for (const lamina of laminas) {
		for (const mode of ['light', 'dark']) {
			await page.goto(`${pathToFileURL(join(here, lamina)).href}?mode=${mode}`);
			// La barra lateral tiene `transition: width 0.2s`: sin esta espera sale a medio abrir.
			await page.waitForTimeout(400);
			const nombre = `${lamina.replace('.html', '')}--${width}-${mode === 'light' ? 'claro' : 'oscuro'}`;
			// Lámina entera SIN `fullPage`: con `fullPage: true` la barra lateral del marco salía
			// plegada en la captura (y bien en el recorte por secciones). Se estira el viewport.
			await page.setViewportSize({ width, height });
			const alto = await page.evaluate(() => document.documentElement.scrollHeight);
			await page.setViewportSize({ width, height: alto });
			await page.waitForTimeout(400);
			await page.screenshot({ path: join(out, `${nombre}.png`) });
			// Desborde horizontal de la página y de cada pieza de producto: se informa, no se calla.
			const overflow = await page.evaluate(() => {
				const doc = document.documentElement;
				const fuera = [];
				if (doc.scrollWidth > doc.clientWidth)
					fuera.push(`página: ${doc.scrollWidth} > ${doc.clientWidth}`);
				for (const el of document.querySelectorAll('.lam-stage, .lam-frame')) {
					const box = el.getBoundingClientRect();
					for (const child of el.querySelectorAll('*')) {
						if (
							child.closest(
								'.vega-admin-sr-only, .vega-visually-hidden, .vega-sidebar, table, pre, input, select'
							)
						)
							continue;
						const c = child.getBoundingClientRect();
						if (c.width > 0 && c.right > box.right + 0.5) {
							fuera.push(
								`${child.className || child.tagName}: +${(c.right - box.right).toFixed(1)}px`
							);
							break;
						}
					}
				}
				return fuera;
			});
			if (overflow.length) desbordes.push(`${nombre}: ${overflow.join(' | ')}`);
			if (trozos) {
				const secciones = await page.locator('.lam-section').all();
				for (let i = 0; i < secciones.length; i++) {
					await secciones[i].screenshot({ path: join(trozos, `${nombre}--s${i + 1}.png`) });
				}
			}
		}
	}
	await context.close();
}
await browser.close();
console.log(
	desbordes.length ? `DESBORDES:\n${desbordes.join('\n')}` : 'Sin desbordes horizontales.'
);
