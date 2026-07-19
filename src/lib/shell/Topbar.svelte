<script lang="ts">
	/**
	 * `Topbar.svelte` (R1 del rediseño C2, mockup `vega-propuesta-C2-cabina-con-aire`): wordmark
	 * (punto de acento + nombre del sitio), `GlobalSearch` CENTRADO, `ConnectionStatus` (pill),
	 * `DensityToggle` (segmentado), avatar con la inicial de la sesión, logout, y el botón
	 * hamburguesa (visible solo en móvil, vía CSS) que abre/cierra la `Sidebar`. Landmark
	 * `header`.
	 *
	 * El logout y el hueco de tema (§2.6, P3-L10 — oculto hasta P7, "sin render": ni un `<button>`
	 * deshabilitado) no aparecen en el mockup de diseño (es una demo sin chrome de auth completo)
	 * pero son funcionalidad real de Vega que no se retira: viven junto al avatar, al final.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { getSessionContext } from '$lib/session/session.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import ConnectionStatus from './ConnectionStatus.svelte';
	import DensityToggle from './DensityToggle.svelte';
	import GlobalSearch from './GlobalSearch.svelte';

	let { sidebarOpen, onToggleSidebar }: { sidebarOpen: boolean; onToggleSidebar: () => void } =
		$props();

	const ctx = getVegaContext();
	const sessionStore = getSessionContext();

	// Inicial del avatar (§ mockup `.avatar`): primera letra del correo, la única identidad que
	// `Session.user` garantiza (§ contrato de backend, sin `name` de perfil en v1). Fallback
	// defensivo (fix code-review lote-1, 🟢): `Session.user.email` no debería llegar vacío en la
	// práctica, pero un círculo sin ninguna letra dentro sería un estado mudo — "?" dice "hay
	// sesión, sin identidad legible" en vez de nada.
	const avatarInitial = $derived(ctx.session.user.email.charAt(0).toUpperCase() || '?');

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

	<span class="vega-topbar-site" title={ctx.model.site.name}>
		<span class="vega-topbar-dot" aria-hidden="true"></span>
		{ctx.model.site.name}
	</span>

	<GlobalSearch />

	<div class="vega-topbar-actions">
		<ConnectionStatus />
		<DensityToggle />
		<span
			class="vega-topbar-avatar"
			role="img"
			aria-label={ctx.t('topbar.avatar.label', { email: ctx.session.user.email })}
		>
			{avatarInitial}
		</span>
		<!-- Slot de tema: hueco reservado, oculto hasta P7 (§2.6, P3-L10 — nunca un botón muerto). -->
		<button
			type="button"
			class="vega-topbar-logout"
			aria-label={ctx.t('topbar.logout')}
			onclick={handleLogout}
		>
			<Icon id="logout" size={16} />
		</button>
	</div>
</header>

<style>
	.vega-topbar {
		display: flex;
		align-items: center;
		gap: var(--vega-space-gutter);
		height: var(--topbar-h);
		flex-shrink: 0;
		padding: 0 var(--vega-space-gutter);
		border-bottom: 1px solid var(--line);
		background: var(--surface-2);
	}

	.vega-topbar-menu {
		display: none;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		cursor: pointer;
	}

	.vega-topbar-site {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 13rem;
		flex-shrink: 0;
		font-weight: 600;
		color: var(--ink-hi);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Fix code-review (lote-1, 🟡): 769-900px el buscador quedaba con un área de escritura
	   ínfima (~57-88px medido) porque el wordmark reservaba `min-width:13rem` fijo (con
	   `flex-shrink:0` ya no baja de ahí, PERO tampoco necesita tanto — es más ancho que su
	   propio contenido) y `.vega-topbar-actions` tampoco cede: TODO el squeeze lo absorbía
	   `GlobalSearch` en solitario. En el rango apretado (por encima del colapso móvil, por
	   debajo de donde ya sobra sitio) el wordmark cede primero — la búsqueda es la protagonista
	   del mockup, no debe ser lo primero en comprimirse. */
	@media (min-width: 769px) and (max-width: 1100px) {
		.vega-topbar-site {
			min-width: 6rem;
		}
	}

	/* Wordmark = punto de acento + dominio (mockup `.site .dot`), en vez de solo texto plano. */
	.vega-topbar-dot {
		width: 9px;
		height: 9px;
		flex-shrink: 0;
		border-radius: 3px;
		background: var(--accent);
	}

	.vega-topbar-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
		margin-left: auto;
	}

	.vega-topbar-avatar {
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-ink);
		display: grid;
		place-items: center;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.vega-topbar-logout {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		cursor: pointer;
	}

	/* Mismo punto de colapso ESTRUCTURAL (768px) que Sidebar.svelte y ConnectionStatus.svelte
	   (§4.2): topbar compacta a íconos, el hamburguesa aparece. CSS `@media` no admite `var()`, así
	   que el valor se replica; si P7 lo cambia, cambiarlo EN LOS TRES ficheros. */
	@media (max-width: 768px) {
		.vega-topbar-menu {
			display: flex;
		}

		.vega-topbar-site {
			min-width: 0;
		}
	}
</style>
