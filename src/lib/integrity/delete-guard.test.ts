/**
 * Suite de `createDeleteReferencesGuard` (`#lote-integridad`, Fase A). Mismo criterio que
 * `media-picker-state.test.ts`: sin montar ningún componente, el proyecto `server` (node) basta
 * para ejercitar runas fuera de un árbol Svelte.
 */

import { describe, expect, test, vi } from 'vitest';
import type { VegaAppContext } from '$lib/app-context';
import type { ContentType, Page, VegaRecord } from '$lib/backend/types';
import { createDeleteReferencesGuard } from './delete-guard.svelte';

function resolvedType(schema: ContentType) {
	return {
		schema,
		name: schema.name,
		label: schema.name
	} as VegaAppContext['model']['types'][number];
}

/** `VegaAppContext` mínimo: solo `model.types`/`port.list` importan a este módulo (ver cabecera de
 *  `delete-guard.ts`, "sin volver a tocar la red para releer el esquema"). */
function fakeCtx(types: ContentType[], list: VegaAppContext['port']['list']): VegaAppContext {
	return {
		model: { types: types.map(resolvedType) },
		port: { list }
	} as unknown as VegaAppContext;
}

function page(items: VegaRecord[], totalItems: number): Page<VegaRecord> {
	return { items, page: 1, perPage: 5, totalItems, totalPages: Math.ceil(totalItems / 5) };
}

function record(collection: string, id: string): VegaRecord {
	return { id, type: collection, values: {} };
}

const peopleTarget = { collection: 'people', id: 'x1' };

const postsWithRelation: ContentType = {
	name: 'posts',
	readonly: false,
	fields: [
		{
			name: 'author',
			type: 'relation',
			target: 'people',
			multiple: false,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

describe('createDeleteReferencesGuard', () => {
	test('arranca en idle', () => {
		const guard = createDeleteReferencesGuard();
		expect(guard.status).toEqual({ kind: 'idle' });
		expect(guard.needsExplicitConfirm).toBe(false);
	});

	test('sin referencias: ready, needsExplicitConfirm false', async () => {
		const guard = createDeleteReferencesGuard();
		const list = vi.fn().mockResolvedValue(page([], 0));
		guard.check(fakeCtx([postsWithRelation], list), peopleTarget);
		await vi.waitFor(() => expect(guard.status.kind).toBe('ready'));

		expect(guard.needsExplicitConfirm).toBe(false);
		expect(guard.status).toMatchObject({ kind: 'ready', report: { groups: [], partial: false } });
	});

	test('con referencias: ready, needsExplicitConfirm true', async () => {
		const guard = createDeleteReferencesGuard();
		const list = vi.fn().mockResolvedValue(page([record('posts', 'p1')], 1));
		guard.check(fakeCtx([postsWithRelation], list), peopleTarget);
		await vi.waitFor(() => expect(guard.status.kind).toBe('ready'));

		expect(guard.needsExplicitConfirm).toBe(true);
	});

	test('degradado parcial (una colección forbidden): ready igualmente, needsExplicitConfirm true', async () => {
		const guard = createDeleteReferencesGuard();
		const list = vi.fn().mockRejectedValue(new Error('nope'));
		guard.check(fakeCtx([postsWithRelation], list), peopleTarget);
		await vi.waitFor(() => expect(guard.status.kind).toBe('ready'));

		expect(guard.needsExplicitConfirm).toBe(true);
		if (guard.status.kind === 'ready') {
			expect(guard.status.report.partial).toBe(true);
		}
	});

	test('fallo TOTAL (el motor rechaza, defensivo): error, NUNCA needsExplicitConfirm (no bloquea)', async () => {
		const guard = createDeleteReferencesGuard();
		// `list` lanza de forma SÍNCRONA (no una promesa rechazada): revienta dentro del `.map()` de
		// `findReferences`, que al vivir en una función async convierte ese throw en la promesa
		// entera rechazada — el único camino real a `status: 'error'` (ver cabecera del módulo).
		const list = vi.fn(() => {
			throw new Error('boom');
		}) as unknown as VegaAppContext['port']['list'];
		guard.check(fakeCtx([postsWithRelation], list), peopleTarget);
		await vi.waitFor(() => expect(guard.status.kind).toBe('error'));

		expect(guard.needsExplicitConfirm).toBe(false);
	});

	test('anti-carrera: solo el resultado de la llamada MÁS RECIENTE gana', async () => {
		const guard = createDeleteReferencesGuard();
		let resolveFirst!: (value: Page<VegaRecord>) => void;
		const list = vi
			.fn()
			.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
			.mockResolvedValueOnce(page([], 0));

		const ctx = fakeCtx([postsWithRelation], list);
		guard.check(ctx, peopleTarget); // primera, lenta
		guard.check(ctx, peopleTarget); // segunda, rápida — gana
		await vi.waitFor(() => expect(guard.status.kind).toBe('ready'));

		// La primera resuelve TARDE, con referencias — no debe pisar el resultado ya asentado.
		resolveFirst(page([record('posts', 'p1')], 1));
		await new Promise((r) => setTimeout(r, 0));

		expect(guard.needsExplicitConfirm).toBe(false);
	});

	test('reset() vuelve a idle', async () => {
		const guard = createDeleteReferencesGuard();
		const list = vi.fn().mockResolvedValue(page([], 0));
		guard.check(fakeCtx([postsWithRelation], list), peopleTarget);
		await vi.waitFor(() => expect(guard.status.kind).toBe('ready'));

		guard.reset();
		expect(guard.status).toEqual({ kind: 'idle' });
		expect(guard.needsExplicitConfirm).toBe(false);
	});
});
