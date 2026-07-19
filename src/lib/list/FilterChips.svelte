<script lang="ts">
	/**
	 * `FilterChips.svelte` (R2 del rediseño C2, mockup `.listhead .filters` → `.fchip`): sustituye
	 * el `<select>` de estado que tenía `ListToolbar.svelte` por chips CON RECUENTO — "Todas · N"
	 * más una chip por cada opción del `statusField`, con su propio recuento. Componente TONTO en
	 * cuanto a NAVEGACIÓN (mismo reparto que el resto de `src/lib/list/**`: solo emite
	 * `onStatusChange`, `+page.svelte` decide la URL vía `navigateView`), pero NO tonto en cuanto a
	 * DATOS: a diferencia de `RecordTable`/`Pagination`, aquí sí hace falta consultar el puerto
	 * para los recuentos — mismo patrón que `Sidebar.svelte` (R5 del rediseño) con los contadores
	 * de nav.
	 *
	 * **Naturaleza GENÉRICA de Vega (crítico)**: Vega no conoce "Publicadas"/"Borradores" — esos
	 * son labels del demo. Las chips salen de `statusFilterOptions(contentType)` (`search.ts`,
	 * compartida con la extinta lógica de `ListToolbar`): una por cada opción CRUDA del `select`
	 * de estado (mismo valor literal que pinta la insignia de `RecordTable`), más la chip "Todas"
	 * (i18n). Si `contentType.statusField === null` (`statusFilterOptions` devuelve `null`), este
	 * componente no pinta NADA — igual que el `<select>` que sustituye no existía sin ese campo.
	 *
	 * **Recuentos (`1 + opciones.length` consultas ligeras)**: `port.list(type, { perPage: 1 })`
	 * para el total y una más por opción con `filter: { field: statusField, op: 'eq', value:
	 * opción } }` — la MISMA consulta barata que ya usa `Sidebar.svelte` para "cuántos hay".
	 *
	 * **Guard anti-stale** (mismo patrón que `Sidebar.svelte`, ver su cabecera): `countsRunId`
	 * crece en cada ejecución del `$effect`; una respuesta que llega tarde para una tanda que ya
	 * no es la última se descarta sin pisar `totalCount`/`optionCounts`. Recalcula cuando cambia
	 * `contentType` (dependencia reactiva explícita) o cuando `reloadToken` cambia — `+page.svelte`
	 * lo incrementa tras un borrado con éxito para que los recuentos no se queden obsoletos
	 * indefinidamente; ver la cabecera de `+page.svelte` para el porqué de NO recomputar en cada
	 * `viewState` (búsqueda/orden no cambian "cuántos hay" del tipo, solo del resultado filtrado).
	 *
	 * **Estado de carga honesto**: mientras un recuento está en vuelo, la chip se pinta SIN número
	 * (nunca "· 0" inventado) — igual que `Sidebar.svelte` deja el slot vacío ante un fallo.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { statusFilterOptions } from './search';
	import type { ResolvedContentType } from '$lib/model/types';

	interface Props {
		contentType: ResolvedContentType;
		/** Valor activo del filtro de estado (`viewState.status`), o `null` = "Todas". */
		activeStatus: string | null;
		onStatusChange: (status: string | null) => void;
		/** Bump tras un borrado con éxito (ver cabecera): dependencia reactiva extra para refrescar
		 *  recuentos sin necesidad de que cambie `contentType`. */
		reloadToken?: number;
	}

	let { contentType, activeStatus, onStatusChange, reloadToken = 0 }: Props = $props();

	const ctx = getVegaContext();

	const options = $derived(statusFilterOptions(contentType));

	/** `undefined` = todavía sin recuento (carga honesta); `number` = recuento vigente. */
	let totalCount = $state<number | undefined>(undefined);
	let optionCounts = $state<Record<string, number>>({});
	// Bookkeeping puro de orquestación (no reactivo, mismo criterio que `Sidebar.svelte`).
	let countsRunId = 0;

	$effect(() => {
		const opts = options;
		const statusFieldName = contentType.statusField;
		// Dependencia reactiva explícita (ver cabecera): un borrado con éxito no cambia
		// `contentType` ni `options`, así que sin esta lectura el `$effect` nunca se re-ejecutaría.
		void reloadToken;

		// Invalida CUALQUIER tanda anterior en vuelo como PRIMERA instrucción (fix de code-review,
		// patrón exacto de `Sidebar.svelte`) — incondicional, antes del return temprano. Si se pasa
		// de un tipo CON `statusField` (con `port.list` en vuelo) a uno SIN él, sin este incremento
		// aquí arriba la tanda vieja resolvería con el mismo `runId` y pisaría el estado reseteado.
		const runId = ++countsRunId;
		const isStale = (): boolean => runId !== countsRunId;

		if (opts === null || statusFieldName === null) {
			totalCount = undefined;
			optionCounts = {};
			return;
		}

		const port = ctx.port;
		const typeName = contentType.name;

		// Tanda nueva: fuera los recuentos de la tanda anterior (no heredar de un `contentType`
		// distinto, aunque coincida el nombre de alguna opción).
		totalCount = undefined;
		optionCounts = {};

		void port
			.list(typeName, { perPage: 1 })
			.then((res) => {
				if (isStale()) return;
				totalCount = res.totalItems;
			})
			.catch(() => {
				/* sin recuento: chip sin número, ver cabecera del módulo */
			});

		for (const option of opts) {
			void port
				.list(typeName, {
					perPage: 1,
					filter: { kind: 'cond', field: statusFieldName, op: 'eq', value: option }
				})
				.then((res) => {
					if (isStale()) return;
					optionCounts = { ...optionCounts, [option]: res.totalItems };
				})
				.catch(() => {
					/* sin recuento: chip sin número, ver cabecera del módulo */
				});
		}
	});
</script>

{#if options !== null}
	<div class="vega-filter-chips" role="group" aria-label={ctx.t('list.filter.groupLabel')}>
		<button
			type="button"
			class="vega-fchip"
			aria-pressed={activeStatus === null}
			onclick={() => onStatusChange(null)}
		>
			{ctx.t('list.filter.status.all')}{totalCount !== undefined ? ` · ${totalCount}` : ''}
		</button>
		{#each options as option (option)}
			<button
				type="button"
				class="vega-fchip"
				aria-pressed={activeStatus === option}
				onclick={() => onStatusChange(option)}
			>
				{option}{optionCounts[option] !== undefined ? ` · ${optionCounts[option]}` : ''}
			</button>
		{/each}
	</div>
{/if}

<style>
	.vega-filter-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.vega-fchip {
		border: 1px solid var(--line-strong);
		background: var(--surface);
		color: var(--ink-2);
		border-radius: 999px;
		padding: 0.3rem 0.85rem;
		font-size: 0.78rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.vega-fchip:hover {
		border-color: var(--accent);
	}

	.vega-fchip[aria-pressed='true'] {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent-text);
		font-weight: 600;
	}
</style>
