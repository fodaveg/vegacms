<script lang="ts">
	/**
	 * `RecordBlocks.svelte` (capacidad `blocks`, lote "editor" Fase A, `ResolvedBlocksConfig`):
	 * PRESENTACIÓN de la lista embebida de bloques de un registro — el marcado, el menú "Añadir
	 * bloque" con su gestión de foco y teclado, el controlador de arrastre y el CSS. El ESTADO y las
	 * MUTACIONES (carga, crear, duplicar, borrar, reordenar) viven en `blocks-state.svelte.ts`
	 * (`createBlocksState`): este componente instancia esa fábrica UNA VEZ (`blocks`, más abajo) y
	 * consume sus getters/métodos, nunca reimplementa lógica de dominio.
	 *
	 * Motivo del reparto (ver también la cabecera de `blocks-state.svelte.ts`): el editor visual
	 * (`$lib/visual/VisualEditorScreen.svelte`) va a montar OTRA presentación (árbol de secciones +
	 * inspector) sobre EL MISMO estado de bloques — dos escritores del mismo estado ya se pisaron en
	 * silencio una vez en este repo (el manifiesto de `/settings`), así que un único dueño de estado
	 * con varias presentaciones es la única forma segura de que compartan un padre sin que ninguna
	 * pierda los cambios de la otra.
	 *
	 * Vive en `$lib/form/` (a diferencia de `EditorRail.svelte`, en `$lib/list/`: no pinta enlaces
	 * reales a otra ruta — los bloques no tienen ruta propia, se editan aquí mismo — así que no
	 * necesita la exención de `no-navigation-without-resolve`).
	 *
	 * Dos decisiones de `blocks-state.svelte.ts` tienen consecuencias AQUÍ, documentadas allí en
	 * detalle: la decisión 1 (el reorden persiste al soltar, nunca diferido al guardado del padre)
	 * es por lo que el asa de arrastre nunca participa del guard "sin guardar"; la decisión 2 (un
	 * bloque expandido con ediciones sin guardar cuenta como sucio) es por lo que `blocks.anyDirty`
	 * deshabilita crear/duplicar/reordenar más abajo. `RecordForm` solo necesita saber SI hay algo
	 * sucio aquí abajo (`onDirtyChange`, que `blocks` invoca por su cuenta), no CÓMO se guarda.
	 *
	 * **Estado de cada bloque, siempre MONTADO**: `BlockEditor` de cada fila vive en el DOM aunque
	 * la fila esté plegada (`hidden`, no `{#if}`) — así plegar/desplegar nunca destruye un borrador
	 * a medio escribir (si se destruyera con `{#if}`, colapsar por error tiraría el trabajo sin
	 * avisar, justo lo que el guard de salida existe para evitar). El coste es aceptable: una
	 * landing "hecha de secciones" tiene, en la práctica, pocos bloques (el propio caso de uso del
	 * lote), nunca cientos.
	 *
	 * **Accesibilidad del reorden**: reusa `createReorderDndController`/`computeReorder`
	 * (`$lib/list/reorder-dnd`, `$lib/list/reorder`, el MISMO patrón de `RecordTable`) — el asa
	 * `<button draggable="true">` acepta tanto arrastre como `ArrowUp`/`ArrowDown` sin "agarrar"
	 * antes (mismo comportamiento que el listado). A diferencia de `RecordTable` (que no anuncia
	 * nada), aquí SÍ hay una región `aria-live` (`blocks.announce`, la produce `blocks-state.svelte.ts`
	 * en cada reorden) que anuncia la posición resultante tras CUALQUIER reorden (arrastre o
	 * teclado) — requisito explícito del lote ("anuncio del cambio de posición"): el arrastre por sí
	 * solo no es accesible sin un eco por voz de dónde ha quedado el bloque.
	 */
	import { tick, untrack } from 'svelte';
	import type { RecordId } from '$lib/backend/types';
	import type { ResolvedBlockType, ResolvedContentType } from '$lib/model/types';
	import { getVegaContext } from '$lib/app-context';
	import type { PreviewDraftRecord } from '$lib/backend/preview-client';
	import { createReorderDndController, dropIndicatorEdge } from '$lib/list/reorder-dnd';
	import { hasFileValues } from '$lib/revisions/restore';
	import DeleteConfirm from '$lib/list/DeleteConfirm.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import BlockEditor from './BlockEditor.svelte';
	import { createBlocksState } from './blocks-state.svelte';

	interface Props {
		/** El tipo padre que declara `blocks` (`ResolvedContentType.blocks`, ya validado por P2). */
		parentType: ResolvedContentType;
		/** `model.recordId`: `null` en `/new` — sin id de padre no hay a qué apuntar, ver `notice`
		 *  más abajo. */
		parentId: RecordId | null;
		/** Sube a `true` en cuanto AL MENOS un bloque tenga ediciones sin guardar (decisión 2 de
		 *  `blocks-state.svelte.ts`). */
		onDirtyChange: (dirty: boolean) => void;
		/** Publica la secuencia completa con cada bloque en su estado editable ACTUAL. */
		onDraftChange?: (records: PreviewDraftRecord[]) => void;
		/** Sube el mutex estructural para que el padre no clone una instantánea intermedia. */
		onBusyChange?: (busy: boolean) => void;
		/** Mutex inverso: el padre clona la página y congela todas las mutaciones hijas. */
		disabled?: boolean;
	}

	let {
		parentType,
		parentId,
		onDirtyChange,
		onDraftChange = () => {},
		onBusyChange = () => {},
		disabled = false
	}: Props = $props();

	const ctx = getVegaContext();
	/** Getters, no valores (ver cabecera de `blocks-state.svelte.ts`, "Reactividad de props"):
	 *  `parentId`/`disabled` son props reactivas que cambian tras el montaje (la ruta NO remonta
	 *  este componente al cambiar de registro padre); la fábrica necesita leer su valor VIVO en
	 *  cada punto de una mutación en vuelo, no una foto capturada al instanciarla. */
	const blocks = createBlocksState({
		ctx,
		// Captura DELIBERADA del valor inicial (mismo patrón que la propia fábrica documenta en su
		// cabecera para `parentType`): `untrack` calla el aviso `state_referenced_locally` de
		// svelte-check, que de otro modo trataría esta lectura única como un posible bug.
		parentType: untrack(() => parentType),
		getParentId: () => parentId,
		getDisabled: () => disabled,
		// Reenvío en closure, NO la referencia directa: `onDirtyChange`/`onDraftChange`/
		// `onBusyChange` son props (getters bajo el compilador) y cada llamada debe leer la
		// versión VIVA, no la que había en el instante de montar `blocks`.
		onDirtyChange: (dirty) => onDirtyChange(dirty),
		onDraftChange: (records) => onDraftChange(records),
		onBusyChange: (busy) => onBusyChange(busy)
	});

	// ————— Menú "Añadir bloque" (patrón APG de ListToolbar: click-fuera, Escape y focusout) —————
	let addMenuOpen = $state(false);
	let addTriggerEl = $state<HTMLElement | null>(null);
	let addMenuEl = $state<HTMLElement | null>(null);

	function closeAddMenu(): void {
		addMenuOpen = false;
	}

	/** Los `menuitem` del menú abierto, en orden del DOM. Se consultan en el momento en vez de
	 *  guardarse: el vocabulario no cambia durante un gesto, pero un array de refs paralelo sí se
	 *  desincroniza. */
	function menuItems(): HTMLButtonElement[] {
		return Array.from(addMenuEl?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
	}

	/** Abrir con teclado deja el foco DENTRO del menú, que es lo que espera el patrón APG: si se
	 *  queda en el disparador, `ArrowDown` no recorre nada y solo se llega con `Tab`. */
	function openAddMenu(): void {
		addMenuOpen = true;
		void tick().then(() => menuItems()[0]?.focus());
	}

	/** Navegación APG dentro del menú: flechas CIRCULARES, `Home`/`End` a los extremos. `Escape` no
	 *  se maneja aquí — lo lleva el handler de ventana, que además devuelve el foco al disparador. */
	function handleMenuKeydown(event: KeyboardEvent): void {
		const items = menuItems();
		if (items.length === 0) return;
		const current = items.indexOf(document.activeElement as HTMLButtonElement);
		let next: number | null = null;
		if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
		else if (event.key === 'ArrowUp')
			next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = items.length - 1;
		if (next === null) return;
		event.preventDefault();
		items[next].focus();
	}

	function handleAddWindowClick(event: MouseEvent): void {
		if (!addMenuOpen) return;
		const target = event.target as Node;
		if (addTriggerEl?.contains(target) || addMenuEl?.contains(target)) return;
		closeAddMenu();
	}

	/** `Escape` cierra y DEVUELVE EL FOCO al disparador: sin esto el foco cae a `<body>` y el
	 *  usuario de teclado pierde el sitio (mismo criterio que `ListToolbar`/`Topbar`). */
	function handleAddWindowKeydown(event: KeyboardEvent): void {
		if (!addMenuOpen || event.key !== 'Escape') return;
		event.preventDefault();
		closeAddMenu();
		addTriggerEl?.focus();
	}

	/** El foco sale del menú: se cierra. La condición mira SOLO `addMenuEl` a propósito — si también
	 *  perdonara el disparador, `Shift+Tab` desde el primer elemento devolvería el foco al botón y el
	 *  menú se quedaría abierto con el foco fuera de su `role="menu"`, que es lo que APG prohíbe. El
	 *  tránsito de apertura (disparador → primer elemento) ya entra por `addMenuEl`. */
	function handleAddFocusOut(event: FocusEvent): void {
		if (!addMenuOpen) return;
		const next = event.relatedTarget as Node | null;
		if (next && addMenuEl?.contains(next)) return;
		closeAddMenu();
	}

	/** Elegir un tipo cierra el menú y crea. El foco vuelve al disparador ANTES de crear: la fila
	 *  nueva se monta desplegada y mueve el layout, así que devolverlo después dejaría el foco
	 *  saltando a un elemento que ya se movió. */
	function handleAddType(blockType: ResolvedBlockType): void {
		closeAddMenu();
		addTriggerEl?.focus();
		void blocks.handleCreate(blockType);
	}

	// ————— Arrastre + teclado (reusa `reorder-dnd.ts`, ver cabecera) —————
	let dragState = $state<{ fromIndex: number | null; overIndex: number | null }>({
		fromIndex: null,
		overIndex: null
	});
	const dnd = createReorderDndController(
		(from, to) => void blocks.handleReorder(from, to),
		() => blocks.records.length,
		(state) => (dragState = state)
	);

	/** Destino de foco de reserva de `DeleteConfirm` (su cabecera: el nodo de la fila borrada ya no
	 *  existe tras un borrado con éxito) — la cabecera de la propia tarjeta, `tabindex="-1"`, mismo
	 *  truco que el `<h1>` oculto de `RecordForm`. */
	let headingEl = $state<HTMLElement | null>(null);
</script>

<!-- Nivel superior a la fuerza: `<svelte:window>` no puede vivir dentro de un bloque. No hace
     falta condicionarlo, porque los dos handlers salen pronto si el menú está cerrado. -->
<svelte:window onclick={handleAddWindowClick} onkeydown={handleAddWindowKeydown} />

{#if !blocks.hidden}
	{@const type = blocks.childType!}
	<section class="vega-blocks">
		<div class="vega-blocks-head">
			<h2 bind:this={headingEl} tabindex="-1">
				{type.label}{#if blocks.status.kind === 'ready'}<span class="vega-blocks-count"
						>{blocks.records.length}</span
					>{/if}
			</h2>
			{#if parentId !== null}
				{#if blocks.hasTypeMenu}
					<div class="vega-blocks-add-menu-wrap" onfocusout={handleAddFocusOut}>
						<button
							type="button"
							class="vega-blocks-add"
							bind:this={addTriggerEl}
							aria-haspopup="menu"
							aria-expanded={addMenuOpen}
							aria-controls="vega-blocks-add-menu"
							disabled={disabled || blocks.structuralBusy || blocks.anySaving}
							onclick={() => (addMenuOpen ? closeAddMenu() : openAddMenu())}
						>
							{ctx.t('editor.blocks.add', { label: type.labelSingular })}
							<Icon id="chevron" size={12} />
						</button>
						{#if addMenuOpen}
							<div
								id="vega-blocks-add-menu"
								class="vega-blocks-add-menu"
								role="menu"
								tabindex="-1"
								aria-label={ctx.t('editor.blocks.addMenu.label')}
								bind:this={addMenuEl}
								onkeydown={handleMenuKeydown}
							>
								{#each blocks.blockTypes as blockType (blockType.name)}
									<button
										type="button"
										role="menuitem"
										tabindex="-1"
										class="vega-blocks-add-menu-item"
										onclick={() => handleAddType(blockType)}
									>
										{#if blockType.icon}<Icon id={blockType.icon} size={14} />{/if}
										{blockType.label}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<button
						type="button"
						class="vega-blocks-add"
						disabled={disabled || blocks.structuralBusy || blocks.anySaving}
						onclick={() => blocks.handleCreate()}
					>
						{ctx.t('editor.blocks.add', { label: type.labelSingular })}
					</button>
				{/if}
			{/if}
		</div>

		<div aria-live="polite" class="vega-visually-hidden-live">{blocks.announce}</div>

		{#if parentId === null}
			<p class="vega-blocks-notice">
				{ctx.t('editor.blocks.notice.saveParentFirst', { label: type.label })}
			</p>
		{:else if blocks.loading}
			<p class="vega-blocks-notice" aria-live="polite">{ctx.t('common.loading')}</p>
		{:else if blocks.records.length === 0}
			<p class="vega-blocks-notice">{ctx.t('editor.blocks.empty', { label: type.label })}</p>
		{:else}
			<ul class="vega-blocks-list">
				{#each blocks.records as record, i (record.id)}
					{@const title = blocks.blockTitle(record)}
					{@const expanded = blocks.isExpanded(record.id)}
					{@const dropEdge =
						dragState.overIndex === i
							? dropIndicatorEdge(dragState.fromIndex, dragState.overIndex)
							: null}
					<li
						class="vega-block-row"
						class:vega-block-row--dragging={dragState.fromIndex === i}
						class:vega-block-row--drop-before={dropEdge === 'before'}
						class:vega-block-row--drop-after={dropEdge === 'after'}
						ondragover={(event) => dnd.handleDragOver(event, i)}
						ondrop={(event) => dnd.handleDrop(event, i)}
					>
						<div class="vega-block-header">
							<button
								type="button"
								class="vega-block-handle"
								aria-label={ctx.t('list.reorder.handleLabel', { label: title })}
								disabled={disabled || blocks.structuralBusy || blocks.anySaving || blocks.anyDirty}
								draggable={!disabled &&
									!blocks.structuralBusy &&
									!blocks.anySaving &&
									!blocks.anyDirty}
								ondragstart={(event) => dnd.handleDragStart(event, i)}
								ondragend={dnd.handleDragEnd}
								onkeydown={(event) => dnd.handleHandleKeydown(event, i)}
							>
								<span aria-hidden="true">⠿</span>
							</button>
							{#if blocks.blockDuplicateAllowed}
								<button
									type="button"
									class="vega-block-duplicate"
									disabled={disabled ||
										blocks.anyDirty ||
										blocks.anySaving ||
										blocks.structuralBusy}
									title={blocks.anyDirty ? ctx.t('editor.duplicate.saveFirst') : undefined}
									aria-label={ctx.t('editor.blocks.duplicateLabel', { label: title })}
									onclick={() => blocks.handleDuplicate(record)}
								>
									{blocks.isDuplicating(record.id)
										? ctx.t('editor.duplicating')
										: ctx.t('editor.duplicate')}
								</button>
							{/if}
							<button
								type="button"
								class="vega-block-toggle"
								aria-expanded={expanded}
								aria-controls={`vega-block-body-${record.id}`}
								onclick={() => blocks.toggle(record.id)}
							>
								<span class="vega-block-chevron"><Icon id="chevron" size={14} /></span>
								{#if blocks.hasTypeColumn}
									{@const blockType = blocks.blockTypeOf(record)}
									{@const rawType = blocks.blockTypeRawName(record)}
									{#if blockType}
										<span class="vega-block-type">
											{#if blockType.icon}<Icon id={blockType.icon} size={12} />{/if}
											{blockType.label}
										</span>
									{:else if rawType}
										<!-- El manifiesto ya no declara este tipo, pero el registro existe: se enseña
										     el valor crudo en vez de esconderlo. -->
										<span class="vega-block-type vega-block-type--unknown">
											{ctx.t('editor.blocks.type.unknown', { name: rawType })}
										</span>
									{:else}
										<!-- Columna de tipo vacía: bloque de antes de que existiera el vocabulario. Se
										     dice, no se calla: «cada fila muestra de qué tipo es» incluye «de ninguno». -->
										<span class="vega-block-type vega-block-type--none">
											{ctx.t('editor.blocks.type.none')}
										</span>
									{/if}
								{/if}
								<span class="vega-block-title">{title}</span>
								{#if blocks.isDirty(record.id)}
									<span class="vega-block-dirty" title={ctx.t('editor.dirty')}>
										<span class="vega-visually-hidden">{ctx.t('editor.dirty')}</span>
									</span>
								{/if}
								<span class="vega-visually-hidden">
									{expanded
										? ctx.t('editor.blocks.collapseLabel', { label: title })
										: ctx.t('editor.blocks.expandLabel', { label: title })}
								</span>
							</button>
							<button
								type="button"
								class="vega-block-delete"
								disabled={disabled || blocks.structuralBusy || blocks.anySaving}
								aria-label={ctx.t('list.delete.rowButtonLabel', { label: title })}
								onclick={() => blocks.requestDelete(record)}
							>
								{ctx.t('list.delete.rowButton')}
							</button>
						</div>
						<!-- SIEMPRE montado (ver cabecera): `hidden`, no `{#if}` — un borrador a medio
						     escribir sobrevive a plegar/desplegar la fila. -->
						<div id={`vega-block-body-${record.id}`} class="vega-block-body" hidden={!expanded}>
							<BlockEditor
								childType={type}
								blockType={blocks.blockTypeOf(record)}
								rawBlockType={blocks.blockTypeRawName(record)}
								dataField={blocks.blocksConfig!.dataField}
								{record}
								structuralFields={blocks.structuralFields}
								onSubmit={(input) => ctx.port.update(type.name, record.id, input)}
								onSaved={(saved) => blocks.handleBlockSaved(record.id, saved)}
								onDirtyChange={(dirty) => blocks.setDirty(record.id, dirty)}
								onDraftChange={(draft) => blocks.handleBlockDraftChange(record.id, draft)}
								disabled={disabled || blocks.structuralBusy}
								onBusyChange={(saving) => blocks.setSaving(record.id, saving)}
							/>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- `targetCollection`/`targetId` (`#lote-integridad`, Fase A): el bloque a borrar es un registro
	     de la colección HIJA, así que la colección se lee del propio registro (`record.type`) y no de
	     `parentType` — borrar un bloque puede romper referencias igual que borrar cualquier otro
	     registro. -->
	<DeleteConfirm
		open={blocks.pendingDelete !== null}
		recordLabel={blocks.pendingDelete ? blocks.blockTitle(blocks.pendingDelete) : ''}
		targetCollection={blocks.pendingDelete?.type ?? ''}
		targetId={blocks.pendingDelete?.id ?? null}
		deleting={blocks.deleting}
		fallbackFocusEl={headingEl}
		hasFiles={blocks.pendingDelete !== null &&
			blocks.childType !== null &&
			hasFileValues(blocks.childType.schema.fields, blocks.pendingDelete.values)}
		onConfirm={blocks.confirmDelete}
		onCancel={() => blocks.cancelDelete()}
	/>
{/if}

<style>
	.vega-blocks {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--paper);
		box-shadow: var(--shadow-card);
		padding: var(--pad-card);
		min-width: 0;
	}

	.vega-blocks-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	/* Mismo rótulo de tarjeta que `.vega-fsection h2` (`RecordForm.svelte`): versalita tenue, un
	   solo criterio de cabecera de tarjeta en todo el editor. */
	.vega-blocks-head h2 {
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

	.vega-blocks-count {
		font-family: var(--mono);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		color: var(--ink-3);
	}

	/* El wrap es el ancla de posicionamiento del menú, y por eso es `relative`: sin él, el
	   `absolute` del menú se resolvería contra el primer ancestro posicionado, que está fuera de
	   esta sección. */
	.vega-blocks-add-menu-wrap {
		position: relative;
		flex-shrink: 0;
	}

	.vega-blocks-add-menu {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		z-index: 10;
		display: flex;
		flex-direction: column;
		min-width: 11rem;
		padding: 0.3rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}

	.vega-blocks-add-menu-item {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		border: 0;
		background: none;
		padding: 0.45rem 0.6rem;
		border-radius: 6px;
		color: var(--ink);
		font: inherit;
		font-size: 0.85rem;
		text-align: left;
		cursor: pointer;
		white-space: nowrap;
	}

	.vega-blocks-add-menu-item:hover,
	.vega-blocks-add-menu-item:focus-visible {
		background: var(--active);
	}

	.vega-block-type {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		flex-shrink: 0;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		font-size: 0.72em;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	/* Un tipo que el manifiesto ya no declara: se ve, pero se ve DISTINTO. */
	.vega-block-type--none {
		border-style: dashed;
		opacity: 0.75;
		font-weight: 500;
	}

	.vega-block-type--unknown {
		border-color: var(--warning);
		color: var(--warning);
		font-family: var(--mono);
		font-weight: 500;
	}

	.vega-blocks-add {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		flex-shrink: 0;
		height: 32px;
		padding: 0 0.75rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		font-size: 0.8em;
		font-weight: 600;
		cursor: pointer;
	}

	.vega-blocks-add:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-blocks-add:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.vega-blocks-notice {
		margin: 0;
		padding: 0.6rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-blocks-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-block-row {
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		position: relative;
	}

	/* Indicador de destino del arrastre (mismo lenguaje que `.vega-row-drop-*` de `RecordTable`):
	   un hueco de color en el borde de la fila sobrevolada, ANTES o DESPUÉS según el sentido. */
	.vega-block-row--drop-before::before,
	.vega-block-row--drop-after::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--accent);
	}

	.vega-block-row--drop-before::before {
		top: -0.35rem;
	}

	.vega-block-row--drop-after::after {
		bottom: -0.35rem;
	}

	.vega-block-row--dragging {
		opacity: 0.5;
	}

	.vega-block-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.6rem;
	}

	.vega-block-handle {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--ink-3);
		cursor: grab;
		touch-action: none;
	}

	.vega-block-handle:hover {
		background: var(--active);
		color: var(--ink);
	}

	.vega-block-handle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.vega-block-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
		padding: 0.2rem 0.3rem;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.vega-block-toggle:hover {
		background: var(--active);
	}

	.vega-block-toggle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	/* El set de iconos apunta a la derecha (mismo motivo que `.vega-editor-back` de `RecordForm`):
	   plegado apunta a la derecha, desplegado gira 90° hacia abajo. */
	.vega-block-chevron {
		display: inline-flex;
		flex-shrink: 0;
	}

	.vega-block-chevron :global(svg) {
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}

	/* ACOTADA al chevron a propósito: cuando esto alcanzaba a cualquier `svg` descendiente, el
	   icono del TIPO de bloque giraba 90° al desplegar la fila. */
	.vega-block-toggle[aria-expanded='true'] .vega-block-chevron :global(svg) {
		transform: rotate(90deg);
	}

	.vega-block-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 550;
	}

	.vega-block-dirty {
		flex-shrink: 0;
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--warning);
		overflow: hidden;
	}

	.vega-block-duplicate,
	.vega-block-delete {
		flex-shrink: 0;
		height: 1.8rem;
		padding: 0 0.6rem;
		border: 1px solid transparent;
		border-radius: 6px;
		background: transparent;
		color: var(--danger);
		font: inherit;
		font-size: 0.78em;
		font-weight: 600;
		cursor: pointer;
	}

	.vega-block-duplicate {
		color: var(--ink-2);
	}

	.vega-block-duplicate:hover:not(:disabled) {
		background: var(--active);
		color: var(--ink);
	}

	.vega-block-duplicate:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.vega-block-delete:hover {
		background: var(--danger-soft);
	}

	@media (pointer: coarse) {
		.vega-block-handle,
		.vega-block-duplicate,
		.vega-block-delete {
			min-width: 44px;
			min-height: 44px;
		}
	}

	.vega-block-body {
		padding: 0 0.75rem 0.75rem 2.3rem;
	}

	/* Región `aria-live` del anuncio de reorden (ver cabecera): SIEMPRE en el árbol de
	   accesibilidad, invisible en pantalla — misma técnica `.vega-visually-hidden` que el resto
	   del editor, pero con un nombre propio: esta clase, a diferencia de las demás de este
	   fichero, se aplica a un elemento que NUNCA debe verse ni ocupar espacio. */
	.vega-visually-hidden-live {
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
</style>
