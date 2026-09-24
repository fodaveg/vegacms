/**
 * Comparación del `schemaSnapshot` guardado en el registro `vega` (L6b) con el esquema vivo
 * (audit de rendimiento del 23 sep 2026, p2). Módulo PURO: no conoce el puerto; quien lee y
 * escribe es `load.ts` (`syncSchemaSnapshot`).
 *
 * La comparación es por CONTENIDO, no por texto: el snapshot vuelve de PocketBase como JSON y nada
 * garantiza que conserve el orden de claves con el que se escribió, así que comparar
 * `JSON.stringify` de ambos lados reescribiría el snapshot sin que nada hubiera cambiado. Los
 * arrays sí conservan su orden, porque ahí el orden es dato: el de los campos es el del
 * formulario, y el de los tipos lo fija el propio `listContentTypes()` (alfabético, §4.2).
 */

/**
 * Serialización canónica de un valor JSON: claves de objeto ordenadas y `undefined` tratado como
 * lo trata `JSON.stringify` (se omite en objetos, `null` en arrays), porque así es como el valor
 * llega guardado.
 */
export function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) {
		return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
	}
	const record = value as Record<string, unknown>;
	const entries = Object.keys(record)
		.filter((key) => record[key] !== undefined)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
	return `{${entries.join(',')}}`;
}

/**
 * `true` si el snapshot guardado describe exactamente el esquema `current`. Un snapshot ausente o
 * `null` nunca coincide: hay que escribirlo.
 */
export function schemaSnapshotMatches(current: unknown, stored: unknown): boolean {
	if (stored === null || stored === undefined) return false;
	return canonicalJson(current) === canonicalJson(stored);
}
