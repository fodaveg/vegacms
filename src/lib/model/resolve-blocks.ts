/** Resolución de bloques embebidos y del vocabulario raíz de tipos de bloque. */
import type { ContentType, JsonValue } from '$lib/backend/types';
import { isReservedCollectionName } from '$lib/backend/collections';
import type {
	ModelWarning,
	ResolvedBlockField,
	ResolvedBlocksConfig,
	ResolvedBlockType,
	WidgetId
} from './types';
import { BLOCK_FIELD_WIDGET_IDS } from './types';
import { resolveBlockFieldDefault } from './block-field-schema';
import {
	asJsonObject,
	readKey,
	readString,
	readStringArray,
	type JsonObject,
	type RawBlocksDeclaration
} from './resolve-readers';
import {
	blocksHeterogeneousInvalid,
	blocksInvalid,
	blockTypeFieldDefaultInvalid,
	blockTypeFieldInvalid,
	blockTypeIconUnknown,
	blockTypeInvalid,
	manifestInvalidKey
} from './warnings';

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
export function resolveBlocks(
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
export function resolveBlockTypes(
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
	// `name` identifica el campo lógico del formulario y direcciona tanto su valor como sus errores:
	// en `source: 'data'` es una clave del JSON y en `source: 'record'` una columna real. Repetirlo,
	// incluso entre fuentes distintas, deja dos filas compitiendo por el mismo identificador y hace
	// ambiguo el consumidor. La unicidad es global dentro del tipo; gana el PRIMERO porque el orden
	// de `fields` es el del formulario.
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
 * `widget` son obligatorios: si CUALQUIERA falta o tiene forma inválida, o `relation`/`file`
 * aparecen sin `source: 'record'`, el campo se descarta SOLO (`block-type-field-invalid`) y el
 * tipo de bloque sigue con el resto. `source` ausente cae a `'data'`; una forma inválida cae al
 * mismo default con `manifest-invalid-key`. `required`/`options` siguen el mismo criterio laxo.
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

	const rawSource = obj?.source;
	let source: 'data' | 'record' = 'data';
	if (rawSource !== undefined) {
		if (rawSource === 'data' || rawSource === 'record') {
			source = rawSource;
		} else {
			warnings.push(
				manifestInvalidKey(
					`${base}/source`,
					`source del campo ${index} de blockTypes.${typeName} debe ser "data" o "record"; se usa "data".`
				)
			);
		}
	}

	const rawWidget = obj?.widget;
	const widget =
		typeof rawWidget === 'string' &&
		(BLOCK_FIELD_WIDGET_IDS as readonly string[]).includes(rawWidget)
			? (rawWidget as WidgetId)
			: undefined;

	if (
		name === undefined ||
		label === undefined ||
		widget === undefined ||
		((widget === 'relation' || widget === 'file') && source !== 'record')
	) {
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

	const resolvedField: ResolvedBlockField = {
		name,
		label,
		widget,
		source,
		required,
		options
	};

	if (obj && Object.hasOwn(obj, 'default')) {
		const resolvedDefault = resolveBlockFieldDefault(resolvedField, obj.default);
		if (resolvedDefault.status === 'value') {
			resolvedField.default = resolvedDefault.value;
		} else if (resolvedDefault.status === 'invalid') {
			warnings.push(blockTypeFieldDefaultInvalid(typeName, index, name));
		}
	}

	return resolvedField;
}
