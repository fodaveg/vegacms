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
	 * Defecto "el botón `+` del lienzo crea sin preguntar el tipo": la mitad homogénea del arreglo
	 * (`hasTypeMenu === false`), de punta a punta contra el bridge cross-origin real.
	 *
	 * **Por qué no la mitad "con menú de tipos" (elegir un tipo y comprobar que crea CON ESE
	 * tipo)**: ninguna semilla de esta suite (`DEMO_SEED`/`DEMO_SEED_WITH_MEDIA`/`SHOWCASE_SEED`,
	 * `src/lib/session/demo-seed.ts`) declara un vocabulario `blockTypes` en su manifiesto —
	 * verificado con `grep -n "blockTypes" src/lib/session/demo-seed.ts`, cero resultados — así que
	 * ninguna página alcanzable con `loginAsDemo()` tiene `blocksState.hasTypeMenu === true`.
	 * Construirla exigiría dar a `secciones` un campo `text` para `typeField` (patrón que
	 * `site-seeding.ts#STARTER_BLOCKS` ya usa para el asistente de creación de sitios) y declarar un
	 * `blockTypes` en `SHOWCASE_MANIFEST` — un cambio real sobre `demo-seed.ts`, fuera del alcance
	 * cerrado de esta tarea (que solo toca este fichero, `VisualOverlay.svelte`, sus tests y los dos
	 * i18n) y compartido por TODA la suite e2e, así que no se toca aquí sin confirmación. Esa mitad
	 * queda cubierta a nivel de componente en `VisualOverlay.svelte.test.ts` ("elegir un tipo del
	 * menú crea CON ESE tipo…", falsificada en el informe de la tarea) — lo que un e2e añadiría
	 * encima es la vuelta completa por el bridge real, que este test SÍ cubre para la otra rama del
	 * mismo `handleInsertClick`.
	 */
	test('sin vocabulario de tipos (modo homogéneo), el "+" del lienzo sigue creando directo: nunca abre un menú', async ({
		page
	}) => {
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);

		// N+1 puntos para N=3 bloques; el ÚLTIMO es el punto DESPUÉS del último bloque, "al final de
		// la página" — el caso real que motivó el defecto.
		const insertPoints = page.locator('.vega-visual-overlay-insert');
		await expect(insertPoints).toHaveCount(4);
		const lastPoint = insertPoints.nth(3);
		await expect(lastPoint).not.toHaveAttribute('aria-haspopup', 'menu');

		await lastPoint.click();

		// Nunca aparece ningún menú de tipos: crea directo, igual que antes del defecto para esta
		// rama (`hasTypeMenu === false`).
		await expect(page.locator('[role="menu"]')).toHaveCount(0);
		await expect(page.locator('.vega-tree-list li')).toHaveCount(4);

		// Persistencia real (mismo criterio que el test de "mover" de arriba): una consulta
		// INDEPENDIENTE del formulario normal, no solo el array reactivo del árbol.
		await page.getByRole('button', { name: 'Volver al formulario' }).click();
		await expect(page).toHaveURL(/\/c\/paginas\/pagina_1$/);
		await expect(page.locator('.vega-block-title')).toHaveCount(4);
	});
});
