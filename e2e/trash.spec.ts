/**
 * Suite de la papelera (`#lote-integridad`, Fase B2): bootstrap → borrar → `/papelera` →
 * restaurar (el registro vuelve con su id, los ficheros adjuntos NO) → borrar definitivamente →
 * vaciar papelera. Contra el adaptador `memory` (`DEMO_SEED`, ver `session/demo-seed.ts`).
 *
 * `post_1` ("Bienvenido a Vega") trae `sourceFile` sembrado (`file`, readonly a nivel de schema,
 * `seed_archive_notes.txt` — ver `e2e/form.spec.ts`): es el fixture que ejercita "los ficheros
 * adjuntos no se recuperan" de punta a punta, sin inventar datos nuevos.
 */
import { expect, loginAsDemo, test } from './fixtures';

async function loginAndSettle(page: import('@playwright/test').Page): Promise<void> {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
}

async function goToSettings(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('link', { name: 'Ajustes', exact: false }).click();
	await page.waitForURL('**/settings');
	await expect(page.locator('#manifest-editor-textarea')).toBeVisible();
}

/** Bootstrapea `vega_revisions` desde el gate de confirmación inline de "Historial y papelera"
 *  (mismo helper que `e2e/revisions.spec.ts`). */
async function enableRevisions(page: import('@playwright/test').Page): Promise<void> {
	await goToSettings(page);
	const section = page.getByRole('region', { name: 'Historial y papelera' });
	await expect(section).toBeVisible();
	await section.getByRole('button', { name: 'Crear colección de historial' }).click();
	await section.getByRole('button', { name: 'Crear colección', exact: true }).click();
	await expect(section.getByText('0 versión(es) guardadas ahora mismo.')).toBeVisible();
}

async function goToTrash(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('link', { name: 'Papelera', exact: false }).click();
	await page.waitForURL('**/papelera');
}

test.describe('/papelera sin vega_revisions bootstrapeada', () => {
	test('mensaje honesto ("no está activada") y CTA a Ajustes, nunca miente prometiendo papelera', async ({
		page
	}) => {
		await loginAndSettle(page);
		await goToTrash(page);

		await expect(page.getByText('La papelera no está activada en este proyecto.')).toBeVisible();
		await page.getByRole('button', { name: 'Ir a Ajustes' }).click();
		await page.waitForURL('**/settings');
	});
});

test.describe('borrar → papelera → restaurar (§8·B2, promesa central del lote)', () => {
	test('el registro vuelve con su id; los ficheros adjuntos NO se restauran', async ({ page }) => {
		await loginAndSettle(page);
		await enableRevisions(page);

		// Vuelve a `posts` por SPA (nunca `page.goto` tras mutar: recargaría el adaptador `memory`,
		// ver la cabecera de `session/backend.ts`) y abre "Bienvenido a Vega" (post_1).
		await page.getByRole('link', { name: 'Entradas', exact: false }).click();
		await page.waitForURL('**/c/posts');
		await page.getByRole('link', { name: 'Bienvenido a Vega' }).click();
		await page.waitForURL(/\/c\/posts\/post_1$/);

		const sourceFileField = page.locator('[data-field="sourceFile"]');
		await expect(sourceFileField.locator('.vega-file-chip')).toContainText(
			'seed_archive_notes.txt'
		);

		// Borrado desde la zona de peligro del editor (no desde la fila del listado): mismo diálogo
		// `DeleteConfirm`, con la línea de la papelera (§4/§10.3) ahora en su cuerpo.
		await page.getByRole('button', { name: 'Eliminar Entrada…' }).click();
		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('recuperarlo desde la papelera durante 30 día(s)');
		await expect(dialog).toContainText('Los ficheros adjuntos no se recuperan');

		await dialog.getByRole('button', { name: 'Borrar', exact: true }).click();
		await expect(dialog).toBeHidden();
		await page.waitForURL('**/c/posts');

		await goToTrash(page);
		const item = page.locator('.vega-trash-item', { hasText: 'Bienvenido a Vega' });
		await expect(item).toBeVisible();
		await expect(item).toContainText('Colección: posts');
		await expect(item).toContainText('Tenía ficheros adjuntos: no se restaurarán.');

		await item.getByRole('button', { name: 'Restaurar' }).click();
		await expect(page.getByText('"Bienvenido a Vega" se ha restaurado.')).toBeVisible();
		// La entrada de papelera desaparece: ya no es "un borrado", es un registro vivo de nuevo.
		await expect(page.getByText('La papelera está vacía.')).toBeVisible();

		// De vuelta a `posts` por SPA: el registro restaurado vive en la MISMA ruta (`post_1`,
		// mismo id) — si hubiera vuelto con un id nuevo, esta navegación por título no encontraría
		// nada en `/c/posts/post_1` y el resto de la aserción fallaría.
		await page.getByRole('link', { name: 'Entradas', exact: false }).click();
		await page.waitForURL('**/c/posts');
		await page.getByRole('link', { name: 'Bienvenido a Vega' }).click();
		await page.waitForURL(/\/c\/posts\/post_1$/);

		// El resto del contenido volvió (pre-imagen ANTES del borrado): título y cuerpo intactos.
		await expect(page.getByLabel('Title')).toHaveValue('Bienvenido a Vega');
		await expect(page.getByLabel('Body')).toHaveValue('Primer texto de ejemplo.');

		// El fichero NO volvió (§0.3/§8·B2, medido: PB destruye el binario al instante, restaurar
		// con el mismo id no lo resucita) — el chip ya no está, el campo queda vacío.
		await expect(page.locator('[data-field="sourceFile"] .vega-file-chip')).toHaveCount(0);
	});
});

test.describe('un asset con "file" obligatorio en la papelera (fix de code-review: "Restaurar" no puede prometer lo que no cumple)', () => {
	test('vega_media (D-P6.1: file required) aparece con "Restaurar" deshabilitado y el motivo dicho', async ({
		page
	}) => {
		await loginAsDemo(page, { seedMedia: true });
		await page.waitForURL('**/c/site_info/new');
		await enableRevisions(page);

		await page.getByRole('link', { name: 'Medios', exact: false }).click();
		await page.waitForURL('**/media');
		await page.locator('[data-media-item="media_1"]').click();
		const detail = page.getByRole('dialog', { name: 'Editar medio' });
		await expect(detail).toBeVisible();
		await detail.getByRole('button', { name: 'Borrar', exact: true }).click();
		const confirmDialog = page.getByRole('alertdialog');
		await confirmDialog.getByRole('button', { name: 'Borrar', exact: true }).click();
		await expect(confirmDialog).toBeHidden();

		await goToTrash(page);
		const item = page.locator('.vega-trash-item', { hasText: 'Manual de usuario' });
		await expect(item).toBeVisible();
		await expect(item).toContainText('Colección: vega_media');

		// `requiredFileFieldName` deriva el bloqueo del ESQUEMA (`file` es `required` en
		// `vega_media`): nunca un botón "Restaurar", solo el motivo dicho con todas las letras.
		await expect(item.getByRole('button', { name: 'Restaurar' })).toHaveCount(0);
		await expect(item).toContainText('El campo "file" de "vega_media" es un fichero obligatorio');
		await expect(item).toContainText('"Restaurar" no está disponible.');

		// El bloqueo es SOLO sobre "Restaurar": "Borrar definitivamente" sigue funcionando igual.
		await item.getByRole('button', { name: 'Borrar definitivamente' }).click();
		await item
			.locator('.notice-confirm')
			.getByRole('button', { name: 'Borrar definitivamente' })
			.click();
		await expect(page.getByText('"Manual de usuario" se ha borrado definitivamente')).toBeVisible();
	});
});

test.describe('borrar definitivamente y vaciar papelera', () => {
	test('borrar definitivamente UNA entrada la quita de la papelera para siempre', async ({
		page
	}) => {
		await loginAndSettle(page);
		await enableRevisions(page);

		await page.getByRole('link', { name: 'Entradas', exact: false }).click();
		await page.waitForURL('**/c/posts');
		const row = page.locator('tbody tr', { hasText: 'Borrador en curso' });
		await row.hover();
		await row.getByRole('button', { name: 'Borrar "Borrador en curso"' }).click();
		await page
			.getByRole('alertdialog')
			.getByRole('button', { name: 'Borrar', exact: true })
			.click();
		await expect(page.getByRole('alertdialog')).toBeHidden();

		await goToTrash(page);
		const item = page.locator('.vega-trash-item', { hasText: 'Borrador en curso' });
		await expect(item).toBeVisible();

		await item.getByRole('button', { name: 'Borrar definitivamente' }).click();
		const confirm = item.locator('.notice-confirm');
		await expect(confirm).toBeVisible();
		await confirm.getByRole('button', { name: 'Borrar definitivamente' }).click();

		await expect(page.getByText('"Borrador en curso" se ha borrado definitivamente')).toBeVisible();
		await expect(page.getByText('La papelera está vacía.')).toBeVisible();
	});

	test('vaciar papelera borra TODAS las entradas actuales de una vez', async ({ page }) => {
		await loginAndSettle(page);
		await enableRevisions(page);

		await page.getByRole('link', { name: 'Entradas', exact: false }).click();
		await page.waitForURL('**/c/posts');

		for (const title of ['Bienvenido a Vega', 'Borrador en curso']) {
			const row = page.locator('tbody tr', { hasText: title });
			await row.hover();
			await row.getByRole('button', { name: `Borrar "${title}"` }).click();
			await page
				.getByRole('alertdialog')
				.getByRole('button', { name: 'Borrar', exact: true })
				.click();
			await expect(page.getByRole('alertdialog')).toBeHidden();
		}

		await goToTrash(page);
		await expect(page.locator('.vega-trash-item')).toHaveCount(2);

		await page.getByRole('button', { name: 'Vaciar papelera' }).click();
		const confirm = page.locator('.notice-confirm');
		await expect(confirm).toContainText('2 entrada(s)');
		await confirm.getByRole('button', { name: 'Vaciar papelera' }).click();

		await expect(page.getByText('Papelera vaciada.')).toBeVisible();
		await expect(page.getByText('La papelera está vacía.')).toBeVisible();
	});
});
