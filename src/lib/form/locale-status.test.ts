import { describe, expect, test } from 'vitest';
import type { ResolvedContentType } from '$lib/model/types';
import { localeStatus } from './locale-status';

const type = {
	localization: {
		defaultLocale: 'es',
		locales: [
			{ id: 'es', label: 'Español' },
			{ id: 'en', label: 'English' }
		],
		fields: [
			{ name: 'title', label: 'Título', fields: { es: 'titleEs', en: 'titleEn' } },
			{ name: 'body', label: 'Contenido', fields: { es: 'bodyEs', en: 'bodyEn' } }
		]
	}
} as unknown as ResolvedContentType;

describe('localeStatus', () => {
	const baseline = { titleEs: 'Hola', titleEn: '', bodyEs: 'Texto', bodyEn: '' };
	const emptyErrors = { byField: {}, record: null };

	test('marca missing si algún campo del idioma está vacío', () => {
		expect(localeStatus(type, 'en', baseline, { ...baseline }, emptyErrors)).toBe('missing');
	});

	test('dirty tiene prioridad sobre missing', () => {
		expect(localeStatus(type, 'en', baseline, { ...baseline, titleEn: 'Hello' }, emptyErrors)).toBe(
			'dirty'
		);
	});

	test('error tiene prioridad sobre dirty', () => {
		expect(
			localeStatus(
				type,
				'en',
				baseline,
				{ ...baseline, titleEn: 'Hello' },
				{
					byField: {
						bodyEn: { code: 'validation_required', message: 'required', known: true }
					},
					record: null
				}
			)
		).toBe('error');
	});

	test('complete cuando todos los campos tienen contenido y no cambiaron', () => {
		const complete = { titleEs: 'Hola', titleEn: 'Hello', bodyEs: 'Texto', bodyEn: 'Copy' };
		expect(localeStatus(type, 'en', complete, { ...complete }, emptyErrors)).toBe('complete');
	});
});
