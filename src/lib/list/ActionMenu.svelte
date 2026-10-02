<script lang="ts">
	/**
	 * `ActionMenu.svelte` (Lote 12, láminas 6 y 7): botón que despliega un menú de acciones, patrón
	 * APG «menu button». Es la tarjeta que ya repetían a mano `Topbar.svelte` (menú de cuenta),
	 * `ListToolbar.svelte` («Filtrar») y `RecordBlocks.svelte» («Añadir bloque»); la lámina pedía
	 * que al tercer uso saliera a una sola pieza, y este lote la usa dos veces más («Más» de la
	 * cabecera del listado en móvil y el menú de acciones de cada fila), así que aquí vive una vez.
	 * Los tres menús anteriores NO se migran en este lote (fuera de alcance): la pieza nace con su
	 * comportamiento, para que la próxima migración sea un cambio de marcado y no de conducta.
	 *
	 * Comportamiento (el mismo que `RecordBlocks`, el más completo de los tres):
	 * - Click, Enter o Espacio en el disparador abre y lleva el foco a la PRIMERA entrada; abrir con
	 *   `ArrowDown`/`ArrowUp` también. Si se deja el foco en el disparador, las flechas no recorren
	 *   nada y solo se llega con Tab, que es lo que APG prohíbe.
	 * - Dentro del menú, `ArrowDown`/`ArrowUp` circulan y `Home`/`End` van a los extremos
	 *   (`typeMenuKeydownIndex`, el MISMO algoritmo que la paleta de tipos del editor visual: el
	 *   encargo de aquel lote avisó del riesgo de dos menús con dos teclados distintos).
	 * - `Escape` cierra y DEVUELVE EL FOCO al disparador; click fuera y foco que sale del menú
	 *   cierran. Elegir una entrada cierra, devuelve el foco al disparador y DESPUÉS ejecuta la
	 *   acción: si la acción abre un diálogo (`DeleteConfirm`, `ExportDialog`…), ese diálogo
	 *   restaurará el foco justo al disparador al cerrarse (lámina 6: «al cerrarlo el foco vuelve
	 *   a “Más”»).
	 *
	 * Dos variantes de disparador y dos anclajes:
	 * - `variant="button"`: texto + chevron, la caja de «Filtrar» (`.vega-list-filter-trigger`).
	 * - `variant="icon"`: la caja del asa de arrastre (`.vega-reorder-handle`, 1.75rem) con el icono
	 *   `more`; `label` pasa a ser su nombre accesible. Con `reveal`, va oculto (`opacity: 0`) hasta
	 *   que quien lo contiene lo revele (la fila en hover/foco, `RecordTable`) o esté abierto; con
	 *   puntero basto o sin hover, siempre visible (mismo fallback táctil que tenía «Borrar»).
	 * - `anchor="below-end"`: menú absoluto bajo el disparador, alineado a su borde derecho (el
	 *   disparador es el último de su fila). Para barras y cabeceras.
	 * - `anchor="viewport"`: menú `position: fixed`, colocado desde la caja del disparador
	 *   (`placeViewportMenu`, `action-menu.ts`) y abierto hacia ARRIBA si no cabe debajo. Para
	 *   disparadores dentro de contenedores que recortan o se desplazan (celdas de tabla). Un
	 *   desplazamiento o cambio de tamaño de la ventana mientras está abierto lo cierra: la
	 *   posición fija habría quedado desfasada del disparador.
	 *
	 * `triggerTabindex={-1}` (lámina 7): el disparador sale del recorrido del tabulador y quien lo
	 *   contiene decide cómo se alcanza (en `RecordTable`, con → desde el título de la fila).
	 *   `onTriggerKeydown` recibe las teclas que el disparador no consume con el menú CERRADO, para
	 *   que ese contenedor pueda devolver el foco (←) sin duplicar nada de aquí.
	 */
	import { tick } from 'svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { typeMenuItems, typeMenuKeydownIndex } from '$lib/visual/type-menu';
	import { placeViewportMenu, type ActionMenuItem } from './action-menu';

	interface Props {
		/** `id` del `role="menu"` (`aria-controls` del disparador). Único en la página. */
		id: string;
		/** Nombre accesible del menú; con `variant="icon"`, también del disparador. */
		label: string;
		items: ActionMenuItem[];
		variant?: 'button' | 'icon';
		/** Texto visible del disparador con `variant="button"`. */
		triggerText?: string;
		/** `-1` saca el disparador del recorrido del tabulador (ver cabecera). */
		triggerTabindex?: 0 | -1;
		anchor?: 'below-end' | 'viewport';
		/** Solo `variant="icon"`: oculto hasta que el contenedor lo revele o esté abierto. */
		reveal?: boolean;
		/** Teclas que el disparador no consume, con el menú cerrado (ver cabecera). */
		onTriggerKeydown?: (event: KeyboardEvent) => void;
	}

	let {
		id,
		label,
		items,
		variant = 'button',
		triggerText,
		triggerTabindex = 0,
		anchor = 'below-end',
		reveal = false,
		onTriggerKeydown
	}: Props = $props();

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let menuEl = $state<HTMLElement | null>(null);
	/** Coordenadas del menú con `anchor="viewport"` (`placeViewportMenu`); vacío con `below-end`. */
	let menuStyle = $state('');
	let direction = $state<'down' | 'up'>('down');

	/** Abre y lleva el foco a la primera entrada tras pintarla (`tick`): ver cabecera. */
	function openMenu(): void {
		open = true;
		void tick().then(() => {
			place();
			typeMenuItems(menuEl)[0]?.focus();
		});
	}

	function closeMenu(): void {
		open = false;
	}

	function toggleMenu(): void {
		if (open) closeMenu();
		else openMenu();
	}

	/** Coloca el menú anclado a la ventana a partir de la caja real del disparador y la altura real
	 *  del menú ya pintado. Con `below-end` no hay nada que calcular (lo hace el CSS). */
	function place(): void {
		if (anchor !== 'viewport' || !triggerEl || !menuEl) return;
		const placement = placeViewportMenu(
			triggerEl.getBoundingClientRect(),
			menuEl.getBoundingClientRect().height,
			{ width: window.innerWidth, height: window.innerHeight }
		);
		menuStyle = placement.style;
		direction = placement.direction;
	}

	/** Click en cualquier punto de la ventana con el menú abierto: lo cierra salvo que caiga en el
	 *  disparador o en el propio menú (mismo criterio que `Topbar`/`ListToolbar`). */
	function handleWindowClick(event: MouseEvent): void {
		if (!open) return;
		const target = event.target as Node;
		if (triggerEl?.contains(target) || menuEl?.contains(target)) return;
		closeMenu();
	}

	/** `Escape` cierra y devuelve el foco al disparador (ver cabecera). */
	function handleWindowKeydown(event: KeyboardEvent): void {
		if (!open || event.key !== 'Escape') return;
		event.preventDefault();
		closeMenu();
		triggerEl?.focus();
	}

	/** El foco sale del disparador y del menú hacia otro control: cierra (evita un menú «colgado»
	 *  tras Tab). El tránsito de apertura (disparador → primera entrada) entra por `menuEl`; el
	 *  disparador se perdona para que un click sobre él con el menú abierto no cierre y reabra. */
	function handleFocusOut(event: FocusEvent): void {
		if (!open) return;
		const next = event.relatedTarget as Node | null;
		if (next && (triggerEl?.contains(next) || menuEl?.contains(next))) return;
		closeMenu();
	}

	/** Flechas y `Home`/`End` dentro del menú (`typeMenuKeydownIndex`, ver cabecera). */
	function handleMenuKeydown(event: KeyboardEvent): void {
		const menuItems = typeMenuItems(menuEl);
		const next = typeMenuKeydownIndex(event, menuItems);
		if (next === null) return;
		event.preventDefault();
		menuItems[next]?.focus();
	}

	/** `ArrowDown`/`ArrowUp` sobre el disparador abren el menú (APG); cualquier otra tecla con el
	 *  menú cerrado se le ofrece al contenedor (`onTriggerKeydown`). Enter y Espacio no pasan por
	 *  aquí: el navegador los convierte en `click` sobre un `<button>`. */
	function handleTriggerKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!open) openMenu();
			else {
				const menuItems = typeMenuItems(menuEl);
				menuItems[event.key === 'ArrowDown' ? 0 : menuItems.length - 1]?.focus();
			}
			return;
		}
		if (!open) onTriggerKeydown?.(event);
	}

	/** Elegir una entrada: cerrar, foco al disparador y DESPUÉS la acción (ver cabecera). */
	function select(item: ActionMenuItem): void {
		closeMenu();
		triggerEl?.focus();
		item.onSelect();
	}

	// Con `anchor="viewport"` la posición es fija respecto a la ventana: si el usuario desplaza
	// cualquier contenedor (captura) o cambia el tamaño, el menú dejaría de estar pegado a su
	// disparador. Cerrarlo es más honesto que perseguirlo.
	$effect(() => {
		if (!open || anchor !== 'viewport') return;
		const close = (): void => closeMenu();
		window.addEventListener('scroll', close, true);
		window.addEventListener('resize', close);
		return () => {
			window.removeEventListener('scroll', close, true);
			window.removeEventListener('resize', close);
		};
	});
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="vega-action-menu" onfocusout={handleFocusOut}>
	<button
		type="button"
		bind:this={triggerEl}
		class="vega-action-menu-trigger"
		class:vega-action-menu-trigger--button={variant === 'button'}
		class:vega-action-menu-trigger--icon={variant === 'icon'}
		class:vega-action-menu-trigger--reveal={variant === 'icon' && reveal}
		tabindex={triggerTabindex}
		aria-haspopup="menu"
		aria-expanded={open}
		aria-controls={id}
		aria-label={variant === 'icon' ? label : undefined}
		onclick={toggleMenu}
		onkeydown={handleTriggerKeydown}
	>
		{#if variant === 'icon'}
			<Icon id="more" size={16} />
		{:else}
			{triggerText}
			<Icon id="chevron" size={12} />
		{/if}
	</button>
	{#if open}
		<div
			{id}
			class="vega-action-menu-list"
			class:vega-action-menu-list--viewport={anchor === 'viewport'}
			role="menu"
			tabindex="-1"
			aria-label={label}
			data-direction={direction}
			style={anchor === 'viewport' ? menuStyle : undefined}
			bind:this={menuEl}
			onkeydown={handleMenuKeydown}
		>
			{#each items as item (item.id)}
				<button
					type="button"
					role="menuitem"
					class="vega-action-menu-item"
					data-tone={item.tone}
					data-action={item.action}
					onclick={() => select(item)}
				>
					{#if item.icon}
						<Icon id={item.icon} size={16} />
					{/if}
					{item.label}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.vega-action-menu {
		position: relative;
		display: inline-flex;
	}

	/* Disparador de texto: la caja de «Filtrar» (`ListToolbar.svelte`, `.vega-list-filter-trigger`),
	   mismos tokens y medidas. */
	.vega-action-menu-trigger--button {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		height: 34px;
		padding: 0 0.75rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink-2);
		font-size: 0.85rem;
		font-weight: 550;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-action-menu-trigger--button:hover,
	.vega-action-menu-trigger--button[aria-expanded='true'] {
		border-color: var(--accent);
		color: var(--ink);
	}

	.vega-action-menu-trigger--button :global(svg) {
		transform: rotate(90deg);
		transition: transform 0.12s ease;
	}

	.vega-action-menu-trigger--button[aria-expanded='true'] :global(svg) {
		transform: rotate(-90deg);
	}

	/* Disparador de icono (lámina 7): la caja del asa de arrastre (`.vega-reorder-handle`: 1.75rem,
	   borde transparente, radio 5px). */
	.vega-action-menu-trigger--icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 5px;
		background: none;
		color: var(--ink-2);
		cursor: pointer;
		transition: opacity 0.12s ease;
	}

	.vega-action-menu-trigger--icon:hover,
	.vega-action-menu-trigger--icon[aria-expanded='true'] {
		border-color: var(--line);
		background: var(--surface);
		color: var(--ink);
	}

	/* Oculto hasta que el contenedor lo revele (`RecordTable`: fila en hover o con el foco dentro,
	   vía `:global`) o esté abierto. `opacity`, nunca `display: none`: sigue en el árbol de foco. */
	.vega-action-menu-trigger--reveal {
		opacity: 0;
	}

	.vega-action-menu-trigger--reveal[aria-expanded='true'] {
		opacity: 1;
	}

	/* Sin ratón ni foco por Tab (tablet) no hay hover que lo revele: siempre visible, mismo
	   fallback táctil que tenía el «Borrar» de fila. */
	@media (hover: none), (pointer: coarse) {
		.vega-action-menu-trigger--reveal {
			opacity: 1;
		}
	}

	.vega-action-menu-trigger:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	/* La tarjeta: la misma que `.vega-topbar-user-menu` y `.vega-list-filter-menu`
	   (`--surface`/`--line`/`--shadow-card`). Alineada al borde DERECHO del disparador. */
	.vega-action-menu-list {
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

	/* Anclado a la ventana (ver cabecera): coordenadas en el `style` inline, calculadas por
	   `placeViewportMenu`. */
	.vega-action-menu-list--viewport {
		position: fixed;
		top: auto;
		right: auto;
	}

	.vega-action-menu-item {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.45rem 0.6rem;
		border: 0;
		border-radius: 6px;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 0.85rem;
		text-align: left;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-action-menu-item:hover,
	.vega-action-menu-item:focus-visible {
		background: var(--active);
		color: var(--ink-hi);
	}

	/* Acción destructiva: la pareja `--danger`/`--danger-soft` del «Borrar» de siempre. */
	.vega-action-menu-item[data-tone='danger'] {
		color: var(--danger);
	}

	.vega-action-menu-item[data-tone='danger']:hover,
	.vega-action-menu-item[data-tone='danger']:focus-visible {
		background: var(--danger-soft);
		color: var(--danger);
	}

	/* Objetivo táctil de 44×44 (`scripts/check-touch-targets.mjs`): disparador y entradas suben a
	   44 px con puntero basto; con ratón no cambia nada (densidad). */
	@media (pointer: coarse) {
		.vega-action-menu-trigger {
			min-width: 44px;
			min-height: 44px;
		}

		.vega-action-menu-item {
			min-width: 44px;
			min-height: 44px;
		}
	}
</style>
