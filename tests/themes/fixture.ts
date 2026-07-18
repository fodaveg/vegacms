/**
 * Fixtures compartidos de la suite de P7 (§9 del contrato): un tema sintético mínimo válido +
 * helpers para clonar/perturbar (sub-AA, overrides de neutros…) sin depender de los 5 temas
 * reales de `src/lib/themes/`. Mantiene los tests de validadores independientes del set
 * curado — si mañana cambian los 5 temas reales, esta suite no se rompe salvo los tests que
 * explícitamente cargan `src/lib/themes/*.theme.json` (equivalence/artifacts-in-sync).
 */

/** Tema mínimo válido (pasa `validateSchema`/`validateContrast`/`validateComponentContrast` en
 * ambos modos, con margen — mismo par tint/accent/accentInk que `pizarra.theme.json`, ya
 * verificado por el gate real). Sin overrides. */
export function makeTheme(overrides: Record<string, unknown> = {}) {
	return {
		themeSchemaVersion: 1,
		id: 'fixture',
		name: 'Fixture',
		group: 'frios',
		roles: {
			tint: '#5d6d83',
			accent: '#5d6d83',
			accentInk: '#ffffff'
		},
		__file: 'fixture.theme.json',
		...overrides
	};
}
