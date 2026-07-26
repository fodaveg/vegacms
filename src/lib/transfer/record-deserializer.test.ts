/**
 * Tests unitarios de `deserializeRecord` (§4.3/§4.4 del contrato, ver la cabecera de
 * `record-deserializer.ts`): filtrado a campos escribibles, resolución de campos `file` single/
 * múltiple vía `fetchFile`, y el desenlace "sin ese fichero" cuando no se puede traer.
 */

import { describe, expect, it } from 'vitest';
import type { Field } from '$lib/backend/types';
import type { TransferFileValue, TransferRecord } from './record-serializer';
import { deserializeRecord } from './record-deserializer';

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

const neverFetch = async (): Promise<File | null> => {
	throw new Error('fetchFile no debería llamarse');
};

describe('deserializeRecord', () => {
	it('los campos escribibles no-file viajan intactos', async () => {
		const record: TransferRecord = {
			id: 'r1',
			values: { title: 'Hola', count: 3, active: true }
		};
		const fields: Field[] = [
			field({ name: 'title', type: 'text', subtype: 'plain' }),
			field({ name: 'count', type: 'number', integer: true }),
			field({ name: 'active', type: 'bool' })
		];

		const result = await deserializeRecord(record, fields, neverFetch);

		expect(result.values).toEqual({ title: 'Hola', count: 3, active: true });
		expect(result.missingFiles).toEqual([]);
	});

	it('un campo readonly (created/updated) del esquema NUNCA se escribe', async () => {
		const record: TransferRecord = {
			id: 'r1',
			values: { title: 'Hola', created: '2026-01-01T00:00:00Z' }
		};
		const fields: Field[] = [
			field({ name: 'title', type: 'text', subtype: 'plain' }),
			field({ name: 'created', type: 'date', readonly: true })
		];

		const result = await deserializeRecord(record, fields, neverFetch);

		expect(result.values).toEqual({ title: 'Hola' });
	});

	it('un campo que ya no existe en el esquema del destino se descarta silenciosamente', async () => {
		const record: TransferRecord = { id: 'r1', values: { title: 'Hola', legacy: 'x' } };
		const fields: Field[] = [field({ name: 'title', type: 'text', subtype: 'plain' })];

		const result = await deserializeRecord(record, fields, neverFetch);

		expect(result.values).toEqual({ title: 'Hola' });
	});

	it('un campo unsupported nunca se escribe', async () => {
		const record: TransferRecord = { id: 'r1', values: { geo: { lat: 1 } as never } };
		const fields: Field[] = [field({ name: 'geo', type: 'unsupported', backendType: 'geoPoint' })];

		const result = await deserializeRecord(record, fields, neverFetch);

		expect(result.values).toEqual({});
	});

	it('file NO múltiple: {file,url} se trae y se sustituye por el File resultante', async () => {
		const transferFile: TransferFileValue = { file: 'a.jpg', url: 'https://x/a.jpg' };
		const record: TransferRecord = { id: 'r1', values: { cover: transferFile } };
		const fields: Field[] = [field({ name: 'cover', type: 'file', multiple: false })];
		const fakeFile = new File(['x'], 'a.jpg');

		const result = await deserializeRecord(record, fields, async () => fakeFile);

		expect(result.values.cover).toBe(fakeFile);
		expect(result.missingFiles).toEqual([]);
	});

	it("file NO múltiple VACÍO ('') se escribe como null (nunca '' — bug real, ver cabecera: `''` es RECHAZADO por PocketBase como FileRef ajeno), sin llamar a fetchFile", async () => {
		const record: TransferRecord = { id: 'r1', values: { cover: '' } };
		const fields: Field[] = [field({ name: 'cover', type: 'file', multiple: false })];

		const result = await deserializeRecord(record, fields, neverFetch);

		expect(result.values.cover).toBeNull();
		expect(result.missingFiles).toEqual([]);
	});

	it("file NO múltiple que no se puede traer: entra como null (nunca '') y se reporta en missingFiles", async () => {
		const transferFile: TransferFileValue = { file: 'a.jpg', url: 'https://x/a.jpg' };
		const record: TransferRecord = { id: 'r1', values: { cover: transferFile } };
		const fields: Field[] = [field({ name: 'cover', type: 'file', multiple: false })];

		const result = await deserializeRecord(record, fields, async () => null);

		expect(result.values.cover).toBeNull();
		expect(result.missingFiles).toEqual(['cover']);
	});

	it('un FileRef crudo (sin url, deriva de esquema) es igual de irresoluble que un fallo de red', async () => {
		const record: TransferRecord = { id: 'r1', values: { cover: 'old-ref.jpg' } };
		const fields: Field[] = [field({ name: 'cover', type: 'file', multiple: false })];

		const result = await deserializeRecord(record, fields, neverFetch);

		expect(result.values.cover).toBeNull();
		expect(result.missingFiles).toEqual(['cover']);
	});

	it('file MÚLTIPLE: cada entrada resuelta entra en el array, las irresolubles se omiten', async () => {
		const a: TransferFileValue = { file: 'a.jpg', url: 'https://x/a.jpg' };
		const b: TransferFileValue = { file: 'b.jpg', url: 'https://x/b.jpg' };
		const record: TransferRecord = { id: 'r1', values: { gallery: [a, b] } };
		const fields: Field[] = [field({ name: 'gallery', type: 'file', multiple: true })];
		const fileA = new File(['x'], 'a.jpg');

		const result = await deserializeRecord(record, fields, async (file) =>
			file.file === 'a.jpg' ? fileA : null
		);

		expect(result.values.gallery).toEqual([fileA]);
		expect(result.missingFiles).toEqual(['gallery']);
	});

	it('file MÚLTIPLE vacío ([]) viaja como [], sin missingFiles', async () => {
		const record: TransferRecord = { id: 'r1', values: { gallery: [] } };
		const fields: Field[] = [field({ name: 'gallery', type: 'file', multiple: true })];

		const result = await deserializeRecord(record, fields, neverFetch);

		expect(result.values.gallery).toEqual([]);
		expect(result.missingFiles).toEqual([]);
	});
});
