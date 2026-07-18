/**
 * `IconRegistry` de Vega (§2.7 del contrato P3): P3 POSEE el set de iconos. Este módulo solo
 * fija el REGISTRO de ids — los SVG en sí (trazo propio, sin dependencia) y `Icon.svelte`
 * llegan con la Fase 2. `knownIcons` es la fuente única que P3 pasa a `loadContentModel` y al
 * `ManifestEditor` de P2; un icono del manifiesto fuera de este set produce el warning
 * `icon-unknown` de P2 (P3 no lo revalida).
 *
 * Set de arranque (§2.7 + fallbacks documentados en el contrato): cubre el chrome del shell
 * (nav, ajustes, medios, logout, warning, colapso de sidebar) más los fallbacks genéricos
 * (`NavItem.icon === null` → `generic`; singleton sin icono → `settings`, contrato P2 §4.8) y
 * un puñado de acciones comunes que P4/P5 reutilizarán (crear, buscar, cerrar, ok). Ampliable
 * sin romper compatibilidad: añadir un id nuevo nunca invalida un manifiesto existente.
 */

/**
 * Set de iconos empaquetado por P3 (§2.7): fuente única de `knownIcons` para P2. El tipo vive
 * aquí, en su módulo dueño (patrón de P2: cada módulo posee sus tipos); `$lib/app-context` lo
 * reexporta para quien consuma el `VegaAppContext` completo.
 */
export interface IconRegistry {
	/** Ids del set empaquetado. Se inyecta a P2 (`loadContentModel`/`ManifestEditor`). */
	readonly knownIcons: readonly string[];
	/** `true` si `id` existe en el set. */
	has(id: string): boolean;
}

/**
 * Ids conocidos, en orden alfabético (estable y determinista: mismo array en cada import, base
 * cómoda para listar iconos en un selector futuro sin depender del orden de declaración).
 */
const ICON_IDS = [
	'check',
	'chevron',
	'close',
	'document',
	'generic',
	'list',
	'logout',
	'media',
	'menu',
	'plus',
	'search',
	'settings',
	'user',
	'warning'
] as const;

/** Id de icono del set empaquetado por P3. */
export type IconId = (typeof ICON_IDS)[number];

/** `knownIcons` de `IconRegistry`, expuesto también suelto para quien solo necesite la lista. */
export const knownIcons: readonly IconId[] = ICON_IDS;

/** Implementación del `IconRegistry` que P3 publica en `VegaAppContext.icons`. */
export const iconRegistry: IconRegistry = {
	knownIcons,
	has(id: string): boolean {
		return (ICON_IDS as readonly string[]).includes(id);
	}
};
