/** Lectura tolerante de las formas del manifiesto; cada error de forma degrada por clave. */
import type { JsonValue } from '$lib/backend/types';
import type { FieldGroupPlacement, ModelWarning, ResolvedLocale } from './types';
import { manifestInvalidKey } from './warnings';

// ————— Lectura tolerante de JSON (§5) —————

export type JsonObject = Record<string, JsonValue>;

export function asJsonObject(value: JsonValue | undefined): JsonObject | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as JsonObject)
		: undefined;
}

export function readString(min: number, max: number) {
	return (raw: JsonValue): string | undefined =>
		typeof raw === 'string' && raw.length >= min && raw.length <= max ? raw : undefined;
}

export function readBoolean(raw: JsonValue): boolean | undefined {
	return typeof raw === 'boolean' ? raw : undefined;
}

export function readNonNegativeInt(raw: JsonValue): number | undefined {
	return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : undefined;
}

export function readStringArray(minItemLength: number) {
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
export function readFieldGroups(raw: JsonValue): FieldGroupsDeclaration | undefined {
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

export interface LocalesDeclaration {
	defaultLocale: string;
	locales: ResolvedLocale[];
}

const LOCALE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Lee la declaración raíz de idiomas como una unidad: el orden de `available` es intencional
 * (orden de tabs), los ids deben ser únicos y `default` debe existir dentro de la lista.
 */
export function readLocales(raw: JsonValue): LocalesDeclaration | undefined {
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

export function readStatusFieldRaw(raw: JsonValue): string | false | undefined {
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
export function readStatusLabels(raw: JsonValue): Record<string, string> | undefined {
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
export function readDefaultSort(
	raw: JsonValue
): { field: string; dir: 'asc' | 'desc' } | undefined {
	const obj = asJsonObject(raw);
	if (!obj) return undefined;
	const field = obj.field;
	const dir = obj.dir;
	if (typeof field !== 'string' || field.length < 1) return undefined;
	if (dir !== 'asc' && dir !== 'desc') return undefined;
	return { field, dir };
}

export function readPreviewUrlTemplate(raw: JsonValue): string | undefined {
	return typeof raw === 'string' && /^https?:\/\//.test(raw) ? raw : undefined;
}

/** Forma cruda de `collections.<c>.blocks`, SOLO tipada — el CONTENIDO (¿existe la colección? ¿el
 *  campo es una relación? ¿el orden es numérico?) lo valida `resolveBlocks`, que es quien conoce
 *  el esquema de la colección hija. */
export interface RawBlocksDeclaration {
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
export function readBlocksDeclaration(raw: JsonValue): RawBlocksDeclaration | undefined {
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

/** Forma cruda de `collections.<c>.page` (modelo de páginas, tarea p1 `1dc63001`), SOLO tipada —
 *  el CONTENIDO (¿`pathField` es un campo `text` real de esta colección? ¿tiene índice único?
 *  ¿`layoutField` es un `text` real?) lo valida `resolvePage`, que es quien conoce el esquema del
 *  tipo. */
export interface RawPageDeclaration {
	/** Valor CRUDO de `pathField`, ya sabido un texto no vacío (`readPageDeclaration` lo exige).
	 *  Que ese texto sea además un campo `text` REAL de la colección es contenido, no forma. */
	pathFieldRaw: string;
	/** Valor CRUDO de `layoutField`, SIN tipar aquí a propósito — mismo criterio que
	 *  `typeFieldRaw`/`dataFieldRaw` de `RawBlocksDeclaration`: es opcional y degrada SOLA
	 *  (`resolvePage` decide), nunca puede tumbar `pathField`. `undefined` = la clave no se
	 *  declaró en el manifiesto. */
	layoutFieldRaw: JsonValue | undefined;
}

/**
 * Lee `collections.<c>.page` (modelo de páginas, tarea p1 `1dc63001`): `pathField` es
 * OBLIGATORIO — un objeto al que le falte o que lo declare con forma inválida (no texto no
 * vacío) no es una declaración parcial válida, es `undefined` (mismo criterio "todo o nada" que
 * `readBlocksDeclaration` sobre sus tres claves), y el llamador (`readKey`) descarta `page`
 * entero con un solo `manifest-invalid-key`. `layoutField` viaja tal cual, SIN ese criterio: es
 * opcional y su validación de contenido vive en `resolvePage`.
 */
export function readPageDeclaration(raw: JsonValue): RawPageDeclaration | undefined {
	const obj = asJsonObject(raw);
	if (!obj) return undefined;
	const pathFieldRaw = obj.pathField;
	if (typeof pathFieldRaw !== 'string' || pathFieldRaw.length < 1) return undefined;
	return {
		pathFieldRaw,
		layoutFieldRaw: 'layoutField' in obj ? obj.layoutField : undefined
	};
}

/**
 * Lee `obj[key]` con `read`; si la clave está presente pero no pasa `read`, empuja
 * `manifest-invalid-key` con `path` y devuelve `undefined` (la cascada sigue como si la clave
 * no existiera, §5). Si la clave está ausente, devuelve `undefined` SIN warning
 * (forward-compat: nunca llegamos aquí para una clave desconocida, esas se ignoran antes).
 */
export function readKey<T>(
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
export function readObjectOrWarn(
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
