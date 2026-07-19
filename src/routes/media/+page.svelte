<script lang="ts">
	/**
	 * `/media` (§2.4 del contrato P3; §9/L-P6.3/L-P6.5/L-P6.10 del contrato P6, Fase 6a "bootstrap
	 * + esquema" — Fase 6b "grid + detalle"): reemplaza el placeholder honesto pre-P6 por el
	 * bootstrap REAL de la colección `vega_media`, reproduciendo el mismo patrón que P2 en
	 * `/settings` (consentimiento EXPLÍCITO del superuser ANTES de crear nada, nunca automático).
	 *
	 * Carga inicial (solo cliente, `onMount`; esta ruta no navegaba programáticamente en 6a así que
	 * no dependía de `routerReady` — 6b SÍ navega, `goToMediaPage`, ver más abajo):
	 * - `types` ← `port.listContentTypes()`.
	 * - `collectionState` ← `computeMediaCollectionState(types, capabilities.schemaBootstrap)`
	 *   (§9: llamada directa al cálculo genérico de `$lib/backend/collection-state`, generalizado
	 *   en esta misma fase — audit H6, NO se clona el de `/settings`).
	 *
	 * Los tres desenlaces (§9):
	 * - `'present'`: la biblioteca REAL: zona de subida (`MediaUpload`, Fase 6c) + grid de
	 *   `vega_media` (`MediaGrid`, Fase 6b) + paginación (`Pagination`, reutilizado de P4) + panel
	 *   de detalle (`MediaDetail`, 6b) para editar `alt`/`title`/`tags`. `MediaUpload` vive SIEMPRE
	 *   visible en este estado (antes del `{#if}` de carga/error/vacío/listo del grid, ver más
	 *   abajo): la subida es una acción independiente del estado de la rejilla, y es también la
	 *   CTA real del caso "biblioteca vacía" (antes un placeholder honesto sin acción).
	 * - `'creatable'`: gate de confirmación inline (mismo tono que `ManifestEditor`, nunca
	 *   `window.confirm`) → al confirmar, `ensureMediaCollection(port)` (L-P6.10: la spec que
	 *   llega a `ensureCollections` contiene ÚNICAMENTE `vega_media`) → refresca `types` a
	 *   `'present'`.
	 * - `'manual'`: `capabilities.schemaBootstrap` es `false` → el JSON de importación
	 *   determinista de `buildMediaBootstrapImportJson()` (L-P6.5), sin botón de crear.
	 *
	 * Errores de TRANSPORTE (`VegaError`) → `ctx.feedback.reportError` (nunca pantalla blanca);
	 * el hueco local solo ofrece "Reintentar", igual que `/settings`. El grid tiene su PROPIO
	 * estado de carga/error EN CONTEXTO (`mediaListState`, `media-list-state.svelte.ts`): un fallo
	 * de `port.list('vega_media', …)` nunca tumba el marco de `/media`, solo su rejilla (mismo
	 * patrón que `/c/[type]`, P4 §4c/L-P4.4).
	 *
	 * **`?page=` (Fase 6b, D-P4.9-alike)**: la paginación del grid vive en la URL, mismo mecanismo
	 * que `/c/[type]` — de ahí que esta ruta SÍ necesite el guard `routerReady` (P3-L9) para
	 * `goToMediaPage` (`Pagination.onPrev`/`onNext`), aunque no lo necesitara en 6a.
	 *
	 * **Borrado (Fase 6d)**: `MediaDetail` es dueño del gesto entero (botón "Borrar" + su propio
	 * `MediaDeleteConfirm` + `ctx.port.delete`, ver la cabecera de ambos) — esta ruta solo recibe
	 * `onDeleted` para refrescar el grid (`handleDetailDeleted`, mismo mecanismo que
	 * `handleDetailSaved`) y presta `headingEl` (el `<h1>` de arriba, `tabindex="-1"`) como destino
	 * de foco de reserva, mismo patrón que `headingEl` de `/c/[type]` (P4, fix de code-review de 4e).
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError, type ContentType } from '$lib/backend';
	import {
		buildMediaBootstrapImportJson,
		computeMediaCollectionState,
		ensureMediaCollection
	} from '$lib/media/media-collection';
	import { toMediaItemView, type MediaItemView } from '$lib/media/media-item';
	import { MEDIA_PER_PAGE, mediaPageToParams, parseMediaPage } from '$lib/media/media-query';
	import { createMediaListState } from '$lib/media/media-list-state.svelte';
	import { findMediaFileFieldSchema } from '$lib/media/media-upload';
	import { mediaRoute } from '$lib/nav/routes';
	import MediaGrid from '$lib/media/MediaGrid.svelte';
	import MediaDetail from '$lib/media/MediaDetail.svelte';
	import MediaUpload from '$lib/media/MediaUpload.svelte';
	import Pagination from '$lib/list/Pagination.svelte';

	const ctx = getVegaContext();

	type LoadStatus = 'loading' | 'ready' | 'error';

	let status = $state<LoadStatus>('loading');
	let types = $state<ContentType[]>([]);
	/** `true` mientras se muestra la confirmación inline del estado `'creatable'` (mismo gate que
	 *  §A.4.6 en `ManifestEditor`): el usuario pulsó "Crear colección" pero aún no confirmó. */
	let confirmingCreate = $state(false);
	let creating = $state(false);

	// P3-L9: `Pagination`/`goToMediaPage` (Fase 6b) navegan; se guarda tras `onMount`, mismo
	// razonamiento que `/c/[type]` (este componente solo llega a montarse tras layout+sesión
	// resueltos, el router ya está asentado en ese momento).
	let routerReady = $state(false);

	const collectionState = $derived(
		computeMediaCollectionState(types, ctx.port.capabilities.schemaBootstrap)
	);
	const bootstrapImportJson = $derived(
		collectionState === 'manual' ? buildMediaBootstrapImportJson() : null
	);

	async function load(): Promise<void> {
		status = 'loading';
		try {
			types = await ctx.port.listContentTypes();
			status = 'ready';
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error cargando /media', err);
			ctx.feedback.reportError(vegaErr, { action: 'media:load' });
			status = 'error';
		}
	}

	onMount(() => {
		routerReady = true;
		void load();
	});

	function handleCreateClick(): void {
		confirmingCreate = true;
	}

	function handleCancelCreate(): void {
		confirmingCreate = false;
	}

	async function handleConfirmCreate(): Promise<void> {
		creating = true;
		try {
			// L-P6.10: único punto de llamada, encapsula la spec (solo `vega_media`).
			await ensureMediaCollection(ctx.port);
			types = await ctx.port.listContentTypes();
			confirmingCreate = false;
		} catch (err) {
			const vegaErr =
				err instanceof VegaError
					? err
					: VegaError.backend('Error creando la colección "vega_media"', err);
			ctx.feedback.reportError(vegaErr, { action: 'media:ensureCollections' });
		} finally {
			creating = false;
		}
	}

	// ————— Grid de vega_media (Fase 6b) —————

	const mediaPage = $derived(parseMediaPage(page.url.searchParams));
	const mediaListState = createMediaListState();

	$effect(() => {
		if (!routerReady || collectionState !== 'present') return;
		void mediaListState.load(ctx, mediaPage);
	});

	const mediaStatus = $derived(mediaListState.status);
	const mediaReadyPage = $derived(mediaStatus.kind === 'ready' ? mediaStatus.page : null);
	const mediaItems = $derived<MediaItemView[]>(
		mediaReadyPage ? mediaReadyPage.items.map(toMediaItemView) : []
	);
	// Biblioteca REALMENTE vacía (ninguna página tiene nada) — distinto de "esta página concreta
	// no tiene items" (deep-link a un `?page=` fuera de rango): ese segundo caso, deliberadamente
	// sin redirección automática en 6b (alcance mínimo, la paginación no es el foco de esta fase),
	// simplemente no pinta el grid pero SÍ la paginación, para que el usuario pueda volver.
	const mediaIsEmpty = $derived(mediaReadyPage !== null && mediaReadyPage.totalItems === 0);

	// ————— Subida (Fase P6·6c) —————

	/** El campo `file` de `vega_media` YA resuelto contra el esquema DESCUBIERTO (D-P6.3): `null`
	 *  solo de forma defensiva (en la práctica, si `collectionState === 'present'` la colección
	 *  existe y `file` es `required`, así que siempre está) — `MediaUpload` no se monta sin él. */
	const mediaFileSchema = $derived(findMediaFileFieldSchema(types));

	/** Tras cada subida individual con éxito: recarga la página ACTUAL del grid (mismo mecanismo
	 *  que `handleDetailSaved`) — un asset nuevo siempre entra por `created` desc, así que aparece
	 *  arriba si el usuario está en la página 1; si está en otra página, el efecto no es visible
	 *  hasta volver a ella (alcance mínimo: 6c no reordena la navegación del usuario por su cuenta). */
	function handleMediaUploaded(): void {
		mediaListState.reload();
	}

	/** Navega a `target` conservando ningún otro parámetro (6b no tiene más estado de vista que
	 *  `page`) — mismo guard `routerReady` (P3-L9) que el resto de navegación programática. */
	function goToMediaPage(target: number): void {
		if (!routerReady) return;
		const qs = mediaPageToParams(target).toString();
		void goto(`${mediaRoute()}${qs ? `?${qs}` : ''}`);
	}

	// ————— Detalle de un asset (Fase 6b) —————

	let selectedItem = $state<MediaItemView | null>(null);

	function openDetail(item: MediaItemView): void {
		selectedItem = item;
	}

	function closeDetail(): void {
		selectedItem = null;
	}

	/** Tras guardar en `MediaDetail`: recarga la página actual del grid (mismo patrón que
	 *  `listState.reload()` de P4 tras un borrado) — la celda se refresca con el registro REAL
	 *  del backend, nunca con los drafts locales del panel. */
	function handleDetailSaved(_updated: MediaItemView): void {
		mediaListState.reload();
	}

	/** Tras borrar un asset en `MediaDetail` (Fase 6d): mismo mecanismo que `handleDetailSaved`, la
	 *  celda ya no existe y el grid se refresca contra el backend real. `MediaDetail` ya se cierra
	 *  por su cuenta (`onClose()` tras `onDeleted`), esta función solo refresca el grid. */
	function handleDetailDeleted(_id: MediaItemView['id']): void {
		mediaListState.reload();
	}

	/** Destino de foco de reserva para `MediaDeleteConfirm` (Fase 6d, vía `MediaDetail`): el `<h1>`
	 *  de esta ruta, `tabindex="-1"` en el marcado — mismo patrón que `headingEl` de `/c/[type]`
	 *  (P4, fix de code-review de 4e). */
	let headingEl = $state<HTMLElement | null>(null);
</script>

<div class="vega-media-page">
	<header class="vega-media-header">
		<h1 bind:this={headingEl} tabindex="-1">{ctx.t('nav.media')}</h1>
	</header>

	{#if status === 'loading'}
		<p aria-live="polite">{ctx.t('common.loading')}</p>
	{:else if status === 'error'}
		<div class="vega-media-error" role="alert">
			<p>{ctx.t('media.loadErrorBody')}</p>
			<button type="button" onclick={() => load()}>{ctx.t('common.retry')}</button>
		</div>
	{:else if collectionState === 'manual'}
		<div class="notice notice-bootstrap" role="alert">
			<p>{ctx.t('media.bootstrap.manualBody')}</p>
			<p>{ctx.t('media.bootstrap.manualImportHint')}</p>
			{#if bootstrapImportJson}
				<pre class="bootstrap-json">{bootstrapImportJson}</pre>
			{/if}
		</div>
	{:else if collectionState === 'creatable'}
		<div class="vega-media-empty" data-media-state="creatable">
			<p>{ctx.t('media.empty.title')}</p>
			<button type="button" onclick={handleCreateClick} disabled={creating}>
				{ctx.t('media.bootstrap.create')}
			</button>
		</div>

		{#if confirmingCreate}
			<!-- Confirmación INLINE (nunca `window.confirm`, que bloquea), mismo patrón que
			     `ManifestEditor` §A.4.6. -->
			<div class="notice notice-confirm" role="alertdialog" aria-live="assertive">
				<p>{ctx.t('media.bootstrap.confirmBody')}</p>
				<div class="actions">
					<button type="button" onclick={handleConfirmCreate} disabled={creating}>
						{creating ? ctx.t('media.bootstrap.creating') : ctx.t('media.bootstrap.confirm')}
					</button>
					<button type="button" onclick={handleCancelCreate} disabled={creating}>
						{ctx.t('common.cancel')}
					</button>
				</div>
			</div>
		{/if}
	{:else}
		<!-- 'present': biblioteca real (Fase 6b). data-media-state para que los e2e la localicen sin
		     depender del idioma; data-media-grid-state acota el estado de CARGA del grid en sí. -->
		<div class="vega-media-library" data-media-state="present">
			<!-- Zona de subida (Fase 6c): SIEMPRE visible en 'present', independiente del estado del
			     grid de abajo (loading/error/vacío/listo) — también la CTA real del caso "biblioteca
			     vacía" (ver cabecera del script). -->
			{#if mediaFileSchema}
				<MediaUpload schema={mediaFileSchema} onUploaded={handleMediaUploaded} />
			{/if}

			{#if mediaStatus.kind === 'loading'}
				<p data-media-grid-state="loading" aria-live="polite">{ctx.t('common.loading')}</p>
			{:else if mediaStatus.kind === 'error'}
				<!-- Error EN CONTEXTO (nunca tumba el marco de /media, L-P4.4-alike): "Reintentar"
				     repite la ÚLTIMA carga vía `mediaListState.retry()`. -->
				<div class="vega-media-grid-error" data-media-grid-state="error" role="alert">
					<p>{ctx.t('list.error.body', { message: mediaStatus.error.message })}</p>
					<button type="button" onclick={() => mediaListState.retry()}>
						{ctx.t('common.retry')}
					</button>
				</div>
			{:else if mediaIsEmpty}
				<div class="vega-media-empty" data-media-grid-state="empty">
					<h2>{ctx.t('media.empty.title')}</h2>
					<p>{ctx.t('media.empty.body')}</p>
				</div>
			{:else}
				<div data-media-grid-state="ready">
					{#if mediaItems.length > 0}
						<MediaGrid items={mediaItems} onSelect={openDetail} />
					{/if}
					{#if mediaReadyPage && mediaReadyPage.totalPages > 1}
						<Pagination
							page={mediaReadyPage.page}
							totalPages={mediaReadyPage.totalPages}
							totalItems={mediaReadyPage.totalItems}
							perPage={MEDIA_PER_PAGE}
							onPrev={() => goToMediaPage(mediaReadyPage.page - 1)}
							onNext={() => goToMediaPage(mediaReadyPage.page + 1)}
							onGoToPage={goToMediaPage}
						/>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<MediaDetail
	item={selectedItem}
	onClose={closeDetail}
	onSaved={handleDetailSaved}
	onDeleted={handleDetailDeleted}
	fallbackFocusEl={headingEl}
/>

<style>
	.vega-media-page {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 60rem;
	}

	.vega-media-header h1 {
		margin: 0;
		font-size: 1.3rem;
	}

	.vega-media-error,
	.vega-media-grid-error {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.vega-media-error button,
	.vega-media-grid-error button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		cursor: pointer;
	}

	.vega-media-library {
		display: flex;
		flex-direction: column;
		gap: var(--vega-space-gutter);
	}

	.vega-media-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1.5rem;
		border: 1px dashed var(--line);
		border-radius: 8px;
		background: var(--surface-2);
	}

	.vega-media-empty h2 {
		margin: 0;
		font-size: 1.05rem;
	}

	.vega-media-empty p {
		margin: 0;
		color: var(--ink-2);
	}

	.vega-media-empty button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--btn);
		color: var(--ink);
		cursor: pointer;
	}

	.vega-media-empty button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.notice {
		padding: 0.75rem 1rem;
		border-radius: 4px;
		border: 1px solid;
	}

	.notice-bootstrap {
		border-color: var(--warning);
		background: var(--warning-soft);
		color: var(--warning);
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
		margin: 0 0 0.5rem;
	}

	.notice p:last-child {
		margin-bottom: 0;
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

	.bootstrap-json {
		max-height: 16rem;
		overflow: auto;
		padding: 0.5rem;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 4px;
		font-family: ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 0.8rem;
	}
</style>
