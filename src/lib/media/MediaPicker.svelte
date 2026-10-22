<script lang="ts">
	/**
	 * `MediaPicker.svelte` (Fase P6·6e, D-P6.6/L-P6.11): el picker de biblioteca que embebe el
	 * widget `file` de P5 (`FileInput.svelte`). Montaje ÚNICO a nivel de shell — `src/routes/
	 * +layout.svelte` lo pinta como hermano de `ToastHost`/`GlobalBanner`/`ReloginModal` (fuera del
	 * árbol de rutas, siempre visible), y `ctx.mediaPicker.open(...)` (`app-context.ts`) es la
	 * única forma de abrirlo: quien llama a `open()` nunca importa este componente, y viceversa —
	 * la costura es `mediaPickerState` (`media-picker-state.svelte.ts`, patrón promise-based, mismo
	 * criterio que `toastStore`).
	 *
	 * **INVARIANTE L-P6.8 (copia de bytes, no referencia)**: "Insertar" descarga cada asset elegido
	 * (`fileFromMediaAsset`, `media-file-from-url.ts`) y resuelve `MediaPickResult[]` — el `File`
	 * resultante es lo ÚNICO que cruza al widget destino; el `mediaId` viaja solo para que ESTA UI
	 * pinte qué está elegido EN LA SESIÓN actual del picker (dedupe visual mientras el modal sigue
	 * abierto). No hay dedupe PERSISTENTE entre sesiones ("¿este asset ya se insertó antes en este
	 * campo?"): `mediaId` nunca se guarda en ningún sitio tras cerrar (ver `media-picker.ts`), así
	 * que no hay con qué comparar la próxima vez que se abra el picker — decisión documentada, la
	 * badge "ya insertado" del contrato P6 es explícitamente OPCIONAL.
	 *
	 * **Grid REUTILIZADO, no clonado**: compone `MediaGrid.svelte`/`createMediaListState` (Fase 6b)
	 * con su prop `isSelected` (añadida en 6e para este caso de uso) en vez de reimplementar la
	 * rejilla — mismo criterio que el resto de P6.
	 *
	 * **Filtrado `accept` CLIENTE (audit H1)**: el mime no es un dato consultable del backend, así
	 * que `matchesAccept` (`media-picker.ts`) filtra la página YA CARGADA por la extensión del
	 * `fileRef` — la paginación (`totalItems`/`totalPages` de `Pagination.svelte`) sigue reflejando
	 * el total SIN filtrar (simplificación de alcance: una página con `accept` restrictivo puede
	 * pintar menos celdas de las que promete "24 por página", nunca al revés; y una página que `accept`
	 * deja VACÍA conserva la paginación si hay más páginas, para poder seguir buscando).
	 *
	 * **Búsqueda SERVER-SIDE por alt/title**: `buildMediaListQuery(page, { search })` (Fase 6e,
	 * `media-query.ts`) — debounce de 250ms, mismo valor que el buscador de `Relation.svelte` (F5-e).
	 *
	 * **Diálogo modal**: mismo patrón estructural que `MediaDetail.svelte` (backdrop + `dialog` +
	 * foco atrapado + `Esc` cierra, salvo mientras `inserting` está en vuelo).
	 *
	 * **Texto alternativo (audit del 23 sep, lámina pieza 3)**: la marca de cada tarjeta la pone
	 * `MediaGrid` (misma tarjeta que en `/media`); aquí solo se añade el recuento del pie, «N elegidos
	 * · M sin texto alternativo», contado sobre lo ELEGIDO (también en otras páginas), y cada
	 * `MediaPickResult` lleva `missingAlt` para que `FileInput` avise sin conocer la regla. No
	 * bloquea nada: «Insertar» sigue igual.
	 */
	import { tick, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend/errors';
	import type { RecordId, VegaRecord } from '$lib/backend/types';
	import { ALL_PERMISSIONS, permissionsFor } from '$lib/backend/access';
	import Icon from '$lib/icons/Icon.svelte';
	import MediaDetail from './MediaDetail.svelte';
	import MediaFolderSelect from './MediaFolderSelect.svelte';
	import { mediaFoldersState } from './media-folders';
	import { createMediaListState } from './media-list-state.svelte';
	import { MEDIA_PER_PAGE, MEDIA_SEARCH_DEBOUNCE_MS } from './media-query';
	import { toMediaItemView, type MediaItemView } from './media-item';
	import { countMediaMissingAlt, mediaMissingAlt } from './media-card';
	import { matchesAccept, type MediaPickResult, type MediaPickerOpenOptions } from './media-picker';
	import { mediaPickerState } from './media-picker-state.svelte';
	import { fileFromMediaAsset, MediaFileFetchError } from './media-file-from-url';
	import MediaGrid from './MediaGrid.svelte';
	import Pagination from '$lib/list/Pagination.svelte';

	const ctx = getVegaContext();

	const request = $derived(mediaPickerState.request);
	const multiple = $derived(request?.opts.multiple ?? false);

	const listState = createMediaListState();
	const status = $derived(listState.status);

	let searchTerm = $state('');
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Elegidos EN ESTA sesión del picker: `MediaItemView` completo (no solo el id) — "Insertar"
	// necesita `id`/`fileRef`/`alt` de cada uno, y la selección puede abarcar varias páginas (elegir
	// en la 1, paginar, elegir en la 2), así que no basta con lo que trae la página actual.
	// `SvelteMap` YA es reactivo por sí mismo (mutación in-place vía `.set()`/`.delete()`/`.clear()`,
	// mismo criterio que `failedImages` de `MediaGrid.svelte`/`FileInput.svelte`) — envolverlo en
	// `$state` es redundante (`svelte/no-unnecessary-state-wrap`).
	const selected = new SvelteMap<RecordId, MediaItemView>();

	let inserting = $state(false);
	let insertError = $state<string | null>(null);

	/** Elegidos que son imágenes sin texto alternativo (ver cabecera): la segunda mitad del pie. */
	const selectedMissingAlt = $derived(countMediaMissingAlt(selected.values()));

	let inspected = $state<MediaItemView | null>(null);
	let detailEl = $state<ReturnType<typeof MediaDetail> | undefined>();
	let detailState = $state({ dirty: false, busy: false, confirmationOpen: false });
	let metadataSaved = $state(false);
	let listEl = $state<HTMLDivElement | null>(null);
	let narrow = $state(false);
	let currentPage = 1;
	let listScroll = 0;
	let lastSignature = '';
	let loadVersion = 0;
	let inspectedOpener: HTMLElement | null = null;
	let inspectedOriginId: string | null = null;
	let openedFor: typeof request = null;

	interface Traversal {
		options: string;
		search: string;
		page: number;
		scroll: number;
		signature: string;
	}
	// Solo el recorrido más reciente, dentro de este montaje. Nunca guarda IDs elegidos.
	let lastTraversal: Traversal | null = null;

	const mediaType = $derived(ctx.model.types.find((type) => type.name === 'vega_media')?.schema);
	const mediaPermissions = $derived(
		mediaType ? permissionsFor(mediaType, ctx.port.capabilities) : ALL_PERMISSIONS
	);
	const mediaHasFocal = $derived(
		mediaType?.fields.some((field) => field.name === 'focal') ?? false
	);
	const blocked = $derived(inserting || detailState.busy || detailState.confirmationOpen);

	function optionsKey(options: MediaPickerOpenOptions): string {
		const accept = [
			...new Set((options.accept ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))
		].sort();
		return JSON.stringify([options.multiple, accept]);
	}

	function resultSignature(records: VegaRecord[]): string {
		return JSON.stringify(
			records.map((record) => [
				record.id,
				record.values.file,
				record.values.title,
				record.values.alt
			])
		);
	}

	function rememberTraversal(): void {
		if (!openedFor) return;
		lastTraversal = {
			options: optionsKey(openedFor.opts),
			search: searchTerm,
			page: currentPage,
			scroll: listScroll,
			signature: lastSignature
		};
	}

	/** La carga canónica conserva anti-carreras; esta versión protege solo la restauración DOM. */
	async function loadPage(
		page: number,
		search: string,
		restore?: { scroll: number; signature?: string }
	): Promise<void> {
		const forRequest = request,
			version = ++loadVersion;
		currentPage = page;
		await listState.load(
			ctx,
			page,
			search,
			mediaFoldersState(ctx.model.types.map((type) => type.schema)) === 'ready'
				? mediaPickerState.folder
				: null
		);
		if (request !== forRequest || version !== loadVersion || status.kind !== 'ready') return;
		const lastPage = Math.max(1, status.page.totalPages);
		if (page > lastPage) {
			await loadPage(lastPage, search);
			return;
		}
		currentPage = status.page.page;
		lastSignature = resultSignature(status.page.items);
		listScroll =
			restore && (restore.signature === undefined || restore.signature === lastSignature)
				? restore.scroll
				: 0;
		await tick();
		if (request === forRequest && version === loadVersion && listEl) listEl.scrollTop = listScroll;
	}

	$effect(() => {
		const next = request;
		untrack(() => {
			if (next === openedFor) return;
			rememberTraversal();
			openedFor = next;
			selected.clear();
			inspected = null;
			detailState = { dirty: false, busy: false, confirmationOpen: false };
			metadataSaved = false;
			insertError = null;
			inserting = false;
			if (!next) return;
			const previous = lastTraversal?.options === optionsKey(next.opts) ? lastTraversal : null;
			searchTerm = previous?.search ?? '';
			listScroll = previous?.scroll ?? 0;
			void loadPage(previous?.page ?? 1, searchTerm, previous ?? undefined);
		});
	});

	$effect(() => {
		const query = window.matchMedia('(max-width: 900px)');
		const update = () => {
			narrow = query.matches;
		};
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	});

	function handleDetailState(state: typeof detailState): void {
		detailState = state;
	}

	function canLeaveDetail(): boolean {
		return !inspected || (detailEl?.canLeave() ?? false);
	}

	async function inspectItem(item: MediaItemView): Promise<void> {
		if (blocked || item.id === inspected?.id || !canLeaveDetail()) return;
		listScroll = listEl?.scrollTop ?? listScroll;
		inspectedOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		inspectedOriginId = item.id;
		inspected = item;
		metadataSaved = false;
		await tick();
		detailEl?.focusContext();
	}

	/** El editor ya confirmó su guard antes de llamar a onClose; no se pregunta dos veces. */
	async function closeDetail(): Promise<void> {
		inspected = null;
		await tick();
		if (listEl) listEl.scrollTop = listScroll;
		const card = listEl
			? Array.from(listEl.querySelectorAll<HTMLElement>('[data-media-item]')).find(
					(element) => element.dataset.mediaItem === inspectedOriginId
				)
			: undefined;
		const target = inspectedOpener?.isConnected ? inspectedOpener : (card ?? searchInputEl);
		target?.focus({ preventScroll: true });
	}

	function backToList(): void {
		if (!blocked && canLeaveDetail()) void closeDetail();
	}

	function handleDetailSaved(updated: MediaItemView): void {
		if (selected.has(updated.id)) selected.set(updated.id, updated);
		inspected = updated;
		metadataSaved = true;
		void loadPage(currentPage, searchTerm, { scroll: listScroll });
	}

	const mediaItems = $derived<MediaItemView[]>(
		status.kind === 'ready' ? status.page.items.map(toMediaItemView) : []
	);
	// Filtro `accept` CLIENTE (ver cabecera): un asset sin `fileRef` (defensivo, no debería darse,
	// D-P6.1 exige `file` required) se excluye igual que uno con `accept` restrictivo y extensión
	// desconocida — nunca hay nada que insertar de un item sin fichero.
	const visibleItems = $derived(
		mediaItems.filter((item) => {
			const accept = request?.opts.accept;
			if (!accept || accept.length === 0) return true;
			return item.fileRef !== null && matchesAccept(item.fileRef, accept);
		})
	);

	function scheduleSearch(term: string): void {
		// La intención ya pertenece a la primera página, aunque se cierre antes del debounce.
		currentPage = 1;
		listScroll = 0;
		lastSignature = '';
		loadVersion++;
		if (debounceTimer !== null) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			void loadPage(1, term);
		}, MEDIA_SEARCH_DEBOUNCE_MS);
	}

	function handleSearchInput(event: Event): void {
		const raw = (event.currentTarget as HTMLInputElement).value;
		searchTerm = raw;
		scheduleSearch(raw);
	}

	function goToPage(target: number): void {
		if (!blocked) void loadPage(target, searchTerm);
	}

	function toggleSelect(item: MediaItemView): void {
		if (blocked) return;
		if (!multiple) {
			// Selección única: elegir OTRO reemplaza al anterior; volver a pulsar el YA elegido lo
			// deselecciona (mismo gesto que un toggle-button).
			const wasSelected = selected.has(item.id);
			selected.clear();
			if (!wasSelected) selected.set(item.id, item);
			return;
		}
		if (selected.has(item.id)) selected.delete(item.id);
		else selected.set(item.id, item);
	}

	function isSelected(item: MediaItemView): boolean {
		return selected.has(item.id);
	}

	/** "Cancelar"/Esc: resuelve `null` (D-P6.6). Ignorado mientras `inserting` está en vuelo (mismo
	 *  guard que `MediaDetail.requestClose` con `saving`). */
	function handleCancel(): void {
		if (blocked || !canLeaveDetail()) return;
		mediaPickerState.settle(null);
	}

	/**
	 * "Insertar" (INVARIANTE L-P6.8): descarga los bytes de cada elegido (`fileFromMediaAsset`) y
	 * resuelve `MediaPickResult[]`. Un fallo de descarga (red/CORS, `MediaFileFetchError`) se pinta
	 * EN CONTEXTO (`insertError`, `role="alert"`) sin cerrar el diálogo ni perder la selección — el
	 * usuario puede reintentar o cancelar. Cualquier otro error inesperado va a
	 * `ctx.feedback.reportError` (global, nunca pantalla blanca) además de cerrarse en `insertError`.
	 */
	async function handleInsert(): Promise<void> {
		if (blocked || detailState.dirty || selected.size === 0) return;
		inserting = true;
		insertError = null;
		dialogEl?.focus();
		try {
			const results: MediaPickResult[] = [];
			for (const item of selected.values()) {
				const file = await fileFromMediaAsset(ctx.port, item);
				results.push({
					file,
					mediaId: item.id,
					alt: item.alt,
					missingAlt: mediaMissingAlt(item)
				});
			}
			mediaPickerState.settle(results);
		} catch (err) {
			if (err instanceof MediaFileFetchError) {
				// Fallo DOCUMENTADO (red/CORS, ver cabecera de `media-file-from-url.ts`): en contexto,
				// el modal sigue abierto con la selección intacta para reintentar o cancelar.
				insertError = err.message;
			} else {
				// Inesperado (no debería pasar: `fileFromMediaAsset` solo lanza `MediaFileFetchError`)
				// — además del aviso en contexto, se reporta por el canal global (nunca en silencio).
				const vegaErr = VegaError.backend('Error inesperado insertando desde la biblioteca', err);
				insertError = vegaErr.message;
				ctx.feedback.reportError(vegaErr, { action: 'media:picker:insert' });
			}
		} finally {
			inserting = false;
		}
	}

	// Una sola trampa en el selector; el editor embebido conserva su guard y prioridad focal.
	let dialogEl = $state<HTMLElement | null>(null);
	let searchInputEl = $state<HTMLInputElement | null>(null);

	function focusableItems(): HTMLElement[] {
		if (!dialogEl) return [];
		return Array.from(
			dialogEl.querySelectorAll<HTMLElement>(
				'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]'
			)
		).filter(
			(element) => !element.closest('[hidden], [inert]') && element.getClientRects().length > 0
		);
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (detailState.confirmationOpen) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			if (blocked || detailEl?.clearPendingFocal()) return;
			if (inspected && narrow) backToList();
			else handleCancel();
			return;
		}
		if (event.key !== 'Tab') return;
		const items = focusableItems(),
			first = items[0],
			last = items.at(-1);
		if (!first || !last) {
			event.preventDefault();
			dialogEl?.focus();
			return;
		}
		if (
			event.shiftKey &&
			(document.activeElement === first || !items.includes(document.activeElement as HTMLElement))
		) {
			event.preventDefault();
			last.focus();
		} else if (
			!event.shiftKey &&
			(document.activeElement === last || !items.includes(document.activeElement as HTMLElement))
		) {
			event.preventDefault();
			first.focus();
		}
	}

	let focusRequest: typeof request = null;
	$effect(() => {
		const activeRequest = request;
		if (!activeRequest) return;
		focusRequest = activeRequest;
		const opener = activeRequest.opener;
		void tick().then(() => {
			if (request === activeRequest) searchInputEl?.focus();
		});
		document.addEventListener('keydown', handleKeydown, true);
		return () => {
			document.removeEventListener('keydown', handleKeydown, true);
			if (debounceTimer !== null) {
				clearTimeout(debounceTimer);
				debounceTimer = null;
			}
			const closingDialog = dialogEl;
			// El consumidor puede enfocar su editor al resolver la promesa; no se le roba ese foco.
			void tick().then(() => {
				const active = document.activeElement;
				if (
					!request &&
					focusRequest === activeRequest &&
					opener?.isConnected &&
					(active === document.body || !active?.isConnected || closingDialog?.contains(active))
				)
					opener.focus();
			});
		};
	});
</script>

{#if request}
	<div class="vega-media-picker-backdrop">
		<div
			class="vega-media-picker-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="vega-media-picker-title"
			aria-busy={blocked}
			tabindex="-1"
			bind:this={dialogEl}
		>
			<header class="vega-media-picker-header">
				<div>
					<h2 id="vega-media-picker-title">{ctx.t('media.picker.title')}</h2>
					<p class="vega-media-picker-copy">
						{request.opts.notice ?? ctx.t('media.picker.copyNotice')}
					</p>
				</div>
				<button
					type="button"
					class="vega-media-picker-close"
					onclick={handleCancel}
					disabled={blocked}
					aria-label={ctx.t('common.close')}><Icon id="close" /></button
				>
			</header>

			<div
				class="vega-media-picker-content"
				class:vega-media-picker-content--detail={inspected !== null}
			>
				<div
					class="vega-media-picker-list"
					bind:this={listEl}
					hidden={narrow && inspected !== null}
					inert={blocked}
					onscroll={() => {
						if (listEl && !listEl.hidden && status.kind === 'ready') listScroll = listEl.scrollTop;
					}}
				>
					<div class="vega-media-picker-search">
						<MediaFolderSelect
							value={mediaPickerState.folder}
							includeAll
							onChange={(value) => {
								mediaPickerState.folder = value;
								void loadPage(1, searchTerm);
							}}
						/>
						<label for="vega-media-picker-search-input">{ctx.t('media.picker.searchLabel')}</label>
						<input
							id="vega-media-picker-search-input"
							type="search"
							bind:this={searchInputEl}
							value={searchTerm}
							oninput={handleSearchInput}
							placeholder={ctx.t('media.picker.searchPlaceholder')}
							disabled={blocked}
						/>
					</div>
					<p class="vega-media-picker-browse-help">{ctx.t('media.picker.browseHelp')}</p>
					<div class="vega-media-picker-body" data-media-picker-grid-state={status.kind}>
						{#if status.kind === 'loading'}<p aria-live="polite">{ctx.t('common.loading')}</p>
						{:else if status.kind === 'error'}
							<div class="vega-media-picker-grid-error" role="alert">
								<p>{ctx.t('list.error.body', { message: status.error.message })}</p>
								<button type="button" onclick={() => loadPage(currentPage, searchTerm)}
									>{ctx.t('common.retry')}</button
								>
							</div>
						{:else}
							{#if visibleItems.length === 0}<p class="vega-media-picker-empty">
									{ctx.t('media.picker.empty')}
								</p>
							{:else}<MediaGrid
									items={visibleItems}
									onSelect={inspectItem}
									{isSelected}
									onToggleSelect={toggleSelect}
									isInspected={(item) => inspected?.id === item.id}
								/>{/if}
							{#if status.page.totalPages > 1}<Pagination
									page={status.page.page}
									totalPages={status.page.totalPages}
									totalItems={status.page.totalItems}
									perPage={MEDIA_PER_PAGE}
									onPrev={() => goToPage(status.page.page - 1)}
									onNext={() => goToPage(status.page.page + 1)}
								/>{/if}
						{/if}
					</div>
				</div>
				<MediaDetail
					item={inspected}
					embedded
					disabled={inserting}
					bind:this={detailEl}
					onClose={closeDetail}
					onSaved={handleDetailSaved}
					onDeleted={() => {}}
					fallbackFocusEl={searchInputEl}
					canUpdate={mediaPermissions.update}
					canDelete={false}
					canSetFocal={mediaHasFocal}
					onStateChange={handleDetailState}
				/>
			</div>

			<footer class="vega-media-picker-footer">
				{#if inspected && mediaPermissions.update}
					<div class="vega-media-picker-metadata-actions">
						<div>
							<strong role="status"
								>{ctx.t(
									detailState.busy
										? 'editor.saving'
										: detailState.dirty
											? 'editor.dirty'
											: metadataSaved
												? 'media.picker.metadataSaved'
												: 'media.picker.metadata'
								)}</strong
							>
							<p class="vega-media-picker-save-notice">{ctx.t('media.picker.saveNotice')}</p>
						</div>
						<button type="submit" form={detailEl?.formId} disabled={blocked || !detailState.dirty}
							>{ctx.t(detailState.busy ? 'editor.saving' : 'editor.save')}</button
						>
					</div>
				{/if}
				{#if detailState.dirty}<p class="vega-media-picker-pending" role="status">
						{ctx.t('media.picker.pending')}
					</p>{/if}
				{#if insertError}<p class="vega-media-picker-error" role="alert">{insertError}</p>{/if}
				<div class="vega-media-picker-actions">
					<span class="vega-media-picker-count" data-media-picker-count
						>{ctx.t('media.picker.selectedCount', {
							count: selected.size
						})}{#if selectedMissingAlt > 0}
							· <span class="vega-media-picker-count-warn"
								>{ctx.t('media.picker.missingAltCount', { count: selectedMissingAlt })}</span
							>{/if}</span
					>
					<div class="vega-media-picker-actions-primary">
						<button type="button" onclick={handleCancel} disabled={blocked}
							>{ctx.t('common.cancel')}</button
						><button
							type="button"
							onclick={handleInsert}
							disabled={blocked || detailState.dirty || selected.size === 0}
							>{inserting ? ctx.t('media.picker.inserting') : ctx.t('media.picker.insert')}</button
						>
					</div>
				</div>
			</footer>
		</div>
	</div>
{/if}

<style>
	.vega-media-picker-backdrop {
		position: fixed;
		z-index: 70;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--vega-space-gutter); /* Scrim existant, allowlisted; no nuevo color. */
		background: rgb(15 17 21 / 55%);
	}
	.vega-media-picker-dialog {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		width: 100%;
		max-width: 80rem;
		height: min(52rem, calc(100dvh - 2 * var(--vega-space-gutter)));
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-card);
	}
	.vega-media-picker-header {
		display: flex;
		gap: 1rem;
		justify-content: space-between;
		align-items: start;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--line);
	}
	.vega-media-picker-header > div {
		min-width: 0;
	}
	.vega-media-picker-header h2 {
		margin: 0;
		font-size: 1.1rem;
	}
	.vega-media-picker-copy {
		margin: 0.35rem 0 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}
	.vega-media-picker-content {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		min-height: 0;
		min-width: 0;
	}
	.vega-media-picker-content--detail {
		grid-template-columns: minmax(0, 1fr) 22rem;
	}
	.vega-media-picker-list {
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
		padding: 1rem 1.25rem;
		scroll-padding: 0.5rem;
	}
	.vega-media-picker-list[hidden] {
		display: none;
	}
	.vega-media-picker-search {
		display: grid;
		gap: 0.35rem;
	}
	.vega-media-picker-search label {
		color: var(--ink-2);
		font-size: 0.85rem;
		font-weight: 600;
	}
	.vega-media-picker-search input {
		width: 100%;
		min-width: 0;
		min-height: 44px;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--ink-2);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
	}
	.vega-media-picker-browse-help {
		margin: 0.75rem 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}
	.vega-media-picker-body {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 8rem;
	}
	.vega-media-picker-grid-error {
		display: grid;
		justify-items: start;
		gap: 0.6rem;
	}
	.vega-media-picker-empty {
		margin: 0;
		color: var(--ink-2);
	}
	.vega-media-picker-footer {
		padding: 0.75rem 1.25rem;
		border-top: 1px solid var(--line);
	}
	.vega-media-picker-metadata-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding-bottom: 0.6rem;
		margin-bottom: 0.6rem;
		border-bottom: 1px solid var(--line);
		font-size: 0.85rem;
	}
	.vega-media-picker-metadata-actions > div {
		min-width: 0;
	}
	.vega-media-picker-save-notice {
		margin: 0.2rem 0 0;
		color: var(--ink-2);
	}
	.vega-media-picker-pending {
		margin: 0 0 0.5rem;
		color: var(--warning);
		font-size: 0.85rem;
	}
	.vega-media-picker-error {
		margin: 0 0 0.5rem;
		color: var(--danger);
		font-size: 0.85rem;
	}
	.vega-media-picker-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.vega-media-picker-count {
		min-width: 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}
	.vega-media-picker-count-warn {
		color: var(--warning);
		font-weight: 600;
	}
	.vega-media-picker-actions-primary {
		display: flex;
		gap: 0.5rem;
	}
	.vega-media-picker-dialog button {
		min-width: 44px;
		min-height: 44px;
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}
	.vega-media-picker-dialog button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.vega-media-picker-actions-primary button:last-child {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
		font-weight: 600;
	}
	.vega-media-picker-close {
		flex-shrink: 0;
	}
	.vega-media-picker-dialog :is(button, input):focus-visible {
		outline-color: var(--ink);
	}
	@media (max-width: 900px) {
		.vega-media-picker-content--detail {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 550px) {
		.vega-media-picker-backdrop {
			padding: 0.5rem;
		}
		.vega-media-picker-header,
		.vega-media-picker-list {
			padding: 0.75rem;
		}
		.vega-media-picker-footer {
			padding: 0.5rem 0.75rem;
		}
		.vega-media-picker-actions {
			flex-wrap: wrap;
		}
		.vega-media-picker-actions-primary {
			width: 100%;
			justify-content: space-between;
		}
	}
	@media (max-height: 550px) {
		.vega-media-picker-backdrop {
			padding: 0.5rem;
		}
		.vega-media-picker-dialog {
			height: calc(100dvh - 1rem);
		}
		.vega-media-picker-header {
			padding: 0.5rem 0.75rem;
			align-items: center;
		}
		.vega-media-picker-copy,
		.vega-media-picker-save-notice {
			display: none;
		}
		.vega-media-picker-footer {
			padding: 0.5rem 0.75rem;
		}
		.vega-media-picker-metadata-actions {
			padding-bottom: 0.35rem;
			margin-bottom: 0.35rem;
		}
		.vega-media-picker-actions {
			flex-wrap: nowrap;
		}
		.vega-media-picker-actions-primary {
			width: auto;
		}
	}
</style>
