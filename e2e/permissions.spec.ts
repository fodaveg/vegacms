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
import { expect, loginAsDemo, test } from './fixtures';

test('una colección sin permiso de creación no ofrece "Nueva" ni en la cabecera ni por atajo', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.goto('/c/avisos');

	await expect(page.getByRole('heading', { name: 'Avisos', level: 1 })).toBeVisible();
	// Rótulo REAL del botón (`list.new.button` = `Crear «{label}»`, con `labelSingular`): escrito
	// tal cual a propósito — con un texto aproximado, este aserto pasaría aunque el botón SÍ se
	// pintara (verificado rompiendo `resolvePermissions` a mano: el `/Nuevo Aviso/` que había
	// antes aquí seguía en verde con la restricción desactivada).
	await expect(page.getByRole('button', { name: 'Crear «Aviso»' })).toHaveCount(0);
	// …y en una colección SIN restricción, ese mismo localizador SÍ encuentra el botón: la
	// ausencia de arriba dice algo, no es un selector que no case nunca.
	await page.goto('/c/authors');
	await expect(page.getByRole('button', { name: 'Crear «Autor»' })).toBeVisible();
	await page.goto('/c/avisos');

	// El atajo `N` tampoco existe (mismo guard que el botón): pulsarlo no navega a `/new`.
	await page.keyboard.press('n');
	await expect(page).toHaveURL(/\/c\/avisos$/);
});

test('sin permiso de borrado, la fila no revela la acción "Borrar"', async ({ page }) => {
	await loginAsDemo(page);
	await page.goto('/c/avisos');

	const row = page.getByRole('row').filter({ hasText: 'Aviso que no se puede editar' });
	await expect(row).toBeVisible();
	await row.hover();
	await expect(row.getByRole('button', { name: /Borrar/ })).toHaveCount(0);
});

test('el editor de un registro sin permiso de actualización es de solo lectura y lo explica', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.goto('/c/avisos/aviso_1');

	// El motivo se dice tal cual — NO como "esta colección es de solo lectura" (que es otra cosa:
	// una vista del backend, ver `pages`).
	await expect(
		page.getByText('No tienes permiso para editar registros de esta colección', { exact: false })
	).toBeVisible();
	await expect(page.getByRole('button', { name: /^Guardar/ })).toHaveCount(0);
	await expect(page.getByLabel('Title')).toBeDisabled();
	// Y tampoco se ofrece borrar desde el editor.
	await expect(page.getByRole('button', { name: /Borrar/ })).toHaveCount(0);
});

test('crear por URL directa en una colección sin permiso: estado "sin permiso", no un formulario', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.goto('/c/avisos/new');

	await expect(page.getByRole('heading', { name: 'No tienes permiso' })).toBeVisible();
	await expect(page.getByText('No tienes permiso para crear registros en "Avisos"')).toBeVisible();
});

test('una colección que no se puede listar no está en la navegación, y su ruta lo explica', async ({
	page
}) => {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');

	const sidebar = page.getByRole('navigation', { name: 'Navegación principal' });
	await expect(sidebar.getByRole('link', { name: 'Entradas' })).toBeVisible();
	await expect(sidebar.getByRole('link', { name: 'Privado' })).toHaveCount(0);

	// La ruta sigue existiendo (URL guardada, enlace de otra pestaña): no se pinta un listado vacío
	// ni un 403 crudo, se dice qué pasa.
	await page.goto('/c/privado');
	await expect(page.getByRole('heading', { name: 'No tienes permiso' })).toBeVisible();
	await expect(
		page.getByText('No tienes permiso para ver los registros de "Privado"')
	).toBeVisible();
});
