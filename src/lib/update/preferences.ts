/**
 * Lógica PURA de "¿debe verse el `UpdateBanner`?" (P8): sin `localStorage`/DOM — recibe la caché
 * y la versión descartada ya leídas (`update/storage.ts` es quien las lee de verdad), mismo
 * criterio de separación que `theme/preferences.ts` (puro) vs `theme/apply.ts` (impuro).
 */

import type { CachedUpdateCheck } from './storage';

/**
 * El banner se muestra solo si la última comprobación cacheada encontró una versión más nueva
 * (`kind === 'update-available'`) Y esa versión concreta (`latest`) no es la que el usuario ya
 * descartó. Descartar una versión no descarta las SIGUIENTES: si sale una release aún más nueva,
 * `latest` cambia y `dismissedVersion` deja de coincidir, así que vuelve a aparecer.
 */
export function shouldShowUpdateBanner(
	cached: CachedUpdateCheck | null,
	dismissedVersion: string | null
): boolean {
	if (!cached || cached.status.kind !== 'update-available') return false;
	return cached.status.latest !== dismissedVersion;
}
