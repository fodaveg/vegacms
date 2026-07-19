/**
 * Anexo A del contrato P1: `ensureCollections` — bootstrap acotado a `vega_*`.
 *
 * Única excepción controlada a la ley "Vega no gestiona el esquema" (L2): el puerto puede
 * CREAR (nunca modificar ni borrar) las colecciones reservadas `vega`/`vega_*` que P2/P6
 * necesitan para funcionar. Vive en el puerto (no en un adaptador) porque el guardarraíl del
 * prefijo (§A.4.3) DEBE ser idéntico y compartido entre `memory` y `pocketbase`.
 */

import type { FieldError } from './errors';

/** Prefijo reservado (§A.1): la única excepción nombrada y acotada a la ley "no gestiona esquema". */
const RESERVED_NAME = 'vega';
const RESERVED_PREFIX = 'vega_';

/**
 * Especificación de una colección a crear (§A.3). `fields` usa el vocabulario Vega REDUCIDO
 * de `CollectionFieldSpec`: NO es una API general de autoría de esquema (eso sigue siendo
 * no-objetivo), solo el subconjunto mínimo que el bootstrap v1 necesita.
 */
export interface CollectionSpec {
	/** Debe ser 'vega' o empezar por 'vega_'; si no, `ensureCollections` rechaza con `validation` local. */
	name: string;
	/** Campos a crear. El id/system los pone el backend. */
	fields: CollectionFieldSpec[];
}

/**
 * Subconjunto MÍNIMO de tipos escribibles que el bootstrap v1 necesita (§A.3). NO es una API
 * general de autoría de esquema.
 */
export type CollectionFieldSpec =
	| { name: string; type: 'json' }
	| { name: string; type: 'text'; required?: boolean; max?: number }
	| {
			name: string;
			type: 'file';
			required?: boolean;
			multiple?: boolean;
			maxSizeBytes?: number;
			mimeTypes?: string[];
			// Tamaños de miniatura (sintaxis PB `WxH`/`WxHf`) que PB debe PRE-GENERAR. Opcional
			// (el Anexo A no lo requería): PB solo sirve miniaturas para los tamaños listados
			// aquí, cualquier otro tamaño solicitado devuelve el original completo EN SILENCIO
			// (200, sin imagen rota) — landmine caracterizada en el shakedown C1 (2026-07-19).
			thumbs?: string[];
	  }
	| { name: string; type: 'bool' }
	| { name: string; type: 'number' }
	| { name: string; type: 'date' }
	// Micro-enmienda FIRMADA al Anexo A (contrato P6 §9): sin un campo de fecha, no hay forma de
	// "ordenar por más reciente" (los ids que genera PB no son ordenables por tiempo). Coste
	// mínimo: lectura (`mapField`, `schema.ts`) y auto-relleno (`defaultReadonlyValue`, adaptador
	// `memory`) YA existían para `autodate` antes de esta enmienda. `onUpdate` por defecto es
	// `false` (solo se auto-puebla al crear, el caso de uso de P6 — "creado el").
	| { name: string; type: 'autodate'; onUpdate?: boolean };

export interface EnsureResult {
	/** Nombres de las colecciones efectivamente creadas en esta llamada (orden de `specs`). */
	created: string[];
	/** Nombres que ya existían y se omitieron. */
	skipped: string[];
}

/**
 * Especificación canónica v1 de la colección `vega` (§A.5), para que P2 no la reinvente.
 * `vega_media`: el esquema DETALLADO lo fija el contrato de P6; aquí solo queda el gancho
 * (no se declara una constante para ella en P1).
 */
export const VEGA_COLLECTION: CollectionSpec = {
	name: 'vega',
	fields: [{ name: 'manifest', type: 'json' }]
};

/** `true` si `name` cae dentro del prefijo reservado (§A.4.3): `'vega'` o `/^vega_/`. */
export function isReservedCollectionName(name: string): boolean {
	return name === RESERVED_NAME || name.startsWith(RESERVED_PREFIX);
}

/**
 * Guardarraíl del prefijo (§A.4.3), compartido entre adaptadores para que el rechazo sea
 * IDÉNTICO: cualquier `spec.name` fuera de `{'vega'} ∪ {vega_*}` produce un `FieldError`,
 * ANTES de que el adaptador toque red. Devuelve el mapa de errores (vacío si todo es válido).
 */
export function checkReservedNames(specs: CollectionSpec[]): Record<string, FieldError> {
	const fieldErrors: Record<string, FieldError> = {};
	for (const spec of specs) {
		if (!isReservedCollectionName(spec.name)) {
			fieldErrors[spec.name] = {
				code: 'vega_reserved_prefix_required',
				message: `El nombre "${spec.name}" debe ser "vega" o empezar por "vega_"`
			};
		}
	}
	return fieldErrors;
}
