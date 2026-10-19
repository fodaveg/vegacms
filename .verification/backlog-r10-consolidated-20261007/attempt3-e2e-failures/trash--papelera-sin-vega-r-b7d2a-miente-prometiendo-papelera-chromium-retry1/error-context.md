# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: trash.spec.ts >> /papelera sin vega_revisions bootstrapeada >> mensaje honesto ("no está activada") y CTA a Ajustes, nunca miente prometiendo papelera
- Location: e2e/trash.spec.ts:40:2

# Error details

```
Error: locator.click: Error: strict mode violation: getByRole('link', { name: 'Papelera' }) resolved to 2 elements:
    1) <a href="/papelera" class="svelte-szqtvg">…</a> aka getByRole('link', { name: 'Papelera', exact: true })
    2) <a class="svelte-60vfbw" href="/settings#vega-revisions-settings-title">Preparar historial y papelera</a> aka getByRole('link', { name: 'Preparar historial y papelera' })

Call log:
  - waiting for getByRole('link', { name: 'Papelera' })

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - link "Inicio" [ref=e5] [cursor=pointer]:
        - /url: /
        - img [ref=e6]
        - generic [ref=e15]: Vega
        - generic [ref=e16]: Vega Demo
      - generic [ref=e18]:
        - img [ref=e19]
        - combobox "Búsqueda global" [ref=e22]
        - generic [ref=e23]: /
      - generic [ref=e24]:
        - generic [ref=e27]: Conectado
        - button "Plegar la barra lateral" [expanded] [ref=e28] [cursor=pointer]:
          - img [ref=e29]
        - button "Menú de cuenta" [ref=e31] [cursor=pointer]:
          - img "Sesión de demo@vega.dev" [ref=e32]: D
          - img [ref=e33]
        - button "Cerrar sesión" [ref=e35] [cursor=pointer]:
          - img [ref=e36]
    - generic [ref=e39]:
      - navigation "Navegación principal" [ref=e40]:
        - list [ref=e42]:
          - listitem [ref=e43]:
            - link "Información del sitio" [ref=e44] [cursor=pointer]:
              - /url: /c/site_info
              - img [ref=e45]
              - generic "Información del sitio" [ref=e48]
        - generic [ref=e49]:
          - paragraph [ref=e50]: Contenido
          - list [ref=e51]:
            - listitem [ref=e52]:
              - link "Entradas 32" [ref=e53] [cursor=pointer]:
                - /url: /c/posts
                - img [ref=e54]
                - generic "Entradas" [ref=e56]
                - generic [ref=e58]: "32"
            - listitem [ref=e59]:
              - link "Páginas Solo lectura 0" [ref=e60] [cursor=pointer]:
                - /url: /c/pages
                - img [ref=e61]
                - generic "Páginas" [ref=e64]
                - generic [ref=e65]:
                  - generic [ref=e67]: Solo lectura
                  - generic [ref=e68]: "0"
            - listitem [ref=e69]:
              - link "Autores 0" [ref=e70] [cursor=pointer]:
                - /url: /c/authors
                - img [ref=e71]
                - generic "Autores" [ref=e74]
                - generic [ref=e76]: "0"
            - listitem [ref=e77]:
              - link "Métricas 1" [ref=e78] [cursor=pointer]:
                - /url: /c/metrics
                - img [ref=e79]
                - generic "Métricas" [ref=e80]
                - generic [ref=e82]: "1"
            - listitem [ref=e83]:
              - link "Obras 2" [ref=e84] [cursor=pointer]:
                - /url: /c/works
                - img [ref=e85]
                - generic "Obras" [ref=e87]
                - generic [ref=e89]: "2"
            - listitem [ref=e90]:
              - link "Pistas 2" [ref=e91] [cursor=pointer]:
                - /url: /c/tracks
                - img [ref=e92]
                - generic "Pistas" [ref=e94]
                - generic [ref=e96]: "2"
            - listitem [ref=e97]:
              - link "Catálogo Solo lectura" [ref=e98] [cursor=pointer]:
                - /url: /v/catalogo
                - img [ref=e99]
                - generic "Catálogo" [ref=e100]
                - generic [ref=e103]: Solo lectura
            - listitem [ref=e104]:
              - link "Blog 12" [ref=e105] [cursor=pointer]:
                - /url: /c/blog
                - img [ref=e106]
                - generic "Blog" [ref=e109]
                - generic [ref=e111]: "12"
            - listitem [ref=e112]:
              - link "Avisos 1" [ref=e113] [cursor=pointer]:
                - /url: /c/avisos
                - img [ref=e114]
                - generic "Avisos" [ref=e117]
                - generic [ref=e119]: "1"
        - list [ref=e120]:
          - listitem [ref=e121]:
            - link "Medios" [ref=e122] [cursor=pointer]:
              - /url: /media
              - img [ref=e123]
              - generic [ref=e127]: Medios
          - listitem [ref=e128]:
            - link "Papelera" [ref=e129] [cursor=pointer]:
              - /url: /papelera
              - img [ref=e130]
              - generic [ref=e133]: Papelera
          - listitem [ref=e134]:
            - link "Editores" [ref=e135] [cursor=pointer]:
              - /url: /editores
              - img [ref=e136]
              - generic [ref=e139]: Editores
          - listitem [ref=e140]:
            - link "Copias" [ref=e141] [cursor=pointer]:
              - /url: /copias
              - img [ref=e142]
              - generic [ref=e145]: Copias
          - listitem [ref=e146]:
            - link "Ajustes 1 avisos" [ref=e147] [cursor=pointer]:
              - /url: /settings
              - img [ref=e148]
              - generic [ref=e151]: Ajustes
              - generic "1 avisos" [ref=e152]: "1"
      - main [ref=e153]:
        - generic [ref=e154]:
          - heading "Inicio" [level=1] [ref=e156]
          - region "Crear" [ref=e157]:
            - heading "Crear" [level=2] [ref=e158]
            - generic [ref=e159]:
              - 'button "Nuevo: Entrada" [ref=e160] [cursor=pointer]':
                - img [ref=e161]
                - text: Entrada
              - 'button "Nuevo: Autor" [ref=e162] [cursor=pointer]':
                - img [ref=e163]
                - text: Autor
              - 'button "Nuevo: Métrica" [ref=e164] [cursor=pointer]':
                - img [ref=e165]
                - text: Métrica
              - 'button "Nuevo: Obra" [ref=e166] [cursor=pointer]':
                - img [ref=e167]
                - text: Obra
              - 'button "Nuevo: Pista" [ref=e168] [cursor=pointer]':
                - img [ref=e169]
                - text: Pista
              - 'button "Nuevo: Entrada de blog" [ref=e170] [cursor=pointer]':
                - img [ref=e171]
                - text: Entrada de blog
          - region "Guarda versiones anteriores y recupera registros borrados" [ref=e172]:
            - heading "Guarda versiones anteriores y recupera registros borrados" [level=2] [ref=e173]
            - paragraph [ref=e174]: Prepara el historial y la papelera para este sitio. Podrás consultar versiones anteriores de tu contenido.
            - paragraph [ref=e175]: Los archivos adjuntos y los enlaces que se eliminan al borrar no se recuperan.
            - paragraph [ref=e176]: En esta demo, los cambios se conservan durante esta sesión.
            - generic [ref=e177]:
              - link "Preparar historial y papelera" [ref=e178] [cursor=pointer]:
                - /url: /settings#vega-revisions-settings-title
              - button "Ahora no" [ref=e179] [cursor=pointer]
            - paragraph [ref=e180]: El descarte se guarda en este navegador si su almacenamiento está disponible.
          - region "Pendientes" [ref=e181]:
            - heading "Pendientes" [level=2] [ref=e182]
            - list [ref=e183]:
              - listitem [ref=e184]:
                - link "16 Entradas en borrador" [ref=e185] [cursor=pointer]:
                  - /url: /c/posts?status=draft
                  - generic [ref=e186]: "16"
                  - generic [ref=e187]: Entradas en borrador
              - listitem [ref=e188]:
                - link "4 Blog en borrador" [ref=e189] [cursor=pointer]:
                  - /url: /c/blog?status=draft
                  - generic [ref=e190]: "4"
                  - generic [ref=e191]: Blog en borrador
          - region "Lo último que editaste" [ref=e192]:
            - heading "Lo último que editaste" [level=2] [ref=e193]
            - generic [ref=e195]:
              - img [ref=e197]
              - heading "Todavía no has editado nada" [level=3] [ref=e200]
              - paragraph [ref=e201]: Lo que edites en este navegador aparecerá aquí para que puedas retomarlo.
  - generic [ref=e202]: Vega — Acceder a Vega
```

# Test source

```ts
  1   | /**
  2   |  * Suite de la papelera (`#lote-integridad`, Fase B2): bootstrap → borrar → `/papelera` →
  3   |  * restaurar (el registro vuelve con su id, los ficheros adjuntos NO) → borrar definitivamente →
  4   |  * vaciar papelera. Contra el adaptador `memory` (`DEMO_SEED`, ver `session/demo-seed.ts`).
  5   |  *
  6   |  * `post_1` ("Bienvenido a Vega") trae `sourceFile` sembrado (`file`, readonly a nivel de schema,
  7   |  * `seed_archive_notes.txt` — ver `e2e/form.spec.ts`): es el fixture que ejercita "los ficheros
  8   |  * adjuntos no se recuperan" de punta a punta, sin inventar datos nuevos.
  9   |  */
  10  | import { expect, loginAsDemo, test, waitForHome } from './fixtures';
  11  | 
  12  | async function loginAndSettle(page: import('@playwright/test').Page): Promise<void> {
  13  | 	await loginAsDemo(page);
  14  | 	await waitForHome(page);
  15  | }
  16  | 
  17  | async function goToSettings(page: import('@playwright/test').Page): Promise<void> {
  18  | 	await page.getByRole('link', { name: 'Ajustes', exact: false }).click();
  19  | 	await page.waitForURL('**/settings');
  20  | 	await expect(page.locator('#manifest-editor-textarea')).toBeVisible();
  21  | }
  22  | 
  23  | /** Bootstrapea `vega_revisions` desde el gate de confirmación inline de "Historial y papelera"
  24  |  *  (mismo helper que `e2e/revisions.spec.ts`). */
  25  | async function enableRevisions(page: import('@playwright/test').Page): Promise<void> {
  26  | 	await goToSettings(page);
  27  | 	const section = page.getByRole('region', { name: 'Historial y papelera' });
  28  | 	await expect(section).toBeVisible();
  29  | 	await section.getByRole('button', { name: 'Crear colección de historial' }).click();
  30  | 	await section.getByRole('button', { name: 'Crear colección', exact: true }).click();
  31  | 	await expect(section.getByText('0 versión(es) guardadas ahora mismo.')).toBeVisible();
  32  | }
  33  | 
  34  | async function goToTrash(page: import('@playwright/test').Page): Promise<void> {
> 35  | 	await page.getByRole('link', { name: 'Papelera', exact: false }).click();
      |                                                                   ^ Error: locator.click: Error: strict mode violation: getByRole('link', { name: 'Papelera' }) resolved to 2 elements:
  36  | 	await page.waitForURL('**/papelera');
  37  | }
  38  | 
  39  | test.describe('/papelera sin vega_revisions bootstrapeada', () => {
  40  | 	test('mensaje honesto ("no está activada") y CTA a Ajustes, nunca miente prometiendo papelera', async ({
  41  | 		page
  42  | 	}) => {
  43  | 		await loginAndSettle(page);
  44  | 		await goToTrash(page);
  45  | 
  46  | 		await expect(page.getByText('La papelera no está activada en este proyecto.')).toBeVisible();
  47  | 		await page.getByRole('button', { name: 'Ir a Ajustes' }).click();
  48  | 		await page.waitForURL('**/settings');
  49  | 	});
  50  | });
  51  | 
  52  | test.describe('borrar → papelera → restaurar (§8·B2, promesa central del lote)', () => {
  53  | 	test('el registro vuelve con su id; los ficheros adjuntos NO se restauran', async ({ page }) => {
  54  | 		await loginAndSettle(page);
  55  | 		await enableRevisions(page);
  56  | 
  57  | 		// Vuelve a `posts` por SPA (nunca `page.goto` tras mutar: recargaría el adaptador `memory`,
  58  | 		// ver la cabecera de `session/backend.ts`) y abre "Bienvenido a Vega" (post_1).
  59  | 		await page.getByRole('link', { name: 'Entradas', exact: false }).click();
  60  | 		await page.waitForURL('**/c/posts');
  61  | 		await page.getByRole('link', { name: 'Bienvenido a Vega' }).click();
  62  | 		await page.waitForURL(/\/c\/posts\/post_1$/);
  63  | 
  64  | 		const sourceFileField = page.locator('[data-field="sourceFile"]');
  65  | 		await expect(sourceFileField.locator('.vega-file-chip')).toContainText(
  66  | 			'seed_archive_notes.txt'
  67  | 		);
  68  | 
  69  | 		// Borrado desde la zona de peligro del editor (no desde la fila del listado): mismo diálogo
  70  | 		// `DeleteConfirm`, con la promesa de la papelera (§4/§10.3) en su única frase.
  71  | 		await page.getByRole('button', { name: 'Borrar Entrada…' }).click();
  72  | 		const dialog = page.getByRole('alertdialog');
  73  | 		await expect(dialog).toBeVisible();
  74  | 		await expect(dialog).toContainText('podrás recuperarla durante 30 día(s)');
  75  | 		await expect(dialog).toContainText('Los archivos adjuntos no se recuperan');
  76  | 
  77  | 		await dialog.getByRole('button', { name: 'Borrar', exact: true }).click();
  78  | 		await expect(dialog).toBeHidden();
  79  | 		await page.waitForURL('**/c/posts');
  80  | 
  81  | 		await goToTrash(page);
  82  | 		const item = page.locator('.vega-trash-item', { hasText: 'Bienvenido a Vega' });
  83  | 		await expect(item).toBeVisible();
  84  | 		await expect(item).toContainText('Tipo: posts');
  85  | 		await expect(item).toContainText('Tenía archivos adjuntos: no se restaurarán.');
  86  | 
  87  | 		await item.getByRole('button', { name: 'Restaurar' }).click();
  88  | 		await expect(page.getByText('"Bienvenido a Vega" se ha restaurado.')).toBeVisible();
  89  | 		// La entrada de papelera desaparece: ya no es "un borrado", es un registro vivo de nuevo.
  90  | 		await expect(page.getByText('La papelera está vacía.')).toBeVisible();
  91  | 
  92  | 		// De vuelta a `posts` por SPA: el registro restaurado vive en la MISMA ruta (`post_1`,
  93  | 		// mismo id) — si hubiera vuelto con un id nuevo, esta navegación por título no encontraría
  94  | 		// nada en `/c/posts/post_1` y el resto de la aserción fallaría.
  95  | 		await page.getByRole('link', { name: 'Entradas', exact: false }).click();
  96  | 		await page.waitForURL('**/c/posts');
  97  | 		await page.getByRole('link', { name: 'Bienvenido a Vega' }).click();
  98  | 		await page.waitForURL(/\/c\/posts\/post_1$/);
  99  | 
  100 | 		// El resto del contenido volvió (pre-imagen ANTES del borrado): título y cuerpo intactos.
  101 | 		await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue(
  102 | 			'Bienvenido a Vega'
  103 | 		);
  104 | 		await expect(page.getByLabel('Body')).toHaveValue('Primer texto de ejemplo.');
  105 | 
  106 | 		// El fichero NO volvió (§0.3/§8·B2, medido: PB destruye el binario al instante, restaurar
  107 | 		// con el mismo id no lo resucita) — el chip ya no está, el campo queda vacío.
  108 | 		await expect(page.locator('[data-field="sourceFile"] .vega-file-chip')).toHaveCount(0);
  109 | 	});
  110 | });
  111 | 
  112 | test.describe('un asset con "file" obligatorio en la papelera (fix de code-review: "Restaurar" no puede prometer lo que no cumple)', () => {
  113 | 	test('vega_media (D-P6.1: file required) aparece con "Restaurar" deshabilitado y el motivo dicho', async ({
  114 | 		page
  115 | 	}) => {
  116 | 		await loginAsDemo(page, { seedMedia: true });
  117 | 		await waitForHome(page);
  118 | 		await enableRevisions(page);
  119 | 
  120 | 		await page.getByRole('link', { name: 'Medios', exact: false }).click();
  121 | 		await page.waitForURL('**/media');
  122 | 		await page.locator('[data-media-item="media_1"]').click();
  123 | 		const detail = page.getByRole('dialog', { name: 'Editar medio' });
  124 | 		await expect(detail).toBeVisible();
  125 | 		await detail.getByRole('button', { name: 'Borrar', exact: true }).click();
  126 | 		const confirmDialog = page.getByRole('alertdialog');
  127 | 		await confirmDialog.getByRole('button', { name: 'Borrar', exact: true }).click();
  128 | 		await expect(confirmDialog).toBeHidden();
  129 | 
  130 | 		await goToTrash(page);
  131 | 		const item = page.locator('.vega-trash-item', { hasText: 'Manual de usuario' });
  132 | 		await expect(item).toBeVisible();
  133 | 		await expect(item).toContainText('Tipo: vega_media');
  134 | 
  135 | 		// `requiredFileFieldName` deriva el bloqueo del ESQUEMA (`file` es `required` en
```