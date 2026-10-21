<script lang="ts">
	/**
	 * `Topbar.svelte`: barra translúcida de la lámina `inicio-v2.html` (§1, «Barra superior
	 * translúcida»). Orden de la lámina: marca (isotipo Lyra sobre el relleno de marca + «Vega»),
	 * nombre del sitio, buscador en píldora centrado, estado de conexión, «Actualizar sitio» en
	 * píldora con el relleno del tema y el avatar, que es el menú de cuenta. Landmark `header`.
	 *
	 * **Lo que la lámina no dibuja y se conserva, justificado:**
	 * - El hamburguesa de escritorio (`vega-topbar-collapse`, petición de David tras usar el editor
	 *   visual en prod) pliega la barra lateral. Vive a la izquierda, en el hueco del ≡ móvil de la
	 *   lámina, como botón silencioso; los dos nunca coexisten (uno por rango de anchura) y comparten
	 *   el par `aria-expanded`/`aria-controls="vega-sidebar"`.
	 * - El texto del estado de publicación: en reposo solo se ve la píldora (como la lámina) y el
	 *   estado se abre desde una flecha; cuando pide atención (en curso, fallo, sin confirmar) el
	 *   texto se ve. La etiqueta es «Actualizar sitio», no «Publicar»: el audit del 19 oct separa
	 *   guardar, publicar una página y reconstruir el sitio, y esa distinción se conserva.
	 *
	 * **«Cerrar sesión» vive en el menú de cuenta** (la lámina no dibuja un botón suelto): el avatar
	 * es un botón «Menú de cuenta» (patrón APG «menu button») con la densidad (dos
	 * `menuitemradio`), «Ajustes» y «Cerrar sesión» (`menuitem`). El `<span role="img">` interior
	 * conserva su nombre propio («Sesión de …»): identidad, no acción. Teclado: flechas, Inicio y
	 * Fin recorren las entradas; ArrowDown/ArrowUp en el disparador abren y enfocan la
	 * primera/última; Escape cierra y devuelve el foco; salir con Tab o un clic fuera cierra.
	 *
	 * **La marca es un enlace a `/`**: navegación con exit-guard (`ctx.nav.toIndex`); un clic
	 * modificado sigue el `href`. El isotipo va en `--accent-ink` sobre `--accent-fill`, nunca un
	 * filtro que fuerce blanco: con un acento claro su tinta es oscura y el blanco no se leería.
	 *
	 * Móvil (≤768 px): una sola fila como la lámina (≡, marca, lupa, punto de conexión, píldora y
	 * avatar); el buscador se despliega bajo la barra desde la lupa (`GlobalSearch`). Si la
	 * publicación pide atención, su estado baja a una segunda fila para no recortarse.
	 */
	import { tick } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { getSessionContext } from '$lib/session/session.svelte';
	import { indexRoute, settingsRoute } from '$lib/nav/routes';
	import { setDensity } from '$lib/theme/apply';
	import type { Density } from '$lib/theme/preferences';
	import Icon from '$lib/icons/Icon.svelte';
	import ConnectionStatus from './ConnectionStatus.svelte';
	import GlobalSearch from './GlobalSearch.svelte';
	import PublishButton from './PublishButton.svelte';
	import VegaLogo from './VegaLogo.svelte';

	let {
		sidebarOpen,
		onToggleSidebar,
		sidebarCollapsed,
		onToggleCollapse
	}: {
		sidebarOpen: boolean;
		onToggleSidebar: () => void;
		sidebarCollapsed: boolean;
		onToggleCollapse: () => void;
	} = $props();

	const ctx = getVegaContext();
	const sessionStore = getSessionContext();

	/**
	 * Iniciales del avatar (lámina: «MF»): las dos primeras palabras del nombre de la sesión si lo
	 * hay; si no, la primera letra del correo, la única identidad que `Session.user` garantiza. «?»
	 * si ni eso: un círculo vacío sería un estado mudo.
	 */
	const avatarInitials = $derived.by(() => {
		const name = ctx.session.user.name?.trim();
		if (name) {
			const letters = name
				.split(/\s+/)
				.slice(0, 2)
				.map((word) => word.charAt(0).toLocaleUpperCase(ctx.locale))
				.join('');
			if (letters) return letters;
		}
		return ctx.session.user.email.charAt(0).toUpperCase() || '?';
	});

	const settingsHref = settingsRoute();
	const indexHref = indexRoute();

	/** Click en la marca: navegación con exit-guard salvo click modificado. */
	function handleBrandClick(event: MouseEvent): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		ctx.nav.toIndex();
	}

	// ————— Densidad (menú de cuenta) —————
	/** Densidad YA aplicada al documento; se relee al abrir el menú (Ajustes puede cambiarla). */
	function currentDensity(): Density {
		return document.documentElement.dataset.density === 'compact' ? 'compact' : 'comfortable';
	}

	let density = $state<Density>(currentDensity());

	function selectDensity(next: Density): void {
		if (next === density) return;
		density = next;
		setDensity(next);
	}

	// ————— Menú de cuenta —————
	let userMenuOpen = $state(false);
	let userTriggerEl = $state<HTMLElement | null>(null);
	let userMenuEl = $state<HTMLElement | null>(null);

	function toggleUserMenu(): void {
		if (!userMenuOpen) density = currentDensity();
		userMenuOpen = !userMenuOpen;
	}

	/** Entradas enfocables del menú, en orden visual. */
	function menuEntries(): HTMLElement[] {
		return Array.from(
			userMenuEl?.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitem"]') ?? []
		);
	}

	/** Abre el menú y enfoca la primera o la última entrada (ArrowDown/ArrowUp en el disparador). */
	async function openUserMenuAndFocus(which: 'first' | 'last'): Promise<void> {
		density = currentDensity();
		userMenuOpen = true;
		await tick();
		const entries = menuEntries();
		(which === 'first' ? entries[0] : entries[entries.length - 1])?.focus();
	}

	function handleTriggerKeydown(event: KeyboardEvent): void {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		event.preventDefault();
		void openUserMenuAndFocus(event.key === 'ArrowDown' ? 'first' : 'last');
	}

	/** Flechas, Inicio y Fin recorren las entradas del menú (con vuelta al otro extremo). */
	function handleMenuKeydown(event: KeyboardEvent): void {
		const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
		if (!keys.includes(event.key)) return;
		const entries = menuEntries();
		if (entries.length === 0) return;
		event.preventDefault();
		const at = entries.indexOf(document.activeElement as HTMLElement);
		let to: number;
		if (event.key === 'Home') to = 0;
		else if (event.key === 'End') to = entries.length - 1;
		else if (event.key === 'ArrowDown') to = at < 0 ? 0 : (at + 1) % entries.length;
		else to = at < 0 ? entries.length - 1 : (at - 1 + entries.length) % entries.length;
		entries[to].focus();
	}

	function closeUserMenu(): void {
		userMenuOpen = false;
	}

	/** Clic fuera del disparador y del menú: lo cierra. */
	function handleWindowClick(event: MouseEvent): void {
		if (!userMenuOpen) return;
		const target = event.target as Node;
		if (userTriggerEl?.contains(target) || userMenuEl?.contains(target)) return;
		closeUserMenu();
	}

	/** `Escape` cierra el menú y devuelve el foco al disparador. */
	function handleWindowKeydown(event: KeyboardEvent): void {
		if (!userMenuOpen || event.key !== 'Escape') return;
		event.preventDefault();
		closeUserMenu();
		userTriggerEl?.focus();
	}

	/** El foco sale del disparador o del menú (Tab, o fuera de la ventana): cierra. */
	function handleUserFocusOut(event: FocusEvent): void {
		if (!userMenuOpen) return;
		const next = event.relatedTarget as Node | null;
		if (next && (userTriggerEl?.contains(next) || userMenuEl?.contains(next))) return;
		closeUserMenu();
	}

	/** «Ajustes» del menú: un clic normal navega con exit-guard; uno modificado sigue el `href`. */
	function handleSettingsClick(event: MouseEvent): void {
		closeUserMenu();
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		ctx.nav.toSettings();
	}

	async function handleLogout(): Promise<void> {
		closeUserMenu();
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
		<Icon id="menu" size={16} strokeWidth={1.6} />
	</button>
	<button
		type="button"
		class="vega-topbar-collapse"
		aria-expanded={!sidebarCollapsed}
		aria-controls="vega-sidebar"
		aria-label={ctx.t(
			sidebarCollapsed ? 'topbar.sidebarCollapse.expand' : 'topbar.sidebarCollapse.collapse'
		)}
		onclick={onToggleCollapse}
	>
		<Icon id="menu" size={16} strokeWidth={1.6} />
	</button>

	<!-- `title` sobre TODO el enlace con `site.name` a solas: lo comprueban `topbar.spec.ts` y
	     `settings.spec.ts` con igualdad exacta. -->
	<a
		class="vega-topbar-site"
		href={indexHref}
		title={ctx.model.site.name}
		aria-label={ctx.t('topbar.home.label')}
		onclick={handleBrandClick}
	>
		<span class="vega-topbar-mark"><VegaLogo size={16} mono /></span>
		<span class="vega-topbar-brand">Vega</span>
		<span class="vega-topbar-sitename">{ctx.model.site.name}</span>
	</a>

	<GlobalSearch />

	<div class="vega-topbar-actions">
		<ConnectionStatus />
		<!-- Ausente por completo si el proyecto no tiene publicación conectada. -->
		{#if ctx.port.buildApiUrl}
			<div class="vega-topbar-publication"><PublishButton /></div>
		{/if}
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
				onkeydown={handleTriggerKeydown}
			>
				<span
					class="vega-topbar-avatar"
					role="img"
					aria-label={ctx.t('topbar.avatar.label', { email: ctx.session.user.email })}
				>
					{avatarInitials}
				</span>
			</button>

			{#if userMenuOpen}
				<div
					id="vega-user-menu"
					class="vega-topbar-user-menu"
					role="menu"
					aria-label={ctx.t('topbar.userMenu.toggle')}
					bind:this={userMenuEl}
					tabindex="-1"
					onkeydown={handleMenuKeydown}
				>
					<p class="vega-topbar-user-menu-who">
						{#if ctx.session.user.name}<strong>{ctx.session.user.name}</strong>{/if}
						<span>{ctx.session.user.email}</span>
					</p>
					<div class="vega-topbar-user-menu-sep" role="separator"></div>
					<div role="group" aria-labelledby="vega-user-menu-density">
						<p id="vega-user-menu-density" class="vega-topbar-user-menu-group">
							{ctx.t('topbar.density.toggleLabel')}
						</p>
						{#each [['comfortable', 'topbar.density.comfortable'], ['compact', 'topbar.density.compact']] as const as [value, label] (value)}
							<button
								type="button"
								role="menuitemradio"
								class="vega-topbar-user-menu-item"
								aria-checked={density === value}
								onclick={() => selectDensity(value)}
							>
								<span class="vega-topbar-user-menu-check" aria-hidden="true">
									{#if density === value}<Icon id="check" size={16} strokeWidth={1.6} />{/if}
								</span>
								{ctx.t(label)}
							</button>
						{/each}
					</div>
					<div class="vega-topbar-user-menu-sep" role="separator"></div>
					<a
						role="menuitem"
						class="vega-topbar-user-menu-item"
						href={settingsHref}
						onclick={handleSettingsClick}
					>
						<Icon id="gear" size={16} strokeWidth={1.6} />
						{ctx.t('nav.settings')}
					</a>
					<button
						type="button"
						role="menuitem"
						class="vega-topbar-user-menu-item vega-topbar-logout"
						onclick={handleLogout}
					>
						<Icon id="logout" size={16} strokeWidth={1.6} />
						{ctx.t('topbar.logout')}
					</button>
				</div>
			{/if}
		</div>
	</div>
</header>

<style>
	.vega-topbar {
		position: relative;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		min-height: var(--topbar-h);
		box-sizing: border-box;
		flex-shrink: 0;
		padding: 0 var(--sp-5);
		border-bottom: 1px solid var(--line);
		background: var(--glass);
		backdrop-filter: blur(18px) saturate(1.4);
		-webkit-backdrop-filter: blur(18px) saturate(1.4);
	}

	/* Botones-icono silenciosos (`.btn.quiet.iconbtn` de la lámina). */
	.vega-topbar-menu,
	.vega-topbar-collapse {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--r-pill);
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
	}
	.vega-topbar-menu {
		display: none;
	}
	.vega-topbar-menu:hover,
	.vega-topbar-collapse:hover {
		background: var(--btn);
		color: var(--ink);
	}

	.vega-topbar-site {
		display: flex;
		align-items: center;
		gap: 9px;
		min-width: 0;
		flex-shrink: 0;
		padding: 4px 6px 4px 2px;
		white-space: nowrap;
		color: inherit;
		text-decoration: none;
		border-radius: var(--r-sm);
	}

	.vega-topbar-site:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.vega-topbar-brand {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		font: 700 var(--fs-17) / 1.2 var(--display);
		letter-spacing: -0.02em;
		color: var(--ink-hi);
	}

	/* Isotipo sobre el relleno de marca (lámina `.brand .mark`), en la tinta del acento. */
	.vega-topbar-mark {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 8px;
		background: var(--accent-fill);
		color: var(--accent-ink);
		box-shadow: var(--shadow-card);
	}

	/* Nombre del sitio: valor del manifiesto, tenue, separado por una hairline. */
	.vega-topbar-sitename {
		min-width: 0;
		max-width: 16rem;
		margin-left: 2px;
		padding-left: 10px;
		border-left: 1px solid var(--line);
		overflow: hidden;
		text-overflow: ellipsis;
		font: 500 var(--fs-13) var(--sans);
		color: var(--ink-2);
	}

	.vega-topbar-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-shrink: 0;
		min-width: 0;
	}

	.vega-topbar-publication {
		min-width: 0;
	}

	/* Avatar = disparador del menú de cuenta (lámina `.avatar`). */
	.vega-topbar-user {
		position: relative;
		flex-shrink: 0;
	}

	.vega-topbar-user-trigger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		cursor: pointer;
	}

	.vega-topbar-user-trigger:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.vega-topbar-avatar {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		box-sizing: border-box;
		flex-shrink: 0;
		border: 1px solid var(--accent-line);
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent-text);
		font: 600 var(--fs-12) / 1 var(--sans);
	}

	.vega-topbar-user-trigger:hover .vega-topbar-avatar,
	.vega-topbar-user-trigger[aria-expanded='true'] .vega-topbar-avatar {
		box-shadow: 0 0 0 4px var(--accent-soft);
	}

	.vega-topbar-user-menu {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		z-index: 10;
		display: flex;
		flex-direction: column;
		min-width: 13rem;
		padding: 6px;
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		/* Opaco: dentro de la barra (que ya tiene `backdrop-filter`) un segundo cristal no
		   desenfoca lo de detrás y el texto de la portada se leería a través del menú. */
		background: var(--surface);
		box-shadow: var(--shadow-raised);
	}

	.vega-topbar-user-menu-who {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 6px 10px 8px;
		font-size: var(--fs-12);
		color: var(--ink-2);
	}

	.vega-topbar-user-menu-who strong {
		font-size: var(--fs-14);
		font-weight: 600;
		color: var(--ink-hi);
	}

	.vega-topbar-user-menu-group {
		margin: 0;
		padding: 6px 10px 2px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-2);
	}

	.vega-topbar-user-menu-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 36px;
		box-sizing: border-box;
		padding: 0 10px;
		border: 0;
		border-radius: var(--r-sm);
		background: none;
		color: var(--ink);
		font: 500 var(--fs-13) var(--sans);
		text-align: left;
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-topbar-user-menu-item :global(svg) {
		flex: none;
		color: var(--ink-2);
	}

	.vega-topbar-user-menu-item:hover,
	.vega-topbar-user-menu-item:focus-visible {
		background: var(--surface);
		color: var(--ink-hi);
		box-shadow: var(--shadow-card);
	}

	.vega-topbar-user-menu-item:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: -2px;
	}

	.vega-topbar-user-menu [role='menuitemradio'][aria-checked='true'] {
		color: var(--ink-hi);
		font-weight: 600;
	}

	/* Hueco fijo de la marca: los rótulos quedan alineados esté o no marcada la opción. */
	.vega-topbar-user-menu-check {
		display: inline-flex;
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		color: var(--accent-text);
	}

	.vega-topbar-user-menu-sep {
		height: 1px;
		margin: 4px 0;
		background: var(--line-soft);
	}

	/* Punto de colapso ESTRUCTURAL (768px) compartido con Sidebar.svelte, ConnectionStatus.svelte
	   y GlobalSearch.svelte: CSS `@media` no admite `var()`, así que se replica en los cuatro. */
	@media (max-width: 768px) {
		.vega-topbar {
			flex-wrap: wrap;
			gap: var(--sp-2);
			padding: 10px var(--sp-3);
			min-height: var(--topbar-h);
		}

		.vega-topbar-menu {
			display: inline-flex;
		}

		.vega-topbar-collapse {
			display: none;
		}

		/* La marca cede primero: el nombre del sitio desaparece (lámina) y «Vega» se recorta. */
		.vega-topbar-site {
			flex-shrink: 1;
		}

		.vega-topbar-sitename {
			display: none;
		}

		.vega-topbar-actions {
			display: contents;
		}

		.vega-topbar-publication {
			order: 1;
		}

		.vega-topbar-user {
			order: 2;
		}

		/* La publicación que pide atención baja a su propia fila, a todo el ancho. */
		.vega-topbar-publication:not(:has(.quiet)) {
			order: 3;
			flex-basis: 100%;
		}

		.vega-topbar-publication :global(.vega-publish-state.quiet) {
			display: none;
		}
	}

	@media (max-width: 360px) {
		.vega-topbar-brand {
			display: none;
		}
	}

	/* Objetivo táctil de 44×44 (`scripts/check-touch-targets.mjs`). */
	@media (pointer: coarse) {
		.vega-topbar-menu,
		.vega-topbar-collapse {
			width: 44px;
			height: 44px;
			min-width: 44px;
			min-height: 44px;
		}

		.vega-topbar-user-trigger {
			min-width: 44px;
			min-height: 44px;
		}

		.vega-topbar-user-menu-item {
			min-height: 44px;
			min-width: 44px;
		}

		.vega-topbar-site {
			min-height: 44px;
		}
	}
</style>
