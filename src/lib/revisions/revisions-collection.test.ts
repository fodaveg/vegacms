/**
 * Suite del esquema canónico de `vega_revisions` (`#lote-integridad`, Fase B §1): forma de
 * `VEGA_REVISIONS_COLLECTION`, `computeRevisionsCollectionState` como reutilización directa del
 * cálculo genérico (mismo criterio que `media-collection.test.ts`) y el JSON de importación
 * determinista.
 */

import { describe, expect, test, vi } from 'vitest';
import type { BackendPort } from '$lib/backend/port';
import { isReservedCollectionName } from '$lib/backend/collections';
import type { ContentType } from '$lib/backend/types';
import {
	buildRevisionsBootstrapImportJson,
	computeRevisionsCollectionState,
	ensureRevisionsCollection,
	VEGA_REVISIONS_COLLECTION
} from './revisions-collection';

describe('VEGA_REVISIONS_COLLECTION (§1 del contrato de Fase B)', () => {
	test('nombre reservado (vega_*, ocultamiento automático de model/resolve.ts)', () => {
		expect(VEGA_REVISIONS_COLLECTION.name).toBe('vega_revisions');
		expect(isReservedCollectionName(VEGA_REVISIONS_COLLECTION.name)).toBe(true);
	});

	test('collection/recordId/kind son texto requerido; values es json', () => {
		const byName = new Map(VEGA_REVISIONS_COLLECTION.fields.map((f) => [f.name, f]));
		expect(byName.get('collection')).toMatchObject({ type: 'text', required: true });
		expect(byName.get('recordId')).toMatchObject({ type: 'text', required: true });
		expect(byName.get('kind')).toMatchObject({ type: 'text', required: true });
		expect(byName.get('values')).toEqual({ name: 'values', type: 'json' });
	});

	test('kind es TEXTO plano, nunca select (§1: elección de Vega, ya no limitación del puerto)', () => {
		const kind = VEGA_REVISIONS_COLLECTION.fields.find((f) => f.name === 'kind');
		expect(kind?.type).toBe('text');
	});

	test('label/author son texto libre, created es autodate onCreate/sin onUpdate', () => {
		const byName = new Map(VEGA_REVISIONS_COLLECTION.fields.map((f) => [f.name, f]));
		expect(byName.get('label')).toMatchObject({ type: 'text' });
		expect(byName.get('author')).toMatchObject({ type: 'text' });
		expect(byName.get('created')).toEqual({ name: 'created', type: 'autodate' });
	});

	test('buildRevisionsBootstrapImportJson() produce un JSON determinista con los 7 campos', () => {
		const json = JSON.parse(buildRevisionsBootstrapImportJson());
		expect(json).toHaveLength(1);
		expect(json[0].name).toBe('vega_revisions');
		expect(json[0].fields.map((f: { name: string }) => f.name)).toEqual([
			'collection',
			'recordId',
			'kind',
			'values',
			'label',
			'author',
			'created'
		]);
		const createdField = json[0].fields.find((f: { name: string }) => f.name === 'created');
		expect(createdField).toMatchObject({ type: 'autodate', onCreate: true, onUpdate: false });
		const collectionField = json[0].fields.find((f: { name: string }) => f.name === 'collection');
		expect(collectionField).toMatchObject({ type: 'text', required: true });
	});
});

describe('computeRevisionsCollectionState (reutiliza el cálculo genérico)', () => {
	const revisions: ContentType = { name: 'vega_revisions', readonly: false, fields: [] };
	const other: ContentType = { name: 'post', readonly: false, fields: [] };

	test('present / creatable / manual, igual que el cálculo genérico', () => {
		expect(computeRevisionsCollectionState([other, revisions], true)).toBe('present');
		expect(computeRevisionsCollectionState([other], true)).toBe('creatable');
		expect(computeRevisionsCollectionState([other], false)).toBe('manual');
	});
});

describe('ensureRevisionsCollection (la spec contiene ÚNICAMENTE "vega_revisions")', () => {
	test('llama a port.ensureCollections con un array de un único elemento', async () => {
		const ensureCollections = vi
			.fn()
			.mockResolvedValue({ created: ['vega_revisions'], skipped: [] });
		const fakePort = { ensureCollections } as unknown as BackendPort;

		await ensureRevisionsCollection(fakePort);

		expect(ensureCollections).toHaveBeenCalledTimes(1);
		const specs = ensureCollections.mock.calls[0][0];
		expect(specs).toHaveLength(1);
		expect(specs[0].name).toBe('vega_revisions');
	});
});
