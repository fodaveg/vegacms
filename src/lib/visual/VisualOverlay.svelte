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
	 * **Nada sobre la página (QA de fodaveg, 21 oct 2026; manda sobre lo que digan los párrafos de
	 * más abajo sobre «barra flotante» y «píldoras»).** Sobre la hoja solo se dibuja el CONTORNO,
	 * por fuera del bloque. Lo demás tapaba texto del sitio —la etiqueta y la barra encima del
	 * bloque cubrían el subtítulo de «Sobre mí» y de «Música» y la última línea de la sección
	 * anterior en «Blog»; el «+» de la junta, «desarrollo web, Swift…»—, así que vive en el
	 * ESCENARIO, fuera del iframe: el tipo, el nombre, «Sección N de M», las acciones (arrastrar,
	 * subir, bajar, duplicar, borrar), los avisos y la llamada de la página vacía, en una franja
	 * encima de la hoja (`chromeTarget`); los «+» de inserción, en el margen a su izquierda, a la
	 * altura de cada junta (`gutterTarget`), visibles al pasar por la junta del margen o con el foco
	 * de teclado. Los pinta `portal.ts`: este componente sigue siendo su ÚNICO dueño (estado,
	 * manejadores, foco), solo cambia DÓNDE se pintan. La pista de la edición en línea sigue bajo el
	 * campo que se escribe porque el sitio le deja ese hueco (`hintSpace`), no tapa nada.
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
	 * **El resalte por RATÓN lo DICE el sitio; este componente no lo detecta.** Mientras el puntero
	 * está sobre un iframe de otro origen, la ventana padre no recibe NINGÚN evento de ratón (ni
	 * `mousemove` ni `mouseover`: es la misma política de origen que le impide a Vega leer el DOM).
	 * Capturar el puntero con este overlay para simularlo arreglaría la apariencia y rompería el
	 * scroll del lienzo, que es justo lo que la regla de arriba prohíbe. Por eso el protocolo ganó
	 * un mensaje opcional `hover` del sitio a Vega (§"Hover" del contrato): el puente del sitio
	 * (`@vega/astro`, `visual-bridge.ts`) avisa cuando el puntero cambia de bloque, y
	 * `VisualEditorScreen.svelte` lo pasa aquí como `highlightedId` — el mismo prop, y el mismo
	 * `--highlighted`, que el resalte al pasar por una fila del árbol de secciones (la pantalla
	 * decide cuál de los dos manda, ver su cabecera). Este componente sigue sin saber de
	 * dónde viene el id, solo lo pinta.
	 *
	 * **Sincronía con el scroll: el resalte se OCULTA mientras la página se desplaza, no se
	 * persigue.** Un contorno dibujado FUERA del marco con un `rect` que llega por `postMessage` va
	 * siempre al menos un fotograma por detrás del contenido que el navegador ya desplazó dentro
	 * del marco (el scroll del iframe lo compone otro hilo, y el `rect` nuevo tiene que medirse,
	 * cruzar el `postMessage` y repintarse aquí). No se puede prometer que vaya pegado, así que el
	 * contrato manda la alternativa: el puente manda `hover: null` en cuanto empieza a
	 * desplazarse y vuelve a decir el bloque cuando el scroll se asienta. Aquí no hace falta nada
	 * especial: `highlightedId` llega a `null` y el `--highlighted` desaparece.
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
	 * **Sección no pública.** Si el sitio marca un bloque como no público (`unpublished` de
	 * `bridge-client.ts#VisualBlock`, atributo `data-vega-unpublished="true"` del lado del sitio),
	 * la etiqueta del contorno lo dice con texto ("No pública"), igual que la fila del árbol. Vega
	 * no lo deduce nunca: un sitio que no lo dice no tiene ninguna sección marcada. Y NO cuenta
	 * para `missingBlocks`: una sección no pública que el sitio pinta en la vista previa es un
	 * bloque reportado como cualquier otro (ver `missingBlocks`).
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
	 * ratón del interior (misma política que documenta "El resalte por RATÓN lo DICE el sitio", más
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
	import { INLINE_HINT_GEOMETRY } from './inline-appearance';
	import { outlineRect } from './overlay-chrome';
	import { portalTo } from './portal';
	import { currentPlatform, isApplePlatform } from '$lib/form/save-shortcut';
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
		inlineId?: string | null;
		/** Pista de la edición en línea (lámina, `.inl-hint`): qué campo se escribe y cómo salir. `rect`
		 *  en las coordenadas de `block.rect` (las del marco). `null` fuera de una edición. */
		inlineHint?: {
			label: string;
			widget: 'text' | 'textarea';
			rect: { top: number; left: number; width: number; height: number };
		} | null;
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
		/** Escala del escenario, solo para mantener legible el menú de inserción. */
		zoomFactor?: number;
		canvasHeight?: number;
		/** Franja del escenario ENCIMA de la hoja (fuera del iframe): ahí van el nombre, la posición
		 *  y las acciones del seleccionado, la pista de la edición en línea y los avisos. `null` (un
		 *  montaje aislado) = se pintan dentro del overlay. Ver cabecera, «Nada sobre la página». */
		chromeTarget?: HTMLElement | null;
		/** Margen del escenario a la IZQUIERDA de la hoja, mismo alto que ella: ahí van los «+» de
		 *  inserción, a la altura de cada junta. `null` = dentro del overlay. */
		gutterTarget?: HTMLElement | null;
	}

	let {
		blocks,
		selectedId,
		inlineId = null,
		inlineHint = null,
		highlightedId,
		skippedBlocks,
		status,
		renderedBlockTypes = null,
		blocksState,
		onStructuralChange,
		paletteDragType = null,
		zoomFactor = 1,
		canvasHeight,
		chromeTarget = null,
		gutterTarget = null
	}: Props = $props();

	const ctx = getVegaContext();

	/** Tecla que aplica en un `textarea` en línea, como la anuncia la plataforma (⌘ en Apple). */
	const applyMultilineKey = isApplePlatform(currentPlatform()) ? '⌘⏎' : 'Ctrl ⏎';

	/** `type` de cada bloque contra el vocabulario que el sitio anuncia (ver cabecera). Un `Set`
	 *  por render evita un `includes` lineal por bloque cuando la lista de renderers crece. */
	/** Tipos declarados por nombre: la etiqueta del contorno dice «Texto», no «texto». */
	const blockTypeByName = $derived(
		new Map((blocksState.blockTypes ?? []).map((blockType) => [blockType.name, blockType]))
	);

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
	 *  **Qué NO cuenta como faltante** (revisado con la marca de "no pública"): todo bloque que el
	 *  sitio REPORTA está en `blocks`, sea público o no (`unpublished`) y aunque la vista previa lo
	 *  oculte y llegue colapsado a 0×0 (`parseBlocks` lo acepta a propósito). Solo falta lo que el
	 *  sitio no reporta en absoluto — por ejemplo una plantilla que en la vista previa sigue
	 *  omitiendo las secciones sin publicar —, y ahí el aviso es cierto: la sección existe y el
	 *  sitio no la pinta. Por eso la cuenta no mira `unpublished` para nada.
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
	/** El sitio pinta el seleccionado sin altura (`outlineRect`): la franja dice «aún sin contenido». */
	const selectedEmpty = $derived(
		selectedBridgeBlock !== null && outlineRect(selectedBridgeBlock.rect, 1 / zoomFactor).empty
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
	/** Ancho del overlay en píxeles de la página (el escenario lo escala, `offsetWidth` no). */
	let overlayWidth = $state(0);
	/** Alto del overlay, mismo sistema: el sitio que queda bajo un bloque para su contorno. */
	let overlayHeight = $state(0);

	/** Página sin ninguna sección (ni en Vega ni en el sitio): la franja ofrece crear la primera. */
	const emptyPage = $derived(
		status === 'ready' &&
			!blocksState.hidden &&
			blocksState.records.length === 0 &&
			blocks.length === 0 &&
			paletteDragType === null
	);

	/** Tipo declarado del seleccionado (icono y nombre de la franja) y si el sitio sabe pintarlo. */
	const selectedType = $derived(
		(selectedRecord === null ? null : blocksState.blockTypeOf(selectedRecord)) ??
			(selectedBridgeBlock === null ? null : blockTypeByName.get(selectedBridgeBlock.type)) ??
			null
	);
	const selectedUnsupported = $derived(
		selectedBridgeBlock !== null &&
			(decoratedBlocks.find((item) => item.block.id === selectedBridgeBlock.id)?.unsupported ??
				false)
	);

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

	/** Las acciones comparten control y foco; solo borrar admite borradores pendientes. */
	// Orden de la lámina (`.tb`): subir, bajar | duplicar, borrar.
	const selectedActions = $derived([
		{
			key: 'up',
			label: 'editor.blocks.moveUpLabel',
			icon: 'arrow-up',
			disabled: structuralGuard || selectedIndex <= 0,
			run: () => handleMoveSelected(-1)
		},
		{
			key: 'down',
			label: 'editor.blocks.moveDownLabel',
			icon: 'arrow-down',
			disabled:
				structuralGuard || selectedIndex < 0 || selectedIndex >= blocksState.records.length - 1,
			run: () => handleMoveSelected(1)
		},
		{
			key: 'duplicate',
			label: 'editor.blocks.duplicateLabel',
			icon: 'copy',
			disabled: structuralGuard,
			run: handleDuplicateSelected
		},
		{
			key: 'delete',
			label: 'list.delete.rowButtonLabel',
			icon: 'trash',
			disabled: blocksState.anySaving || blocksState.structuralBusy,
			run: handleDeleteSelected
		}
	] as const);

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

	/** El destino usa el mismo índice de registros que la creación, también con bloques del
	 *  puente ausentes. El nombre real distingue los huecos interiores antes de elegir tipo. */
	function insertionLabel(position: number): string {
		const index = recordIndexForInsertion(position);
		return ctx.t(
			index === 0
				? 'editor.visual.insert.start'
				: index === blocksState.records.length
					? 'editor.visual.insert.end'
					: 'editor.visual.insert.after',
			{ label: index > 0 ? blocksState.blockTitle(blocksState.records[index - 1]) : '' }
		);
	}

	/** Crea y LUEGO reordena hasta `position` (ver cabecera, "Puntos de inserción" — la receta que
	 *  el encargo pide por escrito cuando `handleCreate` no sabe crear en una posición concreta).
	 *  `blockType` llega ya elegido por quien llama (ver "Menú de tipos del punto de inserción",
	 *  abajo) — esta función no vuelve a decidirlo. */
	async function handleInsert(
		position: number,
		blockType: ResolvedBlockType | null = null
	): Promise<void> {
		if (structuralGuard) return;
		const target = recordIndexForInsertion(position);
		const before = blocksState.records.length;
		await blocksState.handleCreate(blockType);
		if (blocksState.records.length !== before + 1) return; // creación fallida, `ctx.feedback` ya avisó
		const newIndex = blocksState.records.length - 1;
		const created = blocksState.records[newIndex];
		if (newIndex !== target) await blocksState.handleReorder(newIndex, target);
		onStructuralChange();
		// Anuncia la posición confirmada, también si el backend rechazó el reorden.
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

	/** Lo que se separan del borde de la hoja las juntas de los extremos: medio «+» táctil (22 px)
	 *  más su anillo de foco (2 + 2), para que ni el botón ni su foco se salgan del margen. */
	const GAP_HALF = 26;

	/** Altura FÍSICA (px de pantalla, desde el borde superior de la hoja) de una junta en el margen
	 *  del escenario: la de la página por el zoom. Las de los extremos se separan del borde lo justo
	 *  para que su franja no se salga de la hoja; el punto real y su índice no cambian. */
	function gapTop(point: InsertPoint): number {
		const y = point.top * zoomFactor;
		if (canvasHeight === undefined || canvasHeight <= 0) return y;
		if (point.position !== 0 && point.position !== blocks.length) return y;
		return Math.min(Math.max(y, GAP_HALF), Math.max(GAP_HALF, canvasHeight - GAP_HALF));
	}

	/** Solo las juntas que se ven en la hoja: una fuera de vista no se apila en el borde ni cae
	 *  sobre la franja de arriba. Sin medida (consumidor aislado, lienzo aún sin medir), todas. */
	function gapVisible(point: InsertPoint): boolean {
		if (canvasHeight === undefined || canvasHeight <= 0) return true;
		const y = point.top * zoomFactor;
		return y >= 0 && y <= canvasHeight;
	}

	/** Abre hacia el lado con más espacio real del lienzo. Sin medida (consumidor aislado),
	 *  conserva el criterio anterior de mitad de los bloques. No altera los puntos ni su índice. */
	function insertMenuOpensUpward(point: InsertPoint): boolean {
		return canvasHeight === undefined
			? point.position * 2 >= blocks.length
			: point.top * zoomFactor > canvasHeight / 2;
	}

	function handleInsertClick(position: number, event: MouseEvent): void {
		if (structuralGuard) return;
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
		if (structuralGuard) return;
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
		if (structuralGuard || dragState.fromIndex !== null || paletteDragType !== null) {
			const trigger = insertMenuTriggerEl;
			const restore = structuralGuard && insertMenuEl?.contains(document.activeElement);
			closeInsertMenu();
			if (restore) trigger?.focus();
		}
	});

	// ————— Caída de la PALETA (ver cabecera, "Soltar una sección de la PALETA...") —————

	/** Posición N+1 donde caería la sección AHORA MISMO, mientras un arrastre de paleta sobrevuela
	 *  la capa de destinos; `null` fuera del gesto o antes del primer `dragover`.
	 *
	 *  Existe porque sin él **se arrastraba a ciegas**: lo cazó una captura, no el gate (un test que
	 *  comprueba dónde CAE la sección pasa igual sin ninguna pista visual). Y el gesto además retira
	 *  los `+` de los puntos de inserción, así que durante el arrastre desaparecía hasta la
	 *  referencia de que existen posiciones donde insertar.
	 *
	 *  No hace falta ningún indicador nuevo: `--before`/`--after` ya pintan la línea para el reorden.
	 *  Lo único que faltaba era de dónde sale el `edge` en este gesto — en el reorden lo decide la
	 *  DIRECCIÓN del arrastre (`dropIndicatorEdge`), y aquí no hay origen que comparar, así que lo
	 *  decide la misma `resolveInsertPosition()` que resuelve la caída. Un segundo criterio habría
	 *  podido enseñar una línea donde la sección no cae. */
	let paletteOverPosition = $state<number | null>(null);

	/** `dragover`/`drop` de la capa de destinos: bifurca según el gesto en vuelo. Los dos son
	 *  mutuamente excluyentes (el navegador solo permite un arrastre a la vez, ver cabecera), así
	 *  que basta con mirar `paletteDragType` para saber a qué camino ir. */
	function handleZoneDragOver(event: DragEvent, index: number): void {
		if (paletteDragType !== null) {
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
			const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			const position = resolveInsertPosition(index, event.clientY, rect);
			// Solo si CAMBIA: el navegador dispara `dragover` continuamente mientras el puntero no
			// se mueve, y repintar en cada uno es el mismo desperdicio que ya evita
			// `reorder-dnd.ts#handleDragOver`.
			if (paletteOverPosition !== position) paletteOverPosition = position;
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
			paletteOverPosition = null;
			void handleInsert(position, paletteDragType);
			return;
		}
		dnd.handleDrop(event, index);
	}

	/** Limpia el indicador cuando el gesto TERMINA sin soltar sobre una zona (cancelado con `Esc`,
	 *  soltado fuera del lienzo, arrastre que sale de la ventana): ahí no pasa por `handleZoneDrop`,
	 *  y lo único que lo delata es que `paletteDragType` vuelve a `null` — el dueño de ese prop es
	 *  `VisualEditorScreen.svelte`, que ya lo limpia en el `dragend` de la paleta. Sin esto, la
	 *  línea del gesto anterior reaparecería durante un frame al empezar el siguiente, antes del
	 *  primer `dragover`. Este componente sigue siendo el ÚNICO escritor de `paletteOverPosition`. */
	$effect(() => {
		if (paletteDragType === null) paletteOverPosition = null;
	});
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
<div
	class="vega-visual-overlay-root"
	style:pointer-events="none"
	style:--menu-scale={1 / zoomFactor}
	bind:offsetWidth={overlayWidth}
	bind:offsetHeight={overlayHeight}
>
	<!-- Decorativo (ver cabecera): el propio grupo de cajas, aparte de la región de estados de
	     abajo. -->
	<div class="vega-visual-overlay-boxes" aria-hidden="true">
		{#each decoratedBlocks as { block, unsupported } (block.id)}
			{@const outline = outlineRect(block.rect, 1 / zoomFactor)}
			<!-- `outline`: un bloque que el sitio pinta sin altura (recién insertado, campos vacíos) se
			     marca con un contorno discontinuo en su sitio, sin crecer (`outlineRect`). -->
			<div
				class="vega-visual-overlay-box"
				class:vega-visual-overlay-box--selected={block.id === selectedId}
				class:vega-visual-overlay-box--inline={block.id === inlineId}
				class:vega-visual-overlay-box--highlighted={block.id === highlightedId}
				class:vega-visual-overlay-box--empty={outline.empty}
				data-vega-block-id={block.id}
				style:pointer-events="none"
				style:top="{outline.top}px"
				style:left="{block.rect.left}px"
				style:width="{block.rect.width}px"
				style:height="{outline.height}px"
				style:--room-top="{outline.top}px"
				style:--room-left="{block.rect.left}px"
				style:--room-right="{overlayWidth - block.rect.left - block.rect.width}px"
				style:--room-bottom="{overlayHeight - outline.top - outline.height}px"
				data-unsupported={unsupported ? 'true' : undefined}
				data-unpublished={block.unpublished ? 'true' : undefined}
			>
				<!-- Solo el contorno: el nombre del tipo y sus marcas («no soportado», «No pública», «aún
				     sin contenido») van en la franja del escenario (ver «Nada sobre la página» en la
				     cabecera). -->
			</div>
		{/each}
	</div>

	{#if inlineHint}
		<!-- Pista de la edición en línea: decorativa para el lector de pantalla (el foco está DENTRO
		     del marco, en el textbox con nombre que pone el sitio; la ficha anuncia «en la página»). -->
		<p
			class="vega-visual-inline-hint"
			aria-hidden="true"
			style:top="{inlineHint.rect.top + inlineHint.rect.height + INLINE_HINT_GEOMETRY.gap}px"
			style:left="{Math.max(4, inlineHint.rect.left)}px"
		>
			<b>{inlineHint.label}</b> · {ctx.t('editor.visual.inline.typing')}
			<!-- La tecla que APLICA según el campo (§"Inline editing"): ⏎ en `text`; en `textarea` el ⏎
			     es salto de línea y aplica ⌘⏎ (Ctrl ⏎ fuera de Apple). -->
			<kbd>{inlineHint.widget === 'textarea' ? applyMultilineKey : '⏎'}</kbd>
			{ctx.t('editor.visual.inline.apply')}
			<kbd>Esc</kbd>
			{ctx.t('editor.visual.inline.cancel')}
		</p>
	{/if}

	<!-- Franja del seleccionado (ver cabecera, «Nada sobre la página»): se PINTA en el escenario,
	     encima de la hoja (`chromeTarget`), con el tipo, el nombre, «Sección N de M» y las acciones
	     (arrastrar, subir, bajar, duplicar, borrar); este componente sigue siendo su dueño. El
	     envoltorio `display: contents` se queda aquí para que Svelte retire el bloque sin tocar el
	     destino (`portal.ts`). Controles de verdad: fuera de `aria-hidden`, con `pointer-events`
	     propio (la franja no está sobre el sitio). -->
	<div class="vega-visual-portal">
		<div class="vega-visual-chrome-bar" {@attach portalTo(chromeTarget)}>
			{#if !blocksState.hidden && selectedRecord}
				{@const label = blocksState.blockTitle(selectedRecord)}
				{@const typeLabel = selectedType?.label ?? selectedBridgeBlock?.type ?? label}
				<p
					class="vega-visual-chrome-main"
					class:vega-visual-chrome-main--named={label !== typeLabel}
				>
					<!-- Lámina «edición en vivo», `.lbl`: icono y NOMBRE del tipo («Texto»), no su id. -->
					<span
						class="vega-visual-overlay-label"
						class:vega-visual-overlay-label--unsupported={selectedUnsupported}
					>
						<Icon id={selectedType?.icon ?? 'document'} size={12} strokeWidth={1.8} />
						<span class="vega-visual-overlay-label-text">{typeLabel}</span>
						{#if selectedUnsupported}
							<Icon id="warning" size={12} />
							<span>({ctx.t('editor.visual.overlay.unsupported')})</span>
						{/if}
						{#if selectedBridgeBlock?.unpublished}
							<!-- Ver cabecera, "Sección no pública": texto, no solo color. -->
							<span class="vega-visual-overlay-label-unpublished">
								{ctx.t('editor.visual.unpublished')}
							</span>
						{/if}
					</span>
					{#if label !== typeLabel}<span class="vega-visual-chrome-name" title={label}>{label}</span
						>{/if}
					<span class="vega-visual-chrome-position"
						>{ctx.t('editor.visual.inspector.position', {
							position: selectedIndex + 1,
							total: blocksState.records.length
						})}{#if selectedBridgeBlock === null}{` · ${ctx.t('editor.visual.chrome.notPainted')}`}{:else if selectedEmpty}{` · ${ctx.t('editor.visual.chrome.empty')}`}{/if}</span
					>
				</p>
				<div
					class="vega-visual-overlay-toolbar"
					role="group"
					aria-label={ctx.t('editor.visual.overlay.toolbar.label', { label })}
				>
					<!-- Asa de arrastre (ver cabecera, "Arrastrar una sección por el lienzo"): mismo glifo,
					     misma clave de rótulo y mismo cableado del controlador que el asa de `RecordBlocks`
					     y de las dos tablas. `draggable` cae a la vez que `disabled` para que un bloque
					     congelado por el guard tampoco se pueda agarrar (un `disabled` no basta: el
					     arrastre nativo no lo mira). Sin contorno en el lienzo no hay dónde soltar. -->
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
					<span class="vega-visual-overlay-toolbar-sep" aria-hidden="true"></span>
					{#each selectedActions as action (action.key)}
						{#if action.key === 'duplicate'}<span
								class="vega-visual-overlay-toolbar-sep"
								aria-hidden="true"
							></span>{/if}
						{#if action.key !== 'duplicate' || blocksState.blockDuplicateAllowed}
							<button
								type="button"
								class="vega-visual-overlay-toolbar-btn"
								class:vega-visual-overlay-toolbar-btn--danger={action.key === 'delete'}
								style:pointer-events="auto"
								disabled={action.disabled}
								aria-label={ctx.t(action.label, { label })}
								onclick={() => void action.run()}
							>
								<span class="vega-visual-overlay-toolbar-icon">
									<Icon id={action.icon} size={15} strokeWidth={1.6} />
								</span>
							</button>
						{/if}
					{/each}
				</div>
			{:else if emptyPage}
				<!-- Página sin secciones (QA de fodaveg): el lienzo no tenía ni un «+». La llamada abre
				     el MISMO catálogo de tipos que los «+» de las juntas, en la posición 0. -->
				<div class="vega-visual-chrome-main vega-visual-chrome-empty">
					<button
						type="button"
						class="vega-visual-empty-add"
						style:pointer-events="auto"
						aria-disabled={structuralGuard}
						aria-haspopup={blocksState.hasTypeMenu ? 'menu' : undefined}
						aria-expanded={blocksState.hasTypeMenu ? insertMenuPosition === 0 : undefined}
						aria-controls={blocksState.hasTypeMenu ? insertMenuId(0) : undefined}
						onclick={(event) => handleInsertClick(0, event)}
						><Icon id="plus" size={14} strokeWidth={2} />{ctx.t(
							'editor.visual.chrome.addFirst'
						)}</button
					>
					{#if blocksState.hasTypeMenu && insertMenuPosition === 0}
						{@render typeMenu(
							0,
							ctx.t('editor.visual.chrome.addFirst'),
							false,
							canvasHeight === undefined || canvasHeight <= 0 ? undefined : canvasHeight
						)}
					{/if}
				</div>
			{/if}
			{@render statusRegion()}
		</div>
	</div>

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
				<!-- El MISMO indicador para los dos gestos, con dos orígenes distintos: reordenando lo
				     decide la dirección del arrastre (`dropIndicatorEdge`), creando desde la paleta lo
				     decide la posición donde caería (`paletteOverPosition`, ver su declaración), que
				     es la que resuelve de verdad la caída. La zona `i` enseña la línea ARRIBA cuando la
				     sección entra en la posición `i`; el "abajo" lo pinta SOLO la última zona, para la
				     posición final. Cualquier hueco interior pertenece a dos zonas a la vez (el
				     "después" de una es el "antes" de la siguiente), así que repartirlo entre las dos
				     dibujaría dos líneas pegadas en el mismo sitio. -->
				{@const edge =
					paletteDragType !== null
						? paletteOverPosition === i
							? 'before'
							: paletteOverPosition === i + 1 && i === blocks.length - 1
								? 'after'
								: null
						: dragState.overIndex === i
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

	<!-- Puntos de inserción (ver cabecera): un «+» por junta, en el MARGEN del escenario a la
	     izquierda de la hoja (`gutterTarget`), a la altura de la junta — nunca sobre la página
	     (QA de fodaveg, 21 oct 2026: tapaba «desarrollo web, Swift…»). Se ve al pasar el ratón por
	     la junta del margen, con el foco de teclado o con su menú abierto (y siempre con dedo, que no
	     tiene «pasar por encima»). Se retiran MIENTRAS dura un arrastre —REORDEN o PALETA—: caen
	     justo en los huecos donde se suelta, y un botón sin manejador de `drop` se traga el evento.
	     Tampoco hay ninguno durante una edición en línea (`inlineId`). -->
	<div class="vega-visual-portal">
		<div class="vega-visual-gutter-layer" {@attach portalTo(gutterTarget)}>
			{#if !blocksState.hidden && insertPoints.length > 0 && dragState.fromIndex === null && paletteDragType === null && inlineId === null}
				{#each insertPoints.filter(gapVisible) as point (point.position)}
					{@const destination = insertionLabel(point.position)}
					{@const upward = insertMenuOpensUpward(point)}
					{@const top = gapTop(point)}
					{@const positionText = ctx.t('editor.visual.overlay.insertLabel', {
						position: recordIndexForInsertion(point.position) + 1,
						total: blocksState.records.length + 1
					})}
					<div
						class="vega-visual-gap"
						class:vega-visual-gap--open={insertMenuPosition === point.position}
						style:top="{top}px"
						style:pointer-events="auto"
					>
						<!-- Con menú de tipos (`hasTypeMenu`), mismo contrato APG que `.vega-tree-add` de
						     `VisualBlockTree.svelte`: `aria-haspopup`/`aria-expanded`/`aria-controls` en
						     el disparador. Sin menú (modo homogéneo), ninguno de los tres. -->
						<button
							type="button"
							class="vega-visual-overlay-insert"
							style:pointer-events="auto"
							aria-disabled={structuralGuard}
							aria-haspopup={blocksState.hasTypeMenu ? 'menu' : undefined}
							aria-expanded={blocksState.hasTypeMenu
								? insertMenuPosition === point.position
								: undefined}
							aria-controls={blocksState.hasTypeMenu ? insertMenuId(point.position) : undefined}
							aria-label={`${positionText}: ${destination}`}
							title={destination}
							onclick={(event) => handleInsertClick(point.position, event)}
						>
							<Icon id="plus" size={14} strokeWidth={2} />
						</button>
						{#if blocksState.hasTypeMenu && insertMenuPosition === point.position}
							{@render typeMenu(
								point.position,
								destination,
								upward,
								canvasHeight === undefined || canvasHeight <= 0
									? undefined
									: upward
										? top
										: canvasHeight - top
							)}
						{/if}
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>

<!-- Menú de tipos de un punto de inserción (o de la llamada de la página vacía): mismo algoritmo de
     foco que el menú «Añadir sección» del árbol (`type-menu.ts`, compartido). Se ancla junto a su
     disparador; `upward` lo abre hacia arriba cuando abajo queda menos sitio en el lienzo. -->
{#snippet typeMenu(
	position: number,
	destination: string,
	upward: boolean,
	space: number | undefined
)}
	<div
		id={insertMenuId(position)}
		class="vega-visual-overlay-insert-menu"
		class:vega-visual-overlay-insert-menu--up={upward}
		role="menu"
		tabindex="-1"
		aria-label={destination}
		style:pointer-events="auto"
		style:--menu-space={space === undefined ? undefined : `${space}px`}
		bind:this={insertMenuEl}
		onkeydown={handleInsertMenuKeydown}
		onfocusout={handleInsertMenuFocusOut}
	>
		<p class="vega-visual-insert-destination" title={destination}>
			<span
				>{ctx.t('editor.visual.insert.menuTitle', {
					position: recordIndexForInsertion(position) + 1,
					total: blocksState.records.length + 1
				})}</span
			>
		</p>
		<div role="presentation" class="vega-visual-insert-options">
			{#each blocksState.blockTypes as blockType (blockType.name)}
				<button
					type="button"
					role="menuitem"
					tabindex="-1"
					class="vega-visual-overlay-insert-menu-item"
					onclick={() => handleInsertMenuSelect(position, blockType)}
				>
					<!-- Lámina «Añadir bloque: paleta de tipos»: icono en baldosa, nombre y descripción
					     del tipo (`blockTypes[].description`, opcional). -->
					<span class="vega-visual-insert-ic" aria-hidden="true"
						><Icon id={blockType.icon ?? 'document'} size={16} strokeWidth={1.6} /></span
					>
					<span class="vega-visual-insert-copy">
						<b>{blockType.label}</b>
						{#if blockType.description}<small>{blockType.description}</small>{/if}
					</span>
				</button>
			{/each}
		</div>
	</div>
{/snippet}

<!-- Informativo, NO decorativo (ver cabecera): estados que sí hay que anunciar. Viven en la franja
     del escenario, no sobre la página. -->
{#snippet statusRegion()}
	<div class="vega-visual-overlay-status" aria-live="polite">
		{#if status === 'waiting'}
			<p>{ctx.t('editor.visual.overlay.waiting')}</p>
		{:else if missingBlocks > 0}
			<!-- Defecto "el lienzo no dice nada cuando le faltan bloques" (ver cabecera,
			     `missingBlocks`): SUSTITUYE al aviso de "sin bloques" en vez de sumarse cuando
			     `blocks.length === 0` también es cierto — el aviso genérico de vacío sería ENGAÑOSO ahí,
			     porque sugiere crear una sección cuando en realidad ya existen y es el sitio quien no
			     las pinta. -->
			<p class="vega-visual-overlay-status--warning">
				{ctx.t(
					missingBlocks === 1
						? 'editor.visual.overlay.missing.one'
						: 'editor.visual.overlay.missing.many',
					{ count: missingBlocks }
				)}
			</p>
		{:else if blocks.length === 0}
			<p>{ctx.t('editor.visual.overlay.empty')}</p>
		{/if}
		{#if status === 'ready' && skippedBlocks > 0}
			<p class="vega-visual-overlay-status--warning">
				{ctx.t(
					skippedBlocks === 1
						? 'editor.visual.overlay.skipped.one'
						: 'editor.visual.overlay.skipped.many',
					{ count: skippedBlocks }
				)}
			</p>
		{/if}
	</div>
{/snippet}

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

	/* Envoltorio que se queda en el overlay mientras su contenido se pinta en el escenario
	   (`portal.ts`): no ocupa caja. */
	.vega-visual-portal {
		display: contents;
	}

	/* Contorno (lámina «edición en vivo», `.blk::before`): una caja 4 px FUERA del bloque (ver
	   `::before` más abajo), radio 8. Reposo invisible; al pasar, trazo fino del acento al 55 % (`--v-ol-hover`);
	   seleccionado, 2 px de `--v-ol-select` y un halo suave. Los grosores se multiplican por
	   `--menu-scale` (1/zoom): miden lo mismo en pantalla a cualquier zoom. La edición en línea
	   NO cambia el contorno: su naranja va dentro de la página, sobre el texto que se escribe. */
	.vega-visual-overlay-box {
		position: absolute;
		/* Solo el bloque activo o bajo el puntero enmarca el sitio. Los nodos se conservan para
		   que el puente y los tests sigan mapeando todos los ids sin montar otra capa. */
		opacity: 0;
	}

	/* El contorno va FUERA del bloque (4 px), no dentro como en la lámina: la lámina suponía secciones
	   con relleno propio, y un bloque cuyo contenido llega a su borde (la sección de texto de
	   fodaveg, 21 oct 2026) quedaba con el trazo y el halo encima de la primera letra de cada línea.
	   Cada lado sale solo lo que deja el lienzo (`--room-*`, el hueco hasta el borde del overlay,
	   que recorta): en el lado de un bloque a sangre el trazo queda pegado al borde, visible. */
	.vega-visual-overlay-box::before {
		--ring-out: calc(4px * var(--menu-scale));
		content: '';
		position: absolute;
		top: calc(-1 * clamp(0px, var(--room-top, 0px), var(--ring-out)));
		right: calc(-1 * clamp(0px, var(--room-right, 0px), var(--ring-out)));
		bottom: calc(-1 * clamp(0px, var(--room-bottom, 0px), var(--ring-out)));
		left: calc(-1 * clamp(0px, var(--room-left, 0px), var(--ring-out)));
		border: calc(1.5px * var(--menu-scale)) solid transparent;
		border-radius: calc(8px * var(--menu-scale));
		pointer-events: none;
	}

	.vega-visual-overlay-box--highlighted {
		opacity: 1;
	}

	.vega-visual-overlay-box--highlighted::before {
		border-color: var(--v-ol-hover);
	}

	.vega-visual-overlay-box--selected,
	.vega-visual-overlay-box--inline {
		opacity: 1;
	}

	.vega-visual-overlay-box--selected::before,
	.vega-visual-overlay-box--inline::before {
		border: calc(2px * var(--menu-scale)) solid var(--v-ol-select);
		box-shadow: 0 0 0 calc(4px * var(--menu-scale)) var(--accent-soft);
	}

	/* Bloque que el sitio aún no pinta (ver `outlineRect`): el mismo contorno, discontinuo, en su
	   junta y sin fondo ni texto propios — nada que tape la página (QA de fodaveg, 21 oct 2026). Que
	   está vacío lo dice la franja del escenario. */
	.vega-visual-overlay-box--empty::before {
		border-style: dashed;
	}

	/* Pista de la edición en línea (lámina, `.inl-hint`): píldora bajo el campo, con el nombre del
	   campo en el naranja de edición como TEXTO (`--v-ol-inline-text`, medido ≥4.5:1). Conserva su
	   tamaño físico con cualquier zoom, como la barra flotante. */
	.vega-visual-inline-hint {
		position: absolute;
		z-index: 4;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 28px;
		margin: 0;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: var(--r-pill);
		background: var(--surface);
		box-shadow: var(--shadow-card);
		color: var(--ink-2);
		font-family: var(--sans);
		font-size: 11px;
		white-space: nowrap;
		transform: scale(var(--menu-scale));
		transform-origin: top left;
	}

	.vega-visual-inline-hint b {
		color: var(--v-ol-inline-text);
		font-weight: 600;
	}

	.vega-visual-inline-hint kbd {
		padding: 0 4px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--btn);
		color: var(--ink-hi);
		font-family: var(--mono);
		font-size: 10px;
	}

	/* Franja del escenario (ver «Nada sobre la página»): una fila encima de la hoja, fuera del
	   iframe, que el escenario coloca y dimensiona (`.vega-visual-chrome` de `VisualEditorScreen`).
	   A la izquierda, qué está seleccionado; a la derecha, sus acciones; los avisos, entre medias.
	   No escala con el zoom: vive fuera del escenario escalado. */
	.vega-visual-chrome-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		height: 100%;
		min-width: 0;
		pointer-events: none;
		font-family: var(--sans);
	}

	.vega-visual-chrome-main {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		margin: 0;
		color: var(--ink-2);
		font-size: 12px;
	}

	.vega-visual-chrome-name {
		overflow: hidden;
		color: var(--ink-hi);
		font-weight: 600;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	/* Con poco ancho (el lienzo «Móvil», QA de fodaveg del 21 oct 2026: el nombre quedaba en «Q»)
	   manda el NOMBRE: primero sale el contador «Sección N de M» y después el texto del tipo (queda
	   su icono), antes que recortar el nombre a una letra. La fila de la izquierda ocupa lo que deja
	   la barra de acciones y es ella la que se mide. La llamada de la página vacía no entra: su menú
	   se coloca contra ella. */
	.vega-visual-chrome-main:not(.vega-visual-chrome-empty) {
		flex: 1 1 0;
		container: chrome-main / inline-size;
	}

	@container chrome-main (max-width: 22rem) {
		.vega-visual-chrome-position {
			display: none;
		}
	}

	@container chrome-main (max-width: 14rem) {
		.vega-visual-chrome-main--named .vega-visual-overlay-label-text {
			display: none;
		}
	}

	.vega-visual-chrome-position {
		flex-shrink: 0;
		color: var(--ink-2);
		font-family: var(--mono);
		font-size: 11px;
		white-space: nowrap;
	}

	.vega-visual-chrome-empty {
		position: relative;
	}

	/* «Añadir la primera sección» (página vacía): mismo lenguaje que el «+» de las juntas. */
	.vega-visual-empty-add {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 0 12px 0 8px;
		border: 1px solid var(--accent-line);
		border-radius: var(--r-pill);
		background: var(--surface);
		color: var(--accent-text);
		box-shadow: var(--shadow-card);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}

	.vega-visual-empty-add:hover:not([aria-disabled='true']),
	.vega-visual-empty-add[aria-expanded='true'] {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-ink);
	}

	.vega-visual-empty-add:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.vega-visual-empty-add[aria-disabled='true'] {
		cursor: not-allowed;
		opacity: 0.5;
	}

	/* Etiqueta del tipo (lámina `.lbl`), ahora en la franja: icono y nombre del tipo, sólida
	   (`--v-ol-select` + `--v-ol-select-ink`, medido ≥4.5:1 en los dos modos). */
	.vega-visual-overlay-label {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		gap: 6px;
		height: 22px;
		max-width: 18rem;
		padding: 0 9px;
		border: 1px solid transparent;
		border-radius: var(--r-pill);
		background: var(--v-ol-select);
		color: var(--v-ol-select-ink);
		font-family: var(--sans);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.01em;
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

	/* Sección no pública (ver cabecera): una píldora PROPIA dentro de la etiqueta, con el par
	   `info`/`info-soft` (medido en el mismo gate que `warning`), en vez de recolorear la etiqueta
	   entera — así convive con el aviso de "no soportado", que es otro eje, y el texto del tipo
	   sigue con su par de siempre. */
	.vega-visual-overlay-label-unpublished {
		padding: 0 0.3rem;
		border-radius: calc(var(--r) / 1.5);
		background: var(--info-soft);
		color: var(--info);
	}

	/* Estados (ver cabecera, "Informativo, NO decorativo"): en la franja, entre lo seleccionado y
	   sus acciones; ya no sobre la esquina de la página. Vacía no pinta nada. */
	.vega-visual-overlay-status {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: flex-end;
		gap: 0.35rem;
		min-width: 0;
	}

	/* Sin avisos no se queda con media franja: ese hueco es del nombre del seleccionado. */
	.vega-visual-overlay-status:not(:has(*)) {
		flex-grow: 0;
	}

	.vega-visual-overlay-status p {
		margin: 0;
		overflow: hidden;
		padding: 0.2rem 0.55rem;
		border-radius: var(--r);
		background: var(--surface-2);
		color: var(--ink);
		font-size: 12px;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.vega-visual-overlay-status--warning {
		color: var(--warning);
	}

	/* Acciones del seleccionado (lámina `.tb`): píldora horizontal al final de la franja, nunca
	   sobre la página (QA de fodaveg, 21 oct 2026: encima del bloque tapaba el subtítulo de «Sobre
	   mí» y de «Música» y la última línea de la sección anterior en «Blog»). El contenedor no fija
	   `pointer-events` (lo hereda de la franja); solo cada botón lo activa. */
	.vega-visual-overlay-toolbar {
		flex-shrink: 0;
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 3px;
		border: 1px solid var(--line);
		border-radius: var(--r-pill);
		background: var(--surface);
		box-shadow: var(--shadow-card);
		font-family: var(--sans);
	}

	.vega-visual-overlay-toolbar-sep {
		width: 1px;
		height: 18px;
		margin: 0 3px;
		background: var(--line);
	}

	.vega-visual-overlay-toolbar-btn {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 0;
		border-radius: var(--r-pill);
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
	}

	.vega-visual-overlay-toolbar-btn:hover:not(:disabled) {
		background: var(--btn);
		color: var(--ink-hi);
	}

	.vega-visual-overlay-toolbar-btn:focus-visible {
		outline: 2px solid var(--ink);
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

	.vega-visual-overlay-toolbar-icon {
		display: inline-flex;
	}

	/* Puntos de inserción (ver cabecera): en el MARGEN del escenario a la izquierda de la hoja
	   (`.vega-visual-gutter` de `VisualEditorScreen`, sin escalar). Cada junta es una franja de
	   28 px del ancho del margen (`.vega-visual-gap`, centrada en la junta) que recibe el puntero;
	   su «+» solo se ve al pasar por ella, con el foco o con el menú abierto. Nada de esto cae
	   sobre la página. */
	.vega-visual-gutter-layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.vega-visual-gap {
		position: absolute;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 28px;
		transform: translateY(-50%);
	}

	.vega-visual-gap:hover,
	.vega-visual-gap--open {
		z-index: 2;
	}

	.vega-visual-overlay-insert {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 1px solid var(--accent-line);
		border-radius: var(--r-pill);
		background: var(--surface);
		color: var(--accent-text);
		box-shadow: var(--shadow-card);
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.12s ease;
	}

	/* Una guía corta desde el «+» hasta la hoja dice a qué junta pertenece. */
	.vega-visual-overlay-insert::after {
		content: '';
		position: absolute;
		top: 50%;
		left: calc(50% + 14px);
		right: 0;
		height: 1.5px;
		background: var(--accent-line);
		opacity: 0;
		pointer-events: none;
	}

	.vega-visual-gap:hover .vega-visual-overlay-insert,
	.vega-visual-overlay-insert:focus-visible,
	.vega-visual-overlay-insert[aria-expanded='true'],
	.vega-visual-gap:hover .vega-visual-overlay-insert::after,
	.vega-visual-overlay-insert:focus-visible::after,
	.vega-visual-overlay-insert[aria-expanded='true']::after {
		opacity: 1;
	}

	/* Con dedo no hay «pasar por encima»: los «+» del margen se ven siempre. Están en el margen,
	   fuera de la página, así que verlos no tapa nada. */
	@media (hover: none) {
		.vega-visual-overlay-insert {
			opacity: 1;
		}
	}

	.vega-visual-overlay-insert:hover:not([aria-disabled='true']),
	.vega-visual-overlay-insert[aria-expanded='true'] {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-ink);
	}

	.vega-visual-overlay-insert:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.vega-visual-overlay-insert[aria-disabled='true'] {
		cursor: not-allowed;
	}

	.vega-visual-gap:hover .vega-visual-overlay-insert[aria-disabled='true'],
	.vega-visual-overlay-insert[aria-disabled='true']:focus-visible {
		opacity: 0.4;
	}

	@media (prefers-reduced-motion: reduce) {
		.vega-visual-overlay-insert {
			transition: none;
		}
	}

	/* Menú de tipos del punto de inserción (lámina «Añadir bloque: paleta de tipos», `.pop`):
	   tarjeta elevada que sale a la DERECHA del «+» del margen, desde la junta hacia abajo (o hacia
	   arriba, `--up`, si abajo queda menos lienzo: `--menu-space`). Es un menú abierto a petición:
	   mientras está abierto tapa la página, como cualquier desplegable. */
	.vega-visual-overlay-insert-menu {
		position: absolute;
		top: 50%;
		left: calc(100% + 6px);
		z-index: 10;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		width: 300px;
		max-height: min(22rem, calc(var(--menu-space, 100vh) - 8px));
		overflow: hidden;
		padding: 8px;
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-raised);
		font-family: var(--sans);
	}

	.vega-visual-overlay-insert-menu--up {
		top: auto;
		bottom: 50%;
	}

	/* La llamada de la página vacía, en la franja: el menú cae bajo el botón. */
	.vega-visual-chrome-empty .vega-visual-overlay-insert-menu {
		top: calc(100% + 6px);
		left: 0;
	}

	.vega-visual-insert-options {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-y: auto;
		pointer-events: auto;
	}

	.vega-visual-insert-destination {
		flex-shrink: 0;
		margin: 0;
		padding: 6px 8px 8px;
		color: var(--ink-3);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		overflow-wrap: anywhere;
	}

	.vega-visual-insert-destination span {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}

	/* Un destino largo conserva sitio para elegir; el menú anuncia el nombre completo. */
	@media (max-height: 600px) {
		.vega-visual-insert-destination {
			padding-block: 0.25rem;
		}

		.vega-visual-insert-destination span {
			-webkit-line-clamp: 1;
			line-clamp: 1;
		}
	}

	.vega-visual-overlay-insert-menu-item {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 8px;
		border: 0;
		border-radius: var(--r-sm);
		background: transparent;
		color: var(--ink-hi);
		font: inherit;
		text-align: left;
		cursor: pointer;
		overflow-wrap: anywhere;
	}

	.vega-visual-insert-ic {
		display: grid;
		place-items: center;
		flex: none;
		width: 34px;
		height: 34px;
		border-radius: 9px;
		background: var(--btn);
		color: var(--ink-2);
	}

	.vega-visual-insert-copy {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.vega-visual-insert-copy b {
		font-size: var(--fs-13);
		font-weight: 600;
	}

	.vega-visual-insert-copy small {
		color: var(--ink-3);
		font-size: 11px;
	}

	.vega-visual-overlay-insert-menu-item:hover,
	.vega-visual-overlay-insert-menu-item:focus-visible {
		background: var(--accent-soft);
		outline: none;
	}

	.vega-visual-overlay-insert-menu-item:focus-visible {
		box-shadow: inset 0 0 0 2px var(--ink);
	}

	.vega-visual-overlay-insert-menu-item:hover .vega-visual-insert-ic,
	.vega-visual-overlay-insert-menu-item:focus-visible .vega-visual-insert-ic {
		background: var(--surface);
		color: var(--accent-text);
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
		/* Objetivo táctil de 44 px físicos (`scripts/check-touch-targets.mjs`): la franja y el margen
		   no escalan con el zoom, así que basta con el tamaño de la caja. */
		.vega-visual-overlay-insert-menu-item,
		.vega-visual-empty-add {
			min-height: 44px;
		}

		.vega-visual-gap {
			height: 44px;
		}

		.vega-visual-overlay-toolbar-btn,
		.vega-visual-overlay-insert {
			min-width: 44px;
			min-height: 44px;
			width: 44px;
			height: 44px;
			flex-shrink: 0;
		}

		.vega-visual-overlay-insert::after {
			left: calc(50% + 24px);
		}
	}
</style>
