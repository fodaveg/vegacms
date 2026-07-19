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
	 * - **readonly**: insignia visible "Solo lectura" (`data-readonly` también, mismo motivo).
	 * - **label kilométrico**: `title` con el label completo + `text-overflow: ellipsis`.
	 *
	 * Respeta el *exit-guard* de `NavApi` (§2.1, vía `ctx.nav.toList`/`toSingleton`) y los gestos
	 * nativos del navegador (Cmd/Ctrl/Shift+click y click central abren en pestaña/ventana nueva
	 * sin pasar por la SPA — mismo patrón que el resto del shell).
	 */
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import { listRoute } from '$lib/nav/routes';
	import Icon from '$lib/icons/Icon.svelte';
	import type { NavItem as NavItemModel } from '$lib/model/types';

	let { item }: { item: NavItemModel } = $props();

	const ctx = getVegaContext();

	const href = $derived(listRoute(item.type));
	// P2 §4.8: un singleton sin icono propio se distingue con el icono de "ajustes" en vez del
	// genérico neutro — es SU afordancia (§4.1), no un accidente de fallback.
	const iconId = $derived(item.icon ?? (item.singleton ? 'settings' : 'generic'));
	const isActive = $derived(page.url.pathname === href || page.url.pathname.startsWith(`${href}/`));

	function handleClick(event: MouseEvent): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
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
		{#if item.readonly}
			<span class="vega-nav-badge">{ctx.t('nav.readonlyBadge')}</span>
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
		gap: 0.6rem;
		min-height: var(--row-h);
		padding: 0 var(--vega-space-gutter);
		color: var(--ink);
		text-decoration: none;
		border-radius: 6px;
	}

	a:hover {
		background: var(--surface);
	}

	a[aria-current='page'] {
		background: var(--accent);
		color: var(--accent-ink);
	}

	.vega-nav-item-label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	a[aria-current='page'] .vega-nav-badge {
		border-color: var(--accent-ink);
		color: var(--accent-ink);
	}
</style>
