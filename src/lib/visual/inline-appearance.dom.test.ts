import { afterEach, describe, expect, test, vi } from 'vitest';
import { readInlineAppearance } from './inline-appearance';

afterEach(() => vi.restoreAllMocks());

describe('readInlineAppearance', () => {
	test('devuelve los colores COMPUTADOS de la sonda y la retira', () => {
		const host = document.createElement('div');
		document.body.append(host);
		vi.spyOn(window, 'getComputedStyle').mockReturnValue({
			color: 'computed-outline',
			backgroundColor: 'computed-soft'
		} as CSSStyleDeclaration);
		expect(readInlineAppearance(host)).toEqual({
			outline: 'computed-outline',
			soft: 'computed-soft'
		});
		expect(host.childElementCount).toBe(0);
		host.remove();
	});

	test('sin token (fondo transparente) o sin anfitrión: null, el sitio usa su valor por defecto', () => {
		const host = document.createElement('div');
		document.body.append(host);
		vi.spyOn(window, 'getComputedStyle').mockReturnValue({
			color: 'computed-ink',
			backgroundColor: 'transparent'
		} as CSSStyleDeclaration);
		expect(readInlineAppearance(host)).toBeNull();
		expect(readInlineAppearance(undefined)).toBeNull();
		host.remove();
	});
});
