# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual-editor.spec.ts >> editor visual — protocolo vega-visual-1 contra un sitio cross-origin >> escritorio 1280 con ajustar conserva media queries y overlay al redimensionar
- Location: e2e/visual-editor.spec.ts:109:2

# Error details

```
Error: expect(locator).toHaveClass(expected) failed

Locator: locator('#vega-sidebar')
Expected pattern: /vega-sidebar-collapsed/
Received string:  "vega-sidebar svelte-szqtvg"
Timeout: 5000ms

Call log:
  - Expect "toHaveClass" with timeout 5000ms
  - waiting for locator('#vega-sidebar')
    14 × locator resolved to <nav id="vega-sidebar" aria-label="Navegación principal" class="vega-sidebar svelte-szqtvg">…</nav>
       - unexpected value "vega-sidebar svelte-szqtvg"

```

```yaml
- navigation "Navegación principal":
  - paragraph: Contenido
  - list
  - paragraph: Estructura
  - list
  - list
```

# Test source

```ts
  54  | 
  55  | /** Eco de `SECCIONES_RECORDS` (`demo-seed.ts`, solo `pagina_1`): mismos ids y mismos textos de
  56  |  *  `heading`, para que seleccionar «el segundo bloque» en el sitio y en el árbol sea EL MISMO
  57  |  *  registro (`bridge-client.ts` casa por igualdad de string, ver la cabecera de
  58  |  *  `VisualBlockTree.svelte`, "Ids"). */
  59  | const SECCIONES: VisualSiteBlock[] = [
  60  | 	{ id: 'seccion_1', type: 'seccion', text: 'Escribe. Publica. Olvídate del resto.' },
  61  | 	{ id: 'seccion_2', type: 'seccion', text: 'Tu contenido, en tu servidor' },
  62  | 	{ id: 'seccion_3', type: 'seccion', text: 'Se adapta a tu modelo' }
  63  | ];
  64  | 
  65  | async function openVisualEditor(page: Page, site: VisualSite, pageId: string): Promise<void> {
  66  | 	await site.install(page);
  67  | 	await page.addInitScript((previewApiUrl) => {
  68  | 		(window as unknown as VegaVisualWindow).__VEGA_PREVIEW_API_URL__ = previewApiUrl;
  69  | 	}, site.previewApiUrl);
  70  | 	await loginAsDemo(page, { seedShowcase: true });
  71  | 	await page.goto(`/c/paginas/${pageId}/visual`);
  72  | }
  73  | 
  74  | /** Espera a que la barra superior confirme el saludo (§contrato, "ready es la prueba, no el
  75  |  *  anuncio"): antes de esto cualquier aserción sobre el lienzo sería una carrera contra el
  76  |  *  handshake. */
  77  | async function waitConnected(page: Page, blockCount: number): Promise<void> {
  78  | 	await expect(page.locator('.vega-visual-status-text')).toHaveText(
  79  | 		`Conectado al sitio: ${blockCount} ${blockCount === 1 ? 'bloque' : 'bloques'} en la página.`
  80  | 	);
  81  | }
  82  | 
  83  | const visibleInspectorBody = (page: Page) => page.locator('.vega-inspector-body:not([hidden])');
  84  | 
  85  | /**
  86  |  * El campo «Heading» de la ficha visible, localizado por `[data-field]` (`FieldRow.svelte`) y NO
  87  |  * por `getByLabel()`. **Hallazgo del recorrido, no capricho**: `field-ids.ts#fieldIds` deriva el
  88  |  * `id` del `<input>` SOLO del nombre de campo (`vega-field-heading`), y `VisualInspector.svelte`
  89  |  * monta un `BlockEditor` por CADA sección SIEMPRE, oculto con `hidden` (nunca `{#if}`, ver su
  90  |  * cabecera) — así que las tres secciones de `pagina_1` producen TRES nodos con el mismo
  91  |  * `id="vega-field-heading"` a la vez, `id` duplicado e inválido en HTML. El navegador (y
  92  |  * `getByLabel()`, que replica su algoritmo) resuelve `label[for="vega-field-heading"]` contra el
  93  |  * PRIMERO de esos tres nodos en orden de documento, así que seleccionar cualquier sección que NO
  94  |  * sea la primera (`seccion_2`, `seccion_3`) deja el label apuntando al campo de OTRA sección,
  95  |  * oculta — `getByLabel('Heading')` no encuentra nada dentro de la ficha visible. Confirmado con un
  96  |  * repro aislado: `page.locator('#vega-field-heading').count()` da `3` con el inspector abierto.
  97  |  * Ver el informe de esta tarea para el detalle completo; el arreglo (namespacing del id por
  98  |  * `record.id`) vive en `src/lib/form/field-ids.ts`/`FieldRow.svelte`, fuera del alcance cerrado de
  99  |  * esta suite.
  100 |  */
  101 | const headingInput = (page: Page) =>
  102 | 	visibleInspectorBody(page).locator('[data-field="heading"] input');
  103 | 
  104 | /** Estado de la página en la cabecera (`VisualPublishControl.svelte`): lo usan el bloque de
  105 |  *  publicar/despublicar y el de «solo textos», así que vive aquí, en el ámbito del fichero. */
  106 | const statusGroup = (page: Page) => page.getByRole('group', { name: 'Estado de la página' });
  107 | 
  108 | test.describe('editor visual — protocolo vega-visual-1 contra un sitio cross-origin', () => {
  109 | 	test('escritorio 1280 con ajustar conserva media queries y overlay al redimensionar', async ({
  110 | 		page
  111 | 	}, testInfo) => {
  112 | 		await page.setViewportSize({ width: 1440, height: 900 });
  113 | 		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
  114 | 		await openVisualEditor(page, site, 'pagina_1');
  115 | 		await waitConnected(page, 3);
  116 | 		const iframe = page.locator('iframe.vega-visual-frame');
  117 | 		const frame = await (await iframe.elementHandle())!.contentFrame();
  118 | 		if (!frame) throw new Error('El marco conectado debe existir');
  119 | 		// CSS propio del sitio: el breakpoint responde al viewport del iframe, no al lienzo de Vega.
  120 | 		await frame.addStyleTag({
  121 | 			content:
  122 | 				'.block { --site-layout: desktop; } @media (max-width: 899px) { .block { --site-layout: narrow; } }'
  123 | 		});
  124 | 		const siteViewport = () =>
  125 | 			frame.evaluate(() => ({
  126 | 				width: window.innerWidth,
  127 | 				desktop: window.matchMedia('(min-width: 1000px)').matches,
  128 | 				layout: getComputedStyle(document.querySelector('.block')!)
  129 | 					.getPropertyValue('--site-layout')
  130 | 					.trim()
  131 | 			}));
  132 | 		const alignedOverlay = async () => {
  133 | 			const block = await frame.locator('[data-vega-block-id="seccion_1"]').boundingBox();
  134 | 			const overlay = await page
  135 | 				.locator('.vega-visual-overlay-box[data-vega-block-id="seccion_1"]')
  136 | 				.boundingBox();
  137 | 			if (!block || !overlay) return false;
  138 | 			return ['x', 'y', 'width', 'height'].every(
  139 | 				(key) =>
  140 | 					Math.abs(block[key as keyof typeof block] - overlay[key as keyof typeof overlay]) < 2
  141 | 			);
  142 | 		};
  143 | 		const fitFillsCanvas = async () => {
  144 | 			const canvasWidth = await page
  145 | 				.locator('.vega-visual-canvas')
  146 | 				.evaluate((el) => el.clientWidth);
  147 | 			const painted = await iframe.boundingBox();
  148 | 			return !!painted && Math.abs(canvasWidth - painted.width) < 2;
  149 | 		};
  150 | 		await expect(page.getByRole('button', { name: 'Ajustar', exact: true })).toHaveAttribute(
  151 | 			'aria-pressed',
  152 | 			'true'
  153 | 		);
> 154 | 		await expect(page.locator('#vega-sidebar')).toHaveClass(/vega-sidebar-collapsed/);
      |                                               ^ Error: expect(locator).toHaveClass(expected) failed
  155 | 		await expect.poll(siteViewport).toEqual({ width: 1280, desktop: true, layout: 'desktop' });
  156 | 		await expect.poll(fitFillsCanvas).toBe(true);
  157 | 		await expect.poll(alignedOverlay).toBe(true);
  158 | 		await page.screenshot({ path: testInfo.outputPath('desktop-fit-1440.png') });
  159 | 
  160 | 		await page.setViewportSize({ width: 1200, height: 900 });
  161 | 		await expect.poll(siteViewport).toEqual({ width: 1280, desktop: true, layout: 'desktop' });
  162 | 		await expect.poll(fitFillsCanvas).toBe(true);
  163 | 		await expect.poll(alignedOverlay).toBe(true);
  164 | 		for (const [name, width] of [
  165 | 			['Móvil', 390],
  166 | 			['Tableta', 834]
  167 | 		] as const) {
  168 | 			await page.getByRole('button', { name, exact: true }).click();
  169 | 			await expect.poll(siteViewport).toEqual({ width, desktop: false, layout: 'narrow' });
  170 | 			await expect.poll(alignedOverlay).toBe(true);
  171 | 		}
  172 | 		await page.getByRole('button', { name: '50 %', exact: true }).click();
  173 | 		await page.getByRole('button', { name: 'Escritorio', exact: true }).click();
  174 | 		await expect(page.getByRole('button', { name: '50 %', exact: true })).toHaveAttribute(
  175 | 			'aria-pressed',
  176 | 			'true'
  177 | 		);
  178 | 		await expect.poll(siteViewport).toEqual({ width: 1280, desktop: true, layout: 'desktop' });
  179 | 		await expect.poll(alignedOverlay).toBe(true);
  180 | 		await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
  181 | 		await expect.poll(fitFillsCanvas).toBe(true);
  182 | 		// Ventanas pequeñas conservan el modo de textos; el nuevo preset no habilita el lienzo allí.
  183 | 		for (const width of [834, 390]) {
  184 | 			await page.setViewportSize({ width, height: 844 });
  185 | 			await expect(page.getByRole('region', { name: 'Solo textos' })).toBeVisible();
  186 | 			await expect(iframe).toHaveCount(0);
  187 | 		}
  188 | 		await page.screenshot({ path: testInfo.outputPath('mobile-texts-390.png') });
  189 | 	});
  190 | 
  191 | 	test('pinta los contornos que reporta el sitio, con la geometría real de sus bloques', async ({
  192 | 		page
  193 | 	}) => {
  194 | 		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
  195 | 		await openVisualEditor(page, site, 'pagina_1');
  196 | 		await waitConnected(page, 3);
  197 | 
  198 | 		const boxes = page.locator('.vega-visual-overlay-box');
  199 | 		await expect(boxes).toHaveCount(3);
  200 | 
  201 | 		// Geometría de VERDAD (`getBoundingClientRect()` de `visual-site.ts`, nunca un número
  202 | 		// inventado): las tres secciones se apilan en el documento, así que sus `top` tienen que
  203 | 		// crecer en el mismo orden que el marcado — si el sitio cambiara su CSS, esto cambiaría
  204 | 		// solo, que es justo la propiedad que un `rect` fijo no podría demostrar.
  205 | 		const tops = (await boxes.evaluateAll((els) => els.map((el) => (el as HTMLElement).style.top)))
  206 | 			.map((value) => parseFloat(value))
  207 | 			.sort((a, b) => a - b);
  208 | 		const firstBox = page.locator('.vega-visual-overlay-box[data-vega-block-id="seccion_1"]');
  209 | 		const secondBox = page.locator('.vega-visual-overlay-box[data-vega-block-id="seccion_2"]');
  210 | 		const thirdBox = page.locator('.vega-visual-overlay-box[data-vega-block-id="seccion_3"]');
  211 | 		await expect(firstBox).toBeVisible();
  212 | 		await expect(secondBox).toBeVisible();
  213 | 		await expect(thirdBox).toBeVisible();
  214 | 		const [firstTop, secondTop, thirdTop] = await Promise.all([
  215 | 			firstBox.evaluate((el) => parseFloat((el as HTMLElement).style.top)),
  216 | 			secondBox.evaluate((el) => parseFloat((el as HTMLElement).style.top)),
  217 | 			thirdBox.evaluate((el) => parseFloat((el as HTMLElement).style.top))
  218 | 		]);
  219 | 		expect(firstTop).toBeLessThan(secondTop);
  220 | 		expect(secondTop).toBeLessThan(thirdTop);
  221 | 		// Mismos tres valores que `tops`, solo para dejar constancia de que no hay un cuarto
  222 | 		// contorno fantasma coincidiendo por casualidad.
  223 | 		expect(tops).toHaveLength(3);
  224 | 	});
  225 | 
  226 | 	test('un clic DENTRO del segundo bloque en el marco abre ESE bloque en el inspector, no el primero', async ({
  227 | 		page
  228 | 	}) => {
  229 | 		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
  230 | 		await openVisualEditor(page, site, 'pagina_1');
  231 | 		await waitConnected(page, 3);
  232 | 
  233 | 		const frame = page.frameLocator('iframe.vega-visual-frame');
  234 | 		await frame.locator('[data-vega-block-id="seccion_2"]').click();
  235 | 
  236 | 		await expect(page.locator('[data-vega-tree-row="seccion_2"]')).toHaveClass(
  237 | 			/vega-tree-row--selected/
  238 | 		);
  239 | 		await expect(page.locator('[data-vega-tree-row="seccion_1"]')).not.toHaveClass(
  240 | 			/vega-tree-row--selected/
  241 | 		);
  242 | 		await expect(
  243 | 			page.locator('.vega-visual-overlay-box[data-vega-block-id="seccion_2"]')
  244 | 		).toHaveClass(/vega-visual-overlay-box--selected/);
  245 | 
  246 | 		await expect(visibleInspectorBody(page).locator('.vega-inspector-block-title')).toHaveText(
  247 | 			'Tu contenido, en tu servidor'
  248 | 		);
  249 | 		await expect(headingInput(page)).toHaveValue('Tu contenido, en tu servidor');
  250 | 		// Aserción que el hallazgo original esquivaba (ver la cabecera de `headingInput`): el arreglo
  251 | 		// namespacea el id por `record.id` (`field-ids.ts`/`field-scope.ts`), así que con el SEGUNDO
  252 | 		// bloque desplegado `getByLabel()` ya resuelve al input VISIBLE — antes del arreglo no
  253 | 		// encontraba nada (el `label[for="vega-field-heading"]` del DOM apuntaba siempre al primer
  254 | 		// nodo, oculto). Label «Título», no «Heading»: `seccion_2` siembra `tipo: 'texto'`
```