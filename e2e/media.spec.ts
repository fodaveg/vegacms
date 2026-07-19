/**
 * Suite del bootstrap de `/media` (contrato P6 §9, Fase 6a) contra el adaptador `memory`
 * sembrado (ver `e2e/fixtures.ts`, `src/lib/session/demo-seed.ts`): la semilla NUNCA incluye
 * `vega_media`, así que esta ruta siempre aterriza en `collectionState: 'creatable'` (memory
 * tiene `schemaBootstrap: true`) — el mismo patrón de bootstrap que `e2e/settings.spec.ts` ejerce
 * para la colección `vega`. Reemplaza el viejo test de placeholder honesto (pre-P6), que vivía en
 * `routes.spec.ts`.
 */
import { expect, loginAsDemo, test } from './fixtures';

async function goToMedia(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('link', { name: 'Medios', exact: false }).click();
	await page.waitForURL('**/media');
}

test.describe('/media bootstrap de "vega_media" (§9 del contrato P6, Fase 6a)', () => {
	test('sin "vega_media": estado creatable → confirmar → biblioteca vacía', async ({ page }) => {
		await loginAsDemo(page);
		await page.waitForURL('**/c/site_info/new');
		await goToMedia(page);

		// Estado 'creatable': el marco todavía no es la biblioteca, solo el gate.
		const creatableFrame = page.locator('[data-media-state="creatable"]');
		await expect(creatableFrame).toBeVisible();

		await page.getByRole('button', { name: 'Crear colección de medios' }).click();

		// Confirmación INLINE (nunca window.confirm): pide continuar antes de tocar el puerto.
		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('vega_media');

		await dialog.getByRole('button', { name: 'Crear colección', exact: true }).click();

		// Tras confirmar: `ensureMediaCollection` crea la colección y el estado pasa a 'present'
		// con el marco de biblioteca VACÍA (grid real = 6b, fuera de alcance de esta fase).
		await expect(dialog).not.toBeVisible();
		const presentFrame = page.locator('[data-media-state="present"]');
		await expect(presentFrame).toBeVisible();
		await expect(presentFrame).toContainText('La biblioteca de medios está vacía');

		// Navegar fuera y volver (SPA, sin recargar documento) confirma que la colección quedó
		// creada de verdad en ESTE backend: ya no se vuelve a pedir el gate de confirmación. Un
		// hard reload no sirve de prueba aquí: el adaptador `memory` de esta demo no persiste
		// entre recargas por diseño (misma nota que `e2e/settings.spec.ts`), así que recargaría
		// un backend nuevo, sembrado desde cero, sin `vega_media`.
		await page.getByRole('link', { name: 'Información del sitio' }).click();
		await page.waitForURL('**/c/site_info/new');
		await goToMedia(page);
		await expect(page.locator('[data-media-state="present"]')).toBeVisible();
	});

	test('cancelar la confirmación no crea nada: sigue en creatable', async ({ page }) => {
		await loginAsDemo(page);
		await page.waitForURL('**/c/site_info/new');
		await goToMedia(page);

		await page.getByRole('button', { name: 'Crear colección de medios' }).click();
		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();

		await dialog.getByRole('button', { name: 'Cancelar' }).click();
		await expect(dialog).not.toBeVisible();
		await expect(page.locator('[data-media-state="creatable"]')).toBeVisible();
	});
});

/**
 * Suite del grid + detalle de `vega_media` (contrato P6, Fase 6b): contra `DEMO_SEED_WITH_MEDIA`
 * (`session/demo-seed.ts`), sembrada vía `loginAsDemo(page, { seedMedia: true })` — la colección ya
 * existe, con 3 assets (1 pdf + 2 imágenes, `created` escalonado), así que estas pruebas aterrizan
 * directo en `'present'` sin pasar por el gate de bootstrap (ya cubierto por la suite de arriba).
 */
test.describe('/media grid + detalle (contrato P6, Fase 6b)', () => {
	async function goToMediaWithSeed(page: import('@playwright/test').Page): Promise<void> {
		await loginAsDemo(page, { seedMedia: true });
		await page.waitForURL('**/c/site_info/new');
		await goToMedia(page);
	}

	test('el grid pinta los 3 assets sembrados, ordenados por "created" desc', async ({ page }) => {
		await goToMediaWithSeed(page);

		await expect(page.locator('[data-media-grid-state="ready"]')).toBeVisible();
		const cells = page.locator('[data-media-item]');
		await expect(cells).toHaveCount(3);
		// `media_3` es el más reciente (creado el 03), `media_1` (el pdf) el más antiguo (el 01).
		await expect(cells.nth(0)).toHaveAttribute('data-media-item', 'media_3');
		await expect(cells.nth(1)).toHaveAttribute('data-media-item', 'media_2');
		await expect(cells.nth(2)).toHaveAttribute('data-media-item', 'media_1');
	});

	test('el pdf pinta un icono por tipo, nunca un <img> roto', async ({ page }) => {
		await goToMediaWithSeed(page);

		const pdfCell = page.locator('[data-media-item="media_1"]');
		await expect(pdfCell).toHaveAttribute('data-media-kind', 'other');
		await expect(pdfCell.locator('img')).toHaveCount(0);
		await expect(pdfCell.locator('svg')).toBeVisible();
	});

	test('la imagen sembrada degrada a <img> (memory: capabilities.thumbs === false)', async ({
		page
	}) => {
		await goToMediaWithSeed(page);

		const imageCell = page.locator('[data-media-item="media_2"]');
		await expect(imageCell).toHaveAttribute('data-media-kind', 'image');
		await expect(imageCell.locator('img')).toBeVisible();
	});

	test('abrir el detalle, editar "alt" y guardar persiste: reabrir lo confirma', async ({
		page
	}) => {
		await goToMediaWithSeed(page);

		await page.locator('[data-media-item="media_3"]').click();
		const dialog = page.getByRole('dialog', { name: 'Editar medio' });
		await expect(dialog).toBeVisible();

		await dialog.getByLabel('Texto alternativo').fill('Nuevo texto alternativo');
		await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
		await expect(dialog).not.toBeVisible();

		// Reabrir (mismo backend en memoria, SPA, sin recargar documento) confirma que el guardado
		// persistió de verdad: el panel se rehidrata con el registro actualizado.
		await page.locator('[data-media-item="media_3"]').click();
		await expect(
			page.getByRole('dialog', { name: 'Editar medio' }).getByLabel('Texto alternativo')
		).toHaveValue('Nuevo texto alternativo');
	});

	test('cerrar sin guardar tras editar pide confirmar (mismo guard que RecordForm)', async ({
		page
	}) => {
		await goToMediaWithSeed(page);

		await page.locator('[data-media-item="media_2"]').click();
		const dialog = page.getByRole('dialog', { name: 'Editar medio' });
		await dialog.getByLabel('Texto alternativo').fill('Cambio sin guardar');

		page.once('dialog', (confirmDialog) => void confirmDialog.dismiss());
		await dialog.getByRole('button', { name: 'Cancelar' }).click();
		// `dismiss()` del `window.confirm` nativo = "quedarse": el diálogo de Vega sigue abierto.
		await expect(dialog).toBeVisible();

		page.once('dialog', (confirmDialog) => void confirmDialog.accept());
		await dialog.getByRole('button', { name: 'Cancelar' }).click();
		await expect(dialog).not.toBeVisible();
	});

	test('un fallo de list("vega_media") pinta "Reintentar" EN CONTEXTO, no en el banner global', async ({
		page
	}) => {
		await goToMediaWithSeed(page);
		await expect(page.locator('[data-media-grid-state="ready"]')).toBeVisible();

		// `__VEGA_FORCE_MEDIA_LIST_ERROR__` (acotado a `list('vega_media', …)`, ver `session/
		// backend.ts`): a diferencia de `__VEGA_FORCE_NETWORK_ERROR__`, no tumba el `listContentTypes()`
		// que `/media/+page.svelte` repite en CADA montaje (Fase 6a) — necesario para poder remontar
		// `/media` (navegar fuera y volver) sin que el marco ENTERO caiga a `status: 'error'` antes de
		// llegar al estado que esta prueba quiere ejercer (el de la rejilla en concreto).
		await page.evaluate(() => {
			(
				window as unknown as { __VEGA_FORCE_MEDIA_LIST_ERROR__?: boolean }
			).__VEGA_FORCE_MEDIA_LIST_ERROR__ = true;
		});
		// Fuerza una carga NUEVA del grid: navegar fuera y volver remonta `/media` (mismo patrón que
		// `e2e/list.spec.ts`, "error de transporte en el listado").
		await page.getByRole('link', { name: 'Información del sitio' }).click();
		await page.waitForURL('**/c/site_info/new');
		await goToMedia(page);

		const state = page.locator('[data-media-grid-state="error"]');
		await expect(state).toBeVisible();
		await expect(state).toHaveAttribute('role', 'alert');
		await expect(state.getByRole('button', { name: 'Reintentar' })).toBeVisible();
		await expect(page.locator('.vega-global-banner')).toHaveCount(0);

		await page.evaluate(() => {
			(
				window as unknown as { __VEGA_FORCE_MEDIA_LIST_ERROR__?: boolean }
			).__VEGA_FORCE_MEDIA_LIST_ERROR__ = false;
		});
		await state.getByRole('button', { name: 'Reintentar' }).click();
		await expect(page.locator('[data-media-grid-state="ready"]')).toBeVisible();
	});
});
