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
	 *
	 * Bajo el formulario, un `<details>` discreto ("¿PocketBase en otro servidor?") aloja
	 * `BackendUrlForm.svelte` (lote L5, distribución/onboarding genérico): es el sitio donde un
	 * primer arranque SIN sesión puede apuntar Vega a un PocketBase remoto, sin editar
	 * `vega.config.json` ni recompilar. Cerrado por defecto (`<details>` sin `open`): no distrae
	 * el caso común (same-origin).
	 *
	 * **Indicador de servidor (#l12-ux, item 1)**: ANTES de que el usuario meta credenciales, una
	 * línea discreta bajo el título dice a qué backend se conectaría el login — mismo origen o un
	 * PocketBase remoto (override de `localStorage`/`vega.config.json`, ver `backend-config.ts`).
	 * Reutiliza `connect.current.sameOrigin`/`connect.current.override`, los MISMOS strings que ya
	 * pinta `BackendUrlForm.svelte` un poco más abajo — nunca un texto nuevo para decir lo mismo.
	 * `resolveDisplayBackendUrl()` (`backend.ts`) es puramente informativo: no instancia el
	 * `BackendPort`, solo resuelve el mismo seam de 3 niveles para mostrar. `null` en modo demo
	 * (adaptador `memory`, e2e/build pública P8, ver su cabecera) → sin indicador, nunca un dato
	 * inventado (P3-L3).
	 */
	import { onMount } from 'svelte';
	import { getSessionContext } from '$lib/session/session.svelte';
	import { resolveDisplayBackendUrl } from '$lib/session/backend';
	import { resolveLocale, t as translate } from '$lib/i18n';
	import BackendUrlForm from '$lib/session/BackendUrlForm.svelte';

	const sessionStore = getSessionContext();

	const locale = resolveLocale(null, typeof navigator !== 'undefined' ? navigator.language : null);
	function t(key: string, params?: Record<string, string | number>): string {
		return translate(locale, key, params);
	}

	let email = $state('');
	let password = $state('');
	let submitting = $state(false);

	/** `undefined` mientras se resuelve (aún sin pintar nada); `null` = modo demo, sin servidor que
	 *  mostrar (ver cabecera); string = la URL resuelta o el marcador de same-origin. */
	let displayBackendUrl = $state<string | null | undefined>(undefined);

	onMount(() => {
		void resolveDisplayBackendUrl().then((url) => {
			displayBackendUrl = url;
		});
	});

	/** El indicador solo se pinta con una URL ya resuelta (`string`), NUNCA mientras
	 *  `displayBackendUrl` sigue en `undefined` (resolución en vuelo) ni en modo demo (`null`, ver
	 *  cabecera): un hueco vacío es más honesto que un texto que parpadea o que miente. */
	const isSameOrigin = $derived(
		typeof window !== 'undefined' && displayBackendUrl === window.location.origin
	);

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

		{#if typeof displayBackendUrl === 'string'}
			<p class="vega-login-server" data-testid="login-server-indicator">
				{isSameOrigin
					? t('connect.current.sameOrigin')
					: t('connect.current.override', { url: displayBackendUrl })}
			</p>
		{/if}

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

	<details class="vega-login-connect">
		<summary>{t('connect.disclosureLabel')}</summary>
		<BackendUrlForm {t} />
	</details>
</div>

<style>
	.vega-login {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 15vh;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
		max-width: 22rem;
		padding: 1.5rem;
		border: 1px solid var(--line);
		border-radius: 8px;
	}

	h1 {
		margin: 0;
		font-size: 1.2rem;
	}

	/* Indicador de servidor (#l12-ux, item 1): discreto, mono (mismo criterio de "solo lectura,
	   informativo" que `.vega-connection-status` de la topbar) — no compite con el formulario, pero
	   está visible ANTES de meter credenciales, sin tener que abrir el disclosure de abajo. */
	.vega-login-server {
		margin: -0.5rem 0 0;
		font-family: var(--mono);
		font-size: 0.75rem;
		color: var(--ink-2);
		overflow-wrap: break-word;
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
		border: 1px solid var(--line);
		border-radius: 6px;
		font-size: 1rem;
	}

	input[aria-invalid='true'] {
		border-color: var(--danger);
	}

	.vega-login-error {
		margin: 0;
		color: var(--danger);
		font-size: 0.9rem;
	}

	button {
		padding: 0.55rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--accent);
		color: var(--accent-ink);
		font-weight: 600;
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.vega-login-connect {
		width: 100%;
		max-width: 22rem;
		margin-top: 1rem;
		padding: 0 0.25rem;
		font-size: 0.85rem;
	}

	.vega-login-connect summary {
		cursor: pointer;
		color: var(--ink-2);
	}

	.vega-login-connect[open] summary {
		margin-bottom: 0.75rem;
	}
</style>
