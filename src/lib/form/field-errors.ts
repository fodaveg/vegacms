/**
 * `VegaError` de validación → errores por campo, listos para que el shell los funda con
 * `validation.ts` y los traduzca a texto vía i18n (Fase F5-a, L-P5.4 del contrato P5 / Audit
 * Finding 7).
 *
 * Solo aplica a `err.kind === 'validation'` (el único kind que trae `fieldErrors`, §5 del
 * contrato de backend); para el resto de kinds (`network`, `forbidden`, `auth-expired`…) esto NO
 * es responsable — esos los gestiona el feedback general del shell (`reportError`, P3), no el
 * formulario. `mapFieldErrors` degrada a la vista vacía en ese caso, nunca lanza.
 *
 * JAMÁS lee `err.cause` (prohibido renderizarlo en UI: puede llevar sintaxis/URLs del backend,
 * §5 del contrato de backend).
 */

import type { FieldError, VegaError } from '$lib/backend/errors';
import { LOCAL_REJECTION_CODES, PB_VALIDATION_CODES } from '$lib/backend/errors';

/**
 * Códigos que este módulo (y `validation.ts`) saben nombrar: la unión de los estables de PB (§7
 * del contrato de backend) y los rechazos locales del puerto (§4.3) — defensa en profundidad: un
 * `vega_readonly_field` colado (bug de `to-record-input.ts`, o un backend que aceptó lo que
 * `write-guards.ts` debería haber rechazado) también se reconoce aquí, no solo los de PB.
 */
const KNOWN_CODES: ReadonlySet<string> = new Set([
	...Object.values(PB_VALIDATION_CODES),
	...Object.values(LOCAL_REJECTION_CODES)
]);

/**
 * Error traducible de un campo o del registro. `code` es la clave estable que el shell busca en
 * i18n — este módulo NO llama a `t()`, esa es responsabilidad exclusiva del shell. `known`
 * distingue si `code` pertenece al vocabulario reconocido (intentar la traducción i18n tiene
 * sentido) o no (código desconocido → usar `message` directamente, fallback honesto).
 */
export interface TranslatedError {
	code: string;
	/** Mensaje del backend (en inglés, PB) o del puerto (rechazos locales, en español) — fallback
	 *  SIEMPRE disponible, se use o no como texto final. */
	message: string;
	/** `true` ⟺ `code` ∈ `PB_VALIDATION_CODES` ∪ `LOCAL_REJECTION_CODES`. */
	known: boolean;
}

/**
 * Vista de errores de un formulario: por campo, más el de registro (clave `''` de
 * `fieldErrors`, §5 del contrato de backend). Misma forma que produce `validation.ts`, para que
 * el shell funda cliente + backend con un merge simple (`{ ...clientErrors.byField,
 * ...backendErrors.byField }`, backend gana por aplicarse último).
 */
export interface FieldErrorsView {
	byField: Record<string, TranslatedError>;
	record: TranslatedError | null;
}

const EMPTY_VIEW: FieldErrorsView = { byField: {}, record: null };

/** `true` ⟺ `err.kind === 'validation'` y trae `fieldErrors` — el único caso en el que
 *  `mapFieldErrors` produce algo. Útil para que el shell decida entre "fundir con el formulario"
 *  y "feedback general" sin repetir la comprobación de `kind`. */
export function isFieldValidationError(err: VegaError): boolean {
	return err.kind === 'validation' && err.fieldErrors !== undefined;
}

/**
 * Traduce `err.fieldErrors` (§5 del contrato de backend) a `FieldErrorsView`. Para cualquier
 * `err.kind` distinto de `'validation'` (o un `'validation'` sin `fieldErrors`, que no debería
 * darse por contrato pero L11 manda degradar sin crashear) devuelve la vista vacía.
 */
export function mapFieldErrors(err: VegaError): FieldErrorsView {
	if (!isFieldValidationError(err)) return EMPTY_VIEW;

	const byField: Record<string, TranslatedError> = {};
	let record: TranslatedError | null = null;

	for (const [name, fieldError] of Object.entries(err.fieldErrors ?? {})) {
		const translated = translate(fieldError);
		if (name === '') record = translated;
		else byField[name] = translated;
	}

	return { byField, record };
}

function translate(fieldError: FieldError): TranslatedError {
	return {
		code: fieldError.code,
		message: fieldError.message,
		known: KNOWN_CODES.has(fieldError.code)
	};
}
