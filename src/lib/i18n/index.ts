/**
 * i18n del chrome de Vega (§2.5 del contrato P3): sin librería (ley maestra L7), un
 * diccionario plano por idioma (`es.ts`/`en.ts`) más funciones puras. Módulo casi puro: `t()` y
 * `resolveLocale()` siguen sin Svelte, sin red, sin `window` (la Fase 2 inyecta
 * `navigator.language` como string) — la única excepción deliberada es `ensureLocaleLoaded`
 * (abajo), que sí hace I/O (un `import()`).
 *
 * Carga perezosa del diccionario NO activo (fix de peso, auditoría 23 sep 2026 p3): `es` (13.06
 * KB gz) se importa estático porque es el fallback de `resolveLocale` y el idioma que usan
 * `/login`/`ReloginModal.svelte` antes de que exista sesión o modelo — tiene que estar
 * disponible sin esperar nada. `en` (12.22 KB gz) SOLO se carga si el idioma resuelto es 'en',
 * vía `ensureLocaleLoaded`. Quien decide el `locale` con el que va a pintar (`+layout.ts` para
 * la primera pintura, `+layout.svelte` cuando `site.locale` llega con el modelo o cambia tras un
 * `reloadModel()`) DEBE esperar `ensureLocaleLoaded(locale)` antes de fijarlo: si no, `t()` no
 * lanza ni parpadea con contenido vacío, pero SÍ devolvería claves crudas hasta que el `import()`
 * resuelva (ver política de clave ausente más abajo) — evitar ESE hueco es cosa de quien pinta,
 * no de este módulo.
 */

import { es } from './es';

/** Idiomas soportados en v1 (D-P3.4: es + en). */
export type Locale = 'es' | 'en';

/** Clave de diccionario: unión cerrada derivada de `es.ts` (fuente de verdad de las claves). */
export type DictKey = keyof typeof es;

// `en` empieza SIN cargar (ver cabecera): `Partial` porque hasta que `ensureLocaleLoaded('en')`
// resuelve, la entrada no existe.
const DICTIONARIES: Partial<Record<Locale, Record<DictKey, string>>> = { es };

// Promesa en vuelo del `import()` de 'en', para que llamadas concurrentes (p.ej. `+layout.ts` y
// un `reloadModel()` casi simultáneo) reutilicen la MISMA carga en vez de disparar dos.
let loadingEn: Promise<void> | undefined;

/**
 * Garantiza que el diccionario de `locale` está cargado antes de devolver. Idempotente: no
 * reimporta si ya está cargado o si hay una carga en vuelo. 'es' siempre está (import estático,
 * ver cabecera), así que esta función solo hace algo real para 'en'.
 */
export async function ensureLocaleLoaded(locale: Locale): Promise<void> {
	if (DICTIONARIES[locale]) return;
	loadingEn ??= import('./en').then(({ en }) => {
		DICTIONARIES.en = en;
	});
	await loadingEn;
}

/**
 * Traduce una clave del chrome para `locale` (§2.5). Interpola `{param}` con `params` si la
 * clave los usa (sustitución simple, sin plurales ni formato de número/fecha: eso es
 * deliberadamente fuera de alcance de un diccionario propio v1).
 *
 * Política de **clave ausente o diccionario sin cargar** (criterio de aceptación §7.A.2):
 * devuelve la CLAVE CRUDA tal cual se pidió, nunca lanza ni devuelve `undefined`. Es la opción
 * más honesta para depurar (se ve en la UI que falta traducir esa clave, o que alguien llamó
 * `t()` con un `locale` cuyo diccionario nadie esperó con `ensureLocaleLoaded`) y evita pantallas
 * en blanco por un `t()` mal llamado — coherente con P3-L3 ("nunca pantalla blanca").
 */
export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
	const dict = DICTIONARIES[locale];
	const raw = dict ? (dict as Record<string, string>)[key] : undefined;
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
