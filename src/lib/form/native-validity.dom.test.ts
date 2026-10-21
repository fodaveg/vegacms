import { describe, expect, test } from 'vitest';
import { NATIVE_INVALID_CODE, nativeFieldErrors } from './native-validity';

function root(html: string): HTMLElement {
	const el = document.createElement('form');
	el.innerHTML = html;
	document.body.appendChild(el);
	return el;
}

describe('nativeFieldErrors', () => {
	test('un control inválido de un campo da su error por nombre, aunque esté oculto', () => {
		const el = root(
			'<div data-field="meta" hidden><textarea></textarea></div><div data-field="ok"><input></div>'
		);
		el.querySelector('textarea')!.setCustomValidity('El JSON no es válido');
		expect(nativeFieldErrors(el)).toEqual({
			meta: { code: NATIVE_INVALID_CODE, message: 'El JSON no es válido', known: false }
		});
	});

	test('los controles que no son de quien guarda no cuentan (un bloque embebido)', () => {
		const el = root(
			'<div data-vega-block-editor><div data-field="bodyEs"><textarea></textarea></div></div>'
		);
		el.querySelector('textarea')!.setCustomValidity('HTML');
		expect(
			nativeFieldErrors(el, (control) => !control.closest('[data-vega-block-editor]'))
		).toEqual({});
	});

	test('un control deshabilitado o sin campo no valida', () => {
		const el = root('<div data-field="a"><input disabled></div><input>');
		for (const input of el.querySelectorAll('input')) input.setCustomValidity('x');
		expect(nativeFieldErrors(el)).toEqual({});
	});
});
