# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: current-spa-proof.spec.ts >> form negative >> adding form-action self blocks actual panel POST while token fetch still succeeds
- Location: ../../../Users/david/code/vegacms/.verification/production-ready-candidate-20261008/public-spa-historical-landing/vega-lumbre/current-spa-proof.spec.ts:402:2

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
  navigated to "http://localhost:4176/c/entradas"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic "fodaveg.net" [ref=e5]:
        - img [ref=e6]
        - generic [ref=e15]: Vega
        - generic [ref=e16]: fodaveg.net
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
        - generic [ref=e44]:
          - paragraph [ref=e45]: Contenido
          - list [ref=e46]:
            - listitem [ref=e47]:
              - link "Entradas 12" [ref=e48] [cursor=pointer]:
                - /url: /c/entradas
                - img [ref=e49]
                - generic "Entradas" [ref=e50]
                - generic [ref=e52]: "12"
            - listitem [ref=e53]:
              - link "Páginas 5" [ref=e54] [cursor=pointer]:
                - /url: /c/paginas
                - img [ref=e55]
                - generic "Páginas" [ref=e58]
                - generic [ref=e60]: "5"
            - listitem [ref=e61]:
              - link "Proyectos 6" [ref=e62] [cursor=pointer]:
                - /url: /c/proyectos
                - img [ref=e63]
                - generic "Proyectos" [ref=e66]
                - generic [ref=e68]: "6"
        - generic [ref=e69]:
          - paragraph [ref=e70]: Estructura
          - list [ref=e71]:
            - listitem [ref=e72]:
              - link "Autores 3" [ref=e73] [cursor=pointer]:
                - /url: /c/autores
                - img [ref=e74]
                - generic "Autores" [ref=e77]
                - generic [ref=e79]: "3"
            - listitem [ref=e80]:
              - link "Etiquetas 12" [ref=e81] [cursor=pointer]:
                - /url: /c/etiquetas
                - img [ref=e82]
                - generic "Etiquetas" [ref=e85]
                - generic [ref=e87]: "12"
        - list [ref=e88]:
          - listitem [ref=e89]:
            - link "Medios 8" [ref=e90] [cursor=pointer]:
              - /url: /media
              - img [ref=e91]
              - generic [ref=e95]: Medios
              - generic [ref=e97]: "8"
          - listitem [ref=e98]:
            - link "Papelera" [ref=e99] [cursor=pointer]:
              - /url: /papelera
              - img [ref=e100]
              - generic [ref=e103]: Papelera
          - listitem [ref=e104]:
            - link "Editores" [ref=e105] [cursor=pointer]:
              - /url: /editores
              - img [ref=e106]
              - generic [ref=e109]: Editores
          - listitem [ref=e110]:
            - link "Copias" [ref=e111] [cursor=pointer]:
              - /url: /copias
              - img [ref=e112]
              - generic [ref=e115]: Copias
          - listitem [ref=e116]:
            - link "Ajustes" [ref=e117] [cursor=pointer]:
              - /url: /settings
              - img [ref=e118]
              - generic [ref=e121]: Ajustes
      - main [ref=e122]:
        - generic [ref=e123]:
          - generic [ref=e124]:
            - heading "Entradas" [level=1] [ref=e125]
            - generic [ref=e126]: 12 registros · 0 filtros
            - button "Exportar" [ref=e127] [cursor=pointer]
            - button "Importar" [ref=e128] [cursor=pointer]
            - button "Crear «Entrada»" [ref=e129] [cursor=pointer]:
              - img [ref=e130]
              - text: Crear «Entrada»
          - generic [ref=e131]:
            - generic [ref=e132]:
              - img [ref=e133]
              - searchbox "Buscar en el listado" [ref=e136]
            - button "Filtrar" [ref=e138] [cursor=pointer]:
              - text: Filtrar
              - img [ref=e139]
          - generic [ref=e142]:
            - table [ref=e144]:
              - rowgroup [ref=e145]:
                - row "Ordenar por Título Ordenar por Estado Ordenar por Autor Ordenar por Actualizado" [ref=e146]:
                  - columnheader "Ordenar por Título" [ref=e147]:
                    - button "Ordenar por Título" [ref=e148] [cursor=pointer]: Título
                  - columnheader "Ordenar por Estado" [ref=e149]:
                    - button "Ordenar por Estado" [ref=e150] [cursor=pointer]: Estado
                  - columnheader "Ordenar por Autor" [ref=e151]:
                    - button "Ordenar por Autor" [ref=e152] [cursor=pointer]: Autor
                  - columnheader "Ordenar por Actualizado" [ref=e153]:
                    - button "Ordenar por Actualizado" [ref=e154] [cursor=pointer]:
                      - text: Actualizado
                      - generic [ref=e155]: ↓
              - rowgroup [ref=e156]:
                - row "Backups 3-2-1 para un self-host de un solo servidor backups-3-2-1-selfhost Programado David 1 ago 2026 Borrar \"Backups 3-2-1 para un self-host de un solo servidor\"" [ref=e157]:
                  - cell "Backups 3-2-1 para un self-host de un solo servidor backups-3-2-1-selfhost" [ref=e158]:
                    - link "Backups 3-2-1 para un self-host de un solo servidor" [ref=e159] [cursor=pointer]:
                      - /url: /c/entradas/entrada_11
                    - generic [ref=e160]: backups-3-2-1-selfhost
                  - cell "Programado" [ref=e161]:
                    - generic [ref=e162]: Programado
                  - cell "David" [ref=e163]
                  - cell "1 ago 2026 Borrar \"Backups 3-2-1 para un self-host de un solo servidor\"" [ref=e164]:
                    - text: 1 ago 2026
                    - button "Borrar \"Backups 3-2-1 para un self-host de un solo servidor\"" [ref=e165] [cursor=pointer]: Borrar
                - row "Migrar el blog de Hugo a Astro sin romper las URLs migrar-blog-hugo-astro-sin-romper-urls Publicado David 23 jul 2026 Borrar \"Migrar el blog de Hugo a Astro sin romper las URLs\"" [ref=e166]:
                  - cell "Migrar el blog de Hugo a Astro sin romper las URLs migrar-blog-hugo-astro-sin-romper-urls" [ref=e167]:
                    - link "Migrar el blog de Hugo a Astro sin romper las URLs" [ref=e168] [cursor=pointer]:
                      - /url: /c/entradas/entrada_1
                    - generic [ref=e169]: migrar-blog-hugo-astro-sin-romper-urls
                  - cell "Publicado" [ref=e170]:
                    - generic [ref=e171]: Publicado
                  - cell "David" [ref=e172]
                  - cell "23 jul 2026 Borrar \"Migrar el blog de Hugo a Astro sin romper las URLs\"" [ref=e173]:
                    - text: 23 jul 2026
                    - button "Borrar \"Migrar el blog de Hugo a Astro sin romper las URLs\"" [ref=e174] [cursor=pointer]: Borrar
                - 'row "Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega temas-claro-oscuro-vocabulario-tokens-motor-paletas Borrador David 23 jul 2026 Borrar \"Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega\"" [ref=e175]':
                  - 'cell "Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega temas-claro-oscuro-vocabulario-tokens-motor-paletas" [ref=e176]':
                    - 'link "Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega" [ref=e177] [cursor=pointer]':
                      - /url: /c/entradas/entrada_2
                    - generic [ref=e178]: temas-claro-oscuro-vocabulario-tokens-motor-paletas
                  - cell "Borrador" [ref=e179]:
                    - generic [ref=e180]: Borrador
                  - cell "David" [ref=e181]
                  - 'cell "23 jul 2026 Borrar \"Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega\"" [ref=e182]':
                    - text: 23 jul 2026
                    - 'button "Borrar \"Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega\"" [ref=e183] [cursor=pointer]': Borrar
                - row "PocketBase como backend de un CMS editor-first pocketbase-backend-cms-editor-first Publicado David 18 jul 2026 Borrar \"PocketBase como backend de un CMS editor-first\"" [ref=e184]:
                  - cell "PocketBase como backend de un CMS editor-first pocketbase-backend-cms-editor-first" [ref=e185]:
                    - link "PocketBase como backend de un CMS editor-first" [ref=e186] [cursor=pointer]:
                      - /url: /c/entradas/entrada_3
                    - generic [ref=e187]: pocketbase-backend-cms-editor-first
                  - cell "Publicado" [ref=e188]:
                    - generic [ref=e189]: Publicado
                  - cell "David" [ref=e190]
                  - cell "18 jul 2026 Borrar \"PocketBase como backend de un CMS editor-first\"" [ref=e191]:
                    - text: 18 jul 2026
                    - button "Borrar \"PocketBase como backend de un CMS editor-first\"" [ref=e192] [cursor=pointer]: Borrar
                - 'row "Notas del huerto: julio notas-del-huerto-julio Programado Marta 15 jul 2026 Borrar \"Notas del huerto: julio\"" [ref=e193]':
                  - 'cell "Notas del huerto: julio notas-del-huerto-julio" [ref=e194]':
                    - 'link "Notas del huerto: julio" [ref=e195] [cursor=pointer]':
                      - /url: /c/entradas/entrada_4
                    - generic [ref=e196]: notas-del-huerto-julio
                  - cell "Programado" [ref=e197]:
                    - generic [ref=e198]: Programado
                  - cell "Marta" [ref=e199]
                  - 'cell "15 jul 2026 Borrar \"Notas del huerto: julio\"" [ref=e200]':
                    - text: 15 jul 2026
                    - 'button "Borrar \"Notas del huerto: julio\"" [ref=e201] [cursor=pointer]': Borrar
                - 'row "Passkeys en un backend Go: TOTP, WebAuthn y tres factores passkeys-backend-go-totp-webauthn Publicado David 11 jul 2026 Borrar \"Passkeys en un backend Go: TOTP, WebAuthn y tres factores\"" [ref=e202]':
                  - 'cell "Passkeys en un backend Go: TOTP, WebAuthn y tres factores passkeys-backend-go-totp-webauthn" [ref=e203]':
                    - 'link "Passkeys en un backend Go: TOTP, WebAuthn y tres factores" [ref=e204] [cursor=pointer]':
                      - /url: /c/entradas/entrada_5
                    - generic [ref=e205]: passkeys-backend-go-totp-webauthn
                  - cell "Publicado" [ref=e206]:
                    - generic [ref=e207]: Publicado
                  - cell "David" [ref=e208]
                  - 'cell "11 jul 2026 Borrar \"Passkeys en un backend Go: TOTP, WebAuthn y tres factores\"" [ref=e209]':
                    - text: 11 jul 2026
                    - 'button "Borrar \"Passkeys en un backend Go: TOTP, WebAuthn y tres factores\"" [ref=e210] [cursor=pointer]': Borrar
                - row "Sin título Borrador — 2 jul 2026 Borrar \"Sin título\"" [ref=e211]:
                  - cell "Sin título" [ref=e212]:
                    - link "Sin título" [ref=e213] [cursor=pointer]:
                      - /url: /c/entradas/entrada_6
                  - cell "Borrador" [ref=e214]:
                    - generic [ref=e215]: Borrador
                  - cell "—" [ref=e216]
                  - cell "2 jul 2026 Borrar \"Sin título\"" [ref=e217]:
                    - text: 2 jul 2026
                    - button "Borrar \"Sin título\"" [ref=e218] [cursor=pointer]: Borrar
                - 'row "Reseña: teclados de perfil bajo para escribir mucho resena-teclados-perfil-bajo Publicado Marta 28 jun 2026 Borrar \"Reseña: teclados de perfil bajo para escribir mucho\"" [ref=e219]':
                  - 'cell "Reseña: teclados de perfil bajo para escribir mucho resena-teclados-perfil-bajo" [ref=e220]':
                    - 'link "Reseña: teclados de perfil bajo para escribir mucho" [ref=e221] [cursor=pointer]':
                      - /url: /c/entradas/entrada_7
                    - generic [ref=e222]: resena-teclados-perfil-bajo
                  - cell "Publicado" [ref=e223]:
                    - generic [ref=e224]: Publicado
                  - cell "Marta" [ref=e225]
                  - 'cell "28 jun 2026 Borrar \"Reseña: teclados de perfil bajo para escribir mucho\"" [ref=e226]':
                    - text: 28 jun 2026
                    - 'button "Borrar \"Reseña: teclados de perfil bajo para escribir mucho\"" [ref=e227] [cursor=pointer]': Borrar
                - 'row "Autoalojar sin dolor: mi checklist de higiene de servidor autoalojar-checklist-higiene-servidor Publicado David 20 jun 2026 Borrar \"Autoalojar sin dolor: mi checklist de higiene de servidor\"" [ref=e228]':
                  - 'cell "Autoalojar sin dolor: mi checklist de higiene de servidor autoalojar-checklist-higiene-servidor" [ref=e229]':
                    - 'link "Autoalojar sin dolor: mi checklist de higiene de servidor" [ref=e230] [cursor=pointer]':
                      - /url: /c/entradas/entrada_8
                    - generic [ref=e231]: autoalojar-checklist-higiene-servidor
                  - cell "Publicado" [ref=e232]:
                    - generic [ref=e233]: Publicado
                  - cell "David" [ref=e234]
                  - 'cell "20 jun 2026 Borrar \"Autoalojar sin dolor: mi checklist de higiene de servidor\"" [ref=e235]':
                    - text: 20 jun 2026
                    - 'button "Borrar \"Autoalojar sin dolor: mi checklist de higiene de servidor\"" [ref=e236] [cursor=pointer]': Borrar
                - row "Por qué elegimos Svelte 5 runes para el admin por-que-svelte-5-runes-admin Borrador David 14 jun 2026 Borrar \"Por qué elegimos Svelte 5 runes para el admin\"" [ref=e237]:
                  - cell "Por qué elegimos Svelte 5 runes para el admin por-que-svelte-5-runes-admin" [ref=e238]:
                    - link "Por qué elegimos Svelte 5 runes para el admin" [ref=e239] [cursor=pointer]:
                      - /url: /c/entradas/entrada_9
                    - generic [ref=e240]: por-que-svelte-5-runes-admin
                  - cell "Borrador" [ref=e241]:
                    - generic [ref=e242]: Borrador
                  - cell "David" [ref=e243]
                  - cell "14 jun 2026 Borrar \"Por qué elegimos Svelte 5 runes para el admin\"" [ref=e244]:
                    - text: 14 jun 2026
                    - button "Borrar \"Por qué elegimos Svelte 5 runes para el admin\"" [ref=e245] [cursor=pointer]: Borrar
                - 'row "Accesibilidad AA de verdad: contraste medido, no adivinado accesibilidad-aa-contraste-medido Publicado Marta 5 jun 2026 Borrar \"Accesibilidad AA de verdad: contraste medido, no adivinado\"" [ref=e246]':
                  - 'cell "Accesibilidad AA de verdad: contraste medido, no adivinado accesibilidad-aa-contraste-medido" [ref=e247]':
                    - 'link "Accesibilidad AA de verdad: contraste medido, no adivinado" [ref=e248] [cursor=pointer]':
                      - /url: /c/entradas/entrada_10
                    - generic [ref=e249]: accesibilidad-aa-contraste-medido
                  - cell "Publicado" [ref=e250]:
                    - generic [ref=e251]: Publicado
                  - cell "Marta" [ref=e252]
                  - 'cell "5 jun 2026 Borrar \"Accesibilidad AA de verdad: contraste medido, no adivinado\"" [ref=e253]':
                    - text: 5 jun 2026
                    - 'button "Borrar \"Accesibilidad AA de verdad: contraste medido, no adivinado\"" [ref=e254] [cursor=pointer]': Borrar
                - 'row "Diario de un rediseño: del wireframe al pixel diario-rediseno-wireframe-pixel Borrador Marta 30 may 2026 Borrar \"Diario de un rediseño: del wireframe al pixel\"" [ref=e255]':
                  - 'cell "Diario de un rediseño: del wireframe al pixel diario-rediseno-wireframe-pixel" [ref=e256]':
                    - 'link "Diario de un rediseño: del wireframe al pixel" [ref=e257] [cursor=pointer]':
                      - /url: /c/entradas/entrada_12
                    - generic [ref=e258]: diario-rediseno-wireframe-pixel
                  - cell "Borrador" [ref=e259]:
                    - generic [ref=e260]: Borrador
                  - cell "Marta" [ref=e261]
                  - 'cell "30 may 2026 Borrar \"Diario de un rediseño: del wireframe al pixel\"" [ref=e262]':
                    - text: 30 may 2026
                    - 'button "Borrar \"Diario de un rediseño: del wireframe al pixel\"" [ref=e263] [cursor=pointer]': Borrar
            - generic [ref=e264]:
              - generic [ref=e265]: 1–12 de 12
              - generic [ref=e266]:
                - button "Anterior" [disabled] [ref=e267]: ‹
                - button "Siguiente" [disabled] [ref=e268]: ›
  - generic [ref=e269]: Vega — Acceder a Vega
```

# Test source

```ts
  54  | const INDEX_HTML_PATH = join(bundleRoot, 'build/index.html');
  55  | 
  56  | export const test = base.extend({
  57  | 	context: async ({ context }, use) => {
  58  | 		const guard = createGuard();
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
  149 |  * Landing exacto de la SPA pública histórica, acreditado por probe local con CSP real.
  150 |  * Autentica y redirige al singleton vacío; no afirma que exista la portada Inicio actual.
  151 |  * El guard y las acciones siguientes conservan su intención original.
  152 |  */
  153 | export async function waitForHistoricalLanding(page: import('@playwright/test').Page): Promise<void> {
> 154 | 	await page.waitForURL((url) => url.pathname === '/c/site_info/new');
      |             ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  155 | 	await expect(page.getByRole('heading', { level: 1, name: 'Crear «Información del sitio»', exact: true })).toBeVisible();
  156 | }
  157 | 
  158 | /**
  159 |  * Desde una vista con el menú lateral visible (escritorio), abre «Información del sitio» con un
  160 |  * clic, como haría quien edita, y espera a su formulario de crear (`/c/site_info/new`: el
  161 |  * singleton de la semilla de demo no tiene registros). Es el destino al que antes llevaba solo
  162 |  * el índice; los specs que trabajan sobre ese formulario o re-clican su enlace ya activo llegan
  163 |  * ahora por aquí. La navegación es SPA, igual que lo era la redirección del índice.
  164 |  */
  165 | export async function openSiteInfoFromSidebar(
  166 | 	page: import('@playwright/test').Page
  167 | ): Promise<void> {
  168 | 	await page.getByRole('link', { name: 'Información del sitio' }).click();
  169 | 	await page.waitForURL('**/c/site_info/new');
  170 | 	await expect(page.getByRole('link', { name: 'Información del sitio' })).toHaveAttribute(
  171 | 		'aria-current',
  172 | 		'page'
  173 | 	);
  174 | }
  175 | 
```