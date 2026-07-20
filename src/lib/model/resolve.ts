/**
 * El resolutor de P2 (§2, §4, §5, §7 del contrato): fusiona esquema descubierto (P1) +
 * manifiesto (lectura TOLERANTE clave a clave) + convenciones + defaults → `ContentModel`.
 *
 * PURA y DETERMINISTA (L1): sin red, reloj ni azar; misma entrada ⇒ salida `deepEqual`, orden
 * incluido. El orden de las claves del propio `manifestRaw` NUNCA determina el resultado:
 * las claves conocidas se leen por acceso directo (`obj[nombreDeEsquema]`, nunca iterando
 * `Object.keys` del manifiesto) y las únicas listas que sí derivan de iterar claves del
 * manifiesto (huérfanas) se ordenan alfabéticamente antes de emitir warnings.
 *
 * NUNCA LANZA por contenido (L3): cualquier `manifestRaw` corrupto, hostil o de versión
 * futura degrada a warning + default. El JSON se trata como DATOS puros: solo se LEE
 * (`obj[key]`), nunca se escribe con una clave dinámica sobre un objeto real, así que no hay
 * vector de contaminación de prototipo aunque `manifestRaw` contenga una clave `__proto__`
 * (JSON.parse la deja como propiedad propia normal, nunca toca la cadena de prototipos al
 * leerla) — §8.12.
 *
 * `vega`/`vega_*` SIEMPRE `hidden: true` y fuera de `nav`, no anulable (L7, reutiliza
 * `isReservedCollectionName` de P1 en vez de reinventar el prefijo).
 */

import type { ContentType, Field, JsonValue } from '$lib/backend/types';
import { allowedFilterOps, type FilterNode } from '$lib/backend/query';
import { isReservedCollectionName } from '$lib/backend/collections';
import type {
	ContentModel,
	ManifestState,
	ModelWarning,
	NavGroup,
	NavItem,
	NavModel,
	ResolvedContentType,
	ResolvedField,
	ResolvedFieldGroup,
	ResolvedMergedSource,
	ResolvedMergedView,
	ResolvedSite
} from './types';
import {
	defaultListable,
	humanizeLabel,
	isRepresentableField,
	orderByGroups,
	resolveMergedSourceOrderField,
	resolveOrderField,
	resolveStatusField,
	resolveTitleField,
	resolveWidget
} from './conventions';
import {
	iconUnknown,
	listFieldUnknown,
	manifestInvalidKey,
	manifestUnreadable,
	manifestVersionNewer,
	mergedSourceOrderInvalid,
	mergedSourceOrphan,
	mergedSourceTitleFieldInvalid,
	mergedViewIconUnknown,
	mergedViewInvalid,
	mergedViewNameCollision,
	mergedWhereInvalid,
	orphanCollection,
	orphanField,
	previewUrlInvalid,
	singletonInvalid
} from './warnings';
import { validatePreviewUrlPlaceholders } from './preview-url';

// ————— Lectura tolerante de JSON (§5) —————

type JsonObject = Record<string, JsonValue>;

function asJsonObject(value: JsonValue | undefined): JsonObject | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as JsonObject)
		: undefined;
}

function readString(min: number, max: number) {
	return (raw: JsonValue): string | undefined =>
		typeof raw === 'string' && raw.length >= min && raw.length <= max ? raw : undefined;
}

function readBoolean(raw: JsonValue): boolean | undefined {
	return typeof raw === 'boolean' ? raw : undefined;
}

function readNonNegativeInt(raw: JsonValue): number | undefined {
	return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : undefined;
}

function readStringArray(minItemLength: number) {
	return (raw: JsonValue): string[] | undefined => {
		if (!Array.isArray(raw)) return undefined;
		const items: string[] = [];
		for (const el of raw) {
			if (typeof el !== 'string' || el.length < minItemLength) return undefined;
			items.push(el);
		}
		return items;
	};
}

/** Resultado tolerante de leer `collections.<c>.fieldGroups` (§4.9b). */
interface FieldGroupsDeclaration {
	/** Nombres en orden de declaración, tal cual los espera `orderByGroups` (misma forma que
	 *  antes de §4.9b: la forma objeto solo AÑADE `columns`, no cambia el orden). */
	order: string[];
	/** `columns` declarado por nombre de grupo, solo para los que llegaron en forma objeto. */
	columnsByName: Map<string, number>;
}

/**
 * Lee `fieldGroups` tolerando las DOS formas de item que admite el schema §3 (`oneOf`): un
 * string (de siempre) o un objeto `{ name, columns }` (§4.9b). Cualquier item que no case con
 * NINGUNA de las dos (número, array, objeto sin `name`, `columns` fuera de 1-3…) invalida el
 * array ENTERO — mismo criterio "todo o nada" que `readStringArray` ya aplicaba a `listFields`/
 * `nav.groups`, así el llamador solo tiene que emitir UN warning `manifest-invalid-key` por toda
 * la clave, no uno por item.
 */
function readFieldGroups(raw: JsonValue): FieldGroupsDeclaration | undefined {
	if (!Array.isArray(raw)) return undefined;
	const order: string[] = [];
	const columnsByName = new Map<string, number>();
	for (const el of raw) {
		if (typeof el === 'string') {
			if (el.length < 1) return undefined;
			order.push(el);
			continue;
		}
		const obj = asJsonObject(el);
		if (!obj) return undefined;
		const name = obj.name;
		if (typeof name !== 'string' || name.length < 1) return undefined;
		order.push(name);
		if ('columns' in obj) {
			const columns = obj.columns;
			if (typeof columns !== 'number' || !Number.isInteger(columns) || columns < 1 || columns > 3) {
				return undefined;
			}
			columnsByName.set(name, columns);
		}
	}
	return { order, columnsByName };
}

function readStatusFieldRaw(raw: JsonValue): string | false | undefined {
	if (raw === false) return false;
	if (typeof raw === 'string' && raw.length > 0) return raw;
	return undefined;
}

function readPreviewUrlTemplate(raw: JsonValue): string | undefined {
	return typeof raw === 'string' && /^https?:\/\//.test(raw) ? raw : undefined;
}

/**
 * Lee `obj[key]` con `read`; si la clave está presente pero no pasa `read`, empuja
 * `manifest-invalid-key` con `path` y devuelve `undefined` (la cascada sigue como si la clave
 * no existiera, §5). Si la clave está ausente, devuelve `undefined` SIN warning
 * (forward-compat: nunca llegamos aquí para una clave desconocida, esas se ignoran antes).
 */
function readKey<T>(
	obj: JsonObject | undefined,
	key: string,
	read: (raw: JsonValue) => T | undefined,
	path: string,
	message: string,
	warnings: ModelWarning[]
): T | undefined {
	if (!obj || !(key in obj)) return undefined;
	const value = read(obj[key]);
	if (value === undefined) warnings.push(manifestInvalidKey(path, message));
	return value;
}

/**
 * Variante de `readKey` para cuando el valor crudo ya se tiene (p.ej. `collectionsRaw[nombre]`,
 * leído por el llamador para poder emitir también el warning `orphan-collection`/`orphan-field`
 * si la clave no existe en el esquema). `value === undefined` ⇒ ausente, sin warning.
 */
function readObjectOrWarn(
	value: JsonValue | undefined,
	path: string,
	message: string,
	warnings: ModelWarning[]
): JsonObject | undefined {
	if (value === undefined) return undefined;
	const obj = asJsonObject(value);
	if (!obj) warnings.push(manifestInvalidKey(path, message));
	return obj;
}

// ————— Punto de entrada —————

/** API pública de P2 (§2). PURA y DETERMINISTA (L1). Nunca lanza por contenido (L3). */
export function resolveContentModel(input: {
	types: ContentType[];
	manifestRaw: JsonValue | null;
	knownIcons?: readonly string[];
}): ContentModel {
	const warnings: ModelWarning[] = [];
	const { manifest, doc } = readManifestDoc(input.manifestRaw, warnings);

	const site = resolveSite(doc, warnings);

	const navRaw = readKey(
		doc,
		'nav',
		asJsonObject,
		'/nav',
		'nav no es un objeto; se ignora.',
		warnings
	);
	const declaredNavGroups =
		readKey(
			navRaw,
			'groups',
			readStringArray(1),
			'/nav/groups',
			'nav.groups no es un array de strings no vacíos; se ignora.',
			warnings
		) ?? [];

	const collectionsRaw =
		readKey(
			doc,
			'collections',
			asJsonObject,
			'/collections',
			'collections no es un objeto; se ignora.',
			warnings
		) ?? {};

	const typeNames = new Set(input.types.map((t) => t.name));
	for (const name of Object.keys(collectionsRaw)
		.filter((n) => !typeNames.has(n))
		.sort((a, b) => a.localeCompare(b))) {
		warnings.push(orphanCollection(name));
	}

	const navOrderByType = new Map<string, number | undefined>();
	const resolvedTypes: ResolvedContentType[] = input.types.map((type) =>
		resolveContentType(type, collectionsRaw[type.name], input.knownIcons, navOrderByType, warnings)
	);

	const resolvedTypesByName = new Map(resolvedTypes.map((t) => [t.name, t]));
	// Colisión de namespace con collections (L7e): si `mergedViews.<id>` coincide con el `name` de
	// una colección del esquema, gana la colección — `id` sigue siendo el nombre reservado de esa
	// ruta (`/c/:type`), aunque la colección esté `hidden`. Se comprueba contra `typeNames` (TODAS
	// las colecciones descubiertas, no solo las visibles) y se resuelve ANTES de `resolveMergedView`
	// para no colar warnings de una vista que de todos modos se va a descartar entera.
	const mergedViewsRaw =
		readKey(
			doc,
			'mergedViews',
			asJsonObject,
			'/mergedViews',
			'mergedViews no es un objeto; se ignora.',
			warnings
		) ?? {};
	const mergedViews: ResolvedMergedView[] = [];
	for (const [id, viewRawValue] of Object.entries(mergedViewsRaw)) {
		if (typeNames.has(id)) {
			warnings.push(mergedViewNameCollision(id));
			continue;
		}
		const resolved = resolveMergedView(
			id,
			viewRawValue,
			resolvedTypesByName,
			input.knownIcons,
			warnings
		);
		if (resolved) mergedViews.push(resolved);
	}

	// Resuelto DESPUÉS de `mergedViews` (a diferencia de L7a/L7b): desde L7c, `nav` pliega
	// colecciones visibles + vistas fusionadas en una sola pasada de `orderByGroups` (ver
	// `buildNav`), así que necesita las dos listas ya resueltas.
	const nav = buildNav(resolvedTypes, navOrderByType, declaredNavGroups, mergedViews);

	return { site, types: resolvedTypes, nav, mergedViews, warnings, manifest };
}

// ————— Manifiesto raíz —————

function readManifestDoc(
	manifestRaw: JsonValue | null,
	warnings: ModelWarning[]
): { manifest: ManifestState; doc: JsonObject } {
	if (manifestRaw === null) {
		return { manifest: { status: 'absent' }, doc: {} };
	}

	const doc = asJsonObject(manifestRaw);
	if (!doc) {
		warnings.push(manifestUnreadable());
		return { manifest: { status: 'absent' }, doc: {} };
	}

	let schemaVersion = 1;
	if ('schemaVersion' in doc) {
		const raw = doc.schemaVersion;
		if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1) {
			schemaVersion = raw;
			if (raw > 1) warnings.push(manifestVersionNewer(raw));
		} else {
			warnings.push(
				manifestInvalidKey('/schemaVersion', 'schemaVersion no es un entero >= 1; se asume 1.')
			);
		}
	}

	return { manifest: { status: 'loaded', schemaVersion }, doc };
}

function resolveSite(doc: JsonObject, warnings: ModelWarning[]): ResolvedSite {
	const siteRaw = readKey(
		doc,
		'site',
		asJsonObject,
		'/site',
		'site no es un objeto; se ignora.',
		warnings
	);

	const name =
		readKey(
			siteRaw,
			'name',
			readString(1, 60),
			'/site/name',
			'site.name no es un texto de 1 a 60 caracteres; se ignora.',
			warnings
		) ?? 'Vega';
	const defaultTheme =
		readKey(
			siteRaw,
			'defaultTheme',
			readString(1, Infinity),
			'/site/defaultTheme',
			'site.defaultTheme no es un texto no vacío; se ignora.',
			warnings
		) ?? null;
	const locale =
		readKey(
			siteRaw,
			'locale',
			(raw) => (raw === 'es' || raw === 'en' ? raw : undefined),
			'/site/locale',
			'site.locale debe ser "es" o "en"; se ignora.',
			warnings
		) ?? null;

	return { name, defaultTheme, locale };
}

// ————— Colección —————

function resolveContentType(
	type: ContentType,
	collectionRawValue: JsonValue | undefined,
	knownIcons: readonly string[] | undefined,
	navOrderByType: Map<string, number | undefined>,
	warnings: ModelWarning[]
): ResolvedContentType {
	const base = `/collections/${type.name}`;
	const reserved = isReservedCollectionName(type.name);

	const collectionRaw = readObjectOrWarn(
		collectionRawValue,
		base,
		`La configuración de "${type.name}" no es un objeto; se ignora.`,
		warnings
	);

	// ————— hidden (§4.1, L7) —————
	let hidden: boolean;
	if (reserved) {
		if (collectionRaw && 'hidden' in collectionRaw) {
			warnings.push(
				manifestInvalidKey(
					`${base}/hidden`,
					`"${type.name}" es una colección reservada de Vega; su visibilidad no se puede anular (L7).`
				)
			);
		}
		hidden = true;
	} else {
		hidden =
			readKey(
				collectionRaw,
				'hidden',
				readBoolean,
				`${base}/hidden`,
				`hidden de "${type.name}" no es booleano; se ignora.`,
				warnings
			) ?? false;
	}

	// ————— label / labelSingular / icon / group (§4.8) —————
	const label =
		readKey(
			collectionRaw,
			'label',
			readString(1, 60),
			`${base}/label`,
			`label de "${type.name}" no es un texto de 1 a 60 caracteres; se ignora.`,
			warnings
		) ?? humanizeLabel(type.name);
	const labelSingular =
		readKey(
			collectionRaw,
			'labelSingular',
			readString(1, 60),
			`${base}/labelSingular`,
			`labelSingular de "${type.name}" no es un texto de 1 a 60 caracteres; se ignora.`,
			warnings
		) ?? label;

	const iconCandidate = readKey(
		collectionRaw,
		'icon',
		readString(1, Infinity),
		`${base}/icon`,
		`icon de "${type.name}" no es un texto no vacío; se ignora.`,
		warnings
	);
	let icon: string | null = null;
	if (iconCandidate !== undefined) {
		if (knownIcons && !knownIcons.includes(iconCandidate)) {
			warnings.push(iconUnknown(type.name, iconCandidate));
		} else {
			icon = iconCandidate;
		}
	}

	const group =
		readKey(
			collectionRaw,
			'group',
			readString(1, Infinity),
			`${base}/group`,
			`group de "${type.name}" no es un texto no vacío; se ignora.`,
			warnings
		) ?? null;

	navOrderByType.set(
		type.name,
		readKey(
			collectionRaw,
			'order',
			readNonNegativeInt,
			`${base}/order`,
			`order de "${type.name}" no es un entero >= 0; se ignora.`,
			warnings
		)
	);

	// ————— singleton (§4.6) —————
	const singletonRaw =
		readKey(
			collectionRaw,
			'singleton',
			readBoolean,
			`${base}/singleton`,
			`singleton de "${type.name}" no es booleano; se ignora.`,
			warnings
		) ?? false;
	let singleton = singletonRaw;
	if (singleton && type.readonly) {
		warnings.push(singletonInvalid(type.name));
		singleton = false;
	}

	// ————— titleField / statusField (§4.4, §4.5) —————
	const titleFieldRaw = readKey(
		collectionRaw,
		'titleField',
		readString(1, Infinity),
		`${base}/titleField`,
		`titleField de "${type.name}" no es un texto no vacío; se ignora.`,
		warnings
	);
	const titleField = resolveTitleField(type.fields, titleFieldRaw, type.name, warnings);

	const orderFieldRaw = readKey(
		collectionRaw,
		'orderField',
		readString(1, Infinity),
		`${base}/orderField`,
		`orderField de "${type.name}" no es un texto no vacío; se ignora.`,
		warnings
	);
	const orderField = resolveOrderField(type.fields, orderFieldRaw, type.name, warnings);

	const statusFieldRaw = readKey(
		collectionRaw,
		'statusField',
		readStatusFieldRaw,
		`${base}/statusField`,
		`statusField de "${type.name}" debe ser un texto no vacío o "false"; se ignora.`,
		warnings
	);
	const statusField = resolveStatusField(type.fields, statusFieldRaw, type.name, warnings);

	// ————— previewUrl (§4.7) —————
	const previewUrlTemplate = readKey(
		collectionRaw,
		'previewUrl',
		readPreviewUrlTemplate,
		`${base}/previewUrl`,
		`previewUrl de "${type.name}" no es una URL http(s) con placeholders válidos; se ignora.`,
		warnings
	);
	let previewUrl: string | null = null;
	if (previewUrlTemplate !== undefined) {
		if (validatePreviewUrlPlaceholders(previewUrlTemplate, type.fields)) {
			previewUrl = previewUrlTemplate;
		} else {
			warnings.push(previewUrlInvalid(type.name));
		}
	}

	// ————— campos (§4.2, §4.9, §4.10) —————
	const fieldsRaw =
		readKey(
			collectionRaw,
			'fields',
			asJsonObject,
			`${base}/fields`,
			`fields de "${type.name}" no es un objeto; se ignora.`,
			warnings
		) ?? {};

	const fieldNames = new Set(type.fields.map((f) => f.name));
	for (const name of Object.keys(fieldsRaw)
		.filter((n) => !fieldNames.has(n))
		.sort((a, b) => a.localeCompare(b))) {
		warnings.push(orphanField(type.name, name));
	}

	const fieldGroupsDeclaration = readKey(
		collectionRaw,
		'fieldGroups',
		readFieldGroups,
		`${base}/fieldGroups`,
		`fieldGroups de "${type.name}" no es un array de nombres o { name, columns } válidos; se ignora.`,
		warnings
	);
	const declaredFieldGroups = fieldGroupsDeclaration?.order ?? [];
	const columnsByGroupName = fieldGroupsDeclaration?.columnsByName ?? new Map<string, number>();

	const fieldOrderByName = new Map<string, number | undefined>();
	const resolvedFieldsBase = type.fields.map((field) =>
		resolveField(type.name, field, fieldsRaw[field.name], fieldOrderByName, warnings)
	);

	const { orderedItems: orderedFields, groupOrder: fieldGroupNames } = orderByGroups(
		resolvedFieldsBase,
		(f) => f.group,
		(f) => fieldOrderByName.get(f.name),
		declaredFieldGroups
	);

	// §4.9b: `columns` viaja aparte de `orderByGroups` (que solo ordena NOMBRES, compartido con
	// nav) — se cose aquí sobre el orden ya resuelto. El grupo anónimo (`null`) SIEMPRE es 1: no
	// hay clave de manifiesto que lo declare (no tiene nombre al que colgar `columns`).
	const fieldGroups: ResolvedFieldGroup[] = fieldGroupNames.map((name) => ({
		name,
		columns: ((name !== null ? columnsByGroupName.get(name) : undefined) ?? 1) as 1 | 2 | 3
	}));

	// ————— listFields (§4.10) —————
	const listFieldsRawArr = readKey(
		collectionRaw,
		'listFields',
		readStringArray(0),
		`${base}/listFields`,
		`listFields de "${type.name}" no es un array de strings; se ignora.`,
		warnings
	);
	let listFields: string[];
	if (listFieldsRawArr !== undefined) {
		listFields = [];
		listFieldsRawArr.forEach((name, index) => {
			if (fieldNames.has(name)) {
				listFields.push(name);
			} else {
				warnings.push(listFieldUnknown(type.name, name, index));
			}
		});
	} else {
		listFields = defaultListFields(titleField, statusField, orderedFields);
	}

	return {
		schema: type,
		name: type.name,
		label,
		labelSingular,
		icon,
		hidden,
		group,
		singleton,
		readonly: type.readonly,
		titleField,
		orderField,
		statusField,
		previewUrl,
		fields: orderedFields,
		listFields,
		fieldGroups
	};
}

/** `[titleField, statusField, …primeros listables]`, sin duplicar, truncado a 5 (§4.10). */
function defaultListFields(
	titleField: string | null,
	statusField: string | null,
	fields: readonly ResolvedField[]
): string[] {
	const result: string[] = [];
	if (titleField !== null) result.push(titleField);
	if (statusField !== null && !result.includes(statusField)) result.push(statusField);

	for (const field of fields) {
		if (result.length >= 5) break;
		if (!field.listable || result.includes(field.name)) continue;
		result.push(field.name);
	}

	return result.slice(0, 5);
}

// ————— Campo —————

function resolveField(
	collection: string,
	field: Field,
	fieldRawValue: JsonValue | undefined,
	fieldOrderByName: Map<string, number | undefined>,
	warnings: ModelWarning[]
): ResolvedField {
	const base = `/collections/${collection}/fields/${field.name}`;

	const fieldRaw = readObjectOrWarn(
		fieldRawValue,
		base,
		`La configuración del campo "${field.name}" de "${collection}" no es un objeto; se ignora.`,
		warnings
	);

	const label =
		readKey(
			fieldRaw,
			'label',
			readString(1, 60),
			`${base}/label`,
			`label de "${field.name}" (${collection}) no es un texto de 1 a 60 caracteres; se ignora.`,
			warnings
		) ?? humanizeLabel(field.name);
	const help =
		readKey(
			fieldRaw,
			'help',
			readString(0, 300),
			`${base}/help`,
			`help de "${field.name}" (${collection}) no es un texto válido; se ignora.`,
			warnings
		) ?? null;
	const placeholder =
		readKey(
			fieldRaw,
			'placeholder',
			readString(0, 120),
			`${base}/placeholder`,
			`placeholder de "${field.name}" (${collection}) no es un texto válido; se ignora.`,
			warnings
		) ?? null;
	const hidden =
		readKey(
			fieldRaw,
			'hidden',
			readBoolean,
			`${base}/hidden`,
			`hidden de "${field.name}" (${collection}) no es booleano; se ignora.`,
			warnings
		) ?? field.hidden;
	const group =
		readKey(
			fieldRaw,
			'group',
			readString(1, Infinity),
			`${base}/group`,
			`group de "${field.name}" (${collection}) no es un texto no vacío; se ignora.`,
			warnings
		) ?? null;

	fieldOrderByName.set(
		field.name,
		readKey(
			fieldRaw,
			'order',
			readNonNegativeInt,
			`${base}/order`,
			`order de "${field.name}" (${collection}) no es un entero >= 0; se ignora.`,
			warnings
		)
	);

	const widgetRawValue = fieldRaw && 'widget' in fieldRaw ? fieldRaw.widget : undefined;
	const { widget, subtype } = resolveWidget(field, widgetRawValue, collection, warnings);

	const listableOverride = readKey(
		fieldRaw,
		'listable',
		readBoolean,
		`${base}/listable`,
		`listable de "${field.name}" (${collection}) no es booleano; se ignora.`,
		warnings
	);
	const listable = listableOverride ?? (hidden ? false : defaultListable(field));

	return {
		schema: field,
		name: field.name,
		label,
		help,
		placeholder,
		hidden,
		group,
		widget,
		subtype,
		listable
	};
}

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

function buildNav(
	resolvedTypes: readonly ResolvedContentType[],
	navOrderByType: Map<string, number | undefined>,
	declaredNavGroups: readonly string[],
	mergedViews: readonly ResolvedMergedView[]
): NavModel {
	const visibleTypes = resolvedTypes.filter((t) => !t.hidden);
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
function resolveMergedView(
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
