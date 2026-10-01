/**
 * Fusión ADITIVA del manifiesto: al sembrar la base o un módulo, al manifiesto guardado se le
 * añaden las entradas que le faltan y no se le quita ni se le cambia nada de lo que ya tiene.
 * Función pura, sin puerto: la usa `site-seeding.ts` tanto en el preflight como al escribir.
 *
 * QUÉ ES «LA MISMA ENTRADA». El manifiesto se recorre solo por estos niveles, y en cada uno una
 * entrada se identifica por su CLAVE:
 *
 * | Nivel                          | Clave                          | Si ya existe                  |
 * | ------------------------------ | ------------------------------ | ----------------------------- |
 * | raíz                           | `site`, `nav`, `collections`…  | se entra en `collections` y   |
 * |                                |                                | `blockTypes`; el resto, tal cual |
 * | `collections`                  | nombre de la colección         | se entra en su configuración  |
 * | `collections.<c>`              | clave de configuración         | se entra solo en `fields`; el |
 * |                                | (`label`, `listFields`…)       | resto, tal cual               |
 * | `collections.<c>.fields`       | nombre del campo               | tal cual                      |
 * | `blockTypes`                   | nombre del tipo de bloque      | tal cual                      |
 *
 * «Tal cual» es literal: el valor guardado se conserva ENTERO aunque difiera del fragmento, y no
 * se completa por dentro. Por eso son opacos, una vez presentes: `site`, `nav`, la configuración
 * de un campo (`collections.<c>.fields.<f>`), un tipo de bloque entero (sus `fields` incluidos) y
 * TODA lista (`listFields`, `fieldGroups`, `nav.groups`, `blockTypes.<t>.fields`). Una lista es
 * una selección ordenada de quien la escribió: añadirle elementos devolvería la columna que
 * alguien quitó o duplicaría el campo que alguien renombró.
 *
 * Los niveles son los que el sembrado ha necesitado hasta hoy (una colección nueva, una clave
 * nueva en una colección existente, la etiqueta de un campo nuevo) y los que necesita un módulo
 * (colecciones y tipos de bloque nuevos). Bajar más multiplicaría los sitios donde la fusión
 * deshace una edición humana sin ganar ninguna capacidad que hoy se use.
 *
 * ORDEN. Lo existente conserva su orden; lo nuevo va al final de su nivel, en el orden del
 * fragmento.
 *
 * LÍMITE CONOCIDO: la fusión no distingue «nunca lo tuvo» de «lo borró a propósito». Una entrada
 * del fragmento que falte se añade siempre, también si alguien la quitó (ver
 * `docs/POCKETBASE-INTEGRATION.md`, «Fusión aditiva del manifiesto»). Quien no quiera una entrada
 * la neutraliza en vez de borrarla (`"hidden": true` en una colección): lo presente no se toca.
 */

import type { JsonValue } from './types';

type JsonObject = { [key: string]: JsonValue };

export interface ManifestMergeResult {
	/** Copia nueva: ni `saved` ni `fragment` se mutan ni se comparten con ella. */
	manifest: JsonValue;
	/**
	 * Rutas de las entradas añadidas, con puntos (`collections.redirects`,
	 * `collections.pages.fields.publishAt`, `blockTypes.hero`), en el orden en que se añadieron.
	 * Vacía = `manifest` es igual a `saved`.
	 */
	added: string[];
}

export function isManifestObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Nivel de la tabla de la cabecera al que corresponde una ruta, o `null` si su valor es opaco.
 * - `registry`: mapa nombre → entrada. Si falta entero, se crea y se rellena entrada a entrada.
 * - `config`: configuración de una colección. Si falta, la colección se añade entera, como UNA
 *   entrada; si existe, se le añaden las claves que falten.
 */
function mergeLevel(path: readonly string[]): 'registry' | 'config' | null {
	if (path.length === 0) return 'registry';
	if (path.length === 1) {
		return path[0] === 'collections' || path[0] === 'blockTypes' ? 'registry' : null;
	}
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
	mergeInto(manifest, fragment, [], added);
	return { manifest, added };
}

function mergeInto(
	target: JsonObject,
	fragment: JsonObject,
	path: readonly string[],
	added: string[]
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
				mergeInto(created, value, childPath, added);
			} else {
				target[key] = structuredClone(value);
				added.push(childPath.join('.'));
			}
			continue;
		}
		const existing = target[key];
		if (level !== null && isManifestObject(existing) && isManifestObject(value)) {
			mergeInto(existing, value, childPath, added);
		}
		// En cualquier otro caso gana lo guardado, entero: ver «Tal cual» en la cabecera.
	}
}
