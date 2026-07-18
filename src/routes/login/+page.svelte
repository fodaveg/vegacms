<script lang="ts">
	/**
	 * `/login` (§2.4, §3.1.2 del contrato P3): única ruta pública. Formulario email+password.
	 * Éxito → el guard de `+layout.svelte` detecta `sessionStore.session` y navega fuera de aquí
	 * (destino previo o índice); esta página no navega por sí misma. `forbidden` → mensaje neutro
	 * (P1 §4.1: nunca revela si el email existe). `network` → mensaje reintentable (el propio
	 * botón "Entrar" es el reintento: no hay estado que perder en un formulario de login).
	 *
	 * No consume `VegaAppContext` (todavía no hay sesión ni modelo): solo `SessionStore`
	 * (`getSessionContext`) y un `t()` local resuelto sin `site.locale` (P2 aún no cargó).
	 */
	import { getSessionContext } from '$lib/session/session.svelte';
	import { resolveLocale, t as translate } from '$lib/i18n';

	const sessionStore = getSessionContext();

	const locale = resolveLocale(null, typeof navigator !== 'undefined' ? navigator.language : null);
	function t(key: string, params?: Record<string, string | number>): string {
		return translate(locale, key, params);
	}

	let email = $state('');
	let password = $state('');
	let submitting = $state(false);

	// Mapeo honesto por `kind` (§2.3, P3-L3): `network` → reintentable; `forbidden` → credenciales
	// no válidas (mensaje neutro de P1 §4.1, no revela si el email existe); cualquier OTRO fallo de
	// transporte (`backend` 5xx, etc.) → su `message` real, NUNCA reinterpretado como credenciales
	// (decir "Credenciales no válidas" ante un 500 haría reintentar contraseñas en vano).
	const errorMessage = $derived.by(() => {
		const err = sessionStore.loginError;
		if (!err) return null;
		if (err.kind === 'network') return t('login.networkError');
		if (err.kind === 'forbidden') return t('login.invalidCredentials');
		return err.message;
	});

	async function handleSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		submitting = true;
		await sessionStore.login({ email, password });
		submitting = false;
	}
</script>

<div class="vega-login">
	<form onsubmit={handleSubmit} novalidate>
		<h1>{t('login.title')}</h1>

		<div class="field">
			<label for="login-email">{t('login.email')}</label>
			<input
				id="login-email"
				name="email"
				type="email"
				autocomplete="username"
				required
				aria-invalid={errorMessage ? 'true' : undefined}
				bind:value={email}
			/>
		</div>

		<div class="field">
			<label for="login-password">{t('login.password')}</label>
			<input
				id="login-password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
				aria-invalid={errorMessage ? 'true' : undefined}
				bind:value={password}
			/>
		</div>

		{#if errorMessage}
			<p class="vega-login-error" role="alert">{errorMessage}</p>
		{/if}

		<button type="submit" disabled={submitting}>
			{submitting ? t('login.submitting') : t('login.submit')}
		</button>
	</form>
</div>

<style>
	.vega-login {
		display: flex;
		justify-content: center;
		padding-top: 15vh;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
		max-width: 22rem;
		padding: 1.5rem;
		border: 1px solid var(--vega-color-border, #d9dde3);
		border-radius: 8px;
	}

	h1 {
		margin: 0;
		font-size: 1.2rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	label {
		font-size: 0.85rem;
		font-weight: 600;
	}

	input {
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--vega-color-border, #b0b0b0);
		border-radius: 6px;
		font-size: 1rem;
	}

	input[aria-invalid='true'] {
		border-color: var(--vega-color-danger, #c1121f);
	}

	.vega-login-error {
		margin: 0;
		color: var(--vega-color-danger, #c1121f);
		font-size: 0.9rem;
	}

	button {
		padding: 0.55rem 0.9rem;
		border: 1px solid var(--vega-color-border, #888);
		border-radius: 6px;
		background: var(--vega-color-accent, #2f6fed);
		color: var(--vega-color-accent-contrast, #fff);
		font-weight: 600;
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
</style>
