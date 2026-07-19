/**
 * Suite del esquema canónico de `vega_media` (contrato P6 §3/§9): forma de `VEGA_MEDIA_COLLECTION`
 * (D-P6.1 opción A: `file` required, SIN `image/svg+xml` por D-P6.3), `computeMediaCollectionState`
 * como reutilización directa del cálculo genérico (audit H6), y el invariante L-P6.10 (la spec a
 * `ensureCollections` contiene ÚNICAMENTE `'vega_media'`).
 */

import { describe, expect, test, vi } from 'vitest';
import type { BackendPort } from '$lib/backend/port';
import { checkReservedNames, isReservedCollectionName } from '$lib/backend/collections';
import type { ContentType } from '$lib/backend/types';
import {
	buildMediaBootstrapImportJson,
	computeMediaCollectionState,
	ensureMediaCollection,
	VEGA_MEDIA_COLLECTION
} from './media-collection';

describe('VEGA_MEDIA_COLLECTION (D-P6.1 opción A)', () => {
	test('nombre reservado y aceptado por el guardarraíl del prefijo (§A.4.3)', () => {
		expect(VEGA_MEDIA_COLLECTION.name).toBe('vega_media');
		expect(isReservedCollectionName(VEGA_MEDIA_COLLECTION.name)).toBe(true);
		expect(checkReservedNames([VEGA_MEDIA_COLLECTION])).toEqual({});
	});

	test('el campo "file" es requerido, single, con tope de 10 MiB y SIN image/svg+xml (D-P6.3)', () => {
		const file = VEGA_MEDIA_COLLECTION.fields.find((f) => f.name === 'file');
		expect(file).toMatchObject({
			type: 'file',
			required: true,
			multiple: false,
			maxSizeBytes: 10 * 1024 * 1024
		});
		expect(file?.type).toBe('file');
		if (file?.type === 'file') {
			expect(file.mimeTypes).toEqual([
				'image/png',
				'image/jpeg',
				'image/webp',
				'image/gif',
				'application/pdf'
			]);
			expect(file.mimeTypes).not.toContain('image/svg+xml');
		}
	});

	test('alt/title son texto libre, tags es json, created es autodate (habilita "más reciente")', () => {
		const byName = new Map(VEGA_MEDIA_COLLECTION.fields.map((f) => [f.name, f]));
		expect(byName.get('alt')).toMatchObject({ type: 'text' });
		expect(byName.get('title')).toMatchObject({ type: 'text' });
		expect(byName.get('tags')).toMatchObject({ type: 'json' });
		expect(byName.get('created')).toMatchObject({ type: 'autodate' });
	});

	test('buildMediaBootstrapImportJson() produce un JSON de importación determinista con los 5 campos', () => {
		const json = JSON.parse(buildMediaBootstrapImportJson());
		expect(json).toHaveLength(1);
		expect(json[0].name).toBe('vega_media');
		expect(json[0].fields.map((f: { name: string }) => f.name)).toEqual([
			'file',
			'alt',
			'title',
			'tags',
			'created'
		]);
		const fileField = json[0].fields.find((f: { name: string }) => f.name === 'file');
		expect(fileField.required).toBe(true);
		expect(fileField.mimeTypes).not.toContain('image/svg+xml');
		const createdField = json[0].fields.find((f: { name: string }) => f.name === 'created');
		expect(createdField).toMatchObject({ type: 'autodate', onCreate: true, onUpdate: false });
	});
});

describe('computeMediaCollectionState (reutiliza el cálculo genérico, audit H6)', () => {
	const media: ContentType = { name: 'vega_media', readonly: false, fields: [] };
	const other: ContentType = { name: 'post', readonly: false, fields: [] };

	test('present / creatable / manual, igual que el cálculo genérico', () => {
		expect(computeMediaCollectionState([other, media], true)).toBe('present');
		expect(computeMediaCollectionState([other], true)).toBe('creatable');
		expect(computeMediaCollectionState([other], false)).toBe('manual');
	});
});

describe('ensureMediaCollection (L-P6.10: la spec contiene ÚNICAMENTE "vega_media")', () => {
	test('llama a port.ensureCollections con un array de un único elemento, vega_media', async () => {
		const ensureCollections = vi.fn().mockResolvedValue({ created: ['vega_media'], skipped: [] });
		const fakePort = { ensureCollections } as unknown as BackendPort;

		await ensureMediaCollection(fakePort);

		expect(ensureCollections).toHaveBeenCalledTimes(1);
		const specs = ensureCollections.mock.calls[0][0];
		expect(specs).toHaveLength(1);
		expect(specs[0].name).toBe('vega_media');
	});
});
