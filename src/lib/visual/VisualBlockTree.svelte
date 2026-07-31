<script lang="ts">
	/**
	 * `VisualBlockTree.svelte` (tarea "árbol de secciones y el inspector"): columna IZQUIERDA del
	 * editor visual — una fila por bloque del registro, en su orden, con el título y el tipo. Lee y
	 * selecciona; NUNCA muta bloques (crear/reordenar/duplicar/borrar siguen viviendo solo en
	 * `RecordBlocks.svelte`, que es donde el manifiesto de "un lote por gesto" las documenta): esta
	 * pantalla no expone ningún botón para esas cuatro acciones.
	 *
	 * **Un solo dueño del estado, otra presentación más** (mismo reparto que `RecordBlocks.svelte`,
	 * ver la cabecera de `blocks-state.svelte.ts`): `blocks` llega como PROP, ya construido por
	 * `VisualEditorScreen.svelte` con `createBlocksState()` — este componente no instancia la
	 * fábrica ni una segunda vez ("un solo `createBlocksState` por pantalla" es un requisito del
	 * lote, no una preferencia de estilo).
	 *
	 * **La vía ACCESIBLE de seleccionar** (§tarea): los contornos de `VisualOverlay.svelte` son
	 * `aria-hidden` a propósito (ver su cabecera) porque el lienzo es un `<iframe>` de otro origen
	 * sin ningún mensaje de `hover` en el protocolo — un lector de pantalla no puede usarlos para
	 * elegir un bloque. Esta lista sí: cada fila es un `<button>` normal, en el orden de tabulación
	 * de siempre (mismo criterio que las filas de `RecordBlocks.svelte`, que tampoco usan foco en
	 * carrusel/roving-tabindex) — con pocos bloques por página (el propio caso de uso del lote,
	 * documentado en `blocks-state.svelte.ts`), recorrer la lista con `Tab` es sencillo y no
	 * necesita reinventar el patrón ARIA `listbox`.
	 *
	 * **Ids: el árbol trabaja con registros de PocketBase, el sitio con `data-vega-block-id`.** El
	 * contrato asume que el sitio anota cada bloque con el id de SU registro (`bridge-client.ts`,
	 * `VisualBlock.id`), así que casan por igualdad de string sin traducción. Si algún día no
	 * casaran —un bloque que el sitio reporta pero el árbol no tiene, o al revés— cada mitad lo dice
	 * por su cuenta: este árbol simplemente no resalta nada si `selectedId` no está entre
	 * `blocks.records` (nunca selecciona "la fila más parecida"), y `VisualInspector.svelte`
	 * distingue explícitamente ese caso de "nada seleccionado" (ver su cabecera). Un bloque que el
	 * árbol tiene pero el sitio no reporta (p. ej. `display:none` en la plantilla, o una plantilla
	 * que aún no anota) simplemente no tiene contorno en el lienzo — sigue siendo editable desde
	 * aquí, que es justo el motivo por el que esta lista existe aparte del overlay.
	 *
	 * **Colapsable por debajo de 1180px** (§tarea, mismo punto de corte que `.vega-editor-grid--rail`
	 * de `RecordForm.svelte`, ver su cabecera): a diferencia del raíl de `RecordForm` — que
	 * simplemente DESAPARECE ahí (es una ayuda de navegación, no contenido) — esta lista es la única
	 * vía accesible de seleccionar, así que no puede desaparecer sin más. Por encima del punto de
	 * corte es una columna normal, en flujo; por debajo se convierte en un cajón (`position: fixed`,
	 * mismo patrón de overlay que `Sidebar.svelte`: disparador + fondo + `Escape` cierra y devuelve
	 * el foco) que se abre con el botón "Secciones". El propio botón está `display:none` por encima
	 * del punto de corte, así que `open` nunca llega a `true` en escritorio — no hace falta que el
	 * CSS de escritorio dependa de `open` para nada. Seleccionar una fila CIERRA el cajón (llevarse
	 * de vuelta al lienzo tras elegir es lo que se espera; en escritorio el cierre es un no-op
	 * inofensivo, `open` no gobierna nada ahí).
	 *
	 * **Selección externa → esta lista se desplaza, no se enfoca.** Cuando `selectedId` cambia
	 * porque el autor hizo clic en el LIENZO (`VisualEditorScreen.svelte#handleBlockSelect`), la fila
	 * correspondiente se trae a la vista con `scrollIntoView`. Deliberadamente NO se le da el foco:
	 * mover el foco real por un clic en OTRA superficie (el iframe) sorprendería a quien esté
	 * tecleando en el inspector en ese mismo instante — el resaltado visual (`--tree-row--selected`)
	 * ya dice cuál es, sin robarle el cursor a nadie.
	 */
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import type { BlocksState } from '$lib/form/blocks-state.svelte';

	interface Props {
		/** Instancia ÚNICA de la pantalla (ver cabecera), nunca construida aquí. */
		blocks: BlocksState;
		/** Dueño único: `VisualEditorScreen.svelte#selectedBlockId`. */
		selectedId: string | null;
		/** El autor eligió esta fila. La pantalla decide qué hacer (fijar la selección, avisar al
		 *  lienzo, abrir la ficha) — este componente no conoce ese reparto, solo lo dispara. */
		onSelect: (blockId: string) => void;
	}

	let { blocks, selectedId, onSelect }: Props = $props();
	const ctx = getVegaContext();

	// ————— Cajón responsive (ver cabecera): estado LOCAL, el botón que lo abre solo existe
	// (CSS) por debajo del punto de corte, así que en escritorio `open` nunca cambia de `false`. —————
	let open = $state(false);
	let toggleEl = $state<HTMLElement | null>(null);
	let panelEl = $state<HTMLElement | null>(null);

	function closeDrawer(): void {
		open = false;
	}

	function selectRow(id: string): void {
		onSelect(id);
		closeDrawer(); // ver cabecera: no-op en escritorio, cierra el cajón en móvil/tablet
	}

	/** `Escape` cierra el cajón y devuelve el foco al disparador (mismo criterio que
	 *  `Sidebar.svelte`). Escuchador de ventana en vez de solo del panel: con el foco en cualquier
	 *  fila (no solo en el propio panel) `Escape` debe cerrar igual. */
	function handleWindowKeydown(event: KeyboardEvent): void {
		if (!open || event.key !== 'Escape') return;
		event.preventDefault();
		closeDrawer();
		toggleEl?.focus();
	}

	// Selección que llega de FUERA (clic en el lienzo): trae la fila a la vista sin foco (cabecera).
	// `scrollIntoView` no existe en jsdom (banco de pruebas de componente): `?.()` lo vuelve un
	// no-op ahí en vez de reventar el `$effect`, sin fingir un stub que nadie pediría en producción.
	$effect(() => {
		if (selectedId === null || !panelEl) return;
		const row = panelEl.querySelector(`[data-vega-tree-row="${selectedId}"]`);
		row?.scrollIntoView?.({ block: 'nearest' });
	});

	const headingText = $derived(blocks.childType?.label ?? ctx.t('editor.visual.tree.title'));
</script>

<!-- Sin envoltorio propio (mismo criterio que `Sidebar.svelte`, que tampoco lo lleva): Svelte 5
     admite varios nodos de nivel superior, y un `<div>` extra aquí habría obligado a
     `display: contents` para no romper el auto-placement de `.vega-visual-grid` (grid del padre) —
     más indirección para el mismo resultado. Disparador y fondo quedan `position: fixed` en cuanto
     se activan (ver CSS), así que ninguno de los dos participa del grid del padre: solo
     `.vega-tree-panel` cuenta como celda. -->
<svelte:window onkeydown={handleWindowKeydown} />

<button
	type="button"
	class="vega-tree-toggle"
	bind:this={toggleEl}
	aria-expanded={open}
	aria-controls="vega-block-tree-panel"
	onclick={() => (open = !open)}
>
	<Icon id="menu" size={16} />
	{ctx.t('editor.visual.tree.title')}
</button>

{#if open}
	<!-- Fondo del cajón (mismo patrón que `Sidebar.svelte`): `<button>` decorativo, cierra al
	     clicar fuera del panel. -->
	<button
		type="button"
		class="vega-tree-backdrop"
		tabindex="-1"
		aria-hidden="true"
		onclick={closeDrawer}
	></button>
{/if}

<div
	id="vega-block-tree-panel"
	class="vega-tree-panel"
	class:vega-tree-panel--open={open}
	bind:this={panelEl}
	role="region"
	aria-labelledby="vega-tree-heading"
>
	<div class="vega-tree-head">
		<h2 id="vega-tree-heading">
			{headingText}
			{#if blocks.status.kind === 'ready'}
				<span class="vega-tree-count">{blocks.records.length}</span>
			{/if}
		</h2>
		<button
			type="button"
			class="vega-tree-close"
			aria-label={ctx.t('common.close')}
			onclick={closeDrawer}
		>
			<Icon id="close" size={16} />
		</button>
	</div>

	{#if blocks.hidden}
		<p class="vega-tree-notice" role="alert">{ctx.t('editor.visual.tree.unavailable')}</p>
	{:else if blocks.loading}
		<p class="vega-tree-notice" aria-live="polite">{ctx.t('common.loading')}</p>
	{:else if blocks.records.length === 0}
		<p class="vega-tree-notice">
			{ctx.t('editor.blocks.empty', { label: blocks.childType?.label ?? headingText })}
		</p>
	{:else}
		<ul class="vega-tree-list">
			{#each blocks.records as record (record.id)}
				{@const title = blocks.blockTitle(record)}
				{@const blockType = blocks.blockTypeOf(record)}
				{@const rawType = blocks.blockTypeRawName(record)}
				<li>
					<button
						type="button"
						class="vega-tree-row"
						class:vega-tree-row--selected={record.id === selectedId}
						data-vega-tree-row={record.id}
						aria-current={record.id === selectedId ? 'true' : undefined}
						aria-label={ctx.t('editor.visual.tree.selectLabel', { label: title })}
						onclick={() => selectRow(record.id)}
					>
						{#if blocks.hasTypeColumn}
							{#if blockType}
								<span class="vega-tree-type">
									{#if blockType.icon}<Icon id={blockType.icon} size={12} />{/if}
									{blockType.label}
								</span>
							{:else if rawType}
								<span class="vega-tree-type vega-tree-type--unknown">
									{ctx.t('editor.blocks.type.unknown', { name: rawType })}
								</span>
							{:else}
								<span class="vega-tree-type vega-tree-type--none">
									{ctx.t('editor.blocks.type.none')}
								</span>
							{/if}
						{/if}
						<span class="vega-tree-title">{title}</span>
						{#if blocks.isSaving(record.id)}
							<span class="vega-tree-saving">{ctx.t('editor.saving')}</span>
						{:else if blocks.isDirty(record.id)}
							<span class="vega-tree-dirty" title={ctx.t('editor.dirty')}>
								<span class="vega-visually-hidden">{ctx.t('editor.dirty')}</span>
							</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	/* Disparador del cajón: invisible por encima del punto de corte (ver cabecera, "Colapsable"),
	   así que `open` nunca se activa en escritorio. */
	.vega-tree-toggle {
		display: none;
	}

	.vega-tree-backdrop {
		display: none;
	}

	/* Columna normal, en flujo: llena la celda de la rejilla (`.vega-visual-grid--tree` de
	   `VisualEditorScreen.svelte`) tanto en anchura como en alto — sin `position: sticky`, porque
	   esa rejilla ya ocupa el hueco EXACTO del viewport (a diferencia de `.vega-editor-grid` de
	   `RecordForm.svelte`, que sí hace scroll de página): "pegajoso" no pinta nada aquí, `stretch`
	   (el `align-items` por defecto de la rejilla) ya reparte el alto entero. */
	.vega-tree-panel {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--paper);
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}

	.vega-tree-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		flex-shrink: 0;
		padding: 0.75rem 0.9rem;
		border-bottom: 1px solid var(--line);
	}

	.vega-tree-head h2 {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin: 0;
		font-size: 0.76em;
		font-weight: 650;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ink-3);
		overflow-wrap: anywhere;
	}

	.vega-tree-count {
		font-family: var(--mono);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		color: var(--ink-3);
	}

	/* Solo tiene sentido dentro del cajón (ver cabecera): en escritorio el panel nunca se cierra
	   desde dentro, no hay razón para ofrecer el control. */
	.vega-tree-close {
		display: none;
	}

	.vega-tree-notice {
		margin: 0.75rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-tree-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 0.5rem;
		overflow-y: auto;
	}

	.vega-tree-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		width: 100%;
		min-height: 2.5rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid transparent;
		border-radius: 6px;
		background: transparent;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.vega-tree-row:hover {
		background: var(--active);
	}

	.vega-tree-row:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	/* Mismo lenguaje visual que el item de nav activo (`Sidebar.svelte`, `[aria-current='page']`):
	   fondo + tinta de acento, sin trazo lateral. */
	.vega-tree-row--selected {
		background: var(--accent-soft);
		color: var(--accent-text);
		font-weight: 600;
	}

	.vega-tree-type {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		flex-shrink: 0;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.7em;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.vega-tree-type--none {
		border-style: dashed;
		opacity: 0.75;
		font-weight: 500;
	}

	.vega-tree-type--unknown {
		border-color: var(--warning);
		color: var(--warning);
		font-family: var(--mono);
		font-weight: 500;
	}

	.vega-tree-title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vega-tree-dirty {
		flex-shrink: 0;
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--warning);
		overflow: hidden;
	}

	.vega-tree-saving {
		flex-shrink: 0;
		color: var(--ink-3);
		font-size: 0.72em;
	}

	.vega-visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	/* Objetivo táctil 44×44 (checklist de accesibilidad): solo cuenta con puntero basto — con
	   ratón/trackpad el `min-height: 2.5rem` de arriba ya basta y un target más alto desperdiciaría
	   densidad en la lista. */
	@media (pointer: coarse) {
		.vega-tree-row,
		.vega-tree-toggle,
		.vega-tree-close {
			min-height: 44px;
		}
	}

	/* Por debajo de 1180px (ver cabecera, "Colapsable"): el panel se convierte en un cajón fijo. */
	@media (max-width: 1180px) {
		.vega-tree-toggle {
			display: inline-flex;
			align-items: center;
			gap: 0.4rem;
			position: fixed;
			top: calc(var(--topbar-h) + 0.85rem);
			left: 0.85rem;
			z-index: 6;
			height: 36px;
			padding: 0 0.75rem;
			border: 1px solid var(--line);
			border-radius: var(--r);
			background: var(--surface);
			color: var(--ink);
			font: inherit;
			font-size: 0.8em;
			font-weight: 600;
			box-shadow: var(--shadow-card);
			cursor: pointer;
		}

		.vega-tree-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 7;
			border: 0;
			padding: 0;
			/* Scrim theme-independiente (§3 no tiene token de velo, mismo motivo que
			   `.vega-sidebar-backdrop` de `Sidebar.svelte`) — allowlisted en
			   check-theme-coverage.mjs. */
			background: rgb(15 17 21 / 45%);
			cursor: pointer;
		}

		.vega-tree-close {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			width: 1.8rem;
			height: 1.8rem;
			border: 0;
			border-radius: 6px;
			background: transparent;
			color: var(--ink-2);
			cursor: pointer;
		}

		.vega-tree-close:hover {
			background: var(--active);
		}

		.vega-tree-panel {
			position: fixed;
			top: 0;
			bottom: 0;
			left: 0;
			z-index: 8;
			width: min(320px, 86vw);
			border-radius: 0;
			transform: translateX(-100%);
			transition: transform 0.18s ease;
		}

		.vega-tree-panel--open {
			transform: translateX(0);
		}
	}
</style>
