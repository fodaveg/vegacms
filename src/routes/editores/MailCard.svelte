<script lang="ts">
	/**
	 * Tarjeta «Correo para invitaciones» de `/editores` (lámina B1 y B2): el SMTP con el que PocketBase
	 * envía la invitación de un editor y la dirección de Vega (`meta.appURL`) con la que empieza el
	 * enlace del correo. Va debajo de la lista, solo con `capabilities.serverSettings`.
	 *
	 * Estados: sin configurar (`smtp.enabled` falso), configurado (resumen + prueba) y formulario
	 * dentro de la propia tarjeta (siete campos y la dirección de Vega, con un solo «Guardar»).
	 * La dirección de Vega va en el mismo formulario porque solo importa para los enlaces de estos
	 * correos.
	 *
	 * La prueba vive en el resumen y no en el formulario porque PocketBase prueba lo GUARDADO, no lo que
	 * haya escrito en los campos. Dice «enviada», no «recibida»: Vega solo sabe que el servidor la
	 * aceptó. Un fallo de la prueba no es una excepción: es el texto crudo del servidor, que se enseña
	 * como TEXTO en una caja con scroll, nunca como HTML, y no cambia el estado «Configurado».
	 *
	 * La contraseña va siempre vacía y solo viaja si se escribe una nueva: PocketBase no la devuelve ni
	 * dice si existe. Quitarla es una acción aparte con confirmación, porque mandar el campo vacío la
	 * borraría y «vaciar y guardar» no puede significar dos cosas.
	 *
	 * Avisos de la dirección de Vega: lo que no es http(s) BLOQUEA al salir del campo o al guardar;
	 * `http://` y «no es la dirección desde la que usas Vega» solo avisan (hay instalaciones legítimas
	 * detrás de un proxy). El segundo se decide con `canWriteInvitationLink`, la misma regla con la que
	 * el puerto decide si puede corregir la plantilla del correo, y se ve también con la tarjeta cerrada.
	 */
	import { tick } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError, type ServerSettings, type ServerSettingsPort } from '$lib/backend';
	import { buildServerSettingsPatch, isEmptyPatch } from '$lib/backend/server-settings-rules';
	import { fieldMessage, formatClock } from '$lib/admin/server-settings-ui';
	import {
		appUrlNotices,
		looksLikeEmail,
		parseMailPort,
		type AppUrlNotices
	} from '$lib/admin/mail-settings';
	import AdminDialog from '$lib/admin/AdminDialog.svelte';
	import '$lib/admin/admin.css';

	interface Props {
		settings: ServerSettings;
		section: ServerSettingsPort;
		/** La ruta pública de Vega para elegir contraseña, ABSOLUTA: su origen es «desde donde se usa Vega». */
		resetUrl: string;
		/** Con quién nace el campo de la prueba: el email de la sesión. */
		defaultTestTo: string;
		onSaved: (next: ServerSettings) => void;
	}

	let { settings, section, resetUrl, defaultTestTo, onSaved }: Props = $props();

	const ctx = getVegaContext();
	const id = $props.id();

	type TestState =
		| { status: 'idle' }
		| { status: 'testing' }
		| { status: 'ok'; at: Date; to: string }
		| { status: 'failed'; message: string };
	type Field =
		'senderName' | 'senderAddress' | 'appURL' | 'host' | 'port' | 'username' | 'password';

	const FIELD_PATHS: Record<Field, string> = {
		senderName: 'meta.senderName',
		senderAddress: 'meta.senderAddress',
		appURL: 'meta.appURL',
		host: 'smtp.host',
		port: 'smtp.port',
		username: 'smtp.username',
		password: 'smtp.password'
	};

	let editing = $state(false);
	let saving = $state(false);
	let test = $state<TestState>({ status: 'idle' });
	// Se toma una vez: el campo de la prueba lo edita quien la envía y no debe pisarse al recargar.
	// svelte-ignore state_referenced_locally
	let testTo = $state(defaultTestTo);
	let testToError = $state<string | null>(null);

	let senderName = $state('');
	let senderAddress = $state('');
	let appUrl = $state('');
	let host = $state('');
	let port = $state('');
	let username = $state('');
	let password = $state('');
	let tls = $state(false);
	let errors = $state<Partial<Record<Field, string>>>({});
	let generalError = $state<string | null>(null);

	let removeOpen = $state(false);
	let removing = $state(false);

	let changeButton = $state<HTMLButtonElement | null>(null);
	let removeButton = $state<HTMLButtonElement | null>(null);
	let firstControl = $state<HTMLInputElement | null>(null);

	const configured = $derived(settings.smtp.enabled);
	const testing = $derived(test.status === 'testing');
	const currentOrigin = $derived(new URL(resetUrl).origin);
	const savedNotices = $derived(appUrlNotices(settings.meta.appURL, resetUrl));
	const draftNotices = $derived(appUrlNotices(appUrl, resetUrl));

	async function open(): Promise<void> {
		if (testing) return;
		senderName = settings.meta.senderName;
		senderAddress = settings.meta.senderAddress;
		appUrl = settings.meta.appURL;
		host = settings.smtp.host;
		port = settings.smtp.port > 0 ? String(settings.smtp.port) : '';
		username = settings.smtp.username;
		password = '';
		tls = settings.smtp.tls;
		errors = {};
		generalError = null;
		editing = true;
		await tick();
		firstControl?.focus();
	}

	async function close(): Promise<void> {
		editing = false;
		await tick();
		changeButton?.focus();
	}

	function clearError(field: Field): void {
		if (errors[field]) errors = { ...errors, [field]: undefined };
	}

	function blurAppUrl(): void {
		if (appUrl.trim() === '') return;
		if (draftNotices.invalid) errors = { ...errors, appURL: ctx.t('admin.appUrl.notHttp') };
	}

	function useCurrentOrigin(): void {
		appUrl = currentOrigin;
		clearError('appURL');
	}

	async function runTest(): Promise<void> {
		if (testing) return;
		const to = testTo.trim();
		if (!looksLikeEmail(to)) {
			testToError = ctx.t('admin.mail.testToInvalid');
			return;
		}
		testToError = null;
		test = { status: 'testing' };
		try {
			const outcome = await section.testEmail(to, 'verification');
			test = outcome.ok
				? { status: 'ok', at: new Date(), to }
				: { status: 'failed', message: outcome.message };
		} catch (err) {
			test = { status: 'idle' };
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend('Error al enviar la prueba', err),
				{ action: 'mail:test' }
			);
		}
	}

	/** Lo que Vega ya sabe que está mal, antes de molestar al servidor. */
	function localErrors(): Partial<Record<Field, string>> {
		const next: Partial<Record<Field, string>> = {};
		if (!looksLikeEmail(senderAddress)) {
			next.senderAddress = ctx.t('admin.mail.senderAddressInvalid');
		}
		if (draftNotices.invalid) next.appURL = ctx.t('admin.appUrl.notHttp');
		if (host.trim() === '') next.host = ctx.t('admin.mail.hostRequired');
		if (parseMailPort(port) === null) next.port = ctx.t('admin.mail.portInvalid');
		return next;
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (saving) return;
		generalError = null;
		const local = localErrors();
		errors = local;
		if (Object.keys(local).length > 0) return;

		const patch = buildServerSettingsPatch(settings, {
			meta: {
				senderName: senderName.trim(),
				senderAddress: senderAddress.trim(),
				appURL: appUrl.trim()
			},
			smtp: {
				enabled: true,
				host: host.trim(),
				port: parseMailPort(port) ?? undefined,
				username: username.trim(),
				tls
			},
			secrets: { smtpPassword: { kind: 'set', value: password } }
		});
		if (isEmptyPatch(patch)) {
			await close();
			return;
		}

		saving = true;
		try {
			const next = await section.update(patch);
			ctx.feedback.toast(ctx.t('admin.mail.saved'), { kind: 'success' });
			saving = false;
			test = { status: 'idle' };
			onSaved(next);
			await close();
		} catch (err) {
			saving = false;
			if (err instanceof VegaError && err.kind === 'validation') {
				const next: Partial<Record<Field, string>> = {};
				for (const field of Object.keys(FIELD_PATHS) as Field[]) {
					const message = fieldMessage(err, FIELD_PATHS[field]);
					if (message) next[field] = ctx.t('admin.settings.fieldRejected', { message });
				}
				errors = next;
				generalError = ctx.t('admin.form.rejected', { message: err.message });
			} else {
				ctx.feedback.reportError(
					err instanceof VegaError ? err : VegaError.backend('Error al guardar el correo', err),
					{ action: 'mail:save' }
				);
			}
		}
	}

	async function confirmRemovePassword(): Promise<void> {
		if (removing) return;
		removing = true;
		try {
			const next = await section.update(
				buildServerSettingsPatch(settings, { secrets: { smtpPassword: { kind: 'clear' } } })
			);
			removing = false;
			removeOpen = false;
			test = { status: 'idle' };
			ctx.feedback.toast(ctx.t('admin.mail.removeDialog.success'), { kind: 'success' });
			onSaved(next);
		} catch (err) {
			removing = false;
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend('Error al quitar la contraseña', err),
				{ action: 'mail:remove-password' }
			);
		}
	}
</script>

{#snippet appUrlNotice(notices: AppUrlNotices)}
	{#if notices.mismatch}
		<div class="vega-admin-notice vega-admin-notice--warning" id="{id}-url-mismatch">
			<p class="vega-admin-notice-body">
				{ctx.t('admin.appUrl.mismatch', { origin: currentOrigin })}
			</p>
			<div class="vega-admin-notice-actions">
				<button type="button" class="vega-admin-btn vega-admin-btn--sm" onclick={useCurrentOrigin}>
					{ctx.t('admin.appUrl.useCurrent')}
				</button>
			</div>
		</div>
	{/if}
	{#if notices.http}
		<div class="vega-admin-notice vega-admin-notice--warning" id="{id}-url-http">
			<p class="vega-admin-notice-body">{ctx.t('admin.appUrl.http')}</p>
		</div>
	{/if}
{/snippet}

<div
	class="vega-admin-card"
	data-mail-card={editing ? 'form' : configured ? 'configured' : 'empty'}
>
	<section class="vega-admin-state" aria-labelledby="{id}-title">
		<div class="vega-admin-subhead">
			<h2 id="{id}-title">{ctx.t('admin.mail.title')}</h2>
			{#if !editing && configured}
				<span class="vega-admin-tag" data-kind="pub">{ctx.t('admin.mail.configured')}</span>
				<span class="vega-admin-head-spacer"></span>
				<button
					type="button"
					class="vega-admin-btn vega-admin-btn--sm"
					bind:this={changeButton}
					aria-disabled={testing}
					onclick={() => void open()}
				>
					{ctx.t('admin.settings.change')}
				</button>
			{/if}
		</div>

		{#if editing}
			<form
				class="vega-admin-form vega-admin-form--inset"
				novalidate
				aria-busy={saving}
				onsubmit={submit}
			>
				<fieldset class="vega-admin-group">
					<legend>{ctx.t('admin.mail.legendSender')}</legend>
					<div class="vega-admin-form-row">
						<div class="vega-admin-field">
							<label for="{id}-name">{ctx.t('admin.mail.senderName')}</label>
							<input
								id="{id}-name"
								class="vega-admin-input"
								type="text"
								bind:value={senderName}
								bind:this={firstControl}
								autocomplete="off"
							/>
						</div>
						<div class="vega-admin-field">
							<label for="{id}-from">{ctx.t('admin.mail.senderAddress')}</label>
							<input
								id="{id}-from"
								class="vega-admin-input"
								type="email"
								bind:value={senderAddress}
								oninput={() => clearError('senderAddress')}
								spellcheck="false"
								autocapitalize="off"
								autocomplete="off"
								aria-invalid={errors.senderAddress ? 'true' : undefined}
								aria-describedby={errors.senderAddress ? `${id}-from-error` : undefined}
							/>
							{#if errors.senderAddress}
								<p class="vega-admin-field-error" id="{id}-from-error">{errors.senderAddress}</p>
							{/if}
						</div>
					</div>
					<div class="vega-admin-field">
						<label for="{id}-url">{ctx.t('admin.appUrl.label')}</label>
						<input
							id="{id}-url"
							class="vega-admin-input vega-admin-input--mono"
							type="url"
							bind:value={appUrl}
							oninput={() => clearError('appURL')}
							onblur={blurAppUrl}
							spellcheck="false"
							autocapitalize="off"
							autocomplete="off"
							aria-invalid={errors.appURL ? 'true' : undefined}
							aria-describedby="{id}-url-{errors.appURL ? 'error' : 'help'}{draftNotices.mismatch
								? ` ${id}-url-mismatch`
								: ''}{draftNotices.http ? ` ${id}-url-http` : ''}"
						/>
						{#if errors.appURL}
							<p class="vega-admin-field-error" id="{id}-url-error">{errors.appURL}</p>
						{:else}
							<p class="vega-admin-help" id="{id}-url-help">{ctx.t('admin.appUrl.help')}</p>
						{/if}
					</div>
					{@render appUrlNotice(draftNotices)}
				</fieldset>

				<fieldset class="vega-admin-group">
					<legend>{ctx.t('admin.mail.legendServer')}</legend>
					<div class="vega-admin-form-row">
						<div class="vega-admin-field">
							<label for="{id}-host">{ctx.t('admin.mail.host')}</label>
							<input
								id="{id}-host"
								class="vega-admin-input vega-admin-input--mono"
								type="text"
								bind:value={host}
								oninput={() => clearError('host')}
								spellcheck="false"
								autocapitalize="off"
								autocomplete="off"
								aria-invalid={errors.host ? 'true' : undefined}
								aria-describedby={errors.host ? `${id}-host-error` : undefined}
							/>
							{#if errors.host}
								<p class="vega-admin-field-error" id="{id}-host-error">{errors.host}</p>
							{/if}
						</div>
						<div class="vega-admin-field vega-admin-field--short">
							<label for="{id}-port">{ctx.t('admin.mail.port')}</label>
							<input
								id="{id}-port"
								class="vega-admin-input vega-admin-input--mono"
								type="text"
								inputmode="numeric"
								bind:value={port}
								oninput={() => clearError('port')}
								autocomplete="off"
								aria-invalid={errors.port ? 'true' : undefined}
								aria-describedby={errors.port ? `${id}-port-error` : undefined}
							/>
							{#if errors.port}
								<p class="vega-admin-field-error" id="{id}-port-error">{errors.port}</p>
							{/if}
						</div>
					</div>
					<div class="vega-admin-field">
						<label for="{id}-user">{ctx.t('admin.mail.username')}</label>
						<input
							id="{id}-user"
							class="vega-admin-input"
							type="text"
							bind:value={username}
							oninput={() => clearError('username')}
							spellcheck="false"
							autocapitalize="off"
							autocomplete="off"
							aria-invalid={errors.username ? 'true' : undefined}
							aria-describedby={errors.username ? `${id}-user-error` : undefined}
						/>
						{#if errors.username}
							<p class="vega-admin-field-error" id="{id}-user-error">{errors.username}</p>
						{/if}
					</div>
					<div class="vega-admin-field">
						<label for="{id}-pass">{ctx.t('admin.mail.password')}</label>
						<input
							id="{id}-pass"
							class="vega-admin-input"
							type="password"
							bind:value={password}
							oninput={() => clearError('password')}
							autocomplete="new-password"
							aria-invalid={errors.password ? 'true' : undefined}
							aria-describedby="{id}-pass-{errors.password ? 'error' : 'help'}"
						/>
						{#if errors.password}
							<p class="vega-admin-field-error" id="{id}-pass-error">{errors.password}</p>
						{:else}
							<p class="vega-admin-help" id="{id}-pass-help">{ctx.t('admin.mail.passwordHelp')}</p>
						{/if}
						<button
							type="button"
							class="vega-admin-link"
							bind:this={removeButton}
							aria-disabled={saving}
							onclick={() => !saving && (removeOpen = true)}
						>
							{ctx.t('admin.mail.removePassword')}
						</button>
					</div>
					<label class="vega-admin-check">
						<input type="checkbox" bind:checked={tls} />
						<span>{ctx.t('admin.mail.tls')}<span>{ctx.t('admin.mail.tlsHint')}</span></span>
					</label>
				</fieldset>

				{#if generalError}
					<p class="vega-admin-field-error" role="alert">{generalError}</p>
				{/if}

				<div class="vega-admin-form-actions">
					<button
						type="submit"
						class="vega-admin-btn vega-admin-btn--primary"
						aria-disabled={saving}
					>
						{saving ? ctx.t('admin.settings.saving') : ctx.t('admin.settings.save')}
					</button>
					<button
						type="button"
						class="vega-admin-btn"
						aria-disabled={saving}
						onclick={() => !saving && void close()}
					>
						{ctx.t('common.cancel')}
					</button>
				</div>
			</form>
		{:else if !configured}
			<p>{ctx.t('admin.mail.unconfiguredBody')}</p>
			<button type="button" class="vega-admin-btn" onclick={() => void open()}>
				{ctx.t('admin.mail.configure')}
			</button>
		{:else}
			<dl class="vega-admin-summary">
				<div>
					<dt>{ctx.t('admin.mail.summary.server')}</dt>
					<dd><code>{settings.smtp.host}:{settings.smtp.port}</code></dd>
				</div>
				<div>
					<dt>{ctx.t('admin.mail.summary.sender')}</dt>
					<dd>
						{#if settings.meta.senderName}{settings.meta.senderName}{ctx.t(
								'admin.mail.summary.senderJoin'
							)}{/if}<code>{settings.meta.senderAddress}</code>
					</dd>
				</div>
				<div>
					<dt>{ctx.t('admin.mail.summary.links')}</dt>
					<dd><code>{settings.meta.appURL}</code></dd>
				</div>
			</dl>
			{#if savedNotices.mismatch}
				<div class="vega-admin-notice vega-admin-notice--warning" data-mail-mismatch="closed">
					<p class="vega-admin-notice-body">
						{ctx.t('admin.appUrl.mismatchClosed', { origin: currentOrigin })}
					</p>
					<div class="vega-admin-notice-actions">
						<button
							type="button"
							class="vega-admin-btn vega-admin-btn--sm"
							aria-disabled={testing}
							onclick={() => void open()}
						>
							{ctx.t('admin.settings.change')}
						</button>
					</div>
				</div>
			{/if}
			<div class="vega-admin-test" data-mail-test={test.status}>
				<div class="vega-admin-test-row">
					<div class="vega-admin-field">
						<label for="{id}-test">{ctx.t('admin.mail.testTo')}</label>
						<input
							id="{id}-test"
							class="vega-admin-input"
							type="email"
							bind:value={testTo}
							oninput={() => (testToError = null)}
							spellcheck="false"
							autocapitalize="off"
							autocomplete="off"
							aria-invalid={testToError ? 'true' : undefined}
							aria-describedby={testToError ? `${id}-test-error` : undefined}
						/>
						{#if testToError}
							<p class="vega-admin-field-error" id="{id}-test-error">{testToError}</p>
						{/if}
					</div>
					<button
						type="button"
						class="vega-admin-btn"
						aria-disabled={testing}
						onclick={() => void runTest()}
					>
						{testing ? ctx.t('admin.mail.testSending') : ctx.t('admin.mail.testSend')}
					</button>
				</div>
				{#if test.status === 'testing'}
					<p class="vega-admin-result" aria-live="polite">
						<span class="vega-admin-saving">{ctx.t('admin.mail.testingStatus')}</span>
					</p>
				{:else if test.status === 'ok'}
					<p class="vega-admin-result" role="status">
						<span class="vega-admin-tag" data-kind="pub">{ctx.t('admin.mail.testOk')}</span>
						{ctx.t('admin.mail.testOkAt', {
							time: formatClock(test.at, ctx.locale),
							email: test.to
						})}
					</p>
				{:else if test.status === 'failed'}
					<div class="vega-admin-notice vega-admin-notice--danger" role="alert">
						<p class="vega-admin-notice-title">{ctx.t('admin.mail.testFailTitle')}</p>
						<p class="vega-admin-notice-body">{ctx.t('admin.mail.testFailBody')}</p>
						<pre class="vega-admin-output">{test.message}</pre>
						<div class="vega-admin-notice-actions">
							<button type="button" class="vega-admin-btn" onclick={() => void open()}>
								{ctx.t('admin.mail.testFailChange')}
							</button>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</section>
</div>

<AdminDialog
	open={removeOpen}
	role="alertdialog"
	title={ctx.t('admin.mail.removeDialog.title')}
	busy={removing}
	showClose={false}
	description={ctx.t('admin.mail.removeDialog.body')}
	fallbackFocusEl={removeButton}
	onClose={() => (removeOpen = false)}
>
	{#snippet actions()}
		<button
			type="button"
			class="vega-admin-btn"
			aria-disabled={removing}
			data-autofocus=""
			onclick={() => !removing && (removeOpen = false)}
		>
			{ctx.t('common.cancel')}
		</button>
		<button
			type="button"
			class="vega-admin-btn vega-admin-btn--danger"
			aria-disabled={removing}
			onclick={() => void confirmRemovePassword()}
		>
			{removing
				? ctx.t('admin.mail.removeDialog.removing')
				: ctx.t('admin.mail.removeDialog.confirm')}
		</button>
	{/snippet}
</AdminDialog>
