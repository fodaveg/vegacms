/**
 * El clasificador de la vista previa (§4.2 del contrato de `#lote-esquema`, ver la cabecera de
 * `export-collection.ts` para el contrato completo) y el orden de escritura (§4.3). Módulo PURO:
 * recibe ya resueltos —por `import-collection.ts`, que sí toca el puerto— los tres datos que hacen
 * falta para decidir, y solo decide; ningún `fetch`, ningún `port.list`. Es lo que el §6 del
 * contrato pide testear con los tres estados: CREA/PISA/BLOQUEADO, incluida la relación colgante.
 */

import type { Field, RecordId } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import type { TransferRecord } from './record-serializer';

export type ImportEntryStatus = 'create' | 'overwrite' | 'blocked';

/** Por qué un registro queda BLOQUEADO (§4.2) — un registro puede acumular varios a la vez (p.ej.
 *  sin permiso Y con una relación colgante); la vista previa los lista todos, no solo el primero. */
export type BlockedReason =
	| { kind: 'no-create-permission' }
	| { kind: 'no-update-permission' }
	| { kind: 'dangling-relation'; field: string; targetId: RecordId }
	| { kind: 'unreachable-required-file'; field: string };

export interface ImportEntry {
	id: RecordId;
	status: ImportEntryStatus;
	/** Vacío salvo `status === 'blocked'`. */
	reasons: BlockedReason[];
}

export interface ClassifyCollectionInput {
	contentType: ResolvedContentType;
	records: readonly TransferRecord[];
	/** ids de esta colección que YA existen en destino (`import-collection.ts`, `list` en lotes,
	 *  nunca un `get` por registro — §4.2). */
	existingIds: ReadonlySet<RecordId>;
	/**
	 * `true` si `id` existe como destino válido de una relación hacia `targetType` — el llamador ya
	 * fusionó las DOS fuentes que hacen que una relación NO esté colgante (§4.2: "ni viaja en el
	 * fichero ni existe en destino" es la condición de BLOQUEO, así que esto es su negación:
	 * viaja en el fichero, O existe en destino). Este módulo no distingue cuál de las dos fue.
	 */
	relationTargetExists: (targetType: string, id: RecordId) => boolean;
	/** `true` si un campo `file` `required` con valor no vacío se pudo traer de origen
	 *  (`fetchTransferFile`, ya resuelto por el llamador) — solo se CONSULTA para campos
	 *  `required`; el resto de campos `file` nunca bloquea (§4.4). */
	requiredFileReachable: (recordId: RecordId, fieldName: string) => boolean;
}

/** `true` si `value` es un valor de campo "con algo" (no vacío) — mismo criterio para relaciones y
 *  para ficheros: `''`/`null`/`undefined`/`[]` cuentan como vacío, cualquier otra cosa no. Exportada
 *  para que `import-collection.ts` use EXACTAMENTE el mismo criterio al decidir qué campos `file`
 *  `required` merece la pena comprobar en la vista previa (§4.2/§4.4) — un solo punto de verdad de
 *  "¿esto cuenta como vacío?" entre el clasificador y quien lo alimenta. */
export function isNonEmpty(value: unknown): boolean {
	if (value === null || value === undefined || value === '') return false;
	if (Array.isArray(value)) return value.length > 0;
	return true;
}

/** ids de destino que declara un campo `relation` en `values` (§4.2) — normaliza single/multiple a
 *  la MISMA forma (array), filtrando entradas vacías. */
function relationTargetIds(values: Record<string, unknown>, fieldName: string): RecordId[] {
	const raw = values[fieldName];
	if (!isNonEmpty(raw)) return [];
	if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string' && v !== '');
	return typeof raw === 'string' ? [raw] : [];
}

/**
 * Clasifica CADA registro de `input.records` (§4.2): CREA (id nuevo), PISA (id existente, cero
 * razones de bloqueo) o BLOQUEADO (una o más `reasons`). El orden del resultado es el MISMO que
 * `input.records` — el orden de ESCRITURA (topológico) es cosa de `topologicalWriteOrder`, aparte,
 * porque la vista previa quiere pintarse en el orden del fichero (predecible para quien lo revisa),
 * no en el orden en que se escribiría.
 */
export function classifyCollectionImport(input: ClassifyCollectionInput): ImportEntry[] {
	const { contentType, records, existingIds, relationTargetExists, requiredFileReachable } = input;
	const relationFields = contentType.schema.fields.filter((f) => f.type === 'relation');
	const fileFields = contentType.schema.fields.filter((f) => f.type === 'file');

	return records.map((record) => {
		const exists = existingIds.has(record.id);
		const reasons: BlockedReason[] = [];

		if (exists ? !contentType.permissions.update : !contentType.permissions.create) {
			reasons.push(exists ? { kind: 'no-update-permission' } : { kind: 'no-create-permission' });
		}

		for (const field of relationFields) {
			for (const targetId of relationTargetIds(record.values, field.name)) {
				if (!relationTargetExists(field.target, targetId)) {
					reasons.push({ kind: 'dangling-relation', field: field.name, targetId });
				}
			}
		}

		for (const field of fileFields) {
			if (!field.required) continue;
			if (!isNonEmpty(record.values[field.name])) continue; // vacío: el `required` real lo
			// rechazará la propia escritura si aplica; no es esta clasificación la que decide eso.
			if (!requiredFileReachable(record.id, field.name)) {
				reasons.push({ kind: 'unreachable-required-file', field: field.name });
			}
		}

		return {
			id: record.id,
			status: reasons.length > 0 ? 'blocked' : exists ? 'overwrite' : 'create',
			reasons
		};
	});
}

/**
 * Divide `records` en los dos lotes del orden topológico "simple" (§4.3): los que NO tienen
 * ninguna relación saliente con valor van primero, el resto después — para que un registro que
 * apunta a otro del mismo fichero encuentre su destino ya escrito. Deliberadamente NO es un
 * topo-sort completo (sin grafo de dependencias ni detección de ciclos): con una cadena de tres
 * niveles (A → B → C, las tres en el fichero) el segundo lote no garantiza que C se escriba antes
 * que B — asumido, §4.3 lo llama "simple" a propósito. Un caso así falla en su propio `create`/
 * `update` (relación a un id que aún no existe) y se reporta como cualquier otro fallo de escritura
 * (`allSettled` en `import-collection.ts`), nunca aborta el resto.
 *
 * Devuelta como DOS arrays (no ya concatenados) para que `import-collection.ts` pueda fusionar el
 * lote 1 de VARIAS colecciones del mismo fichero antes de escribir el lote 2 de todas ellas — la
 * misma idea "simple" extendida a un documento multi-colección (p.ej. `autores` referenciados por
 * `posts`, las dos en el mismo `.vega.json`) sin necesitar un grafo cruzado entre colecciones.
 */
export function partitionByOutgoingRelations(
	records: readonly TransferRecord[],
	fields: readonly Field[]
): { withoutOutgoing: TransferRecord[]; withOutgoing: TransferRecord[] } {
	const relationFieldNames = fields.filter((f) => f.type === 'relation').map((f) => f.name);
	const withoutOutgoing: TransferRecord[] = [];
	const withOutgoing: TransferRecord[] = [];
	for (const record of records) {
		const hasOutgoing = relationFieldNames.some((name) => isNonEmpty(record.values[name]));
		(hasOutgoing ? withOutgoing : withoutOutgoing).push(record);
	}
	return { withoutOutgoing, withOutgoing };
}

/** Azúcar de `partitionByOutgoingRelations` para el caso de UNA sola colección: los dos lotes ya
 *  concatenados, el orden de escritura real cuando no hay más colecciones que fusionar. */
export function topologicalWriteOrder(
	records: readonly TransferRecord[],
	fields: readonly Field[]
): TransferRecord[] {
	const { withoutOutgoing, withOutgoing } = partitionByOutgoingRelations(records, fields);
	return [...withoutOutgoing, ...withOutgoing];
}
