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
	 * pintar menos celdas de las que promete "24 por página", nunca al revés).
	 *
	 * **Búsqueda SERVER-SIDE por alt/title**: `buildMediaListQuery(page, { search })` (Fase 6e,
	 * `media-query.ts`) — debounce de 250ms, mismo valor que el buscador de `Relation.svelte` (F5-e).
	 *
	 * **Diálogo modal**: mismo patrón estructural que `MediaDetail.svelte` (backdrop + `dialog` +
	 * foco atrapado + `Esc` cierra, salvo mientras `inserting` está en vuelo).
	 */
	import { SvelteMap } from 'svelte/reactivity';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend/errors';
	import type { RecordId } from '$lib/backend/types';
	import { createMediaListState } from './media-list-state.svelte';
	import { MEDIA_PER_PAGE } from './media-query';
	import { toMediaItemView, type MediaItemView } from './media-item';
	import { matchesAccept, type MediaPickResult } from './media-picker';
	import { mediaPickerState } from './media-picker-state.svelte';
	import { fileFromMediaAsset, MediaFileFetchError } from './media-file-from-url';
	import MediaGrid from './MediaGrid.svelte';
	import Pagination from '$lib/list/Pagination.svelte';

	const ctx = getVegaContext();

	const request = $derived(mediaPickerState.request);
	const open = $derived(request !== null);
	const multiple = $derived(request?.opts.multiple ?? false);

	const listState = createMediaListState();
	const status = $derived(listState.status);

	let searchTerm = $state('');
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	const SEARCH_DEBOUNCE_MS = 250;

	// Elegidos EN ESTA sesión del picker: `MediaItemView` completo (no solo el id) — "Insertar"
	// necesita `id`/`fileRef`/`alt` de cada uno, y la selección puede abarcar varias páginas (elegir
	// en la 1, paginar, elegir en la 2), así que no basta con lo que trae la página actual.
	// `SvelteMap` YA es reactivo por sí mismo (mutación in-place vía `.set()`/`.delete()`/`.clear()`,
	// mismo criterio que `failedImages` de `MediaGrid.svelte`/`FileInput.svelte`) — envolverlo en
	// `$state` es redundante (`svelte/no-unnecessary-state-wrap`).
	const selected = new SvelteMap<RecordId, MediaItemView>();

	let inserting = $state(false);
	let insertError = $state<string | null>(null);

	// Detecta la transición "se abrió una petición NUEVA" (distinta referencia de `request`) para
	// resetear el estado de la sesión anterior — variable PLANA (nunca leída en el template, mismo
	// criterio que `lastCall` de `media-list-state.svelte.ts`).
	let openedFor: typeof request = null;
	$effect(() => {
		if (request && request !== openedFor) {
			openedFor = request;
			searchTerm = '';
			selected.clear();
			insertError = null;
			inserting = false;
			void listState.load(ctx, 1);
		} else if (!request) {
			openedFor = null;
		}
	});

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
		if (debounceTimer !== null) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			void listState.load(ctx, 1, term);
		}, SEARCH_DEBOUNCE_MS);
	}

	function handleSearchInput(event: Event): void {
		const raw = (event.currentTarget as HTMLInputElement).value;
		searchTerm = raw;
		scheduleSearch(raw);
	}

	function goToPage(target: number): void {
		void listState.load(ctx, target, searchTerm);
	}

	function toggleSelect(item: MediaItemView): void {
		if (inserting) return;
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
		if (inserting) return;
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
		if (inserting || selected.size === 0) return;
		inserting = true;
		insertError = null;
		try {
			const results: MediaPickResult[] = [];
			for (const item of selected.values()) {
				const file = await fileFromMediaAsset(ctx.port, item);
				results.push({ file, mediaId: item.id, alt: item.alt });
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

	// ————— Diálogo modal (mismo patrón que `MediaDetail.svelte`) —————
	let dialogEl = $state<HTMLElement | null>(null);
	let searchInputEl = $state<HTMLInputElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	function focusableItems(): HTMLElement[] {
		if (!dialogEl) return [];
		return Array.from(dialogEl.querySelectorAll<HTMLElement>('button:not([disabled]), input'));
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			handleCancel();
			return;
		}
		if (event.key !== 'Tab') return;
		const items = focusableItems();
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (!open) return;

		previouslyFocused = document.activeElement as HTMLElement | null;
		searchInputEl?.focus();

		document.addEventListener('keydown', handleKeydown, true);
		return () => {
			document.removeEventListener('keydown', handleKeydown, true);
			if (debounceTimer !== null) {
				clearTimeout(debounceTimer);
				debounceTimer = null;
			}
			if (previouslyFocused && document.contains(previouslyFocused)) {
				previouslyFocused.focus();
			}
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
			bind:this={dialogEl}
		>
			<div class="vega-media-picker-header">
				<h2 id="vega-media-picker-title">{ctx.t('media.picker.title')}</h2>
				<p class="vega-media-picker-copy">{ctx.t('media.picker.copyNotice')}</p>
			</div>

			<div class="vega-media-picker-search">
				<label for="vega-media-picker-search-input">{ctx.t('media.picker.searchLabel')}</label>
				<input
					id="vega-media-picker-search-input"
					type="search"
					bind:this={searchInputEl}
					value={searchTerm}
					oninput={handleSearchInput}
					placeholder={ctx.t('media.picker.searchPlaceholder')}
					disabled={inserting}
				/>
			</div>

			{#if insertError}
				<p class="vega-media-picker-error" role="alert">{insertError}</p>
			{/if}

			<div class="vega-media-picker-body" data-media-picker-grid-state={status.kind}>
				{#if status.kind === 'loading'}
					<p aria-live="polite">{ctx.t('common.loading')}</p>
				{:else if status.kind === 'error'}
					<div class="vega-media-picker-grid-error" role="alert">
						<p>{ctx.t('list.error.body', { message: status.error.message })}</p>
						<button type="button" onclick={() => listState.retry()}>
							{ctx.t('common.retry')}
						</button>
					</div>
				{:else if visibleItems.length === 0}
					<p class="vega-media-picker-empty">{ctx.t('media.picker.empty')}</p>
				{:else}
					<MediaGrid items={visibleItems} onSelect={toggleSelect} {isSelected} />
					{#if status.page.totalPages > 1}
						<Pagination
							page={status.page.page}
							totalPages={status.page.totalPages}
							totalItems={status.page.totalItems}
							perPage={MEDIA_PER_PAGE}
							onPrev={() => goToPage(status.page.page - 1)}
							onNext={() => goToPage(status.page.page + 1)}
							onGoToPage={goToPage}
						/>
					{/if}
				{/if}
			</div>

			<div class="vega-media-picker-actions">
				<span class="vega-media-picker-count">
					{ctx.t('media.picker.selectedCount', { count: selected.size })}
				</span>
				<div class="vega-media-picker-actions-primary">
					<button type="button" onclick={handleCancel} disabled={inserting}>
						{ctx.t('common.cancel')}
					</button>
					<button type="button" onclick={handleInsert} disabled={inserting || selected.size === 0}>
						{inserting ? ctx.t('media.picker.inserting') : ctx.t('media.picker.insert')}
					</button>
				</div>
			</div>
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
		padding: var(--vega-space-gutter);
		/* Scrim theme-independiente (§3 no tiene token de velo) — allowlisted en
		   check-theme-coverage.mjs, mismo criterio que DeleteConfirm/ReloginModal/MediaDetail. */
		background: rgb(15 17 21 / 55%);
	}

	.vega-media-picker-dialog {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		width: 100%;
		max-width: 40rem;
		max-height: calc(100vh - 2 * var(--vega-space-gutter));
		overflow-y: auto;
		padding: 1.5rem;
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-card);
	}

	.vega-media-picker-header h2 {
		margin: 0 0 0.35rem;
		font-size: 1.1rem;
	}

	.vega-media-picker-copy {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-2);
	}

	.vega-media-picker-search {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.vega-media-picker-search label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--ink-2);
	}

	.vega-media-picker-search input {
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
	}

	.vega-media-picker-error {
		margin: 0;
		color: var(--danger);
		font-size: 0.9rem;
	}

	.vega-media-picker-body {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 8rem;
	}

	.vega-media-picker-grid-error {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.6rem;
	}

	.vega-media-picker-grid-error button {
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		cursor: pointer;
	}

	.vega-media-picker-empty {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.9rem;
	}

	.vega-media-picker-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding-top: 0.4rem;
		border-top: 1px solid var(--line);
	}

	.vega-media-picker-count {
		font-size: 0.85rem;
		color: var(--ink-2);
	}

	.vega-media-picker-actions-primary {
		display: flex;
		gap: 0.5rem;
	}

	.vega-media-picker-actions-primary button {
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.9rem;
		cursor: pointer;
	}

	.vega-media-picker-actions-primary button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.vega-media-picker-actions-primary button:last-child {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
		font-weight: 600;
	}
</style>
