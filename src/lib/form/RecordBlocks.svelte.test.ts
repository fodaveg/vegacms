/**
 * Suite de componente de `RecordBlocks.svelte` (capacidad `blocks`, lote "editor" Fase A):
 * montaje REAL (Svelte 5 `mount()`/`unmount()`, mismo patrón que `SecuritySettings.svelte.test.ts`)
 * contra un `BackendPort` REAL en memoria (`createMemoryBackend`, adaptador de referencia del
 * puerto) y un `ContentModel` REAL (`resolveContentModel` sobre un manifiesto con `blocks`) — no
 * un doble a medias, para ejercitar el camino completo: carga filtrada por `parentField`, crear,
 * reordenar (persistencia inmediata, decisión 1 de la cabecera del componente) y borrar.
 *
 * La lógica PURA de orden (`computeReorder`) y el controlador de arrastre/teclado
 * (`createReorderDndController`) ya están cubiertos por `reorder.test.ts`/`reorder-dnd.test.ts` —
 * aquí solo se comprueba que `RecordBlocks` los conecta correctamente al puerto y al DOM.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ContentType } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';
import RecordBlocks from './RecordBlocks.svelte';

const landingType: ContentType = {
	name: 'landing',
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

const landingBlockType: ContentType = {
	name: 'landing_block',
	readonly: false,
	fields: [
		{
			name: 'parent',
			type: 'relation',
			target: 'landing',
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
			presentable: true, // autodetectado como titleField (§4.4, sin nombre 'title'/'name')
			hidden: false,
			unique: false
		}
	]
};

function buildParentType() {
	const model = resolveContentModel({
		types: [landingType, landingBlockType],
		manifestRaw: {
			schemaVersion: 1,
			collections: {
				landing: {
					blocks: { collection: 'landing_block', parentField: 'parent', orderField: 'sort' }
				}
			}
		}
	});
	expect(model.warnings).toEqual([]); // manifiesto de fixture bien formado, cero degradación
	const parentType = model.types.find((t) => t.name === 'landing')!;
	return { model, parentType };
}

async function mountBlocks(
	parentId: string | null,
	onDirtyChange: (dirty: boolean) => void,
	onBusyChange: (busy: boolean) => void = vi.fn(),
	onDraftChange: (records: { id: string; fields: Record<string, unknown> }[]) => void = vi.fn()
): Promise<{
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	port: ReturnType<typeof createMemoryBackend>;
	props: { parentType: ResolvedContentType; parentId: string | null; disabled: boolean };
}> {
	const { model, parentType } = buildParentType();
	const port = createMemoryBackend({
		// `users` NO vacío: con un `seed` explícito el adaptador solo acepta ESTAS credenciales (sin
		// `seed` aceptaría cualquier password, pero aquí sí sembramos registros → hace falta login
		// real antes de que `port.list`/`create`/`update`/`delete` dejen de rechazar "No autenticado").
		users: [{ email: 'admin@vega.test', password: 'test-pass' }],
		contentTypes: [landingType, landingBlockType],
		records: {
			landing: [
				{ id: 'landing1', values: { title: 'Home' } },
				// Segundo padre: existe solo para el test de cambio de registro padre SIN remontaje
				// (el guard de salida fantasma). Sus propios bloques, para distinguirlos de los de
				// `landing1` al comprobar que la lista se repuebla de verdad.
				{ id: 'landing2', values: { title: 'Precios' } }
			],
			landing_block: [
				{ id: 'b1', values: { parent: 'landing1', sort: 0, heading: 'Hero' } },
				{ id: 'b2', values: { parent: 'landing1', sort: 1, heading: 'Features' } },
				{ id: 'b3', values: { parent: 'landing2', sort: 0, heading: 'Planes' } }
			]
		}
	});
	await port.login({ email: 'admin@vega.test', password: 'test-pass' });

	const ctx = {
		port,
		model,
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;

	const target = document.createElement('div');
	document.body.appendChild(target);
	// Props REACTIVAS (`$state`) en vez de un objeto plano: la app cambia de registro padre sin
	// remontar este componente (`/c/[type]/[id]/+page.svelte` no usa `{#key}`), así que el único
	// modo de ejercer ese camino en un test es mutar `parentId` sobre un montaje vivo.
	const props = $state({
		parentType,
		parentId,
		onDirtyChange,
		onBusyChange,
		onDraftChange,
		disabled: false
	});
	const instance = mount(RecordBlocks, {
		target,
		props,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance, port, props };
}

/** Drena las promesas encadenadas de `ctx.port` + el reasentado de `$state` (mismo patrón que
 *  `SecuritySettings.svelte.test.ts`/`PublishButton.svelte.test.ts`: varios microtasks + `tick`). */
async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await tick();
}

function blockTitles(target: HTMLElement): string[] {
	return Array.from(target.querySelectorAll('.vega-block-title')).map((el) => el.textContent ?? '');
}

describe('RecordBlocks.svelte', () => {
	let mounted: Awaited<ReturnType<typeof mountBlocks>> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.restoreAllMocks();
	});

	test('carga los bloques del padre, ordenados por orderField, con su título', async () => {
		mounted = await mountBlocks('landing1', vi.fn());
		await settle();

		expect(blockTitles(mounted.target)).toEqual(['Hero', 'Features']);
		expect(mounted.target.querySelector('.vega-blocks-count')?.textContent).toBe('2');
	});

	test('sin parentId (registro padre sin guardar): aviso, sin lista ni botón de crear', async () => {
		mounted = await mountBlocks(null, vi.fn());
		await settle();

		expect(mounted.target.querySelector('.vega-blocks-notice')).not.toBeNull();
		expect(mounted.target.querySelector('.vega-blocks-add')).toBeNull();
		expect(mounted.target.querySelectorAll('.vega-block-row')).toHaveLength(0);
	});

	test('publica el texto editado sin guardar y deja intacto el registro del puerto', async () => {
		const onDraftChange = vi.fn();
		mounted = await mountBlocks('landing1', vi.fn(), vi.fn(), onDraftChange);
		await settle();

		mounted.target.querySelector<HTMLButtonElement>('.vega-block-toggle')!.click();
		await settle();
		const heading = mounted.target.querySelector<HTMLInputElement>(
			'.vega-block-row input[type="text"]'
		)!;
		heading.value = 'Hero en borrador';
		heading.dispatchEvent(new Event('input', { bubbles: true }));
		await settle();

		const latest = onDraftChange.mock.calls.at(-1)?.[0] as {
			id: string;
			fields: Record<string, unknown>;
		}[];
		expect(latest.find((record) => record.id === 'b1')?.fields.heading).toBe('Hero en borrador');
		const saved = await mounted.port.get('landing_block', 'b1');
		expect(saved.values.heading).toBe('Hero');
	});

	test('crear: port.create con parentField/orderField, fila nueva desplegada', async () => {
		mounted = await mountBlocks('landing1', vi.fn());
		await settle();

		const addButton = mounted.target.querySelector<HTMLButtonElement>('.vega-blocks-add')!;
		addButton.click();
		await settle();

		const rows = mounted.target.querySelectorAll('.vega-block-row');
		expect(rows).toHaveLength(3);
		// La fila nueva es la última (append al final, orderField = max + 1, ver cabecera) y arranca
		// DESPLEGADA (`hidden` ausente en su `.vega-block-body`).
		const lastBody = rows[rows.length - 1].querySelector('.vega-block-body')!;
		expect(lastBody.hasAttribute('hidden')).toBe(false);

		const created = await mounted.port.list('landing_block', {
			filter: { kind: 'cond', field: 'parent', op: 'eq', value: 'landing1' }
		});
		expect(created.items).toHaveLength(3);
		expect(created.items.some((r) => r.values.sort === 2)).toBe(true);
	});

	test('una mutación estructural diferida sube busy al formulario padre hasta terminar', async () => {
		const onBusyChange = vi.fn();
		mounted = await mountBlocks('landing1', vi.fn(), onBusyChange);
		await settle();

		mounted.target.querySelector<HTMLButtonElement>('.vega-block-toggle')!.click();
		await settle();
		const heading = mounted.target.querySelector<HTMLInputElement>(
			'.vega-block-row input[type="text"]'
		)!;
		heading.value = 'Hero en borrador';
		heading.dispatchEvent(new Event('input', { bubbles: true }));
		await settle();
		const saveButton = mounted.target.querySelector<HTMLButtonElement>('.vega-block-save-button')!;

		const originalCreate = mounted.port.create.bind(mounted.port);
		let releaseCreate!: () => void;
		const createGate = new Promise<void>((resolve) => {
			releaseCreate = resolve;
		});
		vi.spyOn(mounted.port, 'create').mockImplementation(async (type, input) => {
			if (type === 'landing_block') await createGate;
			return originalCreate(type, input);
		});

		const addButton = mounted.target.querySelector<HTMLButtonElement>('.vega-blocks-add')!;
		addButton.click();
		await settle();

		expect(onBusyChange).toHaveBeenLastCalledWith(true);
		expect(addButton.disabled).toBe(true);
		expect(saveButton.disabled).toBe(true);

		releaseCreate();
		await settle();
		await settle();

		expect(onBusyChange).toHaveBeenLastCalledWith(false);
		expect(saveButton.disabled).toBe(false);
	});

	test('un guardado diferido bloquea altas y reorden hasta reasentar el bloque', async () => {
		const onBusyChange = vi.fn();
		mounted = await mountBlocks('landing1', vi.fn(), onBusyChange);
		await settle();

		mounted.target.querySelector<HTMLButtonElement>('.vega-block-toggle')!.click();
		await settle();
		const heading = mounted.target.querySelector<HTMLInputElement>(
			'.vega-block-row input[type="text"]'
		)!;
		heading.value = 'Hero guardado';
		heading.dispatchEvent(new Event('input', { bubbles: true }));
		await settle();

		const originalUpdate = mounted.port.update.bind(mounted.port);
		let releaseUpdate!: () => void;
		const updateGate = new Promise<void>((resolve) => {
			releaseUpdate = resolve;
		});
		vi.spyOn(mounted.port, 'update').mockImplementation(async (type, id, input) => {
			if (type === 'landing_block' && id === 'b1') await updateGate;
			return originalUpdate(type, id, input);
		});

		mounted.target.querySelector<HTMLButtonElement>('.vega-block-save-button')!.click();
		await settle();

		const addButton = mounted.target.querySelector<HTMLButtonElement>('.vega-blocks-add')!;
		const handle = mounted.target.querySelector<HTMLButtonElement>('.vega-block-handle')!;
		expect(onBusyChange).toHaveBeenLastCalledWith(true);
		expect(addButton.disabled).toBe(true);
		expect(handle.disabled).toBe(true);
		addButton.click();

		releaseUpdate();
		await settle();
		await settle();

		expect(onBusyChange).toHaveBeenLastCalledWith(false);
		expect(addButton.disabled).toBe(false);
		expect(blockTitles(mounted.target)).toEqual(['Hero guardado', 'Features']);
		const blocks = await mounted.port.list('landing_block', {
			filter: { kind: 'cond', field: 'parent', op: 'eq', value: 'landing1' }
		});
		expect(blocks.items).toHaveLength(2);
	});

	test('el mutex externo de duplicar página congela estructura y edición de bloques', async () => {
		mounted = await mountBlocks('landing1', vi.fn());
		await settle();

		mounted.props.disabled = true;
		await settle();

		const addButton = mounted.target.querySelector<HTMLButtonElement>('.vega-blocks-add')!;
		expect(addButton.disabled).toBe(true);
		expect(mounted.target.querySelector<HTMLButtonElement>('.vega-block-duplicate')!.disabled).toBe(
			true
		);
		expect(mounted.target.querySelector<HTMLButtonElement>('.vega-block-handle')!.disabled).toBe(
			true
		);
		expect(mounted.target.querySelector<HTMLButtonElement>('.vega-block-delete')!.disabled).toBe(
			true
		);

		mounted.target.querySelector<HTMLButtonElement>('.vega-block-toggle')!.click();
		await settle();
		expect(
			mounted.target.querySelector<HTMLInputElement>('.vega-block-row input[type="text"]')!.disabled
		).toBe(true);

		addButton.click();
		await settle();
		const blocks = await mounted.port.list('landing_block', {
			filter: { kind: 'cond', field: 'parent', op: 'eq', value: 'landing1' }
		});
		expect(blocks.items).toHaveLength(2);
	});

	test('duplicar: clona el bloque e inserta la copia justo debajo', async () => {
		mounted = await mountBlocks('landing1', vi.fn());
		await settle();

		const duplicateButtons =
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-block-duplicate');
		duplicateButtons[0].click();
		await settle();
		await settle();

		expect(blockTitles(mounted.target)).toEqual(['Hero', 'Hero', 'Features']);
		const reloaded = await mounted.port.list('landing_block', {
			filter: { kind: 'cond', field: 'parent', op: 'eq', value: 'landing1' },
			sort: [{ field: 'sort', dir: 'asc' }]
		});
		expect(reloaded.items.map((record) => record.values.heading)).toEqual([
			'Hero',
			'Hero',
			'Features'
		]);
		expect(reloaded.items.map((record) => record.values.sort)).toEqual([0, 1, 2]);
	});

	test('duplicar queda bloqueado mientras cualquier otro bloque conserva un borrador', async () => {
		const onDirtyChange = vi.fn();
		mounted = await mountBlocks('landing1', onDirtyChange);
		await settle();

		const toggles = mounted.target.querySelectorAll<HTMLButtonElement>('.vega-block-toggle');
		toggles[1].click();
		await settle();
		const secondRow = mounted.target.querySelectorAll<HTMLElement>('.vega-block-row')[1];
		const heading = secondRow.querySelector<HTMLInputElement>('input[type="text"]')!;
		heading.value = 'Features en borrador';
		heading.dispatchEvent(new Event('input', { bubbles: true }));
		await settle();

		expect(onDirtyChange).toHaveBeenCalledWith(true);
		const duplicateButtons =
			mounted.target.querySelectorAll<HTMLButtonElement>('.vega-block-duplicate');
		expect(Array.from(duplicateButtons).every((button) => button.disabled)).toBe(true);
		duplicateButtons[0].click();
		await settle();

		expect(blockTitles(mounted.target)).toEqual(['Hero', 'Features']);
		expect(heading.isConnected).toBe(true);
		expect(heading.value).toBe('Features en borrador');
	});

	test('duplicar usa el snapshot del padre original si se navega durante la creación', async () => {
		mounted = await mountBlocks('landing1', vi.fn());
		await settle();

		const originalCreate = mounted.port.create.bind(mounted.port);
		let releaseCreate!: () => void;
		const createGate = new Promise<void>((resolve) => {
			releaseCreate = resolve;
		});
		vi.spyOn(mounted.port, 'create').mockImplementation(async (type, input) => {
			if (type === 'landing_block') await createGate;
			return originalCreate(type, input);
		});

		mounted.target.querySelector<HTMLButtonElement>('.vega-block-duplicate')!.click();
		mounted.props.parentId = 'landing2';
		await settle();
		expect(blockTitles(mounted.target)).toEqual(['Planes']);

		releaseCreate();
		await settle();
		await settle();

		// La respuesta tardía no mezcla el bloque de landing1 con la vista ya cargada de landing2.
		expect(blockTitles(mounted.target)).toEqual(['Planes']);
		const landing1 = await mounted.port.list('landing_block', {
			filter: { kind: 'cond', field: 'parent', op: 'eq', value: 'landing1' },
			sort: [{ field: 'sort', dir: 'asc' }]
		});
		expect(landing1.items.map((record) => record.values.heading)).toEqual([
			'Hero',
			'Hero',
			'Features'
		]);
		expect(landing1.items.map((record) => record.values.sort)).toEqual([0, 1, 2]);
		const landing2 = await mounted.port.list('landing_block', {
			filter: { kind: 'cond', field: 'parent', op: 'eq', value: 'landing2' },
			sort: [{ field: 'sort', dir: 'asc' }]
		});
		expect(landing2.items.map((record) => record.values.heading)).toEqual(['Planes']);
		expect(landing2.items.map((record) => record.values.sort)).toEqual([0]);
	});

	test('reorden por teclado (ArrowDown en el asa): persiste de inmediato, sin marcar sucio, y anuncia la posición', async () => {
		const onDirtyChange = vi.fn();
		const onDraftChange = vi.fn();
		mounted = await mountBlocks('landing1', onDirtyChange, vi.fn(), onDraftChange);
		await settle();

		// Montar el editor crea un override editorial para b1. El reorden debe sustituir sus
		// campos estructurales antiguos por los valores actuales de la lista.
		mounted.target.querySelector<HTMLButtonElement>('.vega-block-toggle')!.click();
		await settle();
		const handle = mounted.target.querySelector<HTMLButtonElement>('.vega-block-handle')!;
		handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		await settle();

		// Reflejo visual inmediato: "Features" pasa a ir primero.
		expect(blockTitles(mounted.target)).toEqual(['Features', 'Hero']);
		// Anuncio de posición (a11y, requisito explícito del lote): región `aria-live` con el nuevo
		// puesto del bloque movido.
		expect(mounted.target.querySelector('.vega-visually-hidden-live')?.textContent).toContain(
			'Hero'
		);
		// Persistido en el backend, no solo en el DOM.
		const reloaded = await mounted.port.list('landing_block', {
			filter: { kind: 'cond', field: 'parent', op: 'eq', value: 'landing1' },
			sort: [{ field: 'sort', dir: 'asc' }]
		});
		expect(reloaded.items.map((r) => r.values.heading)).toEqual(['Features', 'Hero']);
		const latestDraft = onDraftChange.mock.calls.at(-1)?.[0] as {
			id: string;
			fields: Record<string, unknown>;
		}[];
		expect(latestDraft.map((record) => record.id)).toEqual(['b2', 'b1']);
		expect(latestDraft.map((record) => record.fields.sort)).toEqual([0, 1]);
		// Decisión 1 de la cabecera: reordenar NUNCA marca sucio (ya está persistido).
		expect(onDirtyChange).not.toHaveBeenCalledWith(true);
	});

	test('borrar: DeleteConfirm + port.delete, la fila desaparece', async () => {
		mounted = await mountBlocks('landing1', vi.fn());
		await settle();

		const deleteButtons = mounted.target.querySelectorAll<HTMLButtonElement>('.vega-block-delete');
		deleteButtons[0].click();
		await settle();

		const dialog = document.body.querySelector('[role="alertdialog"]')!;
		expect(dialog).not.toBeNull();
		const confirmButton = dialog.querySelector<HTMLButtonElement>('.vega-delete-confirm')!;
		confirmButton.click();
		await settle();

		expect(blockTitles(mounted.target)).toEqual(['Features']);
		// Filtrado por padre a propósito: la fixture también siembra un bloque de `landing2`, que
		// este borrado no debe tocar.
		const remaining = await mounted.port.list('landing_block');
		expect(remaining.items.filter((r) => r.values.parent === 'landing1')).toHaveLength(1);
	});

	test('cambiar de registro padre SIN remontar limpia el estado por bloque (guard de salida fantasma)', async () => {
		const onDirtyChange = vi.fn();
		mounted = await mountBlocks('landing1', onDirtyChange);
		await settle();

		// Despliega un bloque de `landing1`: es el estado por-bloque que NO puede sobrevivir al
		// cambio de padre (con `dirtyIds` pasaría lo mismo, pero ensuciar un bloque exige escribir
		// en su mini-formulario; `expandedIds` ejerce el mismo `$effect` con menos ceremonia).
		mounted.target.querySelector<HTMLButtonElement>('.vega-block-toggle')!.click();
		await settle();
		expect(mounted.target.querySelectorAll('.vega-block-body:not([hidden])')).toHaveLength(1);

		onDirtyChange.mockClear();
		mounted.props.parentId = 'landing2';
		await settle();

		// La lista es la del padre nuevo…
		expect(blockTitles(mounted.target)).toEqual(['Planes']);
		// …ningún bloque arrastra el "desplegado" del anterior…
		expect(mounted.target.querySelectorAll('.vega-block-body:not([hidden])')).toHaveLength(0);
		// …y el padre recibe un "ya no hay nada sucio" explícito: sin esto, un id sucio de
		// `landing1` mantendría `beforeNavigate`/`beforeunload` avisando para siempre.
		expect(onDirtyChange).toHaveBeenCalledWith(false);
	});
});

// ————— Modo HETEROGÉNEO: menú de tipos e insignia de fila —————
//
// Fixture propio y aparte del de arriba a propósito: el de arriba es HOMOGÉNEO (sin `typeField`
// ni `blockTypes`) y sigue siendo el caso que hay que conservar — el menú no puede aparecer ahí.

const typedBlockType: ContentType = {
	name: 'landing_block',
	readonly: false,
	fields: [
		{
			name: 'parent',
			type: 'relation',
			target: 'landing',
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
			name: 'type',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'data',
			type: 'json',
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

async function mountTypedBlocks(options: { withVocabulary?: boolean } = {}): Promise<{
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	port: ReturnType<typeof createMemoryBackend>;
	parentType: ResolvedContentType;
}> {
	const model = resolveContentModel({
		types: [landingType, typedBlockType],
		manifestRaw: {
			schemaVersion: 1,
			...(options.withVocabulary === false
				? {}
				: {
						blockTypes: {
							hero: {
								label: 'Portada',
								fields: [{ name: 'title', label: 'Título', widget: 'text' }]
							},
							cta: { label: 'Llamada', fields: [{ name: 'text', label: 'Texto', widget: 'text' }] }
						}
					}),
			collections: {
				landing: {
					blocks: {
						collection: 'landing_block',
						parentField: 'parent',
						orderField: 'sort',
						typeField: 'type',
						dataField: 'data'
					}
				}
			}
		}
	});
	expect(model.warnings).toEqual([]);
	const parentType = model.types.find((t) => t.name === 'landing')!;

	const port = createMemoryBackend({
		users: [{ email: 'admin@vega.test', password: 'test-pass' }],
		contentTypes: [landingType, typedBlockType],
		records: {
			landing: [{ id: 'landing1', values: { title: 'Home' } }],
			landing_block: [
				{ id: 'b1', values: { parent: 'landing1', sort: 0, type: 'hero', heading: 'Hero' } },
				// Un tipo que el manifiesto YA NO declara: el registro sigue vivo y hay que verlo.
				{ id: 'b2', values: { parent: 'landing1', sort: 1, type: 'carrusel', heading: 'Viejo' } },
				// Y uno sin tipo, de antes de que existiera el vocabulario.
				{ id: 'b3', values: { parent: 'landing1', sort: 2, type: '', heading: 'Suelto' } }
			]
		}
	});
	await port.login({ email: 'admin@vega.test', password: 'test-pass' });

	const ctx = {
		port,
		model,
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;

	const target = document.createElement('div');
	document.body.appendChild(target);
	const props = $state({
		parentType,
		parentId: 'landing1',
		onDirtyChange: vi.fn(),
		onBusyChange: vi.fn(),
		onDraftChange: vi.fn(),
		disabled: false
	});
	const instance = mount(RecordBlocks, {
		target,
		props,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance, port, parentType };
}

describe('RecordBlocks.svelte — tipos de bloque', () => {
	let mounted: Awaited<ReturnType<typeof mountTypedBlocks>> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.restoreAllMocks();
	});

	test('el disparador abre un menú con los tipos del manifiesto, en su orden', async () => {
		mounted = await mountTypedBlocks();
		await settle();

		const trigger = mounted.target.querySelector<HTMLButtonElement>('.vega-blocks-add')!;
		expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(mounted.target.querySelector('[role="menu"]')).toBeNull();

		trigger.click();
		await settle();

		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		const items = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
		).map((el) => el.textContent?.trim());
		expect(items).toEqual(['Portada', 'Llamada']);
	});

	test('elegir un tipo escribe su nombre en la COLUMNA REAL, no en el JSON', async () => {
		mounted = await mountTypedBlocks();
		await settle();

		mounted.target.querySelector<HTMLButtonElement>('.vega-blocks-add')!.click();
		await settle();
		const items = mounted.target.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
		items[1].click(); // "Llamada" → cta
		await settle();
		await settle();

		const rows = await mounted.port.list('landing_block', { perPage: 50 });
		const created = rows.items.find((r) => r.id !== 'b1' && r.id !== 'b2' && r.id !== 'b3');
		expect(created).toBeDefined();
		// La propiedad que compra la regla de frontera: el tipo está en su columna…
		expect(created!.values.type).toBe('cta');
		// …y NADIE lo ha escrito dentro de `data`.
		expect(created!.values.data ?? null).not.toEqual(expect.objectContaining({ type: 'cta' }));
	});

	test('cada fila enseña su tipo, y un tipo retirado del manifiesto se ve en crudo', async () => {
		mounted = await mountTypedBlocks();
		await settle();

		const badges = Array.from(mounted.target.querySelectorAll('.vega-block-type')).map((el) =>
			el.textContent?.trim()
		);
		// `b1` conocido por su label; `b2` desconocido pero VISIBLE; `b3` sin tipo no pinta insignia.
		// `b1` conocido por su label; `b2` desconocido pero VISIBLE; `b3` con la columna vacía lo DICE.
		expect(badges).toEqual(['Portada', 'Tipo desconocido: carrusel', 'Sin tipo']);
		expect(mounted.target.querySelectorAll('.vega-block-type--unknown')).toHaveLength(1);
		expect(mounted.target.querySelectorAll('.vega-block-type--none')).toHaveLength(1);
	});

	test('la columna de tipo NO se ofrece como campo editable dentro del bloque', async () => {
		mounted = await mountTypedBlocks();
		await settle();

		// El mini-formulario de cada bloque pinta `childType.fields` MENOS los estructurales. Si
		// `typeField` no estuviera en esa lista, aquí aparecería un campo de texto «type» y el
		// usuario podría teclear un tipo que no existe en el vocabulario, saltándose el menú.
		const labels = Array.from(mounted.target.querySelectorAll('.vega-block-row label')).map(
			(el) => el.textContent?.trim().toLowerCase() ?? ''
		);
		expect(labels.length).toBeGreaterThan(0); // si no pinta NADA, este test no prueba nada
		expect(labels).not.toContain('type');
		expect(labels.some((text) => text.includes('heading'))).toBe(true);
	});

	test('las flechas recorren el menú en círculo y Home/End van a los extremos', async () => {
		mounted = await mountTypedBlocks();
		await settle();

		const trigger = mounted.target.querySelector<HTMLButtonElement>('.vega-blocks-add')!;
		trigger.click();
		await settle();

		const items = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
		);
		// Abrir deja el foco DENTRO del menú: si se queda en el disparador, `ArrowDown` no recorre
		// nada y al primer elemento solo se llega con `Tab`, que no es el patrón APG.
		expect(document.activeElement).toBe(items[0]);

		const menu = mounted.target.querySelector<HTMLElement>('[role="menu"]')!;
		const press = (key: string) =>
			menu.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

		press('ArrowDown');
		expect(document.activeElement).toBe(items[1]);
		press('ArrowDown'); // circular: del último vuelve al primero
		expect(document.activeElement).toBe(items[0]);
		press('ArrowUp'); // y hacia atrás desde el primero, al último
		expect(document.activeElement).toBe(items[items.length - 1]);
		press('Home');
		expect(document.activeElement).toBe(items[0]);
		press('End');
		expect(document.activeElement).toBe(items[items.length - 1]);
	});

	test('sin vocabulario pero CON columna de tipo, las filas siguen diciendo qué son', async () => {
		// El manifiesto retiró todos los `blockTypes` y los registros conservan su valor. Antes esto
		// escondía el tipo de TODAS las filas, porque la insignia dependía de que hubiera menú.
		mounted = await mountTypedBlocks({ withVocabulary: false });
		await settle();

		// Sin nada que elegir no hay menú, y el botón simple vuelve.
		const trigger = mounted.target.querySelector<HTMLButtonElement>('.vega-blocks-add')!;
		expect(trigger.getAttribute('aria-haspopup')).toBeNull();

		const badges = Array.from(mounted.target.querySelectorAll('.vega-block-type')).map((el) =>
			el.textContent?.trim()
		);
		expect(badges).toEqual(['Tipo desconocido: hero', 'Tipo desconocido: carrusel', 'Sin tipo']);
	});

	test('Escape cierra el menú y devuelve el foco al disparador', async () => {
		mounted = await mountTypedBlocks();
		await settle();

		const trigger = mounted.target.querySelector<HTMLButtonElement>('.vega-blocks-add')!;
		trigger.click();
		await settle();
		expect(mounted.target.querySelector('[role="menu"]')).not.toBeNull();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();

		expect(mounted.target.querySelector('[role="menu"]')).toBeNull();
		// Sin esto el foco cae a `<body>` y el usuario de teclado pierde el sitio.
		expect(document.activeElement).toBe(trigger);
	});

	test('Tab y Shift+Tab sacan el foco del menú y lo cierran', async () => {
		mounted = await mountTypedBlocks();
		await settle();

		const trigger = mounted.target.querySelector<HTMLButtonElement>('.vega-blocks-add')!;
		trigger.click();
		await settle();
		const items = Array.from(
			mounted.target.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
		);
		expect(document.activeElement).toBe(items[0]);

		// `Shift+Tab` desde el primer elemento devuelve el foco al DISPARADOR. Si la condición de
		// cierre perdonara al disparador, el menú se quedaría abierto con el foco fuera de su
		// `role="menu"`, que es justo lo que APG prohíbe.
		items[0].dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: trigger }));
		await settle();
		expect(mounted.target.querySelector('[role="menu"]')).toBeNull();
	});

	test('en modo HOMOGÉNEO no hay menú: el botón simple sigue creando sin tipo', async () => {
		const homogeneous = await mountBlocks('landing1', vi.fn());
		await settle();
		const trigger = homogeneous.target.querySelector<HTMLButtonElement>('.vega-blocks-add')!;
		expect(trigger.getAttribute('aria-haspopup')).toBeNull();

		trigger.click();
		await settle();
		await settle();

		expect(homogeneous.target.querySelector('[role="menu"]')).toBeNull();
		expect(blockTitles(homogeneous.target)).toHaveLength(3);

		await unmount(homogeneous.instance);
		homogeneous.target.remove();
	});
});
