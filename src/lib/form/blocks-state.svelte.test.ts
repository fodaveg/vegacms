/**
 * Suite de MÓDULO de `blocks-state.svelte.ts` (extracción de `RecordBlocks.svelte`, ver la
 * cabecera del módulo): sin montar ningún componente ni tocar el DOM — solo `createBlocksState`
 * envuelto en `$effect.root` (el patrón oficial de Svelte 5 para runas fuera de un componente,
 * necesario porque el módulo usa `$effect` internamente para la carga automática y el reenvío de
 * `onDraftChange`/`onBusyChange`). Contra un `BackendPort` REAL en memoria
 * (`createMemoryBackend`), mismo criterio que `RecordBlocks.svelte.test.ts`: no un doble a medias.
 *
 * El comportamiento ya cubierto por el montaje REAL del componente (`RecordBlocks.svelte.test.ts`,
 * que sigue intacto y en verde) no se repite aquí. Esta suite cubre justo lo que NO se puede
 * observar sin controlar la resolución de promesas a mano: la anti-carrera de `load()`, y el
 * detalle de la reconciliación tras un fallo de red en `handleReorder`.
 */
import { flushSync } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { VegaAppContext } from '$lib/app-context';
import type { ContentType } from '$lib/backend/types';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';
import { createBlocksState, type BlocksState } from './blocks-state.svelte';

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
			presentable: true,
			hidden: false,
			unique: false
		}
	]
};

/** Monta el ESTADO (sin componente) contra un backend en memoria sembrado con dos bloques de
 *  `landing1`. `getParentId`/`getDisabled` leen variables de cierre normales (no `$state`): las
 *  mutaciones que se prueban aquí son funciones imperativas que las leen en el momento de la
 *  llamada, igual que hace el componente real con sus props — no hace falta reactividad para
 *  ejercitarlas directamente. */
async function setup(): Promise<{
	state: BlocksState;
	port: ReturnType<typeof createMemoryBackend>;
	feedback: { toast: ReturnType<typeof vi.fn>; reportError: ReturnType<typeof vi.fn> };
	onDirtyChange: ReturnType<typeof vi.fn>;
	setParentId: (id: string | null) => void;
	setDisabled: (value: boolean) => void;
	cleanup: () => void;
}> {
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
	expect(model.warnings).toEqual([]);
	const parentType = model.types.find((t) => t.name === 'landing')!;

	const port = createMemoryBackend({
		users: [{ email: 'admin@vega.test', password: 'test-pass' }],
		contentTypes: [landingType, landingBlockType],
		records: {
			landing: [{ id: 'landing1', values: { title: 'Home' } }],
			landing_block: [
				{ id: 'b1', values: { parent: 'landing1', sort: 0, heading: 'Hero' } },
				{ id: 'b2', values: { parent: 'landing1', sort: 1, heading: 'Features' } }
			]
		}
	});
	await port.login({ email: 'admin@vega.test', password: 'test-pass' });

	const feedback = { toast: vi.fn(), reportError: vi.fn() };
	const ctx = {
		port,
		model,
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es',
		feedback
	} as unknown as VegaAppContext;

	let parentId: string | null = 'landing1';
	let disabled = false;
	const onDirtyChange = vi.fn();

	let state!: BlocksState;
	const cleanup = $effect.root(() => {
		state = createBlocksState({
			ctx,
			parentType,
			getParentId: () => parentId,
			getDisabled: () => disabled,
			onDirtyChange
		});
	});
	// El `$effect` de carga automática (mismo que dispara `RecordBlocks.svelte` al montar) corre en
	// este primer `flushSync`: deja `state` en `'ready'` con los dos bloques sembrados.
	flushSync();
	await vi.waitFor(() => expect(state.status.kind).toBe('ready'));

	return {
		state,
		port,
		feedback,
		onDirtyChange,
		setParentId: (id) => {
			parentId = id;
		},
		setDisabled: (value) => {
			disabled = value;
		},
		cleanup
	};
}

describe('blocks-state.svelte.ts', () => {
	let cleanup: (() => void) | null = null;

	afterEach(() => {
		cleanup?.();
		cleanup = null;
		vi.restoreAllMocks();
	});

	test('una respuesta lenta de load() no pisa a una posterior', async () => {
		const ctxState = await setup();
		cleanup = ctxState.cleanup;
		const { state, port } = ctxState;
		const childName = state.childType!.name;

		const originalList = port.list.bind(port);
		let releaseSlow!: () => void;
		const slowGate = new Promise<void>((resolve) => {
			releaseSlow = resolve;
		});
		let call = 0;
		vi.spyOn(port, 'list').mockImplementation(async (...args) => {
			call += 1;
			if (call === 1) await slowGate; // la PRIMERA llamada es la LENTA
			return originalList(...args);
		});

		// Dos `load()` en vuelo: el primero (lento) resuelve DESPUÉS del segundo (rápido).
		const first = state.load(childName, 'landing1');
		const second = state.load(childName, 'landing1');
		await second;
		expect(state.status.kind).toBe('ready');
		const afterSecond = state.records.map((r) => r.id);

		releaseSlow();
		await first;

		// La respuesta tardía del PRIMER `load()` no debe pisar el resultado ya asentado del segundo.
		expect(state.records.map((r) => r.id)).toEqual(afterSecond);
	});

	test('crear añade el bloque, lo expande y libera el mutex estructural', async () => {
		const ctxState = await setup();
		cleanup = ctxState.cleanup;
		const { state, feedback } = ctxState;

		await state.handleCreate();

		expect(state.records).toHaveLength(3);
		const created = state.records.at(-1)!;
		expect(state.isExpanded(created.id)).toBe(true);
		expect(state.structuralBusy).toBe(false);
		expect(feedback.reportError).not.toHaveBeenCalled();
	});

	test('duplicar clona el bloque, lo inserta justo debajo y avisa con el toast de éxito', async () => {
		const ctxState = await setup();
		cleanup = ctxState.cleanup;
		const { state, feedback } = ctxState;

		const original = state.records[0];
		await state.handleDuplicate(original);

		expect(state.records.map((r) => r.values.heading)).toEqual(['Hero', 'Hero', 'Features']);
		expect(feedback.toast).toHaveBeenCalledWith('Bloque duplicado.', { kind: 'success' });
	});

	test('borrar quita el bloque, limpia pendingDelete y el aviso de sucio', async () => {
		const ctxState = await setup();
		cleanup = ctxState.cleanup;
		const { state, onDirtyChange, feedback } = ctxState;

		const target = state.records[0];
		state.requestDelete(target);
		expect(state.pendingDelete).toBe(target);

		await state.confirmDelete();

		expect(state.records.map((r) => r.id)).toEqual(['b2']);
		expect(state.pendingDelete).toBeNull();
		expect(state.deleting).toBe(false);
		expect(feedback.reportError).not.toHaveBeenCalled();
		// `confirmDelete` limpia el sucio del bloque borrado (aunque no lo tuviera): mismo criterio
		// que documenta la cabecera de `blocks-state.svelte.ts` — no puede sobrevivir a su registro.
		expect(onDirtyChange).not.toHaveBeenCalledWith(true);
	});

	test('un fallo de red al reordenar recarga desde el backend en vez de dejar el orden a medias', async () => {
		const ctxState = await setup();
		cleanup = ctxState.cleanup;
		const { state, port, feedback } = ctxState;

		const originalUpdate = port.update.bind(port);
		vi.spyOn(port, 'update').mockRejectedValueOnce(new Error('fallo de red simulado'));
		const listSpy = vi.spyOn(port, 'list');

		const ok = await state.handleReorder(0, 1);

		expect(ok).toBe(false);
		expect(feedback.reportError).toHaveBeenCalledTimes(1);
		// Recarga automática tras el fallo: `load()` vuelve a llamar a `port.list`.
		expect(listSpy).toHaveBeenCalled();
		// Al no haberse persistido NINGÚN cambio (el `update` mockeado rechazó ANTES de escribir), la
		// recarga trae el orden ORIGINAL, no el reflejo optimista a medias.
		expect(state.records.map((r) => r.id)).toEqual(['b1', 'b2']);

		vi.spyOn(port, 'update').mockImplementation(originalUpdate);
	});

	test('si el registro PADRE cambia con una mutación en vuelo, su resultado se descarta', async () => {
		// Ésta es la propiedad que justifica que `parentId`/`disabled` viajen como GETTERS y no como
		// valores capturados al construir: una mutación que empezó en la página A no puede escribir
		// su resultado en la página B a la que el autor ya ha navegado. El componente lo conseguía
		// leyendo sus props directamente desde dentro de una función `async`; la extracción tenía que
		// conservarlo, y hasta ahora ningún test lo ejercía (el de componente solo cambia de padre en
		// REPOSO, nunca a mitad de operación).
		const ctxState = await setup();
		cleanup = ctxState.cleanup;
		const { state, port, setParentId } = ctxState;

		let soltar: () => void = () => {};
		const puerta = new Promise<void>((resolve) => {
			soltar = resolve;
		});
		const originalCreate = port.create.bind(port);
		vi.spyOn(port, 'create').mockImplementation(async (...args) => {
			await puerta; // el `create` se queda en vuelo hasta que el test lo suelta
			return originalCreate(...(args as Parameters<typeof originalCreate>));
		});

		const antes = state.records.map((r) => r.id);
		const enVuelo = state.handleCreate();
		// El autor navega a OTRO registro padre mientras la escritura sigue en vuelo.
		setParentId('landing2');
		soltar();
		await enVuelo;

		// El bloque se creó en el backend (la escritura ya había salido), pero NO se pinta en la
		// vista actual, que ya es la de otro padre: `isCurrentView` la descarta.
		expect(state.records.map((r) => r.id)).toEqual(antes);
		expect(state.structuralBusy).toBe(false);

		vi.spyOn(port, 'create').mockImplementation(originalCreate);
	});

	test('el agregado "hay algo sucio" sube y baja con el último id que cambia', async () => {
		const ctxState = await setup();
		cleanup = ctxState.cleanup;
		const { state, onDirtyChange } = ctxState;

		state.setDirty('b1', true);
		expect(onDirtyChange).toHaveBeenLastCalledWith(true);
		expect(state.anyDirty).toBe(true);

		state.setDirty('b2', true);
		expect(onDirtyChange).toHaveBeenLastCalledWith(true);

		// Marcar el mismo id con el mismo valor es un no-op: no debe volver a invocar el callback.
		onDirtyChange.mockClear();
		state.setDirty('b1', true);
		expect(onDirtyChange).not.toHaveBeenCalled();

		state.setDirty('b1', false);
		// Con `b2` todavía sucio, el agregado sigue en `true`.
		expect(onDirtyChange).toHaveBeenLastCalledWith(true);
		expect(state.anyDirty).toBe(true);

		state.setDirty('b2', false);
		expect(onDirtyChange).toHaveBeenLastCalledWith(false);
		expect(state.anyDirty).toBe(false);
	});
});
