<script lang="ts">
	/**
	 * `/restablecer?token=…`: pública. Aquí llega un editor desde el correo de invitación o de
	 * restablecimiento (la plantilla de `vega_editors` apunta a esta ruta, ver
	 * `AdministrationPort.ensureInvitationLink`) y elige su contraseña. Existe porque el enlace de
	 * fábrica de PocketBase lleva a su Admin (`/_/`), que un despliegue de Vega puede no servir
	 * (`admin.fodaveg.net` responde 404 a `/_/*`).
	 *
	 * Fuera del shell y sin sesión: el guard de `+layout.svelte` la deja pasar siempre. Pide el
	 * puerto con `getBackend()`, como `/login`, y usa su sección pública
	 * `editorPasswordReset.confirm`, nunca el SDK. El formulario y sus estados viven en
	 * `PasswordResetForm.svelte`.
	 */
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend';
	import { getBackend } from '$lib/session/backend';
	import { loginRoute } from '$lib/nav/routes';
	import PasswordResetForm from '$lib/admin/PasswordResetForm.svelte';

	const ctx = getVegaContext();
	const token = $derived(page.url.searchParams.get('token')?.trim() ?? '');

	/** Confirma con el puerto; `VegaError 'backend'` si este backend no ofrece la sección. */
	async function confirmReset(resetToken: string, password: string): Promise<void> {
		const port = await getBackend();
		if (!port.capabilities.editorPasswordReset || !port.editorPasswordReset) {
			throw VegaError.backend(ctx.t('admin.reset.unavailable'));
		}
		await port.editorPasswordReset.confirm(resetToken, password);
	}
</script>

<main class="vega-reset-shell">
	<PasswordResetForm {token} confirm={confirmReset} loginHref={loginRoute()} />
</main>

<style>
	.vega-reset-shell {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		padding: var(--vega-space-gutter);
		box-sizing: border-box;
		background: var(--bg);
	}
</style>
