/**
 * Fixture "kitchen sink" (§10 del contrato): un `ContentType` con TODOS los tipos de campo
 * Vega (incl. `unsupported`) + una colección relacionada + una vista de solo lectura, y
 * datasets espejo para las queries doradas del test de contrato.
 *
 * Este módulo NO depende de ningún adaptador: produce un `MemorySeed` (§7) que hoy alimenta
 * `createMemoryBackend`, y que en Fase 2 alimentará también el harness de PocketBase real
 * (sembrado vía su API de superuser) — de ahí que viva fuera de `adapters/memory/`.
 */

import type { ContentType, Field } from '$lib/backend';
import type { MemorySeed } from '$lib/backend/adapters/memory';

export const FIXTURE_ADMIN_EMAIL = 'admin@vega.test';
export const FIXTURE_ADMIN_PASSWORD = 'vega-fixture-pw-1';

// ————— Esquema —————

const categoryFields: Field[] = [
	{
		name: 'name',
		type: 'text',
		subtype: 'plain',
		required: true,
		readonly: false,
		presentable: true,
		hidden: false,
		unique: true
	}
];

export const categoryType: ContentType = {
	name: 'category',
	readonly: false,
	fields: categoryFields
};

const kitchenSinkFields: Field[] = [
	{
		name: 'title',
		type: 'text',
		subtype: 'plain',
		required: true,
		readonly: false,
		presentable: true,
		hidden: false,
		unique: false,
		minLength: 1,
		maxLength: 120
	},
	{
		name: 'slug',
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false,
		pattern: '^[a-z0-9-]+$'
	},
	{
		name: 'body',
		type: 'richtext',
		subtype: 'html',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'rating',
		type: 'number',
		integer: true,
		min: 0,
		max: 5,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'published',
		type: 'bool',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'contactEmail',
		type: 'email',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'website',
		type: 'url',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'publishedAt',
		type: 'date',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'createdAt',
		type: 'date',
		required: false,
		readonly: true,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'status',
		type: 'select',
		options: ['draft', 'published', 'archived'],
		multiple: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'tags',
		type: 'select',
		options: ['a', 'b', 'c', 'd'],
		multiple: true,
		maxSelect: 2,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'category',
		type: 'relation',
		target: 'category',
		multiple: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'categories',
		type: 'relation',
		target: 'category',
		multiple: true,
		maxSelect: 3,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'cover',
		type: 'file',
		multiple: false,
		protected: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'gallery',
		type: 'file',
		multiple: true,
		maxSelect: 3,
		protected: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'metadata',
		type: 'json',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'location',
		type: 'unsupported',
		backendType: 'geoPoint',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	}
];

export const kitchenSinkType: ContentType = {
	name: 'kitchen_sink',
	readonly: false,
	fields: kitchenSinkFields
};

export const readonlyViewType: ContentType = {
	name: 'category_view',
	readonly: true,
	fields: [
		{
			name: 'name',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		}
	]
};

/**
 * ContentType mínimo, separado de `kitchen_sink`, con un `required: true` en `date`, `select`
 * single y `relation` single. Existe solo para el test de "required se puede eludir con ''"
 * (bug corregido): añadir `required` a esos mismos tipos en `kitchen_sink` rompería el resto
 * de tests de CRUD, que crean registros sin rellenar esos campos.
 */
export const requiredProbeType: ContentType = {
	name: 'required_probe',
	readonly: false,
	fields: [
		{
			name: 'dueDate',
			type: 'date',
			required: true,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'level',
			type: 'select',
			options: ['low', 'high'],
			multiple: false,
			required: true,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'owner',
			type: 'relation',
			target: 'category',
			multiple: false,
			required: true,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

// ————— Datos (dataset espejo para las queries doradas) —————

export const CAT_ALPHA = 'cat-alpha';
export const CAT_BETA = 'cat-beta';
export const CAT_GAMMA = 'cat-gamma';

export const KS_ALPHA = 'ks-alpha'; // title "Hello World", published, rating 5, categories alpha+beta
export const KS_BRAVO = 'ks-bravo'; // title "Second Post", vacíos por todas partes (prueba §2.1)
export const KS_CHARLIE = 'ks-charlie'; // title con ' " || && ~ % — prueba de inyección (§10.4)
export const KS_DELTA = 'ks-delta'; // title "Zebra", rating 3, sin categoría
export const KS_ECHO = 'ks-echo'; // title "amanecer" (minúscula, para contains case-insensitive)

/** Devuelve una `MemorySeed` nueva cada vez (los tests no deben compartir estado mutable). */
export function kitchenSinkSeed(overrides?: Partial<Pick<MemorySeed, 'sessionTtlMs'>>): MemorySeed {
	return {
		users: [{ email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD }],
		contentTypes: [categoryType, kitchenSinkType, readonlyViewType, requiredProbeType],
		sessionTtlMs: overrides?.sessionTtlMs,
		records: {
			required_probe: [],
			category: [
				{ id: CAT_ALPHA, values: { name: 'Alpha' } },
				{ id: CAT_BETA, values: { name: 'Beta' } },
				{ id: CAT_GAMMA, values: { name: 'Gamma' } }
			],
			category_view: [{ id: 'view-1', values: { name: 'Vista Alpha' } }],
			kitchen_sink: [
				{
					id: KS_ALPHA,
					values: {
						title: 'Hello World',
						slug: 'hello-world',
						body: '<p>Hi</p>',
						rating: 5,
						published: true,
						contactEmail: 'alpha@example.com',
						website: 'https://alpha.example.com',
						publishedAt: '2026-01-01T00:00:00.000Z',
						createdAt: '2026-01-01T00:00:00.000Z',
						status: 'published',
						tags: ['a', 'b'],
						category: CAT_ALPHA,
						categories: [CAT_ALPHA, CAT_BETA],
						cover: null,
						gallery: [],
						metadata: { views: 10 },
						location: { lat: 1, lng: 2 }
					}
				},
				{
					id: KS_BRAVO,
					values: {
						title: 'Second Post',
						slug: '',
						body: '',
						rating: null,
						published: false,
						contactEmail: '',
						website: '',
						publishedAt: null,
						createdAt: '2026-01-02T00:00:00.000Z',
						status: null,
						tags: [],
						category: null,
						categories: [],
						cover: null,
						gallery: [],
						metadata: null,
						location: null
					}
				},
				{
					id: KS_CHARLIE,
					values: {
						title: `Quote ' and " and || && ~ % test`,
						slug: 'quote-test',
						body: '',
						rating: 0,
						published: true,
						contactEmail: '',
						website: '',
						publishedAt: '2026-01-03T00:00:00.000Z',
						createdAt: '2026-01-03T00:00:00.000Z',
						status: 'archived',
						tags: ['c'],
						category: CAT_BETA,
						categories: [CAT_GAMMA],
						cover: null,
						gallery: [],
						metadata: { note: `it's "quoted"` },
						location: null
					}
				},
				{
					id: KS_DELTA,
					values: {
						title: 'Zebra',
						slug: 'zebra',
						body: '',
						rating: 3,
						published: false,
						contactEmail: '',
						website: '',
						publishedAt: '2026-01-04T00:00:00.000Z',
						createdAt: '2026-01-04T00:00:00.000Z',
						status: 'draft',
						tags: ['b', 'd'],
						category: null,
						categories: [],
						cover: null,
						gallery: [],
						metadata: null,
						location: null
					}
				},
				{
					id: KS_ECHO,
					values: {
						title: 'amanecer',
						slug: 'amanecer',
						body: '',
						rating: 1,
						published: true,
						contactEmail: '',
						website: '',
						publishedAt: '2026-01-05T00:00:00.000Z',
						createdAt: '2026-01-05T00:00:00.000Z',
						status: 'published',
						tags: [],
						category: CAT_ALPHA,
						categories: [],
						cover: null,
						gallery: [],
						metadata: null,
						location: null
					}
				}
			]
		}
	};
}
