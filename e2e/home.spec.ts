/**
 * Inicio v2 (lámina `design/mockups/2026-10-20-inicio-profesional/inicio-v2.html`): el bento a
 * todo el ancho cuando no hay publicación, y la tarjeta de marca con «Publicar ahora» cuando el
 * proyecto anuncia un endpoint de build. Ese endpoint lo anuncia `window.__VEGA_BUILD_API_URL__`
 * (solo `memory`) y lo contesta este spec con `page.route()`: el gancho anuncia, no implementa.
 */
import type { Page } from '@playwright/test';
import { expect, loginAsDemo, test, waitForHome } from './fixtures';

const BUILD = 'https://build.example.test/api/vega-build';

/** Endpoint de build de mentira: estado «ok» publicado el 20 jul (antes de las ediciones del
 *  escaparate) y un `trigger` que acepta. Devuelve los métodos y rutas recibidos. */
async function routeBuild(page: Page): Promise<string[]> {
	const calls: string[] = [];
	const headers = {
		// Sin credenciales (el token va en `Authorization`): `*` vale y no ata el spec a un puerto.
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
		'Access-Control-Allow-Headers': 'Authorization,Accept,Content-Type'
	};
	await page.route(`${BUILD}/**`, async (route) => {
		const request = route.request();
		if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
		calls.push(`${request.method()} ${new URL(request.url()).pathname.split('/').at(-1)}`);
		if (request.url().endsWith('/trigger')) {
			return route.fulfill({
				status: 202,
				headers,
				contentType: 'application/json',
				body: '{"id":"run-1"}'
			});
		}
		return route.fulfill({
			headers,
			contentType: 'application/json',
			body: JSON.stringify({
				state: 'ok',
				startedAt: '2026-07-20T16:38:00.000Z',
				finishedAt: '2026-07-20T16:40:00.000Z',
				lastPublishedAt: '2026-07-20T16:40:00.000Z',
				logUrl: null,
				detail: null
			})
		});
	});
	await page.addInitScript((url) => {
		(window as unknown as { __VEGA_BUILD_API_URL__?: string }).__VEGA_BUILD_API_URL__ = url;
	}, BUILD);
	return calls;
}

test('sin publicación, los tiles ocupan todo el ancho del bento (4 columnas a 1440)', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await loginAsDemo(page, { seedShowcase: true });
	await waitForHome(page);

	await expect(page.locator('[data-pending="unpublished"]')).toHaveCount(0);
	const tiles = page.locator('.vega-home-bento .tiles');
	await expect(tiles).toBeVisible();
	const bento = await page.locator('.vega-home-bento').boundingBox();
	const grid = await tiles.boundingBox();
	expect(grid!.width).toBeGreaterThan(bento!.width - 2);
	const firstRowTops = await tiles
		.locator('li')
		.evaluateAll((items) =>
			items.slice(0, 4).map((item) => Math.round(item.getBoundingClientRect().top))
		);
	expect(new Set(firstRowTops).size).toBe(1);
});

test('con cambios sin publicar, la tarjeta de marca publica con el flujo de la barra', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const calls = await routeBuild(page);
	await loginAsDemo(page, { seedShowcase: true });
	await waitForHome(page);

	const card = page.locator('[data-pending="unpublished"]');
	await expect(card.getByRole('heading', { level: 2 })).toHaveText(
		'Hay cambios que el sitio todavía no enseña.'
	);
	await expect(card).not.toHaveClass(/calm/);
	await expect(card).toContainText('Última publicación: 20 jul,');
	// Solo la acción: el panel de estado es de la barra.
	await expect(card.locator('details')).toHaveCount(0);

	await card.getByRole('button', { name: 'Publicar ahora' }).click();
	await expect.poll(() => calls.filter((call) => call === 'POST trigger').length).toBe(1);
});

test('el saludo lleva el nombre de la sesión cuando la cuenta lo tiene', async ({ page }) => {
	await loginAsDemo(page, { seedShowcase: true });
	await waitForHome(page);
	await expect(page.locator('.vega-home h1 em')).toHaveText('David');
});

test('móvil: la lupa despliega el buscador bajo la barra y Escape lo pliega', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await loginAsDemo(page, { seedShowcase: true });
	await waitForHome(page);

	const search = page.getByRole('combobox', { name: 'Búsqueda global' });
	await expect(search).toBeHidden();
	const toggle = page.getByRole('button', { name: 'Búsqueda global' });
	await toggle.click();
	await expect(search).toBeVisible();
	await expect(search).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(search).toBeHidden();
	await expect(toggle).toBeFocused();
	// Una sola fila de barra: nada desborda la página.
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
});
