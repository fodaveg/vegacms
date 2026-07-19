<script lang="ts">
	/**
	 * `/settings` (§2.4, §3.5/§3.5.1 del contrato P3): monta el `ManifestEditor` REAL de P2 con sus
	 * props reales, y aloja la lista completa de warnings (L10). Última pieza de la Fase 3b: con
	 * esto se cierra P3.
	 *
	 * Carga inicial (§3.5), hecha aquí y no delegada a `loadContentModel` (que solo expone el
	 * `ManifestState` YA resuelto, no el JSON crudo que el editor necesita para su textarea):
	 * - `types` ← `port.listContentTypes()`.
	 * - `initialManifestRaw` ← el campo `manifest` del registro único de `vega`, leído con el MISMO
	 *   criterio que `loadContentModel` (P2 §6.2: 0 registros ⇒ `null`; se usa el primero si hay
	 *   más de uno — el aviso `multiple-vega-records` de ESO ya lo pinta `WarningsList` vía
	 *   `ctx.model.warnings`, no hace falta duplicarlo aquí). `'manifest'` es la convención de
	 *   campo de P2 §6.1 (no exportada desde `model/load.ts`, que es el único módulo de P2 que
	 *   puede tocar el puerto — esta ruta no puede importar de ahí más que `saveManifest`).
	 * - `collectionState` ← `computeCollectionState` (Fase 1; generalizada en P6 §9 y movida a
	 *   `$lib/backend/collection-state`) sobre esos mismos `types` + `VEGA_COLLECTION.name` +
	 *   `port.capabilities.schemaBootstrap`.
	 *
	 * Errores de TRANSPORTE en esta lectura (`VegaError`) → `ctx.feedback.reportError` (P3-L3): el
	 * banner/overlay globales los pintan (nunca `err.cause` ni pantalla blanca); aquí solo queda un
	 * estado local mínimo con "Reintentar" en el hueco donde iría el editor.
	 *
	 * El botón "Recargar modelo" (§3.2: refresco de `ContentModel` sin pasar por un guardado) llama
	 * `ctx.reloadModel()` directo — es también el disparador REAL del e2e de expiración durante
	 * edición (§7.B.10): dispara `listContentTypes`/`list`, el mismo par que el gancho de e2e
	 * `__VEGA_FORCE_EXPIRE__` intercepta (`session/backend.ts`).
	 *
	 * Selectores de tema/modo activos (F7w-b): texto en `--accent-text` (acento como texto sobre
	 * `--surface`), borde en `--accent`.
	 */
	import { onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { VEGA_COLLECTION, VegaError, type ContentType, type JsonValue } from '$lib/backend';
	import { computeCollectionState } from '$lib/backend/collection-state';
	import { saveManifest } from '$lib/model/load';
	import { setMode, setTheme } from '$lib/theme/apply';
	import type { ThemeMode } from '$lib/theme/preferences';
	import { FALLBACK_THEME, THEMES } from '$lib/themes/themes.generated';
	import ManifestEditor from '$lib/model/editor/ManifestEditor.svelte';
	import WarningsList from '$lib/shell/WarningsList.svelte';

	const ctx = getVegaContext();

	/**
	 * Sección "Apariencia" (Fase F7w-a, "encender los temas"): selector de tema (5 opciones del
	 * motor P7, `THEMES`) + toggle de modo claro/oscuro. NO usa el store `theme.svelte.ts` de P7
	 * (todavía no adoptado como runtime, ver cabecera de `theme/apply.ts`) — solo consume sus datos
	 * estáticos (`THEMES`/`FALLBACK_THEME`) y llama a los setters de `theme/apply.ts`, el mismo
	 * runtime que ya usa `DensityToggle` (montado en la topbar, no se duplica aquí).
	 *
	 * El estado local (`activeTheme`/`activeMode`) espeja `document.documentElement.dataset.*` —
	 * ya escrito por `applyInitialTheme()` antes de que este componente monte (§2.6) — para poder
	 * marcar visualmente la opción activa; se reasigna en el propio `onclick`, sin esperar a que el
	 * DOM confirme el cambio (idéntico patrón que `DensityToggle.svelte`).
	 */
	function currentTheme(): string {
		return document.documentElement.dataset.theme ?? FALLBACK_THEME;
	}

	function currentMode(): ThemeMode {
		return document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light';
	}

	let activeTheme = $state(currentTheme());
	let activeMode = $state(currentMode());

	function selectTheme(id: string): void {
		activeTheme = id;
		setTheme(id);
	}

	function selectMode(mode: ThemeMode): void {
		activeMode = mode;
		setMode(mode);
	}

	/** Convención de campo del registro `vega` (P2 §6.1): duplicada a propósito, ver cabecera. */
	const MANIFEST_FIELD = 'manifest';

	type LoadStatus = 'loading' | 'ready' | 'error';

	let status = $state<LoadStatus>('loading');
	let types = $state<ContentType[]>([]);
	let initialManifestRaw = $state<JsonValue | null>(null);
	let reloadingModel = $state(false);

	const collectionState = $derived(
		computeCollectionState(types, VEGA_COLLECTION.name, ctx.port.capabilities.schemaBootstrap)
	);

	async function load(): Promise<void> {
		status = 'loading';
		try {
			const discovered = await ctx.port.listContentTypes();
			let manifestRaw: JsonValue | null = null;
			if (discovered.some((t) => t.name === VEGA_COLLECTION.name)) {
				const page = await ctx.port.list(VEGA_COLLECTION.name, { perPage: 1 });
				manifestRaw = page.items.length > 0 ? (page.items[0].values[MANIFEST_FIELD] ?? null) : null;
			}
			types = discovered;
			initialManifestRaw = manifestRaw;
			status = 'ready';
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error cargando /settings', err);
			ctx.feedback.reportError(vegaErr, { action: 'settings:load' });
			status = 'error';
		}
	}

	onMount(() => {
		void load();
	});

	/** §6.3.4 de P2: tras guardar, re-resuelve el modelo para ver los warnings resultantes. También
	 *  refresca `types` en LOCAL: un primer guardado sobre `collectionState: 'creatable'` crea la
	 *  colección `vega` (`ensureCollections`, dentro de `saveManifest`), así que sin este refresco
	 *  el editor seguiría pidiendo la confirmación de bootstrap en el SIGUIENTE guardado aunque la
	 *  colección ya exista. */
	async function handleSave(manifest: JsonValue): Promise<void> {
		// El guardado REAL: si falla (validación o transporte) DEBE propagarse al editor de P2, que
		// lo pinta bajo el textarea ("Error al guardar…"). Este `await` es lo único que puede hacerlo.
		await saveManifest(ctx.port, manifest);
		// A partir de aquí el manifiesto YA está persistido: la housekeeping posterior (refresco de
		// `types` para que `collectionState` pase de 'creatable' a 'present', + `reloadModel`) NO
		// puede reventar hacia el editor — un hipo de red aquí haría reportar "Error al guardar" un
		// guardado que SÍ tuvo éxito (mentira, P3-L3/L10). Sus fallos van al feedback global.
		try {
			types = await ctx.port.listContentTypes();
			await ctx.reloadModel();
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend('Error refrescando tras guardar', err),
				{ action: 'settings:postSaveRefresh' }
			);
		}
		ctx.feedback.toast(ctx.t('settings.saveSuccess'), { kind: 'success' });
	}

	async function handleReloadModel(): Promise<void> {
		reloadingModel = true;
		try {
			await ctx.reloadModel();
		} finally {
			reloadingModel = false;
		}
	}
</script>

<div class="vega-settings-page">
	<header class="vega-settings-header">
		<h1>{ctx.t('nav.settings')}</h1>
		<button type="button" onclick={handleReloadModel} disabled={reloadingModel}>
			{reloadingModel ? ctx.t('settings.reloading') : ctx.t('settings.reload')}
		</button>
	</header>

	<section class="vega-appearance" aria-labelledby="vega-appearance-title">
		<h2 id="vega-appearance-title">{ctx.t('settings.appearance.title')}</h2>

		<div class="vega-appearance-row">
			<span class="vega-appearance-label">{ctx.t('settings.appearance.theme')}</span>
			<div class="vega-theme-picker" role="group" aria-label={ctx.t('settings.appearance.theme')}>
				{#each THEMES as swatch (swatch.id)}
					<button
						type="button"
						class="vega-theme-swatch"
						aria-pressed={activeTheme === swatch.id}
						onclick={() => selectTheme(swatch.id)}
					>
						<!-- Color RUNTIME del dato del swatch (no un literal en el CSS): la barrera
						     anti-color-crudo de `check-theme-coverage.mjs` vigila `.svelte`/`.ts` fuera de
						     `src/lib/themes/`, pero de todos modos NO está encadenada al gate todavía
						     (ver su cabecera) — esto pinta el swatch con el propio dato, legítimo. -->
						<span
							class="vega-theme-swatch-dot"
							style={`background-color: ${swatch.accent}`}
							aria-hidden="true"
						></span>
						{swatch.name}
					</button>
				{/each}
			</div>
		</div>

		<div class="vega-appearance-row">
			<span class="vega-appearance-label">{ctx.t('settings.appearance.mode')}</span>
			<div class="vega-mode-toggle" role="group" aria-label={ctx.t('settings.appearance.mode')}>
				<button
					type="button"
					aria-pressed={activeMode === 'light'}
					onclick={() => selectMode('light')}
				>
					{ctx.t('settings.appearance.light')}
				</button>
				<button
					type="button"
					aria-pressed={activeMode === 'dark'}
					onclick={() => selectMode('dark')}
				>
					{ctx.t('settings.appearance.dark')}
				</button>
			</div>
		</div>
	</section>

	{#if status === 'loading'}
		<p aria-live="polite">{ctx.t('common.loading')}</p>
	{:else if status === 'error'}
		<div class="vega-settings-error" role="alert">
			<p>{ctx.t('settings.loadErrorBody')}</p>
			<button type="button" onclick={() => load()}>{ctx.t('common.retry')}</button>
		</div>
	{:else}
		<ManifestEditor
			{types}
			{initialManifestRaw}
			{collectionState}
			onSave={handleSave}
			knownIcons={ctx.icons.knownIcons}
		/>

		<WarningsList />
	{/if}
</div>

<style>
	.vega-settings-page {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 60rem;
	}

	.vega-settings-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.vega-settings-header h1 {
		margin: 0;
		font-size: 1.3rem;
	}

	.vega-settings-header button {
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		cursor: pointer;
	}

	.vega-settings-header button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.vega-settings-error {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.vega-settings-error button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		cursor: pointer;
	}

	.vega-appearance {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem 1.2rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface-2);
	}

	.vega-appearance h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.vega-appearance-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.vega-appearance-label {
		min-width: 4rem;
		font-size: 0.85rem;
		color: var(--ink-2);
	}

	.vega-theme-picker,
	.vega-mode-toggle {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.vega-theme-swatch,
	.vega-mode-toggle button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.8rem;
		cursor: pointer;
	}

	.vega-theme-swatch[aria-pressed='true'],
	.vega-mode-toggle button[aria-pressed='true'] {
		border-color: var(--accent);
		color: var(--accent-text);
	}

	.vega-theme-swatch-dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		flex-shrink: 0;
	}
</style>
