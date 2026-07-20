/**
 * Suite del lote L6c (rol editor plano, v5): degradado de la UI cuando la sesión NO tiene
 * privilegios de superuser (`capabilities.schemaBootstrap: false`/`schemaDiscovery: false`,
 * L6a). `loginAsDemo(page, { editorMode: true })` fija `window.__VEGA_FORCE_EDITOR_CAPABILITIES__`
 * (`session/backend.ts`) ANTES de que el bundle arranque: el `BackendPort` del adaptador `memory`
 * queda envuelto por `withEditorCapabilities`, que SOLO sustituye `capabilities` — el resto de
 * operaciones (`list`/`create`/`update`/…) siguen delegadas tal cual, así que el CRUD normal de
 * contenido sigue funcionando de verdad (el rol editor NO pierde acceso a datos, solo a las
 * operaciones de esquema reservadas a superuser).
 *
 * Cubre (ver la tarea del lote):
 * - la nav de CONTENIDO sigue intacta y el CRUD normal de registros funciona (aditivo: nada se
 *   esconde salvo lo exclusivo de superuser).
 * - `/settings`: el `ManifestEditor` NO se monta — se ve el estado degradado
 *   (`data-manifest-state="gated"`), nunca un editor roto ni un error; "Backend / conexión" (el
 *   sitio donde el editor introduce SU colección de auth) y "Acerca de" siguen visibles.
 * - `/media`: `collectionState: 'manual'` (la semilla no trae `vega_media`, mismo fixture que
 *   `e2e/media.spec.ts` Fase 6a) se degrada al mensaje "pide a un administrador"
 *   (`data-media-state="manual-editor"`), nunca el JSON de importación/instrucciones de bootstrap
 *   (ese es el mensaje pensado para quien SÍ tiene acceso al Admin de PocketBase).
 */
import { expect, loginAsDemo, test } from './fixtures';

async function loginAsEditorAndSettle(page: import('@playwright/test').Page): Promise<void> {
	await loginAsDemo(page, { editorMode: true });
	await page.waitForURL('**/c/site_info/new');
}

test.describe('nav de contenido + CRUD normal (rol editor)', () => {
	test('la sidebar pinta las colecciones de contenido y un registro se puede editar/guardar', async ({
		page
	}) => {
		await loginAsEditorAndSettle(page);

		const sidebar = page.getByRole('navigation', { name: 'Navegación principal' });
		await expect(sidebar.getByRole('link', { name: 'Entradas' })).toBeVisible();
		await expect(sidebar.getByRole('link', { name: 'Ajustes', exact: false })).toBeVisible();
		await expect(sidebar.getByRole('link', { name: 'Medios' })).toBeVisible();

		// CRUD real: el rol editor conserva acceso de datos (solo pierde esquema/bootstrap, L6a) —
		// mismo gesto que `e2e/form.spec.ts` "editar un registro existente y guardar persiste el
		// cambio", contra el mismo fixture (`posts.post_1`).
		await page.goto('/c/posts/post_1');
		await expect(page.getByRole('heading', { name: 'Editar «Entrada»' })).toBeVisible();
		await page.getByLabel('Title').fill('Bienvenido a Vega (editado por editor)');
		await page.getByRole('button', { name: 'Guardar' }).click();
		await expect(page.getByText('Guardado.')).toBeVisible();
	});
});

test.describe('/settings degradado (rol editor, sin schemaBootstrap)', () => {
	test('el ManifestEditor NO se monta: aviso degradado en su lugar, "Backend"/"Acerca de" intactas', async ({
		page
	}) => {
		await loginAsEditorAndSettle(page);

		await page.getByRole('link', { name: 'Ajustes', exact: false }).click();
		await page.waitForURL('**/settings');

		// El gate ocupa el hueco del editor: nunca el textarea del manifiesto.
		const gate = page.locator('[data-manifest-state="gated"]');
		await expect(gate).toBeVisible();
		await expect(
			gate.getByText('La edición del manifiesto requiere una cuenta de administrador')
		).toBeVisible();
		await expect(page.locator('#manifest-editor-textarea')).toHaveCount(0);

		// "Backend / conexión" (el sitio donde el editor fija SU colección de auth) sigue visible
		// y operable — incluye ahora el campo de colección de autenticación (L6c).
		await expect(page.getByRole('heading', { name: 'Backend / conexión' })).toBeVisible();
		await expect(page.getByLabel('Colección de autenticación')).toBeVisible();

		// "Acerca de" tampoco depende de `schemaBootstrap`.
		await expect(page.getByRole('region', { name: 'Acerca de' })).toBeVisible();
	});
});

test.describe('/media degradado (rol editor, collectionState "manual")', () => {
	test('muestra "pide a un administrador", nunca el JSON de importación', async ({ page }) => {
		await loginAsEditorAndSettle(page);

		await page.getByRole('link', { name: 'Medios' }).click();
		await page.waitForURL('**/media');

		const notice = page.locator('[data-media-state="manual-editor"]');
		await expect(notice).toBeVisible();
		await expect(
			notice.getByText('Pídele a un administrador que configure la colección de medios')
		).toBeVisible();

		// Nunca el mensaje/instrucciones pensados para quien SÍ tiene acceso al Admin de PB.
		await expect(page.getByText('Import collections')).toHaveCount(0);
		await expect(page.locator('.bootstrap-json')).toHaveCount(0);
	});
});
