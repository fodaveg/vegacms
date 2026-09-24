<script lang="ts">
	/**
	 * `VisualPublishControl.svelte` (lámina del audit, pieza 2): el estado de la página que se edita,
	 * en la cabecera del editor visual justo después de las migas — la etiqueta de siempre
	 * (`classifyStatusBadge` + `statusLabels`, la misma píldora que `RecordForm` y la tabla) y un
	 * botón para cambiarlo.
	 *
	 * **Un solo escritor.** Escribe por el mismo camino que el formulario: `ctx.port.update(type, id,
	 * { [statusField]: … })` sobre el puerto de la app (con `withRevisions` delante, así que deja su
	 * revisión como cualquier guardado) y con la versión esperada del registro que tiene delante
	 * (edición concurrente, `backend/version.ts`). No es un segundo formulario: solo toca
	 * `statusField`, una operación aparte de los bloques.
	 *
	 * **Sin optimismo.** La etiqueta es la del registro que el SERVIDOR confirmó (`confirmed`): cambia
	 * cuando `update` resuelve, nunca al pulsar. Mientras tanto el botón dice «Cambiando estado…»
	 * con `aria-disabled` (no `disabled`, para no perder el foco).
	 *
	 * **Estados**: sin `statusField` no se pinta NADA (P3-L3, igual que `PublishButton`); sin
	 * permiso de actualizar, solo la etiqueta; un valor que no es `draft` ni `published` sale como
	 * `other` con su `statusLabels` y la acción es publicar; un fallo deja el texto de error junto
	 * al botón (el motivo, en su `title` y en el feedback global de siempre) y el botón reintenta;
	 * un conflicto de versión adopta el registro del servidor —la etiqueta pasa a decir la verdad— y
	 * pide revisar antes de repetir, sin reintentar solo.
	 *
	 * **Bloques sin guardar** (decisión de David): marcar como publicada con bloques sucios pide
	 * confirmación EN LÍNEA (patrón `notice-confirm` de /papelera): la lista de bloques, «Publicar
	 * igualmente» / «Cancelar», foco inicial en «Cancelar», Esc cierra. «Publicar igualmente» NO
	 * guarda los bloques (no existe "guardar todos"). Pasar a borrador no pregunta: no expone nada.
	 *
	 * **Rótulo distinto del «Publicar» de la barra superior** (`PublishButton`, que reconstruye el
	 * sitio): «Marcar como publicada». Y si el proyecto tiene reconstrucción configurada
	 * (`ctx.port.buildApiUrl`), el mensaje de éxito avisa de que se verá en el sitio tras la próxima
	 * publicación.
	 */
	import { tick, untrack } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import type { VegaRecord } from '$lib/backend/types';
	import { isConflictError, VegaError } from '$lib/backend/errors';
	import { recordVersion } from '$lib/backend/version';
	import { classifyStatusBadge } from '$lib/list/cell';
	import type { ResolvedContentType } from '$lib/model/types';
	import Icon from '$lib/icons/Icon.svelte';

	interface Props {
		type: ResolvedContentType;
		/** El registro de la página tal cual lo cargó la ruta. */
		record: VegaRecord;
		/** Nombre legible de la página (el de las migas), para el mensaje de éxito. */
		name: string;
		/** Títulos de los bloques con cambios sin guardar (`blocks.isDirty`). */
		pendingBlocks: readonly string[];
	}

	let { type, record, name, pendingBlocks }: Props = $props();

	const ctx = getVegaContext();
	const uid = $props.id();

	type Target = 'draft' | 'published';
	type Phase = 'idle' | 'confirming' | 'changing' | 'error';

	/** El registro que el servidor CONFIRMÓ por última vez (ver cabecera, "Sin optimismo"). */
	let confirmed = $state.raw<VegaRecord>(untrack(() => record));
	let phase = $state<Phase>('idle');
	let errorKind = $state<'failed' | 'conflict'>('failed');
	let errorTarget = $state<Target>('published');
	let errorDetail = $state('');
	let actionEl = $state<HTMLButtonElement | undefined>(undefined);
	let cancelEl = $state<HTMLButtonElement | undefined>(undefined);

	// Otra página (la ruta reutiliza el componente): se parte de SU registro, sin arrastrar estado.
	let syncedRecord = untrack(() => record);
	$effect(() => {
		if (record !== syncedRecord) {
			syncedRecord = record;
			confirmed = record;
			phase = 'idle';
		}
	});

	const statusField = $derived(type.statusField);
	const canEdit = $derived(type.permissions.update && !type.readonly);

	const tag = $derived.by(() => {
		if (statusField === null) return null;
		const raw = confirmed.values[statusField];
		if (typeof raw !== 'string' || raw === '') return null;
		return { raw, label: type.statusLabels?.[raw] ?? raw, kind: classifyStatusBadge(raw) };
	});

	/** Lo que hace el botón: pasar a borrador si está publicada; publicar en cualquier otro caso. */
	const target = $derived<Target>(tag?.raw === 'published' ? 'draft' : 'published');
	const asksConfirmation = $derived(target === 'published' && pendingBlocks.length > 0);
	const retrying = $derived(phase === 'error' && errorKind === 'failed' && errorTarget === target);

	const actionLabel = $derived(
		phase === 'changing'
			? ctx.t('editor.visual.status.changing')
			: retrying
				? ctx.t('common.retry')
				: target === 'published'
					? ctx.t('editor.visual.status.publish')
					: ctx.t('editor.visual.status.unpublish')
	);

	const errorText = $derived(
		errorKind === 'conflict'
			? ctx.t('editor.visual.status.error.conflict')
			: errorTarget === 'published'
				? ctx.t('editor.visual.status.error.publish')
				: ctx.t('editor.visual.status.error.unpublish')
	);

	async function requestChange(): Promise<void> {
		if (phase === 'changing') return;
		if (phase === 'confirming') {
			await cancelConfirm();
			return;
		}
		if (asksConfirmation) {
			phase = 'confirming';
			await tick();
			cancelEl?.focus();
			return;
		}
		await change(target);
	}

	async function cancelConfirm(): Promise<void> {
		phase = 'idle';
		await tick();
		actionEl?.focus();
	}

	function handlePopKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		void cancelConfirm();
	}

	async function change(to: Target): Promise<void> {
		if (statusField === null) return;
		const refocus = phase === 'confirming';
		phase = 'changing';
		if (refocus) {
			await tick();
			actionEl?.focus();
		}
		try {
			const saved = await ctx.port.update(
				type.name,
				confirmed.id,
				{ [statusField]: to },
				{ expectedVersion: recordVersion(confirmed) }
			);
			confirmed = saved;
			phase = 'idle';
			const label = type.statusLabels?.[to] ?? to;
			const message = ctx.t('editor.visual.status.success', { name, label });
			ctx.feedback.toast(
				ctx.port.buildApiUrl
					? `${message} ${ctx.t('editor.visual.status.success.rebuild')}`
					: message,
				{ kind: 'success' }
			);
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('No se pudo cambiar el estado', err);
			errorTarget = to;
			if (isConflictError(vegaErr)) {
				// Falla cerrado y enseña la verdad: la etiqueta pasa a la del servidor.
				confirmed = vegaErr.serverRecord;
				errorKind = 'conflict';
				errorDetail = '';
			} else {
				errorKind = 'failed';
				errorDetail = vegaErr.message;
				ctx.feedback.reportError(vegaErr, { action: 'visual:status' });
			}
			phase = 'error';
		}
	}
</script>

{#if statusField !== null}
	<span
		class="vega-visual-publish"
		role={canEdit ? 'group' : undefined}
		aria-label={canEdit ? ctx.t('editor.visual.status.groupLabel') : undefined}
	>
		{#if tag}
			<span class="vega-visual-publish-tag" data-status={tag.raw} data-status-kind={tag.kind}>
				{tag.label}
			</span>
		{/if}

		{#if canEdit}
			<button
				type="button"
				class="vega-visual-publish-btn"
				class:vega-visual-publish-btn--primary={target === 'published'}
				bind:this={actionEl}
				aria-disabled={phase === 'changing' ? 'true' : undefined}
				aria-expanded={asksConfirmation ? phase === 'confirming' : undefined}
				aria-controls={asksConfirmation && phase === 'confirming' ? `${uid}-pop` : undefined}
				data-status-target={target}
				onclick={() => void requestChange()}
			>
				{actionLabel}
			</button>

			{#if phase === 'error'}
				<span class="vega-visual-publish-error" role="alert" title={errorDetail || undefined}>
					<Icon id="warning" size={14} />
					{errorText}
				</span>
			{/if}

			{#if phase === 'confirming'}
				<!-- Confirmación en línea (patrón `notice-confirm` de /papelera, ver cabecera). -->
				<div
					class="vega-visual-publish-pop"
					id="{uid}-pop"
					role="alertdialog"
					aria-labelledby="{uid}-pop-title"
					aria-describedby="{uid}-pop-body"
					tabindex="-1"
					onkeydown={handlePopKeydown}
				>
					<p class="vega-visual-publish-pop-title" id="{uid}-pop-title">
						{ctx.t('editor.visual.status.confirm.title', { count: pendingBlocks.length })}
					</p>
					<ul>
						{#each pendingBlocks as title, i (i)}
							<li>«{title}»</li>
						{/each}
					</ul>
					<p class="vega-visual-publish-pop-body" id="{uid}-pop-body">
						{ctx.t('editor.visual.status.confirm.body')}
					</p>
					<div class="vega-visual-publish-pop-actions">
						<button
							type="button"
							class="vega-visual-publish-pop-btn vega-visual-publish-pop-btn--primary"
							onclick={() => void change('published')}
						>
							{ctx.t('editor.visual.status.confirm.publish')}
						</button>
						<button
							type="button"
							class="vega-visual-publish-pop-btn"
							bind:this={cancelEl}
							onclick={() => void cancelConfirm()}
						>
							{ctx.t('common.cancel')}
						</button>
					</div>
				</div>
			{/if}
		{/if}
	</span>
{/if}

<style>
	/* Agrupa etiqueta y botón; el filete a la izquierda lo separa de las migas (lámina p2). */
	.vega-visual-publish {
		position: relative;
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding-left: 0.75rem;
		border-left: 1px solid var(--line);
	}

	/* Misma píldora que `.vega-editor-tag` de `RecordForm.svelte` (el CSS con ámbito no cruza). */
	.vega-visual-publish-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
		height: 24px;
		padding: 0 0.65rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 24px;
		white-space: nowrap;
	}

	.vega-visual-publish-tag::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
		flex-shrink: 0;
	}

	.vega-visual-publish-tag[data-status-kind='pub'] {
		color: var(--success);
		background: var(--success-soft);
	}

	.vega-visual-publish-tag[data-status-kind='draft'] {
		color: var(--ink-2);
		background: var(--btn);
	}

	.vega-visual-publish-tag[data-status-kind='other'] {
		color: var(--info);
		background: var(--info-soft);
	}

	/* Botón neutro de la barra (`--btn`) a 30 px, como los grupos de la barra visual. */
	.vega-visual-publish-btn {
		display: inline-flex;
		align-items: center;
		height: 30px;
		padding: 0 0.75rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 550;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-visual-publish-btn:hover:not([aria-disabled='true']) {
		border-color: var(--line-strong);
	}

	/* Primario (`.vega-editor-save-button`): la acción que expone la página. */
	.vega-visual-publish-btn--primary {
		border-color: transparent;
		background: var(--accent-fill);
		color: var(--accent-ink);
		font-weight: 600;
	}

	.vega-visual-publish-btn--primary:hover:not([aria-disabled='true']) {
		border-color: transparent;
		box-shadow: 0 0 0 1.5px var(--accent-line);
	}

	.vega-visual-publish-btn[aria-disabled='true'] {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.vega-visual-publish-btn:focus-visible,
	.vega-visual-publish-pop-btn:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.vega-visual-publish-error {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--danger);
	}

	/* Confirmación en línea (`notice-confirm` de /papelera, tono `info`), desplegada bajo el botón. */
	.vega-visual-publish-pop {
		position: absolute;
		top: calc(100% + 0.5rem);
		left: 0;
		z-index: 20;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: min(23rem, calc(100vw - 2rem));
		padding: 0.75rem 1rem;
		border: 1px solid var(--info);
		border-radius: var(--r);
		background: var(--info-soft);
		color: var(--info);
		box-shadow: var(--shadow-card);
		box-sizing: border-box;
	}

	.vega-visual-publish-pop p {
		margin: 0;
	}

	.vega-visual-publish-pop-title {
		font-weight: 600;
		color: var(--ink-hi);
	}

	.vega-visual-publish-pop ul {
		margin: 0.1rem 0 0;
		padding-left: 1.1rem;
		color: var(--ink);
		font-size: 0.85rem;
	}

	.vega-visual-publish-pop-body {
		color: var(--ink);
		font-size: 0.85rem;
	}

	.vega-visual-publish-pop-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.vega-visual-publish-pop-btn {
		height: 30px;
		padding: 0 0.75rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 550;
		cursor: pointer;
	}

	.vega-visual-publish-pop-btn--primary {
		border-color: transparent;
		background: var(--accent-fill);
		color: var(--accent-ink);
		font-weight: 600;
	}

	/* Estrecho: el control baja a su propia línea (lámina p2). */
	@media (max-width: 767px) {
		.vega-visual-publish {
			flex-basis: 100%;
			order: 3;
			padding-left: 0;
			border-left: 0;
		}
	}

	@media (pointer: coarse) {
		.vega-visual-publish-btn,
		.vega-visual-publish-pop-btn {
			min-width: 44px;
			min-height: 44px;
		}
	}
</style>
