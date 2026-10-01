/**
 * Lógica PURA de "¿debe verse el `UpdateBanner`?" (P8): sin `localStorage`/DOM — recibe la caché
 * y la versión descartada ya leídas (`update/storage.ts` es quien las lee de verdad), mismo
 * criterio de separación que `theme/preferences.ts` (puro) vs `theme/apply.ts` (impuro).
 */

import { VEGA_VERSION } from '$lib/version';
import { compareSemver } from './check-update';
import type { CachedUpdateCheck } from './storage';

/**
 * El banner se muestra solo si la última comprobación cacheada encontró una versión más nueva
 * (`kind === 'update-available'`) Y esa versión concreta (`latest`) no es la que el usuario ya
 * descartó. Descartar una versión no descarta las SIGUIENTES: si sale una release aún más nueva,
 * `latest` cambia y `dismissedVersion` deja de coincidir, así que vuelve a aparecer.
 *
 * Además `latest` debe ser MAYOR que la versión instalada AHORA (`installedVersion`, por defecto
 * `VEGA_VERSION`): la caché se escribió con la versión de entonces, y si la persona ha actualizado
 * desde la comprobación, anunciarle la versión que ya tiene sería un aviso falso.
 */
export function shouldShowUpdateBanner(
	cached: CachedUpdateCheck | null,
	dismissedVersion: string | null,
	installedVersion: string = VEGA_VERSION
): boolean {
	if (!cached || cached.status.kind !== 'update-available') return false;
	if (compareSemver(cached.status.latest, installedVersion) <= 0) return false;
	return cached.status.latest !== dismissedVersion;
}
