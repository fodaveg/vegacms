/**
 * Suite de `validateManifestStrict` (§9.12 del contrato P2, L4 "escritor estricto"):
 *
 * 1. Casos puntuales de cordura contra el schema §3 (uno por regla: `additionalProperties`,
 *    `const`, límites de longitud, `enum`, `oneOf`, `pattern`, `maxItems`/`uniqueItems`, y la
 *    clave reservada `snapshot`).
 * 2. Propiedad: todo manifiesto que `validateManifestStrict` acepta, `resolveContentModel` lo
 *    lee sobre el kitchen-sink SIN warnings (lector tolerante ⊇ escritor estricto).
 * 3. Oráculo: `manifest-schema.json` compilado con `ajv` (SOLO devDependency de test) coincide
 *    con `validateManifestStrict` (mismos veredictos ok/ko) sobre una batería de manifiestos
 *    válidos e inválidos. `ajv` no aparece en `dependencies` (ley de ligereza, §9.12).
 */

import { describe, expect, test } from 'vitest';
// El schema declara "$schema": draft 2020-12 (§3 del contrato); el `Ajv` por defecto solo trae
// el meta-schema de draft-07, así que hace falta la build específica de 2020-12.
import Ajv2020 from 'ajv/dist/2020';
import type { JsonValue } from '$lib/backend/types';
import { resolveContentModel } from '$lib/model/resolve';
import { validateManifestStrict } from '$lib/model/validate';
import manifestSchema from '$lib/model/manifest-schema.json';
import { kitchenSinkTypes } from './fixture';

// ————— 1. Casos puntuales —————

describe('1. Casos puntuales contra el schema §3', () => {
	test('{ schemaVersion: 1 } es el manifiesto mínimo válido', () => {
		expect(validateManifestStrict({ schemaVersion: 1 })).toEqual({ ok: true });
	});

	test('schemaVersion ausente → inválido (required)', () => {
		const result = validateManifestStrict({ site: { name: 'X' } });
		expect(result.ok).toBe(false);
		if (!result.ok)
			expect(result.errors).toContainEqual(expect.objectContaining({ path: '/schemaVersion' }));
	});

	test('schemaVersion distinto de 1 → inválido (const)', () => {
		const result = validateManifestStrict({ schemaVersion: 2 });
		expect(result.ok).toBe(false);
	});

	test('raíz no-objeto → inválido', () => {
		for (const raw of [null, 42, 'x', [1, 2]] as JsonValue[]) {
			expect(validateManifestStrict(raw).ok).toBe(false);
		}
	});

	test('clave desconocida en la raíz → inválido (additionalProperties)', () => {
		const result = validateManifestStrict({ schemaVersion: 1, foo: 'bar' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ path: '/foo' }));
	});

	test('clave raíz "snapshot" → inválida con mensaje propio (§3, §6.5)', () => {
		const result = validateManifestStrict({ schemaVersion: 1, snapshot: {} });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					path: '/snapshot',
					message: expect.stringContaining('reservada')
				})
			);
		}
	});

	test('site.name de 61 caracteres → inválido (maxLength)', () => {
		const result = validateManifestStrict({ schemaVersion: 1, site: { name: 'x'.repeat(61) } });
		expect(result.ok).toBe(false);
	});

	test('site.locale fuera del enum → inválido', () => {
		const result = validateManifestStrict({ schemaVersion: 1, site: { locale: 'fr' } });
		expect(result.ok).toBe(false);
	});

	test('nav.groups con duplicados → inválido (uniqueItems)', () => {
		const result = validateManifestStrict({ schemaVersion: 1, nav: { groups: ['A', 'A'] } });
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.statusField como número → inválido (oneOf)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { statusField: 42 } }
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.statusField: false → válido (oneOf, rama const)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { statusField: false } }
		});
		expect(result).toEqual({ ok: true });
	});

	test('collections.<c>.previewUrl sin http(s) → inválido (pattern)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { previewUrl: 'ftp://x.com/{id}' } }
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.listFields con 9 elementos → inválido (maxItems 8)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { listFields: Array.from({ length: 9 }, (_, i) => `f${i}`) } }
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.fieldGroups con { name, columns } válido (§4.9b) → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { fieldGroups: ['Contenido', { name: 'SEO', columns: 2 }] } }
		});
		expect(result).toEqual({ ok: true });
	});

	test('fieldGroups[].columns fuera de 1-3 → inválido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { fieldGroups: [{ name: 'SEO', columns: 4 }] } }
		});
		expect(result.ok).toBe(false);
	});

	test('fieldGroups[] objeto sin "name" → inválido (required)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { fieldGroups: [{ columns: 2 }] } }
		});
		expect(result.ok).toBe(false);
	});

	test('fields.<f>.widget fuera del vocabulario → inválido (enum)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { fields: { body: { widget: 'richtext' } } } }
		});
		expect(result.ok).toBe(false);
	});

	test('fields.<f> con clave desconocida → inválido (additionalProperties anidado)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { fields: { body: { markdown: true } } } }
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<x> referenciando algo que no existe en el esquema real → VÁLIDO a nivel de schema', () => {
		// Orphan-collection es un problema de CONTENIDO (resolveContentModel), no de sintaxis: el
		// schema no conoce el esquema real descubierto (§3: additionalProperties es un schema, no
		// una lista cerrada de nombres).
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { esto_no_existe: { label: 'Fantasma' } }
		});
		expect(result).toEqual({ ok: true });
	});
});

// ————— 1b. mergedViews (L7a) —————

describe('1b. mergedViews (L7a) contra el schema §3', () => {
	test('mergedViews mínima válida: solo sources con collection → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			mergedViews: { destacados_home: { sources: [{ collection: 'post' }] } }
		});
		expect(result).toEqual({ ok: true });
	});

	test('mergedViews.<id> sin sources → inválido (required)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			mergedViews: { destacados_home: { label: 'Destacados' } }
		});
		expect(result.ok).toBe(false);
	});

	test('mergedViews.<id>.sources vacío → inválido (minItems 1)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			mergedViews: { destacados_home: { sources: [] } }
		});
		expect(result.ok).toBe(false);
	});

	test('mergedViews.<id>.sources[] sin collection → inválido (required)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			mergedViews: { destacados_home: { sources: [{ where: { destacado: true } }] } }
		});
		expect(result.ok).toBe(false);
	});

	test('mergedViews.<id>.sources[] con clave desconocida → inválido (additionalProperties)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			mergedViews: { destacados_home: { sources: [{ collection: 'post', unknownKey: 1 }] } }
		});
		expect(result.ok).toBe(false);
	});

	test('mergedViews.<id> con clave desconocida → inválido (additionalProperties)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			mergedViews: { destacados_home: { sources: [{ collection: 'post' }], unknownKey: 1 } }
		});
		expect(result.ok).toBe(false);
	});

	test('where con valor no escalar (array) → inválido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			mergedViews: {
				destacados_home: { sources: [{ collection: 'post', where: { tags: ['a'] } }] }
			}
		});
		expect(result.ok).toBe(false);
	});

	test('where con valor null → inválido (no es string|number|boolean)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			mergedViews: {
				destacados_home: { sources: [{ collection: 'post', where: { title: null } }] }
			}
		});
		expect(result.ok).toBe(false);
	});

	test('sources con collection en >1 source de la misma vista → VÁLIDO a nivel de schema (dedupe es cosa de L7b)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			mergedViews: {
				destacados_home: {
					sources: [{ collection: 'post' }, { collection: 'post', where: { featured: true } }]
				}
			}
		});
		expect(result).toEqual({ ok: true });
	});

	test('mergedViews.<id> completa con label/icon/group/order/orderField/where/titleField → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			mergedViews: {
				destacados_home: {
					label: 'Destacados Home',
					icon: 'star',
					group: 'Portada',
					order: 0,
					orderField: 'homeOrder',
					sources: [
						{ collection: 'post', where: { featured: true } },
						{
							collection: 'category',
							where: { name: 'x' },
							orderField: 'homeRank',
							titleField: 'name',
							label: 'Categoría'
						}
					]
				}
			}
		});
		expect(result).toEqual({ ok: true });
	});
});

// ————— Batería de manifiestos VÁLIDOS (schema-válidos, sin discrepancias de contenido) —————

/**
 * Manifiestos que (a) pasan `validateManifestStrict` y (b) al resolverse contra el kitchen-sink
 * SIN `knownIcons` no deberían producir NINGÚN warning: solo referencian colecciones/campos
 * reales, overrides de widget compatibles, `titleField`/`statusField` válidos por convención y
 * placeholders de `previewUrl` escalares existentes. Deliberadamente evita `vega`/`vega_media`
 * (L7: cualquier `hidden` explícito en una reservada avisa aunque sea schema-válido) y
 * `settings_view` con `singleton: true` (es `readonly`: `singleton-invalid`, también
 * schema-válido pero con warning de CONTENIDO) — esas combinaciones están cubiertas en
 * `resolve.test.ts`, no aquí.
 */
const VALID_ZERO_WARNING_MANIFESTS: JsonValue[] = [
	{ schemaVersion: 1 },
	{ schemaVersion: 1, site: { name: 'fodaveg.net', defaultTheme: 'grafito', locale: 'es' } },
	{ schemaVersion: 1, nav: { groups: ['Contenido', 'Sitio'] } },
	{
		schemaVersion: 1,
		site: { name: 'X', locale: 'en' },
		nav: { groups: ['Contenido'] },
		collections: {
			post: {
				label: 'Entradas',
				labelSingular: 'Entrada',
				group: 'Contenido',
				order: 1,
				titleField: 'title',
				statusField: 'status',
				previewUrl: 'https://fodaveg.net/blog/{title}',
				listFields: ['title', 'status', 'rating'],
				fieldGroups: ['Contenido', 'SEO'],
				fields: {
					body: { widget: 'markdown', label: 'Cuerpo', group: 'Contenido' },
					excerpt: { widget: 'textarea', help: 'Resumen para listados.', order: 0 },
					title: { placeholder: 'Título del artículo' }
				}
			},
			category: { label: 'Categorías', group: 'Contenido' }
		}
	},
	{
		schemaVersion: 1,
		collections: { post: { statusField: false, previewUrl: 'https://x.com/{id}' } }
	},
	{
		// §4.9b: forma objeto de fieldGroups (rejilla de columnas), mezclada con la forma string
		// de siempre. `columns` no referencia campos reales (no puede haber orphan aquí), así que
		// esto es zero-warning como cualquier otro fieldGroups válido.
		schemaVersion: 1,
		collections: {
			post: {
				fieldGroups: [{ name: 'Contenido', columns: 2 }, 'SEO'],
				fields: {
					title: { group: 'Contenido' },
					excerpt: { group: 'Contenido' },
					body: { group: 'SEO' }
				}
			}
		}
	},
	{
		// mergedViews (L7a): `post.rating` es el ÚNICO campo numérico del kitchen-sink, así que
		// ambas sources son de `post` (permitido, la dedupe es cosa de L7b) con distinto `where`.
		// `post.featured` (bool) y `post.status` (select simple) admiten "eq". Cero warnings:
		// colección/campos reales, orderField numérico heredado de la vista, where admite eq.
		schemaVersion: 1,
		mergedViews: {
			destacados_home: {
				label: 'Destacados Home',
				icon: 'star',
				group: 'Portada',
				order: 0,
				orderField: 'rating',
				sources: [
					{ collection: 'post', where: { featured: true } },
					{ collection: 'post', where: { status: 'draft' }, titleField: 'title', label: 'Entrada' }
				]
			}
		}
	}
];

describe('2. Escritor ⊆ lector: manifiestos válidos → resolveContentModel sin warnings', () => {
	test.each(VALID_ZERO_WARNING_MANIFESTS.map((m, i) => [i, m] as const))(
		'manifiesto válido #%i produce warnings: []',
		(_i, manifestRaw) => {
			expect(validateManifestStrict(manifestRaw)).toEqual({ ok: true });
			const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
			expect(model.warnings).toEqual([]);
		}
	);
});

// ————— 3. Oráculo ajv —————

/** Batería INVÁLIDA (schema-violations), independiente de la batería válida de arriba. */
const INVALID_MANIFESTS: JsonValue[] = [
	null,
	42,
	'no es un objeto',
	[1, 2, 3],
	{},
	{ schemaVersion: 2 },
	{ schemaVersion: '1' },
	{ schemaVersion: 1, snapshot: { foo: 'bar' } },
	{ schemaVersion: 1, extra: true },
	{ schemaVersion: 1, site: { name: '' } },
	{ schemaVersion: 1, site: { name: 'x'.repeat(61) } },
	{ schemaVersion: 1, site: { locale: 'de' } },
	{ schemaVersion: 1, site: { unknown: 1 } },
	{ schemaVersion: 1, nav: { groups: [''] } },
	{ schemaVersion: 1, nav: { groups: ['A', 'A'] } },
	{ schemaVersion: 1, nav: { tabs: [] } },
	{ schemaVersion: 1, collections: 'not-an-object' },
	{ schemaVersion: 1, collections: { post: 'not-an-object' } },
	{ schemaVersion: 1, collections: { post: { label: '' } } },
	{ schemaVersion: 1, collections: { post: { label: 'x'.repeat(61) } } },
	{ schemaVersion: 1, collections: { post: { order: -1 } } },
	{ schemaVersion: 1, collections: { post: { order: 1.5 } } },
	{ schemaVersion: 1, collections: { post: { hidden: 'yes' } } },
	{ schemaVersion: 1, collections: { post: { statusField: 0 } } },
	{ schemaVersion: 1, collections: { post: { previewUrl: 'not-a-url' } } },
	{ schemaVersion: 1, collections: { post: { listFields: Array.from({ length: 9 }, () => 'x') } } },
	{ schemaVersion: 1, collections: { post: { listFields: ['a', 'a'] } } },
	{ schemaVersion: 1, collections: { post: { fieldGroups: [''] } } },
	{ schemaVersion: 1, collections: { post: { fieldGroups: [{ columns: 2 }] } } },
	{ schemaVersion: 1, collections: { post: { fieldGroups: [{ name: 'X', columns: 0 }] } } },
	{ schemaVersion: 1, collections: { post: { fieldGroups: [{ name: 'X', columns: 4 }] } } },
	{ schemaVersion: 1, collections: { post: { fieldGroups: [{ name: 'X', extra: true }] } } },
	{ schemaVersion: 1, collections: { post: { fieldGroups: [42] } } },
	{ schemaVersion: 1, collections: { post: { unknownKey: 1 } } },
	{ schemaVersion: 1, collections: { post: { fields: 'nope' } } },
	{ schemaVersion: 1, collections: { post: { fields: { body: 'nope' } } } },
	{ schemaVersion: 1, collections: { post: { fields: { body: { widget: 'richtext' } } } } },
	{ schemaVersion: 1, collections: { post: { fields: { body: { help: 'x'.repeat(301) } } } } },
	{
		schemaVersion: 1,
		collections: { post: { fields: { body: { placeholder: 'x'.repeat(121) } } } }
	},
	{ schemaVersion: 1, collections: { post: { fields: { body: { unknownKey: 1 } } } } },
	{ schemaVersion: 1, mergedViews: 'not-an-object' },
	{ schemaVersion: 1, mergedViews: { destacados: { label: 'X' } } }, // sin sources (required)
	{ schemaVersion: 1, mergedViews: { destacados: { sources: [] } } }, // minItems 1
	{ schemaVersion: 1, mergedViews: { destacados: { sources: 'not-an-array' } } },
	{ schemaVersion: 1, mergedViews: { destacados: { sources: [{ where: {} }] } } }, // sin collection
	{ schemaVersion: 1, mergedViews: { destacados: { sources: [{ collection: '' }] } } },
	{
		schemaVersion: 1,
		mergedViews: { destacados: { sources: [{ collection: 'post', extra: 1 }] } }
	},
	{
		schemaVersion: 1,
		mergedViews: { destacados: { sources: [{ collection: 'post' }], extra: 1 } }
	},
	{
		schemaVersion: 1,
		mergedViews: { destacados: { sources: [{ collection: 'post', where: { tags: ['a'] } }] } }
	},
	{
		schemaVersion: 1,
		mergedViews: { destacados: { sources: [{ collection: 'post', where: { title: null } }] } }
	},
	{
		schemaVersion: 1,
		mergedViews: { destacados: { sources: [{ collection: 'post', where: 'not-an-object' }] } }
	},
	{
		schemaVersion: 1,
		mergedViews: { destacados: { order: -1, sources: [{ collection: 'post' }] } }
	},
	{
		schemaVersion: 1,
		mergedViews: { destacados: { sources: [{ collection: 'post', label: 'x'.repeat(61) }] } }
	}
];

describe('3. Oráculo: ajv(manifest-schema.json) vs validateManifestStrict', () => {
	const ajv = new Ajv2020({ strict: true, allErrors: true });
	const validateWithAjv = ajv.compile(manifestSchema);

	const battery = [...VALID_ZERO_WARNING_MANIFESTS, ...INVALID_MANIFESTS];

	test.each(battery.map((m, i) => [i, m] as const))(
		'manifiesto #%i: mismo veredicto ok/ko',
		(_i, manifestRaw) => {
			const ownVerdict = validateManifestStrict(manifestRaw).ok;
			const ajvVerdict = validateWithAjv(manifestRaw);
			expect(ownVerdict).toBe(ajvVerdict);
		}
	);
});
