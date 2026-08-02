<script lang="ts">
	/**
	 * `VisualBlockTree.svelte` (tarea "árbol de secciones y el inspector", ampliada por la tarea
	 * "acciones estructurales desde el editor visual"): columna IZQUIERDA del editor visual — una
	 * fila por bloque del registro, en su orden, con el título y el tipo. Además de SELECCIONAR,
	 * esta lista es ahora la vía que MANDA para las cuatro acciones estructurales (§encargo: "esta
	 * es la vía ACCESIBLE y es la que manda") — crear, duplicar, borrar y mover arriba/abajo. Las
	 * cuatro siguen viviendo, en NÚCLEO, solo en `blocks-state.svelte.ts` (`handleCreate`/
	 * `handleDuplicate`/`requestDelete`+`confirmDelete`/`handleReorder`): este componente no
	 * reimplementa ninguna, solo las llama y pinta su resultado — mismo reparto que
	 * `RecordBlocks.svelte`, que es de donde sale el patrón de cada botón (menú de tipos,
	 * confirmación de borrado, guardas de `structuralBusy`/`anySaving`/`anyDirty`).
	 *
	 * **Sin asa de arrastre, a propósito.** `RecordBlocks.svelte` reordena con
	 * `createReorderDndController` (arrastre nativo + flechas de teclado en la misma asa); el
	 * encargo de esta tarea pide en su lugar "mover arriba/abajo" como botones — dos controles por
	 * fila en vez de una asa con dos modos. Se sigue ese enunciado tal cual: más barato que meter
	 * arrastre en una tercera superficie (lienzo, árbol, y ahora encima drag-and-drop) y el
	 * resultado es el mismo `handleReorder(fromIndex, toIndex)` que ya usa el asa, así que no hay
	 * un segundo camino de persistencia que mantener sincronizado.
	 *
	 * **Vista previa en vivo tras cada mutación estructural.** El lienzo es un `<iframe>` de otro
	 * origen (`VisualEditorScreen.svelte`, cabecera): crear/duplicar/borrar/mover un bloque no lo
	 * repinta solo, hay que pedir un token de vista previa NUEVO para que el marco recargue con el
	 * cambio dentro. `onStructuralChange` es ese aviso — la pantalla lo cablea a `requestPreview()`,
	 * el MISMO camino que `VisualInspector.svelte#onBlockSaved` ya usa para guardar un campo (ver
	 * su cabecera). Se llama tras cada `await` a una mutación de `blocks-state.svelte.ts`,
	 * incondicionalmente para crear/duplicar/borrar (esas tres devuelven `Promise<void>`, sin señal
	 * de si de verdad cambiaron algo: un fallo reportado por `ctx.feedback` seguido de un refresco
	 * que no cambia nada visible es el precio aceptado, mismo criterio que el resto de este módulo
	 * usa para "barato y honesto" sobre "perfecto") y solo si `handleReorder` devuelve `true` para
	 * mover (esa sí trae la señal, úsala).
	 *
	 * **La confirmación de borrado vive AQUÍ**, aunque quien la dispare pueda ser esta lista o la
	 * barra flotante del lienzo (`VisualOverlay.svelte`, misma instancia de `blocks` compartida):
	 * las dos llaman a `blocks.requestDelete(record)`, que escribe `blocks.pendingDelete` —un solo
	 * dato, un solo dueño (el propio `blocks-state.svelte.ts`)—, así que basta con UN
	 * `<DeleteConfirm>` en todo el árbol de componentes de la pantalla para que sirva a las dos
	 * superficies. Vive en este componente (y no en `VisualEditorScreen.svelte`) porque este es el
	 * dueño del árbol de secciones, que es la vía accesible que manda. Su `fallbackFocusEl` (a
	 * dónde va el foco cuando el borrado se lleva por delante el botón que lo disparó) es un ancla
	 * PROPIA fuera de `.vega-tree-panel`, no la cabecera del panel: ver su comentario en el
	 * marcado, y el bloque D2 de más abajo, para por qué cualquier nodo de DENTRO del panel deja
	 * de servir desde que el cajón cerrado es `visibility: hidden`.
	 *
	 * **Un solo dueño del estado, otra presentación más** (mismo reparto que `RecordBlocks.svelte`,
	 * ver la cabecera de `blocks-state.svelte.ts`): `blocks` llega como PROP, ya construido por
	 * `VisualEditorScreen.svelte` con `createBlocksState()` — este componente no instancia la
	 * fábrica ni una segunda vez ("un solo `createBlocksState` por pantalla" es un requisito del
	 * lote, no una preferencia de estilo).
	 *
	 * **Ids: el árbol trabaja con registros de PocketBase, el sitio con `data-vega-block-id`.** El
	 * contrato asume que el sitio anota cada bloque con el id de SU registro (`bridge-client.ts`,
	 * `VisualBlock.id`), así que casan por igualdad de string sin traducción. Si algún día no
	 * casaran —un bloque que el sitio reporta pero el árbol no tiene, o al revés— cada mitad lo dice
	 * por su cuenta: este árbol simplemente no resalta nada si `selectedId` no está entre
	 * `blocks.records` (nunca selecciona "la fila más parecida"), y `VisualInspector.svelte`
	 * distingue explícitamente ese caso de "nada seleccionado" (ver su cabecera). Un bloque que el
	 * árbol tiene pero el sitio no reporta (p. ej. `display:none` en la plantilla, o una plantilla
	 * que aún no anota) simplemente no tiene contorno en el lienzo — sigue siendo editable y
	 * MUTABLE desde aquí, que es justo el motivo por el que esta lista existe aparte del overlay.
	 *
	 * **Colapsable por debajo de 1180px** (§tarea, mismo punto de corte que `.vega-editor-grid--rail`
	 * de `RecordForm.svelte`, ver su cabecera): a diferencia del raíl de `RecordForm` — que
	 * simplemente DESAPARECE ahí (es una ayuda de navegación, no contenido) — esta lista es la única
	 * vía accesible de seleccionar Y de mutar, así que no puede desaparecer sin más. Por encima del
	 * punto de corte es una columna normal, en flujo; por debajo se convierte en un cajón
	 * (`position: fixed`, mismo patrón de overlay que `Sidebar.svelte`: disparador + fondo +
	 * `Escape` cierra y devuelve el foco) que se abre con el botón "Secciones". El propio botón
	 * está `display:none` por encima del punto de corte, así que `open` nunca llega a `true` en
	 * escritorio — no hace falta que el CSS de escritorio dependa de `open` para nada. Seleccionar
	 * una fila CIERRA el cajón (llevarse de vuelta al lienzo tras elegir es lo que se espera; en
	 * escritorio el cierre es un no-op inofensivo, `open` no gobierna nada ahí); una acción
	 * estructural (crear/duplicar/borrar/mover) NO lo cierra — el autor puede querer encadenar
	 * varias sin reabrir el cajón cada vez.
	 *
	 * **Cerrado, el cajón sale del orden de tabulación (encargo de accesibilidad, D2).** El cierre
	 * es un `transform: translateX(-100%)` (ver el CSS del `@media`), y un `transform` NO saca nada
	 * de la tabulación: sin más, con el cajón cerrado todas las filas, los botones de acción y
	 * "Añadir" seguían siendo tabulables, fuera de la pantalla — quien navegue con teclado tabulaba
	 * a controles invisibles. El CSS del `@media` añade `.vega-tree-panel { visibility: hidden }` +
	 * `.vega-tree-panel--open { visibility: visible }`, que sí saca del orden; la consecuencia que
	 * hay que cubrir en el propio componente es que `selectRow()` llama a `closeDrawer()`, así que
	 * seleccionar una fila con el cajón abierto cerraría el panel con el foco todavía puesto en ese
	 * botón — con `visibility: hidden` eso se llevaría el foco a `<body>` sin avisar, la MISMA
	 * landmine que D1 arregla en `VisualInspector.svelte`. `selectRow()` por eso devuelve el foco al
	 * disparador (`toggleEl?.focus()`, mismo criterio que `handleWindowKeydown` con `Escape`), y
	 * solo si el cajón estaba abierto — en escritorio `open` nunca es `true`, así que ahí no pasa
	 * nada. La SEGUNDA consecuencia, menos evidente y por eso con test propio: la región
	 * `aria-live` de los anuncios tuvo que salir del panel, o el cajón cerrado la deja muda (ver el
	 * comentario de esa región en el marcado, y `.vega-tree-close` en el bloque de puntero basto,
	 * que es el otro control al que este cajón le deja un objetivo táctil corto).
	 *
	 * **Selección externa → esta lista se desplaza, no se enfoca.** Cuando `selectedId` cambia
	 * porque el autor hizo clic en el LIENZO (`VisualEditorScreen.svelte#handleBlockSelect`), la fila
	 * correspondiente se trae a la vista con `scrollIntoView`. Deliberadamente NO se le da el foco:
	 * mover el foco real por un clic en OTRA superficie (el iframe) sorprendería a quien esté
	 * tecleando en el inspector en ese mismo instante — el resaltado visual (`--tree-row--selected`)
	 * ya dice cuál es, sin robarle el cursor a nadie.
	 *
	 * **La paleta de bloques arrastrable sustituye al menú "Añadir Sección ›" (encargo "paleta de
	 * bloques arrastrable del editor visual", decisión 1, cerrada con David).** Con
	 * `blocks.hasTypeMenu`, ese botón+menú (el que preguntaba el tipo) SE RETIRA en el mismo commit
	 * que trae `VisualPalette.svelte`: quedan dos vías con papeles distintos —la paleta (arrastrar o
	 * activar por teclado, siempre crea) y el `+` de los puntos de inserción del lienzo (siempre
	 * inserta EN POSICIÓN)—, no tres solapadas. Sin menú de tipos (`hasTypeMenu === false`, decisión
	 * 4), nada de esto cambia: sigue el botón "Añadir" simple de siempre, y la paleta ni se pinta
	 * (ver la cabecera de `VisualPalette.svelte`).
	 *
	 * **La paleta se instancia DENTRO de `.vega-tree-panel`, arriba del árbol (decisión 2).** Es el
	 * mismo cajón que se abre/cierra en pantallas estrechas (ver D2 arriba): colgarla fuera lo
	 * dejaría fuera del cajón en móvil/tablet, tabulable sobre el lienzo con el cajón cerrado —el
	 * mismo antipatrón que D2 ya arregló para el resto de controles de este panel. El panel pasa a
	 * tener DOS regiones (`role="region"`/`aria-labelledby`), cada una con su propio `<h2>` —la de
	 * la paleta (`VisualPalette.svelte`) y la de las secciones (`.vega-tree-region`, más abajo, que
	 * es la que antes ocupaba TODO `.vega-tree-panel`)— en vez de una sola región cubriendo las dos,
	 * que mentiría sobre qué contiene. El propio `.vega-tree-panel` deja de llevar `role="region"`:
	 * ahora es solo el contenedor del cajón (CSS de abrir/cerrar + destino de
	 * `aria-controls="vega-block-tree-panel"` del disparador), las DOS regiones de verdad viven
	 * dentro de él.
	 *
	 * **Dueño del arrastre de paleta en vuelo: `VisualEditorScreen.svelte` (decisión 5).** Este
	 * componente no guarda ese estado, solo REENVÍA los dos callbacks de `VisualPalette.svelte`
	 * (`onPaletteDragStart`/`onPaletteDragEnd`) tal cual los recibe por prop — mismo criterio de "un
	 * solo escritor" que `selectedBlockId` (ver la cabecera de `VisualEditorScreen.svelte`).
	 */
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import DeleteConfirm from '$lib/list/DeleteConfirm.svelte';
	import { hasFileValues } from '$lib/revisions/restore';
	import VisualPalette from './VisualPalette.svelte';
	import type { BlocksState } from '$lib/form/blocks-state.svelte';
	import type { ResolvedBlockType } from '$lib/model/types';
	import type { VegaRecord } from '$lib/backend';

	interface Props {
		/** Instancia ÚNICA de la pantalla (ver cabecera), nunca construida aquí. */
		blocks: BlocksState;
		/** Dueño único: `VisualEditorScreen.svelte#selectedBlockId`. */
		selectedId: string | null;
		/** El autor eligió esta fila. La pantalla decide qué hacer (fijar la selección, avisar al
		 *  lienzo, abrir la ficha) — este componente no conoce ese reparto, solo lo dispara. */
		onSelect: (blockId: string) => void;
		/** Una mutación estructural (crear/duplicar/borrar/mover) acaba de completarse: la pantalla
		 *  pide un token de vista previa nuevo (ver cabecera). */
		onStructuralChange: () => void;
		/** Reenviados tal cual a `VisualPalette.svelte` (ver cabecera, "Dueño del arrastre de
		 *  paleta en vuelo"): el dueño del estado es `VisualEditorScreen.svelte`, este componente
		 *  solo hace de tubería. */
		onPaletteDragStart: (blockType: ResolvedBlockType) => void;
		onPaletteDragEnd: () => void;
	}

	let {
		blocks,
		selectedId,
		onSelect,
		onStructuralChange,
		onPaletteDragStart,
		onPaletteDragEnd
	}: Props = $props();
	const ctx = getVegaContext();

	// ————— Cajón responsive (ver cabecera): estado LOCAL, el botón que lo abre solo existe
	// (CSS) por debajo del punto de corte, así que en escritorio `open` nunca cambia de `false`. —————
	let open = $state(false);
	let toggleEl = $state<HTMLElement | null>(null);
	let panelEl = $state<HTMLElement | null>(null);
	/** Destino de foco de reserva de `DeleteConfirm` (ver cabecera, "La confirmación de borrado
	 *  vive AQUÍ"). Es un ancla PROPIA, fuera de `.vega-tree-panel`, no la cabecera del panel: ver
	 *  su comentario en el marcado para el porqué (el cajón cerrado la dejaría inerte). */
	let fallbackFocusEl = $state<HTMLElement | null>(null);

	function closeDrawer(): void {
		open = false;
	}

	function selectRow(id: string): void {
		// Capturado ANTES de `closeDrawer()` (ver cabecera, D2 del encargo de accesibilidad): en
		// escritorio `open` nunca es `true`, así que `wasOpen` es siempre `false` ahí y la línea de
		// abajo no hace nada — el `visibility: hidden` del cajón cerrado (ver el CSS) SÍ saca el
		// panel del orden de tabulación, así que cerrarlo con el foco en la fila recién pulsada se
		// lo llevaría a `<body>` sin este `focus()` explícito.
		const wasOpen = open;
		onSelect(id);
		closeDrawer(); // ver cabecera: no-op en escritorio, cierra el cajón en móvil/tablet
		if (wasOpen) toggleEl?.focus();
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

	/** Crea, y solo entonces avisa (ver cabecera, "Vista previa en vivo tras cada mutación"). Con
	 *  menú de tipos, la vía de crear ya no es este componente (ver cabecera, decisión 1): esta
	 *  función solo sigue viva para la rama SIN menú (`onclick={() => void createBlock(null)}` más
	 *  abajo), que crea directo sin preguntar nada. */
	async function createBlock(blockType: ResolvedBlockType | null): Promise<void> {
		await blocks.handleCreate(blockType);
		onStructuralChange();
	}

	// ————— Acciones por fila (ver cabecera) —————

	async function duplicateBlock(record: VegaRecord): Promise<void> {
		await blocks.handleDuplicate(record);
		onStructuralChange();
	}

	/** `handleReorder` SÍ trae señal de éxito (a diferencia de crear/duplicar/borrar, ver cabecera):
	 *  solo se pide vista previa nueva si de verdad cambió algo. */
	async function moveBlock(fromIndex: number, toIndex: number): Promise<void> {
		const moved = await blocks.handleReorder(fromIndex, toIndex);
		if (moved) onStructuralChange();
	}

	/** `onConfirm` de `<DeleteConfirm>`: confirma en `blocks-state.svelte.ts` y SOLO entonces pide
	 *  vista previa nueva. La limpieza de una selección colgada (si el bloque borrado era el
	 *  seleccionado) NO se hace aquí: `VisualEditorScreen.svelte` ya la hace dentro del `onState`
	 *  del puente, cuando el sitio recargado deja de reportar ese id (ver su cabecera) — un segundo
	 *  escritor de `selectedBlockId` aquí sería justo el bug de "dos efectos, un solo estado" que
	 *  ese módulo evita a propósito. */
	async function confirmDeleteAndRefresh(): Promise<void> {
		await blocks.confirmDelete();
		onStructuralChange();
	}
</script>

<!-- Nivel superior a la fuerza: `<svelte:window>` no puede vivir dentro de un bloque. No hace
     falta condicionarlo: el propio handler sale pronto si el cajón está cerrado. -->
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

<!-- Anuncio por voz del reorden Y de la selección (ver la cabecera de `blocks-state.svelte.ts`):
     la MISMA región que monta `RecordBlocks.svelte`, sobre el MISMO `blocks.announce`.

     **Vive FUERA de `.vega-tree-panel`, y eso es un requisito, no una colocación cualquiera.**
     Estuvo dentro del panel hasta que D2 (ver cabecera, "Cerrado, el cajón sale del orden de
     tabulación") le puso `visibility: hidden` al cajón cerrado: un lector de pantalla NO lee el
     contenido de un subárbol `visibility: hidden`, así que entre 901 y 1180 px de ancho —la banda
     en la que el lienzo sigue activo (`NARROW_QUERY`, 900 px, de `VisualEditorScreen.svelte`) y el
     árbol YA es un cajón (`TREE_QUERY`, 1180 px)— con el cajón cerrado, que es su estado normal,
     los anuncios se quedaban MUDOS. Y no solo el de la selección que estrena D3: también el del
     reorden, que funcionaba desde antes y se habría roto en silencio. Seleccionar y mover siguen
     siendo posibles ahí sin abrir el cajón (clic en el lienzo, barra flotante del contorno,
     `Alt+↑`/`Alt+↓`), así que la región tiene que estar donde ningún estado del cajón la apague.
     Si algún día se mueve de vuelta dentro del panel, esto vuelve. -->
<div aria-live="polite" class="vega-visually-hidden">{blocks.announce}</div>

<!-- Ancla de foco de reserva de `<DeleteConfirm>` (ver cabecera, "La confirmación de borrado vive
     AQUÍ"). Mismo patrón que `RecordForm.svelte` con su `<h1 class="vega-visually-hidden"
     tabindex="-1">`: un destino que NO se ve pero SÍ se puede enfocar (`.vega-visually-hidden`
     recorta con `clip`, nunca con `display`/`visibility`, así que el nodo sigue siendo enfocable).

     **Fuera de `.vega-tree-panel`, por el mismo motivo que la región `aria-live` de aquí arriba.**
     Antes era la cabecera del panel (`#vega-tree-heading`), que funcionaba mientras el cajón
     cerrado solo se apartaba con `transform`. Desde que D2 lo cierra con `visibility: hidden` (ver
     cabecera), cualquier nodo de dentro deja de ser enfocable con el cajón cerrado, y `.focus()`
     sobre él es un no-op MUDO: el foco se iría a `<body>`. Y ese es un camino real, no teórico —
     `DeleteConfirm` usa este destino justo cuando el borrado tuvo éxito y se llevó por delante el
     botón que lo disparó, y borrar se puede pedir sin abrir el cajón desde la papelera de la barra
     flotante del lienzo (`VisualOverlay.svelte`) o con `Supr`/`Retroceso`
     (`VisualEditorScreen.svelte`). El texto de dentro es lo que oirá quien use lector de pantalla
     al aterrizar aquí, así que dice DÓNDE está, no un rótulo vacío. -->
<div bind:this={fallbackFocusEl} class="vega-visually-hidden" tabindex="-1">
	{ctx.t('editor.visual.tree.title')}
</div>

<div
	id="vega-block-tree-panel"
	class="vega-tree-panel"
	class:vega-tree-panel--open={open}
	bind:this={panelEl}
>
	<!-- Paleta de bloques arrastrable (ver cabecera): región PROPIA, con su propio encabezado — el
	     panel pasa a tener DOS regiones (paleta y secciones), no una sola cubriendo las dos. No se
	     pinta en modo homogéneo (`hasTypeMenu === false`, ver la cabecera de `VisualPalette.svelte`). -->
	<VisualPalette
		{blocks}
		{onStructuralChange}
		onDragStart={onPaletteDragStart}
		onDragEnd={onPaletteDragEnd}
	/>

	<div class="vega-tree-region" role="region" aria-labelledby="vega-tree-heading">
		<div class="vega-tree-head">
			<h2 id="vega-tree-heading">
				{headingText}
				{#if blocks.status.kind === 'ready'}
					<span class="vega-tree-count">{blocks.records.length}</span>
				{/if}
			</h2>
			{#if !blocks.hidden && !blocks.hasTypeMenu}
				<!-- Con menú de tipos, este botón se retira (decisión 1, ver cabecera): la paleta de
				     arriba es la vía que pregunta el tipo. Sin menú (modo homogéneo), sigue creando
				     directo, exactamente como antes de este encargo. -->
				<button
					type="button"
					class="vega-tree-add"
					disabled={blocks.structuralBusy || blocks.anySaving}
					onclick={() => void createBlock(null)}
				>
					{ctx.t('editor.blocks.add', { label: blocks.childType?.labelSingular ?? headingText })}
				</button>
			{/if}
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
				{#each blocks.records as record, i (record.id)}
					{@const title = blocks.blockTitle(record)}
					{@const blockType = blocks.blockTypeOf(record)}
					{@const rawType = blocks.blockTypeRawName(record)}
					{@const structuralGuard = blocks.anyDirty || blocks.anySaving || blocks.structuralBusy}
					<li class="vega-tree-item">
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

						<!-- Acciones estructurales de ESTA fila (ver cabecera): nombre accesible por botón que
					     dice sobre QUÉ sección actúa, nunca un rótulo suelto repetido N veces. -->
						<div class="vega-tree-actions">
							{#if blocks.blockDuplicateAllowed}
								<button
									type="button"
									class="vega-tree-action"
									disabled={structuralGuard}
									aria-label={ctx.t('editor.blocks.duplicateLabel', { label: title })}
									onclick={() => void duplicateBlock(record)}
								>
									<Icon id="copy" size={14} />
								</button>
							{/if}
							<button
								type="button"
								class="vega-tree-action"
								disabled={i === 0 || structuralGuard}
								aria-label={ctx.t('editor.blocks.moveUpLabel', { label: title })}
								onclick={() => void moveBlock(i, i - 1)}
							>
								<span class="vega-tree-action-icon vega-tree-action-icon--up">
									<Icon id="chevron" size={14} />
								</span>
							</button>
							<button
								type="button"
								class="vega-tree-action"
								disabled={i === blocks.records.length - 1 || structuralGuard}
								aria-label={ctx.t('editor.blocks.moveDownLabel', { label: title })}
								onclick={() => void moveBlock(i, i + 1)}
							>
								<span class="vega-tree-action-icon vega-tree-action-icon--down">
									<Icon id="chevron" size={14} />
								</span>
							</button>
							<button
								type="button"
								class="vega-tree-action vega-tree-action--danger"
								disabled={blocks.anySaving || blocks.structuralBusy}
								aria-label={ctx.t('list.delete.rowButtonLabel', { label: title })}
								onclick={() => blocks.requestDelete(record)}
							>
								<Icon id="trash" size={14} />
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<!-- `targetCollection`/`targetId` (`#lote-integridad`, Fase A): el bloque a borrar es un registro
     de la colección HIJA, así que la colección se lee del propio registro (`record.type`) y no de
     `blocks.childType` — borrar un bloque puede romper referencias igual que borrar cualquier otro
     registro. Mismo diálogo, mismos props que `RecordBlocks.svelte`, ver cabecera de este fichero
     para por qué vive aquí y no en `VisualEditorScreen.svelte` ni duplicado en `VisualOverlay`. -->
<DeleteConfirm
	open={blocks.pendingDelete !== null}
	recordLabel={blocks.pendingDelete ? blocks.blockTitle(blocks.pendingDelete) : ''}
	targetCollection={blocks.pendingDelete?.type ?? ''}
	targetId={blocks.pendingDelete?.id ?? null}
	deleting={blocks.deleting}
	{fallbackFocusEl}
	hasFiles={blocks.pendingDelete !== null &&
		blocks.childType !== null &&
		hasFileValues(blocks.childType.schema.fields, blocks.pendingDelete.values)}
	onConfirm={confirmDeleteAndRefresh}
	onCancel={() => blocks.cancelDelete()}
/>

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

	/* Región de las SECCIONES (ver cabecera, "La paleta se instancia DENTRO..."): antes era
	   `.vega-tree-panel` la que llevaba `role="region"` y ocupaba ella misma todo el alto
	   disponible; ahora es una de DOS hermanas dentro de él (la otra es `.vega-palette-panel` de
	   `VisualPalette.svelte`, con `flex-shrink: 0`), así que esta es la que crece para llenar el
	   resto — mismo criterio de columna flexible que tenía `.vega-tree-panel` antes de esta tarea. */
	.vega-tree-region {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.vega-tree-head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
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

	/* Botón "Añadir" simple (modo homogéneo, sin menú de tipos — ver cabecera, decisión 1: con menú
	   de tipos este botón se retira y la paleta ocupa su lugar): mismo lenguaje visual que
	   `.vega-blocks-add*` de `RecordBlocks.svelte` (ver su cabecera), solo con el prefijo
	   `vega-tree-` de este fichero. */
	.vega-tree-add {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		flex-shrink: 0;
		height: 32px;
		padding: 0 0.7rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		font-size: 0.78em;
		font-weight: 600;
		cursor: pointer;
	}

	.vega-tree-add:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-tree-add:disabled {
		cursor: not-allowed;
		opacity: 0.5;
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

	/* Fila = botón de selección (crece) + acciones (ancho fijo), lado a lado — antes de esta tarea
	   `<li>` contenía solo el botón de selección a ancho completo. */
	.vega-tree-item {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		width: 100%;
	}

	.vega-tree-row {
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
		flex-wrap: wrap;
		gap: 0.4rem;
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

	/* `min-width` en `ch`, no `0`, y ese es TODO el arreglo del título que salía cortado a «Esc…».
	   La fila ya llevaba `flex-wrap: wrap` para esto, pero no servía de nada: con `min-width: 0` el
	   título puede encogerse hasta cero, así que nunca deja de caber y por tanto nunca envuelve —
	   se comprimía contra la insignia de tipo hasta quedar en tres letras y un puntito. Con un
	   mínimo legible, cuando insignia y título no caben juntos el título se va ENTERO a la línea de
	   abajo, que es lo que ya hacía falta desde que las secciones tienen tipo (antes no había
	   insignia porque no había vocabulario, así que el título tenía la fila para él solo).
	   La elipsis se queda para el caso de un título largo de verdad, que ninguna anchura arregla. */
	.vega-tree-title {
		flex: 1;
		min-width: 14ch;
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

	/* Acciones de fila (duplicar/subir/bajar/borrar): iconos-solo, mismo tamaño de objetivo que el
	   asa de arrastre de `RecordBlocks.svelte` (`.vega-block-handle`) — icono decorativo, el nombre
	   accesible lo lleva el propio `<button>` (`aria-label`), nunca el `title` de `Icon`. */
	.vega-tree-actions {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		flex-shrink: 0;
	}

	.vega-tree-action {
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
		cursor: pointer;
	}

	.vega-tree-action:hover:not(:disabled) {
		background: var(--active);
		color: var(--ink);
	}

	.vega-tree-action:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.vega-tree-action:disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}

	.vega-tree-action--danger:hover:not(:disabled) {
		background: var(--danger-soft);
		color: var(--danger);
	}

	/* El set de iconos apunta a la derecha (mismo motivo que `.vega-block-chevron` de
	   `RecordBlocks.svelte`): rotado -90°/90° da arriba/abajo sin dibujar dos glifos nuevos. */
	.vega-tree-action-icon {
		display: inline-flex;
	}

	.vega-tree-action-icon--up {
		transform: rotate(-90deg);
	}

	.vega-tree-action-icon--down {
		transform: rotate(90deg);
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
		.vega-tree-close,
		.vega-tree-add,
		.vega-tree-action {
			min-height: 44px;
		}

		/* Los dos controles de SOLO ICONO de este componente necesitan también los 44px de ANCHO:
		   sin texto dentro, nada más se los da. `.vega-tree-close` mide `width: 1.8rem` (28,8px)
		   dentro del `@media (max-width: 1180px)` de más abajo, que es justo donde existe (es el
		   botón de cerrar el cajón), así que en un móvil quedaba en 44 de alto por 28,8 de ancho.
		   `scripts/check-touch-targets.mjs` no lo señala y no es un fallo suyo: por contrato solo
		   lee lo declarado fuera de todo `@media` más el bloque de puntero basto, y esa anchura
		   vive en un punto de corte de ANCHURA que el script descarta entero. El resto de controles
		   de aquí llevan texto (`.vega-tree-row`, `.vega-tree-toggle`, `.vega-tree-add`) y su ancho
		   sale del contenido más el padding, muy por encima de 44px. */
		.vega-tree-action,
		.vega-tree-close {
			min-width: 44px;
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
			/* `visibility` (encargo de accesibilidad, D2): un `transform` NO saca nada del orden de
			   tabulación — cerrado con solo `translateX`, las filas/botones seguían siendo tabulables
			   fuera de la pantalla. `visibility: hidden` sí lo hace, y entra en la `transition` para
			   no cortar la animación de golpe (medio segundo con el panel ya invisible pero aún
			   deslizándose se vería igual que antes, solo que ya no roba foco). */
			visibility: hidden;
			transition:
				transform 0.18s ease,
				visibility 0.18s ease;
		}

		.vega-tree-panel--open {
			transform: translateX(0);
			visibility: visible;
		}
	}
</style>
