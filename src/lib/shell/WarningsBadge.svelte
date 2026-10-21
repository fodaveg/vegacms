<script lang="ts">
	/**
	 * `WarningsBadge.svelte` (§3.5.1/L10 del contrato P3, P3-L4): indicador global PERSISTENTE de
	 * `model.warnings` — montado en el acceso fijo "Ajustes" de `Sidebar.svelte`. `0` avisos ⇒ SIN
	 * badge (nunca un badge vacío, P3-L10 "nada muere en silencio" no aplica a un cero: aquí no hay
	 * nada que avisar). Reactivo: `ctx.model` cambia tras `reloadModel()` (tras guardar el
	 * manifiesto o el botón "Recargar modelo" de `/settings`), así que el badge se actualiza solo.
	 *
	 * A11y: el recuento no puede depender solo del color/tamaño del pill (§4.3) — `aria-label`
	 * lleva el mensaje completo interpolado (`nav.warningsBadge`, "N avisos"/"N warnings"); el
	 * dígito visible queda como contenido decorativo redundante para quien SÍ ve el pill.
	 */
	import { getVegaContext } from '$lib/app-context';

	const ctx = getVegaContext();

	const count = $derived(ctx.model.warnings.length);
</script>

{#if count > 0}
	<span class="vega-warnings-badge" aria-label={ctx.t('nav.warningsBadge', { count })}>
		{count}
	</span>
{/if}

<style>
	/* Aviso del menú de la lámina Inicio v2 (`.navgroup a .badge`): cifra mono ámbar en píldora
	   tenue; un aviso del manifiesto es calidad, no un error. */
	.vega-warnings-badge {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		box-sizing: border-box;
		padding: 0 7px;
		margin-left: auto;
		border-radius: 999px;
		background: var(--warning-soft);
		color: var(--warning);
		font: 11px / 18px var(--mono);
	}
</style>
