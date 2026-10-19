/** Capture both native seeded landings and actual title-field labels under real CSP. */
import { writeFileSync } from 'node:fs';
const { test, expect, loginAsDemo } = await import(new URL('../public-spa-isolation-module-fix/fixtures.ts', import.meta.url).href);
for (const seed of ['demo', 'showcase']) {
	test(`public seeded landing: ${seed}`, async ({ page }) => {
		const violations: { directive: string; blockedOrigin: string }[] = [];
		await page.exposeBinding('__seedCSP', (_source, entry) => violations.push(entry));
		await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (event) => {
			let blockedOrigin = event.blockedURI.split(':')[0];
			try { blockedOrigin = new URL(event.blockedURI).origin; } catch {}
			(window as any).__seedCSP({ directive: event.effectiveDirective, blockedOrigin });
		}));
		await loginAsDemo(page, { seedShowcase: seed === 'showcase' });
		const heading = seed === 'demo' ? 'Crear «Información del sitio»' : 'Entradas';
		await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
		const landingPathname = new URL(page.url()).pathname;
		const fields = [];
		if (seed === 'demo') {
			for (const pathname of ['/c/posts/post_1', '/c/posts/new']) {
				await page.goto(pathname);
				const input = page.getByRole('textbox', { name: 'Title', exact: true });
				await expect(input).toBeVisible();
				fields.push({ pathname, label: 'Title', id: await input.getAttribute('id'), name: await input.getAttribute('name') });
			}
		}
		writeFileSync(new URL(`./${seed}-result.json`, import.meta.url), JSON.stringify({ seed, landingPathname, heading, authenticated: true, fields, violations }, null, 2) + '\n');
		expect(violations).toEqual([]);
	});
}
