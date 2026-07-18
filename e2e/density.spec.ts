/**
 * Suite B.15 (§7 del contrato P3, §3.6): el toggle de densidad cambia `data-density` en la raíz
 * del documento y PERSISTE tras recargar (`vega.density.v1`, §2.6).
 */
import { expect, loginAsDemo, test } from './fixtures';

test('el toggle de densidad cambia data-density en la raíz y persiste tras recargar', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	const html = page.locator('html');
	const toggle = page.getByRole('button', { name: 'Densidad' });

	// Default C2: Cómoda (§3.6).
	await expect(html).toHaveAttribute('data-density', 'comfortable');
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');

	await toggle.click();

	await expect(html).toHaveAttribute('data-density', 'compact');
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');

	await page.reload();

	await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
	await expect(page.getByRole('button', { name: 'Densidad' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});
