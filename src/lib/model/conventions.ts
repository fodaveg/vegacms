/**
 * Funciones puras y deterministas que implementan las convenciones de la §4 del contrato P2:
 * humanización de labels, cascada de campo-título, convención de publicación, tabla de
 * widget por tipo, `listable` por defecto y el ordenado de grupos+items (nav y campos, misma
 * regla). Ninguna función de este módulo lanza ni depende de nada externo (L1); las que
 * pueden degradar una opinión del manifiesto reciben un `warnings: ModelWarning[]` donde
 * empujan el warning correspondiente (mismo patrón que `collectFilterErrors` en `query.ts`).
 */

import type { Field, JsonValue } from '$lib/backend/types';
import type { ModelWarning, WidgetId } from './types';
import {
	manifestInvalidKey,
	orderFieldInvalid,
	statusFieldInvalid,
	titleFieldInvalid,
	widgetIncompatible
} from './warnings';

// ————— 4.8 Humanización de labels —————

/**
 * Humaniza un nombre técnico (`blog_posts` → "Blog posts", `publishedAt` → "Published at"),
 * algoritmo exacto de §4.8, paso a paso:
 * 1. `_`/`-` (y secuencias) → espacio.
 * 2. Inserta espacio en fronteras camelCase (minúscula/dígito seguido de mayúscula).
 * 3. Todo a minúsculas.
 * 4. Primera letra a mayúscula.
 * 5. Colapsa espacios y recorta.
 * Sin heurísticas de plural/singular (anglocéntricas y falibles): eso lo decide `labelSingular`
 * por separado (default = `label`, sin tocar aquí).
 */
export function humanizeLabel(raw: string): string {
	let s = raw.replace(/[_-]+/g, ' ');
	s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
	s = s.toLowerCase();
	s = s.replace(/\s+/g, ' ').trim();
	if (s.length === 0) return s;
	return s.charAt(0).toUpperCase() + s.slice(1);
}

// ————— 4.4 Campo-título —————

/** "Representable" (§4.4): se pinta como una línea de texto sin transformar. */
export function isRepresentableField(field: Field): boolean {
	return field.type === 'text' || field.type === 'email' || field.type === 'url';
}

/**
 * Cascada de campo-título (§4.4, 6 pasos). `manifestTitleField` es el valor crudo de
 * `collections.<c>.titleField` tal cual llega del manifiesto tolerante (string si la clave
 * tiene el tipo correcto, `undefined` si está ausente o tiene un tipo inválido — ese último
 * caso ya generó su warning `manifest-invalid-key` en el llamador antes de invocar esto).
 */
export function resolveTitleField(
	fields: Field[],
	manifestTitleField: string | undefined,
	collection: string,
	warnings: ModelWarning[]
): string | null {
	if (manifestTitleField !== undefined) {
		const field = fields.find((f) => f.name === manifestTitleField);
		if (field && isRepresentableField(field)) return manifestTitleField;
		warnings.push(titleFieldInvalid(collection, manifestTitleField));
	}

	const titleField = fields.find((f) => f.name === 'title');
	if (titleField && isRepresentableField(titleField)) return 'title';

	const nameField = fields.find((f) => f.name === 'name');
	if (nameField && isRepresentableField(nameField)) return 'name';

	const presentableField = fields.find((f) => f.presentable && isRepresentableField(f));
	if (presentableField) return presentableField.name;

	const firstText = fields.find((f) => f.type === 'text');
	if (firstText) return firstText.name;

	return null;
}

// ————— 4.5 Convención de publicación —————

/** `true` si el campo cumple la convención de publicación: select simple con `draft`+`published`. */
function isValidStatusField(field: Field | undefined): boolean {
	return (
		!!field &&
		field.type === 'select' &&
		!field.multiple &&
		field.options.includes('draft') &&
		field.options.includes('published')
	);
}

/**
 * Convención de publicación (§4.5). `manifestStatusField` es el valor crudo ya tipado por el
 * llamador: `false` (desactiva), `string` (nombre de campo) o `undefined` (ausente/inválido).
 */
export function resolveStatusField(
	fields: Field[],
	manifestStatusField: string | false | undefined,
	collection: string,
	warnings: ModelWarning[]
): string | null {
	if (manifestStatusField === false) return null;

	if (manifestStatusField !== undefined) {
		const field = fields.find((f) => f.name === manifestStatusField);
		if (isValidStatusField(field)) return manifestStatusField;
		warnings.push(statusFieldInvalid(collection, manifestStatusField));
	}

	const statusField = fields.find((f) => f.name === 'status');
	if (isValidStatusField(statusField)) return 'status';

	return null;
}

// ————— Orden manual (reorder) —————

/**
 * Resuelve `orderField` (campo numérico de orden manual). A diferencia de `resolveStatusField`,
 * NO hay convención de nombre ni autodetección: el reorder manual solo se activa si el
 * manifiesto lo declara EXPLÍCITAMENTE. `manifestOrderField` es el valor crudo ya tipado por el
 * llamador (string si la clave tiene el tipo correcto, `undefined` si está ausente o inválida —
 * ese caso ya generó su `manifest-invalid-key` en el llamador).
 */
export function resolveOrderField(
	fields: Field[],
	manifestOrderField: string | undefined,
	collection: string,
	warnings: ModelWarning[]
): string | null {
	if (manifestOrderField === undefined) return null;

	const field = fields.find((f) => f.name === manifestOrderField);
	if (field && field.type === 'number') return manifestOrderField;

	warnings.push(orderFieldInvalid(collection, manifestOrderField));
	return null;
}

/**
 * Orden manual EFECTIVO de una source de vista fusionada (L7a): el `orderField` declarado en la
 * propia source tiene prioridad sobre el heredado a nivel de vista; si ninguno de los dos aplica,
 * o el nombre no resuelve a un campo `number` real de `fields`, no hay orden posible (`null`) —
 * el llamador (`resolve.ts`) descarta la source entera, no existe aquí un "campo no ordenable
 * pero source válida" a diferencia de `resolveOrderField` (§ colección, donde el reorder es
 * opcional). Misma condición de validez que `resolveOrderField`, replicada en vez de reutilizada
 * porque el warning que emite el llamador es otro (`merged-source-order-invalid`, no
 * `order-field-invalid`) y con un `requestedField` que puede ser `null` (ausente en los dos
 * niveles), caso que `resolveOrderField` no contempla.
 */
export function resolveMergedSourceOrderField(
	fields: Field[],
	sourceOrderField: string | undefined,
	viewOrderField: string | undefined
): string | null {
	const candidate = sourceOrderField ?? viewOrderField;
	if (candidate === undefined) return null;
	const field = fields.find((f) => f.name === candidate);
	return field && field.type === 'number' ? candidate : null;
}

// ————— 4.2 Widget por tipo —————

/** Widget por defecto de la tabla §4.2, sin considerar overrides del manifiesto. */
function defaultWidgetFor(field: Field): WidgetId {
	switch (field.type) {
		case 'text':
			return 'text';
		case 'richtext':
			return 'richtext';
		case 'number':
			return 'number';
		case 'bool':
			return 'switch';
		case 'email':
			return 'email';
		case 'url':
			return 'url';
		case 'date':
			return 'datetime';
		case 'select':
			return field.multiple ? 'chips' : 'select';
		case 'relation':
			return 'relation';
		case 'file':
			return 'file';
		case 'json':
			return 'json';
		case 'unsupported':
			return 'unsupported';
	}
}

/** `subtype` efectivo por defecto (sin override): `null` para tipos sin subtype. */
function defaultSubtypeFor(field: Field): 'plain' | 'html' | 'markdown' | null {
	if (field.type === 'text') return 'plain';
	if (field.type === 'richtext') return 'html';
	return null;
}

export interface WidgetResolution {
	widget: WidgetId;
	subtype: 'plain' | 'html' | 'markdown' | null;
}

/**
 * Resuelve `widget`+`subtype` efectivos de un campo (§4.2, §4.3, L9). `manifestWidget` es el
 * valor CRUDO de `collections.<c>.fields.<f>.widget` (cualquier `JsonValue`, `undefined` si la
 * clave está ausente): solo `'textarea'`/`'markdown'` son overrides reales del schema v1; otro
 * valor es una clave inválida (`manifest-invalid-key`), no un "override incompatible". El
 * único mecanismo para promocionar a markdown es este override sobre un campo `text`/`plain`
 * (§4.3): garantiza el invariante bidireccional L9 por construcción.
 */
export function resolveWidget(
	field: Field,
	manifestWidget: JsonValue | undefined,
	collection: string,
	warnings: ModelWarning[]
): WidgetResolution {
	const defaultWidget = defaultWidgetFor(field);
	const defaultSubtype = defaultSubtypeFor(field);

	if (manifestWidget === undefined) {
		return { widget: defaultWidget, subtype: defaultSubtype };
	}

	if (manifestWidget !== 'textarea' && manifestWidget !== 'markdown') {
		warnings.push(
			manifestInvalidKey(
				`/collections/${collection}/fields/${field.name}/widget`,
				`El valor de widget para "${field.name}" de "${collection}" no es "textarea" ni "markdown"; se ignora.`
			)
		);
		return { widget: defaultWidget, subtype: defaultSubtype };
	}

	if (field.type === 'text' && field.subtype === 'plain') {
		return manifestWidget === 'textarea'
			? { widget: 'textarea', subtype: 'plain' }
			: { widget: 'markdown', subtype: 'markdown' };
	}

	warnings.push(widgetIncompatible(collection, field.name, manifestWidget));
	return { widget: defaultWidget, subtype: defaultSubtype };
}

// ————— 4.10 Columnas listables —————

/** `listable` por defecto según el tipo real del campo (§4.10), antes de aplicar `hidden`. */
export function defaultListable(field: Field): boolean {
	switch (field.type) {
		case 'text':
		case 'number':
		case 'bool':
		case 'email':
		case 'url':
		case 'date':
			return true;
		case 'select':
			return !field.multiple;
		case 'richtext':
		case 'json':
		case 'file':
		case 'relation':
		case 'unsupported':
			return false;
	}
}

// ————— 4.9 Orden y grupos (misma regla para nav y campos) —————

export interface GroupOrderResult<T> {
	/** `items`, en orden efectivo (grupo → order explícito asc → orden base). */
	orderedItems: T[];
	/** Grupos presentes, en orden de render; `null` = grupo anónimo (siempre primero si hay). */
	groupOrder: (string | null)[];
}

/**
 * Regla única de orden y grupos (§4.9), aplicada tanto a tipos (nav) como a campos
 * (formulario): grupo anónimo primero → grupos declarados en su orden de declaración → grupos
 * referenciados pero no declarados, alfabético. Dentro de cada grupo: `order` explícito
 * ascendente (empate → orden base) antes que el resto, que sigue el orden base (el orden de
 * `items` de entrada, que YA es "orden de esquema"/"alfabético" según lo entregue P1).
 */
export function orderByGroups<T>(
	items: readonly T[],
	getGroup: (item: T) => string | null,
	getOrder: (item: T) => number | undefined,
	declaredGroupOrder: readonly string[]
): GroupOrderResult<T> {
	const presentGroups = new Set<string | null>();
	for (const item of items) presentGroups.add(getGroup(item));

	const hasAnonymous = presentGroups.has(null);
	const nonNullPresent = [...presentGroups].filter((g): g is string => g !== null);
	// Deduplicar los grupos declarados preservando el orden de PRIMERA aparición: el lector
	// tolerante no aplica el `uniqueItems` del schema (L4), así que un manifiesto con
	// `nav.groups: ["X","X"]` llegaría con duplicados y, sin esto, produciría dos NavGroup/
	// secciones "X" con los mismos items (bug de UI). `new Set` conserva el orden de inserción.
	const declaredUnique = [...new Set(declaredGroupOrder)];
	const declaredPresent = declaredUnique.filter((g) => nonNullPresent.includes(g));
	const undeclaredPresent = nonNullPresent
		.filter((g) => !declaredGroupOrder.includes(g))
		.sort((a, b) => a.localeCompare(b));

	const groupOrder: (string | null)[] = [
		...(hasAnonymous ? [null] : []),
		...declaredPresent,
		...undeclaredPresent
	];
	const groupIndex = new Map<string | null, number>(groupOrder.map((g, i) => [g, i]));

	const indexed = items.map((item, baseIndex) => ({ item, baseIndex }));
	indexed.sort((a, b) => {
		const groupDelta = groupIndex.get(getGroup(a.item))! - groupIndex.get(getGroup(b.item))!;
		if (groupDelta !== 0) return groupDelta;

		const orderA = getOrder(a.item);
		const orderB = getOrder(b.item);
		if (orderA !== undefined && orderB !== undefined) {
			if (orderA !== orderB) return orderA - orderB;
			return a.baseIndex - b.baseIndex;
		}
		if (orderA !== undefined) return -1; // explícito antes que orden base
		if (orderB !== undefined) return 1;
		return a.baseIndex - b.baseIndex;
	});

	return { orderedItems: indexed.map((x) => x.item), groupOrder };
}
