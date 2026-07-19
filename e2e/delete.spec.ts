/**
 * Suite de la Fase 4e del contrato P4 (L-P4.11, D-P4.7, Audit H6, L-P4.9): el borrado de
 * registros desde `/c/[type]`. Contra la semilla enriquecida de `session/demo-seed.ts` (misma
 * base que `list.spec.ts`, ver su cabecera): `posts` (32 registros, 2 páginas), `pages`
 * (readonly, sin registros).
 *
 * Confirmación (`DeleteConfirm.svelte`) SIEMPRE de por medio, `role="alertdialog"`, cancelable
 * con `Esc`/"Cancelar" — ningún test de esta suite llama a `port.delete` sin pasar por ella.
 *
 * **"Borrar" oculto hasta hover/foco (R3 del rediseño C2)**: el botón sigue en el DOM/orden de
 * tabulación (`opacity`, nunca `display:none`), pero cada test que lo clica hace `row.hover()`
 * antes — fiel al gesto real (a diferencia de un click síncrono de Playwright, que ignora
 * `opacity` y clicaría igual sin hover; el hover previo documenta el comportamiento esperado).
 *
 * El bloque "estado deleting en vuelo" (fix de code-review) usa la afordance de test
 * `__VEGA_DELETE_DELAY_MS__` (`session/backend.ts`) para abrir una ventana FIABLE en la que
 * ejercer `deleting=true` con acciones reales de Playwright — sin ella, `memory` resuelve casi al
 * instante y la ventana es demasiado corta para simular la carrera de forma determinista.
 */
import { expect, loginAsDemo, test } from './fixtures';

async function loginAndSettle(page: import('@playwright/test').Page): Promise<void> {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
}

test.describe('borrar con confirmación (L-P4.11)', () => {
	test('borrar un registro: desaparece de la tabla y muestra un toast de éxito', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const row = page.locator('tbody tr', { hasText: 'Bienvenido a Vega' });
		await expect(row).toBeVisible();

		// "Borrar" está oculto hasta hover/foco de la fila (R3 del rediseño C2, decisión de David):
		// el hover es lo que lo revela antes de poder clicarlo.
		await row.hover();
		await row.getByRole('button', { name: 'Borrar "Bienvenido a Vega"' }).click();

		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();
		// La confirmación dice QUÉ se borra (D-P4.7): el mismo texto de la celda-título.
		await expect(dialog).toContainText('Bienvenido a Vega');
		// Foco inicial en el control SEGURO ("Cancelar"), nunca en "Borrar".
		await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();

		await dialog.getByRole('button', { name: 'Borrar', exact: true }).click();

		await expect(dialog).toBeHidden();
		await expect(page.getByText('"Bienvenido a Vega" se ha borrado.')).toBeVisible();
		await expect(page.locator('tbody tr', { hasText: 'Bienvenido a Vega' })).toHaveCount(0);
		// Un registro menos: 31 en vez de 32 (misma página, sin retroceso — quedan de sobra en la 1).
		await expect(page.locator('.vega-pagination-status')).toContainText('31 registros');
	});

	test('cancelar (botón "Cancelar") no borra nada', async ({ page }) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const row = page.locator('tbody tr', { hasText: 'Bienvenido a Vega' });
		await row.hover();
		await row.getByRole('button', { name: 'Borrar "Bienvenido a Vega"' }).click();

		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Cancelar' }).click();

		await expect(dialog).toBeHidden();
		await expect(row).toBeVisible();
		await expect(page.locator('.vega-pagination-status')).toContainText('32 registros');
	});

	test('cancelar con Esc tampoco borra nada', async ({ page }) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const row = page.locator('tbody tr', { hasText: 'Bienvenido a Vega' });
		await row.hover();
		await row.getByRole('button', { name: 'Borrar "Bienvenido a Vega"' }).click();

		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();
		await page.keyboard.press('Escape');

		await expect(dialog).toBeHidden();
		await expect(row).toBeVisible();
	});
});

test.describe('borrar la última fila de una página > 1 retrocede (L-P4.13, reload())', () => {
	test('vaciar la página 2 de posts redirige a la página con datos', async ({ page }) => {
		await loginAndSettle(page);
		await page.goto('/c/posts?page=2');

		// Página 2 de 32 registros / 30 por página: exactamente 2 filas (§4c, sin desempatar por
		// título — el orden por defecto de `memory` es por id, L-P4.2 — así que se opera por
		// posición, no por texto: el título concreto de esas dos filas no importa para este test).
		const status = page.locator('.vega-pagination-status');
		await expect(page.locator('[data-pagination] [aria-current="page"]')).toHaveText('2');
		await expect(page.locator('tbody tr')).toHaveCount(2);

		// Primer borrado: la página 2 queda con 1 fila, sigue siendo una página válida (sin retroceso).
		// "Borrar" oculto hasta hover/foco (R3): la fila se hover primero.
		const firstRow = page.locator('tbody tr').first();
		await firstRow.hover();
		await firstRow.getByRole('button', { name: /^Borrar/ }).click();
		await page
			.getByRole('alertdialog')
			.getByRole('button', { name: 'Borrar', exact: true })
			.click();
		await expect(page.getByRole('alertdialog')).toBeHidden();
		await expect(page).toHaveURL(/\/c\/posts\?page=2$/);
		await expect(page.locator('tbody tr')).toHaveCount(1);

		// Segundo borrado: la página 2 queda VACÍA (`items: []`, `totalItems: 30 > 0`) — el mismo
		// `$effect` de "página fuera de rango" de 4c/L-P4.13 retrocede a la 1, sin lógica nueva.
		const remainingRow = page.locator('tbody tr').first();
		await remainingRow.hover();
		await remainingRow.getByRole('button', { name: /^Borrar/ }).click();
		await page
			.getByRole('alertdialog')
			.getByRole('button', { name: 'Borrar', exact: true })
			.click();
		await expect(page.getByRole('alertdialog')).toBeHidden();

		await expect(page).toHaveURL(/\/c\/posts$/);
		await expect(page.locator('[data-pagination] [aria-current="page"]')).toHaveText('1');
		await expect(status).toContainText('30 registros');
		await expect(page.locator('[data-list-state="ready"]')).toBeVisible();
		await expect(page.locator('[data-list-state="empty-collection"]')).toHaveCount(0);
	});
});

test.describe('estado "deleting" en vuelo (fix de code-review de 4e)', () => {
	test('el trap de foco sigue intacto y una segunda petición de borrado se ignora', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		// Retrasa `delete()` lo suficiente (afordance de test, `__VEGA_DELETE_DELAY_MS__`) para
		// poder ejercer el estado `deleting` con acciones REALES de Playwright — sin esto, `memory`
		// resuelve casi al instante y la ventana es demasiado corta para ser fiable (ver cabecera
		// de `session/backend.ts`). Fijado DESPUÉS del `goto` (mismo motivo que el flag de red en
		// `list.spec.ts`): `page.goto()` es una navegación de DOCUMENTO real, que recrea `window` y
		// se llevaría por delante cualquier flag fijado antes.
		await page.evaluate(() => {
			(window as unknown as { __VEGA_DELETE_DELAY_MS__?: number }).__VEGA_DELETE_DELAY_MS__ = 600;
		});

		const rowA = page.locator('tbody tr', { hasText: 'Bienvenido a Vega' });
		await rowA.hover();
		await rowA.getByRole('button', { name: 'Borrar "Bienvenido a Vega"' }).click();

		const dialog = page.getByRole('alertdialog');
		// Locator ESTABLE por clase (no por nombre accesible: ese cambia de "Borrar" a "Borrando…"
		// en cuanto `deleting` pasa a `true`, y un locator por `name` filtrado queda obsoleto).
		const confirmButton = dialog.locator('.vega-delete-confirm');
		await confirmButton.click();

		// `deleting=true`: el botón de confirmar cambia de texto (y `aria-disabled`), pero el
		// diálogo sigue abierto y sus DOS botones siguen siendo tabbable (fix: nunca `disabled`
		// HTML, ver `DeleteConfirm.svelte`).
		await expect(confirmButton).toHaveText('Borrando…');
		await expect(confirmButton).toHaveAttribute('aria-disabled', 'true');

		// `Tab` cicla DENTRO del diálogo (solo 2 controles): si el foco escapase, este `Tab` lo
		// dejaría en el primer elemento tabbable de `+page.svelte` (p.ej. el input de búsqueda de
		// la toolbar), nunca en "Cancelar".
		await page.keyboard.press('Tab');
		await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();

		// Defensa en profundidad de `requestDelete()` en `+page.svelte`: un click FORZADO (bypass
		// del backdrop, que en uso real ya bloquea esto) en el botón de OTRA fila no debe reescribir
		// `pendingDelete` mientras el primer borrado sigue en vuelo — el diálogo sigue hablando de
		// "Bienvenido a Vega", nunca de la otra fila.
		const rowB = page.locator('tbody tr', { hasText: 'Borrador en curso' });
		await rowB.getByRole('button', { name: /^Borrar/ }).click({ force: true });
		await expect(dialog).toContainText('Bienvenido a Vega');
		await expect(dialog).not.toContainText('Borrador en curso');
		await expect(rowB).toBeVisible(); // la fila B, ajena al borrado en vuelo, ni se tocó

		// El retraso termina, el borrado A se completa con normalidad.
		await expect(dialog).toBeHidden({ timeout: 2000 });
		await expect(page.getByText('"Bienvenido a Vega" se ha borrado.')).toBeVisible();
		await expect(rowA).toHaveCount(0);

		await page.evaluate(() => {
			(window as unknown as { __VEGA_DELETE_DELAY_MS__?: number }).__VEGA_DELETE_DELAY_MS__ = 0;
		});
	});
});

test.describe('tipo readonly: sin botón de borrar (L-P4.9)', () => {
	test('pages (readonly) nunca ofrece un botón de borrado', async ({ page }) => {
		await loginAndSettle(page);
		await page.goto('/c/pages');

		// `pages` es readonly y ya lleva la insignia "Solo lectura" en la cabecera (§4.1); ningún
		// control de borrado existe en su ruta, contraste directo con `posts` (arriba), que SÍ los
		// pinta por fila (`data-action="delete"`, ver `RecordTable.svelte`).
		await expect(page.locator('.vega-list-readonly-badge')).toHaveText('Solo lectura');
		await expect(page.locator('[data-action="delete"]')).toHaveCount(0);
		await expect(page.getByRole('button', { name: /^Borrar/ })).toHaveCount(0);
	});
});

test.describe('borrado que falla (afordance de test, L-P4.4/Audit H6)', () => {
	test('un fallo de "port.delete" se reporta en el banner global y la fila sigue en la tabla', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		await page.evaluate(() => {
			(window as unknown as { __VEGA_FORCE_DELETE_ERROR__?: boolean }).__VEGA_FORCE_DELETE_ERROR__ =
				true;
		});

		const row = page.locator('tbody tr', { hasText: 'Bienvenido a Vega' });
		await row.hover();
		await row.getByRole('button', { name: 'Borrar "Bienvenido a Vega"' }).click();
		await page
			.getByRole('alertdialog')
			.getByRole('button', { name: 'Borrar', exact: true })
			.click();

		// El error de una MUTACIÓN va por `reportError` (banner global), NUNCA por el estado
		// `error` propio del listado (ese es solo para fallos de CARGA, L-P4.4).
		const banner = page.locator('.vega-global-banner');
		await expect(banner).toBeVisible();
		await expect(banner).toHaveAttribute('role', 'alert');
		await expect(banner).toContainText('referenciado');
		await expect(page.locator('[data-list-state="error"]')).toHaveCount(0);

		// El diálogo se cierra, pero la fila NUNCA se quitó de forma optimista: sigue ahí.
		await expect(page.getByRole('alertdialog')).toBeHidden();
		await expect(row).toBeVisible();
		await expect(page.locator('.vega-pagination-status')).toContainText('32 registros');

		await page.evaluate(() => {
			(window as unknown as { __VEGA_FORCE_DELETE_ERROR__?: boolean }).__VEGA_FORCE_DELETE_ERROR__ =
				false;
		});
	});
});
