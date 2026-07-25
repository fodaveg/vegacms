/**
 * Etiqueta legible de un registro para `vega_revisions.label` (`#lote-integridad`, Fase B §1/§3):
 * un heurístico deliberadamente MÍNIMO, pensado para el decorador de puerto `with-revisions.ts`
 * (`session/backend.ts`, capa P3). El contrato habla de "etiqueta legible… del titleField", pero
 * `titleField` es un concepto de P2 (`ResolvedContentType.titleField`, cascada de 6 pasos con
 * override de manifiesto, `model/conventions.ts#resolveTitleField`) — y P3 NO tiene un
 * `ContentModel` resuelto a mano en el decorador (se construye una vez, perezoso, ANTES de que
 * exista ninguna sesión con esquema cargado, ver cabecera de `session/backend.ts`). Resolverlo de
 * verdad exigiría o bien importar `model/` desde `session/`/`revisions/` (rompe la capa: P2 se
 * apoya en P1, nunca al revés) o bien una llamada de red extra POR CADA escritura para traer el
 * esquema del tipo (`listContentTypes()`), que violaría el coste documentado en §5 ("1 get extra +
 * 1 create", nada más).
 *
 * Por eso este módulo usa el heurístico MÁS BARATO posible: mira si `values` trae `title`/`name`
 * (las dos convenciones más comunes, y las dos primeras del propio `resolveTitleField`) y, si no,
 * cae al id — sin tocar ni un campo del esquema. Encaja mejor de lo que parece con la letra del
 * contrato: el propio §1 dice que `label` existe "para pintar la papelera/historial SIN RESOLVER
 * NADA", y este heurístico literalmente no resuelve nada (ni esquema, ni `presentable`, ni tipo de
 * campo) — es una aproximación cosmética, nunca la fuente de verdad (el diff/restauración siempre
 * leen `values` completo, nunca `label`).
 */

import type { FieldValue, RecordId } from '$lib/backend/types';

/** Nombres de campo candidatos, en orden de preferencia — mismo orden que los dos primeros pasos
 *  de `resolveTitleField` (§4.4 de P2), sin la parte que exige esquema. */
const LABEL_FIELD_CANDIDATES = ['title', 'name'] as const;

/**
 * `values[candidato]` para el primer candidato que sea un string no vacío; si ninguno lo es,
 * `recordId` (siempre disponible, nunca vacío) — así `label` NUNCA es una cadena vacía.
 */
export function guessRecordLabel(values: Record<string, FieldValue>, recordId: RecordId): string {
	for (const name of LABEL_FIELD_CANDIDATES) {
		const raw = values[name];
		if (typeof raw === 'string' && raw.trim() !== '') return raw;
	}
	return recordId;
}
