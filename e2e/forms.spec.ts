import { test, expect, loginAsDemo } from './fixtures';
import { writeFileSync } from 'node:fs';
async function prepare(page: import('@playwright/test').Page) {
	await page.addInitScript(() => {
		window.__VEGA_SEED_EMPTY__ = true;
	});
	await loginAsDemo(page);
	await page.goto('/settings');
	const base = page.locator('[data-site-state]');
	await base.getByRole('button', { name: 'Preparar el sitio', exact: true }).click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Preparar el sitio', exact: true })
		.click();
	await expect(base).toHaveAttribute('data-site-state', 'current');
}
test('crea formulario, genera migración, lista límite y abre bandeja vacía', async ({ page }) => {
	await prepare(page);
	await page.getByRole('button', { name: 'Nuevo formulario', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Título del formulario', { exact: true }).fill('Inscripciones');
	await expect(dialog.getByLabel('Nombre de la colección', { exact: true })).toHaveValue(
		'inscripciones'
	);
	await dialog.getByLabel('Nombre singular', { exact: true }).fill('Inscripción');
	await dialog.getByRole('button', { name: 'Añadir campo', exact: true }).click();
	const fields = dialog.locator('fieldset');
	await fields.nth(1).getByLabel('Etiqueta', { exact: true }).fill('Correo');
	await fields.nth(1).getByLabel('Nombre del campo', { exact: true }).fill('email');
	await fields.nth(1).getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('email');
	await dialog.getByRole('button', { name: 'Vista previa', exact: true }).click();
	await expect(dialog.getByText('Se crea la colección inscripciones')).toBeVisible();
	await expect(dialog.locator('pre')).toContainText('"hidden": true');
	if (process.env.VEGA_FORMS_EVIDENCE_DIR)
		await page.screenshot({
			path: `${process.env.VEGA_FORMS_EVIDENCE_DIR}/forms-desktop-preview.png`,
			fullPage: true
		});
	await dialog.getByRole('button', { name: 'Crear formulario', exact: true }).click();
	await expect(dialog.getByText('Formulario Inscripciones creado.', { exact: true })).toBeVisible();
	await expect(dialog.getByText('Migración generada', { exact: true })).toBeVisible();
	await dialog.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
	const row = page.locator('.forms-card li', { hasText: 'inscripciones' });
	await expect(row).toContainText('Sin límite específico');
	await row.getByRole('button', { name: 'Añadir límite', exact: true }).click();
	await expect(row).toContainText('5 envíos cada 60 segundos');
	await page
		.getByRole('navigation')
		.getByRole('link', { name: /Inscripciones/ })
		.click();
	await expect(page).toHaveURL(/\/c\/inscripciones$/);
	await expect(page.getByRole('button', { name: 'Nuevo', exact: true })).toHaveCount(0);
});
test('nombres reservados se rechazan y móvil conserva controles dentro del viewport', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await prepare(page);
	await page.getByRole('button', { name: 'Nuevo formulario', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Título del formulario', { exact: true }).fill('Encuesta');
	await dialog.getByLabel('Nombre singular', { exact: true }).fill('Encuesta');
	await dialog.getByLabel('Nombre del campo', { exact: true }).fill('website');
	const focused = dialog.getByLabel('Nombre del campo', { exact: true });
	const spacing = await focused.evaluate((node) => {
		const label = document.querySelector(`label[for="${node.id}"]`)!;
		return node.getBoundingClientRect().top - label.getBoundingClientRect().bottom;
	});
	// The 2px outline plus 2px offset must not paint over the label.
	expect(spacing).toBeGreaterThanOrEqual(4);
	const metrics = await dialog.locator('input:not([type=checkbox]),select').evaluateAll((nodes) => {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const context = canvas.getContext('2d')!;
		const luminance = (color: string) => {
			context.fillStyle = color;
			context.fillRect(0, 0, 1, 1);
			const channels = Array.from(context.getImageData(0, 0, 1, 1).data)
				.slice(0, 3)
				.map((c) => c / 255)
				.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
			return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
		};
		return nodes.map((node) => {
			const style = getComputedStyle(node);
			const foreground = luminance(style.color),
				background = luminance(style.backgroundColor);
			return {
				tag: node.tagName,
				height: node.getBoundingClientRect().height,
				color: style.color,
				background: style.backgroundColor,
				contrast:
					(Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
			};
		});
	});
	for (const metric of metrics) {
		expect(metric.height).toBeGreaterThanOrEqual(44);
		expect(metric.contrast).toBeGreaterThanOrEqual(4.5);
	}
	if (process.env.VEGA_FORMS_EVIDENCE_DIR) {
		writeFileSync(
			`${process.env.VEGA_FORMS_EVIDENCE_DIR}/forms-mobile-metrics.json`,
			JSON.stringify(metrics, null, 2)
		);
		await page.screenshot({
			path: `${process.env.VEGA_FORMS_EVIDENCE_DIR}/forms-mobile-edit.png`,
			fullPage: true
		});
	}
	await dialog.getByRole('button', { name: 'Vista previa', exact: true }).click();
	await expect(dialog.getByRole('alert')).toContainText('nombre reservado');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	if (process.env.VEGA_FORMS_EVIDENCE_DIR)
		await page.screenshot({
			path: `${process.env.VEGA_FORMS_EVIDENCE_DIR}/forms-mobile-error.png`,
			fullPage: true
		});
});
