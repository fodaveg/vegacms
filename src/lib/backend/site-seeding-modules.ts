/**
 * Registro de los módulos de sembrado. PUNTO DE EXTENSIÓN: un módulo nuevo se define en su propio
 * fichero (un `SiteSeedModule`: colecciones a asegurar más fragmento de manifiesto) y se añade a
 * `SITE_SEED_MODULES`. Nada más lo conoce: `seedSiteProject` y `previewSiteSeed` reciben los
 * módulos ya resueltos en `options.modules`.
 *
 * Vive aparte de `site-seeding.ts` para que un módulo pueda importar de allí las reglas y
 * constantes del sembrado sin cerrar un ciclo de imports.
 */

import { SITE_SEED_BASE_MODULE, type SiteSeedModule } from './site-seeding';

/** Todos los módulos que Vega sabe sembrar. La base va la primera y se siembra siempre. */
export const SITE_SEED_MODULES: readonly SiteSeedModule[] = [SITE_SEED_BASE_MODULE];

/** Los módulos que se pueden pedir en `SiteSeedOptions.modules`: todos menos la base. */
export const SITE_SEED_OPTIONAL_MODULES: readonly SiteSeedModule[] = SITE_SEED_MODULES.filter(
	(module) => module !== SITE_SEED_BASE_MODULE
);

export function findSiteSeedModule(id: string): SiteSeedModule | undefined {
	return SITE_SEED_MODULES.find((module) => module.id === id);
}
