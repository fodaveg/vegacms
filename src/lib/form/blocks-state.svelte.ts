/**
 * Estado + mutaciones de la lista embebida de bloques de un registro (capacidad `blocks`, lote
 * "editor" Fase A, `ResolvedBlocksConfig`): "una landing es una secuencia de secciones, y
 * PocketBase no tiene repeaters" (enunciado del lote). Extraído de `RecordBlocks.svelte` para que
 * el editor visual (`$lib/visual/VisualEditorScreen.svelte`, otra presentación sobre EL MISMO
 * árbol de bloques) pueda MONTAR esta fábrica sin duplicar un segundo camino de escritura — dos
 * escritores del mismo estado ya se pisaron en silencio una vez en este repo (el manifiesto de
 * `/settings`); un solo dueño del estado, tantas presentaciones como hagan falta.
 *
 * **Se carga y se muta a sí mismo** contra `ctx.port`, sin pasar por el `onSubmit` del `RecordForm`
 * padre. Motivo (ver también la cabecera de `BlockEditor.svelte`): `RecordInput`/`onSubmit` del
 * padre son de UN registro (§4.3 del contrato de backend); escribir varios registros de una
 * colección distinta en el mismo envío rompería ese contrato. El padre (`RecordForm`, vía
 * `RecordBlocks`) solo necesita saber SI hay algo sucio aquí abajo (`onDirtyChange`), no CÓMO se
 * guarda.
 *
 * **Decisión 1 — cuándo se persiste el reorden (enunciado del lote, a justificar en código)**:
 * inmediato, al soltar o al mover con teclado — NUNCA diferido al guardado del padre. Motivos:
 * (a) es el ÚNICO precedente real en el repo (`RecordTable.svelte`/`computeReorder`, el reorder
 * de listado ya escribe al soltar); reinventar un segundo modelo de persistencia para el mismo
 * gesto sería inconsistente sin necesidad. (b) Diferir exigiría que ESTE módulo mantuviera un
 * `orderField` "sucio" por bloque desacoplado de sus propios registros — exactamente el tipo de
 * estado paralelo que `dirty.ts` evita para el registro padre (compara contra un `baseline`
 * inmutable); replicarlo aquí solo para el reorden no gana nada, porque el reorden no comparte
 * ninguna otra pieza de estado con el padre. (c) Es la operación MÁS barata y MÁS reversible de
 * las tres (crear/reordenar/borrar): si el resultado no gusta, se vuelve a arrastrar — mismo
 * contrato de "reversible arrastrando otra vez" que ya tiene el listado, no una regresión.
 * El precio, honesto: no participa del "descartar cambios" del formulario padre (como tampoco
 * participa el reorder del listado). Ver `handleReorder`: se auto-corrige recargando si la
 * escritura falla a medias.
 *
 * **Decisión 2 — guard de cambios sin guardar (`dirty.ts`)**: un bloque EXPANDIDO con ediciones de
 * campo propias sin guardar (`BlockEditor`, que reusa `dirty.ts`/`isDirty` sobre SU PROPIO
 * baseline) cuenta como "sucio" para el padre. `setDirty` mantiene el conjunto de ids sucios y el
 * agregado ("¿hay AL MENOS uno?") sube por `onDirtyChange` hasta `RecordForm`, que lo OR-ea con su
 * propio `isDirty(baseline, current)` — así el guard de salida (`beforeNavigate`/`beforeunload`) y
 * el punto "sin guardar" de la barra ven el estado real aunque el campo que cambió no sea del
 * registro padre. Reordenar/crear/borrar NUNCA marcan sucio (decisión 1: ya están persistidos en
 * el momento en que ocurren).
 *
 * **Reactividad de props sin Svelte "de verdad"**: este módulo se instancia una vez, en el
 * `<script>` de nivel superior de quien lo monta (mismo requisito que cualquier composable de
 * runas: el `$effect` de más abajo necesita el contexto de efecto del componente, así que
 * `createBlocksState` debe llamarse SÍNCRONAMENTE durante la inicialización). `parentId`/`disabled`
 * llegan como GETTERS (`getParentId`/`getDisabled`), no como valores — igual que un `let { x } =
 * $props()` desestructurado ES, bajo el compilador de Svelte 5, un getter: cada lectura (incluso
 * tras un `await`, dentro de una mutación en vuelo) devuelve el valor VIVO en ese instante, nunca
 * una foto capturada al invocar la mutación. Es la misma propiedad que ya explotaba el componente
 * original al leer sus props directamente desde cualquier punto de una función async.
 *
 * **Anuncio de la selección (encargo de accesibilidad del editor visual, D3).** Antes de esta
 * tarea, `announce` solo lo escribía `handleReorder` (el resultado de MOVER un bloque); seleccionar
 * uno —el gesto central del editor visual, y el que hace desde el árbol quien usa lector de
 * pantalla— no anunciaba nada. `say(text)` expone un escritor PÚBLICO del MISMO `$state`, para que
 * la selección hable por la MISMA región `aria-live` sin montar una segunda (esa región vive UNA
 * vez, en `VisualBlockTree.svelte`, ver su cabecera). Quien construye el texto (título del bloque +
 * posición) es `VisualEditorScreen.svelte#handleBlockSelect` — la puerta ÚNICA de selección, la
 * usan tanto el sitio por `postMessage` como el árbol —, no este módulo: aquí solo vive el
 * ALTAVOZ, nunca la redacción, porque el texto necesita el i18n de la pantalla (`ctx.t`) y la
 * posición dentro de `blocks.records`, dos cosas que esta fábrica ya expone pero que no le
 * corresponde recomponer en un idioma. Mismo criterio de reasignación que `handleReorder`: un
 * string NUEVO en cada llamada, incluso si el texto coincidiera con el anterior, para que el
 * lector de pantalla lo relea.
 */
import { untrack } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { RecordId, VegaRecord } from '$lib/backend/types';
import type { PreviewDraftRecord } from '$lib/backend/preview-client';
import type {
	ResolvedBlockType,
	ResolvedBlocksConfig,
	ResolvedContentType
} from '$lib/model/types';
import { VegaError } from '$lib/backend/errors';
import type { VegaAppContext } from '$lib/app-context';
import { describeCell } from '$lib/list/cell';
import { normalizeListError, RequestSequencer, resolveTitleCellText } from '$lib/list/list-load';
import { computeReorder } from '$lib/list/reorder';
import { canDuplicateBlock, duplicateInput } from '$lib/duplicate/records';

/** Estado de carga de la lista de bloques (misma forma que `ListLoadStatus`, sin el `error`
 *  tipado: el fallo aquí se pinta como "la sección desaparece", ver `hidden`). */
export type BlocksStatus =
	{ kind: 'loading' } | { kind: 'ready'; records: VegaRecord[] } | { kind: 'error' };

export interface BlocksStateOptions {
	ctx: VegaAppContext;
	/** El tipo padre que declara `blocks` (`ResolvedContentType.blocks`, ya validado por P2).
	 *  Capturado UNA VEZ (misma captura deliberada que el componente hacía con `untrack`): no
	 *  cambia tras el montaje en la práctica, la ruta remonta la presentación si cambia de tipo. */
	parentType: ResolvedContentType;
	/** `model.recordId`: `null` en `/new`. Getter — ver cabecera, "Reactividad de props". */
	getParentId: () => RecordId | null;
	/** Mutex externo del padre (p.ej. "clonando página"). Getter — mismo motivo que `getParentId`. */
	getDisabled: () => boolean;
	/** Sube a `true` en cuanto AL MENOS un bloque tenga ediciones sin guardar (decisión 2). */
	onDirtyChange: (dirty: boolean) => void;
	/** Publica la secuencia completa con cada bloque en su estado editable ACTUAL. */
	onDraftChange?: (records: PreviewDraftRecord[]) => void;
	/** Sube el mutex estructural para que el padre no clone una instantánea intermedia. */
	onBusyChange?: (busy: boolean) => void;
}

export interface BlocksState {
	readonly status: BlocksStatus;
	readonly records: VegaRecord[];
	readonly loading: boolean;
	readonly failed: boolean;
	/** La sección entera desaparece si `blocks` no resuelve tipo hijo (defensivo: P2 ya validó que
	 *  `blocksConfig.collection` existe, pero L11 manda degradar sin crashear) o si la carga falló
	 *  (misma degradación "ayuda de navegación, no contenido" que `EditorRail`). */
	readonly hidden: boolean;
	readonly blocksConfig: ResolvedBlocksConfig | null;
	readonly childType: ResolvedContentType | null;
	/** Campos estructurales del hijo (parentField + orderField + typeField): el mini-formulario
	 *  nunca los pinta, este módulo es su único escritor. */
	readonly structuralFields: readonly string[];
	readonly blockDuplicateAllowed: boolean;
	/** Hay COLUMNA de tipo: manda para las insignias de cada fila. */
	readonly hasTypeColumn: boolean;
	/** Hay MENÚ de tipos: exige además que quede al menos un tipo que ofrecer. */
	readonly hasTypeMenu: boolean;
	readonly blockTypes: readonly ResolvedBlockType[];
	readonly structuralBusy: boolean;
	readonly pendingDelete: VegaRecord | null;
	readonly deleting: boolean;
	/** Texto de la región `aria-live` (accesibilidad del reorden y, desde el encargo de
	 *  accesibilidad del editor visual D3, también de la SELECCIÓN — ver `say`). */
	readonly announce: string;
	/** `true` ⟺ al menos un bloque tiene ediciones sin guardar (agregado de decisión 2). */
	readonly anyDirty: boolean;
	readonly anySaving: boolean;

	isExpanded(id: string): boolean;
	isDirty(id: string): boolean;
	isSaving(id: string): boolean;
	isDuplicating(id: string): boolean;

	/**
	 * El tipo declarado de un bloque, leído de su COLUMNA REAL. Es el dividendo de la regla de
	 * frontera: no se parsea `data` para saber de qué tipo es una fila.
	 *
	 * `null` = la fila no dice de qué tipo es (bloque creado antes de que existiera el vocabulario,
	 * o modo homogéneo). Un valor que NO está en el vocabulario NO es lo mismo: significa que el
	 * manifiesto retiró ese tipo y el registro sigue vivo, así que se muestra el valor crudo en vez
	 * de esconderlo — el editor no puede pintar sus campos, pero el usuario tiene derecho a saber
	 * qué hay ahí antes de borrarlo.
	 */
	blockTypeOf(record: VegaRecord): ResolvedBlockType | null;
	/** El nombre crudo del tipo, para el caso "existe pero ya no está en el vocabulario". */
	blockTypeRawName(record: VegaRecord): string | null;
	blockTitle(record: VegaRecord): string;
	/** La secuencia completa con cada bloque en su estado editable ACTUAL (persistido + overrides
	 *  de `BlockEditor` sin guardar). La lista es la única autoridad sobre parent/order: un
	 *  `BlockEditor` montado conserva su snapshot editorial al reordenar, así que esos dos campos
	 *  siempre vienen del registro estructural actual, no del override. */
	currentDraftRecords(): PreviewDraftRecord[];

	/** Carga la página de bloques de `id` en `collection` (anti-carrera vía `RequestSequencer`: una
	 *  respuesta que ya no es la última emitida se descarta sin tocar `status`). Expuesta para que
	 *  el propio módulo la reuse tras un reorden a medias (ver `handleReorder`) y para poder
	 *  probarla en aislado sin depender del `$effect` de carga automática. */
	load(collection: string, id: RecordId): Promise<void>;

	/** Escritor PÚBLICO de la región `aria-live` (encargo de accesibilidad, D3): escribe el MISMO
	 *  `$state` que ya usa `handleReorder` — una sola región, dos motivos para hablar por ella. Ver
	 *  la cabecera del módulo, "Anuncio de la selección (D3)", para el porqué de exponerlo aquí en
	 *  vez de dejar que cada llamador escriba `announce` directamente (no puede: es de solo
	 *  lectura desde fuera, ver el `get announce()` de más abajo). */
	say(text: string): void;

	toggle(id: string): void;
	setDirty(id: string, dirty: boolean): void;
	setSaving(id: string, saving: boolean): void;
	handleBlockDraftChange(id: string, draft: PreviewDraftRecord): void;
	handleBlockSaved(id: string, saved: VegaRecord): void;

	handleCreate(blockType?: ResolvedBlockType | null): Promise<void>;
	handleDuplicate(record: VegaRecord): Promise<void>;
	requestDelete(record: VegaRecord): void;
	cancelDelete(): void;
	confirmDelete(): Promise<void>;
	/** Reorden (decisión 1): reflejo LOCAL inmediato del nuevo orden + persistencia de SOLO los
	 *  `{id, value}` que cambian (`computeReorder`, misma lógica que el listado) + anuncio de
	 *  posición. Si la escritura falla a medias, recarga desde el backend en vez de dejar el array
	 *  local desincronizado del `orderField` real. */
	handleReorder(fromIndex: number, toIndex: number): Promise<boolean>;
}

/** Construye el estado de bloques de UN registro padre. Debe llamarse SÍNCRONAMENTE durante la
 *  inicialización de quien monta la presentación (ver cabecera, "Reactividad de props"). */
export function createBlocksState(options: BlocksStateOptions): BlocksState {
	const { ctx, getParentId, getDisabled, onDirtyChange } = options;
	const onDraftChange = options.onDraftChange ?? (() => {});
	const onBusyChange = options.onBusyChange ?? (() => {});

	// Captura deliberada del valor inicial de `parentType` (ver cabecera del módulo): no cambia
	// tras el montaje en la práctica, y `blocksConfig`/`childType` alimentan estado que asume una
	// identidad estable durante todo el ciclo de vida (p.ej. `structuralFields`, capturado igual).
	const blocksConfig = untrack(() => options.parentType.blocks) ?? null;
	/** `undefined` no debería pasar (P2 ya validó que `blocksConfig.collection` existe,
	 *  `resolveBlocks`), pero L11 manda degradar sin crashear. */
	const childType = ctx.model.types.find((t) => t.name === blocksConfig?.collection) ?? null;
	const blockDuplicateAllowed = childType !== null && canDuplicateBlock(childType);
	/** Campos estructurales del hijo (parentField + orderField + typeField): el mini-formulario
	 *  nunca los pinta, este módulo es su único escritor. Array ESTABLE (no `$derived`):
	 *  `blocksConfig` no cambia tras la construcción (ver arriba), así que no hace falta
	 *  recalcularlo por render.
	 *
	 *  `typeField` entró aquí con el menú de tipos, y **lo exige `BlockEditor.svelte`**, que es
	 *  OTRO módulo: en cuanto el tipo se escribe en una COLUMNA REAL, dejarlo fuera de esta lista
	 *  lo pintaría como un campo de texto editable dentro del bloque, y el usuario podría teclear
	 *  un tipo que no existe en el vocabulario. El tipo se elige al crear; no se reescribe a mano.
	 *  (Este párrafo viajó con el código desde `RecordBlocks.svelte`: es la justificación de un
	 *  invariante ajeno, y sin ella nadie sabría por qué esta lista no se puede recortar.) */
	const structuralFields = blocksConfig
		? [
				blocksConfig.parentField,
				blocksConfig.orderField,
				// `typeField` es opcional (`string | null`): en modo HOMOGÉNEO no existe columna de
				// tipo y no hay nada que excluir.
				...(blocksConfig.typeField === null ? [] : [blocksConfig.typeField])
			]
		: [];

	// ————— Vocabulario de tipos de bloque —————
	const typeField = blocksConfig?.typeField ?? null;
	const blockTypes = ctx.model.blockTypes;
	const hasTypeColumn = typeField !== null;
	const hasTypeMenu = hasTypeColumn && blockTypes.length > 0;

	let status = $state<BlocksStatus>({ kind: 'loading' });
	const records = $derived(status.kind === 'ready' ? status.records : []);
	/** Overrides no persistidos publicados por cada `BlockEditor`. `SvelteMap` hace que el
	 *  `$effect` de más abajo emita tanto al cambiar un campo como al cambiar la estructura. */
	const draftOverrides = new SvelteMap<string, PreviewDraftRecord>();

	function currentDraftRecords(): PreviewDraftRecord[] {
		return records.map((record) => {
			const override = draftOverrides.get(record.id);
			const fields = { ...(override?.fields ?? record.values) };
			for (const field of structuralFields) fields[field] = record.values[field];
			return { id: record.id, fields };
		});
	}

	$effect(() => {
		onDraftChange(currentDraftRecords());
	});

	/** Ids de bloque EXPANDIDOS (fila desplegada). `SvelteSet` (reactivo POR MUTACIÓN, mismo
	 *  criterio que `MediaGrid.svelte`/`FileInput.svelte`). */
	const expandedIds = new SvelteSet<string>();
	/** Ids de bloque con ediciones sin guardar (decisión 2). Mismo criterio. */
	const dirtyIds = new SvelteSet<string>();
	const savingIds = new SvelteSet<string>();
	const duplicatingIds = new SvelteSet<string>();
	/** Mutex de TODAS las mutaciones que cambian la estructura/orden. PocketBase no ofrece una
	 *  transacción multi-registro: dos snapshots de `records` en vuelo podrían asignar el mismo
	 *  order y el último `status=` ocultaría el resultado del otro aunque ambos existieran. */
	let structuralBusy = $state(false);
	let pendingDelete = $state<VegaRecord | null>(null);
	let deleting = $state(false);
	/** Texto de la región `aria-live` (accesibilidad del reorden). Se reasigna con un string NUEVO
	 *  en cada reorden (incluso si el texto final coincidiera) para que los lectores de pantalla lo
	 *  relean — mismo patrón que cualquier `aria-live` de una sola línea. */
	let announce = $state('');

	const sequencer = new RequestSequencer();
	let loadedKey: string | null = null;
	let viewRevision = 0;

	$effect(() => {
		onBusyChange(structuralBusy || savingIds.size > 0);
	});

	interface ViewIdentity {
		key: string | null;
		parentId: RecordId | null;
		revision: number;
	}

	function captureViewIdentity(): ViewIdentity {
		return { key: loadedKey, parentId: getParentId(), revision: viewRevision };
	}

	function isCurrentView(view: ViewIdentity): boolean {
		return (
			view.revision === viewRevision && view.key === loadedKey && view.parentId === getParentId()
		);
	}

	async function load(collection: string, id: RecordId): Promise<void> {
		const seq = sequencer.next();
		status = { kind: 'loading' };
		try {
			const result = await ctx.port.list(collection, {
				filter: { kind: 'cond', field: blocksConfig!.parentField, op: 'eq', value: id },
				sort: [{ field: blocksConfig!.orderField, dir: 'asc' }],
				page: 1,
				// Sin paginación real (§ cabecera): una landing "hecha de secciones" nunca se acerca al
				// máximo del puerto; pedir directamente el máximo evita una segunda página invisible.
				perPage: 200
			});
			if (!sequencer.isLatest(seq)) return;
			status = { kind: 'ready', records: result.items };
		} catch (err) {
			if (!sequencer.isLatest(seq)) return;
			const vegaErr = normalizeListError(err);
			if (vegaErr.kind === 'auth-expired') ctx.feedback.reportError(vegaErr);
			status = { kind: 'error' };
		}
	}

	$effect(() => {
		const parentId = getParentId();
		const key =
			blocksConfig && childType && parentId !== null ? `${childType.name}:${parentId}` : null;
		if (key === loadedKey) return;
		viewRevision += 1;
		loadedKey = key;
		// Cambiar de registro padre NO remonta la presentación: `/c/[type]/[id]/+page.svelte` no
		// envuelve `RecordForm` en un `{#key}`, solo cambia props. Sin esta limpieza, el estado por
		// bloque del padre ANTERIOR sobrevive: `dirtyIds` conservaría ids de otro registro y
		// `onDirtyChange` seguiría reportando "hay cambios sin guardar" para siempre (guard de
		// salida atascado), y `expandedIds` desplegaría bloques que ya no existen aquí.
		expandedIds.clear();
		dirtyIds.clear();
		savingIds.clear();
		draftOverrides.clear();
		pendingDelete = null;
		onDirtyChange(false);
		if (key !== null && childType) void load(childType.name, parentId!);
	});

	function blockTypeOf(record: VegaRecord): ResolvedBlockType | null {
		if (typeField === null) return null;
		const raw = record.values[typeField];
		if (typeof raw !== 'string' || raw === '') return null;
		return blockTypes.find((candidate) => candidate.name === raw) ?? null;
	}

	function blockTypeRawName(record: VegaRecord): string | null {
		if (typeField === null) return null;
		const raw = record.values[typeField];
		return typeof raw === 'string' && raw !== '' ? raw : null;
	}

	function blockTitle(record: VegaRecord): string {
		if (!childType || childType.titleField === null) return ctx.t('list.untitled');
		const field = childType.fields.find((f) => f.name === childType.titleField);
		if (!field) return ctx.t('list.untitled');
		const descriptor = describeCell(field, record.values[field.name] ?? null, ctx.locale);
		return resolveTitleCellText(descriptor, ctx.t('list.untitled'));
	}

	/** Ver la interfaz (D3): reasigna `announce` con el string NUEVO recibido, sin comparar contra
	 *  el valor anterior — mismo patrón que ya documenta `handleReorder` más abajo (releer aunque
	 *  el texto coincida es justo lo que necesita un lector de pantalla para anunciarlo otra vez). */
	function say(text: string): void {
		announce = text;
	}

	function toggle(id: string): void {
		if (expandedIds.has(id)) expandedIds.delete(id);
		else expandedIds.add(id);
	}

	function setDirty(id: string, dirty: boolean): void {
		if (dirtyIds.has(id) === dirty) return; // sin cambio real, evita recalcular el agregado
		if (dirty) dirtyIds.add(id);
		else dirtyIds.delete(id);
		onDirtyChange(dirtyIds.size > 0);
	}

	function setSaving(id: string, saving: boolean): void {
		if (saving) savingIds.add(id);
		else savingIds.delete(id);
	}

	function handleBlockDraftChange(id: string, draft: PreviewDraftRecord): void {
		draftOverrides.set(id, draft);
	}

	function handleBlockSaved(id: string, saved: VegaRecord): void {
		draftOverrides.set(id, { id: saved.id, fields: { ...saved.values } });
		status =
			status.kind === 'ready'
				? { kind: 'ready', records: status.records.map((r) => (r.id === id ? saved : r)) }
				: status;
	}

	async function handleCreate(blockType: ResolvedBlockType | null = null): Promise<void> {
		const parentId = getParentId();
		if (
			!blocksConfig ||
			!childType ||
			parentId === null ||
			getDisabled() ||
			structuralBusy ||
			savingIds.size > 0
		)
			return;
		const view = captureViewIdentity();
		const sourceRecords = [...records];
		structuralBusy = true;
		try {
			const maxOrder = sourceRecords.reduce((max, r) => {
				const raw = r.values[blocksConfig.orderField];
				return typeof raw === 'number' && raw > max ? raw : max;
			}, -1);
			const created = await ctx.port.create(childType.name, {
				[blocksConfig.parentField]: view.parentId,
				[blocksConfig.orderField]: maxOrder + 1,
				// El tipo viaja a su COLUMNA REAL, no al JSON: es lo que permite que la insignia de
				// la fila, el recuento por tipo y cualquier filtro futuro salgan de una consulta
				// normal sin parsear `data`.
				...(blockType !== null && typeField !== null ? { [typeField]: blockType.name } : {})
			});
			if (!isCurrentView(view)) return;
			status = { kind: 'ready', records: [...sourceRecords, created] };
			// El bloque nuevo arranca DESPLEGADO: es lo que el usuario acaba de pedir, tiene sentido
			// que vea de inmediato sus campos para rellenarlos (mismo criterio que abrir un registro
			// recién creado en `/c/[type]/new`).
			expandedIds.add(created.id);
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('No se pudo crear el bloque', err);
			ctx.feedback.reportError(vegaErr, { action: 'blocks:create' });
		} finally {
			structuralBusy = false;
		}
	}

	async function handleDuplicate(record: VegaRecord): Promise<void> {
		const parentId = getParentId();
		if (
			!blocksConfig ||
			!childType ||
			parentId === null ||
			getDisabled() ||
			structuralBusy ||
			savingIds.size > 0 ||
			!blockDuplicateAllowed ||
			dirtyIds.size > 0
		)
			return;
		const view = captureViewIdentity();
		const sourceRecords = [...records];
		const sourceIndex = sourceRecords.findIndex((item) => item.id === record.id);
		if (sourceIndex < 0) return;
		structuralBusy = true;
		duplicatingIds.add(record.id);
		try {
			const maxOrder = sourceRecords.reduce((max, item) => {
				const raw = item.values[blocksConfig.orderField];
				return typeof raw === 'number' && raw > max ? raw : max;
			}, -1);
			const created = await ctx.port.create(
				childType.name,
				duplicateInput(childType, record, {
					[blocksConfig.parentField]: view.parentId,
					[blocksConfig.orderField]: maxOrder + 1
				})
			);
			const appended = [...sourceRecords, created];
			if (isCurrentView(view)) {
				status = { kind: 'ready', records: appended };
				expandedIds.add(created.id);
			}
			const reordered = await reorderWithView(
				view,
				appended,
				appended.length - 1,
				sourceIndex + 1,
				true
			);
			if (reordered && isCurrentView(view)) {
				ctx.feedback.toast(ctx.t('editor.blocks.duplicateSuccess'), { kind: 'success' });
			}
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('No se pudo duplicar el bloque', err);
			ctx.feedback.reportError(vegaErr, { action: 'blocks:duplicate' });
		} finally {
			duplicatingIds.delete(record.id);
			structuralBusy = false;
		}
	}

	function requestDelete(record: VegaRecord): void {
		pendingDelete = record;
	}

	function cancelDelete(): void {
		pendingDelete = null;
	}

	async function confirmDelete(): Promise<void> {
		if (
			!blocksConfig ||
			!childType ||
			!pendingDelete ||
			getDisabled() ||
			structuralBusy ||
			savingIds.size > 0
		)
			return;
		const id = pendingDelete.id;
		const view = captureViewIdentity();
		const sourceRecords = [...records];
		structuralBusy = true;
		deleting = true;
		try {
			await ctx.port.delete(childType.name, id);
			if (!isCurrentView(view)) return;
			status = { kind: 'ready', records: sourceRecords.filter((r) => r.id !== id) };
			draftOverrides.delete(id);
			expandedIds.delete(id);
			setDirty(id, false); // un bloque borrado nunca puede seguir contando como sucio
			pendingDelete = null;
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('No se pudo borrar el bloque', err);
			ctx.feedback.reportError(vegaErr, { action: 'blocks:delete' });
		} finally {
			deleting = false;
			structuralBusy = false;
		}
	}

	/** Núcleo compartido de `handleReorder` (guard) y `handleDuplicate` (reordena la copia recién
	 *  creada reusando el `view` YA capturado al principio de la duplicación, y con el mutex
	 *  estructural que `handleDuplicate` ya sostiene — `ownsStructuralLock`). El guard de
	 *  `disabled`/`blocksConfig`/`childType` se repite SIEMPRE, incluso con `ownsStructuralLock`:
	 *  `getDisabled()` puede haber cambiado entre que `handleDuplicate` empezó y el `await
	 *  ctx.port.create` de más arriba resolvió (mismo motivo que capturar `view` por adelantado). */
	async function reorderWithView(
		view: ViewIdentity,
		sourceRecords: readonly VegaRecord[],
		fromIndex: number,
		toIndex: number,
		ownsStructuralLock: boolean
	): Promise<boolean> {
		if (
			!blocksConfig ||
			!childType ||
			getDisabled() ||
			(structuralBusy && !ownsStructuralLock) ||
			(savingIds.size > 0 && !ownsStructuralLock) ||
			(dirtyIds.size > 0 && !ownsStructuralLock)
		)
			return false;
		if (!ownsStructuralLock) structuralBusy = true;
		const orderedIds = sourceRecords.map((r) => r.id);
		const currentValues = Object.fromEntries(
			sourceRecords.map((r) => {
				const raw = r.values[blocksConfig!.orderField];
				return [r.id, typeof raw === 'number' ? raw : 0];
			})
		);
		const updates = computeReorder(orderedIds, currentValues, fromIndex, toIndex);
		if (updates.length === 0) {
			if (!ownsStructuralLock) structuralBusy = false;
			return true;
		}

		const reordered = [...sourceRecords];
		const [moved] = reordered.splice(fromIndex, 1);
		reordered.splice(toIndex, 0, moved);
		if (isCurrentView(view)) {
			status = { kind: 'ready', records: reordered };
			announce = ctx.t('editor.blocks.reorder.moved', {
				label: blockTitle(moved),
				position: toIndex + 1,
				total: reordered.length
			});
		}

		try {
			await Promise.all(
				updates.map((u) =>
					ctx.port.update(childType!.name, u.id, { [blocksConfig!.orderField]: u.value })
				)
			);
			// `Map` normal, como en la versión anterior a la extracción: tabla de consulta local y de
			// usar-y-tirar (solo `.has`/`.get`, nunca mutada, nunca leída desde un contexto
			// reactivo). `svelte/prefer-svelte-reactivity` no distingue "constructor puntual" de
			// "estado mutado" y la marca al vivir en un `.svelte.ts`; cambiarla a `SvelteMap` metería
			// un proxy en cada reorden sin comprar nada, y este refactor no cambia comportamiento.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- ver arriba
			const byId = new Map(updates.map((u) => [u.id, u.value]));
			if (isCurrentView(view)) {
				status = {
					kind: 'ready',
					records: reordered.map((r) =>
						byId.has(r.id)
							? { ...r, values: { ...r.values, [blocksConfig!.orderField]: byId.get(r.id)! } }
							: r
					)
				};
			}
			return true;
		} catch (err) {
			const vegaErr =
				err instanceof VegaError
					? err
					: VegaError.backend('No se pudo guardar el nuevo orden', err);
			ctx.feedback.reportError(vegaErr, { action: 'blocks:reorder' });
			// El reorden NO es atómico: son N escrituras independientes y PocketBase no da
			// transacción para esto. Si falla una y otras ya se aplicaron, el backend queda a mitad
			// —y con `orderField` posiblemente REPETIDO entre dos bloques, no solo "en otro orden"—
			// hasta que este `load()` relee la verdad. Se acepta a cambio de que la divergencia
			// nunca sea silenciosa: el usuario ve el error y la lista se repinta con lo persistido.
			if (isCurrentView(view) && view.parentId !== null) {
				void load(childType!.name, view.parentId);
			}
			return false;
		} finally {
			if (!ownsStructuralLock) structuralBusy = false;
		}
	}

	async function handleReorder(fromIndex: number, toIndex: number): Promise<boolean> {
		return reorderWithView(captureViewIdentity(), records, fromIndex, toIndex, false);
	}

	return {
		get status() {
			return status;
		},
		get records() {
			return records;
		},
		get loading() {
			return status.kind === 'loading';
		},
		get failed() {
			return status.kind === 'error';
		},
		get hidden() {
			return !blocksConfig || !childType || status.kind === 'error';
		},
		blocksConfig,
		childType,
		structuralFields,
		blockDuplicateAllowed,
		hasTypeColumn,
		hasTypeMenu,
		blockTypes,
		get structuralBusy() {
			return structuralBusy;
		},
		get pendingDelete() {
			return pendingDelete;
		},
		get deleting() {
			return deleting;
		},
		get announce() {
			return announce;
		},
		get anyDirty() {
			return dirtyIds.size > 0;
		},
		get anySaving() {
			return savingIds.size > 0;
		},
		isExpanded: (id) => expandedIds.has(id),
		isDirty: (id) => dirtyIds.has(id),
		isSaving: (id) => savingIds.has(id),
		isDuplicating: (id) => duplicatingIds.has(id),
		blockTypeOf,
		blockTypeRawName,
		blockTitle,
		currentDraftRecords,
		load,
		say,
		toggle,
		setDirty,
		setSaving,
		handleBlockDraftChange,
		handleBlockSaved,
		handleCreate,
		handleDuplicate,
		requestDelete,
		cancelDelete,
		confirmDelete,
		handleReorder
	};
}
