<script lang="ts">
	/**
	 * `/media` (§2.4 del contrato P3; §9/L-P6.3/L-P6.5/L-P6.10 del contrato P6, Fase 6a "bootstrap
	 * + esquema"): reemplaza el placeholder honesto pre-P6 por el bootstrap REAL de la colección
	 * `vega_media`, reproduciendo el mismo patrón que P2 en `/settings` (consentimiento EXPLÍCITO
	 * del superuser ANTES de crear nada, nunca automático).
	 *
	 * Carga inicial (solo cliente, `onMount`; esta ruta no navega programáticamente así que no
	 * depende de `routerReady`, a diferencia del índice — ver `+layout.svelte`):
	 * - `types` ← `port.listContentTypes()`.
	 * - `collectionState` ← `computeMediaCollectionState(types, capabilities.schemaBootstrap)`
	 *   (§9: llamada directa al cálculo genérico de `$lib/backend/collection-state`, generalizado
	 *   en esta misma fase — audit H6, NO se clona el de `/settings`).
	 *
	 * Los tres desenlaces (§9):
	 * - `'present'`: el MARCO de la biblioteca. El grid real (con los medios existentes) es 6b;
	 *   aquí solo el estado VACÍO honesto (P3-L10 "nada muere en silencio" ≠ "no hay nada que
	 *   mostrar todavía"). NO se implementa grid ni subida en esta fase.
	 * - `'creatable'`: gate de confirmación inline (mismo tono que `ManifestEditor`, nunca
	 *   `window.confirm`) → al confirmar, `ensureMediaCollection(port)` (L-P6.10: la spec que
	 *   llega a `ensureCollections` contiene ÚNICAMENTE `vega_media`) → refresca `types` a
	 *   `'present'`.
	 * - `'manual'`: `capabilities.schemaBootstrap` es `false` → el JSON de importación
	 *   determinista de `buildMediaBootstrapImportJson()` (L-P6.5), sin botón de crear.
	 *
	 * Errores de TRANSPORTE (`VegaError`) → `ctx.feedback.reportError` (nunca pantalla blanca);
	 * el hueco local solo ofrece "Reintentar", igual que `/settings`.
	 */
	import { onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError, type ContentType } from '$lib/backend';
	import {
		buildMediaBootstrapImportJson,
		computeMediaCollectionState,
		ensureMediaCollection
	} from '$lib/media/media-collection';

	const ctx = getVegaContext();

	type LoadStatus = 'loading' | 'ready' | 'error';

	let status = $state<LoadStatus>('loading');
	let types = $state<ContentType[]>([]);
	/** `true` mientras se muestra la confirmación inline del estado `'creatable'` (mismo gate que
	 *  §A.4.6 en `ManifestEditor`): el usuario pulsó "Crear colección" pero aún no confirmó. */
	let confirmingCreate = $state(false);
	let creating = $state(false);

	const collectionState = $derived(
		computeMediaCollectionState(types, ctx.port.capabilities.schemaBootstrap)
	);
	const bootstrapImportJson = $derived(
		collectionState === 'manual' ? buildMediaBootstrapImportJson() : null
	);

	async function load(): Promise<void> {
		status = 'loading';
		try {
			types = await ctx.port.listContentTypes();
			status = 'ready';
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error cargando /media', err);
			ctx.feedback.reportError(vegaErr, { action: 'media:load' });
			status = 'error';
		}
	}

	onMount(() => {
		void load();
	});

	function handleCreateClick(): void {
		confirmingCreate = true;
	}

	function handleCancelCreate(): void {
		confirmingCreate = false;
	}

	async function handleConfirmCreate(): Promise<void> {
		creating = true;
		try {
			// L-P6.10: único punto de llamada, encapsula la spec (solo `vega_media`).
			await ensureMediaCollection(ctx.port);
			types = await ctx.port.listContentTypes();
			confirmingCreate = false;
		} catch (err) {
			const vegaErr =
				err instanceof VegaError
					? err
					: VegaError.backend('Error creando la colección "vega_media"', err);
			ctx.feedback.reportError(vegaErr, { action: 'media:ensureCollections' });
		} finally {
			creating = false;
		}
	}
</script>

<div class="vega-media-page">
	<header class="vega-media-header">
		<h1>{ctx.t('nav.media')}</h1>
	</header>

	{#if status === 'loading'}
		<p aria-live="polite">{ctx.t('common.loading')}</p>
	{:else if status === 'error'}
		<div class="vega-media-error" role="alert">
			<p>{ctx.t('media.loadErrorBody')}</p>
			<button type="button" onclick={() => load()}>{ctx.t('common.retry')}</button>
		</div>
	{:else if collectionState === 'manual'}
		<div class="notice notice-bootstrap" role="alert">
			<p>{ctx.t('media.bootstrap.manualBody')}</p>
			<p>{ctx.t('media.bootstrap.manualImportHint')}</p>
			{#if bootstrapImportJson}
				<pre class="bootstrap-json">{bootstrapImportJson}</pre>
			{/if}
		</div>
	{:else if collectionState === 'creatable'}
		<div class="vega-media-empty" data-media-state="creatable">
			<p>{ctx.t('media.empty.title')}</p>
			<button type="button" onclick={handleCreateClick} disabled={creating}>
				{ctx.t('media.bootstrap.create')}
			</button>
		</div>

		{#if confirmingCreate}
			<!-- Confirmación INLINE (nunca `window.confirm`, que bloquea), mismo patrón que
			     `ManifestEditor` §A.4.6. -->
			<div class="notice notice-confirm" role="alertdialog" aria-live="assertive">
				<p>{ctx.t('media.bootstrap.confirmBody')}</p>
				<div class="actions">
					<button type="button" onclick={handleConfirmCreate} disabled={creating}>
						{creating ? ctx.t('media.bootstrap.creating') : ctx.t('media.bootstrap.confirm')}
					</button>
					<button type="button" onclick={handleCancelCreate} disabled={creating}>
						{ctx.t('common.cancel')}
					</button>
				</div>
			</div>
		{/if}
	{:else}
		<!-- 'present': marco de la biblioteca. Grid real + subida = 6b/6c; aquí el estado vacío
		     honesto, data-media-state para que los e2e lo localicen sin depender del idioma. -->
		<div class="vega-media-empty" data-media-state="present">
			<h2>{ctx.t('media.empty.title')}</h2>
			<p>{ctx.t('media.empty.body')}</p>
		</div>
	{/if}
</div>

<style>
	.vega-media-page {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 60rem;
	}

	.vega-media-header h1 {
		margin: 0;
		font-size: 1.3rem;
	}

	.vega-media-error {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.vega-media-error button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		cursor: pointer;
	}

	.vega-media-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1.5rem;
		border: 1px dashed var(--line);
		border-radius: 8px;
		background: var(--surface-2);
	}

	.vega-media-empty h2 {
		margin: 0;
		font-size: 1.05rem;
	}

	.vega-media-empty p {
		margin: 0;
		color: var(--ink-2);
	}

	.vega-media-empty button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--btn);
		color: var(--ink);
		cursor: pointer;
	}

	.vega-media-empty button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.notice {
		padding: 0.75rem 1rem;
		border-radius: 4px;
		border: 1px solid;
	}

	.notice-bootstrap {
		border-color: var(--warning);
		background: var(--warning-soft);
		color: var(--warning);
	}

	.notice-confirm {
		border-color: var(--info);
		background: var(--info-soft);
		color: var(--info);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.notice p {
		margin: 0 0 0.5rem;
	}

	.notice p:last-child {
		margin-bottom: 0;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.actions button {
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--btn);
		color: var(--ink);
		cursor: pointer;
	}

	.actions button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.bootstrap-json {
		max-height: 16rem;
		overflow: auto;
		padding: 0.5rem;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 4px;
		font-family: ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 0.8rem;
	}
</style>
