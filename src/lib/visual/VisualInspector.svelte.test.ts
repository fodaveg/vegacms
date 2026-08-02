/**
 * Suite de componente de `VisualInspector.svelte` (tarea "árbol de secciones y el inspector"):
 * `BlockEditor.svelte` se monta TAL CUAL (§encargo, ver la cabecera del propio componente), así
 * que hace falta un `ResolvedContentType` de bloque REAL (`resolveContentModel`, mismo criterio
 * que `RecordBlocks.svelte.test.ts`) para que sus campos/validación tengan sentido — pero el
 * `BlocksState` que lo rodea sigue siendo un doble mínimo (`fakeBlocksState`, igual que
 * `VisualBlockTree.svelte.test.ts`): este componente tampoco muta bloques por su cuenta, solo
 * reenvía a `blocks.setDirty`/`.handleBlockSaved`/etc. — lo que aquí se comprueba es justo ESE
 * reenvío, no la lógica de guardado (ya cubierta en `BlockEditor.svelte.test.ts`/
 * `RecordBlocks.svelte.test.ts`).
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import VisualInspector from './VisualInspector.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BlocksState, BlocksStatus } from '$lib/form/blocks-state.svelte';
import type { ContentType } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import type { VegaRecord } from '$lib/backend';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';
import { focusLost } from './a11y-audit';

const postType: ContentType = {
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

const postBlockType: ContentType = {
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

/** `childType`/`structuralFields` REALES (ver cabecera): construidos una vez, compartidos por
 *  todos los tests de este fichero — `resolveContentModel` es puro y determinista. */
function buildChildType(): { childType: ResolvedContentType; structuralFields: string[] } {
	const model = resolveContentModel({
		types: [postType, postBlockType],
		manifestRaw: {
			schemaVersion: 1,
			collections: {
				post: { blocks: { collection: 'post_block', parentField: 'post', orderField: 'sort' } }
			}
		}
	});
	expect(model.warnings).toEqual([]);
	const parentType = model.types.find((t) => t.name === 'post')!;
	const childType = model.types.find((t) => t.name === 'post_block')!;
	return {
		childType,
		structuralFields: [parentType.blocks!.parentField, parentType.blocks!.orderField]
	};
}

function record(id: string, heading: string): VegaRecord {
	return { id, type: 'post_block', values: { post: 'rec-1', sort: 0, heading } };
}

interface FakeOptions {
	status?: BlocksStatus;
	hidden?: boolean;
	records?: VegaRecord[];
	setDirty?: BlocksState['setDirty'];
	handleBlockSaved?: BlocksState['handleBlockSaved'];
}

function fakeBlocksState(
	opts: FakeOptions,
	childType: ResolvedContentType,
	structuralFields: string[]
): BlocksState {
	const records = opts.records ?? [];
	const status = opts.status ?? { kind: 'ready', records };
	return {
		status,
		records,
		loading: status.kind === 'loading',
		failed: status.kind === 'error',
		hidden: opts.hidden ?? false,
		blocksConfig: {
			collection: 'post_block',
			parentField: 'post',
			orderField: 'sort',
			typeField: null,
			dataField: null
		},
		childType,
		structuralFields,
		blockDuplicateAllowed: false,
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
		setDirty: opts.setDirty ?? (() => {}),
		setSaving: () => {},
		handleBlockDraftChange: () => {},
		handleBlockSaved: opts.handleBlockSaved ?? (() => {}),
		handleCreate: async () => {},
		handleDuplicate: async () => {},
		requestDelete: () => {},
		cancelDelete: () => {},
		confirmDelete: async () => {},
		handleReorder: async () => false
	} satisfies BlocksState;
}

function fakeCtx(update: ReturnType<typeof vi.fn>): VegaAppContext {
	return {
		port: { update },
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() },
		nav: { toSettings: vi.fn() }
	} as unknown as VegaAppContext;
}

function mountInspector(
	blocks: BlocksState,
	selectedId: string | null,
	ctx: VegaAppContext,
	onBlockSaved: () => void = vi.fn()
): { target: HTMLElement; instance: ReturnType<typeof mount> } {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(VisualInspector, {
		target,
		props: { blocks, selectedId, onBlockSaved },
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance };
}

/** Props REACTIVAS (`$state`, mismo patrón que `PreviewPanel.svelte.test.ts`): D1 necesita mutar
 *  `selectedId` sobre un montaje YA vivo (es justo el cambio que dispara el `$effect.pre`/`$effect`
 *  de foco, ver la cabecera del componente), no crear un montaje nuevo con el valor ya puesto. */
function mountInspectorReactive(
	blocks: BlocksState,
	selectedId: string | null,
	ctx: VegaAppContext
): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	props: { selectedId: string | null };
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const props = $state({ blocks, selectedId, onBlockSaved: vi.fn() });
	const instance = mount(VisualInspector, {
		target,
		props,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance, props };
}

/** Drena el `$effect.pre`/`$effect` de foco (ver cabecera del componente: el segundo mueve el foco
 *  dentro de un `tick().then(...)`, así que hace falta más de un `tick()` de Svelte para verlo
 *  resuelto). */
async function settleFocus(): Promise<void> {
	await tick();
	await Promise.resolve();
	await Promise.resolve();
	await tick();
}

describe('VisualInspector.svelte', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;
	const { childType, structuralFields } = buildChildType();

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.restoreAllMocks();
	});

	test('sin selección: estado vacío que dice qué hacer', () => {
		const update = vi.fn();
		const blocks = fakeBlocksState(
			{ records: [record('b1', 'Hero')] },
			childType,
			structuralFields
		);
		mounted = mountInspector(blocks, null, fakeCtx(update));

		expect(mounted.target.querySelector('.vega-inspector-notice')?.textContent).toBe(
			translate('es', 'editor.visual.inspector.empty')
		);
		// Montado pero OCULTO (ver cabecera, "SIEMPRE montados"): el editor de b1 sigue en el DOM.
		expect(mounted.target.querySelector('.vega-inspector-body')?.hasAttribute('hidden')).toBe(true);
	});

	test('selección que no casa con ningún registro: lo dice, no lo esconde', () => {
		const update = vi.fn();
		const blocks = fakeBlocksState(
			{ records: [record('b1', 'Hero')] },
			childType,
			structuralFields
		);
		mounted = mountInspector(blocks, 'fantasma', fakeCtx(update));

		const notice = mounted.target.querySelector('.vega-inspector-notice[role="alert"]');
		expect(notice?.textContent).toBe(translate('es', 'editor.visual.inspector.unknownBlock'));
	});

	test('bloques ocultos/cargando/vacíos: cada estado tiene su propio aviso', async () => {
		const update = vi.fn();
		const hidden = fakeBlocksState({ hidden: true, records: [] }, childType, structuralFields);
		mounted = mountInspector(hidden, null, fakeCtx(update));
		expect(mounted.target.querySelector('.vega-inspector-notice[role="alert"]')?.textContent).toBe(
			translate('es', 'editor.visual.tree.unavailable')
		);
		await unmount(mounted.instance);
		mounted.target.remove();

		const loading = fakeBlocksState(
			{ status: { kind: 'loading' }, records: [] },
			childType,
			structuralFields
		);
		mounted = mountInspector(loading, null, fakeCtx(update));
		expect(mounted.target.querySelector('.vega-inspector-notice')?.textContent).toBe(
			translate('es', 'common.loading')
		);
	});

	test('todos los editores están SIEMPRE montados: solo uno visible a la vez, oculto con `hidden`', () => {
		const update = vi.fn();
		const blocks = fakeBlocksState(
			{ records: [record('b1', 'Hero'), record('b2', 'Features')] },
			childType,
			structuralFields
		);
		mounted = mountInspector(blocks, 'b2', fakeCtx(update));

		const bodies = mounted.target.querySelectorAll('.vega-inspector-body');
		expect(bodies).toHaveLength(2);
		expect(bodies[0].hasAttribute('hidden')).toBe(true);
		expect(bodies[1].hasAttribute('hidden')).toBe(false);
		// Las dos fichas están de verdad en el DOM (no un `{#if}` que solo dejara la seleccionada).
		expect(mounted.target.querySelectorAll('.vega-block-save-button')).toHaveLength(2);
	});

	test('editar reenvía a `blocks.setDirty`; guardar reenvía a `handleBlockSaved` y a `onBlockSaved`', async () => {
		const update = vi.fn().mockResolvedValue({
			id: 'b1',
			type: 'post_block',
			values: { post: 'rec-1', sort: 0, heading: 'Hero guardado' }
		});
		const setDirty = vi.fn();
		const handleBlockSaved = vi.fn();
		const onBlockSaved = vi.fn();
		const blocks = fakeBlocksState(
			{ records: [record('b1', 'Hero')], setDirty, handleBlockSaved },
			childType,
			structuralFields
		);
		mounted = mountInspector(blocks, 'b1', fakeCtx(update), onBlockSaved);

		const input = mounted.target.querySelector<HTMLInputElement>('input[type="text"]')!;
		input.value = 'Hero editado';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		expect(setDirty).toHaveBeenCalledWith('b1', true);

		mounted.target.querySelector<HTMLButtonElement>('.vega-block-save-button')!.click();
		await Promise.resolve();
		await Promise.resolve();
		await tick();

		expect(update).toHaveBeenCalledWith(
			'post_block',
			'b1',
			expect.objectContaining({ heading: 'Hero editado' })
		);
		expect(handleBlockSaved).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'b1' }));
		expect(onBlockSaved).toHaveBeenCalledTimes(1);
	});

	// ————— D1 (encargo de accesibilidad): el foco NO puede caer a `<body>` al cambiar de bloque —————
	describe('D1 — el foco sigue a la selección, y nunca se lo roba a otra superficie', () => {
		let reactive: {
			target: HTMLElement;
			instance: ReturnType<typeof mount>;
			props: { selectedId: string | null };
		} | null = null;

		afterEach(async () => {
			if (reactive) {
				await unmount(reactive.instance);
				reactive.target.remove();
				reactive = null;
			}
		});

		test('foco dentro de la ficha A, la selección pasa a B: el foco acaba dentro de la ficha de B', async () => {
			const update = vi.fn();
			const blocks = fakeBlocksState(
				{ records: [record('b1', 'Hero'), record('b2', 'Features')] },
				childType,
				structuralFields
			);
			reactive = mountInspectorReactive(blocks, 'b1', fakeCtx(update));
			await settleFocus(); // deja asentar el montaje inicial (bind:this de `panelEl`/`headingEl`)

			const bodies = reactive.target.querySelectorAll<HTMLElement>('.vega-inspector-body');
			const inputA = bodies[0].querySelector<HTMLInputElement>('input[type="text"]')!;
			inputA.focus();
			expect(document.activeElement).toBe(inputA);

			reactive.props.selectedId = 'b2';
			await settleFocus();

			expect(focusLost(reactive.target, document.activeElement)).toBe(false);
			expect(bodies[1].contains(document.activeElement)).toBe(true);
			expect(bodies[0].contains(document.activeElement)).toBe(false);
		});

		test('foco dentro de la ficha A, se deselecciona (`selectedId = null`): el foco acaba en la cabecera del inspector', async () => {
			const update = vi.fn();
			const blocks = fakeBlocksState(
				{ records: [record('b1', 'Hero'), record('b2', 'Features')] },
				childType,
				structuralFields
			);
			reactive = mountInspectorReactive(blocks, 'b1', fakeCtx(update));
			await settleFocus();

			const inputA = reactive.target.querySelector<HTMLInputElement>('input[type="text"]')!;
			inputA.focus();

			reactive.props.selectedId = null;
			await settleFocus();

			expect(focusLost(reactive.target, document.activeElement)).toBe(false);
			expect(document.activeElement?.id).toBe('vega-inspector-heading');
		});

		test('el foco está FUERA del inspector: cambiar la selección no lo mueve', async () => {
			const update = vi.fn();
			const blocks = fakeBlocksState(
				{ records: [record('b1', 'Hero'), record('b2', 'Features')] },
				childType,
				structuralFields
			);
			reactive = mountInspectorReactive(blocks, 'b1', fakeCtx(update));
			await settleFocus();

			// Un control de FUERA del inspector (mismo criterio que la cabecera del componente:
			// "nunca robar el foco a quien teclea en OTRA superficie").
			const outside = document.createElement('button');
			document.body.appendChild(outside);
			outside.focus();
			expect(document.activeElement).toBe(outside);

			reactive.props.selectedId = 'b2';
			await settleFocus();

			expect(document.activeElement).toBe(outside);
			outside.remove();
		});
	});
});
