<script lang="ts">
	/**
	 * `VisualInspector.svelte` (tarea "árbol de secciones y el inspector"): columna DERECHA del
	 * editor visual — la ficha del bloque seleccionado, montando `BlockEditor.svelte` TAL CUAL (no
	 * se copia ni se reescribe, §encargo). Este componente no toca `ctx.port` para nada que
	 * `BlockEditor` no le pida a través de `onSubmit`: no crea, no reordena, no borra — esas cuatro
	 * acciones estructurales siguen siendo exclusivas de `RecordBlocks.svelte`.
	 *
	 * **`blocks` llega como prop**, la MISMA instancia que `VisualEditorScreen.svelte` construyó con
	 * `createBlocksState()` y que también consume `VisualBlockTree.svelte` — "un solo
	 * `createBlocksState` por pantalla" (requisito del encargo). Los props que se le pasan a
	 * `BlockEditor` son EXACTAMENTE los que ya usa `RecordBlocks.svelte` (mismo `childType`,
	 * `blockType`, `dataField`, `structuralFields`, `onSubmit`/`onSaved`/`onDirtyChange`/
	 * `onDraftChange`/`onBusyChange`): la ficha se comporta IDÉNTICA aquí que dentro del formulario
	 * de siempre, porque es literalmente el mismo componente sobre el mismo estado.
	 *
	 * **Dos modos, un solo `{#each}` (Lote 12, lámina 8: modo «solo textos»).** `mode` decide la
	 * PRESENTACIÓN, nunca el estado:
	 * - `inspector` (por defecto, el de siempre): la ficha del bloque seleccionado, el resto oculto.
	 * - `texts`: por debajo de los 900 px del lienzo (`VisualEditorScreen.svelte#canvasActive`), las
	 *   secciones de la página EN SU ORDEN, cada una como tarjeta con su cabecera (icono y etiqueta
	 *   del tipo de bloque, o el título del bloque sin vocabulario), su marca de «sin guardar» y su
	 *   `BlockEditor` con `textsOnly` (solo `text`/`textarea`, ver `texts-mode.ts`; lo demás se
	 *   cuenta y se nombra). Sin lienzo, sin árbol, sin selección: no se puede mover, añadir ni
	 *   borrar — para eso están la pantalla ancha y el formulario, y la cabecera lo dice.
	 * Los dos modos comparten el MISMO `{#each blocks.records}` y la MISMA `<section>` por bloque
	 * (solo cambian clases, el `hidden` y la cabecera, que no guarda estado): así la pantalla puede
	 * pasar de ancho a estrecho y volver SIN remontar ningún `BlockEditor`, y un borrador a medio
	 * escribir sobrevive al giro del móvil o al cambio de ventana — son los mismos borradores, no una
	 * copia. Un `{#if mode}` con dos `{#each}` habría tirado ese borrador y, peor, dejado el `dirty`
	 * del bloque atascado en `blocks-state` (el `$effect` de `onDirtyChange(false)` no corre al
	 * desmontar), con el guard de salida preguntando para siempre.
	 *
	 * En `texts` también se aplica `locked` a cada ficha cuando la colección hija no da
	 * `permissions.update` (campos deshabilitados, sin «Guardar», y un aviso arriba con el texto de
	 * siempre, `editor.noUpdateNotice`). En `inspector` se pasa el MISMO `locked`: antes esta columna
	 * dejaba teclear y fallaba al guardar con un 403; ahora dice «tú no» desde el principio, igual
	 * que `RecordForm.svelte` con su `locked`.
	 *
	 * **Todos los `BlockEditor` del registro, SIEMPRE montados — decisión del encargo, no elección
	 * libre.** En `inspector` solo se ve UNO a la vez (el del bloque seleccionado), pero cambiar de
	 * selección NO desmonta el anterior: se itera `blocks.records` ENTERO y cada `BlockEditor` vive
	 * detrás de un `hidden` (nunca un `{#if}`), exactamente el mismo criterio que `RecordBlocks.svelte`
	 * usa para sus filas plegadas (ver su cabecera, "Estado de cada bloque, siempre MONTADO"). El
	 * motivo es el mismo: un `{#if}` que desmontara el editor al cambiar de fila TIRARÍA un borrador a
	 * medio escribir sin avisar — justo lo que el guard de salida de `VisualEditorScreen.svelte` existe
	 * para evitar. El coste (N formularios en el DOM en vez de uno) es el mismo que ya paga
	 * `RecordBlocks`, y por el mismo motivo es aceptable: pocos bloques por página, nunca cientos
	 * (ver `blocks-state.svelte.ts`).
	 *
	 * **Selección que no casa con ningún registro.** El sitio puede anunciar un `select` para un id
	 * que este árbol no tiene — un bloque borrado desde OTRA pestaña, una plantilla que anota mal, o
	 * (más mundano) esta pantalla todavía cargando la lista cuando llegó el mensaje. Se DISTINGUE de
	 * "nada seleccionado" (`selectedId === null`): un id presente que no resuelve a ningún registro
	 * de `blocks.records` avisa con su propio texto en vez de caer en el estado vacío genérico, que
	 * mentiría ("elige un bloque") sobre algo que el autor ya hizo.
	 *
	 * **Vista previa en vivo, la mitad barata.** Al guardar con éxito (`onSaved` de `BlockEditor`),
	 * además de `blocks.handleBlockSaved` (que sostiene el propio árbol/estado) se llama
	 * `onBlockSaved()`, que `VisualEditorScreen.svelte` cablea a `requestPreview()`: pide un token
	 * nuevo, lo que recarga el `<iframe>` entero con el dato ya guardado. Refrescar el marco SIN
	 * recargarlo (sustitución en caliente) es la mitad cara y es OTRA tarea (§encargo) — no se monta
	 * aquí. En modo `texts` no hay marco: la pantalla ignora el refresco (ver `applyWidth`).
	 *
	 * **Handles `saveAll()` y `saveSelected()`.** Desde el 21 oct 2026 (ronda 3 del QA de fodaveg)
	 * el atajo ⌘S/Ctrl+S usa `saveAll()`: guarda TODO lo pendiente, como el Guardar del formulario.
	 * `saveSelected()` queda para el guardado de la edición en línea (`onInlineSave`). Lo que sigue
	 * describe el diseño original, cuando ⌘S guardaba solo la ficha abierta. Cada `BlockEditor` del
	 * `{#each}` de abajo se referencia por id (`bind:this` sobre un `$state`, no un objeto plano: el
	 * compilador exige que el destino de un `bind:this` sea reactivo para poder rastrear la
	 * reasignación, y con un objeto plano avisa `binding_property_non_reactive` en cada render.
	 * Solo se LEE de forma imperativa desde el manejador de teclado de la pantalla, nunca en el
	 * template — mismo criterio de uso que `formEl` de `RecordForm.svelte`, y el mismo motivo por el
	 * que `inspectorRef` es `$state` en `VisualEditorScreen.svelte`). `saveSelected()` llama al `save()` del
	 * editor del bloque SELECCIONADO — el resto, aunque también estén montados (ver "Todos los
	 * `BlockEditor`... SIEMPRE montados" arriba), ni se tocan: ⌘S guarda "el de la ficha abierta",
	 * no todo el registro. No-op si no hay selección o el sitio señala un id que no resuelve a
	 * ningún registro (mismo caso que `danglingSelection`, más abajo): no hay editor que guardar.
	 *
	 * **El foco no puede caer a `<body>` al cambiar de bloque (encargo de accesibilidad, D1).**
	 * `record.id !== selectedId` (ver el marcado) oculta la ficha saliente con el atributo
	 * `hidden`, que `src/lib/theme/base.css` fuerza a `display: none !important` — y ocultar un
	 * elemento enfocado se lo lleva el navegador al `<body>` SIN avisar (la landmine que este repo
	 * ya documentó una vez: "ocultar un elemento anula su `.focus()`"). El arreglo tiene DOS
	 * mitades, cada una en el momento justo:
	 * - **Capturar ANTES de que el `hidden` se mueva.** Un `$effect` normal (el que corre tras la
	 *   sincronización de Svelte) YA LLEGA TARDE: para cuando se ejecuta, el DOM de esta pantalla
	 *   ya está pintado con el `hidden` nuevo y, si el foco estaba dentro de la ficha que acaba de
	 *   ocultarse, el navegador ya lo tiró a `<body>` — comprobar en ese punto siempre daría "no
	 *   estaba dentro", un no-op silencioso que solo un test que MIDA el resultado (no que confíe
	 *   en la intuición) puede cazar. Por eso la comprobación vive en `$effect.pre`, que Svelte
	 *   ejecuta ANTES de aplicar el cambio al DOM: en ese instante `selectedId` YA vale lo nuevo
	 *   (la reactividad ya decidió el cambio) pero el `hidden` de la ficha vieja TODAVÍA no se ha
	 *   movido, así que `document.activeElement` sigue siendo sincero.
	 * - **Mover el foco DESPUÉS, con `tick()`.** El `$effect` normal de abajo sí corre con el DOM
	 *   ya al día (la ficha nueva ya no tiene `hidden`), pero `BlockEditor` puede necesitar un tick
	 *   más para acabar de pintar sus propios campos — `tick()` antes de buscar el objetivo evita
	 *   apuntar a un DOM a medio construir.
	 * En modo `texts` ninguna ficha se oculta, así que no hay nada que rescatar: los dos efectos se
	 * callan (ver la guarda `mode === 'texts'`) y el foco se queda donde el autor lo tenga.
	 *
	 * Ninguno de los dos efectos ESCRIBE estado reactivo (solo leen `document.activeElement` y
	 * llaman a `.focus()`): con dos escritores del mismo `$state` este repo ya se ha encontrado el
	 * bucle de efectos que se pisan (ver la cabecera de `blocks-state.svelte.ts`), y aquí no hace
	 * falta ninguno — `focusWasInsidePanel` es una variable PLANA, no `$state`, que solo lee el
	 * segundo efecto.
	 *
	 * **Límite honesto de la medición (dejarlo escrito para que nadie se fíe de más):** jsdom, a
	 * diferencia de un navegador real, NO quita el foco solo por ocultar un ancestro (se comprobó a
	 * propósito escribiendo este mismo test) — así que el test de este fichero no puede DISTINGUIR
	 * `$effect.pre` de un `$effect` normal aquí: los dos hacen que la suite pase en jsdom, y solo
	 * el primero es correcto en un navegador de verdad. La necesidad de `$effect.pre` descansa en
	 * el orden de fases que documenta Svelte (pre-efectos → DOM → efectos normales) y en la
	 * landmine ya escrita en este repo, no en un test que lo mida — dicho de otro modo, "medido" en
	 * este caso concreto es el razonamiento, no el jsdom.
	 *
	 * **Nunca le roba el foco a quien teclea en OTRA superficie.** Si el foco no estaba dentro del
	 * panel del inspector cuando `selectedId` cambió (p. ej. el autor está escribiendo en el árbol
	 * o en cualquier otro sitio de la pantalla y el sitio manda un `select` del lienzo), el segundo
	 * efecto no toca nada — mismo criterio que la cabecera de `VisualBlockTree.svelte` fija por
	 * escrito para su propia lista ("esta lista se desplaza, no se enfoca").
	 *
	 * **Ancla de foco de la deselección.** `#vega-inspector-heading` lleva `tabindex="-1"` (mismo
	 * truco que `RecordBlocks.svelte` con su `<h2>` y que `VisualBlockTree.svelte` con
	 * `headingEl`): si tras el cambio no hay ninguna ficha visible (deselección, id fantasma, lista
	 * vacía) o la ficha visible no tiene NINGÚN enfocable, el foco aterriza ahí en vez de perderse.
	 */
	import { tick, type Snippet } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { labelInSentence } from '$lib/model/default-labels';
	import BlockEditor from '$lib/form/BlockEditor.svelte';
	import type { BlocksState } from '$lib/form/blocks-state.svelte';
	import { resolveFocusTarget } from '$lib/form/focus-target';
	import { focusables } from './a11y-audit';
	import type { InlineEditor } from './inline-session';
	import Icon from '$lib/icons/Icon.svelte';

	interface Props {
		/** Instancia ÚNICA de la pantalla (ver cabecera), nunca construida aquí. */
		blocks: BlocksState;
		/** Dueño único: `VisualEditorScreen.svelte#selectedBlockId`. */
		selectedId: string | null;
		/** Un bloque se acaba de guardar: la pantalla decide qué hacer (ver cabecera, "Vista previa
		 *  en vivo"). */
		onBlockSaved: () => void;
		onSaveError?: (blockId: string, failed: boolean) => void;
		/** Presentación (ver cabecera, "Dos modos, un solo `{#each}`"). Default `inspector`. */
		mode?: 'inspector' | 'texts';
		/** Solo en `texts`, página sin secciones (lámina 8.5): el botón de vuelta al formulario. */
		onBack?: () => void;
		/** Cierra solo la ficha visual; esta instancia y sus borradores siguen montados. */
		onClose?: () => void;
		/** El índice pide navegación al dueño de selección/foco de la pantalla. */
		onSelectBlock?: (id: string) => void;
		/** El autor escribe en la ficha el campo que se está editando en la página (ver
		 *  `BlockEditor#onInlineTakeover`): la pantalla cierra la sesión del puente. */
		onInlineTakeover?: (blockId: string, field: string) => void;
		/** Guardar de una ficha con una edición en línea abierta: `true` si la pantalla se encarga (pide
		 *  al sitio el valor final y guarda al recibirlo, ver `BlockEditor#beforeSave`). */
		interceptSave?: (blockId: string) => boolean;
		fullFormHref?: string;
	}

	let {
		blocks,
		selectedId,
		onBlockSaved,
		onSaveError,
		mode = 'inspector',
		onBack,
		onClose,
		onSelectBlock,
		onInlineTakeover,
		interceptSave,
		fullFormHref
	}: Props = $props();
	const ctx = getVegaContext();

	const texts = $derived(mode === 'texts');
	/** Sin permiso de ESCRIBIR en la colección hija (ver cabecera, `locked`). `true` si no hay tipo
	 *  hijo resuelto: entonces `blocks.hidden` ya tapa la lista entera y esto no se llega a leer. */
	const locked = $derived(blocks.childType !== null && !blocks.childType.permissions.update);

	const selectedRecord = $derived(
		selectedId === null ? null : (blocks.records.find((record) => record.id === selectedId) ?? null)
	);
	/** Ver cabecera, "Selección que no casa": distingue el id-fantasma de "nada elegido todavía". */
	const danglingSelection = $derived(selectedId !== null && selectedRecord === null);

	/** Fichas cuyo último guardado falló: el pie lo dice dentro de la ficha (lámina, «No se pudo
	 *  guardar… Tus cambios siguen aquí»), además del aviso de la barra. */
	let saveFailed = $state<Record<string, boolean>>({});

	// ————— Handle `saveSelected()` (ver cabecera) —————
	let editorRefs = $state<Record<string, InlineEditor | undefined>>({});

	export function saveSelected(): void {
		if (selectedId === null) return;
		editorRefs[selectedId]?.save();
	}

	/**
	 * ⌘S/Ctrl+S del editor visual (decisión del 21 oct 2026, ronda 3 del QA de fodaveg): guarda TODO
	 * lo pendiente, como el «Guardar» del formulario de la página — primero la ficha abierta y
	 * después cada bloque con cambios, en el orden de la página, cada uno por su propio camino
	 * (`BlockEditor#save`). Un bloque que no se puede guardar no escribe nada y lo dice en su ficha;
	 * ninguno se lleva el foco aquí (`focus: false`): quien llama enseña el PRIMERO rechazado
	 * (`revealBlockErrors`). Devuelve los ids rechazados, en ese orden.
	 */
	export async function saveAll(): Promise<string[]> {
		const pending = blocks.records.map((record) => record.id).filter((id) => blocks.isDirty(id));
		const order =
			selectedId !== null && pending.includes(selectedId)
				? [selectedId, ...pending.filter((id) => id !== selectedId)]
				: pending;
		const rejected: string[] = [];
		for (const id of order) {
			if ((await editorRefs[id]?.save({ focus: false })) === 'rejected') rejected.push(id);
		}
		return rejected;
	}

	/** Foco al primer campo con error de la ficha `id`, que ya tiene que estar a la vista. */
	export function revealBlockErrors(id: string): Promise<void> {
		return editorRefs[id]?.revealErrors() ?? Promise.resolve();
	}

	/** «Reintentar» del error de guardado de la barra: guarda ESA ficha aunque ya no esté abierta. */
	export function saveBlock(id: string): void {
		editorRefs[id]?.save();
	}

	/** «Descartar» del pie (lámina «edición en vivo»): vuelve la ficha seleccionada a lo guardado. */
	export function discardSelected(): void {
		if (selectedId === null) return;
		editorRefs[selectedId]?.discard();
	}

	export function beginInline(blockId: string, field: string) {
		return editorRefs[blockId]?.beginInline(field) ?? null;
	}
	export function updateInline(blockId: string, field: string, value: string): boolean {
		return editorRefs[blockId]?.updateInline(field, value) ?? false;
	}
	export function finishInline(blockId: string, cancel = false): void {
		editorRefs[blockId]?.finishInline(cancel);
	}

	// ————— El foco no puede caer a `<body>` al cambiar de bloque (ver cabecera, D1) —————
	let panelEl = $state<HTMLElement | undefined>(undefined);
	let headingEl = $state<HTMLElement | undefined>(undefined);

	/** Acceso explícito desde el aviso de borradores, tras actualizar la selección en la pantalla.
	 *  En estrecho todas las fichas están visibles: se busca por id, nunca la primera del panel.
	 *  Un control deshabilitado no es destino; sin controles se enfoca la sección contextual. */
	export function focusBlock(id: string): void {
		const body = Array.from(
			panelEl?.querySelectorAll<HTMLElement>('.vega-inspector-body:not([hidden])') ?? []
		).find((section) => section.dataset.blockId === id);
		if (!body) return;
		const target = firstFieldControl(body);
		focusContext(target ?? body);
	}

	/** El foco nativo no descuenta lo fijo del panel: la cabecera de arriba (la del inspector, o la de
	 *  la tarjeta en «solo textos») y el pie con Guardar de abajo. Los controles se alinean entre los
	 *  dos; TipTap puede restaurar después su caret, así que tras pintar solo se corrige su
	 *  visibilidad, conservando la selección actual y sin desplazar otra ficha ni otro foco. */
	function focusContext(target: HTMLElement | undefined): void {
		if (!target || !panelEl) return;
		const panel = panelEl;
		target.focus({ preventScroll: true });
		const editable = target.getAttribute('contenteditable') === 'true';
		const reveal = (): void => {
			if (document.activeElement !== target || !target.isConnected || target.closest('[hidden]'))
				return;
			const section = target.closest('.vega-inspector-body');
			const head = texts
				? section?.querySelector('.vega-texts-head')
				: panel.querySelector('.vega-inspector-head');
			const foot = section?.querySelector('.vega-block-context');
			const viewport = panel.getBoundingClientRect();
			const selection = document.getSelection();
			const caret =
				editable && selection?.rangeCount && target.contains(selection.anchorNode)
					? selection.getRangeAt(0).getBoundingClientRect()
					: null;
			const rect = caret?.height ? caret : target.getBoundingClientRect();
			const top =
				viewport.top + (target === section ? 0 : (head?.getBoundingClientRect().height ?? 0)) + 3;
			const bottom =
				viewport.bottom -
				(target === section ? 0 : (foot?.getBoundingClientRect().height ?? 0)) -
				3;
			// Desplazamiento mínimo; si no cabe, alinea el inicio.
			panel.scrollTop += Math.min(rect.top - top, Math.max(0, rect.bottom - bottom));
		};
		// La selección de TipTap se restaura después del foco; no se fuerza primero al comienzo.
		if (editable) requestAnimationFrame(() => requestAnimationFrame(reveal));
		else reveal();
	}

	/** La acción persistente precede a los campos en el DOM; «Abrir bloque» sigue llevando al
	 *  primer campo, nunca al nuevo Guardar. Se excluye también cualquier control oculto. */
	function firstFieldControl(body: HTMLElement): HTMLElement | undefined {
		for (const row of body.querySelectorAll<HTMLElement>('.vega-field-row[data-field]')) {
			const target = resolveFocusTarget(body, row.dataset.field!, body.dataset.blockId);
			if (target && !target.closest('[hidden]')) return target;
		}
		return focusables(body).find(
			(control) => !control.closest('[hidden], .vega-block-context, .vega-block-full-form')
		);
	}

	/** `$effect.pre` (ver cabecera): corre ANTES de que Svelte aplique el `hidden` nuevo al DOM, así
	 *  que `document.activeElement` todavía refleja la ficha SALIENTE con sinceridad. Variable
	 *  PLANA, no `$state` — solo la lee el `$effect` de abajo, nunca el marcado. */
	let focusWasInsidePanel = false;
	$effect.pre(() => {
		void selectedId; // dependencia: re-ejecutar en cada cambio es lo que importa, no el valor
		if (texts) return; // nada se oculta en «solo textos» (ver cabecera)
		focusWasInsidePanel = panelEl?.contains(document.activeElement) ?? false;
	});

	/** Corre DESPUÉS de que Svelte pinte el cambio (la ficha nueva ya no tiene `hidden`). No
	 *  escribe ningún `$state` (solo llama a `.focus()`, ver cabecera): sin este cuidado se
	 *  reproduciría el bucle de "dos escritores, un solo estado" que este repo ya sufrió. */
	$effect(() => {
		const id = selectedId; // dependencia: el propio valor decide el destino, más abajo
		if (texts) return; // ver arriba
		if (!focusWasInsidePanel) return; // nunca robar el foco a quien teclea en OTRA superficie
		void tick().then(() => {
			const body =
				id === null
					? null
					: panelEl?.querySelector<HTMLElement>('.vega-inspector-body:not([hidden])');
			focusContext((body ? firstFieldControl(body) : undefined) ?? headingEl);
		});
	});

	/** Cabecera de una sección en «solo textos» (lámina 8): la etiqueta del TIPO de bloque cuando
	 *  hay vocabulario («Portada», «Texto»…), y si no, el título del bloque — nunca un hueco. */
	function sectionTitle(record: BlocksState['records'][number]): string {
		return blocks.blockTypeOf(record)?.label ?? blocks.blockTitle(record);
	}
</script>

{#snippet blockFooter(
	_name: string,
	state: string,
	save: Snippet | undefined,
	id: string,
	discardable: boolean
)}
	<!-- Pie de la ficha en el inspector (lámina «edición en vivo», `.insp .acts`): Guardar,
	     Descartar y el atajo. El MISMO Guardar de `BlockEditor` (un solo dueño del guardado);
	     Descartar vuelve a lo guardado sin tocar el servidor. Va tras los campos en el DOM, igual
	     que se ve: el orden de tabulación sigue a la presentación. -->
	<footer class="vega-block-context vega-block-context--foot">
		{#if saveFailed[id]}
			<p class="vega-inspector-alert" role="alert">
				<Icon id="generic" size={14} />{ctx.t('editor.visual.inspector.saveFailed')}
			</p>
		{/if}
		{#if save}{@render save()}{/if}
		{#if save}
			<button
				type="button"
				class="vega-inspector-discard"
				disabled={!discardable}
				onclick={() => editorRefs[id]?.discard()}>{ctx.t('editor.visual.inspector.discard')}</button
			>
		{/if}
		<p class="vega-block-context-state" role="status">{state}</p>
		{#if save}<kbd class="vega-inspector-shortcut" title={ctx.t('editor.visual.inspector.shortcut')}
				>⌘S</kbd
			>{/if}
	</footer>
{/snippet}

{#snippet textsFooter(_name: string, state: string, save: Snippet | undefined)}
	<!-- «Solo textos» (lámina, `.tcard .acts`): Guardar al pie de su tarjeta; el estado sigue para
	     el lector de pantalla y la marca «sin guardar» va en la cabecera de la tarjeta. -->
	<footer class="vega-block-context vega-block-context--texts">
		{#if save}{@render save()}{/if}
		<p class="vega-block-context-state" role="status">{state}</p>
	</footer>
{/snippet}

<div
	class="vega-inspector-panel"
	class:vega-inspector-panel--texts={texts}
	role="region"
	aria-labelledby={texts || selectedRecord === null ? 'vega-inspector-heading' : undefined}
	aria-label={texts || selectedRecord === null ? undefined : ctx.t('editor.visual.inspector.title')}
	bind:this={panelEl}
>
	<!-- Un solo `<h2>` para los dos modos (y un solo `bind:this`): en «solo textos» la cabecera es
	     el aviso informativo de la lámina (`.vega-admin-notice--info`, mismos tokens), con el
	     título dentro para que la región siga teniendo nombre. -->
	<div
		class="vega-inspector-head"
		class:vega-inspector-head--texts={texts}
		class:vega-inspector-head--block={!texts && selectedRecord !== null}
	>
		{#if !texts && selectedRecord !== null}
			<!-- Cabecera de la ficha (lámina, `.insp .head`): icono, el NOMBRE de la sección con la
			     misma fuente que el árbol y la franja (`blockTitle`, QA de fodaveg del 21 oct 2026:
			     aquí decía el tipo y allí el título), y debajo su tipo y dónde está en la página. -->
			{@const selectedType = blocks.blockTypeOf(selectedRecord)}
			{@const selectedTitle = blocks.blockTitle(selectedRecord)}
			{@const position = blocks.records.findIndex((item) => item.id === selectedRecord.id) + 1}
			<span class="vega-inspector-icon" aria-hidden="true"
				><Icon id={selectedType?.icon ?? 'document'} size={17} /></span
			>
			<div class="vega-inspector-title">
				<h2 id="vega-inspector-heading" bind:this={headingEl} tabindex="-1">
					{selectedTitle}
				</h2>
				<!-- Posición en la página, sin el id crudo (QA de fodaveg, 21 oct 2026: «Sección 1 de 1
				     · a2xiakqxtua8tk4»); el id queda en el `title` para quien lo necesite. -->
				<small title={selectedRecord.id}
					>{selectedType && selectedType.label !== selectedTitle
						? `${selectedType.label} · `
						: ''}{ctx.t('editor.visual.inspector.position', {
						position,
						total: blocks.records.length
					})}</small
				>
			</div>
		{:else}
			<h2 id="vega-inspector-heading" bind:this={headingEl} tabindex="-1">
				{texts ? ctx.t('editor.visual.texts.title') : ctx.t('editor.visual.inspector.title')}
			</h2>
		{/if}
		{#if !texts && onClose}
			<button
				type="button"
				class="vega-inspector-close"
				aria-label={ctx.t('editor.visual.closeInspector')}
				title={ctx.t('editor.visual.closeInspector')}
				onclick={onClose}><Icon id="close" size={16} /></button
			>
		{/if}
		{#if texts}
			<p class="vega-inspector-intro">{ctx.t('editor.visual.texts.intro')}</p>
		{/if}
	</div>

	{#if texts && locked && !blocks.hidden && !blocks.loading && blocks.records.length > 0}
		<p class="vega-inspector-notice">{ctx.t('editor.noUpdateNotice')}</p>
	{/if}

	{#if blocks.hidden}
		<p class="vega-inspector-notice" role="alert">{ctx.t('editor.visual.tree.unavailable')}</p>
	{:else if blocks.loading}
		<p class="vega-inspector-notice" aria-live="polite">{ctx.t('common.loading')}</p>
	{:else if blocks.records.length === 0}
		{#if texts}
			<!-- Lámina 8.5: la caja de la antigua pantalla de salida, con el motivo de este caso. -->
			<div class="vega-texts-empty">
				<p class="vega-texts-empty-title">{ctx.t('editor.visual.texts.empty.title')}</p>
				<p>{ctx.t('editor.visual.texts.empty.body')}</p>
				{#if onBack}
					<button type="button" class="vega-texts-back" onclick={onBack}>
						{ctx.t('editor.visual.back')}
					</button>
				{/if}
			</div>
		{:else}
			<p class="vega-inspector-notice">
				{ctx.t('editor.blocks.empty', {
					label: labelInSentence(blocks.childType?.label ?? '', ctx.locale)
				})}
			</p>
		{/if}
	{:else if !texts && selectedRecord === null}
		<p class="vega-inspector-notice" role={danglingSelection ? 'alert' : undefined}>
			{danglingSelection
				? ctx.t('editor.visual.inspector.unknownBlock')
				: ctx.t('editor.visual.inspector.empty')}
		</p>
	{/if}

	<!-- Ver cabecera, "SIEMPRE montados": TODOS los bloques del registro, ocultos con `hidden` salvo
	     el seleccionado — nunca `{#if}`, o cambiar de fila tiraría un borrador a medio escribir. En
	     «solo textos» ninguno lleva `hidden`: son las secciones de la página, en su orden. -->
	{#if blocks.childType && !blocks.hidden}
		{@const childType = blocks.childType}
		{#each blocks.records as record (record.id)}
			{@const blockType = blocks.blockTypeOf(record)}
			<section
				class="vega-inspector-body"
				class:vega-inspector-body--texts={texts}
				hidden={texts ? undefined : record.id !== selectedId}
				aria-labelledby={texts ? `vega-texts-title-${record.id}` : undefined}
				aria-label={texts ? undefined : blocks.blockTitle(record)}
				data-block-id={record.id}
				tabindex="-1"
			>
				{#if texts}
					<!-- Cabecera de la tarjeta (lámina, `.tcard .head`): icono y TIPO de la sección y la
					     marca de «sin guardar»; el título del bloque queda como `title`. -->
					<header class="vega-texts-head">
						<span class="vega-texts-ic" aria-hidden="true"
							><Icon id={blockType?.icon ?? 'document'} size={14} strokeWidth={1.6} /></span
						>
						<h3 id="vega-texts-title-{record.id}" title={blocks.blockTitle(record)}>
							{sectionTitle(record)}
						</h3>
						{#if blocks.records.length > 1 && onSelectBlock}
							<!-- Índice de secciones (ya existía en «Solo textos»; la lámina lo da por «igual»). -->
							<select
								class="vega-texts-index"
								aria-label={ctx.t('editor.visual.texts.jump')}
								value={record.id}
								onchange={(event) => {
									const destination = event.currentTarget.value;
									// Es navegación: al volver, esta cabecera sigue describiendo SU sección.
									event.currentTarget.value = record.id;
									onSelectBlock?.(destination);
								}}
							>
								{#each blocks.records as item, index (item.id)}
									<option value={item.id}
										>{index + 1}/{blocks.records.length} · {sectionTitle(item)} — {blocks.blockTitle(
											item
										)}</option
									>
								{/each}
							</select>
						{/if}
						{#if blocks.isDirty(record.id)}<span class="vega-texts-dirty"
								>{ctx.t('editor.dirty')}</span
							>{/if}
					</header>
				{/if}
				<BlockEditor
					onSaveError={(failed) => {
						saveFailed = { ...saveFailed, [record.id]: failed };
						onSaveError?.(record.id, failed);
					}}
					bind:this={editorRefs[record.id]}
					{childType}
					{blockType}
					rawBlockType={blocks.blockTypeRawName(record)}
					dataField={blocks.blocksConfig!.dataField}
					{record}
					name={blocks.blockTitle(record)}
					structuralFields={blocks.structuralFields}
					onSubmit={(input, opts) => ctx.port.update(childType.name, record.id, input, opts)}
					onSaved={(saved) => {
						blocks.handleBlockSaved(record.id, saved);
						onBlockSaved();
					}}
					onDirtyChange={(dirty) => blocks.setDirty(record.id, dirty)}
					onDraftChange={(draft) => blocks.handleBlockDraftChange(record.id, draft)}
					onBusyChange={(saving) => blocks.setSaving(record.id, saving)}
					textsOnly={texts}
					{fullFormHref}
					contextualHeader={texts ? textsFooter : blockFooter}
					contextualPlacement="bottom"
					onInlineTakeover={(field) => onInlineTakeover?.(record.id, field)}
					beforeSave={() => interceptSave?.(record.id) ?? false}
					{locked}
				/>
			</section>
		{/each}
	{/if}
</div>

<style>
	/* Cada cabecera queda limitada por SU ficha: en Solo textos la siguiente sección desplaza
	   a la anterior, sin varios pies flotando sobre los campos. No hay un segundo Guardar. */
	.vega-block-context {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--line);
		background: var(--paper);
	}

	/* Pie del inspector (lámina, `.insp .acts`): pegado abajo mientras los campos se desplazan, con
	   fondo opaco para que lo que scrollea no se transparente detrás. */
	.vega-block-context--foot {
		top: auto;
		bottom: 0;
		margin-top: auto;
		gap: var(--sp-2);
		padding: var(--sp-3) 0;
		border-top: 1px solid var(--line-soft);
		border-bottom: 0;
		background: var(--surface);
	}

	/* El estado de la ficha ya lo pinta la barra (punto + texto): aquí queda para el lector de
	   pantalla y el pie enseña solo el atajo, como la lámina. */
	.vega-block-context--foot .vega-block-context-state {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	.vega-block-context--foot :global(.vega-block-save-button) {
		min-width: 0;
		min-height: 34px;
		padding: 0 var(--sp-4);
		border: 1px solid transparent;
		border-radius: var(--r-pill);
		background: var(--accent-grad);
		color: var(--accent-ink);
		font: inherit;
		font-size: var(--fs-13);
		font-weight: 500;
		box-shadow: var(--shadow-card);
		cursor: pointer;
	}

	.vega-block-context--foot :global(.vega-block-save-button:disabled) {
		background: var(--btn);
		color: var(--ink-2);
		box-shadow: none;
		cursor: not-allowed;
	}

	/* Error al guardar dentro de la ficha (lámina, `.alert.err`): ocupa su propia línea del pie. */
	.vega-inspector-alert {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		flex-basis: 100%;
		margin: 0 0 var(--sp-2);
		padding: 10px 12px;
		border-radius: var(--r-sm);
		background: var(--danger-soft);
		color: var(--danger);
		font-size: var(--fs-12);
		line-height: 1.4;
	}

	.vega-block-context--foot {
		flex-wrap: wrap;
	}

	.vega-inspector-discard {
		min-height: 34px;
		padding: 0 var(--sp-3);
		border: 1px solid transparent;
		border-radius: var(--r-pill);
		background: transparent;
		color: var(--ink-2);
		font: inherit;
		font-size: var(--fs-13);
		font-weight: 500;
		cursor: pointer;
	}

	.vega-inspector-discard:hover:not(:disabled) {
		background: var(--btn);
		color: var(--ink-hi);
	}

	.vega-inspector-discard:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.vega-inspector-discard:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.vega-inspector-shortcut {
		flex-shrink: 0;
		margin-left: auto;
		color: var(--ink-3);
		font-family: var(--mono);
		font-size: 11px;
	}

	@media (pointer: coarse) {
		.vega-block-context--foot :global(.vega-block-save-button),
		.vega-inspector-discard {
			min-height: 44px;
		}
	}

	/* En poca altura la cabecera conserva nombre/estado y Guardar44px, dejando espacio al campo. */
	@media (max-height: 600px) {
		.vega-block-context {
			padding-block: 0.25rem;
		}
	}

	.vega-block-context-state {
		margin: 0.25rem 0 0;
		color: var(--ink-2);
		font-size: 0.8em;
		overflow-wrap: anywhere;
	}

	.vega-block-context :global(.vega-block-save-button) {
		flex-shrink: 0;
		min-width: 44px;
		min-height: 44px;
		white-space: nowrap;
	}

	.vega-block-context :global(.vega-block-save-button:focus-visible) {
		outline-color: var(--ink);
	}

	/* Misma nota que `.vega-tree-panel` (`VisualBlockTree.svelte`): sin `position: sticky`, la
	   rejilla del padre (`.vega-visual-grid--inspector`) ya reparte el alto EXACTO del viewport y
	   `stretch` (su `align-items` por defecto) hace que esta celda llene esa altura sola. */
	/* Panel de cristal (lámina «edición en vivo», `.pane`): flota sobre el escenario como el menú de
	   Inicio v2. `--glass` ya es la superficie translúcida derivada del tema. */
	.vega-inspector-panel {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--glass);
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
		box-shadow: var(--shadow-card);
		overflow-y: auto;
	}

	/* «Solo textos» (lámina 8, `.vega-visual-texts`): ya no es un panel sino la columna de la
	   página — sin caja propia, con el `gap` de `.vega-editor-main`; las tarjetas son cada sección.
	   Sigue siendo quien scrollea (la pantalla mide el alto exacto del viewport, ver
	   `.vega-visual-screen`), así que el scroll que importa es este. */
	.vega-inspector-panel--texts {
		gap: var(--vega-space-gutter);
		border: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
	}

	/* Fija arriba mientras la ficha se desplaza (audit UX02: el contexto de QUÉ bloque se edita no
	   se pierde al recorrer un formulario largo), opaca para que lo que pasa por debajo no se lea
	   a través. El pie con Guardar es el otro extremo fijo (`.vega-block-context--foot`). */
	.vega-inspector-head {
		position: sticky;
		top: 0;
		z-index: 3;
		flex-shrink: 0;
		background: var(--surface);
		padding: 0.75rem 0.9rem;
		border-bottom: 1px solid var(--line);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	/* Cabecera de la ficha (lámina, `.insp .head`): icono en baldosa de acento, nombre del tipo en
	   la display y la posición en mono. */
	.vega-inspector-head--block {
		justify-content: flex-start;
		gap: 10px;
		padding: 14px 16px;
		border-bottom-color: var(--line-soft);
	}

	.vega-inspector-icon {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 34px;
		height: 34px;
		border-radius: var(--r-sm);
		background: var(--accent-soft);
		color: var(--accent-text);
	}

	.vega-inspector-title {
		flex: 1;
		min-width: 0;
	}

	.vega-inspector-head.vega-inspector-head--block h2 {
		font-family: var(--display);
		font-size: var(--fs-17);
		font-weight: 600;
		letter-spacing: -0.02em;
		text-transform: none;
		color: var(--ink-hi);
	}

	.vega-inspector-title small {
		display: block;
		color: var(--ink-3);
		font-family: var(--mono);
		font-size: 11px;
		overflow-wrap: anywhere;
	}

	.vega-inspector-close {
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
		min-width: 34px;
		min-height: 34px;
		padding: 0;
		border: 0;
		border-radius: var(--r-pill);
		background: transparent;
		color: var(--ink-2);
		font: inherit;
		cursor: pointer;
	}
	@media (pointer: coarse) {
		.vega-inspector-close {
			min-height: 44px;
			min-width: 44px;
		}
	}

	.vega-inspector-close:hover,
	.vega-inspector-close:focus-visible {
		background: var(--btn);
		color: var(--ink-hi);
	}

	.vega-inspector-head h2 {
		margin: 0;
		font-size: 0.76em;
		font-weight: 650;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}

	/* Aviso informativo de la lámina (`.vega-admin-notice--info` de `admin.css`, que esta pantalla
	   no carga): mismos tokens, misma caja. El título deja la versalita del inspector. NO se queda
	   fija: en «Solo textos» lo fijo arriba es la cabecera de cada tarjeta (`.vega-texts-head`,
	   audit UX02), y dos pegadas a `top: 0` se pintaban una sobre otra a 390 px (QA de fodaveg,
	   21 oct 2026: «Texto» encima de la introducción). */
	.vega-inspector-head--texts {
		position: static;
		display: block;
		padding: 0 2px;
		border: 0;
		background: transparent;
	}

	.vega-inspector-head--texts h2 {
		display: inline;
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: normal;
		text-transform: none;
		color: var(--ink-hi);
	}

	.vega-inspector-intro {
		display: inline;
		margin: 0 0 0 0.3em;
		color: var(--ink-2);
		font-size: var(--fs-13);
	}

	.vega-inspector-notice {
		margin: 0.75rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-inspector-panel--texts .vega-inspector-notice {
		margin: 0;
	}

	/* `display: flex` AQUÍ y `hidden` en el marcado es justo la combinación que se rompía sola: una
	   regla de autor gana a la del navegador, así que `hidden` dejaba de ocultar y salían los N
	   bloques apilados. Lo sostiene ahora `[hidden] { display: none !important }` de
	   `src/lib/theme/base.css` (allí está el razonamiento entero). No lo repitas aquí: si dejan de
	   ocultarse, el fallo está en esa hoja, no en esta clase. */
	.vega-inspector-body {
		display: flex;
		flex-direction: column;
		gap: var(--gap-field);
		padding: 14px 16px 0;
	}

	/* En el inspector la ficha llena el panel y su pie (Guardar/Descartar) queda abajo del todo,
	   pegado mientras los campos se desplazan (lámina, `.insp .acts`). */
	.vega-inspector-body:not(.vega-inspector-body--texts) {
		flex: 1 0 auto;
	}

	.vega-inspector-body:not(.vega-inspector-body--texts) > :global(.vega-block-fields) {
		flex: 1 0 auto;
	}

	/* Tarjeta de sección en «solo textos» (lámina 8): `.vega-fsection` de `RecordForm.svelte`, los
	   mismos tokens, porque el CSS con ámbito de Svelte no cruza componentes. */
	.vega-inspector-body--texts {
		gap: 0.75rem;
		padding: var(--pad-card);
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-card);
		min-width: 0;
	}

	/* Tarjeta de «Solo textos» (lámina, `.tcard`): cabecera con icono y tipo, Guardar al pie. */
	/* Como en el inspector (audit UX02): la cabecera de la tarjeta queda fija arriba y su Guardar
	   abajo mientras se recorre una sección larga; cada una limitada por SU tarjeta, así que la
	   siguiente desplaza a la anterior. */
	.vega-texts-head {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--surface);
		border-radius: var(--r-md) var(--r-md) 0 0;
		display: flex;
		align-items: center;
		gap: 10px;
		margin: calc(var(--pad-card) * -1) calc(var(--pad-card) * -1) 0;
		padding: 12px 14px;
		border-bottom: 1px solid var(--line-soft);
	}

	.vega-texts-ic {
		display: grid;
		place-items: center;
		flex: none;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		background: var(--accent-soft);
		color: var(--accent-text);
	}

	.vega-texts-head h3 {
		flex: 1;
		min-width: 0;
		margin: 0;
		color: var(--ink-hi);
		font-size: var(--fs-14);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Índice de secciones (ya existía en «Solo textos»): compacto, a la derecha de la cabecera. */
	.vega-texts-index {
		flex: none;
		width: 4.5rem;
		min-height: 30px;
		padding: 0 6px;
		border: 1px solid var(--line);
		border-radius: var(--r-pill);
		background: var(--surface);
		color: var(--ink-2);
		font: inherit;
		font-size: var(--fs-12);
	}

	.vega-texts-index:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	@media (pointer: coarse) {
		.vega-texts-index {
			min-height: 44px;
		}
	}

	.vega-texts-dirty {
		flex: none;
		color: var(--warning);
		font-size: 11px;
	}

	.vega-block-context--texts {
		position: sticky;
		top: auto;
		bottom: 0;
		padding: 8px 0;
		border: 0;
		background: var(--surface);
	}

	.vega-block-context--texts .vega-block-context-state {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	.vega-block-context--texts :global(.vega-block-save-button) {
		min-width: 0;
		min-height: 30px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: var(--r-pill);
		background: var(--surface);
		color: var(--ink-hi);
		font: inherit;
		font-size: var(--fs-12);
		font-weight: 500;
		cursor: pointer;
	}

	.vega-block-context--texts :global(.vega-block-save-button:not(:disabled)) {
		border-color: transparent;
		background: var(--accent-grad);
		color: var(--accent-ink);
	}

	/* Con el dedo, 44 px como el resto (QA de fodaveg, 21 oct 2026: medía 71×30). Después de la
	   regla de arriba a propósito: misma especificidad, gana la última. */
	@media (pointer: coarse) {
		.vega-block-context--texts :global(.vega-block-save-button) {
			min-height: 44px;
		}
	}

	/* Página sin secciones (lámina 8.5): la caja de la antigua pantalla de salida de
	   `VisualEditorScreen.svelte` (`.vega-visual-narrow`), que vivía allí y ahora vive aquí. */
	.vega-texts-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		max-width: 32rem;
	}

	.vega-texts-empty p {
		margin: 0;
	}

	.vega-texts-empty-title {
		font-size: 1.1rem;
		font-weight: 650;
		color: var(--ink-hi);
	}

	.vega-texts-back {
		padding: 0.45rem 0.9rem;
		min-height: 44px;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface-2);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}

	.vega-texts-back:hover {
		border-color: var(--line-strong);
	}

	.vega-texts-back:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
</style>
