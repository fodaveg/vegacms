<script lang="ts">
	/**
	 * `/c/[type]` (§2.4, §3.3 del contrato P3; Fase 4c del contrato P4): marco de LISTADO + el
	 * resolutor de singleton por deep-link de 3a (§3.3, §7.B.12), intacto. Resuelve tres
	 * desenlaces que dependen solo del `ContentModel` ya cargado (P3-L2 garantiza sesión y modelo
	 * listos aquí, `getVegaContext()` nunca lanza en esta ruta):
	 *
	 * - `type` inexistente u oculto → `not-found` en contexto (§6.5): NO redirige a `/login`.
	 * - `type` con `singleton: true` → nunca pinta listado: resuelve la regla runtime de P2 §4.6
	 *   con `ctx.nav.toSingleton()`, el MISMO camino que usa un click de sidebar (`NavItem.svelte`)
	 *   — incluida su captura de errores de transporte vía `feedback.reportError` (P3-L3: ninguna
	 *   promesa rechazada suelta).
	 * - `type` normal → la tabla READ-ONLY montada de 4c/4d (columnas de 4a + estado de vista de
	 *   4b) + la toolbar de 4d (búsqueda D-P4.3, filtro de estado D-P4.4, orden por cabecera
	 *   D-P4.6) + el borrado de 4e: loading/vacío-colección/vacío-búsqueda/error + paginación, con
	 *   la insignia "Solo lectura" si `type.readonly` (view). Un `?page=` fuera de rango
	 *   (`items: []` pero `totalItems > 0`, ningún adaptador clampa `page`) NO se confunde con la
	 *   colección vacía: redirige a la última página válida (fix de code-review, L-P4.13, ver
	 *   `pageOutOfRange` más abajo). Un 0-resultados CON búsqueda/filtro activos tampoco se
	 *   confunde con la colección vacía de verdad: es `empty-search` (L-P4.12, ver `hasActiveFilters`
	 *   y el orden de ramas del marcado).
	 *
	 * **Borrado (Fase 4e, L-P4.11/L-P4.4/Audit H6)**: `RecordTable` emite `onDeleteRequest` por
	 * fila (ausente en tipos `readonly`, L-P4.9); esta ruta guarda el registro pendiente
	 * (`pendingDelete`) y monta `DeleteConfirm` — SIN ese diálogo NUNCA se llama a `ctx.port.delete`
	 * (L-P4.11). Al confirmar: éxito → toast + `listState.reload()` (repite la carga actual; si la
	 * fila borrada era la última de la página, el MISMO `$effect` de "página fuera de rango" de
	 * arriba retrocede solo, sin lógica nueva, L-P4.13); fallo → `ctx.feedback.reportError` (nunca
	 * el `status.error` del listado, que es solo para fallos de CARGA, L-P4.4) y la fila sigue en
	 * la tabla porque nunca se quitó de forma optimista (solo `reload()` en el camino de éxito).
	 *
	 * Guard P3-L9 (router-ready antes de navegar): esta ruta usa `onMount`, NO el patrón
	 * `afterNavigate` + `routerReady` del índice (`routes/+page.svelte`). Motivo (bug real
	 * encontrado al implementar esta fase, anotado para no repetirlo): `+layout.svelte` NO monta
	 * `{@render children()}` hasta que `modelStatus === 'ready'` (async); un deep-link DIRECTO
	 * (`page.goto('/c/tipo')`, sin navegación cliente previa) dispara UNA sola vez el evento
	 * `afterNavigate` de SvelteKit, en el instante de la hidratación — ANTES de que este
	 * componente llegue a montarse (el `{#if}` del layout aún lo tiene oculto). El callback local
	 * de `afterNavigate` registrado aquí llegaría tarde a ese único evento y JAMÁS se dispararía
	 * (no hay una segunda navegación que lo rescate), dejando el efecto de abajo bloqueado para
	 * siempre. El índice sale indemne solo porque SIEMPRE llega aquí vía una navegación cliente
	 * real (el `goto()` del guard de sesión tras el login), que sí genera un evento nuevo — pero
	 * el mismo hueco existe ahí para una recarga/deep-link directo a `/` con sesión ya válida.
	 * `onMount` es equivalente y robusto en ambos casos: este componente SOLO llega a existir
	 * después de que el layout resolvió sesión+modelo, momento en el que el router YA está
	 * asentado sin ninguna duda (la ventana de riesgo de la landmine de Lumbre — navegar durante
	 * el primer render síncrono, antes de hidratar — ya ha pasado hace rato). El mismo guard cubre
	 * ahora también la carga del listado (4c) y la navegación de `Pagination.goToPage`: ninguna de
	 * las dos dispara antes de `routerReady`.
	 *
	 * **Lote-2 del rediseño C2 (R2/R3/R4)**: R2 mueve el filtro de estado del `<select>` de
	 * `ListToolbar` a chips en la misma fila que el `<h1>` y el botón "Nueva {label}" (atajo `N`,
	 * guardado igual que `GlobalSearch`); R3 es solo visual, dentro de `RecordTable`; R4 unifica
	 * tabla + paginación numerada en UNA tarjeta (`.vega-list-card`, mockup `.grid`) —
	 * `RecordTable`/`Pagination` ya no llevan cada uno su propio marco.
	 *
	 * **Lote M2 (deltas CSS-only + meta de cabecera, mockup `aquelarre-dark.html`)**: G7 añade el
	 * resumen "N registros · M filtros" junto al `<h1>` (`activeFilterCount`, más abajo — cuenta
	 * `q`/`status` activos, GENÉRICO a cualquier `ResolvedContentType`, nunca hardcodea nombres de
	 * filtro de dominio); G4 añadió "Exportar" junto a "Nueva {label}" como STUB VISUAL (sin
	 * `onclick`). Visible para CUALQUIER tipo (incluido `readonly`, a diferencia de "Nueva"):
	 * exportar datos ya existentes tiene sentido aunque el tipo no admita crear/borrar.
	 *
	 * **`#lote-esquema`, Fase 1**: el stub se activa de verdad — `permissions.list` (mismo criterio
	 * que "Nueva"/el asa de reorder) abre `ExportDialog.svelte` (`$lib/transfer/`), que hace todo
	 * el trabajo (scope, paginación, descarga) por su cuenta vía `ctx.port`; esta ruta solo decide
	 * CUÁNDO se ofrece el botón y le pasa `viewState`/`hasActiveFilters` (el MISMO cálculo que ya
	 * usa "Limpiar filtros", ver más abajo) para que el diálogo pueda ofrecer "solo el filtro
	 * actual" con criterio, sin reimplementarlo. El gate por `permissions.list` es en la práctica
	 * SIEMPRE `true` aquí (esta rama del marcado solo se alcanza cuando ya lo es, ver el `{:else
	 * if}` de más abajo) — se comprueba explícitamente de todos modos, mismo criterio de defensa en
	 * profundidad que `reorderable`/`permissions.update` (fix de code-review de ese lote): si el
	 * día de mañana el control de flujo de esta ruta cambia, el botón sigue sin ofrecerse solo
	 * porque la condición vive aquí, no porque "ya no se puede llegar sin permiso".
	 *
	 * **`#lote-esquema`, Fase 2**: "Importar" nace junto a "Exportar" (`canImport` más abajo, gate
	 * por `permissions.create || permissions.update` + `capabilities.explicitRecordId` — fallo
	 * cerrado, §4.3 del contrato de `import-collection.ts`). `ImportDialog.svelte` NO recibe
	 * `contentType`: a diferencia del export, un `.vega.json` es multi-colección por formato y el
	 * diálogo procesa TODAS las que trae el fichero (ver su cabecera) — esta ruta solo decide
	 * CUÁNDO se ofrece el botón, no qué se importa. `onImported={() => listState.reload()}`: la
	 * tabla ya pintada no sabe por sí sola que el import escribió registros por debajo — mismo
	 * patrón que el `reload()` tras un borrado/reorder con éxito, más arriba.
	 *
	 * **M6 (reabre R2, mockup `.toolbar`)**: David sustituyó las chips CON RECUENTO de R2 por
	 * chips de filtro ACTIVO removibles (`ActiveFilterChips.svelte`) — solo se pinta el filtro que
	 * el usuario YA aplicó, con una ✕ que lo quita; elegir un filtro NUEVO pasa a un menú diferido
	 * en `ListToolbar` ("Filtrar", sin recuentos). Con esto, el filtro de estado deja la cabecera
	 * (`.vega-list-header`, junto al `<h1>`) y se muda a la fila de la TOOLBAR
	 * (`.vega-list-toolbar`), junto a la búsqueda y "Limpiar filtros" — mismo orden que
	 * `.toolbar` en el mockup. `countsRefreshToken` (la pieza de estado que R2 añadió para que las
	 * chips con recuento supieran que sus cifras habían quedado obsoletas tras un borrado) ya NO
	 * hace falta: `ActiveFilterChips` no consulta el puerto para contar nada, así que se retira.
	 *
	 * **Lote 12, lámina 6 (`06-listado-movil-crear-primero.html`)**: por debajo de 640 px la
	 * cabecera pinta «Crear» PRIMERO, a todo el ancho que sobra, y agrupa Exportar e Importar en un
	 * botón «Más» (`ActionMenu`); con una sola secundaria disponible, botón suelto. Por encima de
	 * 640 px no se toca nada. El ancho se mide con `matchMedia` (`narrow`) y la decisión vive en
	 * `planHeaderActions` (`$lib/list/header-actions`, puro): se pinta UNA rama según el ancho en
	 * vez de reordenar con `order` en CSS, para que el orden visual y el de tabulación coincidan.
	 *
	 * **Lote 12, lámina 7 (`07-accion-de-fila-en-menu.html`)**: las acciones de fila pasan a un
	 * menú dentro de `RecordTable` («Duplicar» y «Borrar…»). «Duplicar» (decisión de David) solo
	 * se ofrece si `canDuplicateRecord` (`$lib/duplicate/records`) lo permite; la copia la hace
	 * `duplicateRecord` con la regla campo a campo documentada allí, y al terminar se abre la copia
	 * (mismo desenlace que «Duplicar» dentro del registro) para renombrarla.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { canCreateManually } from '$lib/model/creation';
	import { getVegaContext } from '$lib/app-context';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { VegaRecord } from '$lib/backend/types';
	import { VegaError } from '$lib/backend/errors';
	import { vegaErrorMessage } from '$lib/shell/vega-error-message';
	import { DEFAULT_PER_PAGE } from '$lib/backend/query';
	import { resolveVisibleContentType } from '$lib/nav/content-type';
	import { deriveColumns } from '$lib/list/columns';
	import { parseViewState, viewStateToParams, type ViewStatePatch } from '$lib/list/query-state';
	import { cycleSort } from '$lib/list/sort';
	import { computeSpanReorder } from '$lib/list/reorder';
	import { createListState } from '$lib/list/list-state.svelte';
	import { planHeaderActions } from '$lib/list/header-actions';
	import type { ActionMenuItem } from '$lib/list/action-menu';
	import { canDuplicateRecord, duplicateRecord } from '$lib/duplicate/records';
	import { listRoute } from '$lib/nav/routes';
	import { hasFileValues } from '$lib/revisions/restore';
	import { handleNewRecordKeydown } from '$lib/list/record-list-keyboard';
	import RouteState from '$lib/shell/RouteState.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import RecordTable from '$lib/list/RecordTable.svelte';
	import Pagination from '$lib/list/Pagination.svelte';
	import ListToolbar from '$lib/list/ListToolbar.svelte';
	import ActiveFilterChips from '$lib/list/ActiveFilterChips.svelte';
	import ActionMenu from '$lib/list/ActionMenu.svelte';
	import DeleteConfirm from '$lib/list/DeleteConfirm.svelte';
	import ExportDialog from '$lib/transfer/ExportDialog.svelte';
	import ImportDialog from '$lib/transfer/ImportDialog.svelte';

	const ctx = getVegaContext();

	const typeParam = $derived(page.params.type ?? '');
	const contentType = $derived(resolveVisibleContentType(ctx.model, typeParam));
	const columns = $derived(contentType ? deriveColumns(contentType) : []);
	// Estado de vista EFÍMERO de la URL (4b, D-P4.9): esta fase solo escribe `?page=`, pero
	// respeta el round-trip completo de `q`/`sort`/`status` si ya estuvieran en la URL (L-P4.13).
	const viewState = $derived(parseViewState(page.url.searchParams));
	// Orden EFECTIVO para pintar (capacidad `defaultSort`, P2, mockup `aquelarre-dark.html`): un
	// `?sort=&dir=` explícito en la URL SIEMPRE gana (L-P4.13, deep-link intacto); sin él, cae al
	// `defaultSort` del tipo (opt-in, `null` si no lo declara ⇒ mismo comportamiento de siempre,
	// sin orden activo). `buildListQuery` (`search.ts`) aplica el MISMO fallback para la query
	// real — este derivado solo existe para que la tabla/el ciclo de orden pinten y partan del
	// mismo estado que los datos que se están mostrando.
	const effectiveSort = $derived(viewState.sort ?? contentType?.defaultSort ?? null);

	let routerReady = $state(false);
	onMount(() => {
		routerReady = true;
	});

	$effect(() => {
		if (!routerReady || !contentType?.singleton) return;
		void ctx.nav.toSingleton(contentType.name);
	});

	const listState = createListState();

	// Dispara/recarga la carga del listado cuando cambian el tipo o la vista (deep-link, click de
	// paginación...). El anti-carrera (L-P4.10) vive en `list-state.svelte.ts`: una respuesta que
	// llega y ya no es la última emitida se descarta sin pisar `listState.status`.
	$effect(() => {
		if (!routerReady || !contentType || contentType.singleton) return;
		void listState.load(ctx, contentType, viewState);
	});

	// Snapshots reactivos de `listState.status` (en vez de `{@const}` en el marcado: `{@const}`
	// exige ser hijo INMEDIATO de un bloque `{#if}`/`{:else}`/… y aquí vive dentro de un `<div>`
	// de envoltorio) — `readyPage` no-null habilita las ramas "vacío"/"ready" sin repetir el
	// `status.kind === 'ready'` en cada una.
	const listStatus = $derived(listState.status);
	const readyPage = $derived(listStatus.kind === 'ready' ? listStatus.page : null);
	// El adaptador `memory` (y PB) NO clampan `page` a `totalPages` (§4.6/§4.2): un deep-link a
	// `?page=99` sobre un tipo con datos devuelve `items: []` pero `totalItems > 0`. Distingue eso
	// (fix de code-review, L-P4.13) de la colección REALMENTE vacía (`totalItems === 0`): la
	// primera es "página fuera de rango" (se redirige, ver `$effect` de abajo), la segunda es el
	// estado `empty-collection` de verdad.
	const pageOutOfRange = $derived(
		readyPage !== null && readyPage.items.length === 0 && readyPage.totalItems > 0
	);
	// Búsqueda o filtro de estado activos (Fase 4d, L-P4.12): distingue un 0-resultados CON
	// filtros (empty-search) de la colección REALMENTE vacía (empty-collection). El orden NO
	// cuenta como filtro para esta distinción (D-P4.6 nunca produce 0 resultados por sí solo).
	const hasActiveFilters = $derived(viewState.q !== '' || viewState.status !== null);
	// Recuento de filtros activos (M2, G7 del mockup, "N registros · M filtros"): mismos dos ejes
	// que `hasActiveFilters` de arriba, pero como cardinal en vez de booleano — genérico (nunca
	// cuenta un filtro de dominio concreto, solo `q`/`status` de `ViewState`).
	const activeFilterCount = $derived(
		(viewState.q !== '' ? 1 : 0) + (viewState.status !== null ? 1 : 0)
	);
	// items.length === 0 SIN datos en ninguna página (totalItems === 0): ni "fuera de rango" (eso
	// exige totalItems > 0) ni "ready" — se bifurca en empty-search/empty-collection más abajo
	// según `hasActiveFilters`.
	const isEmpty = $derived(
		readyPage !== null && readyPage.items.length === 0 && readyPage.totalItems === 0
	);

	// ————— Reorder manual (core, `orderField`) —————
	// Elegible SOLO cuando reordenar a mano tiene sentido inequívoco: el tipo declara `orderField`
	// (P2), la vista no tiene ningún orden/búsqueda/filtro explícito propio (arrastrar filas sobre
	// una vista filtrada/ordenada de otra forma daría un orden que no sobrevive a quitar el
	// filtro), y la colección entera cabe en una página (arrastrar entre páginas no está
	// soportado). Cualquier otra combinación oculta la columna del asa (`RecordTable`, ver su
	// cabecera), nunca la deja a medias.
	// `effectiveSort` (no `viewState.sort` a secas) desde la capacidad `defaultSort`: si el tipo
	// declara un orden inicial, la tabla YA no está en su orden natural de `orderField` aunque la
	// URL no traiga `?sort=` — arrastrar filas ahí produciría un reorder que no coincide con lo
	// que el usuario ve, mismo motivo que ya excluía un `?sort=` explícito.
	// `permissions.update` (fix de code-review): el resto del fichero SÍ mira el permiso adecuado
	// para cada acción (create para "Nueva"/atajo `N`, delete para la fila) — el asa de reorder se
	// había quedado fuera. Arrastrar una fila es un `ctx.port.update` por registro (ver
	// `handleReorder`); con `access.update: 'denied'` la UI la ofrecía igual y el primer `update`
	// del lote moría en un 403 del backend.
	// `!persisting` (L7c): mientras una tanda de updates sigue en vuelo la tabla no admite otro
	// arrastre (dos tandas solapadas calcularían sobre un orden que ya está mutando); mismo
	// criterio que `/v/[view]`.
	let persisting = $state(false);
	const reorderable = $derived(
		!persisting &&
			contentType !== null &&
			contentType.orderField !== null &&
			contentType.permissions.update &&
			effectiveSort === null &&
			viewState.q === '' &&
			viewState.status === null &&
			readyPage !== null &&
			readyPage.totalPages <= 1
	);

	/** Handler de `onReorder` de `RecordTable` (ver su cabecera): construye `orderedIds`/
	 *  `currentValues` a partir de la página actual (`readyPage.items`, la única en juego cuando
	 *  `reorderable` es `true`), calcula el mínimo conjunto de updates (`computeSpanReorder`:
	 *  solo el tramo movido, módulo puro) y los persiste uno a uno vía `ctx.port.update`. Sin updates (drop en el mismo sitio)
	 *  es un no-op, ni siquiera toca el puerto. Éxito → `listState.reload()` (mismo patrón que
	 *  `confirmDelete`); fallo → `ctx.feedback.reportError` (nunca `status.error` del listado, que
	 *  es solo para fallos de CARGA, L-P4.4). */
	async function handleReorder(fromIndex: number, toIndex: number): Promise<void> {
		if (!contentType || !readyPage || contentType.orderField === null) return;
		const orderField = contentType.orderField;
		const orderedIds = readyPage.items.map((record) => record.id);
		const currentValues: Record<string, number> = {};
		for (const record of readyPage.items) {
			const raw = record.values[orderField];
			currentValues[record.id] = typeof raw === 'number' ? raw : 0;
		}
		const updates = computeSpanReorder(orderedIds, currentValues, fromIndex, toIndex);
		if (updates.length === 0) return;
		persisting = true;
		try {
			for (const update of updates) {
				// `orderOnlyField`: reordenar no deja versión en el historial (ver `withRevisions`).
				await ctx.port.update(
					contentType.name,
					update.id,
					{ [orderField]: update.value },
					{ orderOnlyField: orderField }
				);
			}
			listState.reload();
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend(ctx.t('list.reorder.error'), err)
			);
			// Un fallo a mitad de tanda ya pudo escribir parte de los updates: recarga para pintar
			// el orden REAL del backend, no el pre-drop (mismo criterio que `/v/[view]`).
			listState.reload();
		} finally {
			persisting = false;
		}
	}

	// ————— Borrado (Fase 4e, L-P4.11) —————
	// Registro pendiente de confirmar + su `label` ya resuelto (mismo `openText` de la fila,
	// reutilizado por `RecordTable` al emitir `onDeleteRequest` — DRY, ver su cabecera). `null` =
	// diálogo cerrado; es la ÚNICA condición que abre `DeleteConfirm` más abajo.
	let pendingDelete = $state<{ record: VegaRecord; label: string } | null>(null);
	// `true` mientras `ctx.port.delete` está en vuelo (deshabilita los botones del diálogo, evita
	// un doble envío con un doble click).
	let deleting = $state(false);
	// Destino de foco de reserva para `DeleteConfirm` (fix de code-review, ver su cabecera): el
	// `<h1>` del listado, `tabindex="-1"` en el marcado — estable frente a un borrado con éxito,
	// que se lleva por delante la fila (y su botón "Borrar") a la que el diálogo restauraría el
	// foco por defecto.
	let headingEl = $state<HTMLElement | null>(null);

	/** `RecordTable` (fila, `contentType.permissions.delete`) pide confirmar el borrado de `record`. Defensa
	 *  en profundidad (fix de code-review de 4e): con un borrado YA en vuelo (`deleting`), ignora
	 *  la petición — nunca reescribe `pendingDelete` a mitad de un `ctx.port.delete` ajeno (el
	 *  diálogo solo puede abrirse para un registro a la vez; `DeleteConfirm` ya hace lo mismo por
	 *  su lado con el guard de `handleConfirm`/`handleCancel`, esto cierra el hueco simétrico). */
	function requestDelete(record: VegaRecord, label: string): void {
		if (deleting) return;
		pendingDelete = { record, label };
	}

	/** "Cancelar" o `Esc` en `DeleteConfirm` (L-P4.11: cancelar no borra nada). */
	function cancelDelete(): void {
		if (deleting) return; // ignora Esc/backdrop mientras el borrado está en vuelo
		pendingDelete = null;
	}

	/**
	 * Confirma el borrado (§ borrado de la cabecera del fichero). Éxito: toast + `listState.reload()`
	 * (si la fila borrada era la última de la página, el `$effect` de "página fuera de rango" de
	 * arriba retrocede solo). Fallo: `ctx.feedback.reportError` (NUNCA el `status.error` del
	 * listado, que es solo para fallos de CARGA, L-P4.4) — el diálogo se cierra y la fila sigue en
	 * la tabla porque nunca se quitó de forma optimista.
	 *
	 * `record`/`label` se desestructuran de `pendingDelete` ANTES del `await` (fix de code-review:
	 * bug real, no solo defensivo) — `requestDelete()` ahora se ignora mientras `deleting` es
	 * `true`, así que `pendingDelete` no puede REESCRIBIRSE a mitad de este `await`, pero SÍ puede
	 * ponerse a `null` (p.ej. si `cancelDelete()` llegara a colarse). Leer `pendingDelete.label`
	 * DESPUÉS del `await` sería frágil ante ese caso — capturar `label` en una constante local
	 * ahora es la única lectura, y el toast de éxito queda garantizado correcto pase lo que pase
	 * con `pendingDelete` mientras tanto.
	 */
	async function confirmDelete(): Promise<void> {
		if (!pendingDelete || !contentType) return;
		const { record, label } = pendingDelete;
		deleting = true;
		try {
			await ctx.port.delete(contentType.name, record.id);
			ctx.feedback.toast(ctx.t('list.delete.success', { label }), { kind: 'success' });
			pendingDelete = null;
			listState.reload();
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend('Error inesperado al borrar', err)
			);
			pendingDelete = null;
		} finally {
			deleting = false;
		}
	}

	// ————— Duplicar desde la fila (Lote 12, lámina 7) —————
	// `true` mientras un `duplicateRecord` está en vuelo: una segunda petición (doble click en la
	// entrada, otra fila) se ignora hasta que termine, mismo criterio que `deleting`.
	let duplicating = $state(false);
	/** Si el menú de fila ofrece «Duplicar» para este tipo (`canDuplicateRecord`: crear y listar; en
	 *  páginas, también los permisos sobre su colección de bloques). */
	const canDuplicate = $derived(
		contentType !== null && canDuplicateRecord(contentType, ctx.model.types)
	);

	/**
	 * «Duplicar» de la fila: clona `record` con `duplicateRecord` (regla campo a campo en su
	 * cabecera) y abre la copia para renombrarla — el mismo desenlace que «Duplicar» dentro del
	 * registro (`/c/[type]/[id]`). Si mientras se clonaba el usuario cambió de colección, la
	 * respuesta vieja no secuestra la ruta (mismo guard que allí). Fallo →
	 * `ctx.feedback.reportError` (nunca el `status.error` del listado, solo para fallos de CARGA).
	 */
	async function requestDuplicate(record: VegaRecord, label: string): Promise<void> {
		if (!contentType || duplicating || deleting) return;
		const type = contentType;
		duplicating = true;
		try {
			// `record` sale de `readyPage.items`, que es `$state`: un proxy reactivo. `duplicateInput`
			// clona cada valor con `structuredClone`, que sobre un proxy lanza `DataCloneError` (medido
			// en e2e: «No se pudo duplicar» sin ningún VegaError detrás). Se pasa la instantánea plana.
			// `as unknown`: `Snapshot<VegaRecord>` recursivo sobre `JsonValue` desborda a TypeScript
			// («excessively deep»); el valor en runtime es el mismo registro, ya sin proxy.
			const snapshot = $state.snapshot(record as unknown) as VegaRecord;
			const created = await duplicateRecord(ctx.port, type, snapshot, ctx.model.types);
			ctx.feedback.toast(ctx.t('list.duplicate.success', { label }), { kind: 'success' });
			if (page.params.type !== type.name) return;
			ctx.nav.toRecord(type.name, created.id);
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError
					? err
					: VegaError.backend(ctx.t('list.duplicate.error', { label }), err)
			);
		} finally {
			duplicating = false;
		}
	}

	// ————— Cabecera en estrecho (Lote 12, lámina 6) —————
	// `narrow` sigue a `matchMedia('(max-width: 640px)')`, el mismo corte en el que `RecordTable`
	// pasa el estado bajo el título. En SSR o sin `matchMedia` (jsdom) queda en ancho.
	let narrow = $state(false);
	$effect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
		const query = window.matchMedia('(max-width: 640px)');
		const sync = (): void => {
			narrow = query.matches;
		};
		sync();
		query.addEventListener('change', sync);
		return () => query.removeEventListener('change', sync);
	});

	// ————— Exportar (`#lote-esquema`, Fase 1) —————
	// `true` mientras `ExportDialog` está abierto; la única condición que lo monta más abajo
	// (mismo patrón que `pendingDelete !== null` para `DeleteConfirm`).
	let exportOpen = $state(false);

	// ————— Importar (`#lote-esquema`, Fase 2) —————
	// `true` mientras `ImportDialog` está abierto. `canImport` (§4.3 del contrato: "sin
	// `explicitRecordId` el import no se ofrece, fallo cerrado") repite el mismo criterio de
	// defensa en profundidad que `reorderable`/el resto del `#lote-shell`: se comprueba aquí
	// aunque en la práctica un tipo sin `permissions.create`/`update` ya no debería llegar con la
	// capability activa por otra vía. `permissions.create || permissions.update` (no solo create,
	// a diferencia de "Nueva"): un import puede limitarse a PISAR registros existentes en una
	// colección donde crear está vedado pero editar no.
	let importOpen = $state(false);
	const canImport = $derived(
		contentType !== null &&
			(contentType.permissions.create || contentType.permissions.update) &&
			ctx.port.capabilities.explicitRecordId
	);

	/** Qué pinta la cabecera y cómo (`planHeaderActions`, ver cabecera del fichero): «Exportar» va
	 *  por `permissions.list` (visible también en tipos `readonly`: exportar lo ya existente no
	 *  exige poder escribir), «Importar» por `canImport`, «Crear» por `canCreateManually`. */
	const headerPlan = $derived(
		planHeaderActions({
			narrow,
			canCreate: contentType ? canCreateManually(contentType) : false,
			canExport: contentType?.permissions.list ?? false,
			canImport
		})
	);

	/** Entradas del menú «Más» (estrecho, ≥ 2 secundarias): cada una abre el mismo diálogo de hoy;
	 *  al cerrarlo, el foco vuelve a «Más» (lo restaura el propio diálogo sobre el disparador). */
	const moreItems = $derived<ActionMenuItem[]>(
		headerPlan.secondary.map((action) =>
			action === 'export'
				? {
						id: 'export',
						label: ctx.t('list.export.button'),
						action: 'export',
						onSelect: () => (exportOpen = true)
					}
				: {
						id: 'import',
						label: ctx.t('list.import.button'),
						action: 'import',
						onSelect: () => (importOpen = true)
					}
		)
	);

	// Cierra los dos diálogos si `typeParam` cambia con alguno abierto (fix de code-review): este
	// componente de ruta NO se remonta al navegar de una colección a otra (solo cambia `[type]`),
	// así que sin esto un atrás del navegador o el buscador global (su atajo "/" no pasa por el
	// `stopPropagation` de `ExportDialog`/`ImportDialog`) dejaría el diálogo abierto mientras
	// `contentType` cambia por debajo — incluso a un tipo sin `permissions.list`. No es una fuga
	// real (el backend reaplica la regla igual), pero rompe la invariante "el gate está en TODOS
	// los caminos" que este `#lote-shell` ya tuvo que parchear varias veces; cerrarlo aquí la
	// restablece sin que ninguno de los dos diálogos necesite saber nada de rutas. `ImportDialog`
	// procesa el fichero cargado independientemente del `type` de la ruta (ver su cabecera), así
	// que cerrarlo aquí es solo higiene de navegación, no una regla de permiso sobre SU contenido.
	$effect(() => {
		void typeParam;
		exportOpen = false;
		importOpen = false;
	});

	/** Construye la URL del listado para `params` y navega (D-P4.9). Núcleo compartido de
	 *  `goToPage` (paginación de 4c, NO resetea nada) y `navigateView` (búsqueda/filtro/orden de
	 *  4d, SIEMPRE resetea a página 1) — ninguna de las dos duplica el `goto`/`listRoute`. */
	function navigate(
		type: ResolvedContentType,
		params: URLSearchParams,
		options?: Parameters<typeof goto>[1]
	): void {
		const qs = params.toString();
		void goto(`${listRoute(type.name)}${qs ? `?${qs}` : ''}`, options);
	}

	/** Navega a `targetPage` conservando el resto del `ViewState` (D-P4.9, L-P4.13). Guardado tras
	 *  `routerReady` (P3-L9): en la práctica un click de usuario solo puede ocurrir ya hidratado,
	 *  pero se guarda igual por consistencia con el resto de navegación programática del shell. */
	function goToPage(target: number): void {
		if (!routerReady || !contentType) return;
		navigate(contentType, viewStateToParams({ ...viewState, page: target }));
	}

	/** Navega aplicando `patch` sobre el `viewState` actual y RESETEANDO `page` a 1 (D-P4.3/
	 *  D-P4.4/D-P4.6): un filtro/búsqueda/orden nuevo siempre debe llevar a la primera página — a
	 *  diferencia de `goToPage`, que no toca nada más. Es el único punto de navegación que usan
	 *  `ListToolbar` (búsqueda/estado), la cabecera ordenable de `RecordTable` y la acción "Limpiar
	 *  filtros" del estado `empty-search`. Guardado tras `routerReady` (P3-L9). */
	function navigateView(patch: ViewStatePatch): void {
		if (!routerReady || !contentType) return;
		// Búsqueda, filtro y orden REFINAN la vista, no son un sitio nuevo al que volver: `keepFocus`
		// (sin él, a los 300 ms de teclear el foco se iba al <body> y una «n» abría «Nueva entrada»),
		// `noScroll` y `replaceState` (cada tecla del buscador añadía una entrada al historial).
		navigate(contentType, viewStateToParams({ ...viewState, ...patch, page: 1 }), {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	// Página fuera de rango (fix de code-review, L-P4.13): en vez de un callejón sin salida
	// (`empty-collection` con datos reales en otra página y sin paginación para volver),
	// redirige a la última página válida — el usuario aterriza en datos reales, con paginación.
	// Un solo redirect: tras `goToPage(totalPages)` la recarga trae `items.length > 0` y
	// `pageOutOfRange` vuelve a `false`, así que el efecto no vuelve a disparar.
	$effect(() => {
		if (!routerReady || !readyPage || !pageOutOfRange) return;
		goToPage(readyPage.totalPages);
	});

	// Atajo `N` → "Nueva entrada" (R2 del rediseño C2, mockup `.btn.primary kbd`): mismo guard que
	// `GlobalSearch.handleGlobalKeydown` (ignora con Cmd/Ctrl/Alt o dentro de un campo editable,
	// vía el helper compartido `$lib/shell/keyboard`). Ausente para tipos `readonly`/`singleton`
	// (nunca ofrecen "Nueva"), coherente con el botón.
	$effect(() => {
		const type = contentType;
		// `canCreateManually` compone permisos y ocultación: el atajo nunca
		// existe si el botón "Nueva" tampoco.
		if (!type || !canCreateManually(type) || type.singleton) return;
		const typeName = type.name; // capturado como string plano: el closure de abajo no depende
		// del estrechamiento de `type` (`function` con nombre, no una flecha — TS no lo preserva).
		const handleKeydown = (event: KeyboardEvent): void => {
			handleNewRecordKeydown(
				event,
				typeName,
				() => pendingDelete !== null,
				(name) => ctx.nav.toNew(name)
			);
		};
		document.addEventListener('keydown', handleKeydown);
		return () => document.removeEventListener('keydown', handleKeydown);
	});
</script>

{#if !contentType}
	<RouteState
		kind="not-found"
		title={ctx.t('errors.notFoundType.title')}
		body={ctx.t('errors.notFoundType.body', { type: typeParam })}
		action={{ label: ctx.t('errors.backToIndex'), onClick: () => ctx.nav.toIndex() }}
	/>
	<!-- Las reglas del backend no dejan LISTAR esta colección con esta sesión (`#lote-shell`): no
	     está en la navegación, pero la ruta sigue existiendo (URL guardada, enlace de otra pestaña)
	     y aquí se dice por qué, en vez de dejar que el listado muera en un 403 sin explicación. -->
{:else if !contentType.permissions.list}
	<RouteState
		kind="forbidden"
		title={ctx.t('errors.forbidden.title')}
		body={ctx.t('errors.forbidden.noList.body', { label: contentType.label })}
		action={{ label: ctx.t('errors.backToIndex'), onClick: () => ctx.nav.toIndex() }}
	/>
{:else if contentType.singleton}
	<!-- La resolución de singleton está en vuelo (o a punto de arrancar tras router-ready): nunca
	     se pinta el listado para un singleton (§3.3). `aria-live` por consistencia con el estado de
	     carga global de `+layout.svelte`. -->
	<p aria-live="polite">{ctx.t('common.loading')}</p>
{:else}
	<div class="vega-list-page">
		<!-- Cabecera de listado (R2 del rediseño C2, mockup `.listhead`): h1 + meta + spacer +
		     "Exportar"/"Nueva" en la MISMA fila (flex-wrap: en viewports estrechos, bajan de línea
		     antes que desbordar). Desde M6 el filtro de estado YA NO vive aquí — se muda a la fila
		     de la toolbar, mockup `.toolbar`, ver más abajo. -->
		<div class="vega-list-header">
			<!-- `tabindex="-1"` (fix de code-review de 4e): destino de foco programático de
			     `DeleteConfirm.fallbackFocusEl` tras un borrado con éxito, nunca alcanzable por Tab. -->
			<h1 tabindex="-1" bind:this={headingEl}>{contentType.label}</h1>
			{#if contentType.readonly}
				<span class="vega-list-readonly-badge">{ctx.t('nav.readonlyBadge')}</span>
			{/if}
			<!-- Resumen "N registros · M filtros" (M2, G7 del mockup): solo con la página cargada,
			     los números vienen del propio listado (nunca inventados durante loading/error). -->
			{#if readyPage}
				<span class="vega-list-meta">
					<b>{readyPage.totalItems}</b>
					{ctx.t('list.meta.records')} ·
					<b>{activeFilterCount}</b>
					{ctx.t('list.meta.filters')}
				</span>
			{/if}
			<span class="vega-list-header-spacer"></span>
			<!-- Acciones de la cabecera (Lote 12, lámina 6; `headerPlan`, ver cabecera del fichero).
			     En ANCHO, los tres botones de siempre en su orden: Exportar, Importar, Crear. En
			     ESTRECHO, «Crear» primero y las secundarias en «Más» (o un botón suelto si solo hay
			     una). Se pinta UNA rama según el ancho, nunca se reordena con CSS. -->
			<div
				class="vega-list-header-actions"
				class:vega-list-header-actions--narrow={headerPlan.layout === 'narrow'}
			>
				{#if headerPlan.layout === 'narrow' && headerPlan.create}
					{@render createButton()}
				{/if}
				{#if headerPlan.secondaryAs === 'buttons'}
					{#each headerPlan.secondary as action (action)}
						{#if action === 'export'}
							<!-- "Exportar" (M2, G4 del mockup; activado en `#lote-esquema` Fase 1): gate por
							     `permissions.list`, visible también en tipos `readonly` (a diferencia de
							     "Nueva" — exportar lo ya existente no exige poder escribir). -->
							<button
								type="button"
								class="vega-list-export-button"
								onclick={() => (exportOpen = true)}
							>
								{ctx.t('list.export.button')}
							</button>
						{:else}
							<!-- "Importar" (`#lote-esquema`, Fase 2): gate por permiso de ESCRITURA
							     (create/update, ver `canImport` arriba) + `capabilities.explicitRecordId`
							     (fallo cerrado, §4.3 del contrato). A diferencia de "Exportar", nunca se
							     ofrece en un tipo `readonly` — importar ESCRIBE. -->
							<button
								type="button"
								class="vega-list-import-button"
								onclick={() => (importOpen = true)}
							>
								{ctx.t('list.import.button')}
							</button>
						{/if}
					{/each}
				{/if}
				{#if headerPlan.layout === 'wide' && headerPlan.create}
					{@render createButton()}
				{/if}
				{#if headerPlan.secondaryAs === 'menu'}
					<!-- «Más» (estado 6.1 de la lámina): el disparador y la tarjeta de «Filtrar», con el
					     menú alineado a la derecha porque es el último botón de la fila. -->
					<ActionMenu
						id="vega-list-more-menu"
						label={ctx.t('list.more.label')}
						triggerText={ctx.t('list.more.trigger')}
						items={moreItems}
					/>
				{/if}
			</div>
		</div>

		<!-- Toolbar (Fase 4d + M6, mockup `.toolbar`): búsqueda + menú "Filtrar" (`ListToolbar`) +
		     chips de filtro ACTIVO removibles (`ActiveFilterChips`, reabre R2) + "Limpiar filtros"
		     (solo con algún filtro/búsqueda activo, mismo `navigateView` que el de `empty-search`
		     más abajo). Sigue FUERA del switch de `listStatus`: solo depende de `contentType`/
		     `viewState` (URL), no de si la carga está en curso, en error o vacía — se mantiene
		     usable (y refleja el deep-link, L-P4.13) en cualquier estado. -->
		<div class="vega-list-toolbar">
			<ListToolbar
				{contentType}
				{viewState}
				onSearch={(q) => navigateView({ q })}
				onStatusChange={(status) => navigateView({ status })}
			/>
			<ActiveFilterChips
				{contentType}
				activeStatus={viewState.status}
				onStatusChange={(status) => navigateView({ status })}
			/>
			{#if hasActiveFilters}
				<button
					type="button"
					class="vega-list-clear-filters"
					onclick={() => navigateView({ q: '', status: null })}
				>
					{ctx.t('list.filter.clearAll')}
				</button>
			{/if}
		</div>

		<!-- Tarjeta "cabina" C2 (mockup `.grid`): tabla + gridfoot DENTRO del mismo marco
		     redondeado (R4 del rediseño) — antes cada uno llevaba su propio borde/sombra.
		     `overflow: hidden` aquí + `overflow-x: auto` en el wrapper interno de `RecordTable`
		     (que sigue siendo el que scrollea, ver su cabecera): las esquinas quedan limpias y el
		     scroll horizontal de tablas anchas (L-P4.2/Audit H1) no se pierde. -->
		<div class="vega-list-card">
			{#if listStatus.kind === 'loading'}
				<p class="vega-list-card-pad" data-list-state="loading" aria-live="polite">
					{ctx.t('common.loading')}
				</p>
			{:else if listStatus.kind === 'error'}
				<div class="vega-list-error vega-list-card-pad" data-list-state="error" role="alert">
					<h2>{ctx.t('list.error.title')}</h2>
					<p>{ctx.t('list.error.body', { message: vegaErrorMessage(listStatus.error, ctx.t) })}</p>
					{#if listStatus.error.retryable}
						<button type="button" onclick={() => listState.retry()}>
							{ctx.t('common.retry')}
						</button>
					{/if}
				</div>
			{:else if pageOutOfRange}
				<!-- Página fuera de rango (fix de code-review, L-P4.13): el `$effect` de arriba ya
				     disparó `goToPage(totalPages)`; mientras esa recarga está en vuelo, un estado de
				     carga honesto — nunca el vacío-colección (habría datos reales en otra página). -->
				<p class="vega-list-card-pad" data-list-state="loading" aria-live="polite">
					{ctx.t('common.loading')}
				</p>
			{:else if isEmpty && hasActiveFilters}
				<!-- Vacío-búsqueda (L-P4.12): 0 resultados CON búsqueda o filtro de estado activos. NO es
				     la colección vacía de verdad (podría tener registros que la búsqueda/filtro descartan) —
				     por eso NUNCA la CTA "Crear" aquí, sino "Limpiar filtros" (resetea `q`/`status`, vuelve
				     a página 1 vía `navigateView`). -->
				<div class="vega-list-empty vega-list-card-pad" data-list-state="empty-search">
					<span class="vega-list-empty-glyph" aria-hidden="true"
						><Icon id="search" size={20} /></span
					>
					<h2>{ctx.t('list.emptySearch.title')}</h2>
					<p>{ctx.t('list.emptySearch.body', { label: contentType.label })}</p>
					<button type="button" onclick={() => navigateView({ q: '', status: null })}>
						{ctx.t('list.emptySearch.clear')}
					</button>
				</div>
			{:else if isEmpty}
				<div class="vega-list-empty vega-list-card-pad" data-list-state="empty-collection">
					<span class="vega-list-empty-glyph" aria-hidden="true"
						><Icon id="document" size={20} /></span
					>
					<h2>{ctx.t('list.empty.title')}</h2>
					<!-- UNA sola llamada a crear: el botón «Nuevo» de la cabecera. El texto lo nombra, sin
					     repetir un segundo botón aquí. -->
					<p>
						{canCreateManually(contentType)
							? ctx.t('list.empty.body', { label: contentType.labelSingular })
							: contentType.hideCreate && contentType.permissions.create
								? ctx.t('errors.creationUnavailable.body')
								: ctx.t('list.empty.bodyReadonly', { label: contentType.label })}
					</p>
				</div>
			{:else if readyPage}
				<div data-list-state="ready" aria-busy={listState.refreshing}>
					<RecordTable
						{contentType}
						{columns}
						records={readyPage.items}
						sort={effectiveSort}
						onSort={(field) =>
							navigateView({ sort: cycleSort(viewState.sort, field, contentType.defaultSort) })}
						onDeleteRequest={requestDelete}
						onDuplicateRequest={canDuplicate ? requestDuplicate : undefined}
						{reorderable}
						onReorder={handleReorder}
					/>
					<Pagination
						page={readyPage.page}
						totalPages={readyPage.totalPages}
						totalItems={readyPage.totalItems}
						perPage={DEFAULT_PER_PAGE}
						onPrev={() => goToPage(readyPage.page - 1)}
						onNext={() => goToPage(readyPage.page + 1)}
					/>
				</div>
			{/if}
		</div>
	</div>
{/if}

{#snippet createButton()}
	<!-- La cabecera usa `canCreateManually`, igual que el atajo y el estado vacío.
	     El rótulo completo sigue siendo accesible aunque se recorte en estrecho. -->
	{#if contentType}
		<button
			type="button"
			class="vega-list-new-button"
			onclick={() => ctx.nav.toNew(contentType.name)}
		>
			<Icon id="plus" size={14} />
			<span>{ctx.t('list.new.button', { label: contentType.labelSingular })}</span>
			<!-- Hint de atajo oculto VISUALMENTE (mockup `.btn.primary`, sin `<kbd>`): ya iba
			     `aria-hidden` (decorativo, nunca anunciado a lectores de pantalla), así que ocultarlo
			     con CSS no quita nada al atajo REAL — el listener de `N` sigue vivo en el `$effect`
			     de arriba, independiente de este `<kbd>`. -->
			<kbd aria-hidden="true">N</kbd>
		</button>
	{/if}
{/snippet}

<DeleteConfirm
	open={pendingDelete !== null}
	recordLabel={pendingDelete?.label ?? ''}
	targetCollection={contentType?.name ?? ''}
	targetId={pendingDelete?.record.id ?? null}
	{deleting}
	fallbackFocusEl={headingEl}
	hasFiles={pendingDelete !== null &&
		contentType !== null &&
		hasFileValues(contentType.schema.fields, pendingDelete.record.values)}
	onConfirm={confirmDelete}
	onCancel={cancelDelete}
/>

{#if contentType}
	<ExportDialog
		open={exportOpen}
		{contentType}
		{viewState}
		{hasActiveFilters}
		onClose={() => (exportOpen = false)}
	/>
{/if}

<ImportDialog
	open={importOpen}
	onClose={() => (importOpen = false)}
	onImported={() => listState.reload()}
/>

<style>
	.vega-list-page {
		display: flex;
		flex-direction: column;
		gap: var(--vega-space-gutter);
	}

	/* Cabecera de listado (R2, mockup `.listhead`): flex-wrap para que en viewports estrechos los
	   chips/botón bajen de línea en vez de desbordar horizontalmente. */
	.vega-list-header {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.vega-list-header h1 {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 700;
		color: var(--ink-hi);
		letter-spacing: -0.01em;
	}

	.vega-list-header-spacer {
		flex: 1;
	}

	/* Acciones de la cabecera agrupadas (lámina 6): en ancho son los tres botones de hoy, en el mismo
	   orden y con la misma separación (el `gap` de `.vega-list-header`). */
	.vega-list-header-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
	}

	/* Estrecho (≤ 640 px, decidido por `matchMedia`, no por `@media`: se pinta UNA rama): el grupo
	   ocupa su propia línea, sin partir; «Crear» ocupa lo que sobra y recorta su rótulo antes que
	   empujar a «Más» fuera. */
	.vega-list-header-actions--narrow {
		flex-basis: 100%;
		flex-wrap: nowrap;
		gap: 0.6rem;
		min-width: 0;
		max-width: 100%;
	}

	.vega-list-header-actions--narrow .vega-list-new-button {
		flex: 1;
		min-width: 0;
		justify-content: center;
	}

	.vega-list-header-actions--narrow .vega-list-new-button span {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Objetivos táctiles de 44 px (lámina 6: «Crear», «Exportar» e «Importar» medían 31 px también
	   en móvil). Con ratón no cambia nada. */
	@media (pointer: coarse) {
		.vega-list-new-button,
		.vega-list-export-button,
		.vega-list-import-button {
			min-height: 44px;
		}
	}

	/* Toolbar (Fase 4d + M6, mockup `.toolbar`): búsqueda + menú "Filtrar" + chips de filtro
	   activo + "Limpiar filtros" en la misma fila, con el mismo `flex-wrap` que la cabecera. */
	.vega-list-toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	/* "Limpiar filtros" (mockup `.clear-filters`): enlace de texto discreto, mismo tratamiento
	   que su homólogo del estado vacío-búsqueda (`.vega-list-empty button`), pero sin marco de
	   botón — aquí conviene MENOS peso visual porque convive con controles reales de la toolbar. */
	.vega-list-clear-filters {
		border: 0;
		background: transparent;
		padding: 0;
		color: var(--ink-2);
		font-size: 0.85rem;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		white-space: nowrap;
	}

	.vega-list-clear-filters:hover {
		color: var(--ink-hi);
	}

	/* Resumen "N registros · M filtros" (M2, mockup `.page-head .meta`). */
	.vega-list-meta {
		color: var(--ink-2);
		font-size: 0.9rem;
		white-space: nowrap;
	}

	.vega-list-meta b {
		font-family: var(--mono);
		font-weight: 500;
	}

	/* "Exportar" (M2, mockup `.btn`, no primario — mismo tratamiento neutro que el resto de
	   botones secundarios del rediseño). STUB visual, ver cabecera del fichero. */
	.vega-list-export-button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid var(--line);
		background: var(--btn);
		color: var(--ink);
		border-radius: var(--r);
		padding: 0.45rem 1rem;
		font-size: 0.8125rem;
		font-weight: 550;
		cursor: pointer;
		white-space: nowrap;
	}

	.vega-list-export-button:hover {
		border-color: var(--line-strong);
	}

	/* "Importar" (`#lote-esquema`, Fase 2): mismo tratamiento neutro que "Exportar", contiguo en la
	   misma fila. */
	.vega-list-import-button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid var(--line);
		background: var(--btn);
		color: var(--ink);
		border-radius: var(--r);
		padding: 0.45rem 1rem;
		font-size: 0.8125rem;
		font-weight: 550;
		cursor: pointer;
		white-space: nowrap;
	}

	.vega-list-import-button:hover {
		border-color: var(--line-strong);
	}

	.vega-list-readonly-badge {
		flex-shrink: 0;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 0.7rem;
		white-space: nowrap;
		color: var(--ink-2);
	}

	/* Botón primario "Nueva {label}" (mockup `.btn.primary`, "+ Nueva entrada"): relleno
	   `--accent-fill` (gradiente en los temas ricos, acento sólido en los planos — MISMA firma
	   que `.vega-editor-save-button` de `RecordForm.svelte`/`.vega-list-new-button` de siempre,
	   nunca `--sheen`, que es solo trazo). Hover = anillo de `--accent-line` en vez de oscurecer
	   el relleno (un `background` sólido de hover no tiene sentido sobre un gradiente). */
	.vega-list-new-button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid transparent;
		background: var(--accent-fill);
		color: var(--accent-ink);
		border-radius: var(--r);
		padding: 0.45rem 1rem;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.vega-list-new-button:hover {
		box-shadow: 0 0 0 1.5px var(--accent-line);
	}

	/* Hint de atajo "N": oculto VISUALMENTE (mockup sin `<kbd>`, ver el marcado) — el `<kbd>`
	   sigue en el DOM (por si en el futuro alguna auditoría a11y quiere mostrarlo de nuevo) pero
	   ya era `aria-hidden` (decorativo puro), así que `display: none` no le quita nada a ningún
	   lector de pantalla; el atajo de teclado real vive en el `$effect` de arriba, ajeno a este
	   elemento. */
	.vega-list-new-button kbd {
		display: none;
	}

	/* Tarjeta "cabina" (mockup final `aquelarre-dark.html` `.table-card`): tabla + gridfoot en un
	   único marco redondeado — `overflow: hidden` recorta las esquinas de ambos hijos sin necesidad
	   de que cada uno declare su propio radio. Fondo `--paper` (la superficie de tarjeta elevada del
	   sistema; `--surface`/`--surface-2` se reservan para controles internos — inputs, botones,
	   chips), no `--surface` (más claro) como calcaba un mockup intermedio ya superado. */
	.vega-list-card {
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--paper);
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}

	/* Padding propio SOLO para los estados no-tabulares (loading/error/vacío): `RecordTable`/
	   `Pagination` traen el suyo, este NUNCA se aplica a `[data-list-state="ready"]`. */
	.vega-list-card-pad {
		padding: 2rem 1.5rem;
		margin: 0;
	}

	/* Solo el `<p>` de "Cargando…" es texto plano suelto (sin `h2`/`p` propios que colorear por
	   separado, a diferencia de `.vega-list-error`/`.vega-list-empty`). */
	p.vega-list-card-pad {
		color: var(--ink-2);
	}

	.vega-list-error,
	.vega-list-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		max-width: 32rem;
	}

	/* Glifo del estado vacío (mockup `.empty .glyph`, ENRIQUECIDO): disco --accent-soft en vez de
	   flotar sin fondo — un poco de marca tenue en el hueco que antes era puro texto gris. */
	.vega-list-empty-glyph {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent-text);
	}

	.vega-list-error h2,
	.vega-list-empty h2 {
		margin: 0;
		font-size: 1rem;
	}

	.vega-list-error p,
	.vega-list-empty p {
		margin: 0;
	}

	.vega-list-error button,
	.vega-list-empty button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		cursor: pointer;
	}
</style>
