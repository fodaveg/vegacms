/**
 * Validación de los formularios de `/editores` (alta y cambio de contraseña), pura y sin Svelte.
 *
 * El backend manda: el mínimo de contraseña llega de `AdministrationPort.listEditors()` y un
 * rechazo del servidor se pinta con su código. Validar aquí antes de enviar solo evita un viaje
 * que ya se sabe que va a fallar, y da el mensaje en el idioma de la interfaz.
 */

import type { VegaError } from '$lib/backend';

/** Error de un campo del formulario, ya como clave i18n y sus parámetros. */
export interface FormFieldError {
	key: string;
	params?: Record<string, string | number>;
}

export type EditorFormField = 'email' | 'password' | 'confirm' | 'form';
export type EditorFormErrors = Partial<Record<EditorFormField, FormFieldError>>;

/** Mismo criterio mínimo que PocketBase: algo@algo.algo, sin espacios. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `null` si `email` tiene forma de email; si no, el error del campo. */
export function validateEmail(email: string): FormFieldError | null {
	return EMAIL_PATTERN.test(email.trim()) ? null : { key: 'admin.form.emailInvalid' };
}

/**
 * Contraseña y su repetición. El error de "no coincide" solo aparece cuando la primera ya es
 * válida: con las dos mal, el campo que hay que arreglar primero es el de arriba.
 */
export function validatePasswordPair(
	password: string,
	confirm: string,
	minLength: number
): EditorFormErrors {
	if (password.length < minLength) {
		return { password: { key: 'admin.form.passwordTooShort', params: { min: minLength } } };
	}
	if (password !== confirm) return { confirm: { key: 'admin.form.passwordMismatch' } };
	return {};
}

/**
 * Traduce el `VegaError 'validation'` del puerto a errores de los campos del formulario. Los dos
 * códigos de email medidos contra PocketBase se dicen con las palabras de Vega. Un rechazo de la
 * contraseña se pinta con el mensaje del servidor: si su mínimo no es el que ya validó el
 * formulario, ese mensaje es el único que dice cuál es. `null` si el error no es de validación:
 * ese va al feedback global, no al formulario.
 */
export function formErrorsFromVegaError(err: VegaError): EditorFormErrors | null {
	if (err.kind !== 'validation') return null;
	const errors: EditorFormErrors = {};
	for (const [field, fieldError] of Object.entries(err.fieldErrors ?? {})) {
		if (field === 'email') {
			errors.email =
				fieldError.code === 'validation_not_unique'
					? { key: 'admin.form.emailTaken' }
					: fieldError.code === 'validation_is_email'
						? { key: 'admin.form.emailInvalid' }
						: { key: 'admin.form.emailRejected', params: { message: fieldError.message } };
		} else if (field === 'password') {
			errors.password = {
				key: 'admin.form.passwordRejected',
				params: { message: fieldError.message }
			};
		} else {
			errors.form = { key: 'admin.form.rejected', params: { message: fieldError.message } };
		}
	}
	if (Object.keys(errors).length === 0) {
		errors.form = { key: 'admin.form.rejected', params: { message: err.message } };
	}
	return errors;
}

/** Inicial del avatar de una cuenta: la primera letra del email, en mayúscula. */
export function editorInitial(email: string): string {
	const first = email.trim().charAt(0);
	return first === '' ? '?' : first.toLocaleUpperCase();
}
