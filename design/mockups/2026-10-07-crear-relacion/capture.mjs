import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
if (!process.version.startsWith('v22.')) throw Error('Node22 required');
const dir = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] || '/private/tmp/vega-l12-relation-create-captures-20261007');
await mkdir(out, { recursive: true });
const evidence = {
	kind: 'local mockup only; not Vega QA',
	node: process.version,
	browser: '',
	checks: [],
	captures: [],
	errors: []
};
const browser = await chromium.launch({ headless: true });
evidence.browser = browser.version();
const context = await browser.newContext({
	locale: 'es-ES',
	reducedMotion: 'reduce',
	deviceScaleFactor: 1
});
const page = await context.newPage();
page.on('pageerror', (e) => evidence.errors.push(String(e)));
const check = (name, ok, detail = null) => evidence.checks.push({ name, ok, detail });
const go = async (screen, params = {}) => {
	const url = pathToFileURL(resolve(dir, screen + '.html'));
	url.search = new URLSearchParams(params);
	await page.goto(url.href);
	if (screen !== 'lamina') await page.waitForFunction(() => document.documentElement.dataset.mode);
};
const capture = async (name) => {
	await page.screenshot({ path: resolve(out, name + '.png'), fullPage: true });
	evidence.captures.push(name + '.png');
};
try {
	const cases = [
		['01-buscar', 1440, { mode: 'light', theme: 'niebla', lang: 'es' }, '01-search-desktop'],
		['02-crear', 1440, { mode: 'light', theme: 'miel', lang: 'es' }, '02-create-desktop'],
		[
			'03-seleccionada',
			1440,
			{ mode: 'dark', theme: 'aquelarre', lang: 'en' },
			'03-selected-dark-en'
		],
		[
			'02-crear',
			390,
			{ mode: 'dark', theme: 'niebla', lang: 'en', state: 'long' },
			'04-long-mobile-en'
		],
		[
			'02-crear',
			390,
			{ mode: 'light', theme: 'aquelarre', lang: 'es', state: 'duplicate' },
			'05-duplicate-mobile'
		],
		[
			'02-crear',
			390,
			{ mode: 'light', theme: 'miel', lang: 'es', state: 'network' },
			'06-network-mobile'
		]
	];
	for (const [screen, width, params, name] of cases) {
		await page.setViewportSize({ width, height: 900 });
		await go(screen, params);
		const metrics = await page.evaluate(() => ({
			overflow: document.documentElement.scrollWidth > innerWidth,
			modalOverflow:
				document.querySelector('.vega-admin-dialog').scrollWidth >
				document.querySelector('.vega-admin-dialog').clientWidth,
			dialogVisible: !document.getElementById('modal').hidden,
			mode: document.documentElement.dataset.mode,
			lang: document.documentElement.lang,
			actionHeights: [...document.querySelectorAll('.vega-admin-dialog-actions button')]
				.filter((e) => e.getClientRects().length)
				.map((e) => e.getBoundingClientRect().height)
		}));
		check(
			name + ':layout',
			!metrics.overflow && (!metrics.dialogVisible || !metrics.modalOverflow),
			metrics
		);
		check(
			name + ':touch',
			metrics.actionHeights.every((h) => h >= 44),
			metrics.actionHeights
		);
		check(name + ':theme-lang', metrics.mode === params.mode && metrics.lang === params.lang);
		await capture(name);
	}
	// Parent draft, separate submit, selection, keyboard and cancel behaviors in local simulation.
	await go('01-buscar', { mode: 'light' });
	const title = page.locator('#parent-title');
	await title.fill('Borrador en curso');
	await page.locator('#search').press('Enter');
	check('search-enter-does-not-create', await page.locator('#modal').isHidden());
	await page.locator('#open-create').click();
	check(
		'dialog-name-focus',
		await page.locator('#name').evaluate((el) => el === document.activeElement)
	);
	check('parent-inert', await page.locator('#parent-screen').evaluate((el) => el.inert));
	await page.locator('#name').fill('Taller');
	await page.locator('#submit').click();
	check(
		'success-selects-local-record',
		await page
			.locator('#selected')
			.textContent()
			.then((t) => t.includes('Taller'))
	);
	check('parent-draft-kept', (await title.inputValue()) === 'Borrador en curso');
	check(
		'parent-dirty-kept',
		await page
			.locator('.dirty')
			.textContent()
			.then((t) => t.includes('sin guardar'))
	);
	check(
		'success-focus-chip',
		await page.locator('#selected button').evaluate((el) => el === document.activeElement)
	);
	await go('01-buscar', { mode: 'light' });
	await title.fill('Borrador en curso');
	await page.locator('#open-create').click();
	await page.locator('#name').fill('autoalojamiento');
	await page.keyboard.press('Escape');
	check('dirty-child-cancel-confirms', await page.locator('#discard').isVisible());
	check(
		'cancel-focus-safe',
		await page.locator('#cancel').evaluate((el) => el === document.activeElement)
	);
	await page.locator('#cancel').click();
	check(
		'keep-editing-child-value',
		(await page.locator('#name').inputValue()) === 'autoalojamiento'
	);
	await page.locator('#close').click();
	await page.locator('#submit').click();
	check(
		'discard-keeps-parent',
		(await title.inputValue()) === 'Borrador en curso' && (await page.locator('#modal').isHidden())
	);
	check(
		'cancel-focus-opener',
		await page.locator('#open-create').evaluate((el) => el === document.activeElement)
	);
	for (const state of ['readonly', 'denied', 'hidden', 'limit']) {
		await go('01-buscar', { state });
		check(
			'creation-affordance:' + state,
			state === 'limit'
				? await page.locator('#open-create').isDisabled()
				: await page.locator('#open-create').isHidden()
		);
		check(
			'lookup-kept:' + state,
			state === 'readonly'
				? await page.locator('#search').isHidden()
				: await page.locator('#search').isVisible()
		);
	}
	await go('02-crear', { state: 'validation' });
	check(
		'required-error-focus',
		(await page.locator('#slug').getAttribute('aria-invalid')) === 'true' &&
			(await page.locator('#slug').evaluate((el) => el === document.activeElement))
	);
	await page.locator('#submit').click();
	check('required-prevents-create', await page.locator('#modal').isVisible());
	await go('02-crear', { state: 'loading' });
	await page.keyboard.press('Escape');
	check('busy-escape-keeps-dialog', await page.locator('#modal').isVisible());
	check('busy-fields-readonly', await page.locator('#name').evaluate((el) => el.readOnly));
	check(
		'busy-actions-aria-disabled',
		(await page.locator('#submit').getAttribute('aria-disabled')) === 'true'
	);
	await go('02-crear', { state: 'duplicate' });
	await page.locator('#use-existing').click();
	check('existing-selection-closes-dialog', await page.locator('#modal').isHidden());
	check(
		'existing-not-created-copy',
		await page
			.locator('#success')
			.textContent()
			.then((t) => t.includes('existente'))
	);
	// Board frame rendering at requested widths; resize canvas so all iframes rasterize.
	for (const width of [1440, 390]) {
		await page.setViewportSize({ width, height: 900 });
		await go('lamina');
		await page.locator('#width').selectOption(String(width));
		await page.locator('#mode').selectOption(width === 390 ? 'dark' : 'light');
		await page.waitForFunction(() => document.querySelectorAll('iframe').length === 3);
		check('board-three-frames:' + width, page.frames().length === 4);
		for (const f of page.frames().slice(1)) {
			await f.waitForFunction((w) => innerWidth === w, width);
			check(
				'board-frame-overflow:' + width,
				await f.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
			);
		}
		const height = await page.evaluate(() => document.documentElement.scrollHeight);
		await page.setViewportSize({ width, height });
		await page.evaluate(
			() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
		);
		await capture('lamina-' + width);
	}
} finally {
	await context.close();
	await browser.close();
	evidence.summary = {
		checks: evidence.checks.length,
		failures: evidence.checks.filter((c) => !c.ok).length,
		captures: evidence.captures.length,
		pageErrors: evidence.errors.length
	};
	await writeFile(resolve(out, 'browser-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
	console.log(JSON.stringify({ out, summary: evidence.summary }, null, 2));
}
if (evidence.checks.some((c) => !c.ok) || evidence.errors.length) process.exitCode = 1;
