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
	 * - `collectionState` ← `computeCollectionState` (Fase 1) sobre esos mismos `types` +
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
	 */
	import { onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { VEGA_COLLECTION, VegaError, type ContentType, type JsonValue } from '$lib/backend';
	import { computeCollectionState } from '$lib/settings/collection-state';
	import { saveManifest } from '$lib/model/load';
	import ManifestEditor from '$lib/model/editor/ManifestEditor.svelte';
	import WarningsList from '$lib/shell/WarningsList.svelte';

	const ctx = getVegaContext();

	/** Convención de campo del registro `vega` (P2 §6.1): duplicada a propósito, ver cabecera. */
	const MANIFEST_FIELD = 'manifest';

	type LoadStatus = 'loading' | 'ready' | 'error';

	let status = $state<LoadStatus>('loading');
	let types = $state<ContentType[]>([]);
	let initialManifestRaw = $state<JsonValue | null>(null);
	let reloadingModel = $state(false);

	const collectionState = $derived(
		computeCollectionState(types, ctx.port.capabilities.schemaBootstrap)
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
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		background: var(--vega-color-bg-raised);
		color: var(--vega-color-text);
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
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		background: var(--vega-color-bg-raised);
		cursor: pointer;
	}
</style>
