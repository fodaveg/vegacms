/**
 * Tests de `loadLatest`: la respuesta vieja del registro A no puede pisar el B (audit 30 sep,
 * «Editar y editor visual: descartar la respuesta vieja al cambiar de registro»).
 */

import { describe, expect, it } from 'vitest';
import { RequestSequencer } from '$lib/list/list-load';
import { loadLatest } from './latest-load';

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('loadLatest', () => {
	it('devuelve el valor cuando nadie la reemplaza', async () => {
		const seq = new RequestSequencer();
		expect(await loadLatest(seq, async () => 'A')).toEqual({
			stale: false,
			ok: true,
			value: 'A'
		});
	});

	it('descarta A si B se pidió después, aunque A llegue la última', async () => {
		const seq = new RequestSequencer();
		const a = deferred<string>();
		const b = deferred<string>();
		const loadA = loadLatest(seq, () => a.promise);
		const loadB = loadLatest(seq, () => b.promise);
		b.resolve('B');
		a.resolve('A');
		expect(await loadB).toEqual({ stale: false, ok: true, value: 'B' });
		expect(await loadA).toEqual({ stale: true });
	});

	it('descarta también el ERROR de la carga vieja', async () => {
		const seq = new RequestSequencer();
		const a = deferred<string>();
		const loadA = loadLatest(seq, () => a.promise);
		const loadB = loadLatest(seq, async () => 'B');
		a.reject(new Error('boom'));
		expect(await loadA).toEqual({ stale: true });
		expect(await loadB).toMatchObject({ stale: false, ok: true });
	});

	it('el error de la carga vigente viaja en el resultado, no rechaza', async () => {
		const seq = new RequestSequencer();
		const err = new Error('boom');
		expect(
			await loadLatest(seq, async () => {
				throw err;
			})
		).toEqual({ stale: false, ok: false, error: err });
	});
});
