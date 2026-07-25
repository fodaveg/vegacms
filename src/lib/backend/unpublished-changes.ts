/**
 * "¿Hay contenido editado después de la última publicación?" (lote "publicación", fase A):
 * alimenta el badge de `PublishButton.svelte`. Vía barata (§encargo): por cada `ContentType` con
 * un campo `updated` autodate legible, una `list()` ordenada `-updated` con `perPage: 1` — el
 * registro más reciente de esa colección, sin traer nada más. Nunca enumera contenido completo.
 *
 * Degradación deliberada (indicador BINARIO cuando no se puede saber, en vez de fabricar un
 * "no hay cambios" falso, P3-L3): si NINGÚN `ContentType` expone un campo así (nombre de campo no
 * es parte del contrato — es una convención de PocketBase, no un dato garantizado por §2.2),
 * `hasChanges` es `null`, no `false`. `PublishButton.svelte` trata `null` como "no lo sé, pero
 * puedes publicar igual" — nunca bloquea el botón por un dato que no tiene.
 */

import type { ContentType, Field, Page, VegaRecord } from './types';
import type { BackendPort } from './port';
import { VEGA_COLLECTION } from './collections';

export interface UnpublishedChangesResult {
	/** `true`/`false` si se pudo determinar comparando contra `lastPublishedAt`; `null` si ningún
	 *  `ContentType` elegible expone un campo `updated` legible (degradación honesta, ver cabecera). */
	hasChanges: boolean | null;
	/** ISO 8601 del cambio más reciente detectado entre TODAS las colecciones consultadas, o
	 *  `null` si no se pudo determinar ninguno (colecciones vacías, sin campo elegible, o todas
	 *  las consultas fallaron). Informativo: `PublishButton.svelte` lo usa para el tooltip. */
	latestChangeAt: string | null;
}

/** Candidato a "campo de última edición": autodate (`type: 'date'`, `readonly: true`, §6 del
 *  contrato de backend) llamado `updated` (case-insensitive) — la convención que usan las
 *  colecciones que PocketBase crea con "Edited" activado y la que documenta
 *  `docs/PROJECT-CONTRACT-v1.md`. Ningún otro nombre se asume: inventar una lista de alias
 *  (`modifiedAt`, `lastEdited`…) sin que el contrato los garantice sería peor que declarar
 *  honestamente "no lo sé" para esa colección. */
function findUpdatedFieldName(fields: Field[]): string | null {
	const field = fields.find(
		(f) => f.type === 'date' && f.readonly && f.name.toLowerCase() === 'updated'
	);
	return field?.name ?? null;
}

/** `true` si `a` es estrictamente posterior a `b` (ambos ISO 8601). Compara timestamps, no los
 *  strings crudos: dos servidores pueden formatear con precisión distinta (ms vs sin ms) y una
 *  comparación lexicográfica ingenua rompería ahí. Un valor no parseable nunca cuenta como
 *  "posterior" (degradar, no inventar un cambio pendiente que no se pudo confirmar). */
function isAfter(a: string, b: string | null): boolean {
	if (!b) return true; // sin publicación previa: cualquier contenido detectado cuenta como pendiente
	const msA = Date.parse(a);
	const msB = Date.parse(b);
	if (Number.isNaN(msA) || Number.isNaN(msB)) return false;
	return msA > msB;
}

/**
 * Calcula `UnpublishedChangesResult` para el proyecto conectado. `contentTypes` normalmente es
 * `ctx.model.types.map(t => t.schema)` (el `ContentType[]` YA resuelto por P2, sin volver a
 * introspeccionar); `lastPublishedAt` viene del último `BuildStatus` conocido.
 *
 * Excluye la colección reservada `vega` (bookkeeping del propio admin: manifiesto/snapshot):
 * editar el manifiesto desde `/settings` no es "contenido del sitio pendiente de publicar", y
 * contarlo generaría falsos positivos permanentes en cualquier proyecto que use ese flujo. El
 * resto de colecciones `vega_*` (p.ej. `vega_media`) SÍ cuentan: son contenido real que un sitio
 * estático puede consumir.
 *
 * Las colecciones de solo lectura (`ContentType.readonly`, vistas SQL de PB) se excluyen: no son
 * fuente de escritura, así que nunca "tienen cambios propios" que publicar.
 *
 * Cada colección se consulta en paralelo (`Promise.allSettled`): una que falle (permisos, blip de
 * red puntual) no tumba la detección para el resto — simplemente no aporta información, igual que
 * si no tuviera campo `updated`.
 */
export async function detectUnpublishedChanges(
	port: BackendPort,
	contentTypes: readonly ContentType[],
	lastPublishedAt: string | null
): Promise<UnpublishedChangesResult> {
	const eligible = contentTypes
		.filter((ct) => !ct.readonly && ct.name !== VEGA_COLLECTION.name)
		.map((ct) => ({ name: ct.name, field: findUpdatedFieldName(ct.fields) }))
		.filter((ct): ct is { name: string; field: string } => ct.field !== null);

	if (eligible.length === 0) return { hasChanges: null, latestChangeAt: null };

	const results = await Promise.allSettled(
		eligible.map(({ name, field }) =>
			port
				.list(name, { sort: [{ field, dir: 'desc' }], page: 1, perPage: 1 })
				.then((page: Page<VegaRecord>) => ({ field, value: page.items[0]?.values[field] }))
		)
	);

	let anySucceeded = false;
	let latestChangeAt: string | null = null;
	for (const result of results) {
		if (result.status !== 'fulfilled') continue;
		anySucceeded = true;
		const { value } = result.value;
		if (typeof value !== 'string' || !value) continue;
		if (!latestChangeAt || isAfter(value, latestChangeAt)) latestChangeAt = value;
	}

	// Todas las colecciones elegibles fallaron (permisos, red): distinto de "consultamos y estaban
	// vacías" — aquí de verdad no sabemos, así que `null`, no un `false` que fingiría certeza.
	if (!anySucceeded) return { hasChanges: null, latestChangeAt: null };

	if (!latestChangeAt) {
		// Se pudo consultar, pero ninguna colección elegible tiene NINGÚN registro todavía.
		return { hasChanges: false, latestChangeAt: null };
	}

	return { hasChanges: isAfter(latestChangeAt, lastPublishedAt), latestChangeAt };
}
