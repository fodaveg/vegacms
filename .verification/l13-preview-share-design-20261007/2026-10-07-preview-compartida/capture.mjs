import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
if (!process.version.startsWith('v22.')) throw Error('Node22 required');
const dir = dirname(fileURLToPath(import.meta.url)),
	out = resolve(process.argv[2] || '/private/tmp/vega-l13-preview-share-captures-20261007');
await mkdir(out, { recursive: true });
const result = {
	kind: 'HTML mockup only; not application QA',
	node: process.version,
	checks: [],
	captures: [],
	errors: []
};
const browser = await chromium.launch({ headless: true });
result.browser = browser.version();
const context = await browser.newContext({ reducedMotion: 'reduce', deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', (e) => result.errors.push(String(e)));
const check = (name, ok, detail = null) => result.checks.push({ name, ok, detail });
async function go(screen, params = {}) {
	const url = pathToFileURL(resolve(dir, screen + '.html'));
	url.search = new URLSearchParams(params);
	await page.goto(url.href);
	await page.waitForTimeout(60);
}
try {
	const cases = [
		['01-enlaces', 1440, { mode: 'light' }, '01-enlaces-1440-claro'],
		['02-crear', 390, { mode: 'light', state: 'dirty' }, '02-crear-390-sin-guardar'],
		['03-copiar', 390, { mode: 'dark', lang: 'en' }, '03-copiar-390-dark-en'],
		[
			'01-enlaces',
			1440,
			{ mode: 'dark', theme: 'aquelarre', lang: 'en', state: 'long' },
			'04-anular-1440-dark-en'
		],
		['01-enlaces', 390, { mode: 'light', state: 'expired' }, '05-caducado-390'],
		['01-enlaces', 1440, { mode: 'dark', state: 'error' }, '06-error-1440-dark']
	];
	for (const [screen, width, params, name] of cases) {
		await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
		await go(screen, params);
		if (name.startsWith('04')) await page.locator('#revoke').click();
		await page.screenshot({ path: resolve(out, name + '.png'), fullPage: true });
		result.captures.push(name + '.png');
		check(
			name + ' horizontal',
			await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
		);
		check(
			name + ' modal bounds',
			await page.locator('.vega-admin-dialog').evaluate((el) => {
				const r = el.getBoundingClientRect();
				return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight + 1;
			})
		);
	}
	await page.setViewportSize({ width: 390, height: 844 });
	await go('03-copiar', { mode: 'dark' });
	await page.locator('#success-close').click();
	check('close warns before uncopied URL loss', await page.locator('#close-confirm').isVisible());
	await page.locator('#keep').click();
	check('return retains URL', !!(await page.locator('#url').inputValue()));
	await page.locator('#success-close').click();
	await page.locator('#lose').click();
	check('close erases URL DOM', !(await page.locator('#url').inputValue()));
	check(
		'focus returned to trigger',
		await page.locator('#open').evaluate((el) => el === document.activeElement)
	);
	await page.locator('#open').click();
	check(
		'reopen metadata only',
		(await page.locator('#manage').isVisible()) && !(await page.locator('#copy').isVisible())
	);
	await page.locator('#revoke').click();
	await page.locator('#revoke-cancel').click();
	check('revoke cancel retains row', await page.locator('#link-row').isVisible());
	await page.locator('#revoke').click();
	await page.locator('#revoke-submit').click();
	check(
		'revoke removes row',
		!(await page.locator('#link-row').isVisible()) &&
			(await page.locator('#revoked-notice').isVisible())
	);
	for (const state of ['denied', 'new', 'unsupported']) {
		await go('01-enlaces', { state });
		check(
			'gate ' + state,
			!(await page.locator('#open').isVisible()) && !(await page.locator('#modal').isVisible())
		);
	}
	await go('02-crear', { state: 'dirty' });
	check('dirty warning', await page.locator('#dirty-notice').isVisible());
	await page.locator('#quantity').fill('31');
	await page.locator('#create-submit').click();
	check(
		'TTL >30d stays with error',
		(await page.locator('#quantity').inputValue()) === '31' &&
			(await page.locator('#ttl-error').isVisible())
	);
	await page.locator('#quantity').fill('1');
	await page.locator('#unit').selectOption('1');
	await page.locator('#create-submit').click();
	check('1 second accepted by mock local validation', await page.locator('#success').isVisible());
	await page.locator('#copy').click();
	check(
		'simulated copy acknowledged',
		/simula/.test(await page.locator('#copy-status').textContent())
	);
	await page.locator('#success-close').click();
	check('copied close clears URL', !(await page.locator('#url').inputValue()));
	await go('02-crear', { state: 'ttl' });
	await page.locator('#quantity').fill('2');
	await page.locator('#create-submit').click();
	check(
		'server rejection retains input',
		(await page.locator('#quantity').inputValue()) === '2' &&
			(await page.locator('#ttl-error').isVisible())
	);
	await go('02-crear', { state: 'busy' });
	await page.keyboard.press('Escape');
	check('busy blocks Escape', await page.locator('#modal').isVisible());
	check('busy blocks submit', await page.locator('#create-submit').isDisabled());
	await go('01-enlaces', { state: 'loading' });
	check(
		'loading does not show empty',
		!(await page.locator('#empty').isVisible()) && (await page.locator('#load-status').isVisible())
	);
	await go('01-enlaces', { state: 'empty' });
	check('empty state', await page.locator('#empty').isVisible());
	await page.locator('#new-link').focus();
	await page.keyboard.press('Tab');
	check(
		'Tab wraps to close',
		await page.locator('#close').evaluate((el) => el === document.activeElement)
	);
	for (const theme of ['niebla', 'miel', 'aquelarre'])
		for (const mode of ['light', 'dark']) {
			await go('02-crear', { theme, mode, state: 'dirty' });
			const ratios = await page.evaluate(() => {
				const cv = document.createElement('canvas'),
					ctx = cv.getContext('2d');
				function rgb(color) {
					ctx.clearRect(0, 0, 1, 1);
					ctx.fillStyle = color;
					ctx.fillRect(0, 0, 1, 1);
					return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
				}
				function lum(c) {
					return rgb(c)
						.map((v) => {
							v /= 255;
							return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
						})
						.reduce((v, x, i) => v + x * [0.2126, 0.7152, 0.0722][i], 0);
				}
				const surface = getComputedStyle(
					document.querySelector('.vega-admin-dialog')
				).backgroundColor;
				return ['.context', '.note', '.notice'].map((s) => {
					const cs = getComputedStyle(document.querySelector(s)),
						bg = cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? surface : cs.backgroundColor,
						a = lum(cs.color),
						b = lum(bg);
					return {
						selector: s,
						fg: cs.color,
						bg,
						ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
					};
				});
			});
			check(
				theme + ' ' + mode + ' text >=4.5',
				ratios.every((r) => r.ratio >= 4.5),
				ratios
			);
		}
	await go('lamina');
	check('board three frames', (await page.locator('iframe').count()) === 3);
	await page.locator('#mode').selectOption('dark');
	await page.waitForTimeout(100);
	check(
		'board drives dark frames',
		await Promise.all(
			page
				.frames()
				.slice(1)
				.map((f) => f.evaluate(() => document.documentElement.dataset.mode))
		).then((a) => a.every((v) => v === 'dark'))
	);
} finally {
	await context.close();
	await browser.close();
	result.resourcesClosed = true;
	result.failed = result.checks.filter((c) => !c.ok).length;
	await writeFile(resolve(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
	await writeFile(resolve(dir, 'browser-summary.json'), JSON.stringify(result, null, 2) + '\n');
	console.log(
		JSON.stringify({
			checks: result.checks.length,
			failed: result.failed,
			errors: result.errors,
			captures: result.captures,
			resourcesClosed: true
		})
	);
}
if (result.failed || result.errors.length) process.exitCode = 1;
