# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: current-spa-proof.spec.ts >> form negative >> adding form-action self blocks actual panel POST while token fetch still succeeds
- Location: ../../../Users/david/code/vegacms/.verification/production-ready-candidate-20261008/public-spa-isolation-module-fix/vega-lumbre/current-spa-proof.spec.ts:402:2

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
  - text: Vega fodaveg.net
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
  - paragraph: Contenido
  - list:
    - listitem:
      - link "Entradas 12":
        - /url: /c/entradas
    - listitem:
      - link "Páginas 5":
        - /url: /c/paginas
    - listitem:
      - link "Proyectos 6":
        - /url: /c/proyectos
  - paragraph: Estructura
  - list:
    - listitem:
      - link "Autores 3":
        - /url: /c/autores
    - listitem:
      - link "Etiquetas 12":
        - /url: /c/etiquetas
  - list:
    - listitem:
      - link "Medios 8":
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
      - link "Ajustes":
        - /url: /settings
- main:
  - heading "Entradas" [level=1]
  - text: 12 registros · 0 filtros
  - button "Exportar"
  - button "Importar"
  - button "Crear «Entrada»"
  - searchbox "Buscar en el listado"
  - button "Filtrar"
  - table:
    - rowgroup:
      - row "Ordenar por Título Ordenar por Estado Ordenar por Autor Ordenar por Actualizado":
        - columnheader "Ordenar por Título":
          - button "Ordenar por Título": Título
        - columnheader "Ordenar por Estado":
          - button "Ordenar por Estado": Estado
        - columnheader "Ordenar por Autor":
          - button "Ordenar por Autor": Autor
        - columnheader "Ordenar por Actualizado":
          - button "Ordenar por Actualizado": Actualizado
    - rowgroup:
      - row "Backups 3-2-1 para un self-host de un solo servidor backups-3-2-1-selfhost Programado David 1 ago 2026 Borrar \"Backups 3-2-1 para un self-host de un solo servidor\"":
        - cell "Backups 3-2-1 para un self-host de un solo servidor backups-3-2-1-selfhost":
          - link "Backups 3-2-1 para un self-host de un solo servidor":
            - /url: /c/entradas/entrada_11
          - text: backups-3-2-1-selfhost
        - cell "Programado"
        - cell "David"
        - cell "1 ago 2026 Borrar \"Backups 3-2-1 para un self-host de un solo servidor\"":
          - text: 1 ago 2026
          - button "Borrar \"Backups 3-2-1 para un self-host de un solo servidor\"": Borrar
      - row "Migrar el blog de Hugo a Astro sin romper las URLs migrar-blog-hugo-astro-sin-romper-urls Publicado David 23 jul 2026 Borrar \"Migrar el blog de Hugo a Astro sin romper las URLs\"":
        - cell "Migrar el blog de Hugo a Astro sin romper las URLs migrar-blog-hugo-astro-sin-romper-urls":
          - link "Migrar el blog de Hugo a Astro sin romper las URLs":
            - /url: /c/entradas/entrada_1
          - text: migrar-blog-hugo-astro-sin-romper-urls
        - cell "Publicado"
        - cell "David"
        - cell "23 jul 2026 Borrar \"Migrar el blog de Hugo a Astro sin romper las URLs\"":
          - text: 23 jul 2026
          - button "Borrar \"Migrar el blog de Hugo a Astro sin romper las URLs\"": Borrar
      - 'row "Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega temas-claro-oscuro-vocabulario-tokens-motor-paletas Borrador David 23 jul 2026 Borrar \"Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega\""':
        - 'cell "Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega temas-claro-oscuro-vocabulario-tokens-motor-paletas"':
          - 'link "Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega"':
            - /url: /c/entradas/entrada_2
          - text: temas-claro-oscuro-vocabulario-tokens-motor-paletas
        - cell "Borrador"
        - cell "David"
        - 'cell "23 jul 2026 Borrar \"Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega\""':
          - text: 23 jul 2026
          - 'button "Borrar \"Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega\""': Borrar
      - row "PocketBase como backend de un CMS editor-first pocketbase-backend-cms-editor-first Publicado David 18 jul 2026 Borrar \"PocketBase como backend de un CMS editor-first\"":
        - cell "PocketBase como backend de un CMS editor-first pocketbase-backend-cms-editor-first":
          - link "PocketBase como backend de un CMS editor-first":
            - /url: /c/entradas/entrada_3
          - text: pocketbase-backend-cms-editor-first
        - cell "Publicado"
        - cell "David"
        - cell "18 jul 2026 Borrar \"PocketBase como backend de un CMS editor-first\"":
          - text: 18 jul 2026
          - button "Borrar \"PocketBase como backend de un CMS editor-first\"": Borrar
      - 'row "Notas del huerto: julio notas-del-huerto-julio Programado Marta 15 jul 2026 Borrar \"Notas del huerto: julio\""':
        - 'cell "Notas del huerto: julio notas-del-huerto-julio"':
          - 'link "Notas del huerto: julio"':
            - /url: /c/entradas/entrada_4
          - text: notas-del-huerto-julio
        - cell "Programado"
        - cell "Marta"
        - 'cell "15 jul 2026 Borrar \"Notas del huerto: julio\""':
          - text: 15 jul 2026
          - 'button "Borrar \"Notas del huerto: julio\""': Borrar
      - 'row "Passkeys en un backend Go: TOTP, WebAuthn y tres factores passkeys-backend-go-totp-webauthn Publicado David 11 jul 2026 Borrar \"Passkeys en un backend Go: TOTP, WebAuthn y tres factores\""':
        - 'cell "Passkeys en un backend Go: TOTP, WebAuthn y tres factores passkeys-backend-go-totp-webauthn"':
          - 'link "Passkeys en un backend Go: TOTP, WebAuthn y tres factores"':
            - /url: /c/entradas/entrada_5
          - text: passkeys-backend-go-totp-webauthn
        - cell "Publicado"
        - cell "David"
        - 'cell "11 jul 2026 Borrar \"Passkeys en un backend Go: TOTP, WebAuthn y tres factores\""':
          - text: 11 jul 2026
          - 'button "Borrar \"Passkeys en un backend Go: TOTP, WebAuthn y tres factores\""': Borrar
      - row "Sin título Borrador — 2 jul 2026 Borrar \"Sin título\"":
        - cell "Sin título":
          - link "Sin título":
            - /url: /c/entradas/entrada_6
        - cell "Borrador"
        - cell "—"
        - cell "2 jul 2026 Borrar \"Sin título\"":
          - text: 2 jul 2026
          - button "Borrar \"Sin título\"": Borrar
      - 'row "Reseña: teclados de perfil bajo para escribir mucho resena-teclados-perfil-bajo Publicado Marta 28 jun 2026 Borrar \"Reseña: teclados de perfil bajo para escribir mucho\""':
        - 'cell "Reseña: teclados de perfil bajo para escribir mucho resena-teclados-perfil-bajo"':
          - 'link "Reseña: teclados de perfil bajo para escribir mucho"':
            - /url: /c/entradas/entrada_7
          - text: resena-teclados-perfil-bajo
        - cell "Publicado"
        - cell "Marta"
        - 'cell "28 jun 2026 Borrar \"Reseña: teclados de perfil bajo para escribir mucho\""':
          - text: 28 jun 2026
          - 'button "Borrar \"Reseña: teclados de perfil bajo para escribir mucho\""': Borrar
      - 'row "Autoalojar sin dolor: mi checklist de higiene de servidor autoalojar-checklist-higiene-servidor Publicado David 20 jun 2026 Borrar \"Autoalojar sin dolor: mi checklist de higiene de servidor\""':
        - 'cell "Autoalojar sin dolor: mi checklist de higiene de servidor autoalojar-checklist-higiene-servidor"':
          - 'link "Autoalojar sin dolor: mi checklist de higiene de servidor"':
            - /url: /c/entradas/entrada_8
          - text: autoalojar-checklist-higiene-servidor
        - cell "Publicado"
        - cell "David"
        - 'cell "20 jun 2026 Borrar \"Autoalojar sin dolor: mi checklist de higiene de servidor\""':
          - text: 20 jun 2026
          - 'button "Borrar \"Autoalojar sin dolor: mi checklist de higiene de servidor\""': Borrar
      - row "Por qué elegimos Svelte 5 runes para el admin por-que-svelte-5-runes-admin Borrador David 14 jun 2026 Borrar \"Por qué elegimos Svelte 5 runes para el admin\"":
        - cell "Por qué elegimos Svelte 5 runes para el admin por-que-svelte-5-runes-admin":
          - link "Por qué elegimos Svelte 5 runes para el admin":
            - /url: /c/entradas/entrada_9
          - text: por-que-svelte-5-runes-admin
        - cell "Borrador"
        - cell "David"
        - cell "14 jun 2026 Borrar \"Por qué elegimos Svelte 5 runes para el admin\"":
          - text: 14 jun 2026
          - button "Borrar \"Por qué elegimos Svelte 5 runes para el admin\"": Borrar
      - 'row "Accesibilidad AA de verdad: contraste medido, no adivinado accesibilidad-aa-contraste-medido Publicado Marta 5 jun 2026 Borrar \"Accesibilidad AA de verdad: contraste medido, no adivinado\""':
        - 'cell "Accesibilidad AA de verdad: contraste medido, no adivinado accesibilidad-aa-contraste-medido"':
          - 'link "Accesibilidad AA de verdad: contraste medido, no adivinado"':
            - /url: /c/entradas/entrada_10
          - text: accesibilidad-aa-contraste-medido
        - cell "Publicado"
        - cell "Marta"
        - 'cell "5 jun 2026 Borrar \"Accesibilidad AA de verdad: contraste medido, no adivinado\""':
          - text: 5 jun 2026
          - 'button "Borrar \"Accesibilidad AA de verdad: contraste medido, no adivinado\""': Borrar
      - 'row "Diario de un rediseño: del wireframe al pixel diario-rediseno-wireframe-pixel Borrador Marta 30 may 2026 Borrar \"Diario de un rediseño: del wireframe al pixel\""':
        - 'cell "Diario de un rediseño: del wireframe al pixel diario-rediseno-wireframe-pixel"':
          - 'link "Diario de un rediseño: del wireframe al pixel"':
            - /url: /c/entradas/entrada_12
          - text: diario-rediseno-wireframe-pixel
        - cell "Borrador"
        - cell "Marta"
        - 'cell "30 may 2026 Borrar \"Diario de un rediseño: del wireframe al pixel\""':
          - text: 30 may 2026
          - 'button "Borrar \"Diario de un rediseño: del wireframe al pixel\""': Borrar
  - text: 1–12 de 12
  - button "Anterior" [disabled]
  - button "Siguiente" [disabled]
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