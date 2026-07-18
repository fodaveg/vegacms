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
	 * Estados (§4.1): idle (formulario vacío) · enviando (`submitting`) · error de credenciales
	 * (`errorMessage`, mismo mapeo por `kind` que `/login`) · éxito (se descarta y restaura: tras
	 * un `login()` que deja `session` no-nulo y sin `loginError`, se llama `clearExpired()` — P1
	 * NO resetea `expired` al recibir `reason: 'login'`, ver `session.svelte.ts` — y se limpia el
	 * formulario).
	 */
	import { getSessionContext } from '$lib/session/session.svelte';
	import { resolveLocale, t as translate } from '$lib/i18n';

	const sessionStore = getSessionContext();

	// Mismo criterio que `/login` (§2.5): resuelve el locale sin depender de `VegaAppContext` (que
	// este overlay no necesita para nada más), cayendo a `navigator.language`.
	const locale = resolveLocale(null, typeof navigator !== 'undefined' ? navigator.language : null);
	function t(key: string, params?: Record<string, string | number>): string {
		return translate(locale, key, params);
	}

	let email = $state('');
	let password = $state('');
	let submitting = $state(false);

	const open = $derived(sessionStore.expired);

	// Mapeo honesto por `kind` (§2.3, P3-L3), idéntico al de `/login`: `network` reintentable
	// (el propio botón de enviar es el reintento), `forbidden` con el mensaje neutro de P1 §4.1,
	// cualquier otro fallo de transporte con su `message` real (nunca reinterpretado).
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
		if (sessionStore.session && !sessionStore.loginError) {
			// Éxito (§4.1): descarta el overlay y limpia el formulario. El resto de la vista de
			// debajo nunca se desmontó, así que "restaurar" es simplemente dejar de taparla.
			sessionStore.clearExpired();
			email = '';
			password = '';
		}
	}

	// ————— Diálogo modal real (§4.3): foco atrapado, `Esc` deshabilitado, fondo `inert` —————
	let dialogEl = $state<HTMLElement | null>(null);
	let firstFieldEl = $state<HTMLInputElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	function focusableItems(): HTMLElement[] {
		if (!dialogEl) return [];
		return Array.from(
			dialogEl.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])')
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
		firstFieldEl?.focus();

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
</script>

{#if open}
	<div class="vega-relogin-backdrop">
		<div
			class="vega-relogin-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="vega-relogin-title"
			bind:this={dialogEl}
		>
			<h2 id="vega-relogin-title">{t('session.reloginTitle')}</h2>
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
						aria-invalid={errorMessage ? 'true' : undefined}
						bind:value={email}
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
						aria-invalid={errorMessage ? 'true' : undefined}
						bind:value={password}
					/>
				</div>

				{#if errorMessage}
					<p class="vega-relogin-error" role="alert">{errorMessage}</p>
				{/if}

				<button type="submit" disabled={submitting}>
					{submitting ? t('login.submitting') : t('session.reloginSubmit')}
				</button>
			</form>
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
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
		box-shadow: 0 12px 40px rgb(0 0 0 / 35%);
	}

	.vega-relogin-dialog h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.vega-relogin-dialog p {
		margin: 0;
		color: var(--vega-color-text-muted);
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
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		font-size: 1rem;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
	}

	input[aria-invalid='true'] {
		border-color: var(--vega-color-danger);
	}

	.vega-relogin-error {
		margin: 0;
		color: var(--vega-color-danger);
		font-size: 0.9rem;
	}

	button[type='submit'] {
		padding: 0.55rem 0.9rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		background: var(--vega-color-accent);
		color: var(--vega-color-accent-contrast);
		font-weight: 600;
		cursor: pointer;
	}

	button[type='submit']:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
</style>
