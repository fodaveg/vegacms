/**
 * Suite A.1/A.2 (§7 del contrato P3): `resolveLocale()` (tabla completa) y `t()` (claves
 * presentes, interpolación, política de clave ausente). Sin red, sin Svelte.
 */

import { describe, expect, test } from 'vitest';
import { es } from '$lib/i18n/es';
import { en } from '$lib/i18n/en';
import { resolveLocale, t } from '$lib/i18n';

describe('resolveLocale', () => {
	test('site.locale gana, sea cual sea navigatorLanguage', () => {
		expect(resolveLocale({ locale: 'en' }, 'es-ES')).toBe('en');
		expect(resolveLocale({ locale: 'es' }, 'en-US')).toBe('es');
	});

	test('site.locale null → cae a navigator.language, prefijo es*', () => {
		expect(resolveLocale({ locale: null }, 'es-ES')).toBe('es');
		expect(resolveLocale({ locale: null }, 'es')).toBe('es');
	});

	test('site.locale null → navigator.language que no es es* → en', () => {
		expect(resolveLocale({ locale: null }, 'en-US')).toBe('en');
		expect(resolveLocale({ locale: null }, 'fr-FR')).toBe('en');
		expect(resolveLocale({ locale: null }, 'de')).toBe('en');
	});

	test('sin site ni navigatorLanguage → default es', () => {
		expect(resolveLocale(null, null)).toBe('es');
		expect(resolveLocale(undefined, undefined)).toBe('es');
	});

	test('site null pero navigatorLanguage presente → se usa navigatorLanguage', () => {
		expect(resolveLocale(null, 'en-GB')).toBe('en');
	});
});

describe('t()', () => {
	test('clave presente sin params', () => {
		expect(t('es', 'nav.media')).toBe('Medios');
		expect(t('en', 'nav.media')).toBe('Media');
	});

	test('interpolación de un param', () => {
		expect(t('es', 'nav.warningsBadge', { count: 3 })).toBe('3 avisos');
	});

	test('interpolación de varios params', () => {
		expect(t('es', 'nav.singletonManyRecords', { label: 'Ajustes del sitio', count: 4 })).toBe(
			'"Ajustes del sitio" está marcada como Ajustes pero tiene 4 registros. Editando el primero.'
		);
	});

	test('param ausente en el objeto deja el placeholder intacto', () => {
		expect(t('es', 'nav.warningsBadge', {})).toBe('{count} avisos');
	});

	test('clave ausente → devuelve la clave cruda (política definida en impl.)', () => {
		expect(t('es', 'no.existe.esta.clave')).toBe('no.existe.esta.clave');
		expect(t('en', 'no.existe.esta.clave')).toBe('no.existe.esta.clave');
	});

	test('es.ts y en.ts tienen exactamente el mismo juego de claves', () => {
		expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
	});
});
