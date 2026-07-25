<script lang="ts">
	/**
	 * `/papelera` (`#lote-integridad`, Fase B2 §10.2): registros/assets borrados (`kind:'delete'`
	 * en `vega_revisions`) — «Restaurar», «Borrar definitivamente», «Vaciar papelera». Ruta nueva
	 * + entrada de sidebar (`Sidebar.svelte`) + `trashRoute()`/`NavApi.toTrash()`.
	 *
	 * **Disponibilidad** (`isTrashAvailable`, síncrono, sin red — ver su cabecera): si `vega_
	 * revisions` no está bootstrapeada o `revisions.enabled === false`, esta ruta no intenta
	 * listar nada — mensaje honesto + CTA a Ajustes, mismo criterio que el resto del chrome
	 * (P3-L3: "nada muere en silencio", nunca un listado que sabe de antemano que va a fallar).
	 *
	 * **Restaurar** (§8·B2 del contrato): `port.create(revision.collection, input, { id:
	 * revision.recordId })`, con `input` construido por `buildRestoreInput` (`revisions/restore.ts`
	 * — descarta `readonly`/`file`). Tres motivos por los que un ítem puede NO ofrecer "Restaurar",
	 * `restoreBlockedReason`:
	 * - `'capability'`: `capabilities.explicitRecordId` ausente (backend entero, ningún ítem la
	 *   ofrece) — el contrato lo pide explícito ("sin la capability, la papelera OCULTA
	 *   'Restaurar' y explica por qué").
	 * - `'schema'`: la colección de origen (`revision.collection`) ya no existe en `ctx.model.types`
	 *   (se borró del esquema desde que se guardó la revisión) — sin `Field[]` no hay forma segura
	 *   de construir `input` sin arriesgarse a mandar campos que el backend ya no reconoce. Este
	 *   segundo motivo NO lo pide el contrato con esas palabras, pero es la misma prudencia que
	 *   pide para el primero: "nunca restaures con un id nuevo por lo bajo" se extiende a "nunca
	 *   restaures con un `RecordInput` adivinado".
	 * - `'requiredFile'` (fix de code-review): la colección de origen tiene un campo `type:'file'`
	 *   `required` (`requiredFileFieldName`, `revisions/restore.ts`) — `buildRestoreInput` lo
	 *   descarta SIEMPRE (§0.3: PB destruye el binario al borrar, ningún id lo resucita), así que
	 *   `port.create` va a rechazar el `RecordInput` resultante por validación: un botón que NUNCA
	 *   puede funcionar es peor que no tenerlo. `vega_media.file` (D-P6.1) es el caso real, pero se
	 *   deriva del esquema — cualquier tipo del usuario con un `file` obligatorio cae en el mismo
	 *   motivo, sin caso especial. La ENTRADA de papelera se sigue viendo igual (sus metadatos —
	 *   alt, título, etiquetas— siguen teniendo valor como registro de lo que hubo); solo
	 *   "Restaurar" queda deshabilitado, con el motivo dicho con todas las letras.
	 *
	 * Tras un `create` con éxito, la entrada de papelera se borra (`port.delete(vega_revisions,
	 * revision.id)`, best-effort — un fallo aquí no deshace la restauración, solo deja una entrada
	 * de papelera huérfana que la poda por antigüedad limpiará más tarde) y la lista recarga.
	 *
	 * **Borrar definitivamente / Vaciar papelera**: confirmación INLINE (mismo patrón que el gate
	 * de bootstrap de `/media`/`RevisionsSettings` — nunca `window.confirm`), no el modal pesado de
	 * `DeleteConfirm.svelte`: esa comprobación de referencias/hasFiles es para el borrado del
	 * REGISTRO original (que ya ocurrió), no para borrar la entrada de papelera en sí, que no tiene
	 * nada que otro registro pueda referenciar.
	 *
	 * **"Vaciar papelera" (fix de code-review: un único `list({ perPage: MAX_PER_PAGE })` mentía
	 * con "Papelera vaciada" cuando había más de 200 entradas)**: `emptyTrash` (`revisions/
	 * empty-trash.ts`) pagina en BUCLE hasta agotar TODAS las entradas `kind:'delete'`, no solo la
	 * primera página — o hasta el primer fallo, que corta el bucle en el acto (mismo criterio que
	 * el borrado múltiple de `/media`, nunca reintentos sin techo). El toast final refleja el
	 * resultado REAL (`deleted`/`remaining` que devuelve `emptyTrash`), nunca "vaciada" si queda
	 * algo por un fallo a mitad.
	 */
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError, type RecordId } from '$lib/backend';
	import { parseRevisionRecord, type RevisionRecord } from '$lib/revisions/revision';
	import {
		revisionAuthorLabel,
		revisionDateLabel,
		revisionDisplayLabel
	} from '$lib/revisions/revision-label';
	import { VEGA_REVISIONS_COLLECTION } from '$lib/revisions/revisions-collection';
	import { buildRestoreInput, hasFileValues, requiredFileFieldName } from '$lib/revisions/restore';
	import { emptyTrash } from '$lib/revisions/empty-trash';
	import { isTrashAvailable } from '$lib/revisions/trash-availability';
	import {
		buildTrashListQuery,
		parseTrashPage,
		trashPageToParams,
		TRASH_PER_PAGE
	} from '$lib/revisions/trash-query';
	import { trashRoute } from '$lib/nav/routes';
	import Pagination from '$lib/list/Pagination.svelte';

	const ctx = getVegaContext();

	const trashAvailable = $derived(isTrashAvailable(ctx.model));

	// P3-L9: `Pagination`/`goToPage` navegan; se guarda tras `onMount` (mismo criterio que `/media`).
	let routerReady = $state(false);
	onMount(() => {
		routerReady = true;
	});

	// ————— Listado (kind:'delete', paginado) —————

	type LoadStatus = 'loading' | 'ready' | 'error';

	let status = $state<LoadStatus>('loading');
	let items = $state<RevisionRecord[]>([]);
	let totalItems = $state(0);
	let totalPages = $state(0);
	let loadedPage = $state(1);

	const trashPageNum = $derived(parseTrashPage(page.url.searchParams));

	async function load(targetPage: number): Promise<void> {
		status = 'loading';
		try {
			const result = await ctx.port.list(
				VEGA_REVISIONS_COLLECTION.name,
				buildTrashListQuery(targetPage)
			);
			items = result.items.map(parseRevisionRecord).filter((r): r is RevisionRecord => r !== null);
			totalItems = result.totalItems;
			totalPages = result.totalPages;
			loadedPage = result.page;
			status = 'ready';
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error cargando la papelera', err);
			ctx.feedback.reportError(vegaErr, { action: 'trash:load' });
			status = 'error';
		}
	}

	$effect(() => {
		if (!trashAvailable) return;
		void load(trashPageNum);
	});

	function goToPage(target: number): void {
		if (!routerReady) return;
		const qs = trashPageToParams(target).toString();
		void goto(`${trashRoute()}${qs ? `?${qs}` : ''}`);
	}

	/** Tipo de origen de `revision`, o `null` si la colección ya no existe en el esquema (ver
	 *  cabecera: `restoreBlockedReason`). */
	function sourceType(revision: RevisionRecord) {
		return ctx.model.types.find((t) => t.name === revision.collection) ?? null;
	}

	function itemLabel(revision: RevisionRecord): string {
		const type = sourceType(revision);
		return revisionDisplayLabel(type?.titleField ?? null, revision);
	}

	function dateLabel(revision: RevisionRecord): string {
		return revisionDateLabel(revision.created, ctx.locale, ctx.t('revisions.panel.unknownDate'));
	}

	function authorLabel(revision: RevisionRecord): string {
		return revisionAuthorLabel(revision.author, ctx.t('revisions.panel.unknownAuthor'));
	}

	/** `true` si la pre-imagen tenía campos `file` con valor (ver cabecera de `restore.ts`): solo
	 *  computable cuando el esquema de origen sigue existiendo, degrada a `false` si no. */
	function itemHadFiles(revision: RevisionRecord): boolean {
		const type = sourceType(revision);
		return type !== null && hasFileValues(type.schema.fields, revision.values);
	}

	// ————— Restaurar (§8·B2, ver cabecera) —————

	type RestoreBlockedReason = 'capability' | 'schema' | 'requiredFile' | null;

	function restoreBlockedReason(revision: RevisionRecord): RestoreBlockedReason {
		if (!ctx.port.capabilities.explicitRecordId) return 'capability';
		const type = sourceType(revision);
		if (type === null) return 'schema';
		if (requiredFileFieldName(type.schema.fields) !== null) return 'requiredFile';
		return null;
	}

	/** Texto de "por qué no se ofrece Restaurar" para `blocked !== null` (ver cabecera). Reutiliza
	 *  `sourceType`/`requiredFileFieldName` en vez de recalcular nada: el motivo SIEMPRE se deriva
	 *  del mismo esquema que decidió `restoreBlockedReason`. */
	function restoreBlockedLabel(revision: RevisionRecord, reason: RestoreBlockedReason): string {
		if (reason === 'capability') return ctx.t('revisions.trash.restoreUnavailable');
		if (reason === 'schema') {
			return ctx.t('revisions.trash.restoreUnknownSchema', { collection: revision.collection });
		}
		// 'requiredFile': `sourceType(revision)` no es null aquí (ver `restoreBlockedReason`, el
		// motivo 'schema' se resuelve ANTES), así que el campo siempre es resoluble.
		const type = sourceType(revision);
		const field = type ? requiredFileFieldName(type.schema.fields) : null;
		return ctx.t('revisions.trash.restoreBlockedRequiredFile', {
			collection: revision.collection,
			field: field ?? ''
		});
	}

	// Ids con una acción (restaurar/borrar definitivamente) en vuelo — bloquea doble envío sobre
	// LA MISMA fila sin afectar a las demás. `SvelteSet` (mutación in-place ya reactiva, mismo
	// criterio que `selectedIds` de `/media/+page.svelte`): nunca un `Set` nativo en `$state`.
	const busyIds = new SvelteSet<RecordId>();

	function isBusy(id: RecordId): boolean {
		return busyIds.has(id);
	}

	function setBusy(id: RecordId, busy: boolean): void {
		if (busy) busyIds.add(id);
		else busyIds.delete(id);
	}

	async function handleRestore(revision: RevisionRecord): Promise<void> {
		if (isBusy(revision.id) || restoreBlockedReason(revision) !== null) return;
		const type = sourceType(revision)!;
		setBusy(revision.id, true);
		try {
			const input = buildRestoreInput(type.schema.fields, revision.values);
			await ctx.port.create(revision.collection, input, { id: revision.recordId });
			// Best-effort (ver cabecera): un fallo aquí no deshace la restauración, solo deja una
			// entrada de papelera huérfana que `pruneTrashRevisions` limpiará más tarde.
			await ctx.port.delete(VEGA_REVISIONS_COLLECTION.name, revision.id).catch(() => {});
			ctx.feedback.toast(ctx.t('revisions.trash.restoreSuccess', { label: itemLabel(revision) }));
			void load(loadedPage);
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend('Error al restaurar el registro', err),
				{ action: 'trash:restore' }
			);
		} finally {
			setBusy(revision.id, false);
		}
	}

	// ————— Borrar definitivamente (confirmación INLINE por fila, ver cabecera) —————

	let pendingDeleteForeverId = $state<RecordId | null>(null);

	function requestDeleteForever(revision: RevisionRecord): void {
		pendingDeleteForeverId = revision.id;
	}

	function cancelDeleteForever(): void {
		if (pendingDeleteForeverId !== null && isBusy(pendingDeleteForeverId)) return;
		pendingDeleteForeverId = null;
	}

	async function confirmDeleteForever(revision: RevisionRecord): Promise<void> {
		if (isBusy(revision.id)) return;
		setBusy(revision.id, true);
		try {
			await ctx.port.delete(VEGA_REVISIONS_COLLECTION.name, revision.id);
			pendingDeleteForeverId = null;
			ctx.feedback.toast(
				ctx.t('revisions.trash.deleteForeverSuccess', { label: itemLabel(revision) })
			);
			void load(loadedPage);
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError
					? err
					: VegaError.backend('Error al borrar definitivamente de la papelera', err),
				{ action: 'trash:deleteForever' }
			);
		} finally {
			setBusy(revision.id, false);
		}
	}

	// ————— Vaciar papelera (confirmación INLINE, ver cabecera) —————

	let confirmingEmptyTrash = $state(false);
	let emptyingTrash = $state(false);

	function requestEmptyTrash(): void {
		confirmingEmptyTrash = true;
	}

	function cancelEmptyTrash(): void {
		if (emptyingTrash) return;
		confirmingEmptyTrash = false;
	}

	async function confirmEmptyTrash(): Promise<void> {
		if (emptyingTrash) return;
		emptyingTrash = true;
		const { deleted, remaining, failure } = await emptyTrash(ctx.port);
		emptyingTrash = false;
		confirmingEmptyTrash = false;
		if (deleted > 0) void load(1);
		if (failure === null) {
			// Solo "vaciada" cuando `remaining` es de verdad 0 — `emptyTrash` no vuelve sin fallo
			// hasta agotar TODAS las páginas, así que aquí siempre es 0, pero el mensaje se deriva
			// del dato real y no de un supuesto (ver cabecera).
			if (deleted > 0) ctx.feedback.toast(ctx.t('revisions.trash.emptyTrashSuccess'));
			return;
		}
		// Un fallo a mitad: el toast dice lo que de verdad pasó (nunca "vaciada" con algo pendiente).
		if (deleted > 0) {
			ctx.feedback.toast(ctx.t('revisions.trash.emptyTrashPartial', { deleted, remaining }));
		}
		ctx.feedback.reportError(
			failure instanceof VegaError
				? failure
				: VegaError.backend('Error vaciando la papelera', failure),
			{ action: 'trash:emptyAll' }
		);
	}

	let headingEl = $state<HTMLElement | null>(null);
</script>

<div class="vega-trash-page">
	<div class="vega-trash-head">
		<h1 bind:this={headingEl} tabindex="-1">{ctx.t('revisions.trash.pageTitle')}</h1>
		{#if trashAvailable && status === 'ready' && totalItems > 0}
			<span class="vega-trash-meta"><b>{totalItems}</b></span>
			<span class="vega-trash-head-spacer"></span>
			<button
				type="button"
				class="vega-trash-empty-button"
				onclick={requestEmptyTrash}
				disabled={emptyingTrash}
			>
				{ctx.t('revisions.trash.emptyTrash')}
			</button>
		{/if}
	</div>

	<p class="vega-trash-description">{ctx.t('revisions.trash.description')}</p>

	{#if confirmingEmptyTrash}
		<div
			class="notice notice-confirm"
			role="alertdialog"
			aria-live="assertive"
			aria-labelledby="vega-trash-empty-title"
		>
			<p id="vega-trash-empty-title" class="notice-title">
				{ctx.t('revisions.trash.emptyTrashConfirmTitle')}
			</p>
			<p>{ctx.t('revisions.trash.emptyTrashConfirmBody', { count: totalItems })}</p>
			<div class="actions">
				<button type="button" onclick={() => void confirmEmptyTrash()} disabled={emptyingTrash}>
					{emptyingTrash
						? ctx.t('revisions.trash.emptyTrashEmptying')
						: ctx.t('revisions.trash.emptyTrashConfirm')}
				</button>
				<button type="button" onclick={cancelEmptyTrash} disabled={emptyingTrash}>
					{ctx.t('common.cancel')}
				</button>
			</div>
		</div>
	{/if}

	{#if !trashAvailable}
		<div class="notice notice-bootstrap" data-trash-state="unavailable">
			<p>{ctx.t('revisions.trash.unavailable')}</p>
			<button type="button" onclick={() => ctx.nav.toSettings()}>{ctx.t('nav.emptyCta')}</button>
		</div>
	{:else if status === 'loading'}
		<p aria-live="polite" data-trash-state="loading">{ctx.t('revisions.trash.loading')}</p>
	{:else if status === 'error'}
		<div class="vega-trash-error" role="alert" data-trash-state="error">
			<p>{ctx.t('revisions.trash.error')}</p>
			<button type="button" onclick={() => void load(trashPageNum)}>
				{ctx.t('revisions.trash.retry')}
			</button>
		</div>
	{:else if items.length === 0}
		<p class="vega-trash-empty" data-trash-state="empty">{ctx.t('revisions.trash.empty')}</p>
	{:else}
		<ul class="vega-trash-list" data-trash-state="ready">
			{#each items as revision (revision.id)}
				{@const blocked = restoreBlockedReason(revision)}
				<li class="vega-trash-item">
					<div class="vega-trash-item-main">
						<span class="vega-trash-item-label">{itemLabel(revision)}</span>
						<span class="vega-trash-item-meta">
							<span class="vega-trash-item-collection">
								{ctx.t('revisions.trash.itemCollection', { collection: revision.collection })}
							</span>
							<span class="vega-trash-item-date">{dateLabel(revision)}</span>
							<span class="vega-trash-item-author">{authorLabel(revision)}</span>
						</span>
						{#if itemHadFiles(revision)}
							<span class="vega-trash-item-files-lost">
								{ctx.t('revisions.trash.itemFilesLost')}
							</span>
						{/if}
					</div>
					<div class="vega-trash-item-actions">
						{#if blocked === null}
							<button
								type="button"
								onclick={() => void handleRestore(revision)}
								disabled={isBusy(revision.id)}
							>
								{isBusy(revision.id)
									? ctx.t('revisions.trash.restoring')
									: ctx.t('revisions.trash.restore')}
							</button>
						{:else}
							<span class="vega-trash-item-restore-unavailable">
								{restoreBlockedLabel(revision, blocked)}
							</span>
						{/if}
						<button
							type="button"
							class="vega-trash-item-delete-forever"
							onclick={() => requestDeleteForever(revision)}
							disabled={isBusy(revision.id)}
						>
							{ctx.t('revisions.trash.deleteForever')}
						</button>
					</div>
					{#if pendingDeleteForeverId === revision.id}
						<div
							class="notice notice-confirm"
							role="alertdialog"
							aria-live="assertive"
							aria-labelledby="vega-trash-delete-forever-title-{revision.id}"
						>
							<p id="vega-trash-delete-forever-title-{revision.id}" class="notice-title">
								{ctx.t('revisions.trash.deleteForeverConfirmTitle', { label: itemLabel(revision) })}
							</p>
							<p>
								{ctx.t('revisions.trash.deleteForeverConfirmBody')}
							</p>
							<div class="actions">
								<button
									type="button"
									onclick={() => void confirmDeleteForever(revision)}
									disabled={isBusy(revision.id)}
								>
									{isBusy(revision.id)
										? ctx.t('revisions.trash.deleteForeverDeleting')
										: ctx.t('revisions.trash.deleteForeverConfirm')}
								</button>
								<button type="button" onclick={cancelDeleteForever} disabled={isBusy(revision.id)}>
									{ctx.t('common.cancel')}
								</button>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#if totalPages > 1}
			<Pagination
				page={loadedPage}
				{totalPages}
				{totalItems}
				perPage={TRASH_PER_PAGE}
				onPrev={() => goToPage(loadedPage - 1)}
				onNext={() => goToPage(loadedPage + 1)}
			/>
		{/if}
	{/if}
</div>

<style>
	.vega-trash-page {
		display: flex;
		flex-direction: column;
		gap: var(--vega-space-gutter);
	}

	.vega-trash-head {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 0.4rem;
	}

	.vega-trash-head h1 {
		margin: 0;
		font-size: 1.45em;
		font-weight: 700;
		color: var(--ink-hi);
		letter-spacing: -0.01em;
	}

	.vega-trash-meta {
		color: var(--ink-2);
		font-size: 0.9em;
	}

	.vega-trash-meta b {
		font-family: var(--mono);
		font-weight: 500;
		font-size: 0.94em;
	}

	.vega-trash-head-spacer {
		flex: 1;
	}

	.vega-trash-empty-button {
		display: inline-flex;
		align-items: center;
		height: 34px;
		padding: 0 0.9rem;
		border: 1px solid var(--danger);
		border-radius: var(--r);
		background: var(--danger-soft);
		color: var(--danger);
		font-weight: 550;
		cursor: pointer;
		white-space: nowrap;
	}

	.vega-trash-empty-button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.vega-trash-description {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.9rem;
	}

	.vega-trash-error,
	.vega-trash-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.6rem;
		margin: 0;
		color: var(--ink-2);
	}

	.vega-trash-error button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		cursor: pointer;
	}

	.vega-trash-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-trash-item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.8rem 1rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--paper);
	}

	.vega-trash-item-main {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.vega-trash-item-label {
		font-weight: 600;
		color: var(--ink-hi);
		overflow-wrap: anywhere;
	}

	.vega-trash-item-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		color: var(--ink-2);
		font-size: 0.8rem;
	}

	.vega-trash-item-collection {
		font-family: var(--mono);
	}

	.vega-trash-item-date {
		font-family: var(--mono);
	}

	.vega-trash-item-files-lost {
		color: var(--warning);
		font-size: 0.8rem;
	}

	.vega-trash-item-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.vega-trash-item-actions button {
		padding: 0.4rem 0.85rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--btn);
		color: var(--ink);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-trash-item-actions button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.vega-trash-item-delete-forever {
		border-color: var(--danger);
		background: var(--danger-soft);
		color: var(--danger);
	}

	.vega-trash-item-restore-unavailable {
		color: var(--ink-3);
		font-size: 0.8rem;
		font-style: italic;
	}

	.notice {
		padding: 0.75rem 1rem;
		border-radius: 4px;
		border: 1px solid;
	}

	.notice-bootstrap {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.6rem;
		border-color: var(--warning);
		background: var(--warning-soft);
		color: var(--warning);
	}

	.notice-bootstrap button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		cursor: pointer;
	}

	.notice-confirm {
		border-color: var(--info);
		background: var(--info-soft);
		color: var(--info);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.notice p {
		margin: 0;
	}

	.notice-title {
		font-weight: 600;
		/* El resto del cuerpo del aviso usa el color del token (--info): el título necesita el
		   máximo contraste, no el mismo tono discreto que la línea de detalle. */
		color: var(--ink-hi);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.actions button {
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--btn);
		color: var(--ink);
		cursor: pointer;
	}

	.actions button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
