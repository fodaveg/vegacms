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
import { resolvePermissions } from '$lib/backend/access';
import type {
	ContentModel,
	FieldGroupPlacement,
	ManifestState,
	ModelWarning,
	NavGroup,
	NavItem,
	NavModel,
	ResolvedBlockField,
	ResolvedBlocksConfig,
	ResolvedBlockType,
	ResolvedContentType,
	ResolvedField,
	ResolvedFieldGroup,
	ResolvedLocale,
	ResolvedLocalizedField,
	ResolvedLocalization,
	ResolvedMergedSource,
	ResolvedMergedView,
	ResolvedRevisionsConfig,
	ResolvedSite,
	ResolvedSocialCardConfig,
	WidgetId
} from './types';
import { BLOCK_FIELD_WIDGET_IDS } from './types';
import {
	defaultListable,
	humanizeLabel,
	isRepresentableField,
	orderByGroups,
	resolveDefaultSort,
	resolveMergedSourceOrderField,
	resolveOrderField,
	resolveSlugField,
	resolveStatusField,
	resolveStatusLabels,
	resolveSubtitleField,
	resolveTitleField,
	resolveWidget
} from './conventions';
import {
	blocksHeterogeneousInvalid,
	blocksInvalid,
	blockTypeFieldInvalid,
	blockTypeIconUnknown,
	blockTypeInvalid,
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
	singletonInvalid,
	socialDescriptionFieldInvalid,
	socialImageFieldInvalid,
	socialTitleFieldInvalid,
	socialUrlInvalid
} from './warnings';
import { validatePreviewUrlPlaceholders } from './preview-url';

// Defaults de retención (`#lote-integridad`, Fase B §7): duplicados A PROPÓSITO desde
// `$lib/revisions/retention` (`DEFAULT_KEEP_PER_RECORD`/`DEFAULT_TRASH_RETENTION_DAYS`, los
// nombres canónicos con los que el contrato los fija). P2 no importa de `revisions/` —esa capa
// se construye ENCIMA del modelo (mismo estatus que `media/`), y este módulo es "puro" (L1): solo
// depende de `backend/` hacia abajo, nunca de una capa de feature hacia arriba. Mismo criterio de
// duplicación consciente que `classifyMediaFile`/`collectionFieldSpecToPbImportField` en `media/`.
const DEFAULT_REVISIONS_KEEP_PER_RECORD = 20;
const DEFAULT_REVISIONS_TRASH_DAYS = 30;

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

/** Resultado tolerante de leer `collections.<c>.fieldGroups` (§4.9b, §4.9c). */
interface FieldGroupsDeclaration {
	/** Nombres en orden de declaración, tal cual los espera `orderByGroups` (misma forma que
	 *  antes de §4.9b: la forma objeto solo AÑADE `columns`/`placement`, no cambia el orden). */
	order: string[];
	/** `columns` declarado por nombre de grupo, solo para los que llegaron en forma objeto. */
	columnsByName: Map<string, number>;
	/** `placement` declarado por nombre de grupo (§4.9c), solo para los que lo traen. */
	placementByName: Map<string, FieldGroupPlacement>;
}

/**
 * Lee `fieldGroups` tolerando las DOS formas de item que admite el schema §3 (`oneOf`): un
 * string (de siempre) o un objeto `{ name, columns, placement }` (§4.9b/§4.9c). Cualquier item que
 * no case con NINGUNA de las dos (número, array, objeto sin `name`, `columns` fuera de 1-3,
 * `placement` fuera de `main`/`aside`…) invalida el array ENTERO — mismo criterio "todo o nada"
 * que `readStringArray` ya aplicaba a `listFields`/`nav.groups`, así el llamador solo tiene que
 * emitir UN warning `manifest-invalid-key` por toda la clave, no uno por item.
 */
function readFieldGroups(raw: JsonValue): FieldGroupsDeclaration | undefined {
	if (!Array.isArray(raw)) return undefined;
	const order: string[] = [];
	const columnsByName = new Map<string, number>();
	const placementByName = new Map<string, FieldGroupPlacement>();
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
		if ('placement' in obj) {
			const placement = obj.placement;
			if (placement !== 'main' && placement !== 'aside') return undefined;
			placementByName.set(name, placement);
		}
	}
	return { order, columnsByName, placementByName };
}

interface LocalesDeclaration {
	defaultLocale: string;
	locales: ResolvedLocale[];
}

const LOCALE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Lee la declaración raíz de idiomas como una unidad: el orden de `available` es intencional
 * (orden de tabs), los ids deben ser únicos y `default` debe existir dentro de la lista.
 */
function readLocales(raw: JsonValue): LocalesDeclaration | undefined {
	const obj = asJsonObject(raw);
	if (!obj) return undefined;
	const defaultLocale = obj.default;
	const available = obj.available;
	if (
		typeof defaultLocale !== 'string' ||
		!LOCALE_ID_PATTERN.test(defaultLocale) ||
		!Array.isArray(available) ||
		available.length === 0
	) {
		return undefined;
	}
	const locales: ResolvedLocale[] = [];
	const seen = new Set<string>();
	for (const rawLocale of available) {
		const locale = asJsonObject(rawLocale);
		if (!locale) return undefined;
		const id = locale.id;
		const label = locale.label;
		if (
			typeof id !== 'string' ||
			!LOCALE_ID_PATTERN.test(id) ||
			typeof label !== 'string' ||
			label.length < 1 ||
			label.length > 60 ||
			seen.has(id)
		) {
			return undefined;
		}
		seen.add(id);
		locales.push({ id, label });
	}
	if (!seen.has(defaultLocale)) return undefined;
	return { defaultLocale, locales };
}

function readStatusFieldRaw(raw: JsonValue): string | false | undefined {
	if (raw === false) return false;
	if (typeof raw === 'string' && raw.length > 0) return raw;
	return undefined;
}

/**
 * Lee `collections.<c>.statusLabels` (M4, §4.11): objeto de valor-crudo → etiqueta legible, cada
 * etiqueta un texto de 1 a 60 caracteres (mismo rango que `label`/`labelSingular`). Cualquier
 * clave/valor que no case invalida el objeto ENTERO (mismo criterio "todo o nada" que
 * `readFieldGroups`) — el llamador emite entonces UN `manifest-invalid-key` por toda la clave. La
 * comprobación de CONTENIDO (¿la clave es una opción real del statusField?) es de
 * `resolveStatusLabels`, no de aquí.
 */
function readStatusLabels(raw: JsonValue): Record<string, string> | undefined {
	const obj = asJsonObject(raw);
	if (!obj) return undefined;
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (key.length < 1 || typeof value !== 'string' || value.length < 1 || value.length > 60) {
			return undefined;
		}
		result[key] = value;
	}
	return result;
}

/**
 * Lee `collections.<c>.defaultSort` (orden inicial del listado, §? mockup `aquelarre-dark.html`):
 * un objeto `{ field, dir }` con `dir` en `'asc'|'desc'`, mismo criterio "todo o nada" que
 * `readFieldGroups`/`readStatusLabels` — cualquier forma que no case invalida la clave ENTERA. El
 * CONTENIDO (¿`field` existe y es escalar?) lo valida `resolveDefaultSort`, no aquí.
 */
function readDefaultSort(raw: JsonValue): { field: string; dir: 'asc' | 'desc' } | undefined {
	const obj = asJsonObject(raw);
	if (!obj) return undefined;
	const field = obj.field;
	const dir = obj.dir;
	if (typeof field !== 'string' || field.length < 1) return undefined;
	if (dir !== 'asc' && dir !== 'desc') return undefined;
	return { field, dir };
}

function readPreviewUrlTemplate(raw: JsonValue): string | undefined {
	return typeof raw === 'string' && /^https?:\/\//.test(raw) ? raw : undefined;
}

/** Forma cruda de `collections.<c>.blocks`, SOLO tipada — el CONTENIDO (¿existe la colección? ¿el
 *  campo es una relación? ¿el orden es numérico?) lo valida `resolveBlocks`, que es quien conoce
 *  el esquema de la colección hija. */
interface RawBlocksDeclaration {
	collection: string;
	parentField: string;
	orderField: string;
	/** Valor CRUDO de `typeField`/`dataField` (vocabulario de tipos de bloque `#4cfd4f7f`), SIN
	 *  tipar aquí a propósito: a diferencia de las tres de arriba, una forma inválida de estas dos
	 *  NO puede tumbar la declaración ENTERA (`resolveBlockTypeFields`, `resolve.ts`, decide qué
	 *  hacer con ellas) — invalidar todo `blocks` por un `typeField` mal escrito le quitaría a la
	 *  colección una capacidad (el modo homogéneo) que ya funcionaba. `undefined` = la clave no se
	 *  declaró en el manifiesto. */
	typeFieldRaw: JsonValue | undefined;
	dataFieldRaw: JsonValue | undefined;
}

/** Lee `collections.<c>.blocks` (lote "editor", Fase A): `collection`/`parentField`/`orderField`
 *  son obligatorias juntas — un objeto al que le falte cualquiera de las tres no es una
 *  declaración parcial válida, es `undefined` (mismo criterio "todo o nada" que
 *  `readDefaultSort`), y el llamador (`readKey`) descarta `blocks` entero con un solo
 *  `manifest-invalid-key`. `typeField`/`dataField` (vocabulario de tipos de bloque) viajan tal
 *  cual, SIN ese criterio: son opcionales y su validación vive en `resolveBlockTypeFields`. */
function readBlocksDeclaration(raw: JsonValue): RawBlocksDeclaration | undefined {
	const obj = asJsonObject(raw);
	if (!obj) return undefined;
	const collection = obj.collection;
	const parentField = obj.parentField;
	const orderField = obj.orderField;
	if (
		typeof collection !== 'string' ||
		collection.length < 1 ||
		typeof parentField !== 'string' ||
		parentField.length < 1 ||
		typeof orderField !== 'string' ||
		orderField.length < 1
	) {
		return undefined;
	}
	return {
		collection,
		parentField,
		orderField,
		typeFieldRaw: 'typeField' in obj ? obj.typeField : undefined,
		dataFieldRaw: 'dataField' in obj ? obj.dataField : undefined
	};
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
	/**
	 * `Capabilities.accessBypass` de la sesión (`#lote-shell`): `true` = salta las reglas de acceso
	 * del backend (PB: superuser) ⇒ `permissions` sale todo en `true` y la UI se comporta EXACTA-
	 * MENTE como antes de este lote. Omitirlo equivale a `false`, que es lo restrictivo… salvo que
	 * los tipos tampoco declaren `access` (adaptador que no lee reglas), en cuyo caso también sale
	 * todo permitido: los dos caminos por los que "no se sabe" acaban en "no se restringe nada".
	 */
	accessBypass?: boolean;
}): ContentModel {
	const warnings: ModelWarning[] = [];
	const { manifest, doc } = readManifestDoc(input.manifestRaw, warnings);

	const site = resolveSite(doc, warnings);
	const revisions = resolveRevisions(doc, warnings);
	// `blockTypes` (RAÍZ, vocabulario de tipos de bloque `#4cfd4f7f`): no depende de `types`/
	// `collectionsRaw` (ni al revés — ningún `collections.<c>.blocks` lo referencia todavía a nivel
	// de VALIDACIÓN, solo por convención de nombre en el manifiesto real), así que se resuelve aquí
	// mismo, junto al resto de claves de raíz independientes de la sesión de esquema.
	const blockTypes = resolveBlockTypes(doc, input.knownIcons, warnings);
	const locales = readKey(
		doc,
		'locales',
		readLocales,
		'/locales',
		'locales debe declarar default y una lista available de idiomas únicos que incluya el idioma por defecto; se ignora.',
		warnings
	);

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
	// `typesByName` (blocks, lote "editor" Fase A): mapa de TODOS los tipos crudos de P1 por
	// nombre, para que `resolveBlocks` pueda mirar el esquema de una colección hija DISTINTA de la
	// que se está resolviendo — construido una vez aquí, no dentro del `map` (evita reconstruirlo
	// por cada tipo).
	const typesByName = new Map(input.types.map((t) => [t.name, t]));
	const resolvedTypes: ResolvedContentType[] = input.types.map((type) =>
		resolveContentType(
			type,
			collectionsRaw[type.name],
			locales,
			input.knownIcons,
			navOrderByType,
			typesByName,
			input.accessBypass ?? false,
			warnings
		)
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

	return {
		site,
		revisions,
		types: resolvedTypes,
		nav,
		mergedViews,
		blockTypes,
		warnings,
		manifest
	};
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

/**
 * Resuelve `revisions` (§ tipos `ResolvedRevisionsConfig`, `#lote-integridad` Fase B §7): las
 * tres claves son independientes (mismo criterio que `site`), cada una cae a su default si está
 * ausente o no pasa `readBoolean`/`readNonNegativeInt` (con warning `manifest-invalid-key` en ese
 * segundo caso, vía `readKey`) — nunca invalida las otras dos.
 */
function resolveRevisions(doc: JsonObject, warnings: ModelWarning[]): ResolvedRevisionsConfig {
	const revisionsRaw = readKey(
		doc,
		'revisions',
		asJsonObject,
		'/revisions',
		'revisions no es un objeto; se ignora.',
		warnings
	);

	const enabled =
		readKey(
			revisionsRaw,
			'enabled',
			readBoolean,
			'/revisions/enabled',
			'revisions.enabled no es booleano; se ignora.',
			warnings
		) ?? true;
	const keepPerRecord =
		readKey(
			revisionsRaw,
			'keepPerRecord',
			readNonNegativeInt,
			'/revisions/keepPerRecord',
			'revisions.keepPerRecord no es un entero >= 0; se ignora.',
			warnings
		) ?? DEFAULT_REVISIONS_KEEP_PER_RECORD;
	const trashDays =
		readKey(
			revisionsRaw,
			'trashDays',
			readNonNegativeInt,
			'/revisions/trashDays',
			'revisions.trashDays no es un entero >= 0; se ignora.',
			warnings
		) ?? DEFAULT_REVISIONS_TRASH_DAYS;

	return { enabled, keepPerRecord, trashDays };
}

// ————— Bloques ordenables embebidos (blocks, lote "editor" Fase A) —————

/**
 * Resuelve `blocks` (§ tipos ResolvedBlocksConfig): valida las TRES piezas de la declaración
 * cruda contra el esquema REAL de la colección hija — a diferencia de `orderField`/`slugField`
 * (que solo miran los campos del PROPIO tipo), `blocks` necesita el esquema de OTRA colección, así
 * que recibe `typesByName` (los `ContentType` de P1 tal cual, sin pasar por el resolutor: solo
 * hacen falta sus `fields` crudos, no overrides de manifiesto de la hija). `raw === undefined`
 * (clave ausente, o presente pero con forma inválida — ya avisado por `readKey`) ⇒ `null` sin
 * warning nuevo, igual que el resto de capacidades opt-in.
 *
 * Las tres comprobaciones son independientes pero SIN semántica parcial: la primera que falla
 * descarta la capacidad entera con su propio `blocks-invalid` (nunca se acumulan varios warnings
 * por una sola declaración de `blocks`, mismo criterio "un solo síntoma, no un diagnóstico
 * completo" que `resolveMergedSource`).
 */
function resolveBlocks(
	type: ContentType,
	raw: RawBlocksDeclaration | undefined,
	typesByName: Map<string, ContentType>,
	warnings: ModelWarning[]
): ResolvedBlocksConfig | null {
	if (raw === undefined) return null;

	const child = typesByName.get(raw.collection);
	if (!child || isReservedCollectionName(raw.collection)) {
		warnings.push(blocksInvalid(type.name, 'collection', raw.collection));
		return null;
	}

	// `parentField` (§ ResolvedBlocksConfig): relation NO múltiple de la hija que apunta a ESTE
	// tipo. `multiple: true` se rechaza a propósito (decisión de diseño, más allá de lo que exige
	// el contrato textual "relación a este tipo"): permitiría que el mismo bloque perteneciera a
	// varios padres simultáneamente, que ya no es "una landing hecha de secciones" sino una
	// relación compartida — otra capacidad, que esta no pretende cubrir.
	const parentField = child.fields.find((f) => f.name === raw.parentField);
	if (
		!parentField ||
		parentField.type !== 'relation' ||
		parentField.target !== type.name ||
		parentField.multiple
	) {
		warnings.push(blocksInvalid(type.name, 'parentField', raw.parentField));
		return null;
	}

	const orderField = child.fields.find((f) => f.name === raw.orderField);
	if (!orderField || orderField.type !== 'number') {
		warnings.push(blocksInvalid(type.name, 'orderField', raw.orderField));
		return null;
	}

	// typeField/dataField (vocabulario de tipos de bloque, `#4cfd4f7f`): ASIMÉTRICO a propósito
	// respecto a las tres comprobaciones de arriba. `collection`/`parentField`/`orderField` son la
	// capacidad `blocks` MISMA (sin ellas no hay ni colección que listar), así que cualquiera
	// inválida la tumba entera. `typeField`/`dataField` son una FORMA NUEVA de usar una capacidad
	// que YA funciona: una declaración a medias de ellas nunca puede quitarle a la colección el
	// modo homogéneo que ya tenía, así que solo degradan ELLAS (`resolveBlockTypeFields`), nunca
	// `blocks` entero.
	const { typeField, dataField } = resolveBlockTypeFields(type.name, raw, child, warnings);

	return {
		collection: raw.collection,
		parentField: raw.parentField,
		orderField: raw.orderField,
		typeField,
		dataField
	};
}

/**
 * Resuelve la pareja opcional `typeField`/`dataField` de `blocks` (modo HETEROGÉNEO, vocabulario
 * de tipos de bloque): `typeField` debe ser un campo `text` de la colección hija (columna real a
 * propósito — la regla que gobierna todo el vocabulario: lo que haya que consultar/filtrar/agrupar
 * es columna, no JSON) y `dataField` un campo `json` de la misma hija (el contenido del bloque,
 * heterogéneo por naturaleza: ahí sí encaja un blob). Ninguna de las dos declarada → homogéneo sin
 * warning (opt-in, como el resto de capacidades nuevas). Las DOS declaradas y válidas →
 * heterogéneo. Cualquier otra combinación (una sola declarada, o alguna que no resuelve contra el
 * esquema real) → homogéneo + `blocks-heterogeneous-invalid`, SIN tocar el resto de `blocks`
 * (ver el comentario de asimetría en `resolveBlocks`).
 */
function resolveBlockTypeFields(
	collection: string,
	raw: RawBlocksDeclaration,
	child: ContentType,
	warnings: ModelWarning[]
): { typeField: string | null; dataField: string | null } {
	const typeFieldDeclared = raw.typeFieldRaw !== undefined;
	const dataFieldDeclared = raw.dataFieldRaw !== undefined;
	if (!typeFieldDeclared && !dataFieldDeclared) {
		return { typeField: null, dataField: null };
	}

	const typeFieldName =
		typeof raw.typeFieldRaw === 'string' && raw.typeFieldRaw.length > 0 ? raw.typeFieldRaw : null;
	const dataFieldName =
		typeof raw.dataFieldRaw === 'string' && raw.dataFieldRaw.length > 0 ? raw.dataFieldRaw : null;

	const typeFieldValid =
		typeFieldName !== null &&
		child.fields.some((f) => f.name === typeFieldName && f.type === 'text');
	const dataFieldValid =
		dataFieldName !== null &&
		child.fields.some((f) => f.name === dataFieldName && f.type === 'json');

	if (typeFieldValid && dataFieldValid) {
		return { typeField: typeFieldName, dataField: dataFieldName };
	}

	warnings.push(blocksHeterogeneousInvalid(collection));
	return { typeField: null, dataField: null };
}

// ————— Vocabulario de tipos de bloque (blockTypes, RAÍZ, `#4cfd4f7f`) —————

/** Patrón de la clave de un tipo de bloque (`blockTypes.<t>`): minúsculas/dígitos/guiones,
 *  empezando siempre por letra. ESTRICTO a propósito (a diferencia de `group`/`titleField`, que
 *  admiten cualquier texto no vacío): esta clave viaja tal cual al nombre del componente Astro que
 *  pinta el bloque y al documento de discovery del sitio (`blockTypes: ["hero", ...]`), no es solo
 *  un id interno de Vega. */
const BLOCK_TYPE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Resuelve `blockTypes` (RAÍZ del manifiesto, § `ContentModel.blockTypes`): un tipo por clave, en
 * el ORDEN de declaración del manifiesto (mismo criterio que `mergedViews` — iterar
 * `Object.entries` en vez de ordenar alfabéticamente, porque aquí el orden SÍ es información del
 * manifiesto: es el orden en que Astro/la UI listarían los tipos disponibles, no un efecto
 * secundario de cómo JS itera un objeto). Un tipo que no sobrevive `resolveBlockType` simplemente
 * no aparece en el resultado (`block-type-invalid`).
 */
function resolveBlockTypes(
	doc: JsonObject,
	knownIcons: readonly string[] | undefined,
	warnings: ModelWarning[]
): ResolvedBlockType[] {
	const blockTypesRaw = readKey(
		doc,
		'blockTypes',
		asJsonObject,
		'/blockTypes',
		'blockTypes no es un objeto; se ignora.',
		warnings
	);
	if (!blockTypesRaw) return [];

	const result: ResolvedBlockType[] = [];
	for (const [name, rawValue] of Object.entries(blockTypesRaw)) {
		const resolved = resolveBlockType(name, rawValue, knownIcons, warnings);
		if (resolved) result.push(resolved);
	}
	return result;
}

/**
 * Resuelve un tipo de bloque (§ `ResolvedBlockType`). Cuatro comprobaciones EXCLUYENTES, la
 * primera que falla descarta el tipo entero de inmediato (mismo criterio "un solo síntoma" que
 * `resolveBlocks`): patrón de la clave → forma objeto → `label` → al menos un campo válido tras
 * filtrar `fields` con `resolveBlockField`. `icon` es la ÚNICA pieza que NO puede tumbar el tipo
 * (opcional, mismo criterio que `icon` de una colección): una forma inválida o fuera de
 * `knownIcons` solo lo deja en `null`.
 */
function resolveBlockType(
	name: string,
	rawValue: JsonValue,
	knownIcons: readonly string[] | undefined,
	warnings: ModelWarning[]
): ResolvedBlockType | null {
	if (!BLOCK_TYPE_NAME_PATTERN.test(name)) {
		warnings.push(blockTypeInvalid(name, 'name'));
		return null;
	}

	const obj = asJsonObject(rawValue);
	if (!obj) {
		warnings.push(blockTypeInvalid(name, 'shape'));
		return null;
	}

	// `label`: a mano (sin `readKey`) a propósito — cualquier forma inválida (ausente, tipo
	// equivocado, fuera de rango) descarta el tipo ENTERO con el mismo `block-type-invalid`, así
	// que emitir además un `manifest-invalid-key` por el mismo problema solo sería ruido: un tipo
	// de bloque sin label no tiene un default razonable al que caer (a diferencia de `label` de una
	// colección, que humaniza el nombre).
	const rawLabel = obj.label;
	const label =
		typeof rawLabel === 'string' && rawLabel.length >= 1 && rawLabel.length <= 60
			? rawLabel
			: undefined;
	if (label === undefined) {
		warnings.push(blockTypeInvalid(name, 'label'));
		return null;
	}

	const iconCandidate = readKey(
		obj,
		'icon',
		readString(1, Infinity),
		`/blockTypes/${name}/icon`,
		`icon de blockTypes.${name} no es un texto no vacío; se ignora.`,
		warnings
	);
	let icon: string | null = null;
	if (iconCandidate !== undefined) {
		if (knownIcons && !knownIcons.includes(iconCandidate)) {
			warnings.push(blockTypeIconUnknown(name, iconCandidate));
		} else {
			icon = iconCandidate;
		}
	}

	// `fields`: igual que `label`, a mano — una forma que no sea un array simplemente se trata como
	// `[]`, que cae en el mismo "cero campos válidos" que un array vacío declarado tal cual (un
	// solo motivo de descarte, `block-type-invalid` con `reason: 'fields'`, en vez de sumarle un
	// `manifest-invalid-key` por la forma).
	const fieldsRaw = Array.isArray(obj.fields) ? obj.fields : [];
	const fields: ResolvedBlockField[] = [];
	// `name` de un campo de bloque es la CLAVE dentro del `data` JSON, no solo una etiqueta: dos
	// campos que repitan `name` no son dos campos, son dos filas del formulario escribiendo la
	// misma clave, donde editar una pisa a la otra en silencio. Aquí no hay quien lo impida por
	// abajo (a diferencia de una colección real, donde el esquema de PocketBase no admite dos
	// columnas con el mismo nombre) — es exactamente lo que se apaga al meter contenido en un JSON,
	// así que lo comprueba Vega. Gana el PRIMERO: el orden de `fields` es el del formulario.
	const seenFieldNames = new Set<string>();
	fieldsRaw.forEach((fieldRaw, index) => {
		const resolvedField = resolveBlockField(name, index, fieldRaw, warnings);
		if (!resolvedField) return;
		if (seenFieldNames.has(resolvedField.name)) {
			warnings.push(blockTypeFieldInvalid(name, index, 'duplicate', resolvedField.name));
			return;
		}
		seenFieldNames.add(resolvedField.name);
		fields.push(resolvedField);
	});

	if (fields.length === 0) {
		warnings.push(blockTypeInvalid(name, 'fields'));
		return null;
	}

	return { name, label, icon, fields };
}

/**
 * Resuelve un item de `blockTypes.<typeName>.fields[]` (§ `ResolvedBlockField`). `name`/`label`/
 * `widget` son obligatorios: si CUALQUIERA falta o tiene forma inválida (incluido un `widget` fuera
 * de `BLOCK_FIELD_WIDGET_IDS` — excluido o directamente desconocido, mismo tratamiento para los
 * dos, ver `types.ts`), el campo se descarta SOLO (`block-type-field-invalid`) y el tipo de bloque
 * sigue con el resto. `required`/`options` son laxos por comparación: una forma inválida en ellos
 * no descarta el campo, solo cae a su default con un `manifest-invalid-key` (mismo criterio que
 * `hidden`/`listable` de un campo real, `resolveField` más abajo).
 */
function resolveBlockField(
	typeName: string,
	index: number,
	rawValue: JsonValue,
	warnings: ModelWarning[]
): ResolvedBlockField | null {
	const base = `/blockTypes/${typeName}/fields/${index}`;
	const obj = asJsonObject(rawValue);

	const rawName = obj?.name;
	const name = typeof rawName === 'string' && rawName.length >= 1 ? rawName : undefined;

	const rawLabel = obj?.label;
	const label =
		typeof rawLabel === 'string' && rawLabel.length >= 1 && rawLabel.length <= 60
			? rawLabel
			: undefined;

	const rawWidget = obj?.widget;
	const widget =
		typeof rawWidget === 'string' &&
		(BLOCK_FIELD_WIDGET_IDS as readonly string[]).includes(rawWidget)
			? (rawWidget as WidgetId)
			: undefined;

	if (name === undefined || label === undefined || widget === undefined) {
		warnings.push(blockTypeFieldInvalid(typeName, index));
		return null;
	}

	const rawRequired = obj?.required;
	let required = false;
	if (rawRequired !== undefined) {
		if (typeof rawRequired === 'boolean') {
			required = rawRequired;
		} else {
			warnings.push(
				manifestInvalidKey(
					`${base}/required`,
					`required del campo ${index} de blockTypes.${typeName} no es booleano; se ignora.`
				)
			);
		}
	}

	// `options`: solo tiene sentido para select/chips (§ ResolvedBlockField) — para cualquier otro
	// widget se ignora en silencio si viene declarado (no es un error, solo un dato inerte, mismo
	// criterio que `statusLabels` sobre un tipo sin convención de publicación).
	let options: string[] | null = null;
	if (widget === 'select' || widget === 'chips') {
		const rawOptions = obj?.options;
		if (rawOptions !== undefined) {
			const parsed = readStringArray(1)(rawOptions);
			if (parsed !== undefined && parsed.length > 0) {
				options = parsed;
			} else {
				warnings.push(
					manifestInvalidKey(
						`${base}/options`,
						`options del campo ${index} de blockTypes.${typeName} no es un array de textos no vacíos; se ignora.`
					)
				);
			}
		}
	}

	return { name, label, widget, required, options };
}

// ————— Tarjeta social (social, lote "editor" Fase B) —————

/**
 * Resuelve `social` (§ tipos `ResolvedSocialCardConfig`) UNA VEZ que `socialRaw` ya se sabe un
 * objeto (`resolveContentType` solo llama a esto si `readKey` no descartó la clave entera). A
 * diferencia de `resolveBlocks`, las CUATRO piezas se leen y validan de forma INDEPENDIENTE
 * (mismo patrón que las claves de nivel de colección: un `readKey` anidado por campo, cada uno
 * con su propio `path`/warning) — ninguna invalida a las demás.
 */
function resolveSocialCard(
	type: ContentType,
	socialRaw: JsonObject,
	resolvedTitleField: string | null,
	resolvedPreviewUrl: string | null,
	warnings: ModelWarning[]
): ResolvedSocialCardConfig {
	const base = `/collections/${type.name}/social`;

	const titleFieldRaw = readKey(
		socialRaw,
		'titleField',
		readString(1, Infinity),
		`${base}/titleField`,
		`social.titleField de "${type.name}" no es un texto no vacío; se ignora.`,
		warnings
	);
	let titleField = resolvedTitleField; // cascada: manifiesto > titleField del tipo (§4.4)
	if (titleFieldRaw !== undefined) {
		const field = type.fields.find((f) => f.name === titleFieldRaw);
		if (field && isRepresentableField(field)) {
			titleField = titleFieldRaw;
		} else {
			warnings.push(socialTitleFieldInvalid(type.name, titleFieldRaw));
		}
	}

	const descriptionFieldRaw = readKey(
		socialRaw,
		'descriptionField',
		readString(1, Infinity),
		`${base}/descriptionField`,
		`social.descriptionField de "${type.name}" no es un texto no vacío; se ignora.`,
		warnings
	);
	let descriptionField: string | null = null; // SIN fallback (ver ResolvedSocialCardConfig)
	if (descriptionFieldRaw !== undefined) {
		const field = type.fields.find((f) => f.name === descriptionFieldRaw);
		if (field && (field.type === 'text' || field.type === 'richtext')) {
			descriptionField = descriptionFieldRaw;
		} else {
			warnings.push(socialDescriptionFieldInvalid(type.name, descriptionFieldRaw));
		}
	}

	const imageFieldRaw = readKey(
		socialRaw,
		'imageField',
		readString(1, Infinity),
		`${base}/imageField`,
		`social.imageField de "${type.name}" no es un texto no vacío; se ignora.`,
		warnings
	);
	let imageField: string | null = null; // SIN fallback (ver ResolvedSocialCardConfig)
	if (imageFieldRaw !== undefined) {
		const field = type.fields.find((f) => f.name === imageFieldRaw);
		if (field && field.type === 'file' && !field.multiple) {
			imageField = imageFieldRaw;
		} else {
			warnings.push(socialImageFieldInvalid(type.name, imageFieldRaw));
		}
	}

	const urlTemplateRaw = readKey(
		socialRaw,
		'urlTemplate',
		readPreviewUrlTemplate,
		`${base}/urlTemplate`,
		`social.urlTemplate de "${type.name}" no es una URL http(s) con placeholders válidos; se ignora.`,
		warnings
	);
	let urlTemplate = resolvedPreviewUrl; // cascada: manifiesto > previewUrl del tipo (§4.7)
	if (urlTemplateRaw !== undefined) {
		if (validatePreviewUrlPlaceholders(urlTemplateRaw, type.fields)) {
			urlTemplate = urlTemplateRaw;
		} else {
			warnings.push(socialUrlInvalid(type.name));
		}
	}

	return { titleField, descriptionField, imageField, urlTemplate };
}

// ————— Colección —————

function resolveContentType(
	type: ContentType,
	collectionRawValue: JsonValue | undefined,
	locales: LocalesDeclaration | undefined,
	knownIcons: readonly string[] | undefined,
	navOrderByType: Map<string, number | undefined>,
	typesByName: Map<string, ContentType>,
	accessBypass: boolean,
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

	const subtitleFieldRaw = readKey(
		collectionRaw,
		'subtitleField',
		readString(1, Infinity),
		`${base}/subtitleField`,
		`subtitleField de "${type.name}" no es un texto no vacío; se ignora.`,
		warnings
	);
	const subtitleField = resolveSubtitleField(type.fields, subtitleFieldRaw, type.name, warnings);

	const slugFieldRaw = readKey(
		collectionRaw,
		'slugField',
		readString(1, Infinity),
		`${base}/slugField`,
		`slugField de "${type.name}" no es un texto no vacío; se ignora.`,
		warnings
	);
	const slugField = resolveSlugField(type.fields, slugFieldRaw, type.name, warnings);

	const orderFieldRaw = readKey(
		collectionRaw,
		'orderField',
		readString(1, Infinity),
		`${base}/orderField`,
		`orderField de "${type.name}" no es un texto no vacío; se ignora.`,
		warnings
	);
	const orderField = resolveOrderField(type.fields, orderFieldRaw, type.name, warnings);

	const defaultSortRaw = readKey(
		collectionRaw,
		'defaultSort',
		readDefaultSort,
		`${base}/defaultSort`,
		`defaultSort de "${type.name}" debe ser un objeto { field, dir } con dir "asc" o "desc"; se ignora.`,
		warnings
	);
	const defaultSort = resolveDefaultSort(type.fields, defaultSortRaw, type.name, warnings);

	const statusFieldRaw = readKey(
		collectionRaw,
		'statusField',
		readStatusFieldRaw,
		`${base}/statusField`,
		`statusField de "${type.name}" debe ser un texto no vacío o "false"; se ignora.`,
		warnings
	);
	const statusField = resolveStatusField(type.fields, statusFieldRaw, type.name, warnings);

	const statusLabelsRaw = readKey(
		collectionRaw,
		'statusLabels',
		readStatusLabels,
		`${base}/statusLabels`,
		`statusLabels de "${type.name}" no es un objeto de valor→etiqueta (texto de 1 a 60 caracteres); se ignora.`,
		warnings
	);
	const statusLabels = resolveStatusLabels(
		type.fields,
		statusLabelsRaw,
		statusField,
		type.name,
		warnings
	);

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

	// ————— social (SEO/OG, lote "editor" Fase B) —————
	// DESPUÉS de `titleField`/`previewUrl`: las dos cascadas de `social` (título y URL) caen sobre
	// el valor YA resuelto de este mismo tipo, no sobre el crudo del manifiesto.
	const socialRaw = readKey(
		collectionRaw,
		'social',
		asJsonObject,
		`${base}/social`,
		`social de "${type.name}" no es un objeto; se ignora.`,
		warnings
	);
	const social =
		socialRaw === undefined
			? null
			: resolveSocialCard(type, socialRaw, titleField, previewUrl, warnings);

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
		`fieldGroups de "${type.name}" no es un array de nombres o { name, columns, placement } válidos; se ignora.`,
		warnings
	);
	const declaredFieldGroups = fieldGroupsDeclaration?.order ?? [];
	const columnsByGroupName = fieldGroupsDeclaration?.columnsByName ?? new Map<string, number>();
	const placementByGroupName =
		fieldGroupsDeclaration?.placementByName ?? new Map<string, FieldGroupPlacement>();

	// §4.9c: el raíl de hermanos del editor (mockup `aquelarre-detalle-post.html`, `.rail`), opt-in
	// como el resto de capacidades de render — sin la clave, `false` y el editor no cambia.
	const editorRail =
		readKey(
			collectionRaw,
			'editorRail',
			readBoolean,
			`${base}/editorRail`,
			`editorRail de "${type.name}" no es booleano; se ignora.`,
			warnings
		) ?? false;

	// ————— blocks (lote "editor" Fase A) —————
	const blocksRaw = readKey(
		collectionRaw,
		'blocks',
		readBlocksDeclaration,
		`${base}/blocks`,
		`blocks de "${type.name}" debe ser un objeto { collection, parentField, orderField } de textos no vacíos; se ignora.`,
		warnings
	);
	const blocks = resolveBlocks(type, blocksRaw, typesByName, warnings);

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

	// §4.9b/§4.9c: `columns`/`placement` viajan aparte de `orderByGroups` (que solo ordena NOMBRES,
	// compartido con nav) — se cosen aquí sobre el orden ya resuelto. El grupo anónimo (`null`)
	// SIEMPRE es `columns: 1` + `placement: 'main'`: no hay clave de manifiesto que lo declare (no
	// tiene nombre al que colgar nada), y es justo el grupo donde caen título/slug/cuerpo.
	const fieldGroups: ResolvedFieldGroup[] = fieldGroupNames.map((name) => ({
		name,
		columns: ((name !== null ? columnsByGroupName.get(name) : undefined) ?? 1) as 1 | 2 | 3,
		placement: (name !== null ? placementByGroupName.get(name) : undefined) ?? 'main'
	}));
	const localization = resolveLocalization(
		type.name,
		collectionRaw,
		locales,
		orderedFields,
		warnings
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
		// `#lote-shell`: reglas del backend + bypass de la sesión, ya compuestos (`resolvePermissions`
		// pliega `readonly` dentro). Es lo ÚNICO que la UI debe consultar para decidir si ofrece
		// crear/editar/borrar; `readonly` se queda para el rótulo "Solo lectura", que describe la
		// naturaleza de la colección y no un permiso.
		permissions: resolvePermissions(type, accessBypass),
		titleField,
		subtitleField,
		slugField,
		orderField,
		defaultSort,
		statusField,
		statusLabels,
		previewUrl,
		fields: orderedFields,
		listFields,
		fieldGroups,
		editorRail,
		localization,
		blocks,
		social
	};
}

function resolveLocalization(
	collection: string,
	collectionRaw: JsonObject | undefined,
	locales: LocalesDeclaration | undefined,
	fields: readonly ResolvedField[],
	warnings: ModelWarning[]
): ResolvedLocalization | null {
	if (!collectionRaw || !('localizedFields' in collectionRaw)) return null;
	const base = `/collections/${collection}/localizedFields`;
	const localizedRaw = asJsonObject(collectionRaw.localizedFields);
	if (!localizedRaw) {
		warnings.push(
			manifestInvalidKey(base, `localizedFields de "${collection}" no es un objeto; se ignora.`)
		);
		return null;
	}
	if (!locales) {
		warnings.push(
			manifestInvalidKey(
				base,
				`"${collection}" declara campos traducibles pero la raíz locales no es válida; se ignoran.`
			)
		);
		return null;
	}

	const fieldsByName = new Map(fields.map((field) => [field.name, field]));
	const fieldOrder = new Map(fields.map((field, index) => [field.name, index]));
	const usedPhysicalFields = new Set<string>();
	const resolved: ResolvedLocalizedField[] = [];

	// Orden alfabético para que los warnings y la resolución no dependan del orden de claves JSON.
	for (const logicalName of Object.keys(localizedRaw).sort((a, b) => a.localeCompare(b))) {
		const path = `${base}/${logicalName}`;
		const declaration = asJsonObject(localizedRaw[logicalName]);
		const mappings = declaration ? asJsonObject(declaration.fields) : undefined;
		if (!declaration || !mappings) {
			warnings.push(
				manifestInvalidKey(
					path,
					`El campo traducible "${logicalName}" debe declarar un objeto fields; se ignora.`
				)
			);
			continue;
		}

		const unknownLocales = Object.keys(mappings)
			.filter((locale) => !locales.locales.some((item) => item.id === locale))
			.sort((a, b) => a.localeCompare(b));
		for (const locale of unknownLocales) {
			warnings.push(
				manifestInvalidKey(
					`${path}/fields/${locale}`,
					`El idioma "${locale}" no está declarado en locales.available; se ignora este campo traducible.`
				)
			);
		}

		const physicalByLocale: Record<string, string> = {};
		const groupPhysicalFields = new Set<string>();
		let valid = unknownLocales.length === 0;
		for (const locale of locales.locales) {
			const physicalName = mappings[locale.id];
			if (typeof physicalName !== 'string' || physicalName.length < 1) {
				warnings.push(
					manifestInvalidKey(
						`${path}/fields/${locale.id}`,
						`Falta el campo físico para el idioma "${locale.id}"; se ignora "${logicalName}".`
					)
				);
				valid = false;
				continue;
			}
			const physicalField = fieldsByName.get(physicalName);
			if (!physicalField) {
				warnings.push(
					manifestInvalidKey(
						`${path}/fields/${locale.id}`,
						`El campo "${physicalName}" no existe en "${collection}"; se ignora "${logicalName}".`
					)
				);
				valid = false;
				continue;
			}
			if (usedPhysicalFields.has(physicalName)) {
				warnings.push(
					manifestInvalidKey(
						`${path}/fields/${locale.id}`,
						`El campo "${physicalName}" ya pertenece a otro campo traducible; se ignora "${logicalName}".`
					)
				);
				valid = false;
			}
			if (groupPhysicalFields.has(physicalName)) {
				warnings.push(
					manifestInvalidKey(
						`${path}/fields/${locale.id}`,
						`El campo "${physicalName}" ya está asignado a otro idioma de "${logicalName}"; se ignora el grupo traducible.`
					)
				);
				valid = false;
			}
			groupPhysicalFields.add(physicalName);
			physicalByLocale[locale.id] = physicalName;
		}
		if (!valid) continue;

		const anchorName = physicalByLocale[locales.defaultLocale];
		const anchor = fieldsByName.get(anchorName);
		if (!anchor) continue;
		const compatible = locales.locales.every((locale) => {
			const field = fieldsByName.get(physicalByLocale[locale.id]);
			return (
				field?.schema.type === anchor.schema.type &&
				field.widget === anchor.widget &&
				field.subtype === anchor.subtype
			);
		});
		if (!compatible) {
			warnings.push(
				manifestInvalidKey(
					path,
					`Los campos físicos de "${logicalName}" no usan el mismo tipo/widget; se ignora el grupo traducible.`
				)
			);
			continue;
		}

		const rawLabel = declaration.label;
		if (rawLabel !== undefined && (typeof rawLabel !== 'string' || rawLabel.length < 1)) {
			warnings.push(
				manifestInvalidKey(`${path}/label`, `label de "${logicalName}" no es válido; se ignora.`)
			);
			continue;
		}
		for (const physicalName of Object.values(physicalByLocale)) {
			usedPhysicalFields.add(physicalName);
		}
		resolved.push({
			name: logicalName,
			label: typeof rawLabel === 'string' ? rawLabel : anchor.label,
			fields: physicalByLocale
		});
	}

	resolved.sort(
		(a, b) =>
			(fieldOrder.get(a.fields[locales.defaultLocale]) ?? Number.MAX_SAFE_INTEGER) -
			(fieldOrder.get(b.fields[locales.defaultLocale]) ?? Number.MAX_SAFE_INTEGER)
	);
	return resolved.length > 0
		? { defaultLocale: locales.defaultLocale, locales: locales.locales, fields: resolved }
		: null;
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
