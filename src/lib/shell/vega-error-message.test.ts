import { describe, expect, test } from 'vitest';
import { VegaError } from '$lib/backend';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { vegaErrorMessage } from './vega-error-message';

const t = (key: string) => key;

describe('vegaErrorMessage', () => {
	test.each([
		['record-in-use', 'errors.backendCode.recordInUse'],
		['bad-request', 'errors.backendCode.badRequest'],
		['server-error', 'errors.backendCode.serverError']
	] as const)('código %s → clave del catálogo', (code, key) => {
		expect(vegaErrorMessage(VegaError.backend('crudo en inglés', undefined, code), t)).toBe(key);
	});

	test('sin código → el message tal cual', () => {
		expect(vegaErrorMessage(VegaError.backend('crudo'), t)).toBe('crudo');
	});

	test('las tres claves existen en es y en', () => {
		for (const key of [
			'errors.backendCode.recordInUse',
			'errors.backendCode.badRequest',
			'errors.backendCode.serverError'
		]) {
			expect(es).toHaveProperty([key]);
			expect(en).toHaveProperty([key]);
		}
	});
});
