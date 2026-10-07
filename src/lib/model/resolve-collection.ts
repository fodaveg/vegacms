/** Resolución de una colección: metadatos, convenciones y campos del esquema. */
import type { ContentType, Field, JsonValue } from '$lib/backend/types';
import { isReservedCollectionName } from '$lib/backend/collections';
import { resolvePermissions } from '$lib/backend/access';
import type {
	FieldGroupPlacement,
	ModelWarning,
	ResolvedContentType,
	ResolvedField,
	ResolvedFieldGroup,
	ResolvedLocalization,
	ResolvedLocalizedField
} from './types';
import {
	defaultListable,
	humanizeLabel,
	orderByGroups,
	resolveDefaultSort,
	resolveOrderField,
	resolvePublishAtField,
	resolveSlugField,
	resolveStatusField,
	resolveStatusLabels,
	resolveSubtitleField,
	resolveTitleField,
	resolveWidget
} from './conventions';
import { validatePreviewUrlPlaceholders } from './preview-url';
import { resolveBlocks } from './resolve-blocks';
import { resolvePage, resolveSocialCard } from './resolve-presentation';
import {
	asJsonObject,
	readBlocksDeclaration,
	readBoolean,
	readDefaultSort,
	readFieldGroups,
	readKey,
	readNonNegativeInt,
	readObjectOrWarn,
	readPageDeclaration,
	readPreviewUrlTemplate,
	readStatusFieldRaw,
	readStatusLabels,
	readString,
	readStringArray,
	type JsonObject,
	type LocalesDeclaration,
	type RawPageDeclaration
} from './resolve-readers';
import {
	iconUnknown,
	listFieldUnknown,
	manifestInvalidKey,
	orphanField,
	previewUrlInvalid,
	singletonInvalid
} from './warnings';

// ————— Colección —————

export function resolveContentType(
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
	const collectionRaw = readObjectOrWarn(
		collectionRawValue,
		base,
		`La configuración de "${type.name}" no es un objeto; se ignora.`,
		warnings
	);

	// El orden de estos pasos también es el orden de warnings del contrato de P2.
	const { hidden, label, labelSingular, icon, group, singleton } = resolveCollectionIdentity(
		type,
		collectionRaw,
		knownIcons,
		navOrderByType,
		warnings
	);
	const {
		titleField,
		subtitleField,
		slugField,
		orderField,
		defaultSort,
		statusField,
		statusLabels,
		publishAtField,
		previewUrl,
		social,
		pageRaw
	} = resolveCollectionConventions(type, collectionRaw, warnings);
	const { orderedFields, listFields, fieldGroups, editorRail, localization, blocks, page } =
		resolveCollectionFields(
			type,
			collectionRaw,
			locales,
			typesByName,
			titleField,
			statusField,
			pageRaw,
			warnings
		);

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
		publishAtField,
		previewUrl,
		fields: orderedFields,
		listFields,
		fieldGroups,
		editorRail,
		localization,
		blocks,
		social,
		page
	};
}

/** Visibilidad y metadatos de navegación; registra el orden sin resolver campos. */
function resolveCollectionIdentity(
	type: ContentType,
	collectionRaw: JsonObject | undefined,
	knownIcons: readonly string[] | undefined,
	navOrderByType: Map<string, number | undefined>,
	warnings: ModelWarning[]
) {
	const base = `/collections/${type.name}`;
	const reserved = isReservedCollectionName(type.name);
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

	return { hidden, label, labelSingular, icon, group, singleton };
}

/** Convenciones y capacidades que preceden a la lectura de campos. */
function resolveCollectionConventions(
	type: ContentType,
	collectionRaw: JsonObject | undefined,
	warnings: ModelWarning[]
) {
	const base = `/collections/${type.name}`;
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

	const publishAtFieldRaw = readKey(
		collectionRaw,
		'publishAtField',
		readString(1, Infinity),
		`${base}/publishAtField`,
		`publishAtField de "${type.name}" no es un texto no vacío; se ignora.`,
		warnings
	);
	const publishAtField = resolvePublishAtField(
		type.fields,
		publishAtFieldRaw,
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

	// ————— page (modelo de páginas, tarea p1 `1dc63001`) —————
	// La LECTURA (forma cruda) va aquí, junto al resto de claves de nivel de colección — igual que
	// siempre. La RESOLUCIÓN (`resolvePage`, con warnings de contenido) se aplaza a DESPUÉS de
	// `localization` más abajo: `pathField` puede nombrar un campo LÓGICO de `localizedFields`
	// (ruta bilingüe), así que necesita el `ResolvedLocalization` YA resuelto de este mismo tipo
	// para poder mirarlo — `page` sigue sin derivar NADA de `slugField`/`statusField`/`social`/
	// `previewUrl` (ver la cabecera de `ResolvedContentType.page`), esto es solo orden de cómputo.
	const pageRaw = readKey(
		collectionRaw,
		'page',
		readPageDeclaration,
		`${base}/page`,
		`page de "${type.name}" debe ser un objeto { pathField, layoutField? } con pathField un texto no vacío; se ignora.`,
		warnings
	);

	return {
		titleField,
		subtitleField,
		slugField,
		orderField,
		defaultSort,
		statusField,
		statusLabels,
		publishAtField,
		previewUrl,
		social,
		pageRaw
	};
}

/** Campos, grupos y capacidades dependientes de localización; page se resuelve al final. */
function resolveCollectionFields(
	type: ContentType,
	collectionRaw: JsonObject | undefined,
	locales: LocalesDeclaration | undefined,
	typesByName: Map<string, ContentType>,
	titleField: string | null,
	statusField: string | null,
	pageRaw: RawPageDeclaration | undefined,
	warnings: ModelWarning[]
) {
	const base = `/collections/${type.name}`;
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

	// `page`, resolución (ver el comentario de la LECTURA más arriba): necesita `localization` ya
	// resuelto para poder probar `pathField` como campo lógico cuando no resuelve como columna
	// física.
	const page = resolvePage(type, pageRaw, localization, warnings);

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

	return { orderedFields, listFields, fieldGroups, editorRail, localization, blocks, page };
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
