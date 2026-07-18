/**
 * Derivación de columnas de un listado (Parte 4, Fase 4a del contrato P4) a partir del modelo
 * ya resuelto por P2 (`ResolvedContentType`). Módulo puro: sin Svelte, sin el puerto, sin
 * `pocketbase`. No decide QUÉ campos son columnas (eso ya lo decidió P2 vía `listFields`); solo
 * empaqueta esa decisión en un descriptor consumible por el `.svelte` de 4c.
 */

import { isScalarField } from '$lib/backend/query';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';

/**
 * Descriptor de una columna del listado. El render concreto (badge de estado, enlace de
 * título, densidad, truncado…) es responsabilidad de la Fase 4c; aquí solo se agrega la
 * información que ese render necesita para decidir CÓMO pintar cada columna.
 */
export interface ColumnSpec {
	/** El `ResolvedField` completo (label, widget, schema…), no solo el nombre. */
	field: ResolvedField;
	/** `true` ⟺ `field.name === type.titleField`: la columna se pinta como enlace a la edición. */
	isTitle: boolean;
	/** `true` ⟺ `field.name === type.statusField`: la columna se pinta como insignia de estado. */
	isStatus: boolean;
	/** `true` ⟺ el campo es escalar (L-P4.3): solo las columnas escalares ofrecen ordenar. */
	sortable: boolean;
}

/**
 * Deriva las columnas del listado de `type` (L-P4.2): EXACTAMENTE `type.listFields`, en ese
 * orden — este módulo no reordena, no añade y no re-deriva nada, esa decisión ya la tomó P2.
 * El "máximo 5 columnas" de §4.10 es solo el default POR DEFECTO que aplicó P2 al calcular
 * `listFields`; si un manifiesto declara más, aquí se devuelven TODAS (no se trunca de nuevo).
 *
 * Cada nombre de `listFields` se resuelve contra `type.fields` por `.name`. Si un nombre no
 * casa con ningún `ResolvedField`, se omite defensivamente en vez de lanzar: no debería ocurrir
 * (P2 ya emite el warning `list-field-unknown` y omite ese nombre de `listFields` en origen),
 * pero si por cualquier inconsistencia llegara aquí, preferimos degradar (perder una columna)
 * antes que romper el listado entero.
 */
export function deriveColumns(type: ResolvedContentType): ColumnSpec[] {
	const byName = new Map(type.fields.map((f) => [f.name, f]));

	const columns: ColumnSpec[] = [];
	for (const name of type.listFields) {
		const field = byName.get(name);
		if (!field) continue;
		columns.push({
			field,
			isTitle: name === type.titleField,
			isStatus: name === type.statusField,
			sortable: isScalarField(field.schema)
		});
	}
	return columns;
}
