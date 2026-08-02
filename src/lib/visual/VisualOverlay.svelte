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
	 *   por dentro, aquí reutilizada desde fuera porque ese camino no está exportado.
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
	 * **Defecto "el `+` crea sin preguntar el tipo" (corregido en esta tarea): mismo menú de tipos
	 * que el botón "Añadir" del árbol, no uno segundo.** Antes, con `blocksState.hasTypeMenu ===
	 * true`, un punto de inserción creaba directamente con `blockTypes[0]` — en un sitio con
	 * varios tipos, pulsar el `+` metía siempre el primero de la lista sin preguntar, contra lo
	 * que pedía la tarea que creó este botón. Ahora, con `hasTypeMenu`, el `+` abre un menú
	 * anclado a ESE punto (mismo contrato de accesibilidad que `VisualBlockTree.svelte`:
	 * `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`, `role="menu"` con un
	 * `role="menuitem"` por tipo) y la sección se crea con el tipo elegido; sin `hasTypeMenu`
	 * (modo homogéneo, una sola plantilla) el `+` sigue creando directamente, sin menú, igual que
	 * antes. La navegación de flechas/`Home`/`End` vive en `type-menu.ts`, COMPARTIDA con el
	 * árbol (ver su cabecera): dos menús con dos algoritmos de foco escritos a mano es justo el
	 * bug que este párrafo documenta que NO hay que repetir. El MARCADO y el posicionamiento sí
	 * son propios de aquí (ver el CSS, "Menú de tipos del punto de inserción"): el botón del árbol
	 * vive en flujo normal bajo una cabecera fija, el de aquí es un círculo anclado a una
	 * coordenada del lienzo con scroll y zoom — forzarlos a compartir marcado habría acoplado dos
	 * superficies sin necesidad real. Como mucho un menú abierto A LA VEZ (estado
	 * `insertMenuPosition`, no uno por punto): abrir otro cierra el anterior, mismo patrón APG de
	 * menús de un solo nivel. Se cierra también si empieza un arrastre (los puntos de inserción se
	 * retiran durante el gesto, ver más abajo): un menú anclado a un botón que ya no existe es un
	 * nodo huérfano.
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
	 *
	 * **Soltar una sección de la PALETA para crearla EN POSICIÓN — encargo "paleta de bloques
	 * arrastrable del editor visual".** `paletteDragType` (prop, `null` fuera de un gesto de
	 * paleta) es la mitad que le toca a este componente del "un solo escritor" de la decisión 5:
	 * `VisualEditorScreen.svelte` es el dueño, `VisualPalette.svelte` lo escribe por callback, este
	 * componente solo lo LEE. Tres piezas, reutilizando al máximo lo que ya existía:
	 * - **La capa de destinos** (`.vega-visual-overlay-drop-zones`, ver arriba, "Por qué hay una
	 *   capa de destinos...") se monta también con `paletteDragType !== null`, no solo con
	 *   `dragState.fromIndex !== null` — los dos gestos son mutuamente excluyentes (el navegador
	 *   solo permite UN arrastre a la vez), así que `handleZoneDragOver`/`handleZoneDrop` bifurcan
	 *   al principio: con un REORDEN siguen yendo a `dnd` de siempre; con una PALETA no reordenan
	 *   nada, CREAN — la posición sale de `resolveInsertPosition()` (`./insert-position.ts`, mitad
	 *   superior/inferior del bloque `index`-ésimo) contra el `rect` DE VERDAD del propio elemento
	 *   que recibió el `drop` (`getBoundingClientRect()`, en coordenadas de PANTALLA, las mismas
	 *   que `event.clientY` — así el resultado sale correcto pase lo que pase el zoom del lienzo,
	 *   sin que este componente necesite conocer `VisualEditorScreen.svelte#zoomFactor` ni tocar el
	 *   `rect` que reporta el puente, que vive en OTRO sistema de coordenadas, ver su cabecera) y
	 *   la caída llama a `handleInsert(position, paletteDragType)` — el MISMO camino que ya usa el
	 *   `+` de los puntos de inserción, nunca un segundo camino de creación.
	 * - **Los puntos de inserción `+` se retiran también** durante un arrastre de paleta (mismo
	 *   `{#if}` que ya los retiraba durante el reorden): caen justo en los huecos donde se suelta,
	 *   y un menú de tipos abierto se cierra con el mismo `$effect` que ya lo hacía para el reorden.
	 * - **Página vacía + arrastre de paleta en vuelo** (`status === 'ready' && blocks.length === 0`):
	 *   una sola caja SOBRE EL MARCO, que solo existe durante el gesto (mismo criterio que la capa
	 *   de destinos: fuera de él, ni un nodo). Usa el rect del propio marco —`inset: 0` sobre ESTE
	 *   `<div>`, que ya coincide con la caja del `<iframe>` (ver el CSS de más abajo)—, no uno
	 *   inventado: con cero bloques no hay ningún `rect` reportado del que fiarse. Su caída siempre
	 *   es `handleInsert(0, paletteDragType)` — con cero bloques no hay "antes/después" que decidir.
	 */
	import { tick } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import {
		createReorderDndController,
		dropIndicatorEdge,
		type ReorderDragState
	} from '$lib/list/reorder-dnd';
	import { typeMenuItems, typeMenuKeydownIndex } from './type-menu';
	import { resolveInsertPosition } from './insert-position';
	import type { VisualBlock } from './bridge-client';
	import type { BlocksState } from '$lib/form/blocks-state.svelte';
	import type { ResolvedBlockType } from '$lib/model/types';

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
		/** Arrastre de PALETA en vuelo, o `null` fuera de un gesto (ver cabecera, decisión 5 del
		 *  encargo "paleta de bloques arrastrable"): dueño único en `VisualEditorScreen.svelte`,
		 *  este componente solo LO LEE, nunca lo escribe. */
		paletteDragType?: ResolvedBlockType | null;
	}

	let {
		blocks,
		selectedId,
		highlightedId,
		skippedBlocks,
		status,
		renderedBlockTypes = null,
		blocksState,
		onStructuralChange,
		paletteDragType = null
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

	/** Defecto "el lienzo no dice nada cuando le faltan bloques": registros que Vega SÍ tiene
	 *  (`blocksState.records`) y que el sitio NO reportó en `blocks` — lo contrario de
	 *  `skippedBlocks` (que cuenta lo que el sitio describió mal). Pasa siempre que el sitio no
	 *  pinta un registro que Vega conoce (p.ej. una sección sin publicar que la plantilla omite):
	 *  el árbol enseña seis, el lienzo pinta cuatro, y sin este aviso no hay una palabra que lo
	 *  explique.
	 *
	 *  **Por id, no por longitud**: `blocks.length !== records.length` es la comprobación fácil y
	 *  la equivocada — con un id que no case en los dos sentidos a la vez los números pueden
	 *  cuadrar y aun así estar hablando de bloques distintos (mismo criterio que
	 *  `recordIndexForBlock`/`recordIndexForInsertion` de más abajo, "Ids"). Solo se calcula con
	 *  `status === 'ready'`: antes de eso `blocks` no es cierto todavía (ver `VisualOverlayStatus`
	 *  más arriba), así que contar "que faltan" sería contar contra un array que ni siquiera ha
	 *  contestado. */
	const missingBlocks = $derived.by(() => {
		if (status !== 'ready') return 0;
		const reportedIds = new Set(blocks.map((b) => b.id));
		return blocksState.records.filter((r) => !reportedIds.has(r.id)).length;
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
	 *  el encargo pide por escrito cuando `handleCreate` no sabe crear en una posición concreta).
	 *  `blockType` llega ya elegido por quien llama (ver "Menú de tipos del punto de inserción",
	 *  abajo) — esta función no vuelve a decidirlo. */
	async function handleInsert(
		position: number,
		blockType: ResolvedBlockType | null = null
	): Promise<void> {
		const target = recordIndexForInsertion(position);
		const before = blocksState.records.length;
		await blocksState.handleCreate(blockType);
		if (blocksState.records.length !== before + 1) return; // creación fallida, `ctx.feedback` ya avisó
		const newIndex = blocksState.records.length - 1;
		const created = blocksState.records[newIndex];
		// Si hay bloques con cambios sin guardar, `handleReorder` se niega (guard interno, ver su
		// cabecera de `blocks-state.svelte.ts`): la sección nueva queda creada pero al FINAL en vez
		// de en la posición pedida. No se repite aquí un segundo guard delante — el mismo criterio
		// que ya protege el reorden basta, y el autor sigue viendo la sección nueva (solo que no
		// exactamente donde la pidió).
		if (newIndex !== target) await blocksState.handleReorder(newIndex, target);
		onStructuralChange();
		// Anuncio por voz (encargo "paleta de bloques arrastrable", §6): ni `handleCreate` ni este
		// `+` anunciaban nada por sí solos. Se localiza `created` por ID en vez de fiarse de
		// `target` a ciegas —si `handleReorder` se negó por su guard (arriba), la sección se quedó
		// al FINAL, no en `target`— y se anuncia DESPUÉS de que `handleReorder` (si corrió) haya
		// escrito su propio "movido": este `say()` posterior lo sustituye por el mensaje correcto,
		// "creada", no "movida".
		const finalIndex = blocksState.records.findIndex((r) => r.id === created.id);
		if (finalIndex < 0) return;
		blocksState.say(
			ctx.t('editor.visual.tree.announceCreate', {
				label: blocksState.blockTitle(blocksState.records[finalIndex]),
				position: finalIndex + 1,
				total: blocksState.records.length
			})
		);
	}

	// ————— Menú de tipos del punto de inserción (defecto "el `+` crea sin preguntar el tipo",
	// ver cabecera) —————

	/** Posición del ÚNICO punto de inserción con el menú abierto, o `null` — nunca dos a la vez
	 *  (ver cabecera). */
	let insertMenuPosition = $state<number | null>(null);
	/** Disparador del menú abierto (para devolverle el foco al cerrar y para el clic-fuera). */
	let insertMenuTriggerEl = $state<HTMLElement | null>(null);
	let insertMenuEl = $state<HTMLElement | null>(null);

	function insertMenuId(position: number): string {
		return `vega-visual-insert-menu-${position}`;
	}

	function closeInsertMenu(): void {
		insertMenuPosition = null;
		insertMenuTriggerEl = null;
	}

	/** Abre hacia ARRIBA cuando el punto cae en la mitad final de la página (donde vive el caso
	 *  real que motivó el encargo: el punto DESPUÉS del último bloque, "al final de la página") —
	 *  sin medir el lienzo en tiempo real (evitaría montar un `ResizeObserver` solo para esto). No
	 *  es exacto para toda altura de bloque posible, pero cubre el caso reportado y generaliza
	 *  razonablemente a los puntos intermedios de la mitad de abajo; documentado para que se pueda
	 *  desmentir si algún día hace falta más precisión. */
	function insertMenuOpensUpward(position: number): boolean {
		return blocks.length > 0 && position * 2 >= blocks.length;
	}

	function handleInsertClick(position: number, event: MouseEvent): void {
		if (!blocksState.hasTypeMenu) {
			void handleInsert(position);
			return;
		}
		if (insertMenuPosition === position) {
			closeInsertMenu();
			return;
		}
		insertMenuTriggerEl = event.currentTarget as HTMLElement;
		insertMenuPosition = position;
		void tick().then(() => typeMenuItems(insertMenuEl)[0]?.focus());
	}

	function handleInsertMenuSelect(position: number, blockType: ResolvedBlockType): void {
		const trigger = insertMenuTriggerEl;
		closeInsertMenu();
		trigger?.focus();
		void handleInsert(position, blockType);
	}

	/** Navegación de flechas/`Home`/`End` (ver cabecera de `type-menu.ts`): MISMO algoritmo que
	 *  `VisualBlockTree.svelte`, ninguno escrito a mano dos veces. */
	function handleInsertMenuKeydown(event: KeyboardEvent): void {
		const items = typeMenuItems(insertMenuEl);
		const next = typeMenuKeydownIndex(event, items);
		if (next === null) return;
		event.preventDefault();
		items[next]?.focus();
	}

	function handleInsertMenuFocusOut(event: FocusEvent): void {
		if (insertMenuPosition === null) return;
		const next = event.relatedTarget as Node | null;
		if (next && insertMenuEl?.contains(next)) return;
		closeInsertMenu();
	}

	function handleInsertWindowClick(event: MouseEvent): void {
		if (insertMenuPosition === null) return;
		const target = event.target as Node;
		if (insertMenuTriggerEl?.contains(target) || insertMenuEl?.contains(target)) return;
		closeInsertMenu();
	}

	function handleInsertWindowKeydown(event: KeyboardEvent): void {
		if (insertMenuPosition === null || event.key !== 'Escape') return;
		event.preventDefault();
		const trigger = insertMenuTriggerEl;
		closeInsertMenu();
		trigger?.focus();
	}

	/** Un arrastre que empieza con el menú abierto lo cierra (ver cabecera): los puntos de
	 *  inserción se retiran mientras dura el gesto (`{#if ... && dragState.fromIndex === null &&
	 *  paletteDragType === null}` del marcado, cualquiera de los dos gestos), así que un menú que
	 *  siguiera "abierto" en el estado quedaría anclado a un botón que ya no existe — huérfano en
	 *  cuanto el gesto terminara y los puntos volvieran a montarse. */
	$effect(() => {
		if (dragState.fromIndex !== null || paletteDragType !== null) closeInsertMenu();
	});

	// ————— Caída de la PALETA (ver cabecera, "Soltar una sección de la PALETA...") —————

	/** `dragover`/`drop` de la capa de destinos: bifurca según el gesto en vuelo. Los dos son
	 *  mutuamente excluyentes (el navegador solo permite un arrastre a la vez, ver cabecera), así
	 *  que basta con mirar `paletteDragType` para saber a qué camino ir. */
	function handleZoneDragOver(event: DragEvent, index: number): void {
		if (paletteDragType !== null) {
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
			return;
		}
		dnd.handleDragOver(event, index);
	}

	/** Con una PALETA en vuelo, la caída no reordena nada existente: CREA. La posición sale de
	 *  `resolveInsertPosition()` contra el `rect` DE VERDAD del elemento que recibió el `drop` (ver
	 *  cabecera para el porqué de `getBoundingClientRect()` en vez del `rect` que reporta el
	 *  puente), y termina en el MISMO `handleInsert` que ya usa el `+` de los puntos de inserción. */
	function handleZoneDrop(event: DragEvent, index: number): void {
		if (paletteDragType !== null) {
			event.preventDefault();
			const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			const position = resolveInsertPosition(index, event.clientY, rect);
			void handleInsert(position, paletteDragType);
			return;
		}
		dnd.handleDrop(event, index);
	}
</script>

<!-- Nivel superior a la fuerza (`<svelte:window>` no puede vivir dentro de un bloque): clic-fuera
     y `Escape` del menú de tipos del punto de inserción (ver cabecera del script). Ambos salen
     pronto si no hay ningún menú abierto, mismo patrón que `VisualBlockTree.svelte`. -->
<svelte:window onclick={handleInsertWindowClick} onkeydown={handleInsertWindowKeydown} />

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
	     DURANTE el arrastre"): montada y desmontada con el gesto —REORDEN o PALETA, ver cabecera,
	     "Soltar una sección de la PALETA..."—, nunca presente en reposo. Es la ÚNICA parte de este
	     componente que captura el puntero sobre el área del sitio, y solo mientras el sitio no
	     puede recibir clics de todas formas. Decorativa para el lector de pantalla: la vía
	     accesible de reordenar son las flechas sobre el asa y el árbol; la de crear, la propia
	     paleta (activar por teclado, ver su cabecera). -->
	{#if dragState.fromIndex !== null || paletteDragType !== null}
		<div class="vega-visual-overlay-drop-zones" aria-hidden="true">
			{#each blocks as block, i (block.id)}
				{@const edge =
					dragState.overIndex === i
						? dropIndicatorEdge(dragState.fromIndex, dragState.overIndex)
						: null}
				<!-- `role="presentation"`: el nodo NO es un control, solo una superficie que recibe
				     `dragover`/`drop` mientras dura el gesto (el árbol y las flechas del asa/la
				     propia paleta son la vía accesible). Sin el rol explícito, el compilador exige
				     uno por llevar manejadores de arrastre (`a11y_no_static_element_interactions`). -->
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
					ondragover={(event) => handleZoneDragOver(event, i)}
					ondrop={(event) => handleZoneDrop(event, i)}
				></div>
			{/each}
		</div>
	{/if}

	<!-- Página vacía + arrastre de paleta en vuelo (ver cabecera): SOLO existe durante el gesto,
	     mismo criterio que la capa de destinos de arriba. Cubre el marco (ver el CSS, `inset`
	     casi total sobre ESTE `<div>`, que ya coincide con la caja del `<iframe>` —
	     `.vega-visual-overlay-root`—, con un margen de 0.75rem solo estético para que el trazo
	     discontinuo no toque el borde): no hace falta leer ningún `rect` reportado, con cero
	     bloques no hay ninguno del que fiarse. `role="presentation"` por el mismo motivo que la
	     capa de destinos (lleva manejadores de arrastre); `aria-hidden` porque no es la vía
	     accesible (esa es la propia paleta). -->
	{#if status === 'ready' && blocks.length === 0 && paletteDragType !== null}
		{@const dragType = paletteDragType}
		<div
			role="presentation"
			aria-hidden="true"
			class="vega-visual-overlay-empty-drop"
			style:pointer-events="auto"
			ondragover={(event) => {
				event.preventDefault();
				if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
			}}
			ondrop={(event) => {
				event.preventDefault();
				void handleInsert(0, dragType);
			}}
		>
			{ctx.t('editor.visual.overlay.emptyDrop')}
		</div>
	{/if}

	<!-- Puntos de inserción (ver cabecera): mismo criterio de capa hermana + `pointer-events` solo
	     en los botones. Se retiran MIENTRAS dura un arrastre —REORDEN o PALETA—: caen justo en los
	     huecos entre contornos, que es donde el puntero suelta, y un botón sin manejador de `drop`
	     se traga el evento y cancela el gesto sin decir nada. Insertar durante un arrastre no es una
	     acción posible, así que no se pierde nada quitándolos (y el `$effect` de arriba cierra el
	     menú de tipos si estaba abierto cuando cualquiera de los dos gestos empieza). -->
	{#if !blocksState.hidden && insertPoints.length > 0 && dragState.fromIndex === null && paletteDragType === null}
		<div class="vega-visual-overlay-insert-points">
			{#each insertPoints as point (point.position)}
				<!-- Con menú de tipos (`hasTypeMenu`), mismo contrato APG que `.vega-tree-add` de
				     `VisualBlockTree.svelte`: `aria-haspopup`/`aria-expanded`/`aria-controls` en el
				     disparador. Sin menú (modo homogéneo), ninguno de los tres — igual que el botón
				     "Añadir" del árbol en su rama sin menú. -->
				<button
					type="button"
					class="vega-visual-overlay-insert"
					style:top="{point.top}px"
					style:pointer-events="auto"
					disabled={blocksState.structuralBusy || blocksState.anySaving}
					aria-haspopup={blocksState.hasTypeMenu ? 'menu' : undefined}
					aria-expanded={blocksState.hasTypeMenu
						? insertMenuPosition === point.position
						: undefined}
					aria-controls={blocksState.hasTypeMenu ? insertMenuId(point.position) : undefined}
					aria-label={ctx.t('editor.visual.overlay.insertLabel', {
						position: point.position + 1,
						total: insertPoints.length
					})}
					onclick={(event) => handleInsertClick(point.position, event)}
				>
					<Icon id="plus" size={14} />
				</button>
				{#if blocksState.hasTypeMenu && insertMenuPosition === point.position}
					<!-- Mismo algoritmo de foco que el menú "Añadir sección" que existía antes en
					     `VisualBlockTree.svelte` (`type-menu.ts`, ver cabecera del script, EXTRAÍDO de
					     ahí para que este menú lo comparta): el marcado y el posicionamiento SÍ son
					     propios de aquí, anclados a `point.top` en vez de a `top: 100%` de un botón en
					     flujo normal — `top` en línea
					     coincide con el mismo eje Y del "+" (ver el CSS, la dirección hacia arriba/abajo
					     la decide `insertMenuOpensUpward` con `margin-top`/`transform`), y queda
					     recortado dentro del lienzo porque vive dentro del `overflow: hidden` de
					     `.vega-visual-overlay-root`. -->
					<div
						id={insertMenuId(point.position)}
						class="vega-visual-overlay-insert-menu"
						class:vega-visual-overlay-insert-menu--up={insertMenuOpensUpward(point.position)}
						role="menu"
						tabindex="-1"
						aria-label={ctx.t('editor.blocks.addMenu.label')}
						style:top="{point.top}px"
						bind:this={insertMenuEl}
						onkeydown={handleInsertMenuKeydown}
						onfocusout={handleInsertMenuFocusOut}
					>
						{#each blocksState.blockTypes as blockType (blockType.name)}
							<button
								type="button"
								role="menuitem"
								tabindex="-1"
								class="vega-visual-overlay-insert-menu-item"
								style:pointer-events="auto"
								onclick={() => handleInsertMenuSelect(point.position, blockType)}
							>
								{#if blockType.icon}<Icon id={blockType.icon} size={14} />{/if}
								{blockType.label}
							</button>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Informativo, NO decorativo (ver cabecera): estados que sí hay que anunciar. -->
	<div class="vega-visual-overlay-status" aria-live="polite">
		{#if status === 'waiting'}
			<p>{ctx.t('editor.visual.overlay.waiting')}</p>
		{:else if missingBlocks > 0}
			<!-- Defecto "el lienzo no dice nada cuando le faltan bloques" (ver cabecera, `missingBlocks`):
			     SUSTITUYE al aviso de "sin bloques" en vez de sumarse cuando `blocks.length === 0`
			     también es cierto (todos los registros están "missing") — el aviso genérico de vacío
			     sería ENGAÑOSO ahí, porque sugiere crear una sección cuando en realidad ya existen y es
			     el sitio quien no las pinta. -->
			<p class="vega-visual-overlay-status--warning">
				{ctx.t('editor.visual.overlay.missing', { count: missingBlocks })}
			</p>
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

	/* Menú de tipos del punto de inserción (defecto "el `+` crea sin preguntar el tipo", ver
	   cabecera del script): mismo lenguaje visual que llevaba el menú "Añadir sección" que existía
	   antes en `VisualBlockTree.svelte` (tarjeta con `--surface`/`--shadow-card`, ítems en columna)
	   — misma FAMILIA de menú, pero anclado a `point.top` (coordenadas del lienzo) en vez de a
	   `top: 100%` de un botón en flujo normal, así que necesita su propio
	   `top`/`left`/`margin`/`transform` en vez de heredar el suyo. Sin `pointer-events` propio (ver
	   cabecera del componente, "DOS capas nuevas"): solo cada `role="menuitem"` lo activa. */
	.vega-visual-overlay-insert-menu {
		position: absolute;
		left: 50%;
		z-index: 10;
		margin-top: 0.9rem;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		min-width: 11rem;
		padding: 0.3rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}

	/* Abre hacia ARRIBA (ver `insertMenuOpensUpward` del script): mismo `top` de partida que la
	   variante de abajo, pero el margen y la traslación empujan la tarjeta por ENCIMA del punto en
	   vez de por debajo — así el punto DESPUÉS del último bloque ("al final de la página") no
	   intenta crecer hacia un hueco que ya no existe dentro del `overflow: hidden` del lienzo. */
	.vega-visual-overlay-insert-menu--up {
		margin-top: -0.9rem;
		transform: translate(-50%, -100%);
	}

	.vega-visual-overlay-insert-menu-item {
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

	.vega-visual-overlay-insert-menu-item:hover,
	.vega-visual-overlay-insert-menu-item:focus-visible {
		background: var(--active);
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

	/* Página vacía + arrastre de paleta en vuelo (ver cabecera): `inset: 0` sobre el MISMO
	   contenedor que ya cubre exactamente el `<iframe>` (`.vega-visual-overlay-root`, arriba), así
	   que no hace falta ningún `rect` propio. Doble trazo `--accent`/`--paper`/`--ink-hi`, mismo
	   criterio de contraste que la guía de "dónde caería" del reorden (ver arriba). */
	.vega-visual-overlay-empty-drop {
		position: absolute;
		inset: 0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		border: 3px dashed var(--accent);
		border-radius: var(--r);
		background: var(--accent-soft);
		box-shadow:
			0 0 0 1px var(--paper),
			0 0 0 2px var(--ink-hi);
		color: var(--accent-text);
		font-size: 0.9rem;
		font-weight: 600;
		text-align: center;
	}

	@media (pointer: coarse) {
		.vega-visual-overlay-toolbar-btn,
		.vega-visual-overlay-insert {
			width: 44px;
			height: 44px;
		}
	}
</style>
