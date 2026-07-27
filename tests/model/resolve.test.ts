/**
 * Suite de integración de `resolveContentModel` (§9 del contrato P2): determinismo (L1),
 * visibilidad/nav (§4.1/L7), matriz de degradación completa (§5), modo sin manifiesto (L12),
 * `listFields` (§4.10) y `previewUrl` (§4.7) end-to-end. Sin red: todo con el fixture
 * kitchen-sink de `./fixture.ts`.
 */

import { describe, expect, test } from 'vitest';
import type { ContentType, JsonValue } from '$lib/backend/types';
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

// ————— Campos traducibles por locale (tabs de formulario) —————

describe('5b. Localización declarada por manifiesto', () => {
	test('resuelve idiomas y campos físicos en un modelo genérico y estable', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
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
			}
		});

		expect(model.types.find((type) => type.name === 'post')!.localization).toEqual({
			defaultLocale: 'es',
			locales: [
				{ id: 'es', label: 'Español' },
				{ id: 'en', label: 'English' }
			],
			fields: [
				{
					name: 'title',
					label: 'Título',
					fields: { es: 'title', en: 'excerpt' }
				}
			]
		});
		expect(model.warnings).toEqual([]);
	});

	test('sin locales raíz, un localizedFields se degrada a formulario plano con warning', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					post: {
						localizedFields: {
							title: { fields: { es: 'title', en: 'excerpt' } }
						}
					}
				}
			}
		});
		expect(model.types.find((type) => type.name === 'post')!.localization).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'manifest-invalid-key',
				path: '/collections/post/localizedFields'
			})
		]);
	});

	test('campo físico inexistente invalida solo el grupo traducible afectado', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
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
							title: { fields: { es: 'title', en: 'does_not_exist' } }
						}
					}
				}
			}
		});
		expect(model.types.find((type) => type.name === 'post')!.localization).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				path: '/collections/post/localizedFields/title/fields/en'
			})
		]);
	});

	test('dos locales apuntando al mismo campo físico invalida el grupo con warning', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
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
							title: { fields: { es: 'title', en: 'title' } }
						}
					}
				}
			}
		});
		expect(model.types.find((type) => type.name === 'post')!.localization).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'manifest-invalid-key',
				path: '/collections/post/localizedFields/title/fields/en'
			})
		]);
	});

	test('locales con campos físicos distintos por idioma sigue resolviendo bien (no falso positivo)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
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
			}
		});
		expect(model.types.find((type) => type.name === 'post')!.localization).toEqual({
			defaultLocale: 'es',
			locales: [
				{ id: 'es', label: 'Español' },
				{ id: 'en', label: 'English' }
			],
			fields: [
				{
					name: 'title',
					label: 'Título',
					fields: { es: 'title', en: 'excerpt' }
				}
			]
		});
		expect(model.warnings).toEqual([]);
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

	test('orderField declarado y numérico → se resuelve, sin warning', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { orderField: 'rating' } } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.orderField).toBe('rating');
		expect(model.warnings).toEqual([]);
	});

	test('orderField que no es numérico → order-field-invalid + null', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { orderField: 'title' } } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.orderField).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'order-field-invalid', collection: 'post' })
		]);
	});

	test('sin orderField en el manifiesto → null, SIN warning (sin autodetección por convención)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: {} } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.orderField).toBeNull();
		expect(model.warnings).toEqual([]);
	});

	test('subtitleField declarado y escalar → se resuelve, sin warning', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { subtitleField: 'excerpt' } } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.subtitleField).toBe('excerpt');
		expect(model.warnings).toEqual([]);
	});

	test('subtitleField inexistente → subtitle-field-invalid + null', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { subtitleField: 'no-existe' } } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.subtitleField).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'subtitle-field-invalid', collection: 'post' })
		]);
	});

	test('subtitleField no escalar (select múltiple, "tags") → subtitle-field-invalid + null', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { subtitleField: 'tags' } } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.subtitleField).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'subtitle-field-invalid', collection: 'post' })
		]);
	});

	test('sin subtitleField en el manifiesto → null, SIN warning (sin autodetección por convención)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: {} } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.subtitleField).toBeNull();
		expect(model.warnings).toEqual([]);
	});

	test('slugField declarado sobre un campo de texto → se resuelve, sin warning', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { slugField: 'excerpt' } } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.slugField).toBe('excerpt');
		expect(model.warnings).toEqual([]);
	});

	test('slugField inexistente → slug-field-invalid + null', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { slugField: 'no-existe' } } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.slugField).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'slug-field-invalid', collection: 'post' })
		]);
	});

	// Criterio ESTRICTO (`isRepresentableField`), no el laxo de `subtitleField`: un slug se ESCRIBE
	// en un control de texto, así que una fecha no vale aunque su celda de listado tenga texto.
	test('slugField sobre un campo no representable como texto (date) → slug-field-invalid + null', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { slugField: 'publishedAt' } } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.slugField).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'slug-field-invalid', collection: 'post' })
		]);
	});

	test('sin slugField en el manifiesto → null, SIN warning (sin autodetección por nombre)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			// `post` NO tiene ningún campo llamado `slug`, pero aunque lo tuviera daría igual: la
			// capacidad es 100% opt-in, Vega nunca adivina cuál es el slug de una colección.
			manifestRaw: { schemaVersion: 1, collections: { post: {} } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.slugField).toBeNull();
		expect(model.warnings).toEqual([]);
	});

	test('editorRail: true → se resuelve; ausente o inválido → false (default), con/sin warning', () => {
		const on = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { editorRail: true } } }
		});
		expect(on.types.find((t) => t.name === 'post')!.editorRail).toBe(true);
		expect(on.warnings).toEqual([]);

		const absent = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: {} } }
		});
		expect(absent.types.find((t) => t.name === 'post')!.editorRail).toBe(false);
		expect(absent.warnings).toEqual([]);

		const invalid = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { editorRail: 'sí' } } }
		});
		expect(invalid.types.find((t) => t.name === 'post')!.editorRail).toBe(false);
		expect(invalid.warnings).toEqual([
			expect.objectContaining({
				code: 'manifest-invalid-key',
				path: '/collections/post/editorRail'
			})
		]);
	});

	test('defaultSort declarado sobre un campo escalar → se resuelve tal cual, sin warning', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { defaultSort: { field: 'publishedAt', dir: 'desc' } } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.defaultSort).toEqual({ field: 'publishedAt', dir: 'desc' });
		expect(model.warnings).toEqual([]);
	});

	test('defaultSort.field inexistente → default-sort-field-invalid + null', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { defaultSort: { field: 'no-existe', dir: 'asc' } } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.defaultSort).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'default-sort-field-invalid', collection: 'post' })
		]);
	});

	test('defaultSort.field no escalar (select múltiple, "tags") → default-sort-field-invalid + null', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { defaultSort: { field: 'tags', dir: 'asc' } } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.defaultSort).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'default-sort-field-invalid', collection: 'post' })
		]);
	});

	test('defaultSort con dir inválido → manifest-invalid-key + null (todo o nada)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { defaultSort: { field: 'rating', dir: 'sideways' } } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.defaultSort).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'manifest-invalid-key',
				path: '/collections/post/defaultSort'
			})
		]);
	});

	test('sin defaultSort en el manifiesto → null, SIN warning (opt-in)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: {} } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.defaultSort).toBeNull();
		expect(model.warnings).toEqual([]);
	});

	test('statusLabels con claves de statusField → se resuelve tal cual, sin warning', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { statusLabels: { draft: 'Borrador', published: 'Publicado' } } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.statusLabels).toEqual({ draft: 'Borrador', published: 'Publicado' });
		expect(model.warnings).toEqual([]);
	});

	test('statusLabels con una clave que no es opción del statusField → status-labels-unknown-value, la etiqueta se conserva', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { statusLabels: { draft: 'Borrador', 'en-revision': 'En revisión' } } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.statusLabels).toEqual({ draft: 'Borrador', 'en-revision': 'En revisión' });
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'status-labels-unknown-value', collection: 'post' })
		]);
	});

	test('statusLabels sin statusField resoluble (desactivado con false) → se conserva sin validar contenido', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { statusField: false, statusLabels: { draft: 'Borrador' } } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.statusField).toBeNull();
		expect(post.statusLabels).toEqual({ draft: 'Borrador' });
		expect(model.warnings).toEqual([]);
	});

	test('statusLabels con un valor no-string → manifest-invalid-key + null (todo o nada)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { statusLabels: { draft: 42 } } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.statusLabels).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'manifest-invalid-key',
				path: '/collections/post/statusLabels'
			})
		]);
	});

	test('sin statusLabels en el manifiesto → null, SIN warning (opt-in)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: {} } }
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.statusLabels).toBeNull();
		expect(model.warnings).toEqual([]);
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
			{ collections: { post: { orderField: 123 } } },
			{ collections: { post: { subtitleField: 123 } } },
			{ collections: { post: { defaultSort: 'nope' } } },
			{ collections: { post: { defaultSort: { field: 123, dir: 'asc' } } } },
			{ collections: { post: { defaultSort: { field: 'rating', dir: 'nope' } } } },
			{ collections: { post: { statusLabels: 'nope' } } },
			{ collections: { post: { statusLabels: { draft: 123 } } } },
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

// ————— 11. fieldGroups: columnas (§4.9b) —————

describe('11. fieldGroups: rejilla de columnas (§4.9b)', () => {
	test('fieldGroups de siempre (solo strings) → cada grupo resuelve columns: 1', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					post: {
						fieldGroups: ['Contenido', 'SEO'],
						fields: { title: { group: 'Contenido' }, excerpt: { group: 'SEO' } }
					}
				}
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.fieldGroups).toEqual([
			{ name: null, columns: 1, placement: 'main' },
			{ name: 'Contenido', columns: 1, placement: 'main' },
			{ name: 'SEO', columns: 1, placement: 'main' }
		]);
		expect(model.warnings).toEqual([]);
	});

	test('{ name, columns } mezclado con strings → columns solo en el grupo que lo declara', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					post: {
						fieldGroups: ['Contenido', { name: 'SEO', columns: 3 }],
						fields: { title: { group: 'Contenido' }, excerpt: { group: 'SEO' } }
					}
				}
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.fieldGroups).toEqual([
			{ name: null, columns: 1, placement: 'main' },
			{ name: 'Contenido', columns: 1, placement: 'main' },
			{ name: 'SEO', columns: 3, placement: 'main' }
		]);
		expect(model.warnings).toEqual([]);
	});

	test('el grupo anónimo (campos sin group) siempre es columns: 1', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					post: {
						fieldGroups: [{ name: 'Contenido', columns: 2 }],
						fields: { title: { group: 'Contenido' } }
					}
				}
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.fieldGroups[0]).toEqual({ name: null, columns: 1, placement: 'main' });
		expect(post.fieldGroups).toContainEqual({ name: 'Contenido', columns: 2, placement: 'main' });
	});

	test('columns fuera de 1-3 → fieldGroups entero se ignora (manifest-invalid-key), campos siguen agrupados por su group', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					post: {
						fieldGroups: [{ name: 'Contenido', columns: 4 }],
						fields: { title: { group: 'Contenido' } }
					}
				}
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		// El grupo "Contenido" sigue existiendo (viene del `group` del CAMPO, independiente de la
		// declaración de `fieldGroups`) pero sin `columns` propio: cae al default 1.
		expect(post.fieldGroups).toContainEqual({ name: 'Contenido', columns: 1, placement: 'main' });
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'manifest-invalid-key',
				path: '/collections/post/fieldGroups'
			})
		]);
	});

	test('placement: "aside" → se resuelve en ESE grupo; el resto (y el anónimo) siguen en "main"', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					post: {
						fieldGroups: ['Contenido', { name: 'SEO', placement: 'aside' }],
						fields: { title: { group: 'Contenido' }, excerpt: { group: 'SEO' } }
					}
				}
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.fieldGroups).toEqual([
			{ name: null, columns: 1, placement: 'main' },
			{ name: 'Contenido', columns: 1, placement: 'main' },
			{ name: 'SEO', columns: 1, placement: 'aside' }
		]);
		expect(model.warnings).toEqual([]);
	});

	test('placement fuera de main/aside → fieldGroups entero se ignora (manifest-invalid-key)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					post: {
						fieldGroups: [{ name: 'SEO', placement: 'derecha' }],
						fields: { excerpt: { group: 'SEO' } }
					}
				}
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		// El grupo sigue existiendo (viene del `group` del CAMPO) pero con los defaults de siempre.
		expect(post.fieldGroups).toContainEqual({ name: 'SEO', columns: 1, placement: 'main' });
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'manifest-invalid-key',
				path: '/collections/post/fieldGroups'
			})
		]);
	});

	test('item objeto sin "name" → fieldGroups entero inválido, se ignora igual que un columns fuera de rango', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { fieldGroups: [{ columns: 2 }] } }
			}
		});
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'manifest-invalid-key',
				path: '/collections/post/fieldGroups'
			})
		]);
	});
});

// ————— 12. Vistas fusionadas (mergedViews, L7a) —————

describe('12. Vistas fusionadas (mergedViews, L7a)', () => {
	test('manifiesto sin mergedViews → array vacío, sin warnings', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1 }
		});
		expect(model.mergedViews).toEqual([]);
		expect(model.warnings).toEqual([]);
	});

	test('vista completa: label/icon/group/order propios + overrides por source (titleField/label/where)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					destacados_home: {
						label: 'Destacados Home',
						icon: 'star',
						group: 'Portada',
						order: 2,
						orderField: 'rating',
						sources: [
							{ collection: 'post', where: { featured: true } },
							{
								collection: 'post',
								where: { status: 'published' },
								titleField: 'website', // override explícito (post.website es url, representable)
								label: 'Entrada destacada'
							}
						]
					}
				}
			},
			knownIcons: ['star', 'pencil']
		});

		expect(model.warnings).toEqual([]);
		expect(model.mergedViews).toHaveLength(1);
		const view = model.mergedViews[0];
		expect(view).toEqual({
			id: 'destacados_home',
			label: 'Destacados Home',
			icon: 'star',
			group: 'Portada',
			order: 2,
			sources: [
				{
					collection: 'post',
					where: { kind: 'cond', field: 'featured', op: 'eq', value: true },
					orderField: 'rating', // heredado de la vista (la source no declara el suyo)
					titleField: 'title', // default = titleField resuelto del tipo (post)
					label: 'Post' // default = labelSingular resuelto del tipo (post)
				},
				{
					collection: 'post',
					where: { kind: 'cond', field: 'status', op: 'eq', value: 'published' },
					orderField: 'rating', // heredado de la vista (la source no declara el suyo)
					titleField: 'website', // override explícito
					label: 'Entrada destacada' // override explícito
				}
			]
		});
	});

	test('sin declarar label/icon/group/order/orderField ni overrides → defaults', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					destacados_home: { sources: [{ collection: 'post', orderField: 'rating' }] }
				}
			}
		});
		expect(model.warnings).toEqual([]);
		const view = model.mergedViews[0];
		expect(view.label).toBe('Destacados home'); // humanizeLabel(id), §4.8
		expect(view.icon).toBeNull();
		expect(view.group).toBeNull();
		expect(view.order).toBe(0);
		const source = view.sources[0];
		expect(source.titleField).toBe('title'); // default = titleField resuelto del tipo (post)
		expect(source.label).toBe('Post'); // default = labelSingular resuelto del tipo (post)
	});

	test('colección inexistente → merged-source-orphan, esa source se descarta (el resto sobrevive)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					destacados_home: {
						orderField: 'rating',
						sources: [{ collection: 'no-existe' }, { collection: 'post' }]
					}
				}
			}
		});
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'merged-source-orphan',
				mergedView: 'destacados_home',
				collection: 'no-existe',
				path: '/mergedViews/destacados_home/sources/0'
			})
		]);
		expect(model.mergedViews[0].sources).toHaveLength(1);
		expect(model.mergedViews[0].sources[0].collection).toBe('post');
	});

	test('colección reservada (vega) → merged-source-orphan (reservada) + se descarta', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					destacados_home: {
						orderField: 'rating',
						sources: [{ collection: 'vega' }, { collection: 'post' }]
					}
				}
			}
		});
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'merged-source-orphan',
				mergedView: 'destacados_home',
				collection: 'vega'
			})
		]);
		expect(model.mergedViews[0].sources.map((s) => s.collection)).toEqual(['post']);
	});

	test('orderField ausente (ni source ni vista) → merged-source-order-invalid, source descartada', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: { destacados_home: { sources: [{ collection: 'post' }] } }
			}
		});
		// 0 sources válidas → además del warning de la source, la vista entera se descarta.
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'merged-source-order-invalid',
				mergedView: 'destacados_home'
			}),
			expect.objectContaining({ code: 'merged-view-invalid', mergedView: 'destacados_home' })
		]);
		expect(model.mergedViews).toEqual([]);
	});

	test('orderField no numérico → merged-source-order-invalid, source descartada', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					destacados_home: {
						sources: [
							{ collection: 'post', orderField: 'title' },
							{ collection: 'post', orderField: 'rating' }
						]
					}
				}
			}
		});
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'merged-source-order-invalid',
				mergedView: 'destacados_home',
				path: '/mergedViews/destacados_home/sources/0/orderField'
			})
		]);
		expect(model.mergedViews[0].sources).toHaveLength(1);
		expect(model.mergedViews[0].sources[0].orderField).toBe('rating');
	});

	test('where con prop inexistente → merged-where-invalid, esa condición se ignora (el resto sobrevive)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					destacados_home: {
						orderField: 'rating',
						sources: [{ collection: 'post', where: { noExiste: 1, featured: true } }]
					}
				}
			}
		});
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'merged-where-invalid',
				mergedView: 'destacados_home',
				collection: 'post',
				field: 'noExiste'
			})
		]);
		expect(model.mergedViews[0].sources[0].where).toEqual({
			kind: 'cond',
			field: 'featured',
			op: 'eq',
			value: true
		});
	});

	test('where con prop que no admite "eq" (select múltiple) → merged-where-invalid, where queda null', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					destacados_home: {
						orderField: 'rating',
						sources: [{ collection: 'post', where: { tags: 'a' } }]
					}
				}
			}
		});
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'merged-where-invalid', field: 'tags' })
		]);
		expect(model.mergedViews[0].sources[0].where).toBeNull();
	});

	test('where con dos condiciones válidas → group AND', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					destacados_home: {
						orderField: 'rating',
						sources: [{ collection: 'post', where: { featured: true, status: 'draft' } }]
					}
				}
			}
		});
		expect(model.warnings).toEqual([]);
		expect(model.mergedViews[0].sources[0].where).toEqual({
			kind: 'group',
			combinator: 'and',
			nodes: [
				{ kind: 'cond', field: 'featured', op: 'eq', value: true },
				{ kind: 'cond', field: 'status', op: 'eq', value: 'draft' }
			]
		});
	});

	test('0 sources válidas → merged-view-invalid, la vista no aparece en mergedViews', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: { destacados_home: { sources: [{ collection: 'no-existe' }] } }
			}
		});
		expect(model.mergedViews).toEqual([]);
		expect(model.warnings).toContainEqual(
			expect.objectContaining({ code: 'merged-view-invalid', mergedView: 'destacados_home' })
		);
	});

	test('sources con UN elemento no-objeto → el array ENTERO se invalida ("todo o nada", como fieldGroups/listFields)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					destacados_home: {
						orderField: 'rating',
						sources: [{ collection: 'post' }, 'nope']
					}
				}
			}
		});
		// `sources` entero se trata como ausente (manifest-invalid-key) → 0 sources → la vista se
		// descarta entera (merged-view-invalid), NO solo el elemento 'nope'.
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'manifest-invalid-key',
				path: '/mergedViews/destacados_home/sources'
			}),
			expect.objectContaining({ code: 'merged-view-invalid', mergedView: 'destacados_home' })
		]);
		expect(model.mergedViews).toEqual([]);
	});

	test('titleField override inexistente → title-field-invalid, cae al titleField resuelto del tipo', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					destacados_home: {
						orderField: 'rating',
						sources: [{ collection: 'post', titleField: 'no-existe' }]
					}
				}
			}
		});
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'title-field-invalid',
				mergedView: 'destacados_home',
				collection: 'post',
				path: '/mergedViews/destacados_home/sources/0/titleField'
			})
		]);
		expect(model.mergedViews[0].sources[0].titleField).toBe('title');
	});

	test('icon fuera del set de knownIcons → icon null + icon-unknown, SIN colisionar con collections', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					destacados_home: {
						icon: 'no-existe',
						orderField: 'rating',
						sources: [{ collection: 'post' }]
					}
				}
			},
			knownIcons: ['star', 'pencil']
		});
		expect(model.mergedViews[0].icon).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'icon-unknown',
				mergedView: 'destacados_home',
				path: '/mergedViews/destacados_home/icon'
			})
		]);
		// A diferencia de `iconUnknown` (colecciones), NO debe llevar `collection`: `destacados_home`
		// no es una colección y colar el id ahí colisionaría si existiera una colección homónima.
		expect(model.warnings[0].collection).toBeUndefined();
	});

	test('la misma colección en varias sources de la vista → permitido (dedupe es cosa de L7b)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					destacados_home: {
						orderField: 'rating',
						sources: [
							{ collection: 'post', where: { featured: true } },
							{ collection: 'post', where: { status: 'published' } }
						]
					}
				}
			}
		});
		expect(model.warnings).toEqual([]);
		expect(model.mergedViews[0].sources.map((s) => s.collection)).toEqual(['post', 'post']);
	});

	test('mergedViews no es un objeto → manifest-invalid-key, mergedViews vacío', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, mergedViews: 'nope' } as unknown as JsonValue
		});
		expect(model.mergedViews).toEqual([]);
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'manifest-invalid-key', path: '/mergedViews' })
		]);
	});

	test('fuzz ligero (§8.12): mergedViews malformado nunca lanza', () => {
		const malformed: JsonValue[] = [
			{ mergedViews: 'nope' },
			{ mergedViews: { v: 'nope' } },
			{ mergedViews: { v: { sources: 'nope' } } },
			{ mergedViews: { v: { sources: [] } } },
			{ mergedViews: { v: { sources: ['nope'] } } },
			{ mergedViews: { v: { sources: [{ collection: 123 }] } } },
			{ mergedViews: { v: { sources: [{ collection: 'post', where: 'nope' }] } } },
			{ mergedViews: { v: { sources: [{ collection: 'post', where: { x: [1, 2] } }] } } },
			{ mergedViews: { v: { sources: [{ collection: 'post', where: null }] } } },
			JSON.parse('{"mergedViews":{"__proto__":{"sources":[{"collection":"post"}]}}}')
		];
		for (const manifestRaw of malformed) {
			expect(() => resolveContentModel({ types: kitchenSinkTypes, manifestRaw })).not.toThrow();
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((Object.prototype as any).polluted).toBeUndefined();
	});
});

// ————— 13. mergedViews plegadas en nav (L7c) —————

describe('13. mergedViews plegadas en nav (L7c)', () => {
	test('mismo grupo, mismo order → desempate por orden de inserción: la colección va antes que la vista', () => {
		// `buildNav` (resolve.ts) arma `entries = [...visibleTypes, ...mergedViews]`: con `order`
		// EMPATADO, `orderByGroups` desempata por `baseIndex` (orden de inserción), así que la
		// colección (declarada primero en `entries`) gana SIEMPRE a la vista, determinista.
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { category: { group: 'Grupo', order: 5 } },
				mergedViews: {
					vista_x: {
						label: 'Vista X',
						group: 'Grupo',
						order: 5,
						sources: [{ collection: 'post', orderField: 'rating' }]
					}
				}
			}
		});
		expect(model.warnings).toEqual([]);
		const grupo = model.nav.groups.find((g) => g.label === 'Grupo')!;
		expect(grupo.items.map((i) => ({ kind: i.kind, type: i.type }))).toEqual([
			{ kind: 'collection', type: 'category' },
			{ kind: 'view', type: 'vista_x' }
		]);
	});

	test('intercalación por order real: una vista con order MENOR que una colección va ANTES (no "colecciones siempre primero")', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { category: { group: 'Grupo', order: 10 } },
				mergedViews: {
					vista_y: {
						group: 'Grupo',
						order: 1,
						sources: [{ collection: 'post', orderField: 'rating' }]
					}
				}
			}
		});
		expect(model.warnings).toEqual([]);
		const grupo = model.nav.groups.find((g) => g.label === 'Grupo')!;
		expect(grupo.items.map((i) => ({ kind: i.kind, type: i.type }))).toEqual([
			{ kind: 'view', type: 'vista_y' },
			{ kind: 'collection', type: 'category' }
		]);
	});

	test('vista SIN group → cae en el grupo anónimo, igual que una colección sin group', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					vista_z: { sources: [{ collection: 'post', orderField: 'rating' }] }
				}
			}
		});
		expect(model.warnings).toEqual([]);
		// Sin `collections` en el manifiesto, category/post/settings_view caen las tres en el grupo
		// anónimo (ninguna declara `group`) — `vista_z` (tampoco declara `group`) se pliega en EL
		// MISMO grupo anónimo, no en uno propio.
		const anon = model.nav.groups.find((g) => g.label === null)!;
		expect(anon.items.map((i) => i.type).sort()).toEqual(
			['category', 'post', 'settings_view', 'vista_z'].sort()
		);
		const vista = anon.items.find((i) => i.type === 'vista_z')!;
		expect(vista.kind).toBe('view');
		expect(vista.readonly).toBe(true);
		expect(vista.singleton).toBe(false);
	});

	test('sin mergedViews (ausente) → nav SOLO colecciones, mismo orden que antes de L7c (regresión)', () => {
		// MISMO manifiesto que el test de §6 "grupos: anónimo primero, declarados en orden, no
		// declarados alfabético" (sin `mergedViews`): confirma que plegar vistas en `buildNav` no
		// cambió el resultado cuando no hay ninguna que plegar.
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
		expect(model.warnings).toEqual([]);
		expect(model.nav.groups.map((g) => g.label)).toEqual(['Contenido', 'Alfa', 'Zeta']);
		const allItems = model.nav.groups.flatMap((g) => g.items);
		expect(allItems.map((i) => i.type)).toEqual(['post', 'settings_view', 'category']);
		expect(allItems.every((i) => i.kind === 'collection')).toBe(true);
	});
});

// ————— 14. Colisión de namespace mergedViews vs collections (L7e) —————

describe('14. Colisión de namespace mergedViews vs collections (L7e)', () => {
	test('id de mergedViews == name de una colección VISIBLE → vista descartada + merged-view-name-collision', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					category: { sources: [{ collection: 'post', orderField: 'rating' }] }
				}
			}
		});
		expect(model.mergedViews).toEqual([]);
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'merged-view-name-collision',
				mergedView: 'category',
				path: '/mergedViews/category'
			})
		]);
		// La colección `category` sigue en nav como `collection`; NO hay una segunda entrada `view`
		// con el mismo `type` — la vista en colisión nunca llega a `buildNav`.
		const items = model.nav.groups.flatMap((g) => g.items).filter((i) => i.type === 'category');
		expect(items).toEqual([expect.objectContaining({ kind: 'collection', type: 'category' })]);
	});

	test('id de mergedViews == name de una colección OCULTA (reservada) → también se descarta (se compara contra TODO el esquema)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					vega: { sources: [{ collection: 'post', orderField: 'rating' }] }
				}
			}
		});
		expect(model.mergedViews).toEqual([]);
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'merged-view-name-collision', mergedView: 'vega' })
		]);
	});

	test('sin colisión (id distinto de cualquier colección) → sin warning nuevo (regresión)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				mergedViews: {
					destacados_home: { sources: [{ collection: 'post', orderField: 'rating' }] }
				}
			}
		});
		expect(model.warnings).toEqual([]);
		expect(model.mergedViews).toHaveLength(1);
		expect(model.mergedViews[0].id).toBe('destacados_home');
	});
});

// ————— 15. blocks: bloques ordenables embebidos (lote "editor" Fase A) —————

// Fixture LOCAL, deliberadamente fuera de `kitchenSinkTypes` (`./fixture.ts`): `blocks` necesita
// una colección hija con una relation NO-múltiple de vuelta al padre + un campo numérico, y tocar
// el fixture compartido para añadir eso arrastraría el riesgo de descuadrar la enorme batería de
// tests que ya lo usan (cardinalidad de `kitchenSinkTypes`, campos concretos de `post`/`category`…
// ver el describe "fixture" más abajo). `landing`/`landing_block` son un caso mínimo y realista:
// una landing hecha de secciones, exactamente el ejemplo del lote.
const landingType: ContentType = {
	name: 'landing',
	readonly: false,
	fields: [
		{
			name: 'title',
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

const landingBlockType: ContentType = {
	name: 'landing_block',
	readonly: false,
	fields: [
		{
			name: 'parent',
			type: 'relation',
			target: 'landing',
			multiple: false,
			required: true,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		// Relación de vuelta a `landing`, pero MÚLTIPLE — usada para probar que `multiple: true` se
		// rechaza aunque el `target` sea el correcto (ver `resolveBlocks`, decisión de diseño).
		{
			name: 'parents',
			type: 'relation',
			target: 'landing',
			multiple: true,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'sort',
			type: 'number',
			integer: true,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'heading',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		},
		// `kind`/`payload` (§18, modo heterogéneo): un `text` y un `json` reales para probar
		// `blocks.typeField`/`blocks.dataField` — ningún test de §15 los referencia, así que
		// añadirlos aquí no afecta a la batería existente.
		{
			name: 'kind',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'payload',
			type: 'json',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

const blocksTypes: ContentType[] = [landingType, landingBlockType];

describe('15. blocks: bloques ordenables embebidos (lote "editor" Fase A)', () => {
	test('declaración válida → se resuelve, sin warnings', () => {
		const model = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					landing: {
						blocks: { collection: 'landing_block', parentField: 'parent', orderField: 'sort' }
					}
				}
			}
		});
		expect(model.warnings).toEqual([]);
		expect(model.types.find((t) => t.name === 'landing')!.blocks).toEqual({
			collection: 'landing_block',
			parentField: 'parent',
			orderField: 'sort',
			typeField: null,
			dataField: null
		});
	});

	test('sin blocks en el manifiesto → null, SIN warning (opt-in, sin autodetección)', () => {
		const model = resolveContentModel({
			types: blocksTypes,
			manifestRaw: { schemaVersion: 1, collections: { landing: {} } }
		});
		expect(model.types.find((t) => t.name === 'landing')!.blocks).toBeNull();
		expect(model.warnings).toEqual([]);
	});

	test('forma inválida (falta una clave) → manifest-invalid-key, blocks null', () => {
		const model = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { landing: { blocks: { collection: 'landing_block', parentField: 'parent' } } }
			}
		});
		expect(model.types.find((t) => t.name === 'landing')!.blocks).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'manifest-invalid-key', path: '/collections/landing/blocks' })
		]);
	});

	test('colección hija inexistente → blocks-invalid (collection), blocks null', () => {
		const model = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					landing: {
						blocks: { collection: 'nope', parentField: 'parent', orderField: 'sort' }
					}
				}
			}
		});
		expect(model.types.find((t) => t.name === 'landing')!.blocks).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'blocks-invalid',
				collection: 'landing',
				path: '/collections/landing/blocks/collection'
			})
		]);
	});

	test('colección hija reservada (vega_*) → blocks-invalid (collection)', () => {
		const model = resolveContentModel({
			types: [...blocksTypes, vegaMediaType],
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					landing: {
						blocks: { collection: 'vega_media', parentField: 'parent', orderField: 'sort' }
					}
				}
			}
		});
		expect(model.types.find((t) => t.name === 'landing')!.blocks).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'blocks-invalid',
				path: '/collections/landing/blocks/collection'
			})
		]);
	});

	test('parentField inexistente → blocks-invalid (parentField)', () => {
		const model = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					landing: {
						blocks: { collection: 'landing_block', parentField: 'nope', orderField: 'sort' }
					}
				}
			}
		});
		expect(model.types.find((t) => t.name === 'landing')!.blocks).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'blocks-invalid',
				path: '/collections/landing/blocks/parentField'
			})
		]);
	});

	test('parentField que no es relation → blocks-invalid (parentField)', () => {
		const model = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					landing: {
						blocks: { collection: 'landing_block', parentField: 'heading', orderField: 'sort' }
					}
				}
			}
		});
		expect(model.types.find((t) => t.name === 'landing')!.blocks).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'blocks-invalid',
				path: '/collections/landing/blocks/parentField'
			})
		]);
	});

	test('parentField relation pero MÚLTIPLE → blocks-invalid (parentField, un bloque = un padre)', () => {
		const model = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					landing: {
						blocks: { collection: 'landing_block', parentField: 'parents', orderField: 'sort' }
					}
				}
			}
		});
		expect(model.types.find((t) => t.name === 'landing')!.blocks).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'blocks-invalid',
				path: '/collections/landing/blocks/parentField'
			})
		]);
	});

	test('parentField relation a OTRA colección (no la que se resuelve) → blocks-invalid', () => {
		// `category` existe en el esquema pero `landing_block.parent` apunta a `landing`, no a ella:
		// declarar `blocks` sobre `category` reusando el mismo `parentField` debe rechazarse.
		const model = resolveContentModel({
			types: [...blocksTypes, categoryType],
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					category: {
						blocks: { collection: 'landing_block', parentField: 'parent', orderField: 'sort' }
					}
				}
			}
		});
		expect(model.types.find((t) => t.name === 'category')!.blocks).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'blocks-invalid',
				path: '/collections/category/blocks/parentField'
			})
		]);
	});

	test('orderField inexistente o no numérico → blocks-invalid (orderField)', () => {
		const missing = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					landing: {
						blocks: { collection: 'landing_block', parentField: 'parent', orderField: 'nope' }
					}
				}
			}
		});
		expect(missing.types.find((t) => t.name === 'landing')!.blocks).toBeNull();
		expect(missing.warnings).toEqual([
			expect.objectContaining({
				code: 'blocks-invalid',
				path: '/collections/landing/blocks/orderField'
			})
		]);

		const notNumeric = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					landing: {
						blocks: { collection: 'landing_block', parentField: 'parent', orderField: 'heading' }
					}
				}
			}
		});
		expect(notNumeric.types.find((t) => t.name === 'landing')!.blocks).toBeNull();
		expect(notNumeric.warnings).toEqual([
			expect.objectContaining({
				code: 'blocks-invalid',
				path: '/collections/landing/blocks/orderField'
			})
		]);
	});

	test('determinismo (L1): mismo input → mismo output (deepEqual)', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			collections: {
				landing: {
					blocks: { collection: 'landing_block', parentField: 'parent', orderField: 'sort' }
				}
			}
		};
		const a = resolveContentModel({ types: blocksTypes, manifestRaw });
		const b = resolveContentModel({ types: blocksTypes, manifestRaw });
		expect(a).toEqual(b);
	});
});

// ————— 16. social: tarjeta social SEO/OG (lote "editor" Fase B) —————

// A diferencia de `blocks`, `social` solo mira el PROPIO tipo (sin colección hija) → cabe sin
// problema en el kitchen-sink (`post`, con text/richtext/file simple/file múltiple/number, todo lo
// que hace falta para probar las cuatro piezas y sus fallos).
describe('16. social: tarjeta social SEO/OG (lote "editor" Fase B)', () => {
	test('sin social en el manifiesto → null, SIN warning (opt-in)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: {} } }
		});
		expect(model.types.find((t) => t.name === 'post')!.social).toBeNull();
		expect(model.warnings).toEqual([]);
	});

	test('social: {} (presente pero vacío) → activa la tarjeta con la cascada por defecto', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { titleField: 'title', social: {} } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		// Cascadas (ver ResolvedSocialCardConfig): título → titleField del tipo; descripción/imagen
		// sin fallback; url → previewUrl del tipo (aquí tampoco declarado) → null.
		expect(post.social).toEqual({
			titleField: 'title',
			descriptionField: null,
			imageField: null,
			urlTemplate: null
		});
		expect(model.warnings).toEqual([]);
	});

	test('las cuatro piezas declaradas y válidas → se resuelven tal cual, sin warnings', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					post: {
						social: {
							titleField: 'excerpt',
							descriptionField: 'content', // richtext también vale (contenido escrito)
							imageField: 'cover', // file NO múltiple
							urlTemplate: 'https://fodaveg.net/blog/{title}'
						}
					}
				}
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.social).toEqual({
			titleField: 'excerpt',
			descriptionField: 'content',
			imageField: 'cover',
			urlTemplate: 'https://fodaveg.net/blog/{title}'
		});
		expect(model.warnings).toEqual([]);
	});

	test('titleField inválido → social-title-field-invalid, cascada al titleField del tipo', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				// `rating` es numérico, no representable como título (§4.4).
				collections: { post: { titleField: 'title', social: { titleField: 'rating' } } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.social?.titleField).toBe('title'); // cascada, NO null
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'social-title-field-invalid',
				path: '/collections/post/social/titleField'
			})
		]);
	});

	test('descriptionField que no es texto/richtext → social-description-field-invalid, SIN fallback (null)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { social: { descriptionField: 'rating' } } }
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.social?.descriptionField).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'social-description-field-invalid',
				path: '/collections/post/social/descriptionField'
			})
		]);
	});

	test('imageField que es file MÚLTIPLE → social-image-field-invalid (una tarjeta = una imagen)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { social: { imageField: 'gallery' } } } // gallery: file multiple:true
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.social?.imageField).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'social-image-field-invalid',
				path: '/collections/post/social/imageField'
			})
		]);
	});

	test('imageField que no es file → social-image-field-invalid', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { post: { social: { imageField: 'title' } } }
			}
		});
		expect(model.types.find((t) => t.name === 'post')!.social?.imageField).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'social-image-field-invalid' })
		]);
	});

	test('urlTemplate con placeholder inexistente → social-url-invalid, cascada al previewUrl del tipo', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					post: {
						previewUrl: 'https://fodaveg.net/blog/{title}',
						social: { urlTemplate: 'https://fodaveg.net/blog/{nope}' }
					}
				}
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.social?.urlTemplate).toBe('https://fodaveg.net/blog/{title}'); // cascada, NO null
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'social-url-invalid',
				path: '/collections/post/social/urlTemplate'
			})
		]);
	});

	test('urlTemplate propio válido: gana sobre el previewUrl del tipo (no cae a la cascada)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					post: {
						previewUrl: 'https://fodaveg.net/blog/{title}',
						social: { urlTemplate: 'https://fodaveg.net/og/{id}' }
					}
				}
			}
		});
		const post = model.types.find((t) => t.name === 'post')!;
		expect(post.social?.urlTemplate).toBe('https://fodaveg.net/og/{id}');
		expect(model.warnings).toEqual([]);
	});

	test('social no-objeto → manifest-invalid-key, capacidad OFF (null, no un objeto a medias)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, collections: { post: { social: 'nope' } } }
		});
		expect(model.types.find((t) => t.name === 'post')!.social).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'manifest-invalid-key', path: '/collections/post/social' })
		]);
	});

	test('determinismo (L1): mismo input → mismo output (deepEqual)', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			collections: {
				post: { social: { titleField: 'excerpt', imageField: 'cover' } }
			}
		};
		const a = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		const b = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		expect(a).toEqual(b);
	});
});

// ————— 17. revisions: historial de versiones y papelera (`#lote-integridad` Fase B §7) —————

describe('17. revisions (§7 de la Fase B "integridad")', () => {
	test('sin manifiesto: defaults (enabled true, 20/30), sin warnings', () => {
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw: null });
		expect(model.revisions).toEqual({ enabled: true, keepPerRecord: 20, trashDays: 30 });
		expect(model.warnings).toEqual([]);
	});

	test('manifiesto con revisions completo: se respeta tal cual', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			revisions: { enabled: false, keepPerRecord: 5, trashDays: 7 }
		};
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		expect(model.revisions).toEqual({ enabled: false, keepPerRecord: 5, trashDays: 7 });
		expect(model.warnings).toEqual([]);
	});

	test('revisions PARCIAL: cada clave ausente cae a su default, sin invalidar las otras', () => {
		const manifestRaw: JsonValue = { schemaVersion: 1, revisions: { keepPerRecord: 5 } };
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		expect(model.revisions).toEqual({ enabled: true, keepPerRecord: 5, trashDays: 30 });
	});

	test('revisions no es un objeto → se ignora entero, warning manifest-invalid-key', () => {
		const manifestRaw: JsonValue = { schemaVersion: 1, revisions: 'nope' };
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		expect(model.revisions).toEqual({ enabled: true, keepPerRecord: 20, trashDays: 30 });
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'manifest-invalid-key', path: '/revisions' })
		]);
	});

	test('keepPerRecord/trashDays negativos o no enteros degradan a su default con warning', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			revisions: { keepPerRecord: -1, trashDays: 1.5 }
		};
		const model = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		expect(model.revisions).toEqual({ enabled: true, keepPerRecord: 20, trashDays: 30 });
		expect(model.warnings.map((w) => w.path).sort()).toEqual([
			'/revisions/keepPerRecord',
			'/revisions/trashDays'
		]);
	});

	test('determinismo (L1): mismo manifiesto con revisions → mismo resultado', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			revisions: { enabled: true, keepPerRecord: 10, trashDays: 15 }
		};
		const a = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		const b = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		expect(a).toEqual(b);
	});
});

// ————— 18. blocks: typeField/dataField (modo heterogéneo, vocabulario de tipos de bloque) —————

describe('18. blocks: typeField/dataField (modo heterogéneo, vocabulario de tipos de bloque)', () => {
	test('las DOS declaradas y válidas → modo heterogéneo, sin warnings', () => {
		const model = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
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
			}
		});
		expect(model.warnings).toEqual([]);
		expect(model.types.find((t) => t.name === 'landing')!.blocks).toEqual({
			collection: 'landing_block',
			parentField: 'parent',
			orderField: 'sort',
			typeField: 'kind',
			dataField: 'payload'
		});
	});

	test('ninguna declarada → homogéneo (typeField/dataField null), SIN warning (histórico intacto)', () => {
		const model = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					landing: {
						blocks: { collection: 'landing_block', parentField: 'parent', orderField: 'sort' }
					}
				}
			}
		});
		expect(model.warnings).toEqual([]);
		expect(model.types.find((t) => t.name === 'landing')!.blocks).toEqual({
			collection: 'landing_block',
			parentField: 'parent',
			orderField: 'sort',
			typeField: null,
			dataField: null
		});
	});

	test('solo typeField declarada → degrada a homogéneo + blocks-heterogeneous-invalid', () => {
		const model = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
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
			}
		});
		const blocks = model.types.find((t) => t.name === 'landing')!.blocks;
		expect(blocks).toEqual({
			collection: 'landing_block',
			parentField: 'parent',
			orderField: 'sort',
			typeField: null,
			dataField: null
		});
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'blocks-heterogeneous-invalid',
				collection: 'landing',
				path: '/collections/landing/blocks'
			})
		]);
	});

	test('solo dataField declarada → degrada a homogéneo + blocks-heterogeneous-invalid', () => {
		const model = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					landing: {
						blocks: {
							collection: 'landing_block',
							parentField: 'parent',
							orderField: 'sort',
							dataField: 'payload'
						}
					}
				}
			}
		});
		expect(model.types.find((t) => t.name === 'landing')!.blocks).toEqual({
			collection: 'landing_block',
			parentField: 'parent',
			orderField: 'sort',
			typeField: null,
			dataField: null
		});
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'blocks-heterogeneous-invalid', collection: 'landing' })
		]);
	});

	test('typeField que no es un campo text real (o no existe) → degrada + warning', () => {
		const notText = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					landing: {
						blocks: {
							collection: 'landing_block',
							parentField: 'parent',
							orderField: 'sort',
							typeField: 'sort', // number, no text
							dataField: 'payload'
						}
					}
				}
			}
		});
		expect(notText.types.find((t) => t.name === 'landing')!.blocks).toEqual(
			expect.objectContaining({ typeField: null, dataField: null })
		);
		expect(notText.warnings).toEqual([
			expect.objectContaining({ code: 'blocks-heterogeneous-invalid' })
		]);

		const missing = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					landing: {
						blocks: {
							collection: 'landing_block',
							parentField: 'parent',
							orderField: 'sort',
							typeField: 'nope',
							dataField: 'payload'
						}
					}
				}
			}
		});
		expect(missing.types.find((t) => t.name === 'landing')!.blocks).toEqual(
			expect.objectContaining({ typeField: null, dataField: null })
		);
		expect(missing.warnings).toEqual([
			expect.objectContaining({ code: 'blocks-heterogeneous-invalid' })
		]);
	});

	test('dataField que no es un campo json real → degrada + warning', () => {
		const model = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					landing: {
						blocks: {
							collection: 'landing_block',
							parentField: 'parent',
							orderField: 'sort',
							typeField: 'kind',
							dataField: 'heading' // text, no json
						}
					}
				}
			}
		});
		expect(model.types.find((t) => t.name === 'landing')!.blocks).toEqual(
			expect.objectContaining({ typeField: null, dataField: null })
		);
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'blocks-heterogeneous-invalid' })
		]);
	});

	test('degradar typeField/dataField NO invalida collection/parentField/orderField (asimetría)', () => {
		// Mismo caso que "solo typeField declarada", pero comprobando explícitamente que `blocks`
		// SIGUE siendo un objeto no-null con las tres piezas base intactas: la asimetría frente a
		// `blocksInvalid` (que SÍ invalida todo) es justo lo que se pide documentar.
		const model = resolveContentModel({
			types: blocksTypes,
			manifestRaw: {
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
			}
		});
		const blocks = model.types.find((t) => t.name === 'landing')!.blocks;
		expect(blocks).not.toBeNull();
		expect(blocks).toEqual(
			expect.objectContaining({
				collection: 'landing_block',
				parentField: 'parent',
				orderField: 'sort'
			})
		);
	});

	test('determinismo (L1): mismo input → mismo output (deepEqual)', () => {
		const manifestRaw: JsonValue = {
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
		};
		const a = resolveContentModel({ types: blocksTypes, manifestRaw });
		const b = resolveContentModel({ types: blocksTypes, manifestRaw });
		expect(a).toEqual(b);
	});
});

// ————— 19. blockTypes: vocabulario de tipos de bloque (RAÍZ, #4cfd4f7f) —————

describe('19. blockTypes: vocabulario de tipos de bloque (RAÍZ, #4cfd4f7f)', () => {
	test('sin blockTypes en el manifiesto → [], SIN warning (opt-in)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1 }
		});
		expect(model.blockTypes).toEqual([]);
		expect(model.warnings).toEqual([]);
	});

	test('un tipo válido con label/icon/fields → se resuelve tal cual', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
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
			},
			knownIcons: ['image']
		});
		expect(model.warnings).toEqual([]);
		expect(model.blockTypes).toEqual([
			{
				name: 'hero',
				label: 'Portada',
				icon: 'image',
				fields: [
					{
						name: 'titulo',
						label: 'Título',
						widget: 'text',
						source: 'data',
						required: true,
						options: null
					},
					{
						name: 'alineacion',
						label: 'Alineación',
						widget: 'select',
						source: 'data',
						required: false,
						options: ['izquierda', 'centro']
					}
				]
			}
		]);
	});

	test('source ausente cae a data; default se conserva y relation/file exigen record', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					hero: {
						label: 'Portada',
						fields: [
							{ name: 'title', label: 'Título', widget: 'text', default: 'Sin título' },
							{
								name: 'image',
								label: 'Imagen',
								widget: 'relation',
								source: 'record'
							},
							{ name: 'file', label: 'Fichero', widget: 'file', source: 'record' }
						]
					}
				}
			}
		});

		expect(model.warnings).toEqual([]);
		expect(model.blockTypes[0].fields).toEqual([
			{
				name: 'title',
				label: 'Título',
				widget: 'text',
				source: 'data',
				default: 'Sin título',
				required: false,
				options: null
			},
			{
				name: 'image',
				label: 'Imagen',
				widget: 'relation',
				source: 'record',
				required: false,
				options: null
			},
			{
				name: 'file',
				label: 'Fichero',
				widget: 'file',
				source: 'record',
				required: false,
				options: null
			}
		]);
	});

	test('relation/file con source data se descartan como campos inválidos', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					hero: {
						label: 'Portada',
						fields: [
							{ name: 'title', label: 'Título', widget: 'text' },
							{ name: 'image', label: 'Imagen', widget: 'relation', source: 'data' },
							{ name: 'file', label: 'Fichero', widget: 'file' }
						]
					}
				}
			}
		});

		expect(model.blockTypes[0].fields.map((field) => field.name)).toEqual(['title']);
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'block-type-field-invalid',
				path: '/blockTypes/hero/fields/1'
			}),
			expect.objectContaining({
				code: 'block-type-field-invalid',
				path: '/blockTypes/hero/fields/2'
			})
		]);
	});

	test('varios tipos → se preserva el ORDEN de declaración del manifiesto', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					cta: {
						label: 'Llamada a la acción',
						fields: [{ name: 'texto', label: 'Texto', widget: 'text' }]
					},
					hero: { label: 'Portada', fields: [{ name: 'titulo', label: 'Título', widget: 'text' }] },
					texto: {
						label: 'Texto',
						fields: [{ name: 'cuerpo', label: 'Cuerpo', widget: 'richtext' }]
					}
				}
			}
		});
		expect(model.blockTypes.map((t) => t.name)).toEqual(['cta', 'hero', 'texto']);
	});

	test('sin icon (o sin knownIcons) → icon null / tal cual, sin warning', () => {
		const withoutIcon = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					hero: { label: 'Portada', fields: [{ name: 'a', label: 'A', widget: 'text' }] }
				}
			}
		});
		expect(withoutIcon.blockTypes[0].icon).toBeNull();
		expect(withoutIcon.warnings).toEqual([]);

		const noKnownIcons = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					hero: {
						label: 'Portada',
						icon: 'cualquiera',
						fields: [{ name: 'a', label: 'A', widget: 'text' }]
					}
				}
			}
			// sin knownIcons: no se valida, se acepta tal cual (mismo criterio que collections.icon)
		});
		expect(noKnownIcons.blockTypes[0].icon).toBe('cualquiera');
		expect(noKnownIcons.warnings).toEqual([]);
	});

	test('icon fuera de knownIcons → icon null + icon-unknown (reutilizado)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					hero: {
						label: 'Portada',
						icon: 'nope',
						fields: [{ name: 'a', label: 'A', widget: 'text' }]
					}
				}
			},
			knownIcons: ['image', 'star']
		});
		expect(model.blockTypes[0].icon).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'icon-unknown',
				blockType: 'hero',
				path: '/blockTypes/hero/icon'
			})
		]);
	});

	test('clave que no casa ^[a-z][a-z0-9-]*$ → se descarta ENTERO, block-type-invalid', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					Hero: { label: 'Portada', fields: [{ name: 'a', label: 'A', widget: 'text' }] }
				}
			}
		});
		expect(model.blockTypes).toEqual([]);
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'block-type-invalid',
				blockType: 'Hero',
				path: '/blockTypes/Hero'
			})
		]);
	});

	test('sin label (o label inválido) → se descarta ENTERO, block-type-invalid', () => {
		const missing = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: { hero: { fields: [{ name: 'a', label: 'A', widget: 'text' }] } }
			}
		});
		expect(missing.blockTypes).toEqual([]);
		expect(missing.warnings).toEqual([
			expect.objectContaining({ code: 'block-type-invalid', path: '/blockTypes/hero' })
		]);

		const tooLong = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					hero: { label: 'x'.repeat(61), fields: [{ name: 'a', label: 'A', widget: 'text' }] }
				}
			}
		});
		expect(tooLong.blockTypes).toEqual([]);
		expect(tooLong.warnings).toEqual([
			expect.objectContaining({ code: 'block-type-invalid', path: '/blockTypes/hero' })
		]);
	});

	test('declaración que no es un objeto → se descarta ENTERO, block-type-invalid', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, blockTypes: { hero: 'not-an-object' } }
		});
		expect(model.blockTypes).toEqual([]);
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'block-type-invalid', path: '/blockTypes/hero' })
		]);
	});

	test('fields ausente o vacío → se descarta ENTERO, block-type-invalid (fields)', () => {
		const absent = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, blockTypes: { hero: { label: 'Portada' } } }
		});
		expect(absent.blockTypes).toEqual([]);
		expect(absent.warnings).toEqual([
			expect.objectContaining({ code: 'block-type-invalid', path: '/blockTypes/hero' })
		]);

		const empty = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, blockTypes: { hero: { label: 'Portada', fields: [] } } }
		});
		expect(empty.blockTypes).toEqual([]);
		expect(empty.warnings).toEqual([
			expect.objectContaining({ code: 'block-type-invalid', path: '/blockTypes/hero' })
		]);
	});

	test('campo con widget EXCLUIDO (relation/file/unsupported) → se descarta SOLO ese campo', () => {
		for (const widget of ['relation', 'file', 'unsupported']) {
			const model = resolveContentModel({
				types: kitchenSinkTypes,
				manifestRaw: {
					schemaVersion: 1,
					blockTypes: {
						hero: {
							label: 'Portada',
							fields: [
								{ name: 'titulo', label: 'Título', widget: 'text' },
								{ name: 'malo', label: 'Malo', widget }
							]
						}
					}
				}
			});
			expect(model.blockTypes).toHaveLength(1);
			expect(model.blockTypes[0].fields.map((f) => f.name)).toEqual(['titulo']);
			expect(model.warnings).toEqual([
				expect.objectContaining({
					code: 'block-type-field-invalid',
					blockType: 'hero',
					path: '/blockTypes/hero/fields/1'
				})
			]);
		}
	});

	test('campo con widget DESCONOCIDO (fuera del vocabulario) → se descarta SOLO ese campo', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					hero: {
						label: 'Portada',
						fields: [
							{ name: 'titulo', label: 'Título', widget: 'text' },
							{ name: 'malo', label: 'Malo', widget: 'wat' }
						]
					}
				}
			}
		});
		expect(model.blockTypes[0].fields.map((f) => f.name)).toEqual(['titulo']);
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'block-type-field-invalid',
				path: '/blockTypes/hero/fields/1'
			})
		]);
	});

	// `name` es la CLAVE dentro del `data` JSON del bloque: dos campos que lo repitan son dos filas
	// del formulario escribiendo la misma clave, donde editar una pisa a la otra sin que nada lo
	// diga. En una colección real lo impediría PocketBase (no admite dos columnas con el mismo
	// nombre); dentro de un JSON no hay quien lo impida por abajo, así que lo comprueba Vega.
	test('dos campos con el MISMO name → gana el primero y el segundo se descarta', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					hero: {
						label: 'Portada',
						fields: [
							{ name: 'titulo', label: 'Título', widget: 'text' },
							{ name: 'titulo', label: 'Título otra vez', widget: 'textarea' },
							{ name: 'pie', label: 'Pie', widget: 'text' }
						]
					}
				}
			}
		});
		expect(model.blockTypes[0].fields.map((f) => f.name)).toEqual(['titulo', 'pie']);
		// Gana el PRIMERO: el que sobrevive conserva el widget del primero, no el del repetido.
		expect(model.blockTypes[0].fields[0].widget).toBe('text');
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'block-type-field-invalid',
				blockType: 'hero',
				path: '/blockTypes/hero/fields/1'
			})
		]);
	});

	// Un tipo cuyos campos son TODOS repetidos del primero se queda con uno solo, no con cero: la
	// deduplicación no puede llevarse por delante el tipo entero.
	test('un tipo cuyo único campo se repite conserva UNA copia y sobrevive', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					hero: {
						label: 'Portada',
						fields: [
							{ name: 'titulo', label: 'Título', widget: 'text' },
							{ name: 'titulo', label: 'Repetido', widget: 'text' }
						]
					}
				}
			}
		});
		expect(model.blockTypes).toHaveLength(1);
		expect(model.blockTypes[0].fields.map((f) => f.name)).toEqual(['titulo']);
	});

	test('campo sin name/label (forma inválida) → se descarta SOLO, el tipo sobrevive', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					hero: {
						label: 'Portada',
						fields: [
							{ name: 'titulo', label: 'Título', widget: 'text' },
							{ label: 'Sin name', widget: 'text' },
							{ name: 'sinLabel', widget: 'text' },
							'not-an-object'
						]
					}
				}
			}
		});
		expect(model.blockTypes[0].fields.map((f) => f.name)).toEqual(['titulo']);
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'block-type-field-invalid',
				path: '/blockTypes/hero/fields/1'
			}),
			expect.objectContaining({
				code: 'block-type-field-invalid',
				path: '/blockTypes/hero/fields/2'
			}),
			expect.objectContaining({
				code: 'block-type-field-invalid',
				path: '/blockTypes/hero/fields/3'
			})
		]);
	});

	test('TODOS los campos inválidos → el tipo se descarta ENTERO (fields, cero campos válidos)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					hero: { label: 'Portada', fields: [{ name: 'malo', label: 'Malo', widget: 'relation' }] }
				}
			}
		});
		expect(model.blockTypes).toEqual([]);
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'block-type-field-invalid',
				path: '/blockTypes/hero/fields/0'
			}),
			expect.objectContaining({ code: 'block-type-invalid', path: '/blockTypes/hero' })
		]);
	});

	test('options: solo select/chips; ausente → null; widget distinto con options declarado → null silencioso', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					hero: {
						label: 'Portada',
						fields: [
							{ name: 'sinOpciones', label: 'Sin opciones', widget: 'select' },
							{ name: 'chips', label: 'Chips', widget: 'chips', options: ['a', 'b'] },
							{ name: 'texto', label: 'Texto', widget: 'text', options: ['ignorado'] }
						]
					}
				}
			}
		});
		expect(model.warnings).toEqual([]);
		const fields = model.blockTypes[0].fields;
		expect(fields.find((f) => f.name === 'sinOpciones')!.options).toBeNull();
		expect(fields.find((f) => f.name === 'chips')!.options).toEqual(['a', 'b']);
		expect(fields.find((f) => f.name === 'texto')!.options).toBeNull();
	});

	test('options con forma inválida (array vacío o con elemento no-string) → null + manifest-invalid-key', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					hero: {
						label: 'Portada',
						fields: [{ name: 'malas', label: 'Malas', widget: 'select', options: [] }]
					}
				}
			}
		});
		expect(model.blockTypes[0].fields[0].options).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'manifest-invalid-key',
				path: '/blockTypes/hero/fields/0/options'
			})
		]);
	});

	test('required: boolean se respeta; forma inválida → default false + manifest-invalid-key', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				blockTypes: {
					hero: {
						label: 'Portada',
						fields: [
							{ name: 'a', label: 'A', widget: 'text', required: true },
							{ name: 'b', label: 'B', widget: 'text', required: 'yes' }
						]
					}
				}
			}
		});
		expect(model.blockTypes[0].fields.map((f) => ({ name: f.name, required: f.required }))).toEqual(
			[
				{ name: 'a', required: true },
				{ name: 'b', required: false }
			]
		);
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'manifest-invalid-key',
				path: '/blockTypes/hero/fields/1/required'
			})
		]);
	});

	test('determinismo (L1): mismo input → mismo output (deepEqual)', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			blockTypes: {
				hero: {
					label: 'Portada',
					icon: 'image',
					fields: [{ name: 'titulo', label: 'Título', widget: 'text', required: true }]
				}
			}
		};
		const a = resolveContentModel({ types: kitchenSinkTypes, manifestRaw, knownIcons: ['image'] });
		const b = resolveContentModel({ types: kitchenSinkTypes, manifestRaw, knownIcons: ['image'] });
		expect(a).toEqual(b);
	});
});

// ————— 20. page: modelo de páginas (tarea p1 `1dc63001`) —————

/** Fixture propio (no en `fixture.ts`, mismo criterio que `landingType`/`landingBlockType` de §15):
 *  `path` es `text` con índice único (el caso feliz), `pathDuplicable` es el MISMO tipo pero SIN
 *  índice único (§4b de la tarea: `page-path-not-unique`), `layout` es un `text` cualquiera para
 *  `layoutField`, y `rating` es NO-`text` para probar que `pathField`/`layoutField` exigen texto. */
const pageType: ContentType = {
	name: 'site_page',
	readonly: false,
	fields: [
		{
			name: 'path',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: true
		},
		{
			name: 'pathDuplicable',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'layout',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		},
		{
			name: 'rating',
			type: 'number',
			integer: true,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

const pageTypes: ContentType[] = [pageType];

describe('20. page: modelo de páginas (tarea p1 "1dc63001")', () => {
	test('sin page en el manifiesto → null, SIN warning (opt-in, sin autodetección)', () => {
		const model = resolveContentModel({
			types: pageTypes,
			manifestRaw: { schemaVersion: 1, collections: { site_page: {} } }
		});
		expect(model.types.find((t) => t.name === 'site_page')!.page).toBeNull();
		expect(model.warnings).toEqual([]);
	});

	test('pathField sobre un campo text con índice único → se resuelve, sin warnings', () => {
		const model = resolveContentModel({
			types: pageTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { site_page: { page: { pathField: 'path' } } }
			}
		});
		expect(model.warnings).toEqual([]);
		expect(model.types.find((t) => t.name === 'site_page')!.page).toEqual({
			pathField: 'path',
			pathFieldUnique: true,
			layoutField: null
		});
	});

	// Una VISTA se descarta ANTES de mirar la unicidad, y el orden importa: una vista tampoco puede
	// tener índices, así que llegar a esa comprobación emitiría `page-path-not-unique` y mandaría al
	// usuario a crear un índice único que en una vista no puede existir. Mismo criterio que
	// `singleton` sobre una vista, que ya existía.
	test('page sobre un tipo de SOLO LECTURA (vista) → capacidad ignorada, y avisa de la VISTA, no de la unicidad', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { settings_view: { page: { pathField: 'name' } } }
			}
		});
		expect(model.types.find((t) => t.name === 'settings_view')!.page).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'page-invalid',
				collection: 'settings_view',
				path: '/collections/settings_view/page'
			})
		]);
		// Lo que esta prueba defiende de verdad: que NO sale el aviso que confundiría.
		expect(model.warnings.some((w) => w.code === 'page-path-not-unique')).toBe(false);
	});

	test('pathField sobre un campo text SIN índice único → capacidad INTACTA + page-path-not-unique', () => {
		const model = resolveContentModel({
			types: pageTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { site_page: { page: { pathField: 'pathDuplicable' } } }
			}
		});
		expect(model.types.find((t) => t.name === 'site_page')!.page).toEqual({
			pathField: 'pathDuplicable',
			pathFieldUnique: false,
			layoutField: null
		});
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'page-path-not-unique',
				collection: 'site_page',
				field: 'pathDuplicable',
				path: '/collections/site_page/page/pathField'
			})
		]);
	});

	test('pathField ausente dentro de page → manifest-invalid-key, page null', () => {
		const model = resolveContentModel({
			types: pageTypes,
			manifestRaw: { schemaVersion: 1, collections: { site_page: { page: {} } } }
		});
		expect(model.types.find((t) => t.name === 'site_page')!.page).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'manifest-invalid-key', path: '/collections/site_page/page' })
		]);
	});

	test('pathField referenciando un campo inexistente → page-invalid, page null', () => {
		const model = resolveContentModel({
			types: pageTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { site_page: { page: { pathField: 'noExiste' } } }
			}
		});
		expect(model.types.find((t) => t.name === 'site_page')!.page).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'page-invalid',
				collection: 'site_page',
				path: '/collections/site_page/page/pathField'
			})
		]);
	});

	test('pathField referenciando un campo NO text (number) → page-invalid, page null', () => {
		const model = resolveContentModel({
			types: pageTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { site_page: { page: { pathField: 'rating' } } }
			}
		});
		expect(model.types.find((t) => t.name === 'site_page')!.page).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'page-invalid', collection: 'site_page' })
		]);
	});

	test('layoutField sobre un campo text válido → se resuelve junto a pathField, sin warnings', () => {
		const model = resolveContentModel({
			types: pageTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { site_page: { page: { pathField: 'path', layoutField: 'layout' } } }
			}
		});
		expect(model.warnings).toEqual([]);
		expect(model.types.find((t) => t.name === 'site_page')!.page).toEqual({
			pathField: 'path',
			pathFieldUnique: true,
			layoutField: 'layout'
		});
	});

	test('layoutField inválido (campo NO text) → null + page-layout-field-invalid, PERO pathField sobrevive', () => {
		const model = resolveContentModel({
			types: pageTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: { site_page: { page: { pathField: 'path', layoutField: 'rating' } } }
			}
		});
		expect(model.types.find((t) => t.name === 'site_page')!.page).toEqual({
			pathField: 'path',
			pathFieldUnique: true,
			layoutField: null
		});
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'page-layout-field-invalid',
				collection: 'site_page',
				path: '/collections/site_page/page/layoutField'
			})
		]);
	});

	test('pathField y slugField son campos DISTINTOS: slugField no deriva ni acopla pathField', () => {
		const model = resolveContentModel({
			types: pageTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					site_page: {
						slugField: 'path', // el mismo campo sirve de slug editorial...
						page: { pathField: 'path' } // ...y de ruta pública, pero son conceptos DISTINTOS
					}
				}
			}
		});
		const resolved = model.types.find((t) => t.name === 'site_page')!;
		expect(resolved.slugField).toBe('path');
		expect(resolved.page).toEqual({ pathField: 'path', pathFieldUnique: true, layoutField: null });
	});

	test('page NO duplica publicación ni SEO: statusField/social del tipo siguen siendo la fuente de verdad', () => {
		const model = resolveContentModel({
			types: pageTypes,
			manifestRaw: {
				schemaVersion: 1,
				collections: {
					site_page: {
						page: { pathField: 'path' },
						social: { titleField: 'title' }
					}
				}
			}
		});
		const resolved = model.types.find((t) => t.name === 'site_page')!;
		expect(resolved.page).toEqual({ pathField: 'path', pathFieldUnique: true, layoutField: null });
		expect(resolved.social).toEqual({
			titleField: 'title',
			descriptionField: null,
			imageField: null,
			urlTemplate: null
		});
	});

	test('determinismo (L1): mismo input → mismo output (deepEqual)', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			collections: { site_page: { page: { pathField: 'path', layoutField: 'layout' } } }
		};
		const a = resolveContentModel({ types: pageTypes, manifestRaw });
		const b = resolveContentModel({ types: pageTypes, manifestRaw });
		expect(a).toEqual(b);
	});
});

// ————— 21. layouts: vocabulario de plantillas de página (RAÍZ, tarea p1 `1dc63001`) —————

describe('21. layouts: vocabulario de plantillas de página (RAÍZ, tarea p1 "1dc63001")', () => {
	test('sin layouts en el manifiesto → [], SIN warning (opt-in)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1 }
		});
		expect(model.layouts).toEqual([]);
		expect(model.warnings).toEqual([]);
	});

	test('layouts válidos → se resuelven en ORDEN de declaración', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				layouts: {
					landing: { label: 'Landing', icon: 'layout' },
					default: { label: 'Página normal' }
				}
			},
			knownIcons: ['layout']
		});
		expect(model.warnings).toEqual([]);
		expect(model.layouts).toEqual([
			{ name: 'landing', label: 'Landing', icon: 'layout' },
			{ name: 'default', label: 'Página normal', icon: null }
		]);
	});

	test('sin icon → null; sin knownIcons, cualquier texto no vacío se acepta', () => {
		const withoutIcon = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, layouts: { default: { label: 'Página normal' } } }
		});
		expect(withoutIcon.layouts[0].icon).toBeNull();

		const noKnownIcons = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				layouts: { default: { label: 'Página normal', icon: 'cualquiera' } }
			}
		});
		expect(noKnownIcons.layouts[0].icon).toBe('cualquiera');
	});

	test('icon fuera de knownIcons → null + icon-unknown (reutilizado, con `layout` en vez de `collection`)', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				layouts: { default: { label: 'Página normal', icon: 'inexistente' } }
			},
			knownIcons: ['layout']
		});
		expect(model.layouts[0].icon).toBeNull();
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'icon-unknown',
				layout: 'default',
				path: '/layouts/default/icon'
			})
		]);
	});

	test('clave que no casa ^[a-z][a-z0-9-]*$ → se descarta + layout-invalid', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, layouts: { Landing: { label: 'Landing' } } }
		});
		expect(model.layouts).toEqual([]);
		expect(model.warnings).toEqual([
			expect.objectContaining({
				code: 'layout-invalid',
				layout: 'Landing',
				path: '/layouts/Landing'
			})
		]);
	});

	test('sin label → se descarta + layout-invalid', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, layouts: { default: { icon: 'layout' } } }
		});
		expect(model.layouts).toEqual([]);
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'layout-invalid', path: '/layouts/default' })
		]);
	});

	test('forma no-objeto → se descarta + layout-invalid', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: { schemaVersion: 1, layouts: { default: 'not-an-object' } }
		});
		expect(model.layouts).toEqual([]);
		expect(model.warnings).toEqual([
			expect.objectContaining({ code: 'layout-invalid', path: '/layouts/default' })
		]);
	});

	test('un layout inválido no tumba a los demás', () => {
		const model = resolveContentModel({
			types: kitchenSinkTypes,
			manifestRaw: {
				schemaVersion: 1,
				layouts: { Bad: { label: 'x' }, default: { label: 'Página normal' } }
			}
		});
		expect(model.layouts).toEqual([{ name: 'default', label: 'Página normal', icon: null }]);
	});

	test('determinismo (L1): mismo input → mismo output (deepEqual)', () => {
		const manifestRaw: JsonValue = {
			schemaVersion: 1,
			layouts: { default: { label: 'Página normal' }, landing: { label: 'Landing' } }
		};
		const a = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		const b = resolveContentModel({ types: kitchenSinkTypes, manifestRaw });
		expect(a).toEqual(b);
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
