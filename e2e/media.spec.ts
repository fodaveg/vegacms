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
