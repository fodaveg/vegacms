/**
 * Versión de un registro para la escritura con versión esperada (`BackendPort.update`,
 * `UpdateOptions.expectedVersion`): quien abre un formulario la calcula sobre el registro que
 * leyó, y el adaptador la vuelve a calcular sobre el registro que relee en fresco justo antes de
 * escribir. Si no coinciden, alguien guardó entre medias y `update` falla cerrado con
 * `VegaConflictError` (`errors.ts`) en vez de pisarle.
 *
 * **Por qué una huella de los VALORES y no el `updated` a secas** (medido contra PocketBase 0.39.6
 * el 24 sep 2026, no supuesto): una colección creada por API —`POST /api/collections`, que es lo
 * que hace `ensureCollections`— nace SOLO con `id` y los campos que se declaran; PocketBase no le
 * añade `created`/`updated` (eso lo hace el formulario del panel de administración, no la API).
 * Así nacen `pages` y `blocks` del sembrado de sitio (`site-seeding.ts`), justo las colecciones
 * que edita el editor visual: una versión que fuera solo `updated` no protegería nada allí. La
 * huella cubre TODOS los valores del registro, y el `updated` de una colección que sí lo tiene es
 * uno de ellos: si `updated` cambió, la versión cambió. Dos consecuencias asumidas:
 *   - volver a un valor idéntico (A→B→A) no cuenta como cambio: no hay nada que se pierda;
 *   - la versión SOLO vale sobre un registro COMPLETO. Una lectura proyectada (`Query.fields`)
 *     da otra huella y provocaría un conflicto falso: se calcula siempre sobre lo que devuelven
 *     `get`, `list` sin proyección o el propio `update`.
 *
 * Módulo puro, sin dependencias: lo usan los dos adaptadores (misma función ⇒ misma huella en
 * cliente y en adaptador) y la interfaz. La huella es opaca para quien la recibe: se guarda y se
 * compara, nunca se interpreta.
 */

import type { VegaRecord } from './types';

/** Versión opaca de un registro (ver cabecera). */
export type RecordVersion = string;

/**
 * Serialización CANÓNICA: claves de objeto ordenadas en cada nivel (el orden de claves de un
 * `json` no es dato de dominio, mismo criterio que `revisions/diff.ts#valuesEqual`) y arrays en
 * su orden (reordenar una relación o un select múltiple sí es un cambio).
 */
function canonical(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		// `undefined` no es un `FieldValue` válido, pero si se colara no debe romper el cálculo.
		return value === undefined ? 'null' : JSON.stringify(value);
	}
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(obj[key])}`).join(',')}}`;
}

/**
 * cyrb53: hash no criptográfico de 53 bits (dominio público, bryc). Basta para distinguir dos
 * versiones del MISMO registro; no protege contra nadie que fabrique colisiones a propósito, que
 * no es el modelo de amenaza (quien puede escribir el registro no necesita engañar a esta
 * comprobación: le basta con no pasar versión).
 */
function cyrb53(text: string): string {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Versión de `record` (ver cabecera): huella de sus valores completos, incluido `updated`. */
export function recordVersion(record: Pick<VegaRecord, 'values'>): RecordVersion {
	return cyrb53(canonical(record.values));
}
