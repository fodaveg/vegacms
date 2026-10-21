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
	 * **Activo = "pestaña"** (R5, antes relleno sólido de acento — "pesaba" demasiado): SOLO
	 * pastilla — fondo `--accent-soft` + texto `--accent-text`, calcado 1:1 del mockup
	 * `.nav-item[aria-current='page']` (aquelarre-dark.html). Sin trazo lateral: el `--sheen` de
	 * aquelarre arranca en verde y un `border-image` con él pintaba una línea verde que no está en
	 * el mockup (regresión detectada en la ola de paridad visual).
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
		<Icon id={iconId} size={16} strokeWidth={1.6} />
		<span class="vega-nav-item-label" title={item.label}>{item.label}</span>
		{#if item.readonly || count !== undefined}
			<span class="vega-nav-trailing">
				{#if item.readonly}
					<span class="vega-nav-badge"
						><span class="vega-nav-badge-pill">{ctx.t('nav.readonlyBadge')}</span></span
					>
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

	/* Fila de la lámina Inicio v2 (`.navgroup a`): 36 px (32 en compacta), 14/500, radio 10. */
	a {
		display: flex;
		align-items: center;
		/* Sin `gap`: el hueco entre columnas es un `margin`/pseudo-elemento de cada pieza, porque un
		   `gap` NO encoge y la insignia colapsada seguiría robándole espacio a la etiqueta. */
		min-height: min(36px, var(--sidebar-item-h));
		padding: 0 12px;
		border-radius: var(--r-sm);
		color: var(--ink-2);
		font-size: var(--fs-14);
		font-weight: 500;
		text-decoration: none;
	}

	a :global(svg) {
		flex-shrink: 0;
		margin-right: 10px;
		color: var(--ink-3);
	}

	/* Hover de la lámina: la fila se levanta como una tarjeta sobre el cristal del menú. */
	a:hover {
		background: var(--surface);
		color: var(--ink-hi);
		box-shadow: var(--shadow-card);
	}

	/* Item activo = SOLO pastilla (mockup `.nav-item[aria-current='page']`, aquelarre-dark.html):
	   fondo `--accent-soft` + texto `--accent-text`, sin trazo lateral. */
	a[aria-current='page'] {
		background: var(--accent-soft);
		color: var(--accent-text);
		font-weight: 600;
	}

	a[aria-current='page'] :global(svg) {
		color: var(--accent-text);
	}

	.vega-nav-item-label {
		/* Base `auto` (no 0): con base 0 el label no «pediría» su ancho y la insignia nunca
		   encogería; ver `.vega-nav-badge`. */
		flex: 1 1 auto;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* `display: contents`: la insignia y el recuento son items flex DIRECTOS de la fila, para que
	   el reparto del espacio pueda tratarlos por separado (ver `.vega-nav-badge`). */
	.vega-nav-trailing {
		display: contents;
	}

	/* Con poco ancho CEDE LA INSIGNIA, no la etiqueta. El reparto flex del déficit es proporcional
	   al peso de encogimiento: la insignia pesa 100000 frente a 1 del label, así que lo absorbe
	   entera hasta desaparecer (llega a 0 de ancho: su hueco y su píldora van DENTRO, recortados
	   por `overflow`, no como padding/borde que no encogen) antes de que el label pierda nada; solo
	   entonces el label se recorta con `…`. */
	.vega-nav-badge {
		display: flex;
		flex: 0 100000 auto;
		min-width: 0;
		overflow: hidden;
	}

	.vega-nav-badge::before {
		content: '';
		flex: none;
		width: 0.65rem;
	}

	/* Hueco hasta el recuento, solo si lo hay (`:has`); el recuento no añade el suyo. */
	.vega-nav-badge:has(+ .vega-nav-count)::after {
		content: '';
		flex: none;
		width: 0.5rem;
	}

	.vega-nav-badge-pill {
		flex: none;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 0.7rem;
		white-space: nowrap;
		color: var(--ink-2);
		background: var(--surface);
	}

	.vega-nav-badge + .vega-nav-count {
		margin-left: 0;
	}

	/* Badge-píldora (mockup `.nav-count`, aquelarre-dark.html): antes número plano, ahora
	   redondeada con fondo/borde propios — se lee como "recuento", no como parte del label. */
	/* Recuento (R5, `nav.spec.ts`): la lámina Inicio v2 no lo dibuja; se conserva como cifra mono
	   discreta, sin píldora, para que no compita con el aviso de Ajustes, que sí es píldora. */
	.vega-nav-count {
		flex-shrink: 0;
		margin-left: 10px;
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 400;
		font-variant-numeric: tabular-nums;
		color: var(--ink-2);
	}

	a[aria-current='page'] .vega-nav-count {
		color: var(--accent-text);
	}

	/* Objetivo táctil de 44 px con puntero grueso (la fila de 36 es la de ratón). */
	@media (pointer: coarse) {
		a {
			min-height: 44px;
		}
	}
</style>
