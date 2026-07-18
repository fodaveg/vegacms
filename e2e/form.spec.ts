/**
 * Suite de la Fase F5-a del contrato P5 (§4 "Contrato de tests", plan §5): el armazón real de
 * `/c/[type]/new` y `/c/[type]/[id]` contra `posts` (title required + maxLength 120, status,
 * body — tipo trivial, ver `session/demo-seed.ts`) del adaptador `memory`.
 *
 * Cubre: crear → navega a la edición del nuevo id (D-P5.11); editar → persiste; validación
 * CLIENTE (`required`, D-P5.3) bloquea el envío sin tocar la red; validación de BACKEND
 * (`maxLength`, que el cliente no comprueba) se pinta bajo el campo (L-P5.4); guard de salida
 * dirty→confirmar/cancelar (D-P5.5, `beforeNavigate` + `window.confirm`); `id` inexistente →
 * not-found en contexto (L-P5.7); un campo `number` que arranca en `null` (`metrics`) persiste
 * como NÚMERO, no como texto (fix de code-review sobre `GenericInput.svelte`, ver ese fichero).
 *
 * Nota de "persistencia" (landmine documentada en `session/backend.ts`, "recargar = reset"): el
 * adaptador `memory` NO sobrevive a una carga de documento real (`page.reload()`/`page.goto()`
 * en Playwright son navegaciones DURAS, JS realm nuevo → `DEMO_SEED` fresco). Verificar que un
 * cambio "persiste" aquí significa releerlo por una vía DISTINTA a la del propio guardado (un
 * viaje redondo `update`/`create` → `list`/`get`) SIN salir del documento: se navega DENTRO de
 * la SPA (clics de enlace/botón, `ctx.nav.*`/`goto()` client-side, `page.goBack()` — SvelteKit
 * intercepta el popstate, P3-L9 —), nunca `page.reload()`/`page.goto()`.
 */
import { expect, loginAsDemo, test } from './fixtures';

async function loginAndSettle(page: import('@playwright/test').Page): Promise<void> {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
}

test.describe('crear (D-P5.11)', () => {
	test('crear un post navega a la edición del nuevo id, con el valor persistido', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');

		await expect(page.getByRole('heading', { name: 'Crear «Entrada»' })).toBeVisible();
		await page.getByLabel('Title').fill('Entrada nueva de e2e');
		await page.getByRole('button', { name: 'Guardar' }).click();

		// D-P5.11: tras crear, navega a la edición del registro recién creado (no al listado).
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		await expect(page.getByRole('heading', { name: 'Editar «Entrada»' })).toBeVisible();
		await expect(page.getByLabel('Title')).toHaveValue('Entrada nueva de e2e');

		// Persistido de verdad (ver nota de cabecera): vuelve al listado (SPA) y entra de nuevo al
		// MISMO registro por su enlace de título — un viaje redondo `create` → `list` → `get`.
		await page.getByRole('button', { name: 'Volver' }).click();
		await page.waitForURL('**/c/posts');
		await page.getByRole('link', { name: 'Entrada nueva de e2e' }).click();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		await expect(page.getByLabel('Title')).toHaveValue('Entrada nueva de e2e');
	});

	test('validación cliente (required) bloquea el envío sin navegar ni tocar la red', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');

		await page.getByRole('button', { name: 'Guardar' }).click();

		await expect(
			page.getByRole('alert').filter({ hasText: 'Este campo es obligatorio.' })
		).toBeVisible();
		await expect(page).toHaveURL(/\/c\/posts\/new$/);
	});

	test('validación de BACKEND (maxLength, que el cliente no comprueba) se pinta bajo el campo', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');

		// `title` tiene `maxLength: 120` (demo-seed): el cliente (D-P5.3) solo comprueba
		// `required`/`maxSelect`, así que esto SOLO lo rechaza el backend — ejercita L-P5.4 de
		// verdad, no un duplicado de la validación cliente.
		await page.getByLabel('Title').fill('x'.repeat(200));
		await page.getByRole('button', { name: 'Guardar' }).click();

		await expect(
			page.getByRole('alert').filter({ hasText: 'El texto es demasiado largo.' })
		).toBeVisible();
		await expect(page).toHaveURL(/\/c\/posts\/new$/);
	});
});

test.describe('editar', () => {
	test('editar un registro existente y guardar persiste el cambio', async ({ page }) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/post_1');

		await expect(page.getByRole('heading', { name: 'Editar «Entrada»' })).toBeVisible();
		await expect(page.getByLabel('Title')).toHaveValue('Bienvenido a Vega');

		await page.getByLabel('Title').fill('Bienvenido a Vega (editado)');
		await page.getByRole('button', { name: 'Guardar' }).click();
		await expect(page.getByText('Guardado.')).toBeVisible();

		// Persistido de verdad (ver nota de cabecera): vuelve al listado (SPA) y entra de nuevo al
		// MISMO registro por su enlace de título — un viaje redondo `update` → `list` → `get`.
		await page.getByRole('button', { name: 'Volver' }).click();
		await page.waitForURL('**/c/posts');
		await page.getByRole('link', { name: 'Bienvenido a Vega (editado)' }).click();
		await page.waitForURL('**/c/posts/post_1');
		await expect(page.getByLabel('Title')).toHaveValue('Bienvenido a Vega (editado)');
	});
});

test.describe('guard de salida (D-P5.5)', () => {
	test('editar→dirty→"Volver" pide confirmación; cancelar se queda, confirmar navega', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/post_2');
		await page.getByLabel('Title').fill('Borrador en curso (con cambios)');

		// Cancelar: el diálogo nativo se descarta → la navegación se cancela, el formulario sigue
		// aquí con el cambio intacto (no se pierde nada).
		page.once('dialog', (dialog) => void dialog.dismiss());
		await page.getByRole('button', { name: 'Volver' }).click();
		await expect(page).toHaveURL(/\/c\/posts\/post_2$/);
		await expect(page.getByLabel('Title')).toHaveValue('Borrador en curso (con cambios)');

		// Confirmar: ahora sí navega al listado.
		page.once('dialog', (dialog) => void dialog.accept());
		await page.getByRole('button', { name: 'Volver' }).click();
		await page.waitForURL('**/c/posts');
	});
});

test.describe('not-found de registro (L-P5.7)', () => {
	test('/c/posts/id-inexistente muestra not-found en contexto, con vuelta al listado', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/id-inexistente');

		const state = page.getByRole('alert').filter({ hasText: 'Registro no encontrado' });
		await expect(state).toBeVisible();
		await expect(state).toHaveAttribute('data-route-state', 'not-found');

		await state.getByRole('button', { name: 'Volver al listado' }).click();
		await page.waitForURL('**/c/posts');
	});
});

test.describe('campo number desde null (fix de code-review, GenericInput.svelte)', () => {
	test('crear un metrics con Count numérico persiste como NÚMERO, no como texto', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/metrics/new');

		await expect(page.getByRole('heading', { name: 'Crear «Métrica»' })).toBeVisible();
		// `count` arranca en `null` (default de creación de todo `number`, `normalizeFieldValue`
		// §2.1) — exactamente el caso que `GenericInput` confundía con "texto" antes del fix.
		await page.getByLabel('Count').fill('123');
		await page.getByRole('button', { name: 'Guardar' }).click();

		await page.waitForURL(/\/c\/metrics\/(?!new)[^/]+$/);
		await expect(page.getByRole('heading', { name: 'Editar «Métrica»' })).toBeVisible();
		// Prueba DIRECTA del fix: este campo lo pinta el `VegaRecord` que devolvió
		// `ctx.port.create` (RecordForm reasienta baseline desde ÉL, no desde el eco local del
		// widget). Con el bug, el `RecordInput` viajaba con `count: "123"` (string); el adaptador
		// `memory` (`normalizeFieldValue`, tipo `number`: `typeof raw === 'number' ? raw : null`)
		// lo habría degradado a `null` AL ESCRIBIR — este campo se vería VACÍO, no "123".
		await expect(page.getByLabel('Count')).toHaveValue('123');

		// Ronda completa sin recargar el documento (ver nota de cabecera): vuelve al listado (SPA)
		// y navega atrás por el histórico del propio router (`goBack`, también client-side) hasta
		// este mismo registro — una carga FRESCA vía `ctx.port.get`, no el estado ya en memoria del
		// componente, para descartar que el valor solo "se viera bien" en el propio formulario.
		await page.getByRole('button', { name: 'Volver' }).click();
		await page.waitForURL('**/c/metrics');
		await page.goBack();
		await page.waitForURL(/\/c\/metrics\/(?!new)[^/]+$/);
		await expect(page.getByLabel('Count')).toHaveValue('123');
	});
});
