/**
 * Vega es una SPA estática: sin SSR (el admin siempre corre en el navegador, contra el
 * `BackendPort` configurado) y sin prerender (todo el contenido depende de sesión/datos en
 * tiempo real). `@sveltejs/adapter-static` necesita `fallback` (ver `vite.config.ts`) para
 * servir esto como app de página única.
 */
import { ensureLocaleLoaded, resolveLocale } from '$lib/i18n';

export const ssr = false;
export const prerender = false;

/**
 * Carga el diccionario del idioma ADIVINADO antes de pintar nada (fix de peso, auditoría 23 sep
 * 2026 p3): con `ssr=false`, este `load()` corre en el cliente y SvelteKit no monta ningún
 * `+layout.svelte`/`+page.svelte` hasta que resuelve — es el único sitio que puede garantizar
 * "el idioma activo está listo antes del primer pintado" para TODAS las rutas, incluida
 * `/login` (que resuelve su propio `t()` sin esperar sesión ni modelo, con la MISMA fórmula de
 * abajo — ver `src/routes/login/+page.svelte`).
 *
 * Solo conoce `navigator.language` aquí: el `site.locale` real llega después, con el modelo, en
 * `+layout.svelte`. Es una ADIVINANZA para el primer pintado, no la resolución final — si el
 * modelo trae un `site.locale` distinto (o cambia tras un `reloadModel()`), `+layout.svelte`
 * vuelve a `ensureLocaleLoaded` con el idioma nuevo antes de reasignar `locale` (mismo patrón).
 */
export async function load(): Promise<void> {
	const guessedLocale = resolveLocale(
		null,
		typeof navigator !== 'undefined' ? navigator.language : null
	);
	await ensureLocaleLoaded(guessedLocale);
}
