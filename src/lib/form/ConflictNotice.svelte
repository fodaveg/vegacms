<script lang="ts">
	/**
	 * `ConflictNotice.svelte` (lámina del audit, pieza 1): aviso EN LÍNEA, no modal, de que un
	 * guardado falló cerrado porque el registro cambió en el servidor desde que se abrió
	 * (`VegaConflictError`, `backend/errors.ts`). Quien edita necesita ver su formulario mientras
	 * decide, por eso ocupa el hueco del banner de error del registro y no tapa nada.
	 *
	 * Lo montan `RecordForm.svelte` (variante `page`) y `BlockEditor.svelte` (variante `narrow`, la
	 * ficha de 296 px del inspector del editor visual y las filas de `RecordBlocks.svelte`). El
	 * componente no escribe nada: el anfitrión le da las filas ya calculadas (`conflict.ts`) y dos
	 * acciones, porque qué es "lo tocado" y cómo se recarga depende de quién lo monta.
	 *
	 * **Estados** (los de la lámina):
	 *   1. aviso (`--warning`): quién guardó y cuándo, «Ver diferencias», «Descartar mis cambios y
	 *      recargar», «Guardar igualmente». Orden: primero la acción segura (ver), después las dos
	 *      que pierden algo — lo tuyo (neutra) o lo del otro (peligro).
	 *   2. diferencias abiertas: filas de `DiffRow.svelte` con su etiqueta de alcance.
	 *   3. guardando: todo deshabilitado; el botón en curso con `aria-disabled` (no `disabled`)
	 *      para que el foco no se pierda, como en `DeleteConfirm`.
	 *   4. error (`--danger`): el guardado forzado falló por otra causa (red, permisos). Si al
	 *      reintentar vuelve a haber cambios nuevos, el anfitrión pasa otro `serverVersion` y el
	 *      aviso vuelve al estado 1 con la hora nueva.
	 *
	 * **Contrato con el anfitrión**: `onForce` RESUELVE si el guardado se hizo o si el anfitrión ya
	 * atendió el desenlace (un conflicto nuevo → nuevo `serverVersion`; errores de campo → los pinta
	 * en el formulario); RECHAZA solo con lo que este aviso debe enseñar como error. `onDiscard`
	 * resuelve siempre (el anfitrión reporta sus propios fallos de recarga).
	 *
	 * **Autor**: `resolveConflictAuthor` (`revisions/conflict-author.ts`) lee `vega_revisions` y solo
	 * atribuye el cambio si la cadena de revisiones encadena con la versión que se abrió; si no,
	 * «Se guardó otra versión a las HH:MM» con `fallbackAt` (el `updated` del servidor, si la
	 * colección lo tiene) o sin hora.
	 *
	 * **Foco**: al aparecer, y cada vez que llega un conflicto nuevo, el foco va al título
	 * (`tabindex="-1"`); el contenedor es `role="alert"` para que se anuncie aunque el foco no se
	 * mueva (p. ej. si el anfitrión está oculto).
	 */
	import { tick, untrack } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import type { RecordId } from '$lib/backend/types';
	import type { RecordVersion } from '$lib/backend/version';
	import { VegaError } from '$lib/backend/errors';
	import type { ResolvedField } from '$lib/model/types';
	import Icon from '$lib/icons/Icon.svelte';
	import DiffRow from '$lib/revisions/DiffRow.svelte';
	import { resolveConflictAuthor, type ConflictAuthor } from '$lib/revisions/conflict-author';
	import type { ConflictRow, ConflictScope } from './conflict';

	interface Props {
		/** Nombre legible del registro (el mismo de la barra o del título del bloque). */
		name: string;
		variant?: 'page' | 'narrow';
		/** Campos con los que se pintan las filas (etiqueta y formato de cada valor). */
		fields: readonly ResolvedField[];
		rows: readonly ConflictRow[];
		collection: string;
		recordId: RecordId;
		/** Versión que se abrió: la que busca `resolveConflictAuthor` en el historial. */
		openedVersion: RecordVersion;
		/** Versión del servidor del conflicto VIGENTE: cambiarla reinicia el aviso (estado 1). */
		serverVersion: RecordVersion;
		/** Instante del `updated` del servidor, o `null` si la colección no lo tiene. */
		fallbackAt: Date | null;
		onDiscard: () => Promise<void>;
		onForce: () => Promise<void>;
	}

	let {
		name,
		variant = 'page',
		fields,
		rows,
		collection,
		recordId,
		openedVersion,
		serverVersion,
		fallbackAt,
		onDiscard,
		onForce
	}: Props = $props();

	const ctx = getVegaContext();
	const uid = $props.id();
	const narrow = $derived(variant === 'narrow');

	type Phase = 'idle' | 'saving' | 'discarding' | 'error';
	let phase = $state<Phase>('idle');
	let errorMessage = $state('');
	let diffOpen = $state(false);
	let author = $state<ConflictAuthor | null>(null);
	let titleEl = $state<HTMLElement | undefined>(undefined);

	// Conflicto nuevo (o el primero): vuelve al estado 1, relee el autor y lleva el foco al título.
	// Solo depende de `serverVersion`: todo lo demás se lee sin rastrear.
	$effect(() => {
		const version = serverVersion;
		untrack(() => {
			phase = 'idle';
			errorMessage = '';
			author = null;
			const opened = openedVersion;
			void resolveConflictAuthor(ctx.port, collection, recordId, opened).then((resolved) => {
				if (version === serverVersion) author = resolved;
			});
		});
		void tick().then(() => titleEl?.focus());
	});

	const busy = $derived(phase === 'saving' || phase === 'discarding');

	function formatTime(date: Date): string {
		return new Intl.DateTimeFormat(ctx.locale, { hour: '2-digit', minute: '2-digit' }).format(date);
	}

	const whoText = $derived.by(() => {
		if (author?.author) {
			return author.at
				? ctx.t('editor.conflict.byAuthor', { author: author.author, time: formatTime(author.at) })
				: ctx.t('editor.conflict.byAuthorNoTime', { author: author.author });
		}
		const at = author?.at ?? fallbackAt;
		return at
			? ctx.t('editor.conflict.atTime', { time: formatTime(at) })
			: ctx.t('editor.conflict.unknown');
	});

	const SCOPE_KIND: Record<ConflictScope, 'warn' | 'other' | 'draft'> = {
		both: 'warn',
		server: 'other',
		mine: 'draft'
	};

	function fieldFor(fieldName: string): ResolvedField | null {
		return fields.find((f) => f.name === fieldName) ?? null;
	}

	async function force(): Promise<void> {
		if (busy) return;
		phase = 'saving';
		try {
			await onForce();
			// Si el anfitrión resolvió con un conflicto NUEVO, el `$effect` de arriba ya reinició el
			// aviso; si resolvió porque se guardó, este componente se desmonta. En los dos casos,
			// volver a `idle` es inocuo.
			if (phase === 'saving') phase = 'idle';
		} catch (err) {
			errorMessage = err instanceof VegaError ? err.message : ctx.t('editor.conflict.error.title');
			phase = 'error';
		}
	}

	async function discard(): Promise<void> {
		if (busy) return;
		phase = 'discarding';
		try {
			await onDiscard();
		} finally {
			if (phase === 'discarding') phase = 'idle';
		}
	}
</script>

<div
	class="vega-conflict"
	class:vega-conflict--danger={phase === 'error'}
	class:vega-conflict--narrow={narrow}
	role="alert"
	aria-busy={busy}
	data-conflict-phase={phase}
>
	<p class="vega-conflict-title" tabindex="-1" bind:this={titleEl}>
		<Icon id="warning" size={16} />
		{#if phase === 'error'}
			{ctx.t('editor.conflict.error.title')}
		{:else}
			{narrow
				? ctx.t('editor.conflict.titleNarrow', { name })
				: ctx.t('editor.conflict.title', { name })}
		{/if}
	</p>

	{#if phase === 'error'}
		<p class="vega-conflict-body">
			{ctx.t('editor.conflict.error.body', { message: errorMessage })}
		</p>
	{:else}
		<p class="vega-conflict-who">{whoText}</p>
		{#if !narrow && !diffOpen}
			<p class="vega-conflict-who">{ctx.t('editor.conflict.nothingSaved')}</p>
		{/if}
	{/if}

	{#if diffOpen}
		<div class="vega-conflict-diff-head">
			<span>{ctx.t('editor.conflict.diffHead')}</span>
			<button
				type="button"
				class="vega-conflict-link"
				aria-expanded="true"
				aria-controls="vega-conflict-diff-{uid}"
				disabled={busy}
				onclick={() => (diffOpen = false)}
			>
				{ctx.t('editor.conflict.hideDiff')}
			</button>
		</div>
		<ul class="vega-conflict-diff" id="vega-conflict-diff-{uid}">
			{#each rows as row (row.field)}
				<DiffRow
					label={fieldFor(row.field)?.label ?? row.field}
					field={fieldFor(row.field)}
					before={row.before}
					after={row.after}
					scope={{
						id: row.scope,
						kind: SCOPE_KIND[row.scope],
						label: ctx.t(`editor.conflict.scope.${row.scope}`)
					}}
				/>
			{:else}
				<li class="vega-conflict-nodiff">{ctx.t('editor.conflict.noDiff')}</li>
			{/each}
		</ul>
	{/if}

	<div class="vega-conflict-actions">
		{#if phase === 'error'}
			<button type="button" class="vega-conflict-btn" onclick={force}>
				{ctx.t('common.retry')}
			</button>
			{#if !diffOpen}
				<button
					type="button"
					class="vega-conflict-btn vega-conflict-btn--soft"
					aria-expanded="false"
					aria-controls="vega-conflict-diff-{uid}"
					onclick={() => (diffOpen = true)}
				>
					{ctx.t('editor.conflict.showDiff')}
				</button>
			{/if}
		{:else}
			{#if !diffOpen}
				<button
					type="button"
					class="vega-conflict-btn vega-conflict-btn--soft"
					aria-expanded="false"
					aria-controls="vega-conflict-diff-{uid}"
					disabled={busy}
					onclick={() => (diffOpen = true)}
				>
					{ctx.t('editor.conflict.showDiff')}
				</button>
			{/if}
			<button
				type="button"
				class="vega-conflict-btn"
				disabled={phase === 'saving'}
				aria-disabled={phase === 'discarding' ? 'true' : undefined}
				onclick={discard}
			>
				{narrow ? ctx.t('editor.conflict.discardNarrow') : ctx.t('editor.conflict.discard')}
			</button>
			<button
				type="button"
				class="vega-conflict-btn vega-conflict-btn--danger"
				disabled={phase === 'discarding'}
				aria-disabled={phase === 'saving' ? 'true' : undefined}
				onclick={force}
			>
				{phase === 'saving' ? ctx.t('editor.saving') : ctx.t('editor.conflict.force')}
			</button>
		{/if}
	</div>
</div>

<style>
	/* `.notice` de /papelera en su tono `warning` (y `danger` para el error), compuesto aquí: el
	   CSS con ámbito de Svelte no cruza componentes. Sin tokens nuevos. */
	.vega-conflict {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--warning);
		border-radius: var(--r);
		background: var(--warning-soft);
		color: var(--warning);
	}

	.vega-conflict--danger {
		border-color: var(--danger);
		background: var(--danger-soft);
		color: var(--danger);
	}

	.vega-conflict--narrow {
		padding: 0.65rem 0.75rem;
	}

	.vega-conflict p {
		margin: 0;
	}

	/* El icono hereda el color del tono (`currentColor`); el texto va en `--ink-hi`, que es el que
	   da contraste sobre el fondo suave (mismo criterio que `.notice-title` de /papelera). */
	.vega-conflict-title {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-weight: 600;
		color: var(--ink-hi);
		overflow-wrap: anywhere;
	}

	.vega-conflict-title :global(svg) {
		flex-shrink: 0;
		color: var(--warning);
	}

	.vega-conflict--danger .vega-conflict-title :global(svg) {
		color: var(--danger);
	}

	.vega-conflict-title:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	/* `--ink`, no `--ink-2`: sobre `--warning-soft` el gris secundario se queda en 4,1:1 en claro. */
	.vega-conflict-who,
	.vega-conflict-body {
		font-size: 0.84rem;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.vega-conflict-diff-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.25rem;
		color: var(--ink);
		font-size: 0.8rem;
	}

	.vega-conflict-link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent-text);
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.vega-conflict-link:hover:not(:disabled) {
		text-decoration: underline;
	}

	.vega-conflict-diff {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-conflict-nodiff {
		font-size: 0.82rem;
		color: var(--ink);
	}

	.vega-conflict-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.15rem;
	}

	/* Botón de barra neutro (`--btn`), igual que los de `RecordForm.svelte`. */
	.vega-conflict-btn {
		display: inline-flex;
		align-items: center;
		height: 34px;
		padding: 0 0.9rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 550;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-conflict--narrow .vega-conflict-btn {
		height: 30px;
		padding: 0 0.75rem;
		font-size: 0.8rem;
	}

	.vega-conflict-btn:hover:not(:disabled):not([aria-disabled='true']) {
		border-color: var(--line-strong);
	}

	.vega-conflict-btn:disabled,
	.vega-conflict-btn[aria-disabled='true'] {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.vega-conflict-btn:focus-visible,
	.vega-conflict-link:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	/* Suave de acento (`.vega-revision-diff-restore`): la acción segura. */
	.vega-conflict-btn--soft {
		border-color: var(--accent-line);
		background: var(--accent-soft);
		color: var(--accent-text);
		font-weight: 600;
	}

	/* Peligro (`.vega-editor-delete-button`): la acción que pisa lo del otro. */
	.vega-conflict-btn--danger {
		border-color: transparent;
		background: var(--danger-soft);
		color: var(--danger);
	}

	.vega-conflict-btn--danger:hover:not(:disabled):not([aria-disabled='true']) {
		border-color: transparent;
		box-shadow: 0 0 0 1.5px var(--danger);
	}

	@media (pointer: coarse) {
		.vega-conflict-btn {
			min-height: 44px;
		}
	}
</style>
