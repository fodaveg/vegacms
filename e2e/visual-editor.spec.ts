/**
 * `e2e/visual-editor.spec.ts` — el editor visual (`/c/[type]/[id]/visual`, §"Visual editing
 * bridge" de `docs/PROJECT-CONTRACT-v1.md`, línea 297 en adelante) contra un `<iframe>` de OTRO
 * ORIGEN de verdad, con un sitio de mentira (`./visual-site.ts`) que implementa su mitad del
 * protocolo `vega-visual-1` tal como la describe el contrato.
 *
 * ## Alcance, y lo que esta suite NO es
 *
 * La tarea que dio origen a este fichero pedía "contra el starter" y nombraba `~/code/vega-astro`.
 * **Eso queda FUERA a propósito**: la suite e2e de Vega corre sobre el adaptador `memory` contra
 * la build ESTÁTICA (`playwright.config.ts`, `vite build && vite preview`), sin PocketBase, sin
 * Astro y sin la extensión Go `vegapreview`. Montar el starter de verdad habría significado
 * levantar esas tres piezas en CI, y `~/code/vega-astro` es además OTRO repo, fuera de los
 * directorios de trabajo de esta sesión.
 *
 * Lo que SÍ compra esta suite: **la mitad de VEGA del protocolo, ejercida de punta a punta**
 * contra un sitio cross-origin real (`e2e/visual-site.ts`, escrito leyendo el contrato, no
 * copiando `$lib/visual/bridge-client.ts` — ver su cabecera). Lo que NO compra: que el puente REAL
 * de `@vega/astro` (`VegaEditorBridge`) esté de acuerdo con esta implementación de doble. Léase
 * cada test de este fichero como "Vega cumple su mitad del contrato", nunca como "la integración
 * con el starter funciona" — esa segunda afirmación solo la puede hacer una suite que monte el
 * starter de verdad, y esta no lo hace.
 *
 * ## Puerta de entrada
 *
 * Sin `window.__VEGA_PREVIEW_API_URL__` (gancho de e2e, ver la cabecera de
 * `src/lib/session/backend.ts`) el adaptador `memory` no anuncia `previewApiUrl`/
 * `previewVisualEditing`, y `resolveVisualGate` (`$lib/visual/visual-gate.ts`) cierra la pantalla
 * con `no-preview` — el editor visual sería inalcanzable en esta suite sin él. El gancho ANUNCIA,
 * nunca implementa: responder al `POST {url}/token` y servir el documento del `<iframe>` es
 * trabajo de `visual-site.ts`, con `page.route()`.
 *
 * La semilla que trae `paginas` con `blocks: { collection: 'secciones', parentField: 'pagina',
 * orderField: 'orden' }` es `SHOWCASE_SEED`, no `DEMO_SEED` (`src/lib/session/demo-seed.ts`) — se
 * activa con `loginAsDemo(page, { seedShowcase: true })`. Solo `pagina_1` («Inicio») trae
 * secciones sembradas (`seccion_1`/`_2`/`_3`); el resto de páginas están vacías.
 *
 * ## Backend de la comprobación del punto 4
 *
 * La tarea original pedía comprobar el reorden "en PocketBase": esta suite corre sobre `memory`
 * (ver arriba), así que el test 4 comprueba el orden releyéndolo con una consulta INDEPENDIENTE de
 * la lista del árbol — navegando (client-side, sin recargar el documento) a `/c/paginas/pagina_1`
 * y mirando el orden que enseña `RecordBlocks.svelte`, que hace su PROPIO `list()` sobre el mismo
 * adaptador — en vez de confiar en que el array reactivo del árbol refleje lo que de verdad se
 * escribió. Es la comprobación más fuerte que este backend permite sin un hook nuevo.
 */
import type { Page } from '@playwright/test';
import { expect, loginAsDemo, test } from './fixtures';
import { createVisualSite, type VisualSite, type VisualSiteBlock } from './visual-site';

interface VegaVisualWindow extends Window {
	__VEGA_PREVIEW_API_URL__?: string;
}

/** Eco de `SECCIONES_RECORDS` (`demo-seed.ts`, solo `pagina_1`): mismos ids y mismos textos de
 *  `heading`, para que seleccionar «el segundo bloque» en el sitio y en el árbol sea EL MISMO
 *  registro (`bridge-client.ts` casa por igualdad de string, ver la cabecera de
 *  `VisualBlockTree.svelte`, "Ids"). */
const SECCIONES: VisualSiteBlock[] = [
	{ id: 'seccion_1', type: 'seccion', text: 'Escribe. Publica. Olvídate del resto.' },
	{ id: 'seccion_2', type: 'seccion', text: 'Tu contenido, en tu servidor' },
	{ id: 'seccion_3', type: 'seccion', text: 'Se adapta a tu modelo' }
];

async function openVisualEditor(page: Page, site: VisualSite, pageId: string): Promise<void> {
	await site.install(page);
	await page.addInitScript((previewApiUrl) => {
		(window as unknown as VegaVisualWindow).__VEGA_PREVIEW_API_URL__ = previewApiUrl;
	}, site.previewApiUrl);
	await loginAsDemo(page, { seedShowcase: true });
	await page.goto(`/c/paginas/${pageId}/visual`);
}

/** Espera a que la barra superior confirme el saludo (§contrato, "ready es la prueba, no el
 *  anuncio"): antes de esto cualquier aserción sobre el lienzo sería una carrera contra el
 *  handshake. */
async function waitConnected(page: Page, blockCount: number): Promise<void> {
	await expect(page.locator('.vega-visual-status-text')).toHaveText(
		`Conectado al sitio: ${blockCount} bloque(s) en la página.`
	);
}

const visibleInspectorBody = (page: Page) => page.locator('.vega-inspector-body:not([hidden])');

/**
 * El campo «Heading» de la ficha visible, localizado por `[data-field]` (`FieldRow.svelte`) y NO
 * por `getByLabel()`. **Hallazgo del recorrido, no capricho**: `field-ids.ts#fieldIds` deriva el
 * `id` del `<input>` SOLO del nombre de campo (`vega-field-heading`), y `VisualInspector.svelte`
 * monta un `BlockEditor` por CADA sección SIEMPRE, oculto con `hidden` (nunca `{#if}`, ver su
 * cabecera) — así que las tres secciones de `pagina_1` producen TRES nodos con el mismo
 * `id="vega-field-heading"` a la vez, `id` duplicado e inválido en HTML. El navegador (y
 * `getByLabel()`, que replica su algoritmo) resuelve `label[for="vega-field-heading"]` contra el
 * PRIMERO de esos tres nodos en orden de documento, así que seleccionar cualquier sección que NO
 * sea la primera (`seccion_2`, `seccion_3`) deja el label apuntando al campo de OTRA sección,
 * oculta — `getByLabel('Heading')` no encuentra nada dentro de la ficha visible. Confirmado con un
 * repro aislado: `page.locator('#vega-field-heading').count()` da `3` con el inspector abierto.
 * Ver el informe de esta tarea para el detalle completo; el arreglo (namespacing del id por
 * `record.id`) vive en `src/lib/form/field-ids.ts`/`FieldRow.svelte`, fuera del alcance cerrado de
 * esta suite.
 */
const headingInput = (page: Page) =>
	visibleInspectorBody(page).locator('[data-field="heading"] input');

test.describe('editor visual — protocolo vega-visual-1 contra un sitio cross-origin', () => {
	test('pinta los contornos que reporta el sitio, con la geometría real de sus bloques', async ({
		page
	}) => {
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);

		const boxes = page.locator('.vega-visual-overlay-box');
		await expect(boxes).toHaveCount(3);

		// Geometría de VERDAD (`getBoundingClientRect()` de `visual-site.ts`, nunca un número
		// inventado): las tres secciones se apilan en el documento, así que sus `top` tienen que
		// crecer en el mismo orden que el marcado — si el sitio cambiara su CSS, esto cambiaría
		// solo, que es justo la propiedad que un `rect` fijo no podría demostrar.
		const tops = (await boxes.evaluateAll((els) => els.map((el) => (el as HTMLElement).style.top)))
			.map((value) => parseFloat(value))
			.sort((a, b) => a - b);
		const firstBox = page.locator('.vega-visual-overlay-box[data-vega-block-id="seccion_1"]');
		const secondBox = page.locator('.vega-visual-overlay-box[data-vega-block-id="seccion_2"]');
		const thirdBox = page.locator('.vega-visual-overlay-box[data-vega-block-id="seccion_3"]');
		await expect(firstBox).toBeVisible();
		await expect(secondBox).toBeVisible();
		await expect(thirdBox).toBeVisible();
		const [firstTop, secondTop, thirdTop] = await Promise.all([
			firstBox.evaluate((el) => parseFloat((el as HTMLElement).style.top)),
			secondBox.evaluate((el) => parseFloat((el as HTMLElement).style.top)),
			thirdBox.evaluate((el) => parseFloat((el as HTMLElement).style.top))
		]);
		expect(firstTop).toBeLessThan(secondTop);
		expect(secondTop).toBeLessThan(thirdTop);
		// Mismos tres valores que `tops`, solo para dejar constancia de que no hay un cuarto
		// contorno fantasma coincidiendo por casualidad.
		expect(tops).toHaveLength(3);
	});

	test('un clic DENTRO del segundo bloque en el marco abre ESE bloque en el inspector, no el primero', async ({
		page
	}) => {
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);

		const frame = page.frameLocator('iframe.vega-visual-frame');
		await frame.locator('[data-vega-block-id="seccion_2"]').click();

		await expect(page.locator('[data-vega-tree-row="seccion_2"]')).toHaveClass(
			/vega-tree-row--selected/
		);
		await expect(page.locator('[data-vega-tree-row="seccion_1"]')).not.toHaveClass(
			/vega-tree-row--selected/
		);
		await expect(
			page.locator('.vega-visual-overlay-box[data-vega-block-id="seccion_2"]')
		).toHaveClass(/vega-visual-overlay-box--selected/);

		await expect(visibleInspectorBody(page).locator('.vega-inspector-block-title')).toHaveText(
			'Tu contenido, en tu servidor'
		);
		await expect(headingInput(page)).toHaveValue('Tu contenido, en tu servidor');
	});

	test('guardar un texto con refresco en vivo lo refleja SIN recargar el iframe (no parpadea)', async ({
		page
	}) => {
		const site = createVisualSite({
			collection: 'paginas',
			id: 'pagina_1',
			blocks: SECCIONES,
			liveRefresh: true
		});
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);

		const frame = page.frameLocator('iframe.vega-visual-frame');
		await frame.locator('[data-vega-block-id="seccion_1"]').click();
		await expect(headingInput(page)).toHaveValue(SECCIONES[0].text);

		// Marca el nodo del iframe ANTES del guardado: si Vega lo remonta (recarga entera), el
		// atributo desaparece con el nodo viejo — una comprobación de identidad de DOM, no de la
		// cadena `src` (que en este doble es SIEMPRE la misma URL, ver la cabecera de
		// `visual-site.ts`).
		const iframe = page.locator('iframe.vega-visual-frame');
		await iframe.evaluate((el) => el.setAttribute('data-e2e-marker', 'antes-de-guardar'));
		const countsBefore = site.requestCounts();

		const newText = 'Escribe. Publica. Y esta vez el lienzo no parpadea.';
		// El "backend" (este doble) YA tiene el texto nuevo para cuando Vega vuelva a pedir la
		// página — mismo momento causal que en producción, donde el endpoint de preview real
		// leería PocketBase ya actualizado (ver la cabecera de `visual-site.ts`).
		site.setBlocks(SECCIONES.map((b) => (b.id === 'seccion_1' ? { ...b, text: newText } : b)));

		await headingInput(page).fill(newText);
		await visibleInspectorBody(page).getByRole('button', { name: 'Guardar' }).click();
		await expect(page.locator('.vega-visual-saved-at')).toBeVisible();

		await expect(frame.locator('[data-vega-block-id="seccion_1"]')).toHaveText(newText);
		// El nodo del iframe SOBREVIVIÓ: sustitución en caliente de `data-vega-blocks-root`, nunca
		// una recarga (§"Live refresh" del contrato).
		await expect(iframe).toHaveAttribute('data-e2e-marker', 'antes-de-guardar');
		const countsAfter = site.requestCounts();
		expect(countsAfter.fetches).toBeGreaterThan(countsBefore.fetches);
		expect(countsAfter.documents).toBe(countsBefore.documents);
	});

	test('guardar SIN refresco en vivo lo refleja recargando el iframe entero', async ({ page }) => {
		const site = createVisualSite({
			collection: 'paginas',
			id: 'pagina_1',
			blocks: SECCIONES,
			liveRefresh: false
		});
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);

		const frame = page.frameLocator('iframe.vega-visual-frame');
		await frame.locator('[data-vega-block-id="seccion_2"]').click();

		const iframe = page.locator('iframe.vega-visual-frame');
		await iframe.evaluate((el) => el.setAttribute('data-e2e-marker', 'antes-de-guardar'));
		const countsBefore = site.requestCounts();

		const newText = 'Tu contenido, en tu servidor, tras una recarga entera.';
		site.setBlocks(SECCIONES.map((b) => (b.id === 'seccion_2' ? { ...b, text: newText } : b)));

		await headingInput(page).fill(newText);
		await visibleInspectorBody(page).getByRole('button', { name: 'Guardar' }).click();
		await expect(page.locator('.vega-visual-saved-at')).toBeVisible();

		await expect(frame.locator('[data-vega-block-id="seccion_2"]')).toHaveText(newText);
		// El nodo VIEJO del iframe no sobrevivió: Svelte lo desmontó y montó uno nuevo (recarga
		// entera), así que el marcador puesto en el nodo anterior ya no está en ningún `<iframe>`.
		await expect(page.locator('iframe.vega-visual-frame[data-e2e-marker]')).toHaveCount(0);
		const countsAfter = site.requestCounts();
		expect(countsAfter.documents).toBeGreaterThan(countsBefore.documents);
		expect(countsAfter.fetches).toBe(countsBefore.fetches);
	});

	test('mover una sección en el árbol persiste el nuevo orden en el backend, no solo en la lista', async ({
		page
	}) => {
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);

		// Baja «Escribe. Publica…» (índice 0) un puesto: intercambia con «Tu contenido…».
		await page.getByRole('button', { name: `Bajar «${SECCIONES[0].text}»` }).click();
		await expect(page.locator('.vega-tree-list li').first().locator('.vega-tree-title')).toHaveText(
			SECCIONES[1].text
		);

		// Navegación CLIENTE (el botón llama a `ctx.nav.toRecord`, nunca `page.goto`): un `goto()`
		// real recargaría el documento y con él el adaptador `memory` entero (vuelve a la semilla),
		// perdiendo la escritura que este test quiere comprobar.
		await page.getByRole('button', { name: 'Volver al formulario' }).click();
		await expect(page).toHaveURL(/\/c\/paginas\/pagina_1$/);

		// `RecordBlocks.svelte` hace su PROPIO `list()` sobre el mismo adaptador — si el orden
		// solo hubiera cambiado en el array reactivo del árbol, esta lista independiente seguiría
		// enseñando el orden de la semilla.
		const titles = page.locator('.vega-block-title');
		await expect(titles).toHaveCount(3);
		await expect(titles.nth(0)).toHaveText(SECCIONES[1].text);
		await expect(titles.nth(1)).toHaveText(SECCIONES[0].text);
		await expect(titles.nth(2)).toHaveText(SECCIONES[2].text);
	});

	/**
	 * Defecto "el botón `+` del lienzo crea sin preguntar el tipo": mitad HETEROGÉNEA del arreglo
	 * (`hasTypeMenu === true`), de punta a punta contra el bridge cross-origin real.
	 *
	 * **Historia de este test (encargo "fixture de tipos para la paleta")**: hasta ese encargo,
	 * NINGUNA semilla de e2e (`DEMO_SEED`/`DEMO_SEED_WITH_MEDIA`/`SHOWCASE_SEED`) declaraba un
	 * vocabulario `blockTypes`, así que esta suite entera corría en modo homogéneo y este mismo test
	 * cubría la OTRA rama (`hasTypeMenu === false`, "nunca abre un menú" — ver el historial de este
	 * fichero para esa versión). El encargo dio a `SHOWCASE_MANIFEST.collections.paginas.blocks` su
	 * `typeField`/`dataField` y tres `blockTypes` (`src/lib/session/demo-seed.ts`, ver la cabecera de
	 * `SECCIONES_CONTENT_TYPE`) — con eso, `pagina_1` (la única página con secciones sembradas) pasó
	 * a tener `hasTypeMenu === true`, y la rama "sin vocabulario" que este test comprobaba dejó de
	 * ser alcanzable con `SHOWCASE_SEED`. Falsear un `hasTypeMenu === false` de verdad exigiría una
	 * SEGUNDA semilla de e2e sin vocabulario, que no compra nada nuevo: esa rama ya está cubierta a
	 * nivel de componente en `VisualOverlay.svelte.test.ts` ("sin `hasTypeMenu`, el `+` sigue creando
	 * directo, sin menú"). Se sustituye este test por su MITAD complementaria (elegir un tipo del
	 * menú, crear CON ESE tipo, de punta a punta por el bridge real) — la que el comentario original
	 * dejaba fuera "por falta de vocabulario", y que ahora sí es alcanzable.
	 */
	test('con vocabulario de tipos, el "+" del lienzo abre un menú y crea con el tipo elegido', async ({
		page
	}) => {
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);

		// N+1 puntos para N=3 bloques; el ÚLTIMO es el punto DESPUÉS del último bloque, "al final de
		// la página" — el caso real que motivó el defecto original.
		const insertPoints = page.locator('.vega-visual-overlay-insert');
		await expect(insertPoints).toHaveCount(4);
		const lastPoint = insertPoints.nth(3);
		await expect(lastPoint).toHaveAttribute('aria-haspopup', 'menu');
		await expect(lastPoint).toHaveAttribute('aria-expanded', 'false');

		await lastPoint.click();
		await expect(lastPoint).toHaveAttribute('aria-expanded', 'true');

		// Menú anclado a ESE punto, un `menuitem` por tipo de `SHOWCASE_MANIFEST.blockTypes`
		// (portada/texto/galería, en ese orden de declaración).
		const menu = page.locator('[role="menu"]');
		await expect(menu).toHaveCount(1);
		const items = menu.getByRole('menuitem');
		await expect(items).toHaveCount(3);

		await items.filter({ hasText: 'Galería' }).click();

		// El menú se cierra y la sección nueva llega al árbol: nunca crea directo sin preguntar
		// (defecto original), y nunca dos menús a la vez.
		await expect(page.locator('[role="menu"]')).toHaveCount(0);
		await expect(page.locator('.vega-tree-list li')).toHaveCount(4);

		// Persistencia real (mismo criterio que el test de "mover" de arriba): una consulta
		// INDEPENDIENTE del formulario normal, no solo el array reactivo del árbol — y el tipo
		// elegido viajó a su columna REAL (`tipo`), no se perdió por el camino: `RecordBlocks.svelte`
		// pinta `.vega-block-type` desde `blocks.blockTypeOf(record)`, que lee esa columna, nunca el
		// menú que se acaba de cerrar.
		await page.getByRole('button', { name: 'Volver al formulario' }).click();
		await expect(page).toHaveURL(/\/c\/paginas\/pagina_1$/);
		await expect(page.locator('.vega-block-title')).toHaveCount(4);
		await expect(page.locator('.vega-block-type').last()).toHaveText(/Galería/);
	});
});

/**
 * `paleta de bloques arrastrable` — encargo "fixture de tipos para la paleta", Parte 2: los dos
 * recorridos de CREAR ARRASTRANDO (`VisualPalette.svelte` → `VisualOverlay.svelte#handleZoneDrop`),
 * ahora que `pagina_1`/`pagina_2` tienen `hasTypeMenu === true` (ver la cabecera de
 * `SECCIONES_CONTENT_TYPE`, `demo-seed.ts`).
 *
 * **Arrastre HTML5 NATIVO real, no un manejador disparado a mano.** `mouse.down()` + varios
 * `mouse.move({ steps })` + `mouse.up()`, MISMA receta que ya usa esta suite para el reorden por
 * arrastre de `e2e/merged-view.spec.ts` ("el arrastre pinta feedback visual…", que usa el mismo
 * gesto manual en dos pasos para poder observar el estado A MITAD del gesto) — verificada aquí
 * empíricamente, no asumida: cada test comprueba que la capa de destinos de
 * `VisualOverlay.svelte` (`.vega-visual-overlay-drop-zone`/`.vega-visual-overlay-empty-drop`, que
 * SOLO existen durante un `dragstart` real, ver su cabecera) apareció ANTES de soltar. Sin esa
 * comprobación intermedia, un arrastre que degradase a un simple `click` (el mismo botón lleva las
 * dos vías, ver la cabecera de `VisualPalette.svelte`) crearía igual una sección — al FINAL, no en
 * la posición pedida — y el test podría colar un falso verde si solo mirara el conteo final.
 */
test.describe('editor visual — paleta de bloques arrastrable, crear sobre el lienzo', () => {
	test('arrastrar un tipo de la paleta sobre una página CON bloques inserta EN LA POSICIÓN correcta, no al final', async ({
		page
	}) => {
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);

		const paletteItem = page
			.locator('.vega-palette-panel')
			.getByRole('button', { name: 'Texto', exact: true });
		await expect(paletteItem).toBeVisible();
		const sourceBox = await paletteItem.boundingBox();
		if (!sourceBox) throw new Error('bounding box ausente (layout no resuelto)');

		// Mitad INFERIOR de `seccion_1` (`insert-position.ts`: `y < midpoint ? index : index + 1`):
		// inserta DESPUÉS de ella, posición 1 — ni al principio ni al final, el único caso que
		// distingue "en la posición pedida" de "al final" (que es lo que hacía el defecto original).
		const firstBox = await page
			.locator('.vega-visual-overlay-box[data-vega-block-id="seccion_1"]')
			.boundingBox();
		if (!firstBox) throw new Error('bounding box ausente (layout no resuelto)');
		const dropX = firstBox.x + firstBox.width / 2;
		const dropY = firstBox.y + firstBox.height * 0.85;

		await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
		await page.mouse.down();
		// Paso intermedio corto: el umbral de arrastre nativo de Chromium necesita distancia real
		// antes de disparar `dragstart` (mismo criterio que el arrastre manual de
		// `merged-view.spec.ts`).
		await page.mouse.move(
			sourceBox.x + sourceBox.width / 2 + 24,
			sourceBox.y + sourceBox.height / 2,
			{ steps: 5 }
		);
		await page.mouse.move(dropX, dropY, { steps: 15 });

		// La capa de destinos SOLO existe durante el gesto (ver cabecera): un destino por bloque
		// reportado (3, para `SECCIONES`).
		await expect(page.locator('.vega-visual-overlay-drop-zone')).toHaveCount(3);

		await page.mouse.up();

		await expect(page.locator('.vega-visual-overlay-drop-zone')).toHaveCount(0);

		// Comprueba el resultado leyendo el backend por su cuenta (`RecordBlocks.svelte`, un
		// `list()` PROPIO), no la lista del árbol que el propio gesto acaba de tocar.
		await page.getByRole('button', { name: 'Volver al formulario' }).click();
		await expect(page).toHaveURL(/\/c\/paginas\/pagina_1$/);
		const titles = page.locator('.vega-block-title');
		const types = page.locator('.vega-block-type');
		await expect(titles).toHaveCount(4);
		await expect(titles.nth(0)).toHaveText(SECCIONES[0].text);
		// La sección nueva, sin `heading` todavía (recién creada): se identifica por su TIPO, en la
		// posición 1 — entre `seccion_1` y `seccion_2`, nunca al final.
		await expect(types.nth(1)).toHaveText(/Texto/);
		await expect(titles.nth(2)).toHaveText(SECCIONES[1].text);
		await expect(titles.nth(3)).toHaveText(SECCIONES[2].text);
	});

	test('arrastrar un tipo de la paleta sobre una página VACÍA (0 bloques) la crea igual', async ({
		page
	}) => {
		// `pagina_2` («Sobre mí»): sin secciones sembradas (ver la cabecera del fichero, "Solo
		// `pagina_1` trae secciones") — el caso que no tiene ni un rectángulo de bloque donde soltar,
		// motivo de ser de `.vega-visual-overlay-empty-drop`.
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_2', blocks: [] });
		await openVisualEditor(page, site, 'pagina_2');
		await waitConnected(page, 0);

		const paletteItem = page
			.locator('.vega-palette-panel')
			.getByRole('button', { name: 'Portada', exact: true });
		await expect(paletteItem).toBeVisible();
		const sourceBox = await paletteItem.boundingBox();
		if (!sourceBox) throw new Error('bounding box ausente (layout no resuelto)');

		const iframeBox = await page.locator('iframe.vega-visual-frame').boundingBox();
		if (!iframeBox) throw new Error('bounding box ausente (layout no resuelto)');
		const dropX = iframeBox.x + iframeBox.width / 2;
		const dropY = iframeBox.y + iframeBox.height / 2;

		await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
		await page.mouse.down();
		await page.mouse.move(
			sourceBox.x + sourceBox.width / 2 + 24,
			sourceBox.y + sourceBox.height / 2,
			{ steps: 5 }
		);
		await page.mouse.move(dropX, dropY, { steps: 15 });

		// Sin un solo bloque que sobrevolar, la ÚNICA capa de destino es la caja entera del lienzo
		// (ver la cabecera de `VisualOverlay.svelte`, "Página vacía + arrastre de paleta en vuelo").
		await expect(page.locator('.vega-visual-overlay-empty-drop')).toBeVisible();

		await page.mouse.up();

		await expect(page.locator('.vega-visual-overlay-empty-drop')).toHaveCount(0);

		await page.getByRole('button', { name: 'Volver al formulario' }).click();
		await expect(page).toHaveURL(/\/c\/paginas\/pagina_2$/);
		await expect(page.locator('.vega-block-title')).toHaveCount(1);
		await expect(page.locator('.vega-block-type')).toHaveText(/Portada/);
	});
});
