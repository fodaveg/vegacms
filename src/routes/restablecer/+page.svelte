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
	 *
	 * El token es una credencial: se lee una sola vez al montar y se quita de la barra de
	 * direcciones (`takeResetToken`), y la página pide `no-referrer` mientras está montada, para que
	 * no acabe en el `Referer` de las peticiones a PocketBase ni en el historial. Recargar la URL ya
	 * limpia deja el formulario en su estado «sin token», que pide volver a abrir el enlace del
	 * correo.
	 */
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend';
	import { getBackend } from '$lib/session/backend';
	import { loginRoute } from '$lib/nav/routes';
	import PasswordResetForm from '$lib/admin/PasswordResetForm.svelte';
	import { takeResetToken } from '$lib/admin/reset-token';

	const ctx = getVegaContext();

	// Valor fijo y no `$derived` de `page.url`: tras limpiar la URL el token solo existe aquí.
	//
	// `history.replaceState` directo y no el `replaceState` de `$app/navigation`: este último lanza
	// «before router is initialized» en la carga inicial, que es justo cuando se llega desde el
	// correo, y esperar al router dejaría el token en la URL durante las primeras peticiones. Se
	// conserva `history.state` para no pisar los índices que SvelteKit guarda ahí; el aviso que
	// SvelteKit imprime en desarrollo por usar la API nativa es esperado.
	const token = takeResetToken(page.url, (cleanUrl) => {
		history.replaceState(history.state, '', cleanUrl);
	});

	/** Confirma con el puerto; `VegaError 'backend'` si este backend no ofrece la sección. */
	async function confirmReset(resetToken: string, password: string): Promise<void> {
		const port = await getBackend();
		if (!port.capabilities.editorPasswordReset || !port.editorPasswordReset) {
			throw VegaError.backend(ctx.t('admin.reset.unavailable'));
		}
		await port.editorPasswordReset.confirm(resetToken, password);
	}
</script>

<svelte:head>
	<meta name="referrer" content="no-referrer" />
</svelte:head>

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
