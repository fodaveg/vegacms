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
import { recordVersion, type VegaRecord } from '$lib/backend';
import { VegaError } from '$lib/backend/errors';
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
		expand: () => {},
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
	onBlockSaved: () => void = vi.fn(),
	onInlineTakeover?: (blockId: string, field: string) => void
): { target: HTMLElement; instance: ReturnType<typeof mount> } {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(VisualInspector, {
		target,
		props: { blocks, selectedId, onBlockSaved, onInlineTakeover },
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
	ctx: VegaAppContext,
	mode: 'inspector' | 'texts' = 'inspector'
): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	props: { selectedId: string | null; mode: 'inspector' | 'texts' };
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const props = $state({ blocks, selectedId, onBlockSaved: vi.fn(), mode });
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

	test('inline conserva el borrador previo al cancelar y guarda solo por la acción explícita con versión', async () => {
		const update = vi.fn(async (_type, _id, values) => ({
			...record('b1', ''),
			values: { post: 'rec-1', sort: 0, ...values }
		}));
		const blocks = fakeBlocksState(
			{ records: [record('b1', 'Initial')] },
			childType,
			structuralFields
		);
		mounted = mountInspector(blocks, 'b1', fakeCtx(update));
		await tick();
		const inspector = mounted.instance;
		const control = mounted.target.querySelector<HTMLInputElement>('[data-field="heading"] input')!;
		control.value = 'Previous draft';
		control.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		expect(inspector.beginInline('b1', 'heading')).toMatchObject({
			widget: 'text',
			value: 'Previous draft'
		});
		expect(inspector.updateInline('b1', 'heading', 'Inline draft')).toBe(true);
		await tick();
		// Lámina «edición en vivo»: el campo NO se deshabilita, refleja lo que se escribe en la
		// página y lo señala junto a la etiqueta.
		expect(control.disabled).toBe(false);
		expect(control.value).toBe('Inline draft');
		expect(
			mounted.target.querySelector('[data-field="heading"] .vega-field-inline-status')?.textContent
		).toContain('en la página');
		inspector.finishInline('b1', true);
		await tick();
		expect(control.value).toBe('Previous draft');
		expect(update).not.toHaveBeenCalled();
		inspector.beginInline('b1', 'heading');
		inspector.updateInline('b1', 'heading', 'Committed draft');
		inspector.finishInline('b1');
		await tick();
		expect(update).not.toHaveBeenCalled();
		inspector.saveSelected();
		await tick();
		expect(update).toHaveBeenCalledWith(
			'post_block',
			'b1',
			{ heading: 'Committed draft' },
			{ expectedVersion: recordVersion(record('b1', 'Initial')) }
		);
	});

	test('escribir en la ficha durante la edición en línea cierra la sesión y conserva lo escrito; Descartar vuelve a lo guardado', async () => {
		const update = vi.fn();
		const blocks = fakeBlocksState(
			{ records: [record('b1', 'Initial')] },
			childType,
			structuralFields
		);
		const takeover = vi.fn((blockId: string) => mounted!.instance.finishInline(blockId));
		mounted = mountInspector(blocks, 'b1', fakeCtx(update), vi.fn(), takeover);
		await tick();
		const inspector = mounted.instance;
		const control = mounted.target.querySelector<HTMLInputElement>('[data-field="heading"] input')!;
		inspector.beginInline('b1', 'heading');
		inspector.updateInline('b1', 'heading', 'From the page');
		await tick();
		control.value = 'From the page, then the form';
		control.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		expect(takeover).toHaveBeenCalledWith('b1', 'heading');
		expect(control.value).toBe('From the page, then the form');
		expect(mounted.target.querySelector('.vega-field-inline-status')).toBeNull();
		// La sesión ya está cerrada: un `input` tardío del sitio no reescribe el borrador.
		expect(inspector.updateInline('b1', 'heading', 'Late page input')).toBe(false);
		const discard = mounted.target.querySelector<HTMLButtonElement>('.vega-inspector-discard')!;
		expect(discard.disabled).toBe(false);
		discard.click();
		await tick();
		expect(control.value).toBe('Initial');
		expect(update).not.toHaveBeenCalled();
	});

	test('inline rechaza campos estructurales, desconocidos y sin permiso', async () => {
		const denied = { ...childType, permissions: { ...childType.permissions, update: false } };
		mounted = mountInspector(
			fakeBlocksState({ records: [record('b1', 'Initial')] }, denied, structuralFields),
			'b1',
			fakeCtx(vi.fn())
		);
		await tick();
		const inspector = mounted.instance;
		expect(inspector.beginInline('b1', 'heading')).toBeNull();
		expect(inspector.beginInline('b1', 'post')).toBeNull();
		expect(inspector.beginInline('b1', 'missing')).toBeNull();
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

		// Con la versión del bloque que la ficha tenía delante (edición concurrente): el inspector
		// reenvía las opciones de `BlockEditor` tal cual a `port.update`.
		expect(update).toHaveBeenCalledWith(
			'post_block',
			'b1',
			expect.objectContaining({ heading: 'Hero editado' }),
			{ expectedVersion: recordVersion(record('b1', 'Hero')) }
		);
		expect(handleBlockSaved).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'b1' }));
		expect(onBlockSaved).toHaveBeenCalledTimes(1);
	});

	test('la cabecera mantiene borrador y errores de A al cambiar A→B→A, sin guardar al seleccionar', async () => {
		const requiredChild = {
			...childType,
			fields: childType.fields.map((field) =>
				field.name === 'heading' ? { ...field, schema: { ...field.schema, required: true } } : field
			)
		};
		const update = vi.fn();
		const blocks = fakeBlocksState(
			{ records: [record('b1', 'Nombre largo de A '.repeat(12)), record('b2', 'B')] },
			requiredChild,
			structuralFields
		);
		const reactive = mountInspectorReactive(blocks, 'b1', fakeCtx(update));
		mounted = reactive;
		await settleFocus();
		const bodies = reactive.target.querySelectorAll<HTMLElement>('.vega-inspector-body');
		const inputA = bodies[0].querySelector<HTMLInputElement>('input[type="text"]')!;
		inputA.value = '';
		inputA.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		bodies[0].querySelector<HTMLButtonElement>('.vega-block-save-button')!.click();
		await settleFocus();
		expect(bodies[0].querySelector('.vega-block-context-state')?.textContent).toContain(
			'Revisa los campos señalados.'
		);
		const errorText = bodies[0].querySelector('.vega-field-error')?.textContent;
		expect(errorText).toBeTruthy();
		reactive.props.selectedId = 'b2';
		await settleFocus();
		const inputB = bodies[1].querySelector<HTMLInputElement>('input[type="text"]')!;
		inputB.value = 'Borrador B';
		inputB.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		reactive.props.selectedId = 'b1';
		await settleFocus();
		expect(bodies[0].querySelector('input[type="text"]')).toBe(inputA);
		expect(inputA.value).toBe('');
		expect(inputB.value).toBe('Borrador B');
		expect(bodies[0].querySelector('.vega-field-error')?.textContent).toBe(errorText);
		expect(bodies[0].querySelector('.vega-block-context-state')?.textContent).toContain(
			'Revisa los campos señalados.'
		);
		expect(bodies[0].querySelectorAll('.vega-block-save-button')).toHaveLength(1);
		expect(update).not.toHaveBeenCalled();
	});

	test('la misma acción contextual pasa por guardando y solo el éxito confirmado retira el borrador', async () => {
		let finish!: (record: VegaRecord) => void;
		const update = vi.fn(
			() =>
				new Promise<VegaRecord>((resolve) => {
					finish = resolve;
				})
		);
		const blocks = fakeBlocksState(
			{ records: [record('b1', 'Hero')] },
			childType,
			structuralFields
		);
		mounted = mountInspector(blocks, 'b1', fakeCtx(update));
		await settleFocus();
		const input = mounted.target.querySelector<HTMLInputElement>('input[type="text"]')!;
		const save = mounted.target.querySelector<HTMLButtonElement>('.vega-block-save-button')!;
		input.value = 'Hero editado';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		expect(mounted.target.querySelector('.vega-block-context-state')?.textContent).toContain(
			'Cambios sin guardar'
		);
		save.click();
		await tick();
		expect(save.disabled).toBe(true);
		expect(mounted.target.querySelector('.vega-block-context-state')?.textContent).toContain(
			'Guardando'
		);
		finish(record('b1', 'Hero editado'));
		await settleFocus();
		expect(mounted.target.querySelectorAll('.vega-block-save-button')).toHaveLength(1);
		expect(save.disabled).toBe(true);
		expect(mounted.target.querySelector('.vega-block-context-state')?.textContent).toContain(
			'Sin cambios'
		);
		expect(update).toHaveBeenCalledTimes(1);
	});

	test('el error del registro no apunta a campos inexistentes y conserva el borrador', async () => {
		const update = vi.fn().mockRejectedValue(
			VegaError.validation({
				'': { code: 'record_rejected', message: 'No se admite esta combinación.' }
			})
		);
		const blocks = fakeBlocksState(
			{ records: [record('b1', 'Hero')] },
			childType,
			structuralFields
		);
		mounted = mountInspector(blocks, 'b1', fakeCtx(update));
		await settleFocus();
		const input = mounted.target.querySelector<HTMLInputElement>('input[type="text"]')!;
		input.value = 'Borrador retenido';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		mounted.target.querySelector<HTMLButtonElement>('.vega-block-save-button')!.click();
		await settleFocus();
		expect(mounted.target.querySelector('.vega-block-context-state')?.textContent).toContain(
			'No se pudo guardar'
		);
		expect(mounted.target.querySelector('.vega-field-error')).toBeNull();
		expect(mounted.target.querySelector('.vega-block-banner')?.textContent).toBe(
			'No se admite esta combinación.'
		);
		expect(input.value).toBe('Borrador retenido');
		expect(
			mounted.target.querySelector<HTMLButtonElement>('.vega-block-save-button')!.disabled
		).toBe(false);
	});

	test('abrir un bloque sin campos habilitados enfoca su sección contextual, nunca Guardar', async () => {
		const lockedChild = {
			...childType,
			permissions: { ...childType.permissions, update: false }
		};
		const blocks = fakeBlocksState(
			{ records: [record('b1', 'Bloque sin permiso')] },
			lockedChild,
			structuralFields
		);
		mounted = mountInspector(blocks, 'b1', fakeCtx(vi.fn()));
		await settleFocus();
		(mounted.instance as unknown as { focusBlock: (id: string) => void }).focusBlock('b1');
		const section = mounted.target.querySelector('.vega-inspector-body');
		expect(document.activeElement).toBe(section);
		expect(section?.getAttribute('aria-label')).toBe('Bloque sin permiso');
		expect(mounted.target.querySelector('.vega-block-save-button')).toBeNull();
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

	// ————— Modo «solo textos» (Lote 12, lámina 8): `mode="texts"` —————
	describe('modo «solo textos»', () => {
		/** Tipo de bloque con un campo que NO es texto (`count`, número) además de `heading`: para
		 *  ver la nota «tiene N campos más». */
		const mixedBlockType: ContentType = {
			...postBlockType,
			fields: [
				...postBlockType.fields,
				{
					name: 'count',
					type: 'number',
					integer: true,
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				}
			]
		};
		/** Tipo de bloque SIN ningún texto editable: solo los estructurales y un número. */
		const numericBlockType: ContentType = {
			...postBlockType,
			fields: [
				...postBlockType.fields.filter((f) => f.name !== 'heading'),
				{
					name: 'count',
					type: 'number',
					integer: true,
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				}
			]
		};

		function buildChildTypeFrom(blockContentType: ContentType): ResolvedContentType {
			const model = resolveContentModel({
				types: [postType, blockContentType],
				manifestRaw: {
					schemaVersion: 1,
					collections: {
						post: { blocks: { collection: 'post_block', parentField: 'post', orderField: 'sort' } }
					}
				}
			});
			expect(model.warnings).toEqual([]);
			return model.types.find((t) => t.name === 'post_block')!;
		}

		function mountTexts(
			blocks: BlocksState,
			ctx: VegaAppContext,
			onBack: () => void = vi.fn(),
			onSelectBlock: (id: string) => void = vi.fn()
		): { target: HTMLElement; instance: ReturnType<typeof mount> } {
			const target = document.createElement('div');
			document.body.appendChild(target);
			const instance = mount(VisualInspector, {
				target,
				props: {
					blocks,
					selectedId: null,
					onBlockSaved: vi.fn(),
					mode: 'texts',
					onBack,
					onSelectBlock,
					fullFormHref: '/c/post/rec-1'
				},
				context: new Map([[VEGA_CONTEXT_KEY, ctx]])
			});
			return { target, instance };
		}

		test('todas las secciones visibles, en orden, cada una nombrada por su cabecera (`aria-labelledby`)', () => {
			const blocks = fakeBlocksState(
				{ records: [record('b1', 'Hero'), record('b2', 'Features')] },
				childType,
				structuralFields
			);
			mounted = mountTexts(blocks, fakeCtx(vi.fn()));

			// La región se llama «Solo textos» y lleva su aviso de qué se puede hacer aquí.
			expect(mounted.target.querySelector('#vega-inspector-heading')?.textContent?.trim()).toBe(
				translate('es', 'editor.visual.texts.title')
			);
			expect(mounted.target.querySelector('.vega-inspector-intro')?.textContent).toBe(
				translate('es', 'editor.visual.texts.intro')
			);

			const sections = mounted.target.querySelectorAll<HTMLElement>('section.vega-inspector-body');
			expect(sections).toHaveLength(2);
			for (const [index, section] of Array.from(sections).entries()) {
				expect(section.hasAttribute('hidden')).toBe(false); // ninguna oculta: son las secciones
				const labelledBy = section.getAttribute('aria-labelledby')!;
				const heading = section.querySelector<HTMLElement>(`#${labelledBy}`);
				expect(heading?.tagName).toBe('H3');
				// Sin vocabulario de tipos, la cabecera es el título del bloque, en el orden de la página.
				expect(heading?.textContent?.trim()).toBe(index === 0 ? 'Hero' : 'Features');
			}
			// Cada sección con su propio «Guardar» (el de `BlockEditor`, no otro).
			expect(mounted.target.querySelectorAll('.vega-block-save-button')).toHaveLength(2);
			// Y sin los avisos del inspector («elige un bloque»): aquí no hay selección.
			expect(mounted.target.querySelector('.vega-inspector-notice')).toBeNull();
		});

		test('el índice conserva el orden real y pide selección al dueño de pantalla', async () => {
			const onSelect = vi.fn();
			const blocks = fakeBlocksState(
				{ records: [record('b1', 'Hero'), record('b2', 'Features')] },
				childType,
				structuralFields
			);
			mounted = mountTexts(blocks, fakeCtx(vi.fn()), vi.fn(), onSelect);
			await tick();
			const indexes = mounted.target.querySelectorAll<HTMLSelectElement>('select');
			expect(indexes).toHaveLength(2);
			expect(Array.from(indexes[0].options).map((o) => o.value)).toEqual(['b1', 'b2']);
			expect(indexes[1].value).toBe('b2');
			indexes[0].value = 'b2';
			indexes[0].dispatchEvent(new Event('change', { bubbles: true }));
			expect(onSelect).toHaveBeenCalledWith('b2');
			expect(indexes[0].value).toBe('b1');
			indexes[1].value = 'b1';
			indexes[1].dispatchEvent(new Event('change', { bubbles: true }));
			expect(indexes[1].value).toBe('b2');
		});

		test('solo los campos de texto; el resto se cuenta y se nombra sin editarse', () => {
			const mixed = buildChildTypeFrom(mixedBlockType);
			const countLabel = mixed.fields.find((f) => f.name === 'count')!.label;
			const blocks = fakeBlocksState(
				{
					records: [
						{
							id: 'b1',
							type: 'post_block',
							values: { post: 'rec-1', sort: 0, heading: 'Hero', count: 3 }
						}
					]
				},
				mixed,
				structuralFields
			);
			mounted = mountTexts(blocks, fakeCtx(vi.fn()));

			expect(mounted.target.querySelector('[data-field="heading"]')).not.toBeNull();
			expect(mounted.target.querySelector('[data-field="count"]')).toBeNull();
			expect(mounted.target.querySelector('.vega-block-rest')?.textContent?.trim()).toBe(
				translate('es', 'editor.visual.texts.rest.one', { count: 1, fields: countLabel })
			);
			expect(mounted.target.querySelector('.vega-block-save-button')).not.toBeNull();
			expect(mounted.target.querySelector('a[href="/c/post/rec-1"]')?.textContent).toContain(
				'Abrir formulario completo'
			);
			expect(mounted.target.querySelector('select')).toBeNull();
		});

		test('sección sin ningún texto: se lista igual, lo dice, y no ofrece «Guardar»', async () => {
			const numeric = buildChildTypeFrom(numericBlockType);
			const blocks = fakeBlocksState(
				{
					records: [{ id: 'b1', type: 'post_block', values: { post: 'rec-1', sort: 0, count: 3 } }]
				},
				numeric,
				structuralFields
			);
			mounted = mountTexts(blocks, fakeCtx(vi.fn()));

			expect(mounted.target.querySelectorAll('section.vega-inspector-body')).toHaveLength(1);
			expect(mounted.target.querySelector('.vega-field-row')).toBeNull();
			expect(mounted.target.querySelector('.vega-block-rest')?.textContent?.trim()).toBe(
				translate('es', 'editor.visual.texts.none')
			);
			expect(mounted.target.querySelector('.vega-block-save-button')).toBeNull();
			await settleFocus();
			(mounted.instance as unknown as { focusBlock: (id: string) => void }).focusBlock('b1');
			expect(document.activeElement).toBe(mounted.target.querySelector('.vega-inspector-body'));
		});

		test('sin permiso de editar: campos deshabilitados, sin «Guardar» y el aviso de siempre', () => {
			const lockedType: ResolvedContentType = {
				...childType,
				permissions: { ...childType.permissions, update: false }
			};
			const blocks = fakeBlocksState(
				{ records: [record('b1', 'Hero')] },
				lockedType,
				structuralFields
			);
			mounted = mountTexts(blocks, fakeCtx(vi.fn()));

			expect(mounted.target.querySelector('.vega-inspector-notice')?.textContent).toBe(
				translate('es', 'editor.noUpdateNotice')
			);
			expect(mounted.target.querySelector<HTMLInputElement>('input[type="text"]')?.disabled).toBe(
				true
			);
			expect(mounted.target.querySelector('.vega-block-save-button')).toBeNull();
		});

		test('página sin secciones: la caja de salida con su motivo y «Volver al formulario»', () => {
			const onBack = vi.fn();
			const blocks = fakeBlocksState({ records: [] }, childType, structuralFields);
			mounted = mountTexts(blocks, fakeCtx(vi.fn()), onBack);

			const empty = mounted.target.querySelector('.vega-texts-empty');
			expect(empty?.textContent).toContain(translate('es', 'editor.visual.texts.empty.title'));
			expect(empty?.textContent).toContain(translate('es', 'editor.visual.texts.empty.body'));
			empty?.querySelector<HTMLButtonElement>('.vega-texts-back')?.click();
			expect(onBack).toHaveBeenCalledTimes(1);
		});

		test('guardar desde «solo textos» va por el MISMO `port.update` con la MISMA versión esperada', async () => {
			const update = vi.fn().mockResolvedValue({
				id: 'b1',
				type: 'post_block',
				values: { post: 'rec-1', sort: 0, heading: 'Hero guardado' }
			});
			const setDirty = vi.fn();
			const handleBlockSaved = vi.fn();
			const blocks = fakeBlocksState(
				{ records: [record('b1', 'Hero'), record('b2', 'Features')], setDirty, handleBlockSaved },
				childType,
				structuralFields
			);
			mounted = mountTexts(blocks, fakeCtx(update));

			const first = mounted.target.querySelectorAll<HTMLElement>('section.vega-inspector-body')[0];
			const input = first.querySelector<HTMLInputElement>('input[type="text"]')!;
			input.value = 'Hero editado';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			await tick();
			expect(setDirty).toHaveBeenCalledWith('b1', true);

			first.querySelector<HTMLButtonElement>('.vega-block-save-button')!.click();
			await Promise.resolve();
			await Promise.resolve();
			await tick();

			expect(update).toHaveBeenCalledTimes(1);
			expect(update).toHaveBeenCalledWith(
				'post_block',
				'b1',
				expect.objectContaining({ heading: 'Hero editado' }),
				{ expectedVersion: recordVersion(record('b1', 'Hero')) }
			);
			expect(handleBlockSaved).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'b1' }));
		});

		test('el cuerpo Markdown se edita como texto fuente, con la misma regla de guardado (21 oct 2026)', async () => {
			// Como «Sobre mí» en fodaveg: el cuerpo es una columna `markdown` con HTML heredado. Antes
			// quedaba fuera de «Solo textos» y desde el teléfono no había forma de tocarlo.
			const legacy = 'Hola.\n\n<a href="/contacto" class="btn">Contacto</a>\n';
			const model = resolveContentModel({
				types: [
					postType,
					{
						...postBlockType,
						fields: [
							...postBlockType.fields,
							{
								name: 'body',
								type: 'text',
								subtype: 'plain',
								required: false,
								readonly: false,
								presentable: false,
								hidden: false,
								unique: false
							}
						]
					}
				],
				manifestRaw: {
					schemaVersion: 1,
					collections: {
						post: {
							blocks: { collection: 'post_block', parentField: 'post', orderField: 'sort' }
						},
						post_block: { fields: { body: { label: 'Cuerpo', widget: 'markdown' } } }
					}
				}
			});
			expect(model.warnings).toEqual([]);
			const withBody = model.types.find((t) => t.name === 'post_block')!;
			const saved = {
				id: 'b1',
				type: 'post_block',
				values: { post: 'rec-1', sort: 0, heading: 'Hero', body: 'Hola.' }
			};
			const update = vi.fn().mockResolvedValue(saved);
			const blocks = fakeBlocksState(
				{
					records: [
						{
							id: 'b1',
							type: 'post_block',
							values: { post: 'rec-1', sort: 0, heading: 'Hero', body: legacy }
						}
					]
				},
				withBody,
				structuralFields
			);
			mounted = mountTexts(blocks, fakeCtx(update));
			await tick();

			const row = mounted.target.querySelector<HTMLElement>('[data-field="body"]')!;
			expect(row).not.toBeNull();
			// Texto fuente en un `<textarea>` plano: sin barra de formato ni vista previa.
			const source = row.querySelector<HTMLTextAreaElement>('textarea')!;
			expect(source.value).toBe(legacy);
			expect(row.querySelector('.vega-markdown-bar')).toBeNull();
			expect(mounted.target.querySelector('.vega-block-rest')).toBeNull();

			// Cambiado y con el HTML dentro: no se guarda, y se dice.
			source.value = `${legacy}Y algo más.`;
			source.dispatchEvent(new Event('input', { bubbles: true }));
			await tick();
			mounted.target.querySelector<HTMLButtonElement>('.vega-block-save-button')!.click();
			for (let i = 0; i < 20 && !row.textContent?.includes('No se puede guardar'); i++) {
				await new Promise((resolve) => setTimeout(resolve, 10));
				await tick();
			}
			expect(row.textContent).toContain('No se puede guardar');
			expect(update).not.toHaveBeenCalled();

			// En Markdown, se guarda por el mismo `port.update`.
			source.value = 'Hola.\n\n[Contacto](/contacto)\n';
			source.dispatchEvent(new Event('input', { bubbles: true }));
			await tick();
			mounted.target.querySelector<HTMLButtonElement>('.vega-block-save-button')!.click();
			for (let i = 0; i < 20 && update.mock.calls.length === 0; i++) {
				await new Promise((resolve) => setTimeout(resolve, 10));
				await tick();
			}
			expect(update).toHaveBeenCalledWith(
				'post_block',
				'b1',
				{ body: 'Hola.\n\n[Contacto](/contacto)\n' },
				expect.anything()
			);
		});

		test('cambiar de modo NO remonta las fichas: un borrador a medio escribir sobrevive al cambio de ancho', async () => {
			const blocks = fakeBlocksState(
				{ records: [record('b1', 'Hero'), record('b2', 'Features')] },
				childType,
				structuralFields
			);
			const reactive = mountInspectorReactive(blocks, 'b2', fakeCtx(vi.fn()), 'inspector');
			await settleFocus();

			const bodies = reactive.target.querySelectorAll<HTMLElement>('.vega-inspector-body');
			const inputB = bodies[1].querySelector<HTMLInputElement>('input[type="text"]')!;
			inputB.value = 'Borrador en la ficha ancha';
			inputB.dispatchEvent(new Event('input', { bubbles: true }));
			await tick();

			// Ancho → estrecho: las MISMAS secciones (identidad de nodo), ahora todas visibles.
			reactive.props.mode = 'texts';
			await tick();
			const after = reactive.target.querySelectorAll<HTMLElement>('.vega-inspector-body');
			expect(after[1]).toBe(bodies[1]);
			expect(after[0].hasAttribute('hidden')).toBe(false);
			expect(after[1].querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe(
				'Borrador en la ficha ancha'
			);

			// Y de vuelta a ancho: sigue ahí, oculto el que no está seleccionado.
			reactive.props.mode = 'inspector';
			await tick();
			expect(after[0].hasAttribute('hidden')).toBe(true);
			expect(after[1].querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe(
				'Borrador en la ficha ancha'
			);

			await unmount(reactive.instance);
			reactive.target.remove();
		});
	});
});
