/**
 * Tests unitarios de `serializeRecord` (§2 del contrato, ver la cabecera de
 * `export-collection.ts`): reutiliza `VegaRecord.values` tal cual, enriqueciendo SOLO los campos
 * `file`/`file[]` a `{ file, url }`.
 */

import { describe, expect, it } from 'vitest';
import type { Field } from '$lib/backend/types';
import { serializeRecord } from './record-serializer';

function field(overrides: Partial<Field> & Pick<Field, 'name' | 'type'>): Field {
	return {
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false,
		...overrides
	} as Field;
}

describe('serializeRecord', () => {
	it('los campos no-file viajan intactos, id incluido, sin tocar el resto de la forma', () => {
		const record = {
			id: 'r1',
			type: 'posts',
			values: { title: 'Hola', count: 3, active: true, tags: ['a', 'b'], meta: null }
		};
		const fields: Field[] = [field({ name: 'title', type: 'text', subtype: 'plain' })];

		const result = serializeRecord(record, fields, () => 'never called');

		expect(result).toEqual({
			id: 'r1',
			values: { title: 'Hola', count: 3, active: true, tags: ['a', 'b'], meta: null }
		});
	});

	it('un campo file NO múltiple con valor se enriquece a { file, url }', () => {
		const record = { id: 'r1', type: 'posts', values: { cover: 'photo.jpg' } };
		const fields: Field[] = [field({ name: 'cover', type: 'file', multiple: false })];
		const fileUrl = (f: string, file: string) =>
			`https://origin.test/api/files/posts/r1/${file}?f=${f}`;

		const result = serializeRecord(record, fields, fileUrl);

		expect(result.values.cover).toEqual({
			file: 'photo.jpg',
			url: 'https://origin.test/api/files/posts/r1/photo.jpg?f=cover'
		});
	});

	it("un campo file NO múltiple VACÍO viaja intacto (''), sin llamar a fileUrl", () => {
		const record = { id: 'r1', type: 'posts', values: { cover: '' } };
		const fields: Field[] = [field({ name: 'cover', type: 'file', multiple: false })];
		let called = false;

		const result = serializeRecord(record, fields, () => {
			called = true;
			return 'x';
		});

		expect(result.values.cover).toBe('');
		expect(called).toBe(false);
	});

	it('un campo file MÚLTIPLE enriquece cada FileRef, filtrando entradas vacías', () => {
		const record = { id: 'r1', type: 'posts', values: { gallery: ['a.jpg', '', 'b.jpg'] } };
		const fields: Field[] = [field({ name: 'gallery', type: 'file', multiple: true })];
		const fileUrl = (f: string, file: string) => `https://origin.test/${f}/${file}`;

		const result = serializeRecord(record, fields, fileUrl);

		expect(result.values.gallery).toEqual([
			{ file: 'a.jpg', url: 'https://origin.test/gallery/a.jpg' },
			{ file: 'b.jpg', url: 'https://origin.test/gallery/b.jpg' }
		]);
	});

	it('un campo file MÚLTIPLE vacío ([]) viaja como [] sin llamar a fileUrl', () => {
		const record = { id: 'r1', type: 'posts', values: { gallery: [] } };
		const fields: Field[] = [field({ name: 'gallery', type: 'file', multiple: true })];
		let called = false;

		const result = serializeRecord(record, fields, () => {
			called = true;
			return 'x';
		});

		expect(result.values.gallery).toEqual([]);
		expect(called).toBe(false);
	});

	it('un valor presente en `values` pero fuera de `fields` (campo desconocido) viaja intacto', () => {
		const record = { id: 'r1', type: 'posts', values: { legacy: 'algo' } };

		const result = serializeRecord(record, [], () => 'never called');

		expect(result.values.legacy).toBe('algo');
	});
});
