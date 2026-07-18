/**
 * Taxonomía de errores del puerto (§5 del contrato).
 *
 * Ley: toda promesa del puerto rechaza con `VegaError` y solo con `VegaError` (L2). Un error
 * crudo del SDK o de `fetch` que escape de un adaptador es un bug de esa capa, no del puerto.
 */

export type VegaErrorKind =
	| 'auth-expired' // sesión no válida ya; P3 relanza login
	| 'forbidden' // autenticado pero sin permiso (o credenciales rechazadas en login)
	| 'validation' // datos rechazados; SIEMPRE con fieldErrors
	| 'network' // no hubo respuesta HTTP (caído, DNS, timeout, offline)
	| 'not-found' // recurso o colección inexistente
	| 'backend'; // el backend respondió algo inesperado (5xx, forma desconocida, versión incompatible)

export interface FieldError {
	/** Código estable del backend, pass-through normalizado (PB: 'validation_required'…). P5 lo traduce; si no lo conoce, muestra `message`. */
	code: string;
	/** Mensaje humano del backend (en inglés en PB) o del puerto (rechazos locales, en es). */
	message: string;
}

export interface VegaErrorOptions {
	/** Presente ⟺ kind === 'validation'. Clave = nombre de campo Vega; '' = error a nivel de registro. */
	fieldErrors?: Record<string, FieldError>;
	/** true si reintentar tal cual tiene sentido (network). Default: false. */
	retryable?: boolean;
	/** Error original para logs/debug. PROHIBIDO renderizarlo en UI (puede contener sintaxis PB/URLs). */
	cause?: unknown;
}

/** Error único del puerto. Ver taxonomía en `VegaErrorKind` y tabla de mapeo §5. */
export class VegaError extends Error {
	readonly kind: VegaErrorKind;
	readonly fieldErrors?: Record<string, FieldError>;
	readonly retryable: boolean;
	readonly cause?: unknown;

	constructor(kind: VegaErrorKind, message: string, opts: VegaErrorOptions = {}) {
		super(message);
		this.name = 'VegaError';
		this.kind = kind;
		this.fieldErrors = opts.fieldErrors;
		this.retryable = opts.retryable ?? false;
		this.cause = opts.cause;
	}

	/** `'validation'` — SIEMPRE lleva `fieldErrors`. Clave `''` = error a nivel de registro. */
	static validation(
		fieldErrors: Record<string, FieldError>,
		message = 'Datos no válidos'
	): VegaError {
		return new VegaError('validation', message, { fieldErrors });
	}

	/** `'not-found'` — recurso o colección inexistente. */
	static notFound(message = 'Recurso no encontrado'): VegaError {
		return new VegaError('not-found', message);
	}

	/** `'forbidden'` — autenticado pero sin permiso, o credenciales rechazadas en login (mensaje neutro). */
	static forbidden(message = 'No autorizado'): VegaError {
		return new VegaError('forbidden', message);
	}

	/** `'auth-expired'` — sesión no válida ya; el llamador debe relanzar login. */
	static authExpired(message = 'La sesión ha caducado'): VegaError {
		return new VegaError('auth-expired', message);
	}

	/** `'network'` — no hubo respuesta HTTP; siempre `retryable: true`. */
	static network(cause?: unknown, message = 'Sin conexión con el backend'): VegaError {
		return new VegaError('network', message, { retryable: true, cause });
	}

	/** `'backend'` — el backend respondió algo inesperado (5xx, forma desconocida, versión incompatible). */
	static backend(message: string, cause?: unknown): VegaError {
		return new VegaError('backend', message, { cause });
	}
}

/**
 * Códigos de validación pass-through estilo PocketBase (§7: "usa los códigos de PB… para que
 * P5 traduzca una sola tabla"). NOTA de implementación: son una aproximación razonable a los
 * códigos reales del validador de PB ≥0.26; el adaptador `pocketbase` (Fase 2) es la fuente de
 * verdad final y debe ajustar esta lista si el binario real difiere en algún código concreto.
 */
export const PB_VALIDATION_CODES = {
	required: 'validation_required',
	minLength: 'validation_min_text_constraint',
	maxLength: 'validation_max_text_constraint',
	pattern: 'validation_invalid_format',
	minValue: 'validation_min_value_constraint',
	maxValue: 'validation_max_value_constraint',
	selectInvalid: 'validation_values_invalid',
	tooManyValues: 'validation_too_many_values',
	relationInvalid: 'validation_invalid_relation_values'
} as const;

/**
 * Códigos de los rechazos locales del puerto (§4.3), idénticos en ambos adaptadores porque
 * comparten implementación (ver `write-guards.ts`). No son códigos de PB: son del puerto.
 */
export const LOCAL_REJECTION_CODES = {
	unsupportedField: 'vega_unsupported_field',
	readonlyField: 'vega_readonly_field',
	unknownField: 'vega_unknown_field',
	/** §4.4/§9.9: un `FileRef` en la entrada que no pertenece al registro que se escribe. */
	foreignFileRef: 'vega_foreign_file_ref'
} as const;
