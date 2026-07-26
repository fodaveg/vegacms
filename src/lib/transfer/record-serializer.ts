/**
 * `VegaRecord` → `TransferRecord` (§2 del contrato de `#lote-esquema`, tarea `045b5595`; ver la
 * cabecera de `export-collection.ts` para el contrato completo). Reutiliza `VegaRecord.values`
 * TAL CUAL como forma base — es el mismo `Record<string, FieldValue>` que `RevisionRecord.values`
 * (`$lib/revisions/revision.ts`) ya fijó como "la forma JSON pura de un registro": este módulo
 * NO inventa una segunda forma de serializar, solo la enriquece en un único punto (los campos
 * `file`).
 *
 * **Campos `file`/`file[]`** (§2 "Ficheros"): cada `FileRef` (un nombre de fichero opaco, ver
 * `backend/types.ts`) se sustituye por `{ file, url }`, con la URL ABSOLUTA de origen
 * (`BackendPort.fileUrl`) — es lo único que permite a la fase 2 (importar) traer el binario desde
 * un entorno distinto sin depender de reconstruir la URL a mano con convenciones de un adaptador
 * concreto. El resto de campos (incluidos los de sistema `created`/`updated`, readonly) viaja
 * intacto: son solo informativos en el fichero exportado (el import de la fase 2 NUNCA los
 * escribe, PocketBase los gestiona), pero omitirlos aquí solo le quitaría contexto a quien abra
 * el JSON a mano sin ganar nada — mismo criterio "no esconder lo que no hace daño" que ya usa
 * `RevisionRecord.values`.
 *
 * **`fields` es el esquema VIVO, no el que había cuando se escribió el registro** (fix de
 * code-review): `fileFieldNames(fields)` decide qué enriquecer mirando el esquema ACTUAL. Un
 * campo que en `record.values` todavía trae un `FileRef`/`FileRef[]` pero que el esquema ya no
 * declara como `file` (se le cambió el tipo, o se borró el campo, entre que se escribió el
 * registro y que se exporta) viaja como el `FileRef` CRUDO, sin `{ file, url }` — aceptable: sin
 * saber a qué campo `file` pertenece hoy, la Fase 2 tampoco podría reimportarlo como fichero, así
 * que enriquecerlo no ganaría nada y complicaría este módulo con un caso que no tiene salida útil.
 */

import type { Field, FieldValue, RecordId, VegaRecord, FileRef } from '$lib/backend/types';

/** Un fichero exportado: el `FileRef` original (para casar con `field.multiple`/`required` al
 *  importar) más la URL absoluta de origen desde la que la fase 2 lo trae. */
export interface TransferFileValue {
	file: FileRef;
	url: string;
}

/** Valor de un campo dentro de `TransferRecord.values`: igual que `FieldValue` (la forma que ya
 *  fija `RevisionRecord.values`), salvo en los campos `file`, enriquecidos con la URL de origen
 *  (ver cabecera). */
export type TransferFieldValue = FieldValue | TransferFileValue | TransferFileValue[];

/** `true` si `value` es la forma enriquecida `{ file, url }` (y no un `FileRef` crudo, ni un
 *  array, ni un valor vacío) — exportada para que la Fase 2 (`record-deserializer.ts`,
 *  `import-collection.ts`) reconozca la MISMA forma que esta serializa, sin reimplementar el
 *  guard por su cuenta. */
export function isTransferFileValue(value: unknown): value is TransferFileValue {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { file?: unknown }).file === 'string' &&
		typeof (value as { url?: unknown }).url === 'string'
	);
}

/** Un registro exportado: id + valores (§2 del contrato). */
export interface TransferRecord {
	id: RecordId;
	values: Record<string, TransferFieldValue>;
}

/** Nombres de los campos `type: 'file'` de `fields`, para decidir qué valores enriquecer. */
function fileFieldNames(fields: readonly Field[]): Set<string> {
	return new Set(fields.filter((field) => field.type === 'file').map((field) => field.name));
}

/** Enriquece el valor CRUDO de un campo `file` (`FileRef | FileRef[] | ''`, ver
 *  `revisions/restore.ts#isNonEmptyFileValue` para la misma casuística) a su forma exportada.
 *  Un valor vacío (`''`, `[]`, `null`) viaja intacto: no hay `FileRef` que resolver a URL. */
function serializeFileValue(
	value: FieldValue,
	fieldName: string,
	fileUrl: (field: string, file: FileRef) => string
): TransferFieldValue {
	if (Array.isArray(value)) {
		return (value as FileRef[])
			.filter((ref): ref is FileRef => typeof ref === 'string' && ref !== '')
			.map((ref) => ({ file: ref, url: fileUrl(fieldName, ref) }));
	}
	if (typeof value === 'string' && value !== '') {
		return { file: value, url: fileUrl(fieldName, value) };
	}
	return value;
}

/**
 * Serializa `record` a su forma de transferencia (§2 del contrato): mismo `id`, `values`
 * enriquecido solo en los campos `file` de `fields` (ver cabecera). `fileUrl` la construye el
 * llamador (típicamente `(field, file) => port.fileUrl(record, field, file)`, ver
 * `export-collection.ts`) para que este módulo siga siendo puro (sin `BackendPort`, sin red).
 */
export function serializeRecord(
	record: VegaRecord,
	fields: readonly Field[],
	fileUrl: (field: string, file: FileRef) => string
): TransferRecord {
	const fileFields = fileFieldNames(fields);
	const values: Record<string, TransferFieldValue> = {};
	for (const [name, value] of Object.entries(record.values)) {
		values[name] = fileFields.has(name) ? serializeFileValue(value, name, fileUrl) : value;
	}
	return { id: record.id, values };
}
