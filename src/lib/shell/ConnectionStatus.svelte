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
	 *
	 * Estilo (R1 del rediseño C2, mockup `.topbar .env`): píldora con borde, mono, punto de
	 * estado. El mockup muestra un literal "PB 0.29 · conectado" (versión del SERVIDOR conectado),
	 * pero Vega no tiene forma de consultar en runtime qué versión de PocketBase hay al otro lado
	 * (`BackendPort` no expone esa capacidad hoy) — solo conoce el RANGO soportado en build
	 * (`VEGA_PB_SERVER_RANGE`, ya mostrado en "Acerca de", P8·F2). Inventar aquí un número de
	 * versión sería falsear un dato que no se tiene, así que la píldora pinta el estado real
	 * (conectado/reintentando/sin conexión) sin ese prefijo.
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
		font-family: var(--mono);
		font-size: 0.6875rem;
		color: var(--ink-3);
		white-space: nowrap;
		border: 1px solid var(--line);
		border-radius: 99px;
		padding: 0.18rem 0.6rem;
	}

	.vega-connection-dot {
		width: 6px;
		height: 6px;
		flex-shrink: 0;
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
