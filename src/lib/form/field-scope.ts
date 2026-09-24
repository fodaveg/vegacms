/**
 * `field-scope.ts`: resuelve la costura "el id DOM de un campo (`field-ids.ts#fieldIds`) deriva
 * SOLO de `field.name`, pero `BlockEditor.svelte` monta un `FieldRow`/widget por CADA fila de
 * `RecordBlocks.svelte`/`VisualInspector.svelte` a la vez, siempre (`hidden`, nunca `{#if}` — ver
 * sus cabeceras), así que N filas con el MISMO tipo de bloque producen N nodos con el MISMO id.
 * `id` duplicado es HTML inválido: el navegador resuelve `label[for="…"]` contra el PRIMERO de
 * esos nodos, así que la etiqueta de cualquier fila que no sea la primera apunta a un input
 * OCULTO de otra fila (hallazgo p1, accesibilidad — confirmado con `document.querySelectorAll`
 * contando 3 nodos con el mismo id con el inspector visual abierto).
 *
 * Solución, MISMO patrón que `record-context.ts` (léase su cabecera primero): `BlockEditor`
 * publica un ÁMBITO por contexto de Svelte (la identidad del registro de la fila, ya estable
 * durante su vida — ver la cabecera de `BlockEditor.svelte`), y `FieldRow`/cada widget lo leen
 * para incluirlo en el id — sin ensanchar `WidgetProps` (D-P5.1 fija esa interfaz a
 * `{field,value,error,disabled,readonly,optionLabels?,onChange}`, sin ids ni "slots" extra).
 *
 * Degradado: sin `BlockEditor` ancestro (los campos de nivel superior de `RecordForm.svelte`,
 * que nunca están dentro de una fila de bloque), `getFieldScope()` devuelve `null` y `fieldIds`
 * se comporta EXACTAMENTE como antes — comportamiento histórico intacto para todo lo que no vive
 * dentro de un bloque.
 */

import { getContext, setContext } from 'svelte';

const FIELD_SCOPE_KEY = Symbol('vega-field-scope');

/** Publica `scope` para que `FieldRow`/los widgets descendientes namespacen sus ids DOM. */
export function setFieldScope(scope: string): void {
	setContext(FIELD_SCOPE_KEY, scope);
}

/** Ámbito publicado por un `BlockEditor` ancestro, o `null` fuera de uno (ver cabecera). */
export function getFieldScope(): string | null {
	return getContext<string | undefined>(FIELD_SCOPE_KEY) ?? null;
}
