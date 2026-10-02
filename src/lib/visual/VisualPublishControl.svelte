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
	 * **Revisión antes de publicar** (lote 13, lámina 2.1-2.4, decisión 6): con `review` (el estado
	 * de `review-state.svelte.ts` que crea `VisualEditorScreen`), «Marcar como publicada» pregunta
	 * también si la revisión tiene avisos o algo sin comprobar (`review.needsAttention`), en el
	 * MISMO popover y en tono de aviso (`--warning`/`--warning-soft`, la pareja de
	 * `.vega-field-notice`): la lista de grupos (`ReviewGroups.svelte`, `surface="visual"`), «Ningún
	 * aviso impide publicar», «Publicar igualmente» / «Cancelar». Sin avisos publica a la primera,
	 * como hoy. Con bloques sin guardar Y avisos sale UNA sola confirmación («Antes de publicar»:
	 * los bloques primero, que es lo que más cambia lo que se publica, y los avisos debajo), nunca
	 * dos seguidas. Si se pulsa antes de que la revisión termine de cargar: «Revisando la página…» y
	 * «Publicar sin esperar»; al terminar, el popover se rellena en el sitio (con avisos, la lista;
	 * sin avisos, «Sin avisos» y el botón vuelve a decir «Marcar como publicada»), y NUNCA publica
	 * solo. Si la revisión falló: «No se ha podido revisar la página» con «Reintentar», y publicar
	 * sigue a mano (no saber no es lo mismo que no poder). Las acciones de un aviso (`onReviewGo`,
	 * `onReviewDescribe`) las resuelve la pantalla: un campo del registro abre el formulario con
	 * ese campo enfocado, un bloque se elige en el árbol, una imagen sin alt abre su ficha; en los
	 * tres casos el popover se cierra. Sin permiso de editar no hay botón, así que tampoco popover.
	 *
	 * **Rótulo distinto del «Publicar» de la barra superior** (`PublishButton`, que reconstruye el
	 * sitio): «Marcar como publicada». Y si el proyecto tiene reconstrucción configurada
	 * (`ctx.port.buildApiUrl`), el mensaje de éxito avisa de que se verá en el sitio tras la próxima
	 * publicación.
	 *
	 * **«Programar…»** (lote 12, lámina 2, pieza 2.11): el mismo cableado que `RecordForm` junto al
	 * campo Estado. `describeScheduleControl` decide con lo que el servidor confirmó si va el botón
	 * («Programar…» en un borrador; «Cambiar fecha…» si ya hay fecha vigente o vencida) o nada
	 * (publicada, sin permiso, sin `publishAtField`, servidor comprobado SIN `vegaschedule`). Abre el
	 * mismo `ScheduleDialog`; confirmar escribe por el MISMO `port.update` de arriba, solo
	 * `statusField: 'draft'` + `publishAtField`, con la versión esperada. La etiqueta pasa por
	 * `describeStatusBadge` (la misma píldora que el formulario y la tabla), así que una página
	 * programada dice «Programada · fecha». Un fallo al guardar deja el diálogo abierto con el
	 * motivo (contrato de `ScheduleDialog`); un conflicto de versión lo cierra y el control adopta el
	 * registro del servidor, igual que al cambiar el estado.
	 */
	import { tick, untrack } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import type { VegaRecord } from '$lib/backend/types';
	import { isConflictError, VegaError } from '$lib/backend/errors';
	import { recordVersion } from '$lib/backend/version';
	import ScheduleDialog from '$lib/form/ScheduleDialog.svelte';
	import { describeScheduleControl, formatScheduleMoment } from '$lib/form/schedule';
	import { describeStatusBadge } from '$lib/list/cell';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { ReviewFinding } from '$lib/publish-review/publish-review';
	import type { ReviewState } from '$lib/publish-review/review-state.svelte';
	import ReviewGroups from '$lib/publish-review/ReviewGroups.svelte';
	import Icon from '$lib/icons/Icon.svelte';

	interface Props {
		type: ResolvedContentType;
		/** El registro de la página tal cual lo cargó la ruta. */
		record: VegaRecord;
		/** Nombre legible de la página (el de las migas), para el mensaje de éxito. */
		name: string;
		/** Títulos de los bloques con cambios sin guardar (`blocks.isDirty`). */
		pendingBlocks: readonly string[];
		/** La revisión antes de publicar de esta página (ver cabecera), o `null` si el tipo no tiene
		 *  revisión (sin `statusField` ya no se pinta nada; sin comprobaciones que apliquen,
		 *  `review.enabled` es `false` y se publica a la primera). */
		review?: ReviewState | null;
		/** Ir al campo (abre el formulario) o al bloque (lo elige en el árbol) de un aviso. */
		onReviewGo?: (finding: ReviewFinding) => void;
		/** «Describir la imagen…» de un aviso de alt: abrir la ficha de Medios. */
		onReviewDescribe?: (finding: ReviewFinding) => void;
	}

	let {
		type,
		record,
		name,
		pendingBlocks,
		review = null,
		onReviewGo,
		onReviewDescribe
	}: Props = $props();

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

	/** ¿Cumple el servidor «Publicar el»? (`ContentModel.scheduledPublishing`, como en `RecordForm`). */
	const scheduling = $derived(ctx.model.scheduledPublishing ?? 'unknown');

	/** La misma píldora que la cabecera del formulario y la tabla (`describeStatusBadge`): con
	 *  `publishAtField`, un borrador con fecha dice «Programada · fecha» o «no se publicó». */
	const tag = $derived(describeStatusBadge(type, confirmed.values, scheduling, ctx.locale, ctx.t));

	// ————— «Programar…» (ver cabecera): mismo cableado que junto al campo Estado del formulario —————

	/** Botón de programar o nada, decidido sobre el registro que el servidor confirmó. */
	const scheduleControl = $derived(
		describeScheduleControl(type, confirmed.values, scheduling, !canEdit)
	);
	let scheduleOpen = $state(false);
	/** Fecha que se enseña al abrir: la vigente si ya está programada; si no, el diálogo propone. */
	const scheduleAt = $derived.by(() => {
		const field = type.publishAtField;
		const value = field ? confirmed.values[field] : null;
		return scheduleControl.kind === 'scheduled' && typeof value === 'string' ? value : null;
	});

	/** Abre el diálogo de «Programar…» / «Cambiar fecha…». */
	function openSchedule(): void {
		if (phase === 'changing') return;
		scheduleOpen = true;
	}

	/** Cierra el diálogo. Si el botón que lo abrió ya no está (un conflicto dejó la página publicada),
	 *  el foco cae en el botón de estado, como tras cancelar la confirmación en línea. */
	async function closeSchedule(): Promise<void> {
		scheduleOpen = false;
		await tick();
		if (scheduleControl.kind === 'none') actionEl?.focus();
	}

	/**
	 * Confirmar el diálogo: deja la página en borrador con la fecha elegida, por el mismo
	 * `port.update` que el cambio de estado. Devuelve `null` para cerrar el diálogo (guardó, o el
	 * conflicto toma el relevo en el control) o el motivo si debe quedarse abierto (contrato de
	 * `ScheduleDialog`). Un fallo no va al feedback global: el motivo se lee en el diálogo.
	 */
	async function submitSchedule(iso: string): Promise<string | null> {
		const publishAtField = type.publishAtField;
		if (statusField === null || !publishAtField) return null;
		try {
			const saved = await ctx.port.update(
				type.name,
				confirmed.id,
				{ [statusField]: 'draft', [publishAtField]: iso },
				{ expectedVersion: recordVersion(confirmed) }
			);
			confirmed = saved;
			phase = 'idle';
			const when = formatScheduleMoment(Date.parse(iso), ctx.locale, ctx.t);
			ctx.feedback.toast(ctx.t('editor.schedule.savedNote', { when }), { kind: 'success' });
			return null;
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('No se pudo programar', err);
			if (isConflictError(vegaErr)) {
				// Como al cambiar el estado: la etiqueta pasa a la verdad del servidor y se pide revisar.
				confirmed = vegaErr.serverRecord;
				errorTarget = 'draft';
				errorKind = 'conflict';
				errorDetail = '';
				phase = 'error';
				// Que el botón de programar se haya ido YA cuando el diálogo cierre: así `AdminDialog` no
				// devuelve el foco a un nodo a punto de desaparecer, y `closeSchedule` lo lleva al de estado.
				await tick();
				return null;
			}
			return vegaErr.message;
		}
	}

	/** Lo que hace el botón: pasar a borrador si está publicada; publicar en cualquier otro caso. */
	const target = $derived<Target>(tag?.raw === 'published' ? 'draft' : 'published');

	// ————— Revisión antes de publicar (ver cabecera) —————

	/** La revisión tiene algo que decir antes de publicar: avisos, algo sin comprobar, carga en
	 *  curso o fallida. `false` sin revisión o con todo en regla. */
	const reviewSays = $derived(review !== null && review.enabled && review.needsAttention);
	const reviewLoading = $derived(
		reviewSays && (review!.phase === 'loading' || review!.phase === 'idle')
	);
	const reviewFailed = $derived(reviewSays && review!.phase === 'error');
	const findingsCount = $derived(review?.result.findings.length ?? 0);

	const asksConfirmation = $derived(
		target === 'published' && (pendingBlocks.length > 0 || reviewSays)
	);
	const retrying = $derived(phase === 'error' && errorKind === 'failed' && errorTarget === target);

	/** Título del popover: UNA confirmación con las dos cosas si hay bloques sin guardar y avisos. */
	const popTitle = $derived.by(() => {
		if (pendingBlocks.length > 0 && reviewSays) return ctx.t('editor.visual.review.title.mixed');
		if (pendingBlocks.length > 0) {
			return ctx.t(
				pendingBlocks.length === 1
					? 'editor.visual.status.confirm.title.one'
					: 'editor.visual.status.confirm.title.many',
				{ count: pendingBlocks.length }
			);
		}
		if (reviewLoading) return ctx.t('editor.visual.review.checking.title');
		if (reviewFailed) return ctx.t('editor.visual.review.error');
		if (findingsCount > 0) {
			return ctx.t(
				findingsCount === 1 ? 'editor.visual.review.title.one' : 'editor.visual.review.title.many',
				{ count: findingsCount }
			);
		}
		if (reviewSays) return ctx.t('editor.visual.review.title.incomplete');
		// La carga terminó con el popover abierto y no hay nada que decir (lámina 2.3).
		return ctx.t('review.count.none');
	});

	/** Pie del popover. Con bloques sin guardar y la revisión sin terminar (cargando o fallida),
	 *  «Ningún aviso impide publicar» afirmaría algo que no se sabe: va el texto de «revisando» o
	 *  el del error. Sin bloques sin guardar, el error lleva su título arriba y la fila de error
	 *  con «Reintentar»; ahí el pie es el de la lámina 2.4. */
	const popBody = $derived.by(() => {
		if (pendingBlocks.length > 0 && !reviewSays) return ctx.t('editor.visual.status.confirm.body');
		if (reviewLoading && pendingBlocks.length === 0) {
			return ctx.t('editor.visual.review.checking.body');
		}
		if (reviewLoading) {
			return `${ctx.t('editor.visual.review.checking.title')} ${ctx.t('editor.visual.review.checking.body')}`;
		}
		if (reviewFailed && pendingBlocks.length > 0) return ctx.t('editor.visual.review.error');
		if (findingsCount > 0 && pendingBlocks.length === 0 && !reviewLoading && !reviewFailed) {
			return ctx.t('editor.visual.review.body');
		}
		return ctx.t('review.notBlocking');
	});

	const confirmLabel = $derived(
		reviewLoading
			? ctx.t('editor.visual.review.skipWait')
			: pendingBlocks.length === 0 && !reviewSays
				? ctx.t('editor.visual.status.publish')
				: ctx.t('editor.visual.status.confirm.publish')
	);

	/** Una acción de un aviso cierra el popover: el foco va al campo, al árbol o a la ficha. */
	function handleReviewGo(finding: ReviewFinding): void {
		phase = 'idle';
		onReviewGo?.(finding);
	}

	function handleReviewDescribe(finding: ReviewFinding): void {
		phase = 'idle';
		onReviewDescribe?.(finding);
	}

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

	/** Pone el foco en el botón de estado. Lo usa la pantalla al cerrar algo que se abrió desde el
	 *  popover y ya no tiene adónde devolverlo (la ficha de Medios de «Describir la imagen…»). */
	export function focus(): void {
		actionEl?.focus();
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
				aria-expanded={asksConfirmation || phase === 'confirming'
					? phase === 'confirming'
					: undefined}
				aria-controls={phase === 'confirming' ? `${uid}-pop` : undefined}
				data-status-target={target}
				onclick={() => void requestChange()}
			>
				{actionLabel}
			</button>

			<!-- «Programar…» / «Cambiar fecha…» (ver cabecera): solo en un borrador y si el servidor
			     puede cumplir la fecha. Mismo rótulo que junto al campo Estado del formulario. -->
			{#if scheduleControl.kind !== 'none'}
				<button
					type="button"
					class="vega-visual-publish-btn vega-visual-publish-schedule"
					aria-disabled={phase === 'changing' ? 'true' : undefined}
					data-schedule-kind={scheduleControl.kind}
					onclick={openSchedule}
				>
					{ctx.t(
						scheduleControl.kind === 'draft' ? 'editor.schedule.open' : 'editor.schedule.change'
					)}
				</button>
			{/if}

			{#if phase === 'error'}
				<span class="vega-visual-publish-error" role="alert" title={errorDetail || undefined}>
					<Icon id="warning" size={14} />
					{errorText}
				</span>
			{/if}

			{#if phase === 'confirming'}
				<!-- Confirmación en línea (patrón `notice-confirm` de /papelera, ver cabecera). Con la
				     revisión diciendo algo, en tono de aviso y con sus grupos dentro (lote 13). -->
				<div
					class="vega-visual-publish-pop"
					class:vega-visual-publish-pop--review={reviewSays}
					id="{uid}-pop"
					role="alertdialog"
					aria-labelledby="{uid}-pop-title"
					aria-describedby="{uid}-pop-body"
					aria-busy={reviewLoading ? 'true' : undefined}
					tabindex="-1"
					onkeydown={handlePopKeydown}
				>
					<p class="vega-visual-publish-pop-title" id="{uid}-pop-title">{popTitle}</p>
					{#if pendingBlocks.length > 0 && reviewSays}
						<!-- UNA confirmación con las dos cosas (lámina 2.2): los bloques sin guardar primero,
						     los avisos debajo; lo que puede crecer se desplaza, título y botones no. -->
						<div class="vega-review-pop-scroll">
							<div class="vega-review-pop-section">
								<p class="vega-review-pop-head">
									{ctx.t(
										pendingBlocks.length === 1
											? 'editor.visual.status.confirm.title.one'
											: 'editor.visual.status.confirm.title.many',
										{ count: pendingBlocks.length }
									)}
								</p>
								<ul>
									{#each pendingBlocks as title, i (i)}
										<li>«{title}»</li>
									{/each}
								</ul>
								<p class="vega-visual-publish-pop-body">
									{ctx.t('editor.visual.status.confirm.body')}
								</p>
							</div>
							{#if review && !reviewLoading}
								<div class="vega-review-pop-section">
									<ReviewGroups
										{review}
										surface="visual"
										canAct={true}
										onGo={handleReviewGo}
										onDescribe={handleReviewDescribe}
									/>
								</div>
							{/if}
						</div>
					{:else if pendingBlocks.length > 0}
						<ul>
							{#each pendingBlocks as title, i (i)}
								<li>«{title}»</li>
							{/each}
						</ul>
					{:else if review && reviewSays && !reviewLoading}
						<div class="vega-review-pop-scroll">
							<div class="vega-review-pop-section">
								<ReviewGroups
									{review}
									surface="visual"
									canAct={true}
									onGo={handleReviewGo}
									onDescribe={handleReviewDescribe}
								/>
							</div>
						</div>
					{/if}
					<p
						class="vega-visual-publish-pop-body"
						id="{uid}-pop-body"
						aria-live={reviewLoading ? 'polite' : undefined}
					>
						{popBody}
					</p>
					<div class="vega-visual-publish-pop-actions">
						<button
							type="button"
							class="vega-visual-publish-pop-btn vega-visual-publish-pop-btn--primary"
							onclick={() => void change('published')}
						>
							{confirmLabel}
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

	{#if canEdit}
		<!-- El mismo diálogo que el formulario; al cerrar el foco vuelve al botón que lo abrió, y si ese
		     botón ya no está (la página dejó de ser borrador), al botón de estado. -->
		<ScheduleDialog
			open={scheduleOpen}
			{name}
			at={scheduleAt}
			unconfirmed={scheduling === 'unknown'}
			fallbackFocusEl={actionEl ?? null}
			onSubmit={submitSchedule}
			onClose={() => void closeSchedule()}
		/>
	{/if}
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

	/* Programada: mismos tokens que `.vega-editor-tag` del formulario. */
	.vega-visual-publish-tag[data-status-kind='scheduled'] {
		color: var(--accent-text);
		background: var(--accent-soft);
	}

	.vega-visual-publish-tag[data-status-kind='overdue'] {
		color: var(--warning);
		background: var(--warning-soft);
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

	/* Con avisos (lote 13): del tono `info` al tono `warning`, la misma pareja que
	   `.vega-field-notice`. El tope de alto es para que una lista larga se desplace dentro. */
	.vega-visual-publish-pop--review {
		border-color: var(--warning);
		background: var(--warning-soft);
		color: var(--warning);
		max-height: min(70vh, 34rem);
	}

	/* Sobre `--warning-soft` tres parejas de la tarjeta bajan de 4,5:1 (medido en los 21 temas en
	   la lámina): `--ink-2` en claro, `--accent-text` en claro y `--danger` en oscuro. Dentro del
	   popover pasan a `--ink` (≥ 9:1); la acción conserva el subrayado siempre, así que sigue
	   leyéndose como enlace sin depender del color. `:global`: viven en `ReviewGroups.svelte`. */
	.vega-visual-publish-pop--review :global(.vega-review-group-head),
	.vega-visual-publish-pop--review :global(.vega-review-where),
	.vega-visual-publish-pop--review :global(.vega-review-more),
	.vega-visual-publish-pop--review :global(.vega-review-skipped),
	.vega-visual-publish-pop--review :global(.vega-review-error),
	.vega-visual-publish-pop--review .vega-review-pop-head {
		color: var(--ink);
	}

	.vega-visual-publish-pop--review :global(.vega-review-go) {
		color: var(--ink);
		text-decoration-color: currentColor;
	}

	/* Lo que puede crecer (bloques sin guardar + avisos) se desplaza; título y botones, no. Las dos
	   hairlines (`--line`, la de `.vega-edit-top`) marcan dónde corta el desplazamiento: sin ellas,
	   un aviso cortado por abajo parece un fallo de pintado y no algo que sigue. */
	.vega-review-pop-scroll {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		min-height: 0;
		padding-block: 0.5rem;
		border-block: 1px solid var(--line);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	/* `.vega-visual-publish-pop ul` (lista de bloques sin guardar) sangra y pinta en `--ink`: las
	   listas de la revisión no llevan viñeta, así que se anula la sangría solo en ellas. */
	.vega-visual-publish-pop :global(.vega-review-groups),
	.vega-visual-publish-pop :global(.vega-review-items) {
		margin: 0;
		padding-left: 0;
	}

	.vega-review-pop-section {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	/* Rótulo de sección dentro del popover: el de grupo de la tarjeta (`.vega-review-group-head`). */
	.vega-review-pop-head {
		margin: 0;
		font-size: 0.82em;
		font-weight: 650;
		letter-spacing: 0.03em;
		color: var(--ink-2);
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
