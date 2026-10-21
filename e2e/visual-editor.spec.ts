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
import { expect, loginAsDemo, test, waitForHome } from './fixtures';
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

/**
 * Controles VISIBLES del editor (etiqueta y acciones del seleccionado, «+» de inserción y la
 * franja de su junta, pista en línea, llamada de la página vacía) que se cruzan con CUALQUIER
 * contenido visible del marco: cada línea de texto y cada imagen, vídeo o control del sitio, de
 * todas las secciones y también de fuera de ellas (la cabecera de la página). Devuelve los cruces
 * («control → texto»); vacío = nada del editor tapa la página (QA de fodaveg, 21 oct 2026).
 */
async function controlsOverPageContent(page: Page): Promise<string[]> {
	const frameEl = page.locator('iframe.vega-visual-frame');
	const frame = (await (await frameEl.elementHandle())!.contentFrame())!;
	const content = await frame.evaluate(() => {
		const rects: { x: number; y: number; w: number; h: number; what: string }[] = [];
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const text = node.textContent?.trim();
			if (!text || node.parentElement?.closest('script, style')) continue;
			const range = document.createRange();
			range.selectNodeContents(node);
			for (const r of range.getClientRects())
				if (r.width > 1 && r.height > 1)
					rects.push({ x: r.x, y: r.y, w: r.width, h: r.height, what: text.slice(0, 40) });
		}
		for (const el of document.querySelectorAll(
			'img, video, iframe, svg, input, textarea, button'
		)) {
			const r = el.getBoundingClientRect();
			if (r.width > 1 && r.height > 1)
				rects.push({ x: r.x, y: r.y, w: r.width, h: r.height, what: el.tagName });
		}
		return { rects, layoutWidth: document.documentElement.clientWidth };
	});
	return page.evaluate(
		({ rects }) => {
			const iframe = document.querySelector<HTMLIFrameElement>('iframe.vega-visual-frame')!;
			const box = iframe.getBoundingClientRect();
			const scale = box.width / iframe.offsetWidth;
			const onPage = rects
				.map((r) => ({
					x: box.left + r.x * scale,
					y: box.top + r.y * scale,
					w: r.w * scale,
					h: r.h * scale,
					what: r.what
				}))
				.filter((r) => r.y + r.h > box.top && r.y < box.bottom);
			const controls = [
				...document.querySelectorAll<HTMLElement>(
					'.vega-visual-overlay-label, .vega-visual-overlay-toolbar, .vega-visual-overlay-insert, .vega-visual-gap, .vega-visual-inline-hint, .vega-visual-empty-add'
				)
			].filter((el) => {
				let opacity = 1;
				for (let node: HTMLElement | null = el; node; node = node.parentElement) {
					const style = getComputedStyle(node);
					if (style.display === 'none' || style.visibility === 'hidden') return false;
					opacity *= parseFloat(style.opacity);
				}
				// La franja de una junta es invisible pero recibe el puntero: cuenta siempre.
				return el.classList.contains('vega-visual-gap') || opacity > 0.05;
			});
			const hits: string[] = [];
			for (const control of controls) {
				const c = control.getBoundingClientRect();
				if (c.width === 0 || c.height === 0) continue;
				for (const r of onPage)
					if (
						c.x < r.x + r.w - 0.5 &&
						c.x + c.width > r.x + 0.5 &&
						c.y < r.y + r.h - 0.5 &&
						c.y + c.height > r.y + 0.5
					)
						hits.push(`${String(control.className).split(' ')[0]} → ${r.what}`);
			}
			return hits;
		},
		{ rects: content.rects }
	);
}

/** Espera a que la barra superior confirme el saludo (§contrato, "ready es la prueba, no el
 *  anuncio"): antes de esto cualquier aserción sobre el lienzo sería una carrera contra el
 *  handshake. */
async function waitConnected(page: Page, blockCount: number): Promise<void> {
	await expect(page.locator('.vega-visual-status-text')).toHaveText(
		`Conectado al sitio: ${blockCount} ${blockCount === 1 ? 'bloque' : 'bloques'} en la página.`
	);
}

/** El índice se descarga bajo demanda; las pruebas que lo usan lo abren como haría una persona. */
async function openStructure(page: Page): Promise<void> {
	const toggle = page.locator('.vega-visual-panel-toggle--tree');
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(page.locator('.vega-tree-panel')).toBeVisible();
}

const pendingDetails = (page: Page) => page.locator('.vega-visual-pending');

/** El resumen conserva el aviso compacto; sus enlaces son accesibles al desplegarlo. */
async function openPendingDetails(page: Page) {
	const details = pendingDetails(page);
	await expect(details).toBeVisible();
	if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
	await expect(details).toHaveAttribute('open', '');
	return details;
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

/** «Volver al formulario» de la barra del editor (lámina «edición en vivo»; antes «Campos de
 *  página»): navegación CLIENTE al formulario de la página, nunca un `goto()` que reinicie `memory`. */
const formLink = (page: Page, name = 'Volver al formulario') =>
	page.getByRole('link', { name, exact: true });

/** Tamaño de pantalla de la barra (lámina, `.segm`): un botón por preset, `aria-pressed` el vigente.
 *  Sustituye al antiguo `<select>` «Vista» (`mobile`/`tablet`/`desktop`). */
const SCREEN = { mobile: 'Móvil', tablet: 'Tableta', desktop: 'Escritorio' } as const;
const screenButton = (page: Page, preset: keyof typeof SCREEN) =>
	page
		.getByRole('group', { name: 'Tamaño de pantalla', exact: true })
		.getByRole('button', { name: SCREEN[preset], exact: true });

/** Zoom de la barra: el texto «1280 px · 58 %» abre un menú de `menuitemradio` (antes, el `<select>`
 *  «Zoom» con `fit`/`50`/`75`/`100`). `fit` es «Ajustar · N %». */
const zoomName = (zoom: string) => (zoom === 'fit' ? /^Ajustar · \d+ %$/ : `${zoom} %`);
async function chooseZoom(page: Page, zoom: string): Promise<void> {
	await page.locator('.vega-visual-zoom-trigger').click();
	await page.getByRole('menuitemradio', { name: zoomName(zoom), exact: true }).click();
	await expect(page.locator('#vega-visual-zoom-menu')).toHaveCount(0);
}
/** El zoom vigente es el `menuitemradio` marcado; se abre el menú para leerlo y se cierra. */
async function expectZoom(page: Page, zoom: string): Promise<void> {
	const trigger = page.locator('.vega-visual-zoom-trigger');
	await trigger.click();
	await expect(
		page.getByRole('menuitemradio', { name: zoomName(zoom), exact: true })
	).toHaveAttribute('aria-checked', 'true');
	await trigger.click();
	await expect(page.locator('#vega-visual-zoom-menu')).toHaveCount(0);
}

/** Las acciones de una fila del árbol aparecen al pasar o enfocar la fila (lámina, `.trow`): se
 *  enfoca primero, como haría quien navega con teclado. */
async function treeAction(page: Page, rowId: string, name: string) {
	await page.locator(`[data-vega-tree-row="${rowId}"]`).focus();
	return page.getByRole('button', { name, exact: true });
}

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
		// «Ajustar» llena la caja de CONTENIDO del lienzo: el escenario deja su margen alrededor de la
		// hoja (lámina «edición en vivo», `.stage`), que no es sitio para la página.
		const fitFillsCanvas = async () => {
			const canvasWidth = await page.locator('.vega-visual-canvas').evaluate((el) => {
				const style = getComputedStyle(el);
				return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
			});
			const painted = await iframe.boundingBox();
			return !!painted && Math.abs(Math.min(canvasWidth, 1280) - painted.width) < 2;
		};
		await expectZoom(page, 'fit');
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
			const preset = screenButton(page, width === 390 ? 'mobile' : 'tablet');
			await preset.click();
			await expect(preset).toHaveAttribute('aria-pressed', 'true');
			await expect.poll(siteViewport).toEqual({ width, desktop: false, layout: 'narrow' });
			await expect.poll(alignedOverlay).toBe(true);
		}
		await chooseZoom(page, '50');
		await screenButton(page, 'desktop').click();
		await expectZoom(page, '50');
		await expect.poll(siteViewport).toEqual({ width: 1280, desktop: true, layout: 'desktop' });
		await expect.poll(alignedOverlay).toBe(true);
		await chooseZoom(page, 'fit');
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
		await formLink(page).click();
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

	// Regresión fodaveg (21 oct 2026): el contorno se pintaba 4 px DENTRO del bloque y, en una
	// sección cuyo texto llega a su borde, el trazo y el halo tapaban la primera letra de cada línea.
	test('el contorno del seleccionado va FUERA del bloque cuando el lienzo deja sitio', async ({
		page
	}) => {
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);

		await page
			.frameLocator('iframe.vega-visual-frame')
			.locator('[data-vega-block-id="seccion_2"]')
			.click();
		const box = page.locator('.vega-visual-overlay-box[data-vega-block-id="seccion_2"]');
		await expect(box).toHaveClass(/vega-visual-overlay-box--selected/);

		// Posición resuelta del `::before` (el trazo) respecto a la caja del bloque: negativa en los
		// cuatro lados = fuera. Antes era `inset: 4px`, positiva: encima del contenido.
		const ring = await box.evaluate((el) => {
			const style = getComputedStyle(el, '::before');
			return ['top', 'right', 'bottom', 'left'].map((side) =>
				parseFloat(style.getPropertyValue(side))
			);
		});
		for (const offset of ring) expect(offset).toBeLessThan(0);
	});

	// QA de fodaveg (21 oct 2026): la etiqueta y la barra del seleccionado iban ENCIMA del bloque y
	// tapaban el subtítulo de la página en «Sobre mí» y «Música» y la última línea de la sección de
	// arriba en «Blog»; el «+» de la junta tapaba texto. Regla: NINGÚN control del editor se dibuja
	// sobre contenido de la página — ni del seleccionado ni del vecino. Se mide contra TODO lo
	// visible del marco (cada línea de texto, imágenes y controles del sitio), con las secciones
	// pegadas (sin relleno ni margen) y la cabecera de la página justo encima, en reposo, con el
	// ratón sobre cada junta del margen y con el foco de teclado en cada «+».
	const FODAVEG_CASES = [
		{
			name: 'Sobre mí',
			title: 'Sobre mí',
			subtitle: 'Desarrollador. Artista. Músico. Curioso por naturaleza.',
			blocks: [
				{
					id: 'seccion_1',
					type: 'seccion',
					text: 'Hola, soy David. Trabajo como desarrollador web.'
				}
			],
			select: 'seccion_1'
		},
		{
			name: 'Música',
			title: 'Música',
			subtitle: 'Lo que suena cuando no programo.',
			blocks: [{ id: 'seccion_1', type: 'seccion', text: 'Canciones' }],
			select: 'seccion_1'
		},
		{
			name: 'Blog',
			title: 'Blog',
			subtitle: 'Notas sobre desarrollo web, Swift y lo que voy aprendiendo.',
			blocks: [
				{
					id: 'seccion_1',
					type: 'seccion',
					text: 'Escribo sobre desarrollo web, Swift y herramientas.'
				},
				{ id: 'seccion_2', type: 'seccion', text: 'Últimas entradas' }
			],
			select: 'seccion_2'
		}
	] as const;

	for (const visualCase of FODAVEG_CASES) {
		test(`${visualCase.name}: ningún control del editor tapa contenido de la página`, async ({
			page
		}, testInfo) => {
			await page.setViewportSize({ width: 1440, height: 900 });
			const site = createVisualSite({
				collection: 'paginas',
				id: 'pagina_1',
				blocks: [...visualCase.blocks]
			});
			await openVisualEditor(page, site, 'pagina_1');
			await waitConnected(page, visualCase.blocks.length);
			const frame = (await (await page
				.locator('iframe.vega-visual-frame')
				.elementHandle())!.contentFrame())!;
			// Como fodaveg: cabecera de la página (título + subtítulo) pegada a la primera sección y
			// secciones SIN relleno, borde ni margen entre ellas.
			await frame.addStyleTag({
				content: `body { padding: 24px 0 0; }
					header.intro { max-width: 768px; margin: 0 auto; }
					header.intro h1 { margin: 0; font-size: 32px; }
					header.intro p { margin: 0; font-size: 16px; }
					.block { border: 0; padding: 0; margin: 0 auto; max-width: 768px; }
					.block h2 { margin: 0; font-size: 18px; line-height: 1.6; }`
			});
			await frame.evaluate(
				({ title, subtitle }) => {
					const header = document.createElement('header');
					header.className = 'intro';
					header.innerHTML = `<h1></h1><p></p>`;
					header.querySelector('h1')!.textContent = title;
					header.querySelector('p')!.textContent = subtitle;
					document.body.prepend(header);
					window.dispatchEvent(new Event('resize'));
				},
				{ title: visualCase.title, subtitle: visualCase.subtitle }
			);
			await page
				.frameLocator('iframe.vega-visual-frame')
				.locator(`[data-vega-block-id="${visualCase.select}"] h2`)
				.click();
			await expect(
				page.locator(`.vega-visual-overlay-box[data-vega-block-id="${visualCase.select}"]`)
			).toHaveClass(/vega-visual-overlay-box--selected/);
			const toolbar = page.locator('.vega-visual-overlay-toolbar');
			await expect(toolbar).toBeVisible();

			await expect.poll(() => controlsOverPageContent(page)).toEqual([]);
			await page.screenshot({ path: testInfo.outputPath(`${visualCase.name}-reposo.png`) });

			// La franja va ENCIMA de la hoja y los «+» a su IZQUIERDA: fuera de la página.
			const sheet = (await page.locator('.vega-visual-sheet').boundingBox())!;
			const t = (await toolbar.boundingBox())!;
			expect(t.y + t.height).toBeLessThanOrEqual(sheet.y);
			// «Sección N de M» cuenta las secciones del REGISTRO (`pagina_1` de la semilla tiene las
			// tres de `SECCIONES`), no las que este sitio pinta: aquí pinta un subconjunto.
			await expect(page.locator('.vega-visual-chrome')).toContainText(
				`Sección ${SECCIONES.findIndex((b) => b.id === visualCase.select) + 1} de ${SECCIONES.length}`
			);
			const points = page.locator('.vega-visual-overlay-insert');
			await expect(points).toHaveCount(visualCase.blocks.length + 1);
			for (const point of await points.all()) {
				const p = (await point.boundingBox())!;
				expect(p.x + p.width).toBeLessThanOrEqual(sheet.x);
			}

			// Con el ratón en cada junta del margen y con el foco en cada «+»: se ve, y sigue sin
			// tapar nada.
			const opacity = (el: import('@playwright/test').Locator) =>
				el.evaluate((node) => getComputedStyle(node).opacity);
			for (const [index, gap] of (await page.locator('.vega-visual-gap').all()).entries()) {
				const point = points.nth(index);
				await expect.poll(() => opacity(point)).toBe('0');
				await gap.hover();
				await expect.poll(() => opacity(point)).toBe('1');
				expect(await controlsOverPageContent(page)).toEqual([]);
				await page.mouse.move(2, 2);
				await point.focus();
				await expect.poll(() => opacity(point)).toBe('1');
				expect(await controlsOverPageContent(page)).toEqual([]);
				await point.blur();
			}
			await page.locator('.vega-visual-gap').nth(1).hover();
			await page.screenshot({ path: testInfo.outputPath(`${visualCase.name}-junta.png`) });
		});
	}

	test('un clic DENTRO del segundo bloque en el marco abre ESE bloque en el inspector, no el primero', async ({
		page
	}) => {
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);
		await openStructure(page);

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

		// La ficha visible es la de ESE bloque: se nombra con su título, y la cabecera del inspector
		// (lámina, `.insp .head`) con el MISMO título que el árbol y la franja (QA de fodaveg, 21 oct
		// 2026: aquí decía el tipo), y debajo su tipo y su posición en la página.
		await expect(visibleInspectorBody(page)).toHaveAttribute(
			'aria-label',
			'Tu contenido, en tu servidor'
		);
		await expect(page.locator('#vega-inspector-heading')).toHaveText(
			'Tu contenido, en tu servidor'
		);
		await expect(page.locator('.vega-inspector-title small')).toHaveText('Texto · Sección 2 de 3');
		await expect(page.locator('.vega-inspector-title small')).toHaveAttribute('title', 'seccion_2');
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
		await openStructure(page);

		// Baja «Escribe. Publica…» (índice 0) un puesto: intercambia con «Tu contenido…».
		await (await treeAction(page, 'seccion_1', `Bajar «${SECCIONES[0].text}»`)).click();
		await expect(page.locator('.vega-tree-list li').first().locator('.vega-tree-title')).toHaveText(
			SECCIONES[1].text
		);

		// Navegación CLIENTE (el botón llama a `ctx.nav.toRecord`, nunca `page.goto`): un `goto()`
		// real recargaría el documento y con él el adaptador `memory` entero (vuelve a la semilla),
		// perdiendo la escritura que este test quiere comprobar.
		await formLink(page).click();
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
		await openStructure(page);
		await expect(page.locator('.vega-tree-list li')).toHaveCount(4);

		// Persistencia real (mismo criterio que el test de "mover" de arriba): una consulta
		// INDEPENDIENTE del formulario normal, no solo el array reactivo del árbol — y el tipo
		// elegido viajó a su columna REAL (`tipo`), no se perdió por el camino: `RecordBlocks.svelte`
		// pinta `.vega-block-type` desde `blocks.blockTypeOf(record)`, que lee esa columna, nunca el
		// menú que se acaba de cerrar.
		await formLink(page).click();
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
		await openStructure(page);

		const paletteItem = page
			.locator('.vega-palette-panel')
			.locator('.vega-palette-item')
			.filter({ has: page.getByText('Texto', { exact: true }) });
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
		await formLink(page).click();
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
		await openStructure(page);

		const paletteItem = page
			.locator('.vega-palette-panel')
			.locator('.vega-palette-item')
			.filter({ has: page.getByText('Portada', { exact: true }) });
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

		await formLink(page).click();
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
		// Cabecera de cada tarjeta (lámina «Solo textos», `.tcard .head`) = el TÍTULO de la sección
		// (`blockTitle`, ronda 3 del QA de fodaveg) con la etiqueta del tipo del manifiesto debajo; el
		// índice «Ir a sección» enseña «N/M» y su lista nombra cada sección por tipo y título.
		const expected = [
			['Portada', SECCIONES[0].text],
			['Texto', SECCIONES[1].text],
			['Galería', SECCIONES[2].text]
		] as const;
		for (const [index, [type, title]] of expected.entries()) {
			const head = sections.nth(index).getByRole('heading', { level: 3 });
			await expect(head).toHaveText(title);
			await expect(sections.nth(index).locator('.vega-texts-name small')).toHaveText(type);
			await expect(sections.nth(index).locator('.vega-texts-index > span')).toHaveText(
				`${index + 1}/3`
			);
			await expect(sections.nth(index).locator('option').nth(index)).toContainText(
				`${type} — ${title}`
			);
			// A 390 px el índice no recorta ni monta su chevrón sobre el texto, y el nombre se queda
			// con el resto de la cabecera (antes: «1/5 · Text▾» y el tipo en vez del título).
			const geometry = await sections.nth(index).evaluate((section) => {
				const index = section.querySelector<HTMLElement>('.vega-texts-index')!;
				const label = index.querySelector('span')!.getBoundingClientRect();
				const chevron = index.querySelector('svg')!.getBoundingClientRect();
				return {
					clipped: index.scrollWidth > index.clientWidth,
					overlap: chevron.left < label.right - 0.5,
					title: section.querySelector('h3')!.getBoundingClientRect().width
				};
			});
			expect(geometry).toMatchObject({ clipped: false, overlap: false });
			expect(geometry.title).toBeGreaterThanOrEqual(180);
		}
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
		await expect(formLink(page)).toBeVisible();
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
		await formLink(page).click();
		await expect(page).toHaveURL(/\/c\/paginas\/pagina_1$/);
		const titles = page.locator('.vega-block-title');
		await expect(titles).toHaveCount(3);
		await expect(titles.nth(1)).toHaveText('Titular corregido desde el móvil');
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`a 390 px (${colorScheme}): al desplazar, ningún encabezado fijo se pinta sobre otro`, async ({
			page
		}, testInfo) => {
			// QA de fodaveg (21 oct 2026, `f6b-rueda-360px.png`): la introducción de «Solo textos» se
			// quedaba fija en `top: 0` con fondo transparente y la cabecera de la tarjeta («Texto») se
			// pintaba encima. Lo fijo arriba es solo la cabecera de cada tarjeta, opaca.
			await page.emulateMedia({ colorScheme });
			await page.setViewportSize({ width: 390, height: 844 });
			const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
			await openVisualEditor(page, site, 'pagina_1');
			await expect(textsSections(page)).toHaveCount(3);
			const panel = page.locator('.vega-inspector-panel');
			for (const scroll of [120, 360, 600]) {
				await panel.evaluate((el, top) => (el.scrollTop = top), scroll);
				const overlaps = await page.evaluate(() => {
					const panelBox = document.querySelector('.vega-inspector-panel')!.getBoundingClientRect();
					const heads = [
						...document.querySelectorAll<HTMLElement>('.vega-inspector-head, .vega-texts-head')
					]
						.map((el) => ({ el, r: el.getBoundingClientRect() }))
						.filter(({ r }) => r.bottom > panelBox.top + 1 && r.top < panelBox.bottom - 1);
					const hits: string[] = [];
					for (const [i, a] of heads.entries())
						for (const b of heads.slice(i + 1))
							if (
								Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 0.5 &&
								Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 0.5
							)
								hits.push(`${a.el.className} × ${b.el.className}`);
					// Opacidad real del fondo (el token es un `color-mix`): se pinta en un lienzo de 1 px.
					const paint = document.createElement('canvas').getContext('2d')!;
					const alpha = (colour: string) => {
						paint.clearRect(0, 0, 1, 1);
						paint.fillStyle = colour;
						paint.fillRect(0, 0, 1, 1);
						return paint.getImageData(0, 0, 1, 1).data[3];
					};
					const transparent = heads
						.filter(({ el }) => getComputedStyle(el).position === 'sticky')
						.filter(({ el }) => alpha(getComputedStyle(el).backgroundColor) !== 255)
						.map(({ el }) => `${el.className}: ${getComputedStyle(el).backgroundColor}`);
					return { hits, transparent };
				});
				expect(overlaps, `scroll ${scroll}`).toEqual({ hits: [], transparent: [] });
				if (scroll === 360)
					await page.screenshot({
						path: testInfo.outputPath(`texts-390-scroll-360-${colorScheme}.png`)
					});
			}
		});
	}

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
		await waitConnected(page, 3);
		await page
			.frameLocator('iframe.vega-visual-frame')
			.locator('[data-vega-block-id="seccion_1"]')
			.click();
		// El inspector aparece con la ficha del bloque seleccionado, nombrada por su título (la
		// región del panel se llama «Inspector»: con el título de la ficha dentro, repetirlo daría
		// dos regiones con el mismo nombre).
		await expect(page.getByRole('region', { name: 'Inspector', exact: true })).toBeVisible();
		await expect(page.locator('#vega-inspector-heading')).toHaveText(SECCIONES[0].text);
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
		await formLink(page).click();
		await expect(page).toHaveURL(/\/c\/paginas\/pagina_1$/);
		await expect(page.locator('.vega-editor-tag')).toContainText(/Programada · /);
	});
});

/**
 * Barra única (lámina «edición en vivo», nota 3): en el editor la barra de la app NO se monta
 * (`AppShell.svelte`), pero el buscador global por teclado sigue: ⌘K/Ctrl+K lo abre como capa.
 */
test('editor visual: sin barra de la app, ⌘K abre el buscador global y Escape lo cierra', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	await expect(page.locator('.vega-topbar')).toHaveCount(0);
	const search = page.getByRole('combobox', { name: 'Búsqueda global', exact: true });
	await expect(search).toBeHidden();
	await page.locator('.vega-visual-back').focus();
	await page.keyboard.press('ControlOrMeta+k');
	await expect(search).toBeVisible();
	await expect(search).toBeFocused();
	await search.fill('Inicio');
	await expect(page.getByRole('option', { name: /Inicio/ }).first()).toBeVisible();
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape');
	await expect(search).toBeHidden();
	// Sigue el editor, sin haber navegado.
	await expect(page).toHaveURL(/\/c\/paginas\/pagina_1\/visual$/);
});

/**
 * Franja y margen del escenario (QA de fodaveg, 21 oct 2026): las acciones del seleccionado van
 * en una franja ENCIMA de la hoja y los «+» en el margen de su IZQUIERDA, sin solaparse entre sí
 * ni con la página, a cualquier ancho; y cada botón de la barra es lo que se ve en su centro.
 */
test('ronda 3 del QA de fodaveg: la paleta no corta ninguna palabra, también con los nombres largos de fodaveg', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	// Los nombres de la paleta de fodaveg que se partían («Galería selecciona|da»).
	await page.locator('.vega-visual-back').click();
	await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
	const editor = page.getByRole('textbox', { name: 'JSON del manifiesto' });
	const manifest = JSON.parse(await editor.inputValue());
	for (const [name, label] of [
		['galeria-seleccionada', 'Galería seleccionada'],
		['entradas-seleccionadas', 'Entradas seleccionadas'],
		['filas-proyectos', 'Filas de proyectos (Portfolio)'],
		['cita', 'Cita destacada'],
		['titular', 'Titular a máquina']
	])
		manifest.blockTypes[name] = { ...manifest.blockTypes.texto, label };
	await editor.fill(JSON.stringify(manifest, null, 2));
	await page
		.locator('.manifest-editor')
		.getByRole('button', { name: 'Guardar', exact: true })
		.click();
	await page.locator('a[href="/c/paginas"]').first().click();
	await page.locator('a[href="/c/paginas/pagina_1"]').click();
	await page.getByRole('button', { name: 'Editor visual', exact: true }).click();
	await waitConnected(page, 3);
	const names = page.locator('.vega-palette-copy strong');
	await expect(names).toHaveCount(8);
	const broken = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('.vega-palette-copy strong')].flatMap((strong) => {
			const text = strong.firstChild as Text;
			const problems: string[] = [];
			if (strong.scrollWidth > strong.clientWidth + 0.5) problems.push(`${text.data}: desborda`);
			// Una palabra en DOS líneas devuelve dos rectángulos.
			for (const match of text.data.matchAll(/\S+/g)) {
				const range = document.createRange();
				range.setStart(text, match.index);
				range.setEnd(text, match.index + match[0].length);
				if (range.getClientRects().length > 1) problems.push(`${match[0]} partida`);
			}
			return problems;
		})
	);
	expect(broken).toEqual([]);
	await page.locator('.vega-palette-panel').screenshot({
		path: testInfo.outputPath('paleta-nombres-largos.png')
	});
});

test('ronda 3 del QA de fodaveg: ⌘S guarda TODO lo pendiente aunque la ficha abierta esté limpia, también desde el lienzo', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	await openStructure(page);
	// Foco en el árbol: la ficha abierta (seccion_2) está limpia y seccion_1 tiene cambios.
	await page.locator('[data-vega-tree-row="seccion_1"]').click();
	await headingInput(page).fill('Titular guardado con el atajo');
	await page.locator('[data-vega-tree-row="seccion_2"]').click();
	await expect(pendingDetails(page)).toBeVisible();
	await page.keyboard.press('ControlOrMeta+s');
	await expect(pendingDetails(page)).toHaveCount(0);
	await expect(page.locator('.vega-visual-saved-at')).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath('cmds-otra-seccion-guardada.png') });

	// Y con el foco dentro de la ficha abierta, que también está limpia. (Desde el sitio llega por
	// `save-shortcut`, mismo camino: lo cubre la e2e con el puente real.)
	await page.locator('[data-vega-tree-row="seccion_3"]').click();
	await headingInput(page).fill('Tercera con cambios');
	await page.locator('[data-vega-tree-row="seccion_1"]').click();
	await headingInput(page).focus();
	await page.keyboard.press('ControlOrMeta+s');
	await expect(pendingDetails(page)).toHaveCount(0);

	await formLink(page).click();
	const titles = page.locator('.vega-block-title');
	await expect(titles.nth(0)).toHaveText('Titular guardado con el atajo');
	await expect(titles.nth(2)).toHaveText('Tercera con cambios');
});

test('QA de fodaveg: la sección se nombra igual en todas partes, también en el lienzo «Móvil» y al borrarla', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	// La paleta no parte palabras con guion («selecciona-da»).
	const tileNames = page.locator('.vega-palette-copy strong');
	await expect(tileNames.first()).toBeVisible();
	expect(await tileNames.first().evaluate((el) => getComputedStyle(el).hyphens)).toBe('manual');

	await screenButton(page, 'mobile').click();
	await waitConnected(page, 3);
	await page
		.frameLocator('iframe.vega-visual-frame')
		.locator('[data-vega-block-id="seccion_2"]')
		.click();
	// Inspector, árbol y franja: el mismo nombre (`blockTitle`).
	await expect(page.locator('#vega-inspector-heading')).toHaveText(SECCIONES[1].text);
	const name = page.locator('.vega-visual-chrome-name');
	await expect(name).toHaveText(SECCIONES[1].text);
	// Con el ancho del lienzo «Móvil» (con árbol, paleta e inspector abiertos a 1440 px la franja
	// mide lo que la hoja escalada) el nombre se queda con todo lo que deja la barra de acciones: el
	// contador y el texto del tipo ceden antes (antes quedaba «Q»).
	const strip = await name.evaluate((el) => {
		const main = el.parentElement!;
		const pill = main.querySelector('.vega-visual-overlay-label')!;
		return {
			name: el.getBoundingClientRect().width,
			text: el.scrollWidth,
			room:
				main.getBoundingClientRect().width -
				pill.getBoundingClientRect().width -
				(parseFloat(getComputedStyle(main).columnGap) || 0),
			typeText: getComputedStyle(main.querySelector('.vega-visual-overlay-label-text')!).display,
			position: getComputedStyle(main.querySelector('.vega-visual-chrome-position')!).display
		};
	});
	expect(strip.typeText).toBe('none');
	expect(strip.position).toBe('none');
	expect(strip.name).toBeGreaterThanOrEqual(Math.min(strip.text, strip.room) - 1);
	// Sin avisos que dar, el nombre se queda con todo lo que no es la barra de acciones.
	expect(strip.name).toBeGreaterThanOrEqual(120);
	await page.screenshot({ path: testInfo.outputPath('franja-movil-nombre.png') });

	// Borrar desde la franja: el diálogo nombra la sección, no «esta entrada».
	await page.locator('.vega-visual-overlay-toolbar-btn--danger').click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog.getByRole('heading')).toHaveText(`¿Borrar «${SECCIONES[1].text}»?`);
	await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
	await expect(dialog).toHaveCount(0);
});

test('una sección que el sitio pinta sin altura: contorno discontinuo sin fondo ni texto sobre la página; la franja lo dice', async ({
	page
}, testInfo) => {
	// QA de fodaveg (21 oct 2026, `f8c-marcador-vacio-zoom.png`): el marcador «· aún sin contenido»
	// medía 28 px con fondo opaco y tapaba parte de la línea de encima.
	await page.setViewportSize({ width: 1440, height: 900 });
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	const frame = page.frames().find((item) => item.url().includes('vega-visual-site.example'))!;
	await frame.evaluate(() => {
		const block = document.querySelector<HTMLElement>('[data-vega-block-id="seccion_2"]')!;
		block.style.cssText = 'height:0;padding:0;border:0;margin:0;overflow:hidden';
		window.dispatchEvent(new Event('resize'));
	});
	await openStructure(page);
	await page.locator('[data-vega-tree-row="seccion_2"]').click();
	const marker = page.locator('.vega-visual-overlay-box--empty[data-vega-block-id="seccion_2"]');
	await expect(marker).toHaveCount(1);
	const painted = await marker.evaluate((el) => ({
		height: el.getBoundingClientRect().height,
		text: el.textContent?.trim() ?? '',
		fill: getComputedStyle(el, '::before').backgroundColor,
		border: getComputedStyle(el, '::before').borderTopStyle
	}));
	expect(painted).toEqual({ height: 0, text: '', fill: 'rgba(0, 0, 0, 0)', border: 'dashed' });
	await page.screenshot({ path: testInfo.outputPath('seccion-vacia-1440.png') });
	await expect(page.locator('.vega-visual-chrome-position')).toHaveText(
		'Sección 2 de 3 · aún sin contenido'
	);
	expect(await controlsOverPageContent(page)).toEqual([]);
});

for (const width of [1440, 1100]) {
	test(`franja de acciones y «+» del margen fuera de la hoja a ${width}`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);
		await page
			.frameLocator('iframe.vega-visual-frame')
			.locator('[data-vega-block-id="seccion_2"]')
			.click();
		const toolbar = page.locator('.vega-visual-overlay-toolbar');
		await expect(toolbar).toBeVisible();
		const sheet = (await page.locator('.vega-visual-sheet').boundingBox())!;
		const t = (await toolbar.boundingBox())!;
		expect(t.y + t.height).toBeLessThanOrEqual(sheet.y);
		expect(t.x + t.width).toBeLessThanOrEqual(sheet.x + sheet.width + 0.5);
		for (const point of await page.locator('.vega-visual-overlay-insert').all()) {
			const p = (await point.boundingBox())!;
			expect(p.x + p.width).toBeLessThanOrEqual(sheet.x);
			expect(p.x).toBeGreaterThanOrEqual(0);
		}
		// Lo que se ve en el centro de cada botón de la barra es ese botón.
		for (const button of await toolbar.getByRole('button').all()) {
			const hit = await button.evaluate((el) => {
				const r = el.getBoundingClientRect();
				const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
				return el === at || el.contains(at);
			});
			expect(hit).toBe(true);
		}
	});
}

/** UX03: el borrador de A explica la guarda aunque B esté seleccionado; acceso nativo de teclado. */
test('UX03: abrir y guardar el bloque pendiente desbloquea la paleta', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	await openStructure(page);
	const rows = page.locator('.vega-tree-row');
	await rows.nth(0).click();
	await headingInput(page).fill('Borrador A pendiente');
	await openStructure(page);
	await rows.nth(1).click();
	const notice = pendingDetails(page);
	await expect(notice).toContainText('antes de insertar o reordenar');
	const paletteItems = page.locator('.vega-palette-item');
	await expect(paletteItems.first()).toBeDisabled();
	await page.screenshot({ path: testInfo.outputPath('ux03-after-1280-es-light.png') });
	await openPendingDetails(page);
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
	await openPendingDetails(page);
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
	await formLink(page).click();
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
	// El tamaño de pantalla se cambia con el teclado: el segmentado de la barra son botones nativos.
	const tablet = screenButton(page, 'tablet');
	await tablet.focus();
	await tablet.press('Enter');
	await expect(tablet).toHaveAttribute('aria-pressed', 'true');
	const frame = await (await page
		.locator('iframe.vega-visual-frame')
		.elementHandle())!.contentFrame();
	if (!frame) throw new Error('El marco conectado debe existir');
	await expect.poll(() => frame.evaluate(() => innerWidth)).toBe(834);
	await screenButton(page, 'desktop').click();
	await chooseZoom(page, '50');
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
	await openStructure(page);
	await page.locator('[data-vega-tree-row="seccion_1"]').click();
	const originalOrder = await page.locator('.vega-tree-row').allTextContents();
	// Los controles de vista de la barra (tamaño de pantalla y disparador del zoom; antes, los dos
	// `<select>` «Vista» y «Zoom»): sus teclas no son gestos sobre la sección seleccionada.
	for (const control of [
		screenButton(page, 'desktop'),
		page.locator('.vega-visual-zoom-trigger')
	]) {
		await control.focus();
		await control.press('Alt+ArrowDown');
		await page.keyboard.press('Escape');
		await control.focus();
		for (const key of ['Delete', 'Backspace', 'Escape']) await control.press(key);
		await expect(page.locator('[data-vega-tree-row="seccion_1"]')).toHaveClass(
			/vega-tree-row--selected/
		);
		await expect(page.locator('.vega-delete-confirm')).toHaveCount(0);
		await expect(page.locator('.vega-tree-row')).toHaveText(originalOrder);
	}
	await headingInput(page).fill('Borrador guardado desde el selector');
	await screenButton(page, 'desktop').focus();
	await page.keyboard.press('Control+s');
	await expect(page.locator('.vega-visual-pending')).toHaveCount(0);
	await formLink(page).click();
	await expect(page.locator('.vega-block-title').first()).toHaveText(
		'Borrador guardado desde el selector'
	);
});

/** Datos largos configurados por la UI real; mismos campos en inspector y Solo textos. */
async function openLongBlockForm(page: Page, site: VisualSite): Promise<void> {
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	await formLink(page).click();
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
	await openStructure(page);
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
	// El aviso debe dejar sitio al foco también cuando un nombre ocupa otra línea al hacer reflow.
	const longName =
		'Guía editorial de una página con un nombre largo para reconocer el bloque al recorrer todos sus campos. ' +
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
	await openStructure(page);
	await page.locator('[data-vega-tree-row="seccion_2"]').click();
	await headingInput(page).fill('Borrador B retenido');
	await (
		await openPendingDetails(page)
	)
		.getByRole('button', { name: `Abrir bloque: ${longName}`, exact: true })
		.click();
	await expect(heading).toBeFocused();
	await expect(error).toHaveText(retainedError!);
	await expect(first.locator('textarea').first()).toHaveValue('');
	await expect(
		page.locator('[data-block-id="seccion_2"] [data-field="heading"] input')
	).toHaveValue('Borrador B retenido');
	// Contexto de la ficha (lámina «edición en vivo»): la cabecera del inspector dice el TIPO y la
	// POSICIÓN del bloque (antes, su título en `.vega-block-context-title`), y el título lo nombra.
	await expect(first).toHaveAttribute('aria-label', longName);
	await expect(page.locator('.vega-inspector-head')).toContainText('Portada');
	await expect(page.locator('.vega-inspector-head')).toContainText('Sección 1 de 3');
	await expect(first.locator('.vega-block-context-state')).toHaveText(
		'Revisa los campos señalados.'
	);
	await expect(first.getByRole('button', { name: 'Guardar', exact: true })).toHaveCount(1);
	const panel = page.locator('.vega-inspector-panel');
	/** Lo fijo ARRIBA mientras se recorre la ficha: la cabecera del inspector con lienzo, la de la
	 *  tarjeta en «Solo textos» (< 901 px). Lo fijo ABAJO es el pie con Guardar (`.vega-block-context`). */
	const contextOf = (section: typeof first, width: number) =>
		width >= 901 ? page.locator('.vega-inspector-head') : section.locator('.vega-texts-head');
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
		// El contexto sigue a la vista, dentro del panel, a media ficha.
		const context = contextOf(first, size.width);
		await expect(context).toBeVisible();
		await expect
			.poll(async () => {
				const box = (await context.boundingBox())!;
				const container = (await panel.boundingBox())!;
				return box.y >= container.y - 1 && box.y + box.height <= container.y + container.height;
			})
			.toBe(true);
		expect(await page.locator('body').evaluate((el) => el.scrollWidth <= innerWidth)).toBe(true);
		await page.screenshot({
			path: testInfo.outputPath(`ux02-${size.width}-long-error-scroll.png`)
		});
		await (
			await openPendingDetails(page)
		)
			.getByRole('button', { name: `Abrir bloque: ${longName}`, exact: true })
			.click();
		await expect(heading).toBeFocused();
		// El campo enfocado queda ENTRE lo fijo: ni bajo la cabecera ni bajo el pie con Guardar.
		const contextBox = (await contextOf(first, size.width).boundingBox())!;
		const footBox = (await first.locator('.vega-block-context').boundingBox())!;
		const fieldBox = (await heading.boundingBox())!;
		expect(fieldBox.y).toBeGreaterThanOrEqual(contextBox.y + contextBox.height);
		expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(footBox.y + 1);
	}
	// Al entrar en B lo fijo de A (cabecera y pie de su tarjeta) sale con SU ficha, en lugar de
	// apilarse encima de B.
	const second = page.locator('.vega-inspector-body[data-block-id="seccion_2"]');
	await panel.evaluate((el) => {
		el.scrollTop = el.querySelector<HTMLElement>('[data-block-id="seccion_2"]')!.offsetTop + 400;
	});
	for (const sticky of [first.locator('.vega-block-context'), first.locator('.vega-texts-head')])
		await expect
			.poll(
				async () =>
					(await sticky.boundingBox())!.y + (await sticky.boundingBox())!.height <=
					(await panel.boundingBox())!.y
			)
			.toBe(true);
	for (const sticky of [second.locator('.vega-block-context'), second.locator('.vega-texts-head')])
		expect((await sticky.boundingBox())!.y).toBeGreaterThanOrEqual(
			(await panel.boundingBox())!.y - 1
		);
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
		await (
			await openPendingDetails(page)
		)
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
			header = (await second.locator('.vega-texts-head').boundingBox())!,
			foot = (await second.locator('.vega-block-context').boundingBox())!,
			viewport = (await panel.boundingBox())!;
		expect(field.y).toBeGreaterThanOrEqual(header.y + header.height);

		expect(field.y - 3).toBeGreaterThanOrEqual(header.y + header.height - 1);
		expect(field.y + field.height + 3).toBeLessThanOrEqual(viewport.y + viewport.height + 1);
		expect(field.y + field.height).toBeLessThanOrEqual(foot.y + 1);
		await (
			await openPendingDetails(page)
		)
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
			firstHeader = (await first.locator('.vega-texts-head').boundingBox())!,
			firstFoot = (await first.locator('.vega-block-context').boundingBox())!;
		expect(firstField.y).toBeGreaterThanOrEqual(firstHeader.y + firstHeader.height);
		expect(firstField.y - 3).toBeGreaterThanOrEqual(firstHeader.y + firstHeader.height - 1);
		expect(firstField.y + firstField.height + 3).toBeLessThanOrEqual(
			viewport.y + viewport.height + 1
		);
		expect(firstField.y + firstField.height).toBeLessThanOrEqual(firstFoot.y + 1);
		if (size.width === 720)
			await page.screenshot({
				path: testInfo.outputPath('ux02-720x500-two-drafts-focused-field.png')
			});
	}
});

// Solo al fallar este recorrido: recoge geometría y tipografía, nunca valores ni contenido.
test.afterEach(async ({ page }, testInfo) => {
	if (
		testInfo.status === testInfo.expectedStatus ||
		!testInfo.title.startsWith('UX02: contexto y Guardar')
	)
		return;
	const geometry = await page.evaluate(() => {
		const active = document.activeElement;
		const section = active?.closest('.vega-inspector-body');
		const measure = (element: Element | null) => {
			if (!element) return null;
			const rect = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			return {
				x: rect.x,
				y: rect.y,
				width: rect.width,
				height: rect.height,
				fontFamily: style.fontFamily,
				fontSize: style.fontSize,
				lineHeight: style.lineHeight,
				minHeight: style.minHeight,
				maxHeight: style.maxHeight,
				overflowY: style.overflowY,
				scrollTop: element.scrollTop,
				scrollHeight: element.scrollHeight,
				clientHeight: element.clientHeight
			};
		};
		return {
			viewport: { width: innerWidth, height: innerHeight, scale: devicePixelRatio },
			fonts: document.fonts.status,
			screen: measure(document.querySelector('.vega-visual-screen')),
			topbar: measure(document.querySelector('.vega-visual-bar')),
			pending: measure(document.querySelector('.vega-visual-pending')),
			pendingTitle: measure(document.querySelector('.vega-visual-pending h2')),
			pendingGuide: measure(document.querySelector('.vega-visual-pending p')),
			pendingList: measure(document.querySelector('.vega-visual-pending-list')),
			pendingAction: measure(document.querySelector('.vega-visual-pending button')),
			grid: measure(document.querySelector('.vega-visual-grid')),
			panel: measure(document.querySelector('.vega-inspector-panel')),
			header: measure(section?.querySelector('.vega-block-context') ?? null),
			control: measure(active)
		};
	});
	const serialized = JSON.stringify(geometry);
	console.error(`UX02_FOCUS_GEOMETRY ${serialized}`);
	await testInfo.attach('ux02-focus-geometry', {
		body: serialized,
		contentType: 'application/json'
	});
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
		await openStructure(page);
		await page.locator('[data-vega-tree-row="seccion_3"]').click();
		await headingInput(page).fill('Borrador galería');
		const pending = await openPendingDetails(page);
		await pending
			.getByRole('button', { name: `Abrir bloque: ${SECCIONES[1].text}`, exact: true })
			.click();
		await expect(richtext).toBeFocused();
		await page.setViewportSize({ width: 1440, height: 500 });
		await openPendingDetails(page);
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
		// Lo fijo del panel: la cabecera del inspector arriba y el pie con Guardar de la ficha abajo;
		// el caret queda entre los dos.
		const headerBox = (await page.locator('.vega-inspector-head').boundingBox())!;
		const footBox = (await page
			.locator('[data-block-id="seccion_2"] .vega-block-context')
			.boundingBox())!;
		const panelBox = (await page.locator('.vega-inspector-panel').boundingBox())!;
		if (!empty) expect((await richtext.boundingBox())!.height).toBeGreaterThan(panelBox.height);
		expect(caret.inside && caret.collapsed).toBe(true);
		expect(caret.rect.top).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
		expect(caret.rect.bottom).toBeLessThanOrEqual(panelBox.y + panelBox.height);
		expect(caret.rect.bottom).toBeLessThanOrEqual(footBox.y + 1);

		await openPendingDetails(page);
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
	await openStructure(page);
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
	await expect(pendingDetails(page)).toHaveCount(0);
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
	await formLink(page).click();
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
		await openStructure(page);
		const trigger = page.locator('.vega-visual-overlay-insert').nth(insertion.point);
		// El «+» del margen no lleva texto: su nombre dice la posición y el destino.
		await expect(trigger).toHaveAccessibleName(
			`Insertar bloque en la posición ${insertion.index + 1} de 4: ${insertion.label}`
		);
		await expect(trigger).toHaveAttribute('title', insertion.label);
		if (insertion.keyboard) {
			await trigger.focus();
			await trigger.press('Enter');
		} else await trigger.click();
		// El menú se nombra con el destino exacto; su título visible dice la posición (lámina,
		// «Insertar en la posición N de M») y conserva el destino como `title`.
		const menu = page.getByRole('menu', { name: insertion.label, exact: true });
		const destination = menu.locator('.vega-visual-insert-destination');
		await expect(destination).toHaveText(`Insertar en la posición ${insertion.index + 1} de 4`);
		await expect(destination).toHaveAttribute('title', insertion.label);
		await expect(page.locator('.vega-tree-list li')).toHaveCount(3);
		// Cada opción se nombra con el tipo y su descripción del catálogo (lámina «Añadir bloque»):
		// se elige por el nombre del tipo, que va primero.
		const item = menu.getByRole('menuitem', { name: new RegExp(`^${insertion.type}(\\s|$)`) });
		if (insertion.keyboard) {
			await item.focus();
			await item.press('Enter');
		} else await item.click();
		await expect(page.locator('.vega-tree-list li')).toHaveCount(4);
		await formLink(page).click();
		await expect(page.locator('.vega-block-type').nth(insertion.index)).toHaveText(insertion.type);
	});
}

test('UX04: el borrador cierra el menú abierto y ningún + crea hasta guardarlo', async ({
	page
}) => {
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
	await openVisualEditor(page, site, 'pagina_1');
	await waitConnected(page, 3);
	await openStructure(page);
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
		await expect(point).toHaveAttribute('aria-disabled', 'true');
	await expect(trigger).toBeFocused();
	const box = (await trigger.boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await trigger.press('Enter');
	await trigger.press('Space');
	await expect(page.getByRole('menu')).toHaveCount(0);
	await expect(page.locator('.vega-tree-list li')).toHaveCount(3);
	await headingInput(page).focus();
	await page.keyboard.press('Control+s');
	await expect(trigger).toHaveAttribute('aria-disabled', 'false');
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
	await expect(first.getByRole('combobox', { name: 'Ir a sección' })).toHaveValue('seccion_2');
	await expect(third.getByRole('combobox', { name: 'Ir a sección' })).toHaveValue('seccion_3');
	await expect(first.locator('.vega-field-error').first()).toHaveText(error!);
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect(page.locator('.vega-visual-canvas')).toBeVisible();
	await expect(page.locator('.vega-inspector-body:not([hidden])')).toHaveCount(1);
	await expect(headingInput(page)).toHaveValue('Borrador con error retenido');
	await page.setViewportSize({ width: 390, height: 844 });
	const fullFormLink = first.getByRole('link', { name: 'Abrir formulario completo' });
	expect((await fullFormLink.boundingBox())!.height).toBeGreaterThanOrEqual(44);
	page.once('dialog', (dialog) => dialog.dismiss());
	await fullFormLink.click();
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

for (const locale of ['es', 'en']) {
	test(`UX04: menú legible y sin recortes con catálogo largo ${locale}`, async ({
		page
	}, testInfo) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);
		await page.locator('.vega-visual-back').click();
		await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
		const editor = page.getByRole('textbox', { name: 'JSON del manifiesto' });
		const manifest = JSON.parse(await editor.inputValue());
		manifest.site.locale = locale;
		// Fixture explícita y admitida por el esquema: conserva los 3 tipos reales y añade
		// 20 variantes de texto, sin categorías, ordenaciones ni metadatos inventados.
		for (let index = 1; index <= 20; index++)
			manifest.blockTypes[`texto-variante-${index}`] = {
				...manifest.blockTypes.texto,
				label:
					locale === 'es'
						? `Texto variante ${index} con nombre editorial largo`
						: `Text variant ${index} with a long editorial name`
			};
		await editor.fill(JSON.stringify(manifest, null, 2));
		await page
			.locator('.manifest-editor')
			.getByRole('button', { name: 'Guardar', exact: true })
			.click();
		await page.locator('a[href="/c/paginas"]').first().click();
		await page.locator('a[href="/c/paginas/pagina_1"]').click();
		await page
			.getByRole('button', {
				name: locale === 'es' ? 'Editor visual' : 'Visual editor',
				exact: true
			})
			.click();
		await expect(page.locator('.vega-visual-status')).toContainText(
			locale === 'es' ? 'Conectado' : 'Connected'
		);
		await openStructure(page);
		const longName =
			'Guía editorial de una página con un nombre largo para reconocer el bloque al recorrer todos sus campos. ' +
			'Guía editorial de una página con un nombre largo para reconocer el bloque al recorrer todos sus campos';
		for (const id of ['seccion_1', 'seccion_2']) {
			await openStructure(page);
			await page.locator(`[data-vega-tree-row="${id}"]`).click();
			const body = page.locator(`.vega-inspector-body[data-block-id="${id}"]`);
			await body.locator('[data-field="heading"] input').fill(longName);
			await body.locator('.vega-block-save-button').click();
			await expect(body.locator('.vega-block-save-button')).toBeDisabled();
		}
		for (const width of [1440, 901]) {
			await page.setViewportSize({ width, height: 900 });
			for (const position of [0, 1, 3]) {
				const trigger = page.locator('.vega-visual-overlay-insert').nth(position);
				await trigger.focus();
				await trigger.press('Enter');
				const menu = page.getByRole('menu');
				await expect(menu.getByRole('menuitem')).toHaveCount(23);
				const measured = await menu.evaluate((el) => {
					// El menú vive en el margen del escenario, fuera del escenario escalado: si algún día
					// volviera dentro, su escala contaría.
					const rect = el.getBoundingClientRect(),
						canvas = el.closest('.vega-visual-canvas')!.getBoundingClientRect(),
						stage = el.closest('.vega-visual-stage');
					return {
						menu: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
						canvas: {
							top: canvas.top,
							bottom: canvas.bottom,
							left: canvas.left,
							right: canvas.right
						},
						font:
							parseFloat(getComputedStyle(el.querySelector('button')!).fontSize) *
							(stage ? new DOMMatrix(getComputedStyle(stage).transform).a : 1) *
							new DOMMatrix(getComputedStyle(el).transform).a
					};
				});
				expect(measured.font).toBeGreaterThanOrEqual(13);
				expect(measured.menu.top).toBeGreaterThanOrEqual(measured.canvas.top);
				expect(measured.menu.bottom).toBeLessThanOrEqual(measured.canvas.bottom);
				expect(measured.menu.left).toBeGreaterThanOrEqual(measured.canvas.left);
				expect(measured.menu.right).toBeLessThanOrEqual(measured.canvas.right);
				if (position === 1)
					await page.screenshot({
						path: testInfo.outputPath(`ux04-${width}-${locale}-long-catalog.png`)
					});
				await page.keyboard.press('End');
				await expect(menu.getByRole('menuitem').last()).toBeFocused();
				// Chromium midió 0.999999225 en ES y EN: toleramos solo 1 ppm de redondeo.
				await expect(menu.locator('.vega-visual-insert-destination')).toBeInViewport({
					ratio: 0.999999
				});
				await page.keyboard.press('Home');
				await expect(menu.getByRole('menuitem').first()).toBeFocused();
				await page.keyboard.press('Escape');
				await expect(trigger).toBeFocused();
			}
		}
		await expect(page.locator('.vega-tree-list li')).toHaveCount(3);
		// El nombre completo no debe dejar sin opciones una tarjeta con poco alto disponible.
		await page.setViewportSize({ width: 901, height: 420 });
		await page.evaluate(
			() =>
				new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
				)
		);
		await page.locator('.vega-visual-overlay-insert').nth(2).focus();
		await page.keyboard.press('Enter');
		const menu = page.getByRole('menu');
		await expect(menu).toHaveAccessibleName(
			new RegExp(longName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		);
		await expect(menu.locator('.vega-visual-insert-destination')).toHaveAttribute(
			'title',
			(await menu.getAttribute('aria-label')) ?? ''
		);
		await page.keyboard.press('End');
		const last = menu.getByRole('menuitem').last();
		await expect(last).toBeFocused();
		const options = (await menu.locator('.vega-visual-insert-options').boundingBox())!;
		const option = (await last.boundingBox())!;
		expect(option.y).toBeGreaterThanOrEqual(options.y - 1);
		expect(option.y + option.height).toBeLessThanOrEqual(options.y + options.height + 1);
		// Misma tolerancia de 1 ppm que arriba: Chromium midió 0.99999994 (redondeo de subpíxel).
		await expect(menu.locator('.vega-visual-insert-destination')).toBeInViewport({
			ratio: 0.999999
		});
		await page.screenshot({
			path: testInfo.outputPath(`ux04-901x420-${locale}-long-destination.png`)
		});
		await page.keyboard.press('Enter');
		await expect(page.locator('.vega-tree-list li')).toHaveCount(4);
		await formLink(page, locale === 'es' ? 'Volver al formulario' : 'Back to the form').click();
		await expect(page.locator('.vega-block-type').nth(2)).toHaveText(
			manifest.blockTypes['texto-variante-20'].label
		);
	});
}

test.describe('UX04: objetivos del menú con puntero táctil', () => {
	test.use({ hasTouch: true });
	test('toolbar, inserción y opciones conservan 44 px físicos en cada zoom', async ({
		page
	}, testInfo) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		await waitConnected(page, 3);
		await openStructure(page);
		expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
		const selected = page.locator('[data-vega-tree-row="seccion_1"]');
		await selected.click();
		await expect(selected).toHaveAttribute('aria-current', 'true');
		const evidence: unknown[] = [];
		for (const width of [1440, 901]) {
			await page.setViewportSize({ width, height: 900 });
			const tree = page.locator('.vega-tree-panel');
			// El cambio de breakpoint desliza el árbol sobre el lienzo mientras termina de cerrarse.
			await tree.evaluate(async (el) => {
				await Promise.all(el.getAnimations().map((animation) => animation.finished));
			});
			for (const zoom of ['50', '75', '100']) {
				await chooseZoom(page, zoom);
				await expect(selected).toHaveAttribute('aria-current', 'true');
				await expect(page.locator('.vega-visual-overlay-insert:enabled')).toHaveCount(4);
				const targets = page.locator(
					'.vega-visual-overlay-toolbar button:enabled, .vega-visual-overlay-insert:enabled'
				);
				await expect(targets).toHaveCount(8);
				const count = await targets.count();
				const toolbarEnabled = await page
					.locator('.vega-visual-overlay-toolbar button:enabled')
					.count();
				expect(toolbarEnabled).toBeGreaterThan(0);
				expect(count).toBeGreaterThan(toolbarEnabled);
				evidence.push({
					width,
					zoom,
					measuredEnabled: count,
					excludedDisabled: await page
						.locator(
							'.vega-visual-overlay-toolbar button:disabled, .vega-visual-overlay-insert:disabled'
						)
						.count()
				});
				for (const target of await targets.all()) {
					await target.scrollIntoViewIfNeeded();
					await expect(target).toBeVisible();
					const measured = await target.evaluate((el) => {
						const box = el.getBoundingClientRect();
						const canvas = el.closest('.vega-visual-canvas')!.getBoundingClientRect();
						// Con dedo, los «+» del margen se ven en reposo (no hay «pasar por encima») y el
						// objetivo es el botón entero.
						const area = el.getBoundingClientRect();
						const center = document.elementFromPoint(
							area.x + area.width / 2,
							area.y + area.height / 2
						);
						return {
							label: el.getAttribute('aria-label') ?? el.textContent,
							box: box.toJSON(),
							area: area.toJSON(),
							canvas: canvas.toJSON(),
							hit: center === el || el.contains(center)
						};
					});
					evidence.push({ width, zoom, ...measured });
					expect(measured.box.width, measured.label ?? '').toBeGreaterThanOrEqual(43.99);
					expect(measured.box.height, measured.label ?? '').toBeGreaterThanOrEqual(43.99);
					expect(measured.area.width, measured.label ?? '').toBeGreaterThanOrEqual(43.99);
					expect(measured.area.height, measured.label ?? '').toBeGreaterThanOrEqual(43.99);
					expect(measured.hit, measured.label ?? '').toBe(true);
					expect(measured.box.left).toBeGreaterThanOrEqual(Math.max(0, measured.canvas.left) - 1);
					expect(measured.box.right).toBeLessThanOrEqual(
						Math.min(width, measured.canvas.right) + 1
					);
					expect(measured.box.top).toBeGreaterThanOrEqual(Math.max(0, measured.canvas.top) - 1);
					expect(measured.box.bottom).toBeLessThanOrEqual(
						Math.min(900, measured.canvas.bottom) + 1
					);
				}
				const toolbar = await page
					.locator('.vega-visual-overlay-toolbar button:enabled')
					.evaluateAll((buttons) => buttons.map((el) => el.getBoundingClientRect().toJSON()));
				for (let i = 0; i < toolbar.length; i++)
					for (let j = i + 1; j < toolbar.length; j++) {
						const first = toolbar[i],
							second = toolbar[j];
						expect(
							Math.min(first.right, second.right) - Math.max(first.left, second.left) > 0.5 &&
								Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 0.5
						).toBe(false);
					}
				// Junta de debajo del seleccionado: su «+» del margen abre el menú.
				await page.locator('.vega-visual-overlay-insert').nth(1).click();
				const menu = page.getByRole('menu');
				await expect(menu).toBeVisible();
				await expect(menu.getByRole('menuitem')).toHaveCount(3);
				for (const item of await menu.getByRole('menuitem').all()) {
					const box = (await item.boundingBox())!;
					expect(box.height).toBeGreaterThanOrEqual(43.99);
					expect(box.width).toBeGreaterThanOrEqual(43.99);
					evidence.push({ width, zoom, menu: await item.textContent(), box });
				}
				// Tab sale del menú sin ejecutar el Escape de pantalla que deselecciona el bloque.
				await page.keyboard.press('Tab');
				await expect(menu).toHaveCount(0);
			}
		}
		// El cajón queda por encima de la cabecera editorial, también cuando ésta ocupa varias filas.
		for (const locale of ['es', 'en']) {
			if (locale === 'en') {
				await page.setViewportSize({ width: 1440, height: 900 });
				await page.locator('.vega-visual-back').click();
				await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
				const editor = page.getByRole('textbox', { name: 'JSON del manifiesto' });
				const manifest = JSON.parse(await editor.inputValue());
				manifest.site.locale = locale;
				await editor.fill(JSON.stringify(manifest, null, 2));
				await page
					.locator('.manifest-editor')
					.getByRole('button', { name: 'Guardar', exact: true })
					.click();
				await page.locator('a[href="/c/paginas"]').first().click();
				await page.locator('a[href="/c/paginas/pagina_1"]').first().click();
				await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
				await expect(page.locator('.vega-visual-status-text')).toContainText('Connected');
			}
			for (const width of [1180, 901]) {
				await page.setViewportSize({ width, height: 900 });
				const tree = page.locator('.vega-tree-panel');
				await tree.evaluate(async (el) => {
					await Promise.all(el.getAnimations().map((a) => a.finished));
				});
				const toggle = page.locator('.vega-tree-toggle');
				await toggle.click();
				await expect(toggle).toHaveAttribute('aria-expanded', 'true');
				await tree.evaluate(async (el) => {
					await Promise.all(el.getAnimations().map((a) => a.finished));
				});
				const row = page.locator('[data-vega-tree-row="seccion_1"]');
				for (const control of [row, page.locator('.vega-tree-close')]) {
					const measured = await control.evaluate((el) => {
						const r = el.getBoundingClientRect();
						const points = [
							[r.x + r.width / 2, r.y + r.height / 2],
							[r.x + r.width / 2, r.y + 2],
							[r.x + r.width / 2, r.bottom - 2],
							[r.x + 2, r.y + r.height / 2],
							[r.right - 2, r.y + r.height / 2]
						];
						return {
							label: el.getAttribute('aria-label') ?? el.textContent,
							box: r.toJSON(),
							hits: points.map(([x, y]) => el.contains(document.elementFromPoint(x, y)))
						};
					});
					evidence.push({ locale, width, drawer: measured });
					expect(measured.box.width).toBeGreaterThanOrEqual(43.99);
					expect(measured.box.height).toBeGreaterThanOrEqual(43.99);
					expect(measured.hits).toEqual([true, true, true, true, true]);
				}
				await row.click();
				await expect(row).toHaveAttribute('aria-current', 'true');
				await expect(toggle).toHaveAttribute('aria-expanded', 'false');
				await tree.evaluate(async (el) => {
					await Promise.all(el.getAnimations().map((a) => a.finished));
				});
				await toggle.click();
				await page.locator('.vega-tree-close').click();
				await expect(toggle).toHaveAttribute('aria-expanded', 'false');
				await tree.evaluate(async (el) => {
					await Promise.all(el.getAnimations().map((a) => a.finished));
				});
			}
		}
		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.getByRole('region', { name: 'Text only' })).toBeVisible();
		await expect(page.locator('.vega-visual-overlay-insert')).toHaveCount(0);
		const textActions = page.locator(
			'.vega-visual-bar button:visible:enabled, .vega-visual-grid button:visible:enabled'
		);
		expect(await textActions.count()).toBeGreaterThan(0);
		for (const action of await textActions.all()) {
			await action.scrollIntoViewIfNeeded();
			const box = (await action.boundingBox())!;
			expect(box.width).toBeGreaterThanOrEqual(43.99);
			expect(box.height).toBeGreaterThanOrEqual(43.99);
			evidence.push({
				width: 390,
				mode: 'texts',
				label: (await action.getAttribute('aria-label')) ?? (await action.textContent()),
				box
			});
		}
		evidence.push({ width: 390, mode: 'texts', overlay: 'not applicable: canvas is unmounted' });
		await testInfo.attach('ux04-touch-targets', {
			body: JSON.stringify(evidence, null, 2),
			contentType: 'application/json'
		});
	});

	/** Todos los botones y enlaces visibles de la barra y la columna, también los deshabilitados (el
	 *  «Guardar» de una sección sin cambios es el que el dedo va a buscar después de escribir). */
	async function smallTargets(page: Page, selector: string): Promise<string[]> {
		const small: string[] = [];
		for (const target of await page.locator(selector).all()) {
			if (!(await target.isVisible())) continue;
			await target.scrollIntoViewIfNeeded();
			const box = (await target.boundingBox())!;
			if (box.width < 43.99 || box.height < 43.99)
				small.push(
					`${Math.round(box.width)}×${Math.round(box.height)} ${(await target.getAttribute('aria-label')) ?? (await target.textContent())?.trim()}`
				);
		}
		return small;
	}

	test('QA de fodaveg: Guardar de «Solo textos», la miga, Volver y Móvil/Tableta/Escritorio miden 44 px', async ({
		page
	}) => {
		// Medido en la copia de producción (21 oct 2026): «Guardar» 71×30 y «Páginas» 47×17 a 390 px;
		// Móvil/Tableta/Escritorio 32×44 en una tableta de 1180 px.
		await page.setViewportSize({ width: 390, height: 844 });
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await openVisualEditor(page, site, 'pagina_1');
		expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
		await expect(page.locator('.vega-block-save-button')).toHaveCount(3);
		expect(
			await smallTargets(
				page,
				'.vega-visual-bar :is(button, a[href]), .vega-visual-grid :is(button, a[href])'
			)
		).toEqual([]);

		await page.setViewportSize({ width: 1180, height: 820 });
		await waitConnected(page, 3);
		expect(
			await smallTargets(
				page,
				'.vega-visual-back, .vega-visual-crumbs a, .vega-visual-segm button, .vega-visual-zoom-trigger'
			)
		).toEqual([]);
	});

	test('ronda 3 del QA de fodaveg: campos de texto e interruptor tienen 44 px de área de toque', async ({
		page
	}) => {
		// Medido en la copia de producción: campos de 42 px de alto e interruptor de 38×22.
		await page.setViewportSize({ width: 1180, height: 820 });
		await loginAsDemo(page);
		await waitForHome(page);
		await page.goto('/c/posts/post_1');
		const fieldSelector =
			'.vega-widget-text, .vega-widget-url, .vega-widget-email, .vega-widget-number, .vega-widget-datetime, .vega-widget-select';
		await expect(page.locator('.vega-widget-url').first()).toBeVisible();
		expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
		expect(await smallTargets(page, fieldSelector)).toEqual([]);

		await page.goto('/c/metrics/new');
		const active = page.getByLabel('Active');
		await expect(active).toBeVisible();
		// El dibujo no cambia; lo que mide 44×44 es lo que responde al dedo: las cuatro esquinas de un
		// cuadrado de 44 px centrado en la pista son el propio interruptor.
		const corners = await active.evaluate((el) => {
			const r = el.getBoundingClientRect();
			const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
			return [
				[-21.5, -21.5],
				[21.5, -21.5],
				[-21.5, 21.5],
				[21.5, 21.5]
			].map(([dx, dy]) => document.elementFromPoint(x + dx, y + dy) === el);
		});
		expect(corners).toEqual([true, true, true, true]);
		const box = (await active.boundingBox())!;
		await page.touchscreen.tap(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20);
		await expect(active).toBeChecked();
	});

	test('QA de fodaveg: la barra Markdown mide 44 px con el dedo en una tableta', async ({
		page
	}) => {
		// Medida en la copia de producción (21 oct 2026): 32×32 a 1180 px. El campo `summary` del
		// sembrado de demostración es Markdown (`demo-seed.ts`).
		await page.setViewportSize({ width: 1180, height: 820 });
		await loginAsDemo(page);
		await waitForHome(page);
		await page.goto('/c/posts/post_1');
		const tools = page.locator('.vega-markdown-tools button, .vega-markdown-modes button');
		await expect(tools.first()).toBeVisible();
		expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
		expect(
			await smallTargets(page, '.vega-markdown-tools button, .vega-markdown-modes button')
		).toEqual([]);
	});
});
