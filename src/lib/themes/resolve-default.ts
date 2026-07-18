/**
 * Validación de `site.defaultTheme` (§6.4 del contrato P7, el hand-off con P2): cascada
 * determinista que decide qué `ThemeId` arranca la SPA, resolviendo aliases y emitiendo un
 * `ThemeNotice` (propio de P7, D-P7.6 — NO reabre el enum `WarningCode` de P2) cuando el
 * `defaultTheme` del manifiesto no existe entre los temas de esta versión de Vega.
 *
 * Módulo PURO (L6): sin red, sin reloj, sin `localStorage`/DOM — recibe TODAS sus entradas ya
 * leídas (`theme.svelte.ts` es quien lee `localStorage` y llama a esta función).
 *
 * Nota de implementación (desviación menor de la firma ilustrativa del contrato §6.4): la
 * firma normativa solo lista `{ stored, manifestDefault, knownIds }`, pero el punto 1 de la
 * cascada exige "resolviendo aliases" — imposible con un `knownIds: string[]` plano sin también
 * conocer el MAPEO alias→canónico. Se añaden `aliases` (el mapeo) y `fallback` (en vez de
 * importar `FALLBACK_THEME` de `themes.generated.ts` a ciegas) como campos explícitos del
 * input: mantiene la función determinista y testable con fixtures 100% sintéticos (§9.7), sin
 * atarla a los 5 temas reales de v1. El punto de llamada real (P3) le pasa
 * `THEME_ALIASES`/`FALLBACK_THEME` de `themes.generated.ts` tal cual.
 */

/** Aviso de P7 (D-P7.6): P3 lo muestra junto al resto de avisos de tema (topbar/ajustes), NUNCA
 * en el indicador de warnings del manifiesto (ese es el `WarningCode` cerrado de P2). */
export interface ThemeNotice {
	readonly code: 'default-theme-unknown';
	readonly message: string;
}

export interface ResolveDefaultThemeInput {
	/** Elección persistida del dispositivo (`localStorage`), o `null` si aún no eligió nada. */
	readonly stored: string | null;
	/** `ContentModel.site.defaultTheme` de P2 — string OPACO, P7 es quien lo valida (§0). */
	readonly manifestDefault: string | null;
	/** Todo id válido: canónicos + aliases (unión de `THEMES.map(id)` y `Object.keys(THEME_ALIASES)`). */
	readonly knownIds: readonly string[];
	/** Alias → id canónico (`THEME_ALIASES` de `themes.generated.ts`). */
	readonly aliases: Readonly<Record<string, string>>;
	/** `FALLBACK_THEME` (§10, `niebla`) — a qué cae la cascada si nada resuelve. */
	readonly fallback: string;
}

export interface ResolveDefaultThemeResult {
	readonly themeId: string;
	readonly notice: ThemeNotice | null;
}

function canonicalize(id: string, aliases: Readonly<Record<string, string>>): string {
	return aliases[id] ?? id;
}

/**
 * Cascada normativa (§6.4, determinista, L9 "defaultTheme desconocido ⇒ fallback + aviso,
 * nunca crash ni tema en blanco"):
 * 1. `stored` si existe entre `knownIds` → ese (canonicalizado), sin aviso.
 * 2. `manifestDefault` si existe entre `knownIds` → ese (canonicalizado), sin aviso.
 * 3. `manifestDefault` presente pero desconocido → `fallback` + notice `default-theme-unknown`.
 * 4. Ausente en ambos (o `stored` desconocido y sin `manifestDefault` útil) → `fallback`, sin
 *    aviso (estado normal de un PB virgen, casos límite §12.3/§12.9).
 */
export function resolveDefaultTheme(input: ResolveDefaultThemeInput): ResolveDefaultThemeResult {
	const { stored, manifestDefault, knownIds, aliases, fallback } = input;

	if (stored != null && knownIds.includes(stored)) {
		return { themeId: canonicalize(stored, aliases), notice: null };
	}
	if (manifestDefault != null && knownIds.includes(manifestDefault)) {
		return { themeId: canonicalize(manifestDefault, aliases), notice: null };
	}
	if (manifestDefault != null) {
		return {
			themeId: fallback,
			notice: {
				code: 'default-theme-unknown',
				message: `El tema "${manifestDefault}" del manifiesto no existe en esta versión de Vega; se usó "${fallback}".`
			}
		};
	}
	return { themeId: fallback, notice: null };
}
