<script lang="ts">
	/**
	 * `Topbar.svelte` (R1 del rediseño C2, mockup `vega-propuesta-C2-cabina-con-aire`): wordmark
	 * (isotipo Lyra de Vega —`VegaLogo`— + nombre del sitio), `GlobalSearch` CENTRADO, `ConnectionStatus` (pill),
	 * `DensityToggle` (segmentado), avatar con la inicial de la sesión, logout, y el botón
	 * hamburguesa (visible solo en móvil, vía CSS) que abre/cierra la `Sidebar`. Landmark
	 * `header`.
	 *
	 * El logout y el hueco de tema (§2.6, P3-L10 — oculto hasta P7, "sin render": ni un `<button>`
	 * deshabilitado) no aparecen en el mockup de diseño (es una demo sin chrome de auth completo)
	 * pero son funcionalidad real de Vega que no se retira: viven junto al avatar, al final.
	 *
	 * **Chip de usuario → submenú (#l12-ux, item 3)**: hasta ahora el avatar era un `<span>`
	 * decorativo sin ninguna acción propia — "Ajustes" solo se alcanzaba desde la `Sidebar`, nunca
	 * desde la topbar. Ahora el avatar vive dentro de un `<button>` (el "chip") que despliega un
	 * menú (`role="menu"`, patrón APG "menu button") con la entrada "Ajustes" (misma navegación
	 * con exit-guard que `Sidebar.svelte`, `ctx.nav.toSettings`). El `<span role="img">` interior
	 * CONSERVA su `aria-label`/rol propios (identidad de sesión, ver `avatarInitial` más abajo):
	 * el botón que lo envuelve tiene SU PROPIO `aria-label` (`topbar.userMenu.toggle`, describe la
	 * ACCIÓN de abrir el menú, no la identidad) — dos nombres accesibles distintos en el mismo
	 * árbol, sin colisión (`getByRole('img', {name: 'Sesión de...'})` sigue resolviendo el `span`
	 * interior tal cual). "Cerrar sesión" NO se movió dentro del menú a propósito (ver cabecera del
	 * repo/documentación de la tarea): sigue siendo su propio botón, visible siempre — moverlo
	 * detrás de un click rompería la docena larga de aserciones e2e que lo localizan como
	 * `getByRole('button', {name: 'Cerrar sesión'})` justo tras el login, sin ganancia de UX que
	 * lo justifique (no había "ajustes de cuenta" sueltos que agrupar aparte de la propia entrada a
	 * `/settings`). Cierra con Escape, con un click fuera, o al seleccionar la entrada.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { getSessionContext } from '$lib/session/session.svelte';
	import { settingsRoute } from '$lib/nav/routes';
	import Icon from '$lib/icons/Icon.svelte';
	import ConnectionStatus from './ConnectionStatus.svelte';
	import DensityToggle from './DensityToggle.svelte';
	import GlobalSearch from './GlobalSearch.svelte';
	import VegaLogo from './VegaLogo.svelte';

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

	const settingsHref = settingsRoute();

	// ————— Chip de usuario → menú "Ajustes" (#l12-ux, item 3) —————
	let userMenuOpen = $state(false);
	let userTriggerEl = $state<HTMLElement | null>(null);
	let userMenuEl = $state<HTMLElement | null>(null);

	function toggleUserMenu(): void {
		userMenuOpen = !userMenuOpen;
	}

	function closeUserMenu(): void {
		userMenuOpen = false;
	}

	/** Click en CUALQUIER punto de la ventana mientras el menú está abierto: lo cierra salvo que
	 *  el click caiga dentro del propio disparador o del menú (mismo criterio de "click fuera"
	 *  que cualquier popover ligero, sin librería nueva). */
	function handleWindowClick(event: MouseEvent): void {
		if (!userMenuOpen) return;
		const target = event.target as Node;
		if (userTriggerEl?.contains(target) || userMenuEl?.contains(target)) return;
		closeUserMenu();
	}

	/** `Escape` cierra el menú y devuelve el foco al disparador (mismo criterio de a11y que el
	 *  trap de foco de `Sidebar.svelte`: nunca dejar el foco "colgado" en un elemento que acaba de
	 *  desaparecer). */
	function handleWindowKeydown(event: KeyboardEvent): void {
		if (!userMenuOpen || event.key !== 'Escape') return;
		event.preventDefault();
		closeUserMenu();
		userTriggerEl?.focus();
	}

	/** El foco SALE del chip o del menú (Tab/Shift+Tab hacia otro control de la topbar, o fuera de
	 *  la ventana): cierra el menú (patrón APG "menu button"). Sin esto, tabular fuera del enlace
	 *  "Ajustes" dejaba el popover abierto y "colgado", desconectado del foco real, hasta el próximo
	 *  click (hallazgo del code-review — el `onclick` de ventana solo cazaba el ratón, no el teclado).
	 *  `relatedTarget` = destino del foco; `null` (foco a la nada/fuera de la ventana) también cierra. */
	function handleUserFocusOut(event: FocusEvent): void {
		if (!userMenuOpen) return;
		const next = event.relatedTarget as Node | null;
		if (next && (userTriggerEl?.contains(next) || userMenuEl?.contains(next))) return;
		closeUserMenu();
	}

	/** Click en "Ajustes" del menú (mismo patrón que `Sidebar.handleFixedClick`): un click normal
	 *  navega vía `ctx.nav.toSettings()` (exit-guard incluido); un click modificado (Cmd/Ctrl/
	 *  Shift/central) sigue el `href` real y abre en pestaña/ventana nueva. El menú se cierra en
	 *  cualquier caso: seleccionar una entrada siempre la descarta. */
	function handleSettingsClick(event: MouseEvent): void {
		closeUserMenu();
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		ctx.nav.toSettings();
	}

	async function handleLogout(): Promise<void> {
		// El exit-guard de formularios sucios (P5) llega en fases posteriores; hoy no hay ningún
		// guard registrado, así que esto siempre puede salir.
		await sessionStore.logout();
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

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
		<VegaLogo size={20} />
		{ctx.model.site.name}
	</span>

	<GlobalSearch />

	<div class="vega-topbar-actions">
		<ConnectionStatus />
		<DensityToggle />
		<div class="vega-topbar-user" onfocusout={handleUserFocusOut}>
			<button
				type="button"
				bind:this={userTriggerEl}
				class="vega-topbar-user-trigger"
				aria-haspopup="menu"
				aria-expanded={userMenuOpen}
				aria-controls="vega-user-menu"
				aria-label={ctx.t('topbar.userMenu.toggle')}
				onclick={toggleUserMenu}
			>
				<span
					class="vega-topbar-avatar"
					role="img"
					aria-label={ctx.t('topbar.avatar.label', { email: ctx.session.user.email })}
				>
					{avatarInitial}
				</span>
				<Icon id="chevron" size={14} />
			</button>

			{#if userMenuOpen}
				<div
					id="vega-user-menu"
					class="vega-topbar-user-menu"
					role="menu"
					aria-label={ctx.t('topbar.userMenu.toggle')}
					bind:this={userMenuEl}
				>
					<a role="menuitem" href={settingsHref} onclick={handleSettingsClick}>
						<Icon id="settings" size={16} />
						{ctx.t('nav.settings')}
					</a>
				</div>
			{/if}
		</div>
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
		font-weight: 650;
		letter-spacing: -0.02em;
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

	/* Chip de usuario → menú (#l12-ux, item 3): el ancla `position:relative` del popover, no lleva
	   estilo propio más allá de eso — el chip visible es el `<button>` de dentro. */
	.vega-topbar-user {
		position: relative;
		flex-shrink: 0;
	}

	/* El disparador ("chip"): mismo tratamiento visual que el resto de botones-icono de la topbar
	   (`.vega-topbar-logout`/`.vega-topbar-menu`), pero SIN su propio borde/fondo — el avatar
	   circular ya aporta el contraste, un segundo marco alrededor sería ruido visual. */
	.vega-topbar-user-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.3rem;
		border: 1px solid transparent;
		border-radius: 999px;
		background: none;
		color: var(--ink-2);
		cursor: pointer;
	}

	.vega-topbar-user-trigger:hover,
	.vega-topbar-user-trigger[aria-expanded='true'] {
		background: var(--active);
		border-color: var(--line);
	}

	.vega-topbar-user-trigger:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	/* El chevron apunta hacia la derecha en el set de iconos (§2.7); rotado a "abajo" (afordancia
	   estándar de menú desplegable) y, con el menú abierto, a "arriba" (mismo criterio que
	   cualquier `<select>`/menú nativo: la flecha se invierte para indicar "ya desplegado"). */
	.vega-topbar-user-trigger :global(svg) {
		transform: rotate(90deg);
		transition: transform 0.12s ease;
	}

	.vega-topbar-user-trigger[aria-expanded='true'] :global(svg) {
		transform: rotate(-90deg);
	}

	/* El menú flotante: tarjeta mínima (mismos tokens que cualquier panel/tarjeta del shell —
	   `--surface`/`--line`/`--shadow-card`), anclada bajo el chip, alineada al borde derecho (nunca
	   se sale de la ventana por la izquierda, la topbar ya empuja las acciones a la derecha con
	   `margin-left:auto`). */
	.vega-topbar-user-menu {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		z-index: 10;
		display: flex;
		flex-direction: column;
		min-width: 10rem;
		padding: 0.3rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}

	.vega-topbar-user-menu a {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.45rem 0.6rem;
		border-radius: 6px;
		color: var(--ink);
		font-size: 0.85rem;
		text-decoration: none;
		white-space: nowrap;
	}

	.vega-topbar-user-menu a:hover,
	.vega-topbar-user-menu a:focus-visible {
		background: var(--active);
		color: var(--ink-hi);
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
