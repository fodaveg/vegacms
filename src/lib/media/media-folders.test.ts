import { describe, expect, test, vi } from 'vitest';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { ensureMediaCollection, VEGA_MEDIA_COLLECTION } from './media-collection';
import {
	ensureMediaFolders,
	loadMediaFolders,
	mediaFoldersState,
	moveSelectedMedia,
	normalizeMediaFolderName
} from './media-folders';
import { buildMediaListQuery, mediaPageToParams, parseMediaFolder } from './media-query';

async function library() {
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'test-password' });
	await ensureMediaCollection(port);
	return port;
}
describe('carpetas planas aditivas', () => {
	test('la biblioteca canónica sigue sola; completar conserva esquema y registros, es idempotente', async () => {
		const port = await library();
		expect(VEGA_MEDIA_COLLECTION.fields.some((f) => f.name === 'folder')).toBe(false);
		const previous = await port.listContentTypes();
		expect(mediaFoldersState(previous)).toBe('missing');
		await ensureMediaFolders(port);
		expect(mediaFoldersState(await port.listContentTypes())).toBe('ready');
		const snapshot = await port.listContentTypes();
		await ensureMediaFolders(port);
		expect(await port.listContentTypes()).toEqual(snapshot);
	});
	test('rechaza relación múltiple sin mutar el esquema', async () => {
		const port = await library();
		await ensureMediaFolders(port);
		const types = await port.listContentTypes();
		const media = types.find((t) => t.name === 'vega_media')!;
		const folder = media.fields.find((f) => f.name === 'folder')!;
		const incompatible = types.map((t) =>
			t === media
				? { ...t, fields: t.fields.map((f) => (f === folder ? { ...f, multiple: true } : f)) }
				: t
		);
		const ensure = vi.spyOn(port, 'ensureCollections');
		const write = vi.spyOn(port, 'addCollectionFields');
		vi.spyOn(port, 'listContentTypes').mockResolvedValue(incompatible);
		expect(mediaFoldersState(incompatible)).toBe('incompatible');
		await expect(ensureMediaFolders(port)).rejects.toThrow();
		expect(ensure).not.toHaveBeenCalled();
		expect(write).not.toHaveBeenCalled();
	});
	test('carga más de200carpetas y ordena por nombre', async () => {
		const port = await library();
		await ensureMediaFolders(port);
		for (let i = 0; i < 205; i++)
			await port.create('vega_media_folders', {
				name: `Carpeta ${String(204 - i).padStart(3, '0')}`
			});
		const folders = await loadMediaFolders(port);
		expect(folders).toHaveLength(205);
		expect(folders[0]?.name).toBe('Carpeta 000');
		expect(folders.at(-1)?.name).toBe('Carpeta 204');
	});
	test('recorta nombres y valida los extremos', () => {
		expect(normalizeMediaFolderName('  Viajes  ')).toBe('Viajes');
		expect(() => normalizeMediaFolderName(' ')).toThrow();
		expect(() => normalizeMediaFolderName('x'.repeat(81))).toThrow();
		expect(normalizeMediaFolderName('x'.repeat(80))).toHaveLength(80);
	});
	test('AND entre búsqueda y carpeta; URL tolerante y sin carpeta', () => {
		expect(buildMediaListQuery(1, { search: 'mar', folder: 'f1' }).filter).toMatchObject({
			kind: 'group',
			combinator: 'and',
			nodes: [{ kind: 'group' }, { field: 'folder', op: 'eq', value: 'f1' }]
		});
		expect(buildMediaListQuery(1, { folder: 'none' }).filter).toEqual({
			kind: 'cond',
			field: 'folder',
			op: 'empty',
			value: null
		});
		expect(parseMediaFolder(new URLSearchParams('folder=%22bad'))).toBeNull();
		expect(mediaPageToParams(2, 'f1').toString()).toBe('page=2&folder=f1');
	});
	test('mover corta al primer fallo y solo suelta selección de éxitos', async () => {
		const update = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('denied'));
		const moved = vi.fn();
		const result = await moveSelectedMedia({ update }, ['a', 'b', 'c'], 'folder', moved);
		expect(result.moved).toBe(1);
		expect(result.failure).toBeInstanceOf(Error);
		expect(update).toHaveBeenCalledTimes(2);
		expect(moved).toHaveBeenCalledExactlyOnceWith('a');
	});
});
