/** Cross-origin browser lane using the actual @vega/astro bridge source, not a protocol double.
 * Set VEGA_ASTRO_ROOT to the reviewed Astro checkout. The memory backend exercises the real
 * form save/version path; it does not certify PocketBase or the encrypted-token service.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, loginAsDemo, test } from './fixtures';

const astroRoot = process.env.VEGA_ASTRO_ROOT;
const SITE = 'https://inline-astro.example';
const CMS = 'http://localhost:4173';
const escape = (value: string) =>
	value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

test.describe('actual Astro inline bridge', () => {
	test.skip(!astroRoot, 'Requires VEGA_ASTRO_ROOT pointing to the reviewed @vega/astro checkout');
	test('cross-origin: caret, cancel, commit, explicit save and independent backend read', async ({
		page
	}) => {
		const fixture = readFileSync(
			join(astroRoot!, 'fixtures/basic/dist/inline-preview/index.html'),
			'utf8'
		);
		let heading = 'Escribe. Publica. Olvídate del resto.';
		let tokenRequests = 0;
		await page.route(`${SITE}/**`, async (route) => {
			const request = route.request();
			if (request.method() === 'OPTIONS') {
				await route.fulfill({
					status: 204,
					headers: {
						'Access-Control-Allow-Origin': CMS,
						'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
						'Access-Control-Allow-Headers': 'Content-Type,Authorization,Accept'
					}
				});
				return;
			}
			if (new URL(request.url()).pathname.endsWith('/token')) {
				tokenRequests++;
				const payload = request.postDataJSON();
				const draft = payload.draft?.blocks?.find(
					(block: { id: string }) => block.id === 'seccion_1'
				);
				if (typeof draft?.fields?.heading === 'string') heading = draft.fields.heading;
				await route.fulfill({
					contentType: 'application/json',
					headers: { 'Access-Control-Allow-Origin': CMS },
					body: JSON.stringify({
						url: `${SITE}/preview`,
						postToken: 'fixture-body-token',
						expiresAt: new Date(Date.now() + 300_000).toISOString()
					})
				});
				return;
			}
			const pathname = new URL(request.url()).pathname;
			if (pathname.startsWith('/_astro/') && !pathname.includes('..')) {
				await route.fulfill({
					contentType: pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
					body: readFileSync(join(astroRoot!, 'fixtures/basic/dist', pathname))
				});
				return;
			}
			await route.fulfill({
				contentType: 'text/html',
				headers: { 'Content-Security-Policy': `frame-ancestors ${CMS}` },
				body: fixture.replace('__VEGA_INLINE_HEADING__', escape(heading))
			});
		});
		await page.addInitScript((url) => {
			(window as unknown as { __VEGA_PREVIEW_API_URL__: string }).__VEGA_PREVIEW_API_URL__ = url;
		}, `${SITE}/api/preview`);
		await loginAsDemo(page, { seedShowcase: true });
		await page.goto('/c/paginas/pagina_1/visual');
		const frame = page.frameLocator('.vega-visual-frame');
		const title = frame.locator('[data-vega-field="heading"]');
		await expect(title).toBeVisible();
		await title.click();
		await expect(title).toHaveAttribute('contenteditable', 'plaintext-only');
		const count = tokenRequests;
		await page.keyboard.insertText('Draft with caret');
		await page.waitForTimeout(650); // exceeds the production debounce; no DOM replacement may occur
		expect(tokenRequests).toBe(count);
		expect(
			await title.evaluate((node) => ({
				text: node.textContent,
				anchor: node.ownerDocument.getSelection()?.anchorOffset,
				focused: node.ownerDocument.activeElement === node
			}))
		).toEqual({ text: 'Draft with caret', anchor: 16, focused: true });
		await title.dispatchEvent('compositionstart');
		await page.keyboard.press('Enter');
		await expect(title).toHaveAttribute('contenteditable', 'plaintext-only');
		await title.dispatchEvent('compositionend');
		await page.keyboard.press('Escape');
		await expect(title).toHaveText('Escribe. Publica. Olvídate del resto.');
		await title.click();
		await expect(title).toHaveAttribute('contenteditable', 'plaintext-only');
		await title.evaluate((node) => {
			const data = new DataTransfer();
			data.setData('text/plain', '<b>Plain text</b>');
			data.setData('text/html', '<b>Rich text</b>');
			node.dispatchEvent(
				new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
			);
		});
		await expect(title).toHaveText('<b>Plain text</b>');
		await expect(title.locator('b')).toHaveCount(0);
		await page.keyboard.press('Escape');
		await title.click();
		await expect(title).toHaveAttribute('contenteditable', 'plaintext-only');
		await page.keyboard.insertText('Saved from the page');
		await expect(page.locator('.vega-visual-dirty')).toBeVisible();
		await page.keyboard.press('Control+s');
		await expect(page.locator('.vega-visual-dirty')).toHaveCount(0);
		await page.getByRole('link', { name: 'Campos de página' }).click();
		await expect(page.locator('.vega-block-title').first()).toHaveText('Saved from the page');
	});
});
