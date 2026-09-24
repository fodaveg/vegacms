/**
 * Pantallas de superusuario (lámina del audit, piezas 5 y 6 y sección NAV): `/editores` y
 * `/copias` contra el adaptador `memory` (`DEMO_SEED`, ver `session/demo-seed.ts`: tres cuentas en
 * `vega_editors` —una pendiente y un email largo—, dos copias, sin correo y con una copia que tarda
 * 1,2 s). El camino de red contra PocketBase real lo cubre la suite de contrato
 * (`tests/contract/`), no esta.
 *
 * Tras mutar, siempre por la barra lateral y nunca con `page.goto`: recargaría el adaptador
 * `memory` y perdería lo hecho (cabecera de `session/backend.ts`). El gate de editor usa
 * `loginAsDemo(page, { editorMode: true })`, que apaga `capabilities.administration` y quita la
 * sección del puerto (`withEditorCapabilities`).
 */
import { expect, loginAsDemo, test } from './fixtures';

const SIDEBAR = { name: 'Navegación principal' } as const;

async function goToEditors(page: import('@playwright/test').Page): Promise<void> {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
	await page.getByRole('navigation', SIDEBAR).getByRole('link', { name: 'Editores' }).click();
	await page.waitForURL('**/editores');
	await expect(page.getByRole('heading', { name: 'Editores', level: 1 })).toBeVisible();
}

async function goToBackups(page: import('@playwright/test').Page): Promise<void> {
	await loginAsDemo(page);
	await page.waitForURL('**/c/site_info/new');
	await page.getByRole('navigation', SIDEBAR).getByRole('link', { name: 'Copias' }).click();
	await page.waitForURL('**/copias');
	await expect(page.getByRole('heading', { name: 'Copias de seguridad', level: 1 })).toBeVisible();
}

function editorRow(page: import('@playwright/test').Page, email: string) {
	return page.locator(`tr[data-editor-email="${email}"]`);
}

test.describe('/editores (superusuario)', () => {
	test('listado: recuento, estado por cuenta y email largo recortado con su title', async ({
		page
	}) => {
		await goToEditors(page);

		await expect(page.locator('[data-editors-state="ready"]')).toBeVisible();
		await expect(page.locator('.vega-admin-meta')).toHaveText('3');
		await expect(editorRow(page, 'ana.ruiz@fodaveg.net').getByText('Activo')).toBeVisible();
		await expect(editorRow(page, 'jorge.p@fodaveg.net').getByText('Pendiente')).toBeVisible();
		const long = 'comunicacion.institucional@ayuntamiento-de-villanueva-de-la-canada.es';
		await expect(editorRow(page, long).locator(`[title="${long}"]`)).toBeVisible();

		// Sin correo en el servidor no hay «Reenviar invitación», ni siquiera para la pendiente.
		await expect(page.getByRole('button', { name: /Reenviar la invitación/ })).toHaveCount(0);
	});

	test('alta sin correo: solo contraseña, con su nota, validación al enviar y fila nueva activa', async ({
		page
	}) => {
		await goToEditors(page);

		await page.getByRole('button', { name: 'Añadir editor' }).click();
		const dialog = page.getByRole('dialog', { name: 'Añadir editor' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByLabel('Email')).toBeFocused();
		await expect(dialog.getByText('Este servidor no tiene correo configurado')).toBeVisible();
		await expect(dialog.getByRole('radio')).toHaveCount(0);
		await expect(dialog.getByText('Copiar')).toHaveCount(0);

		const submit = dialog.getByRole('button', { name: 'Añadir editor' });

		await dialog.getByLabel('Email').fill('no-es-un-email');
		await submit.click();
		await expect(dialog.getByText('Escribe un email válido.')).toBeVisible();

		await dialog.getByLabel('Email').fill('ana.ruiz@fodaveg.net');
		await dialog.getByLabel('Contraseña', { exact: true }).fill('huerto');
		await dialog.getByLabel('Repítela').fill('huerto2');
		await submit.click();
		// La ayuda dice lo mismo que el error: se comprueba el ERROR (clase y `aria-invalid`).
		await expect(
			dialog.locator('.vega-admin-field-error', { hasText: 'Mínimo 8 caracteres.' })
		).toBeVisible();
		await expect(dialog.getByLabel('Contraseña', { exact: true })).toHaveAttribute(
			'aria-invalid',
			'true'
		);
		await expect(dialog.getByText('No coincide con la de arriba.')).toHaveCount(0);

		await dialog.getByLabel('Contraseña', { exact: true }).fill('huerto-grande');
		await dialog.getByLabel('Repítela').fill('huerto-grande');
		await submit.click();
		// El email repetido lo rechaza el backend y se pinta en su campo, con el diálogo abierto.
		await expect(dialog.getByText('Ya hay un editor con ese email.')).toBeVisible();

		await dialog.getByLabel('Email').fill('lucia.moreno@fodaveg.net');
		await submit.click();
		await expect(dialog).toHaveCount(0);
		await expect(page.getByText('Editor añadido: lucia.moreno@fodaveg.net.')).toBeVisible();
		await expect(editorRow(page, 'lucia.moreno@fodaveg.net').getByText('Activo')).toBeVisible();
		await expect(page.locator('.vega-admin-meta')).toHaveText('4');
	});

	test('cambiar contraseña: avisa de la sesión, valida al enviar y deja la cuenta activa', async ({
		page
	}) => {
		await goToEditors(page);

		await page
			.getByRole('button', { name: 'Cambiar la contraseña de jorge.p@fodaveg.net' })
			.click();
		const dialog = page.getByRole('dialog', { name: 'Cambiar contraseña' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText('Su sesión abierta se cerrará.')).toBeVisible();
		await expect(dialog.getByLabel('Contraseña nueva')).toBeFocused();

		const save = dialog.getByRole('button', { name: 'Guardar contraseña' });
		await dialog.getByLabel('Contraseña nueva').fill('corta');
		await save.click();
		await expect(
			dialog.locator('.vega-admin-field-error', { hasText: 'Mínimo 8 caracteres.' })
		).toBeVisible();
		await expect(dialog.getByLabel('Contraseña nueva')).toHaveAttribute('aria-invalid', 'true');

		await dialog.getByLabel('Contraseña nueva').fill('una-contraseña-larga');
		await dialog.getByLabel('Repítela').fill('otra-contraseña-larga');
		await save.click();
		await expect(dialog.getByText('No coincide con la de arriba.')).toBeVisible();

		await dialog.getByLabel('Repítela').fill('una-contraseña-larga');
		await save.click();
		await expect(dialog).toHaveCount(0);
		await expect(page.getByText('Contraseña de jorge.p@fodaveg.net cambiada.')).toBeVisible();
		await expect(editorRow(page, 'jorge.p@fodaveg.net').getByText('Activo')).toBeVisible();
	});

	test('Esc cierra un diálogo sin guardar nada', async ({ page }) => {
		await goToEditors(page);
		await page.getByRole('button', { name: 'Añadir editor' }).click();
		const dialog = page.getByRole('dialog', { name: 'Añadir editor' });
		await dialog.getByLabel('Email').fill('nadie@fodaveg.net');
		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
		await expect(editorRow(page, 'nadie@fodaveg.net')).toHaveCount(0);
	});

	test('quitar acceso: confirmación con el foco en Cancelar y la fila desaparece', async ({
		page
	}) => {
		await goToEditors(page);

		await page.getByRole('button', { name: 'Quitar el acceso a jorge.p@fodaveg.net' }).click();
		const confirm = page.getByRole('alertdialog', {
			name: '¿Quitar el acceso a jorge.p@fodaveg.net?'
		});
		await expect(confirm).toBeVisible();
		await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused();

		await confirm.getByRole('button', { name: 'Quitar acceso' }).click();
		await expect(confirm).toHaveCount(0);
		await expect(page.getByText('Acceso de jorge.p@fodaveg.net quitado.')).toBeVisible();
		await expect(editorRow(page, 'jorge.p@fodaveg.net')).toHaveCount(0);
		await expect(page.locator('.vega-admin-meta')).toHaveText('2');
	});
});

test.describe('/copias (superusuario)', () => {
	test('crear: fila en curso con el tiempo, aviso al terminar y la copia nueva arriba', async ({
		page
	}) => {
		await goToBackups(page);

		await expect(page.locator('[data-backup-key]')).toHaveCount(2);
		await page.getByRole('button', { name: 'Crear copia' }).click();

		await expect(page.locator('[data-backups-running]')).toContainText('Creando copia…');
		await expect(page.getByRole('button', { name: 'Creando…' })).toHaveAttribute(
			'aria-disabled',
			'true'
		);

		await expect(page.getByText(/^Copia creada \(.+\)\.$/)).toBeVisible();
		await expect(page.locator('[data-backups-running]')).toHaveCount(0);
		const keys = page.locator('[data-backup-key]');
		await expect(keys).toHaveCount(3);
		await expect(keys.first()).toHaveAttribute('data-backup-key', /^vega_backup_\d{14}\.zip$/);
	});

	test('descargar abre la descarga con el nombre de la copia', async ({ page }) => {
		await goToBackups(page);

		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Descargar antes-de-migrar-a-vega-0-7.zip' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe('antes-de-migrar-a-vega-0-7.zip');
	});
});

test.describe('gate de editor (sin capabilities.administration)', () => {
	test('la barra lateral no enseña Editores ni Copias, y por URL cada ruta enseña su puerta', async ({
		page
	}) => {
		await loginAsDemo(page, { editorMode: true });
		await page.waitForURL('**/c/site_info/new');

		const sidebar = page.getByRole('navigation', SIDEBAR);
		await expect(sidebar.getByRole('link', { name: 'Papelera' })).toBeVisible();
		await expect(sidebar.getByRole('link', { name: 'Editores' })).toHaveCount(0);
		await expect(sidebar.getByRole('link', { name: 'Copias' })).toHaveCount(0);

		await page.goto('/editores');
		const editorsGate = page.locator('[data-admin-state="gated"]');
		await expect(editorsGate.getByText('Solo para superusuarios')).toBeVisible();
		await expect(
			editorsGate.getByText('Gestionar editores exige entrar como superusuario')
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Añadir editor' })).toHaveCount(0);

		await page.goto('/copias');
		const backupsGate = page.locator('[data-admin-state="gated"]');
		await expect(
			backupsGate.getByText('Las copias de seguridad exigen entrar como superusuario')
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Crear copia' })).toHaveCount(0);
	});
});

test.describe('/restablecer (pública, sin sesión)', () => {
	test('sin token no ofrece el formulario; con un token que el backend no reconoce, «ya no sirve»', async ({
		page
	}) => {
		// Sin `loginAsDemo`: quien llega del correo no ha entrado, y el guard no la redirige.
		await page.goto('/restablecer');
		await expect(page.getByRole('heading', { name: 'Este enlace ya no sirve' })).toBeVisible();
		await expect(page.locator('form')).toHaveCount(0);

		await page.goto('/restablecer?token=token-inventado');
		await expect(page).toHaveURL(/\/restablecer\?token=token-inventado$/);
		await expect(page.getByRole('heading', { name: 'Elige tu contraseña' })).toBeVisible();
		await page.getByLabel('Contraseña nueva').fill('la-suya-123');
		await page.getByLabel('Repítela').fill('la-suya-123');
		await page.getByRole('button', { name: 'Guardar contraseña' }).click();
		await expect(page.getByRole('heading', { name: 'Este enlace ya no sirve' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Ir a entrar' })).toHaveAttribute('href', '/login');
	});
});
