/**
 * Suite de la Fase 4c del contrato P4 (§5): la tabla READ-ONLY montada en `/c/[type]` — columnas
 * y filas reales, enlace de título, paginación (Anterior/Siguiente + deep-link), estados
 * vacío-colección (con/sin CTA "Crear") y error de transporte EN CONTEXTO. Contra la semilla
 * enriquecida de `session/demo-seed.ts` (`posts` 32 registros para paginación, `pages` readonly
 * SIN registros, `authors` normal SIN registros, `metrics` normal SIN campo título resoluble —
 * ver la cabecera de ese fichero).
 *
 * SIN orden/búsqueda (4d) ni borrado (4e): esta suite no los ejercita porque `/c/[type]` no los
 * pinta todavía. `routes.spec.ts` sigue cubriendo que un singleton (`site_info`) nunca cae en esta
 * rama de listado.
 *
 * Suites `fila siempre abrible sin titleField` y `página fuera de rango`: fixes de code-review de
 * 4c (L-P4.15 y L-P4.13 respectivamente, ver `RecordTable.svelte`/`+page.svelte`).
 */
import { expect, loginAsDemo, test } from './fixtures';

async function loginAndSettle(page: import('@playwright/test').Page): Promise<void> {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
}

test.describe('tabla poblada (posts, §4c)', () => {
	test('pinta las columnas y las filas reales, con la celda-título como enlace', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const table = page.locator('[data-list-state="ready"]');
		await expect(table).toBeVisible();

		// Columnas: `listFields` por defecto de "posts" (title/status/body, sin overrides en el
		// manifiesto de la semilla) — labels humanizados por P2 (§4.8), no traducidos por `t()`.
		// Se localizan por texto de celda (no por accessible name vía rol): la cabecera usa
		// `text-transform: uppercase` en CSS, y el cómputo de accessible-name de Chromium refleja
		// ese transform — `hasText` compara contra el texto del DOM, sin ese efecto.
		const headers = table.locator('thead th');
		await expect(headers.filter({ hasText: 'Title' })).toBeVisible();
		await expect(headers.filter({ hasText: 'Status' })).toBeVisible();
		await expect(headers.filter({ hasText: 'Body' })).toBeVisible();

		// La celda-título del registro seed "Bienvenido a Vega" es un enlace real (L-P4.15).
		await expect(page.getByRole('link', { name: 'Bienvenido a Vega' })).toBeVisible();
	});

	test('el enlace de título abre el detalle (nav.toRecord)', async ({ page }) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		await page.getByRole('link', { name: 'Bienvenido a Vega' }).click();
		await page.waitForURL('**/c/posts/post_1');
	});

	test('la columna de estado pinta una insignia para los literales draft/published (D-P4.8)', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		await expect(page.locator('.vega-status-badge[data-status="published"]').first()).toBeVisible();
		await expect(page.locator('.vega-status-badge[data-status="draft"]').first()).toBeVisible();
	});
});

test.describe('paginación (D-P4.5, L-P4.10/L-P4.13)', () => {
	test('Anterior/Siguiente navegan, reflejan la página en la URL y actualizan "{page} de {totalPages}"', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		// 32 registros seed / perPage 30 (DEFAULT_PER_PAGE) = 2 páginas.
		const status = page.locator('.vega-pagination-status');
		await expect(status).toContainText('1 de 2');
		await expect(status).toContainText('32 registros');
		await expect(page.getByRole('button', { name: 'Anterior' })).toBeDisabled();

		await page.getByRole('button', { name: 'Siguiente' }).click();
		await expect(page).toHaveURL(/\/c\/posts\?page=2$/);
		await expect(status).toContainText('2 de 2');
		await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Anterior' })).toBeEnabled();

		await page.getByRole('button', { name: 'Anterior' }).click();
		// Página 1 es el default: `viewStateToParams` no escribe `?page=1` (D-P4.9, URLs limpias).
		await expect(page).toHaveURL(/\/c\/posts$/);
		await expect(status).toContainText('1 de 2');
	});

	test('deep-link directo a /c/posts?page=2 reconstruye la vista tras recarga (L-P4.13)', async ({
		page
	}) => {
		await loginAndSettle(page);

		await page.goto('/c/posts?page=2');

		const state = page.locator('[data-list-state="ready"]');
		await expect(state).toBeVisible();
		await expect(page.locator('.vega-pagination-status')).toContainText('2 de 2');
	});
});

test.describe('vacío-colección (§4c)', () => {
	test('authors (normal, sin registros) muestra el vacío CON la CTA "Crear", que navega a .../new', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/authors');

		const state = page.locator('[data-list-state="empty-collection"]');
		await expect(state).toBeVisible();
		await expect(state).not.toHaveAttribute('role', 'alert');

		const cta = state.getByRole('button', { name: 'Crear' });
		await expect(cta).toBeVisible();
		await cta.click();
		await page.waitForURL('**/c/authors/new');
	});

	test('pages (readonly, sin registros) muestra el vacío SIN la CTA "Crear"', async ({ page }) => {
		await loginAndSettle(page);
		await page.goto('/c/pages');

		const state = page.locator('[data-list-state="empty-collection"]');
		await expect(state).toBeVisible();
		await expect(state.getByRole('button', { name: 'Crear' })).toHaveCount(0);
	});

	test('posts (poblado) NO cae en el estado vacío-colección', async ({ page }) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		await expect(page.locator('[data-list-state="ready"]')).toBeVisible();
		await expect(page.locator('[data-list-state="empty-collection"]')).toHaveCount(0);
	});
});

test.describe('error de transporte en el listado (L-P4.4, Audit H2)', () => {
	test('un fallo de red en list() se pinta EN CONTEXTO con "Reintentar", no en el banner global', async ({
		page
	}) => {
		await loginAndSettle(page);

		await page.evaluate(() => {
			(
				window as unknown as { __VEGA_FORCE_NETWORK_ERROR__?: boolean }
			).__VEGA_FORCE_NETWORK_ERROR__ = true;
		});
		await page.getByRole('link', { name: 'Entradas' }).click();
		await page.waitForURL('**/c/posts');

		const state = page.locator('[data-list-state="error"]');
		await expect(state).toBeVisible();
		await expect(state).toHaveAttribute('role', 'alert');
		await expect(state.getByRole('button', { name: 'Reintentar' })).toBeVisible();

		// NUNCA en el banner global compartido (L-P4.4): `GlobalBanner.svelte` (`.vega-global-banner`)
		// sigue sin aparecer. Se localiza por su clase, no por texto: el propio estado local
		// también contiene "Sin conexión con el backend" (es `err.message`, interpolado en
		// `list.error.body`), así que un filtro por texto sobre CUALQUIER `role="alert"` sería
		// ambiguo entre los dos.
		await expect(page.locator('.vega-global-banner')).toHaveCount(0);

		await page.evaluate(() => {
			(
				window as unknown as { __VEGA_FORCE_NETWORK_ERROR__?: boolean }
			).__VEGA_FORCE_NETWORK_ERROR__ = false;
		});
		await state.getByRole('button', { name: 'Reintentar' }).click();

		await expect(page.locator('[data-list-state="ready"]')).toBeVisible();
	});
});

test.describe('fila siempre abrible sin titleField (L-P4.15, fix de code-review)', () => {
	test('metrics (sin campo título resoluble) igual abre el detalle desde su fila', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/metrics');

		const table = page.locator('[data-list-state="ready"]');
		await expect(table).toBeVisible();

		// Ni "count" ni "active" son text/email/url: la cascada de título (P2 §4.4) se agota a
		// `null` y `RecordTable` cae al fallback de la primera columna con el texto i18n
		// `list.untitled` (el valor numérico/booleano de esa columna no es texto, así que
		// `resolveTitleCellText` también cae al fallback ahí) — pero la fila SIGUE siendo un
		// enlace real.
		const openLink = table.getByRole('link', { name: '(sin título)' });
		await expect(openLink).toBeVisible();
		await openLink.click();
		await page.waitForURL('**/c/metrics/metric_1');
	});
});

test.describe('página fuera de rango (L-P4.13, fix de code-review)', () => {
	test('un deep-link a ?page=99 redirige a la última página válida, no al vacío-colección', async ({
		page
	}) => {
		await loginAndSettle(page);

		await page.goto('/c/posts?page=99');

		// 32 registros / 30 por página = 2 páginas válidas: aterriza en la 2, con datos reales y
		// paginación para volver — nunca en el vacío-colección (habría datos en otra página).
		await expect(page).toHaveURL(/\/c\/posts\?page=2$/);
		const table = page.locator('[data-list-state="ready"]');
		await expect(table).toBeVisible();
		await expect(page.locator('[data-list-state="empty-collection"]')).toHaveCount(0);
		await expect(page.locator('.vega-pagination-status')).toContainText('2 de 2');
	});
});
