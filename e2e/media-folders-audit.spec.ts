/** Regresiones de la auditoría: mismos bytes/destino y columna desplazable en un navegador real. */
import { expect, loginAsDemo, test, waitForHome } from './fixtures';

async function openLibrary(page: import('@playwright/test').Page) {
	await loginAsDemo(page, { seedShowcase: true });
	await waitForHome(page);
	await page.getByRole('link', { name: 'Medios', exact: false }).click();
	const sidebar = page.locator('aside [data-media-folders]');
	await expect(sidebar).toBeVisible();
	return sidebar;
}
async function forceCreateError(page: import('@playwright/test').Page, value: boolean) {
	await page.evaluate((value) => {
		(
			window as unknown as { __VEGA_FORCE_MEDIA_CREATE_ERROR__: boolean }
		).__VEGA_FORCE_MEDIA_CREATE_ERROR__ = value;
	}, value);
}
const file = (name: string) => ({
	name,
	mimeType: 'application/pdf',
	buffer: Buffer.from('%PDF-1.4\nbytes conservados')
});

test('recuperación explícita solo tras desaparecer carpeta, conserva archivos y ofrece 44 px en móvil', async ({
	page
}, info) => {
	const sidebar = await openLibrary(page);
	const folderSelect = sidebar.getByRole('combobox');
	await folderSelect.selectOption({ label: 'Fotografía' });
	const originalFolder = await folderSelect.inputValue();
	await forceCreateError(page, true);
	await page.locator('[data-media-upload] input[type="file"]').setInputFiles(file('ordinario.pdf'));
	let queued = page.locator('[data-media-upload-item]');
	await expect(queued).toHaveAttribute('data-media-upload-status', 'error');
	await folderSelect.selectOption('none');
	await expect(page).toHaveURL(/folder=none/);
	await expect(queued.getByRole('button', { name: /Reintentar sin carpeta/ })).toHaveCount(0);
	await forceCreateError(page, false);
	await queued.getByRole('button', { name: /^reintentar$/i }).click();
	await expect(queued).toHaveAttribute('data-media-upload-status', 'done');
	await expect(
		page.locator('[data-media-grid] [data-media-item]').filter({ hasText: 'ordinario.pdf' })
	).toHaveCount(0);
	await folderSelect.selectOption(originalFolder);
	await expect(
		page.locator('[data-media-grid] [data-media-item]').filter({ hasText: 'ordinario.pdf' })
	).toHaveCount(1);
	await forceCreateError(page, true);
	await page.locator('[data-media-upload] input[type="file"]').setInputFiles(file('recuperar.pdf'));
	queued = page.locator('[data-media-upload-item]');
	await expect(queued).toHaveAttribute('data-media-upload-status', 'error');
	const row = sidebar.locator('.folder').filter({ hasText: 'Fotografía' });
	await row.locator('summary').click();
	await row.getByRole('button', { name: 'Borrar carpeta', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Borrar «Fotografía»' });
	await expect(dialog.getByRole('button', { name: 'Borrar carpeta', exact: true })).toBeEnabled();
	await dialog.getByRole('button', { name: 'Borrar carpeta', exact: true }).click();
	await expect(dialog).not.toBeVisible();
	await expect(page).toHaveURL(/folder=none/);
	await page.setViewportSize({ width: 390, height: 844 });
	const recover = queued.getByRole('button', { name: /Reintentar sin carpeta: recuperar.pdf/ });
	await expect(recover).toBeVisible();
	const box = await recover.boundingBox();
	expect(box!.height).toBeGreaterThanOrEqual(44);
	expect(box!.width).toBeGreaterThanOrEqual(44);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	await page.screenshot({ path: info.outputPath('recuperacion-movil.png'), fullPage: true });
	await forceCreateError(page, false);
	await recover.click();
	await expect(queued).toHaveAttribute('data-media-upload-status', 'done');
	await expect(
		page.locator('[data-media-grid] [data-media-item]').filter({ hasText: 'recuperar.pdf' })
	).toHaveCount(1);
	await expect(
		page.locator('[data-media-grid] [data-media-item]').filter({ hasText: 'ordinario.pdf' })
	).toHaveCount(1);
});

test('la columna de carpetas desplaza su lista sin crecer con todas las filas', async ({
	page
}, info) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	const sidebar = await openLibrary(page);
	for (let index = 0; index < 14; index++) {
		await sidebar.getByRole('button', { name: 'Nueva carpeta', exact: true }).click();
		await sidebar
			.getByLabel('Nombre de carpeta')
			.fill(`Z carpeta ${String(index).padStart(2, '0')}`);
		await sidebar.getByRole('button', { name: 'Guardar', exact: true }).click();
		await expect(sidebar.getByRole('combobox').locator('option:checked')).toHaveText(
			`Z carpeta ${String(index).padStart(2, '0')}`
		);
	}
	const list = sidebar.getByRole('navigation');
	await expect(list.locator('.folder')).toHaveCount(16);
	const size = await list.evaluate((element) => ({
		client: element.clientHeight,
		scroll: element.scrollHeight
	}));
	expect(size.scroll).toBeGreaterThan(size.client);
	expect(size.client).toBeLessThanOrEqual(540);
	await list.getByRole('button', { name: 'Z carpeta 13', exact: true }).click();
	expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
	await page.screenshot({ path: info.outputPath('carpetas-scroll.png'), fullPage: true });
});
