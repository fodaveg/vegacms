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
 *
 * **Añadido en F5-b (contrato P5)**: los describe de más abajo cubren los 10 widgets escalares
 * dedicados que sustituyeron a `GenericInput` (`text, textarea, number, switch, email, url,
 * datetime, select, chips, json`), sobre los campos añadidos a `posts`/`authors` en la semilla
 * (ver `session/demo-seed.ts`, sección "Añadido en F5-b"): control HTML correcto, edición emite
 * el tipo de dominio correcto, persiste en un viaje redondo, y un campo `readonly` de verdad
 * (`authors.joinedAt`) nunca acepta edición.
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
		// verdad, no un duplicado de la validación cliente. Desde F5-b el widget `text` añade el
		// atributo NATIVO `maxlength` (afordancia del navegador, ver `Text.svelte`): `.fill()`
		// respeta ese límite (igual que tecleo/pegado reales), así que ya NO basta para forzar el
		// caso — se asigna el valor por debajo del DOM y se dispara `input` a mano, simulando un
		// cliente que sí manda más de 120 caracteres (afordancia del navegador, no enforcement).
		await page.getByLabel('Title').evaluate((el, value) => {
			const input = el as HTMLInputElement;
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}, 'x'.repeat(200));
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

test.describe('widgets escalares dedicados (F5-b)', () => {
	test('posts: text/textarea/select/chips/datetime/url/email/json pintan su control y persisten', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');

		// text
		const title = page.getByLabel('Title');
		await expect(title).toHaveAttribute('type', 'text');
		await title.fill('Post con todos los widgets');

		// textarea (override de manifiesto `widget: 'textarea'` sobre un campo `text`, D-P5/L9)
		const body = page.getByLabel('Body');
		expect(await body.evaluate((el) => el.tagName)).toBe('TEXTAREA');
		await body.fill('Cuerpo largo\ncon varias líneas');

		// select (single)
		const status = page.getByLabel('Status');
		expect(await status.evaluate((el) => el.tagName)).toBe('SELECT');
		await status.selectOption('published');

		// chips (select múltiple, maxSelect: 2 — ver seed): togglear dos opciones agota el límite,
		// la tercera queda deshabilitada (afordancia UX de `Chips.svelte`).
		const tagsRow = page.locator('[data-field="tags"]');
		await tagsRow.getByRole('button', { name: 'vega' }).click();
		await tagsRow.getByRole('button', { name: 'demo' }).click();
		await expect(tagsRow.getByRole('button', { name: 'vega' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(tagsRow.getByRole('button', { name: 'news' })).toBeDisabled();

		// datetime (input datetime-local, conversión UTC↔local de `datetime.ts`)
		const publishedAt = page.getByLabel('Published at');
		await expect(publishedAt).toHaveAttribute('type', 'datetime-local');
		await publishedAt.fill('2024-06-01T09:15');

		// url
		const website = page.getByLabel('Website');
		await expect(website).toHaveAttribute('type', 'url');
		await website.fill('https://vega.example.dev');

		// email
		const contactEmail = page.getByLabel('Contact email');
		await expect(contactEmail).toHaveAttribute('type', 'email');
		await contactEmail.fill('demo@vega.dev');

		// json (textarea con parseo best-effort)
		const meta = page.getByLabel('Meta');
		await meta.fill('{"tema":"oscuro"}');

		await page.getByRole('button', { name: 'Guardar' }).click();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);

		// Cada widget pinta el valor que devolvió `ctx.port.create` (mismo criterio que el test de
		// `count` de más arriba): confirma tipo Y persistencia a la vez.
		await expect(page.getByLabel('Title')).toHaveValue('Post con todos los widgets');
		await expect(page.getByLabel('Website')).toHaveValue('https://vega.example.dev');
		await expect(page.getByLabel('Contact email')).toHaveValue('demo@vega.dev');
		await expect(page.getByLabel('Published at')).toHaveValue('2024-06-01T09:15');
		await expect(page.getByLabel('Meta')).toHaveValue('{\n  "tema": "oscuro"\n}');
		const tagsRowAfterSave = page.locator('[data-field="tags"]');
		await expect(tagsRowAfterSave.getByRole('button', { name: 'vega' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(tagsRowAfterSave.getByRole('button', { name: 'demo' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		// Ronda completa sin recargar el documento (ver nota de cabecera): vuelve al listado (SPA) y
		// navega atrás por el histórico del router hasta este mismo registro — carga FRESCA vía
		// `ctx.port.get`, no el estado ya en memoria del componente.
		await page.getByRole('button', { name: 'Volver' }).click();
		await page.waitForURL('**/c/posts');
		await page.goBack();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		await expect(page.getByLabel('Website')).toHaveValue('https://vega.example.dev');
		await expect(page.getByLabel('Published at')).toHaveValue('2024-06-01T09:15');
	});

	test('metrics: switch es un checkbox real y number un input numérico', async ({ page }) => {
		await loginAndSettle(page);
		await page.goto('/c/metrics/new');

		const active = page.getByLabel('Active');
		await expect(active).toHaveAttribute('type', 'checkbox');
		await expect(active).not.toBeChecked();
		await active.check();
		await expect(active).toBeChecked();

		const count = page.getByLabel('Count');
		await expect(count).toHaveAttribute('type', 'number');
		await count.fill('7');

		await page.getByRole('button', { name: 'Guardar' }).click();
		await page.waitForURL(/\/c\/metrics\/(?!new)[^/]+$/);
		await expect(page.getByLabel('Active')).toBeChecked();
		await expect(page.getByLabel('Count')).toHaveValue('7');
	});

	test('readonly de schema (authors.joinedAt): el widget datetime nunca acepta edición', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/authors/new');

		const joinedAt = page.getByLabel('Joined at');
		await expect(joinedAt).toHaveAttribute('type', 'datetime-local');
		await expect(joinedAt).toBeDisabled();

		// El formulario sigue siendo utilizable para el resto de campos (readonly es por-CAMPO, no
		// por-tipo, a diferencia de `pages`): crear con `name` funciona con normalidad.
		await page.getByLabel('Name').fill('Autora de prueba');
		await page.getByRole('button', { name: 'Guardar' }).click();
		await page.waitForURL(/\/c\/authors\/(?!new)[^/]+$/);
		await expect(page.getByLabel('Name')).toHaveValue('Autora de prueba');
		await expect(page.getByLabel('Joined at')).toBeDisabled();
	});
});
