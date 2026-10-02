<script lang="ts">
	/**
	 * Diálogo «Programar la publicación» (lote 12, lámina 2, estados 2.1 a 2.4 y 2.3 del servidor sin
	 * comprobar). Reutilizable: lo monta `RecordForm.svelte` junto al campo Estado y lo montará igual
	 * `VisualPublishControl.svelte` (lámina 2.11). Quien lo monta decide QUÉ es guardar; aquí solo se
	 * elige y se valida la fecha.
	 *
	 * - Fecha propuesta: la de `at` si el registro ya está programado («Cambiar fecha…»), o mañana a
	 *   las 09:00 (`proposeScheduleLocal`). Foco inicial en la fecha. Cada apertura empieza de cero.
	 * - Fecha pasada (2.2): el error sale al SALIR del campo y al pulsar «Programar»; mientras tanto
	 *   no se escribe ningún mensaje. El botón queda con `aria-disabled` (nunca `disabled`, para no
	 *   vaciar la trampa de foco de `AdminDialog`).
	 * - Servidor sin comprobar (2.3, `unconfirmed`): aviso dentro del diálogo, con el mismo texto que
	 *   el aviso de «Publicar el»; no impide programar.
	 * - Guardando (2.4): el botón dice «Programando…» y el diálogo no se puede cerrar. Si falla, se
	 *   queda abierto con el motivo y el botón pasa a «Reintentar».
	 *
	 * **Contrato de `onSubmit`**: recibe la fecha en ISO UTC y devuelve `null` si el diálogo debe
	 * cerrarse (se guardó, o algo más tomó el relevo: conflicto de edición, errores de otros campos)
	 * o el MOTIVO del fallo (texto) si debe quedarse abierto. Si lanza, se enseña el `message`.
	 *
	 * Sin `<form>` propio: así puede montarse dentro de otro formulario sin anidarlos. Intro en el
	 * campo programa, y se cancela para que no envíe el formulario de fuera.
	 */
	import { untrack } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import AdminDialog from '$lib/admin/AdminDialog.svelte';
	import { isoUtcToLocalInput, localInputToIsoUtc } from './widgets/datetime';
	import { proposeScheduleLocal } from './schedule';

	interface Props {
		open: boolean;
		/** Nombre del registro, para la frase del diálogo. */
		name: string;
		/** Fecha ya puesta (ISO UTC), o `null` para proponer mañana a las 09:00. */
		at: string | null;
		/** `true` si el servidor no se ha podido comprobar (aviso 2.3). */
		unconfirmed?: boolean;
		/** Dónde cae el foco si el botón que abrió el diálogo ya no está al cerrarlo. */
		fallbackFocusEl?: HTMLElement | null;
		onSubmit: (iso: string) => Promise<string | null>;
		onClose: () => void;
	}

	let {
		open,
		name,
		at,
		unconfirmed = false,
		fallbackFocusEl = null,
		onSubmit,
		onClose
	}: Props = $props();

	const ctx = getVegaContext();
	const id = $props.id();

	let value = $state('');
	let error = $state<'empty' | 'past' | null>(null);
	let saving = $state(false);
	let failure = $state<string | null>(null);
	/** Se propuso una fecha (no había ninguna): la ayuda lo dice. */
	let proposed = $state(true);

	// Cada apertura empieza en blanco: nunca hereda un fallo ni una fecha tecleada la vez anterior.
	$effect(() => {
		if (!open) return;
		// `at` se lee solo al abrir: que cambie con el diálogo abierto (el guardado reasienta el
		// formulario justo antes de cerrarlo) no debe pisar lo que se esté tecleando.
		const existing = untrack(() => (at ? isoUtcToLocalInput(at) : ''));
		proposed = existing === '';
		value = existing || proposeScheduleLocal();
		error = null;
		saving = false;
		failure = null;
	});

	/** ISO UTC si la fecha vale; si no deja el error escrito y devuelve `null`. */
	function check(): string | null {
		const iso = localInputToIsoUtc(value);
		if (iso === null) {
			error = 'empty';
			return null;
		}
		if (Date.parse(iso) <= Date.now()) {
			error = 'past';
			return null;
		}
		error = null;
		return iso;
	}

	function blur(): void {
		// Sin nada tecleado no se riñe: el error de «vacío» solo sale al pulsar «Programar».
		if (value === '') return;
		check();
	}

	async function submit(): Promise<void> {
		if (saving) return;
		const iso = check();
		if (iso === null) return;
		saving = true;
		failure = null;
		try {
			const reason = await onSubmit(iso);
			saving = false;
			if (reason === null) onClose();
			else failure = reason;
		} catch (err) {
			saving = false;
			failure = err instanceof Error ? err.message : String(err);
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter' || event.isComposing) return;
		event.preventDefault();
		void submit();
	}
</script>

<AdminDialog
	{open}
	title={ctx.t('editor.schedule.title')}
	description={ctx.t('editor.schedule.description', { name })}
	busy={saving}
	{fallbackFocusEl}
	{onClose}
>
	<div class="vega-admin-field">
		<label for="{id}-at">{ctx.t('editor.schedule.field')}</label>
		<input
			id="{id}-at"
			class="vega-admin-input"
			type="datetime-local"
			bind:value
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `${id}-at-error` : `${id}-at-hint`}
			data-autofocus=""
			onblur={blur}
			onkeydown={handleKeydown}
		/>
		{#if error}
			<p class="vega-admin-field-error" id="{id}-at-error" role="alert">
				{ctx.t(error === 'past' ? 'editor.schedule.error.past' : 'editor.schedule.error.empty')}
			</p>
		{:else}
			<p class="vega-admin-help" id="{id}-at-hint">
				{ctx.t(proposed ? 'editor.schedule.hintProposal' : 'editor.schedule.hint')}
			</p>
		{/if}
	</div>

	{#if unconfirmed}
		<div class="vega-admin-notice vega-admin-notice--warning" data-schedule="unconfirmed">
			<p class="vega-admin-notice-body">{ctx.t('editor.publishAt.unknown')}</p>
		</div>
	{/if}

	{#if failure !== null}
		<div class="vega-admin-notice vega-admin-notice--danger" role="alert" data-schedule="failed">
			<p class="vega-admin-notice-title">{ctx.t('editor.schedule.failed.title')}</p>
			<p class="vega-admin-notice-body">
				{ctx.t('editor.schedule.failed.body', { message: failure })}
			</p>
		</div>
	{/if}

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
			type="button"
			class="vega-admin-btn vega-admin-btn--primary"
			aria-disabled={saving || error !== null}
			onclick={() => void submit()}
		>
			{saving
				? ctx.t('editor.schedule.confirming')
				: failure !== null
					? ctx.t('editor.schedule.retry')
					: ctx.t('editor.schedule.confirm')}
		</button>
	{/snippet}
</AdminDialog>
