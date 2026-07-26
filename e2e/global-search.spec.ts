/**
 * Suite del buscador global de la topbar (`#lote-shell`): la caja de R1 ya BUSCA. Se ejercita el
 * ciclo completo contra la semilla de demo (adaptador `memory`): teclear → panel con resultados
 * agrupados por colección → abrir uno (con ratón y con teclado) → cerrar.
 *
 * Los casos "un fallo aislado no tumba el panel" / anti-carrera viven en los unitarios
 * (`src/lib/shell/global-search.svelte.test.ts`): no son reproducibles de forma determinista
 * contra la semilla, que siempre responde.
 */
import { expect, loginAsDemo, test } from './fixtures';

/** La caja es un `combobox` (patrón APG), no un `searchbox`: tiene panel de resultados. */
function searchBox(page: Parameters<typeof loginAsDemo>[0]) {
	return page.getByRole('combobox', { name: 'Búsqueda global' });
}

test('teclear encuentra registros de la colección y abrirlos navega a su edición', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	const box = searchBox(page);
	await box.fill('borrador');

	const results = page.getByRole('listbox', { name: 'Resultados de la búsqueda global' });
	const hit = results.getByRole('option', { name: /Borrador en curso/ });
	await expect(hit).toBeVisible();
	await expect(box).toHaveAttribute('aria-expanded', 'true');

	await hit.click();

	// `post_2` es el "Borrador en curso" de la semilla (`demo-seed.ts`).
	await page.waitForURL('**/c/posts/post_2');
	// Tras navegar, el buscador queda limpio: ni panel abierto ni término escrito.
	await expect(box).toHaveValue('');
	await expect(box).toHaveAttribute('aria-expanded', 'false');
});

test('↓ marca el resultado activo y Enter lo abre, sin sacar el foco de la caja', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	const box = searchBox(page);
	await box.fill('Borrador en curso');
	await expect(page.getByRole('option', { name: /Borrador en curso/ })).toBeVisible();

	await box.press('ArrowDown');
	// `aria-activedescendant` apunta al option activo (el foco REAL sigue en la caja: patrón APG).
	const activeId = await box.getAttribute('aria-activedescendant');
	expect(activeId).not.toBeNull();
	await expect(box).toBeFocused();
	await expect(page.locator(`#${activeId}`)).toHaveAttribute('aria-selected', 'true');

	await box.press('Enter');
	await page.waitForURL('**/c/posts/post_2');
});

test('Escape cierra el panel; un segundo Escape vacía la caja', async ({ page }) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	const box = searchBox(page);
	await box.fill('borrador');
	await expect(page.getByRole('option', { name: /Borrador en curso/ })).toBeVisible();

	await box.press('Escape');
	await expect(page.getByRole('option', { name: /Borrador en curso/ })).toBeHidden();
	await expect(box).toHaveValue('borrador');

	await box.press('Escape');
	await expect(box).toHaveValue('');
});

test('un término sin coincidencias lo dice, en vez de un panel vacío', async ({ page }) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	await searchBox(page).fill('zzzqqqxxx');

	await expect(page.getByText('Sin resultados para «zzzqqqxxx»')).toBeVisible();
});

test('por debajo del mínimo no se busca: se pide más texto', async ({ page }) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	await searchBox(page).fill('b');

	await expect(page.getByText('Escribe al menos 2 caracteres')).toBeVisible();
	await expect(page.getByRole('option')).toHaveCount(0);
});

test('los resultados se agrupan por colección y el grupo lleva al listado con la búsqueda puesta', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	// "Entrada" casa con las 30 entradas de relleno de la semilla (`EXTRA_POST_RECORDS`): más
	// aciertos que los que caben en el panel ⇒ aparece el "ver todos" del grupo.
	await searchBox(page).fill('Entrada');

	const seeAll = page.getByRole('link', { name: /Ver los \d+ restantes/ });
	await expect(seeAll).toBeVisible();
	await seeAll.click();

	await page.waitForURL(/\/c\/posts\?q=Entrada/);
	// El listado abre con el término YA aplicado en su propia caja de búsqueda.
	await expect(page.getByRole('searchbox').first()).toHaveValue('Entrada');
});

// Cruce con las reglas de acceso (`#lote-shell`, la otra mitad del lote): el buscador global se
// alimenta de la NAVEGACIÓN, así que una colección que esta sesión no puede listar no se busca —
// ni siquiera para decir "no hay resultados en ella".
test('el buscador global no ofrece resultados de una colección que no se puede listar', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	// "Contenido reservado" es el registro de `privado`: existe en la semilla, pero esa colección
	// no está en la navegación y por tanto no se busca.
	await searchBox(page).fill('Contenido reservado');

	await expect(page.getByText('Sin resultados para «Contenido reservado»')).toBeVisible();
});
