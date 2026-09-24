/**
 * `selectThumbSpec` (hallazgo p2, lote "formularios y medios"): un tamaño declarado se pide tal
 * cual; uno NO declarado cae a `100x100` (el único que PB sirve siempre, ver la cabecera del
 * módulo) en vez de pedir a ciegas un tamaño que devolvería el original completo.
 */
import { describe, expect, test } from 'vitest';
import { FALLBACK_THUMB_SPEC, selectThumbSpec } from './thumb-select';

describe('selectThumbSpec', () => {
	test('tamaño declarado: se pide tal cual', () => {
		const requested = { width: 28, height: 28, fit: 'crop' as const };
		expect(selectThumbSpec(requested, ['300x300', '120x120', '28x28'])).toEqual(requested);
	});

	test('tamaño NO declarado: cae al fallback universal, no al original', () => {
		const requested = { width: 28, height: 28, fit: 'crop' as const };
		expect(selectThumbSpec(requested, ['300x300'])).toEqual(FALLBACK_THUMB_SPEC);
	});

	test('campo sin ningún thumb declarado (undefined): cae al fallback', () => {
		const requested = { width: 120, height: 120, fit: 'crop' as const };
		expect(selectThumbSpec(requested, undefined)).toEqual(FALLBACK_THUMB_SPEC);
	});

	test('mismo ancho/alto pero distinto "fit": no cuenta como declarado', () => {
		// `100x100` (crop, sin sufijo) declarado no autoriza a pedir `100x100f` (contain): son
		// sintaxis PB distintas, ver `compileThumbSpec`.
		const requested = { width: 100, height: 100, fit: 'contain' as const };
		expect(selectThumbSpec(requested, ['100x100'])).toEqual(FALLBACK_THUMB_SPEC);
	});
});
