<script lang="ts">
	/**
	 * `Topbar.svelte` (Fase 2b, §4.1/§4.2 del contrato P3): `site.name` (truncado con `title` si
	 * es largo), `ConnectionStatus`, `DensityToggle`, el hueco reservado del selector de tema
	 * (§2.6, P3-L10 — oculto pre-P7, "sin render": ni siquiera un `<button>` deshabilitado, solo
	 * el comentario que documenta el motivo, para no dejar un botón muerto en el DOM), logout, y
	 * el botón hamburguesa (visible solo en móvil, vía CSS) que abre/cierra la `Sidebar`.
	 * Landmark `header`.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { getSessionContext } from '$lib/session/session.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import ConnectionStatus from './ConnectionStatus.svelte';
	import DensityToggle from './DensityToggle.svelte';

	let { sidebarOpen, onToggleSidebar }: { sidebarOpen: boolean; onToggleSidebar: () => void } =
		$props();

	const ctx = getVegaContext();
	const sessionStore = getSessionContext();

	async function handleLogout(): Promise<void> {
		// El exit-guard de formularios sucios (P5) llega en fases posteriores; hoy no hay ningún
		// guard registrado, así que esto siempre puede salir.
		await sessionStore.logout();
	}
</script>

<header class="vega-topbar">
	<button
		type="button"
		class="vega-topbar-menu"
		aria-expanded={sidebarOpen}
		aria-controls="vega-sidebar"
		aria-label={ctx.t(sidebarOpen ? 'topbar.menu.close' : 'topbar.menu.open')}
		onclick={onToggleSidebar}
	>
		<Icon id="menu" size={18} />
	</button>

	<span class="vega-topbar-site" title={ctx.model.site.name}>{ctx.model.site.name}</span>

	<div class="vega-topbar-actions">
		<ConnectionStatus />
		<DensityToggle />
		<!-- Slot de tema: hueco reservado, oculto hasta P7 (§2.6, P3-L10 — nunca un botón muerto). -->
		<button
			type="button"
			class="vega-topbar-logout"
			aria-label={ctx.t('topbar.logout')}
			onclick={handleLogout}
		>
			<Icon id="logout" size={16} />
			<span aria-hidden="true">{ctx.t('topbar.logout')}</span>
		</button>
	</div>
</header>

<style>
	.vega-topbar {
		display: flex;
		align-items: center;
		gap: var(--vega-space-gutter);
		height: var(--vega-size-topbar);
		flex-shrink: 0;
		padding: 0 var(--vega-space-gutter);
		border-bottom: 1px solid var(--vega-color-border);
		background: var(--vega-color-bg-raised);
	}

	.vega-topbar-menu {
		display: none;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
		cursor: pointer;
	}

	.vega-topbar-site {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vega-topbar-actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-left: auto;
	}

	.vega-topbar-logout {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.7rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 6px;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
		cursor: pointer;
	}

	/* Mismo punto de colapso ESTRUCTURAL (768px) que Sidebar.svelte y ConnectionStatus.svelte
	   (§4.2): topbar compacta a íconos, el hamburguesa aparece. CSS `@media` no admite `var()`, así
	   que el valor se replica; si P7 lo cambia, cambiarlo EN LOS TRES ficheros. */
	@media (max-width: 768px) {
		.vega-topbar-menu {
			display: flex;
		}

		.vega-topbar-logout span {
			display: none;
		}
	}
</style>
