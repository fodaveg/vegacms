/**
 * Suite del historial de versiones (`#lote-integridad`, Fase B1): bootstrap desde Ajustes →
 * editar → guardar → abrir "Historial" → ver el diff → "Restaurar en el formulario" (§8·B1).
 * Contra el adaptador `memory` (`DEMO_SEED`, ver `session/demo-seed.ts`), colección `posts`
 * (`getByLabel('Title')`/`getByLabel('Body')`, mismo criterio que `e2e/form.spec.ts`/
 * `e2e/media-integrity.spec.ts`).
 *
 * La papelera (B2) no se ejercita aquí: `vega_revisions` solo guarda `kind:'update'` en esta
 * fase, no hay nada que borrar/restaurar como papelera todavía.
 */
import { expect, loginAsDemo, test } from './fixtures';

async function loginAndSettle(page: import('@playwright/test').Page): Promise<void> {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
}

async function goToSettings(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('link', { name: 'Ajustes', exact: false }).click();
	await page.waitForURL('**/settings');
	await expect(page.locator('#manifest-editor-textarea')).toBeVisible();
}

/** Bootstrapea `vega_revisions` desde el gate de confirmación inline de "Historial y papelera"
 *  (mismo patrón que el de `/media`, §6 del contrato de Fase B). */
async function enableRevisions(page: import('@playwright/test').Page): Promise<void> {
	await goToSettings(page);
	// `<section aria-labelledby>` con accessible name gana el rol implícito "region" — se acota
	// aquí porque "Crear colección" también es el texto de `SchemaAuthoringPanel`, vecino en la
	// misma página.
	const section = page.getByRole('region', { name: 'Historial y papelera' });
	await expect(section).toBeVisible();
	await section.getByRole('button', { name: 'Crear colección de historial' }).click();
	await section.getByRole('button', { name: 'Crear colección', exact: true }).click();
	// Tras el bootstrap, la sección pasa a 'present': aparece el recuento (0 al principio).
	await expect(section.getByText('0 versión(es) guardadas ahora mismo.')).toBeVisible();
}

/** Crea un post nuevo con `title`, deja el navegador en su edición. `create` NUNCA snapshotea
 *  (§3, exclusión 3: "no hay pre-imagen que guardar") — el primer historial aparece en el
 *  siguiente `update`. `page.goto()` vale aquí (navegación de DOCUMENTO, recarga completa): el
 *  adaptador `memory` "recarga = reset" (ver `session/backend.ts`), inocuo si no hay ninguna
 *  mutación EN SESIÓN previa que conservar (mismo criterio que el resto de `e2e/form.spec.ts`). */
async function createPost(page: import('@playwright/test').Page, title: string): Promise<void> {
	await page.goto('/c/posts/new');
	await page.getByLabel('Title').fill(title);
	await page.getByLabel('Body').fill('Cuerpo inicial.');
	await page.getByRole('button', { name: 'Guardar' }).click();
	await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
}

/**
 * Igual que `createPost`, pero navegando ENTERAMENTE por la SPA (clics, nunca `page.goto`): el
 * bootstrap de `vega_revisions` (`enableRevisions`) es una mutación EN SESIÓN del adaptador
 * `memory` — una navegación de documento la perdería (`recarga = reset`). Necesario en cualquier
 * test que bootstrapee el historial y LUEGO cree/edite un registro en el mismo test.
 */
async function createPostViaNav(
	page: import('@playwright/test').Page,
	title: string
): Promise<void> {
	await page.getByRole('link', { name: 'Entradas', exact: false }).click();
	await page.waitForURL('**/c/posts');
	await page.getByRole('button', { name: 'Crear «Entrada»' }).click();
	await page.waitForURL('**/c/posts/new');
	await page.getByLabel('Title').fill(title);
	await page.getByLabel('Body').fill('Cuerpo inicial.');
	await page.getByRole('button', { name: 'Guardar' }).click();
	await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
}

test.describe('Historial de versiones (Fase B1)', () => {
	test('sin vega_revisions bootstrapeada: el panel dice "no está activado", nunca miente prometiendo historial', async ({
		page
	}) => {
		await loginAndSettle(page);
		await createPost(page, 'Post sin historial activado');

		await page.getByRole('button', { name: 'Historial' }).click();
		await expect(
			page.getByText('El historial de versiones no está activado en este proyecto.')
		).toBeVisible();
	});

	test('editar → guardar → abrir historial → ver el diff → restaurar en el formulario', async ({
		page
	}) => {
		await loginAndSettle(page);
		await enableRevisions(page);

		await createPostViaNav(page, 'Título original');

		// La creación NO genera revisión (exclusión 3): el historial sigue vacío en este punto.
		await page.getByRole('button', { name: 'Historial' }).click();
		await expect(page.getByText('Todavía no hay versiones guardadas.')).toBeVisible();
		await page.getByRole('button', { name: 'Historial' }).click(); // colapsa de nuevo

		// El PRIMER `update` SÍ snapshotea: guarda la PRE-IMAGEN ('Título original').
		await page.getByLabel('Title').fill('Título editado');
		await page.getByRole('button', { name: 'Guardar' }).click();
		await expect(page.getByLabel('Title')).toHaveValue('Título editado');

		await page.getByRole('button', { name: 'Historial' }).click();
		const revisionItem = page.locator('.vega-revisions-item').first();
		await expect(revisionItem).toBeVisible();
		await expect(revisionItem).toContainText('demo@vega.dev');

		await revisionItem.click();

		// Diff revisión (PRE-IMAGEN, 'Título original') ↔ versión viva ('Título editado').
		await expect(page.getByText('Título original')).toBeVisible();
		await expect(page.getByText('Título editado', { exact: false }).first()).toBeVisible();

		await page.getByRole('button', { name: 'Restaurar en el formulario' }).click();

		// §8·B1: NO se escribe nada al puerto — el campo cambia en el FORMULARIO, sin recargar.
		await expect(page.getByLabel('Title')).toHaveValue('Título original');
		await expect(
			page.getByText('Valores cargados en el formulario.', { exact: false })
		).toBeVisible();

		// La persona revisa y guarda: eso sí persiste el valor restaurado.
		await page.getByRole('button', { name: 'Guardar' }).click();
		await expect(page.getByLabel('Title')).toHaveValue('Título original');
	});
});

test.describe('dos escritores del manifiesto en /settings no se pisan (fix de code-review)', () => {
	test('editar el nombre del sitio y guardar la retención del historial: ninguno de los dos guardados pierde al otro', async ({
		page
	}) => {
		await loginAndSettle(page);
		await enableRevisions(page);

		// Escritor 1 (`ManifestEditor`): edita `site.name` y guarda.
		const textarea = page.locator('#manifest-editor-textarea');
		const original = await textarea.inputValue();
		expect(original).toContain('Vega Demo');
		await textarea.fill(original.replace('Vega Demo', 'Vega Demo Editado'));
		await page.getByRole('button', { name: 'Guardar', exact: true }).click();
		await expect(page.getByRole('status')).toContainText('Guardado.');
		await expect(page.locator('.vega-topbar-site')).toContainText('Vega Demo Editado');

		// Escritor 2 (`RevisionsSettings`): ajusta "Días en la papelera" y guarda la retención —
		// SIN volver a tocar el textarea del manifiesto.
		const section = page.getByRole('region', { name: 'Historial y papelera' });
		const trashDaysInput = section.getByLabel('Días en la papelera');
		await trashDaysInput.fill('45');
		await section.getByRole('button', { name: 'Guardar retención' }).click();
		// El primer guardado (escritor 1) también dejó su toast en pantalla: se acota al ÚLTIMO.
		await expect(page.getByText('Manifiesto guardado.').last()).toBeVisible();

		// El cambio de `site.name` del escritor 1 NO desapareció (el bug: el segundo guardado
		// pisaba en silencio con una copia rancia del manifiesto, sin `revisions` Y sin el
		// `site.name` editado).
		await expect(page.locator('.vega-topbar-site')).toContainText('Vega Demo Editado');
		// Y el textarea del editor (limpio, sin edición pendiente) se resincronizó SOLO con
		// AMBOS cambios — la retención que el otro escritor acaba de guardar.
		const finalValue = await textarea.inputValue();
		expect(finalValue).toContain('Vega Demo Editado');
		expect(finalValue).toContain('"trashDays": 45');
		// Sin aviso de "cambiado por otro sitio": el editor estaba limpio, se re-sembró en
		// silencio (no hay ningún borrador que proteger).
		await expect(page.locator('.manifest-editor-external-change')).toHaveCount(0);
	});
});
