/**
 * `resolveConflictAuthor`: quién guardó la versión que choca, SOLO si el historial encadena con la
 * versión que se abrió (ver cabecera del módulo). Un doble de puerto con solo `list`.
 */
import { describe, expect, test, vi } from 'vitest';
import type { BackendPort } from '$lib/backend/port';
import type { VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import { recordVersion } from '$lib/backend/version';
import { resolveConflictAuthor } from './conflict-author';

const OPENED = { title: 'Sobre mí', body: 'antes' };

function revision(id: string, values: Record<string, unknown>, author: string, created: string) {
	return {
		id,
		type: 'vega_revisions',
		values: {
			collection: 'pages',
			recordId: 'p1',
			kind: 'update',
			values,
			label: 'x',
			author,
			created
		}
	} as unknown as VegaRecord;
}

function portWith(list: BackendPort['list']): BackendPort {
	return { list } as unknown as BackendPort;
}

describe('resolveConflictAuthor', () => {
	test('la revisión cuya pre-imagen es MI versión encadena: autor y hora de la más reciente', async () => {
		const list = vi.fn(async () => ({
			items: [
				revision(
					'r2',
					{ title: 'Sobre mí y más', body: 'antes' },
					'marta@x.es',
					'2026-09-24T12:44:00.000Z'
				),
				revision('r1', OPENED, 'ana@x.es', '2026-09-24T12:41:00.000Z')
			],
			page: 1,
			perPage: 10,
			totalItems: 2,
			totalPages: 1
		}));
		const result = await resolveConflictAuthor(
			portWith(list),
			'pages',
			'p1',
			recordVersion({ values: OPENED })
		);

		expect(result.author).toBe('marta@x.es');
		expect(result.at?.toISOString()).toBe('2026-09-24T12:44:00.000Z');
		// Filtra por registro y `kind: update`, lo más reciente primero.
		expect(list).toHaveBeenCalledWith(
			'vega_revisions',
			expect.objectContaining({ sort: [{ field: 'created', dir: 'desc' }] })
		);
	});

	test('sin revisión que encadene (cambio hecho fuera de Vega): no se atribuye a nadie', async () => {
		const list = vi.fn(async () => ({
			items: [revision('r1', { title: 'otra cosa' }, 'yo@x.es', '2026-09-24T10:00:00.000Z')],
			page: 1,
			perPage: 10,
			totalItems: 1,
			totalPages: 1
		}));
		await expect(
			resolveConflictAuthor(portWith(list), 'pages', 'p1', recordVersion({ values: OPENED }))
		).resolves.toEqual({ author: null, at: null });
	});

	test('sin historial (colección ausente, sin permiso): "no consta", nunca rechaza', async () => {
		const list = vi.fn(async () => {
			throw VegaError.notFound();
		});
		await expect(
			resolveConflictAuthor(portWith(list), 'pages', 'p1', recordVersion({ values: OPENED }))
		).resolves.toEqual({ author: null, at: null });
	});
});
