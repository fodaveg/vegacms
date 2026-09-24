import { describe, expect, test } from 'vitest';
import { VegaError } from '$lib/backend';
import {
	editorInitial,
	formErrorsFromVegaError,
	validateEmail,
	validatePasswordPair
} from './editor-form';

describe('validateEmail', () => {
	test('acepta algo@algo.algo y rechaza lo que no tiene esa forma', () => {
		expect(validateEmail(' ana@fodaveg.net ')).toBeNull();
		for (const bad of ['', 'ana', 'ana@', 'ana@host', 'ana @host.es']) {
			expect(validateEmail(bad)).toEqual({ key: 'admin.form.emailInvalid' });
		}
	});
});

describe('validatePasswordPair', () => {
	test('corta: solo el error de longitud, con el mínimo del backend', () => {
		expect(validatePasswordPair('huerto', 'huerto2', 12)).toEqual({
			password: { key: 'admin.form.passwordTooShort', params: { min: 12 } }
		});
	});

	test('larga pero distinta: solo el error de repetición', () => {
		expect(validatePasswordPair('contraseña-1', 'contraseña-2', 8)).toEqual({
			confirm: { key: 'admin.form.passwordMismatch' }
		});
	});

	test('larga e igual: sin errores', () => {
		expect(validatePasswordPair('contraseña-1', 'contraseña-1', 8)).toEqual({});
	});
});

describe('formErrorsFromVegaError', () => {
	test('los códigos de email medidos se dicen con palabras de Vega; la contraseña con las del servidor', () => {
		const err = VegaError.validation({
			email: { code: 'validation_not_unique', message: 'Value must be unique.' },
			password: {
				code: 'validation_min_text_constraint',
				message: 'Must be at least 12 character(s).'
			}
		});
		expect(formErrorsFromVegaError(err)).toEqual({
			email: { key: 'admin.form.emailTaken' },
			password: {
				key: 'admin.form.passwordRejected',
				params: { message: 'Must be at least 12 character(s).' }
			}
		});
	});

	test('una clave desconocida va al formulario, no se pierde', () => {
		const err = VegaError.validation({ '': { code: 'x', message: 'Algo raro' } });
		expect(formErrorsFromVegaError(err)).toEqual({
			form: { key: 'admin.form.rejected', params: { message: 'Algo raro' } }
		});
	});

	test('un error que no es de validación no es del formulario', () => {
		expect(formErrorsFromVegaError(VegaError.network())).toBeNull();
	});
});

describe('editorInitial', () => {
	test('primera letra en mayúscula; «?» si no hay email', () => {
		expect(editorInitial('marta@estudio.es')).toBe('M');
		expect(editorInitial('  ')).toBe('?');
	});
});
