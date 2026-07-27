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

	test('locales y localizedFields con mapeo explícito → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			locales: {
				default: 'es',
				available: [
					{ id: 'es', label: 'Español' },
					{ id: 'en', label: 'English' }
				]
			},
			collections: {
				post: {
					localizedFields: {
						title: { label: 'Título', fields: { es: 'titleEs', en: 'titleEn' } }
					}
				}
			}
		});
		expect(result).toEqual({ ok: true });
	});

	test('locales.available vacío y localizedFields sin fields → inválido', () => {
		expect(
			validateManifestStrict({
				schemaVersion: 1,
				locales: { default: 'es', available: [] }
			}).ok
		).toBe(false);
		expect(
			validateManifestStrict({
				schemaVersion: 1,
				collections: { post: { localizedFields: { title: { label: 'Título' } } } }
			}).ok
		).toBe(false);
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

	test('collections.<c>.statusLabels con valores string 1-60 → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { statusLabels: { draft: 'Borrador', published: 'Publicado' } } }
		});
		expect(result).toEqual({ ok: true });
	});

	test('collections.<c>.statusLabels con un valor no-string → inválido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { statusLabels: { draft: 1 } } }
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.defaultSort con { field, dir } válido → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { defaultSort: { field: 'publishedAt', dir: 'desc' } } }
		});
		expect(result).toEqual({ ok: true });
	});

	test('collections.<c>.defaultSort sin "dir" → inválido (required)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { defaultSort: { field: 'publishedAt' } } }
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.defaultSort.dir fuera de "asc"/"desc" → inválido (enum)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { defaultSort: { field: 'publishedAt', dir: 'sideways' } } }
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.defaultSort con clave desconocida → inválido (additionalProperties)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { defaultSort: { field: 'publishedAt', dir: 'asc', weight: 2 } } }
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.blocks con { collection, parentField, orderField } válido → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: {
				landing: {
					blocks: { collection: 'landing_block', parentField: 'parent', orderField: 'sort' }
				}
			}
		});
		expect(result).toEqual({ ok: true });
	});

	test('collections.<c>.blocks sin "orderField" → inválido (required)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: {
				landing: { blocks: { collection: 'landing_block', parentField: 'parent' } }
			}
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.blocks.collection vacío → inválido (minLength)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: {
				landing: { blocks: { collection: '', parentField: 'parent', orderField: 'sort' } }
			}
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.blocks con clave desconocida → inválido (additionalProperties)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: {
				landing: {
					blocks: {
						collection: 'landing_block',
						parentField: 'parent',
						orderField: 'sort',
						weight: 2
					}
				}
			}
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.blocks con typeField/dataField (modo heterogéneo) → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: {
				landing: {
					blocks: {
						collection: 'landing_block',
						parentField: 'parent',
						orderField: 'sort',
						typeField: 'kind',
						dataField: 'payload'
					}
				}
			}
		});
		expect(result).toEqual({ ok: true });
	});

	test('collections.<c>.blocks con SOLO typeField (sin dataField) → VÁLIDO a nivel de schema (la pareja es contenido, no sintaxis)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: {
				landing: {
					blocks: {
						collection: 'landing_block',
						parentField: 'parent',
						orderField: 'sort',
						typeField: 'kind'
					}
				}
			}
		});
		expect(result).toEqual({ ok: true });
	});

	test('collections.<c>.blocks.typeField vacío → inválido (minLength)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: {
				landing: {
					blocks: {
						collection: 'landing_block',
						parentField: 'parent',
						orderField: 'sort',
						typeField: ''
					}
				}
			}
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.previewUrl sin http(s) → inválido (pattern)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { previewUrl: 'ftp://x.com/{id}' } }
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.social: {} (vacío) → válido, las cuatro claves son opcionales', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { social: {} } }
		});
		expect(result).toEqual({ ok: true });
	});

	test('collections.<c>.social con las cuatro claves válidas → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: {
				post: {
					social: {
						titleField: 'excerpt',
						descriptionField: 'content',
						imageField: 'cover',
						urlTemplate: 'https://fodaveg.net/og/{id}'
					}
				}
			}
		});
		expect(result).toEqual({ ok: true });
	});

	test('collections.<c>.social.urlTemplate sin http(s) → inválido (pattern)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { social: { urlTemplate: 'ftp://x.com/{id}' } } }
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.social.titleField vacío → inválido (minLength)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { social: { titleField: '' } } }
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.social con clave desconocida → inválido (additionalProperties)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { social: { titleField: 'excerpt', weight: 2 } } }
		});
		expect(result.ok).toBe(false);
	});

	test('collections.<c>.social no-objeto → inválido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { social: 'nope' } }
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

	test('collections.<c>.fieldGroups con { name, placement } válido (§4.9c) → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: {
				post: { fieldGroups: [{ name: 'Publicación', placement: 'aside' }], editorRail: true }
			}
		});
		expect(result).toEqual({ ok: true });
	});

	test('fieldGroups[].placement fuera de main/aside → inválido (enum)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { fieldGroups: [{ name: 'SEO', placement: 'derecha' }] } }
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

// ————— 1a. revisions (`#lote-integridad` Fase B §7) —————

describe('1a. revisions contra el schema §3', () => {
	test('revisions vacío ({}) → válido (las tres claves son opcionales)', () => {
		expect(validateManifestStrict({ schemaVersion: 1, revisions: {} })).toEqual({ ok: true });
	});

	test('revisions completo (enabled/keepPerRecord/trashDays) → válido', () => {
		expect(
			validateManifestStrict({
				schemaVersion: 1,
				revisions: { enabled: true, keepPerRecord: 20, trashDays: 30 }
			})
		).toEqual({ ok: true });
	});

	test('revisions.keepPerRecord/trashDays: 0 es válido (caso límite, no "ausente")', () => {
		expect(
			validateManifestStrict({
				schemaVersion: 1,
				revisions: { keepPerRecord: 0, trashDays: 0 }
			})
		).toEqual({ ok: true });
	});

	test('revisions no es un objeto → inválido', () => {
		expect(validateManifestStrict({ schemaVersion: 1, revisions: 'nope' }).ok).toBe(false);
	});

	test('revisions.enabled no booleano → inválido', () => {
		expect(validateManifestStrict({ schemaVersion: 1, revisions: { enabled: 'sí' } }).ok).toBe(
			false
		);
	});

	test('revisions.keepPerRecord negativo o no entero → inválido', () => {
		expect(validateManifestStrict({ schemaVersion: 1, revisions: { keepPerRecord: -1 } }).ok).toBe(
			false
		);
		expect(validateManifestStrict({ schemaVersion: 1, revisions: { keepPerRecord: 1.5 } }).ok).toBe(
			false
		);
	});

	test('revisions.trashDays negativo → inválido', () => {
		expect(validateManifestStrict({ schemaVersion: 1, revisions: { trashDays: -1 } }).ok).toBe(
			false
		);
	});

	test('clave desconocida dentro de revisions → inválido (additionalProperties)', () => {
		expect(validateManifestStrict({ schemaVersion: 1, revisions: { unknownKey: 1 } }).ok).toBe(
			false
		);
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

describe('1c. blockTypes (vocabulario de tipos de bloque, #4cfd4f7f) contra el schema §3', () => {
	test('blockTypes mínimo válido: label + un campo → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			blockTypes: {
				hero: { label: 'Portada', fields: [{ name: 'titulo', label: 'Título', widget: 'text' }] }
			}
		});
		expect(result).toEqual({ ok: true });
	});

	test('blockTypes completo (icon + varios campos, required/options) → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			blockTypes: {
				hero: {
					label: 'Portada',
					icon: 'image',
					fields: [
						{ name: 'titulo', label: 'Título', widget: 'text', required: true },
						{
							name: 'alineacion',
							label: 'Alineación',
							widget: 'select',
							options: ['izquierda', 'centro']
						}
					]
				}
			}
		});
		expect(result).toEqual({ ok: true });
	});

	test('clave que no casa ^[a-z][a-z0-9-]*$ → inválido (propertyNames)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			blockTypes: {
				Hero: { label: 'Portada', fields: [{ name: 'a', label: 'A', widget: 'text' }] }
			}
		});
		expect(result.ok).toBe(false);
	});

	test('sin label → inválido (required)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			blockTypes: { hero: { fields: [{ name: 'a', label: 'A', widget: 'text' }] } }
		});
		expect(result.ok).toBe(false);
	});

	test('sin fields → inválido (required)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			blockTypes: { hero: { label: 'Portada' } }
		});
		expect(result.ok).toBe(false);
	});

	test('fields vacío → inválido (minItems 1)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			blockTypes: { hero: { label: 'Portada', fields: [] } }
		});
		expect(result.ok).toBe(false);
	});

	test('fields[].widget "relation"/"file" sin source=record y "unsupported" → inválido', () => {
		for (const widget of ['relation', 'file', 'unsupported']) {
			const result = validateManifestStrict({
				schemaVersion: 1,
				blockTypes: { hero: { label: 'Portada', fields: [{ name: 'a', label: 'A', widget }] } }
			});
			expect(result.ok).toBe(false);
		}
	});

	test('source/default son aditivos y relation/file son válidos solo sobre record', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			blockTypes: {
				hero: {
					label: 'Portada',
					fields: [
						{
							name: 'title',
							label: 'Título',
							widget: 'text',
							source: 'data',
							default: ''
						},
						{ name: 'image', label: 'Imagen', widget: 'relation', source: 'record' },
						{ name: 'file', label: 'Fichero', widget: 'file', source: 'record' }
					]
				}
			}
		});

		expect(result).toEqual({ ok: true });
	});

	test.each(['data', undefined])('relation con source %s → error propio en /source', (source) => {
		const field = {
			name: 'image',
			label: 'Imagen',
			widget: 'relation',
			...(source ? { source } : {})
		};
		const result = validateManifestStrict({
			schemaVersion: 1,
			blockTypes: { hero: { label: 'Portada', fields: [field] } }
		});

		expect(result).toEqual({
			ok: false,
			errors: [
				expect.objectContaining({
					path: '/blockTypes/hero/fields/0/source',
					message: expect.stringContaining('exige source "record"')
				})
			]
		});
	});

	test('source con valor desconocido → inválido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			blockTypes: {
				hero: {
					label: 'Portada',
					fields: [{ name: 'a', label: 'A', widget: 'text', source: 'inline' }]
				}
			}
		});

		expect(result.ok).toBe(false);
	});

	test('fields[] sin "name"/"label"/"widget" → inválido (required)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			blockTypes: { hero: { label: 'Portada', fields: [{ label: 'A', widget: 'text' }] } }
		});
		expect(result.ok).toBe(false);
	});

	test('fields[].options vacío → inválido (minItems 1)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			blockTypes: {
				hero: {
					label: 'Portada',
					fields: [{ name: 'a', label: 'A', widget: 'select', options: [] }]
				}
			}
		});
		expect(result.ok).toBe(false);
	});

	test('blockTypes.<t> con clave desconocida → inválido (additionalProperties)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			blockTypes: {
				hero: {
					label: 'Portada',
					fields: [{ name: 'a', label: 'A', widget: 'text' }],
					unknownKey: 1
				}
			}
		});
		expect(result.ok).toBe(false);
	});

	test('fields[] con clave desconocida → inválido (additionalProperties)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			blockTypes: {
				hero: {
					label: 'Portada',
					fields: [{ name: 'a', label: 'A', widget: 'text', unknownKey: 1 }]
				}
			}
		});
		expect(result.ok).toBe(false);
	});
});

// ————— 1d. page (modelo de páginas, tarea p1 "1dc63001") contra el schema §3 —————

describe('1d. collections.<c>.page (modelo de páginas, tarea p1 "1dc63001") contra el schema §3', () => {
	test('page con solo pathField → válido (layoutField es opcional)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { page: { pathField: 'title' } } }
		});
		expect(result.ok).toBe(true);
	});

	test('page con pathField + layoutField → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { page: { pathField: 'title', layoutField: 'body' } } }
		});
		expect(result.ok).toBe(true);
	});

	test('page sin pathField → inválido (required)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { page: { layoutField: 'body' } } }
		});
		expect(result.ok).toBe(false);
	});

	test('page.pathField vacío → inválido (minLength)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { page: { pathField: '' } } }
		});
		expect(result.ok).toBe(false);
	});

	test('page no-objeto → inválido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { page: 'not-an-object' } }
		});
		expect(result.ok).toBe(false);
	});

	test('page con clave desconocida → inválido (additionalProperties)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			collections: { post: { page: { pathField: 'title', unknownKey: 1 } } }
		});
		expect(result.ok).toBe(false);
	});
});

// ————— 1e. layouts (RAÍZ, modelo de páginas p1 "1dc63001") contra el schema §3 —————

describe('1e. layouts (RAÍZ, modelo de páginas p1 "1dc63001") contra el schema §3', () => {
	test('layouts mínimo válido: solo label → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			layouts: { default: { label: 'Página normal' } }
		});
		expect(result.ok).toBe(true);
	});

	test('layouts completo (label + icon) → válido', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			layouts: { landing: { label: 'Landing', icon: 'layout' } }
		});
		expect(result.ok).toBe(true);
	});

	test('clave que no casa ^[a-z][a-z0-9-]*$ → inválido (propertyNames)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			layouts: { Landing: { label: 'Landing' } }
		});
		expect(result.ok).toBe(false);
	});

	test('sin label → inválido (required)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			layouts: { default: { icon: 'layout' } }
		});
		expect(result.ok).toBe(false);
	});

	test('layouts.<l> con clave desconocida → inválido (additionalProperties)', () => {
		const result = validateManifestStrict({
			schemaVersion: 1,
			layouts: { default: { label: 'Página normal', fields: [] } }
		});
		expect(result.ok).toBe(false);
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
		// defaultSort (M "match 1:1 con el mockup", P2 opt-in): `publishedAt` es un campo `date`
		// real de `post` (kitchen-sink), así que es escalar y ordenable → cero warnings.
		schemaVersion: 1,
		collections: { post: { defaultSort: { field: 'publishedAt', dir: 'desc' } } }
	},
	{
		// M4: statusLabels con claves que SÍ son opciones reales de `post.status`
		// (['draft','published','archived'], ver fixture.ts) → cero warnings de contenido.
		schemaVersion: 1,
		collections: {
			post: {
				statusField: 'status',
				statusLabels: { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' }
			}
		}
	},
	{
		// §4.9c + capacidades de editor: `slugField` sobre un campo de texto real, `editorRail` y un
		// grupo en el aside. Nada de esto referencia campos inexistentes ⇒ cero warnings.
		schemaVersion: 1,
		collections: {
			post: {
				slugField: 'excerpt',
				editorRail: true,
				fieldGroups: [{ name: 'Publicación', placement: 'aside' }],
				fields: { status: { group: 'Publicación' } }
			}
		}
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
		schemaVersion: 1,
		locales: {
			default: 'es',
			available: [
				{ id: 'es', label: 'Español' },
				{ id: 'en', label: 'English' }
			]
		},
		collections: {
			post: {
				localizedFields: {
					title: { label: 'Título', fields: { es: 'title', en: 'excerpt' } }
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
	},
	{
		// social (lote "editor" Fase B): las cuatro claves sobre campos reales de `post` (cover:
		// file NO múltiple, content: richtext) → cero warnings.
		schemaVersion: 1,
		collections: {
			post: {
				social: {
					titleField: 'excerpt',
					descriptionField: 'content',
					imageField: 'cover',
					urlTemplate: 'https://fodaveg.net/og/{id}'
				}
			}
		}
	},
	{
		// revisions (`#lote-integridad` Fase B §7): las tres claves, forma completa → cero warnings.
		schemaVersion: 1,
		revisions: { enabled: false, keepPerRecord: 5, trashDays: 7 }
	},
	{
		// blockTypes (RAÍZ, vocabulario de tipos de bloque `#4cfd4f7f`): completamente independiente
		// de `collections`/el esquema descubierto (no referencia ningún campo real), así que es
		// zero-warning contra el kitchen-sink igual que cualquier otro manifiesto que no lo toque.
		schemaVersion: 1,
		blockTypes: {
			hero: {
				label: 'Portada',
				icon: 'image',
				fields: [
					{ name: 'titulo', label: 'Título', widget: 'text', required: true },
					{
						name: 'alineacion',
						label: 'Alineación',
						widget: 'select',
						source: 'data',
						default: 'izquierda',
						options: ['izquierda', 'centro']
					},
					{ name: 'imagen', label: 'Imagen', widget: 'relation', source: 'record' }
				]
			},
			texto: { label: 'Texto', fields: [{ name: 'cuerpo', label: 'Cuerpo', widget: 'richtext' }] }
		}
	},
	{
		// page (modelo de páginas, tarea p1 1dc63001): `category.name` es el ÚNICO campo `text` con
		// índice único del kitchen-sink (fixture.ts, `unique: true`) → cero warnings, la capacidad
		// queda íntegra (`pathFieldUnique: true`, sin `page-path-not-unique`).
		schemaVersion: 1,
		collections: { category: { page: { pathField: 'name' } } }
	},
	{
		// layouts (RAÍZ, modelo de páginas p1 1dc63001): completamente independiente de
		// `collections`/el esquema descubierto, igual que `blockTypes` → zero-warning.
		schemaVersion: 1,
		layouts: {
			default: { label: 'Página normal' },
			landing: { label: 'Landing', icon: 'layout' }
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
	{ schemaVersion: 1, locales: 'not-an-object' },
	{ schemaVersion: 1, locales: { available: [{ id: 'es', label: 'Español' }] } },
	{ schemaVersion: 1, locales: { default: 'es', available: [] } },
	{
		schemaVersion: 1,
		locales: { default: 'es!', available: [{ id: 'es', label: 'Español' }] }
	},
	{
		schemaVersion: 1,
		locales: { default: 'es', available: [{ id: 'es!', label: 'Español' }] }
	},
	{
		schemaVersion: 1,
		locales: { default: 'es', available: [{ id: 'es', label: '' }] }
	},
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
	{ schemaVersion: 1, collections: { post: { statusLabels: 'not-an-object' } } },
	{ schemaVersion: 1, collections: { post: { statusLabels: { draft: 1 } } } },
	{ schemaVersion: 1, collections: { post: { statusLabels: { draft: 'x'.repeat(61) } } } },
	{ schemaVersion: 1, collections: { post: { defaultSort: 'not-an-object' } } },
	{ schemaVersion: 1, collections: { post: { defaultSort: { field: 'rating' } } } },
	{ schemaVersion: 1, collections: { post: { defaultSort: { dir: 'asc' } } } },
	{
		schemaVersion: 1,
		collections: { post: { defaultSort: { field: 'rating', dir: 'sideways' } } }
	},
	{ schemaVersion: 1, collections: { post: { defaultSort: { field: '', dir: 'asc' } } } },
	{
		schemaVersion: 1,
		collections: { post: { defaultSort: { field: 'rating', dir: 'asc', x: 1 } } }
	},
	{ schemaVersion: 1, collections: { post: { previewUrl: 'not-a-url' } } },
	{ schemaVersion: 1, collections: { post: { listFields: Array.from({ length: 9 }, () => 'x') } } },
	{ schemaVersion: 1, collections: { post: { listFields: ['a', 'a'] } } },
	{ schemaVersion: 1, collections: { post: { fieldGroups: [''] } } },
	{ schemaVersion: 1, collections: { post: { fieldGroups: [{ columns: 2 }] } } },
	{ schemaVersion: 1, collections: { post: { fieldGroups: [{ name: 'X', columns: 0 }] } } },
	{ schemaVersion: 1, collections: { post: { fieldGroups: [{ name: 'X', columns: 4 }] } } },
	{ schemaVersion: 1, collections: { post: { fieldGroups: [{ name: 'X', extra: true }] } } },
	{ schemaVersion: 1, collections: { post: { fieldGroups: [{ name: 'X', placement: 'abajo' }] } } },
	{ schemaVersion: 1, collections: { post: { fieldGroups: [42] } } },
	{ schemaVersion: 1, collections: { post: { slugField: '' } } },
	{ schemaVersion: 1, collections: { post: { slugField: 42 } } },
	{ schemaVersion: 1, collections: { post: { editorRail: 'sí' } } },
	{ schemaVersion: 1, collections: { post: { blocks: 'not-an-object' } } },
	{ schemaVersion: 1, collections: { post: { blocks: { collection: 'x', parentField: 'y' } } } },
	{
		schemaVersion: 1,
		collections: { post: { blocks: { collection: '', parentField: 'y', orderField: 'z' } } }
	},
	{
		schemaVersion: 1,
		collections: {
			post: { blocks: { collection: 'x', parentField: 'y', orderField: 'z', extra: 1 } }
		}
	},
	{
		schemaVersion: 1,
		collections: {
			post: { blocks: { collection: 'x', parentField: 'y', orderField: 'z', typeField: '' } }
		}
	},
	{
		schemaVersion: 1,
		collections: {
			post: { blocks: { collection: 'x', parentField: 'y', orderField: 'z', typeField: 42 } }
		}
	},
	{ schemaVersion: 1, blockTypes: 'not-an-object' },
	{
		schemaVersion: 1,
		blockTypes: { Hero: { label: 'Portada', fields: [{ name: 'a', label: 'A', widget: 'text' }] } }
	},
	{ schemaVersion: 1, blockTypes: { hero: 'not-an-object' } },
	{
		schemaVersion: 1,
		blockTypes: { hero: { fields: [{ name: 'a', label: 'A', widget: 'text' }] } }
	},
	{ schemaVersion: 1, blockTypes: { hero: { label: '' } } },
	{ schemaVersion: 1, blockTypes: { hero: { label: 'x'.repeat(61) } } },
	{ schemaVersion: 1, blockTypes: { hero: { label: 'Portada' } } },
	{ schemaVersion: 1, blockTypes: { hero: { label: 'Portada', fields: [] } } },
	{ schemaVersion: 1, blockTypes: { hero: { label: 'Portada', fields: 'nope' } } },
	{
		schemaVersion: 1,
		blockTypes: { hero: { label: 'Portada', fields: [{ label: 'A', widget: 'text' }] } }
	},
	{
		schemaVersion: 1,
		blockTypes: { hero: { label: 'Portada', fields: [{ name: 'a', widget: 'text' }] } }
	},
	{
		schemaVersion: 1,
		blockTypes: { hero: { label: 'Portada', fields: [{ name: 'a', label: 'A' }] } }
	},
	{
		schemaVersion: 1,
		blockTypes: {
			hero: { label: 'Portada', fields: [{ name: 'a', label: 'A', widget: 'relation' }] }
		}
	},
	{
		schemaVersion: 1,
		blockTypes: { hero: { label: 'Portada', fields: [{ name: 'a', label: 'A', widget: 'file' }] } }
	},
	{
		schemaVersion: 1,
		blockTypes: {
			hero: { label: 'Portada', fields: [{ name: 'a', label: 'A', widget: 'unsupported' }] }
		}
	},
	{
		schemaVersion: 1,
		blockTypes: { hero: { label: 'Portada', fields: [{ name: 'a', label: 'A', widget: 'wat' }] } }
	},
	{
		schemaVersion: 1,
		blockTypes: {
			hero: { label: 'Portada', fields: [{ name: 'a', label: 'A', widget: 'select', options: [] }] }
		}
	},
	{
		schemaVersion: 1,
		blockTypes: {
			hero: {
				label: 'Portada',
				fields: [{ name: 'a', label: 'A', widget: 'text' }],
				unknownKey: 1
			}
		}
	},
	{
		schemaVersion: 1,
		blockTypes: {
			hero: { label: 'Portada', fields: [{ name: 'a', label: 'A', widget: 'text', unknownKey: 1 }] }
		}
	},
	{ schemaVersion: 1, collections: { post: { social: 'not-an-object' } } },
	{ schemaVersion: 1, collections: { post: { social: { titleField: '' } } } },
	{ schemaVersion: 1, collections: { post: { social: { urlTemplate: 'not-a-url' } } } },
	{ schemaVersion: 1, collections: { post: { social: { titleField: 'excerpt', extra: 1 } } } },
	{ schemaVersion: 1, collections: { post: { unknownKey: 1 } } },
	{ schemaVersion: 1, collections: { post: { localizedFields: 'nope' } } },
	{
		schemaVersion: 1,
		collections: { post: { localizedFields: { title: { label: 'Título' } } } }
	},
	{
		schemaVersion: 1,
		collections: { post: { localizedFields: { title: { fields: {} } } } }
	},
	{
		schemaVersion: 1,
		collections: { post: { localizedFields: { title: { fields: { 'es!': 'title' } } } } }
	},
	{ schemaVersion: 1, collections: { post: { fields: 'nope' } } },
	{ schemaVersion: 1, collections: { post: { fields: { body: 'nope' } } } },
	{ schemaVersion: 1, collections: { post: { fields: { body: { widget: 'richtext' } } } } },
	{ schemaVersion: 1, collections: { post: { fields: { body: { help: 'x'.repeat(301) } } } } },
	{
		schemaVersion: 1,
		collections: { post: { fields: { body: { placeholder: 'x'.repeat(121) } } } }
	},
	{ schemaVersion: 1, collections: { post: { fields: { body: { unknownKey: 1 } } } } },
	{ schemaVersion: 1, revisions: 'not-an-object' },
	{ schemaVersion: 1, revisions: { enabled: 'yes' } },
	{ schemaVersion: 1, revisions: { keepPerRecord: -1 } },
	{ schemaVersion: 1, revisions: { keepPerRecord: 1.5 } },
	{ schemaVersion: 1, revisions: { trashDays: -1 } },
	{ schemaVersion: 1, revisions: { unknownKey: 1 } },
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
	},
	{ schemaVersion: 1, collections: { post: { page: 'not-an-object' } } },
	{ schemaVersion: 1, collections: { post: { page: {} } } }, // sin pathField (required)
	{ schemaVersion: 1, collections: { post: { page: { pathField: '' } } } },
	{ schemaVersion: 1, collections: { post: { page: { pathField: 'title', layoutField: '' } } } },
	{
		schemaVersion: 1,
		collections: { post: { page: { pathField: 'title', extra: 1 } } }
	},
	{ schemaVersion: 1, layouts: 'not-an-object' },
	{ schemaVersion: 1, layouts: { Landing: { label: 'Landing' } } },
	{ schemaVersion: 1, layouts: { default: { icon: 'layout' } } }, // sin label (required)
	{ schemaVersion: 1, layouts: { default: { label: '' } } },
	{ schemaVersion: 1, layouts: { default: { label: 'x'.repeat(61) } } },
	{ schemaVersion: 1, layouts: { default: { label: 'Página normal', extra: 1 } } }
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
