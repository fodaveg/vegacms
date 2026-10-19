# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: current-spa-proof.spec.ts >> source: visual editor fetches HTTPS token, completes bridge and selects real block
- Location: ../../../Users/david/code/vegacms/.verification/production-ready-candidate-20261008/public-spa-version-fixture/vega-lumbre/current-spa-proof.spec.ts:209:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('.vega-visual-status-text')
Expected: "Conectado al sitio: 3 bloques en la página."
Received: "Conectado al sitio: 3 bloque(s) en la página."
Timeout:  5000ms

Call log:
  - Expect "toHaveText" with timeout 5000ms
  - waiting for locator('.vega-visual-status-text')
    - locator resolved to <span class="vega-visual-status-text svelte-1qlb7bj">Conectando con el sitio…</span>
    - unexpected value "Conectando con el sitio…"
    12 × locator resolved to <span class="vega-visual-status-text svelte-1qlb7bj">Conectado al sitio: 3 bloque(s) en la página.</span>
       - unexpected value "Conectado al sitio: 3 bloque(s) en la página."

```

```yaml
- text: "Conectado al sitio: 3 bloque(s) en la página."
```

# Test source

```ts
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
  182 | 	await page.getByRole('textbox', { name: 'Title', exact: true }).fill('CSP título guardado');
  183 | 	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  184 | 	await page.getByRole('button', { name: 'Historial', exact: true }).click();
  185 | 	await expect(
  186 | 		page.getByText('El historial de versiones no está activado en este proyecto.')
  187 | 	).toBeVisible();
  188 | 	await page.getByRole('link', { name: 'Entradas', exact: false }).click();
  189 | 	await page.getByRole('link', { name: 'CSP título guardado', exact: true }).click();
  190 | 	await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
  191 | 		'CSP título guardado'
  192 | 	);
  193 | 	await clean();
  194 | });
  195 | 
  196 | test('source: new form creates a record and resolves its real memory ID', async ({ page }) => {
  197 | 	await login(page);
  198 | 	await page.goto('/c/posts/new');
  199 | 	await page.getByRole('textbox', { name: 'Title', exact: true }).fill('CSP nueva entrada');
  200 | 	await page.getByLabel('Body').fill('Contenido de prueba CSP.');
  201 | 	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  202 | 	await expect(page).toHaveURL(/\/c\/posts\/(?!new)[^/]+$/);
  203 | 	await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
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
> 215 | 	await expect(page.locator('.vega-visual-status-text')).toHaveText(
      |                                                         ^ Error: expect(locator).toHaveText(expected) failed
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
  300 | 		for (const category of [
  301 | 			'frame-ancestors',
  302 | 			'X-Frame-Options',
  303 | 			'connect-src',
  304 | 			'script-src',
  305 | 			'Private Network',
  306 | 			'localStorage',
  307 | 			'SecurityError'
  308 | 		]) {
  309 | 			if (message.text().includes(category)) diagnostics.consoleCategories.push(category);
  310 | 		}
  311 | 	});
  312 | 	for (const name of ['ancestor-control', 'source']) {
  313 | 		const variant = identity.variants[name];
  314 | 		const response = await request.get(`http://localhost:${variant.port}/login`);
  315 | 		expect(response.status()).toBe(200);
```