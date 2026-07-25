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
	 * - `'present'`: la biblioteca REAL: cabecera con recuento + botón "Subir archivos", toolbar
	 *   (buscador por nombre de fichero + chips de tipo), banda de arrastre (`MediaUpload`, Fase 6c)
	 *   + grid de `vega_media` (`MediaGrid`, Fase 6b) + paginación (`Pagination`, reutilizado de P4)
	 *   + panel de detalle (`MediaDetail`, 6b) para editar `alt`/`title`/`tags`. `MediaUpload` vive
	 *   SIEMPRE visible en este estado (antes del `{#if}` de carga/error/vacío/listo del grid): la
	 *   subida es una acción independiente del estado de la rejilla, y es también la CTA real del
	 *   caso "biblioteca vacía".
	 * - `'creatable'`: gate de confirmación inline (mismo tono que `ManifestEditor`, nunca
	 *   `window.confirm`) → al confirmar, `ensureMediaCollection(port)` (L-P6.10: la spec que
	 *   llega a `ensureCollections` contiene ÚNICAMENTE `vega_media`) → refresca `types` a
	 *   `'present'`.
	 * - `'manual'`: `capabilities.schemaBootstrap` es `false` → sin bootstrap disponible. En modo
	 *   superuser (adaptador/backend hipotético sin `ensureCollections`) se enseña el JSON de
	 *   importación determinista de `buildMediaBootstrapImportJson()` (L-P6.5); en modo EDITOR
	 *   (lote L6c: colección de auth ≠ `_superusers`, L6a — el único caso real hoy, PB reserva
	 *   `ensureCollections` a superusers) ese JSON no le sirve de nada (no tiene acceso al Admin de
	 *   PocketBase) y se degrada a un aviso honesto ("pídele a un administrador"). `isEditorMode`
	 *   (más abajo) es la misma señal de capability que gatea `/settings` — ver su cabecera.
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
	 * **Borrado (Fase 6d)**: `MediaDetail` es dueño del gesto de UN asset (botón "Borrar" + su
	 * propio `MediaDeleteConfirm` + `ctx.port.delete`, ver la cabecera de ambos) — esta ruta solo
	 * recibe `onDeleted` para refrescar el grid (`handleDetailDeleted`, mismo mecanismo que
	 * `handleDetailSaved`) y presta `headingEl` (el `<h1>` de arriba, `tabindex="-1"`) como destino
	 * de foco de reserva, mismo patrón que `headingEl` de `/c/[type]` (P4, fix de code-review de 4e).
	 *
	 * ————— Rediseño al mockup `aquelarre-medios.html` —————
	 *
	 * **Toolbar (filtros de CLIENTE, sobre la página cargada)**: el buscador filtra por nombre de
	 * FICHERO y los chips por tipo, ambos con módulos puros (`media-card.ts`). Los dos son de
	 * cliente y sobre la página actual a propósito, no por pereza: el nombre del binario no es un
	 * campo consultable del registro (solo `alt`/`title` lo son, `buildMediaListQuery`) y el mime
	 * tampoco (audit H1) — exactamente la misma limitación por la que el picker filtra `accept` en
	 * el cliente. Consecuencia asumida y visible: la paginación sigue contando el total SIN filtrar,
	 * y una página puede quedarse con menos celdas de las que promete.
	 *
	 * **Selección + barra contextual**: seleccionar NO es abrir. El click de una celda mantiene su
	 * gesto de 6b/6d (abre `MediaDetail`); la selección se opera con el círculo de la esquina de
	 * cada tarjeta (`MediaGrid` con `onToggleSelect`, ver su cabecera). La barra
	 * (`MediaSelectionBar`) cuenta SOLO lo seleccionado que está VISIBLE ahora mismo (`selectedItems`
	 * se filtra sobre `visibleItems`): así lo que dice el recuento es exactamente lo que tocan
	 * "Copiar URL" y "Eliminar", nunca assets escondidos por un filtro. El borrado múltiple pasa por
	 * el MISMO `MediaDeleteConfirm` que el de un asset suelto (D-P6.5: ninguna vía borra sin
	 * confirmación) y se ejecuta en SECUENCIA, abortando en el primer fallo — mismo criterio que el
	 * lote de subida (`media-upload-state.svelte.ts`) y que el reorder de `/c/[type]`.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteSet } from 'svelte/reactivity';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError, type ContentType } from '$lib/backend';
	import type { RecordId } from '$lib/backend/types';
	import {
		buildMediaBootstrapImportJson,
		computeMediaCollectionState,
		ensureMediaCollection
	} from '$lib/media/media-collection';
	import {
		matchesMediaNameQuery,
		matchesMediaTypeFilter,
		type MediaTypeFilter
	} from '$lib/media/media-card';
	import { mediaDisplayName, toMediaItemView, type MediaItemView } from '$lib/media/media-item';
	import { resolveMediaFileUrl } from '$lib/media/media-thumb';
	import { MEDIA_PER_PAGE, mediaPageToParams, parseMediaPage } from '$lib/media/media-query';
	import { createMediaListState } from '$lib/media/media-list-state.svelte';
	import { findMediaFileFieldSchema } from '$lib/media/media-upload';
	import { mediaRoute } from '$lib/nav/routes';
	import Icon from '$lib/icons/Icon.svelte';
	import MediaGrid from '$lib/media/MediaGrid.svelte';
	import MediaDetail from '$lib/media/MediaDetail.svelte';
	import MediaUpload from '$lib/media/MediaUpload.svelte';
	import MediaSelectionBar from '$lib/media/MediaSelectionBar.svelte';
	import MediaDeleteConfirm from '$lib/media/MediaDeleteConfirm.svelte';
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

	/** L6c: MISMA señal de capability que gatea `/settings` (ver su cabecera) — un editor nunca
	 *  tiene `schemaBootstrap: true`, así que en la práctica es la única forma en que `collectionState`
	 *  llega a `'manual'` hoy (PB solo reserva `ensureCollections` a superusers). Const plano, mismo
	 *  motivo que `isManifestEditable` en `/settings`: estable durante toda la vida del componente. */
	const isEditorMode = !ctx.port.capabilities.schemaBootstrap;

	const collectionState = $derived(
		computeMediaCollectionState(types, ctx.port.capabilities.schemaBootstrap)
	);
	/** Solo se compila el JSON de importación cuando de verdad se va a pintar (modo NO editor,
	 *  ver cabecera): en modo editor el mensaje degradado no lo necesita. */
	const bootstrapImportJson = $derived(
		collectionState === 'manual' && !isEditorMode ? buildMediaBootstrapImportJson() : null
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

	// ————— Toolbar: buscador por nombre de fichero + chips de tipo (filtros de CLIENTE) —————

	let searchTerm = $state('');
	let typeFilter = $state<MediaTypeFilter>('all');

	/** Los cuatro chips del mockup, en su orden. Array plano (nunca `$state`): es una constante de
	 *  presentación, no cambia en toda la vida del componente. */
	const TYPE_FILTERS: readonly { value: MediaTypeFilter; key: string }[] = [
		{ value: 'all', key: 'media.filter.all' },
		{ value: 'image', key: 'media.filter.images' },
		{ value: 'video', key: 'media.filter.video' },
		{ value: 'document', key: 'media.filter.documents' }
	];

	const hasActiveFilters = $derived(searchTerm.trim() !== '' || typeFilter !== 'all');

	/** Lo que de verdad se pinta: la página cargada tras el buscador y el chip activo (ver cabecera
	 *  — filtros de cliente, sobre la página actual). Sin filtros es exactamente `mediaItems`. */
	const visibleItems = $derived(
		mediaItems.filter(
			(item) =>
				matchesMediaTypeFilter(item.fileName, typeFilter) &&
				matchesMediaNameQuery(item.fileName, searchTerm)
		)
	);

	function clearFilters(): void {
		searchTerm = '';
		typeFilter = 'all';
	}

	// ————— Selección + acciones de lote —————

	// Ids elegidos con el círculo de cada tarjeta. `SvelteSet` YA es reactivo por sí mismo
	// (mutación in-place, mismo criterio que `selected` de `MediaPicker.svelte`).
	const selectedIds = new SvelteSet<RecordId>();
	/** Seleccionados VISIBLES (ver cabecera): lo que cuenta la barra es lo que tocan sus acciones. */
	const selectedItems = $derived(visibleItems.filter((item) => selectedIds.has(item.id)));

	function toggleSelect(item: MediaItemView): void {
		if (selectedIds.has(item.id)) selectedIds.delete(item.id);
		else selectedIds.add(item.id);
	}

	function isSelected(item: MediaItemView): boolean {
		return selectedIds.has(item.id);
	}

	/**
	 * "Copiar URL": la URL pública de cada asset seleccionado, una por línea. `resolveMediaFileUrl`
	 * es el ÚNICO constructor de esa URL en toda la app (envuelve `port.fileUrl`; nunca se concatena
	 * una ruta a mano, §4.4) — un asset sin binario resoluble simplemente no aporta línea, en vez de
	 * colar una cadena vacía. Sin API de portapapeles (contexto no seguro, permiso denegado) el
	 * fallo se dice en un toast — nunca en silencio, y nunca por el banner global: no es un fallo de
	 * transporte contra el backend.
	 */
	async function copySelectedUrls(): Promise<void> {
		const urls: string[] = [];
		for (const item of selectedItems) {
			const url = resolveMediaFileUrl(ctx.port, item);
			if (url !== null) urls.push(url);
		}
		if (urls.length === 0) return;
		try {
			await navigator.clipboard.writeText(urls.join('\n'));
			ctx.feedback.toast(ctx.t('media.selection.copySuccess', { count: urls.length }), {
				kind: 'success'
			});
		} catch {
			ctx.feedback.toast(ctx.t('media.selection.copyError'), { kind: 'error' });
		}
	}

	/** `true` mientras se pide confirmar el borrado de la selección (D-P6.5: ninguna vía borra sin
	 *  confirmación explícita). */
	let confirmingBulkDelete = $state(false);
	let bulkDeleting = $state(false);

	/** El único asset de la selección, o `undefined` si hay 0 o varios. Marcar UN asset y borrarlo
	 *  desde la barra de selección es el mismo acto que borrarlo desde su detalle, así que también
	 *  merece el aviso de referencias (`#lote-integridad`): dos caminos para el mismo borrado con
	 *  distinta protección es cómo se cuela el fallo que este lote existe para evitar. Con varios
	 *  seleccionados sí se omite —comprobar N assets multiplica el coste por N y el contrato de esta
	 *  fase no lo pide—, y ahí el diálogo se comporta como antes del lote. */
	const onlySelected = $derived(selectedItems.length === 1 ? selectedItems[0] : undefined);

	/** Etiqueta del asset a borrar cuando la selección es de UNO solo (el diálogo de siempre); con
	 *  varios manda el `title` pluralizado y esta cadena se ignora. */
	const bulkDeleteLabel = $derived(onlySelected ? mediaDisplayName(onlySelected) : '');

	function requestBulkDelete(): void {
		if (selectedItems.length === 0) return;
		confirmingBulkDelete = true;
	}

	function cancelBulkDelete(): void {
		if (bulkDeleting) return;
		confirmingBulkDelete = false;
	}

	/**
	 * Borra la selección, en SECUENCIA y abortando en el primer fallo (ver cabecera). El snapshot
	 * `targets` se toma ANTES del primer `await`: `selectedItems` es derivado de la página cargada,
	 * y el `reload()` del final la reemplaza — iterar sobre el derivado sería iterar sobre una lista
	 * que cambia bajo los pies. Lo ya borrado NUNCA se pierde de vista: el toast cuenta los que sí
	 * salieron y el error se reporta aparte.
	 */
	async function confirmBulkDelete(): Promise<void> {
		if (bulkDeleting) return;
		const targets = [...selectedItems];
		if (targets.length === 0) return;
		bulkDeleting = true;
		let deleted = 0;
		let failure: unknown = null;
		for (const item of targets) {
			try {
				await ctx.port.delete('vega_media', item.id);
				selectedIds.delete(item.id);
				deleted++;
			} catch (err) {
				failure = err;
				break;
			}
		}
		bulkDeleting = false;
		confirmingBulkDelete = false;
		if (deleted > 0) {
			ctx.feedback.toast(ctx.t('media.selection.deleteSuccess', { count: deleted }), {
				kind: 'success'
			});
			mediaListState.reload();
		}
		if (failure !== null) {
			ctx.feedback.reportError(
				failure instanceof VegaError
					? failure
					: VegaError.backend('Error borrando la selección de la biblioteca', failure)
			);
		}
	}

	// ————— Subida (Fase P6·6c) —————

	/** El campo `file` de `vega_media` YA resuelto contra el esquema DESCUBIERTO (D-P6.3): `null`
	 *  solo de forma defensiva (en la práctica, si `collectionState === 'present'` la colección
	 *  existe y `file` es `required`, así que siempre está) — `MediaUpload` no se monta sin él. */
	const mediaFileSchema = $derived(findMediaFileFieldSchema(types));

	/** Instancia de `MediaUpload` (patrón `bind:this` de Svelte 5): el botón primario "Subir
	 *  archivos" de la cabecera dispara SU `<input type="file">` — un único control de ficheros en
	 *  la página, dos afordancias (cabecera y banda de arrastre) para llegar a él. */
	let uploadRef = $state<ReturnType<typeof MediaUpload> | null>(null);

	/** Tras cada subida individual con éxito: recarga la página ACTUAL del grid (mismo mecanismo
	 *  que `handleDetailSaved`) — un asset nuevo siempre entra por `created` desc, así que aparece
	 *  arriba si el usuario está en la página 1; si está en otra página, el efecto no es visible
	 *  hasta volver a ella (alcance mínimo: 6c no reordena la navegación del usuario por su cuenta). */
	function handleMediaUploaded(): void {
		mediaListState.reload();
	}

	/** Navega a `target` conservando ningún otro parámetro (6b no tiene más estado de vista que
	 *  `page`) — mismo guard `routerReady` (P3-L9) que el resto de navegación programática. La
	 *  selección se limpia: es una elección hecha SOBRE la página que se abandona, arrastrarla a
	 *  otra dejaría la barra contando cosas que ya no están a la vista. */
	function goToMediaPage(target: number): void {
		if (!routerReady) return;
		selectedIds.clear();
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
	 *  por su cuenta (`onClose()` tras `onDeleted`), esta función solo refresca el grid — y suelta
	 *  el id borrado de la selección, que si no seguiría contando en la barra. */
	function handleDetailDeleted(id: MediaItemView['id']): void {
		selectedIds.delete(id);
		mediaListState.reload();
	}

	/** Destino de foco de reserva para `MediaDeleteConfirm` (Fase 6d, vía `MediaDetail`, y también
	 *  el del borrado de la selección): el `<h1>` de esta ruta, `tabindex="-1"` en el marcado —
	 *  mismo patrón que `headingEl` de `/c/[type]` (P4, fix de code-review de 4e). */
	let headingEl = $state<HTMLElement | null>(null);
</script>

<div class="vega-media-page">
	<!-- Cabecera (mockup `.page-head`): h1 + recuento + espaciador + acción primaria, todo en una
	     fila alineada a la línea base, con `flex-wrap` para que en viewports estrechos el botón baje
	     de línea en vez de desbordar. Mismo patrón que `.vega-list-header` de `/c/[type]`. -->
	<div class="vega-media-head">
		<h1 bind:this={headingEl} tabindex="-1">{ctx.t('nav.media')}</h1>
		{#if collectionState === 'present' && mediaReadyPage}
			<!-- El recuento sale del listado real (`totalItems`), nunca de lo que hay pintado: es el
			     total de la biblioteca, no el de esta página ni el de este filtro. El mockup añade el
			     peso total en MB — Vega no lo sabe (un `FileRef` es solo el nombre del binario, §4.4:
			     el puerto no expone tamaño ni dimensiones), así que no se inventa. -->
			<span class="vega-media-meta">
				<b>{mediaReadyPage.totalItems}</b>
				{ctx.t('media.meta.files')}
			</span>
		{/if}
		<span class="vega-media-head-spacer"></span>
		{#if collectionState === 'present' && mediaFileSchema}
			<button
				type="button"
				class="vega-media-upload-button"
				onclick={() => uploadRef?.openFilePicker()}
			>
				<Icon id="upload" size={14} />
				{ctx.t('media.upload.button')}
			</button>
		{/if}
	</div>

	{#if status === 'loading'}
		<p aria-live="polite">{ctx.t('common.loading')}</p>
	{:else if status === 'error'}
		<div class="vega-media-error" role="alert">
			<p>{ctx.t('media.loadErrorBody')}</p>
			<button type="button" onclick={() => load()}>{ctx.t('common.retry')}</button>
		</div>
	{:else if collectionState === 'manual'}
		<!-- L6c: `data-media-state="manual-editor"` distingue el aviso degradado del genérico
		     (`"manual"`, superuser sin bootstrap) para los e2e, mismo criterio que el resto de
		     `data-media-state`. -->
		<div
			class="notice notice-bootstrap"
			role="alert"
			data-media-state={isEditorMode ? 'manual-editor' : 'manual'}
		>
			{#if isEditorMode}
				<p>{ctx.t('media.bootstrap.editorBody')}</p>
			{:else}
				<p>{ctx.t('media.bootstrap.manualBody')}</p>
				<p>{ctx.t('media.bootstrap.manualImportHint')}</p>
				{#if bootstrapImportJson}
					<pre class="bootstrap-json">{bootstrapImportJson}</pre>
				{/if}
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
			<!-- Toolbar (mockup `.toolbar`): buscador + chips de tipo. Filtros de CLIENTE sobre la
			     página cargada (ver cabecera), sin debounce: no hay red detrás que amortiguar. -->
			<div class="vega-media-toolbar">
				<label class="vega-media-search">
					<Icon id="search" size={14} />
					<input
						type="search"
						bind:value={searchTerm}
						placeholder={ctx.t('media.search.placeholder')}
						aria-label={ctx.t('media.search.ariaLabel')}
					/>
				</label>
				<span
					class="vega-media-type-chips"
					role="group"
					aria-label={ctx.t('media.filter.groupLabel')}
				>
					{#each TYPE_FILTERS as filter (filter.value)}
						<button
							type="button"
							class="vega-media-type-chip"
							aria-pressed={typeFilter === filter.value}
							onclick={() => (typeFilter = filter.value)}
						>
							{ctx.t(filter.key)}
						</button>
					{/each}
				</span>
			</div>

			<!-- Zona de subida (Fase 6c): SIEMPRE visible en 'present', independiente del estado del
			     grid de abajo (loading/error/vacío/listo) — también la CTA real del caso "biblioteca
			     vacía" (ver cabecera del script). -->
			{#if mediaFileSchema}
				<MediaUpload
					bind:this={uploadRef}
					schema={mediaFileSchema}
					onUploaded={handleMediaUploaded}
				/>
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
					{#if visibleItems.length > 0}
						<MediaGrid
							items={visibleItems}
							onSelect={openDetail}
							{isSelected}
							onToggleSelect={toggleSelect}
						/>
					{:else if mediaItems.length > 0 && hasActiveFilters}
						<!-- 0 resultados CON filtros activos: nunca se confunde con la biblioteca vacía de
						     verdad (esa rama es `mediaIsEmpty`, arriba) — mismo criterio que
						     `empty-search` en `/c/[type]` (L-P4.12). -->
						<div class="vega-media-empty" data-media-grid-state="empty-filter">
							<p>{ctx.t('media.filter.empty')}</p>
							<button type="button" onclick={clearFilters}>{ctx.t('media.filter.clear')}</button>
						</div>
					{/if}
					{#if mediaReadyPage && mediaReadyPage.totalPages > 1}
						<Pagination
							page={mediaReadyPage.page}
							totalPages={mediaReadyPage.totalPages}
							totalItems={mediaReadyPage.totalItems}
							perPage={MEDIA_PER_PAGE}
							onPrev={() => goToMediaPage(mediaReadyPage.page - 1)}
							onNext={() => goToMediaPage(mediaReadyPage.page + 1)}
						/>
					{/if}
					{#if selectedItems.length > 0}
						<MediaSelectionBar
							count={selectedItems.length}
							busy={bulkDeleting}
							onCopy={() => void copySelectedUrls()}
							onDelete={requestBulkDelete}
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

<!-- Confirmación del borrado de la SELECCIÓN (D-P6.5). Hermano de `MediaDetail` y montado siempre,
     como el que `MediaDetail` lleva dentro: los dos se controlan solo por su `open`, y nunca están
     abiertos a la vez (uno exige el detalle abierto, el otro la barra de selección). Con un único
     asset elegido, el título de siempre; con varios, uno que sabe pluralizar (`title`). -->
<MediaDeleteConfirm
	open={confirmingBulkDelete}
	assetLabel={bulkDeleteLabel}
	title={selectedItems.length > 1
		? ctx.t('media.selection.deleteTitle', { count: selectedItems.length })
		: undefined}
	targetId={onlySelected?.id ?? null}
	targetFileRef={onlySelected?.fileRef ?? null}
	deleting={bulkDeleting}
	fallbackFocusEl={headingEl}
	onConfirm={() => void confirmBulkDelete()}
	onCancel={cancelBulkDelete}
/>

<style>
	.vega-media-page {
		display: flex;
		flex-direction: column;
		gap: var(--vega-space-gutter);
	}

	/* Cabecera (mockup `.page-head`): alineada a la línea base, con más aire debajo que el resto de
	   bloques — el `margin` propio SUMA al `gap` del contenedor (1rem en `comfortable`) para dar el
	   1.4rem del mockup, sin fijarlo a pelo (en `compact` el gutter aprieta y esto acompaña). */
	.vega-media-head {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 0.4rem;
	}

	.vega-media-head h1 {
		margin: 0;
		font-size: 1.45em;
		font-weight: 700;
		color: var(--ink-hi);
		letter-spacing: -0.01em;
	}

	/* Recuento (mockup `.page-head .meta`): el número es un VALOR → --mono, el rótulo no. */
	.vega-media-meta {
		color: var(--ink-2);
		font-size: 0.9em;
		white-space: nowrap;
	}

	.vega-media-meta b {
		font-family: var(--mono);
		font-weight: 500;
		font-size: 0.94em;
	}

	.vega-media-head-spacer {
		flex: 1;
	}

	/* Acción primaria (mockup `.btn.btn-primary`): relleno `--accent-fill` (gradiente en los temas
	   ricos, acento sólido en los planos — misma firma que "Nueva {label}" del listado y "Guardar"
	   del editor, nunca `--sheen`, que es solo trazo). Hover = anillo de `--accent-line`: un
	   `background` sólido de hover no tiene sentido sobre un gradiente. */
	.vega-media-upload-button {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		height: 34px;
		padding: 0 0.9rem;
		border: 1px solid transparent;
		border-radius: var(--r);
		background: var(--accent-fill);
		color: var(--accent-ink);
		font-weight: 550;
		line-height: 1;
		cursor: pointer;
		white-space: nowrap;
	}

	.vega-media-upload-button:hover {
		box-shadow: 0 0 0 1.5px var(--accent-line);
	}

	/* Toolbar (mockup `.toolbar`). */
	.vega-media-toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	/* Buscador (mockup `.toolbar .search`): la caja es un control → `--surface`; el anillo de foco
	   vive en el CONTENEDOR (`:focus-within`), no en el `<input>` desnudo de dentro. */
	.vega-media-search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: 34px;
		min-width: 240px;
		padding: 0 0.7rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink-3);
	}

	.vega-media-search:focus-within {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
		border-color: var(--line-strong);
	}

	.vega-media-search input {
		width: 100%;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--ink);
		font: inherit;
	}

	.vega-media-search input::placeholder {
		color: var(--ink-3);
	}

	/* Chips de tipo (mockup `.type-chip`): píldoras con `aria-pressed` — un grupo de toggles de
	   verdad, no enlaces disfrazados. `line-height` explícito: el del lienzo no viaja hasta aquí y
	   el texto quedaría bajo dentro de la píldora. */
	.vega-media-type-chips {
		display: inline-flex;
		gap: 0.35rem;
	}

	.vega-media-type-chip {
		height: 28px;
		padding: 0 0.75rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--btn);
		color: var(--ink-2);
		font-size: 0.86em;
		line-height: 1;
		cursor: pointer;
		white-space: nowrap;
	}

	.vega-media-type-chip:hover {
		border-color: var(--line-strong);
		color: var(--ink);
	}

	.vega-media-type-chip[aria-pressed='true'] {
		border-color: var(--accent-line);
		background: var(--accent-soft);
		color: var(--accent-text);
		font-weight: 600;
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
		border-radius: var(--r);
		background: var(--paper);
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
		/* --mono (vocabulario §3): JSON crudo, valor canónico — sustituye la pila de fuentes
		   hardcodeada por el token. */
		font-family: var(--mono);
		font-size: 0.8rem;
	}
</style>
