<script lang="ts">
	/**
	 * `Pagination.svelte` (Fase 4c del contrato P4, D-P4.5; R4 del rediseño C2 la convierte en el
	 * "gridfoot" numerado del mockup): antes Anterior/Siguiente + "{page} de {totalPages}" +
	 * total, FUERA de la tarjeta de la tabla; ahora vive DENTRO de la misma tarjeta que
	 * `RecordTable` (el wrapper lo compone `+page.svelte`, ver su cabecera) y añade botones
	 * numerados con elipsis (`pageRange`, `page-range.ts`, módulo puro y testeado).
	 *
	 * Componente TONTO a propósito, mismo criterio de siempre: no navega por su cuenta.
	 * `src/lib/list/**` NO está en la lista de directorios exentos de
	 * `svelte/no-navigation-without-resolve` (ver `eslint.config.js`), así que `onPrev`/`onNext`/
	 * `onGoToPage` los cablea `+page.svelte` (sí exento) con `goto()`, respetando el guard
	 * router-ready (P3-L9) igual que el resto de navegación programática del shell.
	 *
	 * **`perPage` fijo** (`DEFAULT_PER_PAGE`, 30): esta fase no ofrece cambiar el tamaño de página
	 * desde la vista — se pinta igualmente en el texto "N registros · X por página" (mockup
	 * `.gridfoot`), como dato informativo, no como control.
	 *
	 * **Accesible nombre de Anterior/Siguiente SIN CAMBIOS (R4)**: el mockup los pinta como
	 * chevrones `‹`/`›` (glifo visual, `aria-hidden`); el `aria-label` sigue siendo el mismo texto
	 * i18n `list.pagination.prev`/`.next` que antes llevaba como TEXTO visible — así el nombre
	 * accesible (y los tests que lo buscan por `getByRole('button', { name: … })`) no cambia,
	 * solo el glifo que ve un usuario vidente.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { pageRange } from './page-range';

	interface Props {
		page: number;
		totalPages: number;
		totalItems: number;
		/** Tamaño de página fijo (D-P4.5): informativo en el texto de la izquierda, no un control. */
		perPage: number;
		onPrev: () => void;
		onNext: () => void;
		/** Click en un número concreto (R4, nuevo): navega directamente a esa página. */
		onGoToPage: (page: number) => void;
	}

	let { page, totalPages, totalItems, perPage, onPrev, onNext, onGoToPage }: Props = $props();

	const ctx = getVegaContext();

	const items = $derived(pageRange(page, totalPages));
</script>

<div class="vega-pagination" data-pagination>
	<span class="vega-pagination-status">
		{ctx.t('list.pagination.total', { count: totalItems })}
		·
		{ctx.t('list.pagination.perPage', { count: perPage })}
	</span>
	<span class="vega-pagination-pages">
		<button
			type="button"
			class="vega-pagination-chevron"
			aria-label={ctx.t('list.pagination.prev')}
			onclick={onPrev}
			disabled={page <= 1}
		>
			<span aria-hidden="true">‹</span>
		</button>
		{#each items as item, i (i)}
			{#if item === 'ellipsis'}
				<span class="vega-pagination-ellipsis" aria-hidden="true">…</span>
			{:else}
				<button
					type="button"
					class="vega-pagination-page"
					aria-label={ctx.t('list.pagination.goToPage', { page: item })}
					aria-current={item === page ? 'page' : undefined}
					onclick={() => onGoToPage(item)}
				>
					{item}
				</button>
			{/if}
		{/each}
		<button
			type="button"
			class="vega-pagination-chevron"
			aria-label={ctx.t('list.pagination.next')}
			onclick={onNext}
			disabled={page >= totalPages}
		>
			<span aria-hidden="true">›</span>
		</button>
	</span>
</div>

<style>
	/* Barra "gridfoot" (mockup): pie DENTRO de la tarjeta de listado (el borde/radio/sombra los
	   pone el wrapper de `+page.svelte`), separada de la tabla por su propia hairline superior. */
	.vega-pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.6rem var(--cell-x);
		background: var(--surface-2);
		border-top: 1px solid var(--line);
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--ink-2);
	}

	.vega-pagination-status {
		white-space: nowrap;
	}

	.vega-pagination-pages {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.vega-pagination-chevron,
	.vega-pagination-page {
		min-width: 28px;
		height: 28px;
		padding: 0 0.35rem;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--surface);
		color: var(--ink-2);
		font-family: var(--mono);
		font-size: 0.75rem;
		cursor: pointer;
	}

	.vega-pagination-chevron:hover,
	.vega-pagination-page:hover {
		background: var(--btn);
	}

	.vega-pagination-chevron:disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}

	.vega-pagination-page[aria-current='page'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}

	.vega-pagination-ellipsis {
		min-width: 28px;
		text-align: center;
		color: var(--ink-3);
	}
</style>
