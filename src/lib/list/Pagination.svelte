<script lang="ts">
	/**
	 * `Pagination.svelte` (Fase 4c del contrato P4, D-P4.5): Anterior/Siguiente + "{page} de
	 * {totalPages}" + total de registros. `perPage` es fijo (`DEFAULT_PER_PAGE`, 30): esta fase no
	 * ofrece cambiar el tamaño de página desde la vista.
	 *
	 * Componente TONTO a propósito: no navega por su cuenta. `src/lib/list/**` NO está en la lista
	 * de directorios exentos de `svelte/no-navigation-without-resolve` (ver `eslint.config.js`), así
	 * que `onPrev`/`onNext` los cablea `+page.svelte` (sí exento) con `goto()`, respetando el guard
	 * router-ready (P3-L9) igual que el resto de navegación programática del shell.
	 */
	import { getVegaContext } from '$lib/app-context';

	interface Props {
		page: number;
		totalPages: number;
		totalItems: number;
		onPrev: () => void;
		onNext: () => void;
	}

	let { page, totalPages, totalItems, onPrev, onNext }: Props = $props();

	const ctx = getVegaContext();
</script>

<div class="vega-pagination" data-pagination>
	<button type="button" onclick={onPrev} disabled={page <= 1}>
		{ctx.t('list.pagination.prev')}
	</button>
	<span class="vega-pagination-status">
		{ctx.t('list.pagination.pageOf', { page, totalPages })}
		·
		{ctx.t('list.pagination.total', { count: totalItems })}
	</span>
	<button type="button" onclick={onNext} disabled={page >= totalPages}>
		{ctx.t('list.pagination.next')}
	</button>
</div>

<style>
	.vega-pagination {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: var(--vega-space-gutter);
		font-size: 0.85rem;
		color: var(--vega-color-text-muted);
	}

	.vega-pagination button {
		padding: 0.35rem 0.8rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-pagination button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.vega-pagination-status {
		white-space: nowrap;
	}
</style>
