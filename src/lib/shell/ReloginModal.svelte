<script lang="ts">
	/**
	 * `ReloginModal.svelte` (Fase 2c, §3.1.3/§3.1.4/§4.1/§4.3 del contrato P3, D-P3.2-a): overlay
	 * de re-login NO DESTRUCTIVO. Se muestra en cuanto `sessionStore.expired` es `true` — lo marca
	 * `onAuthChange('expired')` (P1, EXACTAMENTE una vez, §3.1.3/L7), o el gancho de e2e
	 * `window.__VEGA_FORCE_EXPIRE__` (ver `session/backend.ts`) — TAPA la vista actual SIN navegar
	 * a `/login` ni desmontar nada: `sessionStore.session` sigue siendo no-nulo (el guard de rutas
	 * de `+layout.svelte` nunca expulsa), así que el estado en memoria de cualquier parte de
	 * contenido (P5, fases posteriores) permanece intacto (P3-L5).
	 *
	 * Diálogo modal REAL (§4.3) — a diferencia del overlay de sidebar (2b), que SÍ cierra con
	 * `Esc`: aquí `Esc` está DESHABILITADO, porque el diálogo es obligatorio mientras la sesión
	 * siga caducada (no hay "cancelar" posible, solo reautenticar). `role="dialog"` +
	 * `aria-modal="true"` + foco atrapado; el resto de la carcasa (`#vega-app-shell`, ver
	 * `AppShell.svelte`) se marca `inert` mientras está abierto.
	 *
	 * Pasos: los MISMOS que `/login`, sobre el mismo `createLoginFlow` (`login-flow.svelte.ts`),
	 * sin copia propia de la lógica. Contraseña; si la cuenta tiene segundo factor el backend abre
	 * un reto (`sessionStore.mfaChallenge`) y el overlay pasa al paso de TOTP / código de
	 * recuperación; y, cuando la instancia ofrece auth fuerte (`strongAuthAvailable`), un botón de
	 * passkey para quien no tiene contraseña que teclear. Sin la extensión `vegaauth` nunca hay reto
	 * ni botón de passkey y el overlay es el formulario de contraseña de siempre.
	 *
	 * Estados (§4.1): idle (formulario vacío) · enviando (`flow.submitting`) · segundo factor
	 * pendiente · error (`flow.errorMessage`, mismo mapeo por `kind` que `/login`) · éxito.
	 *
	 * **Cuándo se da por resuelto**: SOLO cuando un envío devuelve `true`, que el `SessionStore`
	 * reserva para la llamada que obtuvo una sesión nueva. NUNCA mirando `sessionStore.session`:
	 * con la sesión caducada sigue siendo la antigua (no-nula a propósito, es lo que impide que el
	 * guard de rutas desmonte la vista), así que una contraseña correcta con el segundo factor aún
	 * pendiente parecía una entrada completa, el overlay se cerraba y el siguiente guardado volvía a
	 * dar 401. Con éxito se llama `clearExpired()` (P1 NO resetea `expired` al recibir
	 * `reason: 'login'`, ver `session.svelte.ts`) y el flujo vacía sus campos.
	 */
	import { untrack } from 'svelte';
	import { getSessionContext } from '$lib/session/session.svelte';
	import { createLoginFlow } from '$lib/session/login-flow.svelte';
	import { resolveLocale, t as translate } from '$lib/i18n';

	const sessionStore = getSessionContext();

	// Mismo criterio que `/login` (§2.5): resuelve el locale sin depender de `VegaAppContext` (que
	// este overlay no necesita para nada más), cayendo a `navigator.language`.
	const locale = resolveLocale(null, typeof navigator !== 'undefined' ? navigator.language : null);
	function t(key: string, params?: Record<string, string | number>): string {
		return translate(locale, key, params);
	}

	const flow = createLoginFlow(sessionStore, t);

	const open = $derived(sessionStore.expired);
	const challenge = $derived(sessionStore.mfaChallenge);

	/** Éxito (§4.1): descarta el overlay. El resto de la vista de debajo nunca se desmontó, así que
	 *  "restaurar" es simplemente dejar de taparla. Con `false` (fallo, o contraseña válida con el
	 *  segundo factor pendiente) el overlay se queda donde está. */
	function settle(authenticated: boolean): void {
		if (authenticated) sessionStore.clearExpired();
	}

	async function handleSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		settle(await flow.submitPassword());
	}

	async function handleTotp(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		settle(await flow.submitTotp());
	}

	async function handleRecovery(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		settle(await flow.submitRecovery());
	}

	async function handlePasskey(): Promise<void> {
		settle(await flow.submitPasskey());
	}

	// ————— Diálogo modal real (§4.3): foco atrapado, `Esc` deshabilitado, fondo `inert` —————
	let dialogEl = $state<HTMLElement | null>(null);
	let firstFieldEl = $state<HTMLInputElement | null>(null);
	// Campos del segundo paso. El foco va al del TOTP, o al de recuperación si es el único método
	// (con TOTP presente, el de recuperación vive en un `<details>` cerrado y no es enfocable).
	let totpFieldEl = $state<HTMLInputElement | null>(null);
	let recoveryFieldEl = $state<HTMLInputElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	function focusableItems(): HTMLElement[] {
		if (!dialogEl) return [];
		return Array.from(
			dialogEl.querySelectorAll<HTMLElement>(
				'input:not([disabled]), button:not([disabled]), summary'
			)
		).filter(
			// Lo que hay dentro de un `<details>` cerrado (el formulario de recuperación) no recibe
			// foco: contarlo como "último" rompería la vuelta del `Tab`. Su `<summary>` sí cuenta.
			(el) => el.tagName === 'SUMMARY' || !el.closest('details:not([open])')
		);
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			// A propósito, a diferencia del overlay de sidebar (2b): `Esc` NUNCA cierra este
			// diálogo mientras sea obligatorio (§4.3) — solo se descarta reautenticando con éxito.
			// `stopPropagation`: el listener de `Esc` de `Sidebar.svelte` vive también en `document`
			// (y `inert` no bloquea listeners globales), así que sin esto un `Esc` cerraría la
			// sidebar overlay de fondo en silencio mientras este diálogo es obligatorio.
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (event.key !== 'Tab') return;
		const items = focusableItems();
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (!open) return;

		previouslyFocused = document.activeElement as HTMLElement | null;
		// El overlay arranca SIEMPRE en el paso de contraseña y sin error heredado: un reto o un
		// mensaje que quedaran de un intento anterior no describen esta caducidad. `untrack`, y el
		// foco inicial en el efecto de abajo y no aquí: este efecto solo puede depender de `open`.
		// Si leyera los campos (que se desmontan y remontan al cambiar de paso) se volvería a
		// ejecutar a mitad de la entrada y cancelaría el reto del segundo factor recién abierto.
		untrack(() => flow.cancelMfa());

		// `#vega-app-shell` es un HERMANO de este componente (montado en `+layout.svelte`, fuera
		// del árbol de `AppShell.svelte`): se marca `inert` desde aquí porque solo este componente
		// sabe cuándo el overlay está abierto (ver cabecera de `AppShell.svelte`).
		const shellEl = document.getElementById('vega-app-shell');
		if (shellEl) shellEl.inert = true;

		document.addEventListener('keydown', handleKeydown, true);
		return () => {
			document.removeEventListener('keydown', handleKeydown, true);
			if (shellEl) shellEl.inert = false;
			previouslyFocused?.focus();
		};
	});

	// Foco al abrir (§4.3) y en cada cambio de paso: el campo enfocado desaparece del DOM y el foco
	// caería a `<body>`, fuera del diálogo, así que se lleva al primer campo del paso recién
	// pintado. Declarado DESPUÉS del efecto de arriba, que necesita leer `document.activeElement`
	// antes de que este lo mueva.
	$effect(() => {
		if (!open) return;
		if (challenge) (totpFieldEl ?? recoveryFieldEl)?.focus();
		else firstFieldEl?.focus();
	});
</script>

{#if open}
	<div class="vega-relogin-backdrop">
		<div
			class="vega-relogin-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="vega-relogin-title"
			aria-busy={flow.submitting}
			data-relogin-state={challenge ? 'mfa' : 'password'}
			bind:this={dialogEl}
		>
			<h2 id="vega-relogin-title">{t('session.reloginTitle')}</h2>

			{#if challenge}
				{@const totp = challenge.methods.includes('totp')}
				<p>{t('login.mfa.body')}</p>

				{#if totp}
					<form onsubmit={handleTotp} novalidate>
						<div class="field">
							<label for="relogin-totp">{t('login.mfa.totpLabel')}</label>
							<input
								id="relogin-totp"
								name="totp"
								type="text"
								inputmode="numeric"
								autocomplete="one-time-code"
								pattern="[0-9]*"
								maxlength="6"
								required
								aria-invalid={flow.errorMessage ? 'true' : undefined}
								aria-describedby={flow.errorMessage ? 'relogin-error' : undefined}
								bind:value={flow.totpCode}
								bind:this={totpFieldEl}
							/>
						</div>
						<button type="submit" disabled={flow.submitting}>
							{flow.submitting ? t('login.mfa.verifying') : t('login.mfa.verify')}
						</button>
					</form>
				{/if}

				{#if challenge.methods.includes('recovery')}
					<!-- Sin TOTP el código de recuperación es el único camino: se pinta ya abierto. -->
					<details class="vega-relogin-recovery" open={!totp}>
						<summary>{t('login.mfa.useRecovery')}</summary>
						<form onsubmit={handleRecovery} novalidate>
							<div class="field">
								<label for="relogin-recovery">{t('login.mfa.recoveryLabel')}</label>
								<input
									id="relogin-recovery"
									name="recovery"
									type="text"
									autocomplete="off"
									placeholder="XXXXX-XXXXX"
									required
									aria-invalid={flow.errorMessage ? 'true' : undefined}
									aria-describedby={flow.errorMessage ? 'relogin-error' : undefined}
									bind:value={flow.recoveryCode}
									bind:this={recoveryFieldEl}
								/>
							</div>
							<button type="submit" disabled={flow.submitting}>
								{t('login.mfa.recoverySubmit')}
							</button>
						</form>
					</details>
				{/if}

				{#if flow.errorMessage}
					<p id="relogin-error" class="vega-relogin-error" role="alert">{flow.errorMessage}</p>
				{/if}

				<button
					type="button"
					class="vega-relogin-secondary"
					disabled={flow.submitting}
					onclick={() => flow.cancelMfa()}
				>
					{t('session.reloginBackToPassword')}
				</button>
			{:else}
				<p>{t('session.reloginBody')}</p>

				<form onsubmit={handleSubmit} novalidate>
					<div class="field">
						<label for="relogin-email">{t('login.email')}</label>
						<input
							id="relogin-email"
							name="email"
							type="email"
							autocomplete="username"
							required
							aria-invalid={flow.errorMessage ? 'true' : undefined}
							aria-describedby={flow.errorMessage ? 'relogin-error' : undefined}
							bind:value={flow.email}
							bind:this={firstFieldEl}
						/>
					</div>

					<div class="field">
						<label for="relogin-password">{t('login.password')}</label>
						<input
							id="relogin-password"
							name="password"
							type="password"
							autocomplete="current-password"
							required
							aria-invalid={flow.errorMessage ? 'true' : undefined}
							aria-describedby={flow.errorMessage ? 'relogin-error' : undefined}
							bind:value={flow.password}
						/>
					</div>

					{#if flow.errorMessage}
						<p id="relogin-error" class="vega-relogin-error" role="alert">{flow.errorMessage}</p>
					{/if}

					<button type="submit" disabled={flow.submitting}>
						{flow.submitting ? t('login.submitting') : t('session.reloginSubmit')}
					</button>
				</form>

				{#if sessionStore.strongAuthAvailable}
					<!-- Quien entra solo con passkey no tiene contraseña que teclear arriba. -->
					<div class="vega-relogin-alternative">
						<span>{t('login.or')}</span>
						<button
							type="button"
							class="vega-relogin-secondary"
							disabled={flow.submitting}
							onclick={handlePasskey}
						>
							{t('login.passkey')}
						</button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<style>
	.vega-relogin-backdrop {
		position: fixed;
		z-index: 80;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--vega-space-gutter);
		/* Scrim theme-independiente (§3 no tiene token de velo) — allowlisted en
		   check-theme-coverage.mjs. */
		background: rgb(15 17 21 / 55%);
	}

	.vega-relogin-dialog {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
		max-width: 22rem;
		padding: 1.5rem;
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-card);
	}

	.vega-relogin-dialog h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.vega-relogin-dialog p {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.9rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 0.25rem;
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
		background: var(--surface);
		color: var(--ink);
	}

	input[aria-invalid='true'] {
		border-color: var(--danger);
	}

	.vega-relogin-error {
		margin: 0;
		color: var(--danger);
		font-size: 0.9rem;
	}

	button[type='submit'] {
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

	.vega-relogin-secondary {
		padding: 0.55rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		font-weight: 600;
		cursor: pointer;
	}

	.vega-relogin-alternative {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		color: var(--ink-2);
		font-size: 0.8rem;
		text-align: center;
	}

	.vega-relogin-recovery summary {
		color: var(--ink-2);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-relogin-recovery[open] summary {
		margin-bottom: 0.5rem;
	}
</style>
