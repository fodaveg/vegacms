/**
 * Paridad de teclado del editor visual (encargo de accesibilidad, Parte 3): "el lienzo NO puede
 * ser la única vía: quien no use ratón sigue teniendo el formulario de siempre, y eso hay que
 * verificarlo, no suponerlo". Los cuatro gestos del lienzo —seleccionar, mover, insertar, borrar—
 * tienen todos una vía de ratón (dentro del `<iframe>`, el asa `⠿`, el botón `+`, la papelera de la
 * barra flotante) Y una o varias vías de teclado, casi siempre en OTRA superficie
 * (`VisualBlockTree.svelte`) o en la propia pantalla (`VisualEditorScreen.svelte#handleVisualKeydown`).
 * Este fichero ENUMERA esas vías contra la tabla del encargo y las ACTIVA de verdad por teclado
 * (nunca `click()` a pelo salvo donde se documenta por qué), comprobando la mutación real de
 * `blocksState` — no que el botón "exista", que ya cubren `VisualBlockTree.svelte.test.ts`/
 * `VisualOverlay.svelte.test.ts` por su cuenta.
 *
 * Tres secciones, cada una con el doble MÁS BARATO que basta para su superficie (mismo criterio de
 * "doble mínimo" que el resto de tests de `$lib/visual`, nunca una superficie de más):
 * - **Árbol** (`VisualBlockTree.svelte` solo, `BlocksState` de mentira): seleccionar, mover
 *   (botones subir/bajar), insertar (Añadir), borrar (papelera + `DeleteConfirm`).
 * - **Lienzo** (`VisualOverlay.svelte` solo, `BlocksState` de mentira): mover (asa `⠿` con
 *   `ArrowUp`/`ArrowDown`, botones subir/bajar de la barra flotante), insertar (botón `+`), borrar
 *   (papelera de la barra flotante), y las DOS mediciones NEGATIVAS del encargo.
 * - **Pantalla** (`VisualEditorScreen.svelte` ENTERA, backend de memoria de verdad): las DOS únicas
 *   vías que no viven en ningún componente hijo — `Alt+↑`/`Alt+↓` y `Supr`/`Retroceso`,
 *   `handleVisualKeydown` — porque esta pantalla construye su propio `BlocksState` con
 *   `createBlocksState()` y no lo recibe como prop, así que no hay doble que sustituir.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import VisualBlockTree from './VisualBlockTree.svelte';
import VisualOverlay from './VisualOverlay.svelte';
import VisualEditorScreen from './VisualEditorScreen.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BlocksState } from '$lib/form/blocks-state.svelte';
import type { ContentType } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import type { VegaRecord } from '$lib/backend';
import type { VisualBlock } from './bridge-client';
import { createMemoryBackend, type MemoryBackendPort } from '$lib/backend/adapters/memory';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';
import { focusablesUnderAriaHidden } from './a11y-audit';

// ————— Activación por teclado, compartida por las tres secciones —————

/** Activa `el` (un `<button>` real) "por Enter/Space": jsdom no simula la activación NATIVA de esas
 *  teclas sobre un elemento nativo (mismo límite ya documentado en
 *  `VisualEditorScreen.svelte.test.ts#"el árbol es operable por teclado"`) — el navegador la
 *  dispara solo por ser un `<button>`, no es algo que la app programe. Se dispara el `keydown` de
 *  verdad (por si algún manejador lo escucha) y LUEGO `.click()`, que es la parte que jsdom sí
 *  ejecuta y que representa esa activación nativa. Lo que esta función prueba de verdad es que `el`
 *  es un control REAL, alcanzable por Tab (nunca `disabled`) y con la acción esperada detrás —no un
 *  `<div onclick>` que Tab nunca visita. */
function pressEnter(el: HTMLButtonElement): void {
	expect(el.disabled).toBe(false);
	el.focus();
	expect(document.activeElement).toBe(el);
	el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
	el.click();
}

/** `keydown` de verdad sobre `el` — para los manejadores que la propia app escribe (el asa de
 *  arrastre, la pantalla entera): aquí SÍ hace falta el evento real, no un `.click()` de reemplazo,
 *  porque `Enter`/`Space` no son las teclas que importan (`ArrowUp`/`ArrowDown`/`Delete`/…). */
function pressKey(target: EventTarget, key: string, opts: KeyboardEventInit = {}): void {
	target.dispatchEvent(
		new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts })
	);
}

/** Drena la cadena de microtasks de una mutación `async` disparada por una activación (mismo
 *  criterio que `VisualBlockTree.svelte.test.ts`/`VisualOverlay.svelte.test.ts`). */
async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await tick();
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SECCIÓN A — Árbol (`VisualBlockTree.svelte`), `BlocksState` de mentira (mismo doble que
// `VisualBlockTree.svelte.test.ts`, recortado a lo que este fichero necesita).
// ═════════════════════════════════════════════════════════════════════════════════════════════

const TREE_CHILD_TYPE = {
	label: 'Bloques',
	labelSingular: 'Bloque',
	schema: { fields: [] }
} as unknown as ResolvedContentType;

function treeRecord(id: string, heading: string): VegaRecord {
	return { id, type: 'post_block', values: { heading } };
}

interface TreeFakeOptions {
	records?: VegaRecord[];
	handleCreate?: BlocksState['handleCreate'];
	requestDelete?: BlocksState['requestDelete'];
	confirmDelete?: BlocksState['confirmDelete'];
	handleReorder?: BlocksState['handleReorder'];
	pendingDelete?: VegaRecord | null;
}

function fakeTreeBlocksState(opts: TreeFakeOptions = {}): BlocksState {
	const records = opts.records ?? [];
	return {
		status: { kind: 'ready', records },
		records,
		loading: false,
		failed: false,
		hidden: false,
		blocksConfig: null,
		childType: TREE_CHILD_TYPE,
		structuralFields: [],
		blockDuplicateAllowed: false,
		hasTypeColumn: false,
		hasTypeMenu: false,
		blockTypes: [],
		structuralBusy: false,
		pendingDelete: opts.pendingDelete ?? null,
		deleting: false,
		announce: '',
		say: () => {},
		anyDirty: false,
		anySaving: false,
		isExpanded: () => false,
		isDirty: () => false,
		isSaving: () => false,
		isDuplicating: () => false,
		blockTypeOf: () => null,
		blockTypeRawName: () => null,
		blockTitle: (r) => (r.values.heading as string) ?? '',
		currentDraftRecords: () => [],
		load: async () => {},
		toggle: () => {},
		setDirty: () => {},
		setSaving: () => {},
		handleBlockDraftChange: () => {},
		handleBlockSaved: () => {},
		handleCreate: opts.handleCreate ?? vi.fn(async () => {}),
		handleDuplicate: async () => {},
		requestDelete: opts.requestDelete ?? vi.fn(),
		cancelDelete: vi.fn(),
		confirmDelete: opts.confirmDelete ?? vi.fn(async () => {}),
		handleReorder: opts.handleReorder ?? vi.fn(async () => false)
	} satisfies BlocksState;
}

/** `model` MÍNIMO — mismo motivo que `VisualBlockTree.svelte.test.ts`: `<DeleteConfirm>` lo lee
 *  de forma SÍNCRONA en cuanto `pendingDelete` no es `null`. */
function fakeTreeCtx(): VegaAppContext {
	return {
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es',
		model: { revisions: { enabled: false }, types: [] }
	} as unknown as VegaAppContext;
}

function mountTree(
	blocks: BlocksState,
	selectedId: string | null,
	onSelect: (id: string) => void = vi.fn(),
	onStructuralChange: () => void = vi.fn()
): { target: HTMLElement; instance: ReturnType<typeof mount> } {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(VisualBlockTree, {
		target,
		props: { blocks, selectedId, onSelect, onStructuralChange },
		context: new Map([[VEGA_CONTEXT_KEY, fakeTreeCtx()]])
	});
	return { target, instance };
}

describe('Paridad de teclado — árbol (VisualBlockTree.svelte)', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.restoreAllMocks();
	});

	test('SELECCIONAR — Enter/Space sobre la fila del árbol selecciona el bloque', async () => {
		const onSelect = vi.fn();
		const blocks = fakeTreeBlocksState({
			records: [treeRecord('b1', 'Hero'), treeRecord('b2', 'Features')]
		});
		mounted = mountTree(blocks, null, onSelect);

		const rows = mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-row');
		pressEnter(rows[1]);
		await tick();

		expect(onSelect).toHaveBeenCalledWith('b2');
	});

	test('MOVER — Enter/Space sobre "Bajar" llama a `handleReorder(i, i+1)`', async () => {
		const handleReorder = vi.fn(async () => true);
		const onStructuralChange = vi.fn();
		const blocks = fakeTreeBlocksState({
			records: [
				treeRecord('b1', 'Hero'),
				treeRecord('b2', 'Features'),
				treeRecord('b3', 'Precios')
			],
			handleReorder
		});
		mounted = mountTree(blocks, null, vi.fn(), onStructuralChange);

		const downBtn = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-action')
		).find((btn) => btn.getAttribute('aria-label')?.startsWith('Bajar'))!;
		pressEnter(downBtn);
		await settle();

		expect(handleReorder).toHaveBeenCalledWith(0, 1);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
	});

	test('INSERTAR — Enter/Space sobre "Añadir" llama a `handleCreate`', async () => {
		const handleCreate = vi.fn(async () => {});
		const onStructuralChange = vi.fn();
		const blocks = fakeTreeBlocksState({ records: [treeRecord('b1', 'Hero')], handleCreate });
		mounted = mountTree(blocks, null, vi.fn(), onStructuralChange);

		pressEnter(mounted.target.querySelector<HTMLButtonElement>('.vega-tree-add')!);
		await settle();

		expect(handleCreate).toHaveBeenCalledWith(null);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
	});

	test('BORRAR — Enter/Space sobre la papelera abre el diálogo, y Enter/Space sobre "Eliminar" confirma', async () => {
		const b1 = treeRecord('b1', 'Hero');
		const requestDelete = vi.fn();
		const blocks = fakeTreeBlocksState({ records: [b1], requestDelete });
		mounted = mountTree(blocks, null);

		const trashBtn = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-action')
		).find((btn) => btn.getAttribute('aria-label')?.startsWith('Borrar'))!;
		pressEnter(trashBtn);
		await tick();
		expect(requestDelete).toHaveBeenCalledWith(b1);

		// El diálogo lo pinta `DeleteConfirm` sobre `blocks.pendingDelete` (dueño externo, ver la
		// cabecera del árbol): se remonta con `pendingDelete` ya puesto, mismo criterio que
		// `VisualBlockTree.svelte.test.ts`.
		await unmount(mounted.instance);
		mounted.target.remove();

		const confirmDelete = vi.fn(async () => {});
		const onStructuralChange = vi.fn();
		const pendingBlocks = fakeTreeBlocksState({ records: [b1], pendingDelete: b1, confirmDelete });
		mounted = mountTree(pendingBlocks, null, vi.fn(), onStructuralChange);

		pressEnter(mounted.target.querySelector<HTMLButtonElement>('.vega-delete-confirm')!);
		await settle();

		expect(confirmDelete).toHaveBeenCalledTimes(1);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
	});
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SECCIÓN B — Lienzo (`VisualOverlay.svelte`), `BlocksState` de mentira (mismo doble que
// `VisualOverlay.svelte.test.ts`, recortado a lo que este fichero necesita).
// ═════════════════════════════════════════════════════════════════════════════════════════════

function overlayRecord(id: string, heading: string): VegaRecord {
	return { id, type: 'post_block', values: { heading } };
}

function overlayBlock(
	id: string,
	type: string,
	rect: Partial<VisualBlock['rect']> = {}
): VisualBlock {
	return { id, type, rect: { top: 0, left: 0, width: 100, height: 50, ...rect } };
}

interface OverlayFakeOptions {
	records?: VegaRecord[];
	blockDuplicateAllowed?: boolean;
	handleCreate?: BlocksState['handleCreate'];
	requestDelete?: BlocksState['requestDelete'];
	handleReorder?: BlocksState['handleReorder'];
}

function fakeOverlayBlocksState(opts: OverlayFakeOptions = {}): BlocksState {
	const records = opts.records ?? [];
	return {
		status: { kind: 'ready', records },
		records,
		loading: false,
		failed: false,
		hidden: false,
		blocksConfig: null,
		childType: TREE_CHILD_TYPE,
		structuralFields: [],
		blockDuplicateAllowed: opts.blockDuplicateAllowed ?? false,
		hasTypeColumn: false,
		hasTypeMenu: false,
		blockTypes: [],
		structuralBusy: false,
		pendingDelete: null,
		deleting: false,
		announce: '',
		say: () => {},
		anyDirty: false,
		anySaving: false,
		isExpanded: () => false,
		isDirty: () => false,
		isSaving: () => false,
		isDuplicating: () => false,
		blockTypeOf: () => null,
		blockTypeRawName: () => null,
		blockTitle: (r) => (r.values.heading as string) ?? '',
		currentDraftRecords: () => [],
		load: async () => {},
		toggle: () => {},
		setDirty: () => {},
		setSaving: () => {},
		handleBlockDraftChange: () => {},
		handleBlockSaved: () => {},
		handleCreate: opts.handleCreate ?? vi.fn(async () => {}),
		handleDuplicate: vi.fn(async () => {}),
		requestDelete: opts.requestDelete ?? vi.fn(),
		cancelDelete: vi.fn(),
		confirmDelete: vi.fn(async () => {}),
		handleReorder: opts.handleReorder ?? vi.fn(async () => false)
	} satisfies BlocksState;
}

function fakeOverlayCtx(): VegaAppContext {
	return {
		locale: 'es',
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params)
	} as unknown as VegaAppContext;
}

function mountOverlay(props: {
	blocks: VisualBlock[];
	selectedId?: string | null;
	status: 'waiting' | 'ready';
	blocksState?: BlocksState;
	onStructuralChange?: () => void;
}): { target: HTMLElement; instance: ReturnType<typeof mount> } {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(VisualOverlay, {
		target,
		props: {
			selectedId: null,
			highlightedId: null,
			skippedBlocks: 0,
			renderedBlockTypes: null,
			blocksState: fakeOverlayBlocksState(),
			onStructuralChange: vi.fn(),
			...props
		},
		context: new Map([[VEGA_CONTEXT_KEY, fakeOverlayCtx()]])
	});
	return { target, instance };
}

/** `dragstart` de mentira (jsdom no trae `DragEvent`, y el manejador solo lee `dataTransfer` de
 *  forma opcional): mismo criterio que `VisualOverlay.svelte.test.ts#fireDrag`. */
function fireDragStart(el: Element): void {
	const event = new Event('dragstart', { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'dataTransfer', {
		value: { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
	});
	el.dispatchEvent(event);
}

function handleOf(target: HTMLElement): HTMLButtonElement {
	return target.querySelector<HTMLButtonElement>('.vega-visual-overlay-handle')!;
}

describe('Paridad de teclado — lienzo (VisualOverlay.svelte)', () => {
	let mounted: ReturnType<typeof mountOverlay> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.restoreAllMocks();
	});

	test('MOVER — `ArrowUp`/`ArrowDown` sobre el asa (fallback de `reorder-dnd.ts`) mueve sin arrastrar', async () => {
		const handleReorder = vi.fn(async () => true);
		const onStructuralChange = vi.fn();
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b2',
			blocks: [overlayBlock('b1', 'hero'), overlayBlock('b2', 'gallery')],
			blocksState: fakeOverlayBlocksState({
				records: [overlayRecord('b1', 'Hero'), overlayRecord('b2', 'Galería')],
				handleReorder
			}),
			onStructuralChange
		});
		await tick();

		pressKey(handleOf(mounted.target), 'ArrowUp');
		await settle();

		expect(handleReorder).toHaveBeenCalledWith(1, 0);
		expect(onStructuralChange).toHaveBeenCalled();
	});

	test('MOVER — Enter/Space sobre "Bajar" de la barra flotante llama a `handleReorder`', async () => {
		const handleReorder = vi.fn(async (from: number, to: number) => from !== to);
		const onStructuralChange = vi.fn();
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b2',
			blocks: [overlayBlock('b2', 'hero')],
			blocksState: fakeOverlayBlocksState({
				records: [
					overlayRecord('b1', 'Hero'),
					overlayRecord('b2', 'Features'),
					overlayRecord('b3', 'Precios')
				],
				handleReorder
			}),
			onStructuralChange
		});
		await tick();

		const downBtn = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-visual-overlay-toolbar-btn')
		).find((btn) => btn.getAttribute('aria-label')?.startsWith('Bajar'))!;
		pressEnter(downBtn);
		await settle();

		expect(handleReorder).toHaveBeenCalledWith(1, 2);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
	});

	test('INSERTAR — Enter/Space sobre un punto de inserción crea Y reordena hasta esa posición', async () => {
		const b1 = overlayRecord('b1', 'Hero');
		const b2 = overlayRecord('b2', 'Features');
		const created = overlayRecord('new', '');
		const records = [b1, b2];
		const handleCreate = vi.fn(async () => {
			records.push(created); // mismo array (ver `VisualOverlay.svelte.test.ts`)
		});
		const handleReorder = vi.fn(async () => true);
		const onStructuralChange = vi.fn();
		mounted = mountOverlay({
			status: 'ready',
			blocks: [
				overlayBlock('b1', 'hero', { top: 0, height: 50 }),
				overlayBlock('b2', 'gallery', { top: 100, height: 50 })
			],
			blocksState: fakeOverlayBlocksState({ records, handleCreate, handleReorder }),
			onStructuralChange
		});
		await tick();

		const points = mounted.target.querySelectorAll<HTMLButtonElement>(
			'.vega-visual-overlay-insert'
		);
		pressEnter(points[1]); // "entre b1 y b2"
		await settle();

		expect(handleCreate).toHaveBeenCalledWith(null);
		expect(handleReorder).toHaveBeenCalledWith(2, 1);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
	});

	test('BORRAR — Enter/Space sobre la papelera de la barra flotante pide `requestDelete`', async () => {
		const b1 = overlayRecord('b1', 'Hero');
		const requestDelete = vi.fn();
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b1',
			blocks: [overlayBlock('b1', 'hero')],
			blocksState: fakeOverlayBlocksState({ records: [b1], requestDelete })
		});
		await tick();

		const trashBtn = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-visual-overlay-toolbar-btn')
		).find((btn) => btn.getAttribute('aria-label')?.startsWith('Borrar'))!;
		pressEnter(trashBtn);
		await tick();

		expect(requestDelete).toHaveBeenCalledWith(b1);
	});

	// ————— Mediciones NEGATIVAS (encargo, Parte 3) —————

	test('NEGATIVA — `focusablesUnderAriaHidden()` sale VACÍO con bloques, con selección, y con un arrastre en vuelo', async () => {
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b1',
			blocks: [
				overlayBlock('b1', 'hero', { top: 0, height: 50 }),
				overlayBlock('b2', 'gallery', { top: 100, height: 50 })
			],
			blocksState: fakeOverlayBlocksState({
				records: [overlayRecord('b1', 'Hero'), overlayRecord('b2', 'Galería')],
				blockDuplicateAllowed: true
			})
		});
		await tick();

		// Estado 1: bloques renderizados, ninguno seleccionado (esta suite arranca con `selectedId`
		// puesto, así que este estado es el de partida antes de que exista selección — se comprueba
		// aparte, sin selección, en el siguiente mount).
		expect(focusablesUnderAriaHidden(mounted.target)).toEqual([]);

		// Estado 2: CON selección (barra flotante + puntos de inserción montados, ver el marcado).
		expect(mounted.target.querySelector('.vega-visual-overlay-toolbar')).not.toBeNull();
		expect(focusablesUnderAriaHidden(mounted.target)).toEqual([]);

		// Estado 3: con un arrastre EN VUELO (la capa de destinos, `pointer-events: auto`, aparece).
		fireDragStart(handleOf(mounted.target));
		await tick();
		expect(mounted.target.querySelector('.vega-visual-overlay-drop-zones')).not.toBeNull();
		expect(focusablesUnderAriaHidden(mounted.target)).toEqual([]);
	});

	test('NEGATIVA — con un arrastre en vuelo, los puntos de inserción se desmontan PERO el asa sigue moviendo por teclado', async () => {
		const handleReorder = vi.fn(async () => true);
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b1',
			blocks: [
				overlayBlock('b1', 'hero', { top: 0, height: 50 }),
				overlayBlock('b2', 'gallery', { top: 100, height: 50 })
			],
			blocksState: fakeOverlayBlocksState({
				records: [overlayRecord('b1', 'Hero'), overlayRecord('b2', 'Galería')],
				handleReorder
			})
		});
		await tick();
		expect(mounted.target.querySelectorAll('.vega-visual-overlay-insert')).toHaveLength(3); // N+1

		fireDragStart(handleOf(mounted.target));
		await tick();
		// Los puntos de inserción se fueron (ver la cabecera del overlay, "Puntos de inserción"): no
		// hay vía de INSERTAR mientras dura el gesto, pero mover sigue vivo por teclado.
		expect(mounted.target.querySelectorAll('.vega-visual-overlay-insert')).toHaveLength(0);

		pressKey(handleOf(mounted.target), 'ArrowDown');
		await settle();

		expect(handleReorder).toHaveBeenCalledWith(0, 1);
	});
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SECCIÓN C — Pantalla ENTERA (`VisualEditorScreen.svelte`), backend de memoria de verdad. Las
// DOS vías que solo viven aquí: `Alt+↑`/`Alt+↓` y `Supr`/`Retroceso` (`handleVisualKeydown`).
// Mismo harness (recortado) que `VisualEditorScreen.svelte.test.ts` — esta pantalla construye su
// propio `BlocksState` con `createBlocksState()`, así que no hay doble que sustituir aquí.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const PREVIEW_ORIGIN = 'https://sitio.test';
const TOKEN_URL = `${PREVIEW_ORIGIN}/preview/post/rec-1?token=abc`;
const SCREEN_RECORD: VegaRecord = { id: 'rec-1', type: 'post', values: { title: 'Hola mundo' } };

const screenPostType: ContentType = {
	name: 'post',
	readonly: false,
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		}
	]
};

const screenPostBlockType: ContentType = {
	name: 'post_block',
	readonly: false,
	fields: [
		{
			name: 'post',
			type: 'relation',
			target: 'post',
			multiple: false,
			required: true,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'sort',
			type: 'number',
			integer: true,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'heading',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		}
	]
};

interface BlockSeed {
	id: string;
	heading: string;
	sort: number;
}

async function setupScreen(
	blocks: BlockSeed[] = []
): Promise<{ ctx: VegaAppContext; type: ResolvedContentType; port: MemoryBackendPort }> {
	const model = resolveContentModel({
		types: [screenPostType, screenPostBlockType],
		manifestRaw: {
			schemaVersion: 1,
			collections: {
				post: { blocks: { collection: 'post_block', parentField: 'post', orderField: 'sort' } }
			}
		}
	});
	expect(model.warnings).toEqual([]);
	const type = model.types.find((t) => t.name === 'post')!;

	const port = createMemoryBackend({
		users: [{ email: 'admin@vega.test', password: 'test-pass' }],
		contentTypes: [screenPostType, screenPostBlockType],
		records: {
			post: [{ id: 'rec-1', values: { title: 'Hola mundo' } }],
			post_block: blocks.map((b) => ({
				id: b.id,
				values: { post: 'rec-1', sort: b.sort, heading: b.heading }
			}))
		}
	});
	await port.login({ email: 'admin@vega.test', password: 'test-pass' });
	Object.assign(port, {
		previewApiUrl: 'https://pb.test/api/vega-preview',
		previewVisualEditing: true
	});

	const ctx = {
		port,
		model,
		session: { token: 'tok-123', user: { id: 'u1', email: 'a@b.test' }, expiresAt: null },
		locale: 'es',
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		nav: { toRecord: vi.fn(), toSettings: vi.fn() },
		feedback: { toast: vi.fn(), reportError: vi.fn() },
		registerExitGuard: () => () => {}
	} as unknown as VegaAppContext;

	return { ctx, type, port };
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function tokenBody(): { url: string; expiresAt: string } {
	return { url: TOKEN_URL, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
}

/** `matchMedia` de mentira, SOLO el punto de corte del lienzo (900px): esta sección no ejerce la
 *  manilla del árbol, así que basta con el criterio "ancho" que ya usa `canvasActive`. */
function stubMatchMediaWide(): void {
	vi.stubGlobal('matchMedia', () => ({
		matches: false,
		media: '',
		addEventListener: () => {},
		removeEventListener: () => {}
	}));
}

function stubResizeObserverNoop(): void {
	class ResizeObserverStub {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	}
	vi.stubGlobal('ResizeObserver', ResizeObserverStub);
}

async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 10));
	await tick();
}

function mountScreen(
	ctx: VegaAppContext,
	type: ResolvedContentType
): { target: HTMLElement; instance: ReturnType<typeof mount> } {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(VisualEditorScreen, {
		target,
		props: { type, record: SCREEN_RECORD },
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance };
}

describe('Paridad de teclado — pantalla (VisualEditorScreen.svelte, atajos)', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	beforeEach(() => {
		stubMatchMediaWide();
		stubResizeObserverNoop();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tokenBody())));
	});

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	test('MOVER — `Alt+ArrowDown` mueve el bloque seleccionado', async () => {
		const { ctx, type, port } = await setupScreen([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();

		// Selección vía árbol (ya medida en la sección A; aquí es solo el paso previo).
		mounted.target.querySelector<HTMLButtonElement>('.vega-tree-row')!.click();
		await tick();

		pressKey(window, 'ArrowDown', { altKey: true });
		await flush();

		expect(mounted.target.querySelector('.vega-tree-title')?.textContent).toBe('Features');
		const b1 = await port.get('post_block', 'b1');
		const b2 = await port.get('post_block', 'b2');
		expect((b2.values.sort as number) < (b1.values.sort as number)).toBe(true);
	});

	test('MOVER — sin bloque seleccionado, `Alt+ArrowDown` no hace nada (guard real, no solo de forma)', async () => {
		const { ctx, type } = await setupScreen([
			{ id: 'b1', heading: 'Hero', sort: 0 },
			{ id: 'b2', heading: 'Features', sort: 1 }
		]);
		mounted = mountScreen(ctx, type);
		await flush();

		pressKey(window, 'ArrowDown', { altKey: true });
		await flush();

		const titles = Array.from(mounted.target.querySelectorAll('.vega-tree-title')).map(
			(el) => el.textContent
		);
		expect(titles).toEqual(['Hero', 'Features']); // orden intacto
	});

	test('BORRAR — `Delete` pide el borrado del bloque seleccionado (abre el diálogo) y confirmar lo borra de verdad', async () => {
		const { ctx, type, port } = await setupScreen([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();

		mounted.target.querySelector<HTMLButtonElement>('.vega-tree-row')!.click();
		await tick();

		pressKey(window, 'Delete');
		await tick();

		const confirmBtn = mounted.target.querySelector<HTMLButtonElement>('.vega-delete-confirm')!;
		expect(confirmBtn).not.toBeNull();
		pressEnter(confirmBtn);
		await flush();

		expect(mounted.target.querySelector('.vega-tree-row')).toBeNull();
		await expect(port.get('post_block', 'b1')).rejects.toBeTruthy();
	});

	test('BORRAR — `Backspace` también abre el diálogo (la segunda tecla de la tabla)', async () => {
		const { ctx, type } = await setupScreen([{ id: 'b1', heading: 'Hero', sort: 0 }]);
		mounted = mountScreen(ctx, type);
		await flush();

		mounted.target.querySelector<HTMLButtonElement>('.vega-tree-row')!.click();
		await tick();

		pressKey(window, 'Backspace');
		await tick();

		expect(mounted.target.querySelector('.vega-delete-confirm')).not.toBeNull();
	});
});
