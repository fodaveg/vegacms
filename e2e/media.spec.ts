/**
 * Suite del bootstrap de `/media` (contrato P6 §9, Fase 6a) contra el adaptador `memory`
 * sembrado (ver `e2e/fixtures.ts`, `src/lib/session/demo-seed.ts`): la semilla NUNCA incluye
 * `vega_media`, así que esta ruta siempre aterriza en `collectionState: 'creatable'` (memory
 * tiene `schemaBootstrap: true`) — el mismo patrón de bootstrap que `e2e/settings.spec.ts` ejerce
 * para la colección `vega`. Reemplaza el viejo test de placeholder honesto (pre-P6), que vivía en
 * `routes.spec.ts`.
 */
import { expect, loginAsDemo, test } from './fixtures';

async function goToMedia(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('link', { name: 'Medios', exact: false }).click();
	await page.waitForURL('**/media');
}

test.describe('/media bootstrap de "vega_media" (§9 del contrato P6, Fase 6a)', () => {
	test('sin "vega_media": estado creatable → confirmar → biblioteca vacía', async ({ page }) => {
		await loginAsDemo(page);
		await page.waitForURL('**/c/site_info/new');
		await goToMedia(page);

		// Estado 'creatable': el marco todavía no es la biblioteca, solo el gate.
		const creatableFrame = page.locator('[data-media-state="creatable"]');
		await expect(creatableFrame).toBeVisible();

		await page.getByRole('button', { name: 'Crear colección de medios' }).click();

		// Confirmación INLINE (nunca window.confirm): pide continuar antes de tocar el puerto.
		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('vega_media');

		await dialog.getByRole('button', { name: 'Crear colección', exact: true }).click();

		// Tras confirmar: `ensureMediaCollection` crea la colección y el estado pasa a 'present'
		// con el marco de biblioteca VACÍA (grid real = 6b, fuera de alcance de esta fase).
		await expect(dialog).not.toBeVisible();
		const presentFrame = page.locator('[data-media-state="present"]');
		await expect(presentFrame).toBeVisible();
		await expect(presentFrame).toContainText('La biblioteca de medios está vacía');

		// Navegar fuera y volver (SPA, sin recargar documento) confirma que la colección quedó
		// creada de verdad en ESTE backend: ya no se vuelve a pedir el gate de confirmación. Un
		// hard reload no sirve de prueba aquí: el adaptador `memory` de esta demo no persiste
		// entre recargas por diseño (misma nota que `e2e/settings.spec.ts`), así que recargaría
		// un backend nuevo, sembrado desde cero, sin `vega_media`.
		await page.getByRole('link', { name: 'Información del sitio' }).click();
		await page.waitForURL('**/c/site_info/new');
		await goToMedia(page);
		await expect(page.locator('[data-media-state="present"]')).toBeVisible();
	});

	test('cancelar la confirmación no crea nada: sigue en creatable', async ({ page }) => {
		await loginAsDemo(page);
		await page.waitForURL('**/c/site_info/new');
		await goToMedia(page);

		await page.getByRole('button', { name: 'Crear colección de medios' }).click();
		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toBeVisible();

		await dialog.getByRole('button', { name: 'Cancelar' }).click();
		await expect(dialog).not.toBeVisible();
		await expect(page.locator('[data-media-state="creatable"]')).toBeVisible();
	});
});

/**
 * Suite del grid + detalle de `vega_media` (contrato P6, Fase 6b): contra `DEMO_SEED_WITH_MEDIA`
 * (`session/demo-seed.ts`), sembrada vía `loginAsDemo(page, { seedMedia: true })` — la colección ya
 * existe, con 3 assets (1 pdf + 2 imágenes, `created` escalonado), así que estas pruebas aterrizan
 * directo en `'present'` sin pasar por el gate de bootstrap (ya cubierto por la suite de arriba).
 */
test.describe('/media grid + detalle (contrato P6, Fase 6b)', () => {
	async function goToMediaWithSeed(page: import('@playwright/test').Page): Promise<void> {
		await loginAsDemo(page, { seedMedia: true });
		await page.waitForURL('**/c/site_info/new');
		await goToMedia(page);
	}

	test('el grid pinta los 3 assets sembrados, ordenados por "created" desc', async ({ page }) => {
		await goToMediaWithSeed(page);

		await expect(page.locator('[data-media-grid-state="ready"]')).toBeVisible();
		const cells = page.locator('[data-media-item]');
		await expect(cells).toHaveCount(3);
		// `media_3` es el más reciente (creado el 03), `media_1` (el pdf) el más antiguo (el 01).
		await expect(cells.nth(0)).toHaveAttribute('data-media-item', 'media_3');
		await expect(cells.nth(1)).toHaveAttribute('data-media-item', 'media_2');
		await expect(cells.nth(2)).toHaveAttribute('data-media-item', 'media_1');
	});

	test('el pdf pinta un icono por tipo, nunca un <img> roto', async ({ page }) => {
		await goToMediaWithSeed(page);

		const pdfCell = page.locator('[data-media-item="media_1"]');
		await expect(pdfCell).toHaveAttribute('data-media-kind', 'other');
		await expect(pdfCell.locator('img')).toHaveCount(0);
		await expect(pdfCell.locator('svg')).toBeVisible();
	});

	test('la imagen sembrada degrada a <img> (memory: capabilities.thumbs === false)', async ({
		page
	}) => {
		await goToMediaWithSeed(page);

		const imageCell = page.locator('[data-media-item="media_2"]');
		await expect(imageCell).toHaveAttribute('data-media-kind', 'image');
		await expect(imageCell.locator('img')).toBeVisible();
	});

	test('abrir el detalle, editar "alt" y guardar persiste: reabrir lo confirma', async ({
		page
	}) => {
		await goToMediaWithSeed(page);

		await page.locator('[data-media-item="media_3"]').click();
		const dialog = page.getByRole('dialog', { name: 'Editar medio' });
		await expect(dialog).toBeVisible();

		await dialog.getByLabel('Texto alternativo').fill('Nuevo texto alternativo');
		await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
		await expect(dialog).not.toBeVisible();

		// Reabrir (mismo backend en memoria, SPA, sin recargar documento) confirma que el guardado
		// persistió de verdad: el panel se rehidrata con el registro actualizado.
		await page.locator('[data-media-item="media_3"]').click();
		await expect(
			page.getByRole('dialog', { name: 'Editar medio' }).getByLabel('Texto alternativo')
		).toHaveValue('Nuevo texto alternativo');
	});

	test('cerrar sin guardar tras editar pide confirmar (mismo guard que RecordForm)', async ({
		page
	}) => {
		await goToMediaWithSeed(page);

		await page.locator('[data-media-item="media_2"]').click();
		const dialog = page.getByRole('dialog', { name: 'Editar medio' });
		await dialog.getByLabel('Texto alternativo').fill('Cambio sin guardar');

		page.once('dialog', (confirmDialog) => void confirmDialog.dismiss());
		await dialog.getByRole('button', { name: 'Cancelar' }).click();
		// `dismiss()` del `window.confirm` nativo = "quedarse": el diálogo de Vega sigue abierto.
		await expect(dialog).toBeVisible();

		page.once('dialog', (confirmDialog) => void confirmDialog.accept());
		await dialog.getByRole('button', { name: 'Cancelar' }).click();
		await expect(dialog).not.toBeVisible();
	});

	test('un fallo de list("vega_media") pinta "Reintentar" EN CONTEXTO, no en el banner global', async ({
		page
	}) => {
		await goToMediaWithSeed(page);
		await expect(page.locator('[data-media-grid-state="ready"]')).toBeVisible();

		// `__VEGA_FORCE_MEDIA_LIST_ERROR__` (acotado a `list('vega_media', …)`, ver `session/
		// backend.ts`): a diferencia de `__VEGA_FORCE_NETWORK_ERROR__`, no tumba el `listContentTypes()`
		// que `/media/+page.svelte` repite en CADA montaje (Fase 6a) — necesario para poder remontar
		// `/media` (navegar fuera y volver) sin que el marco ENTERO caiga a `status: 'error'` antes de
		// llegar al estado que esta prueba quiere ejercer (el de la rejilla en concreto).
		await page.evaluate(() => {
			(
				window as unknown as { __VEGA_FORCE_MEDIA_LIST_ERROR__?: boolean }
			).__VEGA_FORCE_MEDIA_LIST_ERROR__ = true;
		});
		// Fuerza una carga NUEVA del grid: navegar fuera y volver remonta `/media` (mismo patrón que
		// `e2e/list.spec.ts`, "error de transporte en el listado").
		await page.getByRole('link', { name: 'Información del sitio' }).click();
		await page.waitForURL('**/c/site_info/new');
		await goToMedia(page);

		const state = page.locator('[data-media-grid-state="error"]');
		await expect(state).toBeVisible();
		await expect(state).toHaveAttribute('role', 'alert');
		await expect(state.getByRole('button', { name: 'Reintentar' })).toBeVisible();
		await expect(page.locator('.vega-global-banner')).toHaveCount(0);

		await page.evaluate(() => {
			(
				window as unknown as { __VEGA_FORCE_MEDIA_LIST_ERROR__?: boolean }
			).__VEGA_FORCE_MEDIA_LIST_ERROR__ = false;
		});
		await state.getByRole('button', { name: 'Reintentar' }).click();
		await expect(page.locator('[data-media-grid-state="ready"]')).toBeVisible();
	});
});

/**
 * Suite de la subida drag&drop de `vega_media` (contrato P6, Fase 6c): mismo `DEMO_SEED_WITH_MEDIA`
 * que la suite de grid+detalle de arriba (3 assets ya sembrados), pero con el campo `file` de la
 * semilla trayendo las constraints REALES de `VEGA_MEDIA_COLLECTION` (`demo-seed.ts`, D-P6.3: 10
 * MiB, sin `image/svg+xml`) — para que la pre-validación cliente tenga algo real que rechazar.
 *
 * Nunca simula un `drop` de `DataTransfer` (Playwright no puede fabricar uno de forma fiable): la
 * zona de subida SIEMPRE se ejercita a través del `<input type="file">` real con `setInputFiles`
 * (§4 del contrato, "foco-able y operable por teclado" — ver `MediaUpload.svelte`).
 */
test.describe('/media subida drag&drop (contrato P6, Fase 6c)', () => {
	async function goToMediaWithSeed(page: import('@playwright/test').Page): Promise<void> {
		await loginAsDemo(page, { seedMedia: true });
		await page.waitForURL('**/c/site_info/new');
		await goToMedia(page);
	}

	// 1x1 PNG transparente real (mismo fixture que `e2e/form.spec.ts`: un buffer arbitrario con
	// `mimeType: 'image/png'` no basta, el `<img>` de la celda necesita DECODIFICAR de verdad para
	// no degradar a icono por un fallo de carga real).
	const TINY_PNG_BASE64 =
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

	test('subir una imagen válida: aparece en el grid, arriba (created desc)', async ({ page }) => {
		await goToMediaWithSeed(page);
		await expect(page.locator('[data-media-item]')).toHaveCount(3);

		await page.getByLabel('Subir ficheros').setInputFiles({
			name: 'nuevo.png',
			mimeType: 'image/png',
			buffer: Buffer.from(TINY_PNG_BASE64, 'base64')
		});

		// Estado por-fichero: pasa por "Subido" (el toast de resumen confirma que el lote terminó).
		const item = page.locator('[data-media-upload-item]').filter({ hasText: 'nuevo.png' });
		await expect(item).toHaveAttribute('data-media-upload-status', 'done');
		await expect(page.getByText('1 fichero(s) subido(s), 0 fallido(s).')).toBeVisible();

		// El grid se refresca: 4 celdas, y la de arriba es la NUEVA (nunca uno de los 3 sembrados,
		// `created` desc coloca lo recién creado primero).
		const cells = page.locator('[data-media-item]');
		await expect(cells).toHaveCount(4);
		const topId = await cells.nth(0).getAttribute('data-media-item');
		expect(['media_1', 'media_2', 'media_3']).not.toContain(topId);
		await expect(cells.first()).toHaveAttribute('data-media-kind', 'image');
	});

	test('mime no permitido / tamaño excedido: error POR FICHERO, el resto del lote sigue', async ({
		page
	}) => {
		await goToMediaWithSeed(page);

		// Lote de 3, uno de golpe: `bueno.png` pasa, `no-permitido.txt` falla por MIME (fuera de la
		// lista de la semilla), `demasiado-grande.png` falla por tamaño (> 10 MiB, D-P6.3). La
		// pre-validación (cliente) los rechaza SIN llamar a `create()`, así que ninguno de los dos
		// bloquea al tercero.
		await page.getByLabel('Subir ficheros').setInputFiles([
			{
				name: 'bueno.png',
				mimeType: 'image/png',
				buffer: Buffer.from(TINY_PNG_BASE64, 'base64')
			},
			{ name: 'no-permitido.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') },
			{
				name: 'demasiado-grande.png',
				mimeType: 'image/png',
				buffer: Buffer.alloc(10 * 1024 * 1024 + 1)
			}
		]);

		await expect(page.getByText('1 fichero(s) subido(s), 2 fallido(s).')).toBeVisible();

		const goodItem = page.locator('[data-media-upload-item]').filter({ hasText: 'bueno.png' });
		await expect(goodItem).toHaveAttribute('data-media-upload-status', 'done');

		const invalidTypeItem = page
			.locator('[data-media-upload-item]')
			.filter({ hasText: 'no-permitido.txt' });
		await expect(invalidTypeItem).toHaveAttribute('data-media-upload-status', 'error');
		await expect(invalidTypeItem).toContainText('tipo de fichero no permitido');

		const tooLargeItem = page
			.locator('[data-media-upload-item]')
			.filter({ hasText: 'demasiado-grande.png' });
		await expect(tooLargeItem).toHaveAttribute('data-media-upload-status', 'error');
		await expect(tooLargeItem).toContainText('excede el tamaño máximo permitido');

		// Solo el válido llegó a crearse: 3 sembrados + 1 = 4, no 3+3.
		await expect(page.locator('[data-media-item]')).toHaveCount(4);
	});

	test('un fallo de red/permiso en create() ABORTA el resto del lote (a diferencia de un rechazo de validación)', async ({
		page
	}) => {
		await goToMediaWithSeed(page);

		// `__VEGA_FORCE_MEDIA_CREATE_ERROR__` (acotado a `create('vega_media', …)`, ver
		// `session/backend.ts`): fuerza que el PRIMER fichero del lote falle con `VegaError.network()`.
		await page.evaluate(() => {
			(
				window as unknown as { __VEGA_FORCE_MEDIA_CREATE_ERROR__?: boolean }
			).__VEGA_FORCE_MEDIA_CREATE_ERROR__ = true;
		});

		await page.getByLabel('Subir ficheros').setInputFiles([
			{ name: 'uno.png', mimeType: 'image/png', buffer: Buffer.from(TINY_PNG_BASE64, 'base64') },
			{ name: 'dos.png', mimeType: 'image/png', buffer: Buffer.from(TINY_PNG_BASE64, 'base64') }
		]);

		await expect(page.getByText('0 fichero(s) subido(s), 2 fallido(s).')).toBeVisible();

		// El primero falló de verdad contra `create()` — motivo de red.
		const firstItem = page.locator('[data-media-upload-item]').filter({ hasText: 'uno.png' });
		await expect(firstItem).toHaveAttribute('data-media-upload-status', 'error');
		await expect(firstItem).toContainText('Sin conexión');

		// El segundo NUNCA se intentó (el lote abortó tras el primer fallo de red): motivo de aborto.
		const secondItem = page.locator('[data-media-upload-item]').filter({ hasText: 'dos.png' });
		await expect(secondItem).toHaveAttribute('data-media-upload-status', 'error');
		await expect(secondItem).toContainText('cancelada');

		// Ningún registro nuevo: el grid sigue con los 3 sembrados.
		await expect(page.locator('[data-media-item]')).toHaveCount(3);

		// Quitando el gancho, un lote nuevo sube con normalidad (la zona de subida no quedó
		// "atascada" por el aborto anterior).
		await page.evaluate(() => {
			(
				window as unknown as { __VEGA_FORCE_MEDIA_CREATE_ERROR__?: boolean }
			).__VEGA_FORCE_MEDIA_CREATE_ERROR__ = false;
		});
		await page.getByLabel('Subir ficheros').setInputFiles({
			name: 'recuperado.png',
			mimeType: 'image/png',
			buffer: Buffer.from(TINY_PNG_BASE64, 'base64')
		});
		await expect(page.getByText('1 fichero(s) subido(s), 0 fallido(s).')).toBeVisible();
		await expect(page.locator('[data-media-item]')).toHaveCount(4);
	});

	test('la zona de subida es la CTA real del caso "biblioteca vacía" (antes un placeholder)', async ({
		page
	}) => {
		// Sin `seedMedia`: bootstrap fresco (estado 'creatable') → confirmar crea la colección REAL
		// (con las constraints de `VEGA_MEDIA_COLLECTION`) y aterriza en 'present', vacía de verdad.
		await loginAsDemo(page);
		await page.waitForURL('**/c/site_info/new');
		await goToMedia(page);
		await page.getByRole('button', { name: 'Crear colección de medios' }).click();
		await page
			.getByRole('alertdialog')
			.getByRole('button', { name: 'Crear colección', exact: true })
			.click();

		const emptyState = page.locator('[data-media-grid-state="empty"]');
		await expect(emptyState).toBeVisible();
		await expect(emptyState).toContainText('Sube el primero');

		// La zona de subida YA está montada (visible incluso con la biblioteca vacía) y funciona.
		await page.getByLabel('Subir ficheros').setInputFiles({
			name: 'primero.png',
			mimeType: 'image/png',
			buffer: Buffer.from(TINY_PNG_BASE64, 'base64')
		});
		await expect(page.getByText('1 fichero(s) subido(s), 0 fallido(s).')).toBeVisible();
		await expect(page.locator('[data-media-grid-state="ready"]')).toBeVisible();
		await expect(page.locator('[data-media-item]')).toHaveCount(1);
	});
});

/**
 * Suite del borrado de `vega_media` (contrato P6, Fase 6d, D-P6.5/audit H3): mismo
 * `DEMO_SEED_WITH_MEDIA` que grid+detalle (Fase 6b) — el botón "Borrar" vive DENTRO de
 * `MediaDetail` (`e2e/media.spec.ts` ya abre ese diálogo en la suite de 6b), así que estas
 * pruebas parten siempre de "detalle ya abierto".
 *
 * Los 3 tests de foco (foco inicial/Tab cíclico/Escape) están CALCADOS de `e2e/delete.spec.ts`
 * (P4, mismo patrón `DeleteConfirm`) — protegen el comportamiento delicado que la cabecera de
 * `MediaDeleteConfirm.svelte` documenta en detalle (foco inicial seguro, trampa de `Tab`, y la
 * coordinación con la trampa de `MediaDetail` vía el guard `if (confirmingDelete) return;`), que
 * de otro modo no tenía ninguna prueba propia (fix tras code-review de 6d).
 */
test.describe('/media borrado de un asset (contrato P6, Fase 6d)', () => {
	async function goToMediaWithSeed(page: import('@playwright/test').Page): Promise<void> {
		await loginAsDemo(page, { seedMedia: true });
		await page.waitForURL('**/c/site_info/new');
		await goToMedia(page);
	}

	test('el botón "Borrar" abre el aviso HONESTO (D-P6.5): cancelar no borra nada', async ({
		page
	}) => {
		await goToMediaWithSeed(page);

		await page.locator('[data-media-item="media_1"]').click();
		const dialog = page.getByRole('dialog', { name: 'Editar medio' });
		await expect(dialog).toBeVisible();

		await dialog.getByRole('button', { name: 'Borrar', exact: true }).click();

		// El aviso NUNCA es un contador de referencias (D-P6.5: `filePerRecord` es copia de bytes,
		// no hay consulta inversa "quién usa este asset") — la redacción exacta nombra las copias
		// insertadas por la biblioteca, nunca "nada se ve afectado" (matiz del audit H3).
		const confirmDialog = page.getByRole('alertdialog');
		await expect(confirmDialog).toBeVisible();
		await expect(confirmDialog).toContainText('Manual de usuario');
		await expect(confirmDialog).toContainText(
			'Esto elimina el original de la biblioteca. Las copias ya insertadas por la biblioteca en registros no se ven afectadas.'
		);

		await confirmDialog.getByRole('button', { name: 'Cancelar' }).click();
		await expect(confirmDialog).not.toBeVisible();

		// El detalle sigue abierto (cancelar el aviso no cierra el editor de metadatos) y nada se
		// borró: los 3 assets sembrados siguen ahí.
		await expect(dialog).toBeVisible();
		await expect(page.locator('[data-media-item]')).toHaveCount(3);
	});

	// Paridad con `e2e/delete.spec.ts` (P4, mismo patrón `DeleteConfirm`): la cabecera de
	// `MediaDeleteConfirm.svelte` documenta en detalle el foco inicial/trap/Esc y la coordinación
	// con la trampa de `MediaDetail` (guard `if (confirmingDelete) return;`) — sin estas 3 pruebas,
	// una regresión en ese guard (p.ej. quitarlo) pasaría el resto de la suite sin que nada la cace.
	test('foco inicial en "Cancelar" al abrir el aviso (control SEGURO, nunca "Borrar")', async ({
		page
	}) => {
		await goToMediaWithSeed(page);

		await page.locator('[data-media-item="media_1"]').click();
		const dialog = page.getByRole('dialog', { name: 'Editar medio' });
		await dialog.getByRole('button', { name: 'Borrar', exact: true }).click();

		const confirmDialog = page.getByRole('alertdialog');
		await expect(confirmDialog).toBeVisible();
		await expect(confirmDialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
	});

	test('Tab cicla DENTRO del aviso, en las dos direcciones, sin escapar al detalle de detrás', async ({
		page
	}) => {
		await goToMediaWithSeed(page);

		await page.locator('[data-media-item="media_1"]').click();
		const dialog = page.getByRole('dialog', { name: 'Editar medio' });
		await dialog.getByRole('button', { name: 'Borrar', exact: true }).click();

		const confirmDialog = page.getByRole('alertdialog');
		const cancelButton = confirmDialog.getByRole('button', { name: 'Cancelar', exact: true });
		const confirmButton = confirmDialog.getByRole('button', { name: 'Borrar', exact: true });
		await expect(cancelButton).toBeFocused();

		// Adelante desde "Cancelar" (foco inicial): al ÚNICO otro control tabbable, "Borrar" — si el
		// foco escapase al detalle de detrás, aterrizaría en un input/botón de `MediaDetail`
		// (p.ej. "Texto alternativo"), nunca en "Borrar".
		await page.keyboard.press('Tab');
		await expect(confirmButton).toBeFocused();

		// Desde el ÚLTIMO elemento, `Tab` envuelve al primero (mismo criterio que el overlay de
		// re-login, `relogin.spec.ts`): la trampa cicla, nunca deja escapar el foco.
		await page.keyboard.press('Tab');
		await expect(cancelButton).toBeFocused();

		// `Shift+Tab` desde el PRIMERO envuelve al último (rama simétrica del mismo guard).
		await page.keyboard.press('Shift+Tab');
		await expect(confirmButton).toBeFocused();
	});

	test('Escape cierra SOLO el aviso: el detalle sigue abierto y no borra nada', async ({
		page
	}) => {
		await goToMediaWithSeed(page);

		await page.locator('[data-media-item="media_1"]').click();
		const dialog = page.getByRole('dialog', { name: 'Editar medio' });
		await dialog.getByRole('button', { name: 'Borrar', exact: true }).click();

		const confirmDialog = page.getByRole('alertdialog');
		await expect(confirmDialog).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(confirmDialog).toBeHidden();

		// El detalle SIGUE abierto (Escape solo cerró el aviso, nunca el editor completo): sin el
		// guard `if (confirmingDelete) return;` de `MediaDetail.handleKeydown`, este MISMO `Escape`
		// también dispararía `requestClose()` del detalle (los dos listeners viven en `document`),
		// cerrándolo de rebote — esta aserción es la que cazaría esa regresión.
		await expect(dialog).toBeVisible();
		await expect(page.locator('[data-media-item]')).toHaveCount(3);
	});

	test('confirmar el borrado: desaparece del grid, con toast, y no reaparece al navegar fuera y volver', async ({
		page
	}) => {
		await goToMediaWithSeed(page);
		await expect(page.locator('[data-media-item]')).toHaveCount(3);

		await page.locator('[data-media-item="media_1"]').click();
		const dialog = page.getByRole('dialog', { name: 'Editar medio' });
		await dialog.getByRole('button', { name: 'Borrar', exact: true }).click();

		const confirmDialog = page.getByRole('alertdialog');
		await confirmDialog.getByRole('button', { name: 'Borrar', exact: true }).click();

		// Éxito: los DOS diálogos se cierran (el de confirmación y el de detalle) y aparece el toast.
		await expect(confirmDialog).not.toBeVisible();
		await expect(dialog).not.toBeVisible();
		await expect(
			page.getByText('"Manual de usuario" se ha borrado de la biblioteca.')
		).toBeVisible();

		const cells = page.locator('[data-media-item]');
		await expect(cells).toHaveCount(2);
		await expect(page.locator('[data-media-item="media_1"]')).toHaveCount(0);

		// Navegar fuera y volver (SPA, sin recargar documento) confirma que el borrado persistió de
		// verdad en ESTE backend: sigue ausente. Un hard reload no sirve de prueba (mismo motivo que
		// la suite de bootstrap, arriba: `memory` no persiste entre recargas por diseño, así que
		// recargaría un backend nuevo sembrado desde cero, con `media_1` de vuelta).
		await page.getByRole('link', { name: 'Información del sitio' }).click();
		await page.waitForURL('**/c/site_info/new');
		await goToMedia(page);
		await expect(page.locator('[data-media-item]')).toHaveCount(2);
		await expect(page.locator('[data-media-item="media_1"]')).toHaveCount(0);
	});

	test('un fallo de "port.delete" se reporta en el banner global; el asset NUNCA se quita de forma optimista', async ({
		page
	}) => {
		await goToMediaWithSeed(page);

		// `__VEGA_FORCE_DELETE_ERROR__` (ya existente, Fase 4e del contrato P4): genérico para
		// CUALQUIER `delete()`, `vega_media` incluido — no hace falta un gancho `__VEGA_FORCE_MEDIA_
		// DELETE_ERROR__` dedicado (ver `session/backend.ts`).
		await page.evaluate(() => {
			(window as unknown as { __VEGA_FORCE_DELETE_ERROR__?: boolean }).__VEGA_FORCE_DELETE_ERROR__ =
				true;
		});

		await page.locator('[data-media-item="media_2"]').click();
		const dialog = page.getByRole('dialog', { name: 'Editar medio' });
		await dialog.getByRole('button', { name: 'Borrar', exact: true }).click();

		const confirmDialog = page.getByRole('alertdialog');
		await confirmDialog.getByRole('button', { name: 'Borrar', exact: true }).click();

		// El error de una MUTACIÓN va por `reportError` (banner global), igual que el borrado de P4
		// (L-P4.4/Audit H6) — nunca una pantalla blanca.
		const banner = page.locator('.vega-global-banner');
		await expect(banner).toBeVisible();
		await expect(banner).toHaveAttribute('role', 'alert');
		await expect(banner).toContainText('referenciado');

		// El aviso se cierra, pero el detalle SIGUE abierto (nada que cerrar, el borrado falló) y el
		// asset nunca se quitó de forma optimista: sigue en el grid tras cerrar el detalle.
		await expect(confirmDialog).not.toBeVisible();
		await expect(dialog).toBeVisible();

		await dialog.getByRole('button', { name: 'Cancelar' }).click();
		await expect(page.locator('[data-media-item]')).toHaveCount(3);
		await expect(page.locator('[data-media-item="media_2"]')).toBeVisible();

		await page.evaluate(() => {
			(window as unknown as { __VEGA_FORCE_DELETE_ERROR__?: boolean }).__VEGA_FORCE_DELETE_ERROR__ =
				false;
		});
	});
});

/**
 * Suite del picker de biblioteca (contrato P6, Fase P6·6e): el botón "Elegir de la biblioteca" del
 * widget `file` de P5 (`FileInput.svelte`) embebiendo `MediaPicker.svelte` — mismo
 * `DEMO_SEED_WITH_MEDIA` que el resto de este fichero (3 assets: `media_1` pdf, `media_2`/`media_3`
 * imágenes), sobre los campos file de `posts` (`coverImage` single+`mimeTypes:['image/*']`,
 * `attachments` múltiple sin restricción de mime — semilla F5-f, `session/demo-seed.ts`).
 */
test.describe('widget file: picker de biblioteca (contrato P6, Fase P6·6e)', () => {
	async function loginWithMediaSeed(page: import('@playwright/test').Page): Promise<void> {
		await loginAsDemo(page, { seedMedia: true });
		await page.waitForURL('**/c/site_info/new');
	}

	test('single (coverImage, accept image/*): filtra el pdf; Insertar añade una COPIA con FileRef propio que sobrevive a borrar el original', async ({
		page
	}) => {
		await loginWithMediaSeed(page);
		await page.goto('/c/posts/new');
		await page.getByLabel('Title').fill('Post con picker de biblioteca');

		const field = page.locator('[data-field="coverImage"]');
		await field.getByRole('button', { name: 'Elegir de la biblioteca', exact: true }).click();

		const dialog = page.getByRole('dialog', { name: 'Elegir de la biblioteca' });
		await expect(dialog).toBeVisible();

		// Filtro `accept` CLIENTE (audit H1): `mimeTypes: ['image/*']` de `coverImage` deja fuera el
		// pdf (`media_1`), aunque el backend nunca lo filtró.
		await expect(dialog.locator('[data-media-item]')).toHaveCount(2);
		await expect(dialog.locator('[data-media-item="media_1"]')).toHaveCount(0);

		await dialog.locator('[data-media-item="media_2"]').click();
		await expect(dialog.locator('[data-media-item="media_2"]')).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		await dialog.getByRole('button', { name: 'Insertar', exact: true }).click();
		await expect(dialog).not.toBeVisible();

		// Se añadió como `File` NUEVO (mismo camino que subir a mano): preview de object URL, un
		// `<img>` real.
		await expect(field.locator('img.vega-file-thumb')).toBeVisible();

		await page.getByRole('button', { name: 'Guardar' }).click();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);

		// Persistido: la preview ahora sale de `ctx.port.fileUrl` (memory: data-URI), no del object
		// URL de antes.
		const savedField = page.locator('[data-field="coverImage"]');
		const src = await savedField.locator('img.vega-file-thumb').getAttribute('src');
		expect(src).toMatch(/^data:image\/png/);

		// INVARIANTE L-P6.8 (copia, no referencia): navega a /media, borra el asset ORIGINAL
		// (`media_2`) de la biblioteca, y confirma que la copia del post SIGUE viéndose al volver —
		// borrar el original nunca rompe una copia ya insertada (D-P6.5).
		await page.getByRole('link', { name: 'Medios', exact: false }).click();
		await page.waitForURL('**/media');
		await page.locator('[data-media-item="media_2"]').click();
		await page
			.getByRole('dialog', { name: 'Editar medio' })
			.getByRole('button', { name: 'Borrar', exact: true })
			.click();
		await page
			.getByRole('alertdialog')
			.getByRole('button', { name: 'Borrar', exact: true })
			.click();
		await expect(page.getByText('se ha borrado de la biblioteca')).toBeVisible();

		// Vuelve al post (SPA, historial del router — nunca `page.goto()`/`page.reload()`, ver nota
		// de cabecera de `e2e/form.spec.ts`: el adaptador `memory` no sobrevive a una carga dura).
		await page.goBack();
		await page.waitForURL(/\/c\/posts\/(?!new)[^/]+$/);
		const reloadedField = page.locator('[data-field="coverImage"]');
		await expect(reloadedField.locator('img.vega-file-thumb')).toBeVisible();
		await expect(reloadedField.locator('img.vega-file-thumb')).toHaveAttribute('src', src ?? '');
	});

	test('single: elegir OTRO asset antes de "Insertar" reemplaza la selección (selección única)', async ({
		page
	}) => {
		await loginWithMediaSeed(page);
		await page.goto('/c/posts/new');
		await page.getByLabel('Title').fill('Post con selección única');

		const field = page.locator('[data-field="coverImage"]');
		await field.getByRole('button', { name: 'Elegir de la biblioteca', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Elegir de la biblioteca' });

		const first = dialog.locator('[data-media-item="media_2"]');
		const second = dialog.locator('[data-media-item="media_3"]');
		await first.click();
		await expect(first).toHaveAttribute('aria-pressed', 'true');

		await second.click();
		await expect(second).toHaveAttribute('aria-pressed', 'true');
		await expect(first).toHaveAttribute('aria-pressed', 'false');

		await dialog.getByRole('button', { name: 'Insertar', exact: true }).click();
		await expect(dialog).not.toBeVisible();
		// Un ÚNICO fichero en el campo (single, no acumula el reemplazado).
		await expect(field.locator('img.vega-file-thumb')).toHaveCount(1);
	});

	test('Cancelar no añade nada: el campo sigue vacío', async ({ page }) => {
		await loginWithMediaSeed(page);
		await page.goto('/c/posts/new');
		await page.getByLabel('Title').fill('Post con cancelar el picker');

		const field = page.locator('[data-field="coverImage"]');
		await field.getByRole('button', { name: 'Elegir de la biblioteca', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Elegir de la biblioteca' });

		await dialog.locator('[data-media-item="media_2"]').click();
		await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
		await expect(dialog).not.toBeVisible();

		await expect(field.locator('img.vega-file-thumb')).toHaveCount(0);
		await expect(field.locator('.vega-file-empty')).toBeVisible();
	});

	test('múltiple (attachments, sin accept): seleccionar 2 e insertar añade AMBOS ficheros nuevos', async ({
		page
	}) => {
		await loginWithMediaSeed(page);
		await page.goto('/c/posts/new');
		await page.getByLabel('Title').fill('Post con picker múltiple');

		const field = page.locator('[data-field="attachments"]');
		await field.getByRole('button', { name: 'Elegir de la biblioteca', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Elegir de la biblioteca' });

		// Sin `accept` (attachments no restringe mime): los 3 assets sembrados aparecen, pdf incluido.
		await expect(dialog.locator('[data-media-item]')).toHaveCount(3);

		await dialog.locator('[data-media-item="media_2"]').click();
		await dialog.locator('[data-media-item="media_3"]').click();
		await expect(dialog.locator('[data-media-item="media_2"]')).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(dialog.locator('[data-media-item="media_3"]')).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		await dialog.getByRole('button', { name: 'Insertar', exact: true }).click();
		await expect(dialog).not.toBeVisible();

		// Ambas imágenes entran como `File` nuevo (clasificadas por mime real, no por extensión):
		// dos thumbs, no chips.
		await expect(field.locator('img.vega-file-thumb')).toHaveCount(2);
	});

	test('navegar (SPA, browser back) con el picker abierto lo cierra solo: sin "dead click" flotando tras volver (fix de code-review 6e)', async ({
		page
	}) => {
		await loginWithMediaSeed(page);

		// Llega a `/c/posts/post_1` por clics REALES (SPA), para que `page.goBack()` de más abajo
		// tenga una entrada de historial de verdad a la que volver — nunca `page.goto()` a mitad de
		// test (sería una carga DURA, ver nota de cabecera de `e2e/form.spec.ts`).
		await page.getByRole('link', { name: 'Entradas' }).click();
		await page.waitForURL('**/c/posts');
		await page.getByRole('link', { name: 'Bienvenido a Vega' }).click();
		await page.waitForURL('**/c/posts/post_1');

		const field = page.locator('[data-field="coverImage"]');
		await field.getByRole('button', { name: 'Elegir de la biblioteca', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Elegir de la biblioteca' });
		await expect(dialog).toBeVisible();

		// A mitad de gesto (elegido, sin llegar a pulsar "Insertar") — el caso real que motivó el
		// fix: una petición `open()` en vuelo cuando el usuario navega.
		await dialog.locator('[data-media-item="media_2"]').click();

		// `page.goBack()` (botón de atrás del navegador, NUNCA un clic dentro de la página — el
		// backdrop del modal bloquea cualquier clic de fondo, así que esta es la única vía real por
		// la que un usuario navega con el diálogo abierto): SvelteKit lo intercepta como navegación
		// SPA (mismo `afterNavigate` que el resto del router), sin recargar el documento.
		await page.goBack();
		await page.waitForURL('**/c/posts');

		// El picker se cerró SOLO (`afterNavigate` → `mediaPickerState.settle(null)`,
		// `+layout.svelte`): no queda flotando sobre la vista nueva, tapándola.
		await expect(dialog).toHaveCount(0);
	});

	test('buscador (server-side, alt/title): filtra a los assets que coinciden', async ({ page }) => {
		await loginWithMediaSeed(page);
		await page.goto('/c/posts/new');
		await page.getByLabel('Title').fill('Post con búsqueda en el picker');

		const field = page.locator('[data-field="attachments"]');
		await field.getByRole('button', { name: 'Elegir de la biblioteca', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Elegir de la biblioteca' });
		await expect(dialog.locator('[data-media-item]')).toHaveCount(3);

		// `media_2.title === 'Foto de portada'`: único que coincide con "portada".
		await dialog.getByLabel('Buscar por título o texto alternativo').fill('portada');
		await expect(dialog.locator('[data-media-item]')).toHaveCount(1);
		await expect(dialog.locator('[data-media-item="media_2"]')).toBeVisible();

		// Vaciar el buscador restaura los 3.
		await dialog.getByLabel('Buscar por título o texto alternativo').fill('');
		await expect(dialog.locator('[data-media-item]')).toHaveCount(3);
	});
});
