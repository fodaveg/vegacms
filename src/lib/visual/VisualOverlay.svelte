<script lang="ts">
	/**
	 * Contornos de selección del editor visual (tarea "contornos de selección", §"Visual editing
	 * bridge" de `docs/PROJECT-CONTRACT-v1.md`, ampliada por la tarea "acciones estructurales desde
	 * el editor visual"): pinta, ENCIMA del iframe de `VisualEditorScreen.svelte`, una caja por
	 * bloque que reporta el puente (`bridge-client.ts#VisualBlock`) más los estados que hay antes de
	 * que existan bloques que dibujar — y, desde esta tarea, TAMBIÉN una barra flotante de acciones
	 * sobre el contorno seleccionado y los puntos de inserción entre contornos (ver más abajo, "DOS
	 * capas nuevas"). Vive en un componente propio, y no dentro del `<iframe>`, por la misma razón
	 * que `bridge-client.ts` documenta en su cabecera: el marco es de OTRO origen, Vega no puede
	 * inyectar ni un nodo en su DOM — y aunque pudiera, el contorno heredaría (y ensuciaría) el
	 * CSS del sitio del cliente. Se dibuja fuera, con el `rect` que manda el puente.
	 *
	 * **`pointer-events: none` de arriba abajo, en el contenedor RAÍZ y en cada caja — sigue siendo
	 * la pieza de diseño CENTRAL de este componente, no un detalle.** El lienzo tiene que poder
	 * hacer scroll con normalidad y el sitio tiene que seguir recibiendo los clics de sus propios
	 * enlaces y botones; si una sola caja capturase el puntero, las dos cosas se romperían. El
	 * GRUPO de cajas (`.vega-visual-overlay-boxes`, `aria-hidden`) sigue sin aceptar ningún
	 * `onSelect` ni ningún otro manejador: la selección viaja SIEMPRE por el mensaje `select` del
	 * sitio, que escucha `VisualEditorScreen.svelte`, único dueño del id seleccionado (ver su
	 * cabecera). Se llegó a escribir aquí un prop `onSelect` «para no cambiar la firma cuando
	 * llegue el árbol de secciones» y se quitó: un prop OBLIGATORIO que no dispara nada le hace
	 * creer al siguiente que la vía está viva, y el árbol de secciones no selecciona por aquí, sino
	 * por su propia lista.
	 *
	 * **Tarea "acciones estructurales desde el editor visual": DOS capas nuevas, HERMANAS del
	 * grupo de cajas, cada una con su propio `pointer-events: auto` — SOLO en sus botones, nunca en
	 * el contenedor que las envuelve.** La barra flotante sobre el contorno seleccionado
	 * (`.vega-visual-overlay-toolbar`: duplicar/mover/borrar) y los puntos de inserción entre
	 * contornos (`.vega-visual-overlay-insert-points`: crear EN esa posición) pintan controles DE
	 * VERDAD, así que no pueden vivir dentro de `.vega-visual-overlay-boxes` (que es `aria-hidden`,
	 * ver más abajo: meter un control enfocable ahí sería el antipatrón que esa misma sección
	 * evita) ni heredar sin más el `pointer-events: none` del contenedor raíz (los dejaría
	 * inertes). La solución no rompe la regla de arriba: `pointer-events` es una propiedad
	 * HEREDABLE, así que el contenedor de cada capa nueva no fija nada (sigue heredando `none` del
	 * raíz, transparente al puntero como cualquier otro hueco del lienzo) y solo cada `<button>`
	 * individual pone su propio `pointer-events: auto`, que gana sobre lo heredado. El resultado:
	 * clicar fuera de un botón concreto —incluso dentro del rectángulo que ocupa la capa— sigue
	 * atravesando hasta el sitio, exactamente igual que antes de esta tarea; solo los propios
	 * botones capturan el puntero. Si algún día un clic sobre el sitio deja de seleccionar, la
	 * pieza rota es esta.
	 *
	 * **El resalte por RATÓN queda fuera, y no es un olvido.** Mientras el puntero está sobre un
	 * iframe de otro origen, la ventana padre no recibe NINGÚN evento de ratón (ni `mousemove` ni
	 * `mouseover`: es la misma política de origen que le impide a Vega leer el DOM), y el
	 * protocolo `vega-visual-1` no tiene hoy un mensaje de `hover` del sitio a Vega (§"Site to
	 * Vega" del contrato: solo `ready`/`layout`/`select`/`error`). Capturar el puntero con este
	 * overlay para simularlo arreglaría la apariencia y rompería el scroll del lienzo, que es
	 * justo lo que la regla de arriba prohíbe. Entra cuando se escriba el puente del lado del
	 * sitio (`~/code/vega-astro`) y el contrato gane un mensaje nuevo. Lo que SÍ se pinta es
	 * `highlightedId`: el resalte que MANDA Vega (por ejemplo, al pasar el ratón por una fila del
	 * árbol de secciones de la tarea siguiente), nunca el que detecta.
	 *
	 * **Bloque que el sitio no sabe pintar.** El `type` de un bloque llega igual venga de un
	 * componente real o del fallback visible que `VegaBlocks` renderiza cuando no tiene uno
	 * (§"What the site must annotate" del contrato: "including on the visible fallback it renders
	 * for a block type the site has no component for") — el mensaje `ready`/`layout` no distingue
	 * los dos casos, así que `bridge-client.ts` no puede decirlo. El contraste sí existe, pero en
	 * OTRO sitio: el vocabulario de renderers que el propio sitio anuncia en discovery
	 * (`renderedBlockTypes`, la misma "promesa, no prueba" que `previewVisualEditing` — ver
	 * `backend/port.ts`), que es EXACTAMENTE lo que ya usa `model/load.ts#unsupportedBlockTypeWarnings`
	 * para el mismo contraste del lado del formulario. Por eso `renderedBlockTypes` es un prop de
	 * ESTE componente y no algo que el protocolo tenga que aprender a mandar. `null`/ausente (sin
	 * discovery, o proyecto legacy) = sin contraste posible: ningún bloque se marca, igual que el
	 * equivalente de `model/load.ts`.
	 *
	 * **Doble trazo, siempre — requisito, no adorno.** El contorno se pinta ENCIMA del sitio del
	 * cliente, cuyo fondo Vega no controla ni conoce (§"Visual editing bridge": "the site owns
	 * rendering"), así que un trazo de un solo color desaparece contra la mitad de los fondos
	 * posibles. La pareja de tokens `--paper`/`--ink-hi` da SIEMPRE un tono claro y uno oscuro, en
	 * cualquier tema y en cualquier modo (claro/oscuro) de la propia Vega — por definición la
	 * tinta de título tiene que leerse sobre el papel (§3 del vocabulario de temas), así que da
	 * igual cuál de los dos sea el claro en este modo: siempre hay uno de cada, y el par está
	 * MEDIDO, no afirmado (`['ink-hi', 'paper']` en `COMPONENT_CONTRAST_PAIRS`,
	 * `scripts/build-themes.mjs`, ≥4.5:1 en los 21 temas × 2 modos). Nunca un color a pelo
	 * (`scripts/check-theme-coverage.mjs` lo prohíbe fuera de `src/lib/themes/`). La ETIQUETA usa
	 * la misma pareja como fondo sólido en vez de trazo doble: un relleno opaco no necesita
	 * bracket, es inmune de por sí a lo que haya detrás. La unsoportada cambia de pareja
	 * (`--warning`/`--warning-soft`, también medida en el mismo gate) para separar "qué tipo es"
	 * de "está seleccionado", que es un eje aparte (color del contorno, ver CSS).
	 *
	 * **Decorativo para el lector de pantalla — el grupo de cajas, no el componente entero.** El
	 * grupo de cajas lleva `aria-hidden="true"`: la vía accesible de SELECCIONAR es el árbol de
	 * secciones (`VisualBlockTree.svelte`), no este overlay — meter aquí un control real y
	 * enfocable dentro de un `aria-hidden` sería el antipatrón contrario (interactivo pero
	 * invisible para quien no usa ratón), y es justo lo que la regla de arriba evita. Los ESTADOS
	 * (cargando/sin bloques/bloques mal descritos) ya vivían en su propia región
	 * `aria-live="polite"`, separada del grupo decorativo, porque esos sí son información y no
	 * adorno — la barra flotante y los puntos de inserción (ver más abajo) son la MISMA idea
	 * llevada a controles interactivos: viven FUERA del `aria-hidden`, con su propio nombre
	 * accesible por botón, alcanzables por `Tab` como cualquier otro control de la pantalla. No son
	 * la vía ACCESIBLE que manda (esa sigue siendo el árbol, §encargo de la tarea) — son un atajo
	 * de conveniencia sobre el lienzo, y por eso no intentan sustituir al árbol ni duplican su
	 * `aria-live` de anuncio de reorden (`blocks-state.svelte.ts#announce`): esa región ya vive UNA
	 * vez en `VisualBlockTree.svelte`, y las dos superficies comparten la MISMA instancia de
	 * `blocksState`, así que un reorden disparado desde aquí se anuncia igual.
	 *
	 * **Duplicar/mover/borrar el bloque SELECCIONADO, e insertar uno EN POSICIÓN — tarea
	 * "acciones estructurales desde el editor visual".** `blocksState` llega como prop (la MISMA
	 * instancia de `createBlocksState()` que `VisualEditorScreen.svelte` construyó y que también
	 * usa `VisualBlockTree.svelte`, ver su cabecera: "un solo `createBlocksState` por pantalla").
	 * Este componente no reimplementa ninguna mutación, solo llama a las que ya expone ese módulo:
	 * - **Barra flotante** (`.vega-visual-overlay-toolbar`): SOLO sobre el bloque SELECCIONADO
	 *   (nunca una por caja) — duplicar/subir/bajar/borrar, mismas claves i18n y misma lógica de
	 *   guardas (`structuralBusy`/`anySaving`/`anyDirty`) que las filas del árbol. El diálogo de
	 *   confirmación de borrado vive en `VisualBlockTree.svelte` (comparte `blocksState.pendingDelete`,
	 *   un solo dato, un solo dueño): este componente solo llama a `requestDelete`, nunca pinta su
	 *   propio `<DeleteConfirm>`.
	 * - **Puntos de inserción** (`.vega-visual-overlay-insert-points`): uno ANTES del primer
	 *   contorno, uno DESPUÉS de cada bloque, N+1 en total para N bloques. `handleCreate` de
	 *   `blocks-state.svelte.ts` SIEMPRE añade al final (no sabe crear en una posición concreta,
	 *   ver su cabecera): la forma barata y honesta que pide el encargo es crear y LUEGO reordenar
	 *   con `handleReorder` hasta la posición pedida — la misma receta que `handleDuplicate` ya usa
	 *   por dentro, aquí reutilizada desde fuera porque ese camino no está exportado. **Sin selector
	 *   de tipo**, a diferencia del botón "Añadir" del árbol (que si el manifiesto declara varios
	 *   abre su menú, §encargo punto 1): un punto de inserción usa el PRIMER tipo declarado (o
	 *   ninguno en modo homogéneo). Elegir tipo con precisión es lo que el árbol ya resuelve bien;
	 *   montar aquí un menú desplegable por cada uno de los N+1 huecos no pagaba su complejidad
	 *   para este lote — documentado para que se pueda desmentir si algún día hace falta.
	 * - **Tras cada mutación que de verdad cambió algo**, `onStructuralChange()` — el mismo camino
	 *   que `VisualInspector.svelte#onBlockSaved` ya usa para pedir un token de vista previa nuevo
	 *   (`VisualEditorScreen.svelte#requestPreview`, ver su cabecera): un bloque insertado/movido/
	 *   duplicado/borrado no cambia el lienzo solo, hay que recargar el marco.
	 * - **Borrar el seleccionado limpia la selección SOLA**, sin que este componente escriba nada:
	 *   `onStructuralChange()` fuerza un token nuevo → el `<iframe>` recarga → el sitio ya no
	 *   reporta ese id → `VisualEditorScreen.svelte#onState` (único escritor de `selectedBlockId`,
	 *   ver su cabecera) lo limpia. Un segundo escritor aquí sería el bug de "dos efectos, un solo
	 *   estado" que ese módulo evita a propósito.
	 *
	 * **Arrastrar una sección por el lienzo hasta su sitio — tarea "reordenar arrastrando en el
	 * lienzo".** Ni un motor de reordenación nuevo ni un segundo anuncio accesible: el asa (`⠿`)
	 * de la barra flotante cablea `createReorderDndController` (`$lib/list/reorder-dnd.ts`), el
	 * MISMO controlador que ya usan `RecordTable`, `MergedViewTable` y `RecordBlocks`, y la caída
	 * acaba en `blocksState.handleReorder`, que por dentro llama a `computeReorder` y escribe el
	 * anuncio por voz de la posición resultante (`blocks-state.svelte.ts#announce`, region
	 * `aria-live` que vive UNA vez en `VisualBlockTree.svelte`, ver más arriba). El asa además
	 * hereda GRATIS el fallback de teclado del controlador (`ArrowUp`/`ArrowDown` mueven sin un
	 * paso previo de "agarrar"), que es lo que mantiene la vía accesible sin escribir nada nuevo.
	 *
	 * **Por qué hay una capa de destinos que solo existe DURANTE el arrastre**
	 * (`.vega-visual-overlay-drop-zones`, la complicación real que anticipaba el encargo). El
	 * puntero pasa por encima de un `<iframe>` de otro origen, así que Vega no ve NINGÚN evento de
	 * ratón del interior (misma política que documenta "El resalte por RATÓN queda fuera", más
	 * arriba) — tampoco los `dragover`/`drop`, que van al documento de dentro. La única forma de
	 * que la caída se calcule en Vega es poner, encima del marco, elementos PROPIOS que sí los
	 * reciban: una caja por bloque, colocada con el `rect` que ya reporta el puente, con
	 * `pointer-events: auto`. Eso es exactamente lo que la regla central del componente prohíbe...
	 * salvo mientras hay un arrastre en vuelo, que es cuando el sitio no puede recibir clics de
	 * todos modos. Por eso la capa se MONTA y se DESMONTA con `dragState.fromIndex` en vez de estar
	 * siempre ahí con `pointer-events` conmutado: fuera del gesto no existe ni un nodo que pueda
	 * robar el puntero, y el scroll y los enlaces del sitio siguen intactos por construcción, no
	 * por disciplina. Es el mismo remedio que `VisualEditorScreen.svelte` ya usa para las manillas
	 * de columna (ver su cabecera, "El escudo del arrastre"), aquí en forma de N destinos en vez de
	 * una sola capa ciega, porque este gesto necesita saber SOBRE CUÁL se ha soltado.
	 *
	 * **Dos espacios de índices, y por qué la conversión es por ID.** El controlador trabaja en
	 * índices del array del PUENTE (`blocks`, que es el orden que se ve en pantalla y sobre el que
	 * el autor apunta); `handleReorder` los quiere de `blocksState.records`. Los dos coinciden en
	 * el caso sano, pero no se da por hecho: `recordIndexForBlock` traduce por id, y si un extremo
	 * no resuelve (id fantasma en cualquier dirección, ver la cabecera del árbol, "Ids") el
	 * reorden no se intenta — mejor no mover nada que mover el bloque equivocado.
	 */
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import {
		createReorderDndController,
		dropIndicatorEdge,
		type ReorderDragState
	} from '$lib/list/reorder-dnd';
	import type { VisualBlock } from './bridge-client';
	import type { BlocksState } from '$lib/form/blocks-state.svelte';

	/**
	 * `'waiting'` mientras el puente no ha contestado al saludo con un `ready` (no hay bloques que
	 * puedan ser ciertos todavía); `'ready'` desde el primer `ready`, aunque `blocks` venga vacío.
	 * La diferencia entre "no ha contestado" y "contestó que no hay bloques" es la que separa el
	 * estado "Cargando" del estado "Sin bloques todavía" (§tarea) — ninguno de los dos se puede
	 * deducir solo de `blocks.length`, así que hace falta este prop aparte.
	 */
	type VisualOverlayStatus = 'waiting' | 'ready';

	interface Props {
		blocks: VisualBlock[];
		selectedId: string | null;
		highlightedId: string | null;
		/** Bloques que el sitio describió mal y `bridge-client.ts` descartó del array de arriba
		 *  (ver `parseBlocks`): se cuentan, no se esconden. */
		skippedBlocks: number;
		status: VisualOverlayStatus;
		/** Ver cabecera, "Bloque que el sitio no sabe pintar". `undefined`/`null` = sin
		 *  vocabulario de renderers que contrastar: ningún bloque se marca no soportado. */
		renderedBlockTypes?: readonly string[] | null;
		/** Instancia ÚNICA de la pantalla (ver cabecera), la MISMA que `VisualBlockTree.svelte`
		 *  recibe — nunca construida aquí. */
		blocksState: BlocksState;
		/** Una mutación estructural que de verdad cambió algo acaba de completarse (ver cabecera). */
		onStructuralChange: () => void;
	}

	let {
		blocks,
		selectedId,
		highlightedId,
		skippedBlocks,
		status,
		renderedBlockTypes = null,
		blocksState,
		onStructuralChange
	}: Props = $props();

	const ctx = getVegaContext();

	/** `type` de cada bloque contra el vocabulario que el sitio anuncia (ver cabecera). Un `Set`
	 *  por render evita un `includes` lineal por bloque cuando la lista de renderers crece. */
	const decoratedBlocks = $derived.by(() => {
		const rendered = renderedBlockTypes ? new Set(renderedBlockTypes) : null;
		return blocks.map((block) => ({
			block,
			unsupported: rendered !== null && !rendered.has(block.type)
		}));
	});

	// ————— Barra flotante del seleccionado (ver cabecera) —————

	/** Deliberadamente en las DOS listas (registro de `blocksState` Y `rect` que reporta el
	 *  puente): la barra necesita el registro para actuar (duplicar/borrar/mover) y el `rect` para
	 *  posicionarse — si cualquiera de los dos falta (id fantasma en cualquier dirección, ver la
	 *  cabecera del árbol, "Ids"), no hay barra que pintar ni sitio honesto donde ponerla. */
	const selectedRecord = $derived(
		selectedId === null ? null : (blocksState.records.find((r) => r.id === selectedId) ?? null)
	);
	const selectedBridgeBlock = $derived(
		selectedId === null ? null : (blocks.find((b) => b.id === selectedId) ?? null)
	);
	const selectedIndex = $derived(
		selectedRecord === null ? -1 : blocksState.records.findIndex((r) => r.id === selectedId)
	);
	/** Mismo criterio de guarda que `RecordBlocks.svelte`/`VisualBlockTree.svelte`: crear/duplicar/
	 *  mover se congelan mientras haya un borrador sin guardar en CUALQUIER bloque, un guardado en
	 *  vuelo, o ya otra mutación estructural en marcha. */
	const structuralGuard = $derived(
		blocksState.anyDirty || blocksState.anySaving || blocksState.structuralBusy
	);
	/** Hueco desde el borde SUPERIOR del bloque seleccionado hasta la barra, hacia DENTRO.
	 *
	 *  Antes iba hacia fuera (`rect.top - 44`, o sea flotando ENCIMA del contorno) y se veía mal:
	 *  entre dos bloques pegados no hay hueco, así que la barra del bloque elegido caía dentro del
	 *  ANTERIOR y parecía pertenecerle. Lo cazó una captura, no el gate — un test que comprueba
	 *  que la barra existe y apunta al bloque correcto pasa igual con la barra pintada encima del
	 *  vecino. Dentro y arriba no tiene ese problema: el bloque seleccionado siempre tiene su
	 *  propia altura por debajo, y de paso desaparece el recorte del bloque pegado al borde de
	 *  arriba, que es lo que obligaba al `Math.max(0, …)`. */
	const TOOLBAR_INSET = 8;

	async function handleDuplicateSelected(): Promise<void> {
		if (!selectedRecord) return;
		await blocksState.handleDuplicate(selectedRecord);
		onStructuralChange();
	}

	/** Ver cabecera, "Borrar el seleccionado limpia la selección SOLA": esta función NO toca
	 *  `selectedId` para nada, solo abre el diálogo que `VisualBlockTree.svelte` pinta. */
	function handleDeleteSelected(): void {
		if (!selectedRecord) return;
		blocksState.requestDelete(selectedRecord);
	}

	/** `handleReorder` SÍ trae señal de éxito (a diferencia de crear/duplicar/borrar): solo se pide
	 *  vista previa nueva si de verdad cambió algo. */
	async function handleMoveSelected(direction: -1 | 1): Promise<void> {
		if (selectedIndex < 0) return;
		const target = selectedIndex + direction;
		if (target < 0 || target >= blocksState.records.length) return;
		const moved = await blocksState.handleReorder(selectedIndex, target);
		if (moved) onStructuralChange();
	}

	// ————— Arrastrar en el lienzo (ver cabecera) —————

	/** Espejo local del estado EN VUELO del controlador, para pintar el bloque agarrado y la guía
	 *  de dónde caería. En índices del PUENTE (ver cabecera, "Dos espacios de índices"). */
	let dragState = $state<ReorderDragState>({ fromIndex: null, overIndex: null });

	/** Posición del bloque seleccionado dentro de `blocks`, que es el espacio de índices en el que
	 *  habla el controlador — NO `selectedIndex`, que es el de `blocksState.records`. */
	const selectedBridgeIndex = $derived(
		selectedId === null ? -1 : blocks.findIndex((b) => b.id === selectedId)
	);

	/** Traduce un índice del puente al de `blocksState.records`, por id. `-1` si no resuelve (ver
	 *  cabecera): quien llame decide, y en esta tarea la decisión es no mover nada. */
	function recordIndexForBlock(bridgeIndex: number): number {
		const block = blocks[bridgeIndex];
		if (!block) return -1;
		return blocksState.records.findIndex((r) => r.id === block.id);
	}

	/** Única salida del arrastre y del fallback de teclado del asa. `handleReorder` trae señal de
	 *  éxito (igual que en `handleMoveSelected`): solo se pide vista previa nueva si de verdad
	 *  cambió algo. Su propio guard interno es el que frena si hay borradores sin guardar — aquí no
	 *  se repite, mismo criterio que `handleInsert`. */
	async function reorderFromCanvas(fromBridge: number, toBridge: number): Promise<void> {
		const from = recordIndexForBlock(fromBridge);
		const to = recordIndexForBlock(toBridge);
		if (from === -1 || to === -1 || from === to) return;
		const moved = await blocksState.handleReorder(from, to);
		if (moved) onStructuralChange();
	}

	const dnd = createReorderDndController(
		(from, to) => void reorderFromCanvas(from, to),
		() => blocks.length,
		(state) => (dragState = state)
	);

	// ————— Puntos de inserción (ver cabecera) —————

	interface InsertPoint {
		/** Índice, dentro de `blocksState.records`, en el que debería caer una sección insertada
		 *  ANTES del bloque `position`-ésimo que reporta el puente (`position === blocks.length` ⇒
		 *  al final). Coincide con el índice bridge por construcción (ver `insertPoints` de abajo). */
		position: number;
		/** Coordenada Y, mismo sistema que `block.rect` (coordenadas del `<iframe>`, ver cabecera
		 *  del componente): borde superior del primer bloque, punto medio entre cada par
		 *  consecutivo, borde inferior del último. */
		top: number;
	}

	/** N+1 puntos para N bloques que el puente reporta — vacío mientras no hay bloques CIERTOS
	 *  (`status !== 'ready'`) o el sitio no describe ninguno: sin un solo `rect`, no hay coordenada
	 *  honesta donde pintar "insertar aquí" (el árbol, cuyo botón "Añadir" no depende de rects,
	 *  sigue siendo el camino cuando el lienzo está vacío). */
	const insertPoints = $derived.by((): InsertPoint[] => {
		if (status !== 'ready' || blocks.length === 0) return [];
		const points: InsertPoint[] = [{ position: 0, top: blocks[0].rect.top }];
		for (let i = 1; i < blocks.length; i++) {
			const prevBottom = blocks[i - 1].rect.top + blocks[i - 1].rect.height;
			const nextTop = blocks[i].rect.top;
			points.push({ position: i, top: (prevBottom + nextTop) / 2 });
		}
		const last = blocks[blocks.length - 1];
		points.push({ position: blocks.length, top: last.rect.top + last.rect.height });
		return points;
	});

	/** Índice, dentro de `blocksState.records`, en el que cae `position` (ver `InsertPoint`).
	 *  Defensivo (ver cabecera del árbol, "Ids"): si el id que reporta el puente en `position` no
	 *  casa con ningún registro, cae al final en vez de reventar — degradación, no error. */
	function recordIndexForInsertion(position: number): number {
		if (position >= blocks.length) return blocksState.records.length;
		const targetId = blocks[position].id;
		const idx = blocksState.records.findIndex((r) => r.id === targetId);
		return idx === -1 ? blocksState.records.length : idx;
	}

	/** Crea y LUEGO reordena hasta `position` (ver cabecera, "Puntos de inserción" — la receta que
	 *  el encargo pide por escrito cuando `handleCreate` no sabe crear en una posición concreta). */
	async function handleInsert(position: number): Promise<void> {
		const target = recordIndexForInsertion(position);
		const before = blocksState.records.length;
		const blockType = blocksState.hasTypeMenu ? (blocksState.blockTypes[0] ?? null) : null;
		await blocksState.handleCreate(blockType);
		if (blocksState.records.length !== before + 1) return; // creación fallida, `ctx.feedback` ya avisó
		const newIndex = blocksState.records.length - 1;
		// Si hay bloques con cambios sin guardar, `handleReorder` se niega (guard interno, ver su
		// cabecera de `blocks-state.svelte.ts`): la sección nueva queda creada pero al FINAL en vez
		// de en la posición pedida. No se repite aquí un segundo guard delante — el mismo criterio
		// que ya protege el reorden basta, y el autor sigue viendo la sección nueva (solo que no
		// exactamente donde la pidió).
		if (newIndex !== target) await blocksState.handleReorder(newIndex, target);
		onStructuralChange();
	}
</script>

<!-- `pointer-events: none` INLINE (`style:`), no solo en el `<style>` de abajo (ver cabecera,
     "pointer-events: none de arriba abajo"): un estilo en línea gana a cualquier regla externa
     por especificidad, así que ni una clase modificadora futura ni un tema puede reintroducir el
     puntero por accidente — la regla más importante del componente no depende de que nadie
     recuerde no tocarla en el CSS de más abajo. -->
<div class="vega-visual-overlay-root" style:pointer-events="none">
	<!-- Decorativo (ver cabecera): el propio grupo de cajas, aparte de la región de estados de
	     abajo. -->
	<div class="vega-visual-overlay-boxes" aria-hidden="true">
		{#each decoratedBlocks as { block, unsupported } (block.id)}
			<div
				class="vega-visual-overlay-box"
				class:vega-visual-overlay-box--selected={block.id === selectedId}
				class:vega-visual-overlay-box--highlighted={block.id === highlightedId}
				data-vega-block-id={block.id}
				style:pointer-events="none"
				style:top="{block.rect.top}px"
				style:left="{block.rect.left}px"
				style:width="{block.rect.width}px"
				style:height="{block.rect.height}px"
			>
				<span
					class="vega-visual-overlay-label"
					class:vega-visual-overlay-label--unsupported={unsupported}
				>
					{block.type}
					{#if unsupported}
						<Icon id="warning" size={12} />
						<span>({ctx.t('editor.visual.overlay.unsupported')})</span>
					{/if}
				</span>
			</div>
		{/each}
	</div>

	<!-- Barra flotante del seleccionado (ver cabecera, "Duplicar/mover/borrar"): HERMANA del grupo
	     de cajas, no `aria-hidden` — controles de verdad. El contenedor NO fija `pointer-events`
	     (hereda `none` del raíz); solo cada `<button>` lo pone en `auto`. -->
	{#if !blocksState.hidden && selectedRecord && selectedBridgeBlock}
		{@const label = blocksState.blockTitle(selectedRecord)}
		<div
			class="vega-visual-overlay-toolbar"
			role="group"
			aria-label={ctx.t('editor.visual.overlay.toolbar.label', { label })}
			style:top="{selectedBridgeBlock.rect.top + TOOLBAR_INSET}px"
			style:left="{selectedBridgeBlock.rect.left +
				selectedBridgeBlock.rect.width -
				TOOLBAR_INSET}px"
		>
			<!-- Asa de arrastre (ver cabecera, "Arrastrar una sección por el lienzo"): mismo glifo,
			     misma clave de rótulo y mismo cableado del controlador que el asa de `RecordBlocks`
			     y de las dos tablas. `draggable` cae a la vez que `disabled` para que un bloque
			     congelado por el guard tampoco se pueda agarrar (un `disabled` no basta: el arrastre
			     nativo no lo mira). -->
			<button
				type="button"
				class="vega-visual-overlay-toolbar-btn vega-visual-overlay-handle"
				style:pointer-events="auto"
				disabled={structuralGuard || selectedBridgeIndex < 0}
				draggable={!structuralGuard && selectedBridgeIndex >= 0}
				aria-label={ctx.t('list.reorder.handleLabel', { label })}
				ondragstart={(event) => dnd.handleDragStart(event, selectedBridgeIndex)}
				ondragend={dnd.handleDragEnd}
				onkeydown={(event) => dnd.handleHandleKeydown(event, selectedBridgeIndex)}
			>
				<span aria-hidden="true">⠿</span>
			</button>
			{#if blocksState.blockDuplicateAllowed}
				<button
					type="button"
					class="vega-visual-overlay-toolbar-btn"
					style:pointer-events="auto"
					disabled={structuralGuard}
					aria-label={ctx.t('editor.blocks.duplicateLabel', { label })}
					onclick={() => void handleDuplicateSelected()}
				>
					<Icon id="copy" size={14} />
				</button>
			{/if}
			<button
				type="button"
				class="vega-visual-overlay-toolbar-btn"
				style:pointer-events="auto"
				disabled={selectedIndex <= 0 || structuralGuard}
				aria-label={ctx.t('editor.blocks.moveUpLabel', { label })}
				onclick={() => void handleMoveSelected(-1)}
			>
				<span class="vega-visual-overlay-toolbar-icon vega-visual-overlay-toolbar-icon--up">
					<Icon id="chevron" size={14} />
				</span>
			</button>
			<button
				type="button"
				class="vega-visual-overlay-toolbar-btn"
				style:pointer-events="auto"
				disabled={selectedIndex < 0 ||
					selectedIndex >= blocksState.records.length - 1 ||
					structuralGuard}
				aria-label={ctx.t('editor.blocks.moveDownLabel', { label })}
				onclick={() => void handleMoveSelected(1)}
			>
				<span class="vega-visual-overlay-toolbar-icon vega-visual-overlay-toolbar-icon--down">
					<Icon id="chevron" size={14} />
				</span>
			</button>
			<button
				type="button"
				class="vega-visual-overlay-toolbar-btn vega-visual-overlay-toolbar-btn--danger"
				style:pointer-events="auto"
				disabled={blocksState.anySaving || blocksState.structuralBusy}
				aria-label={ctx.t('list.delete.rowButtonLabel', { label })}
				onclick={handleDeleteSelected}
			>
				<Icon id="trash" size={14} />
			</button>
		</div>
	{/if}

	<!-- Destinos del arrastre (ver cabecera, "Por qué hay una capa de destinos que solo existe
	     DURANTE el arrastre"): montada y desmontada con el gesto, nunca presente en reposo. Es la
	     ÚNICA parte de este componente que captura el puntero sobre el área del sitio, y solo
	     mientras el sitio no puede recibir clics de todas formas. Decorativa para el lector de
	     pantalla: la vía accesible de reordenar son las flechas sobre el asa y el árbol, no esto. -->
	{#if dragState.fromIndex !== null}
		<div class="vega-visual-overlay-drop-zones" aria-hidden="true">
			{#each blocks as block, i (block.id)}
				{@const edge =
					dragState.overIndex === i
						? dropIndicatorEdge(dragState.fromIndex, dragState.overIndex)
						: null}
				<!-- `role="presentation"`: el nodo NO es un control, solo una superficie que recibe
				     `dragover`/`drop` mientras dura el gesto (el árbol y las flechas del asa son la
				     vía accesible). Sin el rol explícito, el compilador exige uno por llevar
				     manejadores de arrastre (`a11y_no_static_element_interactions`). -->
				<div
					role="presentation"
					class="vega-visual-overlay-drop-zone"
					class:vega-visual-overlay-drop-zone--source={dragState.fromIndex === i}
					class:vega-visual-overlay-drop-zone--before={edge === 'before'}
					class:vega-visual-overlay-drop-zone--after={edge === 'after'}
					style:pointer-events="auto"
					style:top="{block.rect.top}px"
					style:left="{block.rect.left}px"
					style:width="{block.rect.width}px"
					style:height="{block.rect.height}px"
					ondragover={(event) => dnd.handleDragOver(event, i)}
					ondrop={(event) => dnd.handleDrop(event, i)}
				></div>
			{/each}
		</div>
	{/if}

	<!-- Puntos de inserción (ver cabecera): mismo criterio de capa hermana + `pointer-events` solo
	     en los botones. Se retiran MIENTRAS dura un arrastre: caen justo en los huecos entre
	     contornos, que es donde el puntero suelta, y un botón sin manejador de `drop` se traga el
	     evento y cancela el gesto sin decir nada. Insertar durante un arrastre no es una acción
	     posible, así que no se pierde nada quitándolos. -->
	{#if !blocksState.hidden && insertPoints.length > 0 && dragState.fromIndex === null}
		<div class="vega-visual-overlay-insert-points">
			{#each insertPoints as point (point.position)}
				<button
					type="button"
					class="vega-visual-overlay-insert"
					style:top="{point.top}px"
					style:pointer-events="auto"
					disabled={blocksState.structuralBusy || blocksState.anySaving}
					aria-label={ctx.t('editor.visual.overlay.insertLabel', {
						position: point.position + 1,
						total: insertPoints.length
					})}
					onclick={() => void handleInsert(point.position)}
				>
					<Icon id="plus" size={14} />
				</button>
			{/each}
		</div>
	{/if}

	<!-- Informativo, NO decorativo (ver cabecera): estados que sí hay que anunciar. -->
	<div class="vega-visual-overlay-status" aria-live="polite">
		{#if status === 'waiting'}
			<p>{ctx.t('editor.visual.overlay.waiting')}</p>
		{:else if blocks.length === 0}
			<p>{ctx.t('editor.visual.overlay.empty')}</p>
		{/if}
		{#if status === 'ready' && skippedBlocks > 0}
			<p class="vega-visual-overlay-status--warning">
				{ctx.t('editor.visual.overlay.skipped', { count: skippedBlocks })}
			</p>
		{/if}
	</div>
</div>

<style>
	/* Cubre exactamente el mismo hueco que el `<iframe>` (`.vega-visual-canvas` de
	   `VisualEditorScreen.svelte` es `position: relative`, sin padding, así que `inset: 0` cae
	   sobre la misma caja de contenido que el marco: mismas coordenadas que `rect`, sin offset que
	   corregir). `overflow: hidden` recorta contra ESTE contenedor (ver cabecera de la tarea, "un
	   bloque más alto que el lienzo tiene parte del contorno fuera de vista") en vez de depender
	   solo del `overflow: hidden` que ya tiene `.vega-visual-canvas` — así el componente se recorta
	   solo aunque algún día viva dentro de otro contenedor. */
	.vega-visual-overlay-root {
		position: absolute;
		inset: 0;
		overflow: hidden;
		/* `pointer-events: none` va INLINE (`style:`, ver el marcado): aquí solo el resto de la
		   caja. */
	}

	.vega-visual-overlay-boxes {
		position: absolute;
		inset: 0;
	}

	/* Doble trazo `--paper`/`--ink-hi` (ver cabecera, "Doble trazo, siempre"): el primer
	   `box-shadow` es el anillo INTERIOR (pegado al borde del `rect`), el segundo el EXTERIOR —
	   entre los dos, un píxel de cada tono, así que uno de los dos siempre se lee contra
	   cualquier fondo del sitio. `--accent` de en medio en highlighted/selected es solo el color de
	   ESTADO: si desapareciera contra un fondo dado, el bracket claro/oscuro sigue marcando el
	   borde igual. */
	.vega-visual-overlay-box {
		position: absolute;
		/* `pointer-events: none` también INLINE aquí (ver el marcado): la instrucción es "en el
		   contenedor Y en las cajas", explícito en las dos, no heredado de una — así una caja no
		   se rompe si algún día se mueve fuera de este árbol. */
		border-radius: calc(var(--r) / 2);
		box-shadow:
			0 0 0 1px var(--paper),
			0 0 0 2px var(--ink-hi);
	}

	.vega-visual-overlay-box--highlighted {
		box-shadow:
			0 0 0 1px var(--paper),
			0 0 0 2px var(--accent),
			0 0 0 3px var(--ink-hi);
	}

	/* Seleccionada gana sobre resaltada si algún día coinciden (mismo bloque en las dos): un
	   anillo más grueso, no un color distinto — la etiqueta ya dice el tipo, el grosor dice
	   "esta es la que tienes abierta". */
	.vega-visual-overlay-box--selected {
		box-shadow:
			0 0 0 1px var(--paper),
			0 0 0 3px var(--accent),
			0 0 0 4px var(--ink-hi);
	}

	/* Relleno OPACO (ver cabecera): no necesita bracket, un fondo sólido ya es inmune a lo que
	   haya detrás. `--ink-hi`/`--paper` es el mismo par medido ≥4.5:1 que el contorno, aquí como
	   fondo/tinta en vez de trazo. */
	.vega-visual-overlay-label {
		position: absolute;
		top: 0;
		left: 0;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		max-width: calc(100% - 0.5rem);
		padding: 0.1rem 0.4rem;
		border-radius: var(--r);
		background: var(--ink-hi);
		color: var(--paper);
		font-size: 0.7rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Par `warning`/`warning-soft`, mismo gate (ver cabecera): separa "tipo no soportado" del eje
	   de selección, que vive en el contorno de arriba, no aquí. */
	.vega-visual-overlay-label--unsupported {
		background: var(--warning-soft);
		color: var(--warning);
	}

	/* Franja de estados (ver cabecera, "Informativo, NO decorativo"): flota en la esquina en vez
	   de empujar el lienzo, mismo criterio que `.vega-visual-overlay` (skeleton del token) de
	   `VisualEditorScreen.svelte` — cubre información, no bloquea la lectura del sitio detrás
	   salvo en la esquina que ocupa. Vacía (nada que decir) no pinta nada visible: los `<p>` de
	   dentro son los únicos con fondo. */
	.vega-visual-overlay-status {
		position: absolute;
		left: 0.75rem;
		bottom: 0.75rem;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.35rem;
		max-width: calc(100% - 1.5rem);
	}

	.vega-visual-overlay-status p {
		margin: 0;
		padding: 0.35rem 0.6rem;
		border-radius: var(--r);
		background: var(--surface-2);
		box-shadow: var(--shadow-card);
		color: var(--ink);
		font-size: 0.8125rem;
	}

	.vega-visual-overlay-status--warning {
		color: var(--warning);
	}

	/* Barra flotante del seleccionado (ver cabecera, "Duplicar/mover/borrar"): posicionada por
	   `top`/`left` en línea (mismo sistema de coordenadas que `.vega-visual-overlay-box`, ver el
	   marcado), NUNCA `pointer-events` propio — lo hereda `none` del raíz, solo cada botón lo
	   reactiva (ver cabecera, "DOS capas nuevas"). */
	.vega-visual-overlay-toolbar {
		position: absolute;
		/* `left` viene con el borde DERECHO del bloque (ver el marcado): esto la trae de vuelta su
		   propio ancho, que es lo que la deja pegada a la derecha DENTRO del contorno sin tener
		   que medir la barra en JS. La esquina izquierda ya la ocupa la etiqueta del tipo de
		   bloque (`.vega-visual-overlay-label`). */
		transform: translateX(-100%);
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
		padding: 0.2rem;
		border-radius: var(--r);
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}

	.vega-visual-overlay-toolbar-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.7rem;
		height: 1.7rem;
		border: 0;
		border-radius: calc(var(--r) / 1.5);
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
	}

	.vega-visual-overlay-toolbar-btn:hover:not(:disabled) {
		background: var(--active);
		color: var(--ink);
	}

	.vega-visual-overlay-toolbar-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.vega-visual-overlay-toolbar-btn:disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}

	.vega-visual-overlay-toolbar-btn--danger:hover:not(:disabled) {
		background: var(--danger-soft);
		color: var(--danger);
	}

	/* Mismo truco que `.vega-tree-action-icon` de `VisualBlockTree.svelte`: el `chevron` apunta a
	   la derecha por defecto, rotado -90°/90° da arriba/abajo sin un glifo nuevo. */
	.vega-visual-overlay-toolbar-icon {
		display: inline-flex;
	}

	.vega-visual-overlay-toolbar-icon--up {
		transform: rotate(-90deg);
	}

	.vega-visual-overlay-toolbar-icon--down {
		transform: rotate(90deg);
	}

	/* Puntos de inserción (ver cabecera): un botón circular pequeño, centrado horizontalmente,
	   sobre cada coordenada Y calculada en el script. `left: 50%` + `translate` en vez de un ancho
	   del 100% con icono centrado: así la línea entre contornos no reclama el ancho entero como
	   zona clicable — un punto concreto es más honesto que una franja invisible del ancho del
	   lienzo capturando el puntero de un `hover` que no puede detectar (ver cabecera del
	   componente, "El resalte por RATÓN queda fuera"). */
	.vega-visual-overlay-insert-points {
		position: absolute;
		inset: 0;
	}

	.vega-visual-overlay-insert {
		position: absolute;
		left: 50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		border: 1px solid var(--line);
		border-radius: 50%;
		background: var(--surface);
		color: var(--ink-2);
		box-shadow: var(--shadow-card);
		cursor: pointer;
		transform: translate(-50%, -50%);
	}

	.vega-visual-overlay-insert:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.vega-visual-overlay-insert:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.vega-visual-overlay-insert:disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}

	/* El asa es lo único de la barra que se agarra: el cursor lo dice antes de intentarlo. */
	.vega-visual-overlay-handle {
		cursor: grab;
	}

	.vega-visual-overlay-handle:active {
		cursor: grabbing;
	}

	.vega-visual-overlay-handle:disabled {
		cursor: not-allowed;
	}

	/* Destinos del arrastre (ver cabecera): esta capa solo existe mientras hay un gesto en vuelo,
	   así que no necesita ninguna cautela de `pointer-events` en reposo — en reposo no está. */
	.vega-visual-overlay-drop-zones {
		position: absolute;
		inset: 0;
	}

	.vega-visual-overlay-drop-zone {
		position: absolute;
	}

	/* El bloque agarrado, atenuado: mismo lenguaje que `.vega-block-row--dragging` de
	   `RecordBlocks.svelte`, aquí como velo sobre el sitio porque no podemos atenuar su contenido
	   (vive dentro del iframe, que es de otro origen). */
	.vega-visual-overlay-drop-zone--source {
		background: var(--paper);
		opacity: 0.45;
	}

	/* Guía de dónde va a caer. Doble trazo `--paper`/`--ink-hi` alrededor del `--accent` por el
	   mismo motivo que el contorno (ver cabecera, "Doble trazo, siempre"): se pinta sobre el fondo
	   del sitio del cliente, que Vega no conoce, así que un solo color desaparecería contra la
	   mitad de los fondos posibles. */
	.vega-visual-overlay-drop-zone--before::before,
	.vega-visual-overlay-drop-zone--after::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 3px;
		border-radius: 2px;
		background: var(--accent);
		box-shadow:
			0 0 0 1px var(--paper),
			0 0 0 2px var(--ink-hi);
	}

	.vega-visual-overlay-drop-zone--before::before {
		top: 0;
	}

	.vega-visual-overlay-drop-zone--after::after {
		bottom: 0;
	}

	@media (pointer: coarse) {
		.vega-visual-overlay-toolbar-btn,
		.vega-visual-overlay-insert {
			width: 44px;
			height: 44px;
		}
	}
</style>
