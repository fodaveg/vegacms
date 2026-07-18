/**
 * Suite de la Fase 3a (§7.B.12/14 del contrato P3): los marcos de ruta de contenido — resolución
 * de singleton por deep-link, `not-found`, `forbidden` y el placeholder de `/media` — contra la
 * semilla enriquecida de `session/demo-seed.ts` (`posts` normal, `pages` readonly, `site_info`
 * singleton sin registros).
 *
 * No se añade un segundo singleton con registros (caso ">1 registros" de §3.3): la resolución
 * `0/1/>1 → new/edit/edit+aviso` YA está cubierta como función pura en `tests/shell/singleton.test.ts`
 * (suite A.3); esta suite e2e solo verifica que `/c/[type]` la DISPARA de verdad por URL directa,
 * el mismo camino que `nav.toSingleton()` (ya cubierto por `nav.spec.ts`/`feedback.spec.ts`).
 * Añadir semilla nueva aquí arriesgaba los 25 e2e existentes para un caso ya certificado; se anota
 * en vez de duplicar infraestructura de seed.
 */
import { expect, loginAsDemo, test } from './fixtures';

test.describe('singleton por deep-link (§7.B.12)', () => {
	test('navegar por URL directa a /c/site_info resuelve a /c/site_info/new (0 registros)', async ({
		page
	}) => {
		await loginAsDemo(page);
		await page.waitForURL('**/c/site_info/new');

		// Deep-link directo al listado del singleton: nunca debe pintarse un listado, siempre
		// resuelve (§3.3) al mismo destino que la resolución del índice/sidebar.
		await page.goto('/c/site_info');
		await page.waitForURL('**/c/site_info/new');
		await expect(page.getByRole('link', { name: 'Información del sitio' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		// Aterriza en el placeholder de CREAR (P5) de la propia edición del singleton, nunca en un
		// listado (§3.3: un singleton no tiene marco de listado que mostrar).
		await expect(page.locator('[data-route-state="placeholder"]')).toContainText(
			'Información del sitio'
		);
	});
});

test.describe('índice por recarga directa (regresión P3-L9)', () => {
	test('un hard-load directo a / con sesión válida resuelve el índice, no queda colgado en "Cargando…"', async ({
		page
	}) => {
		// Regresión del bug encontrado en 3a: el índice usaba `afterNavigate`, cuyo único evento en
		// un hard-load se dispara ANTES de que el componente monte (detrás del gate async de
		// sesión+modelo del layout) → `routerReady` nunca se ponía y la redirección quedaba colgada.
		// Arreglado con `onMount`. Este test lo ejercita con `page.goto('/')` (carga de documento
		// completa), el escenario que ningún e2e cubría.
		await loginAsDemo(page);
		await page.waitForURL('**/c/site_info/new');

		await page.goto('/');
		// El índice resuelve el singleton del primer NavItem, igual que tras el login.
		await page.waitForURL('**/c/site_info/new');
		await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
	});
});

test.describe('not-found (§7.B.14)', () => {
	test('/c/no-existe muestra el estado not-found en contexto, sin redirigir a /login', async ({
		page
	}) => {
		await loginAsDemo(page);
		await page.waitForURL('**/c/site_info/new');

		await page.goto('/c/no-existe');

		const state = page.getByRole('alert').filter({ hasText: 'Colección no encontrada' });
		await expect(state).toBeVisible();
		await expect(state).toHaveAttribute('data-route-state', 'not-found');
		await expect(page).toHaveURL(/\/c\/no-existe$/);

		// El shell sigue montado: sidebar y logout siguen ahí.
		await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Entradas' })).toBeVisible();

		// La acción "Volver al índice" navega fuera del estado not-found.
		await state.getByRole('button', { name: 'Volver al índice' }).click();
		await page.waitForURL('**/c/site_info/new');
	});

	test('la colección reservada "vega" también resuelve a not-found por URL directa', async ({
		page
	}) => {
		await loginAsDemo(page);
		await page.waitForURL('**/c/site_info/new');

		// `vega` existe en el esquema pero está SIEMPRE oculta (P2-L7): un deep-link a ella no debe
		// tratarse como un tipo válido.
		await page.goto('/c/vega');

		await expect(
			page.getByRole('alert').filter({ hasText: 'Colección no encontrada' })
		).toBeVisible();
	});
});

test.describe('forbidden', () => {
	test('/c/pages/new muestra forbidden en contexto (pages es readonly)', async ({ page }) => {
		await loginAsDemo(page);
		await page.waitForURL('**/c/site_info/new');

		await page.goto('/c/pages/new');

		const state = page.getByRole('alert').filter({ hasText: 'No tienes permiso' });
		await expect(state).toBeVisible();
		await expect(state).toHaveAttribute('data-route-state', 'forbidden');
		await expect(state).toContainText('Páginas');
		await expect(page).toHaveURL(/\/c\/pages\/new$/);

		await state.getByRole('button', { name: 'Volver al listado' }).click();
		await page.waitForURL('**/c/pages');
	});
});

test.describe('/media placeholder (§6.11)', () => {
	test('/media muestra el placeholder honesto, no un error', async ({ page }) => {
		await loginAsDemo(page);
		await page.waitForURL('**/c/site_info/new');

		await page.goto('/media');

		const state = page.locator('[data-route-state="placeholder"]');
		await expect(state).toBeVisible();
		await expect(state).toHaveText(/llegan en una fase próxima/);
		// Es informativo, no un error: sin `role="alert"`.
		await expect(state).not.toHaveAttribute('role', 'alert');
	});
});
