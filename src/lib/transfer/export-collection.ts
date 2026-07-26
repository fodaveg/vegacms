/**
 * Exportar/importar contenido entre entornos Vega (`#lote-esquema`, tarea `045b5595`): sacar el
 * contenido de un entorno y meterlo en otro — probar en local con datos reales, o mover a
 * producción lo que un editor preparó en staging. **No** es un backup de desastre (eso lo cubre
 * el volumen de PocketBase); la UI lo dice explícitamente para que nadie se confíe.
 *
 * Este fichero orquesta la mitad que esta entrega SÍ implementa: **Fase 1, exportar**. El resto
 * de esta cabecera es el contrato completo acordado con David (incluida la Fase 2, importar, que
 * esta entrega deliberadamente NO toca) — se instala aquí íntegro porque es la única forma de que
 * quien retome la Fase 2 lo tenga a mano sin ir a buscar un documento efímero.
 *
 * ## Piezas que ya existían y en las que se apoya esta fase
 * - `create(type, data, opts?: { id })` + `capabilities.explicitRecordId` (`backend/port.ts`,
 *   `backend/types.ts`): conservar el id original al recrear un registro es lo que conserva sus
 *   relaciones. Es el PILAR de la Fase 2 (sin esta capability el import no se ofrecería, fallo
 *   cerrado) — la Fase 1 no la usa (solo lee), pero el formato del fichero (abajo) ya se diseña
 *   para que la Fase 2 pueda apoyarse en ella sin cambiar el formato.
 * - `RevisionRecord.values` (`$lib/revisions/revision.ts`) ya fijó `Record<string, FieldValue>`
 *   (= `VegaRecord.values`) como "la forma JSON pura de un registro"; `record-serializer.ts`
 *   reutiliza esa forma tal cual, ver su cabecera.
 * - `TypePermissions` de `ResolvedContentType` (`#lote-shell`): deciden qué se PUEDE exportar
 *   (`list`, esta fase) e importar (`create`/`update`, Fase 2).
 * - Paginación: `MAX_PER_PAGE = 200` (`backend/query.ts`), sin primitiva "tráelo todo" — se itera
 *   por CURSOR de `id` hasta que una página vuelve corta (`paginate.ts`, ver su cabecera: fix de
 *   code-review sobre la primera entrega, que paginaba por `page`/`perPage` y podía perder
 *   registros en silencio si alguien borraba por delante mientras el export estaba en vuelo — el
 *   caso de uso declarado, "mover lo que un editor preparó en staging", es justo dos personas a
 *   la vez). `id` es un pseudo-campo admitido en `filter` desde este fix (`ID_PSEUDO_FIELD`,
 *   `backend/query.ts`) aunque NUNCA aparece en `ContentType.fields` — ver la cabecera de
 *   `paginate.ts` para el porqué y cómo.
 *
 * ## El formato del fichero (`.vega.json`)
 * Tipos y constructor en `transfer-format.ts`/`record-serializer.ts` (no se duplican aquí). Cuatro
 * decisiones que SÍ importan para leer el formato correctamente:
 * - `values` es la forma de `VegaRecord.values`, enriquecida SOLO en los campos `file` que el
 *   ESQUEMA VIVO conoce como tales (`{ file, url }` con la URL absoluta de origen) — ver cabecera
 *   de `record-serializer.ts`. Un campo que en `values` todavía trae un `FileRef`/`FileRef[]` pero
 *   que el esquema YA NO declara como `file` (se cambió de tipo, o se borró el campo, entre que se
 *   escribió el registro y que se exporta) viaja como el `FileRef` CRUDO, sin `url` — aceptable:
 *   la Fase 2 tampoco podría reimportarlo como fichero sin saber a qué campo pertenece, así que no
 *   se pierde nada que fuera a ser útil.
 * - **El ORDEN de `records` dentro de cada colección es SIEMPRE por `id`** (consecuencia directa
 *   del cursor, ver `paginate.ts`), NUNCA el `defaultSort`/`orderField` de la tabla — el fichero es
 *   un CONJUNTO, no una vista; cada registro lleva su propio `orderField` dentro de `values` si lo
 *   tiene, y la Fase 2 resolverá el orden de ESCRITURA por dependencias (orden topológico), no por
 *   posición en el fichero. No es una limitación, es cómo se diseñó a propósito.
 * - Los campos de sistema (`created`/`updated`) viajan como INFORMATIVOS: PocketBase los gestiona
 *   y la Fase 2 nunca los escribirá; prometer que un import conserva las fechas de creación
 *   originales sería mentir (`RecordForm`/PocketBase siempre las regenera al crear).
 * - `vegaTransfer` es la versión DEL FORMATO (no de Vega): la Fase 2 rechazará cualquier valor que
 *   no reconozca, antes de tocar nada.
 *
 * ## Fase 1 — Exportar (ESTA entrega)
 * `exportCollection` (este módulo) hace lo que pide el contrato:
 * - **Alcance explícito, nunca adivinado**: `scope: 'all' | 'filtered'` lo elige la UI
 *   (`ExportDialog.svelte`) con dos opciones SIEMPRE visibles — "toda la colección" o "lo que hay
 *   bajo el filtro/búsqueda activos" (reutiliza SOLO el `.filter` que arma `buildListQuery`,
 *   `$lib/list/search.ts` — el MISMO que ya usa el listado para la búsqueda/el filtro de estado, un
 *   export "filtrado" nunca puede desincronizarse de lo que el usuario está viendo en pantalla.
 *   Deliberadamente se DESCARTA el `.sort` que también trae `buildListQuery`: el orden del export
 *   es siempre por `id`, ver "El formato del fichero" arriba).
 * - **Iteración por cursor + progreso + cancelación**: delegado en `paginate.ts#fetchAllPages` (ver
 *   su cabecera para el porqué del cursor y de "cancela ENTRE páginas, no a mitad de una
 *   petición").
 * - **Gate por `permissions.list`**: este módulo no lo comprueba él mismo (no tiene ningún permiso
 *   que mirar aparte del que ya usa `ctx.port.list`, que el backend hará cumplir igual) — la UI
 *   (`+page.svelte`) es quien decide NO OFRECER el botón "Exportar" sin `permissions.list`, mismo
 *   criterio que "Nueva"/el asa de reorder del resto del `#lote-shell`.
 * - **Descarga en el cliente**: `transfer-format.ts#buildTransferDocument` + `download.ts`, sin
 *   subir nada a ningún sitio (ver también §"Qué NO promete" abajo).
 *
 * ## Fase 2 — Importar (FUERA de esta entrega, decisiones ya tomadas para no bloquearla)
 * No se implementa nada de esto todavía; se deja anotado porque el diseño de la Fase 1 ya tuvo
 * que tomar partido en varios puntos que la condicionan:
 * - **Validación antes de escribir**: cabecera (`vegaTransfer`) reconocida, colecciones del
 *   fichero existentes en destino, campos que casan con el esquema vivo — todo lo que no casa se
 *   informa ANTES de tocar nada, nunca a mitad de un import.
 * - **Vista previa con tres estados por registro** — CREA (id nuevo en destino), PISA (id ya
 *   existe, exige confirmación aparte, nunca default silencioso) o BLOQUEADO (sin
 *   `permissions.create`/`update`, o relación colgante: apunta a un id que ni viaja en el fichero
 *   ni existe en destino — PocketBase rechazaría el `create`, así que se caza aquí, no con un
 *   error a mitad del import). "¿Existe ya?" se resuelve con `list` filtrado por id EN LOTES,
 *   nunca un `get` por registro.
 * - **Orden topológico simple** al escribir: primero los registros sin relaciones salientes, para
 *   que las relaciones internas al propio fichero resuelvan.
 * - **Sin transacción** (PocketBase no la expone al cliente): el import es parcial por
 *   naturaleza — `allSettled`, nunca "importado" si algo falló, informe final de qué entró y qué
 *   no. Ese es el invariante que hace la feature confiable.
 * - **Media**: por cada `{ file, url }`, `fetch(url)` del origen → `File` → mismo `create`/
 *   `update`. Si el origen no es alcanzable, el registro entra SIN ese fichero (el informe lo dice
 *   registro a registro) salvo que el campo sea `required` (entonces BLOQUEADO, avisado en la
 *   vista previa). Decidido con David (26 jul): referenciar + traer del origen, CERO dependencias
 *   nuevas — un `.zip` autocontenido costaría ~25-30 KB gzip de los ~53 KB de margen del
 *   presupuesto de bundle en aquella medición; queda pendiente SI aparece el caso real de importar
 *   sin acceso al origen.
 *   **Landmine futura, no bug de hoy**: `url` la construye `resolveFileUrl`/`port.fileUrl` SIN
 *   ningún token — válido mientras `capabilities.protectedFiles` sea `false` en los dos
 *   adaptadores (v1, medido — ver `backend/types.ts#Capabilities`). Si algún día deja de serlo
 *   (campo `file` `protected`), esa URL dejará de servir el binario sin autenticación y el
 *   `fetch(url)` de la Fase 2 empezará a fallar (o a devolver un 401/403) sin que nada de este
 *   fichero lo avise — habrá que revisar entonces cómo viaja el token, no antes.
 *
 * ## Qué NO promete esta feature (ninguna de las dos fases)
 * No es un backup de desastre (arriba). El import NUNCA reconstruye las fechas de creación
 * originales, NUNCA conserva la URL de un fichero re-subido (PocketBase renombra todo fichero
 * subido, landmine conocida — ver `docs/POCKETBASE-INTEGRATION.md`). El caso del `number`
 * `required` con un `0` legítimo (PocketBase lo rechaza igual que un vacío real) SÍ está
 * contemplado desde el fix de code-review de la Fase 2: la vista previa (`import-preview.ts`) lo
 * bloquea explícitamente, con su propio motivo, en vez de dejar que el registro llegue a escribirse
 * y falle a mitad — ver la cabecera de ese módulo.
 */

import type { BackendPort } from '$lib/backend/port';
import type { ResolvedContentType } from '$lib/model/types';
import type { ViewState } from '$lib/list/query-state';
import { buildListQuery } from '$lib/list/search';
import { fetchAllPages, type FetchAllPagesOptions } from './paginate';
import { serializeRecord } from './record-serializer';
import type { TransferCollection } from './transfer-format';

/** Alcance elegido en `ExportDialog.svelte` (§3 del contrato, ver cabecera): `'all'` ignora
 *  `viewState` por completo; `'filtered'` reutiliza `buildListQuery` tal cual la usa el listado. */
export type ExportScope = 'all' | 'filtered';

export interface ExportCollectionResult {
	collection: TransferCollection;
	/** `true` si la exportación se canceló a mitad (ver `paginate.ts`): `collection.records` queda
	 *  con lo YA descargado, pero el llamador (`ExportDialog.svelte`) lo descarta sin usarlo — la
	 *  Fase 1 nunca ofrece "descargar lo parcial". */
	cancelled: boolean;
}

/**
 * Exporta `type` (§3 del contrato, ver cabecera): construye el `.filter` según `scope` (el `.sort`
 * de `buildListQuery` se descarta A PROPÓSITO — el orden del export es siempre por `id`, ver
 * cabecera), pagina por cursor hasta agotar (`paginate.ts`) y serializa cada registro
 * (`record-serializer.ts`). `port` solo necesita `list`/`fileUrl` (`Pick`, no el `BackendPort`
 * completo) para que un test pueda fabricar un doble mínimo sin construir ningún adaptador real.
 */
export async function exportCollection(
	port: Pick<BackendPort, 'list' | 'fileUrl'>,
	type: ResolvedContentType,
	scope: ExportScope,
	viewState: ViewState,
	opts: FetchAllPagesOptions = {}
): Promise<ExportCollectionResult> {
	const baseQuery =
		scope === 'filtered' ? { filter: buildListQuery(type, viewState).filter } : undefined;

	const { records, cancelled } = await fetchAllPages(
		(query) => port.list(type.name, query),
		baseQuery,
		opts
	);

	const collection: TransferCollection = {
		type: type.name,
		records: records.map((record) =>
			serializeRecord(record, type.schema.fields, (field, file) =>
				port.fileUrl(record, field, file)
			)
		)
	};

	return { collection, cancelled };
}
