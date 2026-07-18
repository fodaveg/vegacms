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
import { isReservedCollectionName } from '$lib/backend/collections';
import type {
	ContentModel,
	ManifestState,
	ModelWarning,
	NavGroup,
	NavModel,
	ResolvedContentType,
	ResolvedField,
	ResolvedSite
} from './types';
import {
	defaultListable,
	humanizeLabel,
	orderByGroups,
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

	const nav = buildNav(resolvedTypes, navOrderByType, declaredNavGroups);

	return { site, types: resolvedTypes, nav, warnings, manifest };
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

	const declaredFieldGroups =
		readKey(
			collectionRaw,
			'fieldGroups',
			readStringArray(1),
			`${base}/fieldGroups`,
			`fieldGroups de "${type.name}" no es un array de strings no vacíos; se ignora.`,
			warnings
		) ?? [];

	const fieldOrderByName = new Map<string, number | undefined>();
	const resolvedFieldsBase = type.fields.map((field) =>
		resolveField(type.name, field, fieldsRaw[field.name], fieldOrderByName, warnings)
	);

	const { orderedItems: orderedFields, groupOrder: fieldGroups } = orderByGroups(
		resolvedFieldsBase,
		(f) => f.group,
		(f) => fieldOrderByName.get(f.name),
		declaredFieldGroups
	);

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

function buildNav(
	resolvedTypes: readonly ResolvedContentType[],
	navOrderByType: Map<string, number | undefined>,
	declaredNavGroups: readonly string[]
): NavModel {
	const visibleTypes = resolvedTypes.filter((t) => !t.hidden);

	const { orderedItems: orderedNavTypes, groupOrder } = orderByGroups(
		visibleTypes,
		(t) => t.group,
		(t) => navOrderByType.get(t.name),
		declaredNavGroups
	);

	const groups: NavGroup[] = groupOrder.map((label) => ({
		label,
		items: orderedNavTypes
			.filter((t) => t.group === label)
			.map((t) => ({
				type: t.name,
				label: t.label,
				icon: t.icon,
				singleton: t.singleton,
				readonly: t.readonly
			}))
	}));

	return { groups };
}
