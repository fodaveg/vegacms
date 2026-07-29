/**
 * Tests del mapeo API rules de PocketBase → `ContentType.access` (`#lote-shell`,
 * `mapCollectionsToContentTypes`). Módulo puro: se le pasan `CollectionModel` crudos, sin red.
 *
 * La distinción CRÍTICA es `null` vs `''`, y por eso tiene test propio: las dos son falsy en JS y
 * confundirlas invierte el significado de la regla más peligrosa que hay ("solo superuser" pasaría
 * a leerse como "abierta a cualquiera", y la UI ofrecería justo lo que va a dar 403). La semántica
 * de PocketBase que se asume aquí está MEDIDA contra el binario real en
 * `tests/contract/pocketbase.contract.test.ts` (§reglas de acceso), no supuesta.
 */

import { describe, expect, test } from 'vitest';
import type { CollectionModel } from 'pocketbase';
import { collectionFieldSpecToPbField, mapCollectionsToContentTypes } from './schema';

/**
 * `CollectionModel` mínimo con las cinco reglas explícitas (el resto de campos no lo mira el mapeo
 * de acceso). `overrides` va tipado como bolsa suelta A PROPÓSITO: el SDK tipa las reglas como
 * `string | undefined`, pero PocketBase REAL devuelve `null` para "solo superuser" (medido en
 * `tests/contract/pocketbase.contract.test.ts`), y ese es justo el caso que hay que poder simular
 * aquí — tipar el fixture con `Partial<CollectionModel>` prohibiría escribir el valor que el
 * servidor manda de verdad.
 */
function collection(overrides: Record<string, unknown> = {}): CollectionModel {
	return {
		id: 'c1',
		name: 'posts',
		type: 'base',
		system: false,
		fields: [],
		indexes: [],
		created: '',
		updated: '',
		listRule: '',
		viewRule: '',
		createRule: '',
		updateRule: '',
		deleteRule: '',
		...overrides
	} as unknown as CollectionModel;
}

describe('mapCollectionsToContentTypes — reglas de acceso', () => {
	test('cadena VACÍA = abierta a cualquiera; `null` = solo superuser', () => {
		const [type] = mapCollectionsToContentTypes([
			collection({ listRule: '', viewRule: '', createRule: null, updateRule: '', deleteRule: null })
		]);

		expect(type.access).toEqual({
			list: 'allowed',
			view: 'allowed',
			create: 'denied',
			update: 'allowed',
			delete: 'denied'
		});
	});

	test('una expresión de filtro es `conditional`: solo el backend sabe si se cumple', () => {
		const [type] = mapCollectionsToContentTypes([
			collection({
				listRule: '@request.auth.id != ""',
				viewRule: '@request.auth.id != ""',
				createRule: '@request.auth.id != ""',
				updateRule: 'autor = @request.auth.id',
				deleteRule: 'autor = @request.auth.id'
			})
		]);

		expect(type.access).toEqual({
			list: 'conditional',
			view: 'conditional',
			create: 'conditional',
			update: 'conditional',
			delete: 'conditional'
		});
	});

	test('una regla AUSENTE del JSON se trata como `null` (lo restrictivo), nunca como abierta', () => {
		const raw = collection();
		delete (raw as unknown as Record<string, unknown>).createRule;

		const [type] = mapCollectionsToContentTypes([raw]);

		expect(type.access?.create).toBe('denied');
	});

	test('una colección `view` nunca ofrece escrituras, digan lo que digan sus reglas', () => {
		const [type] = mapCollectionsToContentTypes([
			collection({
				type: 'view',
				listRule: '',
				viewRule: '',
				// Forma inesperada a propósito: aunque PB devolviera reglas de escritura en una vista,
				// el mapeo NO debe ofrecerlas (los endpoints ni existen).
				createRule: '',
				updateRule: '',
				deleteRule: ''
			})
		]);

		expect(type.readonly).toBe(true);
		expect(type.access).toEqual({
			list: 'allowed',
			view: 'allowed',
			create: 'denied',
			update: 'denied',
			delete: 'denied'
		});
	});
});

describe('collectionFieldSpecToPbField — relation', () => {
	test('usa el id resuelto del destino y explicita cardinalidad/cascadeDelete', () => {
		expect(
			collectionFieldSpecToPbField(
				{
					name: 'parent',
					type: 'relation',
					target: 'pages',
					required: true,
					multiple: true,
					cascadeDelete: true
				},
				'pages_internal_id'
			)
		).toEqual({
			name: 'parent',
			type: 'relation',
			required: true,
			collectionId: 'pages_internal_id',
			maxSelect: 99,
			cascadeDelete: true
		});
	});

	test('rechaza compilar una relation cuyo id de destino no se resolvió', () => {
		expect(() =>
			collectionFieldSpecToPbField({
				name: 'parent',
				type: 'relation',
				target: 'pages',
				multiple: false,
				cascadeDelete: false
			})
		).toThrow(/collectionId/);
	});
});

describe('collectionFieldSpecToPbField — select', () => {
	test.each([
		{ multiple: false, maxSelect: 1 },
		{ multiple: true, maxSelect: 99 }
	])('emite values y cardinalidad $maxSelect', ({ multiple, maxSelect }) => {
		expect(
			collectionFieldSpecToPbField({
				name: 'status',
				type: 'select',
				options: ['draft', 'published'],
				multiple,
				required: true
			})
		).toEqual({
			name: 'status',
			type: 'select',
			required: true,
			values: ['draft', 'published'],
			maxSelect
		});
	});
});
