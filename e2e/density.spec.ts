/**
 * Suite B.15 (§7 del contrato P3, §3.6): el toggle SEGMENTADO de densidad (R1 del rediseño C2,
 * `Cómoda│Compacta`) cambia `data-density` en la raíz del documento y PERSISTE tras recargar
 * (`vega.density.v1`, §2.6).
 */
import { expect, loginAsDemo, test } from './fixtures';

test('el segmento pulsado cambia data-density en la raíz y persiste tras recargar', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	const html = page.locator('html');
	const group = page.getByRole('group', { name: 'Densidad' });
	const comfortable = group.getByRole('button', { name: 'Cómoda' });
	const compact = group.getByRole('button', { name: 'Compacta' });

	// Default C2: Cómoda (§3.6).
	await expect(html).toHaveAttribute('data-density', 'comfortable');
	await expect(comfortable).toHaveAttribute('aria-pressed', 'true');
	await expect(compact).toHaveAttribute('aria-pressed', 'false');

	await compact.click();

	await expect(html).toHaveAttribute('data-density', 'compact');
	await expect(comfortable).toHaveAttribute('aria-pressed', 'false');
	await expect(compact).toHaveAttribute('aria-pressed', 'true');

	// Clicar el segmento YA activo no hace nada raro (idempotente, sin re-set innecesario).
	await compact.click();
	await expect(html).toHaveAttribute('data-density', 'compact');

	await page.reload();

	await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
	await expect(
		page.getByRole('group', { name: 'Densidad' }).getByRole('button', { name: 'Compacta' })
	).toHaveAttribute('aria-pressed', 'true');
});
