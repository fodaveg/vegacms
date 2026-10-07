/**
 * Cabecera de bloques en el formulario real: el manifiesto y los títulos largos se guardan
 * por sus controles, sin sustituir el texto del DOM. La semilla memory vive durante la sesión
 * SPA; una recarga del documento la reiniciaría y dejaría de medir el contenido preparado.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, loginAsDemo, test } from './fixtures';

const LONG_TITLE = 'Descubre todas las posibilidades de tu próximo proyecto con nuestro equipo';

/** Mide contenido visible, no solo la presencia de un span que puede tener ancho cero. */
async function expectReadableHeader(row: Locator): Promise<void> {
	const geometry = await row.evaluate((element) => {
		const box = (selector: string) => {
			const node = element.querySelector<HTMLElement>(selector)!;
			const rect = node.getBoundingClientRect();
			return {
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom,
				width: rect.width
			};
		};
		return {
			header: box('.vega-block-header'),
			toggle: box('.vega-block-toggle'),
			title: box('.vega-block-title'),
			type: box('.vega-block-type'),
			remove: box('.vega-block-delete')
		};
	});
	const { header, toggle, title, type, remove } = geometry;
	await test.info().attach('geometría de cabecera', {
		body: JSON.stringify({ viewport: row.page().viewportSize(), geometry }),
		contentType: 'application/json'
	});
	expect(title.width).toBeGreaterThan(48);
	for (const content of [title, type, remove]) {
		expect(content.left).toBeGreaterThanOrEqual(header.left);
		expect(content.right).toBeLessThanOrEqual(header.right + 1);
	}
	expect(type.right).toBeLessThanOrEqual(toggle.right + 1);
	expect(
		type.right <= remove.left ||
			type.left >= remove.right ||
			type.bottom <= remove.top ||
			type.top >= remove.bottom
	).toBe(true);
	await expect(row.locator('.vega-block-delete')).toBeEnabled();
}

/** Usa las mismas rutas de edición que una persona: configuración y formulario embebido. */
async function prepareLongContent(page: Page): Promise<void> {
	await loginAsDemo(page, { seedShowcase: true });
	await page.goto('/settings');
	const manifestInput = page.locator('#manifest-editor-textarea');
	await expect(manifestInput).toBeVisible();
	const manifest = JSON.parse(await manifestInput.inputValue());
	manifest.blockTypes.portada.label = 'Llamada a la acción';
	await manifestInput.fill(JSON.stringify(manifest, null, 2));
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(page.getByText('Manifiesto guardado.', { exact: true })).toBeVisible();
	await page.locator('a[href="/c/paginas"]').first().click();
	await page.locator('a[href="/c/paginas/pagina_1"]').first().click();
	for (const id of ['seccion_1', 'seccion_3']) {
		const toggle = page.locator(`[aria-controls="vega-block-body-${id}"]`);
		await toggle.click();
		const body = page.locator(`#vega-block-body-${id}`);
		await body.locator('[data-field="heading"] input').fill(`${LONG_TITLE} · ${id}`);
		await body.getByRole('button', { name: 'Guardar', exact: true }).click();
		await expect(body.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
		await toggle.click();
	}
}

test('tipo y título largos siguen visibles y Borrar queda accesible a 390 y 1440 px', async ({
	page
}) => {
	await prepareLongContent(page);
	for (const width of [390, 1440]) {
		await page.setViewportSize({ width, height: 1000 });
		for (const mode of ['light', 'dark']) {
			await page.evaluate((value) => (document.documentElement.dataset.mode = value), mode);
			for (const [id, label] of [
				['seccion_1', 'Llamada a la acción'],
				['seccion_3', 'Galería']
			]) {
				const toggle = page.locator(`[aria-controls="vega-block-body-${id}"]`);
				const row = page.locator('.vega-block-row').filter({ has: toggle });
				await expect(row.locator('.vega-block-type')).toHaveText(label);
				await expect(row.locator('.vega-block-title')).toContainText(LONG_TITLE);
				await expectReadableHeader(row);
				await toggle.focus();
				await page.keyboard.press('Enter');
				await expect(toggle).toHaveAttribute('aria-expanded', 'true');
				await expect(page.locator(`#vega-block-body-${id}`)).toBeVisible();
				await expectReadableHeader(row);
				await page.keyboard.press('Enter');
				await expect(toggle).toHaveAttribute('aria-expanded', 'false');
				await row.locator('.vega-block-delete').click();
				await expect(page.getByRole('alertdialog')).toBeVisible();
				await page
					.getByRole('alertdialog')
					.getByRole('button', { name: 'Cancelar', exact: true })
					.click();
			}
			await page.screenshot({
				path: test.info().outputPath(`cabeceras-${width}-${mode}.png`),
				fullPage: true
			});
		}
	}
	// La presentación estrecha conserva el asa real y su reorden por teclado.
	await page.setViewportSize({ width: 390, height: 1000 });
	const firstHandle = page.locator('.vega-block-row').first().locator('.vega-block-handle');
	await firstHandle.focus();
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('.vega-block-row').first().locator('.vega-block-type')).toHaveText(
		'Texto'
	);
	await page
		.locator('.vega-block-row')
		.nth(1)
		.locator('.vega-block-handle')
		.dragTo(page.locator('.vega-block-row').first().locator('.vega-block-header'));
	await expect(page.locator('.vega-block-row').first().locator('.vega-block-type')).toHaveText(
		'Llamada a la acción'
	);
});
