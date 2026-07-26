/**
 * Suite de "exportar/importar contenido" (`#lote-esquema`, tarea `045b5595`) contra el adaptador
 * `memory` (`DEMO_SEED`, ver `session/demo-seed.ts`).
 *
 * **Fase 1 (exportar)**: el gate por `permissions.list`, el diálogo de alcance (las dos opciones
 * SIEMPRE visibles, una deshabilitada sin filtro activo) y el ciclo completo botón → diálogo →
 * descarga → toast. `avisos` (list permitido, create/update/delete vedados) es el fixture: basta
 * con `list` para exportar, así que es la colección con reglas que mejor demuestra que el gate es
 * por `list` y no por ninguna de las escrituras. `privado` (list vedado del todo) es el caso "no
 * se ofrece".
 *
 * **Fase 2 (importar)**: el gate por permiso de ESCRITURA (`avisos`, create/update AMBOS vedados,
 * es también el fixture del "bloqueo por permisos" — el mismo criterio "no ofrecer lo que se sabe
 * que va a fallar" del resto del `#lote-shell`, así que aquí el bloqueo se ve en que el botón ni
 * se ofrece, no en una entrada BLOQUEADA dentro de la vista previa: ningún tipo de la semilla
 * declara create/update ASIMÉTRICOS, así que no hay fixture para ese caso más fino sin tocar
 * `demo-seed.ts`) y el ciclo completo exportar → editar el fichero descargado a mano (mismo
 * `.vega.json` real, no uno fabricado a mano desde cero) → importar, con CREA y PISA a la vez en
 * la misma vista previa. `metrics` (permisos completos, un único registro `metric_1`, sin
 * relaciones/ficheros) es el fixture: el caso MÁS simple donde probar el ciclo sin que un campo
 * `relation`/`file` añada ruido a lo que este test quiere demostrar.
 */
import { expect, loginAsDemo, test } from './fixtures';

/** Forma MÍNIMA de un `.vega.json` que este fichero necesita para editar el descargado antes de
 *  reimportarlo — duplicada a propósito (mismo criterio que `DEMO_EMAIL`/`DEMO_PASSWORD` de
 *  `fixtures.ts`, ver su cabecera: Playwright corre en un runtime Node aparte de Vite y no
 *  resuelve `$lib`), nunca importada de `$lib/transfer/transfer-format.ts`. */
interface TransferDocLike {
	vegaTransfer: number;
	collections: { type: string; records: { id: string; values: Record<string, unknown> }[] }[];
}

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

test.describe('importar — gate por permiso de escritura (`#lote-esquema`, Fase 2)', () => {
	test('"metrics" (create+update permitidos) ofrece "Importar"; "avisos" (ambos vedados) no lo ofrece', async ({
		page
	}) => {
		await loginAsDemo(page);

		await page.goto('/c/metrics');
		await expect(page.getByRole('button', { name: 'Importar' })).toBeVisible();

		await page.goto('/c/avisos');
		await expect(page.getByRole('button', { name: 'Importar' })).toHaveCount(0);
	});
});

test.describe('importar — ciclo completo (`#lote-esquema`, Fase 2)', () => {
	test('exportar → editar el fichero a mano → importar: CREA un registro nuevo y PISA el existente, con confirmación aparte', async ({
		page
	}) => {
		await loginAsDemo(page);
		await page.goto('/c/metrics');

		// ————— 1. Exportar de verdad (el MISMO camino que la suite de arriba) —————
		await page.getByRole('button', { name: 'Exportar' }).click();
		const exportDialog = page.getByRole('dialog', { name: 'Exportar «Métricas»' });
		const downloadPromise = page.waitForEvent('download');
		await exportDialog.getByRole('button', { name: 'Exportar', exact: true }).click();
		const download = await downloadPromise;

		const stream = await download.createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream) chunks.push(chunk as Buffer);
		const doc = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as TransferDocLike;
		expect(doc.collections).toEqual([
			{ type: 'metrics', records: [{ id: 'metric_1', values: { count: 42, active: true } }] }
		]);

		// ————— 2. Editar el fichero descargado A MANO: PISA (cambia el valor de metric_1) + CREA
		// (un id nuevo que no existe en destino) en la MISMA colección —————
		doc.collections[0].records[0].values.count = 100;
		doc.collections[0].records.push({
			id: 'metric_e2e_new',
			values: { count: 7, active: false }
		});

		// ————— 3. Importar el fichero editado —————
		await page.getByRole('button', { name: 'Importar' }).click();
		const importDialog = page.getByRole('dialog', { name: 'Importar un fichero .vega.json' });
		await expect(importDialog).toBeVisible();

		await importDialog.getByLabel('Elige un fichero .vega.json').setInputFiles({
			name: 'metrics-editado.vega.json',
			mimeType: 'application/json',
			buffer: Buffer.from(JSON.stringify(doc))
		});

		// Vista previa (§4.2): 1 CREA (metric_e2e_new) + 1 PISA (metric_1), cero bloqueados.
		await expect(importDialog.getByText('1 nuevos · 1 sobrescriben · 0 bloqueados')).toBeVisible();
		const confirmButton = importDialog.getByRole('button', { name: 'Importar', exact: true });
		// El PISA exige confirmación APARTE (§4.2: "nunca el default silencioso") — sin marcar el
		// checkbox, "Importar" está deshabilitado aunque la vista previa ya esté lista.
		await expect(confirmButton).toBeDisabled();

		await importDialog
			.getByRole('checkbox', {
				name: 'Confirmo que quiero sobrescribir estos 1 registros ya existentes.'
			})
			.check();
		await expect(confirmButton).toBeEnabled();
		await confirmButton.click();

		// Informe final (§4.3: nunca "importado" si algo falló — aquí no falla nada).
		await expect(
			importDialog.getByText('1 creados · 1 actualizados · 0 con error · 0 omitidos')
		).toBeVisible();
		await expect(page.getByText('Se han importado 2 registros.')).toBeVisible();

		await importDialog.getByRole('button', { name: 'Cerrar' }).click();
		await expect(importDialog).not.toBeVisible();

		// ————— 4. Persistido de verdad: la tabla se refresca sola (`onImported`, ver `+page.svelte`)
		// y refleja el PISA y el CREA — SIN recargar la página (`page.reload()` reiniciaría el
		// backend `memory` a la semilla original, perdiendo justo lo que este test quiere probar). —
		await expect(page.locator('.vega-list-meta')).toContainText('2'); // "2 registros" en la cabecera
		// CREA: el registro nuevo existe de verdad (enlace a su editor).
		await expect(page.locator('a[href="/c/metrics/metric_e2e_new"]')).toBeVisible();
		// PISA: `metric_1` quedó con el valor del fichero editado, no el original (42).
		await page.locator('a[href="/c/metrics/metric_1"]').click();
		await expect(page.getByRole('spinbutton', { name: 'Count' })).toHaveValue('100');
	});
});
