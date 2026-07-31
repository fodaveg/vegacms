/**
 * Suite de componente de `VisualBlockTree.svelte` (tarea "árbol de secciones y el inspector"):
 * montaje real contra un `BlocksState` de MENTIRA (`fakeBlocksState`, más abajo) — a diferencia de
 * `VisualEditorScreen.svelte.test.ts` (que monta la pantalla ENTERA sobre `createBlocksState()`
 * real), aquí basta un doble mínimo: este componente solo LEE la interfaz y dispara `onSelect`,
 * nunca muta bloques por su cuenta (ver la cabecera del propio componente). Cubre lo que la
 * suite de la pantalla no aísla tan barato: las insignias de tipo, los avisos por estado
 * (cargando/oculto/vacío) y la mecánica del cajón responsive (abrir/cerrar/`Escape`/fondo).
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import VisualBlockTree from './VisualBlockTree.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BlocksState, BlocksStatus } from '$lib/form/blocks-state.svelte';
import type { ResolvedBlockType, ResolvedContentType } from '$lib/model/types';
import type { VegaRecord } from '$lib/backend';
import { t as translate } from '$lib/i18n';

const CHILD_TYPE = { label: 'Bloques' } as unknown as ResolvedContentType;

const HERO_TYPE = { name: 'hero', label: 'Portada', icon: null } as unknown as ResolvedBlockType;

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
}

/** Doble MÍNIMO de `BlocksState` (ver cabecera): solo implementa lo que `VisualBlockTree` LEE.
 *  El resto de la interfaz (mutaciones estructurales) son no-ops que no debería llamar nunca —
 *  si algún día lo hiciera, sería justo la regresión que el encargo prohíbe ("no reescribas la
 *  lógica de bloques"). */
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
		blockDuplicateAllowed: false,
		hasTypeColumn: opts.hasTypeColumn ?? false,
		hasTypeMenu: false,
		blockTypes: [],
		structuralBusy: false,
		pendingDelete: null,
		deleting: false,
		announce: '',
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
		handleCreate: async () => {},
		handleDuplicate: async () => {},
		requestDelete: () => {},
		cancelDelete: () => {},
		confirmDelete: async () => {},
		handleReorder: async () => false
	} satisfies BlocksState;
}

function fakeCtx(): VegaAppContext {
	return {
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es'
	} as unknown as VegaAppContext;
}

function mountTree(
	blocks: BlocksState,
	selectedId: string | null,
	onSelect: (id: string) => void = vi.fn()
): { target: HTMLElement; instance: ReturnType<typeof mount> } {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(VisualBlockTree, {
		target,
		props: { blocks, selectedId, onSelect },
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
	});
	return { target, instance };
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
});
