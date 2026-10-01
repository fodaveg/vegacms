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
		if (result.length !== original.length) return [`${path}: cambió de longitud`];
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
			'collections.redirects'
		]);
		const collections = (manifest as JsonObject).collections as JsonObject;
		// `redirects` va DETRÁS de `blocks`, que ya estaba: en el inicial actual va antes.
		expect(Object.keys(collections)).toEqual(['pages', 'blocks', 'redirects']);
		expect(Object.keys(collections.pages as JsonObject).slice(-3)).toEqual([
			'publishAtField',
			'fieldGroups',
			'fields'
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
		expect(merged.nav).toEqual({ groups: ['Web'] });
		expect(pages.listFields).toEqual(['title']);
		expect(pages.fieldGroups).toEqual(['Meta']);
		expect((pages.fields as JsonObject).description).toEqual({ label: 'Entradilla' });
		expect((merged.blockTypes as JsonObject).hero).toEqual({
			label: 'Cabecera',
			fields: [{ name: 'title', widget: 'text' }]
		});
		expect(added).not.toContain('site');
		expect(added).not.toContain('nav');
		expect(added.some((path) => path.startsWith('blockTypes.hero'))).toBe(false);
		expect(added.some((path) => path.startsWith('collections.pages.fields.description'))).toBe(
			false
		);
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
