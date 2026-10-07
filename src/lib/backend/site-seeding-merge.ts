/**
 * Fusión ADITIVA del manifiesto: al sembrar la base o un módulo, al manifiesto guardado se le
 * añaden las entradas que le faltan y no se le quita ni se le cambia nada de lo que ya tiene.
 * Función pura, sin puerto: la usa `site-seeding.ts` tanto en el preflight como al escribir.
 *
 * QUÉ ES «LA MISMA ENTRADA». El manifiesto se recorre solo por estos niveles, y en cada uno una
 * entrada se identifica por su CLAVE (o, en `nav.groups`, por su NOMBRE):
 *
 * | Nivel                          | Clave                          | Si ya existe                  |
 * | ------------------------------ | ------------------------------ | ----------------------------- |
 * | raíz                           | `site`, `nav`, `collections`…  | se entra en `collections`,    |
 * |                                |                                | `blockTypes` y `nav`; el      |
 * |                                |                                | resto, tal cual               |
 * | `nav`                          | `groups`                       | se entra solo en `groups`     |
 * | `nav.groups`                   | nombre del grupo               | tal cual; los que falten van  |
 * |                                |                                | AL FINAL de la lista          |
 * | `collections`                  | nombre de la colección         | se entra en su configuración  |
 * | `collections.<c>`              | clave de configuración         | se entra solo en `fields`; el |
 * |                                | (`label`, `listFields`…)       | resto, tal cual               |
 * | `collections.<c>.fields`       | nombre del campo               | tal cual                      |
 * | `blockTypes`                   | nombre del tipo de bloque      | tal cual                      |
 *
 * «Tal cual» es literal: el valor guardado se conserva ENTERO aunque difiera del fragmento, y no
 * se completa por dentro. Por eso son opacos, una vez presentes: `site`, la configuración de un
 * campo (`collections.<c>.fields.<f>`), un tipo de bloque entero (sus `fields` incluidos) y toda
 * lista de una colección o de un tipo de bloque (`listFields`, `fieldGroups`,
 * `blockTypes.<t>.fields`). Una lista es una selección ordenada de quien la escribió: añadirle
 * elementos devolvería la columna que alguien quitó o duplicaría el campo que alguien renombró.
 *
 * `nav.groups` ES LA EXCEPCIÓN ENTRE LAS LISTAS. Es el orden de los grupos del menú y nada más:
 * qué colección sale en qué grupo lo dice cada colección (`collections.<c>.group`), no `nav`. A
 * esa lista se le AÑADEN al final los grupos del fragmento que falten, sin mover ni quitar los que
 * hay: así un módulo añadido a un sitio en marcha deja su grupo en un sitio conocido del menú (el
 * último) en vez de donde lo ponga el orden alfabético de los grupos sin declarar. Solo se fusiona
 * si la forma es la esperada (`nav` es un objeto y `groups` una lista de textos no vacíos); con
 * cualquier otra forma `nav` se deja como está y los grupos van a `skipped`.
 *
 * LO QUE NO SE AÑADE (`skipped`). La fusión dice además qué traía el fragmento que NO ha podido
 * poner, para que quien siembra lo vea antes de escribir:
 * - `navGroup`: un grupo del menú, porque `nav` tiene una forma que no se fusiona con seguridad;
 * - `fieldGroup`: un grupo de campos de una colección que ya tiene su propia `fieldGroups`;
 * - `blockTypeField`: un campo de un tipo de bloque que ya existe (y que se conserva entero).
 * No es un error ni cambia con las pasadas: mientras lo guardado siga igual, se repite.
 *
 * Los niveles son los que el sembrado ha necesitado hasta hoy (una colección nueva, una clave
 * nueva en una colección existente, la etiqueta de un campo nuevo) y los que necesita un módulo
 * (colecciones, tipos de bloque y un grupo de menú nuevos). Bajar más multiplicaría los sitios
 * donde la fusión deshace una edición humana sin ganar ninguna capacidad que hoy se use.
 *
 * ORDEN. Lo existente conserva su orden; lo nuevo va al final de su nivel, en el orden del
 * fragmento.
 *
 * LÍMITE CONOCIDO: la fusión no distingue «nunca lo tuvo» de «lo borró a propósito». Una entrada
 * del fragmento que falte se añade siempre, también si alguien la quitó (ver
 * `docs/POCKETBASE-INTEGRATION.md`, «Fusión aditiva del manifiesto»). Quien no quiera una entrada
 * la neutraliza en vez de borrarla (`"hidden": true` en una colección o en un campo): lo presente
 * no se toca.
 */

import type { JsonValue } from './types';

type JsonObject = { [key: string]: JsonValue };

/** Qué clase de pieza del fragmento se quedó sin añadir (ver «LO QUE NO SE AÑADE» en la cabecera). */
type ManifestMergeSkipKind = 'navGroup' | 'fieldGroup' | 'blockTypeField';

export interface ManifestMergeSkipped {
	kind: ManifestMergeSkipKind;
	/** Ruta con puntos de lo que el fragmento traía (`nav.groups.Sitio`,
	 *  `collections.pages.fieldGroups.SEO`, `blockTypes.hero.fields.subtitle`). */
	path: string;
	/** La colección (`fieldGroup`) o el tipo de bloque (`blockTypeField`); `null` en `navGroup`. */
	owner: string | null;
	/** El nombre del grupo o del campo que no se añadió. */
	name: string;
}

interface ManifestMergeResult {
	/** Copia nueva: ni `saved` ni `fragment` se mutan ni se comparten con ella. */
	manifest: JsonValue;
	/**
	 * Rutas de las entradas añadidas, con puntos (`collections.redirects`,
	 * `collections.pages.fields.publishAt`, `blockTypes.hero`, `nav.groups.Sitio`), en el orden en
	 * que se añadieron. Vacía = `manifest` es igual a `saved`.
	 */
	added: string[];
	/** Lo que el fragmento traía y no se ha podido añadir. No afecta a `manifest`. */
	skipped: ManifestMergeSkipped[];
}

export function isManifestObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Nivel de la tabla de la cabecera al que corresponde una ruta, o `null` si su valor es opaco.
 * - `registry`: mapa nombre → entrada. Si falta entero, se crea y se rellena entrada a entrada.
 * - `config`: configuración de una colección, o `nav`. Si falta, se añade entera, como UNA
 *   entrada; si existe, se le añaden las claves que falten.
 * - `names`: lista de nombres (`nav.groups`). Si existe, se le añaden al final los que falten.
 */
function mergeLevel(path: readonly string[]): 'registry' | 'config' | 'names' | null {
	if (path.length === 0) return 'registry';
	if (path.length === 1) {
		if (path[0] === 'nav') return 'config';
		return path[0] === 'collections' || path[0] === 'blockTypes' ? 'registry' : null;
	}
	if (path[0] === 'nav') return path.length === 2 && path[1] === 'groups' ? 'names' : null;
	if (path[0] !== 'collections') return null;
	if (path.length === 2) return 'config';
	if (path.length === 3 && path[2] === 'fields') return 'registry';
	return null;
}

/**
 * Añade a `saved` las entradas de `fragment` que le faltan. Ver la cabecera del módulo para la
 * definición de entrada y el invariante. Idempotente: fusionar el resultado otra vez con el mismo
 * fragmento no añade nada.
 *
 * Lanza `TypeError` si alguno de los dos no es un objeto: no hay nivel al que añadir. Quien llama
 * decide antes qué hacer con un manifiesto guardado que no es un objeto.
 */
export function mergeManifestFragment(saved: JsonValue, fragment: JsonValue): ManifestMergeResult {
	if (!isManifestObject(saved) || !isManifestObject(fragment)) {
		throw new TypeError('La fusión del manifiesto necesita dos objetos JSON.');
	}
	const manifest = structuredClone(saved);
	const added: string[] = [];
	const skipped: ManifestMergeSkipped[] = [];
	mergeInto(manifest, fragment, [], added, skipped);
	return { manifest, added, skipped };
}

function mergeInto(
	target: JsonObject,
	fragment: JsonObject,
	path: readonly string[],
	added: string[],
	skipped: ManifestMergeSkipped[]
): void {
	for (const [key, value] of Object.entries(fragment)) {
		const childPath = [...path, key];
		const level = mergeLevel(childPath);
		if (!Object.hasOwn(target, key)) {
			// Un mapa de entradas ausente se rellena entrada a entrada, para que `added` nombre cada
			// colección, campo o tipo de bloque y no un `collections` genérico. El resultado es el mismo.
			if (level === 'registry' && isManifestObject(value) && Object.keys(value).length > 0) {
				const created: JsonObject = {};
				target[key] = created;
				mergeInto(created, value, childPath, added, skipped);
			} else {
				target[key] = structuredClone(value);
				added.push(childPath.join('.'));
			}
			continue;
		}
		const existing = target[key];
		if (level === 'names') {
			appendMissingNames(target, key, value, childPath, added, skipped);
		} else if (level !== null && isManifestObject(existing) && isManifestObject(value)) {
			mergeInto(existing, value, childPath, added, skipped);
		} else {
			// En cualquier otro caso gana lo guardado, entero: ver «Tal cual» en la cabecera. Solo se
			// anota lo que el fragmento traía de más.
			noteSkipped(existing, value, childPath, skipped);
		}
	}
}

/** Los nombres de una lista de textos no vacíos, o `null` si la lista no tiene esa forma. */
function readNames(value: JsonValue | undefined): string[] | null {
	if (!Array.isArray(value)) return null;
	const names: string[] = [];
	for (const item of value) {
		if (typeof item !== 'string' || item.length === 0) return null;
		names.push(item);
	}
	return names;
}

/** `nav.groups`: añade al final los grupos del fragmento que falten, o los anota como no añadidos. */
function appendMissingNames(
	target: JsonObject,
	key: string,
	fragment: JsonValue,
	path: readonly string[],
	added: string[],
	skipped: ManifestMergeSkipped[]
): void {
	const wanted = readNames(fragment);
	if (wanted === null) return; // un fragmento mal formado no aporta nada
	const current = readNames(target[key]);
	const base = path.join('.');
	if (current === null) {
		for (const name of wanted) skipped.push(navGroupSkipped(name));
		return;
	}
	const list = target[key] as JsonValue[];
	for (const name of wanted) {
		if (current.includes(name)) continue;
		list.push(name);
		current.push(name);
		added.push(`${base}.${name}`);
	}
}

function navGroupSkipped(name: string): ManifestMergeSkipped {
	return { kind: 'navGroup', path: `nav.groups.${name}`, owner: null, name };
}

/** Los `name` de una lista cuyos elementos son un texto o un objeto con `name` (`fieldGroups`,
 *  `blockTypes.<t>.fields`). Los elementos sin nombre legible se ignoran. */
function namedItems(value: JsonValue | undefined): string[] {
	if (!Array.isArray(value)) return [];
	const names: string[] = [];
	for (const item of value) {
		if (typeof item === 'string') names.push(item);
		else if (isManifestObject(item) && typeof item.name === 'string') names.push(item.name);
	}
	return names;
}

/**
 * Lo que el fragmento traía en una entrada que se conserva entera (o en un `nav` que no se puede
 * fusionar) y que por eso no llega al manifiesto. Solo los tres casos de la cabecera.
 */
function noteSkipped(
	existing: JsonValue,
	fragment: JsonValue,
	path: readonly string[],
	skipped: ManifestMergeSkipped[]
): void {
	if (path.length === 1 && path[0] === 'nav') {
		// `nav` guardado no es un objeto: no hay dónde añadir.
		const wanted = isManifestObject(fragment) ? readNames(fragment.groups) : null;
		for (const name of wanted ?? []) skipped.push(navGroupSkipped(name));
		return;
	}
	if (path.length === 3 && path[0] === 'collections' && path[2] === 'fieldGroups') {
		const present = new Set(namedItems(existing));
		for (const name of namedItems(fragment)) {
			if (present.has(name)) continue;
			skipped.push({ kind: 'fieldGroup', path: `${path.join('.')}.${name}`, owner: path[1], name });
		}
		return;
	}
	if (path.length === 2 && path[0] === 'blockTypes' && isManifestObject(fragment)) {
		const present = new Set(isManifestObject(existing) ? namedItems(existing.fields) : []);
		for (const name of namedItems(fragment.fields)) {
			if (present.has(name)) continue;
			skipped.push({
				kind: 'blockTypeField',
				path: `${path.join('.')}.fields.${name}`,
				owner: path[1],
				name
			});
		}
	}
}
