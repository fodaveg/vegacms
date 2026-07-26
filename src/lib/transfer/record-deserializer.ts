/**
 * `TransferRecord.values` → `RecordInput` escribible en destino (Fase 2, importar; §4.3/§4.4 del
 * contrato de `#lote-esquema`, ver la cabecera de `export-collection.ts`). Inversa de
 * `record-serializer.ts#serializeRecord`, pero contra el esquema del DESTINO (no el de origen que
 * viajó implícito en el fichero) — un mismo `.vega.json` puede importarse en un backend cuyo
 * esquema haya divergido del que lo exportó, y es el esquema vivo del destino el que decide qué se
 * puede escribir.
 *
 * **Filtrado estrictamente ADITIVO al revés**: solo sobreviven los campos ESCRIBIBLES del esquema
 * vivo — ni `readonly` (incluye `created`/`updated`, §2 del formato: "el import nunca los
 * escribe") ni `unsupported` (`checkUnwritableFields`, `write-guards.ts`, RECHAZARÍA el `create`/
 * `update` entero si se colara uno solo). `import-format.ts#validateTransferDocument` ya garantiza
 * que toda clave de `values` es un campo CONOCIDO del destino antes de llegar aquí (§4.1), pero
 * este módulo no confía en esa garantía externa (`byName.get(name)` ausente se salta igual) — es
 * la única forma de que sea seguro testearlo/reusarlo aislado, sin pasar por la validación primero.
 *
 * **Campos `file`** (§4.4): cada `{ file, url }` se trae con `fetchFile` (inyectado por el
 * llamador — `import-media.ts#fetchTransferFile` en producción, un doble en tests) y se sustituye
 * por el `File` resultante. Si `fetchFile` no puede traerlo (red, CORS, 404 — o el valor era un
 * `FileRef` crudo sin `url`, caso de deriva de esquema entre origen y exportación, ver la cabecera
 * de `record-serializer.ts`), el campo se escribe VACÍO — nunca se omite la clave: un PISA es una
 * sobreescritura de verdad (el usuario ya confirmó "sí, quiero que este registro quede como el del
 * fichero", `ImportDialog.svelte`), así que un fichero que no se pudo traer también sustituye
 * —vacía— lo que hubiera en destino, no lo deja intacto por descuido.
 *
 * **"Vacío" es `null`/`[]`, NUNCA `''`, en un campo NO múltiple** (bug real, encontrado y corregido
 * contra PocketBase real — `test:pb`, no hallado por ningún unit ni e2e con `memory`, que no valida
 * esto): `FieldValue` (la forma de LECTURA, `record.values` tal como viaja en el `.vega.json`) usa
 * `''` para "sin fichero" en un campo single (`record-serializer.ts`), pero `FieldInputValue` (la
 * forma de ESCRITURA) NO — `validateFileFieldInput` (`file-guards.ts`, compartida por los dos
 * adaptadores) solo trata `input === null || input === undefined` como vacío; un `''` cae en la
 * rama `typeof input === 'string'` y se rechaza como `vega_foreign_file_ref` ("el fichero "" no
 * pertenece a este registro") — PocketBase real lo rechaza así SIEMPRE, tanto si el campo llegaba
 * ya vacío en el fichero como si el `fetch` falló. Por eso `resolveSingleFile` devuelve `null`
 * (nunca `''`) en ambos casos; el múltiple no tiene este problema (`[]` SÍ cuenta como vacío en
 * `validateFileFieldInput`). `missingFiles` (nombres de campo, no de fichero) es lo que el llamador
 * usa para el informe registro a registro (§4.4: "el informe lo dice registro a registro"). Un
 * campo `required` que llegue aquí sin poderse traer YA debió bloquearse en la vista previa
 * (`import-preview.ts`); si aun así ocurre (la red cambió entre la vista previa y la escritura), se
 * escribe vacío igual y el `create`/`update` fallará por su propio `validation_required` — ese
 * fallo tiene su cauce normal (`allSettled` en `import-collection.ts`), este módulo no necesita
 * saberlo.
 */

import type { Field, FieldValue, FileRef, RecordInput } from '$lib/backend/types';
import {
	isTransferFileValue,
	type TransferFileValue,
	type TransferRecord
} from './record-serializer';

export interface DeserializeRecordResult {
	values: RecordInput;
	/** Nombres de campo `file` cuyo binario no se pudo traer de origen (ver cabecera). */
	missingFiles: string[];
}

/** Resuelve un campo `file` NO múltiple: `{file,url}` → `File` vía `fetchFile`; cualquier otra
 *  forma no vacía (un `FileRef` crudo sin `url`, deriva de esquema) es igual de irresoluble que un
 *  fallo de red — mismo desenlace, "sin ese fichero". Vacío (`''`/`null`) viaja intacto, sin llamar
 *  a `fetchFile`. `value: null` (nunca `''`) en los dos casos "sin fichero" — ver cabecera. */
async function resolveSingleFile(
	raw: unknown,
	fetchFile: (file: TransferFileValue) => Promise<File | null>
): Promise<{ value: FileRef | File | null; missing: boolean }> {
	if (raw === '' || raw === null || raw === undefined) return { value: null, missing: false };
	if (isTransferFileValue(raw)) {
		const file = await fetchFile(raw);
		return file ? { value: file, missing: false } : { value: null, missing: true };
	}
	// FileRef crudo sin url, o cualquier otra forma inesperada: irresoluble (ver cabecera).
	return { value: null, missing: true };
}

/** Resuelve un campo `file` múltiple: cada entrada `{file,url}` se trae por separado; las que no
 *  se puedan traer simplemente no entran en el array resultante (no hay "hueco" que dejar en una
 *  lista). `missing` es `true` si CUALQUIER entrada se quedó fuera. */
async function resolveMultipleFile(
	raw: unknown,
	fetchFile: (file: TransferFileValue) => Promise<File | null>
): Promise<{ value: (FileRef | File)[]; missing: boolean }> {
	if (!Array.isArray(raw)) return { value: [], missing: false };
	const resolved: (FileRef | File)[] = [];
	let missing = false;
	for (const entry of raw) {
		if (isTransferFileValue(entry)) {
			const file = await fetchFile(entry);
			if (file) resolved.push(file);
			else missing = true;
		} else {
			missing = true; // FileRef crudo suelto en el array, o forma inesperada: igual de irresoluble
		}
	}
	return { value: resolved, missing };
}

/**
 * Deserializa `record.values` contra `fields` (el esquema VIVO de destino, ver cabecera). `fields`
 * puede ser el `schema.fields` de un `ResolvedContentType` distinto al que exportó el registro —
 * es justo el punto: solo lo que el destino declara HOY como escribible sobrevive.
 */
export async function deserializeRecord(
	record: TransferRecord,
	fields: readonly Field[],
	fetchFile: (file: TransferFileValue) => Promise<File | null>
): Promise<DeserializeRecordResult> {
	const byName = new Map(fields.map((f) => [f.name, f]));
	const values: RecordInput = {};
	const missingFiles: string[] = [];

	for (const [name, raw] of Object.entries(record.values)) {
		const field = byName.get(name);
		if (!field || field.readonly || field.type === 'unsupported') continue;

		if (field.type !== 'file') {
			values[name] = raw as FieldValue;
			continue;
		}

		if (field.multiple) {
			const { value, missing } = await resolveMultipleFile(raw, fetchFile);
			values[name] = value;
			if (missing) missingFiles.push(name);
		} else {
			const { value, missing } = await resolveSingleFile(raw, fetchFile);
			values[name] = value;
			if (missing) missingFiles.push(name);
		}
	}

	return { values, missingFiles };
}
