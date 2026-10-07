/** Navegación y vistas fusionadas, resueltas tras las colecciones. */
import type { Field, JsonValue } from '$lib/backend/types';
import { isReservedCollectionName } from '$lib/backend/collections';
import { allowedFilterOps, type FilterNode } from '$lib/backend/query';
import type {
	ModelWarning,
	NavGroup,
	NavItem,
	NavModel,
	ResolvedContentType,
	ResolvedMergedSource,
	ResolvedMergedView
} from './types';
import {
	humanizeLabel,
	isRepresentableField,
	orderByGroups,
	resolveMergedSourceOrderField
} from './conventions';
import {
	asJsonObject,
	readKey,
	readNonNegativeInt,
	readObjectOrWarn,
	readString,
	type JsonObject
} from './resolve-readers';
import {
	mergedSourceOrderInvalid,
	mergedSourceOrphan,
	mergedSourceTitleFieldInvalid,
	mergedViewIconUnknown,
	mergedViewInvalid,
	mergedWhereInvalid
} from './warnings';

// ————— Navegación (§4.1, §4.9, L7) —————

/**
 * Candidato a `NavItem` antes de `orderByGroups` (L7c): homogeneiza colecciones visibles y
 * vistas fusionadas para poder ordenarlas/agruparlas en UNA sola llamada — el criterio de
 * grupo/orden es el mismo para las dos (`group`/`order`, del tipo o de la vista), así que
 * ordenarlas en dos pasadas separadas dejaría siempre las colecciones antes que las vistas
 * dentro de un mismo grupo, en vez de intercalarse por su `order` real (contrato: "reutilizar
 * `orderByGroups`", no reimplementar su criterio de desempate).
 */
type NavEntry =
	| { kind: 'collection'; contentType: ResolvedContentType }
	| { kind: 'view'; view: ResolvedMergedView };

function navEntryGroup(entry: NavEntry): string | null {
	return entry.kind === 'collection' ? entry.contentType.group : entry.view.group;
}

function navEntryOrder(
	entry: NavEntry,
	navOrderByType: Map<string, number | undefined>
): number | undefined {
	return entry.kind === 'collection'
		? navOrderByType.get(entry.contentType.name)
		: entry.view.order;
}

function navEntryToItem(entry: NavEntry): NavItem {
	if (entry.kind === 'collection') {
		const { contentType } = entry;
		return {
			kind: 'collection',
			type: contentType.name,
			label: contentType.label,
			icon: contentType.icon,
			singleton: contentType.singleton,
			readonly: contentType.readonly
		};
	}
	// Una vista fusionada nunca es singleton (siempre lista, aunque tenga 0/1 filas) y siempre es
	// de solo lectura (L7a/L7c: crear/borrar es cosa del editor real de cada registro, nunca de la
	// vista) — mismo tratamiento visual que un tipo `readonly` (insignia "Solo lectura",
	// `NavItem.svelte`, sin cambios ahí).
	const { view } = entry;
	return {
		kind: 'view',
		type: view.id,
		label: view.label,
		icon: view.icon,
		singleton: false,
		readonly: true
	};
}

export function buildNav(
	resolvedTypes: readonly ResolvedContentType[],
	navOrderByType: Map<string, number | undefined>,
	declaredNavGroups: readonly string[],
	mergedViews: readonly ResolvedMergedView[]
): NavModel {
	// `permissions.list` (`#lote-shell`): una colección que las reglas del backend no dejan LISTAR a
	// esta sesión no entra en la navegación — su enlace solo llevaría a un listado que muere en un
	// 403. La ruta `/c/:type` sigue existiendo (un enlace guardado, o el registro abierto de otra
	// pestaña) y pinta su propio estado de "sin permiso": esto es no OFRECER lo imposible, no
	// esconder la existencia de la colección.
	const visibleTypes = resolvedTypes.filter((t) => !t.hidden && t.permissions.list);
	const entries: NavEntry[] = [
		...visibleTypes.map((contentType): NavEntry => ({ kind: 'collection', contentType })),
		...mergedViews.map((view): NavEntry => ({ kind: 'view', view }))
	];

	const { orderedItems, groupOrder } = orderByGroups(
		entries,
		navEntryGroup,
		(entry) => navEntryOrder(entry, navOrderByType),
		declaredNavGroups
	);

	const groups: NavGroup[] = groupOrder.map((label) => ({
		label,
		items: orderedItems.filter((entry) => navEntryGroup(entry) === label).map(navEntryToItem)
	}));

	return { groups };
}

// ————— Vistas fusionadas (mergedViews, L7a) —————

/**
 * Lee `mergedViews.<id>.sources` tolerando SOLO la forma que el schema permite a nivel de tipo
 * (array de objetos, §3): un array vacío o con algún elemento que no sea un objeto invalida la
 * clave ENTERA (mismo criterio "todo o nada" que `readFieldGroups`/`readStringArray`) — el
 * llamador la trata entonces como ausente y la vista queda sin sources, así que se descarta por
 * `merged-view-invalid`. Los problemas de CONTENIDO de cada source (colección huérfana, orderField
 * inválido, where inválido) se resuelven item a item en `resolveMergedSource`, no aquí.
 */
function readSourcesArray(raw: JsonValue): JsonObject[] | undefined {
	if (!Array.isArray(raw) || raw.length < 1) return undefined;
	const items: JsonObject[] = [];
	for (const el of raw) {
		const obj = asJsonObject(el);
		if (!obj) return undefined;
		items.push(obj);
	}
	return items;
}

/**
 * Resuelve una vista fusionada (§ mergedViews.<id>, L7a): label/icon/group/order con la MISMA
 * mecánica que `resolveContentType` (§4.8), y `sources` filtradas a las que sobreviven
 * `resolveMergedSource`. `null` si la vista se descarta entera (`merged-view-invalid`, 0 sources
 * válidas) — el llamador simplemente no la añade a `ContentModel.mergedViews`.
 */
export function resolveMergedView(
	id: string,
	viewRawValue: JsonValue,
	resolvedTypesByName: Map<string, ResolvedContentType>,
	knownIcons: readonly string[] | undefined,
	warnings: ModelWarning[]
): ResolvedMergedView | null {
	const base = `/mergedViews/${id}`;

	const viewRaw = readObjectOrWarn(
		viewRawValue,
		base,
		`La configuración de la vista fusionada "${id}" no es un objeto; se ignora.`,
		warnings
	);

	const label =
		readKey(
			viewRaw,
			'label',
			readString(1, 60),
			`${base}/label`,
			`label de la vista fusionada "${id}" no es un texto de 1 a 60 caracteres; se ignora.`,
			warnings
		) ?? humanizeLabel(id);

	const iconCandidate = readKey(
		viewRaw,
		'icon',
		readString(1, Infinity),
		`${base}/icon`,
		`icon de la vista fusionada "${id}" no es un texto no vacío; se ignora.`,
		warnings
	);
	let icon: string | null = null;
	if (iconCandidate !== undefined) {
		if (knownIcons && !knownIcons.includes(iconCandidate)) {
			warnings.push(mergedViewIconUnknown(id, iconCandidate));
		} else {
			icon = iconCandidate;
		}
	}

	const group =
		readKey(
			viewRaw,
			'group',
			readString(1, Infinity),
			`${base}/group`,
			`group de la vista fusionada "${id}" no es un texto no vacío; se ignora.`,
			warnings
		) ?? null;

	const order =
		readKey(
			viewRaw,
			'order',
			readNonNegativeInt,
			`${base}/order`,
			`order de la vista fusionada "${id}" no es un entero >= 0; se ignora.`,
			warnings
		) ?? 0;

	// `orderField` a nivel de vista es solo el DEFAULT para las sources que no declaren el suyo
	// propio (§ mergedViews doc): no se valida contra ninguna colección concreta aquí, cada
	// source lo resuelve contra SU esquema en `resolveMergedSource`.
	const viewOrderFieldRaw = readKey(
		viewRaw,
		'orderField',
		readString(1, Infinity),
		`${base}/orderField`,
		`orderField de la vista fusionada "${id}" no es un texto no vacío; se ignora.`,
		warnings
	);

	const sourcesRaw =
		readKey(
			viewRaw,
			'sources',
			readSourcesArray,
			`${base}/sources`,
			`sources de la vista fusionada "${id}" no es un array de objetos no vacío; se ignora.`,
			warnings
		) ?? [];

	const sources: ResolvedMergedSource[] = [];
	sourcesRaw.forEach((sourceRaw, index) => {
		const resolved = resolveMergedSource(
			id,
			index,
			sourceRaw,
			resolvedTypesByName,
			viewOrderFieldRaw,
			warnings
		);
		if (resolved) sources.push(resolved);
	});

	if (sources.length === 0) {
		warnings.push(mergedViewInvalid(id));
		return null;
	}

	return { id, label, icon, group, order, sources };
}

/**
 * Resuelve una source de vista fusionada (§ mergedViews.<id>.sources[index], L7a). `null` si se
 * descarta: colección inexistente/reservada (`merged-source-orphan`) o sin `orderField`
 * resoluble (`merged-source-order-invalid`) — en ambos casos el llamador simplemente la omite.
 */
function resolveMergedSource(
	viewId: string,
	index: number,
	sourceRaw: JsonObject,
	resolvedTypesByName: Map<string, ResolvedContentType>,
	viewOrderFieldRaw: string | undefined,
	warnings: ModelWarning[]
): ResolvedMergedSource | null {
	const base = `/mergedViews/${viewId}/sources/${index}`;

	const collectionName = readKey(
		sourceRaw,
		'collection',
		readString(1, Infinity),
		`${base}/collection`,
		`collection de la source ${index} de la vista fusionada "${viewId}" no es un texto no vacío; se ignora.`,
		warnings
	);
	if (collectionName === undefined) {
		warnings.push(mergedSourceOrphan(viewId, index, null, false));
		return null;
	}

	const type = resolvedTypesByName.get(collectionName);
	const reserved = isReservedCollectionName(collectionName);
	if (!type || reserved) {
		warnings.push(mergedSourceOrphan(viewId, index, collectionName, reserved));
		return null;
	}

	const sourceOrderFieldRaw = readKey(
		sourceRaw,
		'orderField',
		readString(1, Infinity),
		`${base}/orderField`,
		`orderField de la source ${index} ("${collectionName}") de la vista fusionada "${viewId}" no es un texto no vacío; se ignora.`,
		warnings
	);
	const orderField = resolveMergedSourceOrderField(
		type.schema.fields,
		sourceOrderFieldRaw,
		viewOrderFieldRaw
	);
	if (orderField === null) {
		warnings.push(
			mergedSourceOrderInvalid(
				viewId,
				index,
				collectionName,
				sourceOrderFieldRaw ?? viewOrderFieldRaw ?? null
			)
		);
		return null;
	}

	const titleFieldRaw = readKey(
		sourceRaw,
		'titleField',
		readString(1, Infinity),
		`${base}/titleField`,
		`titleField de la source ${index} ("${collectionName}") de la vista fusionada "${viewId}" no es un texto no vacío; se ignora.`,
		warnings
	);
	let titleField = type.titleField;
	if (titleFieldRaw !== undefined) {
		const field = type.schema.fields.find((f) => f.name === titleFieldRaw);
		if (field && isRepresentableField(field)) {
			titleField = titleFieldRaw;
		} else {
			warnings.push(mergedSourceTitleFieldInvalid(viewId, index, collectionName, titleFieldRaw));
		}
	}

	const label =
		readKey(
			sourceRaw,
			'label',
			readString(1, 60),
			`${base}/label`,
			`label de la source ${index} ("${collectionName}") de la vista fusionada "${viewId}" no es un texto de 1 a 60 caracteres; se ignora.`,
			warnings
		) ?? type.labelSingular;

	const whereRaw =
		readKey(
			sourceRaw,
			'where',
			asJsonObject,
			`${base}/where`,
			`where de la source ${index} ("${collectionName}") de la vista fusionada "${viewId}" no es un objeto; se ignora.`,
			warnings
		) ?? {};
	const where = resolveMergedWhere(
		viewId,
		index,
		collectionName,
		whereRaw,
		type.schema.fields,
		warnings
	);

	return { collection: collectionName, where, orderField, titleField, label };
}

/**
 * Compila `where` (§ mergedViews.<id>.sources[index].where, L7a) a un `FilterNode` de `eq`s en
 * AND — la MISMA ley que `validateQuery` (`$lib/backend/query`): cada condición exige que la prop
 * exista en `fields` y que su tipo admita `eq` (`allowedFilterOps`), para que la `Query` que
 * `buildListQuery` (L7b) construya con esto nunca pueda ser rechazada en runtime. Cada condición
 * inválida se ignora SOLA (`merged-where-invalid`); `null` si no queda ninguna válida (o `where`
 * estaba vacío/ausente) — equivale a "toda la colección", igual que `where: {}`.
 */
function resolveMergedWhere(
	viewId: string,
	index: number,
	collection: string,
	whereRaw: JsonObject,
	fields: Field[],
	warnings: ModelWarning[]
): FilterNode | null {
	const byName = new Map(fields.map((f) => [f.name, f]));
	const conds: FilterNode[] = [];

	for (const [prop, rawValue] of Object.entries(whereRaw)) {
		if (
			typeof rawValue !== 'string' &&
			typeof rawValue !== 'number' &&
			typeof rawValue !== 'boolean'
		) {
			warnings.push(mergedWhereInvalid(viewId, index, collection, prop));
			continue;
		}
		const field = byName.get(prop);
		if (!field || !allowedFilterOps(field).includes('eq')) {
			warnings.push(mergedWhereInvalid(viewId, index, collection, prop));
			continue;
		}
		conds.push({ kind: 'cond', field: prop, op: 'eq', value: rawValue });
	}

	if (conds.length === 0) return null;
	if (conds.length === 1) return conds[0];
	return { kind: 'group', combinator: 'and', nodes: conds };
}
