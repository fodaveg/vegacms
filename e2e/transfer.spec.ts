/**
 * Suite de "exportar contenido" (`#lote-esquema`, tarea `045b5595`, Fase 1) contra el adaptador
 * `memory` (`DEMO_SEED`, ver `session/demo-seed.ts`): el gate por `permissions.list`, el diálogo
 * de alcance (las dos opciones SIEMPRE visibles, una deshabilitada sin filtro activo) y el ciclo
 * completo botón → diálogo → descarga → toast.
 *
 * `avisos` (list permitido, create/update/delete vedados) es el fixture: basta con `list` para
 * exportar, así que es la colección con reglas que mejor demuestra que el gate es por `list` y no
 * por ninguna de las escrituras. `privado` (list vedado del todo) es el caso "no se ofrece".
 */
import { expect, loginAsDemo, test } from './fixtures';

test.describe('gate por permissions.list', () => {
	test('"avisos" (solo list permitido) ofrece "Exportar"; "privado" (list vedado) no llega a ofrecerlo', async ({
		page
	}) => {
		await loginAsDemo(page);

		await page.goto('/c/avisos');
		await expect(page.getByRole('button', { name: 'Exportar' })).toBeVisible();

		await page.goto('/c/privado');
		await expect(page.getByRole('heading', { name: 'No tienes permiso' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Exportar' })).toHaveCount(0);
	});
});

test.describe('diálogo de exportar', () => {
	test('sin filtro activo: "toda la colección" es la única opción real, la otra va deshabilitada', async ({
		page
	}) => {
		await loginAsDemo(page);
		await page.goto('/c/avisos');

		await page.getByRole('button', { name: 'Exportar' }).click();
		const dialog = page.getByRole('dialog', { name: 'Exportar «Avisos»' });
		await expect(dialog).toBeVisible();

		await expect(dialog.getByRole('radio', { name: 'Toda la colección' })).toBeChecked();
		const filteredOption = dialog.getByRole('radio', { name: 'Solo el filtro o búsqueda actual' });
		await expect(filteredOption).toBeDisabled();
		await expect(filteredOption).not.toBeChecked();
		await expect(dialog.getByText('No hay ningún filtro ni búsqueda activos.')).toBeVisible();
	});

	test('con búsqueda activa: la opción "filtro actual" está habilitada y es la elegida por defecto', async ({
		page
	}) => {
		await loginAsDemo(page);
		await page.goto('/c/avisos?q=Aviso');

		await page.getByRole('button', { name: 'Exportar' }).click();
		const dialog = page.getByRole('dialog', { name: 'Exportar «Avisos»' });

		await expect(
			dialog.getByRole('radio', { name: 'Solo el filtro o búsqueda actual' })
		).toBeChecked();
		await expect(
			dialog.getByRole('radio', { name: 'Solo el filtro o búsqueda actual' })
		).toBeEnabled();
		await expect(dialog.getByRole('radio', { name: 'Toda la colección' })).not.toBeChecked();
	});

	test('cancelar en la fase de elección cierra el diálogo sin descargar nada', async ({ page }) => {
		await loginAsDemo(page);
		await page.goto('/c/avisos');

		await page.getByRole('button', { name: 'Exportar' }).click();
		const dialog = page.getByRole('dialog', { name: 'Exportar «Avisos»' });
		await expect(dialog).toBeVisible();

		await dialog.getByRole('button', { name: 'Cancelar' }).click();
		await expect(dialog).not.toBeVisible();
	});

	test('Escape en la fase de elección cierra el diálogo', async ({ page }) => {
		await loginAsDemo(page);
		await page.goto('/c/avisos');

		await page.getByRole('button', { name: 'Exportar' }).click();
		const dialog = page.getByRole('dialog', { name: 'Exportar «Avisos»' });
		await expect(dialog).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(dialog).not.toBeVisible();
	});

	test('navegar a OTRA colección con el diálogo abierto lo cierra (fix de code-review: el gate en todos los caminos)', async ({
		page
	}) => {
		await loginAsDemo(page);
		await page.goto('/c/avisos');

		await page.getByRole('button', { name: 'Exportar' }).click();
		const avisosDialog = page.getByRole('dialog', { name: 'Exportar «Avisos»' });
		await expect(avisosDialog).toBeVisible();

		// `/c/[type]` es la MISMA ruta de componente para ambas colecciones (solo cambia el
		// parámetro): sin el `$effect` que resetea `exportOpen`, el diálogo de "avisos" seguiría
		// pintado mientras `contentType` pasa a describir "authors" por debajo.
		await page.goto('/c/authors');
		await expect(avisosDialog).not.toBeVisible();
		await expect(page.getByRole('dialog')).toHaveCount(0);
	});
});

test.describe('exportar de verdad', () => {
	test('"toda la colección" descarga un .vega.json con el registro serializado y avisa con un toast', async ({
		page
	}) => {
		await loginAsDemo(page);
		await page.goto('/c/avisos');

		await page.getByRole('button', { name: 'Exportar' }).click();
		const dialog = page.getByRole('dialog', { name: 'Exportar «Avisos»' });

		const downloadPromise = page.waitForEvent('download');
		await dialog.getByRole('button', { name: 'Exportar', exact: true }).click();
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toBe('avisos.vega.json');

		const stream = await download.createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream) chunks.push(chunk as Buffer);
		const doc = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

		expect(doc.vegaTransfer).toBe(1);
		expect(typeof doc.exported).toBe('string');
		expect(doc.origin.vegaVersion).toEqual(expect.any(String));
		expect(doc.collections).toEqual([
			{
				type: 'avisos',
				records: [{ id: 'aviso_1', values: { title: 'Aviso que no se puede editar' } }]
			}
		]);

		await expect(dialog).not.toBeVisible();
		// Singular real (`list.export.success.one`, fix de code-review sobre "1 registros"):
		// `avisos` tiene un único registro sembrado.
		await expect(page.getByText('Se ha exportado 1 registro de «Avisos».')).toBeVisible();
	});
});
