/**
 * `json-field.ts` (F5-b, widget `json`, `type:'json'`): serialización/deserialización PURA y
 * best-effort del `<textarea>` que edita un `JsonValue` como texto.
 *
 * `parseJsonInput` es la mitad crítica (L11, "degradar sin crashear"): un JSON a medio escribir
 * (llave sin cerrar, coma colgando…) devuelve `{ ok: false }` y el widget NO propaga `onChange`
 * — mantiene el último valor válido conocido mientras el usuario sigue tecleando, en vez de
 * perderlo o lanzar.
 */
import type { JsonValue } from '$lib/backend/types';

/** `JsonValue` → texto pretty-printed (2 espacios), lo que pinta el `<textarea>`. */
export function stringifyJsonValue(value: JsonValue): string {
	return JSON.stringify(value, null, 2);
}

export type JsonParseResult = { ok: true; value: JsonValue } | { ok: false };

/**
 * Texto del `<textarea>` → `JsonValue`, best-effort. Una entrada en blanco (o solo espacios) se
 * trata como "vaciar el campo" (`ok: true, value: null`), no como error — coherente con que
 * `null` es el valor por defecto de un `json` sin dato (§2.1 del contrato de backend). Cualquier
 * otro texto que `JSON.parse` no acepte es `{ ok: false }`: el widget no debe propagar ese
 * intermedio como si fuese el valor real del campo.
 */
export function parseJsonInput(raw: string): JsonParseResult {
	if (raw.trim() === '') return { ok: true, value: null };
	try {
		return { ok: true, value: JSON.parse(raw) as JsonValue };
	} catch {
		return { ok: false };
	}
}
