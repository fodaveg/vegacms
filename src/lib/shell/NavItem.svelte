<script lang="ts">
	/**
	 * `NavItem.svelte` (Fase 2b, §4.1 del contrato P3): una fila de la sidebar por cada
	 * `NavItem` LITERAL del modelo de P2 (P3-L6: ni reordena ni decide visibilidad, eso ya lo
	 * hizo P2). Cubre los estados obligatorios de §4.1:
	 *
	 * - **normal / hover**: CSS de abajo.
	 * - **foco-visible**: hereda el `:focus-visible` global de `theme/base.css`.
	 * - **activo**: `aria-current="page"` cuando la ruta actual (`page.url`, `$app/state`) cae
	 *   dentro de la ruta del item — el propio listado o cualquier ruta hija (`/c/:type/new`,
	 *   `/c/:type/:id`).
	 * - **con icono / sin icono**: `item.icon` se pasa a `Icon`, que ya cae a `'generic'` si es
	 *   `null` o desconocido (§2.7) — salvo el caso siguiente.
	 * - **singleton sin icono propio**: afordancia distinta (contrato P2 §4.8): icono `'settings'`
	 *   en vez del genérico. `data-singleton` queda en el DOM para que los tests lo localicen sin
	 *   depender del icono concreto.
	 * - **vista fusionada (`item.kind === 'view'`, L7c)**: mismo marcado que una colección, pero
	 *   enruta a `viewRoute(item.type)`/`ctx.nav.toView` en vez de `listRoute`/`toList`/
	 *   `toSingleton` — `item.type` guarda el id de la vista, no un `ContentType.name` (namespace
	 *   distinto, ver `NavItem` en `$lib/model/types`). `item.singleton` es SIEMPRE `false` para
	 *   una vista, así que el icono cae al genérico si no declara uno propio (nunca al de
	 *   "ajustes" del caso singleton, que no aplica aquí).
	 * - **readonly**: insignia visible "Solo lectura" (`data-readonly` también, mismo motivo).
	 * - **label kilométrico**: `title` con el label completo + `text-overflow: ellipsis`.
	 * - **recuento** (R5 del rediseño C2, mockup `.navgroup .count`): número mono a la derecha,
	 *   cuando `count` llega definido — lo resuelve `Sidebar.svelte` (vía `port.list(type,
	 *   { perPage: 1 }).totalItems`, un recuento barato); `undefined` (sin dato o el fetch falló)
	 *   = sin badge, nunca un número inventado.
	 *
	 * **Activo = "pestaña"** (R5, antes relleno sólido de acento — "pesaba" demasiado): fondo
	 * `--accent-soft` + borde izquierdo 2px `--accent` + texto `--accent-text`, calcado del
	 * mockup `.navgroup a[aria-current='page']`. El borde transparente en reposo evita que el
	 * contenido salte 2px al activarse.
	 *
	 * Respeta el *exit-guard* de `NavApi` (§2.1, vía `ctx.nav.toList`/`toSingleton`) y los gestos
	 * nativos del navegador (Cmd/Ctrl/Shift+click y click central abren en pestaña/ventana nueva
	 * sin pasar por la SPA — mismo patrón que el resto del shell).
	 */
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import { listRoute, viewRoute } from '$lib/nav/routes';
	import Icon from '$lib/icons/Icon.svelte';
	import type { NavItem as NavItemModel } from '$lib/model/types';

	let { item, count }: { item: NavItemModel; count?: number } = $props();

	const ctx = getVegaContext();

	const href = $derived(item.kind === 'view' ? viewRoute(item.type) : listRoute(item.type));
	// P2 §4.8: un singleton sin icono propio se distingue con el icono de "ajustes" en vez del
	// genérico neutro — es SU afordancia (§4.1), no un accidente de fallback. Una vista (L7c)
	// nunca es singleton, así que siempre cae al genérico si no declara icono propio.
	const iconId = $derived(item.icon ?? (item.singleton ? 'settings' : 'generic'));
	const isActive = $derived(page.url.pathname === href || page.url.pathname.startsWith(`${href}/`));

	function handleClick(event: MouseEvent): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		if (item.kind === 'view') {
			ctx.nav.toView(item.type);
			return;
		}
		void (item.singleton ? ctx.nav.toSingleton(item.type) : ctx.nav.toList(item.type));
	}
</script>

<li>
	<a
		{href}
		onclick={handleClick}
		aria-current={isActive ? 'page' : undefined}
		data-singleton={item.singleton || undefined}
		data-readonly={item.readonly || undefined}
	>
		<Icon id={iconId} size={16} />
		<span class="vega-nav-item-label" title={item.label}>{item.label}</span>
		{#if item.readonly || count !== undefined}
			<span class="vega-nav-trailing">
				{#if item.readonly}
					<span class="vega-nav-badge">{ctx.t('nav.readonlyBadge')}</span>
				{/if}
				{#if count !== undefined}
					<span class="vega-nav-count">{count}</span>
				{/if}
			</span>
		{/if}
	</a>
</li>

<style>
	li {
		list-style: none;
	}

	a {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-height: var(--row-h);
		padding: 0 var(--vega-space-gutter);
		border-left: 2px solid transparent;
		color: var(--ink-2);
		text-decoration: none;
	}

	a :global(svg) {
		color: var(--ink-3);
	}

	a:hover {
		/* `--active` = rol §3 de "fila/elemento activo" (igual que el hover de fila en
		   `RecordTable`); antes usaba `--surface` (elevación de tarjeta), semánticamente distinto. */
		background: var(--active);
		color: var(--ink-hi);
	}

	a[aria-current='page'] {
		background: var(--accent-soft);
		border-left-color: var(--accent);
		color: var(--accent-text);
		font-weight: 600;
	}

	a[aria-current='page'] :global(svg) {
		color: var(--accent-text);
	}

	.vega-nav-item-label {
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

	.vega-nav-badge {
		flex-shrink: 0;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 0.7rem;
		white-space: nowrap;
		color: var(--ink-2);
		background: var(--surface);
	}

	.vega-nav-count {
		flex-shrink: 0;
		font-family: var(--mono);
		font-size: 0.6875rem;
		color: var(--ink-3);
	}
</style>
