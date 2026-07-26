<script lang="ts">
	/**
	 * `ExportDialog.svelte` (§3 del contrato, ver la cabecera de `export-collection.ts`): diálogo
	 * modal que arranca desde el botón "Exportar" de `/c/[type]/+page.svelte` — mismo patrón visual
	 * y estructural (backdrop + panel centrado, foco atrapado) que `DeleteConfirm.svelte`, pero sin
	 * ninguna de las piezas de aviso de referencias/papelera (no aplican: exportar no borra nada).
	 * Componente TONTO en el sentido de `+page.svelte` (nadie más lo instancia ni decide CUÁNDO
	 * abrirse), pero a diferencia de `DeleteConfirm`/`Pagination` SÍ toca el puerto directamente
	 * (`ctx.port.list`/`fileUrl` vía `exportCollection`) — exportar no muta nada, así que no hay
	 * razón para que la ruta sea la dueña de la llamada como sí lo es de `ctx.port.delete`.
	 *
	 * ## Máquina de dos fases, no tres
	 * `phase: 'choice' | 'running'`. Deliberadamente SIN una fase `'error'` inline: un fallo de
	 * `exportCollection` (red, backend) cierra el diálogo y va a `ctx.feedback.reportError` — el
	 * MISMO reparto que `confirmDelete` en `+page.svelte` (nunca un estado de error propio del
	 * diálogo, el feedback global de P3 ya sabe pintar cada `VegaErrorKind` en su superficie
	 * correcta). Menos estados que mantener sincronizados y una única forma de que un error se vea
	 * en toda la app, no una propia de este diálogo.
	 *
	 * ## Cancelación = la única forma de cerrar mientras exporta
	 * Mientras `phase === 'running'`, Esc/backdrop/el botón (que cambia de rótulo) NO cierran el
	 * diálogo directamente — piden cancelar (`cancelRequested = true`, leído por
	 * `paginate.ts#fetchAllPages` ANTES de cada página, ver su cabecera). El diálogo se cierra SOLO
	 * cuando `exportCollection` devuelve con `cancelled: true` — si se cerrara al instante, la
	 * exportación seguiría en vuelo en segundo plano sin que nadie la vea ni pueda pararla del
	 * todo, gastando red para nada.
	 *
	 * ## Alcance SIEMPRE con las dos opciones visibles (§3, "sin adivinar")
	 * Los dos radios ("toda la colección" / "solo el filtro o búsqueda activos") se pintan
	 * SIEMPRE — nunca se esconde ninguno—, pero el segundo va `disabled` cuando `hasActiveFilters`
	 * es `false`: sin ningún filtro ni búsqueda aplicados, esa opción produciría EXACTAMENTE el
	 * mismo fichero que "toda la colección", así que ofrecerla como una alternativa real sería la
	 * ilusión de una elección que no existe. `+page.svelte` ya calcula `hasActiveFilters` con el
	 * mismo criterio que usa para "Limpiar filtros"/las chips activas — un único punto de verdad de
	 * "¿hay algo activo?", reutilizado aquí.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend/errors';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { ViewState } from '$lib/list/query-state';
	import { VEGA_VERSION } from '$lib/version';
	import { exportCollection, type ExportScope } from './export-collection';
	import { buildTransferDocument, transferFilename } from './transfer-format';
	import { downloadTransferDocument } from './download';

	interface Props {
		open: boolean;
		contentType: ResolvedContentType;
		/** Vista actual del listado (Fase 4b, `$lib/list/query-state.ts`): la base del scope
		 *  `'filtered'`, vía `buildListQuery` (misma query que ya pinta el listado). */
		viewState: ViewState;
		/** `true` si `viewState` trae búsqueda o filtro de estado activos — calculado por
		 *  `+page.svelte` (mismo criterio que "Limpiar filtros"), ver cabecera. */
		hasActiveFilters: boolean;
		onClose: () => void;
	}

	let { open, contentType, viewState, hasActiveFilters, onClose }: Props = $props();

	const ctx = getVegaContext();

	let phase = $state<'choice' | 'running'>('choice');
	let scope = $state<ExportScope>('all');
	let fetched = $state(0);
	let total = $state(0);
	let cancelRequested = false;

	// Reasienta el estado en CADA apertura (mismo criterio que `agreedDespiteReferences` de
	// `DeleteConfirm`): un diálogo reabierto nunca hereda el scope/progreso de la exportación
	// anterior. El scope por defecto favorece "filtrado" cuando hay algo activo (es lo que el
	// usuario está mirando en pantalla ahora mismo), "toda la colección" si no hay nada que filtrar.
	$effect(() => {
		if (!open) return;
		phase = 'choice';
		scope = hasActiveFilters ? 'filtered' : 'all';
		fetched = 0;
		total = 0;
		cancelRequested = false;
	});

	/** Arranca la exportación (botón "Exportar" de la fase `'choice'`). */
	async function startExport(): Promise<void> {
		phase = 'running';
		try {
			const { collection, cancelled } = await exportCollection(
				ctx.port,
				contentType,
				scope,
				viewState,
				{
					onProgress: (f, t) => {
						fetched = f;
						total = t;
					},
					isCancelled: () => cancelRequested
				}
			);
			if (cancelled) {
				onClose();
				return;
			}
			const doc = buildTransferDocument([collection], {
				backendUrl: window.location.origin,
				vegaVersion: VEGA_VERSION
			});
			downloadTransferDocument(doc, transferFilename(contentType.name));
			const count = collection.records.length;
			ctx.feedback.toast(
				ctx.t(count === 1 ? 'list.export.success.one' : 'list.export.success.many', {
					count,
					label: contentType.label
				}),
				{ kind: 'success' }
			);
			onClose();
		} catch (err) {
			onClose();
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend(ctx.t('list.export.error'), err)
			);
		}
	}

	/** Esc / backdrop / botón "Cancelar" (ver cabecera): mientras exporta, PIDE cancelar en vez de
	 *  cerrar — el cierre real lo hace `startExport()` al ver `cancelled: true`. */
	function requestClose(): void {
		if (phase === 'running') {
			cancelRequested = true;
			return;
		}
		onClose();
	}

	// ————— Diálogo modal cancelable: foco atrapado + foco inicial (mismo patrón que DeleteConfirm) —————
	let dialogEl = $state<HTMLElement | null>(null);
	let firstScopeEl = $state<HTMLInputElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	function focusableItems(): HTMLElement[] {
		if (!dialogEl) return [];
		return Array.from(
			dialogEl.querySelectorAll<HTMLElement>('button, input:not([disabled])')
		).filter((el) => !el.hasAttribute('disabled'));
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			requestClose();
			return;
		}
		if (event.key !== 'Tab') return;
		const items = focusableItems();
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (!open) return;

		previouslyFocused = document.activeElement as HTMLElement | null;
		firstScopeEl?.focus();

		document.addEventListener('keydown', handleKeydown, true);
		return () => {
			document.removeEventListener('keydown', handleKeydown, true);
			if (previouslyFocused && document.contains(previouslyFocused)) {
				previouslyFocused.focus();
			}
		};
	});
</script>

{#if open}
	<div class="vega-export-backdrop">
		<div
			class="vega-export-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="vega-export-title"
			bind:this={dialogEl}
		>
			<h2 id="vega-export-title">
				{ctx.t('list.export.dialog.title', { label: contentType.label })}
			</h2>

			{#if phase === 'choice'}
				<fieldset class="vega-export-scope">
					<legend>{ctx.t('list.export.dialog.scopeLabel')}</legend>
					<label>
						<input
							type="radio"
							name="vega-export-scope"
							value="all"
							checked={scope === 'all'}
							onchange={() => (scope = 'all')}
							bind:this={firstScopeEl}
						/>
						{ctx.t('list.export.scope.all')}
					</label>
					<label class:vega-export-scope-disabled={!hasActiveFilters}>
						<input
							type="radio"
							name="vega-export-scope"
							value="filtered"
							checked={scope === 'filtered'}
							disabled={!hasActiveFilters}
							onchange={() => (scope = 'filtered')}
						/>
						{ctx.t('list.export.scope.filtered')}
					</label>
					{#if !hasActiveFilters}
						<p class="vega-export-scope-hint">{ctx.t('list.export.scope.filteredDisabledHint')}</p>
					{/if}
				</fieldset>

				<div class="vega-export-actions">
					<button type="button" onclick={requestClose}>{ctx.t('common.cancel')}</button>
					<button type="button" class="vega-export-confirm" onclick={startExport}>
						{ctx.t('list.export.dialog.confirm')}
					</button>
				</div>
			{:else}
				<div class="vega-export-progress" aria-live="polite">
					{#if total === 0}
						<p>{ctx.t('list.export.progress.starting')}</p>
					{:else}
						<progress value={fetched} max={total}></progress>
						<p>{ctx.t('list.export.progress', { fetched, total })}</p>
					{/if}
				</div>

				<div class="vega-export-actions">
					<button type="button" onclick={requestClose}>{ctx.t('common.cancel')}</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.vega-export-backdrop {
		position: fixed;
		z-index: 70;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--vega-space-gutter);
		/* Scrim theme-independiente, mismo criterio que `.vega-delete-backdrop` (allowlisted en
		   check-theme-coverage.mjs). */
		background: rgb(15 17 21 / 55%);
	}

	.vega-export-dialog {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
		max-width: 24rem;
		padding: 1.5rem;
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-card);
	}

	.vega-export-dialog h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.vega-export-scope {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border: 0;
		margin: 0;
		padding: 0;
	}

	.vega-export-scope legend {
		padding: 0;
		margin-bottom: 0.25rem;
		color: var(--ink-2);
		font-size: 0.85rem;
		font-weight: 600;
	}

	.vega-export-scope label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--ink);
		font-size: 0.9rem;
		cursor: pointer;
	}

	.vega-export-scope label.vega-export-scope-disabled {
		color: var(--ink-2);
		cursor: not-allowed;
	}

	.vega-export-scope-hint {
		margin: 0;
		padding-left: 1.55rem;
		color: var(--ink-2);
		font-size: 0.8rem;
	}

	.vega-export-progress {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.vega-export-progress progress {
		width: 100%;
	}

	.vega-export-progress p {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-export-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.vega-export-actions button {
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.9rem;
		cursor: pointer;
	}

	.vega-export-confirm {
		border-color: transparent;
		background: var(--accent-fill);
		color: var(--accent-ink);
		font-weight: 600;
	}
</style>
