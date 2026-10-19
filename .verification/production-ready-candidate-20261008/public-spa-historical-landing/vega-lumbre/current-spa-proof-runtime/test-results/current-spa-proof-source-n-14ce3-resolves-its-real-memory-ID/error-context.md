# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: current-spa-proof.spec.ts >> source: new form creates a record and resolves its real memory ID
- Location: ../../../Users/david/code/vegacms/.verification/production-ready-candidate-20261008/public-spa-historical-landing/vega-lumbre/current-spa-proof.spec.ts:196:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('textbox', { name: 'Título', exact: true })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic "Vega Demo" [ref=e5]:
      - img [ref=e6]
      - generic [ref=e15]: Vega
      - generic [ref=e16]: Vega Demo
    - generic [ref=e18]:
      - img [ref=e19]
      - combobox "Búsqueda global" [ref=e22]
      - generic [ref=e23]: /
    - generic [ref=e24]:
      - generic [ref=e27]: Conectado
      - group "Densidad" [ref=e28]:
        - button "Cómoda" [pressed] [ref=e29] [cursor=pointer]
        - button "Compacta" [ref=e30] [cursor=pointer]
      - button "Plegar la barra lateral" [expanded] [ref=e31] [cursor=pointer]:
        - img [ref=e32]
      - button "Menú de cuenta" [ref=e34] [cursor=pointer]:
        - img "Sesión de demo@vega.dev" [ref=e35]: D
        - img [ref=e36]
      - button "Cerrar sesión" [ref=e38] [cursor=pointer]:
        - img [ref=e39]
  - generic [ref=e42]:
    - navigation "Navegación principal" [ref=e43]:
      - list [ref=e45]:
        - listitem [ref=e46]:
          - link "Información del sitio" [ref=e47] [cursor=pointer]:
            - /url: /c/site_info
            - img [ref=e48]
            - generic "Información del sitio" [ref=e51]
      - generic [ref=e52]:
        - paragraph [ref=e53]: Contenido
        - list [ref=e54]:
          - listitem [ref=e55]:
            - link "Entradas 32" [ref=e56] [cursor=pointer]:
              - /url: /c/posts
              - img [ref=e57]
              - generic "Entradas" [ref=e59]
              - generic [ref=e61]: "32"
          - listitem [ref=e62]:
            - link "Páginas Solo lectura 0" [ref=e63] [cursor=pointer]:
              - /url: /c/pages
              - img [ref=e64]
              - generic "Páginas" [ref=e67]
              - generic [ref=e68]:
                - generic [ref=e69]: Solo lectura
                - generic [ref=e70]: "0"
          - listitem [ref=e71]:
            - link "Autores 0" [ref=e72] [cursor=pointer]:
              - /url: /c/authors
              - img [ref=e73]
              - generic "Autores" [ref=e76]
              - generic [ref=e78]: "0"
          - listitem [ref=e79]:
            - link "Métricas 1" [ref=e80] [cursor=pointer]:
              - /url: /c/metrics
              - img [ref=e81]
              - generic "Métricas" [ref=e82]
              - generic [ref=e84]: "1"
          - listitem [ref=e85]:
            - link "Obras 2" [ref=e86] [cursor=pointer]:
              - /url: /c/works
              - img [ref=e87]
              - generic "Obras" [ref=e89]
              - generic [ref=e91]: "2"
          - listitem [ref=e92]:
            - link "Pistas 2" [ref=e93] [cursor=pointer]:
              - /url: /c/tracks
              - img [ref=e94]
              - generic "Pistas" [ref=e96]
              - generic [ref=e98]: "2"
          - listitem [ref=e99]:
            - link "Catálogo Solo lectura" [ref=e100] [cursor=pointer]:
              - /url: /v/catalogo
              - img [ref=e101]
              - generic "Catálogo" [ref=e102]
              - generic [ref=e104]: Solo lectura
          - listitem [ref=e105]:
            - link "Blog 12" [ref=e106] [cursor=pointer]:
              - /url: /c/blog
              - img [ref=e107]
              - generic "Blog" [ref=e110]
              - generic [ref=e112]: "12"
          - listitem [ref=e113]:
            - link "Avisos 1" [ref=e114] [cursor=pointer]:
              - /url: /c/avisos
              - img [ref=e115]
              - generic "Avisos" [ref=e118]
              - generic [ref=e120]: "1"
      - list [ref=e121]:
        - listitem [ref=e122]:
          - link "Medios" [ref=e123] [cursor=pointer]:
            - /url: /media
            - img [ref=e124]
            - generic [ref=e128]: Medios
        - listitem [ref=e129]:
          - link "Papelera" [ref=e130] [cursor=pointer]:
            - /url: /papelera
            - img [ref=e131]
            - generic [ref=e134]: Papelera
        - listitem [ref=e135]:
          - link "Editores" [ref=e136] [cursor=pointer]:
            - /url: /editores
            - img [ref=e137]
            - generic [ref=e140]: Editores
        - listitem [ref=e141]:
          - link "Copias" [ref=e142] [cursor=pointer]:
            - /url: /copias
            - img [ref=e143]
            - generic [ref=e146]: Copias
        - listitem [ref=e147]:
          - link "Ajustes 1 avisos" [ref=e148] [cursor=pointer]:
            - /url: /settings
            - img [ref=e149]
            - generic [ref=e152]: Ajustes
            - generic "1 avisos" [ref=e153]: "1"
    - main [ref=e154]:
      - generic [ref=e156]:
        - heading "Crear «Entrada»" [level=1] [ref=e157]
        - generic [ref=e158]:
          - button "Entradas" [ref=e159] [cursor=pointer]:
            - img [ref=e160]
            - text: Entradas
          - generic [ref=e163]: nuevo
          - button "Ver en el sitio" [disabled] [ref=e164]
          - button "Guardar" [ref=e165] [cursor=pointer]:
            - text: Guardar
            - generic [ref=e166]: ⌘S
        - generic [ref=e171]:
          - generic [ref=e172]:
            - generic [ref=e173]: Title*
            - textbox "Title" [ref=e175]
          - generic [ref=e176]:
            - generic [ref=e177]: Status
            - combobox "Status" [ref=e179]:
              - option "— sin selección —" [selected]
              - option "draft"
              - option "published"
          - generic [ref=e180]:
            - generic [ref=e181]: Body
            - textbox "Body" [ref=e183]
          - generic [ref=e184]:
            - generic [ref=e185]: Tags
            - group "Tags" [ref=e187]:
              - button "vega" [ref=e188] [cursor=pointer]
              - button "demo" [ref=e189] [cursor=pointer]
              - button "news" [ref=e190] [cursor=pointer]
          - generic [ref=e191]:
            - generic [ref=e192]: Published at
            - textbox "Published at" [ref=e194]
          - generic [ref=e195]:
            - generic [ref=e196]: Website
            - textbox "Website" [ref=e198]
          - generic [ref=e199]:
            - generic [ref=e200]: Contact email
            - textbox "Contact email" [ref=e202]
          - generic [ref=e203]:
            - generic [ref=e204]: Meta
            - textbox "Meta" [ref=e206]: "null"
          - generic [ref=e207]:
            - generic [ref=e208]: Summary
            - generic [ref=e210]:
              - generic [ref=e211]:
                - toolbar "Herramientas de formato" [ref=e212]:
                  - button "Título 1" [ref=e213] [cursor=pointer]: H1
                  - button "Título 2" [ref=e214] [cursor=pointer]: H2
                  - button "Negrita" [ref=e215] [cursor=pointer]: B
                  - button "Cursiva" [ref=e216] [cursor=pointer]: I
                  - button "Tachado" [ref=e217] [cursor=pointer]: S
                  - button "Enlace" [ref=e218] [cursor=pointer]: ↗
                  - button "Cita" [ref=e219] [cursor=pointer]: ❝
                  - button "Lista con viñetas" [ref=e220] [cursor=pointer]: •—
                  - button "Lista numerada" [ref=e221] [cursor=pointer]: "1."
                  - button "Código" [ref=e222] [cursor=pointer]: </>
                  - button "Bloque de código" [ref=e223] [cursor=pointer]: "{ }"
                  - button "Línea horizontal" [ref=e224] [cursor=pointer]: ―
                  - button "Imagen" [ref=e225] [cursor=pointer]: ▧
                - group "Vista del editor" [ref=e226]:
                  - button "Escribir" [ref=e227] [cursor=pointer]
                  - button "Dividido" [pressed] [ref=e228] [cursor=pointer]
                  - button "Vista" [ref=e229] [cursor=pointer]
              - generic [ref=e230]:
                - textbox "Summary" [ref=e232]:
                  - /placeholder: ""
                - region "Vista previa de Markdown" [ref=e233]:
                  - paragraph: La vista previa aparecerá aquí.
                  - document "Vista previa de Markdown" [ref=e235]:
                    - paragraph [ref=e236]
              - generic [ref=e237]:
                - generic [ref=e238]: 0 palabras
                - generic [ref=e239]: Markdown · ⌘/Ctrl B · I · K
          - generic [ref=e240]:
            - generic [ref=e241]: Content
            - generic [ref=e243]:
              - toolbar "Herramientas de formato" [ref=e244]:
                - combobox "Estilo de párrafo" [disabled] [ref=e245]:
                  - option "Párrafo" [selected]
                  - option "Título 1"
                  - option "Título 2"
                  - option "Título 3"
                  - option "Título 4"
                - button "Negrita" [disabled] [ref=e246]:
                  - strong [ref=e247]: B
                - button "Cursiva" [disabled] [ref=e248]:
                  - emphasis [ref=e249]: I
                - button "Tachado" [disabled] [ref=e250]: S
                - button "Código" [disabled] [ref=e252]: </>
                - button "Bloque de código" [disabled] [ref=e253]: "{ }"
                - button "Cita" [disabled] [ref=e254]: "\""
                - button "Lista con viñetas" [disabled] [ref=e256]: •—
                - button "Lista numerada" [disabled] [ref=e257]: "1."
                - button "Línea horizontal" [disabled] [ref=e258]: ―
                - button "Enlace" [disabled] [ref=e260]: 🔗
                - button "Imagen" [disabled] [ref=e261]: 🖼
              - status [ref=e262]: Cargando el editor…
              - generic "Content"
          - generic [ref=e263]:
            - generic [ref=e264]: Related post
            - group "Related post" [ref=e266]:
              - list [ref=e267]:
                - listitem [ref=e268]: — sin selección —
              - searchbox "Buscar «Related post»" [ref=e269]
              - list [ref=e270]:
                - listitem [ref=e271]: Escribe para buscar…
          - generic [ref=e272]:
            - generic [ref=e273]: Related posts
            - group "Related posts" [ref=e275]:
              - list [ref=e276]:
                - listitem [ref=e277]: — sin selección —
              - searchbox "Buscar «Related posts»" [ref=e278]
              - list [ref=e279]:
                - listitem [ref=e280]: Escribe para buscar…
          - generic [ref=e281]:
            - generic [ref=e282]: Related metric
            - group "Related metric" [ref=e284]:
              - list [ref=e285]:
                - listitem [ref=e286]: — sin selección —
              - paragraph [ref=e287]: "Este tipo no tiene un campo de título con el que buscar: elige de la lista."
              - list [ref=e288]:
                - listitem [ref=e289]:
                  - button "metric_1" [ref=e290] [cursor=pointer]
              - generic [ref=e291]:
                - generic [ref=e292]: 1–1 de 1
                - generic [ref=e293]:
                  - button "Anterior" [disabled] [ref=e294]: ‹
                  - button "Siguiente" [disabled] [ref=e295]: ›
          - generic [ref=e296]:
            - generic [ref=e297]: Cover image
            - generic [ref=e299]:
              - button "Cover image" [ref=e300]
              - button "Arrastra ficheros aquí o haz clic para elegir Sin ficheros" [ref=e301] [cursor=pointer]:
                - img [ref=e302]
                - generic [ref=e306]: Arrastra ficheros aquí o haz clic para elegir
                - generic [ref=e307]: Sin ficheros
              - button "Elegir de la biblioteca" [ref=e308] [cursor=pointer]
              - status
          - generic [ref=e309]:
            - generic [ref=e310]: Attachments
            - generic [ref=e312]:
              - button "Attachments" [ref=e313]
              - button "Arrastra ficheros aquí o haz clic para elegir Sin ficheros" [ref=e314] [cursor=pointer]:
                - img [ref=e315]
                - generic [ref=e319]: Arrastra ficheros aquí o haz clic para elegir
                - generic [ref=e320]: Sin ficheros
              - button "Elegir de la biblioteca" [ref=e321] [cursor=pointer]
              - status
          - generic [ref=e322]:
            - generic [ref=e323]: Source file
            - generic [ref=e325]:
              - button "Source file" [disabled] [ref=e326]
              - button "Arrastra ficheros aquí o haz clic para elegir Sin ficheros" [disabled] [ref=e327]:
                - img [ref=e328]
                - generic [ref=e332]: Arrastra ficheros aquí o haz clic para elegir
                - generic [ref=e333]: Sin ficheros
              - button "Elegir de la biblioteca" [disabled] [ref=e334]
              - status
```

# Test source

```ts
  99  | 	const counts = {
  100 | 		tokenPosts: 0,
  101 | 		withDraft: 0,
  102 | 		documentGets: 0,
  103 | 		documentPosts: 0,
  104 | 		postBodyValid: false
  105 | 	};
  106 | 	page.on('request', (request) => {
  107 | 		if (request.url() !== `${SITE_ORIGIN}/preview` || request.resourceType() !== 'document') return;
  108 | 		if (request.method() === 'GET') counts.documentGets++;
  109 | 		if (request.method() === 'POST') {
  110 | 			counts.documentPosts++;
  111 | 			// Synthetic fixture body only; never persist URL query, Authorization or form values.
  112 | 			counts.postBodyValid =
  113 | 				new URLSearchParams(request.postData() ?? '').get('token') === 'csp-draft-synthetic';
  114 | 		}
  115 | 	});
  116 | 	// Reuse the independent HTTPS bridge fixture, changing only token transport for panel POST.
  117 | 	await page.route(`${site.previewApiUrl}/token`, async (route) => {
  118 | 		const request = route.request();
  119 | 		const origin = (await request.headerValue('origin')) ?? 'http://localhost:4173';
  120 | 		const headers = {
  121 | 			'Access-Control-Allow-Origin': origin,
  122 | 			'Access-Control-Allow-Methods': 'POST, OPTIONS',
  123 | 			'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept'
  124 | 		};
  125 | 		if (request.method() === 'OPTIONS') {
  126 | 			await route.fulfill({ status: 204, headers, body: '' });
  127 | 			return;
  128 | 		}
  129 | 		if (request.method() !== 'POST') throw new Error('Token fixture expected POST');
  130 | 		counts.tokenPosts++;
  131 | 		if (Object.hasOwn(request.postDataJSON(), 'draft')) counts.withDraft++;
  132 | 		await route.fulfill({
  133 | 			status: 200,
  134 | 			contentType: 'application/json',
  135 | 			headers,
  136 | 			body: JSON.stringify({
  137 | 				url: `${SITE_ORIGIN}/preview`,
  138 | 				expiresAt: new Date(Date.now() + 600_000).toISOString(),
  139 | 				...(transport === 'post' ? { postToken: 'csp-draft-synthetic' } : {})
  140 | 			})
  141 | 		});
  142 | 	});
  143 | 	return { site, counts };
  144 | }
  145 | 
  146 | test('source: exact current index bytes and source CSP served by isolated Caddy', async ({
  147 | 	request
  148 | }) => {
  149 | 	const response = await request.get('/login');
  150 | 	expect(response.status()).toBe(200);
  151 | 	expect(response.headers()['content-security-policy']).toBe(identity.policy);
  152 | 	expect(
  153 | 		createHash('sha256')
  154 | 			.update(await response.body())
  155 | 			.digest('hex')
  156 | 	).toBe(identity.buildFilesSHA256['index.html']);
  157 | });
  158 | 
  159 | test('source: login reaches exact historical landing and exposes content navigation', async ({
  160 | 	page
  161 | }) => {
  162 | 	await login(page);
  163 | 	await expect(page.getByRole('heading', { level: 1, name: 'Crear «Información del sitio»', exact: true })).toBeVisible();
  164 | 	await page.locator('#vega-sidebar a[href="/c/posts"]').click();
  165 | 	await expect(page).toHaveURL(/\/c\/posts$/);
  166 | 	await clean();
  167 | });
  168 | 
  169 | test('source: list search actually filters seeded content', async ({ page }) => {
  170 | 	await login(page);
  171 | 	await page.goto('/c/posts');
  172 | 	await page.getByLabel('Buscar en el listado').fill('Bienvenido');
  173 | 	await expect(page.getByRole('link', { name: 'Bienvenido a Vega', exact: true })).toBeVisible();
  174 | 	await clean();
  175 | });
  176 | 
  177 | test('source: edit form writes and reopens saved title via SPA; history panel opens', async ({
  178 | 	page
  179 | }) => {
  180 | 	await login(page);
  181 | 	await page.goto('/c/posts/post_1');
  182 | 	await page.getByRole('textbox', { name: 'Título', exact: true }).fill('CSP título guardado');
  183 | 	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  184 | 	await page.getByRole('button', { name: 'Historial', exact: true }).click();
  185 | 	await expect(
  186 | 		page.getByText('El historial de versiones no está activado en este proyecto.')
  187 | 	).toBeVisible();
  188 | 	await page.getByRole('link', { name: 'Entradas', exact: false }).click();
  189 | 	await page.getByRole('link', { name: 'CSP título guardado', exact: true }).click();
  190 | 	await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue(
  191 | 		'CSP título guardado'
  192 | 	);
  193 | 	await clean();
  194 | });
  195 | 
  196 | test('source: new form creates a record and resolves its real memory ID', async ({ page }) => {
  197 | 	await login(page);
  198 | 	await page.goto('/c/posts/new');
> 199 | 	await page.getByRole('textbox', { name: 'Título', exact: true }).fill('CSP nueva entrada');
      |                                                                   ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  200 | 	await page.getByLabel('Body').fill('Contenido de prueba CSP.');
  201 | 	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  202 | 	await expect(page).toHaveURL(/\/c\/posts\/(?!new)[^/]+$/);
  203 | 	await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue(
  204 | 		'CSP nueva entrada'
  205 | 	);
  206 | 	await clean();
  207 | });
  208 | 
  209 | test('source: visual editor fetches HTTPS token, completes bridge and selects real block', async ({
  210 | 	page
  211 | }) => {
  212 | 	const { counts } = await installSite(page);
  213 | 	await login(page, true);
  214 | 	await page.goto('/c/paginas/pagina_1/visual');
  215 | 	await expect(page.locator('.vega-visual-status-text')).toHaveText(
  216 | 		'Conectado al sitio: 3 bloques en la página.'
  217 | 	);
  218 | 	await expect.poll(() => counts.tokenPosts).toBeGreaterThan(0);
  219 | 	await page
  220 | 		.frameLocator('iframe.vega-visual-frame')
  221 | 		.locator('[data-vega-block-id="seccion_2"]')
  222 | 		.click();
  223 | 	await expect(page.locator('[data-vega-tree-row="seccion_2"]')).toHaveClass(
  224 | 		/vega-tree-row--selected/
  225 | 	);
  226 | 	await expect(
  227 | 		page.locator('.vega-visual-overlay-box[data-vega-block-id="seccion_2"]')
  228 | 	).toHaveClass(/vega-visual-overlay-box--selected/);
  229 | 	await clean();
  230 | });
  231 | 
  232 | for (const transport of ['get', 'post'] as const) {
  233 | 	test(`source: preview panel uses actual external ${transport.toUpperCase()} document transport`, async ({
  234 | 		page
  235 | 	}) => {
  236 | 		const { counts } = await installSite(page, transport);
  237 | 		await login(page, true);
  238 | 		await page.goto('/c/paginas/pagina_1');
  239 | 		await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  240 | 		await expect(
  241 | 			page.frameLocator('.vega-preview-panel-frame').locator('[data-vega-block-id="seccion_1"]')
  242 | 		).toBeVisible();
  243 | 		await expect.poll(() => counts.tokenPosts).toBeGreaterThan(0);
  244 | 		await expect.poll(() => counts.withDraft).toBeGreaterThan(0);
  245 | 		if (transport === 'post') {
  246 | 			await expect.poll(() => counts.documentPosts).toBeGreaterThan(0);
  247 | 			expect(counts.postBodyValid).toBe(true);
  248 | 			expect(counts.documentGets).toBe(0);
  249 | 			expect(identity.policy).not.toContain('form-action');
  250 | 		} else await expect.poll(() => counts.documentGets).toBeGreaterThan(0);
  251 | 		await clean();
  252 | 	});
  253 | }
  254 | 
  255 | test('source: media bootstrap and settings change run real UI handlers', async ({ page }) => {
  256 | 	await login(page);
  257 | 	await page.goto('/media');
  258 | 	await page.getByRole('button', { name: 'Crear colección de medios', exact: true }).click();
  259 | 	await page
  260 | 		.getByRole('alertdialog')
  261 | 		.getByRole('button', { name: 'Crear colección', exact: true })
  262 | 		.click();
  263 | 	await expect(page.locator('[data-media-state="present"]')).toBeVisible();
  264 | 	await page.getByRole('link', { name: 'Ajustes', exact: false }).click();
  265 | 	const editor = page.locator('#manifest-editor-textarea');
  266 | 	await editor.fill((await editor.inputValue()).replace('Vega Demo', 'CSP Vega Demo'));
  267 | 	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  268 | 	await expect(page.locator('.vega-topbar-site')).toContainText('CSP Vega Demo');
  269 | 	await clean();
  270 | });
  271 | 
  272 | test('source: trash exposes actual fallback and navigates its CTA', async ({ page }) => {
  273 | 	await login(page);
  274 | 	await page.goto('/papelera');
  275 | 	await expect(page.getByText('La papelera no está activada en este proyecto.')).toBeVisible();
  276 | 	await page.getByRole('button', { name: 'Ir a Ajustes', exact: true }).click();
  277 | 	await expect(page.locator('#manifest-editor-textarea')).toBeVisible();
  278 | 	await clean();
  279 | });
  280 | 
  281 | test('ancestor control: same built app embeds without ancestor rule; source actually blocks it', async ({
  282 | 	page,
  283 | 	request
  284 | }) => {
  285 | 	const diagnostics: {
  286 | 		consoleCategories: string[];
  287 | 		pageErrorNames: string[];
  288 | 		networkErrors: string[];
  289 | 	} = {
  290 | 		consoleCategories: [],
  291 | 		pageErrorNames: [],
  292 | 		networkErrors: []
  293 | 	};
  294 | 	page.on('pageerror', (error) => diagnostics.pageErrorNames.push(error.name));
  295 | 	page.on('requestfailed', (request) => {
  296 | 		const code = request.failure()?.errorText.match(/ERR_[A-Z_]+/)?.[0];
  297 | 		if (code) diagnostics.networkErrors.push(code);
  298 | 	});
  299 | 	page.on('console', (message) => {
```