/**
 * Iteración por CURSOR (§3 del contrato de `#lote-esquema`, ver la cabecera de
 * `export-collection.ts` para el contrato completo; keyset por `id`, fix de code-review sobre la
 * primera entrega que paginaba por `page`/`perPage`). Módulo puro — recibe la función `list` en
 * vez de un `BackendPort` completo para poder testearse sin construir ninguno de los dos
 * adaptadores (una función `(query) => Promise<Page<...>>` de mentira basta).
 *
 * **Por qué NO offset (`page`/`perPage`)**: el caso de uso declarado del contrato es "mover lo
 * que un editor preparó en staging" — dos personas tocando el mismo contenido a la vez, no un
 * caso raro. Con offset, un borrado de un registro YA entregado en una página anterior desplaza
 * todo lo posterior una posición: el registro que estaba justo al principio de la SIGUIENTE
 * página nunca se pide, y se pierde del `.vega.json` en silencio (el usuario recibe el mismo
 * toast de éxito). Una inserción por delante del cursor produce el problema simétrico
 * (duplicado). Ninguno de los dos casos es aceptable para un traslado entre entornos: perder
 * contenido en silencio es el fallo caro que esta feature existe para evitar, no una limitación
 * documentable en "qué NO promete".
 *
 * **Keyset por `id`**: cada petición pide `id > <id del último registro de la página anterior>`
 * (`ID_PSEUDO_FIELD`, `backend/query.ts` — admitido en `filter` desde este fix), SIN pasar
 * `sort` explícito ni `page`: los dos adaptadores YA garantizan un desempate estable por `id`
 * ascendente como orden por defecto cuando no se pide `sort` (`adapters/memory/
 * query.ts#sortComparator`, `adapters/pocketbase/query.ts#compileSort`), así que "sin sort" ya
 * es "ordenado por id" — pedirlo explícito sería redundante. El final de la iteración se detecta
 * por una página CORTA (`items.length < MAX_PER_PAGE`), no por `totalPages`: bajo un filtro que
 * se estrecha en cada vuelta (el cursor), `totalPages`/`totalItems` de una página cualquiera solo
 * describen lo que QUEDA por delante del cursor, no el total original (ver `onProgress` abajo).
 * Inmune a inserciones/borrados por delante del cursor: un borrado ahí simplemente deja de
 * aparecer (correcto, ya no existe); una inserción ahí aparecerá en una vuelta futura sin
 * desplazar nada de lo ya entregado. Un registro que YA se leyó y luego se borra queda igual en
 * el fichero (snapshot al momento de leerlo) — comportamiento esperado, no un caso a tratar.
 *
 * **Consecuencia asumida (resuelve de paso el hallazgo de code-review sobre `scope: 'all'`
 * ignorando `defaultSort`/`orderField`)**: el orden de los registros en el `.vega.json` pasa a
 * ser SIEMPRE por `id`, nunca el orden de la tabla (`defaultSort`/`orderField` del tipo). Esto es
 * intencional, no una limitación: el fichero es un CONJUNTO de registros, cada uno lleva su
 * propio `orderField` dentro de `values` si lo tiene, y la Fase 2 (importar) resolverá el orden
 * de escritura por DEPENDENCIAS (orden topológico simple, ver `export-collection.ts`), nunca por
 * la posición en el fichero. Lo único que este módulo garantiza es que no falte ni se duplique
 * ningún registro — el orden de lectura es un detalle de implementación, no una promesa.
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

import type { Page, RecordId, VegaRecord } from '$lib/backend/types';
import type { FilterNode, Query } from '$lib/backend/query';
import { MAX_PER_PAGE } from '$lib/backend/query';

export interface FetchAllPagesOptions {
	/**
	 * Se llama tras CADA página resuelta con éxito: cuántos registros van descargados hasta ahora
	 * y el total FIJO capturado en la PRIMERA respuesta (`Page.totalItems` de esa primera
	 * petición, sin cursor todavía — el único momento en que ese número describe la colección/
	 * filtro completos). Las respuestas siguientes, ya acotadas por `id > cursor`, traen un
	 * `totalItems` que solo cuenta lo que QUEDA por delante del cursor — usarlo tal cual haría que
	 * el "total" del progreso se fuera achicando página a página, una barra de progreso mintiendo
	 * sobre cuánto queda. Nunca es pérdida de datos (eso lo evita el keyset en sí), pero SÍ era
	 * cosmético de la barra en el diseño anterior por offset — aquí se fija una vez y no se toca.
	 */
	onProgress?: (fetched: number, total: number) => void;
	/** Se consulta ANTES de pedir cada página (ver cabecera); `undefined`/ausente = nunca cancela. */
	isCancelled?: () => boolean;
}

export interface FetchAllPagesResult {
	records: VegaRecord[];
	/** `true` si `isCancelled()` cortó la iteración antes de agotar todas las páginas. */
	cancelled: boolean;
}

/** Combina `filter` (el scope del llamador, si lo hay) con `id > cursor` en un grupo `and`
 *  (§4.6 extendido) — `cursor === null` (primera página) devuelve `filter` tal cual, sin envolver
 *  nada de más. */
function withCursor(
	filter: FilterNode | undefined,
	cursor: RecordId | null
): FilterNode | undefined {
	if (cursor === null) return filter;
	const cursorNode: FilterNode = { kind: 'cond', field: 'id', op: 'gt', value: cursor };
	if (!filter) return cursorNode;
	return { kind: 'group', combinator: 'and', nodes: [filter, cursorNode] };
}

/**
 * Trae TODAS las páginas de `list` para `baseQuery.filter` (el scope del llamador, ver cabecera),
 * paginando por cursor de `id` — nunca `page`, `MAX_PER_PAGE` en cada petición (no existe
 * "tráelo todo" en el puerto, §1 del contrato). Una colección vacía sigue haciendo UNA petición
 * (necesaria para saber que está vacía), igual que el resto de listados de Vega.
 */
export async function fetchAllPages(
	list: (query: Query) => Promise<Page<VegaRecord>>,
	baseQuery: Pick<Query, 'filter'> | undefined,
	opts: FetchAllPagesOptions = {}
): Promise<FetchAllPagesResult> {
	const records: VegaRecord[] = [];
	let cursor: RecordId | null = null;
	let total: number | null = null; // se fija con la PRIMERA respuesta, ver `onProgress` en la cabecera

	for (;;) {
		if (opts.isCancelled?.()) return { records, cancelled: true };

		const filter = withCursor(baseQuery?.filter, cursor);
		const result = await list({ filter, perPage: MAX_PER_PAGE });
		records.push(...result.items);
		if (total === null) total = result.totalItems;
		opts.onProgress?.(records.length, total);

		if (result.items.length < MAX_PER_PAGE) break; // página corta = última (ver cabecera)
		cursor = result.items[result.items.length - 1].id;
	}

	return { records, cancelled: false };
}
