/**
 * Carga perezosa del diccionario 'en' (fix de peso, auditoría 23 sep 2026 p3): fichero SEPARADO
 * de `i18n.test.ts` a propósito — necesita el módulo `$lib/i18n` en su estado INICIAL (ningún
 * `ensureLocaleLoaded('en')` corrido todavía), y `i18n.test.ts` lo carga en su `beforeAll` para
 * el resto de su suite. Vitest aísla el registro de módulos por fichero de test (sin `isolate:
 * false` en `vite.config.ts`), así que cada fichero arranca con `DICTIONARIES` = solo `es`.
 */

import { describe, expect, test } from 'vitest';
import { ensureLocaleLoaded, t } from '$lib/i18n';

describe('carga perezosa de $lib/i18n', () => {
	test("'es' está disponible desde el primer render, sin esperar nada", () => {
		expect(t('es', 'nav.media')).toBe('Medios');
	});

	test("t('en', …) ANTES de ensureLocaleLoaded('en') devuelve la clave cruda, nunca undefined ni lanza", () => {
		expect(t('en', 'nav.media')).toBe('nav.media');
	});

	test("ensureLocaleLoaded('en') deja t('en', …) traduciendo de verdad", async () => {
		await ensureLocaleLoaded('en');
		expect(t('en', 'nav.media')).toBe('Media');
	});

	test('ensureLocaleLoaded es idempotente: llamadas concurrentes no rompen nada y devuelven lo mismo', async () => {
		await Promise.all([ensureLocaleLoaded('en'), ensureLocaleLoaded('en'), ensureLocaleLoaded('en')]);
		expect(t('en', 'nav.trash')).toBe('Trash');
	});

	test("ensureLocaleLoaded('es') es un no-op inmediato ('es' ya estaba cargado)", async () => {
		await expect(ensureLocaleLoaded('es')).resolves.toBeUndefined();
		expect(t('es', 'nav.trash')).toBe('Papelera');
	});
});
