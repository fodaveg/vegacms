/**
 * Suite del `#lote-integridad` (Fase A) contra `/media`: el panel "Se usa en" (`UsedInPanel`
 * montado en `MediaDetail.svelte`), el aviso de referencias antes de borrar
 * (`MediaDeleteConfirm.svelte`) y la confirmación de reemplazo (`MediaReplaceConfirm.svelte`) —
 * contra el adaptador `memory` sembrado con `DEMO_SEED_WITH_MEDIA`
 * (`loginAsDemo(page, { seedMedia: true })`, mismo fixture que `e2e/media.spec.ts`).
 *
 * **Solo la vía "url" tiene un escenario natural aquí**: la semilla no declara ningún campo
 * `relation` hacia `vega_media` (D-P6.1, los assets se referencian por `file`, no por relación —
 * ver cabecera de `$lib/integrity/references.ts`), así que la vía "relation" del motor se cubre
 * de forma exhaustiva en `src/lib/integrity/references.test.ts` (unit) y no se repite aquí. La
 * "relación real" que SÍ se ejercita en e2e es la del AVISO al borrar un registro de contenido
 * normal, cubierta en `e2e/delete.spec.ts` (que este lote no modifica) — la semilla tampoco trae
 * ninguna relación con valor ahí, así que ese camino queda probado a nivel unitario
 * (`delete-guard.test.ts`) y por la ausencia de regresión visible en `delete.spec.ts` (sigue en
 * verde con este lote encima, ver informe de verificación).
 *
 * `media_2` (`seed_media_photo1.png`, título "Foto de portada") es el asset elegido para los
 * escenarios "con referencias": `createPostLinkingMediaPhoto1` produce la ÚNICA referencia real
 * de la suite, un post nuevo cuyo campo `body` (widget `textarea`, texto plano) contiene el
 * nombre de fichero tal cual.
 */
import type { Locator } from '@playwright/test';
import { expect, loginAsDemo, test } from './fixtures';

// 1×1 PNG transparente real (mismo fixture que `e2e/media.spec.ts`): un buffer arbitrario con
// `mimeType: 'image/png'` no basta si algo llegara a decodificarlo de verdad.
const TINY_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function loginWithMedia(page: import('@playwright/test').Page): Promise<void> {
	await loginAsDemo(page, { seedMedia: true });
	await page.waitForURL('**/c/site_info/new');
}

async function goToMedia(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('link', { name: 'Medios', exact: false }).click();
	await page.waitForURL('**/media');
}

/** Crea un post cuyo `body` contiene la `FileRef` de `media_2` (`seed_media_photo1.png`) — la
 *  única forma de producir una referencia REAL sin tocar la semilla global (que a propósito no
 *  trae ninguna, ver `demo-seed.ts`). Deja al navegador en la edición del post recién creado. */
async function createPostLinkingMediaPhoto1(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/c/posts/new');
	await page.getByLabel('Title').fill('Post con imagen enlazada');
	await page.getByLabel('Body').fill('Mira esta imagen: seed_media_photo1.png');
	await page.getByRole('button', { name: 'Guardar' }).click();
	await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
}

async function openMediaDetail(
	page: import('@playwright/test').Page,
	mediaItemId: string
): Promise<Locator> {
	await page.locator(`[data-media-item="${mediaItemId}"]`).click();
	const dialog = page.getByRole('dialog', { name: 'Editar medio' });
	await expect(dialog).toBeVisible();
	return dialog;
}

test.describe('"Se usa en" (UsedInPanel, vía url)', () => {
	test('carga a demanda: colapsado al abrir, nada de red hasta expandir', async ({ page }) => {
		await loginWithMedia(page);
		await goToMedia(page);
		const dialog = await openMediaDetail(page, 'media_1');

		const toggle = dialog.getByRole('button', { name: 'Se usa en' });
		await expect(toggle).toBeVisible();
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(dialog.getByText('Comprobando dónde se usa…')).toHaveCount(0);
	});

	test('asset sin referencias: "Nadie le apunta todavía."', async ({ page }) => {
		await loginWithMedia(page);
		await goToMedia(page);
		const dialog = await openMediaDetail(page, 'media_1');

		await dialog.getByRole('button', { name: 'Se usa en' }).click();
		await expect(dialog.getByText('Nadie le apunta todavía.')).toBeVisible();
	});

	test('un post con la URL del fichero en su texto: aparece listado, con enlace de navegación real', async ({
		page
	}) => {
		await loginWithMedia(page);
		await createPostLinkingMediaPhoto1(page);
		await goToMedia(page);
		const dialog = await openMediaDetail(page, 'media_2');

		await dialog.getByRole('button', { name: 'Se usa en' }).click();
		await expect(dialog.getByText('1 registro(s)')).toBeVisible();

		const link = dialog.getByRole('link', { name: 'Post con imagen enlazada' });
		await expect(link).toBeVisible();
		await link.click();

		// Misma afordancia de navegación que el listado (`recordRoute`): aterriza en la edición
		// REAL del post encontrado, no en un enlace decorativo.
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		await expect(page.getByLabel('Title')).toHaveValue('Post con imagen enlazada');
	});
});

test.describe('aviso de referencias antes de borrar (MediaDeleteConfirm)', () => {
	test('asset SIN referencias: "Borrar" funciona igual que siempre, sin fricción nueva', async ({
		page
	}) => {
		await loginWithMedia(page);
		await goToMedia(page);
		const detail = await openMediaDetail(page, 'media_1');

		await detail.getByRole('button', { name: 'Borrar', exact: true }).click();
		const confirm = page.getByRole('alertdialog');
		await expect(confirm).toBeVisible();
		// Sin referencias: nunca aparece el bloque de aviso ni el checkbox adicional.
		await expect(confirm.getByRole('checkbox')).toHaveCount(0);

		await confirm.getByRole('button', { name: 'Borrar', exact: true }).click();
		await expect(confirm).toBeHidden();
		await expect(page.getByText('se ha borrado de la biblioteca.')).toBeVisible();
	});

	test('asset CON referencias: exige el checkbox antes de habilitar "Borrar"', async ({ page }) => {
		await loginWithMedia(page);
		await createPostLinkingMediaPhoto1(page);
		await goToMedia(page);
		const detail = await openMediaDetail(page, 'media_2');

		await detail.getByRole('button', { name: 'Borrar', exact: true }).click();
		const confirm = page.getByRole('alertdialog');
		await expect(confirm).toBeVisible();
		await expect(
			confirm.getByText('Hay referencias activas hacia esto. Bórralo con conocimiento de causa:')
		).toBeVisible();
		await expect(confirm.getByRole('link', { name: 'Post con imagen enlazada' })).toBeVisible();

		const confirmButton = confirm.getByRole('button', { name: 'Borrar', exact: true });
		await expect(confirmButton).toHaveAttribute('aria-disabled', 'true');

		// No bloquea de forma permanente: un solo click más (el checkbox) basta.
		await confirm.getByRole('checkbox').check();
		await expect(confirmButton).toHaveAttribute('aria-disabled', 'false');

		await confirmButton.click();
		await expect(confirm).toBeHidden();
		await expect(page.getByText('"Foto de portada" se ha borrado de la biblioteca.')).toBeVisible();
	});
});

test.describe('reemplazar el fichero (MediaReplaceConfirm)', () => {
	test('confirmación: conserva identidad, avisa del cambio de URL y muestra quién usaba la vieja', async ({
		page
	}) => {
		await loginWithMedia(page);
		await createPostLinkingMediaPhoto1(page);
		await goToMedia(page);
		const detail = await openMediaDetail(page, 'media_2');

		await detail.getByLabel('Reemplazar fichero').setInputFiles({
			name: 'nueva-foto.png',
			mimeType: 'image/png',
			buffer: Buffer.from(TINY_PNG_BASE64, 'base64')
		});

		const confirm = page.getByRole('alertdialog');
		await expect(confirm).toBeVisible();
		await expect(confirm).toContainText('nueva-foto.png');
		await expect(
			confirm.getByText(
				'El registro conserva su id y sus metadatos (alt, título, etiquetas): cualquier referencia por relación sigue siendo válida.'
			)
		).toBeVisible();
		await expect(
			confirm.getByText(
				'La URL directa del fichero VA A CAMBIAR: quien la tuviera pegada a mano dejará de verla.'
			)
		).toBeVisible();
		// `autoLoad`: ya expandido y cargado, sin toggle de por medio — la persona confirmando ve
		// DE ENTRADA quién usaba la URL vieja.
		await expect(confirm.getByRole('link', { name: 'Post con imagen enlazada' })).toBeVisible();

		await confirm.getByRole('button', { name: 'Reemplazar', exact: true }).click();
		await expect(confirm).toBeHidden();
		await expect(page.getByText('Fichero reemplazado. La URL directa ha cambiado.')).toBeVisible();
		await expect(detail).toBeHidden();
	});

	test('cancelar no sube nada: el diálogo se cierra y el asset sigue igual', async ({ page }) => {
		await loginWithMedia(page);
		await goToMedia(page);
		const detail = await openMediaDetail(page, 'media_1');

		await detail.getByLabel('Reemplazar fichero').setInputFiles({
			name: 'otra.png',
			mimeType: 'image/png',
			buffer: Buffer.from(TINY_PNG_BASE64, 'base64')
		});
		const confirm = page.getByRole('alertdialog');
		await expect(confirm).toBeVisible();
		await confirm.getByRole('button', { name: 'Cancelar' }).click();

		await expect(confirm).toBeHidden();
		await expect(detail).toBeVisible();
	});

	test('fichero de tipo no admitido: rechazo inline, NUNCA abre la confirmación', async ({
		page
	}) => {
		await loginWithMedia(page);
		await goToMedia(page);
		const detail = await openMediaDetail(page, 'media_1');

		await detail.getByLabel('Reemplazar fichero').setInputFiles({
			name: 'notas.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('hola')
		});

		await expect(detail.getByText('El fichero elegido no es de un tipo admitido.')).toBeVisible();
		await expect(page.getByRole('alertdialog')).toHaveCount(0);
	});
});
