/**
 * `SchemaAuthoringPanel.svelte` en `/settings` (lote "esquema" audit, pieza 4): el camino feliz
 * de "Añadir campos" con un campo `select` recién ofrecido — opciones (añadir/reordenar/quitar),
 * "permitir varias opciones" y el spec que sale hacia el puerto, hasta ver la migración generada.
 * El resto del panel (crear colección, campo `relation`, errores de nombre…) ya tiene cobertura de
 * componente en `SchemaAuthoringPanel.svelte.test.ts`; este es el único e2e de la pieza — sin él,
 * nada ejercitaba el flujo con el DOM/CSS real (los estilos `vega-field-select-option-*`, el
 * `aria-live` del reorden).
 *
 * Demo (`loginAsDemo` sin opciones): `capabilities.schemaBootstrap`/`schemaFieldBootstrap` en
 * `true` y la colección `posts` ya sembrada (`demo-seed.ts`), así que la tarjeta "Añadir campos"
 * monta con "posts" disponible sin más preparación.
 */
import { expect, loginAsDemo, test } from './fixtures';

async function goToSettings(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('link', { name: 'Ajustes', exact: false }).click();
	await page.waitForURL('**/settings');
	await expect(page.locator('#manifest-editor-textarea')).toBeVisible();
}

test.describe('SchemaAuthoringPanel: campo select en "Añadir campos"', () => {
	test('añade un select con dos opciones reordenadas y "permitir varias opciones"', async ({
		page
	}) => {
		await loginAsDemo(page);
		await goToSettings(page);

		const addFieldsCard = page.locator('.vega-schema-card', { hasText: 'Añadir campos' });
		await expect(addFieldsCard).toBeVisible();

		await addFieldsCard.getByLabel('Colección').selectOption('posts');

		const fieldRow = addFieldsCard.locator('.vega-field-row').first();
		// `category`, no `status`: `POSTS_CONTENT_TYPE` (`demo-seed.ts`) YA siembra `posts` con un
		// campo `status` (`select`, `draft`/`published`) — con ese nombre el panel detecta que el
		// campo ya existe y no añade nada ("Ningún campo nuevo…"), y el resto del test nunca llega
		// a comprobarse.
		await fieldRow.getByLabel('Nombre del campo').fill('category');
		await fieldRow.getByLabel('Tipo').selectOption('select');

		// Primera opción.
		const optionList = fieldRow.locator('.vega-field-select-option-list');
		// `exact: true`: sin él, `getByLabel('Opción 1')` casa por subcadena con los aria-label de
		// los botones vecinos ("Subir opción 1", "Bajar opción 1", "Quitar opción 1") y Playwright
		// lanza "strict mode violation" (4 elementos) en vez de resolver el input de valor.
		await optionList.getByLabel('Opción 1', { exact: true }).fill('draft');

		// Segunda opción, añadida con "+ Añadir opción" (dentro del subpanel del select, NO el "+
		// Añadir campo" de la fila).
		await fieldRow.locator('.vega-field-select-options .vega-schema-add-row').click();
		await optionList.getByLabel('Opción 2', { exact: true }).fill('published');

		// Sube "published" (Opción 2) a la primera posición y comprueba el anuncio por voz
		// (`aria-live`, mismo criterio de a11y que el reorden de bloques de `VisualBlockTree`).
		await fieldRow.getByRole('button', { name: 'Subir opción 2' }).click();
		// La región vive oculta a la vista (`vega-visually-hidden`, clip de 1px): se comprueba su
		// TEXTO, no `toBeVisible()` (el propio recorte de 1px hace ambigua esa aserción).
		await expect(page.locator('.vega-schema-authoring [aria-live="polite"]')).toHaveText(
			'«published» movida a la posición 1 de 2'
		);
		await expect(optionList.getByLabel('Opción 1', { exact: true })).toHaveValue('published');
		await expect(optionList.getByLabel('Opción 2', { exact: true })).toHaveValue('draft');

		await fieldRow.getByLabel('Permitir varias opciones').check();

		await addFieldsCard.getByRole('button', { name: 'Añadir campos' }).click();

		await expect(addFieldsCard.getByText('1 campo(s) añadido(s) a "posts".')).toBeVisible();
		await expect(addFieldsCard.getByText('Migración generada')).toBeVisible();
		await expect(addFieldsCard.getByText('add_fields_to_posts.js')).toBeVisible();
		// La migración lleva las opciones YA reordenadas y `maxSelect: 99` (múltiple) — confirma que
		// lo que se ve en pantalla es lo que salió hacia el puerto, no solo el estado local del
		// formulario.
		await expect(addFieldsCard.locator('pre')).toContainText('"published"');
		await expect(addFieldsCard.locator('pre')).toContainText('"maxSelect": 99');
	});

	test('opción repetida bloquea el envío con su mensaje en la fila', async ({ page }) => {
		await loginAsDemo(page);
		await goToSettings(page);

		const addFieldsCard = page.locator('.vega-schema-card', { hasText: 'Añadir campos' });
		await addFieldsCard.getByLabel('Colección').selectOption('posts');

		const fieldRow = addFieldsCard.locator('.vega-field-row').first();
		await fieldRow.getByLabel('Nombre del campo').fill('status');
		await fieldRow.getByLabel('Tipo').selectOption('select');

		const optionList = fieldRow.locator('.vega-field-select-option-list');
		await optionList.getByLabel('Opción 1', { exact: true }).fill('draft');
		await fieldRow.locator('.vega-field-select-options .vega-schema-add-row').click();
		await optionList.getByLabel('Opción 2', { exact: true }).fill(' draft '); // repite tras recortar espacios

		await expect(fieldRow.getByText('Esta opción está repetida.')).toBeVisible();
		const submit = addFieldsCard.getByRole('button', { name: 'Añadir campos' });
		await expect(submit).toBeDisabled();
	});
});
