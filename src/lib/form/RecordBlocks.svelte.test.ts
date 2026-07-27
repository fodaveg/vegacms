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
	onBusyChange: (busy: boolean) => void = vi.fn()
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
	const props = $state({ parentType, parentId, onDirtyChange, onBusyChange, disabled: false });
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
		mounted = await mountBlocks('landing1', onDirtyChange);
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
