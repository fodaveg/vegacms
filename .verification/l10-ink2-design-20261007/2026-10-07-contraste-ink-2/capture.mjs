/** Design-only browser probe. Run explicitly after the shared browser runner is released. */
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const output = resolve(process.argv[2] ?? '/private/tmp/vega-l10-ink2-captures-20261007');
const boardsOnly = process.argv.includes('--boards-only');
if (process.versions.node.split('.')[0] !== '22')
	throw new Error('Use the agreed Node 22 runtime.');
await mkdir(output, { recursive: true });
const report = JSON.parse(await readFile(resolve(dir, 'measurements.json'), 'utf8'));
const evidence = {
	kind: 'static-design-mockups-not-app-QA',
	node: process.version,
	browser: null,
	source: dir,
	dimensions: [390, 1440],
	captures: [],
	checks: [],
	errors: [],
	method:
		'Computed CSS colors resolved through canvas into sRGB 8-bit, WCAG luminance; actual mockup elements and token probes.'
};
const browser = await chromium.launch({ headless: true });
evidence.browser = browser.version();
const context = await browser.newContext({
	locale: 'es-ES',
	colorScheme: 'light',
	reducedMotion: 'reduce',
	deviceScaleFactor: 1
});
const page = await context.newPage();
page.on('pageerror', (e) => evidence.errors.push(String(e)));
const colorProbe = () => {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 1;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	const rgb = (color) => {
		ctx.clearRect(0, 0, 1, 1);
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, 1, 1);
		return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
	};
	const luminance = (c) =>
		c
			.map((v) => v / 255)
			.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
			.reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
	const ratio = (a, b) => {
		const x = luminance(a),
			y = luminance(b);
		return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
	};
	const probe = document.createElement('span');
	probe.style.color = 'var(--ink-2)';
	document.body.append(probe);
	const ink = rgb(getComputedStyle(probe).color);
	const pairs = {};
	for (const surface of ['bg', 'sidebar', 'surface', 'paper', 'surface-2']) {
		probe.style.backgroundColor = `var(--${surface})`;
		const background = rgb(getComputedStyle(probe).backgroundColor);
		pairs[surface] = { background, ratio: ratio(ink, background) };
	}
	probe.remove();
	const actual = [
		'.block > h2',
		'.label',
		'.surface-sample p',
		'.sidebar .secondary',
		'.nav-item'
	].flatMap((selector) => {
		const el = document.querySelector(selector);
		if (!el || !el.getClientRects().length) return [];
		return [{ selector, color: getComputedStyle(el).color, rgb: rgb(getComputedStyle(el).color) }];
	});
	return {
		mode: document.documentElement.dataset.mode,
		theme: document.documentElement.dataset.theme,
		ink,
		pairs,
		actual,
		viewport: innerWidth,
		overflow: document.documentElement.scrollWidth > innerWidth
	};
};
const record = (ok, name, detail) => {
	evidence.checks.push({ name, ok, detail });
};
const screenshot = async (name) => {
	await page.screenshot({ path: resolve(output, name), fullPage: true });
	evidence.captures.push(name);
};
try {
	for (const width of [1440, 390]) {
		await page.setViewportSize({ width, height: 900 });
		for (const theme of boardsOnly ? [] : ['niebla', 'miel', 'aquelarre'])
			for (const variant of ['before', 'after'])
				for (const mode of ['light', 'dark']) {
					for (const screen of ['home', 'settings']) {
						const url = pathToFileURL(resolve(dir, `${theme}-${variant}.html`));
						url.search = `mode=${mode}&screen=${screen}`;
						await page.goto(url.href);
						await page.locator(`#${screen}`).waitFor({ state: 'visible' });
						const actual = await page.evaluate(colorProbe);
						const expected = report.samples.find(
							(r) => r.theme === theme && r.variant === variant && r.mode === mode
						);
						const deltas = Object.fromEntries(
							Object.entries(actual.pairs).map(([s, v]) => [
								s,
								v.ratio - expected.surfaces[s].ratio
							])
						);
						record(
							!actual.overflow,
							`overflow:${theme}:${variant}:${mode}:${width}:${screen}`,
							actual.overflow
						);
						record(
							actual.mode === mode && actual.viewport === width,
							`state:${theme}:${variant}:${mode}:${width}:${screen}`,
							actual
						);
						record(
							Object.values(deltas).every((d) => Math.abs(d) < 0.08),
							`pure-browser-delta:${theme}:${variant}:${mode}:${width}:${screen}`,
							deltas
						);
						if (variant === 'after')
							record(
								Object.values(actual.pairs).every((v) => v.ratio >= 4.5),
								`AA:${theme}:${mode}:${width}:${screen}`,
								actual.pairs
							);
						await screenshot(`${theme}-${variant}-${mode}-${width}-${screen}.png`);
						if (width === 390 && mode === 'light' && screen === 'home') {
							await page.getByRole('button', { name: 'Abrir navegación' }).click();
							record(
								await page.locator('.sidebar').isVisible(),
								`mobile-rail:${theme}:${variant}`,
								null
							);
							await screenshot(`${theme}-${variant}-light-390-rail.png`);
							await page.keyboard.press('Escape');
							record(
								(await page
									.getByRole('button', { name: 'Abrir navegación' })
									.getAttribute('aria-expanded')) === 'false',
								`mobile-rail-close:${theme}:${variant}`,
								null
							);
						}
					}
				}
		for (const variant of boardsOnly ? [] : ['before', 'after']) {
			const u = pathToFileURL(resolve(dir, `aquelarre-${variant}.html`));
			u.search = 'mode=light&screen=error';
			await page.goto(u.href);
			await screenshot(`aquelarre-${variant}-light-${width}-error.png`);
		}
		await page.goto(pathToFileURL(resolve(dir, 'lamina.html')).href);
		await page.waitForFunction(() => document.querySelectorAll('iframe').length === 6);
		await page.locator('#width').selectOption(String(width));
		for (const mode of ['light', 'dark']) {
			await page.locator('#mode').selectOption(mode);
			await page.locator('#screen').selectOption('settings');
			await page.waitForFunction(
				(wanted) => document.documentElement.dataset.theme === wanted,
				mode
			);
			const frames = page.frames().filter((f) => f !== page.mainFrame());
			record(frames.length === 6, `board-frames:${width}:${mode}`, frames.length);
			for (const frame of frames) {
				await frame.waitForFunction(
					(wanted) => document.documentElement.dataset.mode === wanted,
					mode
				);
				const actual = await frame.evaluate(colorProbe);
				record(
					actual.viewport === width && !actual.overflow,
					`board-frame-size:${actual.theme}:${width}:${mode}`,
					actual
				);
				const variant = await frame.locator('.mockup-label').textContent();
				if (variant.includes('after'))
					record(
						Object.values(actual.pairs).every((v) => v.ratio >= 4.5),
						`board-AA:${actual.theme}:${width}:${mode}`,
						actual.pairs
					);
				if (frame.url() === 'about:srcdoc')
					record(true, `self-contained:${actual.theme}:${width}:${mode}`, null);
			}
			const boardHeight = await page.evaluate(() => document.documentElement.scrollHeight);
			await page.setViewportSize({ width, height: boardHeight });
			await page.evaluate(
				() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
			);
			await screenshot(`lamina-${mode}-${width}.png`);
			await page.setViewportSize({ width, height: 900 });
		}
	}
	// System scheme support on both the board and an individual document.
	await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
	await page.goto(pathToFileURL(resolve(dir, 'aquelarre-after.html')).href);
	record(
		(await page.locator('html').getAttribute('data-mode')) === 'dark',
		'individual-system-dark',
		null
	);
	await page.goto(pathToFileURL(resolve(dir, 'lamina.html')).href);
	await page.locator('#mode').selectOption('system');
	record(
		(await page.locator('html').getAttribute('data-theme')) === 'dark',
		'board-system-dark',
		null
	);
	await page.emulateMedia({ colorScheme: 'light' });
	await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
	record(true, 'board-system-live-change', null);
} finally {
	await context.close();
	await browser.close();
	evidence.summary = {
		captures: evidence.captures.length,
		checks: evidence.checks.length,
		failed: evidence.checks.filter((x) => !x.ok).length,
		pageErrors: evidence.errors.length
	};
	await writeFile(
		resolve(output, boardsOnly ? 'board-evidence.json' : 'browser-evidence.json'),
		JSON.stringify(evidence, null, 2) + '\n'
	);
	console.log(JSON.stringify({ output, summary: evidence.summary }, null, 2));
}
if (evidence.checks.some((c) => !c.ok) || evidence.errors.length) process.exitCode = 1;
