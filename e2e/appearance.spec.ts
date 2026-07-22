/**
 * Suite F7w-a ("encender los temas"): el selector de "Apariencia" en `/settings` cambia
 * `data-theme`/`data-mode` en la raíz del documento y PERSISTE tras recargar (mismo criterio que
 * `density.spec.ts` para `data-density`, §2.6/§6.3 — `vega.theme.v1`/`vega.mode.v1`).
 */
import { expect, loginAsDemo, test } from './fixtures';

async function goToSettings(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('link', { name: 'Ajustes', exact: false }).click();
	await page.waitForURL('**/settings');
	await expect(page.locator('#manifest-editor-textarea')).toBeVisible();
}

test('el selector de tema cambia data-theme en la raíz y persiste tras recargar', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
	await goToSettings(page);

	const html = page.locator('html');
	// Default de F7w-a (FALLBACK_THEME del motor P7): niebla.
	await expect(html).toHaveAttribute('data-theme', 'niebla');
	await expect(page.locator('.vega-theme-swatch')).toHaveCount(21);

	const terracotaButton = page.getByRole('button', { name: 'Terracota' });
	await expect(terracotaButton).toHaveAttribute('aria-pressed', 'false');

	await terracotaButton.click();

	await expect(html).toHaveAttribute('data-theme', 'terracota');
	await expect(terracotaButton).toHaveAttribute('aria-pressed', 'true');

	await page.reload();

	await expect(page.locator('html')).toHaveAttribute('data-theme', 'terracota');
	await expect(page.getByRole('button', { name: 'Terracota' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('el selector presenta las pinturas especiales del catálogo de Lumbre', async ({ page }) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
	await goToSettings(page);

	const aquelarre = page.getByRole('button', { name: 'Aquelarre' });
	await expect(aquelarre).toBeVisible();
	const dotBackground = await aquelarre.locator('.vega-theme-swatch-dot').evaluate((dot) => {
		return getComputedStyle(dot).backgroundImage;
	});
	expect(dotBackground).toContain('linear-gradient');
});

test('el toggle de modo cambia data-mode en la raíz y persiste tras recargar', async ({ page }) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
	await goToSettings(page);

	const html = page.locator('html');
	const darkButton = page.getByRole('button', { name: 'Oscuro' });

	await darkButton.click();

	await expect(html).toHaveAttribute('data-mode', 'dark');
	await expect(darkButton).toHaveAttribute('aria-pressed', 'true');

	await page.reload();

	await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
	await expect(page.getByRole('button', { name: 'Oscuro' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});
