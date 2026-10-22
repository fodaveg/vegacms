<script lang="ts">
	/**
	 * `Sidebar.svelte` (Fase 2b, §3.3/§4.1/§4.2/§4.3 del contrato P3): pinta `ctx.model.nav`
	 * LITERAL (P3-L6 — sin reordenar, sin filtrar, sin re-decidir visibilidad) más los accesos
	 * fijos que P3 posee (Medios, Papelera —`#lote-integridad` Fase B §10.2—, Ajustes: NO forman
	 * parte del `NavModel` de P2, así que viven aparte del `{#each}` de grupos). Landmark `nav` con
	 * `aria-label` dedicado (`nav.sidebarLabel`). Papelera no lleva recuento (a diferencia de
	 * Medios): `vega_revisions` puede no existir todavía, y un `port.list` fallido por "colección
	 * ausente" en CADA carga de la nav no aporta nada que el recuento de Medios sí aporta (una
	 * biblioteca que siempre existe una vez creada).
	 *
	 * **Grupos**: el anónimo (`label: null`) siempre primero (invariante de P2 §4.9, ya resuelto
	 * ahí — aquí solo se respeta el orden que llega). Label con `title` + ellipsis para el caso
	 * límite "muchos grupos / label kilométrico" (§6.3).
	 *
	 * **Nav vacía** (§6.1): título + guía en vez de una sidebar en blanco.
	 *
	 * Fondo del rail (F7w-b): usa `--sidebar` (rol dedicado §3, no `--surface-2`) — el rail es una
	 * superficie propia distinta de las tarjetas/elevaciones del contenido.
	 *
	 * **Responsive** (§4.2): en escritorio, columna fija. Por debajo del punto de colapso
	 * ESTRUCTURAL (fijado aquí; los valores finos son de P7) se convierte en un overlay
	 * controlado por `open`/`onClose` — el hamburguesa de `Topbar.svelte` cambia `open`. El
	 * overlay atrapa el foco y se cierra con `Esc` o clicando el backdrop (§4.3): al abrirse,
	 * mueve el foco al primer elemento navegable; al cerrarse, lo devuelve a quien lo abrió.
	 *
	 * **Plegado de escritorio** (`collapsed`, petición de David — ver la cabecera de
	 * `AppShell.svelte`, dueño del estado): SOLO tiene efecto por ENCIMA del punto de colapso
	 * estructural (su CSS vive dentro de `@media (min-width: 769px)`, más abajo) — por debajo, la
	 * sidebar sigue siendo el cajón `open`/`onClose` de siempre y `collapsed` no pinta nada ahí,
	 * los dos estados no se pisan nunca. Plegada, la barra queda a ancho CERO (no un raíl de solo
	 * iconos): un raíl habría exigido un modo icono-only con tooltips en `NavItem.svelte` — fuera
	 * de alcance de este encargo — y "no ocupa ancho" ya es la lectura literal de lo pedido.
	 * `visibility: hidden` (no solo `width: 0`) saca el contenido del orden de tabulación: sin
	 * eso, `Tab` seguía aterrizando en enlaces invisibles de 0px de ancho.
	 *
	 * **Recuentos por item** (R5 del rediseño C2, mockup `.navgroup .count`): `port.list(type,
	 * { perPage: 1 }).totalItems` es la consulta MÁS barata que expone `BackendPort` para "cuántos
	 * hay" — `+layout.svelte#toSingleton` ya se apoya en el mismo truco. Los singletons no
	 * navegan a un listado (P2 §4.8) y no llevan recuento. Un fallo (sin permiso, o `vega_media`
	 * todavía sin bootstrap — Fase P6·6a) se traga en silencio: el slot queda VACÍO (`undefined`
	 * en `counts`), NUNCA un número inventado (mismo criterio que el resto del chrome, P3-L10).
	 *
	 * **Guard anti-stale** (fix code-review lote-1, 🟡): MISMO patrón epoch que `loadModel()` de
	 * `+layout.svelte` (`isStale()`/token capturado al lanzar) — si `ctx.session` cambia (re-login)
	 * o el propio `$effect` se re-ejecuta (nav recargada) MIENTRAS un `list()` está en vuelo, la
	 * respuesta vieja no debe pisar `counts` con datos de una sesión/modelo que ya no es el
	 * actual. `counts` se limpia al arrancar cada tanda (una sesión/modelo nuevo no hereda
	 * recuentos del anterior, aunque coincida el nombre de tipo).
	 */
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import {
		activityRoute,
		backupsRoute,
		editorsRoute,
		mediaRoute,
		settingsRoute,
		trashRoute
	} from '$lib/nav/routes';
	import { hasActivityCollection } from '$lib/activity/activity-collection';
	import { VEGA_MEDIA_COLLECTION } from '$lib/media/media-collection';
	import Icon from '$lib/icons/Icon.svelte';
	import NavItem from './NavItem.svelte';
	import WarningsBadge from './WarningsBadge.svelte';

	let { open, onClose, collapsed }: { open: boolean; onClose: () => void; collapsed: boolean } =
		$props();

	const ctx = getVegaContext();

	const hasVisibleNav = $derived(ctx.model.nav.groups.some((group) => group.items.length > 0));

	const mediaHref = mediaRoute();
	const settingsHref = settingsRoute();
	const trashHref = trashRoute();
	const isMediaActive = $derived(
		page.url.pathname === mediaHref || page.url.pathname.startsWith(`${mediaHref}/`)
	);
	const isSettingsActive = $derived(
		page.url.pathname === settingsHref || page.url.pathname.startsWith(`${settingsHref}/`)
	);
	const isTrashActive = $derived(
		page.url.pathname === trashHref || page.url.pathname.startsWith(`${trashHref}/`)
	);

	// Pantallas de superusuario (`/editores`, `/copias`): solo con la capability Y su sección del
	// puerto, que van juntas (`port.ts`). La señal es `capabilities.administration` y no
	// `schemaBootstrap`: que hoy coincidan en PocketBase no las hace la misma pregunta. Un editor
	// no las ve; si llega por URL, cada ruta enseña su propia puerta.
	const showAdministration = $derived(
		ctx.port.capabilities.administration && ctx.port.administration !== undefined
	);
	const activityHref = activityRoute();
	const showActivity = $derived(
		showAdministration && hasActivityCollection(ctx.model.types.map((type) => type.schema))
	);
	const editorsHref = editorsRoute();
	const backupsHref = backupsRoute();
	const isEditorsActive = $derived(
		page.url.pathname === editorsHref || page.url.pathname.startsWith(`${editorsHref}/`)
	);
	const isBackupsActive = $derived(
		page.url.pathname === backupsHref || page.url.pathname.startsWith(`${backupsHref}/`)
	);

	function handleFixedClick(event: MouseEvent, action: () => void): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		action();
	}

	let counts = $state<Record<string, number>>({});
	// Bookkeeping puro de orquestación (no reactivo a propósito, mismo criterio que
	// `resolvedPort` de `session.svelte.ts`): un contador que crece en cada ejecución del
	// `$effect` de abajo, capturado por cada tanda de `list()` para detectar si una respuesta
	// llega DESPUÉS de que una tanda más nueva ya haya arrancado.
	let countsRunId = 0;

	$effect(() => {
		const runId = ++countsRunId;
		const port = ctx.port;
		// Dependencia reactiva explícita: un cambio de sesión (login/logout/relogin) recorta esta
		// tanda como stale aunque el propio `port` sea el mismo objeto (session.svelte.ts NO hace
		// reactivo `resolvedPort` — ver su cabecera).
		const sessionToken = ctx.session.token;
		const isStale = (): boolean => runId !== countsRunId || ctx.session.token !== sessionToken;

		// Sesión/modelo nuevo no hereda recuentos del anterior (aunque coincida el nombre de tipo):
		// fuera con los datos de la tanda vieja antes de lanzar la nueva.
		counts = {};

		// Vistas fusionadas (L7c, `item.kind === 'view'`) EXCLUIDAS a propósito: `item.type` guarda
		// el id de la vista, no un `ContentType.name` — `port.list(item.type, ...)` reventaría
		// contra una colección inexistente. Sin recuento de vista todavía (fuera de alcance de L7c,
		// una vista no tiene un `totalItems` único: cada source tiene el suyo).
		const types = ctx.model.nav.groups
			.flatMap((group) => group.items)
			.filter((item) => item.kind === 'collection' && !item.singleton)
			.map((item) => item.type);
		for (const type of types) {
			void port
				.list(type, { perPage: 1 })
				.then((res) => {
					if (isStale()) return;
					counts[type] = res.totalItems;
				})
				.catch(() => {
					/* sin recuento: slot vacío, ver cabecera del módulo */
				});
		}
		void port
			.list(VEGA_MEDIA_COLLECTION.name, { perPage: 1 })
			.then((res) => {
				if (isStale()) return;
				counts[VEGA_MEDIA_COLLECTION.name] = res.totalItems;
			})
			.catch(() => {
				/* "vega_media" puede no existir todavía (sin bootstrap, Fase P6·6a): sin recuento. */
			});
	});

	// ————— Overlay móvil: foco atrapado + Esc + backdrop (§4.3) —————
	let navEl = $state<HTMLElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	function focusableItems(): HTMLElement[] {
		if (!navEl) return [];
		return Array.from(navEl.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
	}

	function handleTrapKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			onClose();
			return;
		}
		if (event.key !== 'Tab') return;
		const items = focusableItems();
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	// Foco atrapado + restaurado (§4.3): solo tiene efecto real cuando el overlay móvil está
	// visible (`open`); en escritorio `open` nunca llega a `true` (el hamburguesa que lo activa
	// está oculto por CSS, fuera del orden de tabulación).
	$effect(() => {
		if (!open) return;
		previouslyFocused = document.activeElement as HTMLElement | null;
		focusableItems()[0]?.focus();
		document.addEventListener('keydown', handleTrapKeydown);
		return () => {
			document.removeEventListener('keydown', handleTrapKeydown);
			previouslyFocused?.focus();
		};
	});
</script>

{#if open}
	<button
		type="button"
		class="vega-sidebar-backdrop"
		tabindex="-1"
		aria-hidden="true"
		onclick={onClose}
	></button>
{/if}

<!-- Overlay móvil (`open`): el aislamiento del contenido de fondo para lectores de pantalla lo da
     `inert` en `<main>` (desde AppShell) + el trap de foco de aquí. NO se usa `aria-modal`: no es
     válido en el rol implícito `navigation` de `<nav>` (lo rechaza svelte-check/ARIA), y sería
     redundante con el `inert`. En escritorio `open` es siempre falso: landmark normal. -->
<nav
	id="vega-sidebar"
	class="vega-sidebar"
	class:vega-sidebar-open={open}
	class:vega-sidebar-collapsed={collapsed}
	aria-label={ctx.t('nav.sidebarLabel')}
	bind:this={navEl}
>
	<button
		type="button"
		class="vega-sidebar-close"
		aria-label={ctx.t('common.close')}
		onclick={onClose}
	>
		<Icon id="close" size={16} />
	</button>

	{#if hasVisibleNav}
		{#each ctx.model.nav.groups as group (group.label ?? '__anon__')}
			{#if group.items.length > 0}
				<div class="vega-nav-group">
					{#if group.label}
						<!-- Cabecera de grupo de la lámina Inicio v2 (`.navgroup h3`): rótulo sin adorno. -->
						<p class="vega-nav-group-label" title={group.label}>
							{group.label}
						</p>
					{/if}
					<ul>
						{#each group.items as item (item.type)}
							<NavItem {item} count={counts[item.type]} />
						{/each}
					</ul>
				</div>
			{/if}
		{/each}
	{:else}
		<div class="vega-sidebar-empty">
			<p class="vega-sidebar-empty-title">{ctx.t('nav.emptyTitle')}</p>
			<p class="vega-sidebar-empty-body">
				{ctx.t(ctx.port.capabilities.schemaBootstrap ? 'nav.emptyBody' : 'nav.emptyBodyEditor')}
			</p>
		</div>
	{/if}

	<ul class="vega-nav-fixed">
		<li>
			<a
				href={mediaHref}
				aria-current={isMediaActive ? 'page' : undefined}
				onclick={(event) => handleFixedClick(event, ctx.nav.toMedia)}
			>
				<Icon id="media" size={16} strokeWidth={1.6} />
				<span class="vega-nav-fixed-label">{ctx.t('nav.media')}</span>
				{#if counts[VEGA_MEDIA_COLLECTION.name] !== undefined}
					<span class="vega-nav-trailing">
						<span class="vega-nav-count">{counts[VEGA_MEDIA_COLLECTION.name]}</span>
					</span>
				{/if}
			</a>
		</li>
		<li>
			<a
				href={trashHref}
				aria-current={isTrashActive ? 'page' : undefined}
				onclick={(event) => handleFixedClick(event, ctx.nav.toTrash)}
			>
				<Icon id="trash" size={16} strokeWidth={1.6} />
				<span class="vega-nav-fixed-label">{ctx.t('nav.trash')}</span>
			</a>
		</li>
		{#if showAdministration}
			<li>
				<a
					href={editorsHref}
					aria-current={isEditorsActive ? 'page' : undefined}
					onclick={(event) => handleFixedClick(event, ctx.nav.toEditors)}
				>
					<Icon id="user" size={16} strokeWidth={1.6} />
					<span class="vega-nav-fixed-label">{ctx.t('nav.editors')}</span>
				</a>
			</li>
			<li>
				<!-- «Copias», no «Copias de seguridad»: en 236 px la etiqueta larga se partía (lámina
				     del audit, NAV). El título de la página sí va completo. -->
				<a
					href={backupsHref}
					aria-current={isBackupsActive ? 'page' : undefined}
					onclick={(event) => handleFixedClick(event, ctx.nav.toBackups)}
				>
					<Icon id="archive" size={16} strokeWidth={1.6} />
					<span class="vega-nav-fixed-label">{ctx.t('nav.backups')}</span>
				</a>
			</li>
		{/if}
		{#if showActivity}
			<li>
				<a
					href={activityHref}
					aria-current={page.url.pathname === activityHref ? 'page' : undefined}
					><Icon id="update" size={16} strokeWidth={1.6} /><span class="vega-nav-fixed-label"
						>{ctx.t('activity.title')}</span
					></a
				>
			</li>
		{/if}
		<li>
			<a
				href={settingsHref}
				aria-current={isSettingsActive ? 'page' : undefined}
				onclick={(event) => handleFixedClick(event, ctx.nav.toSettings)}
			>
				<!-- Engranaje (lámina): los deslizadores quedan para el singleton «Ajustes del sitio». -->
				<Icon id="gear" size={16} strokeWidth={1.6} />
				<span class="vega-nav-fixed-label">{ctx.t('nav.settings')}</span>
				<!-- Indicador global de avisos (§3.5.1/L10): solo se pinta con warnings > 0. -->
				<WarningsBadge />
			</a>
		</li>
	</ul>
</nav>

<style>
	/* Menú flotante de cristal de la lámina Inicio v2 (`.sidebar`): 248 px, 12 de relleno, 16
	   entre grupos, radio 16, sombra de tarjeta, sobre el halo del lienzo. */
	.vega-sidebar {
		width: var(--vega-size-sidebar);
		box-sizing: border-box;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-3);
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--glass);
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
		box-shadow: var(--shadow-card);
		overflow-y: auto;
	}

	.vega-sidebar-close,
	.vega-sidebar-backdrop {
		display: none;
	}

	.vega-nav-group ul,
	.vega-nav-fixed {
		list-style: none;
		margin: 0;
		padding: 0;
		/* Aire vertical entre items del rail (antes iban pegados de fila a fila). */
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	/* Cabecera de grupo (`.navgroup h3`): 11/600 versalitas. En `ink-2`, no el `ink-3` de la
	   lámina: es texto que nombra el grupo y P7 reserva `ink-3` a la decoración. */
	.vega-nav-group-label {
		margin: 0 0 4px;
		padding: 0 12px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-2);
	}

	.vega-nav-fixed {
		margin-top: auto;
		padding-top: var(--sp-3);
		border-top: 1px solid var(--line-soft);
	}

	/* Mismos tokens/estados que `NavItem.svelte` (misma "pestaña" activa, R5): Medios/Ajustes son
	   accesos fijos de P3 (fuera del `NavModel` de P2), pero visualmente son filas de nav
	   idénticas — duplicado a propósito, Svelte no comparte CSS scoped entre componentes. */
	.vega-nav-fixed a {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: min(36px, var(--sidebar-item-h));
		padding: 0 12px;
		/* Misma fila que los items de grupo (`NavItem.svelte`). */
		border-radius: var(--r-sm);
		color: var(--ink-2);
		font-size: var(--fs-14);
		font-weight: 500;
		text-decoration: none;
	}

	.vega-nav-fixed a :global(svg) {
		flex-shrink: 0;
		color: var(--ink-3);
	}

	.vega-nav-fixed a:hover {
		background: var(--surface);
		color: var(--ink-hi);
		box-shadow: var(--shadow-card);
	}

	/* Item activo = SOLO pastilla (mockup `.nav-item[aria-current='page']`, aquelarre-dark.html),
	   igual que `NavItem.svelte`: fondo `--accent-soft` + texto `--accent-text`, sin trazo lateral
	   (el `--sheen` de aquelarre arranca en verde y pintaba una línea que no está en el mockup). */
	.vega-nav-fixed a[aria-current='page'] {
		background: var(--accent-soft);
		color: var(--accent-text);
		font-weight: 600;
	}

	.vega-nav-fixed a[aria-current='page'] :global(svg) {
		color: var(--accent-text);
	}

	.vega-nav-fixed-label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vega-nav-trailing {
		flex-shrink: 0;
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* Badge-píldora (mockup `.nav-count`, aquelarre-dark.html): duplicada a propósito respecto a
	   `NavItem.svelte` — mismo motivo que el resto del CSS de `.vega-nav-fixed` (Svelte no
	   comparte CSS scoped entre componentes). Mantener ambas coherentes. */
	.vega-nav-count {
		flex-shrink: 0;
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 400;
		font-variant-numeric: tabular-nums;
		color: var(--ink-2);
	}

	.vega-nav-fixed a[aria-current='page'] .vega-nav-count {
		color: var(--accent-text);
	}

	@media (pointer: coarse) {
		.vega-nav-fixed a {
			min-height: 44px;
		}
	}

	.vega-sidebar-empty {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0 var(--vega-space-gutter);
		font-size: 0.9rem;
	}

	.vega-sidebar-empty-title {
		margin: 0;
		font-weight: 600;
		color: var(--ink);
	}

	.vega-sidebar-empty-body {
		margin: 0;
		color: var(--ink-2);
	}

	/* Responsive (§4.2): punto de colapso ESTRUCTURAL que fija P3 (768px, referencia de tableta);
	   los valores finos (anchura exacta del overlay, el propio breakpoint como token) los ajusta
	   P7 sin reabrir esta regla.
	   FUENTE ÚNICA: este mismo 768px se replica en `Topbar.svelte` y `ConnectionStatus.svelte`
	   (CSS `@media` no admite `var()`, así que no hay custom property compartida). Si P7 cambia el
	   valor, cambiarlo EN LOS TRES a la vez. */
	@media (max-width: 768px) {
		.vega-sidebar {
			position: fixed;
			inset: 0 auto 0 0;
			z-index: 30;
			width: min(80vw, 300px);
			max-width: 300px;
			box-shadow: var(--shadow-card);
			transform: translateX(-100%);
			transition: transform 0.2s ease;
		}

		.vega-sidebar-open {
			transform: translateX(0);
		}

		/* El cajón móvil tapa el contenido: superficie opaca, no el cristal del menú flotante. */
		.vega-sidebar {
			border-radius: 0 var(--r-md) var(--r-md) 0;
			background: var(--surface);
		}

		.vega-sidebar-close {
			display: flex;
			align-items: center;
			justify-content: center;
			align-self: flex-end;
			flex-shrink: 0;
			width: 2rem;
			height: 2rem;
			margin: 0 var(--vega-space-gutter);
			border: 1px solid var(--line);
			border-radius: 6px;
			background: var(--surface);
			color: var(--ink);
			cursor: pointer;
		}

		.vega-sidebar-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 20;
			margin: 0;
			padding: 0;
			border: none;
			/* Scrim theme-independiente (§3 no tiene token de velo) — allowlisted en
			   check-theme-coverage.mjs. */
			background: rgb(15 17 21 / 45%);
			cursor: pointer;
		}
	}

	/* Plegado de escritorio (ver cabecera, "Plegado de escritorio"): SOLO por encima del punto de
	   colapso estructural — por debajo, `.vega-sidebar-open`/el cajón mandan, y esta regla no
	   compite con ellas (breakpoints mutuamente excluyentes, `min-width` aquí vs `max-width` en el
	   bloque de arriba). */
	@media (min-width: 769px) {
		.vega-sidebar {
			transition: width 0.2s ease;
		}

		.vega-sidebar-collapsed {
			width: 0;
			padding: 0;
			border-right: 0;
			overflow: hidden;
			/* Ver cabecera: saca el contenido del orden de tabulación, no solo de la vista. */
			visibility: hidden;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.vega-sidebar {
			transition: none;
		}
	}
</style>
