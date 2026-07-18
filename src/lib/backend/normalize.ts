/**
 * Normalización de valores de campo (§2.1 del contrato): "cómo se ve un vacío". Esta tabla
 * es la única fuente de verdad y **aplica a AMBOS adaptadores**; vive aquí (y no duplicada en
 * cada adaptador) para que la paridad memory↔pocketbase sea automática por construcción.
 */

import type { Field, FieldValue } from './types';

/**
 * Normaliza un valor crudo según la tabla §2.1. `raw` es lo que el almacén interno tenga para
 * ese campo (puede faltar, venir `undefined`, o venir en la forma "vacía" propia del backend
 * origen, p.ej. `''` de PB). El resultado es siempre el valor de dominio Vega.
 */
export function normalizeFieldValue(field: Field, raw: unknown): FieldValue {
	switch (field.type) {
		case 'text':
		case 'richtext':
		case 'email':
		case 'url':
			return typeof raw === 'string' ? raw : '';

		case 'number':
			return typeof raw === 'number' && !Number.isNaN(raw) ? raw : null;

		case 'bool':
			return typeof raw === 'boolean' ? raw : false;

		case 'date':
			return typeof raw === 'string' && raw !== '' ? raw : null;

		case 'select':
			if (field.multiple) return Array.isArray(raw) ? [...(raw as string[])] : [];
			return typeof raw === 'string' && raw !== '' ? raw : null;

		case 'relation':
			if (field.multiple) return Array.isArray(raw) ? [...(raw as string[])] : [];
			return typeof raw === 'string' && raw !== '' ? raw : null;

		case 'file':
			if (field.multiple) return Array.isArray(raw) ? [...(raw as string[])] : [];
			return typeof raw === 'string' && raw !== '' ? raw : null;

		case 'json':
			// Copia profunda: sin esto, el llamador conserva una referencia al mismo objeto que
			// queda "persistido" en el adaptador, y mutarlo tras `create()`/`update()` corrompería
			// el estado almacenado por la puerta de atrás (bug: aliasing entrada→almacén).
			return raw === undefined ? null : structuredClone(raw as FieldValue);

		case 'unsupported': {
			// Opaco, solo lectura: se transporta tal cual venga (incluso si es undefined/null),
			// pero copiado si es un objeto/array (mismo riesgo de aliasing que `json`).
			const value = (raw ?? null) as FieldValue;
			return typeof value === 'object' && value !== null ? structuredClone(value) : value;
		}
	}
}

/**
 * `true` si `value` cuenta como "vacío" para ese tipo de campo, según la misma tabla §2.1.
 * Comparte implementación entre: el operador de Query `empty`/`notEmpty` (§4.6) y la
 * comprobación de `required` en la validación de escritura — ambos casos son, por contrato,
 * la misma noción de vacío.
 */
export function isEmptyValue(field: Field, value: FieldValue): boolean {
	if (value === null) return true;
	if (Array.isArray(value)) return value.length === 0;
	if (
		field.type === 'text' ||
		field.type === 'richtext' ||
		field.type === 'email' ||
		field.type === 'url'
	) {
		return value === '';
	}
	return false;
}
