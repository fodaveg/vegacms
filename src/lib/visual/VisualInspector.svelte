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
	 * **Handle `saveSelected()` (tarea "el acabado": atajo ⌘S/Ctrl+S).** Cada `BlockEditor` del
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
	import { tick } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import BlockEditor from '$lib/form/BlockEditor.svelte';
	import type { BlocksState } from '$lib/form/blocks-state.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { focusables } from './a11y-audit';

	interface Props {
		/** Instancia ÚNICA de la pantalla (ver cabecera), nunca construida aquí. */
		blocks: BlocksState;
		/** Dueño único: `VisualEditorScreen.svelte#selectedBlockId`. */
		selectedId: string | null;
		/** Un bloque se acaba de guardar: la pantalla decide qué hacer (ver cabecera, "Vista previa
		 *  en vivo"). */
		onBlockSaved: () => void;
		/** Presentación (ver cabecera, "Dos modos, un solo `{#each}`"). Default `inspector`. */
		mode?: 'inspector' | 'texts';
		/** Solo en `texts`, página sin secciones (lámina 8.5): el botón de vuelta al formulario. */
		onBack?: () => void;
	}

	let { blocks, selectedId, onBlockSaved, mode = 'inspector', onBack }: Props = $props();
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

	// ————— Handle `saveSelected()` (ver cabecera) —————
	let editorRefs = $state<Record<string, { save: () => void } | undefined>>({});

	export function saveSelected(): void {
		if (selectedId === null) return;
		editorRefs[selectedId]?.save();
	}

	// ————— El foco no puede caer a `<body>` al cambiar de bloque (ver cabecera, D1) —————
	let panelEl = $state<HTMLElement | undefined>(undefined);
	let headingEl = $state<HTMLElement | undefined>(undefined);

	/** Primer enfocable de la ficha VISIBLE de `panelEl` (la que no lleva `hidden`), o `null` si no
	 *  hay ninguna ficha visible o está vacía de controles. Reusa `focusables()` (ver cabecera de
	 *  `a11y-audit.ts`) en vez de reinventar el criterio de "qué es enfocable". */
	function firstFocusableInVisibleBody(): HTMLElement | null {
		const visible = panelEl?.querySelector<HTMLElement>('.vega-inspector-body:not([hidden])');
		return visible ? (focusables(visible)[0] ?? null) : null;
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
			const target = id === null ? null : firstFocusableInVisibleBody();
			(target ?? headingEl)?.focus();
		});
	});

	/** Cabecera de una sección en «solo textos» (lámina 8): la etiqueta del TIPO de bloque cuando
	 *  hay vocabulario («Portada», «Texto»…), y si no, el título del bloque — nunca un hueco. */
	function sectionTitle(record: BlocksState['records'][number]): string {
		return blocks.blockTypeOf(record)?.label ?? blocks.blockTitle(record);
	}
</script>

<div
	class="vega-inspector-panel"
	class:vega-inspector-panel--texts={texts}
	role="region"
	aria-labelledby="vega-inspector-heading"
	bind:this={panelEl}
>
	<!-- Un solo `<h2>` para los dos modos (y un solo `bind:this`): en «solo textos» la cabecera es
	     el aviso informativo de la lámina (`.vega-admin-notice--info`, mismos tokens), con el
	     título dentro para que la región siga teniendo nombre. -->
	<div class="vega-inspector-head" class:vega-inspector-head--texts={texts}>
		<h2 id="vega-inspector-heading" bind:this={headingEl} tabindex="-1">
			{texts ? ctx.t('editor.visual.texts.title') : ctx.t('editor.visual.inspector.title')}
		</h2>
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
				{ctx.t('editor.blocks.empty', { label: blocks.childType?.label ?? '' })}
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
				data-block-id={record.id}
			>
				{#if texts}
					<div class="vega-texts-head">
						<h3 id="vega-texts-title-{record.id}">
							{#if blockType?.icon}<Icon id={blockType.icon} size={14} />{/if}
							{sectionTitle(record)}
						</h3>
						{#if blocks.isDirty(record.id)}
							<span class="vega-texts-dirty" title={ctx.t('editor.dirty')}>
								<span class="vega-visually-hidden">{ctx.t('editor.dirty')}</span>
							</span>
						{/if}
					</div>
				{:else}
					<p class="vega-inspector-block-title">{blocks.blockTitle(record)}</p>
				{/if}
				<BlockEditor
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
					{locked}
				/>
			</section>
		{/each}
	{/if}
</div>

<style>
	/* Misma nota que `.vega-tree-panel` (`VisualBlockTree.svelte`): sin `position: sticky`, la
	   rejilla del padre (`.vega-visual-grid--inspector`) ya reparte el alto EXACTO del viewport y
	   `stretch` (su `align-items` por defecto) hace que esta celda llene esa altura sola. */
	.vega-inspector-panel {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--paper);
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

	.vega-inspector-head {
		flex-shrink: 0;
		padding: 0.75rem 0.9rem;
		border-bottom: 1px solid var(--line);
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
	   no carga): mismos tokens, misma caja. El título deja la versalita del inspector. */
	.vega-inspector-head--texts {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--info);
		border-radius: var(--r);
		background: var(--info-soft);
	}

	.vega-inspector-head--texts h2 {
		font-size: 1em;
		font-weight: 600;
		letter-spacing: normal;
		text-transform: none;
		color: var(--ink-hi);
	}

	.vega-inspector-intro {
		margin: 0;
		color: var(--ink);
		font-size: 0.88rem;
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
		padding: 0.9rem;
	}

	/* Tarjeta de sección en «solo textos» (lámina 8): `.vega-fsection` de `RecordForm.svelte`, los
	   mismos tokens, porque el CSS con ámbito de Svelte no cruza componentes. */
	.vega-inspector-body--texts {
		gap: 0.75rem;
		padding: var(--pad-card);
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--paper);
		box-shadow: var(--shadow-card);
		min-width: 0;
	}

	.vega-inspector-block-title {
		margin: 0;
		overflow-wrap: anywhere;
		font-size: 0.95em;
		font-weight: 650;
		color: var(--ink-hi);
	}

	/* Cabecera de sección (lámina 8, `.vega-visual-texts-head`): rótulo de tarjeta (`.vega-fsection
	   h2`) + marca de «sin guardar» (`.vega-visual-dirty` de la barra, mismo punto de 8 px). */
	.vega-texts-head {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}

	.vega-texts-head h3 {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
		margin: 0;
		font-size: 0.76em;
		font-weight: 650;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}

	.vega-texts-dirty {
		display: inline-block;
		flex-shrink: 0;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--warning);
		overflow: hidden;
	}

	.vega-visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		border: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
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
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
