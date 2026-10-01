/**
 * Registro de «lo último que editaste» de la portada (`/`). Módulo PURO: sin Svelte, sin el puerto
 * y sin `localStorage` (eso es `recent-edits-store.ts`).
 *
 * **De dónde sale la lista (decisión de David, 1 oct 2026)**: de una lista guardada EN ESTE
 * NAVEGADOR, no del historial de revisiones (`vega_revisions` solo lo leen los superusuarios). La
 * consecuencia es deliberada y hay que tenerla presente: la lista NO sigue a la persona a otro
 * dispositivo ni a otro navegador, y se pierde si se borran los datos del sitio. Guarda lo mínimo
 * para volver a encontrar el registro (colección, id y la hora del guardado); título, estado y
 * tipo se leen del servidor al abrir la portada, así que nunca enseña un dato viejo.
 */

import type { RecordId, VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';

/** Cuántos registros recuerda la lista como mucho. */
export const RECENT_EDITS_LIMIT = 8;

/** Un guardado recordado: qué registro y cuándo terminó bien su guardado (epoch ms). */
export interface RecentEdit {
	collection: string;
	id: RecordId;
	savedAt: number;
}

/** A qué registro de la lista se apunta un guardado (ver `recentEditTarget`). */
export type RecentEditRef = Pick<RecentEdit, 'collection' | 'id'>;

/** Prefijo versionado de la clave de `localStorage` (mismo patrón que `vega.theme.v1`). */
const STORAGE_PREFIX = 'vega.recentEdits.v1';

/**
 * Clave de `localStorage` de la lista: una por instancia y por cuenta, para que dos cuentas en el
 * mismo navegador no vean lo de la otra. `instance` distingue los servidores a los que puede
 * apuntar un mismo origen (la dirección guardada en la pantalla de conexión; vacía si el admin
 * usa el servidor de su propio origen). La cuenta va por su id: el correo no se guarda.
 */
export function recentEditsStorageKey(instance: string, userId: string): string {
	return `${STORAGE_PREFIX}:${encodeURIComponent(instance)}:${encodeURIComponent(userId)}`;
}

function sameRecord(a: RecentEditRef, b: RecentEditRef): boolean {
	return a.collection === b.collection && a.id === b.id;
}

/**
 * Anota `entry` al principio de `list`: un registro que ya estaba sube arriba con la hora nueva
 * (nunca dos filas del mismo registro) y la lista se recorta a `RECENT_EDITS_LIMIT`.
 */
export function addRecentEdit(list: readonly RecentEdit[], entry: RecentEdit): RecentEdit[] {
	return [entry, ...list.filter((item) => !sameRecord(item, entry))].slice(0, RECENT_EDITS_LIMIT);
}

/** `list` sin los registros de `gone` (borrados, o que esta sesión ya no puede ver). */
export function removeRecentEdits(
	list: readonly RecentEdit[],
	gone: readonly RecentEditRef[]
): RecentEdit[] {
	return list.filter((item) => !gone.some((ref) => sameRecord(item, ref)));
}

function isRecentEdit(value: unknown): value is RecentEdit {
	if (typeof value !== 'object' || value === null) return false;
	const item = value as Record<string, unknown>;
	return (
		typeof item.collection === 'string' &&
		item.collection !== '' &&
		typeof item.id === 'string' &&
		item.id !== '' &&
		typeof item.savedAt === 'number' &&
		Number.isFinite(item.savedAt)
	);
}

/**
 * Lee lo guardado en `localStorage`. TOLERANTE: `null`, JSON roto, algo que no es una lista o
 * entradas con otra forma dan lo que se pueda salvar (o `[]`), nunca un error. Devuelve la lista
 * ya ordenada (el guardado más reciente primero), sin registros repetidos y recortada al tope,
 * aunque alguien haya tocado el valor a mano.
 */
export function parseRecentEdits(raw: string | null): RecentEdit[] {
	if (raw === null || raw === '') return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const result: RecentEdit[] = [];
	for (const item of parsed.filter(isRecentEdit).sort((a, b) => b.savedAt - a.savedAt)) {
		if (result.some((kept) => sameRecord(kept, item))) continue;
		result.push({ collection: item.collection, id: item.id, savedAt: item.savedAt });
	}
	return result.slice(0, RECENT_EDITS_LIMIT);
}

/** Lo que se escribe en `localStorage`: la lista tal cual, solo con sus tres campos. */
export function serializeRecentEdits(list: readonly RecentEdit[]): string {
	return JSON.stringify(list.map(({ collection, id, savedAt }) => ({ collection, id, savedAt })));
}

/**
 * A qué registro de la portada corresponde un guardado que acaba de terminar bien en
 * `collection`, o `null` si no es algo que la persona reconozca como «lo que edité»:
 *
 * - Un tipo visible (no oculto): ese mismo registro.
 * - La colección de bloques de un tipo visible (`blocks.collection`): el registro PADRE. Guardar
 *   un bloque es editar su página; el bloque suelto no tiene pantalla propia a la que volver.
 * - Cualquier otra cosa (colecciones `vega_*`, tipos ocultos, bloques sin padre): `null`.
 */
export function recentEditTarget(
	types: readonly ResolvedContentType[],
	collection: string,
	saved: VegaRecord
): RecentEditRef | null {
	const own = types.find((type) => type.name === collection);
	if (own && !own.hidden) return { collection, id: saved.id };
	for (const parent of types) {
		if (parent.hidden || parent.blocks?.collection !== collection) continue;
		const parentId = saved.values[parent.blocks.parentField];
		if (typeof parentId === 'string' && parentId !== '') {
			return { collection: parent.name, id: parentId };
		}
	}
	return null;
}
