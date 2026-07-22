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
	import VegaLogo from '$lib/shell/VegaLogo.svelte';

	const sessionStore = getSessionContext();

	const locale = resolveLocale(null, typeof navigator !== 'undefined' ? navigator.language : null);
	function t(key: string, params?: Record<string, string | number>): string {
		return translate(locale, key, params);
	}

	let email = $state('');
	let password = $state('');
	let totpCode = $state('');
	let recoveryCode = $state('');
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
		if (err.kind === 'forbidden') {
			return sessionStore.mfaChallenge ? t('login.mfa.invalidCode') : t('login.invalidCredentials');
		}
		return err.message;
	});

	async function handleSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		submitting = true;
		await sessionStore.login({ email, password });
		submitting = false;
	}

	async function handleTotp(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		submitting = true;
		await sessionStore.loginWithTotp(totpCode);
		submitting = false;
	}

	async function handleRecovery(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		submitting = true;
		await sessionStore.loginWithRecovery(recoveryCode);
		submitting = false;
	}

	async function handlePasskey(): Promise<void> {
		submitting = true;
		await sessionStore.loginWithPasskey();
		submitting = false;
	}
</script>

<svelte:head>
	<title>Vega — {t('login.title')}</title>
</svelte:head>

<main class="vega-login-shell">
	<section class="vega-login-brand" aria-hidden="true" data-testid="login-brand">
		<div class="vega-brand-orbit">
			<VegaLogo size={132} />
		</div>
		<p>Vega</p>
		<span class="vega-brand-rule"></span>
	</section>

	<section class="vega-login-access">
		<div class="vega-mobile-brand" aria-hidden="true">
			<VegaLogo size={28} />
			<span>Vega</span>
		</div>

		{#if sessionStore.mfaChallenge}
			<div class="vega-login-card" data-login-state="mfa" aria-busy={submitting}>
				<header class="vega-login-heading">
					<p>Vega</p>
					<h1>{t('login.mfa.title')}</h1>
					<span>{t('login.mfa.body')}</span>
				</header>

				{#if sessionStore.mfaChallenge.methods.includes('totp')}
					<form class="vega-factor-form" onsubmit={handleTotp} novalidate>
						<div class="field">
							<label for="login-totp">{t('login.mfa.totpLabel')}</label>
							<input
								id="login-totp"
								name="totp"
								type="text"
								inputmode="numeric"
								autocomplete="one-time-code"
								pattern="[0-9]*"
								maxlength="6"
								required
								aria-invalid={errorMessage ? 'true' : undefined}
								aria-describedby={errorMessage ? 'login-error' : undefined}
								bind:value={totpCode}
							/>
						</div>
						<button class="vega-primary-button" type="submit" disabled={submitting}>
							{submitting ? t('login.mfa.verifying') : t('login.mfa.verify')}
						</button>
					</form>
				{/if}

				{#if sessionStore.mfaChallenge.methods.includes('recovery')}
					<details class="vega-recovery-login">
						<summary>{t('login.mfa.useRecovery')}</summary>
						<form class="vega-factor-form" onsubmit={handleRecovery} novalidate>
							<div class="field">
								<label for="login-recovery">{t('login.mfa.recoveryLabel')}</label>
								<input
									id="login-recovery"
									name="recovery"
									type="text"
									autocomplete="off"
									placeholder="XXXXX-XXXXX"
									required
									aria-invalid={errorMessage ? 'true' : undefined}
									aria-describedby={errorMessage ? 'login-error' : undefined}
									bind:value={recoveryCode}
								/>
							</div>
							<button class="vega-primary-button" type="submit" disabled={submitting}>
								{t('login.mfa.recoverySubmit')}
							</button>
						</form>
					</details>
				{/if}

				{#if errorMessage}
					<p id="login-error" class="vega-login-error" role="alert">{errorMessage}</p>
				{/if}
				<button
					class="vega-secondary-button"
					type="button"
					onclick={() => sessionStore.cancelMfa()}
				>
					{t('login.mfa.cancel')}
				</button>
			</div>
		{:else}
			<div class="vega-login-card" data-login-state="password" aria-busy={submitting}>
				<header class="vega-login-heading">
					<p>Vega</p>
					<h1>{t('login.title')}</h1>
					{#if typeof displayBackendUrl === 'string'}
						<span class="vega-login-server" data-testid="login-server-indicator">
							{isSameOrigin
								? t('connect.current.sameOrigin')
								: t('connect.current.override', { url: displayBackendUrl })}
						</span>
					{/if}
				</header>

				<form class="vega-login-form" onsubmit={handleSubmit} novalidate>
					<div class="field">
						<label for="login-email">{t('login.email')}</label>
						<input
							id="login-email"
							name="email"
							type="email"
							autocomplete="username"
							required
							aria-invalid={errorMessage ? 'true' : undefined}
							aria-describedby={errorMessage ? 'login-error' : undefined}
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
							aria-describedby={errorMessage ? 'login-error' : undefined}
							bind:value={password}
						/>
					</div>

					{#if errorMessage}
						<p id="login-error" class="vega-login-error" role="alert">{errorMessage}</p>
					{/if}

					<button class="vega-primary-button" type="submit" disabled={submitting}>
						{submitting ? t('login.submitting') : t('login.submit')}
					</button>
				</form>

				{#if sessionStore.strongAuthAvailable}
					<div class="vega-login-alternative">
						<span>{t('login.or')}</span>
						<button
							type="button"
							class="vega-secondary-button"
							onclick={handlePasskey}
							disabled={submitting}
						>
							{t('login.passkey')}
						</button>
					</div>
				{/if}
			</div>
		{/if}

		<details class="vega-login-connect">
			<summary>{t('connect.disclosureLabel')}</summary>
			<BackendUrlForm {t} />
		</details>
	</section>
</main>

<style>
	.vega-login-shell {
		position: relative;
		display: grid;
		grid-template-columns: minmax(20rem, 0.85fr) minmax(28rem, 1.15fr);
		min-height: 100vh;
		min-height: 100svh;
		background: var(--bg);
		overflow: hidden;
	}

	.vega-login-brand {
		position: relative;
		isolation: isolate;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.75rem;
		min-height: 100%;
		border-right: 1px solid var(--line);
		background: var(--surface-2);
		color: var(--ink);
		overflow: hidden;
	}

	.vega-login-brand::before {
		position: absolute;
		z-index: -2;
		inset: 0;
		content: '';
		background: var(--halo);
	}

	.vega-login-brand::after {
		position: absolute;
		z-index: -1;
		inset: 0 0 0 auto;
		width: 3px;
		content: '';
		background: var(--sheen);
		opacity: var(--brand-edge-opacity);
	}

	.vega-brand-orbit {
		display: grid;
		width: 13.5rem;
		height: 13.5rem;
		place-items: center;
		border: 1px solid var(--accent-line);
		border-radius: 50%;
		background: var(--paper);
		box-shadow: var(--shadow-card);
	}

	.vega-login-brand p {
		margin: 0;
		color: var(--ink-hi);
		font-family: var(--sans);
		font-size: clamp(2.5rem, 6vw, 5.5rem);
		font-weight: 650;
		letter-spacing: -0.07em;
		line-height: 0.8;
	}

	.vega-brand-rule {
		width: 6.5rem;
		height: 3px;
		border-radius: 999px;
		background: var(--accent-fill);
	}

	.vega-login-access {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-width: 0;
		padding: clamp(2rem, 6vw, 5.5rem);
	}

	.vega-mobile-brand {
		display: none;
		align-items: center;
		gap: 0.65rem;
		margin-bottom: 1.5rem;
		color: var(--ink-hi);
		font-size: 1.1rem;
		font-weight: 650;
		letter-spacing: -0.02em;
	}

	.vega-login-card {
		display: flex;
		flex-direction: column;
		gap: 1.35rem;
		width: min(100%, 27.5rem);
		box-sizing: border-box;
		padding: clamp(1.5rem, 4vw, 2.25rem);
		border: 1px solid var(--accent-line);
		border-radius: calc(var(--r) * 1.5);
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}

	.vega-login-heading {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.vega-login-heading p {
		margin: 0;
		color: var(--accent-text);
		font-family: var(--mono);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.vega-login-heading h1 {
		margin: 0;
		color: var(--ink-hi);
		font-size: clamp(1.45rem, 3vw, 1.85rem);
		font-weight: 650;
		letter-spacing: -0.035em;
		line-height: 1.1;
	}

	.vega-login-heading > span {
		color: var(--ink-2);
		font-size: 0.9rem;
		line-height: 1.45;
	}

	.vega-login-server {
		font-family: var(--mono);
		font-size: 0.75rem;
		overflow-wrap: anywhere;
	}

	.vega-login-form,
	.vega-factor-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	label {
		color: var(--ink-2);
		font-size: 0.82rem;
		font-weight: 650;
	}

	input {
		min-height: 46px;
		box-sizing: border-box;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--r);
		background: var(--paper);
		color: var(--ink);
		font-family: var(--sans);
		font-size: 1rem;
		transition:
			border-color 150ms ease,
			background 150ms ease;
	}

	input::placeholder {
		color: var(--ink-3);
	}

	input:hover {
		border-color: var(--accent-line);
	}

	input:focus-visible {
		border-color: var(--accent);
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	input[aria-invalid='true'] {
		border-color: var(--danger);
	}

	button {
		min-height: 46px;
		box-sizing: border-box;
		padding: 0.65rem 1rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--r);
		font-family: var(--sans);
		font-size: 0.9rem;
		font-weight: 680;
		cursor: pointer;
		transition:
			transform 150ms ease,
			border-color 150ms ease;
	}

	button:not(:disabled):hover {
		transform: translateY(-1px);
	}

	.vega-primary-button {
		border-color: transparent;
		background: var(--accent-fill);
		color: var(--accent-ink);
	}

	.vega-secondary-button {
		background: var(--surface-2);
		color: var(--ink);
	}

	.vega-secondary-button:hover {
		border-color: var(--accent-line);
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.58;
	}

	.vega-login-error {
		margin: 0;
		padding: 0.7rem 0.8rem;
		border-left: 3px solid var(--danger);
		border-radius: 0 var(--r) var(--r) 0;
		background: var(--danger-soft);
		color: var(--danger);
		font-size: 0.88rem;
		line-height: 1.4;
	}

	.vega-login-alternative {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 0.75rem;
		color: var(--ink-2);
		font-size: 0.8rem;
	}

	.vega-login-alternative::before,
	.vega-login-alternative::after {
		height: 1px;
		content: '';
		background: var(--line);
	}

	.vega-login-alternative .vega-secondary-button {
		grid-column: 1 / -1;
		width: 100%;
	}

	.vega-recovery-login {
		border-top: 1px solid var(--line);
	}

	.vega-recovery-login summary,
	.vega-login-connect summary {
		display: flex;
		align-items: center;
		min-height: 44px;
		color: var(--ink-2);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-recovery-login[open] summary {
		margin-bottom: 0.75rem;
	}

	.vega-login-connect {
		width: min(100%, 27.5rem);
		margin-top: 0.75rem;
		padding: 0 0.25rem;
		box-sizing: border-box;
	}

	.vega-login-connect[open] summary {
		margin-bottom: 0.75rem;
	}

	@media (max-width: 800px) {
		.vega-login-shell {
			display: block;
			min-height: 100svh;
			overflow: auto;
		}

		.vega-login-brand {
			display: none;
		}

		.vega-login-access {
			min-height: 100svh;
			box-sizing: border-box;
			padding: clamp(1rem, 6vw, 3rem);
		}

		.vega-mobile-brand {
			display: flex;
		}
	}

	@media (max-width: 420px) {
		.vega-login-access {
			justify-content: flex-start;
			padding-top: 1.25rem;
		}

		.vega-login-card {
			padding: 1.25rem;
		}

		.vega-mobile-brand {
			align-self: flex-start;
			margin-bottom: 1rem;
		}
	}
</style>
