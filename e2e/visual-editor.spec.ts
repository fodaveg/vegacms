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
		`Conectado al sitio: ${blockCount} ${blockCount === 1 ? 'bloque' : 'bloques'} en la página.`
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

/** Estado de la página en la cabecera (`VisualPublishControl.svelte`): lo usan el bloque de
 *  publicar/despublicar y el de «solo textos», así que vive aquí, en el ámbito del fichero. */
const statusGroup = (page: Page) => page.getByRole('group', { name: 'Estado de la página' });

test.describe('editor visual — protocolo vega-visual-1 contra un sitio cross-origin', () => {
	test('escritorio 1280 con ajustar conserva media queries y overlay al redimensionar', async ({
		page
	}, testInfo) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);
		const iframe = page.locator('iframe.vega-visual-frame');
		const frame = await (await iframe.elementHandle())!.contentFrame();
		if (!frame) throw new Error('El marco conectado debe existir');
		// CSS propio del sitio: el breakpoint responde al viewport del iframe, no al lienzo de Vega.
		await frame.addStyleTag({
			content:
				'.block { --site-layout: desktop; } @media (max-width: 899px) { .block { --site-layout: narrow; } }'
		});
		const siteViewport = () =>
			frame.evaluate(() => ({
				width: window.innerWidth,
				desktop: window.matchMedia('(min-width: 1000px)').matches,
				layout: getComputedStyle(document.querySelector('.block')!)
					.getPropertyValue('--site-layout')
					.trim()
			}));
		const alignedOverlay = async () => {
			const block = await frame.locator('[data-vega-block-id="seccion_1"]').boundingBox();
			const overlay = await page
				.locator('.vega-visual-overlay-box[data-vega-block-id="seccion_1"]')
				.boundingBox();
			if (!block || !overlay) return false;
			return ['x', 'y', 'width', 'height'].every(
				(key) =>
					Math.abs(block[key as keyof typeof block] - overlay[key as keyof typeof overlay]) < 2
			);
		};
		const fitFillsCanvas = async () => {
			const canvasWidth = await page
				.locator('.vega-visual-canvas')
				.evaluate((el) => el.clientWidth);
			const painted = await iframe.boundingBox();
			return !!painted && Math.abs(canvasWidth - painted.width) < 2;
		};
		await expect(page.getByRole('combobox', { name: 'Zoom', exact: true })).toHaveValue('fit');
		await expect(page.locator('#vega-sidebar')).toHaveClass(/vega-sidebar-collapsed/);
		await expect.poll(siteViewport).toEqual({ width: 1280, desktop: true, layout: 'desktop' });
		await expect.poll(fitFillsCanvas).toBe(true);
		await expect.poll(alignedOverlay).toBe(true);
		await page.screenshot({ path: testInfo.outputPath('desktop-fit-1440.png') });

		await page.setViewportSize({ width: 1200, height: 900 });
		await expect.poll(siteViewport).toEqual({ width: 1280, desktop: true, layout: 'desktop' });
		await expect.poll(fitFillsCanvas).toBe(true);
		await expect.poll(alignedOverlay).toBe(true);
		for (const width of [390, 834] as const) {
			await page
				.getByRole('combobox', { name: 'Vista', exact: true })
				.selectOption(width === 390 ? 'mobile' : 'tablet');
			await expect.poll(siteViewport).toEqual({ width, desktop: false, layout: 'narrow' });
			await expect.poll(alignedOverlay).toBe(true);
		}
		await page.getByRole('combobox', { name: 'Zoom', exact: true }).selectOption('50');
		await page.getByRole('combobox', { name: 'Vista', exact: true }).selectOption('desktop');
		await expect(page.getByRole('combobox', { name: 'Zoom', exact: true })).toHaveValue('50');
		await expect.poll(siteViewport).toEqual({ width: 1280, desktop: true, layout: 'desktop' });
		await expect.poll(alignedOverlay).toBe(true);
		await page.getByRole('combobox', { name: 'Zoom', exact: true }).selectOption('fit');
		await expect.poll(fitFillsCanvas).toBe(true);
		// Ventanas pequeñas conservan el modo de textos; el nuevo preset no habilita el lienzo allí.
		for (const width of [834, 390]) {
			await page.setViewportSize({ width, height: 844 });
			await expect(page.getByRole('region', { name: 'Solo textos' })).toBeVisible();
			await expect(iframe).toHaveCount(0);
		}
		await page.screenshot({ path: testInfo.outputPath('mobile-texts-390.png') });
		// La entrada directa monta AppShell tras restaurar sesión/modelo; al salir y volver por
		// navegación SPA conserva la preferencia manual y vuelve a aplicar el plegado temporal.
		await page.setViewportSize({ width: 1440, height: 900 });
		await waitConnected(page, 3);
		await page.locator('.vega-visual-back').click();
		await expect(page).toHaveURL(/\/c\/paginas\/pagina_1$/);
		await expect(page.locator('#vega-sidebar')).not.toHaveClass(/vega-sidebar-collapsed/);
		await page.locator('.vega-editor-visual-button').click();
		await waitConnected(page, 3);
		await expect(page.locator('#vega-sidebar')).toHaveClass(/vega-sidebar-collapsed/);
	});

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

		await expect(visibleInspectorBody(page).locator('.vega-block-context-title')).toHaveText(
			'Tu contenido, en tu servidor'
		);
		await expect(headingInput(page)).toHaveValue('Tu contenido, en tu servidor');
		// Aserción que el hallazgo original esquivaba (ver la cabecera de `headingInput`): el arreglo
		// namespacea el id por `record.id` (`field-ids.ts`/`field-scope.ts`), así que con el SEGUNDO
		// bloque desplegado `getByLabel()` ya resuelve al input VISIBLE — antes del arreglo no
		// encontraba nada (el `label[for="vega-field-heading"]` del DOM apuntaba siempre al primer
		// nodo, oculto). Label «Título», no «Heading»: `seccion_2` siembra `tipo: 'texto'`
		// (`SECCIONES_RECORDS`, `demo-seed.ts`), y en modo tipado (`typeField`/`dataField` de
		// `paginas.blocks`) el label del campo `heading` sale de `blockTypes.texto.fields`
		// (`demo-seed.ts`), que lo declara `label: 'Título'` — no del `humanizeLabel('heading')`
		// genérico que daría «Heading».
		await expect(
			visibleInspectorBody(page).getByRole('textbox', { name: 'Título', exact: true })
		).toHaveValue('Tu contenido, en tu servidor');
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

/**
 * Estado de la página en la cabecera (lámina del audit p2, `VisualPublishControl.svelte`). Corre
 * sobre `pagina_1` («Inicio»), que `SHOWCASE_SEED` siembra en `draft` con `statusLabels`
 * (`Borrador`/`Publicada`). El control está rotulado «Marcar como publicada», distinto del
 * «Publicar» de la barra superior, y la etiqueta solo cambia cuando el servidor confirma.
 *
 * Desde el lote 13 («Inicio» siembra avisos de la revisión antes de publicar, ver
 * `SECCIONES_RECORDS`/`PAGINAS_CONTENT_TYPE`), «Marcar como publicada» pregunta primero: el
 * camino sin avisos (publicar a la primera) lo mide `VisualPublishControl.svelte.test.ts`; aquí
 * se pasa por «Publicar igualmente». `e2e/publish-review.spec.ts` cubre el popover en sí.
 */
test.describe('editor visual — publicar y despublicar desde la cabecera', () => {
	test('marcar como publicada y volver a borrador, con la etiqueta del servidor', async ({
		page
	}) => {
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);

		const group = statusGroup(page);
		await expect(group).toContainText('Borrador');
		await group.getByRole('button', { name: 'Marcar como publicada', exact: true }).click();
		await page
			.getByRole('alertdialog', { name: /^Antes de publicar/ })
			.getByRole('button', { name: 'Publicar igualmente', exact: true })
			.click();

		await expect(group).toContainText('Publicada');
		await expect(page.getByText('«Inicio» pasa a «Publicada».')).toBeVisible();

		await group.getByRole('button', { name: 'Pasar a borrador', exact: true }).click();
		await expect(group).toContainText('Borrador');
		await expect(
			group.getByRole('button', { name: 'Marcar como publicada', exact: true })
		).toBeVisible();
	});

	test('con un bloque sin guardar, publicar pide confirmación en línea; Esc cierra', async ({
		page
	}) => {
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);

		// Un borrador en la ficha de la primera sección, SIN guardar.
		const frame = page.frameLocator('iframe.vega-visual-frame');
		await frame.locator('[data-vega-block-id="seccion_1"]').click();
		await headingInput(page).fill('Cambio que aún no se ha guardado');

		const group = statusGroup(page);
		const publish = group.getByRole('button', { name: 'Marcar como publicada', exact: true });
		await publish.click();

		// Con un bloque sin guardar Y avisos de la revisión (lote 13): UNA sola confirmación, «Antes
		// de publicar», con los bloques primero y los avisos debajo.
		const confirm = page.getByRole('alertdialog', { name: 'Antes de publicar', exact: true });
		await expect(confirm).toBeVisible();
		await expect(confirm).toContainText('Hay 1 bloque sin guardar');
		await expect(confirm).toContainText(`«${SECCIONES[0].text}»`);
		await expect(confirm.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
		await expect(group).toContainText('Borrador');

		await page.keyboard.press('Escape');
		await expect(confirm).toHaveCount(0);
		await expect(publish).toBeFocused();

		await publish.click();
		await page
			.getByRole('alertdialog', { name: 'Antes de publicar', exact: true })
			.getByRole('button', { name: 'Publicar igualmente', exact: true })
			.click();
		await expect(group).toContainText('Publicada');
		// «Publicar igualmente» NO guarda los bloques: el borrador sigue en la ficha.
		await expect(headingInput(page)).toHaveValue('Cambio que aún no se ha guardado');
	});
});

/**
 * Modo «solo textos» (Lote 12, lámina 8): por debajo de los 900 px del lienzo
 * (`VisualEditorScreen.svelte#NARROW_QUERY`) la pantalla ya no es una salida, enseña las secciones
 * de la página con solo sus campos de texto (`VisualInspector.svelte` en `mode="texts"`,
 * `BlockEditor` con `textsOnly`). Lo que estos tests compran de punta a punta y la suite de
 * componente no puede: que en un viewport de móvil REAL el sitio no se descarga (cero peticiones
 * de token al `visual-site`), y que lo guardado desde el móvil lo relee `RecordBlocks.svelte` con su
 * propio `list()` (misma comprobación independiente que el test del reorden, más arriba).
 */
test.describe('editor visual — modo «solo textos» por debajo de 900 px', () => {
	const textsSections = (page: Page) => page.locator('section.vega-inspector-body--texts');

	test('a 390 px: sin lienzo ni token; las tres secciones con sus textos, en orden y con su tipo', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');

		await expect(page.getByRole('region', { name: 'Solo textos' })).toBeVisible();
		await expect(page.locator('iframe.vega-visual-frame')).toHaveCount(0);
		await expect(page.locator('.vega-tree-panel')).toHaveCount(0);

		const sections = textsSections(page);
		await expect(sections).toHaveCount(3);
		// Cabecera = etiqueta del tipo de bloque del manifiesto (`SHOWCASE_MANIFEST.blockTypes`).
		await expect(sections.nth(0).getByRole('heading', { level: 3 })).toHaveText(SECCIONES[0].text);
		await expect(sections.nth(0).locator('option').nth(0)).toContainText('Portada');
		await expect(sections.nth(1).getByRole('heading', { level: 3 })).toHaveText(SECCIONES[1].text);
		await expect(sections.nth(1).locator('option').nth(1)).toContainText('Texto');
		await expect(sections.nth(2).getByRole('heading', { level: 3 })).toHaveText(SECCIONES[2].text);
		await expect(sections.nth(2).locator('option').nth(2)).toContainText('Galería');
		// Cada campo con su etiqueta, alcanzable por nombre accesible dentro de SU sección (los ids
		// van namespaceados por bloque, `field-scope.ts`): «Título» en las tres, «Cuerpo» solo en
		// «Texto», «Subtítulo» solo en «Portada». SIEMPRE `exact: true`: `getByLabel` casa por
		// subcadena y «Título» también resolvería «Subtítulo» (medido: strict mode violation en el
		// gate del candidato que integró este spec).
		await expect(sections.nth(0).getByLabel('Título', { exact: true })).toHaveValue(
			SECCIONES[0].text
		);
		await expect(sections.nth(0).getByLabel('Subtítulo', { exact: true })).toBeVisible();
		await expect(sections.nth(1).getByLabel('Cuerpo', { exact: true })).toBeVisible();
		await expect(sections.nth(2).getByLabel('Pie de foto', { exact: true })).toBeVisible();
		// Un «Guardar» por sección, inerte mientras no hay cambios.
		await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toHaveCount(3);
		await expect(
			sections.nth(0).getByRole('button', { name: 'Guardar', exact: true })
		).toBeDisabled();

		// La barra de arriba es la de hoy: volver, migas y estado de la página.
		await expect(page.getByRole('button', { name: 'Volver al formulario' })).toBeVisible();
		await expect(statusGroup(page)).toContainText('Borrador');

		// Y el sitio NO se ha descargado en el móvil: ni una petición de token.
		expect(site.tokenRequestCount()).toBe(0);
		expect(await page.locator('body').evaluate((b) => b.scrollWidth <= window.innerWidth)).toBe(
			true
		);
	});

	test('a 390 px: corregir un titular y guardarlo lo relee el formulario con su propio `list()`', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		const second = textsSections(page).nth(1);

		// `exact: true` (ver arriba): la sección «Texto» solo tiene «Título» y «Cuerpo», pero el
		// criterio es uno para todo el bloque.
		await second.getByLabel('Título', { exact: true }).fill('Titular corregido desde el móvil');
		const save = second.getByRole('button', { name: 'Guardar', exact: true });
		await expect(save).toBeEnabled();
		await save.click();
		// Guardado: el botón vuelve a inerte y la marca «sin guardar» de la barra desaparece.
		await expect(save).toBeDisabled();
		await expect(page.locator('.vega-visual-dirty')).toHaveCount(0);
		await expect(page.locator('.vega-visual-saved-at')).toBeVisible();
		expect(site.tokenRequestCount()).toBe(0);

		// Navegación CLIENTE (ver el test del reorden): un `goto()` reiniciaría el adaptador `memory`.
		await page.getByRole('button', { name: 'Volver al formulario' }).click();
		await expect(page).toHaveURL(/\/c\/paginas\/pagina_1$/);
		const titles = page.locator('.vega-block-title');
		await expect(titles).toHaveCount(3);
		await expect(titles.nth(1)).toHaveText('Titular corregido desde el móvil');
	});

	test('el límite: a 899 px es «solo textos»; a 901 px vuelve el lienzo', async ({ page }) => {
		await page.setViewportSize({ width: 899, height: 900 });
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await expect(page.getByRole('region', { name: 'Solo textos' })).toBeVisible();
		await expect(page.locator('iframe.vega-visual-frame')).toHaveCount(0);
		expect(site.tokenRequestCount()).toBe(0);

		// Ensanchar SIN recargar: el lienzo se monta y entonces (y solo entonces) se pide el token.
		await page.setViewportSize({ width: 901, height: 900 });
		await expect(page.locator('iframe.vega-visual-frame')).toHaveCount(1);
		await expect(page.getByRole('region', { name: 'Inspector' })).toBeVisible();
		await waitConnected(page, 3);
		expect(site.tokenRequestCount()).toBe(1);
	});
});

/**
 * «Programar…» desde la cabecera (lote 12, lámina 2, pieza 2.11; `VisualPublishControl.svelte`
 * montando el `ScheduleDialog` del formulario). `SHOWCASE_SEED` declara `publishAtField` en
 * `paginas` y responde `scheduledPublishing: 'active'`, así que en «Inicio» (borrador) el control
 * ofrece «Programar…». Camino feliz: el diálogo propone una fecha, confirmar la guarda en el
 * registro, la etiqueta pasa a «Programada · …» y el botón a «Cambiar fecha…».
 */
test.describe('editor visual — programar la publicación desde la cabecera', () => {
	test('«Programar…» abre el diálogo y confirmar deja la página programada', async ({ page }) => {
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);

		const group = page.getByRole('group', { name: 'Estado de la página' });
		await expect(group).toContainText('Borrador');
		const schedule = group.getByRole('button', { name: 'Programar…', exact: true });
		await schedule.click();

		const dialog = page.getByRole('dialog', { name: 'Programar la publicación' });
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('Inicio');
		const date = dialog.getByLabel('Publicar el');
		await expect(date).toBeFocused();
		// Propuesta: mañana a las 09:00, hora de este equipo.
		await expect(date).toHaveValue(/^\d{4}-\d{2}-\d{2}T09:00$/);

		await dialog.getByRole('button', { name: 'Programar', exact: true }).click();
		await expect(dialog).toHaveCount(0);
		await expect(page.getByText(/^Se publicará el .+ a las \d{2}:\d{2}\.$/)).toBeVisible();

		await expect(group).toContainText(/Programada · /);
		const change = group.getByRole('button', { name: 'Cambiar fecha…', exact: true });
		await expect(change).toBeVisible();
		await expect(change).toBeFocused();

		// Lo guardado es lo que dice la cabecera: el formulario de la página lo enseña igual.
		await page.getByRole('button', { name: 'Volver al formulario' }).click();
		await expect(page).toHaveURL(/\/c\/paginas\/pagina_1$/);
		await expect(page.locator('.vega-editor-tag')).toContainText(/Programada · /);
	});
});

/** UX03: el borrador de A explica la guarda aunque B esté seleccionado; acceso nativo de teclado. */
test('UX03: abrir y guardar el bloque pendiente desbloquea la paleta', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	const rows = page.locator('.vega-tree-row');
	await rows.nth(0).click();
	await headingInput(page).fill('Borrador A pendiente');
	await rows.nth(1).click();
	const notice = page.getByRole('region', { name: 'Cambios sin guardar', exact: true });
	await expect(notice).toContainText('antes de insertar o reordenar');
	const paletteItems = page.locator('.vega-palette-item');
	await expect(paletteItems.first()).toBeDisabled();
	await page.screenshot({ path: testInfo.outputPath('ux03-after-1280-es-light.png') });
	const open = notice.getByRole('button', {
		name: `Abrir bloque: ${SECCIONES[0].text}`,
		exact: true
	});
	await open.focus();
	await open.press('Enter');
	await expect(headingInput(page)).toBeFocused();
	await expect(headingInput(page)).toHaveValue('Borrador A pendiente');
	await expect(visibleInspectorBody(page)).toHaveAttribute('data-block-id', 'seccion_1');
	await visibleInspectorBody(page).getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(notice).toHaveCount(0);
	await expect(paletteItems.first()).toBeEnabled();

	// El mismo borrador sobrevive a estrecharse; el aviso lleva a ESA ficha entre todas las visibles.
	await headingInput(page).fill('Segundo borrador pendiente');
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.locator('iframe.vega-visual-frame')).toHaveCount(0);
	const closeNav = page.locator('.vega-sidebar-open .vega-sidebar-close');
	if (await closeNav.count()) await closeNav.click();
	await expect
		.poll(() => page.locator('#vega-sidebar').evaluate((el) => el.getBoundingClientRect().right))
		.toBeLessThanOrEqual(0);
	await page.screenshot({ path: testInfo.outputPath('ux03-after-390-es-light.png') });
	const narrowOpen = notice.getByRole('button', {
		name: 'Abrir bloque: Borrador A pendiente',
		exact: true
	});
	await narrowOpen.focus();
	await narrowOpen.press('Space');
	const first = page.locator('.vega-inspector-body[data-block-id="seccion_1"]');
	await expect(first.locator('[data-field="heading"] input')).toBeFocused();
	await expect(first.locator('[data-field="heading"] input')).toHaveValue(
		'Segundo borrador pendiente'
	);
	expect(await page.locator('body').evaluate((body) => body.scrollWidth <= innerWidth)).toBe(true);
});

/** UX01: identidad documental estable y precisión del sitio en los controles secundarios. */
test('UX01: título largo, controles de vista y error del puente conservan las acciones documentales', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	await page.getByRole('button', { name: 'Volver al formulario', exact: true }).click();
	const longTitle =
		'Una página con un título largo para editar sin perder el contexto del documento';
	await page
		.locator('.vega-record-form')
		.getByRole('textbox', { name: 'Título', exact: true })
		.fill(longTitle);
	const save = page.locator('.vega-edit-top').getByRole('button', { name: 'Guardar', exact: true });
	await save.click();
	await expect(page.locator('.vega-editor-dirty')).toHaveCount(0);
	await expect(
		page.locator('.vega-editor-saved-at:not(.vega-editor-saved-at--saving)')
	).toBeVisible();
	await page.getByRole('button', { name: 'Editor visual', exact: true }).click();
	await waitConnected(page, 3);
	await expect(page.getByRole('heading', { name: longTitle, level: 1, exact: true })).toBeVisible();
	const preview = page.getByRole('region', { name: 'Vista previa', exact: true });
	const view = preview.getByRole('combobox', { name: 'Vista', exact: true });
	await view.focus();
	await view.press('ArrowUp');
	await view.press('Enter');
	await expect(view).toHaveValue('tablet');
	const frame = await (await page
		.locator('iframe.vega-visual-frame')
		.elementHandle())!.contentFrame();
	if (!frame) throw new Error('El marco conectado debe existir');
	await expect.poll(() => frame.evaluate(() => innerWidth)).toBe(834);
	await view.selectOption('desktop');
	await preview.getByRole('combobox', { name: 'Zoom', exact: true }).selectOption('50');
	await expect.poll(() => frame.evaluate(() => innerWidth)).toBe(1280);
	await expect(page.locator('.vega-visual-stage')).toHaveCSS(
		'transform',
		'matrix(0.5, 0, 0, 0.5, 0, 0)'
	);
	await page.setViewportSize({ width: 901, height: 900 });
	await frame.evaluate(() =>
		parent.postMessage(
			{
				vega: 'vega-visual-1',
				type: 'error',
				code: 'render-unavailable',
				detail: 'Test: bridge rendering failed'
			},
			'http://localhost:4173'
		)
	);
	const retry = preview.getByRole('button', { name: 'Reintentar', exact: true });
	await expect(retry).toBeVisible();
	await expect(
		statusGroup(page).getByRole('button', { name: 'Marcar como publicada', exact: true })
	).toBeVisible();
	await expect(page.getByRole('heading', { name: longTitle, level: 1, exact: true })).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath('ux01-long-title-901-bridge-error.png') });
	await retry.focus();
	await retry.press('Enter');
	await waitConnected(page, 3);
	await expect(page.getByRole('heading', { name: longTitle, level: 1, exact: true })).toBeVisible();
});

/** Las teclas nativas del selector no son gestos sobre la sección seleccionada. */
test('UX01: los selectores conservan el bloque al usar teclas nativas y CtrlS guarda su borrador', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	await page.locator('[data-vega-tree-row="seccion_1"]').click();
	const originalOrder = await page.locator('.vega-tree-row').allTextContents();
	for (const name of ['Vista', 'Zoom']) {
		const select = page.getByRole('combobox', { name, exact: true });
		await select.focus();
		await select.press('Alt+ArrowDown');
		await select.press('Escape');
		for (const key of ['Delete', 'Backspace', 'Escape']) await select.press(key);
		await expect(page.locator('[data-vega-tree-row="seccion_1"]')).toHaveClass(
			/vega-tree-row--selected/
		);
		await expect(page.locator('.vega-delete-confirm')).toHaveCount(0);
		await expect(page.locator('.vega-tree-row')).toHaveText(originalOrder);
	}
	await headingInput(page).fill('Borrador guardado desde el selector');
	await page.getByRole('combobox', { name: 'Vista', exact: true }).focus();
	await page.keyboard.press('Control+s');
	await expect(page.locator('.vega-visual-pending')).toHaveCount(0);
	await page.getByRole('button', { name: 'Volver al formulario', exact: true }).click();
	await expect(page.locator('.vega-block-title').first()).toHaveText(
		'Borrador guardado desde el selector'
	);
});

/** Datos largos configurados por la UI real; mismos campos en inspector y Solo textos. */
async function openLongBlockForm(page: Page, site: VisualSite): Promise<void> {
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	await page.getByRole('button', { name: 'Volver al formulario', exact: true }).click();
	await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
	const editor = page.getByRole('textbox', { name: 'JSON del manifiesto' });
	const manifest = JSON.parse(await editor.inputValue());
	const fields = Array.from({ length: 8 }, (_, index) => ({
		name: `detalle_${index + 1}`,
		label: `Detalle editorial ${index + 1}`,
		widget: 'textarea',
		source: 'data',
		required: index === 0
	}));
	for (const block of Object.values(manifest.blockTypes) as { fields: unknown[] }[]) {
		block.fields.push(...fields);
	}
	// Los otros dos bloques prueban destinos que no son inputs de texto: cuerpo real de TipTap
	// antes de su toolbar, y la primera acción habilitada del selector de relación.
	const textFields = manifest.blockTypes.texto.fields;
	textFields.unshift(
		textFields.splice(
			textFields.findIndex((f: { name: string }) => f.name === 'cuerpo'),
			1
		)[0]
	);
	const galleryFields = manifest.blockTypes.galeria.fields;
	galleryFields.unshift(
		galleryFields.splice(
			galleryFields.findIndex((f: { name: string }) => f.name === 'imagenes'),
			1
		)[0]
	);
	await editor.fill(JSON.stringify(manifest, null, 2));
	await page
		.locator('.manifest-editor')
		.getByRole('button', { name: 'Guardar', exact: true })
		.click();
	await page.locator('a[href="/c/paginas"]').first().click();
	await page.locator('a[href="/c/paginas/pagina_1"]').click();
	await page.getByRole('button', { name: 'Editor visual', exact: true }).click();
	await waitConnected(page, 3);
}

test('UX02: contexto y Guardar siguen accesibles al recorrer un formulario largo y reflow', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openLongBlockForm(page, site);
	await page.locator('[data-vega-tree-row="seccion_1"]').click();
	const first = page.locator('.vega-inspector-body[data-block-id="seccion_1"]');
	const heading = first.locator('[data-field="heading"] input');
	const longName =
		'Guía editorial de una página con un nombre largo para reconocer el bloque al recorrer todos sus campos';
	await heading.fill(longName);
	for (const [index, field] of (await first.locator('textarea').all()).entries()) {
		await field.fill(
			`Texto editorial ${index + 1} que permanece al cambiar de bloque.\n`.repeat(6)
		);
	}
	const save = first.getByRole('button', { name: 'Guardar', exact: true });
	await save.click();
	await expect(save).toBeDisabled();
	await first.locator('textarea').first().fill('');
	await save.click();
	const error = first.locator('.vega-field-error').first();
	await expect(error).toBeVisible();
	const retainedError = await error.textContent();
	await page.locator('[data-vega-tree-row="seccion_2"]').click();
	await headingInput(page).fill('Borrador B retenido');
	await page
		.getByRole('region', { name: 'Cambios sin guardar', exact: true })
		.getByRole('button', { name: `Abrir bloque: ${longName}`, exact: true })
		.click();
	await expect(heading).toBeFocused();
	await expect(error).toHaveText(retainedError!);
	await expect(first.locator('textarea').first()).toHaveValue('');
	await expect(
		page.locator('[data-block-id="seccion_2"] [data-field="heading"] input')
	).toHaveValue('Borrador B retenido');
	await expect(first.locator('.vega-block-context-title')).toHaveText(longName);
	await expect(first.locator('.vega-block-context-state')).toHaveText(
		'Revisa los campos señalados.'
	);
	await expect(first.getByRole('button', { name: 'Guardar', exact: true })).toHaveCount(1);
	const panel = page.locator('.vega-inspector-panel');
	for (const size of [
		{ width: 1440, height: 900 },
		{ width: 901, height: 900 },
		{ width: 390, height: 844 },
		{ width: 720, height: 500 }
	]) {
		// 720×500 comprueba el espacio CSS de reflow de 1440×1000 al 200%; no simula zoom nativo.
		await page.setViewportSize(size);
		if (size.width < 901) {
			const close = page.locator('.vega-sidebar-open .vega-sidebar-close');
			if (await close.count()) await close.click();
			await expect(page.locator('iframe.vega-visual-frame')).toHaveCount(0);
		}
		await panel.evaluate((el) => {
			el.scrollTop = el.querySelector<HTMLElement>('[data-block-id="seccion_1"]')!.offsetTop + 500;
		});
		await expect
			.poll(async () => {
				const container = (await panel.boundingBox())!;
				const button = (await save.boundingBox())!;
				return (
					button.y >= container.y && button.y + button.height <= container.y + container.height
				);
			})
			.toBe(true);
		await expect(first.locator('.vega-block-context-title')).toBeVisible();
		expect(await page.locator('body').evaluate((el) => el.scrollWidth <= innerWidth)).toBe(true);
		await page.screenshot({
			path: testInfo.outputPath(`ux02-${size.width}-long-error-scroll.png`)
		});
		await page
			.getByRole('region', { name: 'Cambios sin guardar', exact: true })
			.getByRole('button', { name: `Abrir bloque: ${longName}`, exact: true })
			.click();
		await expect(heading).toBeFocused();
		const contextBox = (await first.locator('.vega-block-context').boundingBox())!;
		const fieldBox = (await heading.boundingBox())!;
		expect(fieldBox.y).toBeGreaterThanOrEqual(contextBox.y + contextBox.height);
	}
	// Al entrar en B la cabecera A sale con SU ficha, en lugar de apilarse encima de B.
	const second = page.locator('.vega-inspector-body[data-block-id="seccion_2"]');
	await panel.evaluate((el) => {
		el.scrollTop = el.querySelector<HTMLElement>('[data-block-id="seccion_2"]')!.offsetTop + 400;
	});
	await expect
		.poll(
			async () =>
				(await first.locator('.vega-block-context').boundingBox())!.y +
					(await first.locator('.vega-block-context').boundingBox())!.height <=
				(await panel.boundingBox())!.y
		)
		.toBe(true);
	const secondHeader = (await second.locator('.vega-block-context').boundingBox())!;
	expect(secondHeader.y).toBeGreaterThanOrEqual((await panel.boundingBox())!.y);
	// UX03 puede abrir cualquier borrador, aunque su ficha esté completamente fuera del panel.
	for (const size of [
		{ width: 390, height: 844 },
		{ width: 720, height: 500 }
	]) {
		await page.setViewportSize(size);
		await panel.evaluate((el) => {
			el.scrollTop = 0;
		});
		expect((await second.boundingBox())!.y).toBeGreaterThan(
			(await panel.boundingBox())!.y + (await panel.boundingBox())!.height
		);
		await page
			.getByRole('region', { name: 'Cambios sin guardar', exact: true })
			.getByRole('button', { name: `Abrir bloque: ${SECCIONES[1].text}`, exact: true })
			.click();
		const secondInput = second.locator('[data-field="heading"] input');
		await expect(secondInput).toBeFocused();
		await page.evaluate(
			() =>
				new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
				)
		);
		const field = (await secondInput.boundingBox())!,
			header = (await second.locator('.vega-block-context').boundingBox())!,
			viewport = (await panel.boundingBox())!;
		expect(field.y).toBeGreaterThanOrEqual(header.y + header.height);

		expect(field.y - 3).toBeGreaterThanOrEqual(header.y + header.height - 1);
		expect(field.y + field.height + 3).toBeLessThanOrEqual(viewport.y + viewport.height + 1);
		await page
			.getByRole('region', { name: 'Cambios sin guardar', exact: true })
			.getByRole('button', { name: `Abrir bloque: ${longName}`, exact: true })
			.click();
		await expect(heading).toBeFocused();
		await page.evaluate(
			() =>
				new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
				)
		);
		const firstField = (await heading.boundingBox())!,
			firstHeader = (await first.locator('.vega-block-context').boundingBox())!;
		expect(firstField.y).toBeGreaterThanOrEqual(firstHeader.y + firstHeader.height);
		expect(firstField.y - 3).toBeGreaterThanOrEqual(firstHeader.y + firstHeader.height - 1);
		expect(firstField.y + firstField.height + 3).toBeLessThanOrEqual(
			viewport.y + viewport.height + 1
		);
		if (size.width === 720)
			await page.screenshot({
				path: testInfo.outputPath('ux02-720x500-two-drafts-focused-field.png')
			});
	}
});

for (const empty of [false, true]) {
	test(`UX02: abrir pendiente enfoca richtext ${empty ? 'vacío' : 'largo'} y relación reales antes que Guardar`, async ({
		page
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openLongBlockForm(page, site);
		await page.locator('[data-vega-tree-row="seccion_2"]').click();
		const richtext = page.locator(
			'[data-block-id="seccion_2"] [data-field="cuerpo"] [contenteditable="true"]'
		);
		await richtext.fill(
			empty ? '' : 'Borrador enriquecido con muchas líneas para un panel corto.\n'.repeat(30)
		);
		await page.locator('[data-vega-tree-row="seccion_3"]').click();
		await headingInput(page).fill('Borrador galería');
		const pending = page.getByRole('region', { name: 'Cambios sin guardar', exact: true });
		await pending
			.getByRole('button', { name: `Abrir bloque: ${SECCIONES[1].text}`, exact: true })
			.click();
		await expect(richtext).toBeFocused();
		await page.setViewportSize({ width: 1440, height: 500 });
		await pending
			.getByRole('button', { name: `Abrir bloque: ${SECCIONES[1].text}`, exact: true })
			.click();
		await expect(richtext).toBeFocused();
		// TipTap restaura su caret después de pintar: el rect del control completo puede empezar
		// fuera del panel si es muy alto; lo que debe seguir visible es la posición editable actual.
		await page.evaluate(
			() =>
				new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
				)
		);
		const caret = await richtext.evaluate((el) => {
			const selection = document.getSelection()!;
			const range = selection.getRangeAt(0);
			return {
				inside: el.contains(range.startContainer),
				collapsed: selection.isCollapsed,
				rect: range.getBoundingClientRect().height
					? range.getBoundingClientRect().toJSON()
					: el.getBoundingClientRect().toJSON()
			};
		});
		const headerBox = (await page
			.locator('[data-block-id="seccion_2"] .vega-block-context')
			.boundingBox())!;
		const panelBox = (await page.locator('.vega-inspector-panel').boundingBox())!;
		if (!empty) expect((await richtext.boundingBox())!.height).toBeGreaterThan(panelBox.height);
		expect(caret.inside && caret.collapsed).toBe(true);
		expect(caret.rect.top).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
		expect(caret.rect.bottom).toBeLessThanOrEqual(panelBox.y + panelBox.height);

		await pending
			.getByRole('button', { name: `Abrir bloque: ${SECCIONES[2].text}`, exact: true })
			.click();
		const relation = page.locator('[data-block-id="seccion_3"] [data-field="imagenes"]');
		await expect
			.poll(() => relation.evaluate((el) => el.contains(document.activeElement)))
			.toBe(true);
		await expect(
			page.locator('[data-block-id="seccion_3"] .vega-block-save-button')
		).not.toBeFocused();
	});
}

/** URL con hash de la distribución real, sin acoplar la prueba al nombre de un chunk. */
async function visualHelpChunkPath(): Promise<string> {
	const { readFile } = await import('node:fs/promises');
	const manifest = JSON.parse(
		await readFile('.svelte-kit/output/client/.vite/manifest.json', 'utf8')
	);
	const entry = Object.entries(manifest).find(([name]) =>
		name.endsWith('/VisualHelpDialog.svelte')
	);
	expect(entry, 'La ayuda tiene una entrada diferida propia en la build').toBeDefined();
	return `/${(entry![1] as { file: string }).file}`;
}

test('UX02: ayuda se descarga solo al pedirla; cerrar durante carga no abre tarde y restaura foco', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const chunk = await visualHelpChunkPath();
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let requests = 0;
	await page.route(`**${chunk}`, async (route) => {
		requests++;
		await held;
		await route.continue();
	});
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	expect(requests).toBe(0);
	const opener = page.getByRole('button', { name: 'Atajos de teclado', exact: true });
	await opener.focus();
	await opener.press('?');
	const loading = page.locator('.vega-visual-help-loading');
	await expect(loading.getByRole('status')).toHaveText('Cargando…');
	await expect(loading.getByRole('button', { name: 'Cerrar', exact: true })).toBeFocused();
	expect(requests).toBe(1);
	await page.keyboard.press('Escape');
	await expect(loading).toHaveCount(0);
	await expect(opener).toBeFocused();
	const response = page.waitForResponse((r) => r.url().endsWith(chunk));
	release();
	await response;
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await opener.click();
	const dialog = page.getByRole('dialog', { name: 'Atajos de teclado', exact: true });
	await expect(dialog).toBeVisible();
	const close = dialog.getByRole('button', { name: 'Cerrar', exact: true });
	await expect(close).toBeFocused();
	await close.press('Tab');
	await expect(close).toBeFocused();
	await close.press('Shift+Tab');
	await expect(close).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(opener).toBeFocused();
});

test('UX02: fallo de descarga de ayuda permite cerrar y guardar sin perder borradores', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const chunk = await visualHelpChunkPath();
	let requests = 0;
	await page.route(`**${chunk}`, async (route) => {
		requests++;
		if (requests === 1) await route.abort('failed');
		else await route.continue();
	});
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	await page.locator('[data-vega-tree-row="seccion_1"]').click();
	await headingInput(page).fill('Borrador conservado durante la descarga');
	await page.getByRole('button', { name: 'Atajos de teclado', exact: true }).click();
	const loading = page.locator('.vega-visual-help-loading');
	await expect(loading.getByRole('alert')).toContainText('No se ha podido cargar la ayuda');
	await page.screenshot({ path: testInfo.outputPath('ux02-help-load-error.png') });
	await expect(loading).toContainText('Guarda tus cambios antes de recargar el editor');
	await expect(loading.getByRole('button', { name: 'Reintentar', exact: true })).toHaveCount(0);
	await loading.getByRole('button', { name: 'Cerrar', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Atajos de teclado', exact: true })).toBeFocused();
	await expect(headingInput(page)).toHaveValue('Borrador conservado durante la descarga');
	await headingInput(page).fill('Borrador corregido después del fallo de ayuda');
	await visibleInspectorBody(page).getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Cambios sin guardar', exact: true })).toHaveCount(
		0
	);
	await expect(headingInput(page)).toHaveValue('Borrador corregido después del fallo de ayuda');
	expect(requests).toBe(1);
});

test('UX02: desmontar mientras carga ayuda no abre ni enfoca el diálogo después', async ({
	page
}) => {
	const chunk = await visualHelpChunkPath();
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(`**${chunk}`, async (route) => {
		await held;
		await route.continue();
	});
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	await page.getByRole('button', { name: 'Atajos de teclado', exact: true }).click();
	await expect(page.locator('.vega-visual-help-loading')).toBeVisible();
	await page.getByRole('button', { name: 'Volver al formulario', exact: true }).click();
	await expect(page).toHaveURL(/\/c\/paginas\/pagina_1$/);
	const response = page.waitForResponse((r) => r.url().endsWith(chunk));
	release();
	await response;
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.locator('.vega-visual-help-loading')).toHaveCount(0);
	await expect(page.locator('.vega-record-form')).toBeVisible();
});

for (const insertion of [
	{ point: 0, label: 'Añadir al principio', type: 'Portada', index: 0, keyboard: true },
	{
		point: 1,
		label: `Añadir después de «${SECCIONES[0].text}»`,
		type: 'Texto',
		index: 1,
		keyboard: false
	},
	{ point: 3, label: 'Añadir al final', type: 'Galería', index: 3, keyboard: true }
]) {
	test(`UX04: destino confirmado antes de insertar ${insertion.type} en ${insertion.index}`, async ({
		page
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);
		const trigger = page.locator('.vega-visual-overlay-insert').nth(insertion.point);
		await expect(trigger).toHaveAccessibleName(insertion.label);
		if (insertion.keyboard) {
			await trigger.focus();
			await trigger.press('Enter');
		} else await trigger.click();
		const menu = page.getByRole('menu', { name: insertion.label, exact: true });
		await expect(menu.locator('.vega-visual-insert-destination')).toHaveText(insertion.label);
		await expect(page.locator('.vega-tree-list li')).toHaveCount(3);
		const item = menu.getByRole('menuitem', { name: insertion.type, exact: true });
		if (insertion.keyboard) {
			await item.focus();
			await item.press('Enter');
		} else await item.click();
		await expect(page.locator('.vega-tree-list li')).toHaveCount(4);
		await page.getByRole('button', { name: 'Volver al formulario', exact: true }).click();
		await expect(page.locator('.vega-block-type').nth(insertion.index)).toHaveText(insertion.type);
	});
}

test('UX04: el borrador cierra el menú abierto y ningún + crea hasta guardarlo', async ({
	page
}) => {
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	await page.locator('[data-vega-tree-row="seccion_1"]').click();
	const trigger = page.locator('.vega-visual-overlay-insert').first();
	await trigger.focus();
	await trigger.press('Enter');
	await expect(page.getByRole('menu')).toBeVisible();
	// El borrador puede llegar mientras el menú mantiene el foco (p.ej. entrada de editor).
	await headingInput(page).evaluate((input: HTMLInputElement) => {
		input.value = 'Borrador conservado';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await expect(page.getByRole('menu')).toHaveCount(0);
	for (const point of await page.locator('.vega-visual-overlay-insert').all())
		await expect(point).toBeDisabled();
	await expect(page.locator('.vega-tree-list li')).toHaveCount(3);
	await headingInput(page).focus();
	await page.keyboard.press('Control+s');
	await expect(trigger).toBeEnabled();
	await expect(headingInput(page)).toHaveValue('Borrador conservado');
});

test('UX04: Secciones a 901 recibe clic y teclado y devuelve el foco al cerrar', async ({
	page
}) => {
	await page.setViewportSize({ width: 901, height: 900 });
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	const trigger = page.locator('.vega-tree-toggle');
	await expect
		.poll(() =>
			trigger.evaluate((el) => {
				const r = el.getBoundingClientRect();
				return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
			})
		)
		.toBe(true);
	await trigger.click();
	await expect(trigger).toHaveAttribute('aria-expanded', 'true');
	await page.keyboard.press('Escape');
	await expect(trigger).toBeFocused();
	await trigger.press('Enter');
	await expect(trigger).toHaveAttribute('aria-expanded', 'true');
	await page.locator('[data-vega-tree-row="seccion_2"]').click();
	await expect(trigger).toBeFocused();
	await expect(headingInput(page)).toHaveValue(SECCIONES[1].text);
	const frame = await (await page
		.locator('iframe.vega-visual-frame')
		.elementHandle())!.contentFrame();
	expect(await frame!.evaluate(() => innerWidth)).toBe(1280);
});

test('UX11: índice de secciones conserva borrador/error y el formulario respeta cancelar o guardar', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openLongBlockForm(page, site);
	await page.setViewportSize({ width: 390, height: 844 });
	const first = page.locator('[data-block-id="seccion_2"].vega-inspector-body');
	const third = page.locator('[data-block-id="seccion_3"].vega-inspector-body');
	await first.getByLabel('Título', { exact: true }).fill('Borrador con error retenido');
	await first.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(first.locator('.vega-field-error').first()).toBeVisible();
	const error = await first.locator('.vega-field-error').first().textContent();
	await first.getByRole('combobox', { name: 'Ir a sección' }).selectOption('seccion_3');
	await expect(third.getByLabel('Título', { exact: true })).toBeFocused();
	await third.getByRole('combobox', { name: 'Ir a sección' }).selectOption('seccion_2');
	await expect(first.getByLabel('Título', { exact: true })).toBeFocused();
	await expect(first.locator('.vega-field-error').first()).toHaveText(error!);
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect(page.locator('.vega-visual-canvas')).toBeVisible();
	await expect(page.locator('.vega-inspector-body:not([hidden])')).toHaveCount(1);
	await expect(headingInput(page)).toHaveValue('Borrador con error retenido');
	await page.setViewportSize({ width: 390, height: 844 });
	page.once('dialog', (dialog) => dialog.dismiss());
	await first.getByRole('link', { name: 'Abrir formulario completo' }).click();
	await expect(page).toHaveURL(/\/visual$/);
	await expect(first.getByLabel('Título', { exact: true })).toHaveValue(
		'Borrador con error retenido'
	);
	await expect(first.locator('.vega-field-error').first()).toHaveText(error!);
	await first.locator('[data-field="detalle_1"] textarea').fill('Campo requerido corregido');
	await first.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(first.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
	await first.getByRole('link', { name: 'Abrir formulario completo' }).click();
	await expect(page).toHaveURL(/\/c\/paginas\/pagina_1$/);
	await expect(page.locator('.vega-block-title').nth(1)).toHaveText('Borrador con error retenido');
	await page.locator('.vega-block-toggle').nth(1).click();
	await expect(page.getByRole('textbox', { name: 'Detalle editorial 1', exact: true })).toHaveValue(
		'Campo requerido corregido'
	);
});
