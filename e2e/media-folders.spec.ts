import { expect, loginAsDemo, test, waitForHome } from './fixtures';

test('carpetas: completar, crear, subir dentro, mover ficha y lote, filtrar picker y borrar sin perder medios', async ({
	page
}, testInfo) => {
	await loginAsDemo(page, { seedMedia: true });
	await waitForHome(page);
	await page.getByRole('link', { name: 'Medios', exact: false }).click();
	await page.getByRole('button', { name: 'Añadir campos', exact: true }).click();
	const sidebar = page.locator('aside [data-media-folders]');
	await expect(sidebar).toBeVisible();
	await sidebar.getByRole('button', { name: 'Nueva carpeta', exact: true }).click();
	await sidebar.getByLabel('Nombre de carpeta').fill('Viajes');
	await sidebar.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(page).toHaveURL(/folder=/);
	await expect(sidebar.getByRole('combobox')).toBeHidden();
	await expect(
		sidebar.getByRole('navigation').getByRole('button', { name: 'Viajes', exact: true })
	).toHaveAttribute('aria-current', 'true');
	await page.locator('.vega-media-upload input[type="file"]').setInputFiles({
		name: 'ruta.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from('%PDF-1.4\nfolder')
	});
	await expect(page.locator('[data-media-item]')).toHaveCount(1);
	await page.locator('[data-media-item]').click();
	const detail = page.getByRole('dialog', { name: 'Editar medio' });
	await detail.getByLabel('Carpeta', { exact: true }).selectOption('none');
	await detail.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(detail).not.toBeVisible();
	await expect(page.locator('[data-media-item]')).toHaveCount(0);
	await sidebar.getByRole('button', { name: 'Sin carpeta', exact: true }).click();
	await expect(page.locator('[data-media-item]')).toHaveCount(4);
	await page
		.locator('.vega-media-card')
		.filter({ hasText: 'ruta.pdf' })
		.getByRole('button', { name: /Seleccionar/ })
		.click();
	await page.getByRole('button', { name: 'Mover a…', exact: true }).click();
	const move = page.getByRole('dialog', { name: 'Mover a…' });
	await move.getByLabel('Carpeta', { exact: true }).selectOption({ label: 'Viajes' });
	await move.getByRole('button', { name: 'Mover', exact: true }).click();
	await expect(move).not.toBeVisible();
	await expect(page.locator('[data-media-item]')).toHaveCount(3);
	await page.locator('a[href="/c/posts"]').first().click();
	await page.getByRole('button', { name: 'Nuevo: Entrada', exact: true }).click();
	await page
		.locator('[data-field="coverImage"]')
		.getByRole('button', { name: 'Elegir de la biblioteca', exact: true })
		.click();
	const picker = page.getByRole('dialog', { name: 'Elegir de la biblioteca' });
	await picker.getByLabel('Carpeta', { exact: true }).selectOption({ label: 'Viajes' });
	await expect(picker.locator('[data-media-item]')).toHaveCount(0);
	await picker.getByLabel('Carpeta', { exact: true }).selectOption('none');
	await expect(picker.locator('[data-media-item]')).toHaveCount(2);
	await picker.getByRole('button', { name: 'Cancelar', exact: true }).click();
	await page.getByRole('link', { name: 'Medios', exact: false }).click();
	await page.setViewportSize({ width: 390, height: 844 });
	await sidebar.getByRole('combobox').selectOption({ label: 'Viajes' });
	await sidebar
		.locator('.mobile-actions')
		.getByRole('button', { name: 'Renombrar', exact: true })
		.click();
	await sidebar.getByLabel('Nombre de carpeta').fill('Viajes 2026');
	await sidebar.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(sidebar.getByRole('combobox').locator('option:checked')).toHaveText('Viajes 2026');
	for (const control of await sidebar.locator('.mobile-actions button, select').all()) {
		const box = await control.boundingBox();
		expect(box!.height).toBeGreaterThanOrEqual(44);
		expect(box!.width).toBeGreaterThanOrEqual(44);
	}
	await page.screenshot({
		path: testInfo.outputPath('media-folders-mobile-actions.png'),
		fullPage: true
	});
	await sidebar
		.locator('.mobile-actions')
		.getByRole('button', { name: 'Borrar carpeta', exact: true })
		.click();
	const deleting = page.getByRole('dialog', { name: 'Borrar «Viajes 2026»' });
	await expect(deleting).toContainText('1 archivos pasarán a Sin carpeta');
	await deleting.getByRole('button', { name: 'Borrar carpeta', exact: true }).click();
	await expect(deleting).not.toBeVisible();
	await expect(page).toHaveURL(/folder=none/);
	await expect(page.locator('[data-media-item]')).toHaveCount(4);
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	await page.screenshot({ path: testInfo.outputPath('media-folders-mobile.png'), fullPage: true });
});
