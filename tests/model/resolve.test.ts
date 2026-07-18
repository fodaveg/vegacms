/**
 * Suite de integración de `resolveContentModel` (§9 del contrato P2): determinismo (L1),
 * visibilidad/nav (§4.1/L7), matriz de degradación completa (§5), modo sin manifiesto (L12),
 * `listFields` (§4.10) y `previewUrl` (§4.7) end-to-end. Sin red: todo con el fixture
 * kitchen-sink de `./fixture.ts`.
 */

import { describe, expect, test } from 'vitest';
import type { JsonValue } from '$lib/backend/types';
import { WIDGET_IDS } from '$lib/model/types';
import { resolveContentModel } from '$lib/model/resolve';
import {
	categoryType,
	kitchenSinkTypes,
	postType,
	settingsViewType,
	vegaMediaType,
	vegaType
} from './fixture';

// ————— 1. Determinismo (L1) —————

describe('1. Determinismo (L1)', () => {
	test('mismo input → mismo output (deepEqual)', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			site: { name: 'fodaveg.net' },
			collections: { post: { label: 'Entradas', group: 'Contenido' } }
		};
		const a = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		const b = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		expect(a).toEqual(b);
	});

	test('permutar el orden de claves del manifiesto → mismo resultado', () => {
		const manifestA: JsonValue = {
			schemaVersion: 1,
			site: { name: 'X', locale: 'es' },
			nav: { groups: ['Contenido', 'Sitio'] },
			collections: {
				post: { label: 'Entradas', group: 'Contenido', order: 1 },
				category: { group: 'Contenido' }
			}
		};
		const manifestB: JsonValue = {
			collections: {
				category: { group: 'Contenido' },
				post: { order: 1, group: 'Contenido', label: 'Entradas' }
			},
			nav: { groups: ['Contenido', 'Sitio'] },
			site: { locale: 'es', name: 'X' },
			schemaVersion: 1
		};
		const a = resolveContentModel({ types: kitchenSinkTypes, manifestRaw: manifestA });
		const b = resolveContentModel({ types: kitchenSinkTypes, manifestRaw: manifestB });
		expect(a).toEqual(b);
	});
});

// ————— 4/5. Widgets (L8) + markdown (L9), globales sobre el kitchen-sink —————

describe('4/5. Widgets (L8) y markdown (L9)', () => {
	test('tabla completa de defaults sobre post (sin manifiesto)', () => {
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw: null });
		const post = model.types.find((t) => t.name === 'post')!;
		const widgetByName = Object.fromEntries(post.fields.map((f) => [f.name, f.widget]));
		expect(widgetByName).toEqual({
			title: 'text',
			excerpt: 'text',
			body: 'text',
			content: 'richtext',
			rating: 'number',
			featured: 'switch',
			contactEmail: 'email',
			website: 'url',
			publishedAt: 'datetime',
			status: 'select',
			tags: 'chips',
			category: 'relation',
			categories: 'relation',
			cover: 'file',
			gallery: 'file',
			metadata: 'json',
			location: 'unsupported'
		});
	});

	test('overrides textarea/markdown aplican; richtext con override → widget-incompatible', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			collections: {
				post: {
					fields: {
						excerpt: { widget: 'textarea' },
						body: { widget: 'markdown' },
						content: { widget: 'markdown' }
					}
				}
			}
		};
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		const post = model.types.find((t) => t.name === 'post')!;
		const byName = Object.fromEntries(post.fields.map((f) => [f.name, f]));

		expect(byName.excerpt.widget).toBe('textarea');
		expect(byName.excerpt.subtype).toBe('plain');
		expect(byName.body.widget).toBe('markdown');
		expect(byName.body.subtype).toBe('markdown');
		expect(byName.content.widget).toBe('richtext');
		expect(byName.content.subtype).toBe('html');
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'widget-incompatible', collection: 'post', field: 'content' })
		]);
	});

	test('ningún WidgetId fuera del vocabulario cerrado (aserción global)', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			collections: {
				post: { fields: { excerpt: { widget: 'textarea' }, body: { widget: 'markdown' } } }
			}
		};
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		for (const type of model.types) {
			for (const field of type.fields) {
				expect(WIDGET_IDS).toContain(field.widget);
			}
		}
	});

	test('invariante bidireccional L9 sobre todo el modelo: widget markdown ⟺ subtype markdown', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			collections: { post: { fields: { body: { widget: 'markdown' } } } }
		};
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		for (const type of model.types) {
			for (const field of type.fields) {
				expect(field.widget === 'markdown').toBe(field.subtype === 'markdown');
			}
		}
	});
});

// ————— 6. Visibilidad y nav —————

describe('6. Visibilidad y nav', () => {
	test('vega/vega_media SIEMPRE ocultas y fuera de nav, incluso con hidden:false hostil', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			collections: { vega: { hidden: false }, vega_media: { hidden: false } }
		};
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });

		const vega = model.types.find((t) => t.name === 'vega')!;
		const vegaMedia = model.types.find((t) => t.name === 'vega_media')!;
		expect(vega.hidden).toBe(true);
		expect(vegaMedia.hidden).toBe(true);

		const namesInNav = model.nav.groups.flatMap((g) => g.items.map((i) => i.type));
		expect(namesInNav).not.toContain('vega');
		expect(namesInNav).not.toContain('vega_media');

		expect(model.warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: 'manifest-invalid-key', path: '/collections/vega/hidden' }),
				expect.objectContaining({
					code: 'manifest-invalid-key',
					path: '/collections/vega_media/hidden'
				})
			])
		);
	});

	test('vega/vega_media SIGUEN en ContentModel.types (L6), solo faltan de nav', () => {
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw: null });
		expect(model.types.map((t) => t.name)).toEqual(kitchenSinkTypes.map((t) => t.name));
	});

	test('grupos: anónimo primero, declarados en orden, no declarados alfabético', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			nav: { groups: ['Contenido'] },
			collections: {
				post: { group: 'Contenido' },
				category: { group: 'Zeta' },
				settings_view: { group: 'Alfa' }
			}
		};
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		expect(model.nav.groups.map((g) => g.label)).toEqual(['Contenido', 'Alfa', 'Zeta']);
	});

	test('order explícito antes que el orden base, dentro de un grupo', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			collections: {
				post: { order: 1 },
				category: { order: 0 }
			}
		};
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		const anon = model.nav.groups.find((g) => g.label === null)!;
		const names = anon.items.map((i) => i.type);
		// category (order 0) y post (order 1) van antes que settings_view (sin order, orden base)
		expect(names.indexOf('category')).toBeLessThan(names.indexOf('post'));
		expect(names.indexOf('post')).toBeLessThan(names.indexOf('settings_view'));
	});

	test('views: visibles por defecto y readonly:true en el NavItem', () => {
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw: null });
		const navItem = model.nav.groups
			.flatMap((g) => g.items)
			.find((i) => i.type === 'settings_view');
		expect(navItem).toBeDefined();
		expect(navItem!.readonly).toBe(true);
	});
});

// ————— 7. Matriz de degradación completa (§5) —————

describe('7. Matriz de degradación (§5)', () => {
	test('sin manifiesto (null) → sin warnings, manifest.status "absent"', () => {
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw: null });
		expect(model.warnings).toEqual([]);
		expect(model.manifest).toEqual({ status: 'absent' });
	});

	test('manifest no parseable (string) → como ausente + manifest-unreadable', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: 'esto no es un objeto'
		});
		expect(model.manifest).toEqual({ status: 'absent' });
		expect(model.warnings).toEqual([expect.objectContaining({ code: 'manifest-unreadable' })]);
	});

	test('manifest raíz no-objeto (array/número) → manifest-unreadable', () => {
		for (const raw of [[1, 2, 3], 42, true] as JsonValue[]) {
			const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw: raw });
			expect(model.warnings).toEqual([expect.objectContaining({ code: 'manifest-unreadable' })]);
		}
	});

	test('schemaVersion ausente → se asume 1, sin warning', () => {
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw: {} });
		expect(model.manifest).toEqual({ status: 'loaded', schemaVersion: 1 });
		expect(model.warnings).toEqual([]);
	});

	test('schemaVersion > 1 → se leen las claves v1 + manifest-version-newer', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 2, site: { name: 'Futuro' } }
		});
		expect(model.manifest).toEqual({ status: 'loaded', schemaVersion: 2 });
		expect(model.site.name).toBe('Futuro');
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'manifest-version-newer', path: '/schemaVersion' })
		]);
	});

	test('clave conocida con tipo inválido (order: "primero") → manifest-invalid-key, resto se aplica', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { order: 'primero', label: 'Entradas' } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.label).toBe('Entradas');
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'manifest-invalid-key', path: '/collections/post/order' })
		]);
	});

	test('collections.<x> que no existe en el esquema → orphan-collection, entrada ignorada', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { does_not_exist: { label: 'Fantasma' } } }
		});
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'orphan-collection',
				collection: 'does_not_exist',
				path: '/collections/does_not_exist'
			})
		]);
	});

	test('fields.<f> que no existe en el tipo → orphan-field, entrada ignorada', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { fields: { no_existe: { label: 'Fantasma' } } } }
			}
		});
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'orphan-field',
				collection: 'post',
				field: 'no_existe',
				path: '/collections/post/fields/no_existe'
			})
		]);
	});

	test('widget incompatible con el tipo real → widget por defecto + widget-incompatible', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { fields: { rating: { widget: 'markdown' } } } }
			}
		});
		const rating = model.types
			.find((t) => t.name === 'post')!
			.fields.find((f) => f.name === 'rating')!;
		expect(rating.widget).toBe('number');
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'widget-incompatible', collection: 'post', field: 'rating' })
		]);
	});

	test('titleField inexistente/no representable → title-field-invalid + cascada', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { titleField: 'content' } } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.titleField).toBe('title');
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'title-field-invalid', collection: 'post' })
		]);
	});

	test('statusField que no cumple §4.5 → status-field-invalid + convención', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { statusField: 'rating' } } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.statusField).toBe('status');
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'status-field-invalid', collection: 'post' })
		]);
	});

	test('previewUrl con placeholder inválido → previewUrl null + preview-url-invalid', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { previewUrl: 'https://x.test/{content}' } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.previewUrl).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'preview-url-invalid', collection: 'post' })
		]);
	});

	test('listFields con nombre inexistente → se omite ese nombre, el resto vale', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { listFields: ['title', 'no-existe', 'status'] } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.listFields).toEqual(['title', 'status']);
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'list-field-unknown',
				collection: 'post',
				field: 'no-existe',
				path: '/collections/post/listFields/1'
			})
		]);
	});

	test('icon fuera del set → icon null + icon-unknown', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { icon: 'no-existe' } } },
			knownIcons: ['pencil', 'settings']
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.icon).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'icon-unknown', collection: 'post' })
		]);
	});

	test('sin knownIcons, no se valida (icon se acepta tal cual)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { icon: 'cualquiera' } } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.icon).toBe('cualquiera');
		expect(model.warnings).toEqual([]);
	});

	test('singleton:true sobre view → singleton false + singleton-invalid', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { settings_view: { singleton: true } } }
		});
		const view = model.types.find((t) => t.name === 'settings_view')!;
		expect(view.singleton).toBe(false);
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'singleton-invalid', collection: 'settings_view' })
		]);
	});

	test('singleton:true sobre un tipo normal (no view) SÍ se respeta', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { category: { singleton: true } } }
		});
		const category = model.types.find((t) => t.name === 'category')!;
		expect(category.singleton).toBe(true);
		expect(model.warnings).toEqual([]);
	});

	test('colección nueva no mencionada → visible con defaults, SIN warning', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { label: 'Entradas' } } }
		});
		const category = model.types.find((t) => t.name === 'category')!;
		expect(category.hidden).toBe(false);
		expect(category.label).toBe('Category');
		expect(category.group).toBeNull();
		expect(model.warnings).toEqual([]);
	});

	test('campo nuevo no mencionado → defaults en su posición de esquema, SIN warning', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { fields: { title: { label: 'Título' } } } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.fields.map((f) => f.name)).toEqual(postType.fields.map((f) => f.name));
		const excerpt = post.fields.find((f) => f.name === 'excerpt')!;
		expect(excerpt.label).toBe('Excerpt');
		expect(model.warnings).toEqual([]);
	});

	test('fuzz ligero (§8.12): manifestRaw malformado/hostil nunca lanza', () => {
		const malformed: JsonValue[] = [
			'no soy un objeto',
			42,
			true,
			[1, 2, 3],
			{ schemaVersion: 'uno' },
			{ collections: 'nope' },
			{ collections: { post: 'nope' } },
			{ collections: { post: { fields: 'nope' } } },
			{ collections: { post: { fields: { title: 'nope' } } } },
			{ collections: { post: { listFields: 'nope' } } },
			{ collections: { post: { titleField: 123 } } },
			{ collections: { post: { statusField: 123 } } },
			{ collections: { post: { previewUrl: 'ftp://mal' } } },
			{ collections: { post: { icon: 123 } } },
			{ collections: { post: { singleton: 'yes' } } },
			{ nav: { groups: 'nope' } },
			{ site: 'nope' },
			{ collections: { post: { listFields: Array.from({ length: 500 }, (_, i) => `f${i}`) } } },
			JSON.parse('{"collections":{"__proto__":{"hidden":false}}}'),
			JSON.parse('{"collections":{"post":{"fields":{"__proto__":{"widget":"markdown"}}}}}'),
			JSON.parse('{"__proto__":{"polluted":true},"schemaVersion":1}')
		];

		for (const manifestRaw of malformed) {
			expect(() => resolveContentModel({ types: kitchenSinkTypes, manifestRaw })).not.toThrow();
			const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
			expect(model.types).toHaveLength(kitchenSinkTypes.length);
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((Object.prototype as any).polluted).toBeUndefined();
	});
});

// ————— 8. Modo sin manifiesto (L12) —————

describe('8. Modo sin manifiesto (L12)', () => {
	test('manifestRaw: null produce el mismo modelo que {schemaVersion:1}, salvo manifest.status', () => {
		const withNull = resolveContentModel({ types: kitchenSinkTypes, manifestRaw: null });
		const withEmpty = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1 }
		});

		expect(withNull.manifest).toEqual({ status: 'absent' });
		expect(withEmpty.manifest).toEqual({ status: 'loaded', schemaVersion: 1 });

		expect(withNull.site).toEqual(withEmpty.site);
		expect(withNull.types).toEqual(withEmpty.types);
		expect(withNull.nav).toEqual(withEmpty.nav);
		expect(withNull.warnings).toEqual(withEmpty.warnings);
		expect(withNull.warnings).toEqual([]);
	});

	test('snapshot dorado: site por defecto, sin warnings', () => {
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw: null });
		expect(model.site).toEqual({ name: 'Vega', defaultTheme: null, locale: null });
		expect(model.warnings).toEqual([]);
	});
});

// ————— 9. listFields —————

describe('9. listFields (§4.10)', () => {
	test('default: título + status + primeros listables, tope 5, sin duplicados', () => {
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw: null });
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.listFields).toEqual(['title', 'status', 'excerpt', 'body', 'rating']);
	});

	test('override completo del manifiesto (orden incluido), con un nombre roto → warning + resto aplicado', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { listFields: ['status', 'no-existe', 'title'] } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.listFields).toEqual(['status', 'title']);
		expect(model.warnings).toHaveLength(1);
		expect(model.warnings[0].code).toBe('list-field-unknown');
	});

	test('listFields puede incluir un campo listable:false (petición explícita, no se filtra)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { listFields: ['content'] } } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.listFields).toEqual(['content']);
	});

	test('listable por defecto según tipo: relation false, text true, select-multi false', () => {
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw: null });
		const post = model.types.find((t) => t.name === 'post')!;
		const byName = Object.fromEntries(post.fields.map((f) => [f.name, f.listable]));
		expect(byName.category).toBe(false); // relation single
		expect(byName.categories).toBe(false); // relation multi
		expect(byName.title).toBe(true); // text
		expect(byName.tags).toBe(false); // select multi
		expect(byName.status).toBe(true); // select single
		expect(byName.content).toBe(false); // richtext
		expect(byName.metadata).toBe(false); // json
		expect(byName.cover).toBe(false); // file
	});
});

// ————— 10. previewUrl (integración) —————

describe('10. previewUrl (§4.7, integración)', () => {
	test('plantilla válida se resuelve tal cual, sin warning', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { previewUrl: 'https://example.com/posts/{id}/{title}' } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.previewUrl).toBe('https://example.com/posts/{id}/{title}');
		expect(model.warnings).toEqual([]);
	});

	test('sin http(s):// → manifest-invalid-key, previewUrl null', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { previewUrl: 'ftp://x.test/{id}' } } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.previewUrl).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'manifest-invalid-key',
				path: '/collections/post/previewUrl'
			})
		]);
	});
});

// ————— Referencias cruzadas del fixture (evitan que quede código muerto) —————

describe('fixture', () => {
	test('kitchenSinkTypes incluye category/post/settings_view/vega/vega_media', () => {
		const names = kitchenSinkTypes.map((t) => t.name).sort();
		expect(names).toEqual(
			[categoryType, postType, settingsViewType, vegaMediaType, vegaType].map((t) => t.name).sort()
		);
	});
});
