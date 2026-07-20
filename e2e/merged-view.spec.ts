/**
 * Suite L7c+L7d (roadmap `mergedViews`, P2 §mergedViews): la ruta `/v/[view]` + `MergedViewTable`
 * contra la vista fusionada de demo `mergedViews.catalogo` (`works`+`tracks`, ver la cabecera de
 * `session/demo-seed.ts` para el detalle del fixture — dos colecciones mínimas con un campo `order`
 * intercalado a propósito, work_1=1/track_1=2/work_2=3/track_2=4).
 *
 * L7c: navegar desde la sidebar, ver filas de AMBAS colecciones mezcladas con su insignia de tipo,
 * y que un enlace de fila abra el editor REAL del registro correcto (el aviso de truncado en
 * profundidad queda para L7e).
 *
 * **Añadido en L7d**: arrastrar/teclear el asa de una fila reordena el conjunto MEZCLADO y persiste
 * en AMBAS colecciones (`ctx.port.update`, uno por registro cuyo `orderField` cambió) — verificado
 * con un round-trip DISTINTO al `reload()` que ya dispara el propio drop (mismo criterio que
 * `e2e/form.spec.ts`, "recargar = reset" del adaptador `memory`: se navega DENTRO de la SPA a otra
 * colección y de vuelta, NUNCA `page.reload()`/`page.goto()`, para no perder el `DEMO_SEED` en un
 * realm JS nuevo). El drag de Playwright usa `locator.dragTo()` (arrastre HTML5 nativo real, no
 * solo eventos de ratón) sobre el asa (`aria-label` `list.reorder.handleLabel`) y la fila destino.
 */
import { expect, loginAsDemo, test } from './fixtures';

test('navega a la vista fusionada desde la sidebar y mezcla filas de las dos colecciones', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	const sidebar = page.getByRole('navigation', { name: 'Navegación principal' });
	await sidebar.getByRole('link', { name: 'Catálogo' }).click();
	await page.waitForURL('**/v/catalogo');

	await expect(page.getByRole('heading', { name: 'Catálogo', level: 1 })).toBeVisible();

	// Las 4 filas de las DOS colecciones, ya fusionadas y ordenadas por `order` (L7b): ninguna
	// concatenación por colección, work_1/track_1/work_2/track_2 intercalados.
	const rows = page.locator('tbody tr');
	await expect(rows).toHaveCount(4);
	await expect(rows.nth(0)).toContainText('Sinfonía nº1');
	await expect(rows.nth(1)).toContainText('Pista A');
	await expect(rows.nth(2)).toContainText('Concierto en Re');
	await expect(rows.nth(3)).toContainText('Pista B');

	// Insignia de tipo (`row.source.label`, L7a) de cada colección, dos de cada.
	await expect(page.locator('.vega-type-badge', { hasText: 'Obra' })).toHaveCount(2);
	await expect(page.locator('.vega-type-badge', { hasText: 'Pista' })).toHaveCount(2);
});

test('un enlace de fila abre el editor real del registro correcto', async ({ page }) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	await page.goto('/v/catalogo');
	await expect(page.getByRole('heading', { name: 'Catálogo', level: 1 })).toBeVisible();

	await page.getByRole('link', { name: 'Sinfonía nº1' }).click();
	await page.waitForURL('**/c/works/work_1');
	await expect(page.getByRole('heading', { name: 'Editar «Obra»' })).toBeVisible();

	await page.goBack();
	await page.waitForURL('**/v/catalogo');
	await page.getByRole('link', { name: 'Pista B' }).click();
	await page.waitForURL('**/c/tracks/track_2');
	await expect(page.getByRole('heading', { name: 'Editar «Pista»' })).toBeVisible();
});

test('un id de vista desconocido resuelve a not-found en contexto, sin redirigir a /login', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	await page.goto('/v/no-existe');

	const state = page.getByRole('alert').filter({ hasText: 'Vista no encontrada' });
	await expect(state).toBeVisible();
	await expect(state).toHaveAttribute('data-route-state', 'not-found');
	await expect(page).toHaveURL(/\/v\/no-existe$/);

	await state.getByRole('button', { name: 'Volver al índice' }).click();
	await page.waitForURL('**/c/site_info/new');
});

test('arrastrar una fila reordena el conjunto mezclado cruzado y persiste en ambas colecciones', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	const sidebar = page.getByRole('navigation', { name: 'Navegación principal' });
	await sidebar.getByRole('link', { name: 'Catálogo' }).click();
	await page.waitForURL('**/v/catalogo');

	const rows = page.locator('tbody tr');
	await expect(rows).toHaveCount(4);
	await expect(rows.nth(0)).toContainText('Sinfonía nº1');
	await expect(rows.nth(1)).toContainText('Pista A');
	await expect(rows.nth(2)).toContainText('Concierto en Re');
	await expect(rows.nth(3)).toContainText('Pista B');

	// Arrastra la fila 0 (work_1, "Sinfonía nº1", colección `works`) hasta la fila 2 (work_2,
	// "Concierto en Re", TAMBIÉN `works`, pero de por medio queda track_1, `tracks`): el gesto
	// cruza colecciones en el mismo drop, exactamente lo que L7d tiene que persistir en ambas.
	const handle = page.getByRole('button', { name: 'Arrastra para reordenar "Sinfonía nº1"' });
	await handle.dragTo(rows.nth(2));

	// El drop dispara varios `port.update` (uno por registro cuyo orden cambió) + `listState.reload()`:
	// el nuevo orden mezclado (work_1 saltó de la cabeza al medio) queda estable de inmediato.
	await expect(rows.nth(0)).toContainText('Pista A');
	await expect(rows.nth(1)).toContainText('Concierto en Re');
	await expect(rows.nth(2)).toContainText('Sinfonía nº1');
	await expect(rows.nth(3)).toContainText('Pista B');

	// Persistencia REAL, no solo el estado que ya trajo el `reload()` de arriba (ver cabecera del
	// módulo): navega DENTRO de la SPA a otra colección y vuelve — un viaje redondo `list()`
	// totalmente aparte del que disparó el propio drop.
	await sidebar.getByRole('link', { name: 'Obras' }).click();
	await page.waitForURL('**/c/works');
	await sidebar.getByRole('link', { name: 'Catálogo' }).click();
	await page.waitForURL('**/v/catalogo');

	await expect(rows.nth(0)).toContainText('Pista A');
	await expect(rows.nth(1)).toContainText('Concierto en Re');
	await expect(rows.nth(2)).toContainText('Sinfonía nº1');
	await expect(rows.nth(3)).toContainText('Pista B');
});

test('el asa admite teclado (ArrowDown) con el mismo resultado que el arrastre', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	await page.goto('/v/catalogo');
	await expect(page.getByRole('heading', { name: 'Catálogo', level: 1 })).toBeVisible();

	const rows = page.locator('tbody tr');
	await expect(rows.nth(0)).toContainText('Sinfonía nº1');
	await expect(rows.nth(1)).toContainText('Pista A');

	// Con el foco en el asa de la fila 0 (work_1), `ArrowDown` la mueve una posición de inmediato
	// (sin un paso previo de "agarrar") — mismo fallback de teclado que `RecordTable` (L4),
	// reutilizado tal cual vía `reorder-dnd.ts`.
	const handle = page.getByRole('button', { name: 'Arrastra para reordenar "Sinfonía nº1"' });
	await handle.focus();
	await page.keyboard.press('ArrowDown');

	await expect(rows.nth(0)).toContainText('Pista A');
	await expect(rows.nth(1)).toContainText('Sinfonía nº1');
	await expect(rows.nth(2)).toContainText('Concierto en Re');
	await expect(rows.nth(3)).toContainText('Pista B');
});
