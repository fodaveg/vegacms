<script lang="ts">
	/**
	 * `ConnectionStatus.svelte` (§4.1 de la topbar): indicador de solo lectura del estado de
	 * transporte — conectado / sin conexión / reintentando.
	 *
	 * Mientras este componente está montado (solo dentro del `AppShell` autenticado),
	 * `SessionStore.status` es casi siempre `'ready'` (`+layout.svelte` sustituye la SPA ENTERA
	 * por una pantalla global ante `network-error`/`error` de ARRANQUE, así que `AppShell` ni
	 * siquiera llega a montarse en esos casos): ese primer término es defensivo. Desde Fase 2c, el
	 * estado que de verdad se ve aquí en la práctica es `transportFeedback.state`, cableado por
	 * `feedback.reportError('network')` cuando un fallo de red aflora A MITAD de sesión (§2.3,
	 * §3.4) — sin desmontar el shell, a diferencia de un fallo de arranque.
	 */
	import { getSessionContext } from '$lib/session/session.svelte';
	import { getVegaContext } from '$lib/app-context';
	import { transportFeedback } from './transport-feedback.svelte';

	const sessionStore = getSessionContext();
	const ctx = getVegaContext();

	const state = $derived(
		sessionStore.status !== 'ready'
			? sessionStore.status === 'loading'
				? 'retrying'
				: 'disconnected'
			: transportFeedback.state
	);

	const label = $derived(ctx.t(`topbar.connection.${state}`));
</script>

<span class="vega-connection-status" data-state={state}>
	<span class="vega-connection-dot" aria-hidden="true"></span>
	<span class="vega-connection-label">{label}</span>
</span>

<style>
	.vega-connection-status {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--ink-2);
		white-space: nowrap;
	}

	.vega-connection-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--ink-2);
	}

	.vega-connection-status[data-state='connected'] .vega-connection-dot {
		background: var(--success);
	}

	.vega-connection-status[data-state='disconnected'] .vega-connection-dot {
		background: var(--danger);
	}

	.vega-connection-status[data-state='retrying'] .vega-connection-dot {
		background: var(--accent);
	}

	/* Mismo punto de colapso ESTRUCTURAL (768px) que Topbar.svelte y Sidebar.svelte (§4.2): en la
	   topbar compacta de móvil solo queda el punto de color, sin el texto (el dot ya distingue
	   estado por color; el texto completo sigue disponible en escritorio). CSS `@media` no admite
	   `var()`, así que el valor se replica; si P7 lo cambia, cambiarlo EN LOS TRES ficheros. */
	@media (max-width: 768px) {
		.vega-connection-label {
			display: none;
		}
	}
</style>
