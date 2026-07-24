<script lang="ts">
	/**
	 * `Pagination.svelte` (Fase 4c del contrato P4, D-P4.5; R4 del rediseño C2; match 1:1 con
	 * `aquelarre-dark.html` `.table-foot`): antes Anterior/Siguiente NUMERADOS con elipsis
	 * (`pageRange`, `page-range.ts`) + "N registros · X por página"; ahora el "gridfoot" pinta
	 * SOLO el rango de registros visibles ("{primero}–{último} de {total}") a la izquierda y las
	 * dos flechas `‹`/`›` a la derecha, SIN botones numerados — el mockup no ofrece salto directo
	 * a una página concreta, solo Anterior/Siguiente. Vive DENTRO de la misma tarjeta que
	 * `RecordTable` (el wrapper lo compone `+page.svelte`, ver su cabecera).
	 *
	 * Componente TONTO a propósito, mismo criterio de siempre: no navega por su cuenta.
	 * `src/lib/list/**` NO está en la lista de directorios exentos de
	 * `svelte/no-navigation-without-resolve` (ver `eslint.config.js`), así que `onPrev`/`onNext`
	 * los cablea `+page.svelte` (sí exento) con `goto()`, respetando el guard router-ready (P3-L9)
	 * igual que el resto de navegación programática del shell.
	 *
	 * **`perPage` sigue siendo fijo** (`DEFAULT_PER_PAGE`, 30): esta fase no ofrece cambiar el
	 * tamaño de página desde la vista; ya no se pinta como texto informativo aparte (el mockup no
	 * lo muestra), solo se usa para calcular el rango `{primero}–{último}`.
	 *
	 * **Accesible nombre de Anterior/Siguiente SIN CAMBIOS (R4)**: el mockup los pinta como
	 * chevrones `‹`/`›` (glifo visual, `aria-hidden`); el `aria-label` sigue siendo el mismo texto
	 * i18n `list.pagination.prev`/`.next` que antes llevaba como TEXTO visible — así el nombre
	 * accesible (y los tests que lo buscan por `getByRole('button', { name: … })`) no cambia,
	 * solo el glifo que ve un usuario vidente.
	 */
	import { getVegaContext } from '$lib/app-context';

	interface Props {
		page: number;
		totalPages: number;
		totalItems: number;
		/** Tamaño de página fijo (D-P4.5): solo se usa para calcular el rango, no es un control. */
		perPage: number;
		onPrev: () => void;
		onNext: () => void;
	}

	let { page, totalPages, totalItems, perPage, onPrev, onNext }: Props = $props();

	const ctx = getVegaContext();

	/** Primer registro visible de la página actual, 1-based (0 si `totalItems` es 0 — caso de
	 *  guarda defensivo, no debería llegar a pintarse: `+page.svelte` solo monta este componente
	 *  en el estado "ready", que implica al menos un registro). */
	const firstItem = $derived(totalItems === 0 ? 0 : (page - 1) * perPage + 1);
	/** Último registro visible: nunca pasa de `totalItems`, aunque `perPage` "cabría" más. */
	const lastItem = $derived(Math.min(page * perPage, totalItems));
</script>

<div class="vega-pagination" data-pagination>
	<span class="vega-pagination-status">
		{ctx.t('list.pagination.range', { first: firstItem, last: lastItem, total: totalItems })}
	</span>
	<span class="vega-pagination-nav">
		<button
			type="button"
			class="vega-pagination-chevron"
			aria-label={ctx.t('list.pagination.prev')}
			onclick={onPrev}
			disabled={page <= 1}
		>
			<span aria-hidden="true">‹</span>
		</button>
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

	.vega-pagination-nav {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.vega-pagination-chevron {
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

	/* Solo el botón habilitado reacciona al hover (fix: un `disabled` bajo el cursor no debe
	   sugerir que hay algo que pulsar). */
	.vega-pagination-chevron:hover:not(:disabled) {
		background: var(--btn);
	}

	.vega-pagination-chevron:disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}
</style>
