/**
 * Restaurar un borrado de la papelera (`#lote-integridad`, Fase B §8·B2): dos módulos puros que
 * comparte la ruta `/papelera` con los 4 diálogos de borrado (§10.3, "los ficheros adjuntos no se
 * recuperan").
 *
 * - `hasFileValues`: `true` si el registro tiene AL MENOS un campo `file` con valor — la señal que
 *   gatea el aviso "los ficheros adjuntos no se recuperan" (§10.3) y, en la papelera, si vale la
 *   pena advertir de nuevo antes de restaurar.
 * - `buildRestoreInput`: el `RecordInput` que de verdad se manda a `port.create(type, input, {id})`
 *   al restaurar — descarta los campos `readonly` (el backend los gestiona, escribirlos viola
 *   §4.3 de `backend/types.ts`) y los campos `file` (§0.3 del contrato de Fase B, MEDIDO: PB
 *   destruye el binario al instante y recrear el registro con su id no lo resucita — conservar la
 *   `FileRef` de la revisión dejaría una referencia MUERTA, un `<img>` roto que parece un bug del
 *   CMS). Mismo criterio de "iterar `fields`, nunca las claves de `values`" que `to-record-input.ts`
 *   (P5): un campo ajeno al esquema actual (cambiado desde que se guardó la revisión) nunca llega
 *   al payload.
 * - `requiredFileFieldName` (fix de code-review, §8·B2): un campo `file` `required` NUNCA se puede
 *   restaurar (`buildRestoreInput` lo descarta SIEMPRE, arriba), así que una colección con uno de
 *   esos campos no puede recrearse completa — "Restaurar" prometería algo que `port.create` va a
 *   rechazar por validación (`RecordInput` sin un campo obligatorio). `vega_media.file` es el caso
 *   que lo hizo evidente (D-P6.1: `required: true`), pero se deriva del ESQUEMA, no es un caso
 *   especial de esa colección: cualquier tipo del usuario con un `file` obligatorio está igual de
 *   roto. `/papelera` lo usa para deshabilitar "Restaurar" con el motivo dicho, en vez de dejar
 *   que el click falle.
 */

import type { Field, FieldValue, RecordInput } from '$lib/backend/types';

/** `true` si `value` es un valor de campo `file`/`file[]` NO vacío (§10.3). */
function isNonEmptyFileValue(value: FieldValue | undefined): boolean {
	if (value === null || value === undefined) return false;
	if (Array.isArray(value)) return value.length > 0;
	return value !== '';
}

/** `true` si algún campo `type: 'file'` de `fields` tiene valor no vacío en `values` (§10.3: la
 *  línea "los ficheros adjuntos no se recuperan" de los 4 diálogos de borrado). */
export function hasFileValues(
	fields: readonly Field[],
	values: Record<string, FieldValue>
): boolean {
	return fields.some((field) => field.type === 'file' && isNonEmptyFileValue(values[field.name]));
}

/**
 * `RecordInput` para restaurar `values` (la pre-imagen de una revisión `kind:'delete'`) con
 * `port.create(type, input, { id: recordId })` — descarta `readonly` y `file` (ver cabecera).
 * `unsupported` también se omite: escribirlo violaría §4.3 igual que `readonly` (mismo criterio
 * defensivo que `to-record-input.ts`, que comprueba las dos cosas por separado "por si algún día
 * divergieran").
 */
export function buildRestoreInput(
	fields: readonly Field[],
	values: Record<string, FieldValue>
): RecordInput {
	const input: RecordInput = {};
	for (const field of fields) {
		if (field.readonly) continue;
		if (field.type === 'file' || field.type === 'unsupported') continue;
		input[field.name] = values[field.name];
	}
	return input;
}

/** Nombre del primer campo `type: 'file'` `required` de `fields`, o `null` si ninguno lo es (ver
 *  cabecera: la señal de "esta colección nunca puede restaurarse completa"). Basta con el primero
 *  para explicar el bloqueo — no es una validación exhaustiva, solo el motivo que enseña la UI. */
export function requiredFileFieldName(fields: readonly Field[]): string | null {
	const field = fields.find((f) => f.type === 'file' && f.required);
	return field?.name ?? null;
}
