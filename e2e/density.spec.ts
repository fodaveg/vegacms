/**
 * Suite B.15 (§7 del contrato P3, §3.6; lote 12, lámina 3): la densidad Cómoda/Compacta se elige
 * en el MENÚ DE CUENTA (ya no hay segmentado en la barra), cambia `data-density` en la raíz del
 * documento y PERSISTE tras recargar (`vega.density.v1`, §2.6). Las opciones son `menuitemradio`
 * y la activa lleva `aria-checked="true"`; el menú se queda abierto al elegir.
 */
import { expect, loginAsDemo, test, waitForHome } from './fixtures';

test('la densidad del menú de cuenta cambia data-density en la raíz y persiste tras recargar', async ({
	page
}) => {
	await loginAsDemo(page);
	await waitForHome(page);

	const html = page.locator('html');
	const trigger = page.getByRole('button', { name: 'Menú de cuenta' });
	const menu = page.getByRole('menu', { name: 'Menú de cuenta' });
	const comfortable = menu.getByRole('menuitemradio', { name: 'Cómoda' });
	const compact = menu.getByRole('menuitemradio', { name: 'Compacta' });

	// La barra ya no lleva el segmentado de densidad.
	await expect(page.getByRole('group', { name: 'Densidad' })).toHaveCount(0);

	// Default C2: Cómoda (§3.6).
	await expect(html).toHaveAttribute('data-density', 'comfortable');
	await trigger.click();
	await expect(menu).toBeVisible();
	await expect(comfortable).toHaveAttribute('aria-checked', 'true');
	await expect(compact).toHaveAttribute('aria-checked', 'false');

	await compact.click();

	// Cambia al momento y el menú SIGUE abierto para ver el efecto.
	await expect(html).toHaveAttribute('data-density', 'compact');
	await expect(menu).toBeVisible();
	await expect(comfortable).toHaveAttribute('aria-checked', 'false');
	await expect(compact).toHaveAttribute('aria-checked', 'true');

	// Elegir la opción YA activa no hace nada raro (idempotente, sin re-set innecesario).
	await compact.click();
	await expect(html).toHaveAttribute('data-density', 'compact');

	await page.reload();

	await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
	await page.getByRole('button', { name: 'Menú de cuenta' }).click();
	await expect(
		page
			.getByRole('menu', { name: 'Menú de cuenta' })
			.getByRole('menuitemradio', { name: 'Compacta' })
	).toHaveAttribute('aria-checked', 'true');
});

test('la densidad se puede cambiar con el teclado y en una pantalla estrecha', async ({ page }) => {
	// Por debajo de 768 px el segmentado de la barra se ocultaba: el menú sí es alcanzable.
	await page.setViewportSize({ width: 390, height: 800 });
	await loginAsDemo(page);
	await waitForHome(page);

	const trigger = page.getByRole('button', { name: 'Menú de cuenta' });
	await trigger.focus();
	await page.keyboard.press('ArrowDown');
	const menu = page.getByRole('menu', { name: 'Menú de cuenta' });
	await expect(menu.getByRole('menuitemradio', { name: 'Cómoda' })).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(menu.getByRole('menuitemradio', { name: 'Compacta' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
});
