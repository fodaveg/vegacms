import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	INLINE_HINT_GEOMETRY,
	inlineAppearanceMessage,
	inlineHintSpace,
	readInlineAppearance
} from './inline-appearance';

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

	test('la sonda pinta con los tokens, sin color crudo', () => {
		const host = document.createElement('div');
		document.body.append(host);
		let probe: HTMLElement | null = null;
		vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
			probe = el as HTMLElement;
			return { color: 'o', backgroundColor: 's' } as CSSStyleDeclaration;
		});
		readInlineAppearance(host);
		expect(probe!.style.color).toBe('var(--v-ol-inline)');
		expect(probe!.style.backgroundColor).toBe('var(--v-ol-inline-tint)');
		host.remove();
	});
});

describe('hueco de la pista (hintSpace)', () => {
	test('a zoom 1 es hueco + alto + respiro; al reducir crece en píxeles de la página', () => {
		const { gap, height, after } = INLINE_HINT_GEOMETRY;
		expect(inlineHintSpace(1)).toBe(gap + height + after);
		expect(inlineHintSpace(0.5)).toBe(gap + (height + after) * 2);
		expect(inlineHintSpace(0.58)).toBe(Math.ceil(gap + (height + after) / 0.58));
	});

	test('nunca sale del rango que acepta el sitio, ni con un zoom absurdo', () => {
		expect(inlineHintSpace(0.01)).toBe(240);
		expect(inlineHintSpace(0)).toBe(inlineHintSpace(1));
		expect(inlineHintSpace(Number.NaN)).toBe(inlineHintSpace(1));
	});

	test('el mensaje lleva el hueco aunque el tema no dé colores', () => {
		vi.spyOn(window, 'getComputedStyle').mockReturnValue({
			color: 'x',
			backgroundColor: 'transparent'
		} as CSSStyleDeclaration);
		const host = document.createElement('div');
		document.body.append(host);
		expect(inlineAppearanceMessage(host, 1)).toEqual({ hintSpace: inlineHintSpace(1) });
		host.remove();
	});
});
