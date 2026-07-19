/**
 * Suite de la Fase 4c del contrato P4 (§5): la tabla READ-ONLY montada en `/c/[type]` — columnas
 * y filas reales, enlace de título, paginación (Anterior/Siguiente + deep-link), estados
 * vacío-colección (con/sin CTA "Crear") y error de transporte EN CONTEXTO. Contra la semilla
 * enriquecida de `session/demo-seed.ts` (`posts` 32 registros para paginación, `pages` readonly
 * SIN registros, `authors` normal SIN registros, `metrics` normal SIN campo título resoluble —
 * ver la cabecera de ese fichero).
 *
 * SIN borrado (4e): esta suite no lo ejercita porque `/c/[type]` no lo pinta todavía.
 * `routes.spec.ts` sigue cubriendo que un singleton (`site_info`) nunca cae en esta rama de
 * listado.
 *
 * Suites `fila siempre abrible sin titleField` y `página fuera de rango`: fixes de code-review de
 * 4c (L-P4.15 y L-P4.13 respectivamente, ver `RecordTable.svelte`/`+page.svelte`).
 *
 * **Fase 4d** (búsqueda D-P4.3, filtro de estado D-P4.4, orden por cabecera D-P4.6, vacío-búsqueda
 * L-P4.12): añadida al final del fichero. Fixture: `posts` tiene EXACTAMENTE un título que
 * contiene "Bienvenido" (`post_1`), 16 registros `draft`/16 `published` (ver `demo-seed.ts`), y
 * un cuarto campo `tags` (`select` múltiple, forzado en `listFields` del manifiesto) como ÚNICA
 * columna NO escalar del listado — para poder ejercer que su cabecera no ofrece orden.
 *
 * **Fase 4f** (pulido: responsive/densidad/a11y/perf, añadida al final del fichero): `posts` gana
 * tres columnas más en `listFields` (7 en total, ver `demo-seed.ts`) para poder ejercer que la
 * tabla scrollea horizontal CONTENIDA dentro de su propio wrapper (`.vega-record-table-wrap`,
 * `overflow-x: auto` desde 4c) en vez de desbordar la página (L-P4.2/Audit H1). El resto de 4f
 * (aria-sort, foco de teclado en la cabecera ordenable, densidad vía `--row-h`/`--cell-x`) ya
 * quedaba cubierto por las suites de orden por cabecera y `e2e/density.spec.ts` — sin test nuevo
 * ahí, ver el resumen de la fase.
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

test.describe('búsqueda (D-P4.3, Fase 4d)', () => {
	test('teclear en el buscador filtra las filas, actualiza el total y refleja ?q= en la URL', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		// "Bienvenido" solo aparece en el título de `post_1` (ver cabecera del fichero): tras el
		// debounce (~300ms, `ListToolbar`), la URL/tabla convergen a un único resultado.
		await page.getByLabel('Buscar en el listado').fill('Bienvenido');
		await expect(page).toHaveURL(/\?q=Bienvenido$/);

		const table = page.locator('[data-list-state="ready"]');
		await expect(table).toBeVisible();
		await expect(table.locator('tbody tr')).toHaveCount(1);
		await expect(page.getByRole('link', { name: 'Bienvenido a Vega' })).toBeVisible();
		await expect(page.locator('.vega-pagination-status')).toContainText('1 registros');
	});
});

test.describe('filtro de estado (D-P4.4, Fase 4d)', () => {
	test('el select de estado filtra y refleja ?status= en la URL', async ({ page }) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		// 16 draft / 16 published (ver cabecera del fichero, `EXTRA_POST_RECORDS` + post_1/post_2).
		await page.getByLabel('Estado').selectOption('draft');
		await expect(page).toHaveURL(/\?status=draft$/);
		await expect(page.locator('.vega-pagination-status')).toContainText('16 registros');

		await page.getByLabel('Estado').selectOption({ label: 'Todos' });
		await expect(page).not.toHaveURL(/status=/);
		await expect(page.locator('.vega-pagination-status')).toContainText('32 registros');
	});
});

test.describe('vacío-búsqueda (L-P4.12, Fase 4d): distinto de vacío-colección', () => {
	test('0 resultados con búsqueda activa cae en empty-search (NO empty-collection), "Limpiar filtros" restaura la lista', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		await page.getByLabel('Buscar en el listado').fill('zzz-no-existe-nada');
		await expect(page).toHaveURL(/\?q=zzz-no-existe-nada$/);

		const emptySearch = page.locator('[data-list-state="empty-search"]');
		await expect(emptySearch).toBeVisible();
		await expect(page.locator('[data-list-state="empty-collection"]')).toHaveCount(0);
		// NUNCA la CTA "Crear" en vacío-búsqueda (a diferencia de vacío-colección, §4c).
		await expect(emptySearch.getByRole('button', { name: 'Crear' })).toHaveCount(0);

		await emptySearch.getByRole('button', { name: 'Limpiar filtros' }).click();
		await expect(page).not.toHaveURL(/q=/);
		await expect(page.locator('[data-list-state="ready"]')).toBeVisible();
		await expect(page.locator('.vega-pagination-status')).toContainText('32 registros');
	});

	test('búsqueda + filtro de estado combinados a 0 resultados también cae en empty-search', async ({
		page
	}) => {
		await loginAndSettle(page);
		// `post_1` ("Bienvenido a Vega") es `published`: combinado con `status=draft` no hay ningún
		// registro que case con ambos a la vez.
		await page.goto('/c/posts?q=Bienvenido&status=draft');

		await expect(page.locator('[data-list-state="empty-search"]')).toBeVisible();
	});

	test('carrera "Limpiar filtros" vs debounce pendiente: el timer viejo NO revive el q borrado (fix de code-review)', async ({
		page
	}) => {
		await loginAndSettle(page);
		// Deep-link directo a un vacío-búsqueda ya asentado (URL/estado en `q=xyzw-no-existe`, "Limpiar
		// filtros" visible de entrada) — así el tecleo siguiente arranca un SEGUNDO debounce sobre un
		// `viewState.q` externo que todavía no ha cambiado.
		await page.goto('/c/posts?q=xyzw-no-existe');
		const emptySearch = page.locator('[data-list-state="empty-search"]');
		await expect(emptySearch).toBeVisible();

		// Teclea un valor NUEVO (arranca el debounce de ~300ms) y, SIN esperarlo, pulsa "Limpiar
		// filtros" antes de que dispare.
		await page.getByLabel('Buscar en el listado').fill('otra-busqueda-nunca-emitida');
		await emptySearch.getByRole('button', { name: 'Limpiar filtros' }).click();

		// El clic gana: la URL vuelve a limpia de inmediato.
		await expect(page).not.toHaveURL(/q=/);
		await expect(page.locator('[data-list-state="ready"]')).toBeVisible();

		// Pasado el debounce (> 300ms), el timer viejo NO debe haber revivido `q=` — antes del fix,
		// `onSearch('otra-busqueda-nunca-emitida')` disparaba igualmente y navegaba de vuelta a
		// `?q=otra-busqueda-nunca-emitida`, revirtiendo silenciosamente "Limpiar filtros".
		await page.waitForTimeout(400);
		await expect(page).not.toHaveURL(/q=/);
		await expect(page.locator('[data-list-state="ready"]')).toBeVisible();
	});
});

test.describe('cambiar filtro resetea a página 1 (D-P4.9, Fase 4d)', () => {
	test('aplicar el filtro de estado desde la página 2 vuelve a la 1, sin arrastrar ?page=2', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts?page=2');
		await expect(page.locator('.vega-pagination-status')).toContainText('2 de 2');

		await page.getByLabel('Estado').selectOption('published');

		// `page` es el default (D-P4.9, URLs limpias): no se escribe `?page=1` junto a `?status=`.
		await expect(page).toHaveURL(/\/c\/posts\?status=published$/);
		await expect(page.locator('.vega-pagination-status')).toContainText('1 de 1');
	});
});

test.describe('orden por cabecera (D-P4.6, Fase 4d)', () => {
	test('clic en la cabecera "Title" cicla asc → desc → sin-orden, reordena las filas y refleja ?sort=&dir=', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const table = page.locator('[data-list-state="ready"]');
		const titleHeader = table.locator('thead th', { hasText: 'Title' });
		const titleSortButton = titleHeader.locator('button');
		const firstRow = table.locator('tbody tr').first();

		await titleSortButton.click();
		await expect(page).toHaveURL(/\?sort=title&dir=asc$/);
		await expect(titleHeader).toHaveAttribute('aria-sort', 'ascending');
		// Ascendente por codepoint (§4.6 del contrato P1, `compareValues`): "Bienvenido a Vega" es
		// el título alfabéticamente menor de los 32 (ver cabecera del fichero).
		await expect(firstRow).toContainText('Bienvenido a Vega');

		await titleSortButton.click();
		await expect(page).toHaveURL(/\?sort=title&dir=desc$/);
		await expect(titleHeader).toHaveAttribute('aria-sort', 'descending');
		// Descendente: "Entrada 9" es el título alfabéticamente mayor (el dígito "9" supera al
		// primer dígito de cualquier "Entrada 1x".."Entrada 3x" en comparación de codepoints).
		await expect(firstRow).toContainText('Entrada 9');

		await titleSortButton.click();
		await expect(page).not.toHaveURL(/sort=/);
		await expect(titleHeader).toHaveAttribute('aria-sort', 'none');
	});

	test('ordenar por una columna distinta arranca siempre en asc (D-P4.6(a), una sola columna a la vez)', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts?sort=title&dir=desc');

		const table = page.locator('[data-list-state="ready"]');
		await table.locator('thead th', { hasText: 'Status' }).locator('button').click();

		await expect(page).toHaveURL(/\?sort=status&dir=asc$/);
		await expect(table.locator('thead th', { hasText: 'Title' })).toHaveAttribute(
			'aria-sort',
			'none'
		);
		await expect(table.locator('thead th', { hasText: 'Status' })).toHaveAttribute(
			'aria-sort',
			'ascending'
		);
	});

	test('la cabecera "Tags" (select múltiple, NO escalar) no ofrece ningún control de orden', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const table = page.locator('[data-list-state="ready"]');
		const tagsHeader = table.locator('thead th', { hasText: 'Tags' });
		await expect(tagsHeader).toBeVisible();
		await expect(tagsHeader.locator('button')).toHaveCount(0);
		expect(await tagsHeader.getAttribute('aria-sort')).toBeNull();
	});
});

test.describe('deep-link reconstruye la vista entera (L-P4.13, Fase 4d)', () => {
	test('?q=&status=&sort=&dir= reconstruyen la toolbar, la cabecera y la tabla tras recargar', async ({
		page
	}) => {
		await loginAndSettle(page);
		// "Entrada" + status=draft: 15 registros (n impar 3..31, ver cabecera del fichero), ninguno
		// vacío, para poder comprobar la tabla poblada además de los controles.
		await page.goto('/c/posts?q=Entrada&status=draft&sort=title&dir=asc');

		const table = page.locator('[data-list-state="ready"]');
		await expect(table).toBeVisible();
		await expect(page.locator('.vega-pagination-status')).toContainText('15 registros');
		await expect(page.getByLabel('Buscar en el listado')).toHaveValue('Entrada');
		await expect(page.getByLabel('Estado')).toHaveValue('draft');
		await expect(table.locator('thead th', { hasText: 'Title' })).toHaveAttribute(
			'aria-sort',
			'ascending'
		);

		await page.reload();

		const tableAfterReload = page.locator('[data-list-state="ready"]');
		await expect(tableAfterReload).toBeVisible();
		await expect(page.locator('.vega-pagination-status')).toContainText('15 registros');
		await expect(page.getByLabel('Buscar en el listado')).toHaveValue('Entrada');
		await expect(page.getByLabel('Estado')).toHaveValue('draft');
		await expect(tableAfterReload.locator('thead th', { hasText: 'Title' })).toHaveAttribute(
			'aria-sort',
			'ascending'
		);
	});
});

test.describe('responsive N columnas (L-P4.2, Audit H1, Fase 4f)', () => {
	test('con más de 5 columnas (7, ver demo-seed) la tabla scrollea horizontal CONTENIDA, sin desbordar la página', async ({
		page
	}) => {
		// Viewport móvil estrecho (mismo punto que `a11y-smoke.spec.ts`): a ese ancho, 7 columnas +
		// la de acciones no caben sin scroll horizontal — el escenario real que motiva el wrapper.
		await page.setViewportSize({ width: 375, height: 700 });
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const table = page.locator('[data-list-state="ready"]');
		await expect(table).toBeVisible();

		const headers = table.locator('thead th');
		// Labels humanizados por P2 (§4.8, `humanizeLabel`): "contactEmail" → "Contact email" (solo
		// la primera letra en mayúscula, no Title Case).
		await expect(headers.filter({ hasText: 'Title' })).toBeVisible();
		await expect(headers.filter({ hasText: 'Website' })).toBeVisible();
		await expect(headers.filter({ hasText: 'Contact email' })).toBeVisible();

		// El wrapper (`.vega-record-table-wrap`, `overflow-x: auto` desde 4c) es quien scrollea: su
		// contenido (la `<table>`) es más ancho que su caja visible.
		const wrap = page.locator('.vega-record-table-wrap');
		const [scrollWidth, clientWidth, overflowX] = await wrap.evaluate((el) => [
			el.scrollWidth,
			el.clientWidth,
			getComputedStyle(el).overflowX
		]);
		expect(overflowX).toBe('auto');
		expect(scrollWidth).toBeGreaterThan(clientWidth);

		// La PÁGINA (no el wrapper) nunca gana scroll horizontal propio: el desbordamiento queda
		// contenido dentro de `.vega-record-table-wrap`, nunca empuja `<body>`/`<html>`.
		const bodyOverflows = await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(bodyOverflows).toBe(false);
	});
});
