/**
 * i18n del chrome de Vega (§2.5 del contrato P3): sin librería (ley maestra L7), un
 * diccionario plano por idioma (`es.ts`/`en.ts`) más dos funciones puras. Módulo puro: sin
 * Svelte, sin red, sin `window` (la Fase 2 inyecta `navigator.language` como string).
 */

import { es } from './es';
import { en } from './en';

/** Idiomas soportados en v1 (D-P3.4: es + en). */
export type Locale = 'es' | 'en';

/** Clave de diccionario: unión cerrada derivada de `es.ts` (fuente de verdad de las claves). */
export type DictKey = keyof typeof es;

const DICTIONARIES: Record<Locale, Record<DictKey, string>> = { es, en };

/**
 * Traduce una clave del chrome para `locale` (§2.5). Interpola `{param}` con `params` si la
 * clave los usa (sustitución simple, sin plurales ni formato de número/fecha: eso es
 * deliberadamente fuera de alcance de un diccionario propio v1).
 *
 * Política de **clave ausente** (criterio de aceptación §7.A.2): devuelve la CLAVE CRUDA tal
 * cual se pidió, nunca lanza ni devuelve `undefined`. Es la opción más honesta para depurar (se
 * ve en la UI que falta traducir esa clave) y evita pantallas en blanco por un `t()` mal
 * llamado — coherente con P3-L3 ("nunca pantalla blanca").
 */
export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
	const dict = DICTIONARIES[locale];
	const raw = (dict as Record<string, string>)[key];
	if (raw === undefined) return key;
	if (!params) return raw;
	return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
		Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
	);
}

/**
 * Resuelve el idioma efectivo del chrome (§2.5): `site.locale` (P2) gana si no es `null`;
 * si no, `navigatorLanguage` (`es*` → `'es'`, cualquier otro prefijo → `'en'`); si tampoco hay
 * `navigatorLanguage` → default `'es'`.
 *
 * Pura: la Fase 2 pasa `navigator.language` ya leído (este módulo no toca `window`).
 */
export function resolveLocale(
	site: { locale: Locale | null } | null | undefined,
	navigatorLanguage: string | null | undefined
): Locale {
	if (site?.locale) return site.locale;
	if (navigatorLanguage) return navigatorLanguage.toLowerCase().startsWith('es') ? 'es' : 'en';
	return 'es';
}
