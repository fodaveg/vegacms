import { describe, expect, test, vi } from 'vitest';
import type { BackendPort } from '$lib/backend/port';
import type { VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import { withRecentEdits } from './with-recent-edits';

function fakePort(overrides: Partial<BackendPort> = {}) {
	const saved = (type: string, id: string): VegaRecord => ({ id, type, values: {} });
	const port = {
		currentSession: () => ({ token: 't', user: { id: 'u1', email: 'a@b.c' }, expiresAt: null }),
		create: vi.fn(async (type: string) => saved(type, 'new1')),
		update: vi.fn(async (type: string, id: string) => saved(type, id)),
		...overrides
	} as unknown as BackendPort;
	return port;
}

describe('withRecentEdits', () => {
	test('avisa cuando un create o un update terminan bien, con la cuenta de la sesión', async () => {
		const onSaved = vi.fn();
		const port = withRecentEdits(fakePort(), onSaved);

		await port.create('posts', { title: 'x' });
		await port.update('posts', 'p1', { title: 'y' });

		expect(onSaved.mock.calls.map(([user, type, record]) => [user, type, record.id])).toEqual([
			['u1', 'posts', 'new1'],
			['u1', 'posts', 'p1']
		]);
	});

	test('un guardado rechazado no avisa y el error llega intacto', async () => {
		const onSaved = vi.fn();
		const error = VegaError.network();
		const port = withRecentEdits(
			fakePort({ update: vi.fn(async () => Promise.reject(error)) }),
			onSaved
		);

		await expect(port.update('posts', 'p1', {})).rejects.toBe(error);
		expect(onSaved).not.toHaveBeenCalled();
	});

	test('reordenar a mano no cuenta como edición', async () => {
		const onSaved = vi.fn();
		const port = withRecentEdits(fakePort(), onSaved);

		await port.update('posts', 'p1', { order: 3 }, { orderOnlyField: 'order' });

		expect(onSaved).not.toHaveBeenCalled();
	});

	test('las opciones viajan tal cual, y sin opciones la llamada es la de siempre', async () => {
		const inner = fakePort();
		const port = withRecentEdits(inner, vi.fn());

		await port.update('posts', 'p1', { a: 1 });
		await port.update('posts', 'p1', { a: 1 }, { expectedVersion: 'v1' as never });
		await port.create('posts', { a: 1 });
		await port.create('posts', { a: 1 }, { id: 'fixed' });

		expect(inner.update).toHaveBeenNthCalledWith(1, 'posts', 'p1', { a: 1 });
		expect(inner.update).toHaveBeenNthCalledWith(
			2,
			'posts',
			'p1',
			{ a: 1 },
			{ expectedVersion: 'v1' }
		);
		expect(inner.create).toHaveBeenNthCalledWith(1, 'posts', { a: 1 });
		expect(inner.create).toHaveBeenNthCalledWith(2, 'posts', { a: 1 }, { id: 'fixed' });
	});

	test('si anotar lanza, el guardado sigue devolviendo su registro', async () => {
		const port = withRecentEdits(fakePort(), () => {
			throw new Error('boom');
		});

		await expect(port.create('posts', {})).resolves.toMatchObject({ id: 'new1' });
	});

	test('sin sesión avisa con cuenta null', async () => {
		const onSaved = vi.fn();
		const port = withRecentEdits(fakePort({ currentSession: () => null }), onSaved);

		await port.create('posts', {});

		expect(onSaved).toHaveBeenCalledWith(null, 'posts', expect.objectContaining({ id: 'new1' }));
	});
});
