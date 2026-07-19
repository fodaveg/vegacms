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
 *
 * **Añadido en F5-d (contrato P5)**: el editor TipTap real de los widgets `richtext` (`content`)
 * y `markdown` (`summary`), sobre los dos campos añadidos a `posts` en la semilla (ver
 * `session/demo-seed.ts`, sección "Añadido en F5-d"). El contenteditable de TipTap no es un
 * control HTML nativo `<input>`/`<textarea>`, así que se localiza por `role="textbox"` (el mismo
 * que fija `editorProps.attributes` en ambos widgets) en vez de `.fill()`: requiere clic + tecleo
 * real (`pressSequentially`), documentado en la cabecera de ambos widgets.
 *
 * **Añadido en F5-e (contrato P5)**: el widget `relation` real, sobre los tres campos añadidos a
 * `posts` en la semilla (`session/demo-seed.ts`, sección "Añadido en F5-e") — búsqueda por título
 * de verdad (`relatedPost`, single), `maxSelect` (`relatedPosts`, múltiple) y el modo DEGRADADO sin
 * `titleField` (`relatedMetric`, Audit Finding 3). El grupo se localiza por `role="group"` (mismo
 * criterio que `chips`, un grupo de botones no es un control "labelable"); los candidatos, por
 * `role="button"` con `exact: true` (algunos títulos de la semilla, "Entrada 3"/"Entrada 30", son
 * substring unos de otros).
 *
 * **Añadido en F5-f (contrato P5)**: el widget `file` real, sobre los dos campos añadidos a
 * `posts` en la semilla (`session/demo-seed.ts`, sección "Añadido en F5-f") — `coverImage`
 * (single, `mimeTypes:['image/*']`+`maxSizeBytes`, preview de imagen real) y `attachments`
 * (múltiple, `maxSelect: 2`, chips genéricos). El `<input type="file">` SÍ es nativamente
 * labelable (a diferencia del `role="group"` de `chips`/`relation`), así que se localiza por
 * `page.getByLabel(...)` de toda la vida, con `setInputFiles` de Playwright para simular la
 * elección de fichero. Cubre: subida válida → preview `<img>`; rechazo cliente de
 * `maxSizeBytes`/`mimeTypes` (mensaje legible, el fichero NO se añade); `maxSelect` recorta el
 * exceso que llega de golpe y deja el input inerte hasta quitar uno; persistencia de verdad
 * (`FileRef` + `ctx.port.fileUrl`) en un viaje redondo SPA (ver nota de cabecera).
 *
 * **Fix de code-review de F5-f**: dos casos que faltaban — quitar un `FileRef` YA PERSISTIDO
 * (single y múltiple, el camino de borrado real de `materializeFileField` que los tests de
 * arriba no ejercían, solo quitaban un `File` pendiente sin guardar) y el readonly de schema del
 * widget `file` (`posts.sourceFile`, mismo criterio que `authors.joinedAt` para `datetime`).
 *
 * **Añadido en F5-g (contrato P5)**: foco al primer campo con error tras un envío fallido
 * (a11y de cierre, L-P5.2) — cliente (`required` de `title`, el único required de `posts`) y
 * backend (`maxLength`, mismo bypass del `maxlength` nativo que el test de validación de arriba).
 * Ambos casos ejercitan un widget INPUT normal (`inputId` ya es el control focusable); el
 * fallback de `RecordForm.svelte` para widgets de tipo GRUPO (`chips`/`relation`, sin control
 * nativamente focusable en su `inputId`) no tiene un camino practicable en la semilla actual (
 * ningún campo de ese tipo es `required`, y `maxSelect` ya lo impide la propia UI antes de
 * llegar a enviar) — cubierto en su lugar por `first-error-field.test.ts` (unit, la lógica de
 * ORDEN es la misma para cualquier tipo de widget) y por revisión manual del fallback.
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

test.describe('foco al primer error (a11y de cierre, F5-g/L-P5.2)', () => {
	test('required vacío (cliente): el foco aterriza en el campo con error, no se queda en "Guardar"', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');

		await page.getByRole('button', { name: 'Guardar' }).click();

		await expect(
			page.getByRole('alert').filter({ hasText: 'Este campo es obligatorio.' })
		).toBeVisible();
		// `title` es el ÚNICO campo required de `posts` (demo-seed): el foco debe caer justo ahí,
		// un `<input>` normal (no un widget de tipo grupo) — camino directo `getElementById`.
		await expect(page.getByLabel('Title')).toBeFocused();
	});

	test('error de BACKEND (maxLength, que el cliente no comprueba): el foco aterriza en el campo que lo devolvió', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');

		// Mismo truco que el test de validación de backend de más arriba (bypasea el `maxlength`
		// nativo del navegador): fuerza un `title` de 200 caracteres para que SOLO el backend lo
		// rechace (L-P5.4), no la validación cliente (D-P5.3).
		await page.getByLabel('Title').evaluate((el, value) => {
			const input = el as HTMLInputElement;
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}, 'x'.repeat(200));
		await page.getByRole('button', { name: 'Guardar' }).click();

		await expect(
			page.getByRole('alert').filter({ hasText: 'El texto es demasiado largo.' })
		).toBeVisible();
		// El foco llega TRAS el `await` del envío fallido (backendErrors se asienta después de la
		// respuesta) — confirma que `RecordForm` espera el `tick()` antes de resolver el elemento.
		await expect(page.getByLabel('Title')).toBeFocused();
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
		// `exact: true` (fix de flake, ver diagnóstico junto a este test): `waitForURL` resuelve en
		// cuanto CAMBIA la URL del navegador (el propio `popstate` de `goBack`, ANTES de que
		// SvelteKit termine de desmontar el listado y montar `RecordForm` — hueco async normal de
		// cualquier router de SPA, no un bug de remount de la app). Durante esa ventana el listado de
		// `/c/posts` sigue en el DOM, con su cabecera de columna ORDENABLE "Website"
		// (`aria-label="Ordenar por Website"`). Sin `exact`, `getByLabel('Website')` empareja por
		// SUBSTRING y agarra ese botón de orden en vez de esperar al `<input>` real; el motor lanza
		// "Not an input element" (no es un input/textarea/select) — un error que Playwright NO
		// reintenta dentro del polling de `toHaveValue` (a diferencia de "elemento no encontrado",
		// que sí espera), así que la aserción falla en unos pocos ms en vez de agotar el timeout.
		// `exact: true` deja de matchear ese botón (su nombre accesible es "Ordenar por Website",
		// no "Website" a secas) — durante la ventana de transición el locator simplemente no
		// encuentra nada y SÍ reintenta con normalidad hasta que el input real monta.
		await expect(page.getByLabel('Website', { exact: true })).toHaveValue(
			'https://vega.example.dev'
		);
		await expect(page.getByLabel('Published at', { exact: true })).toHaveValue('2024-06-01T09:15');
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

test.describe('editor TipTap real: richtext y markdown (F5-d)', () => {
	test('richtext (content): el HTML hostil ya guardado se sanea al montar, nunca se ejecuta', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/post_1');

		// El `<script>` incrustado en la semilla (ver `demo-seed.ts`) NUNCA debe correr: si
		// `Richtext.svelte` pintara el HTML crudo (o el saneado fallara), esto sería `true`.
		expect(
			await page.evaluate(() => (window as unknown as { __vegaXssRan?: boolean }).__vegaXssRan)
		).toBeUndefined();

		const contentField = page.locator('[data-field="content"]');
		await expect(contentField.locator('script')).toHaveCount(0);
		await expect(contentField.getByText('Hola')).toBeVisible();
		await expect(contentField.locator('strong', { hasText: 'mundo' })).toBeVisible();
	});

	test('markdown (summary): el Markdown crudo ya guardado se parsea de verdad al montar', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/post_1');

		const summaryField = page.locator('[data-field="summary"]');
		await expect(summaryField.locator('h1', { hasText: 'Resumen' })).toBeVisible();
		await expect(summaryField.locator('strong', { hasText: 'texto' })).toBeVisible();
	});

	test('crear un post: escribir en richtext (con negrita) y markdown, guardar, y que persista', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');
		await page.getByLabel('Title').fill('Post con editores enriquecidos');

		const contentField = page.locator('[data-field="content"]');
		const contentEditable = contentField.getByRole('textbox', { name: 'Content' });
		await contentEditable.click();
		await contentEditable.pressSequentially('Texto enriquecido');
		await page.keyboard.press('Shift+Home');
		await contentField.getByRole('button', { name: 'Negrita' }).click();

		const summaryField = page.locator('[data-field="summary"]');
		const summaryEditable = summaryField.getByRole('textbox', { name: 'Summary' });
		await summaryEditable.click();
		await summaryEditable.pressSequentially('Resumen escrito a mano');

		await page.getByRole('button', { name: 'Guardar' }).click();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);

		// Cada widget pinta el valor que devolvió `ctx.port.create` (mismo criterio que el resto de
		// widgets escalares, ver más arriba): confirma que lo tecleado sobrevivió al viaje de ida y
		// vuelta por el backend, ya como Markdown/HTML serializado de verdad.
		await expect(
			page.locator('[data-field="content"] strong', { hasText: 'Texto enriquecido' })
		).toBeVisible();
		await expect(
			page.locator('[data-field="summary"]').getByText('Resumen escrito a mano')
		).toBeVisible();

		// Persistido de verdad (ver nota de cabecera): vuelve al listado (SPA) y navega atrás por el
		// histórico del router hasta este mismo registro — una carga FRESCA vía `ctx.port.get`.
		await page.getByRole('button', { name: 'Volver' }).click();
		await page.waitForURL('**/c/posts');
		await page.goBack();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		await expect(
			page.locator('[data-field="content"] strong', { hasText: 'Texto enriquecido' })
		).toBeVisible();
		await expect(
			page.locator('[data-field="summary"]').getByText('Resumen escrito a mano')
		).toBeVisible();
	});
});

test.describe('widget relation (F5-e)', () => {
	test('single (relatedPost): buscar por título → seleccionar → persistir → recargar y ver el título resuelto', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');
		await page.getByLabel('Title').fill('Post con relatedPost');

		const group = page.getByRole('group', { name: 'Related post', exact: true });
		await group.getByRole('searchbox').fill('Bienvenido');

		const candidate = group.getByRole('button', { name: 'Bienvenido a Vega', exact: true });
		await expect(candidate).toBeVisible();
		await candidate.click();
		await expect(candidate).toHaveAttribute('aria-pressed', 'true');
		await expect(group.locator('.vega-relation-chip')).toContainText('Bienvenido a Vega');

		await page.getByRole('button', { name: 'Guardar' }).click();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);

		// El título resuelto (`ctx.port.get` sin `expand`, D-P5.9) sobrevive al viaje redondo.
		await expect(page.getByRole('group', { name: 'Related post', exact: true })).toContainText(
			'Bienvenido a Vega'
		);

		// Persistido de verdad (ver nota de cabecera del fichero): vuelve al listado (SPA) y navega
		// atrás por el histórico del router hasta este mismo registro — carga FRESCA vía `ctx.port.get`.
		await page.getByRole('button', { name: 'Volver' }).click();
		await page.waitForURL('**/c/posts');
		await page.goBack();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		await expect(page.getByRole('group', { name: 'Related post', exact: true })).toContainText(
			'Bienvenido a Vega'
		);
	});

	test('múltiple con maxSelect (relatedPosts): seleccionar 2 agota el límite, el 3º queda deshabilitado', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');
		await page.getByLabel('Title').fill('Post con relatedPosts');

		const group = page.getByRole('group', { name: 'Related posts', exact: true });
		await group.getByRole('searchbox').fill('Entrada');

		// Sin `sort` en la query, el adaptador `memory` desempata por ID ASCENDENTE (§4.2/§4.6): de
		// los 30 "Entrada N" (`post_3`..`post_32`), los primeros 20 por orden lexicográfico de id
		// son `post_10`..`post_29` ("post_3" ordena DESPUÉS de "post_29", no numéricamente) — de ahí
		// "Entrada 10"/"Entrada 11"/"Entrada 12" en vez de los títulos "3"/"4"/"5", más intuitivos
		// pero fuera de la primera página (`RELATION_SEARCH_PER_PAGE`, `relation-search.ts`).
		const first = group.getByRole('button', { name: 'Entrada 10', exact: true });
		const second = group.getByRole('button', { name: 'Entrada 11', exact: true });
		const third = group.getByRole('button', { name: 'Entrada 12', exact: true });
		await expect(first).toBeVisible();
		await first.click();
		await second.click();

		await expect(first).toHaveAttribute('aria-pressed', 'true');
		await expect(second).toHaveAttribute('aria-pressed', 'true');
		await expect(third).toBeDisabled(); // maxSelect: 2 alcanzado (afordancia UX, D-P5.9)

		await page.getByRole('button', { name: 'Guardar' }).click();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);

		const savedGroup = page.getByRole('group', { name: 'Related posts', exact: true });
		await expect(savedGroup).toContainText('Entrada 10');
		await expect(savedGroup).toContainText('Entrada 11');

		// Remount con caché de títulos VACÍA (fix de code-review: `resolveTitle` trackeaba mal las
		// peticiones en vuelo y duplicaba `get`s en O(n²) para varios ids seleccionados a la vez —
		// mismo patrón de "recarga fría" que el test single de más arriba, aquí con 2 ids a la vez
		// para ejercer justo el caso que reproducía el bug). Ambos títulos deben resolver, sin
		// importar el orden de resolución de las dos llamadas `ctx.port.get` concurrentes.
		await page.getByRole('button', { name: 'Volver' }).click();
		await page.waitForURL('**/c/posts');
		await page.goBack();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		const reloadedGroup = page.getByRole('group', { name: 'Related posts', exact: true });
		await expect(reloadedGroup).toContainText('Entrada 10');
		await expect(reloadedGroup).toContainText('Entrada 11');
	});

	test('degradado sin titleField (relatedMetric): sin buscador, listado paginado por id', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');
		await page.getByLabel('Title').fill('Post con relatedMetric');

		const group = page.getByRole('group', { name: 'Related metric' });
		await expect(group).toHaveAttribute('data-degraded', 'true');
		await expect(group.getByRole('searchbox')).toHaveCount(0); // Audit Finding 3: sin buscador

		const candidate = group.getByRole('button', { name: 'metric_1', exact: true });
		await expect(candidate).toBeVisible();
		await candidate.click();
		await expect(candidate).toHaveAttribute('aria-pressed', 'true');

		await page.getByRole('button', { name: 'Guardar' }).click();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);

		// Sin titleField, el propio id ES el título (`titleOf`, `relation-search.ts`): persiste igual.
		await expect(page.getByRole('group', { name: 'Related metric' })).toContainText('metric_1');
	});
});

// 1x1 PNG transparente real (no basta un buffer arbitrario con mimeType 'image/png': el `<img>`
// del widget necesita DECODIFICAR de verdad para no disparar su fallback `onerror`→chip, ver
// cabecera de `FileInput.svelte`).
const TINY_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test.describe('widget file (F5-f)', () => {
	test('single (coverImage): sube una imagen válida, la previsualiza, guarda y persiste vía fileUrl', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');
		await page.getByLabel('Title').fill('Post con coverImage');

		const field = page.locator('[data-field="coverImage"]');
		await field.getByLabel('Cover image').setInputFiles({
			name: 'photo.png',
			mimeType: 'image/png',
			buffer: Buffer.from(TINY_PNG_BASE64, 'base64')
		});

		// Preview de un `File` nuevo (object URL, `URL.createObjectURL`): un `<img>` de verdad,
		// nunca degradado a chip (la imagen es válida, decodifica).
		await expect(field.locator('img.vega-file-thumb')).toBeVisible();
		await expect(field.locator('.vega-file-chip')).toHaveCount(0);

		await page.getByRole('button', { name: 'Guardar' }).click();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);

		// Persistido de verdad (ver nota de cabecera del fichero): la preview ahora sale de
		// `ctx.port.fileUrl` (memory: un data-URI), no de un object URL — sigue siendo un `<img>`.
		const savedField = page.locator('[data-field="coverImage"]');
		await expect(savedField.locator('img.vega-file-thumb')).toBeVisible();
		await expect(savedField.locator('img.vega-file-thumb')).toHaveAttribute(
			'src',
			/^data:image\/png/
		);

		// Recarga fría dentro de la SPA (vuelve al listado y navega atrás por el histórico).
		await page.getByRole('button', { name: 'Volver' }).click();
		await page.waitForURL('**/c/posts');
		await page.goBack();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		await expect(page.locator('[data-field="coverImage"] img.vega-file-thumb')).toBeVisible();
	});

	test('single (coverImage): maxSizeBytes/mimeTypes se rechazan en cliente, con mensaje legible y sin añadir el fichero', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');
		await page.getByLabel('Title').fill('Post con rechazo de coverImage');

		const field = page.locator('[data-field="coverImage"]');

		// `maxSizeBytes: 1000` (semilla): 2000 bytes de "imagen" ya lo supera.
		await field.getByLabel('Cover image').setInputFiles({
			name: 'big.png',
			mimeType: 'image/png',
			buffer: Buffer.alloc(2000)
		});
		await expect(field.getByRole('alert')).toContainText('big.png');
		await expect(field.locator('img.vega-file-thumb')).toHaveCount(0);
		await expect(field.locator('.vega-file-chip')).toHaveCount(0);

		// `mimeTypes: ['image/*']`: un PDF no matchea el comodín.
		await field.getByLabel('Cover image').setInputFiles({
			name: 'doc.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from('%PDF-1.4')
		});
		await expect(field.getByRole('alert')).toContainText('doc.pdf');
		await expect(field.locator('img.vega-file-thumb')).toHaveCount(0);
		await expect(field.locator('.vega-file-chip')).toHaveCount(0);
	});

	test('múltiple con maxSelect (attachments): recorta el exceso que llega de golpe, quitar libera hueco, y persiste', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');
		await page.getByLabel('Title').fill('Post con attachments');

		const field = page.locator('[data-field="attachments"]');
		const input = field.getByLabel('Attachments');

		// `maxSelect: 2` (semilla): los 3 llegan en la MISMA selección — el 3º se recorta como
		// `tooMany` (afordancia UX, `addFilesToMultiple`), los 2 primeros SÍ se añaden.
		await input.setInputFiles([
			{ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('a') },
			{ name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('b') },
			{ name: 'c.txt', mimeType: 'text/plain', buffer: Buffer.from('c') }
		]);
		await expect(field.locator('.vega-file-chip')).toHaveCount(2);
		await expect(field.locator('.vega-file-chip').nth(0)).toHaveText('a.txt');
		await expect(field.locator('.vega-file-chip').nth(1)).toHaveText('b.txt');
		await expect(field.getByRole('alert')).toContainText('c.txt');

		// Límite alcanzado: el input queda inerte para AÑADIR (mismo criterio que `chips`/`relation`).
		await expect(input).toBeDisabled();

		// Quitar uno libera hueco: el input vuelve a aceptar ficheros.
		await field.getByRole('button', { name: 'Quitar «b.txt»' }).click();
		await expect(field.locator('.vega-file-chip')).toHaveCount(1);
		await expect(input).toBeEnabled();

		await page.getByRole('button', { name: 'Guardar' }).click();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);

		// Persistido de verdad (ver nota de cabecera): un único chip, con el nombre original
		// todavía reconocible dentro de la `FileRef` que devuelve el adaptador `memory`.
		const savedField = page.locator('[data-field="attachments"]');
		await expect(savedField.locator('.vega-file-chip')).toHaveCount(1);
		await expect(savedField.locator('.vega-file-chip')).toContainText('a.txt');

		await page.getByRole('button', { name: 'Volver' }).click();
		await page.waitForURL('**/c/posts');
		await page.goBack();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		const reloadedField = page.locator('[data-field="attachments"]');
		await expect(reloadedField.locator('.vega-file-chip')).toHaveCount(1);
		await expect(reloadedField.locator('.vega-file-chip')).toContainText('a.txt');
	});

	// Fix de code-review de F5-f (🟡 2): los tests de arriba solo quitan un `File` PENDIENTE (sin
	// guardar todavía) — nunca un `FileRef` ya persistido tras un `Guardar`+recarga. El camino de
	// `materializeFileField` que BORRA del `MemoryFileStore` lo que ya no aparece en el value
	// final (`adapters/memory/files.ts`) quedaba sin ejercer. Los dos tests siguientes cubren
	// justo ese camino, single y múltiple.
	test('single (coverImage): quitar un FileRef YA PERSISTIDO lo borra de verdad', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');
		await page.getByLabel('Title').fill('Post con coverImage a borrar tras persistir');

		await page
			.locator('[data-field="coverImage"]')
			.getByLabel('Cover image')
			.setInputFiles({
				name: 'photo.png',
				mimeType: 'image/png',
				buffer: Buffer.from(TINY_PNG_BASE64, 'base64')
			});
		await page.getByRole('button', { name: 'Guardar' }).click();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);

		// Recarga fría (ver nota de cabecera del fichero): la portada persistida se ve como `<img>`
		// de verdad (vía `ctx.port.fileUrl`), no ya el object URL del `File` pendiente de antes.
		await page.getByRole('button', { name: 'Volver' }).click();
		await page.waitForURL('**/c/posts');
		await page.goBack();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		let field = page.locator('[data-field="coverImage"]');
		await expect(field.locator('img.vega-file-thumb')).toBeVisible();

		// Quitar el FileRef YA PERSISTIDO (no un `File` pendiente) y guardar: ejercita el camino de
		// `materializeFileField` que borra del store lo que ya no aparece en el value final.
		await field.locator('.vega-file-remove').click();
		await expect(field.locator('img.vega-file-thumb')).toHaveCount(0);
		await expect(field.locator('.vega-file-empty')).toBeVisible();

		await page.getByRole('button', { name: 'Guardar' }).click();
		// `.last()`: el toast "Guardado." del `create` de arriba (4s de auto-descarte, `toasts.svelte.ts`)
		// puede seguir visible cuando llega este SEGUNDO guardado (update) — hay dos apilados.
		await expect(page.getByText('Guardado.').last()).toBeVisible();

		// Recarga fría OTRA VEZ: el borrado sobrevivió al viaje redondo `update` → `get`, no es un
		// artefacto del estado en memoria del propio formulario.
		await page.getByRole('button', { name: 'Volver' }).click();
		await page.waitForURL('**/c/posts');
		await page.goBack();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		field = page.locator('[data-field="coverImage"]');
		await expect(field.locator('img.vega-file-thumb')).toHaveCount(0);
		await expect(field.locator('.vega-file-empty')).toBeVisible();
	});

	test('múltiple (attachments): quitar UN FileRef ya persistido borra solo ese, conserva el resto', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/new');
		await page.getByLabel('Title').fill('Post con attachments a borrar tras persistir');

		await page
			.locator('[data-field="attachments"]')
			.getByLabel('Attachments')
			.setInputFiles([
				{ name: 'keep.txt', mimeType: 'text/plain', buffer: Buffer.from('keep') },
				{ name: 'drop.txt', mimeType: 'text/plain', buffer: Buffer.from('drop') }
			]);
		await page.getByRole('button', { name: 'Guardar' }).click();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);

		await page.getByRole('button', { name: 'Volver' }).click();
		await page.waitForURL('**/c/posts');
		await page.goBack();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		let field = page.locator('[data-field="attachments"]');
		await expect(field.locator('.vega-file-chip')).toHaveCount(2);

		// Quitar SOLO "drop.txt" (ya persistido, no un `File` pendiente): localizado por el `<li>`
		// que lo contiene (chip + botón "Quitar" son hermanos, mismo criterio que `RecordTable`
		// separa apertura/borrado en celdas hermanas).
		await field
			.locator('.vega-file-item')
			.filter({ hasText: 'drop.txt' })
			.getByRole('button', { name: 'Quitar' })
			.click();
		await expect(field.locator('.vega-file-chip')).toHaveCount(1);
		await expect(field.locator('.vega-file-chip')).toContainText('keep.txt');

		await page.getByRole('button', { name: 'Guardar' }).click();
		// `.last()`: mismo motivo que el test single de arriba (dos "Guardado." apilados, create+update).
		await expect(page.getByText('Guardado.').last()).toBeVisible();

		// Recarga fría: solo "drop.txt" desapareció de verdad (borrado real del store); "keep.txt"
		// sobrevivió intacto — el diff de estado-final no toca lo que SÍ sigue en el value.
		await page.getByRole('button', { name: 'Volver' }).click();
		await page.waitForURL('**/c/posts');
		await page.goBack();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		field = page.locator('[data-field="attachments"]');
		await expect(field.locator('.vega-file-chip')).toHaveCount(1);
		await expect(field.locator('.vega-file-chip')).toContainText('keep.txt');
	});

	// Fix de code-review de F5-f (🟡 3): mismo criterio que `readonly de schema (authors.joinedAt)`
	// (F5-b) pero para `file` — `posts.sourceFile` (semilla, readonly a nivel de schema, con dato
	// SOLO en `post_1`, ver `session/demo-seed.ts`).
	test('readonly de schema (posts.sourceFile): el widget file nunca acepta edición, aunque ya tenga contenido', async ({
		page
	}) => {
		await loginAndSettle(page);
		await page.goto('/c/posts/post_1');

		const field = page.locator('[data-field="sourceFile"]');
		await expect(field.getByLabel('Source file')).toBeDisabled();

		// El contenido YA existente (sembrado) SÍ se previsualiza: readonly bloquea la EDICIÓN, no
		// la lectura (chip, mime no-imagen a propósito — ver el seed).
		await expect(field.locator('.vega-file-chip')).toContainText('seed_archive_notes.txt');

		// Inerte de verdad (L-P5.2): sin botón "Quitar" (nunca se renderiza en modo readonly, ver
		// `FileInput.svelte`) y el dropzone marcado inerte (ignora drop/diálogo, `addDisabled`).
		await expect(field.getByRole('button', { name: 'Quitar' })).toHaveCount(0);
		await expect(field.locator('.vega-file-dropzone')).toHaveAttribute('data-inert', 'true');

		// El resto del formulario sigue editable con normalidad (readonly es por-CAMPO, D-P5.1, a
		// diferencia de `pages`, que es readonly por-TIPO).
		await page.getByLabel('Title').fill('Bienvenido a Vega (título editado)');
		await page.getByRole('button', { name: 'Guardar' }).click();
		await expect(page.getByText('Guardado.')).toBeVisible();
		await expect(field.getByLabel('Source file')).toBeDisabled();
		await expect(field.locator('.vega-file-chip')).toContainText('seed_archive_notes.txt');
	});
});
