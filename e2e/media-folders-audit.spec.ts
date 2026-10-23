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
	const folderNav = sidebar.getByRole('navigation');
	await expect(sidebar.getByRole('combobox')).toBeHidden();
	await folderNav.getByRole('button', { name: 'Fotografía', exact: true }).click();
	await forceCreateError(page, true);
	await page.locator('[data-media-upload] input[type="file"]').setInputFiles(file('ordinario.pdf'));
	let queued = page.locator('[data-media-upload-item]');
	await expect(queued).toHaveAttribute('data-media-upload-status', 'error');
	await folderNav.getByRole('button', { name: 'Sin carpeta', exact: true }).click();
	await expect(page).toHaveURL(/folder=none/);
	await expect(queued.getByRole('button', { name: /Reintentar sin carpeta/ })).toHaveCount(0);
	await forceCreateError(page, false);
	await queued.getByRole('button', { name: /^reintentar$/i }).click();
	await expect(queued).toHaveAttribute('data-media-upload-status', 'done');
	await expect(
		page.locator('[data-media-grid] [data-media-item]').filter({ hasText: 'ordinario.pdf' })
	).toHaveCount(0);
	await folderNav.getByRole('button', { name: 'Fotografía', exact: true }).click();
	await expect(
		page.locator('[data-media-grid] [data-media-item]').filter({ hasText: 'ordinario.pdf' })
	).toHaveCount(1);
	await forceCreateError(page, true);
	await page.locator('[data-media-upload] input[type="file"]').setInputFiles(file('recuperar.pdf'));
	queued = page.locator('[data-media-upload-item]');
	await expect(queued).toHaveAttribute('data-media-upload-status', 'error');
	const row = sidebar.locator('.folder').filter({ hasText: 'Fotografía' });
	const trigger = row.getByRole('button', { name: 'Acciones de Fotografía', exact: true });
	await trigger.click();
	await page.keyboard.press('Escape');
	await expect(trigger).toBeFocused();
	await trigger.click();
	await row.getByRole('menuitem', { name: 'Borrar carpeta', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Borrar «Fotografía»' });
	await expect(dialog.getByRole('button', { name: 'Borrar carpeta', exact: true })).toBeEnabled();
	await dialog.getByRole('button', { name: 'Borrar carpeta', exact: true }).click();
	await expect(dialog).not.toBeVisible();
	await expect(page).toHaveURL(/folder=none/);
	await page.setViewportSize({ width: 390, height: 844 });
	if (await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).count())
		await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).click();
	await expect(page.locator('#vega-sidebar')).not.toBeInViewport();
	await expect(folderNav).toBeHidden();
	await expect(sidebar.getByRole('combobox')).toBeVisible();
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
	for (let index = 0; index < 20; index++) {
		await sidebar.getByRole('button', { name: 'Nueva carpeta', exact: true }).click();
		await sidebar
			.getByLabel('Nombre de carpeta')
			.fill(`Z carpeta ${String(index).padStart(2, '0')}`);
		await sidebar.getByRole('button', { name: 'Guardar', exact: true }).click();
		await expect(
			sidebar
				.getByRole('navigation')
				.getByRole('button', { name: `Z carpeta ${String(index).padStart(2, '0')}`, exact: true })
		).toHaveAttribute('aria-current', 'true');
	}
	const list = sidebar.getByRole('navigation');
	await expect(list.locator('.folder')).toHaveCount(22);
	const size = await list.evaluate((element) => ({
		client: element.clientHeight,
		scroll: element.scrollHeight
	}));
	expect(size.scroll).toBeGreaterThan(size.client);
	expect(size.client).toBeLessThanOrEqual(540);
	await list.getByRole('button', { name: 'Z carpeta 19', exact: true }).click();
	expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
	await page.screenshot({ path: info.outputPath('carpetas-scroll.png'), fullPage: true });
});

test('biblioteca: navegación exclusiva por tamaño, opción del original y estados vacío y con archivo', async ({
	page
}, info) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	const sidebar = await openLibrary(page);
	await expect(sidebar.getByRole('combobox')).toBeHidden();
	await expect(sidebar.getByRole('navigation')).toBeVisible();
	await expect(page.locator('[data-media-item]')).not.toHaveCount(0);
	await page.screenshot({ path: info.outputPath('medios-desktop.png'), fullPage: true });
	await sidebar.getByRole('button', { name: 'Nueva carpeta', exact: true }).click();
	await sidebar.getByLabel('Nombre de carpeta').fill('Archivo sin imágenes');
	await sidebar.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(page.locator('[data-media-grid-state="empty-folder"]')).toBeVisible();
	await expect(page.locator('.vega-media-empty')).toHaveCount(0);
	await page.evaluate(() => {
		document.documentElement.dataset.theme = 'aquelarre';
		document.documentElement.dataset.mode = 'dark';
		document.documentElement.style.colorScheme = 'dark';
	});
	await page.screenshot({
		path: info.outputPath('medios-vacio-aquelarre-dark.png'),
		fullPage: true
	});
	await page.evaluate(() => {
		document.documentElement.dataset.mode = 'light';
		document.documentElement.style.colorScheme = 'light';
	});
	await page.screenshot({ path: info.outputPath('medios-vacio-desktop.png'), fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	if (await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).count())
		await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).click();
	await expect(page.locator('#vega-sidebar')).not.toBeInViewport();
	await expect(page.locator('.vega-media-dropzone--empty')).toBeVisible();
	await page.screenshot({ path: info.outputPath('medios-vacio-mobile.png'), fullPage: true });
	await page.evaluate(() => {
		document.documentElement.dataset.mode = 'dark';
		document.documentElement.style.colorScheme = 'dark';
	});
	await page.screenshot({ path: info.outputPath('medios-vacio-mobile-dark.png'), fullPage: true });
	await page.evaluate(() => {
		document.documentElement.dataset.mode = 'light';
		document.documentElement.style.colorScheme = 'light';
	});
	await page.setViewportSize({ width: 1440, height: 1000 });

	const options = page.locator('.vega-media-upload-options');
	await options.locator('summary').click();
	await options.getByRole('checkbox', { name: 'Subir el original', exact: true }).check();
	await expect(options.getByRole('checkbox')).toBeChecked();
	await page.locator('[data-media-upload] input[type="file"]').setInputFiles(file('original.pdf'));
	await expect(page.locator('[data-media-item]')).toHaveCount(1);
	await expect(page.locator('.vega-media-meta')).toHaveText('1 archivo');
	await expect(page.locator('[data-media-upload-item]')).toHaveAttribute(
		'data-media-upload-status',
		'done'
	);
	await page.screenshot({ path: info.outputPath('medios-un-archivo.png'), fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	if (await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).count())
		await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).click();
	await expect(page.locator('#vega-sidebar')).not.toBeInViewport();
	await expect(sidebar.getByRole('navigation')).toBeHidden();
	await expect(sidebar.getByRole('combobox')).toBeVisible();
	for (const control of await sidebar
		.locator('select, .mobile-actions button, .new-folder')
		.all()) {
		const box = await control.boundingBox();
		expect(box!.height).toBeGreaterThanOrEqual(44);
		expect(box!.width).toBeGreaterThanOrEqual(44);
	}
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: info.outputPath('medios-mobile.png'), fullPage: true });
	await page.evaluate(() => {
		document.documentElement.dataset.mode = 'dark';
		document.documentElement.style.colorScheme = 'dark';
	});
	await page.screenshot({ path: info.outputPath('medios-mobile-dark.png'), fullPage: true });
	for (const mode of ['light', 'dark']) {
		await page.evaluate((mode) => {
			document.documentElement.dataset.mode = mode;
			document.documentElement.style.colorScheme = mode;
		}, mode);
		const ratios = await page.locator('.vega-media-page').evaluate((root) => {
			const sample = document.createElement('span');
			root.append(sample);
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 1;
			const context = canvas.getContext('2d')!;
			const rgb = (color: string) => {
				context.clearRect(0, 0, 1, 1);
				context.fillStyle = color;
				context.fillRect(0, 0, 1, 1);
				return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
			};
			const luminance = (color: number[]) =>
				color
					.map((value) => {
						const c = value / 255;
						return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
					})
					.reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
			const pairs = [
				['--ink-2', '--paper'],
				['--ink', '--surface'],
				['--accent-text', '--accent-soft']
			];
			const result = pairs.map(([ink, background]) => {
				sample.style.color = `var(${ink})`;
				sample.style.backgroundColor = `var(${background})`;
				const style = getComputedStyle(sample),
					foreground = luminance(rgb(style.color)),
					paper = luminance(rgb(style.backgroundColor));
				return {
					ink,
					background,
					ratio: (Math.max(foreground, paper) + 0.05) / (Math.min(foreground, paper) + 0.05)
				};
			});
			sample.remove();
			return result;
		});
		for (const pair of ratios)
			expect(pair.ratio, `${mode} ${JSON.stringify(pair)}`).toBeGreaterThanOrEqual(4.5);
		console.log('MEDIA_UI_CONTRAST ' + mode + ' ' + JSON.stringify(ratios));
	}
});
