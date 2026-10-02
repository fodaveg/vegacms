/**
 * Suite del Lote 12, láminas 6 y 7 (`design/mockups/2026-10-01-lote-12/`): el menú de acciones de
 * cada fila del listado (`RecordTable` + `ActionMenu`) y la cabecera del listado en móvil
 * (`routes/c/[type]/+page.svelte`). Contra la semilla de demo (`posts`: 32 registros, con permiso
 * de crear y borrar; `pages`: readonly). Lo que aquí se mide es lo que ningún test de unidad puede:
 * el recorrido REAL del tabulador en un navegador, el foco que devuelve un diálogo al cerrarse, la
 * celda pegada que se ve a 390 px sin desplazar la tabla y el `matchMedia` que cambia la cabecera.
 *
 * El teclado del propio menú (flechas circulares, Home/End, Escape) ya lo cubre
 * `ActionMenu.svelte.test.ts` en jsdom; aquí solo se comprueba el camino completo una vez.
 */
import { expect, loginAsDemo, test } from './fixtures';

async function loginAndSettle(page: import('@playwright/test').Page): Promise<void> {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
}

test.describe('menú de acciones de fila (lámina 7)', () => {
	test('una sola parada de tabulación por fila: Tab desde un título va al título de la fila siguiente', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');
		await expect(page.locator('[data-list-state="ready"]')).toBeVisible();

		const rows = page.locator('tbody tr');
		const firstLink = rows.nth(0).getByRole('link');
		const secondLink = rows.nth(1).getByRole('link');
		await firstLink.focus();
		await expect(firstLink).toBeFocused();
		// Antes, este Tab caía en el «Borrar» de la primera fila (60 paradas en 30 filas).
		await page.keyboard.press('Tab');
		await expect(secondLink).toBeFocused();
		// El disparador del menú existe pero NO es parada de tabulación.
		await expect(rows.nth(0).getByRole('button', { name: /^Acciones de/ })).toHaveAttribute(
			'tabindex',
			'-1'
		);
	});

	test('→ desde el título lleva al botón de menú; Enter abre con el foco en «Duplicar»; Escape cierra y devuelve el foco', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const row = page.locator('tbody tr', { hasText: 'Bienvenido a Vega' });
		const link = row.getByRole('link', { name: 'Bienvenido a Vega' });
		const trigger = row.getByRole('button', { name: 'Acciones de «Bienvenido a Vega»' });

		await link.focus();
		// El atajo no es un secreto: el título lo anuncia (`aria-describedby`).
		await expect(link).toHaveAccessibleDescription('Flecha derecha: acciones de la fila');
		await page.keyboard.press('ArrowRight');
		await expect(trigger).toBeFocused();
		await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
		await expect(trigger).toHaveAttribute('aria-expanded', 'false');

		await page.keyboard.press('Enter');
		const menu = row.getByRole('menu', { name: 'Acciones de «Bienvenido a Vega»' });
		await expect(menu).toBeVisible();
		await expect(trigger).toHaveAttribute('aria-expanded', 'true');
		const items = menu.getByRole('menuitem');
		await expect(items).toHaveText(['Duplicar', 'Borrar…']);
		await expect(items.nth(0)).toBeFocused();

		await page.keyboard.press('ArrowDown');
		await expect(items.nth(1)).toBeFocused();

		await page.keyboard.press('Escape');
		await expect(menu).toHaveCount(0);
		await expect(trigger).toBeFocused();

		// ← vuelve al título.
		await page.keyboard.press('ArrowLeft');
		await expect(link).toBeFocused();
	});

	test('Espacio también abre el menú; «Borrar…» abre la confirmación de siempre y, al cancelar, el foco vuelve al disparador', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const row = page.locator('tbody tr', { hasText: 'Bienvenido a Vega' });
		const trigger = row.getByRole('button', { name: 'Acciones de «Bienvenido a Vega»' });
		await row.getByRole('link').focus();
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Space');
		const deleteItem = row.getByRole('menuitem', { name: 'Borrar…' });
		await expect(deleteItem).toBeVisible();
		await expect(deleteItem).toHaveAttribute('data-tone', 'danger');
		await deleteItem.click();

		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('Bienvenido a Vega');
		await dialog.getByRole('button', { name: 'Cancelar' }).click();
		await expect(dialog).toBeHidden();
		// El diálogo restaura el foco donde estaba: en el disparador del menú (lámina 7, estado 7.2).
		await expect(trigger).toBeFocused();
		await expect(row).toBeVisible();
	});

	test('«Duplicar» crea una copia y la abre; el original sigue en la lista', async ({ page }) => {
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const row = page.locator('tbody tr', { hasText: 'Bienvenido a Vega' });
		await row.hover();
		await row.getByRole('button', { name: 'Acciones de «Bienvenido a Vega»' }).click();
		await row.getByRole('menuitem', { name: 'Duplicar' }).click();

		await expect(page.getByText('"Bienvenido a Vega" se ha duplicado.')).toBeVisible();
		// Se abre la COPIA (id nuevo, nunca `post_1`), como hace «Duplicar» dentro del registro.
		await expect(page).toHaveURL(/\/c\/posts\/(?!post_1$)[^/]+$/);
		await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue(
			'Bienvenido a Vega'
		);

		// Vuelta al listado por la barra lateral (navegación SPA): un `goto` sería una carga de
		// documento y el adaptador `memory` volvería a sembrarse, perdiendo la copia.
		await page.getByRole('link', { name: 'Entradas', exact: false }).click();
		await page.waitForURL('**/c/posts');
		await expect(page.locator('tbody tr', { hasText: 'Bienvenido a Vega' })).toHaveCount(2);
		await expect(page.locator('.vega-pagination-status')).toHaveText('1–30 de 33');
	});

	test('a 390 px el botón de menú se ve sin desplazar la tabla (celda pegada al borde derecho)', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const row = page.locator('tbody tr', { hasText: 'Bienvenido a Vega' });
		const trigger = row.getByRole('button', { name: 'Acciones de «Bienvenido a Vega»' });
		await expect(trigger).toBeVisible();
		const box = await trigger.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.x + box!.width).toBeLessThanOrEqual(390);
		expect(box!.x).toBeGreaterThanOrEqual(0);

		// El menú se pinta en la capa superior, entero dentro de la ventana.
		await trigger.click();
		const menu = row.getByRole('menu');
		await expect(menu).toBeVisible();
		const menuBox = await menu.boundingBox();
		expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(390);
	});

	test('en la última fila de la página el menú se abre hacia arriba si no cabe debajo', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1440, height: 600 });
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const lastRow = page.locator('tbody tr').last();
		await lastRow.scrollIntoViewIfNeeded();
		const trigger = lastRow.getByRole('button', { name: /^Acciones de/ });
		await trigger.hover();
		const triggerBox = await trigger.boundingBox();
		await trigger.click();
		const menu = lastRow.getByRole('menu');
		await expect(menu).toBeVisible();
		const menuBox = await menu.boundingBox();
		// Entero dentro de la ventana, se abra hacia donde se abra.
		expect(menuBox!.y).toBeGreaterThanOrEqual(0);
		expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(600);
		// Si no cabía debajo, está por encima del disparador.
		if (triggerBox!.y + triggerBox!.height + menuBox!.height > 600) {
			await expect(menu).toHaveAttribute('data-direction', 'up');
			expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(triggerBox!.y);
		}
	});
});

test.describe('cabecera del listado en móvil (lámina 6)', () => {
	test('a 390 px: «Crear» es el primero y Exportar e Importar están en «Más»', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const actions = page.locator('.vega-list-header-actions');
		await expect(actions).toHaveClass(/vega-list-header-actions--narrow/);
		const create = actions.getByRole('button', { name: 'Nuevo: Entrada' });
		const more = actions.getByRole('button', { name: 'Más' });
		await expect(create).toBeVisible();
		await expect(more).toBeVisible();
		await expect(actions.getByRole('button', { name: 'Exportar' })).toHaveCount(0);
		await expect(actions.getByRole('button', { name: 'Importar' })).toHaveCount(0);
		// Orden visual = orden del DOM = orden de tabulación: «Crear» antes que «Más».
		await create.focus();
		await page.keyboard.press('Tab');
		await expect(more).toBeFocused();

		await page.keyboard.press('Enter');
		const menu = page.getByRole('menu', { name: 'Más acciones del listado' });
		await expect(menu.getByRole('menuitem')).toHaveText(['Exportar', 'Importar']);
		await expect(menu.getByRole('menuitem').first()).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(menu).toHaveCount(0);
		await expect(more).toBeFocused();
	});

	test('a 390 px: cada entrada de «Más» abre el mismo diálogo de hoy y al cerrarlo el foco vuelve a «Más»', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const more = page.getByRole('button', { name: 'Más' });
		await more.click();
		await page.getByRole('menuitem', { name: 'Exportar' }).click();
		const exportDialog = page.getByRole('dialog', { name: 'Exportar «Entradas»' });
		await expect(exportDialog).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(exportDialog).toBeHidden();
		await expect(more).toBeFocused();

		await more.click();
		await page.getByRole('menuitem', { name: 'Importar' }).click();
		const importDialog = page.getByRole('dialog', { name: 'Importar un archivo .vega.json' });
		await expect(importDialog).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(importDialog).toBeHidden();
		await expect(more).toBeFocused();
	});

	test('a 390 px, colección de solo lectura: una sola acción (Exportar) como botón suelto, sin «Más»', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await loginAndSettle(page);
		await page.goto('/c/pages');

		const actions = page.locator('.vega-list-header-actions');
		await expect(actions.getByRole('button', { name: 'Exportar' })).toBeVisible();
		await expect(actions.getByRole('button', { name: 'Más' })).toHaveCount(0);
		await expect(actions.getByRole('button', { name: /^Nuevo:/ })).toHaveCount(0);
	});

	test('a 1440 px no cambia nada: Exportar, Importar y «Crear», en ese orden, sin «Más»', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await loginAndSettle(page);
		await page.goto('/c/posts');

		const actions = page.locator('.vega-list-header-actions');
		await expect(actions).not.toHaveClass(/vega-list-header-actions--narrow/);
		await expect(actions.getByRole('button')).toHaveText([
			'Exportar',
			'Importar',
			/Nuevo: Entrada/
		]);
		await expect(actions.getByRole('button', { name: 'Más' })).toHaveCount(0);
	});

	test('al estrechar la ventana con la página abierta, la cabecera cambia de rama (matchMedia)', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await loginAndSettle(page);
		await page.goto('/c/posts');
		await expect(page.getByRole('button', { name: 'Más' })).toHaveCount(0);

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.getByRole('button', { name: 'Más' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Exportar' })).toHaveCount(0);

		await page.setViewportSize({ width: 1440, height: 900 });
		await expect(page.getByRole('button', { name: 'Más' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Exportar' })).toBeVisible();
	});
});
