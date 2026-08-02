/**
 * Suite de componente de `VisualBlockTree.svelte` (tarea "árbol de secciones y el inspector",
 * ampliada por "acciones estructurales desde el editor visual"): montaje real contra un
 * `BlocksState` de MENTIRA (`fakeBlocksState`, más abajo) — a diferencia de
 * `VisualEditorScreen.svelte.test.ts` (que monta la pantalla ENTERA sobre `createBlocksState()`
 * real), aquí basta un doble mínimo: este componente LEE la interfaz, dispara `onSelect` y llama a
 * las mutaciones de `BlocksState` (nunca las reimplementa, ver la cabecera del propio componente).
 * Cubre lo que la suite de la pantalla no aísla tan barato: las insignias de tipo, los avisos por
 * estado (cargando/oculto/vacío), la mecánica del cajón responsive (abrir/cerrar/`Escape`/fondo), y
 * ahora también que cada botón de acción llama al método correcto de `blocks` con el argumento
 * correcto, que las guardas deshabilitan en el momento debido, y que `onStructuralChange` se dispara
 * tras cada mutación que de verdad cambió algo (integración de verdad con `port`/`fetch`: ver
 * `VisualEditorScreen.svelte.test.ts`).
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import VisualBlockTree from './VisualBlockTree.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BlocksState, BlocksStatus } from '$lib/form/blocks-state.svelte';
import type { ResolvedBlockType, ResolvedContentType } from '$lib/model/types';
import type { VegaRecord } from '$lib/backend';
import { t as translate } from '$lib/i18n';
import { focusLost } from './a11y-audit';

/** `schema.fields: []` (aunque este doble nunca declara bloques con ficheros): `<DeleteConfirm>`
 *  (montado por este componente, ver su cabecera) lee `blocks.childType.schema.fields` para el
 *  aviso "los ficheros adjuntos no se recuperan" — sin este campo, el test de borrado revienta al
 *  abrir el diálogo, no al comprobar nada de este doble. */
const CHILD_TYPE = {
	label: 'Bloques',
	labelSingular: 'Bloque',
	schema: { fields: [] }
} as unknown as ResolvedContentType;

const HERO_TYPE = { name: 'hero', label: 'Portada', icon: null } as unknown as ResolvedBlockType;
const GALLERY_TYPE = {
	name: 'gallery',
	label: 'Galería',
	icon: null
} as unknown as ResolvedBlockType;

function record(id: string, heading: string): VegaRecord {
	return { id, type: 'post_block', values: { heading } };
}

interface FakeOptions {
	status?: BlocksStatus;
	hidden?: boolean;
	records?: VegaRecord[];
	dirtyIds?: Set<string>;
	savingIds?: Set<string>;
	hasTypeColumn?: boolean;
	blockTypeOf?: (r: VegaRecord) => ResolvedBlockType | null;
	blockTypeRawName?: (r: VegaRecord) => string | null;
	childType?: ResolvedContentType | null;
	blockDuplicateAllowed?: boolean;
	hasTypeMenu?: boolean;
	blockTypes?: ResolvedBlockType[];
	structuralBusy?: boolean;
	pendingDelete?: VegaRecord | null;
	deleting?: boolean;
	announce?: string;
	handleCreate?: BlocksState['handleCreate'];
	handleDuplicate?: BlocksState['handleDuplicate'];
	requestDelete?: BlocksState['requestDelete'];
	confirmDelete?: BlocksState['confirmDelete'];
	cancelDelete?: BlocksState['cancelDelete'];
	handleReorder?: BlocksState['handleReorder'];
	say?: BlocksState['say'];
}

/** Doble MÍNIMO de `BlocksState` (ver cabecera): implementa lo que `VisualBlockTree` LEE, más
 *  espías (`vi.fn`) por defecto para las seis mutaciones que este componente ahora SÍ llama — cada
 *  test que necesite comprobar una llamada concreta pasa su propio espía en `opts`. */
function fakeBlocksState(opts: FakeOptions = {}): BlocksState {
	const records = opts.records ?? [];
	const status = opts.status ?? { kind: 'ready', records };
	const dirtyIds = opts.dirtyIds ?? new Set<string>();
	const savingIds = opts.savingIds ?? new Set<string>();
	return {
		status,
		records,
		loading: status.kind === 'loading',
		failed: status.kind === 'error',
		hidden: opts.hidden ?? false,
		blocksConfig: null,
		childType: opts.childType ?? CHILD_TYPE,
		structuralFields: [],
		blockDuplicateAllowed: opts.blockDuplicateAllowed ?? false,
		hasTypeColumn: opts.hasTypeColumn ?? false,
		hasTypeMenu: opts.hasTypeMenu ?? false,
		blockTypes: opts.blockTypes ?? [],
		structuralBusy: opts.structuralBusy ?? false,
		pendingDelete: opts.pendingDelete ?? null,
		deleting: opts.deleting ?? false,
		announce: opts.announce ?? '',
		say: opts.say ?? vi.fn(),
		anyDirty: dirtyIds.size > 0,
		anySaving: savingIds.size > 0,
		isExpanded: () => false,
		isDirty: (id) => dirtyIds.has(id),
		isSaving: (id) => savingIds.has(id),
		isDuplicating: () => false,
		blockTypeOf: opts.blockTypeOf ?? (() => null),
		blockTypeRawName: opts.blockTypeRawName ?? (() => null),
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
		cancelDelete: opts.cancelDelete ?? vi.fn(),
		confirmDelete: opts.confirmDelete ?? vi.fn(async () => {}),
		handleReorder: opts.handleReorder ?? vi.fn(async () => false)
	} satisfies BlocksState;
}

/** `model` MÍNIMO (ver `TrashAvailabilityModel`/`isTrashAvailable`): `<DeleteConfirm>` lo lee de
 *  forma SÍNCRONA en cuanto `open` es `true` (el test de borrado, más abajo), así que hace falta
 *  aunque el resto de la suite ni sepa que existe — sin él, `ctx.model.revisions.enabled` revienta
 *  antes de que el propio diálogo pueda degradar nada. Con `types: []` el aviso de referencias
 *  (`createDeleteReferencesGuard`) tampoco necesita `ctx.port.list`: sin tipos no hay candidatos
 *  que consultar. */
function fakeCtx(): VegaAppContext {
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
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
	});
	return { target, instance };
}

/** Drena la cadena de microtasks de una mutación `async` disparada por un `click` (mismo criterio
 *  que `flush()` de `VisualEditorScreen.svelte.test.ts`, en miniatura: aquí no hay temporizadores
 *  reales que esperar, solo el propio `await` de la función del componente). */
async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await tick();
}

describe('VisualBlockTree.svelte', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.restoreAllMocks();
	});

	test('lista los bloques en orden, con su título y el contador', () => {
		const blocks = fakeBlocksState({ records: [record('b1', 'Hero'), record('b2', 'Features')] });
		mounted = mountTree(blocks, null);

		const titles = Array.from(mounted.target.querySelectorAll('.vega-tree-title')).map(
			(el) => el.textContent
		);
		expect(titles).toEqual(['Hero', 'Features']);
		expect(mounted.target.querySelector('.vega-tree-count')?.textContent).toBe('2');
	});

	test('insignia de tipo: conocido, retirado del manifiesto, y sin tipo', () => {
		const blocks = fakeBlocksState({
			records: [record('b1', 'Hero'), record('b2', 'Viejo'), record('b3', 'Suelto')],
			hasTypeColumn: true,
			blockTypeOf: (r) => (r.id === 'b1' ? HERO_TYPE : null),
			blockTypeRawName: (r) => (r.id === 'b2' ? 'carrusel' : r.id === 'b3' ? null : null)
		});
		mounted = mountTree(blocks, null);

		const badges = Array.from(mounted.target.querySelectorAll('.vega-tree-type')).map((el) =>
			el.textContent?.trim()
		);
		expect(badges).toEqual([
			'Portada',
			translate('es', 'editor.blocks.type.unknown', { name: 'carrusel' }),
			translate('es', 'editor.blocks.type.none')
		]);
	});

	test('marca sucio con un punto y guardándose con texto (guardándose gana si coinciden)', () => {
		const blocks = fakeBlocksState({
			records: [record('b1', 'Hero'), record('b2', 'Features'), record('b3', 'Precios')],
			dirtyIds: new Set(['b1', 'b3']),
			savingIds: new Set(['b3'])
		});
		mounted = mountTree(blocks, null);

		const rows = mounted.target.querySelectorAll('.vega-tree-row');
		expect(rows[0].querySelector('.vega-tree-dirty')).not.toBeNull();
		expect(rows[0].querySelector('.vega-tree-saving')).toBeNull();
		expect(rows[1].querySelector('.vega-tree-dirty')).toBeNull();
		expect(rows[1].querySelector('.vega-tree-saving')).toBeNull();
		// b3: sucio Y guardándose — el texto "Guardando…" gana, no se duplica el punto.
		expect(rows[2].querySelector('.vega-tree-saving')?.textContent).toBe(
			translate('es', 'editor.saving')
		);
		expect(rows[2].querySelector('.vega-tree-dirty')).toBeNull();
	});

	test('seleccionar una fila marca `aria-current` y dispara `onSelect`', async () => {
		const onSelect = vi.fn();
		const blocks = fakeBlocksState({ records: [record('b1', 'Hero'), record('b2', 'Features')] });
		mounted = mountTree(blocks, 'b1', onSelect);

		const rows = mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-row');
		expect(rows[0].getAttribute('aria-current')).toBe('true');
		expect(rows[1].getAttribute('aria-current')).toBeNull();

		rows[1].click();
		await tick();
		expect(onSelect).toHaveBeenCalledWith('b2');
	});

	test('cargando / oculto / vacío: cada estado tiene su propio aviso', async () => {
		const loading = fakeBlocksState({ status: { kind: 'loading' }, records: [] });
		mounted = mountTree(loading, null);
		expect(mounted.target.querySelector('.vega-tree-notice')?.textContent).toBe(
			translate('es', 'common.loading')
		);
		await unmount(mounted.instance);
		mounted.target.remove();

		const hidden = fakeBlocksState({ hidden: true, records: [] });
		mounted = mountTree(hidden, null);
		expect(mounted.target.querySelector('.vega-tree-notice[role="alert"]')?.textContent).toBe(
			translate('es', 'editor.visual.tree.unavailable')
		);
		await unmount(mounted.instance);
		mounted.target.remove();

		const empty = fakeBlocksState({ records: [] });
		mounted = mountTree(empty, null);
		expect(mounted.target.querySelector('.vega-tree-notice')?.textContent).toContain(
			'Todavía no hay'
		);
	});

	test('cajón: el botón lo abre, `Escape` lo cierra y devuelve el foco', async () => {
		const blocks = fakeBlocksState({ records: [record('b1', 'Hero')] });
		mounted = mountTree(blocks, null);

		const toggle = mounted.target.querySelector<HTMLButtonElement>('.vega-tree-toggle')!;
		const panel = mounted.target.querySelector<HTMLElement>('.vega-tree-panel')!;
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(panel.classList.contains('vega-tree-panel--open')).toBe(false);

		toggle.click();
		await tick();
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(panel.classList.contains('vega-tree-panel--open')).toBe(true);
		expect(mounted.target.querySelector('.vega-tree-backdrop')).not.toBeNull();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await tick();
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(panel.classList.contains('vega-tree-panel--open')).toBe(false);
		expect(document.activeElement).toBe(toggle);
	});

	test('cajón: clicar el fondo cierra, y elegir una fila también', async () => {
		const onSelect = vi.fn();
		const blocks = fakeBlocksState({ records: [record('b1', 'Hero')] });
		mounted = mountTree(blocks, null, onSelect);

		const toggle = mounted.target.querySelector<HTMLButtonElement>('.vega-tree-toggle')!;
		toggle.click();
		await tick();
		mounted.target.querySelector<HTMLButtonElement>('.vega-tree-backdrop')!.click();
		await tick();
		expect(toggle.getAttribute('aria-expanded')).toBe('false');

		toggle.click();
		await tick();
		mounted.target.querySelector<HTMLButtonElement>('.vega-tree-row')!.click();
		await tick();
		expect(onSelect).toHaveBeenCalledWith('b1');
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
	});

	test('D2 (encargo de accesibilidad): seleccionar una fila CON el cajón abierto devuelve el foco al disparador, no a `<body>`', async () => {
		const blocks = fakeBlocksState({ records: [record('b1', 'Hero')] });
		mounted = mountTree(blocks, null);

		const toggle = mounted.target.querySelector<HTMLButtonElement>('.vega-tree-toggle')!;
		toggle.click();
		await tick();

		// La fila TENÍA el foco justo antes de la selección (mismo caso que un `Enter`/`Space` por
		// teclado sobre el `<button>` de la fila): jsdom no aplica `@media`, así que lo que aquí se
		// mide no es la geometría (`visibility`, eso lo mide el gate de la tarea siguiente contra un
		// navegador real) sino la MECÁNICA — que `selectRow()` devuelve el foco al disparador en vez
		// de dejarlo colgado en un botón que el cierre podría dejar sin destino.
		const row = mounted.target.querySelector<HTMLButtonElement>('.vega-tree-row')!;
		row.focus();
		row.click();
		await tick();

		expect(focusLost(mounted.target, document.activeElement)).toBe(false);
		expect(document.activeElement).toBe(toggle);
	});

	test('D2: en escritorio (`open` nunca `true`) seleccionar una fila NO toca el foco', async () => {
		const blocks = fakeBlocksState({ records: [record('b1', 'Hero')] });
		mounted = mountTree(blocks, null);
		await tick(); // deja asentar el montaje inicial (bind:this de `toggleEl`), mismo motivo que D1

		// Sin abrir el cajón: `open` sigue en `false` (arranque de escritorio, ver cabecera).
		const row = mounted.target.querySelector<HTMLButtonElement>('.vega-tree-row')!;
		const outside = document.createElement('button');
		document.body.appendChild(outside);
		outside.focus();

		row.click();
		await tick();

		expect(document.activeElement).toBe(outside);
		outside.remove();
	});

	// ————— Acciones estructurales (tarea "acciones estructurales desde el editor visual") —————

	test('el anuncio de reorden se pinta en una región `aria-live`, la MISMA que produce `blocks-state.svelte.ts`', () => {
		const blocks = fakeBlocksState({
			records: [record('b1', 'Hero')],
			announce: '«Hero» movido a la posición 1 de 2'
		});
		mounted = mountTree(blocks, null);

		const live = mounted.target.querySelector('[aria-live="polite"]');
		expect(live?.textContent).toBe('«Hero» movido a la posición 1 de 2');
	});

	test('la región `aria-live` vive FUERA del panel del cajón (o el cajón cerrado la deja muda)', () => {
		// Regresión del choque entre D2 y D3, cazado revisando el diff y no por el gate. D2 le puso
		// `visibility: hidden` al cajón CERRADO para sacarlo del orden de tabulación; un lector de
		// pantalla no lee un subárbol `visibility: hidden`, así que con la región dentro del panel
		// los anuncios se callan entre 901 y 1180 px de ancho — la banda en la que el lienzo sigue
		// activo (900 px, `NARROW_QUERY` de `VisualEditorScreen.svelte`) y el árbol ya es cajón
		// (1180 px, `TREE_QUERY`), con el cajón cerrado, que es su estado normal. Ahí se selecciona
		// y se mueve sin abrirlo (clic en el lienzo, barra flotante, `Alt+↑`/`Alt+↓`).
		//
		// jsdom no evalúa media queries, así que NO se mide la `visibility` computada: se mide la
		// propiedad que la causa, que es dónde CUELGA la región. Es la comprobación que se pone
		// roja si alguien la devuelve dentro del panel.
		const blocks = fakeBlocksState({
			records: [record('b1', 'Hero')],
			announce: '«Hero» movido a la posición 1 de 2'
		});
		mounted = mountTree(blocks, null);

		const live = mounted.target.querySelector('[aria-live="polite"]');
		const panel = mounted.target.querySelector('#vega-block-tree-panel');
		expect(live).not.toBeNull();
		expect(panel).not.toBeNull();
		expect(panel?.contains(live!)).toBe(false);
		// Y sigue habiendo UNA sola región de anuncio, no dos (la de dentro se retiró al sacarla).
		expect(mounted.target.querySelectorAll('.vega-visually-hidden[aria-live]')).toHaveLength(1);
	});

	test('"Añadir" sin menú de tipos: crea sin tipo y pide vista previa nueva', async () => {
		const handleCreate = vi.fn(async () => {});
		const onStructuralChange = vi.fn();
		const blocks = fakeBlocksState({ records: [record('b1', 'Hero')], handleCreate });
		mounted = mountTree(blocks, null, vi.fn(), onStructuralChange);

		mounted.target.querySelector<HTMLButtonElement>('.vega-tree-add')!.click();
		await settle();

		expect(handleCreate).toHaveBeenCalledWith(null);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
	});

	test('"Añadir" con menú de tipos: abre el menú, listar tipos y elegir uno crea CON ESE tipo', async () => {
		const handleCreate = vi.fn(async () => {});
		const onStructuralChange = vi.fn();
		const blocks = fakeBlocksState({
			records: [],
			hasTypeMenu: true,
			blockTypes: [HERO_TYPE, GALLERY_TYPE],
			handleCreate
		});
		mounted = mountTree(blocks, null, vi.fn(), onStructuralChange);
		await settle();

		const trigger = mounted.target.querySelector<HTMLButtonElement>('.vega-tree-add')!;
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		trigger.click();
		await settle();
		expect(trigger.getAttribute('aria-expanded')).toBe('true');

		const items = mounted.target.querySelectorAll<HTMLButtonElement>(
			'.vega-tree-add-menu [role="menuitem"]'
		);
		expect(items).toHaveLength(2);
		items[1].click(); // "Galería"
		await settle();

		expect(handleCreate).toHaveBeenCalledWith(GALLERY_TYPE);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
		// El menú se cierra y el foco vuelve al disparador (mismo criterio que `RecordBlocks.svelte`).
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(trigger);
	});

	test('duplicar: llama a `handleDuplicate` con ESE registro y pide vista previa nueva; sin permiso, no hay botón', async () => {
		const handleDuplicate = vi.fn(async () => {});
		const onStructuralChange = vi.fn();
		const b1 = record('b1', 'Hero');
		const b2 = record('b2', 'Features');
		const blocks = fakeBlocksState({
			records: [b1, b2],
			blockDuplicateAllowed: true,
			handleDuplicate
		});
		mounted = mountTree(blocks, null, vi.fn(), onStructuralChange);

		const rows = mounted.target.querySelectorAll('.vega-tree-item');
		const duplicateButtons = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-actions .vega-tree-action')
		).filter((btn) => btn.getAttribute('aria-label')?.startsWith('Duplicar'));
		expect(duplicateButtons).toHaveLength(2);
		expect(rows).toHaveLength(2);

		duplicateButtons[1].click(); // fila de b2
		await settle();

		expect(handleDuplicate).toHaveBeenCalledWith(b2);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);

		await unmount(mounted.instance);
		mounted.target.remove();

		const noPermission = fakeBlocksState({ records: [b1], blockDuplicateAllowed: false });
		mounted = mountTree(noPermission, null);
		expect(
			Array.from(mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-action')).some(
				(btn) => btn.getAttribute('aria-label')?.startsWith('Duplicar')
			)
		).toBe(false);
	});

	test('mover arriba/abajo: llama a `handleReorder(i, i±1)`, deshabilitado en los extremos, solo pide vista previa si de verdad movió algo', async () => {
		const handleReorder = vi.fn(async (from: number, to: number) => from !== to);
		const onStructuralChange = vi.fn();
		const blocks = fakeBlocksState({
			records: [record('b1', 'Hero'), record('b2', 'Features'), record('b3', 'Precios')],
			handleReorder
		});
		mounted = mountTree(blocks, null, vi.fn(), onStructuralChange);

		const upButtons = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-action')
		).filter((btn) => btn.getAttribute('aria-label')?.startsWith('Subir'));
		const downButtons = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-action')
		).filter((btn) => btn.getAttribute('aria-label')?.startsWith('Bajar'));
		expect(upButtons).toHaveLength(3);
		expect(downButtons).toHaveLength(3);

		// Extremos deshabilitados: la primera fila no sube, la última no baja.
		expect(upButtons[0].disabled).toBe(true);
		expect(downButtons[2].disabled).toBe(true);
		// La fila del medio SÍ puede moverse en las dos direcciones.
		expect(upButtons[1].disabled).toBe(false);
		expect(downButtons[1].disabled).toBe(false);

		downButtons[1].click(); // "Features" (índice 1) → índice 2
		await settle();
		expect(handleReorder).toHaveBeenCalledWith(1, 2);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
	});

	test('mover no pide vista previa nueva si `handleReorder` no cambió nada (guard interno de `blocks-state.svelte.ts`)', async () => {
		const handleReorder = vi.fn(async () => false);
		const onStructuralChange = vi.fn();
		const blocks = fakeBlocksState({
			records: [record('b1', 'Hero'), record('b2', 'Features')],
			handleReorder
		});
		mounted = mountTree(blocks, null, vi.fn(), onStructuralChange);

		const downButtons = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-action')
		).filter((btn) => btn.getAttribute('aria-label')?.startsWith('Bajar'));
		downButtons[0].click();
		await settle();

		expect(handleReorder).toHaveBeenCalledWith(0, 1);
		expect(onStructuralChange).not.toHaveBeenCalled();
	});

	test('el ancla de foco de reserva de `DeleteConfirm` vive FUERA del panel, y es enfocable de verdad', () => {
		// Segunda puerta del MISMO agujero que la región `aria-live` de arriba, cazada por la
		// revisión: `<DeleteConfirm>` cae a `fallbackFocusEl` justo cuando el borrado tuvo éxito y
		// se llevó por delante el botón que lo disparó, y borrar se puede pedir SIN abrir el cajón
		// (papelera de la barra flotante del lienzo, o `Supr`/`Retroceso` de la pantalla). Con el
		// ancla dentro del panel, el `visibility: hidden` del cajón cerrado la deja inerte y
		// `.focus()` es un no-op MUDO: el foco acaba en `<body>`.
		//
		// jsdom NO implementa la infocusabilidad por `visibility: hidden` (misma limitación que la
		// cabecera de `VisualInspector.svelte` admite para D1), así que ese efecto NO se puede
		// medir aquí. Lo que sí se mide es su causa: dónde CUELGA el ancla, y que sea un destino de
		// foco real y no un `<div>` inerte. Se pone rojo si alguien la devuelve dentro del panel.
		const blocks = fakeBlocksState({ records: [record('b1', 'Hero')] });
		mounted = mountTree(blocks, null);

		const panel = mounted.target.querySelector('#vega-block-tree-panel');
		const anchor = mounted.target.querySelector<HTMLElement>(
			'.vega-visually-hidden[tabindex="-1"]'
		);
		expect(anchor).not.toBeNull();
		expect(panel?.contains(anchor!)).toBe(false);

		// Enfocable de verdad: `.vega-visually-hidden` recorta con `clip`, nunca con
		// `display`/`visibility`, así que el nodo sigue aceptando el foco.
		document.body.append(mounted.target);
		anchor!.focus();
		expect(document.activeElement).toBe(anchor);
		expect(focusLost(mounted.target, document.activeElement)).toBe(false);
		mounted.target.remove();
	});

	test('borrar: pide `requestDelete`, y confirmar en `DeleteConfirm` llama a `confirmDelete` y pide vista previa nueva', async () => {
		const requestDelete = vi.fn();
		const b1 = record('b1', 'Hero');
		const blocks = fakeBlocksState({ records: [b1], requestDelete });
		mounted = mountTree(blocks, null);

		const deleteButton = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-action')
		).find((btn) => btn.getAttribute('aria-label')?.startsWith('Borrar'))!;
		deleteButton.click();
		await tick();

		expect(requestDelete).toHaveBeenCalledWith(b1);

		// `DeleteConfirm` lo abre `blocks.pendingDelete` (dueño externo, no este componente): se
		// remonta con `pendingDelete` ya puesto, mismo criterio que `RecordBlocks.svelte.test.ts`.
		await unmount(mounted.instance);
		mounted.target.remove();

		const confirmDelete = vi.fn(async () => {});
		const onStructuralChange = vi.fn();
		const pendingBlocks = fakeBlocksState({ records: [b1], pendingDelete: b1, confirmDelete });
		mounted = mountTree(pendingBlocks, null, vi.fn(), onStructuralChange);

		const confirmButton = mounted.target.querySelector<HTMLButtonElement>('.vega-delete-confirm')!;
		expect(confirmButton).not.toBeNull();
		confirmButton.click();
		await settle();

		expect(confirmDelete).toHaveBeenCalledTimes(1);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
	});

	test('acciones de fila deshabilitadas mientras hay algo sin guardar, guardándose, u ocupado en estructura', () => {
		const blocks = fakeBlocksState({
			records: [record('b1', 'Hero'), record('b2', 'Features')],
			blockDuplicateAllowed: true,
			dirtyIds: new Set(['b1']) // basta UN bloque sucio para congelar TODAS las filas
		});
		mounted = mountTree(blocks, null);

		const actions = mounted.target.querySelectorAll<HTMLButtonElement>('.vega-tree-action');
		// Duplicar/subir/bajar se congelan con `anyDirty`; borrar NO (mismo criterio que
		// `RecordBlocks.svelte`, que tampoco lo hace para su botón de borrar).
		const duplicateBtn = Array.from(actions).find((b) =>
			b.getAttribute('aria-label')?.startsWith('Duplicar')
		)!;
		const deleteBtn = Array.from(actions).find((b) =>
			b.getAttribute('aria-label')?.startsWith('Borrar')
		)!;
		expect(duplicateBtn.disabled).toBe(true);
		expect(deleteBtn.disabled).toBe(false);
	});
});
