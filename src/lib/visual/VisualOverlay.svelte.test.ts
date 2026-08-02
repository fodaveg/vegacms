/**
 * Suite de `VisualOverlay.svelte` (tarea "contornos de selección", ampliada por "acciones
 * estructurales desde el editor visual" y por los dos defectos de "el lienzo del editor visual"):
 * geometría de las cajas contra `rect`, el modificador de seleccionada, que el grupo de cajas
 * nunca captura el puntero, los cuatro estados que hay que pintar de verdad (cargando/sin
 * bloques/bloques mal descritos/tipo no soportado), que el par `renderedBlockTypes` ausente no
 * marca nada, la barra flotante del seleccionado (duplicar/mover/borrar), los puntos de
 * inserción — Y AHORA el menú de tipos de esos puntos (defecto "el `+` crea sin preguntar el
 * tipo") y el aviso de bloques que faltan (defecto "el lienzo no dice nada cuando le faltan
 * bloques") — con un `BlocksState` de MENTIRA (`fakeBlocksState`, mismo criterio que
 * `VisualBlockTree.svelte.test.ts`). No prueba el resalte por ratón ni la selección por clic: ver
 * la cabecera del componente para el porqué de los dos.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import VisualOverlay from './VisualOverlay.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BlocksState, BlocksStatus } from '$lib/form/blocks-state.svelte';
import type { ResolvedBlockType, ResolvedContentType } from '$lib/model/types';
import type { VegaRecord } from '$lib/backend';
import { t as translate } from '$lib/i18n';
import type { VisualBlock } from './bridge-client';

/** Mismo vocabulario que el `status` interno del componente (no exportado, ver su cabecera):
 *  duplicado aquí a propósito, dos literales no merecen un módulo compartido. */
type VisualOverlayStatus = 'waiting' | 'ready';

const CHILD_TYPE = { label: 'Bloques', labelSingular: 'Bloque' } as unknown as ResolvedContentType;
const HERO_TYPE = { name: 'hero', label: 'Portada', icon: null } as unknown as ResolvedBlockType;
const GALLERY_TYPE = {
	name: 'gallery',
	label: 'Galería',
	icon: null
} as unknown as ResolvedBlockType;

function record(id: string, heading: string): VegaRecord {
	return { id, type: 'post_block', values: { heading } };
}

/** `model` MÍNIMO — ver la misma nota en `VisualBlockTree.svelte.test.ts`: aquí no hace falta
 *  (esta suite no monta `<DeleteConfirm>`, que vive en el otro componente), pero se deja fuera a
 *  propósito para no fingir una superficie que este componente no toca. */
function fakeCtx(): VegaAppContext {
	return {
		locale: 'es',
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params)
	} as unknown as VegaAppContext;
}

function block(id: string, type: string, rect: Partial<VisualBlock['rect']> = {}): VisualBlock {
	return { id, type, rect: { top: 0, left: 0, width: 100, height: 50, ...rect } };
}

interface FakeOptions {
	status?: BlocksStatus;
	hidden?: boolean;
	records?: VegaRecord[];
	blockDuplicateAllowed?: boolean;
	hasTypeMenu?: boolean;
	blockTypes?: ResolvedBlockType[];
	structuralBusy?: boolean;
	anyDirtyIds?: Set<string>;
	anySavingIds?: Set<string>;
	handleCreate?: BlocksState['handleCreate'];
	handleDuplicate?: BlocksState['handleDuplicate'];
	requestDelete?: BlocksState['requestDelete'];
	handleReorder?: BlocksState['handleReorder'];
}

/** Doble MÍNIMO de `BlocksState` (ver cabecera). `records` es el MISMO array que
 *  `handleCreate` puede mutar (`.push`, ver el test de inserción): el componente vuelve a leer
 *  `blocksState.records.length` tras el `await`, así que un `handleCreate` de mentira que empuja
 *  al array real es más honesto que fingir un contador aparte. */
function fakeBlocksState(opts: FakeOptions = {}): BlocksState {
	const records = opts.records ?? [];
	const status = opts.status ?? { kind: 'ready', records };
	const dirtyIds = opts.anyDirtyIds ?? new Set<string>();
	const savingIds = opts.anySavingIds ?? new Set<string>();
	return {
		status,
		records,
		loading: status.kind === 'loading',
		failed: status.kind === 'error',
		hidden: opts.hidden ?? false,
		blocksConfig: null,
		childType: CHILD_TYPE,
		structuralFields: [],
		blockDuplicateAllowed: opts.blockDuplicateAllowed ?? false,
		hasTypeColumn: false,
		hasTypeMenu: opts.hasTypeMenu ?? false,
		blockTypes: opts.blockTypes ?? [],
		structuralBusy: opts.structuralBusy ?? false,
		pendingDelete: null,
		deleting: false,
		announce: '',
		say: () => {},
		anyDirty: dirtyIds.size > 0,
		anySaving: savingIds.size > 0,
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
		handleDuplicate: opts.handleDuplicate ?? vi.fn(async () => {}),
		requestDelete: opts.requestDelete ?? vi.fn(),
		cancelDelete: vi.fn(),
		confirmDelete: vi.fn(async () => {}),
		handleReorder: opts.handleReorder ?? vi.fn(async () => false)
	} satisfies BlocksState;
}

function mountOverlay(props: {
	blocks: VisualBlock[];
	selectedId?: string | null;
	highlightedId?: string | null;
	skippedBlocks?: number;
	status: VisualOverlayStatus;
	renderedBlockTypes?: readonly string[] | null;
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
			blocksState: fakeBlocksState(),
			onStructuralChange: vi.fn(),
			...props
		},
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
	});
	return { target, instance };
}

/** Drena la cadena de microtasks de una mutación `async` disparada por un `click` (mismo criterio
 *  que `VisualBlockTree.svelte.test.ts`). */
async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await tick();
}

describe('VisualOverlay.svelte', () => {
	let mounted: ReturnType<typeof mountOverlay> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.restoreAllMocks();
	});

	test('coloca una caja por bloque, posicionada con SU rect', async () => {
		mounted = mountOverlay({
			status: 'ready',
			blocks: [
				block('b1', 'hero', { top: 10, left: 20, width: 300, height: 150 }),
				block('b2', 'gallery', { top: 200, left: 0, width: 640, height: 480 })
			]
		});
		await tick();

		const b1 = mounted.target.querySelector<HTMLElement>('[data-vega-block-id="b1"]');
		const b2 = mounted.target.querySelector<HTMLElement>('[data-vega-block-id="b2"]');
		expect(b1?.style.top).toBe('10px');
		expect(b1?.style.left).toBe('20px');
		expect(b1?.style.width).toBe('300px');
		expect(b1?.style.height).toBe('150px');
		expect(b2?.style.top).toBe('200px');
		expect(b2?.style.width).toBe('640px');
	});

	test('marca la caja seleccionada, y solo esa', async () => {
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero'), block('b2', 'gallery')],
			selectedId: 'b2'
		});
		await tick();

		const b1 = mounted.target.querySelector('[data-vega-block-id="b1"]');
		const b2 = mounted.target.querySelector('[data-vega-block-id="b2"]');
		expect(b1?.classList.contains('vega-visual-overlay-box--selected')).toBe(false);
		expect(b2?.classList.contains('vega-visual-overlay-box--selected')).toBe(true);
	});

	test('marca la caja resaltada por Vega (`highlightedId`), independiente de la seleccionada', async () => {
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero'), block('b2', 'gallery')],
			selectedId: 'b1',
			highlightedId: 'b2'
		});
		await tick();

		const b2 = mounted.target.querySelector('[data-vega-block-id="b2"]');
		expect(b2?.classList.contains('vega-visual-overlay-box--highlighted')).toBe(true);
		expect(b2?.classList.contains('vega-visual-overlay-box--selected')).toBe(false);
	});

	test('nada captura el puntero: ni el contenedor ni una caja', async () => {
		mounted = mountOverlay({ status: 'ready', blocks: [block('b1', 'hero')] });
		await tick();

		// `pointer-events: none` va en línea (`style:`, ver la cabecera del componente): esta
		// suite corre en el proyecto `component` de Vitest, que NO procesa el `<style>` scoped de
		// Svelte (`test.css` no está activado — sin él no hay hoja de estilos que
		// `getComputedStyle` pueda leer), así que el estilo en línea es también lo único que un
		// test puede verificar aquí sin encender ese pipeline para todo el repo.
		const root = mounted.target.querySelector<HTMLElement>('.vega-visual-overlay-root');
		const box = mounted.target.querySelector<HTMLElement>('.vega-visual-overlay-box');
		expect(root?.style.pointerEvents).toBe('none');
		expect(box?.style.pointerEvents).toBe('none');
	});

	test('estado "cargando": sin bloques todavía no dice lo mismo que "sin bloques"', async () => {
		mounted = mountOverlay({ status: 'waiting', blocks: [] });
		await tick();

		expect(mounted.target.querySelector('.vega-visual-overlay-status')?.textContent).toContain(
			translate('es', 'editor.visual.overlay.waiting')
		);
	});

	test('estado "sin bloques": conectado pero el sitio no describió ninguno', async () => {
		mounted = mountOverlay({ status: 'ready', blocks: [] });
		await tick();

		expect(mounted.target.querySelector('.vega-visual-overlay-status')?.textContent).toContain(
			translate('es', 'editor.visual.overlay.empty')
		);
	});

	test('estado "bloques mal descritos": dice el número, no lo esconde', async () => {
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero')],
			skippedBlocks: 3
		});
		await tick();

		expect(mounted.target.querySelector('.vega-visual-overlay-status')?.textContent).toContain(
			translate('es', 'editor.visual.overlay.skipped', { count: 3 })
		);
		// Y con bloques SÍ pintados, no reemplaza el estado "sin bloques".
		expect(mounted.target.querySelector('.vega-visual-overlay-status')?.textContent).not.toContain(
			translate('es', 'editor.visual.overlay.empty')
		);
	});

	// ————— Defecto "el lienzo no dice nada cuando le faltan bloques" —————

	test('registro de Vega que el sitio NO reportó: avisa por id, no por longitud', async () => {
		const blocksState = fakeBlocksState({
			records: [record('b1', 'Hero'), record('b2', 'Features'), record('b3', 'Precios')]
		});
		mounted = mountOverlay({
			status: 'ready',
			// Mismo NÚMERO de bloques que registros (3), pero uno de los ids no casa ('fantasma' en
			// vez de 'b3') — la comprobación "por longitud" no vería nada raro aquí.
			blocks: [block('b1', 'hero'), block('b2', 'gallery'), block('fantasma', 'footer')],
			blocksState
		});
		await tick();

		expect(mounted.target.querySelector('.vega-visual-overlay-status')?.textContent).toContain(
			translate('es', 'editor.visual.overlay.missing', { count: 1 })
		);
	});

	test('todos los ids casan: ningún aviso de bloques que faltan', async () => {
		const blocksState = fakeBlocksState({
			records: [record('b1', 'Hero'), record('b2', 'Features')]
		});
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero'), block('b2', 'gallery')],
			blocksState
		});
		await tick();

		expect(mounted.target.querySelector('.vega-visual-overlay-status')?.textContent).not.toContain(
			translate('es', 'editor.visual.overlay.missing', { count: 1 })
		);
	});

	test('bloques que faltan Y lienzo vacío a la vez: el aviso nuevo SUSTITUYE al de "sin bloques"', async () => {
		const blocksState = fakeBlocksState({
			records: [record('b1', 'Hero'), record('b2', 'Features')]
		});
		// El sitio no reporta NINGÚN bloque (p.ej. las dos secciones están sin publicar): `empty`
		// sería engañoso ("todavía no tiene bloques que seleccionar" sugiere crear uno, cuando en
		// realidad ya hay dos que el sitio no está pintando).
		mounted = mountOverlay({ status: 'ready', blocks: [], blocksState });
		await tick();

		const text = mounted.target.querySelector('.vega-visual-overlay-status')?.textContent;
		expect(text).toContain(translate('es', 'editor.visual.overlay.missing', { count: 2 }));
		expect(text).not.toContain(translate('es', 'editor.visual.overlay.empty'));
	});

	test('tipo que el sitio no sabe pintar: la etiqueta se marca no soportada, la caja sigue ahí', async () => {
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero'), block('b2', 'carrusel-raro')],
			renderedBlockTypes: ['hero']
		});
		await tick();

		const supported = mounted.target.querySelector(
			'[data-vega-block-id="b1"] .vega-visual-overlay-label'
		);
		const unsupported = mounted.target.querySelector(
			'[data-vega-block-id="b2"] .vega-visual-overlay-label'
		);
		expect(supported?.classList.contains('vega-visual-overlay-label--unsupported')).toBe(false);
		expect(unsupported?.classList.contains('vega-visual-overlay-label--unsupported')).toBe(true);
		expect(unsupported?.textContent).toContain(
			translate('es', 'editor.visual.overlay.unsupported')
		);
	});

	test('sin `renderedBlockTypes` (proyecto legacy o sin discovery): ningún bloque se marca', async () => {
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero'), block('b2', 'carrusel-raro')],
			renderedBlockTypes: null
		});
		await tick();

		const labels = mounted.target.querySelectorAll('.vega-visual-overlay-label--unsupported');
		expect(labels).toHaveLength(0);
	});

	// ————— Barra flotante del seleccionado (tarea "acciones estructurales desde el editor visual") —————

	test('la barra flotante SOLO aparece con registro Y rect a la vez; ninguna de las dos cajas basta sola', async () => {
		const blocksState = fakeBlocksState({ records: [record('b1', 'Hero')] });
		// Sin selección: nada.
		mounted = mountOverlay({ status: 'ready', blocks: [block('b1', 'hero')], blocksState });
		await tick();
		expect(mounted.target.querySelector('.vega-visual-overlay-toolbar')).toBeNull();
		await unmount(mounted.instance);
		mounted.target.remove();

		// El sitio anota un id que NO existe como registro (fantasma, ver la cabecera del árbol):
		// hay rect, pero no hay a quién actuar.
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('fantasma', 'hero')],
			selectedId: 'fantasma',
			blocksState
		});
		await tick();
		expect(mounted.target.querySelector('.vega-visual-overlay-toolbar')).toBeNull();
		await unmount(mounted.instance);
		mounted.target.remove();

		// El registro existe pero el sitio no lo pinta (sin rect, p.ej. `display:none`): hay a quién
		// actuar, pero no hay coordenada honesta donde flotar la barra.
		mounted = mountOverlay({
			status: 'ready',
			blocks: [],
			selectedId: 'b1',
			blocksState
		});
		await tick();
		expect(mounted.target.querySelector('.vega-visual-overlay-toolbar')).toBeNull();
		await unmount(mounted.instance);
		mounted.target.remove();

		// Las DOS a la vez: la barra aparece.
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero', { top: 100, left: 20 })],
			selectedId: 'b1',
			blocksState
		});
		await tick();
		const toolbar = mounted.target.querySelector<HTMLElement>('.vega-visual-overlay-toolbar');
		expect(toolbar).not.toBeNull();
		expect(toolbar?.getAttribute('aria-label')).toBe(
			translate('es', 'editor.visual.overlay.toolbar.label', { label: 'Hero' })
		);
	});

	test('duplicar: llama a `handleDuplicate` con el registro seleccionado y pide vista previa nueva', async () => {
		const b1 = record('b1', 'Hero');
		const handleDuplicate = vi.fn(async () => {});
		const onStructuralChange = vi.fn();
		const blocksState = fakeBlocksState({
			records: [b1],
			blockDuplicateAllowed: true,
			handleDuplicate
		});
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero')],
			selectedId: 'b1',
			blocksState,
			onStructuralChange
		});
		await tick();

		const duplicateBtn = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-visual-overlay-toolbar-btn')
		).find((btn) => btn.getAttribute('aria-label')?.startsWith('Duplicar'))!;
		duplicateBtn.click();
		await settle();

		expect(handleDuplicate).toHaveBeenCalledWith(b1);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
	});

	test('borrar: solo pide `requestDelete` (el diálogo lo pinta `VisualBlockTree.svelte`), no toca la selección', async () => {
		const b1 = record('b1', 'Hero');
		const requestDelete = vi.fn();
		const onStructuralChange = vi.fn();
		const blocksState = fakeBlocksState({ records: [b1], requestDelete });
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero')],
			selectedId: 'b1',
			blocksState,
			onStructuralChange
		});
		await tick();

		const deleteBtn = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-visual-overlay-toolbar-btn')
		).find((btn) => btn.getAttribute('aria-label')?.startsWith('Borrar'))!;
		deleteBtn.click();
		await tick();

		expect(requestDelete).toHaveBeenCalledWith(b1);
		// Ver cabecera: borrar NO escribe `selectedId` (prop, dueño externo) — nada que comprobar
		// aquí salvo que `onStructuralChange` NO se llamó todavía (eso lo hace la confirmación).
		expect(onStructuralChange).not.toHaveBeenCalled();
	});

	test('mover: deshabilitado en los extremos, llama a `handleReorder` y pide vista previa solo si cambió algo', async () => {
		const handleReorder = vi.fn(async (from: number, to: number) => from !== to);
		const onStructuralChange = vi.fn();
		const blocksState = fakeBlocksState({
			records: [record('b1', 'Hero'), record('b2', 'Features'), record('b3', 'Precios')],
			handleReorder
		});
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b2', 'hero')],
			selectedId: 'b2', // índice 1: puede subir Y bajar
			blocksState,
			onStructuralChange
		});
		await tick();

		const buttons = mounted.target.querySelectorAll<HTMLButtonElement>(
			'.vega-visual-overlay-toolbar-btn'
		);
		const upBtn = Array.from(buttons).find((b) =>
			b.getAttribute('aria-label')?.startsWith('Subir')
		)!;
		const downBtn = Array.from(buttons).find((b) =>
			b.getAttribute('aria-label')?.startsWith('Bajar')
		)!;
		expect(upBtn.disabled).toBe(false);
		expect(downBtn.disabled).toBe(false);

		downBtn.click();
		await settle();
		expect(handleReorder).toHaveBeenCalledWith(1, 2);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
	});

	test('mover: el primero no puede subir, el último no puede bajar', async () => {
		const blocksState = fakeBlocksState({
			records: [record('b1', 'Hero'), record('b2', 'Features')]
		});
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero')],
			selectedId: 'b1',
			blocksState
		});
		await tick();

		const upBtn = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-visual-overlay-toolbar-btn')
		).find((b) => b.getAttribute('aria-label')?.startsWith('Subir'))!;
		expect(upBtn.disabled).toBe(true);
	});

	// ————— Puntos de inserción (tarea "acciones estructurales desde el editor visual") —————

	test('N+1 puntos de inserción para N bloques, con posiciones antes/entre/después', async () => {
		const blocksState = fakeBlocksState({
			records: [record('b1', 'Hero'), record('b2', 'Features')]
		});
		mounted = mountOverlay({
			status: 'ready',
			blocks: [
				block('b1', 'hero', { top: 0, height: 50 }),
				block('b2', 'gallery', { top: 100, height: 50 })
			],
			blocksState
		});
		await tick();

		const points = mounted.target.querySelectorAll<HTMLButtonElement>(
			'.vega-visual-overlay-insert'
		);
		expect(points).toHaveLength(3);
		expect(points[0].getAttribute('aria-label')).toBe(
			translate('es', 'editor.visual.overlay.insertLabel', { position: 1, total: 3 })
		);
		expect(points[1].getAttribute('aria-label')).toBe(
			translate('es', 'editor.visual.overlay.insertLabel', { position: 2, total: 3 })
		);
		expect(points[2].getAttribute('aria-label')).toBe(
			translate('es', 'editor.visual.overlay.insertLabel', { position: 3, total: 3 })
		);
		// Antes del primero, entre los dos, y después del segundo — mismo orden Y creciente.
		expect(points[0].style.top).toBe('0px');
		expect(points[1].style.top).toBe('75px'); // punto medio entre 50 (fin de b1) y 100 (inicio de b2)
		expect(points[2].style.top).toBe('150px');
	});

	test('sin bloques que el sitio reporte: ningún punto de inserción (el árbol sigue siendo la vía)', async () => {
		const blocksState = fakeBlocksState({ records: [] });
		mounted = mountOverlay({ status: 'ready', blocks: [], blocksState });
		await tick();

		expect(mounted.target.querySelectorAll('.vega-visual-overlay-insert')).toHaveLength(0);
	});

	test('clicar un punto de inserción crea Y reordena hasta esa posición EXACTA', async () => {
		const b1 = record('b1', 'Hero');
		const b2 = record('b2', 'Features');
		const created = record('new', '');
		const records = [b1, b2];
		const handleCreate = vi.fn(async () => {
			records.push(created); // mismo array: `blocksState.records` refleja el alta (ver cabecera)
		});
		const handleReorder = vi.fn(async () => true);
		const onStructuralChange = vi.fn();
		const blocksState = fakeBlocksState({ records, handleCreate, handleReorder });
		mounted = mountOverlay({
			status: 'ready',
			blocks: [
				block('b1', 'hero', { top: 0, height: 50 }),
				block('b2', 'gallery', { top: 100, height: 50 })
			],
			blocksState,
			onStructuralChange
		});
		await tick();

		const points = mounted.target.querySelectorAll<HTMLButtonElement>(
			'.vega-visual-overlay-insert'
		);
		points[1].click(); // "entre b1 y b2" → posición 1 en `blocksState.records`
		await settle();

		expect(handleCreate).toHaveBeenCalledWith(null); // sin menú de tipos: modo homogéneo
		// Se creó al final (índice 2, `records.length` tras el `push`) y se reordenó a la posición 1.
		expect(handleReorder).toHaveBeenCalledWith(2, 1);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
	});

	// ————— Menú de tipos del punto de inserción (defecto "el `+` crea sin preguntar el tipo") —————

	test('con `hasTypeMenu`, el `+` NO crea directo: abre un menú con los tipos', async () => {
		const handleCreate = vi.fn(async () => {});
		const blocksState = fakeBlocksState({
			records: [record('b1', 'Hero')],
			hasTypeMenu: true,
			blockTypes: [HERO_TYPE, GALLERY_TYPE],
			handleCreate
		});
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero', { top: 0, height: 50 })],
			blocksState
		});
		await tick();

		const trigger = mounted.target.querySelectorAll<HTMLButtonElement>(
			'.vega-visual-overlay-insert'
		)[0];
		expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		trigger.click();
		await settle();

		expect(handleCreate).not.toHaveBeenCalled(); // el clic abre el menú, no crea todavía
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		const items = mounted.target.querySelectorAll('[role="menuitem"]');
		expect(items).toHaveLength(2);
	});

	test('sin `hasTypeMenu` (modo homogéneo), el `+` sigue creando directo, sin menú', async () => {
		const handleCreate = vi.fn(async () => {});
		const blocksState = fakeBlocksState({
			records: [record('b1', 'Hero')],
			hasTypeMenu: false,
			handleCreate
		});
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero', { top: 0, height: 50 })],
			blocksState
		});
		await tick();

		const trigger = mounted.target.querySelectorAll<HTMLButtonElement>(
			'.vega-visual-overlay-insert'
		)[0];
		expect(trigger.getAttribute('aria-haspopup')).toBeNull();
		trigger.click();
		await settle();

		expect(handleCreate).toHaveBeenCalledWith(null);
		expect(mounted.target.querySelector('[role="menu"]')).toBeNull();
	});

	test('elegir un tipo del menú crea CON ESE tipo (no con `blockTypes[0]`) y en la posición pedida', async () => {
		const b1 = record('b1', 'Hero');
		const b2 = record('b2', 'Features');
		const created = record('new', '');
		const records = [b1, b2];
		const handleCreate = vi.fn(async () => {
			records.push(created);
		});
		const handleReorder = vi.fn(async () => true);
		const onStructuralChange = vi.fn();
		const blocksState = fakeBlocksState({
			records,
			hasTypeMenu: true,
			blockTypes: [HERO_TYPE, GALLERY_TYPE],
			handleCreate,
			handleReorder
		});
		mounted = mountOverlay({
			status: 'ready',
			blocks: [
				block('b1', 'hero', { top: 0, height: 50 }),
				block('b2', 'gallery', { top: 100, height: 50 })
			],
			blocksState,
			onStructuralChange
		});
		await tick();

		const points = mounted.target.querySelectorAll<HTMLButtonElement>(
			'.vega-visual-overlay-insert'
		);
		points[1].click(); // "entre b1 y b2" → posición 1
		await settle();

		const items = mounted.target.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
		items[1].click(); // "Galería", NO el primero declarado
		await settle();

		expect(handleCreate).toHaveBeenCalledWith(GALLERY_TYPE);
		// Se creó al final (índice 2) y se reordenó a la posición 1, igual que en modo homogéneo.
		expect(handleReorder).toHaveBeenCalledWith(2, 1);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
		// El menú se cierra y el foco vuelve al `+` que lo abrió.
		expect(mounted.target.querySelector('[role="menu"]')).toBeNull();
		expect(document.activeElement).toBe(points[1]);
	});

	test('Escape cierra el menú y devuelve el foco al `+`; clicar fuera también lo cierra', async () => {
		const blocksState = fakeBlocksState({
			records: [record('b1', 'Hero')],
			hasTypeMenu: true,
			blockTypes: [HERO_TYPE, GALLERY_TYPE]
		});
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero', { top: 0, height: 50 })],
			blocksState
		});
		await tick();

		const trigger = mounted.target.querySelectorAll<HTMLButtonElement>(
			'.vega-visual-overlay-insert'
		)[0];
		trigger.click();
		await settle();
		expect(mounted.target.querySelector('[role="menu"]')).not.toBeNull();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await tick();
		expect(mounted.target.querySelector('[role="menu"]')).toBeNull();
		expect(document.activeElement).toBe(trigger);

		trigger.click();
		await settle();
		expect(mounted.target.querySelector('[role="menu"]')).not.toBeNull();
		document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await tick();
		expect(mounted.target.querySelector('[role="menu"]')).toBeNull();
	});

	test('un arrastre que empieza con el menú abierto lo cierra (no queda huérfano)', async () => {
		const blocksState = fakeBlocksState({
			records: [record('b1', 'Hero'), record('b2', 'Galería')],
			hasTypeMenu: true,
			blockTypes: [HERO_TYPE, GALLERY_TYPE]
		});
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b1',
			blocks: [
				block('b1', 'hero', { top: 0, height: 50 }),
				block('b2', 'gallery', { top: 100, height: 50 })
			],
			blocksState
		});
		await tick();

		mounted.target.querySelectorAll<HTMLButtonElement>('.vega-visual-overlay-insert')[0].click();
		await settle();
		expect(mounted.target.querySelector('[role="menu"]')).not.toBeNull();

		const handle = mounted.target.querySelector<HTMLElement>('.vega-visual-overlay-handle')!;
		const dragstart = new Event('dragstart', { bubbles: true, cancelable: true });
		Object.defineProperty(dragstart, 'dataTransfer', {
			value: { setData: vi.fn(), effectAllowed: '' }
		});
		handle.dispatchEvent(dragstart);
		await tick();

		// Los puntos de inserción se retiran mientras dura el arrastre — el menú, huérfano, se va
		// con ellos, y NO queda abierto en el estado para cuando vuelvan a montarse.
		expect(mounted.target.querySelector('[role="menu"]')).toBeNull();

		handle.dispatchEvent(new Event('dragend', { bubbles: true, cancelable: true }));
		await tick();
		expect(mounted.target.querySelector('.vega-visual-overlay-insert')).not.toBeNull();
		expect(mounted.target.querySelector('[role="menu"]')).toBeNull();
	});

	test('pointer-events: la barra y los puntos de inserción activan `auto` SOLO en sus botones, nunca en el contenedor', async () => {
		const blocksState = fakeBlocksState({ records: [record('b1', 'Hero')] });
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero')],
			selectedId: 'b1',
			blocksState
		});
		await tick();

		const toolbar = mounted.target.querySelector<HTMLElement>('.vega-visual-overlay-toolbar');
		const toolbarBtn = mounted.target.querySelector<HTMLElement>(
			'.vega-visual-overlay-toolbar-btn'
		);
		const insertPointsWrap = mounted.target.querySelector<HTMLElement>(
			'.vega-visual-overlay-insert-points'
		);
		const insertBtn = mounted.target.querySelector<HTMLElement>('.vega-visual-overlay-insert');

		// Los contenedores no fijan nada (heredan `none` del raíz); los botones sí, en línea.
		expect(toolbar?.style.pointerEvents).toBe('');
		expect(toolbarBtn?.style.pointerEvents).toBe('auto');
		expect(insertPointsWrap?.style.pointerEvents).toBe('');
		expect(insertBtn?.style.pointerEvents).toBe('auto');
	});

	// ————— Arrastrar en el lienzo (tarea "reordenar arrastrando en el lienzo") —————
	//
	// El controlador en sí (`createReorderDndController`) ya está probado a fondo en
	// `reorder-dnd.test.ts`: esta suite NO revuelve sus invariantes, prueba lo que es propio de
	// montarlo aquí — que la capa de destinos solo existe durante el gesto, que los índices se
	// traducen del puente a los registros por id, y que la guía cae en el borde correcto.

	/** `dragstart`/`dragover`/`drop` de mentira: jsdom no trae `DragEvent`, y los manejadores solo
	 *  leen `dataTransfer` (opcional) y `preventDefault`. Se despacha un `Event` normal con un
	 *  `dataTransfer` de juguete encima, mismo criterio que `reorder-dnd.test.ts`. */
	function fireDrag(el: Element, type: string): void {
		const event = new Event(type, { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'dataTransfer', {
			value: { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
		});
		el.dispatchEvent(event);
	}

	function handleOf(target: HTMLElement): HTMLElement {
		return target.querySelector<HTMLElement>('.vega-visual-overlay-handle')!;
	}

	function zonesOf(target: HTMLElement): HTMLElement[] {
		return [...target.querySelectorAll<HTMLElement>('.vega-visual-overlay-drop-zone')];
	}

	test('en reposo NO hay ni un destino de arrastre que pueda robar el puntero', async () => {
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b1',
			blocks: [block('b1', 'hero'), block('b2', 'gallery')],
			blocksState: fakeBlocksState({ records: [record('b1', 'Hero'), record('b2', 'Galería')] })
		});
		await tick();

		expect(mounted.target.querySelector('.vega-visual-overlay-drop-zones')).toBeNull();
		expect(zonesOf(mounted.target)).toHaveLength(0);
	});

	test('agarrar el asa monta un destino por bloque, en SU rect y capturando el puntero', async () => {
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b1',
			blocks: [
				block('b1', 'hero', { top: 10, left: 5, width: 300, height: 150 }),
				block('b2', 'gallery', { top: 200, left: 0, width: 640, height: 480 })
			],
			blocksState: fakeBlocksState({ records: [record('b1', 'Hero'), record('b2', 'Galería')] })
		});
		await tick();

		fireDrag(handleOf(mounted.target), 'dragstart');
		await tick();

		const zones = zonesOf(mounted.target);
		expect(zones).toHaveLength(2);
		expect(zones[0].style.top).toBe('10px');
		expect(zones[0].style.left).toBe('5px');
		expect(zones[0].style.width).toBe('300px');
		expect(zones[0].style.height).toBe('150px');
		expect(zones[1].style.top).toBe('200px');
		// La ÚNICA parte del overlay que captura el puntero, y solo mientras dura el gesto.
		expect(zones[0].style.pointerEvents).toBe('auto');
		// Y los puntos de inserción se apartan: caen en los huecos donde se suelta y se tragarían
		// el `drop` sin manejarlo (ver el marcado).
		expect(mounted.target.querySelector('.vega-visual-overlay-insert')).toBeNull();
	});

	test('soltar sobre otro bloque reordena y pide vista previa nueva', async () => {
		const handleReorder = vi.fn(async () => true);
		const onStructuralChange = vi.fn();
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b1',
			blocks: [block('b1', 'hero'), block('b2', 'gallery'), block('b3', 'footer')],
			blocksState: fakeBlocksState({
				records: [record('b1', 'Hero'), record('b2', 'Galería'), record('b3', 'Pie')],
				handleReorder
			}),
			onStructuralChange
		});
		await tick();

		fireDrag(handleOf(mounted.target), 'dragstart');
		await tick();
		const zones = zonesOf(mounted.target);
		fireDrag(zones[2], 'dragover');
		fireDrag(zones[2], 'drop');
		await settle();

		expect(handleReorder).toHaveBeenCalledWith(0, 2);
		expect(onStructuralChange).toHaveBeenCalled();
		// El gesto terminó: la capa se desmonta sola, sin que nadie la apague a mano.
		expect(mounted.target.querySelector('.vega-visual-overlay-drop-zones')).toBeNull();
	});

	test('un reorden que no cambió nada no pide vista previa nueva', async () => {
		const onStructuralChange = vi.fn();
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b1',
			blocks: [block('b1', 'hero'), block('b2', 'gallery')],
			blocksState: fakeBlocksState({
				records: [record('b1', 'Hero'), record('b2', 'Galería')],
				handleReorder: vi.fn(async () => false)
			}),
			onStructuralChange
		});
		await tick();

		fireDrag(handleOf(mounted.target), 'dragstart');
		await tick();
		fireDrag(zonesOf(mounted.target)[1], 'drop');
		await settle();

		expect(onStructuralChange).not.toHaveBeenCalled();
	});

	test('la guía cae DEBAJO al arrastrar hacia abajo y ENCIMA al arrastrar hacia arriba', async () => {
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b2',
			blocks: [block('b1', 'hero'), block('b2', 'gallery'), block('b3', 'footer')],
			blocksState: fakeBlocksState({
				records: [record('b1', 'Hero'), record('b2', 'Galería'), record('b3', 'Pie')]
			})
		});
		await tick();

		fireDrag(handleOf(mounted.target), 'dragstart');
		await tick();

		// Hacia abajo (del índice 1 al 2): el hueco va DEBAJO del sobrevolado.
		fireDrag(zonesOf(mounted.target)[2], 'dragover');
		await tick();
		expect(
			zonesOf(mounted.target)[2].classList.contains('vega-visual-overlay-drop-zone--after')
		).toBe(true);

		// Hacia arriba (del 1 al 0): ENCIMA.
		fireDrag(zonesOf(mounted.target)[0], 'dragover');
		await tick();
		expect(
			zonesOf(mounted.target)[0].classList.contains('vega-visual-overlay-drop-zone--before')
		).toBe(true);
		expect(
			zonesOf(mounted.target)[2].classList.contains('vega-visual-overlay-drop-zone--after')
		).toBe(false);
	});

	test('soltar el arrastre a medias (dragend) no reordena y quita la capa', async () => {
		const handleReorder = vi.fn(async () => true);
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b1',
			blocks: [block('b1', 'hero'), block('b2', 'gallery')],
			blocksState: fakeBlocksState({
				records: [record('b1', 'Hero'), record('b2', 'Galería')],
				handleReorder
			})
		});
		await tick();

		fireDrag(handleOf(mounted.target), 'dragstart');
		await tick();
		fireDrag(zonesOf(mounted.target)[1], 'dragover');
		fireDrag(handleOf(mounted.target), 'dragend');
		await settle();

		expect(handleReorder).not.toHaveBeenCalled();
		expect(mounted.target.querySelector('.vega-visual-overlay-drop-zones')).toBeNull();
	});

	test('las flechas sobre el asa mueven sin arrastrar (vía accesible del mismo camino)', async () => {
		const handleReorder = vi.fn(async () => true);
		const onStructuralChange = vi.fn();
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b2',
			blocks: [block('b1', 'hero'), block('b2', 'gallery')],
			blocksState: fakeBlocksState({
				records: [record('b1', 'Hero'), record('b2', 'Galería')],
				handleReorder
			}),
			onStructuralChange
		});
		await tick();

		handleOf(mounted.target).dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
		);
		await settle();

		expect(handleReorder).toHaveBeenCalledWith(1, 0);
		expect(onStructuralChange).toHaveBeenCalled();
	});

	test('con un borrador sin guardar, el asa ni se agarra ni se pulsa', async () => {
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b1',
			blocks: [block('b1', 'hero'), block('b2', 'gallery')],
			blocksState: fakeBlocksState({
				records: [record('b1', 'Hero'), record('b2', 'Galería')],
				anyDirtyIds: new Set(['b1'])
			})
		});
		await tick();

		const handle = handleOf(mounted.target) as HTMLButtonElement;
		expect(handle.disabled).toBe(true);
		// `disabled` no frena el arrastre nativo: hace falta que `draggable` caiga con él.
		expect(handle.draggable).toBe(false);
	});

	test('el puente y los registros en ORDEN distinto: los índices se traducen por id', async () => {
		const handleReorder = vi.fn(async () => true);
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b3',
			// El sitio pinta b3 el primero; `blocksState` lo tiene el último.
			blocks: [block('b3', 'footer'), block('b1', 'hero'), block('b2', 'gallery')],
			blocksState: fakeBlocksState({
				records: [record('b1', 'Hero'), record('b2', 'Galería'), record('b3', 'Pie')],
				handleReorder
			})
		});
		await tick();

		fireDrag(handleOf(mounted.target), 'dragstart');
		await tick();
		// Se suelta sobre el SEGUNDO destino del lienzo, que es el registro `b1` (índice 0).
		fireDrag(zonesOf(mounted.target)[1], 'drop');
		await settle();

		expect(handleReorder).toHaveBeenCalledWith(2, 0);
	});

	test('un id del puente que no casa con ningún registro no mueve nada', async () => {
		const handleReorder = vi.fn(async () => true);
		mounted = mountOverlay({
			status: 'ready',
			selectedId: 'b1',
			blocks: [block('b1', 'hero'), block('fantasma', 'gallery')],
			blocksState: fakeBlocksState({
				records: [record('b1', 'Hero'), record('b2', 'Galería')],
				handleReorder
			})
		});
		await tick();

		fireDrag(handleOf(mounted.target), 'dragstart');
		await tick();
		fireDrag(zonesOf(mounted.target)[1], 'drop');
		await settle();

		expect(handleReorder).not.toHaveBeenCalled();
	});
});
