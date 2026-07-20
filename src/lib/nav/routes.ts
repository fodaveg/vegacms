/**
 * Mapeo intención→ruta (§2.2 del contrato P3): constructores de URL PUROS que sustentan
 * `NavApi`. Ningún efecto aquí (nada de `goto`, nada de router): eso lo compone la Fase 2 sobre
 * estas funciones. Es el ÚNICO sitio del repo que sabe cómo se ve una URL de Vega (§2.4, mapa
 * de rutas normativo) — nadie más compone URLs a mano.
 *
 * `type`/`id` se codifican con `encodeURIComponent` por higiene (nombres de colección/ids no
 * deberían necesitarlo, pero un id o tipo con caracteres especiales no debe romper la URL).
 *
 * BASE PATH (P8·F3): TODAS las rutas se prefijan con `base` de `$app/paths`. En el build normal
 * (app real, `release.yml`) `base` es `''` y el resultado no cambia (`/login`, `/c/foo`…). En la
 * demo pública de GitHub Pages (`VEGA_BASE_PATH=/vegacms`, ver `vite.config.ts`) `base` es
 * `/vegacms`, así que las rutas quedan `/vegacms/login`, etc. Esto es OBLIGATORIO porque:
 *   1. `goto('/login')` de SvelteKit NO prefija `base` — navegaría a `origin/login`, FUERA del
 *      sitio desplegado bajo `/vegacms/` → 404 genérico de GitHub Pages.
 *   2. El guard de `+layout.svelte` compara estas rutas contra `page.url.pathname`, que SÍ
 *      incluye `base` (`/vegacms/login`); sin el prefijo la comparación nunca casa y el guard
 *      reexpulsa a login en bucle.
 * Como este módulo es el único que compone URLs, prefijar aquí lo arregla en todos los llamantes.
 */

import { base } from '$app/paths';

import type { RecordId } from '$lib/backend';

/** `/` — índice. */
export function indexRoute(): string {
	return `${base}/`;
}

/** `/c/:type` — listado (P4) o resolutor de singleton (§3.3). */
export function listRoute(type: string): string {
	return `${base}/c/${encodeURIComponent(type)}`;
}

/** `/c/:type/new` — creación (P5). */
export function newRoute(type: string): string {
	return `${base}/c/${encodeURIComponent(type)}/new`;
}

/** `/c/:type/:id` — edición (P5). */
export function recordRoute(type: string, id: RecordId): string {
	return `${base}/c/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
}

/** `/media` — biblioteca de medios (P6; bootstrap desde la Fase 6a, grid/subida en 6b/6c). */
export function mediaRoute(): string {
	return `${base}/media`;
}

/** `/v/:id` — vista fusionada (`mergedViews`, L7a resuelve, L7c pinta): listado READ-ONLY
 *  cruzando varias colecciones. `id` es la clave de `mergedViews` en el manifiesto (id-slug), no
 *  un `RecordId` — namespace propio, sin relación con `/c/:type`. */
export function viewRoute(id: string): string {
	return `${base}/v/${encodeURIComponent(id)}`;
}

/** `/settings` — monta el `ManifestEditor` de P2. */
export function settingsRoute(): string {
	return `${base}/settings`;
}

/** `/login` — única ruta pública. */
export function loginRoute(): string {
	return `${base}/login`;
}
