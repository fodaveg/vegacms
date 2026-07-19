/**
 * Smoke e2e de humo (P8·F4, tarea `[P8c]` — red mínima anti-regresión del empaquetado).
 *
 * A diferencia de `form.spec.ts` (exhaustivo: cada widget, cada caso límite de validación y
 * persistencia), esta suite recorre UNA sola vez el camino feliz COMPLETO de punta a punta, tal
 * como lo haría un usuario recién llegado: **login demo → navegar a un tipo → crear un registro →
 * guardar → editarlo → guardar → comprobar que persistió**. Es la señal de "¿la app arranca y el
 * flujo básico funciona?" que vale la pena tener verde justo antes de distribuir un build (P8) o
 * de montar Vega en un proyecto real.
 *
 * ## Reglas de robustez (por qué está escrito así)
 *
 * - **Todo por rol/label, NUNCA por selector de markup** (clase CSS, estructura, `nth`): el
 *   rediseño C2 (lotes 1-3) reescribió el markup del shell, el listado y el editor sin tocar los
 *   nombres accesibles (link "Entradas", botón "Crear «Entrada»"/"Guardar", campo "Title"). Un
 *   smoke atado al markup se rompería en cada iteración visual; atado a roles/labels sobrevive.
 * - **Navegación por CLICS de UI, no `page.goto(...)`**: el objetivo es ejercitar el shell real
 *   (sidebar → listado → CTA → editor), no saltar directo a una ruta profunda. Un `goto` se
 *   saltaría justo lo que este humo debe cubrir.
 * - **Persistencia comprobada por una vía DISTINTA a la del guardado**: tras editar, se vuelve al
 *   listado y se relee el registro (buscándolo por su título único). Igual que en `form.spec.ts`,
 *   el adaptador `memory` NO sobrevive a una carga de documento, así que "persiste" aquí significa
 *   releer por navegación SPA (clic de enlace), nunca `page.reload()`.
 * - **Título único que la semilla no contiene** (`SMOKE_TITLE`): garantiza que el buscador del
 *   listado (filtra por título, D-P4.3) devuelva EXACTAMENTE una fila, sin depender del orden ni
 *   de en qué página de la paginación (posts trae 32 registros seed) cae el registro nuevo.
 */
import { expect, loginAsDemo, test } from './fixtures';

const SMOKE_TITLE = 'Humo E2E · registro nuevo';
const SMOKE_TITLE_EDITED = 'Humo E2E · registro nuevo (editado)';
/** Subcadena común a ambos títulos, ausente en la semilla: filtra el listado a esta única fila. */
const SMOKE_SEARCH = 'Humo E2E';

test.describe('smoke: login → crear → editar → guardar → persiste', () => {
	test('el flujo completo de contenido funciona de punta a punta', async ({ page }) => {
		// 1) Login demo: deja el shell autenticado (aterriza en el singleton `site_info`, §3.3).
		await loginAsDemo(page);

		// 2) Navegar a un tipo desde la sidebar (link real, R5 del rediseño).
		await page.getByRole('link', { name: 'Entradas' }).click();
		await page.waitForURL('**/c/posts');

		// 3) Crear: CTA primaria del listado (R2, "Crear «Entrada»") → formulario de creación.
		await page.getByRole('button', { name: 'Crear «Entrada»' }).click();
		await page.waitForURL('**/c/posts/new');
		await expect(page.getByRole('heading', { name: 'Crear «Entrada»' })).toBeVisible();

		// 4) Rellenar el único campo requerido (`title`) y guardar.
		await page.getByLabel('Title').fill(SMOKE_TITLE);
		await page.getByRole('button', { name: 'Guardar' }).click();

		// Tras crear → edición del registro recién creado (D-P5.11), no al listado.
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		await expect(page.getByRole('heading', { name: 'Editar «Entrada»' })).toBeVisible();
		await expect(page.getByLabel('Title')).toHaveValue(SMOKE_TITLE);

		// 5) Editar el registro ya existente y volver a guardar. A diferencia de la creación (paso 4),
		// aquí la URL NO cambia, así que `waitForURL` no puede sincronizar con el fin del guardado:
		// hay que esperar el toast "Guardado." (que `RecordForm` emite tras resolver `onSubmit` y
		// bajar `dirty` a false) ANTES de navegar en el paso 6 — si no, el guard `beforeNavigate`
		// podría ver `dirty` aún true y abrir un `confirm()` que Playwright auto-descarta, cancelando
		// la navegación. `.last()`: el toast "Guardado." del paso 4 (create) sigue apilado (auto-
		// descarte a 4s), como en `form.spec.ts` para el caso create+update.
		await page.getByLabel('Title').fill(SMOKE_TITLE_EDITED);
		await page.getByRole('button', { name: 'Guardar' }).click();
		await expect(page.getByText('Guardado.').last()).toBeVisible();
		await expect(page.getByLabel('Title')).toHaveValue(SMOKE_TITLE_EDITED);

		// 6) Persistencia por una vía DISTINTA al guardado: volver al listado (sidebar), filtrar por
		// el título único y reabrir la fila — el valor releído debe ser el editado.
		await page.getByRole('link', { name: 'Entradas' }).click();
		await page.waitForURL('**/c/posts');
		await page.getByLabel('Buscar en el listado').fill(SMOKE_SEARCH);
		await page.getByRole('link', { name: SMOKE_TITLE_EDITED }).click();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		await expect(page.getByLabel('Title')).toHaveValue(SMOKE_TITLE_EDITED);
	});
});
