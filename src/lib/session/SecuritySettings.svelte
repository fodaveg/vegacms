<script lang="ts">
	/**
	 * Gestión de factores fuertes del usuario autenticado (L6): alta/baja de TOTP, códigos de
	 * recuperación de un solo uso y passkeys. El backend sigue siendo la autoridad; esta UI nunca
	 * persiste secretos ni códigos y solo los muestra durante el flujo que los genera.
	 */
	import { onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import type { StrongAuthStatus, TotpEnrollment } from '$lib/backend';
	import { VegaError } from '$lib/backend';

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

	async function load(): Promise<void> {
		if (!auth) return;
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

	function errorMessage(err: unknown): string {
		return err instanceof VegaError ? err.message : ctx.t('security.error.generic');
	}

	async function run(action: string, operation: () => Promise<void>): Promise<void> {
		busyAction = action;
		error = null;
		try {
			await operation();
		} catch (err) {
			error = errorMessage(err);
		} finally {
			busyAction = null;
		}
	}

	async function beginTotp(): Promise<void> {
		if (!auth) return;
		await run('totp-enroll', async () => {
			enrollment = await auth.enrollTotp();
			verificationCode = '';
		});
	}

	async function verifyTotp(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!auth) return;
		await run('totp-verify', async () => {
			await auth.verifyTotp(verificationCode);
			recoveryCodes = await auth.generateRecoveryCodes();
			enrollment = null;
			verificationCode = '';
			security = await auth.getStatus();
			ctx.feedback.toast(ctx.t('security.totp.enabled'), { kind: 'success' });
		});
	}

	async function disableTotp(): Promise<void> {
		if (!auth || !window.confirm(ctx.t('security.totp.disableConfirm'))) return;
		await run('totp-disable', async () => {
			await auth.disableTotp();
			recoveryCodes = [];
			security = await auth.getStatus();
			ctx.feedback.toast(ctx.t('security.totp.disabled'), { kind: 'success' });
		});
	}

	async function regenerateRecovery(): Promise<void> {
		if (!auth || !window.confirm(ctx.t('security.recovery.regenerateConfirm'))) return;
		await run('recovery', async () => {
			recoveryCodes = await auth.generateRecoveryCodes();
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
		await run('passkey-add', async () => {
			await auth.registerPasskey(passkeyName.trim() || ctx.t('security.passkeys.defaultName'));
			passkeyName = '';
			security = await auth.getStatus();
			ctx.feedback.toast(ctx.t('security.passkeys.added'), { kind: 'success' });
		});
	}

	async function deletePasskey(id: string): Promise<void> {
		if (!auth || !window.confirm(ctx.t('security.passkeys.deleteConfirm'))) return;
		await run(`passkey-delete-${id}`, async () => {
			await auth.deletePasskey(id);
			security = await auth.getStatus();
			ctx.feedback.toast(ctx.t('security.passkeys.deleted'), { kind: 'success' });
		});
	}
</script>

{#if auth}
	<section class="vega-security" aria-labelledby="vega-security-title">
		<header>
			<div>
				<h2 id="vega-security-title">{ctx.t('security.title')}</h2>
				<p>{ctx.t('security.description')}</p>
			</div>
			<button type="button" class="secondary" onclick={load} disabled={loadStatus === 'loading'}>
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

					{#if security.totpEnabled}
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
								class="danger"
								onclick={disableTotp}
								disabled={busyAction !== null}
							>
								{ctx.t('security.totp.disable')}
							</button>
						</div>
					{:else if enrollment}
						<p>{ctx.t('security.totp.setupBody')}</p>
						<a class="otpauth-link" href={enrollment.otpauthUrl} rel="external"
							>{ctx.t('security.totp.openApp')}</a
						>
						<code class="secret">{enrollment.secret}</code>
						<form onsubmit={verifyTotp}>
							<label for="security-totp-code">{ctx.t('security.totp.codeLabel')}</label>
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
						</form>
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
