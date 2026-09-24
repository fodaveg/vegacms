<script lang="ts">
	/**
	 * «Añadir editor» (`/editores`). Con correo en el servidor (`mailEnabled`) ofrece las dos vías:
	 * «Enviarle una invitación» (la cuenta nace pendiente y PocketBase le manda el correo para
	 * elegir contraseña) o «Poner yo la contraseña». Sin correo, solo la segunda, con una nota que
	 * dice por qué: no hay enlace para copiar, porque PocketBase no emite el token de
	 * restablecimiento sin enviar el correo y eso exigiría una extensión Go.
	 *
	 * Los errores salen al enviar o al salir de un campo con algo escrito, nunca mientras se escribe.
	 * El mínimo de contraseña es el del backend (`EditorDirectory.passwordMinLength`); si el servidor
	 * rechaza igualmente, se pinta su mensaje en el campo.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { VegaError, type EditorAccount, type NewEditorAccess } from '$lib/backend';
	import AdminDialog from './AdminDialog.svelte';
	import PasswordFields from './PasswordFields.svelte';
	import {
		formErrorsFromVegaError,
		validateEmail,
		validatePasswordPair,
		type EditorFormErrors
	} from './editor-form';

	interface Props {
		open: boolean;
		mailEnabled: boolean;
		passwordMinLength: number;
		/** Aviso junto a «Enviarle una invitación» cuando el enlace del correo no lleva seguro a
		 *  `/restablecer` (plantilla personalizada o sin comprobar). `null` = nada que avisar. */
		inviteLinkNote?: string | null;
		fallbackFocusEl?: HTMLElement | null;
		onClose: () => void;
		onCreated: (account: EditorAccount, access: NewEditorAccess['kind']) => void;
	}

	let {
		open,
		mailEnabled,
		passwordMinLength,
		inviteLinkNote = null,
		fallbackFocusEl = null,
		onClose,
		onCreated
	}: Props = $props();

	const ctx = getVegaContext();
	const id = $props.id();

	let email = $state('');
	let mode = $state<NewEditorAccess['kind']>('invite');
	let password = $state('');
	let confirm = $state('');
	let errors = $state<EditorFormErrors>({});
	let saving = $state(false);

	/** Sin correo solo cabe poner la contraseña, elija lo que elija el estado. */
	const effectiveMode = $derived<NewEditorAccess['kind']>(mailEnabled ? mode : 'password');

	// Cada apertura empieza en blanco: nunca hereda lo escrito para otra persona.
	$effect(() => {
		if (!open) return;
		email = '';
		mode = 'invite';
		password = '';
		confirm = '';
		errors = {};
		saving = false;
	});

	function blurEmail(): void {
		if (email.trim() === '') return;
		const error = validateEmail(email);
		errors = { ...errors, email: error ?? undefined };
	}

	function blurPassword(): void {
		if (password === '') return;
		const pair = validatePasswordPair(password, confirm || password, passwordMinLength);
		errors = { ...errors, password: pair.password };
	}

	function blurConfirm(): void {
		if (confirm === '') return;
		const pair = validatePasswordPair(password, confirm, passwordMinLength);
		errors = { ...errors, password: pair.password, confirm: pair.confirm };
	}

	function validateAll(): EditorFormErrors {
		const next: EditorFormErrors = {};
		const emailError = validateEmail(email);
		if (emailError) next.email = emailError;
		if (effectiveMode === 'password') {
			Object.assign(next, validatePasswordPair(password, confirm, passwordMinLength));
		}
		return next;
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (saving) return;
		const next = validateAll();
		errors = next;
		if (Object.keys(next).length > 0) return;

		const access: NewEditorAccess =
			effectiveMode === 'password' ? { kind: 'password', password } : { kind: 'invite' };
		saving = true;
		try {
			const account = await ctx.port.administration!.createEditor(email.trim(), access);
			saving = false;
			onCreated(account, access.kind);
		} catch (err) {
			saving = false;
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error al añadir el editor', err);
			const fieldErrors = formErrorsFromVegaError(vegaErr);
			if (fieldErrors) errors = fieldErrors;
			else ctx.feedback.reportError(vegaErr, { action: 'editors:create' });
		}
	}
</script>

<AdminDialog
	{open}
	title={ctx.t('admin.editors.addDialog.title')}
	busy={saving}
	{fallbackFocusEl}
	{onClose}
>
	<form id="{id}-form" class="vega-admin-form" novalidate onsubmit={submit}>
		<div class="vega-admin-field">
			<label for="{id}-email">{ctx.t('admin.editors.addDialog.email')}</label>
			<input
				id="{id}-email"
				class="vega-admin-input"
				type="email"
				autocomplete="off"
				bind:value={email}
				aria-invalid={errors.email ? 'true' : undefined}
				aria-describedby={errors.email ? `${id}-email-error` : undefined}
				data-autofocus=""
				onblur={blurEmail}
			/>
			{#if errors.email}
				<p class="vega-admin-field-error" id="{id}-email-error">
					{ctx.t(errors.email.key, errors.email.params)}
				</p>
			{/if}
		</div>

		{#if mailEnabled}
			<fieldset class="vega-admin-choices">
				<legend class="vega-admin-sr-only">{ctx.t('admin.editors.addDialog.accessLabel')}</legend>
				<label class="vega-admin-radio-card" data-checked={mode === 'invite'}>
					<input type="radio" name="{id}-access" value="invite" bind:group={mode} />
					<span>
						<b>{ctx.t('admin.editors.addDialog.invite')}</b>
						<span>{ctx.t('admin.editors.addDialog.inviteHint')}</span>
					</span>
				</label>
				<label class="vega-admin-radio-card" data-checked={mode === 'password'}>
					<input type="radio" name="{id}-access" value="password" bind:group={mode} />
					<span>
						<b>{ctx.t('admin.editors.addDialog.password')}</b>
						<span>{ctx.t('admin.editors.addDialog.passwordHint')}</span>
					</span>
				</label>
			</fieldset>
			{#if mode === 'invite' && inviteLinkNote}
				<div class="vega-admin-notice vega-admin-notice--warning" data-editors-invite-link="note">
					<p class="vega-admin-notice-body">{inviteLinkNote}</p>
				</div>
			{/if}
		{:else}
			<div class="vega-admin-notice vega-admin-notice--info" data-editors-mail="off">
				<p class="vega-admin-notice-body">{ctx.t('admin.editors.addDialog.noMail')}</p>
			</div>
		{/if}

		{#if effectiveMode === 'password'}
			<PasswordFields
				bind:password
				bind:confirm
				label={ctx.t('admin.form.password')}
				minLength={passwordMinLength}
				passwordError={errors.password}
				confirmError={errors.confirm}
				onBlurPassword={blurPassword}
				onBlurConfirm={blurConfirm}
			/>
		{/if}

		{#if errors.form}
			<p class="vega-admin-field-error" role="alert">
				{ctx.t(errors.form.key, errors.form.params)}
			</p>
		{/if}
	</form>

	{#snippet actions()}
		<button
			type="button"
			class="vega-admin-btn"
			aria-disabled={saving}
			onclick={() => !saving && onClose()}
		>
			{ctx.t('common.cancel')}
		</button>
		<button
			type="submit"
			form="{id}-form"
			class="vega-admin-btn vega-admin-btn--primary"
			aria-disabled={saving}
		>
			{saving
				? ctx.t('admin.editors.addDialog.saving')
				: effectiveMode === 'invite'
					? ctx.t('admin.editors.addDialog.submitInvite')
					: ctx.t('admin.editors.addDialog.submitPassword')}
		</button>
	{/snippet}
</AdminDialog>
