<script lang="ts">
	/**
	 * «Confirma que eres tú»: el servidor pide una prueba reciente de posesión antes de cambiar un
	 * factor (`VegaStrongAuthError` de código `'step-up-required'`). Este diálogo solo recoge la
	 * prueba; la acción que quedó pendiente la guarda y la repite `SecuritySettings.svelte`.
	 *
	 * - `methods` trae `totp` ⇒ campo de código de 6 dígitos. Trae `passkey` (y el puerto sabe
	 *   verificar con passkey) ⇒ botón «Usar passkey». Con los dos, los dos.
	 * - Ninguno utilizable ⇒ no hay con qué probar desde aquí: se explica la salida (volver a
	 *   entrar con el segundo factor, que el servidor cuenta como prueba) y solo queda cerrar.
	 * - `error` se pinta dentro y el diálogo sigue abierto: un código incorrecto se corrige aquí.
	 * - Marco, foco inicial, trampa de `Tab`, `Esc` y vuelta del foco son de `AdminDialog`. Por eso
	 *   los botones usan `aria-disabled` y no `disabled` mientras `busy` (ver su cabecera).
	 */
	import { getVegaContext } from '$lib/app-context';
	import type { StepUpMethod } from '$lib/backend';
	import AdminDialog from '$lib/admin/AdminDialog.svelte';

	interface Props {
		/** Factores con los que la cuenta puede probar; `null` = diálogo cerrado. */
		methods: StepUpMethod[] | null;
		/** `false` si el puerto no ofrece la verificación con passkey: el botón no se pinta. */
		passkeyAvailable: boolean;
		/** Hay una comprobación en vuelo: no se puede cerrar ni reenviar. */
		busy: boolean;
		/** Mensaje del último intento fallido, ya traducido. */
		error: string | null;
		/** Destino estable cuando la acción confirmada retira el botón que abrió el diálogo. */
		fallbackFocusEl?: HTMLElement | null;
		onSubmitCode: (code: string) => void;
		onUsePasskey: () => void;
		onCancel: () => void;
	}

	let {
		methods,
		passkeyAvailable,
		busy,
		error,
		fallbackFocusEl = null,
		onSubmitCode,
		onUsePasskey,
		onCancel
	}: Props = $props();

	const ctx = getVegaContext();
	const id = $props.id();

	let code = $state('');

	const withCode = $derived(methods?.includes('totp') ?? false);
	const withPasskey = $derived((methods?.includes('passkey') ?? false) && passkeyAvailable);
	const bodyKey = $derived(
		withCode && withPasskey
			? 'security.stepUp.bodyBoth'
			: withCode
				? 'security.stepUp.bodyTotp'
				: withPasskey
					? 'security.stepUp.bodyPasskey'
					: 'security.stepUp.unavailable'
	);

	// Cada apertura empieza con el campo vacío: un código ya enviado no vale dos veces.
	$effect(() => {
		if (methods) code = '';
	});

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		const value = code.trim();
		if (busy || value === '') return;
		onSubmitCode(value);
	}
</script>

<AdminDialog
	open={methods !== null}
	title={ctx.t('security.stepUp.title')}
	description={ctx.t(bodyKey)}
	{busy}
	{fallbackFocusEl}
	onClose={onCancel}
>
	{#if withCode}
		<form id="{id}-form" class="vega-admin-form" novalidate onsubmit={submit}>
			<div class="vega-admin-field">
				<label for="{id}-code">{ctx.t('security.totp.codeLabel')}</label>
				<input
					id="{id}-code"
					class="vega-admin-input step-up-code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					pattern="[0-9]*"
					maxlength="6"
					data-autofocus
					aria-invalid={error ? 'true' : undefined}
					aria-describedby={error ? `${id}-error` : undefined}
					bind:value={code}
				/>
			</div>
		</form>
	{/if}
	{#if error}
		<p id="{id}-error" class="vega-admin-field-error" role="alert">{error}</p>
	{/if}

	{#snippet actions()}
		<button
			type="button"
			class="vega-admin-btn"
			aria-disabled={busy}
			data-autofocus={withCode || withPasskey ? undefined : ''}
			onclick={() => !busy && onCancel()}
		>
			{ctx.t(withCode || withPasskey ? 'common.cancel' : 'common.close')}
		</button>
		{#if withPasskey}
			<button
				type="button"
				class="vega-admin-btn"
				class:vega-admin-btn--primary={!withCode}
				aria-disabled={busy}
				data-autofocus={withCode ? undefined : ''}
				onclick={() => !busy && onUsePasskey()}
			>
				{ctx.t('security.stepUp.usePasskey')}
			</button>
		{/if}
		{#if withCode}
			<button
				type="submit"
				form="{id}-form"
				class="vega-admin-btn vega-admin-btn--primary"
				aria-disabled={busy}
			>
				{busy ? ctx.t('security.stepUp.working') : ctx.t('security.stepUp.confirm')}
			</button>
		{/if}
	{/snippet}
</AdminDialog>

<style>
	/* El campo es lo único que se toca para escribir: 44 px con cualquier puntero, como el resto
	   de campos de esta pantalla (`SecuritySettings.svelte`). */
	.step-up-code {
		min-height: 44px;
	}
</style>
