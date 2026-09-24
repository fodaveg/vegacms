<script lang="ts">
	/**
	 * Par «contraseña» + «repítela» de los diálogos de `/editores`. Solo pinta: el valor y los
	 * errores los tiene el diálogo que lo usa, que es quien decide cuándo validar (al enviar o al
	 * salir de un campo, nunca mientras se escribe).
	 */
	import { getVegaContext } from '$lib/app-context';
	import type { FormFieldError } from './editor-form';

	interface Props {
		password: string;
		confirm: string;
		/** Rótulo del primer campo («Contraseña» al dar de alta, «Contraseña nueva» al cambiarla). */
		label: string;
		minLength: number;
		passwordError?: FormFieldError;
		confirmError?: FormFieldError;
		/** El primer campo recibe el foco al abrir el diálogo. */
		autofocus?: boolean;
		onBlurPassword: () => void;
		onBlurConfirm: () => void;
	}

	let {
		password = $bindable(),
		confirm = $bindable(),
		label,
		minLength,
		passwordError,
		confirmError,
		autofocus = false,
		onBlurPassword,
		onBlurConfirm
	}: Props = $props();

	const ctx = getVegaContext();
	const id = $props.id();
</script>

<div class="vega-admin-field">
	<label for="{id}-password">{label}</label>
	<input
		id="{id}-password"
		class="vega-admin-input"
		type="password"
		autocomplete="new-password"
		bind:value={password}
		aria-invalid={passwordError ? 'true' : undefined}
		aria-describedby={passwordError ? `${id}-password-error` : `${id}-password-help`}
		data-autofocus={autofocus ? '' : undefined}
		onblur={onBlurPassword}
	/>
	{#if passwordError}
		<p class="vega-admin-field-error" id="{id}-password-error">
			{ctx.t(passwordError.key, passwordError.params)}
		</p>
	{:else}
		<p class="vega-admin-help" id="{id}-password-help">
			{ctx.t('admin.form.passwordHint', { min: minLength })}
		</p>
	{/if}
</div>
<div class="vega-admin-field">
	<label for="{id}-confirm">{ctx.t('admin.form.repeatPassword')}</label>
	<input
		id="{id}-confirm"
		class="vega-admin-input"
		type="password"
		autocomplete="new-password"
		bind:value={confirm}
		aria-invalid={confirmError ? 'true' : undefined}
		aria-describedby={confirmError ? `${id}-confirm-error` : undefined}
		onblur={onBlurConfirm}
	/>
	{#if confirmError}
		<p class="vega-admin-field-error" id="{id}-confirm-error">
			{ctx.t(confirmError.key, confirmError.params)}
		</p>
	{/if}
</div>
