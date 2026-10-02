/**
 * `e2e/publish-review.spec.ts` — la revisión antes de publicar (lote 13, lámina
 * `design/mockups/2026-10-02-revision-antes-de-publicar`) de punta a punta sobre el escaparate
 * (`SHOWCASE_SEED`, `loginAsDemo(page, { seedShowcase: true })`): «Inicio» (`pagina_1`) siembra
 * avisos de los tres grupos — descripción vacía e imagen para redes ausente (SEO), un enlace
 * interno que queda «no comprobado» (en el escaparate `paginas` no declara `page`) y dos imágenes
 * sin alt: una de la biblioteca en la galería y una `<img>` del texto con formato del bloque 2.
 *
 * Lo que compra y la suite de componente no puede: que «ir al bloque» DESPLIEGA la fila plegada y
 * deja el foco en el editor TipTap real (jsdom no lo monta), y que el popover del editor visual
 * sale al publicar desde la cabecera en un documento de verdad, con el foco en «Cancelar».
 */
import type { Page } from '@playwright/test';
import { expect, loginAsDemo, test } from './fixtures';
import { createVisualSite, type VisualSiteBlock } from './visual-site';

interface VegaVisualWindow extends Window {
	__VEGA_PREVIEW_API_URL__?: string;
}

/** Eco de `SECCIONES_RECORDS` (`demo-seed.ts`), como en `visual-editor.spec.ts`. */
const SECCIONES: VisualSiteBlock[] = [
	{ id: 'seccion_1', type: 'seccion', text: 'Escribe. Publica. Olvídate del resto.' },
	{ id: 'seccion_2', type: 'seccion', text: 'Tu contenido, en tu servidor' },
	{ id: 'seccion_3', type: 'seccion', text: 'Se adapta a tu modelo' }
];

const reviewCard = (page: Page) => page.getByRole('region', { name: 'Revisión' });

test.describe('revisión antes de publicar — el formulario', () => {
	test('la tarjeta cuenta los avisos; «ir al bloque» despliega el bloque y pone el foco en su campo', async ({
		page
	}) => {
		await loginAsDemo(page, { seedShowcase: true });
		await page.goto('/c/paginas/pagina_1');

		// La tarjeta, la primera del aside, con el resumen de la carga: SEO (2) + imágenes (2); los
		// enlaces quedan «no comprobado» en el escaparate (ver cabecera).
		const card = reviewCard(page);
		await expect(card).toBeVisible();
		await expect(card.locator('.vega-review-summary')).toHaveText('4 avisos');
		await expect(card.locator('[data-review-group="links"]')).toContainText('No comprobado');
		await expect(card.locator('[data-review-group="media"]')).toContainText('2 avisos');
		// Y la línea bajo el campo Estado.
		await expect(page.locator('[data-field="status"]')).toContainText(
			'La revisión tiene 4 avisos.'
		);

		// El bloque 2 («Texto») está plegado.
		const toggle = page.locator('[aria-controls="vega-block-body-seccion_2"]');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		const body = page.locator('#vega-block-body-seccion_2');
		await expect(body).toBeHidden();

		await card.getByRole('button', { name: 'Ir a Contenido, en el bloque 2 (Texto)' }).click();

		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(body).toBeVisible();
		// El foco cae en el editor de texto con formato REAL del bloque (TipTap), no en otra fila.
		await expect(body.locator('[data-field="cuerpo"] [contenteditable="true"]')).toBeFocused();

		// En vivo: escribir la descripción quita su aviso sin guardar nada.
		await page.getByLabel('Descripción', { exact: true }).fill('Un CMS sobre tu PocketBase.');
		await expect(card.locator('.vega-review-summary')).toHaveText('3 avisos');
	});
});

test.describe('revisión antes de publicar — el editor visual', () => {
	test('«Marcar como publicada» con avisos pregunta, con el foco en Cancelar, y «Publicar igualmente» publica', async ({
		page
	}) => {
		const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks: SECCIONES });
		await site.install(page);
		await page.addInitScript((previewApiUrl) => {
			(window as unknown as VegaVisualWindow).__VEGA_PREVIEW_API_URL__ = previewApiUrl;
		}, site.previewApiUrl);
		await loginAsDemo(page, { seedShowcase: true });
		await page.goto('/c/paginas/pagina_1/visual');

		const group = page.getByRole('group', { name: 'Estado de la página' });
		await expect(group).toContainText('Borrador');
		const publish = group.getByRole('button', { name: 'Marcar como publicada', exact: true });
		await publish.click();

		const confirm = page.getByRole('alertdialog', { name: 'Antes de publicar: 4 avisos' });
		await expect(confirm).toBeVisible();
		await expect(confirm).toContainText('La descripción para buscadores está vacía');
		await expect(confirm).toContainText('Ningún aviso impide publicar.');
		await expect(
			confirm.getByRole('button', { name: 'Abrir Descripción en el formulario' })
		).toBeVisible();
		await expect(confirm.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
		await expect(group).toContainText('Borrador');

		// Esc cierra sin publicar y devuelve el foco al botón.
		await page.keyboard.press('Escape');
		await expect(confirm).toHaveCount(0);
		await expect(publish).toBeFocused();
		await expect(group).toContainText('Borrador');

		await publish.click();
		await page
			.getByRole('alertdialog', { name: 'Antes de publicar: 4 avisos' })
			.getByRole('button', { name: 'Publicar igualmente', exact: true })
			.click();
		await expect(group).toContainText('Publicada');
		await expect(page.getByText('«Inicio» pasa a «Publicada».')).toBeVisible();
	});
});
