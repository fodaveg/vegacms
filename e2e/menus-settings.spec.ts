/** Recarga real contra PocketBase efímero: la demo en memoria reinicia los datos al recargar. */
import { test, expect } from '@playwright/test';
import { startPocketBase, type RunningPocketBase } from '../tests/contract/pb-harness/server';
import { isPocketBaseBinaryAvailable } from '../tests/contract/pb-harness/binary';

test.describe('Menús y Datos del sitio', () => {
	test.skip(!isPocketBaseBinaryAvailable(), 'Requiere PocketBase descargado por el gate');
	let pb: RunningPocketBase;

	test.beforeEach(async ({ page }) => {
		pb = await startPocketBase();
		await page.route('**/vega.config.json', (route) =>
			route.fulfill({ json: { backendUrl: pb.url } })
		);
		await page.goto('/login');
		await page.getByLabel('Correo electrónico').fill(pb.adminEmail);
		await page.getByLabel('Contraseña', { exact: true }).fill(pb.adminPassword);
		await page.getByRole('button', { name: 'Entrar', exact: true }).click();
		await page.getByRole('link', { name: 'Ajustes', exact: false }).click();
		const base = page.locator('[data-site-state]');
		await base.getByRole('button', { name: 'Preparar el sitio', exact: true }).click();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Preparar el sitio', exact: true })
			.click();
		await expect(base).toHaveAttribute('data-site-state', 'current');
	});
	test.afterEach(async () => {
		await pb?.stop();
	});

	async function addModule(page: import('@playwright/test').Page, id: string) {
		const row = page.locator(`[data-site-module="${id}"]`);
		await row.getByRole('button', { name: /^Añadir:/ }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toContainText(id === 'menus' ? 'principal' : 'default');
		await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
		await expect(row).toHaveAttribute('data-module-state', 'added');
	}

	test('Menú principal: vacío, elemento sin destino, relación a página, ancla y reorden persistido', async ({
		page
	}, info) => {
		await addModule(page, 'menus');
		await page.getByRole('link', { name: /^Menús/ }).click();
		await page.getByRole('link', { name: 'Menú principal', exact: true }).click();
		await expect(page.getByText('Todavía no hay elementos de menú.')).toBeVisible();
		await expect(
			page.locator('.vega-field-row[data-field="created"], .vega-field-row[data-field="updated"]')
		).toHaveCount(0);
		await expect(page.getByRole('heading', { name: 'Ficha', exact: true })).toBeVisible();
		await expect(
			page.locator('.vega-editor-kv').getByText('Creado', { exact: true })
		).toBeVisible();
		await expect(
			page.locator('.vega-editor-kv').getByText('Actualizado', { exact: true })
		).toBeVisible();
		await page.locator('.vega-blocks').scrollIntoViewIfNeeded();
		await page.screenshot({ path: info.outputPath('menu-vacio.png'), fullPage: true });
		await expect(page.getByRole('button', { name: 'Editor visual', exact: true })).toHaveCount(0);
		await page.getByRole('button', { name: 'Añadir Elemento', exact: true }).click();
		const first = page.locator('.vega-block-row').first();
		await first.getByLabel('Texto', { exact: true }).fill('Inicio');
		await first.getByRole('button', { name: 'Guardar', exact: true }).click();
		await expect(first.locator('.vega-block-dirty')).toHaveCount(0);
		await first.locator('.vega-block-toggle').click();
		await page.locator('.vega-blocks').scrollIntoViewIfNeeded();
		await page.screenshot({ path: info.outputPath('menu-sin-destino.png'), fullPage: true });
		await first.locator('.vega-block-toggle').click();
		await first.getByRole('searchbox').fill('Inicio');
		await first.getByRole('button', { name: 'Inicio', exact: true }).click();
		await first.getByRole('button', { name: 'Guardar', exact: true }).click();
		await page.getByRole('button', { name: 'Añadir Elemento', exact: true }).click();
		const second = page.locator('.vega-block-row').nth(1);
		await second.getByLabel('Texto', { exact: true }).fill('Equipo');
		await second.getByLabel('Dirección', { exact: true }).fill('#equipo');
		await second.getByRole('button', { name: 'Guardar', exact: true }).click();
		const handle = second.locator('.vega-block-handle');
		await expect(handle).toBeEnabled();
		await handle.press('ArrowUp');
		await expect(handle).toBeEnabled();
		await expect(
			page.locator('.vega-block-row').first().locator('.vega-block-toggle')
		).toContainText('Equipo');
		await page.reload();
		await expect(page.locator('.vega-block-toggle')).toHaveText([/Equipo/, /Inicio/]);
		await page.getByRole('button', { name: 'Añadir Elemento', exact: true }).click();
		const third = page.locator('.vega-block-row').nth(2);
		await third.getByLabel('Texto', { exact: true }).fill('Contacto');
		await third.getByLabel('Dirección', { exact: true }).fill('#contacto');
		await third.getByRole('button', { name: 'Guardar', exact: true }).click();
		for (const toggle of await page.locator('.vega-block-toggle').all()) {
			if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
		}
		await expect(
			page.locator('.vega-field-row[data-field="created"], .vega-field-row[data-field="updated"]')
		).toHaveCount(0);
		await page.setViewportSize({ width: 1440, height: 2200 });
		await page.locator('.vega-block-row').first().scrollIntoViewIfNeeded();
		await page.screenshot({
			path: info.outputPath('menu-tres-abiertos-desktop.png'),
			fullPage: true
		});
		await page.setViewportSize({ width: 390, height: 844 });
		if (await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).count())
			await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).click();
		await expect(page.locator('#vega-sidebar')).not.toBeInViewport();
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
		await page.screenshot({
			path: info.outputPath('menu-tres-abiertos-mobile.png'),
			fullPage: true
		});
	});

	test('Datos del sitio: abre singleton desde sidebar, guarda descripción y la conserva tras recarga', async ({
		page
	}, info) => {
		await addModule(page, 'datos-del-sitio');
		await page.getByRole('link', { name: /^Datos del sitio/ }).click();
		await expect(page).toHaveURL(/\/c\/site_settings\/[^/]+$/);
		await page
			.getByLabel('Descripción general', { exact: true })
			.fill('Un sitio con datos compartidos.');
		await page.getByRole('button', { name: /^Guardar/ }).click();
		await expect(page.getByText('Guardado.', { exact: true })).toBeVisible();
		await page.reload();
		await expect(page.getByLabel('Descripción general', { exact: true })).toHaveValue(
			'Un sitio con datos compartidos.'
		);
		await expect(
			page.locator('.vega-field-row[data-field="created"], .vega-field-row[data-field="updated"]')
		).toHaveCount(0);
		await page.screenshot({ path: info.outputPath('datos-del-sitio.png'), fullPage: true });
		await page.setViewportSize({ width: 390, height: 844 });
		if (await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).count())
			await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).click();
		await expect(page.locator('#vega-sidebar')).not.toBeInViewport();
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
		await page.screenshot({ path: info.outputPath('datos-del-sitio-mobile.png'), fullPage: true });
	});
});
