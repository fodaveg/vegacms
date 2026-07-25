/**
 * Motor de referencias (`#lote-integridad`, Fase A): dado un registro destino, responde "¿quién
 * apunta aquí?" agrupado por colección. Módulo puro respecto al ESQUEMA (no hardcodea ningún
 * nombre de colección/campo de negocio, todo sale de `ContentType[]` = `listContentTypes()`);
 * su única dependencia de red es la función `list` que recibe por parámetro, nunca el `BackendPort`
 * completo — así un test unitario puede pasar un `vi.fn()` sin construir un adaptador real.
 *
 * **Dos vías** (§1 del contrato), NUNCA mezcladas en la misma query:
 * - `'relation'`: colecciones con un campo `relation` cuyo `target` es la colección destino. Una
 *   relación `multiple` usa `in: [id]` (una `eq` sobre un array no tiene semántica definida en el
 *   validador de `query.ts`); una relación simple usa `eq`. Varios campos de la MISMA colección
 *   apuntando al mismo destino se combinan en un único `group` `or` — sigue siendo una sola query.
 * - `'url'`: SOLO cuando el destino es `vega_media` y se conoce el `FileRef` del asset (el picker
 *   de media COPIA el binario al campo `file` de destino, así que un asset casi nunca tiene
 *   referencias por relación — ver cabecera de `media-picker.ts`). Busca `contains <filename>`
 *   sobre los campos de la familia TEXTO de cada colección, que es `text`/`richtext`/`email`/`url`
 *   y NO solo los dos primeros: el criterio se toma prestado de `isTextLikeField`
 *   (`$lib/list/search.ts`), que ya existía para el buscador del listado y es el único sitio donde
 *   vive esa clasificación. Incluir `url` es lo que hace que se encuentre el caso para el que esta
 *   vía existe —alguien pega a mano la URL de un asset en un campo `url`, y hay un widget de
 *   primera clase para eso (`widgets/Url.svelte`)—; la primera versión de este módulo se dejó
 *   fuera ese tipo y el panel respondía "nadie le apunta" sobre un asset sí enlazado. `email` entra
 *   por coherencia con el helper y no cuesta una query extra (es una condición más del mismo `or`).
 *   `json` y `select` quedan fuera a propósito: el primero no admite ningún operador de filtro
 *   (`allowedFilterOps`) y en el segundo `contains` significa MEMBRESÍA en un array de valores
 *   fijos, no substring de texto libre.
 *
 * **Coste acotado**: como mucho UNA query por colección y por vía — nunca dos por la misma vía
 * aunque haya varios campos candidatos (se combinan con `or`). Peor caso: `2 × types.length`
 * peticiones (una por colección para cada vía), y en la práctica bastante menos, porque: (a) las
 * colecciones reservadas (`vega`/`vega_*`, incluida `vega_media` como ORIGEN) nunca se consultan;
 * (b) la vía `'url'` entera se omite si el destino no es `vega_media` o no hay `fileRef`; (c) una
 * colección sin ningún campo candidato para una vía ni siquiera genera la query de esa vía.
 *
 * **Honestidad por colección** (fallo caro que evita este lote): cada query corre de forma
 * independiente (`Promise.allSettled`); una colección que falla (`forbidden`, `network`…) queda
 * marcada `degraded` con su motivo, pero NUNCA tumba el resultado de las demás. `ReferencesReport
 * .partial` es `true` en cuanto CUALQUIER colección quedó degradada — la UI debe decirlo, nunca
 * presentar un recuento parcial como si fuera completo.
 *
 * Un acierto con `count === 0` y sin error se descarta (no aporta nada que mostrar); un fallo
 * SIEMPRE se conserva, aunque no sepamos si de verdad había 0 o más referencias ahí.
 */

import type { ContentType, Field, FileRef, RecordId, VegaRecord } from '$lib/backend/types';
import type { FilterNode } from '$lib/backend/query';
import type { BackendPort } from '$lib/backend/port';
import { isReservedCollectionName } from '$lib/backend/collections';
import { isTextLikeField } from '$lib/list/search';
import { VegaError, type VegaErrorKind } from '$lib/backend/errors';

/** Tamaño de muestra por defecto (§1 del contrato: "perPage pequeño (5)"): basta para enlazar
 *  unos pocos registros y dejar que `totalItems` cargue con el recuento real. */
const DEFAULT_SAMPLE_SIZE = 5;

export type ReferenceVia = 'relation' | 'url';

/** Coincidencia de UNA vía en UNA colección, ya resuelta con éxito. */
export interface ReferenceMatchOk {
	via: ReferenceVia;
	status: 'ok';
	/** Campo(s) de la colección origen que generaron la query (para depurar/mostrar el "por qué"). */
	fields: string[];
	/** Recuento REAL (`Page.totalItems`), nunca `sample.length` — el corte de muestra no debe
	 *  confundirse con el total. */
	count: number;
	/** Hasta `sampleSize` registros para enlazar; "y N más" cuando `count > sample.length`. */
	sample: VegaRecord[];
}

/** Coincidencia de UNA vía en UNA colección que NO se pudo comprobar (§1: "fallo por colección,
 *  nunca global"). `reason` es el `VegaErrorKind` si el fallo vino tipado, o `'unknown'` si el
 *  `list` inyectado lanzó algo que no es un `VegaError` (no debería pasar contra un puerto real,
 *  pero el motor no asume nada de quien se lo inyecta). */
export interface ReferenceMatchDegraded {
	via: ReferenceVia;
	status: 'degraded';
	fields: string[];
	reason: VegaErrorKind | 'unknown';
}

export type ReferenceMatch = ReferenceMatchOk | ReferenceMatchDegraded;

/** Todo lo encontrado (o fallado) en UNA colección origen. `matches` nunca está vacío: una
 *  colección solo aparece aquí si al menos una de sus vías produjo algo que mostrar. */
export interface CollectionReferences {
	collection: string;
	/** Copia de `ContentType.readonly` (vista `view` de PB): la UI la marca de solo lectura, no la
	 *  excluye — una vista SÍ puede referenciar el destino. */
	readonly: boolean;
	matches: ReferenceMatch[];
}

export interface ReferencesReport {
	/** Solo colecciones con algo que mostrar (ver cabecera del módulo): un 0 limpio no aparece. */
	groups: CollectionReferences[];
	/** `true` si CUALQUIER colección candidata no pudo comprobarse: el recuento total de `groups`
	 *  NO es fiable al 100%, aunque el resto de entradas sea información real. */
	partial: boolean;
}

/** El registro destino cuyas referencias se buscan. `fileRef` solo importa para la vía `'url'`
 *  (§1: "SOLO para assets de vega_media") — ausente o `null` ⇒ esa vía se omite entera. */
export interface FindReferencesTarget {
	collection: string;
	id: RecordId;
	fileRef?: FileRef | null;
}

export interface FindReferencesOptions {
	/** Tamaño de muestra por colección/vía (default `DEFAULT_SAMPLE_SIZE`). */
	sampleSize?: number;
}

/** Candidato ya resuelto: una query concreta a lanzar (colección + vía + filtro compilado). */
interface Candidate {
	collection: string;
	readonly: boolean;
	via: ReferenceVia;
	fields: string[];
	filter: FilterNode;
}

type RelationField = Extract<Field, { type: 'relation' }>;

/** `eq`/`in` según `multiple` (§1: "relación SINGLE admite eq; relación MÚLTIPLE solo in"),
 *  combinando varios campos de la misma colección con `or` — sigue siendo una sola query. */
function buildRelationFilter(fields: RelationField[], id: RecordId): FilterNode {
	const nodes: FilterNode[] = fields.map((field) =>
		field.multiple
			? { kind: 'cond', field: field.name, op: 'in', value: [id] }
			: { kind: 'cond', field: field.name, op: 'eq', value: id }
	);
	return nodes.length === 1 ? nodes[0] : { kind: 'group', combinator: 'or', nodes };
}

/** `contains <filename>` sobre cada campo texto/richtext candidato, combinados con `or`. */
function buildUrlFilter(fields: Field[], filename: FileRef): FilterNode {
	const nodes: FilterNode[] = fields.map((field) => ({
		kind: 'cond',
		field: field.name,
		op: 'contains',
		value: filename
	}));
	return nodes.length === 1 ? nodes[0] : { kind: 'group', combinator: 'or', nodes };
}

/** Recorre el esquema UNA vez y produce la lista de queries a lanzar (§1: coste acotado). Nunca
 *  incluye colecciones reservadas como origen (`vega`/`vega_*`, lo que cubre `vega_media` sin
 *  necesidad de un caso especial) ni genera una vía sin campos candidatos. */
function collectCandidates(
	types: readonly ContentType[],
	target: FindReferencesTarget
): Candidate[] {
	const candidates: Candidate[] = [];
	const wantsUrlVia = target.collection === 'vega_media' && Boolean(target.fileRef);

	for (const type of types) {
		if (isReservedCollectionName(type.name)) continue;

		const relationFields = type.fields.filter(
			(field): field is RelationField =>
				field.type === 'relation' && field.target === target.collection
		);
		if (relationFields.length > 0) {
			candidates.push({
				collection: type.name,
				readonly: type.readonly,
				via: 'relation',
				fields: relationFields.map((field) => field.name),
				filter: buildRelationFilter(relationFields, target.id)
			});
		}

		if (wantsUrlVia) {
			const textFields = type.fields.filter(isTextLikeField);
			if (textFields.length > 0) {
				candidates.push({
					collection: type.name,
					readonly: type.readonly,
					via: 'url',
					fields: textFields.map((field) => field.name),
					// `target.fileRef` garantizado por `wantsUrlVia` (`Boolean(target.fileRef)` arriba).
					filter: buildUrlFilter(textFields, target.fileRef as FileRef)
				});
			}
		}
	}

	return candidates;
}

/** `VegaErrorKind` pass-through si el fallo vino tipado; `'unknown'` en cualquier otro caso (ver
 *  cabecera de `ReferenceMatchDegraded`). */
function reasonOf(error: unknown): VegaErrorKind | 'unknown' {
	return error instanceof VegaError ? error.kind : 'unknown';
}

/**
 * Busca quién referencia `target`, derivando ambas vías del esquema en vivo (`types`). `list` es
 * `BackendPort['list']` (o un doble de test): el motor no construye ni conoce el puerto completo.
 * Nunca lanza — un fallo de red/permisos degrada la colección afectada, ver cabecera del módulo.
 */
export async function findReferences(
	types: readonly ContentType[],
	target: FindReferencesTarget,
	list: BackendPort['list'],
	opts: FindReferencesOptions = {}
): Promise<ReferencesReport> {
	const sampleSize = opts.sampleSize ?? DEFAULT_SAMPLE_SIZE;
	const candidates = collectCandidates(types, target);

	const settled = await Promise.allSettled(
		candidates.map((candidate) =>
			list(candidate.collection, { filter: candidate.filter, perPage: sampleSize })
		)
	);

	const byCollection = new Map<string, CollectionReferences>();

	settled.forEach((result, index) => {
		const candidate = candidates[index];
		const match: ReferenceMatch =
			result.status === 'fulfilled'
				? {
						via: candidate.via,
						status: 'ok',
						fields: candidate.fields,
						count: result.value.totalItems,
						sample: result.value.items
					}
				: {
						via: candidate.via,
						status: 'degraded',
						fields: candidate.fields,
						reason: reasonOf(result.reason)
					};

		// Un acierto limpio sin nada dentro no aporta información (ver cabecera): se descarta. Un
		// fallo SIEMPRE se conserva, es justo la honestidad que exige el contrato.
		if (match.status === 'ok' && match.count === 0) return;

		const existing = byCollection.get(candidate.collection);
		if (existing) {
			existing.matches.push(match);
		} else {
			byCollection.set(candidate.collection, {
				collection: candidate.collection,
				readonly: candidate.readonly,
				matches: [match]
			});
		}
	});

	const groups = [...byCollection.values()];
	const partial = groups.some((group) =>
		group.matches.some((match) => match.status === 'degraded')
	);

	return { groups, partial };
}
