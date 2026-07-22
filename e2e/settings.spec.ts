/**
 * Suite B.13 (§7 del contrato P3, §3.5/§3.5.1, Fase 3b — última pieza de P3): `/settings` monta
 * el `ManifestEditor` REAL de P2 (dry-run → save → reload), el indicador global de warnings
 * (badge de la sidebar + lista completa en `/settings`, L10) y el e2e CLAVE de esta fase —
 * expiración de sesión a MITAD de edición (§7.B.10), que a diferencia de `relogin.spec.ts` (2c)
 * ejercita un formulario con estado real (el `<textarea>` del manifiesto), no solo el overlay.
 *
 * El warning sembrado (`icon-unknown` sobre `posts`, ver cabecera de `session/demo-seed.ts`) hace
 * que `/settings` NO llegue nunca con `model.warnings` vacío en esta suite: útil para probar
 * badge+lista sin manipular el manifiesto a mano.
 */
import { expect, loginAsDemo, test } from './fixtures';

/** Ver `relogin.spec.ts`/`feedback.spec.ts`: mismo motivo para tipar aquí en vez de importar
 *  `src/app.d.ts` (Playwright corre en un runtime Node aparte que no resuelve esos tipos). */
interface VegaTestWindow extends Window {
	__VEGA_FORCE_EXPIRE__?: boolean;
}

async function loginAndSettle(page: import('@playwright/test').Page): Promise<void> {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
	await expect(page.getByRole('link', { name: 'Información del sitio' })).toBeVisible();
}

async function goToSettings(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('link', { name: 'Ajustes', exact: false }).click();
	await page.waitForURL('**/settings');
	await expect(page.locator('#manifest-editor-textarea')).toBeVisible();
}

test.describe('/settings monta el ManifestEditor de P2 (§7.B.13)', () => {
	test('el editor se ve y guarda un manifiesto editado (collectionState "present")', async ({
		page
	}) => {
		await loginAndSettle(page);
		await goToSettings(page);

		// El manifiesto de la semilla ya existe (colección `vega` presente): "Guardar" está
		// habilitado sin necesidad de la confirmación de bootstrap (esa es `collectionState:
		// 'creatable'`, ya cubierta por los tests del editor de P2 — anotado en el contrato).
		const textarea = page.locator('#manifest-editor-textarea');
		const original = await textarea.inputValue();
		expect(original).toContain('Vega Demo');

		const edited = original.replace('Vega Demo', 'Vega Demo Editado');
		await textarea.fill(edited);

		await page.getByRole('button', { name: 'Guardar', exact: true }).click();

		// Mensaje inline del editor (P2) + el toast de éxito que P3 añade en el wrapper de `onSave`
		// (§6.3.4: `onSave` llama `saveManifest` y luego `reloadModel()` antes de que el editor
		// marque "Guardado."). No se recarga la página: el adaptador `memory` de esta demo no
		// persiste entre recargas por diseño (ver `backend/adapters/memory`), así que la prueba de
		// persistencia real es contrato de P1, no de esta suite.
		await expect(page.getByRole('status')).toContainText('Guardado.');
		await expect(page.getByText('Manifiesto guardado.')).toBeVisible();

		// L9: `reloadModel()` aplica `site.name` al shell EN CALIENTE. Esta aserción evita una
		// falsa implementación que guarde el JSON pero deje el nombre de la cabecera hardcodeado
		// hasta la siguiente recarga completa.
		const site = page.locator('.vega-topbar-site');
		await expect(site).toContainText('Vega Demo Editado');
		await expect(site).toHaveAttribute('title', 'Vega Demo Editado');
	});
});

test.describe('sección "Acerca de" (P8·F2 — versión + rango de servidor PB horneados)', () => {
	// Guard de la única feature de F2 que solo existe por el `define` de Vite (`__VEGA_VERSION__`/
	// `__VEGA_PB_SERVER_RANGE__`, ver `vite.config.ts` + `src/lib/version.ts`): esos globals son
	// `declare const` ambientes, así que si alguien rompe la relación con `define` NI `check` NI
	// `lint` NI los unit tests avisarían — solo reventaría en runtime al montar `/settings`. Este
	// e2e es el único que lo ejercita de verdad (versión REAL horneada, no un literal duplicado).
	test('muestra la versión de Vega y el rango de servidor PocketBase soportado', async ({
		page
	}) => {
		await loginAndSettle(page);
		await goToSettings(page);

		const about = page.getByRole('region', { name: 'Acerca de' });
		await expect(about).toBeVisible();
		// No fijamos el número exacto (lo hornea `package.json#version` — un bump legítimo no debe
		// romper el test); sí exigimos el formato "Vega v<semver> · PocketBase <rango>", que prueba
		// que AMBOS globals se hornearon y se interpolaron por i18n (no quedaron como `{version}`).
		await expect(about).toContainText(/Vega v\d+\.\d+\.\d+ · PocketBase /);
	});
});

test.describe('indicador de warnings (§3.5.1, L10)', () => {
	test('el badge de la sidebar y la lista de /settings reflejan el warning sembrado', async ({
		page
	}) => {
		await loginAndSettle(page);

		const settingsLink = page.getByRole('link', { name: 'Ajustes', exact: false });
		const badge = settingsLink.locator('.vega-warnings-badge');
		await expect(badge).toHaveText('1');
		await expect(badge).toHaveAttribute('aria-label', '1 avisos');

		await goToSettings(page);

		await expect(page.getByRole('heading', { name: 'Avisos del modelo' })).toBeVisible();
		await expect(
			page.getByText('El icono "rocket-unknown" de "posts" no existe en el set de iconos')
		).toBeVisible();
	});
});

test.describe('expiración durante edición en /settings (§7.B.10 — el test clave de esta fase)', () => {
	test('el overlay de re-login aparece SOBRE /settings, el texto escrito sigue ahí, y reautenticar lo conserva', async ({
		page
	}) => {
		await loginAndSettle(page);
		await goToSettings(page);

		const draft = '{\n  "schemaVersion": 1,\n  "site": { "name": "Editando en vivo" }\n}';
		const textarea = page.locator('#manifest-editor-textarea');
		await textarea.fill(draft);

		// Fuerza expiración en la PRÓXIMA `list`/`listContentTypes` (ver cabecera de `backend.ts`):
		// dispararla con "Recargar modelo" (§3.2), no con "Guardar" — así se ensaya la expiración SIN
		// tocar el manifiesto guardado, aislada del flujo de guardado.
		await page.evaluate(() => {
			(window as unknown as VegaTestWindow).__VEGA_FORCE_EXPIRE__ = true;
		});
		await page.getByRole('button', { name: 'Recargar modelo' }).click();

		const dialog = page.getByRole('dialog', { name: 'Tu sesión ha caducado' });
		await expect(dialog).toBeVisible();

		// La ruta NO cambió a /login: el overlay TAPA /settings, no la reemplaza (P3-L5).
		await expect(page).toHaveURL(/\/settings$/);
		// El shell de debajo sigue montado (no se desmontó por el fallo de recarga, ver el guard
		// `isReload` de `+layout.svelte`)…
		await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeAttached();
		// …y, sobre todo, el borrador escrito en el textarea SIGUE ahí: el `ManifestEditor` nunca se
		// desmontó, así que su `rawText` interno no se perdió.
		await expect(textarea).toHaveValue(draft);

		await page.getByLabel('Correo electrónico').fill('demo@vega.dev');
		await page.getByLabel('Contraseña').fill('vega-demo');
		await page.getByRole('button', { name: 'Reautenticar' }).click();

		await expect(dialog).not.toBeVisible();
		await expect(page).toHaveURL(/\/settings$/);
		// El borrador sigue intacto tras reautenticar: nada lo descartó en el camino.
		await expect(textarea).toHaveValue(draft);
	});
});
