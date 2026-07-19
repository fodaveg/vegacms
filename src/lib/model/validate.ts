/**
 * Escritor ESTRICTO (§5/§6.3 del contrato, L4): valida un manifiesto contra el JSON Schema v1
 * (`manifest-schema.json`, §3) SIN admitir nada que ese schema no acepte —
 * `additionalProperties: false` en cada nivel, límites de `minLength`/`maxLength`/`maxItems`
 * exactos, `widget` restringido al vocabulario v1 y la clave raíz `snapshot` explícitamente
 * rechazada (reservada para el modo editor sin descubrimiento de esquema, §6.5).
 *
 * Implementación a mano (SIN `ajv` en runtime, ley de ligereza): este módulo replica a mano el
 * único schema que existe en el repo (`manifest-schema.json`), recorriéndolo nivel a nivel.
 * `ajv` solo entra como devDependency de test, como ORÁCULO que compara este validador contra
 * `manifest-schema.json` (§9.12) — nunca se importa desde aquí.
 *
 * Módulo PURO (L1): sin red, sin puerto, sin Svelte. `validateManifestStrict` es la única
 * función pública; el resto son helpers internos, uno por primitiva del schema.
 */

import type { JsonValue } from '$lib/backend/types';

export interface ManifestValidationErrorEntry {
	/** JSON Pointer a la clave ofensora (p.ej. '/collections/posts/fields/body/widget'). */
	path: string;
	/** Mensaje humano en español, accionable. */
	message: string;
}

export type ManifestValidationResult =
	{ ok: true } | { ok: false; errors: ManifestValidationErrorEntry[] };

type JsonObject = Record<string, JsonValue>;

const ROOT_ALLOWED_KEYS = ['schemaVersion', 'site', 'nav', 'collections'] as const;
const SITE_ALLOWED_KEYS = ['name', 'defaultTheme', 'locale'] as const;
const NAV_ALLOWED_KEYS = ['groups'] as const;
const COLLECTION_ALLOWED_KEYS = [
	'label',
	'labelSingular',
	'icon',
	'group',
	'order',
	'hidden',
	'singleton',
	'titleField',
	'statusField',
	'previewUrl',
	'listFields',
	'fieldGroups',
	'fields'
] as const;
const FIELD_ALLOWED_KEYS = [
	'label',
	'help',
	'placeholder',
	'order',
	'group',
	'hidden',
	'widget',
	'listable'
] as const;
/** Claves de la forma-objeto de un item de `fieldGroups` (§4.9b, rejilla de columnas). */
const FIELD_GROUP_ITEM_ALLOWED_KEYS = ['name', 'columns'] as const;

const PREVIEW_URL_PATTERN = /^https?:\/\//;

/**
 * API pública de P2 (§2, §6.3). Validación ESTRICTA del manifiesto v1: cualquier desviación
 * del schema §3 (clave desconocida, tipo/valor fuera de rango, `snapshot` en la raíz…) produce
 * al menos una entrada de `errors`. Pura: nunca lanza, nunca toca red.
 */
export function validateManifestStrict(raw: JsonValue): ManifestValidationResult {
	const errors: ManifestValidationErrorEntry[] = [];
	validateRoot(raw, errors);
	return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ————— Helpers genéricos —————

function isPlainObject(value: JsonValue): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(errors: ManifestValidationErrorEntry[], path: string, message: string): void {
	errors.push({ path, message });
}

/** `additionalProperties: false`: toda clave de `obj` fuera de `allowed` es un error. */
function checkAdditionalProperties(
	obj: JsonObject,
	allowed: readonly string[],
	basePath: string,
	errors: ManifestValidationErrorEntry[]
): void {
	for (const key of Object.keys(obj)) {
		if (!allowed.includes(key)) {
			fail(errors, `${basePath}/${key}`, `La clave "${key}" no está permitida en ${basePath}.`);
		}
	}
}

function stringRangeMessage(min: number, max: number): string {
	if (min <= 0 && max === Infinity) return 'debe ser un texto.';
	if (max === Infinity) {
		return `debe ser un texto de al menos ${min} carácter${min === 1 ? '' : 'es'}.`;
	}
	if (min <= 0) return `debe ser un texto de como máximo ${max} caracteres.`;
	return `debe ser un texto de entre ${min} y ${max} caracteres.`;
}

function checkString(
	value: JsonValue,
	path: string,
	min: number,
	max: number,
	errors: ManifestValidationErrorEntry[],
	label: string
): void {
	if (typeof value !== 'string' || value.length < min || value.length > max) {
		fail(errors, path, `${label} ${stringRangeMessage(min, max)}`);
	}
}

function checkBoolean(
	value: JsonValue,
	path: string,
	errors: ManifestValidationErrorEntry[],
	label: string
): void {
	if (typeof value !== 'boolean') fail(errors, path, `${label} debe ser verdadero o falso.`);
}

function checkNonNegativeInt(
	value: JsonValue,
	path: string,
	errors: ManifestValidationErrorEntry[],
	label: string
): void {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		fail(errors, path, `${label} debe ser un entero mayor o igual que 0.`);
	}
}

/** Entero acotado `[min, max]` (usado por `fieldGroups[].columns`, §4.9b). */
function checkIntInRange(
	value: JsonValue,
	path: string,
	min: number,
	max: number,
	errors: ManifestValidationErrorEntry[],
	label: string
): void {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
		fail(errors, path, `${label} debe ser un entero entre ${min} y ${max}.`);
	}
}

function checkEnum<T extends string>(
	value: JsonValue,
	allowed: readonly T[],
	path: string,
	errors: ManifestValidationErrorEntry[],
	label: string
): void {
	if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
		fail(errors, path, `${label} debe ser uno de: ${allowed.join(', ')}.`);
	}
}

/** Igualdad estructural de valores JSON, para `uniqueItems` (independiente de `items`). */
function jsonEquals(a: JsonValue, b: JsonValue): boolean {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((v, i) => jsonEquals(v, b[i]));
	}
	if (isPlainObject(a) && isPlainObject(b)) {
		const aKeys = Object.keys(a).sort();
		const bKeys = Object.keys(b).sort();
		return (
			aKeys.length === bKeys.length &&
			aKeys.every((k, i) => k === bKeys[i] && jsonEquals(a[k], b[k]))
		);
	}
	return false;
}

function hasDuplicates(items: readonly JsonValue[]): boolean {
	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			if (jsonEquals(items[i], items[j])) return true;
		}
	}
	return false;
}

interface StringArrayOpts {
	/** `minLength` de cada elemento (0 = sin mínimo, admite `''`). */
	minItemLength: number;
	maxItems?: number;
	uniqueItems?: boolean;
}

function checkStringArray(
	value: JsonValue,
	path: string,
	opts: StringArrayOpts,
	errors: ManifestValidationErrorEntry[],
	label: string
): void {
	if (!Array.isArray(value)) {
		fail(errors, path, `${label} debe ser un array.`);
		return;
	}
	if (opts.maxItems !== undefined && value.length > opts.maxItems) {
		fail(errors, path, `${label} no puede tener más de ${opts.maxItems} elementos.`);
	}
	value.forEach((el, i) => {
		if (typeof el !== 'string' || el.length < opts.minItemLength) {
			fail(
				errors,
				`${path}/${i}`,
				`${label}[${i}] debe ser un texto${opts.minItemLength > 0 ? ' no vacío' : ''}.`
			);
		}
	});
	if (opts.uniqueItems && hasDuplicates(value)) {
		fail(errors, path, `${label} no puede tener elementos repetidos.`);
	}
}

/**
 * `fieldGroups` (§4.9b): cada item es un string no vacío (forma de siempre, `uniqueItems`) o un
 * objeto `{ name, columns? }` — `oneOf` en el schema, así que un item que no case con NINGUNA de
 * las dos formas (objeto sin `name`, array anidado, número…) es inválido igual que un string
 * vacío. Replica a mano el mismo veredicto que `manifest-schema.json` (§9.12, oráculo ajv).
 */
function checkFieldGroups(
	value: JsonValue,
	path: string,
	errors: ManifestValidationErrorEntry[],
	label: string
): void {
	if (!Array.isArray(value)) {
		fail(errors, path, `${label} debe ser un array.`);
		return;
	}
	value.forEach((el, i) => {
		const itemPath = `${path}/${i}`;
		if (typeof el === 'string') {
			if (el.length < 1) fail(errors, itemPath, `${label}[${i}] no puede ser un texto vacío.`);
			return;
		}
		if (isPlainObject(el)) {
			checkAdditionalProperties(el, FIELD_GROUP_ITEM_ALLOWED_KEYS, itemPath, errors);
			if (!('name' in el)) {
				fail(errors, `${itemPath}/name`, `${label}[${i}] debe declarar "name".`);
			} else {
				checkString(el.name, `${itemPath}/name`, 1, Infinity, errors, `${label}[${i}].name`);
			}
			if ('columns' in el) {
				checkIntInRange(el.columns, `${itemPath}/columns`, 1, 3, errors, `${label}[${i}].columns`);
			}
			return;
		}
		fail(
			errors,
			itemPath,
			`${label}[${i}] debe ser un texto no vacío o un objeto { name, columns }.`
		);
	});
	if (hasDuplicates(value)) {
		fail(errors, path, `${label} no puede tener elementos repetidos.`);
	}
}

// ————— Raíz —————

function validateRoot(raw: JsonValue, errors: ManifestValidationErrorEntry[]): void {
	if (!isPlainObject(raw)) {
		fail(errors, '', 'El manifiesto debe ser un objeto JSON.');
		return;
	}

	for (const key of Object.keys(raw)) {
		if ((ROOT_ALLOWED_KEYS as readonly string[]).includes(key)) continue;
		if (key === 'snapshot') {
			fail(
				errors,
				'/snapshot',
				'La clave "snapshot" está reservada para el modo editor sin descubrimiento de esquema (v1.x); no es válida en el manifiesto v1.'
			);
		} else {
			fail(errors, `/${key}`, `La clave "${key}" no está permitida en la raíz del manifiesto.`);
		}
	}

	if (!('schemaVersion' in raw)) {
		fail(errors, '/schemaVersion', 'schemaVersion es obligatorio.');
	} else if (raw.schemaVersion !== 1) {
		fail(errors, '/schemaVersion', 'schemaVersion debe ser exactamente 1.');
	}

	if ('site' in raw) validateSite(raw.site, errors);
	if ('nav' in raw) validateNav(raw.nav, errors);
	if ('collections' in raw) validateCollections(raw.collections, errors);
}

function validateSite(value: JsonValue, errors: ManifestValidationErrorEntry[]): void {
	if (!isPlainObject(value)) {
		fail(errors, '/site', 'site debe ser un objeto.');
		return;
	}
	checkAdditionalProperties(value, SITE_ALLOWED_KEYS, '/site', errors);
	if ('name' in value) checkString(value.name, '/site/name', 1, 60, errors, 'site.name');
	if ('defaultTheme' in value) {
		checkString(value.defaultTheme, '/site/defaultTheme', 1, Infinity, errors, 'site.defaultTheme');
	}
	if ('locale' in value)
		checkEnum(value.locale, ['es', 'en'], '/site/locale', errors, 'site.locale');
}

function validateNav(value: JsonValue, errors: ManifestValidationErrorEntry[]): void {
	if (!isPlainObject(value)) {
		fail(errors, '/nav', 'nav debe ser un objeto.');
		return;
	}
	checkAdditionalProperties(value, NAV_ALLOWED_KEYS, '/nav', errors);
	if ('groups' in value) {
		checkStringArray(
			value.groups,
			'/nav/groups',
			{ minItemLength: 1, uniqueItems: true },
			errors,
			'nav.groups'
		);
	}
}

// ————— Colecciones —————

function validateCollections(value: JsonValue, errors: ManifestValidationErrorEntry[]): void {
	if (!isPlainObject(value)) {
		fail(errors, '/collections', 'collections debe ser un objeto.');
		return;
	}
	for (const [name, collectionValue] of Object.entries(value)) {
		validateCollection(name, collectionValue, errors);
	}
}

function validateCollection(
	name: string,
	value: JsonValue,
	errors: ManifestValidationErrorEntry[]
): void {
	const base = `/collections/${name}`;
	if (!isPlainObject(value)) {
		fail(errors, base, `La configuración de "${name}" debe ser un objeto.`);
		return;
	}
	checkAdditionalProperties(value, COLLECTION_ALLOWED_KEYS, base, errors);

	if ('label' in value)
		checkString(value.label, `${base}/label`, 1, 60, errors, `label de "${name}"`);
	if ('labelSingular' in value) {
		checkString(
			value.labelSingular,
			`${base}/labelSingular`,
			1,
			60,
			errors,
			`labelSingular de "${name}"`
		);
	}
	if ('icon' in value)
		checkString(value.icon, `${base}/icon`, 1, Infinity, errors, `icon de "${name}"`);
	if ('group' in value) {
		checkString(value.group, `${base}/group`, 1, Infinity, errors, `group de "${name}"`);
	}
	if ('order' in value)
		checkNonNegativeInt(value.order, `${base}/order`, errors, `order de "${name}"`);
	if ('hidden' in value)
		checkBoolean(value.hidden, `${base}/hidden`, errors, `hidden de "${name}"`);
	if ('singleton' in value) {
		checkBoolean(value.singleton, `${base}/singleton`, errors, `singleton de "${name}"`);
	}
	if ('titleField' in value) {
		checkString(
			value.titleField,
			`${base}/titleField`,
			1,
			Infinity,
			errors,
			`titleField de "${name}"`
		);
	}
	if ('statusField' in value) {
		validateStatusField(value.statusField, `${base}/statusField`, errors, name);
	}
	if ('previewUrl' in value) {
		validatePreviewUrl(value.previewUrl, `${base}/previewUrl`, errors, name);
	}
	if ('listFields' in value) {
		checkStringArray(
			value.listFields,
			`${base}/listFields`,
			{ minItemLength: 0, maxItems: 8, uniqueItems: true },
			errors,
			`listFields de "${name}"`
		);
	}
	if ('fieldGroups' in value) {
		checkFieldGroups(value.fieldGroups, `${base}/fieldGroups`, errors, `fieldGroups de "${name}"`);
	}
	if ('fields' in value) validateFields(name, value.fields, errors);
}

function validateStatusField(
	value: JsonValue,
	path: string,
	errors: ManifestValidationErrorEntry[],
	name: string
): void {
	if (value === false) return;
	if (typeof value === 'string' && value.length >= 1) return;
	fail(errors, path, `statusField de "${name}" debe ser un texto no vacío o el valor "false".`);
}

function validatePreviewUrl(
	value: JsonValue,
	path: string,
	errors: ManifestValidationErrorEntry[],
	name: string
): void {
	if (typeof value !== 'string' || !PREVIEW_URL_PATTERN.test(value)) {
		fail(
			errors,
			path,
			`previewUrl de "${name}" debe ser una URL que empiece por http:// o https://.`
		);
	}
}

// ————— Campos —————

function validateFields(
	collection: string,
	value: JsonValue,
	errors: ManifestValidationErrorEntry[]
): void {
	const base = `/collections/${collection}/fields`;
	if (!isPlainObject(value)) {
		fail(errors, base, `fields de "${collection}" debe ser un objeto.`);
		return;
	}
	for (const [fieldName, fieldValue] of Object.entries(value)) {
		validateField(collection, fieldName, fieldValue, errors);
	}
}

function validateField(
	collection: string,
	fieldName: string,
	value: JsonValue,
	errors: ManifestValidationErrorEntry[]
): void {
	const base = `/collections/${collection}/fields/${fieldName}`;
	if (!isPlainObject(value)) {
		fail(errors, base, `El campo "${fieldName}" de "${collection}" debe ser un objeto.`);
		return;
	}
	checkAdditionalProperties(value, FIELD_ALLOWED_KEYS, base, errors);

	const label = `"${fieldName}" (${collection})`;
	if ('label' in value)
		checkString(value.label, `${base}/label`, 1, 60, errors, `label de ${label}`);
	if ('help' in value) checkString(value.help, `${base}/help`, 0, 300, errors, `help de ${label}`);
	if ('placeholder' in value) {
		checkString(
			value.placeholder,
			`${base}/placeholder`,
			0,
			120,
			errors,
			`placeholder de ${label}`
		);
	}
	if ('order' in value)
		checkNonNegativeInt(value.order, `${base}/order`, errors, `order de ${label}`);
	if ('group' in value)
		checkString(value.group, `${base}/group`, 1, Infinity, errors, `group de ${label}`);
	if ('hidden' in value) checkBoolean(value.hidden, `${base}/hidden`, errors, `hidden de ${label}`);
	if ('widget' in value) {
		checkEnum(
			value.widget,
			['textarea', 'markdown'],
			`${base}/widget`,
			errors,
			`widget de ${label}`
		);
	}
	if ('listable' in value)
		checkBoolean(value.listable, `${base}/listable`, errors, `listable de ${label}`);
}
