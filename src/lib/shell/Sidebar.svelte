<script lang="ts">
	/**
	 * `Sidebar.svelte` (Fase 2b, §3.3/§4.1/§4.2/§4.3 del contrato P3): pinta `ctx.model.nav`
	 * LITERAL (P3-L6 — sin reordenar, sin filtrar, sin re-decidir visibilidad) más los dos
	 * accesos fijos que P3 posee (Medios, Ajustes: NO forman parte del `NavModel` de P2, así que
	 * viven aparte del `{#each}` de grupos). Landmark `nav` con `aria-label` dedicado
	 * (`nav.sidebarLabel`).
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
	 */
	import { getVegaContext } from '$lib/app-context';
	import { mediaRoute, settingsRoute } from '$lib/nav/routes';
	import Icon from '$lib/icons/Icon.svelte';
	import NavItem from './NavItem.svelte';
	import WarningsBadge from './WarningsBadge.svelte';

	let { open, onClose }: { open: boolean; onClose: () => void } = $props();

	const ctx = getVegaContext();

	const hasVisibleNav = $derived(ctx.model.nav.groups.some((group) => group.items.length > 0));

	function handleFixedClick(event: MouseEvent, action: () => void): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		action();
	}

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
						<p class="vega-nav-group-label" title={group.label}>{group.label}</p>
					{/if}
					<ul>
						{#each group.items as item (item.type)}
							<NavItem {item} />
						{/each}
					</ul>
				</div>
			{/if}
		{/each}
	{:else}
		<div class="vega-sidebar-empty">
			<p class="vega-sidebar-empty-title">{ctx.t('nav.emptyTitle')}</p>
			<p class="vega-sidebar-empty-body">{ctx.t('nav.emptyBody')}</p>
		</div>
	{/if}

	<ul class="vega-nav-fixed">
		<li>
			<a href={mediaRoute()} onclick={(event) => handleFixedClick(event, ctx.nav.toMedia)}>
				<Icon id="media" size={16} /><span>{ctx.t('nav.media')}</span>
			</a>
		</li>
		<li>
			<a href={settingsRoute()} onclick={(event) => handleFixedClick(event, ctx.nav.toSettings)}>
				<Icon id="settings" size={16} /><span>{ctx.t('nav.settings')}</span>
				<!-- Indicador global de avisos (§3.5.1/L10): solo se pinta con warnings > 0. -->
				<WarningsBadge />
			</a>
		</li>
	</ul>
</nav>

<style>
	.vega-sidebar {
		width: var(--vega-size-sidebar);
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: var(--vega-space-gutter);
		padding: var(--vega-space-gutter) 0;
		border-right: 1px solid var(--line);
		background: var(--sidebar);
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
	}

	.vega-nav-group-label {
		margin: 0 0 0.25rem;
		padding: 0 var(--vega-space-gutter);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-2);
	}

	.vega-nav-fixed {
		margin-top: auto;
		padding-top: var(--vega-space-gutter);
		border-top: 1px solid var(--line);
	}

	.vega-nav-fixed a {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: var(--row-h);
		padding: 0 var(--vega-space-gutter);
		color: var(--ink);
		text-decoration: none;
		border-radius: 6px;
	}

	.vega-nav-fixed a:hover {
		background: var(--surface);
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

	@media (prefers-reduced-motion: reduce) {
		.vega-sidebar {
			transition: none;
		}
	}
</style>
