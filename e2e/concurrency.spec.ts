/**
 * Edición concurrente (lote del 24 sep 2026, lámina del audit p1): dos escrituras sobre el MISMO
 * registro contra el adaptador `memory`. El segundo escritor lo pone el gancho
 * `window.__VEGA_CONCURRENT_WRITE__` (`session/backend.ts`): la próxima `update` con versión
 * esperada escribe antes `data` como lo haría otra persona, y la del usuario llega desfasada.
 *
 * Cubre, sobre `posts/post_1` (`title` + `body`, los mismos campos que `form.spec.ts`):
 *   - el guardado falla cerrado: aviso en línea, nada se pisa, el formulario conserva lo tuyo;
 *   - «Ver diferencias» enseña el diff a tres bandas con su etiqueta de alcance;
 *   - «Guardar igualmente» envía SOLO lo tocado: lo que cambió el otro (y tú no) sobrevive;
 *   - «Descartar mis cambios y recargar» deja el formulario en la versión del servidor;
 *   - si los dos tocasteis el mismo campo, la fila lo dice.
 *
 * Los botones se buscan con `exact: true`: «Guardar» y «Guardar igualmente» conviven mientras el
 * aviso está abierto, y el nombre accesible sin `exact` casa por subcadena.
 */
import type { Page } from '@playwright/test';
import { expect, loginAsDemo, test } from './fixtures';

const NOTICE_TITLE = '«Bienvenido a Vega» ha cambiado mientras lo editabas';

async function openPost(page: Page): Promise<void> {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
	await page.goto('/c/posts/post_1');
	await expect(page.getByLabel('Title')).toHaveValue('Bienvenido a Vega');
}

/** Arma la escritura de "otra persona" que caerá justo antes del próximo guardado. */
async function armConcurrentWrite(page: Page, data: Record<string, unknown>): Promise<void> {
	await page.evaluate((payload) => {
		(
			window as unknown as { __VEGA_CONCURRENT_WRITE__?: { data: Record<string, unknown> } }
		).__VEGA_CONCURRENT_WRITE__ = { data: payload };
	}, data);
}

function notice(page: Page) {
	return page.getByRole('alert').filter({ hasText: NOTICE_TITLE });
}

test.describe('edición concurrente (aviso de conflicto)', () => {
	test('el guardado falla cerrado, enseña el diff y «Guardar igualmente» conserva lo del otro', async ({
		page
	}) => {
		await openPost(page);
		await armConcurrentWrite(page, { title: 'Título de Ana' });

		await page.getByLabel('Body').fill('Mi cuerpo nuevo');
		await page.getByRole('button', { name: 'Guardar', exact: true }).click();

		// Falló cerrado: el aviso sale en línea, no hay toast de guardado y lo tuyo sigue ahí.
		await expect(notice(page)).toBeVisible();
		await expect(page.getByText('cambió en el servidor')).toBeVisible();
		await expect(page.getByText('Guardado.')).toHaveCount(0);
		await expect(page.getByLabel('Body')).toHaveValue('Mi cuerpo nuevo');
		await expect(page.getByLabel('Title')).toHaveValue('Bienvenido a Vega');

		await notice(page).getByRole('button', { name: 'Ver diferencias', exact: true }).click();
		const rows = notice(page).getByRole('listitem');
		await expect(rows.filter({ hasText: 'Solo cambió en el servidor' })).toContainText(
			'Título de Ana'
		);
		await expect(rows.filter({ hasText: 'Solo tú' })).toContainText('Mi cuerpo nuevo');

		await notice(page).getByRole('button', { name: 'Guardar igualmente', exact: true }).click();
		await expect(page.getByText('Guardado.')).toBeVisible();
		await expect(notice(page)).toHaveCount(0);
		// Solo se envió `body`: el título de Ana sobrevive, y el formulario ya enseña lo guardado.
		await expect(page.getByLabel('Title')).toHaveValue('Título de Ana');
		await expect(page.getByLabel('Body')).toHaveValue('Mi cuerpo nuevo');
	});

	test('«Descartar mis cambios y recargar» deja el formulario en la versión del servidor', async ({
		page
	}) => {
		await openPost(page);
		await armConcurrentWrite(page, { title: 'Título de Ana' });

		await page.getByLabel('Body').fill('Esto se va a descartar');
		await page.getByRole('button', { name: 'Guardar', exact: true }).click();
		await expect(notice(page)).toBeVisible();

		await notice(page)
			.getByRole('button', { name: 'Descartar mis cambios y recargar', exact: true })
			.click();
		await expect(notice(page)).toHaveCount(0);
		await expect(page.getByLabel('Title')).toHaveValue('Título de Ana');
		await expect(page.getByLabel('Body')).toHaveValue('Primer texto de ejemplo.');
	});

	test('si los dos tocasteis el mismo campo, la fila dice «Lo cambiasteis los dos»', async ({
		page
	}) => {
		await openPost(page);
		await armConcurrentWrite(page, { title: 'Título de Ana' });

		await page.getByLabel('Title').fill('Mi título');
		await page.getByRole('button', { name: 'Guardar', exact: true }).click();
		// El nombre del aviso sigue siendo el de la versión que se abrió: es la que se está editando.
		await expect(notice(page)).toBeVisible();

		await notice(page).getByRole('button', { name: 'Ver diferencias', exact: true }).click();
		const both = notice(page).getByRole('listitem').filter({ hasText: 'Lo cambiasteis los dos' });
		await expect(both).toContainText('Título de Ana');
		await expect(both).toContainText('Mi título');
	});
});
