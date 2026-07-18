/**
 * Suite B.11 (§7 del contrato P3): la sidebar pinta `ContentModel.nav` LITERAL (grupos/orden/
 * iconos/singleton/readonly, P3-L6); `vega` no aparece (P2-L7); el item singleton tiene su
 * afordancia; el item activo lleva `aria-current="page"`. Contra la semilla enriquecida de
 * `session/demo-seed.ts` (ver su cabecera para el detalle del escenario).
 */
import { expect, loginAsDemo, test } from './fixtures';

test('pinta los grupos/items del manifiesto en el orden esperado, con el grupo anónimo primero', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	const sidebar = page.getByRole('navigation', { name: 'Navegación principal' });
	// `allTextContents()` no reintenta (no es un `expect`): espera explícitamente a que la
	// sidebar haya pintado antes de leerla, para no correr contra un DOM todavía vacío.
	await expect(sidebar.getByRole('link', { name: 'Entradas' })).toBeVisible();

	// Orden de render: grupo anónimo (singleton "Información del sitio") primero, después el
	// grupo "Contenido" (Entradas, order 1; Páginas, order 2; Autores, order 3; Métricas, order 4
	// — añadidos en 4c, ver `session/demo-seed.ts`). Se aíslan los `.vega-nav-item-label` (no el
	// `<a>` completo) para no depender de si hay o no espacio en blanco entre el label y la
	// insignia "Solo lectura" de un item readonly.
	const labels = await sidebar
		.locator('p.vega-nav-group-label, .vega-nav-item-label')
		.allTextContents();
	expect(labels.map((l) => l.trim())).toEqual([
		'Información del sitio',
		'Contenido',
		'Entradas',
		'Páginas',
		'Autores',
		'Métricas'
	]);
});

test('la colección reservada "vega" nunca aparece en la sidebar', async ({ page }) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	const sidebar = page.getByRole('navigation', { name: 'Navegación principal' });
	await expect(sidebar.getByText('vega', { exact: true })).toHaveCount(0);
});

test('el item singleton sin icono propio lleva la afordancia de singleton', async ({ page }) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	const singletonLink = page.getByRole('link', { name: 'Información del sitio' });
	await expect(singletonLink).toHaveAttribute('data-singleton', 'true');
});

test('el item readonly lleva la insignia "Solo lectura"', async ({ page }) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	const sidebar = page.getByRole('navigation', { name: 'Navegación principal' });
	const pagesLink = sidebar.locator('a[data-readonly="true"]');
	await expect(pagesLink).toHaveCount(1);
	await expect(pagesLink.locator('.vega-nav-item-label')).toHaveText('Páginas');
	await expect(pagesLink.locator('.vega-nav-badge')).toHaveText('Solo lectura');
});

test('el item de nav activo lleva aria-current="page" y ningún otro', async ({ page }) => {
	await loginAsDemo(page);
	// La resolución de singleton del índice ya deja "Información del sitio" en su ruta de
	// creación: ese item nace activo, sin haber hecho click en la sidebar.
	await page.waitForURL('**/c/site_info/new');
	await expect(page.getByRole('link', { name: 'Información del sitio' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(page.getByRole('link', { name: 'Entradas' })).not.toHaveAttribute('aria-current');

	// Click en un item normal: navega y se convierte en el nuevo activo (el anterior deja de
	// serlo). `/c/posts` es ruta real desde la Fase 3a (`c/[type]/+page.svelte`, placeholder de
	// listado de P4).
	await page.getByRole('link', { name: 'Entradas' }).click();
	await page.waitForURL('**/c/posts');
	await expect(page.getByRole('link', { name: 'Entradas' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(page.getByRole('link', { name: 'Información del sitio' })).not.toHaveAttribute(
		'aria-current'
	);
});
