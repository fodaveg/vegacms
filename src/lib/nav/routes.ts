/**
 * Mapeo intención→ruta (§2.2 del contrato P3): constructores de URL PUROS que sustentan
 * `NavApi`. Ningún efecto aquí (nada de `goto`, nada de router): eso lo compone la Fase 2 sobre
 * estas funciones. Es el ÚNICO sitio del repo que sabe cómo se ve una URL de Vega (§2.4, mapa
 * de rutas normativo) — nadie más compone URLs a mano.
 *
 * `type`/`id` se codifican con `encodeURIComponent` por higiene (nombres de colección/ids no
 * deberían necesitarlo, pero un id o tipo con caracteres especiales no debe romper la URL).
 */

import type { RecordId } from '$lib/backend';

/** `/` — índice. */
export function indexRoute(): string {
	return '/';
}

/** `/c/:type` — listado (P4) o resolutor de singleton (§3.3). */
export function listRoute(type: string): string {
	return `/c/${encodeURIComponent(type)}`;
}

/** `/c/:type/new` — creación (P5). */
export function newRoute(type: string): string {
	return `/c/${encodeURIComponent(type)}/new`;
}

/** `/c/:type/:id` — edición (P5). */
export function recordRoute(type: string, id: RecordId): string {
	return `/c/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
}

/** `/media` — biblioteca de medios (P6; placeholder hasta entonces). */
export function mediaRoute(): string {
	return '/media';
}

/** `/settings` — monta el `ManifestEditor` de P2. */
export function settingsRoute(): string {
	return '/settings';
}

/** `/login` — única ruta pública. */
export function loginRoute(): string {
	return '/login';
}
