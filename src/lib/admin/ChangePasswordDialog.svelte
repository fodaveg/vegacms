<script lang="ts">
	/**
	 * «Cambiar contraseña» de una cuenta de `/editores`. Pone la contraseña nueva y da la cuenta
	 * por activa (`AdministrationPort.setEditorPassword`). PocketBase cierra las sesiones abiertas
	 * de esa cuenta (medido: su token deja de refrescar), y el diálogo lo avisa antes.
	 *
	 * Mismas reglas de validación que el alta (`editor-form.ts`): al enviar o al salir de un campo,
	 * con el mínimo del backend, y el mensaje del servidor si aun así la rechaza.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { VegaError, type EditorAccount } from '$lib/backend';
	import AdminDialog from './AdminDialog.svelte';
	import PasswordFields from './PasswordFields.svelte';
	import {
		formErrorsFromVegaError,
		validatePasswordPair,
		type EditorFormErrors
	} from './editor-form';

	interface Props {
		/** La cuenta cuya contraseña se cambia; `null` = diálogo cerrado. */
		account: EditorAccount | null;
		passwordMinLength: number;
		fallbackFocusEl?: HTMLElement | null;
		onClose: () => void;
		onChanged: (account: EditorAccount) => void;
	}

	let { account, passwordMinLength, fallbackFocusEl = null, onClose, onChanged }: Props = $props();

	const ctx = getVegaContext();
	const id = $props.id();

	let password = $state('');
	let confirm = $state('');
	let errors = $state<EditorFormErrors>({});
	let saving = $state(false);

	$effect(() => {
		if (!account) return;
		password = '';
		confirm = '';
		errors = {};
		saving = false;
	});

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

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (saving || !account) return;
		const next = validatePasswordPair(password, confirm, passwordMinLength);
		errors = next;
		if (Object.keys(next).length > 0) return;

		const target = account;
		saving = true;
		try {
			await ctx.port.administration!.setEditorPassword(target.id, password);
			saving = false;
			onChanged(target);
		} catch (err) {
			saving = false;
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error al cambiar la contraseña', err);
			const fieldErrors = formErrorsFromVegaError(vegaErr);
			if (fieldErrors) errors = fieldErrors;
			else ctx.feedback.reportError(vegaErr, { action: 'editors:setPassword' });
		}
	}
</script>

<AdminDialog
	open={account !== null}
	title={ctx.t('admin.editors.passwordDialog.title')}
	busy={saving}
	{fallbackFocusEl}
	{onClose}
>
	<form id="{id}-form" class="vega-admin-form" novalidate onsubmit={submit}>
		<p class="vega-admin-dialog-text">
			{ctx.t('admin.editors.passwordDialog.owner')}
			<b>{account?.email ?? ''}</b>. {ctx.t('admin.editors.passwordDialog.sessionNote')}
		</p>
		<PasswordFields
			bind:password
			bind:confirm
			label={ctx.t('admin.form.newPassword')}
			minLength={passwordMinLength}
			passwordError={errors.password}
			confirmError={errors.confirm}
			autofocus
			onBlurPassword={blurPassword}
			onBlurConfirm={blurConfirm}
		/>
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
				: ctx.t('admin.editors.passwordDialog.submit')}
		</button>
	{/snippet}
</AdminDialog>
