<script lang="ts">
	/**
	 * Formulario y estados de `/restablecer` (la ruta solo aporta el token de la URL y la forma de
	 * confirmar, ver su cabecera). Estados: formulario, guardando, hecho (con enlace a entrar),
	 * enlace caducado o ya usado (el servidor rechaza el token), sin token y error.
	 *
	 * La validación de las dos contraseñas es la de `/editores` (`PasswordFields`,
	 * `editor-form.ts`): al enviar o al salir del campo, con el mínimo de fábrica de PocketBase
	 * (una ruta sin sesión no puede leer el de la colección); si el servidor exige otro, su
	 * mensaje va al campo.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend';
	import { DEFAULT_PASSWORD_MIN_LENGTH } from '$lib/backend/administration-rules';
	import PasswordFields from './PasswordFields.svelte';
	import {
		formErrorsFromVegaError,
		validatePasswordPair,
		type EditorFormErrors
	} from './editor-form';
	import './admin.css';

	interface Props {
		/** Token del correo (`?token=`), `''` si la URL no lo trae. */
		token: string;
		/** Confirma con el puerto; `null` si este backend no ofrece restablecer desde Vega. */
		confirm: ((token: string, password: string) => Promise<void>) | null;
		loginHref: string;
	}

	let { token, confirm: confirmReset, loginHref }: Props = $props();

	const ctx = getVegaContext();

	type Status = 'form' | 'saving' | 'done' | 'expired' | 'error';

	let status = $state<Status>('form');
	let password = $state('');
	let confirm = $state('');
	let errors = $state<EditorFormErrors>({});
	let failure = $state('');

	function blurPassword(): void {
		if (password === '') return;
		const pair = validatePasswordPair(password, confirm || password, DEFAULT_PASSWORD_MIN_LENGTH);
		errors = { ...errors, password: pair.password };
	}

	function blurConfirm(): void {
		if (confirm === '') return;
		const pair = validatePasswordPair(password, confirm, DEFAULT_PASSWORD_MIN_LENGTH);
		errors = { ...errors, password: pair.password, confirm: pair.confirm };
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (status === 'saving') return;
		const next = validatePasswordPair(password, confirm, DEFAULT_PASSWORD_MIN_LENGTH);
		errors = next;
		if (Object.keys(next).length > 0) return;
		if (!confirmReset) {
			failure = ctx.t('admin.reset.unavailable');
			status = 'error';
			return;
		}

		status = 'saving';
		try {
			await confirmReset(token, password);
			status = 'done';
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error al guardar la contraseña', err);
			if (vegaErr.kind === 'validation' && vegaErr.fieldErrors?.token) {
				status = 'expired';
				return;
			}
			const fieldErrors = formErrorsFromVegaError(vegaErr);
			if (fieldErrors) {
				errors = fieldErrors;
				status = 'form';
				return;
			}
			failure = vegaErr.message;
			status = 'error';
		}
	}
</script>

<section class="vega-reset-card" aria-labelledby="vega-reset-title">
	{#if token === ''}
		<h1 id="vega-reset-title">{ctx.t('admin.reset.expiredTitle')}</h1>
		<p class="vega-admin-dialog-text" data-reset-state="missing">
			{ctx.t('admin.reset.missingToken')}
		</p>
	{:else if status === 'done'}
		<h1 id="vega-reset-title">{ctx.t('admin.reset.successTitle')}</h1>
		<p class="vega-admin-dialog-text" role="status" data-reset-state="done">
			{ctx.t('admin.reset.successBody')}
		</p>
		<!-- `loginHref` ya viene de `loginRoute()`, que prefija `base`: es la misma URL que resolvería
		     `resolve()`, construida en el único módulo que compone rutas (`nav/routes.ts`). -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a class="vega-admin-btn vega-admin-btn--primary vega-reset-link" href={loginHref}>
			{ctx.t('admin.reset.toLogin')}
		</a>
	{:else if status === 'expired'}
		<h1 id="vega-reset-title">{ctx.t('admin.reset.expiredTitle')}</h1>
		<p class="vega-admin-dialog-text" role="alert" data-reset-state="expired">
			{ctx.t('admin.reset.expiredBody')}
		</p>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a class="vega-admin-btn vega-reset-link" href={loginHref}>
			{ctx.t('admin.reset.toLogin')}
		</a>
	{:else}
		<h1 id="vega-reset-title">{ctx.t('admin.reset.title')}</h1>
		<p class="vega-admin-dialog-text">{ctx.t('admin.reset.intro')}</p>
		{#if status === 'error'}
			<div
				class="vega-admin-notice vega-admin-notice--danger"
				role="alert"
				data-reset-state="error"
			>
				<p class="vega-admin-notice-title">{ctx.t('admin.reset.errorTitle')}</p>
				<p class="vega-admin-notice-body">{failure}</p>
			</div>
		{/if}
		<form class="vega-admin-form" novalidate onsubmit={submit} data-reset-state="form">
			<PasswordFields
				bind:password
				bind:confirm
				label={ctx.t('admin.form.newPassword')}
				minLength={DEFAULT_PASSWORD_MIN_LENGTH}
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
			<button
				type="submit"
				class="vega-admin-btn vega-admin-btn--primary"
				aria-disabled={status === 'saving'}
			>
				{status === 'saving' ? ctx.t('admin.reset.saving') : ctx.t('admin.reset.submit')}
			</button>
		</form>
	{/if}
</section>

<style>
	.vega-reset-card {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		width: 100%;
		max-width: 26rem;
		padding: 1.5rem;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-card);
		box-sizing: border-box;
	}

	.vega-reset-card h1 {
		margin: 0;
		font-size: 1.2rem;
		color: var(--ink-hi);
	}

	.vega-reset-link {
		align-self: flex-start;
		text-decoration: none;
	}
</style>
