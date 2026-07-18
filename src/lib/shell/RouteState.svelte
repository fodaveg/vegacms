<script lang="ts">
	/**
	 * `RouteState.svelte` (§4.1 del contrato P3, "Estados de página"): pieza reutilizable para los
	 * tres desenlaces honestos que pintan los marcos de ruta de contenido (Fase 3a, `/c/[type]`,
	 * `/c/[type]/new`, `/c/[type]/[id]`, `/media`) en vez de que cada `+page.svelte` duplique su
	 * propio marcado (P3-L3, P3-L10).
	 *
	 * - `not-found`/`forbidden` son estados de ERROR (§3.4: "mensaje en contexto de la ruta"):
	 *   `role="alert"`, mismo patrón que las pantallas globales de arranque de `+layout.svelte`.
	 * - `placeholder` es informativo, no un fallo (P3-L10 "nada muere en silencio" ≠ "algo
	 *   falló"): sin `role="alert"`, mismo patrón que el estado vacío del índice
	 *   (`routes/+page.svelte`).
	 *
	 * `data-route-state` expone el `kind` para que los e2e lo localicen sin depender del texto
	 * (que cambia con el idioma). `action`/`badge` son opcionales: sin `action` el estado es solo
	 * texto (nunca un botón muerto, P3-L10 — si no hay a dónde ir, no se pinta el botón).
	 */
	interface RouteStateAction {
		label: string;
		onClick: () => void;
	}

	interface Props {
		kind: 'not-found' | 'forbidden' | 'placeholder';
		title: string;
		body: string;
		/** Insignia opcional junto al título (p.ej. "Solo lectura" en el marco de listado). */
		badge?: string;
		action?: RouteStateAction;
	}

	let { kind, title, body, badge, action }: Props = $props();
</script>

<div
	class="vega-route-state"
	data-route-state={kind}
	role={kind === 'placeholder' ? undefined : 'alert'}
>
	<div class="vega-route-state-heading">
		<h1>{title}</h1>
		{#if badge}
			<span class="vega-route-state-badge">{badge}</span>
		{/if}
	</div>
	<p>{body}</p>
	{#if action}
		<button type="button" onclick={action.onClick}>{action.label}</button>
	{/if}
</div>

<style>
	.vega-route-state {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		max-width: 32rem;
	}

	.vega-route-state-heading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.vega-route-state h1 {
		margin: 0;
		font-size: 1.2rem;
	}

	.vega-route-state-badge {
		flex-shrink: 0;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--vega-color-border, #888);
		border-radius: 999px;
		font-size: 0.7rem;
		white-space: nowrap;
		color: var(--vega-color-text-muted, #666);
	}

	.vega-route-state p {
		margin: 0;
	}

	.vega-route-state button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--vega-color-border, #888);
		border-radius: 6px;
		background: var(--vega-color-bg-raised, #f5f5f5);
		cursor: pointer;
	}
</style>
