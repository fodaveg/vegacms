# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: current-spa-proof.spec.ts >> source: trash exposes actual fallback and navigates its CTA
- Location: ../../../Users/david/code/vegacms/.verification/production-ready-candidate-20261008/public-spa-isolation-module-fix/vega-lumbre/current-spa-proof.spec.ts:272:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Inicio', exact: true, level: 1 })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Inicio', exact: true, level: 1 })

```

```yaml
- banner:
  - text: Vega Vega Demo
  - combobox "Búsqueda global"
  - text: Conectado
  - group "Densidad":
    - button "Cómoda" [pressed]
    - button "Compacta"
  - button "Plegar la barra lateral" [expanded]
  - button "Menú de cuenta":
    - img "Sesión de demo@vega.dev": D
  - button "Cerrar sesión"
- navigation "Navegación principal":
  - list:
    - listitem:
      - link "Información del sitio":
        - /url: /c/site_info
  - paragraph: Contenido
  - list:
    - listitem:
      - link "Entradas 32":
        - /url: /c/posts
    - listitem:
      - link "Páginas Solo lectura 0":
        - /url: /c/pages
    - listitem:
      - link "Autores 0":
        - /url: /c/authors
    - listitem:
      - link "Métricas 1":
        - /url: /c/metrics
    - listitem:
      - link "Obras 2":
        - /url: /c/works
    - listitem:
      - link "Pistas 2":
        - /url: /c/tracks
    - listitem:
      - link "Catálogo Solo lectura":
        - /url: /v/catalogo
    - listitem:
      - link "Blog 12":
        - /url: /c/blog
    - listitem:
      - link "Avisos 1":
        - /url: /c/avisos
  - list:
    - listitem:
      - link "Medios":
        - /url: /media
    - listitem:
      - link "Papelera":
        - /url: /papelera
    - listitem:
      - link "Editores":
        - /url: /editores
    - listitem:
      - link "Copias":
        - /url: /copias
    - listitem:
      - link "Ajustes 1 avisos":
        - /url: /settings
        - text: Ajustes 1
- main:
  - heading "Crear «Información del sitio»" [level=1]
  - button "Información del sitio"
  - text: nuevo
  - button "Ver en el sitio" [disabled]
  - button "Guardar"
  - text: Tagline
  - textbox "Tagline"
- text: Vega — Acceder a Vega
```

# Test source

```ts
  59  | 		await context.route('**/*', (route) => guard.handle(route));
  60  | 		await use(context);
  61  | 		expect(guard.counts.blocked, 'Unexpected outbound browser origin blocked').toBe(0);
  62  | 		expect(guard.counts.unhandledSynthetic, 'Synthetic site escaped its local mock').toBe(0);
  63  | 	},
  64  | 	page: async ({ page }, use) => {
  65  | 		await page.addInitScript(() => {
  66  | 			(window as unknown as { __VEGA_ADAPTER__?: string }).__VEGA_ADAPTER__ = 'memory';
  67  | 		});
  68  | 
  69  | 		// Ver cabecera: emula el fallback SPA de un host real para que una navegación de
  70  | 		// documento a una ruta aún no implementada (Fase 3) no abandone la app.
  71  | 		await page.route('**/*', async (route) => {
  72  | 			const request = route.request();
  73  | 			if (request.resourceType() !== 'document') {
  74  | 				await route.fallback();
  75  | 				return;
  76  | 			}
  77  | 			const url = new URL(request.url());
  78  | 			if (url.pathname === '/' || url.pathname === '/login') {
  79  | 				await route.fallback();
  80  | 				return;
  81  | 			}
  82  | 			const response = await createGuard().guardedFetch(route);
  83  | 			if (!response) return;
  84  | 			if (response.status() !== 404) {
  85  | 				await route.fulfill({ response });
  86  | 				return;
  87  | 			}
  88  | 			await route.fulfill({
  89  | 				status: 200,
  90  | 				contentType: 'text/html',
  91  | 				body: readFileSync(INDEX_HTML_PATH, 'utf-8')
  92  | 			});
  93  | 		});
  94  | 
  95  | 		await use(page);
  96  | 	}
  97  | });
  98  | 
  99  | export { expect };
  100 | 
  101 | /**
  102 |  * Login vía UI con las credenciales de demo; deja la página ya autenticada.
  103 |  *
  104 |  * `opts.seedMedia` (Fase P6·6b): fija `window.__VEGA_SEED_MEDIA__ = true` ANTES de navegar a
  105 |  * `/login` (mismo momento que el flag `__VEGA_ADAPTER__` de la fixture `page` de arriba: un
  106 |  * `addInitScript` corre antes de que el bundle arranque, así que llega a tiempo para la
  107 |  * PRIMERA construcción del `BackendPort`, `session/backend.ts`) — el adaptador `memory` arranca
  108 |  * entonces con `DEMO_SEED_WITH_MEDIA` (la colección `vega_media` YA creada, con assets) en vez
  109 |  * de `DEMO_SEED`. Ausente/`false` = comportamiento previo, usado por el resto de la suite.
  110 |  *
  111 |  * `opts.editorMode` (lote L6c): mismo mecanismo, fija `window.__VEGA_FORCE_EDITOR_CAPABILITIES__
  112 |  * = true` — el `BackendPort` resultante lleva `capabilities.schemaDiscovery`/`schemaBootstrap` en
  113 |  * `false`, simulando una sesión de rol editor (ver `withEditorCapabilities`, `session/backend.ts`)
  114 |  * sin montar un PocketBase real. Ausente/`false` = comportamiento previo (capabilities de
  115 |  * superuser).
  116 |  */
  117 | export async function loginAsDemo(
  118 | 	page: import('@playwright/test').Page,
  119 | 	opts?: { seedMedia?: boolean; editorMode?: boolean; seedShowcase?: boolean }
  120 | ): Promise<void> {
  121 | 	if (opts?.seedShowcase) {
  122 | 		// Mismo mecanismo que `seedMedia`: fija `window.__VEGA_SEED_SHOWCASE__ = true` antes de que el
  123 | 		// bundle arranque, así el `BackendPort` nace con `SHOWCASE_SEED` (sidebar 1:1 del mockup,
  124 | 		// colección `entradas` con `defaultSort` desc). Ausente/`false` = `DEMO_SEED` de siempre.
  125 | 		await page.addInitScript(() => {
  126 | 			(window as unknown as { __VEGA_SEED_SHOWCASE__?: boolean }).__VEGA_SEED_SHOWCASE__ = true;
  127 | 		});
  128 | 	}
  129 | 	if (opts?.seedMedia) {
  130 | 		await page.addInitScript(() => {
  131 | 			(window as unknown as { __VEGA_SEED_MEDIA__?: boolean }).__VEGA_SEED_MEDIA__ = true;
  132 | 		});
  133 | 	}
  134 | 	if (opts?.editorMode) {
  135 | 		await page.addInitScript(() => {
  136 | 			(
  137 | 				window as unknown as { __VEGA_FORCE_EDITOR_CAPABILITIES__?: boolean }
  138 | 			).__VEGA_FORCE_EDITOR_CAPABILITIES__ = true;
  139 | 		});
  140 | 	}
  141 | 	await page.goto('/login');
  142 | 	await page.getByLabel('Correo electrónico').fill(DEMO_EMAIL);
  143 | 	await page.getByLabel('Contraseña').fill(DEMO_PASSWORD);
  144 | 	await page.getByRole('button', { name: 'Entrar' }).click();
  145 | 	await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  146 | }
  147 | 
  148 | /**
  149 |  * Espera a que la app se asiente en la portada «Inicio» (`/`, lote 12): es donde aterriza el
  150 |  * login y donde se queda una carga directa de `/` con sesión. Hasta el 1 oct 2026 el índice no
  151 |  * tenía pantalla y saltaba al primer elemento del menú (con la semilla de demo,
  152 |  * `/c/site_info/new`); por eso tantos specs esperaban esa URL tras `loginAsDemo`.
  153 |  *
  154 |  * Exige la ruta Y el `h1` «Inicio»: solo la URL no prueba nada, porque el layout ya está en `/`
  155 |  * mientras resuelve sesión y modelo.
  156 |  */
  157 | export async function waitForHome(page: import('@playwright/test').Page): Promise<void> {
  158 | 	await page.waitForURL((url) => url.pathname === '/');
> 159 | 	await expect(page.getByRole('heading', { level: 1, name: 'Inicio', exact: true })).toBeVisible();
      |                                                                                     ^ Error: expect(locator).toBeVisible() failed
  160 | }
  161 | 
  162 | /**
  163 |  * Desde una vista con el menú lateral visible (escritorio), abre «Información del sitio» con un
  164 |  * clic, como haría quien edita, y espera a su formulario de crear (`/c/site_info/new`: el
  165 |  * singleton de la semilla de demo no tiene registros). Es el destino al que antes llevaba solo
  166 |  * el índice; los specs que trabajan sobre ese formulario o re-clican su enlace ya activo llegan
  167 |  * ahora por aquí. La navegación es SPA, igual que lo era la redirección del índice.
  168 |  */
  169 | export async function openSiteInfoFromSidebar(
  170 | 	page: import('@playwright/test').Page
  171 | ): Promise<void> {
  172 | 	await page.getByRole('link', { name: 'Información del sitio' }).click();
  173 | 	await page.waitForURL('**/c/site_info/new');
  174 | 	await expect(page.getByRole('link', { name: 'Información del sitio' })).toHaveAttribute(
  175 | 		'aria-current',
  176 | 		'page'
  177 | 	);
  178 | }
  179 | 
```