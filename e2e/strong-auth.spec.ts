import { expect, test } from '@playwright/test';

test('auth fuerte: passkey visible y password abre el segundo paso TOTP/recuperación', async ({
	page
}) => {
	await page.route('**/vega.config.json', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				authCollection: 'vega_editors',
				authApiBasePath: '/api/vega-auth'
			})
		});
	});
	await page.route('**/api/vega-auth/login/password', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				mfa_required: true,
				pending: 'pending-e2e',
				methods: ['totp', 'recovery']
			})
		});
	});

	await page.goto('/login');
	await expect(page.getByRole('button', { name: 'Entrar con passkey' })).toBeVisible();
	await page.getByLabel('Correo electrónico').fill('editor@example.com');
	await page.getByLabel('Contraseña').fill('secret');
	await page.getByRole('button', { name: 'Entrar', exact: true }).click();

	await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible();
	await expect(page.getByLabel('Código de la app de autenticación')).toBeVisible();
	await page.getByText('Usar un código de recuperación').click();
	await expect(page.getByLabel('Código de recuperación')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Cancelar y volver al login' })).toBeVisible();
});
