/**
 * L13: build real y RecordForm real, con memory y las tres rutas HTTP interceptadas.
 * Este doble contractual no certifica reglas PB, SSR del sitio ni revocación Go↔Astro.
 * URL y token de esta prueba son sintéticos; no se abre el sitio ni se registra su dirección.
 */
import type { Page } from '@playwright/test';
import { expect, loginAsDemo, test } from './fixtures';

const API = 'http://localhost:4173/api/l13-preview';
const SYNTHETIC_URL = `https://share.example/preview-share/${'synthetic'.repeat(45)}`;
const label = 'Cliente '.repeat(15);
const row = {
	id: 'synthetic-link-1',
	label,
	createdAt: '2026-10-07T12:00:00Z',
	expiresAt: '2099-10-08T12:00:00Z',
	createdBy: 'demo-editor',
	createdByCollection: 'vega_editors'
};
interface RequestBody {
	collection: string;
	id: string;
	ttlSeconds?: number;
	label?: string;
	linkId?: string;
}
async function install(page: Page, status = 201, enabled = true) {
	const requests: RequestBody[] = [];
	let items: (typeof row)[] = [];
	let lists = 0;
	await page.addInitScript(
		({ api, enabled }) => {
			Object.assign(window, { __VEGA_PREVIEW_API_URL__: api, __VEGA_PREVIEW_SHARE__: enabled });
		},
		{ api: API, enabled }
	);
	await page.route(`${API}/share**`, async (route) => {
		const request = route.request();
		if (request.method() === 'GET') {
			lists++;
			await route.fulfill({ status: 200, json: { items } });
			return;
		}
		const body = request.postDataJSON() as RequestBody;
		requests.push(body);
		if (request.url().endsWith('/revoke')) {
			items = items.filter((item) => item.id !== body.linkId);
			await route.fulfill({ status: 204 });
		} else if (status === 201) {
			items = [{ ...row, label: body.label ?? '' }];
			await route.fulfill({ status, json: { ...items[0], url: SYNTHETIC_URL } });
		} else {
			await route.fulfill({ status, json: { message: 'Synthetic backend detail: never render' } });
		}
	});
	return { requests, listCount: () => lists };
}
async function editor(page: Page) {
	await loginAsDemo(page, { seedShowcase: true });
	await page.goto('/c/paginas/pagina_2');
	await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Sobre mí');
}
async function open(page: Page) {
	await page.getByRole('button', { name: 'Compartir vista previa', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('button', { name: 'Crear enlace', exact: true })).toHaveAttribute(
		'aria-disabled',
		'false'
	);
	return dialog;
}
async function noOverflow(page: Page) {
	const geometry = await page.getByRole('dialog').evaluate((dialog) => {
		const rect = dialog.getBoundingClientRect();
		return {
			left: rect.left,
			right: rect.right,
			width: innerWidth,
			content: dialog.scrollWidth,
			box: dialog.clientWidth,
			document: document.documentElement.scrollWidth
		};
	});
	expect(geometry.left).toBeGreaterThanOrEqual(0);
	expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
	expect(geometry.content).toBeLessThanOrEqual(geometry.box + 1);
	expect(geometry.document).toBeLessThanOrEqual(geometry.width + 1);
}

for (const width of [390, 1440]) {
	for (const mode of ['light', 'dark']) {
		test(`crear/copiar/listar/anular, dirty intacto y sin overflow ${width} ${mode}`, async ({
			page,
			context
		}) => {
			await page.setViewportSize({ width, height: 900 });
			await page.addInitScript((mode) => localStorage.setItem('vega.mode.v1', mode), mode);
			await context.grantPermissions(['clipboard-read', 'clipboard-write']);
			const http = await install(page);
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.name));
			await editor(page);
			await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
			await page.getByLabel('Título', { exact: true }).fill('Cambios sin guardar');
			const dialog = await open(page);
			await expect(dialog).toContainText('Se compartirá la versión guardada');
			expect(await dialog.evaluate((el) => el.closest('form') === null)).toBe(true);
			await noOverflow(page);
			await dialog.getByRole('button', { name: 'Crear enlace', exact: true }).click();
			await dialog.getByLabel('Etiqueta (opcional)').fill(label);
			await dialog.getByLabel('Duración', { exact: true }).fill('1');
			await dialog.getByLabel('Unidad de duración').selectOption('seconds');
			await page.keyboard.press('Control+s');
			expect(http.requests).toHaveLength(0);
			await dialog.getByRole('button', { name: 'Crear enlace', exact: true }).click();
			await expect(dialog.getByLabel('Enlace para compartir')).toHaveValue(SYNTHETIC_URL);
			expect(http.requests).toEqual([
				{ collection: 'paginas', id: 'pagina_2', ttlSeconds: 1, label: label.trim() }
			]);
			await noOverflow(page);
			await dialog.getByRole('button', { name: 'Copiar enlace' }).click();
			await expect(dialog).toContainText('Enlace copiado');
			expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SYNTHETIC_URL);
			await dialog
				.locator('.vega-admin-dialog-actions')
				.getByRole('button', { name: 'Cerrar', exact: true })
				.click();
			await expect(dialog).toHaveCount(0);
			await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Cambios sin guardar');
			await expect(
				page.getByRole('button', { name: 'Compartir vista previa', exact: true })
			).toBeFocused();
			await open(page);
			await expect(dialog.getByLabel('Enlace para compartir')).toHaveCount(0);
			await expect(dialog).not.toContainText(SYNTHETIC_URL);
			expect(http.listCount()).toBe(2);
			await noOverflow(page);
			await dialog.getByRole('button', { name: `Anular: ${label.trim()}`, exact: true }).click();
			await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
			await dialog.getByRole('button', { name: 'Anular enlace', exact: true }).click();
			await expect(dialog).toContainText('Enlace anulado');
			await expect(dialog.locator('.vega-share-list li')).toHaveCount(0);
			expect(http.requests[1]).toEqual({ collection: 'paginas', id: 'pagina_2', linkId: row.id });
			expect(errors).toEqual([]);
		});
	}
}

for (const [status, message] of [
	[400, 'El servidor no admite esta duración o etiqueta'],
	[403, 'Compartir requiere permiso'],
	[404, 'El registro o los enlaces compartidos no están disponibles'],
	[409, 'Ya hay 20 enlaces vigentes'],
	[503, 'El servidor todavía no tiene lista la función de compartir']
] as const) {
	test(`POST ${status} conserva borrador y muestra categoría fija`, async ({ page }) => {
		const http = await install(page, status);
		await editor(page);
		const dialog = await open(page);
		await dialog.getByRole('button', { name: 'Crear enlace', exact: true }).click();
		await dialog.getByLabel('Etiqueta (opcional)').fill('Ana');
		await dialog.getByLabel('Duración', { exact: true }).fill('5');
		await dialog.getByRole('button', { name: 'Crear enlace', exact: true }).click();
		await expect(dialog.getByRole('alert')).toContainText(message);
		await expect(dialog).not.toContainText('Synthetic backend detail');
		await expect(dialog.getByLabel('Etiqueta (opcional)')).toHaveValue('Ana');
		await expect(dialog.getByLabel('Duración', { exact: true })).toHaveValue('5');
		expect(http.requests).toHaveLength(1);
	});
}

test('sin opt-in, registro nuevo y tipo sin escritura no ofrecen compartir', async ({ page }) => {
	await install(page, 201, false);
	await editor(page);
	await expect(page.getByRole('button', { name: 'Compartir vista previa' })).toHaveCount(0);
	await page.goto('/c/paginas/new');
	await expect(page.getByLabel('Título', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Compartir vista previa' })).toHaveCount(0);
});

test('share habilitado sigue oculto en registro nuevo y permisos solo lectura', async ({
	page
}) => {
	await install(page);
	await loginAsDemo(page);
	await page.goto('/c/site_info/new');
	await expect(page.getByRole('button', { name: 'Compartir vista previa' })).toHaveCount(0);
	await page.goto('/c/avisos/aviso_1');
	const readonlyTitle = page.getByRole('textbox', { name: 'Título', exact: true });
	await expect(readonlyTitle).toHaveValue('Aviso que no se puede editar');
	await expect(readonlyTitle).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Compartir vista previa' })).toHaveCount(0);
});
