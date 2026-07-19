/**
 * Suite de `MemoryFileStore.preload` (Fase P6·6b): la vía para que `MemorySeed.files` registre un
 * fichero YA resuelto bajo una `FileRef` exacta, sin pasar por `store()` (que exige un `File` del
 * DOM). El resto de `files.ts` (subida real, diff de estado-final) ya queda cubierto por
 * `tests/contract/*` y los e2e del widget `file` (F5-f); esta suite solo el añadido de 6b.
 */
import { describe, expect, test } from 'vitest';
import { VegaError } from '../../errors';
import { MemoryFileStore, resolveFileUrl } from './files';

describe('MemoryFileStore.preload + resolveFileUrl', () => {
	test('un fichero precargado resuelve su data-URI tal cual', () => {
		const store = new MemoryFileStore();
		store.preload('seed_photo.png', 'seed_photo.png', 'image/png', 'data:image/png;base64,xxx');

		expect(resolveFileUrl(store, 'seed_photo.png')).toBe('data:image/png;base64,xxx');
		expect(store.get('seed_photo.png')).toEqual({
			name: 'seed_photo.png',
			mime: 'image/png',
			dataUri: 'data:image/png;base64,xxx'
		});
	});

	test('una FileRef sin precargar ni subida sigue lanzando notFound (comportamiento previo intacto)', () => {
		const store = new MemoryFileStore();
		expect(() => resolveFileUrl(store, 'no-existe.png')).toThrow(VegaError);
	});

	test('preload sobre una FileRef ya existente la sobrescribe (última llamada gana)', () => {
		const store = new MemoryFileStore();
		store.preload('ref', 'a.png', 'image/png', 'data:image/png;base64,aaa');
		store.preload('ref', 'b.png', 'image/png', 'data:image/png;base64,bbb');

		expect(resolveFileUrl(store, 'ref')).toBe('data:image/png;base64,bbb');
	});
});
