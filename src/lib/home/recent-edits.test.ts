import { describe, expect, test } from 'vitest';
import type { VegaRecord } from '$lib/backend/types';
import {
	RECENT_EDITS_LIMIT,
	addRecentEdit,
	parseRecentEdits,
	recentEditTarget,
	recentEditsStorageKey,
	removeRecentEdits,
	serializeRecentEdits,
	type RecentEdit
} from './recent-edits';
import {
	forgetRecentEdits,
	noteRecentEdit,
	noteSavedRecord,
	readRecentEdits,
	setRecentEditsTypes,
	type RecentEditsStorage
} from './recent-edits-store';
import { type } from './fixture';

function edit(id: string, savedAt: number, collection = 'posts'): RecentEdit {
	return { collection, id, savedAt };
}

/** `localStorage` de mentira, con su contenido a la vista. */
function fakeStorage(): RecentEditsStorage & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => void data.set(key, value)
	};
}

const throwingStorage: RecentEditsStorage = {
	getItem() {
		throw new Error('SecurityError');
	},
	setItem() {
		throw new Error('QuotaExceededError');
	}
};

describe('addRecentEdit', () => {
	test('lo último guardado va primero', () => {
		const list = addRecentEdit([edit('a', 1)], edit('b', 2));
		expect(list.map((item) => item.id)).toEqual(['b', 'a']);
	});

	test('guarda como mucho 8: el noveno expulsa al más antiguo', () => {
		let list: RecentEdit[] = [];
		for (let i = 1; i <= RECENT_EDITS_LIMIT + 1; i++) list = addRecentEdit(list, edit(`r${i}`, i));
		expect(list).toHaveLength(8);
		expect(list[0]?.id).toBe('r9');
		expect(list.map((item) => item.id)).not.toContain('r1');
	});

	test('volver a guardar un registro lo sube arriba, sin repetirlo', () => {
		const list = addRecentEdit([edit('b', 2), edit('a', 1)], edit('a', 3));
		expect(list).toEqual([edit('a', 3), edit('b', 2)]);
	});

	test('el mismo id en otra colección es otro registro', () => {
		const list = addRecentEdit([edit('a', 1, 'posts')], edit('a', 2, 'pages'));
		expect(list).toHaveLength(2);
	});
});

describe('removeRecentEdits', () => {
	test('quita solo los registros indicados', () => {
		const list = [edit('a', 3), edit('b', 2), edit('a', 1, 'pages')];
		expect(removeRecentEdits(list, [{ collection: 'posts', id: 'a' }])).toEqual([
			edit('b', 2),
			edit('a', 1, 'pages')
		]);
	});
});

describe('parseRecentEdits', () => {
	test('ida y vuelta con serializeRecentEdits', () => {
		const list = [edit('b', 2), edit('a', 1)];
		expect(parseRecentEdits(serializeRecentEdits(list))).toEqual(list);
	});

	test.each([
		['nada guardado', null],
		['cadena vacía', ''],
		['JSON roto', '{"collection":'],
		['no es una lista', '{"collection":"posts","id":"a","savedAt":1}'],
		['un texto suelto', '"hola"']
	])('entrada corrupta (%s): lista vacía, sin lanzar', (_name, raw) => {
		expect(parseRecentEdits(raw)).toEqual([]);
	});

	test('descarta las entradas con otra forma y conserva las buenas', () => {
		const raw = JSON.stringify([
			{ collection: 'posts', id: 'a', savedAt: 5 },
			{ collection: 'posts', id: 'b' },
			{ collection: '', id: 'c', savedAt: 4 },
			{ collection: 'posts', id: 7, savedAt: 3 },
			{ collection: 'posts', id: 'd', savedAt: 'ayer' },
			null,
			'x'
		]);
		expect(parseRecentEdits(raw)).toEqual([edit('a', 5)]);
	});

	test('un valor tocado a mano sale ordenado, sin repetidos y con el tope', () => {
		const items = Array.from({ length: 12 }, (_, i) => edit(`r${i}`, i));
		const list = parseRecentEdits(JSON.stringify([...items, edit('r11', 1)]));
		expect(list).toHaveLength(8);
		expect(list[0]).toEqual(edit('r11', 11));
		expect(list.map((item) => item.savedAt)).toEqual([11, 10, 9, 8, 7, 6, 5, 4]);
	});

	test('no guarda nada más que colección, id y hora', () => {
		const raw = JSON.stringify([{ collection: 'posts', id: 'a', savedAt: 1, email: 'x@y.z' }]);
		expect(parseRecentEdits(raw)).toEqual([edit('a', 1)]);
	});
});

describe('recentEditsStorageKey', () => {
	test('clave versionada, distinta por cuenta y por instancia', () => {
		expect(recentEditsStorageKey('', 'u1')).toBe('vega.recentEdits.v1::u1');
		expect(recentEditsStorageKey('', 'u1')).not.toBe(recentEditsStorageKey('', 'u2'));
		expect(recentEditsStorageKey('https://a.example', 'u1')).not.toBe(
			recentEditsStorageKey('https://b.example', 'u1')
		);
	});
});

describe('almacenamiento', () => {
	test('anota y lee, lo más reciente primero', () => {
		const storage = fakeStorage();
		noteRecentEdit('u1', { collection: 'posts', id: 'a' }, 10, storage);
		noteRecentEdit('u1', { collection: 'posts', id: 'b' }, 20, storage);
		expect(readRecentEdits('u1', storage)).toEqual([edit('b', 20), edit('a', 10)]);
	});

	test('dos cuentas en el mismo navegador no ven lo de la otra', () => {
		const storage = fakeStorage();
		noteRecentEdit('u1', { collection: 'posts', id: 'a' }, 10, storage);
		expect(readRecentEdits('u2', storage)).toEqual([]);
		expect([...storage.data.keys()]).toEqual(['vega.recentEdits.v1::u1']);
	});

	test('la clave lleva el id de la cuenta, nunca el correo', () => {
		const storage = fakeStorage();
		noteRecentEdit('u1', { collection: 'posts', id: 'a' }, 10, storage);
		const dump = JSON.stringify([...storage.data]);
		expect(dump).not.toContain('@');
	});

	test('un localStorage que lanza no rompe nada: lee vacío y no anota', () => {
		expect(readRecentEdits('u1', throwingStorage)).toEqual([]);
		expect(() =>
			noteRecentEdit('u1', { collection: 'posts', id: 'a' }, 10, throwingStorage)
		).not.toThrow();
		expect(() =>
			forgetRecentEdits('u1', [{ collection: 'posts', id: 'a' }], throwingStorage)
		).not.toThrow();
	});

	test('sin localStorage (null) tampoco', () => {
		expect(readRecentEdits('u1', null)).toEqual([]);
		expect(() => noteRecentEdit('u1', { collection: 'posts', id: 'a' }, 10, null)).not.toThrow();
	});

	test('una entrada corrupta se lee como vacía y el siguiente guardado la reemplaza', () => {
		const storage = fakeStorage();
		storage.data.set('vega.recentEdits.v1::u1', '<<<no es JSON>>>');
		expect(readRecentEdits('u1', storage)).toEqual([]);
		noteRecentEdit('u1', { collection: 'posts', id: 'a' }, 10, storage);
		expect(readRecentEdits('u1', storage)).toEqual([edit('a', 10)]);
	});

	test('forgetRecentEdits quita lo que ya no existe', () => {
		const storage = fakeStorage();
		noteRecentEdit('u1', { collection: 'posts', id: 'a' }, 10, storage);
		noteRecentEdit('u1', { collection: 'posts', id: 'b' }, 20, storage);
		forgetRecentEdits('u1', [{ collection: 'posts', id: 'a' }], storage);
		expect(readRecentEdits('u1', storage)).toEqual([edit('b', 20)]);
	});
});

describe('recentEditTarget / noteSavedRecord', () => {
	const page = type('pages', {
		blocks: { collection: 'page_blocks', parentField: 'page', orderField: 'order' }
	});
	const types = [
		type('posts'),
		page,
		type('page_blocks', { hidden: true }),
		type('vega_media', { hidden: true })
	];
	const record = (id: string, values: VegaRecord['values'] = {}): VegaRecord => ({
		id,
		type: 'x',
		values
	});

	test('un tipo visible se anota tal cual', () => {
		expect(recentEditTarget(types, 'posts', record('p1'))).toEqual({
			collection: 'posts',
			id: 'p1'
		});
	});

	test('guardar un bloque anota su página, no el bloque', () => {
		expect(recentEditTarget(types, 'page_blocks', record('b1', { page: 'pg1' }))).toEqual({
			collection: 'pages',
			id: 'pg1'
		});
	});

	test('colecciones ocultas, desconocidas o un bloque sin padre no se anotan', () => {
		expect(recentEditTarget(types, 'vega_media', record('m1'))).toBeNull();
		expect(recentEditTarget(types, 'vega_revisions', record('r1'))).toBeNull();
		expect(recentEditTarget(types, 'page_blocks', record('b1', { page: '' }))).toBeNull();
	});

	test('noteSavedRecord anota con el modelo entregado y calla sin él o sin cuenta', () => {
		const storage = fakeStorage();
		setRecentEditsTypes(null);
		noteSavedRecord('u1', 'posts', record('p1'), 1, storage);
		expect(readRecentEdits('u1', storage)).toEqual([]);

		setRecentEditsTypes(types);
		noteSavedRecord(null, 'posts', record('p1'), 2, storage);
		noteSavedRecord('u1', 'vega_media', record('m1'), 3, storage);
		noteSavedRecord('u1', 'posts', record('p1'), 4, storage);
		noteSavedRecord('u1', 'page_blocks', record('b1', { page: 'pg1' }), 5, storage);
		expect(readRecentEdits('u1', storage)).toEqual([edit('pg1', 5, 'pages'), edit('p1', 4)]);

		expect(() => noteSavedRecord('u1', 'posts', record('p2'), 6, throwingStorage)).not.toThrow();
		setRecentEditsTypes(null);
	});
});
