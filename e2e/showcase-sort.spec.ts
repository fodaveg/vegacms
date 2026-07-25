/**
 * Regresión del bug de `defaultSort` + `cycleSort` (code-review del lote "match 1:1", 2026-07-24).
 *
 * `SHOWCASE_SEED.entradas` declara `defaultSort: { field: 'updated', dir: 'desc' }`, así que la
 * lista arranca ordenada por "Actualizado" descendente SIN orden explícito en la URL (la flecha ↓
 * del mockup). El `onSort` de `+page.svelte` debe alimentar `cycleSort` con el orden EXPLÍCITO
 * (`viewState.sort`, `null` mientras solo actúa el `defaultSort`), NO con `effectiveSort` (que ya
 * incluye el fallback): si se le pasa el `effectiveSort` desc, `cycleSort(desc, field) → null`, y
 * `null` vuelve a resolver al mismo `defaultSort` desc → la cabecera queda MUERTA (nunca se alcanza
 * `asc`). Este test clica "Actualizado" y exige que el `aria-sort` pase de `descending` a
 * `ascending` — con el bug se quedaba clavado en `descending`.
 *
 * Corre contra `SHOWCASE_SEED` (flag `__VEGA_SEED_SHOWCASE__`, ver `fixtures.ts`), no contra
 * `DEMO_SEED` — este último no declara `defaultSort`, por eso el resto de la suite no cazaba el bug.
 */
import { test, expect, loginAsDemo } from './fixtures';

test('defaultSort desc: la cabecera ordenada sigue siendo alternable (asc al primer click)', async ({
	page
}) => {
	await loginAsDemo(page, { seedShowcase: true });
	await page.goto('/c/entradas');

	const actualizado = page.getByRole('columnheader', { name: /Actualizado/ });
	// Arranca en descendente por el `defaultSort` de `entradas` (sin orden en la URL).
	await expect(actualizado).toHaveAttribute('aria-sort', 'descending');

	// Un click debe alternar a ascendente (con el bug se quedaba en 'descending' para siempre).
	await actualizado.getByRole('button').click();
	await expect(actualizado).toHaveAttribute('aria-sort', 'ascending');
});
