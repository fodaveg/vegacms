<script lang="ts">
	/**
	 * Gestión de factores fuertes del usuario autenticado (L6): alta/baja de TOTP, códigos de
	 * recuperación de un solo uso y passkeys. El backend sigue siendo la autoridad; esta UI nunca
	 * persiste secretos ni códigos y solo los muestra durante el flujo que los genera.
	 */
	import { onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import type { StepUpMethod, StepUpProof, StrongAuthStatus, TotpEnrollment } from '$lib/backend';
	import { isStrongAuthError, VegaError } from '$lib/backend';
	import StepUpDialog from './StepUpDialog.svelte';
	import { strongAuthErrorMessage } from './strong-auth-errors';

	const ctx = getVegaContext();
	const auth = ctx.port.strongAuth;

	type LoadStatus = 'loading' | 'ready' | 'error';
	let loadStatus = $state<LoadStatus>('loading');
	let security = $state<StrongAuthStatus | null>(null);
	let enrollment = $state<TotpEnrollment | null>(null);
	let verificationCode = $state('');
	let passkeyName = $state('');
	let recoveryCodes = $state<string[]>([]);
	let busyAction = $state<string | null>(null);
	let error = $state<string | null>(null);
	let copied = $state(false);

	/**
	 * Acción que el servidor dejó sin hacer por falta de prueba de posesión. Se guarda ENTERA (su
	 * identificador y la operación) para repetir exactamente la misma en cuanto haya prueba: con
	 * el código que se escriba, o sin él tras verificar con una passkey.
	 */
	interface PendingStepUp {
		action: string;
		operation: (proof?: StepUpProof) => Promise<void>;
		methods: StepUpMethod[];
		returnFocusEl: HTMLElement | null;
	}
	let stepUp = $state<PendingStepUp | null>(null);
	let sectionEl = $state<HTMLElement | null>(null);
	let stepUpBusy = $state(false);
	let stepUpError = $state<string | null>(null);

	async function load(): Promise<void> {
		// `getStatus` refresca el token y el servidor traslada la prueba de posesión al nuevo: una
		// acción protegida en vuelo con el token viejo la perdería. Con una acción en curso (o el
		// diálogo de confirmación abierto) no se recarga.
		if (!auth || busyAction !== null || stepUp !== null) return;
		loadStatus = 'loading';
		error = null;
		try {
			security = await auth.getStatus();
			loadStatus = 'ready';
		} catch (err) {
			error = errorMessage(err);
			loadStatus = 'error';
		}
	}

	onMount(() => {
		void load();
	});

	/** Los rechazos tipados de `strongAuth` traen código y se traducen aquí; el resto, su mensaje. */
	function errorMessage(err: unknown): string {
		return (
			strongAuthErrorMessage(err, ctx.t) ??
			(err instanceof VegaError ? err.message : ctx.t('security.error.generic'))
		);
	}

	/**
	 * Ejecuta una acción de la pantalla. Si el servidor responde que falta la prueba de posesión,
	 * no es un error que enseñar: se abre «Confirma que eres tú» con la acción guardada.
	 */
	async function run(
		action: string,
		operation: (proof?: StepUpProof) => Promise<void>
	): Promise<void> {
		// Deshabilitar la acción durante la petición puede dejar el foco en BODY. Se conserva
		// antes de busyAction, porque el diálogo solo se abrirá al llegar el rechazo del servidor.
		const returnFocusEl = document.activeElement as HTMLElement | null;
		busyAction = action;
		error = null;
		try {
			await operation();
		} catch (err) {
			if (isStrongAuthError(err, 'step-up-required')) {
				stepUpError = null;
				stepUp = { action, operation, methods: err.methods, returnFocusEl };
			} else {
				error = errorMessage(err);
			}
		} finally {
			busyAction = null;
		}
	}

	/**
	 * Repite la acción pendiente una vez hay prueba. Si sale bien, el diálogo se cierra; si no, el
	 * fallo se queda DENTRO del diálogo (código incorrecto, bloqueo por intentos) y la acción sigue
	 * pendiente para el siguiente intento.
	 */
	async function retryStepUp(prove: () => Promise<StepUpProof | undefined>): Promise<void> {
		const pending = stepUp;
		if (!pending || stepUpBusy) return;
		stepUpBusy = true;
		stepUpError = null;
		busyAction = pending.action;
		try {
			const proof = await prove();
			await pending.operation(proof);
			stepUp = null;
		} catch (err) {
			if (
				isStrongAuthError(err, 'enrollment-expired') ||
				isStrongAuthError(err, 'not-enrolled') ||
				(pending.action === 'totp-verify' &&
					isStrongAuthError(err, 'invalid-code') &&
					err.codeSource === 'new')
			) {
				// El alta caducó o hay que corregir su código nuevo, que vive en la pantalla.
				// Solo el servidor distingue ese código de la prueba del autenticador actual.
				stepUp = null;
				error = errorMessage(err);
			} else {
				stepUpError = errorMessage(err);
			}
		} finally {
			stepUpBusy = false;
			busyAction = null;
		}
	}

	function submitStepUpCode(code: string): void {
		void retryStepUp(async () => ({ code }));
	}

	function useStepUpPasskey(): void {
		void retryStepUp(async () => {
			// El servidor recuerda la verificación unos minutos: la acción se repite sin código.
			await auth?.verifyWithPasskey?.();
			return undefined;
		});
	}

	/** Cancelar deja la pantalla como estaba: la acción pendiente se descarta sin tocar nada. */
	function cancelStepUp(): void {
		if (stepUpBusy) return;
		stepUp = null;
		stepUpError = null;
	}

	/**
	 * Alta de TOTP, o cambio de app si ya estaba activo. El servidor NO apaga el TOTP actual al
	 * pedir un secreto nuevo (queda pendiente hasta verificarlo), así que `security` no se toca:
	 * la tarjeta sigue diciendo «Activado» mientras se enseña el secreto nuevo.
	 */
	async function beginTotp(): Promise<void> {
		if (!auth) return;
		await run('totp-enroll', async (proof) => {
			enrollment = await auth.enrollTotp(proof);
			verificationCode = '';
		});
	}

	/** Abandona el alta a medias. En el servidor no cambia nada: el secreto pendiente no se usa. */
	function cancelEnrollment(): void {
		enrollment = null;
		verificationCode = '';
		error = null;
	}

	async function verifyTotp(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!auth) return;
		// Si ya había TOTP, esto es un cambio de app: los códigos de recuperación siguen valiendo
		// y no se regeneran (regenerarlos anularía los que la persona ya guardó).
		const replacing = security?.totpEnabled === true;
		// El código del secreto nuevo se fija ahora; si hay que confirmar la identidad, la prueba
		// (el código del autenticador ACTIVO) viaja aparte y este no cambia.
		const code = verificationCode;
		await run('totp-verify', async (proof) => {
			try {
				await auth.verifyTotp(code, proof);
			} catch (err) {
				if (
					isStrongAuthError(err, 'enrollment-expired') ||
					isStrongAuthError(err, 'not-enrolled')
				) {
					// El servidor ya descartó el secreto pendiente: la pantalla vuelve a como estaba
					// antes de empezar el alta y el aviso dice que hay que empezar de nuevo.
					enrollment = null;
					verificationCode = '';
				}
				throw err;
			}
			// Desde aquí el TOTP ya está activo en el servidor: la UI debe reflejarlo pase lo que pase.
			enrollment = null;
			verificationCode = '';
			try {
				if (replacing) {
					ctx.feedback.toast(ctx.t('security.totp.replaced'), { kind: 'success' });
				} else {
					recoveryCodes = await auth.generateRecoveryCodes();
					ctx.feedback.toast(ctx.t('security.totp.enabled'), { kind: 'success' });
				}
			} catch {
				// «Regenerar códigos» queda disponible en la tarjeta ya activada.
				error = ctx.t('security.totp.enabledNoCodes');
			} finally {
				try {
					security = await auth.getStatus();
				} catch {
					// Sin estado fresco, lo seguro es dejar que la persona lo recargue.
					loadStatus = 'error';
				}
			}
		});
	}

	async function disableTotp(): Promise<void> {
		if (!auth || !window.confirm(ctx.t('security.totp.disableConfirm'))) return;
		await run('totp-disable', async (proof) => {
			await auth.disableTotp(proof);
			recoveryCodes = [];
			security = await auth.getStatus();
			ctx.feedback.toast(ctx.t('security.totp.disabled'), { kind: 'success' });
		});
	}

	async function regenerateRecovery(): Promise<void> {
		if (!auth || !window.confirm(ctx.t('security.recovery.regenerateConfirm'))) return;
		await run('recovery', async (proof) => {
			recoveryCodes = await auth.generateRecoveryCodes(proof);
			security = await auth.getStatus();
		});
	}

	async function copyRecoveryCodes(): Promise<void> {
		try {
			await navigator.clipboard.writeText(recoveryCodes.join('\n'));
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			error = ctx.t('security.recovery.copyError');
		}
	}

	async function registerPasskey(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!auth) return;
		// El nombre se fija ahora: si hay que confirmar la identidad, el reintento registra la
		// passkey con el nombre que se escribió al pedirla.
		const name = passkeyName.trim() || ctx.t('security.passkeys.defaultName');
		await run('passkey-add', async (proof) => {
			await auth.registerPasskey(name, proof);
			passkeyName = '';
			security = await auth.getStatus();
			ctx.feedback.toast(ctx.t('security.passkeys.added'), { kind: 'success' });
		});
	}

	async function deletePasskey(id: string): Promise<void> {
		if (!auth || !window.confirm(ctx.t('security.passkeys.deleteConfirm'))) return;
		await run(`passkey-delete-${id}`, async (proof) => {
			await auth.deletePasskey(id, proof);
			security = await auth.getStatus();
			ctx.feedback.toast(ctx.t('security.passkeys.deleted'), { kind: 'success' });
		});
	}
</script>

{#if auth}
	<section
		class="vega-security"
		aria-labelledby="vega-security-title"
		tabindex="-1"
		bind:this={sectionEl}
	>
		<header>
			<div>
				<h2 id="vega-security-title">{ctx.t('security.title')}</h2>
				<p>{ctx.t('security.description')}</p>
			</div>
			<button
				type="button"
				class="secondary"
				onclick={load}
				disabled={loadStatus === 'loading' || busyAction !== null}
			>
				{ctx.t('security.refresh')}
			</button>
		</header>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		{#if loadStatus === 'loading'}
			<p role="status">{ctx.t('security.loading')}</p>
		{:else if loadStatus === 'error'}
			<button type="button" onclick={load}>{ctx.t('errors.network.retry')}</button>
		{:else if security}
			{#if recoveryCodes.length > 0}
				<div class="recovery-codes" role="status" aria-live="polite">
					<h3>{ctx.t('security.recovery.saveTitle')}</h3>
					<p>{ctx.t('security.recovery.saveBody')}</p>
					<ul>
						{#each recoveryCodes as code (code)}
							<li><code>{code}</code></li>
						{/each}
					</ul>
					<button type="button" class="secondary" onclick={copyRecoveryCodes}>
						{copied ? ctx.t('security.recovery.copied') : ctx.t('security.recovery.copy')}
					</button>
				</div>
			{/if}

			<div class="security-grid">
				<article>
					<div class="card-title">
						<h3>{ctx.t('security.totp.title')}</h3>
						<span class:active={security.totpEnabled}>
							{security.totpEnabled
								? ctx.t('security.status.enabled')
								: ctx.t('security.status.disabled')}
						</span>
					</div>

					{#if enrollment}
						<!-- Va antes que la rama de «activado»: al cambiar de app el TOTP sigue activo
						     (la insignia de arriba no cambia) y aun así hay que enseñar el secreto nuevo. -->
						{#if security.totpEnabled}
							<p class="notice">{ctx.t('security.totp.replaceBody')}</p>
						{/if}
						<p>{ctx.t('security.totp.setupBody')}</p>
						<a class="otpauth-link" href={enrollment.otpauthUrl} rel="external"
							>{ctx.t('security.totp.openApp')}</a
						>
						<code class="secret">{enrollment.secret}</code>
						<form onsubmit={verifyTotp}>
							<label for="security-totp-code">{ctx.t('security.totp.newCodeLabel')}</label>
							<input
								id="security-totp-code"
								type="text"
								inputmode="numeric"
								autocomplete="one-time-code"
								pattern="[0-9]*"
								maxlength="6"
								required
								bind:value={verificationCode}
							/>
							<button type="submit" disabled={busyAction !== null}
								>{ctx.t('security.totp.verify')}</button
							>
							{#if security.totpEnabled}
								<button
									type="button"
									class="secondary"
									onclick={cancelEnrollment}
									disabled={busyAction !== null}
								>
									{ctx.t('security.totp.replaceCancel')}
								</button>
							{/if}
						</form>
					{:else if security.totpEnabled}
						<p>
							{ctx.t('security.recovery.remaining', {
								count: security.recoveryCodesRemaining
							})}
						</p>
						<div class="actions">
							<button
								type="button"
								class="secondary"
								onclick={regenerateRecovery}
								disabled={busyAction !== null}
							>
								{ctx.t('security.recovery.regenerate')}
							</button>
							<button
								type="button"
								class="secondary"
								onclick={beginTotp}
								disabled={busyAction !== null}
							>
								{ctx.t('security.totp.replace')}
							</button>
							<button
								type="button"
								class="danger"
								onclick={disableTotp}
								disabled={busyAction !== null}
							>
								{ctx.t('security.totp.disable')}
							</button>
						</div>
					{:else}
						<p>{ctx.t('security.totp.disabledBody')}</p>
						<button type="button" onclick={beginTotp} disabled={busyAction !== null}>
							{ctx.t('security.totp.enroll')}
						</button>
					{/if}
				</article>

				<article>
					<div class="card-title">
						<h3>{ctx.t('security.passkeys.title')}</h3>
						<span>{security.passkeys.length}</span>
					</div>
					<p>{ctx.t('security.passkeys.body')}</p>
					{#if security.passkeys.length > 0}
						<ul class="passkey-list">
							{#each security.passkeys as passkey (passkey.id)}
								<li>
									<div>
										<strong>{passkey.name || ctx.t('security.passkeys.defaultName')}</strong>
										<small>{passkey.created}</small>
										{#if passkey.cloneWarning}
											<p class="notice clone-warning">
												{ctx.t('security.passkeys.cloneWarning')}
											</p>
										{/if}
									</div>
									<button
										type="button"
										class="danger-text"
										onclick={() => deletePasskey(passkey.id)}
										disabled={busyAction !== null}
									>
										{ctx.t('security.passkeys.delete')}
									</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="empty">{ctx.t('security.passkeys.empty')}</p>
					{/if}
					<form onsubmit={registerPasskey}>
						<label for="security-passkey-name">{ctx.t('security.passkeys.nameLabel')}</label>
						<input
							id="security-passkey-name"
							type="text"
							placeholder={ctx.t('security.passkeys.namePlaceholder')}
							bind:value={passkeyName}
						/>
						<button type="submit" disabled={busyAction !== null}
							>{ctx.t('security.passkeys.add')}</button
						>
					</form>
				</article>
			</div>
		{/if}
	</section>

	<StepUpDialog
		methods={stepUp?.methods ?? null}
		passkeyAvailable={typeof auth.verifyWithPasskey === 'function'}
		busy={stepUpBusy}
		error={stepUpError}
		returnFocusEl={stepUp?.returnFocusEl ?? null}
		fallbackFocusEl={sectionEl}
		onSubmitCode={submitStepUpCode}
		onUsePasskey={useStepUpPasskey}
		onCancel={cancelStepUp}
	/>
{/if}

<style>
	.vega-security {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
	}

	header,
	.card-title,
	.actions,
	.passkey-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	/* Tres acciones con TOTP activo: en una tarjeta estrecha bajan de línea en vez de desbordar. */
	.actions {
		flex-wrap: wrap;
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	header p,
	article > p,
	.empty,
	small {
		color: var(--ink-2);
	}

	.security-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	article {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface-2);
	}

	.card-title span {
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		background: var(--btn);
		color: var(--ink-2);
		font-size: 0.75rem;
		font-weight: 700;
	}

	.card-title span.active {
		background: var(--success-soft);
		color: var(--success);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	label {
		font-size: 0.85rem;
		font-weight: 600;
	}

	input,
	button,
	.otpauth-link {
		min-height: 44px;
	}

	input {
		box-sizing: border-box;
		width: 100%;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink);
	}

	button,
	.otpauth-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--accent);
		color: var(--accent-ink);
		font-weight: 650;
		text-decoration: none;
		cursor: pointer;
	}

	button.secondary {
		background: var(--surface-2);
		color: var(--ink);
	}

	button.danger {
		background: var(--danger);
		color: var(--surface);
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.error {
		padding: 0.75rem;
		border-radius: var(--r);
		background: var(--danger-soft);
		color: var(--danger);
	}

	/* Aviso dentro de una tarjeta (cambio de app a medias, passkey posiblemente copiada): mismos
	   tokens que el bloque de códigos de recuperación. El texto va en `--ink`, no en `--warning`,
	   para no depender del contraste del tono de aviso sobre su fondo suave. */
	.notice {
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--warning);
		border-radius: var(--r);
		background: var(--warning-soft);
		color: var(--ink);
		font-size: 0.85rem;
	}

	.clone-warning {
		margin-top: 0.4rem;
	}

	.recovery-codes {
		padding: 1rem;
		border: 1px solid var(--warning);
		border-radius: var(--r);
		background: var(--warning-soft);
	}

	.recovery-codes ul {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		padding: 0;
		list-style: none;
	}

	.recovery-codes code,
	.secret {
		display: block;
		padding: 0.55rem;
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink);
		font-family: var(--mono);
		text-align: center;
		overflow-wrap: anywhere;
	}

	.passkey-list {
		padding: 0;
		margin: 0;
		list-style: none;
	}

	.passkey-list li {
		padding: 0.6rem 0;
		border-bottom: 1px solid var(--line);
	}

	.passkey-list div {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.passkey-list strong,
	.passkey-list small {
		overflow-wrap: anywhere;
	}

	button.danger-text {
		min-width: 44px;
		padding-inline: 0.5rem;
		border-color: transparent;
		background: transparent;
		color: var(--danger);
	}

	@media (max-width: 700px) {
		.security-grid {
			grid-template-columns: 1fr;
		}

		header,
		.actions {
			align-items: stretch;
			flex-direction: column;
		}

		.recovery-codes ul {
			grid-template-columns: 1fr;
		}
	}
</style>
