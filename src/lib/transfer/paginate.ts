/**
 * Iteración paginada genérica (§3 del contrato de `#lote-esquema`, ver la cabecera de
 * `export-collection.ts` para el contrato completo): "itera con `perPage: 200` hasta agotar, con
 * progreso visible y CANCELABLE". Módulo puro — recibe la función `list` en vez de un
 * `BackendPort` completo para poder testearse sin construir ninguno de los dos adaptadores (una
 * función `(query) => Promise<Page<...>>` de mentira basta).
 *
 * **Cancelación entre páginas, no a mitad de una petición en vuelo**: el puerto no expone una
 * señal de aborto (`BackendPort.list` no acepta `AbortSignal`, y añadírsela solo para esto
 * ensancharía el contrato del puerto por un caso de un único llamador). Se comprueba
 * `isCancelled()` ANTES de pedir cada página — con `MAX_PER_PAGE` páginas de hasta 200 registros,
 * la ventana entre dos comprobaciones es como mucho una petición HTTP, que es exactamente el
 * grano que el contrato pide ("una colección grande son muchas peticiones"). Cancelar deja
 * `records` con lo YA descargado (parcial); `export-collection.ts` lo descarta sin usarlo — la
 * fase 1 nunca ofrece "descargar lo parcial", pero conservarlo aquí (en vez de tirarlo en el
 * propio iterador) deja la puerta abierta a que un futuro llamador SÍ quiera lo parcial sin tener
 * que reescribir este módulo.
 */

import type { Page, VegaRecord } from '$lib/backend/types';
import type { Query } from '$lib/backend/query';
import { MAX_PER_PAGE } from '$lib/backend/query';

export interface FetchAllPagesOptions {
	/** Se llama tras CADA página resuelta con éxito: cuántos registros van descargados y el total
	 *  real de la colección/filtro (`Page.totalItems`, estable entre páginas salvo que alguien
	 *  escriba en la colección a la vez que se exporta — caso raro, sin tratamiento especial). */
	onProgress?: (fetched: number, total: number) => void;
	/** Se consulta ANTES de pedir cada página (ver cabecera); `undefined`/ausente = nunca cancela. */
	isCancelled?: () => boolean;
}

export interface FetchAllPagesResult {
	records: VegaRecord[];
	/** `true` si `isCancelled()` cortó la iteración antes de agotar todas las páginas. */
	cancelled: boolean;
}

/**
 * Trae TODAS las páginas de `list` para `baseQuery` (solo `filter`/`sort` — `page`/`perPage` los
 * fija este iterador, `MAX_PER_PAGE` en cada petición, nunca "tráelo todo" de una vez: no existe
 * esa primitiva en el puerto, §1 del contrato). Una colección vacía sigue haciendo UNA petición
 * (necesaria para saber que está vacía), igual que el resto de listados de Vega.
 */
export async function fetchAllPages(
	list: (query: Query) => Promise<Page<VegaRecord>>,
	baseQuery: Pick<Query, 'filter' | 'sort'> | undefined,
	opts: FetchAllPagesOptions = {}
): Promise<FetchAllPagesResult> {
	const records: VegaRecord[] = [];
	let page = 1;
	let totalPages: number; // se fija con la primera respuesta, ANTES de la primera lectura (abajo)

	do {
		if (opts.isCancelled?.()) return { records, cancelled: true };

		const result = await list({ ...baseQuery, page, perPage: MAX_PER_PAGE });
		records.push(...result.items);
		totalPages = result.totalPages;
		opts.onProgress?.(records.length, result.totalItems);
		page += 1;
	} while (page <= totalPages);

	return { records, cancelled: false };
}
