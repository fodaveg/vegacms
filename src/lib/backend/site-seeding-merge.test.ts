import { describe, expect, test } from 'vitest';
import { mergeManifestFragment } from './site-seeding-merge';
import starterManifest from './site-seeding-manifest.json';
import {
	handEditedManifest,
	previousStarterManifest,
	starterManifest0ace139
} from './site-seeding-previous.fixture';
import type { JsonValue } from './types';
import { validateManifestStrict } from '$lib/model/validate';

type JsonObject = { [key: string]: JsonValue };

const BASE = starterManifest as JsonValue;

function isObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Comprobador INDEPENDIENTE de la fusión (no comparte código con ella): recorre cada ruta del
 * original y exige que en el resultado siga el mismo valor, en el mismo sitio.
 * - objeto: sus claves son un PREFIJO de las del resultado, en el mismo orden (lo nuevo, al final);
 * - lista: misma longitud y mismos elementos, uno a uno;
 * - escalar: idéntico.
 * Devuelve las rutas que no lo cumplen; vacía = todo lo original sigue igual.
 */
function brokenPaths(original: JsonValue, result: JsonValue, path = '$'): string[] {
	if (isObject(original)) {
		if (!isObject(result)) return [`${path}: era un objeto`];
		const keys = Object.keys(original);
		const broken: string[] = [];
		if (JSON.stringify(Object.keys(result).slice(0, keys.length)) !== JSON.stringify(keys)) {
			broken.push(`${path}: cambió el orden o falta una clave`);
		}
		for (const key of keys) {
			if (!Object.hasOwn(result, key)) broken.push(`${path}.${key}: falta`);
			else broken.push(...brokenPaths(original[key], result[key], `${path}.${key}`));
		}
		return broken;
	}
	if (Array.isArray(original)) {
		if (!Array.isArray(result)) return [`${path}: era una lista`];
		// `nav.groups` es la única lista a la que la fusión añade: lo original tiene que seguir
		// siendo su PREFIJO (mismos grupos, mismo orden; lo nuevo, detrás).
		const mayGrow = path === '$.nav.groups';
		if (mayGrow ? result.length < original.length : result.length !== original.length) {
			return [`${path}: cambió de longitud`];
		}
		return original.flatMap((item, index) => brokenPaths(item, result[index], `${path}[${index}]`));
	}
	return Object.is(original, result) ? [] : [`${path}: ${String(original)} → ${String(result)}`];
}

const KNOWN_MANIFESTS: Array<[string, JsonValue]> = [
	['el inicial de 1bda988', previousStarterManifest as JsonValue],
	['el inicial de 0ace139', starterManifest0ace139 as JsonValue],
	['el inicial actual', BASE],
	['el editado a mano', handEditedManifest()]
];

describe('mergeManifestFragment', () => {
	test('el comprobador de rutas detecta un valor cambiado, una clave quitada y un orden movido', () => {
		const original = { a: 1, b: { c: [1, 2] } };
		expect(brokenPaths(original, { a: 1, b: { c: [1, 2] }, z: 0 })).toEqual([]);
		expect(brokenPaths(original, { a: 2, b: { c: [1, 2] } })).toEqual(['$.a: 1 → 2']);
		expect(brokenPaths(original, { a: 1, b: {} })).not.toEqual([]);
		expect(brokenPaths(original, { a: 1, b: { c: [1, 2, 3] } })).not.toEqual([]);
		expect(brokenPaths(original, { z: 0, a: 1, b: { c: [1, 2] } })).not.toEqual([]);
		// La lista del menú puede crecer por el final, y solo por el final.
		const nav = { nav: { groups: ['A', 'B'] } };
		expect(brokenPaths(nav, { nav: { groups: ['A', 'B', 'C'] } })).toEqual([]);
		expect(brokenPaths(nav, { nav: { groups: ['C', 'A', 'B'] } })).not.toEqual([]);
		expect(brokenPaths(nav, { nav: { groups: ['A'] } })).not.toEqual([]);
	});

	test.each(KNOWN_MANIFESTS)(
		'propiedad: tras fusionar la base, todo lo de %s sigue igual',
		(_name, manifest) => {
			const before = JSON.stringify(manifest);

			const { manifest: merged } = mergeManifestFragment(manifest, BASE);

			expect(brokenPaths(manifest, merged)).toEqual([]);
			// Y la entrada no se mutó: la fusión devuelve una copia.
			expect(JSON.stringify(manifest)).toBe(before);
		}
	);

	test.each(KNOWN_MANIFESTS)('idempotencia: fusionar dos veces %s da lo mismo que una', (_n, m) => {
		const once = mergeManifestFragment(m, BASE);
		const twice = mergeManifestFragment(once.manifest, BASE);

		expect(twice.added).toEqual([]);
		// Comparación con orden de claves incluido.
		expect(JSON.stringify(twice.manifest)).toBe(JSON.stringify(once.manifest));
	});

	test.each([
		['1bda988', previousStarterManifest as JsonValue],
		['0ace139', starterManifest0ace139 as JsonValue]
	])(
		'un manifiesto inicial de %s sin editar acaba con el contenido del actual',
		(_name, manifest) => {
			const { manifest: merged } = mergeManifestFragment(manifest, BASE);

			expect(merged).toEqual(BASE);
			expect(validateManifestStrict(merged).ok).toBe(true);
		}
	);

	test('nombra cada entrada añadida y la pone al final de su nivel', () => {
		const { manifest, added } = mergeManifestFragment(previousStarterManifest as JsonValue, BASE);

		expect(added).toEqual([
			'collections.pages.publishAtField',
			'collections.pages.fieldGroups',
			'collections.pages.fields.publishAt',
			'collections.pages.fields.description',
			'collections.pages.fields.socialImage',
			'collections.pages.fields.noindex',
			'collections.pages.page',
			'collections.redirects'
		]);
		const collections = (manifest as JsonObject).collections as JsonObject;
		// `redirects` va DETRÁS de `blocks`, que ya estaba: en el inicial actual va antes.
		expect(Object.keys(collections)).toEqual(['pages', 'blocks', 'redirects']);
		expect(Object.keys(collections.pages as JsonObject).slice(-3)).toEqual([
			'fieldGroups',
			'fields',
			'page'
		]);
	});

	test('sobre un manifiesto vacío reproduce el fragmento, con su mismo orden, y nombra sus entradas', () => {
		const { manifest, added } = mergeManifestFragment({}, BASE);

		expect(JSON.stringify(manifest)).toBe(JSON.stringify(BASE));
		expect(added).toEqual([
			'schemaVersion',
			'site',
			'nav',
			'collections.pages',
			'collections.redirects',
			'collections.blocks',
			'blockTypes.hero',
			'blockTypes.richtext',
			'blockTypes.image',
			'blockTypes.gallery',
			'blockTypes.cta',
			'blockTypes.divider'
		]);
	});

	test('un manifiesto editado a mano recibe lo que falta y no pierde nada de lo suyo', () => {
		const edited = handEditedManifest();

		const { manifest, added } = mergeManifestFragment(edited, BASE);

		expect(brokenPaths(edited, manifest)).toEqual([]);
		const merged = manifest as JsonObject;
		const collections = merged.collections as JsonObject;
		const pages = collections.pages as JsonObject;
		// Lo editado gana aunque difiera de la base.
		expect((merged.site as JsonObject).name).toBe('Mi taller');
		expect(pages.label).toBe('Hojas');
		expect(pages.listFields).toEqual(['title', 'status']);
		expect(((pages.fields as JsonObject).description as JsonObject).label).toBe('Entradilla');
		expect(((merged.blockTypes as JsonObject).hero as JsonObject).label).toBe('Cabecera');
		// Lo propio sigue ahí.
		expect(collections.recetas).toEqual({ label: 'Recetas', icon: 'tag' });
		expect(((merged.blockTypes as JsonObject).receta as JsonObject).label).toBe('Receta');
		// Y recibe lo que le faltaba.
		expect(added).toContain('collections.pages.publishAtField');
		expect(added).toContain('collections.pages.fields.publishAt');
		expect(pages.publishAtField).toBe('publishAt');
		expect(validateManifestStrict(manifest).ok).toBe(true);
	});

	test('`pages.page`: se añade a un sitio que no lo declara y, si ya tiene el suyo, no se toca', () => {
		const withoutPage = previousStarterManifest as JsonValue;
		const { manifest, added } = mergeManifestFragment(withoutPage, BASE);
		expect(added).toContain('collections.pages.page');
		expect(((manifest as JsonObject).collections as JsonObject).pages).toMatchObject({
			page: { pathField: 'path' }
		});

		const own = structuredClone(withoutPage) as JsonObject;
		((own.collections as JsonObject).pages as JsonObject).page = {
			pathField: 'slug',
			layoutField: 'layout'
		};
		const merged = mergeManifestFragment(own, BASE);
		expect(merged.added).not.toContain('collections.pages.page');
		expect(((merged.manifest as JsonObject).collections as JsonObject).pages).toMatchObject({
			page: { pathField: 'slug', layoutField: 'layout' }
		});
	});

	test('DECISIÓN ABIERTA: una entrada de la base que el usuario borró a propósito VUELVE', () => {
		// La fusión no distingue «nunca lo tuvo» de «lo borró»: la entrada que falta se añade siempre.
		// Es la opción sin estado y no pierde nada (solo añade); la alternativa necesita guardar qué
		// se ofreció ya. Ver «Fusión aditiva del manifiesto» en docs/POCKETBASE-INTEGRATION.md.
		const edited = handEditedManifest();
		expect((edited as JsonObject).collections).not.toHaveProperty('redirects');

		const { manifest, added } = mergeManifestFragment(edited, BASE);

		expect(added).toContain('collections.redirects');
		expect(((manifest as JsonObject).collections as JsonObject).redirects).toEqual(
			((BASE as JsonObject).collections as JsonObject).redirects
		);
	});

	test('una entrada presente se conserva ENTERA: ni listas, ni campos, ni tipos de bloque se completan por dentro', () => {
		const saved: JsonValue = {
			site: {},
			nav: { groups: ['Web'] },
			collections: {
				pages: {
					listFields: ['title'],
					fieldGroups: ['Meta'],
					fields: { description: { label: 'Entradilla' } }
				}
			},
			blockTypes: { hero: { label: 'Cabecera', fields: [{ name: 'title', widget: 'text' }] } }
		};

		const { manifest, added } = mergeManifestFragment(saved, BASE);

		const merged = manifest as JsonObject;
		const pages = (merged.collections as JsonObject).pages as JsonObject;
		expect(merged.site).toEqual({});
		// `nav.groups` sí crece, por el final: ver los tests de «nav» más abajo.
		expect(merged.nav).toEqual({ groups: ['Web', 'Sitio'] });
		expect(pages.listFields).toEqual(['title']);
		expect(pages.fieldGroups).toEqual(['Meta']);
		expect((pages.fields as JsonObject).description).toEqual({ label: 'Entradilla' });
		expect((merged.blockTypes as JsonObject).hero).toEqual({
			label: 'Cabecera',
			fields: [{ name: 'title', widget: 'text' }]
		});
		expect(added).not.toContain('site');
		expect(added.filter((path) => path.startsWith('nav'))).toEqual(['nav.groups.Sitio']);
		expect(added.some((path) => path.startsWith('blockTypes.hero'))).toBe(false);
		expect(added.some((path) => path.startsWith('collections.pages.fields.description'))).toBe(
			false
		);
	});

	describe('nav', () => {
		const MODULE: JsonValue = {
			nav: { groups: ['Sitio', 'Blog'] },
			collections: { posts: { label: 'Entradas', group: 'Blog' } }
		};

		test.each(KNOWN_MANIFESTS)(
			'en %s añade al final el grupo que falta y deja los demás donde estaban',
			(_name, manifest) => {
				const { manifest: merged, added, skipped } = mergeManifestFragment(manifest, MODULE);

				expect(brokenPaths(manifest, merged)).toEqual([]);
				expect(((merged as JsonObject).nav as JsonObject).groups).toEqual(['Sitio', 'Blog']);
				expect(added).toEqual(['nav.groups.Blog', 'collections.posts']);
				expect(skipped).toEqual([]);
				expect(validateManifestStrict(merged).ok).toBe(true);
				// Idempotencia: la segunda pasada no añade ni repite el grupo.
				const twice = mergeManifestFragment(merged, MODULE);
				expect(twice.added).toEqual([]);
				expect(JSON.stringify(twice.manifest)).toBe(JSON.stringify(merged));
			}
		);

		test('un nav editado a mano (reordenado, con un grupo propio) conserva su orden y recibe lo que falta detrás', () => {
			const saved: JsonValue = { nav: { groups: ['Tienda', 'Sitio', 'Ajustes'] }, collections: {} };

			const { manifest, added, skipped } = mergeManifestFragment(saved, MODULE);

			expect(brokenPaths(saved, manifest)).toEqual([]);
			expect(((manifest as JsonObject).nav as JsonObject).groups).toEqual([
				'Tienda',
				'Sitio',
				'Ajustes',
				'Blog'
			]);
			expect(added).toEqual(['nav.groups.Blog', 'collections.posts']);
			expect(skipped).toEqual([]);
			expect(mergeManifestFragment(manifest, MODULE).added).toEqual([]);
		});

		test('un nav sin `groups` recibe la lista entera, como una entrada', () => {
			const { manifest, added } = mergeManifestFragment({ nav: {} }, MODULE);

			expect((manifest as JsonObject).nav).toEqual({ groups: ['Sitio', 'Blog'] });
			expect(added).toContain('nav.groups');
		});

		test.each([
			['nav no es un objeto', { nav: 'lateral' }],
			['groups no es una lista', { nav: { groups: 'Sitio' } }],
			['groups tiene algo que no es un texto', { nav: { groups: ['Sitio', 3] } }],
			['groups tiene un texto vacío', { nav: { groups: ['Sitio', ''] } }]
		])('%s: no se toca, y los grupos del fragmento quedan en `skipped`', (_name, saved) => {
			const before = JSON.stringify(saved);

			const { manifest, added, skipped } = mergeManifestFragment(saved as JsonValue, MODULE);

			expect(JSON.stringify((manifest as JsonObject).nav)).toBe(
				JSON.stringify((saved as JsonObject).nav)
			);
			expect(JSON.stringify(saved)).toBe(before);
			expect(added.filter((path) => path.startsWith('nav'))).toEqual([]);
			expect(skipped).toEqual([
				{ kind: 'navGroup', path: 'nav.groups.Sitio', owner: null, name: 'Sitio' },
				{ kind: 'navGroup', path: 'nav.groups.Blog', owner: null, name: 'Blog' }
			]);
			// La colección sí se añade: el menú la pinta por su propio `group`.
			expect(added).toContain('collections.posts');
		});
	});

	describe('skipped: lo que el fragmento traía y no se añade', () => {
		test.each(KNOWN_MANIFESTS)('fusionar la base sobre %s no deja nada sin añadir', (_n, m) => {
			expect(mergeManifestFragment(m, BASE).skipped).toEqual([]);
		});

		test('una colección con `fieldGroups` propios no recibe el grupo nuevo, y se dice cuál', () => {
			const saved: JsonValue = {
				collections: { pages: { fieldGroups: ['Meta', { name: 'Portada', placement: 'aside' }] } }
			};

			const { manifest, skipped } = mergeManifestFragment(saved, BASE);

			expect(((manifest as JsonObject).collections as JsonObject).pages).toMatchObject({
				fieldGroups: ['Meta', { name: 'Portada', placement: 'aside' }]
			});
			expect(skipped).toEqual([
				{
					kind: 'fieldGroup',
					path: 'collections.pages.fieldGroups.SEO',
					owner: 'pages',
					name: 'SEO'
				}
			]);
		});

		test('un grupo de campos ya presente (como texto o como objeto) no cuenta como no añadido', () => {
			const saved: JsonValue = { collections: { pages: { fieldGroups: ['SEO', 'Meta'] } } };

			expect(mergeManifestFragment(saved, BASE).skipped).toEqual([]);
		});

		test('un tipo de bloque que ya existe no recibe los campos nuevos, y se dice cuáles', () => {
			const saved: JsonValue = {
				blockTypes: {
					hero: {
						label: 'Cabecera',
						fields: [
							{ name: 'title', label: 'Título', widget: 'text' },
							{ name: 'image', label: 'Imagen', widget: 'relation', source: 'record' }
						]
					}
				}
			};

			const { manifest, skipped } = mergeManifestFragment(saved, BASE);

			expect(((manifest as JsonObject).blockTypes as JsonObject).hero).toEqual(
				(saved as { blockTypes: JsonObject }).blockTypes.hero
			);
			expect(skipped.map((item) => item.path)).toEqual([
				'blockTypes.hero.fields.eyebrow',
				'blockTypes.hero.fields.body',
				'blockTypes.hero.fields.actionLabel',
				'blockTypes.hero.fields.actionHref'
			]);
			expect(skipped[0]).toEqual({
				kind: 'blockTypeField',
				path: 'blockTypes.hero.fields.eyebrow',
				owner: 'hero',
				name: 'eyebrow'
			});
		});

		test('se repite en cada pasada mientras lo guardado siga igual: no es un error, es un aviso', () => {
			const saved: JsonValue = { collections: { pages: { fieldGroups: ['Meta'] } } };
			const once = mergeManifestFragment(saved, BASE);

			const twice = mergeManifestFragment(once.manifest, BASE);

			expect(once.skipped).toHaveLength(1);
			expect(twice.added).toEqual([]);
			expect(twice.skipped).toEqual(once.skipped);
		});
	});

	test('si lo guardado y el fragmento no son del mismo tipo, gana lo guardado', () => {
		const saved: JsonValue = { collections: 'no es un mapa', blockTypes: { hero: null } };

		const { manifest } = mergeManifestFragment(saved, BASE);

		expect((manifest as JsonObject).collections).toBe('no es un mapa');
		expect(((manifest as JsonObject).blockTypes as JsonObject).hero).toBeNull();
	});

	test('el fragmento de un módulo se suma al de la base sin tocarla', () => {
		const module: JsonValue = {
			collections: { posts: { label: 'Entradas' }, pages: { label: 'OTRA' } },
			blockTypes: { postList: { label: 'Lista de entradas', fields: [] } }
		};

		const { manifest, added } = mergeManifestFragment(BASE, module);

		expect(added).toEqual(['collections.posts', 'blockTypes.postList']);
		expect(brokenPaths(BASE, manifest)).toEqual([]);
		expect(Object.keys((manifest as JsonObject).collections as JsonObject)).toEqual([
			'pages',
			'redirects',
			'blocks',
			'posts'
		]);
	});

	test('lo añadido es una copia: editar el resultado no toca el fragmento', () => {
		const fragment: JsonValue = { collections: { posts: { listFields: ['title'] } } };

		const { manifest } = mergeManifestFragment({}, fragment);
		(
			(((manifest as JsonObject).collections as JsonObject).posts as JsonObject)
				.listFields as string[]
		).push('x');

		expect(fragment).toEqual({ collections: { posts: { listFields: ['title'] } } });
	});

	test.each([[null], ['texto'], [[1, 2]], [3]])(
		'un manifiesto que no es un objeto (%j) lanza',
		(value) => {
			expect(() => mergeManifestFragment(value as JsonValue, BASE)).toThrow(TypeError);
			expect(() => mergeManifestFragment({}, value as JsonValue)).toThrow(TypeError);
		}
	);
});
