/** One local discriminator: historical post-login landing versus actual CSP violations. */
import { writeFileSync } from 'node:fs';
const { test, expect, loginAsDemo } = await import(new URL('../public-spa-isolation-module-fix/fixtures.ts', import.meta.url).href);
test('captured SPA authenticates into its historical landing without CSP violation', async ({ page }) => {
	const violations: { directive: string; blockedOrigin: string }[] = [];
	const missingAssets: { path: string; status: number }[] = [];
	await page.exposeBinding('__landingCSP', (_source, entry) => violations.push(entry));
	await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (event) => {
		let blockedOrigin = event.blockedURI.split(':')[0];
		try { blockedOrigin = new URL(event.blockedURI).origin; } catch {}
		(window as any).__landingCSP({ directive: event.effectiveDirective, blockedOrigin });
	}));
	page.on('response', response => {
		const url = new URL(response.url());
		if (url.origin === 'http://localhost:4173' && url.pathname.startsWith('/_app/') && response.status() >= 400)
			missingAssets.push({ path: url.pathname, status: response.status() });
	});
	await loginAsDemo(page);
	await expect(page.getByRole('heading', { level: 1, name: 'Crear «Información del sitio»', exact: true })).toBeVisible();
	const result = { pathname: new URL(page.url()).pathname, heading: 'Crear «Información del sitio»', authenticated: true, violations, missingAssets };
	writeFileSync(new URL('./result.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
	expect(violations).toEqual([]);
	expect(missingAssets).toEqual([]);
});
