/**
 * Suite de "reflejar las reglas del backend en la UI" (`#lote-shell`): la interfaz deja de ofrecer
 * lo que sabe que va a dar 403.
 *
 * Se apoya en las dos colecciones que la semilla de demo declara con `access`
 * (`session/demo-seed.ts`): `avisos` (se lista y se ve, pero no se crea/edita/borra) y `privado`
 * (ni siquiera se lista). El adaptador `memory` va con `capabilities.accessBypass: false`, así que
 * lo declarado en la semilla es exactamente lo que la UI debe reflejar.
 *
 * Lo que NO se comprueba aquí y es deliberado: que el backend rechace de verdad esas operaciones.
 * Eso es del backend (y de `tests/contract/`), no de la UI — esto no es control de acceso, es no
 * mentirle al editor.
 */
import { expect, loginAsDemo, test, waitForHome } from './fixtures';

test('una colección sin permiso de creación no ofrece "Nueva" ni en la cabecera ni por atajo', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.goto('/c/avisos');

	await expect(page.getByRole('heading', { name: 'Avisos', level: 1 })).toBeVisible();
	// Rótulo REAL del botón (`list.new.button` = `Nuevo: {label}`, con `labelSingular`): escrito
	// tal cual a propósito — con un texto aproximado, este aserto pasaría aunque el botón SÍ se
	// pintara (verificado rompiendo `resolvePermissions` a mano: el `/Nuevo Aviso/` que había
	// antes aquí seguía en verde con la restricción desactivada).
	await expect(page.getByRole('button', { name: 'Nuevo: Aviso' })).toHaveCount(0);
	// …y en una colección SIN restricción, ese mismo localizador SÍ encuentra el botón: la
	// ausencia de arriba dice algo, no es un selector que no case nunca.
	await page.goto('/c/authors');
	await expect(page.getByRole('button', { name: 'Nuevo: Autor' })).toBeVisible();
	await page.goto('/c/avisos');

	// El atajo `N` tampoco existe (mismo guard que el botón): pulsarlo no navega a `/new`.
	await page.keyboard.press('n');
	await expect(page).toHaveURL(/\/c\/avisos$/);
});

test('sin permiso de borrado ni de crear, la fila no tiene menú de acciones ni "Borrar"', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.goto('/c/avisos');

	const row = page.getByRole('row').filter({ hasText: 'Aviso que no se puede editar' });
	await expect(row).toBeVisible();
	await row.hover();
	// `avisos` no deja borrar ni crear (tampoco duplicar): sin nada que ofrecer, el menú de fila
	// ni se pinta (lámina 7: «sin botón ni hueco»), así que tampoco hay ningún «Borrar».
	await expect(row.getByRole('button', { name: /^Acciones de/ })).toHaveCount(0);
	await expect(row.getByRole('button', { name: /Borrar/ })).toHaveCount(0);
	await expect(row.locator('.vega-cell-menu')).toHaveCount(0);
});

test('el editor de un registro sin permiso de actualización es de solo lectura y lo explica', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.goto('/c/avisos/aviso_1');

	// El motivo se dice tal cual — NO como "esta colección es de solo lectura" (que es otra cosa:
	// una vista del backend, ver `pages`).
	await expect(
		page.getByText('No tienes permiso para editar este contenido', { exact: false })
	).toBeVisible();
	await expect(page.getByRole('button', { name: /^Guardar/ })).toHaveCount(0);
	await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toBeDisabled();
	// Y tampoco se ofrece borrar desde el editor.
	await expect(page.getByRole('button', { name: /Borrar/ })).toHaveCount(0);
});

test('crear por URL directa en una colección sin permiso: estado "sin permiso", no un formulario', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.goto('/c/avisos/new');

	await expect(page.getByRole('heading', { name: 'No tienes permiso' })).toBeVisible();
	await expect(page.getByText('No tienes permiso para crear contenido en «Avisos»')).toBeVisible();
});

test('una colección que no se puede listar no está en la navegación, y su ruta lo explica', async ({
	page
}) => {
	await loginAsDemo(page);
	await waitForHome(page);

	const sidebar = page.getByRole('navigation', { name: 'Navegación principal' });
	await expect(sidebar.getByRole('link', { name: 'Entradas' })).toBeVisible();
	await expect(sidebar.getByRole('link', { name: 'Privado' })).toHaveCount(0);

	// La ruta sigue existiendo (URL guardada, enlace de otra pestaña): no se pinta un listado vacío
	// ni un 403 crudo, se dice qué pasa.
	await page.goto('/c/privado');
	await expect(page.getByRole('heading', { name: 'No tienes permiso' })).toBeVisible();
	await expect(
		page.getByText('No tienes permiso para ver el contenido de «Privado»')
	).toBeVisible();
});

test('hideCreate oculta altas manuales en escritorio, móvil, atajo, fila e Inicio y conserva Importar', async ({
	page
}) => {
	await loginAsDemo(page);
	await waitForHome(page);
	const sidebar = page.getByRole('navigation', { name: 'Navegación principal' });
	// Los recuentos forman parte del nombre accesible; mismo selector que los tests de navegación.
	const authorsLink = sidebar.getByRole('link', { name: 'Autores' });
	await expect(authorsLink).toBeVisible();
	await expect(authorsLink).toHaveAttribute('href', '/c/authors');
	await page.getByRole('link', { name: 'Ajustes', exact: false }).click();
	const editor = page.locator('#manifest-editor-textarea');
	await expect(editor).toBeVisible();
	const manifest = JSON.parse(await editor.inputValue());
	manifest.collections.authors.hideCreate = true;
	manifest.collections.posts.hideCreate = true;
	await editor.fill(JSON.stringify(manifest, null, 2));
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Guardado.');
	await authorsLink.click();
	await expect(page.getByRole('heading', { name: 'Autores', level: 1 })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Nuevo: Autor' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Importar', exact: true })).toBeVisible();
	await page.keyboard.press('n');
	await expect(page).toHaveURL(/\/c\/authors$/);
	await expect(
		page.getByText('La creación manual está desactivada para esta colección.')
	).toBeVisible();
	await sidebar.getByRole('link', { name: 'Entradas' }).click();
	const row = page.getByRole('row').filter({ hasText: 'Bienvenido a Vega' });
	await row.getByRole('button', { name: /^Acciones de/ }).click();
	await expect(page.getByRole('menuitem', { name: /Duplicar/ })).toHaveCount(0);
	await expect(page.getByRole('menuitem', { name: /Borrar/ })).toBeVisible();
	await page.keyboard.press('Escape');
	await authorsLink.click();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByRole('button', { name: 'Nuevo: Autor' })).toHaveCount(0);
	await page.keyboard.press('n');
	await expect(page).toHaveURL(/\/c\/authors$/);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.getByRole('banner').getByRole('link', { name: 'Inicio', exact: true }).click();
	await expect(page.locator('[data-create-type="authors"]')).toHaveCount(0);
	await expect(page.locator('[data-create-type="metrics"]')).toBeVisible();
	await sidebar.getByRole('link', { name: 'Métricas' }).click();
	await expect(page.getByRole('button', { name: 'Nuevo: Métrica' })).toBeVisible();
});

for (const existing of [false, true]) {
	test(`singleton hideCreate con registro existente=${existing} conserva el destino y la edición`, async ({
		page
	}) => {
		await loginAsDemo(page);
		await waitForHome(page);
		if (existing) {
			await page.getByRole('link', { name: 'Información del sitio', exact: true }).click();
			await page.getByRole('textbox', { name: 'Tagline' }).fill('Sitio existente');
			await page.getByRole('button', { name: 'Guardar', exact: true }).click();
			await expect(page).toHaveURL(/\/c\/site_info\/(?!new)[^/]+$/);
		}
		await page.getByRole('link', { name: 'Ajustes', exact: false }).click();
		const editor = page.locator('#manifest-editor-textarea');
		await expect(editor).toBeVisible();
		const manifest = JSON.parse(await editor.inputValue());
		manifest.collections.site_info.hideCreate = true;
		await editor.fill(JSON.stringify(manifest, null, 2));
		await page.getByRole('button', { name: 'Guardar', exact: true }).click();
		await expect(page.getByRole('status')).toContainText('Guardado.');
		await page.getByRole('link', { name: 'Información del sitio', exact: true }).click();
		if (existing) {
			await expect(page.getByRole('textbox', { name: 'Tagline' })).toHaveValue('Sitio existente');
			await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeVisible();
		} else {
			await expect(page).toHaveURL(/\/c\/site_info\/new$/);
			await expect(page.getByRole('heading', { name: 'Creación no disponible' })).toBeVisible();
			await expect(page.locator('form')).toHaveCount(0);
		}
	});
}
