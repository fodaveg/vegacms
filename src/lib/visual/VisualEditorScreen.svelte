<script lang="ts">
	/**
	 * Pantalla del editor visual (tarea "pantalla del editor visual", lote único; §"Visual editing
	 * bridge" de `docs/PROJECT-CONTRACT-v1.md`): a pantalla completa, enseña la página del sitio en
	 * un iframe y la conecta al puente (`bridge-client.ts`). La monta la ruta
	 * `/c/[type]/[id]/visual` tras haber resuelto las cuatro puertas (`visual-gate.ts`) y el
	 * registro; este componente asume que están abiertas y que `record` existe de verdad — no las
	 * vuelve a comprobar. El peso de esta pantalla cuenta contra el tope de «pantalla más cara»
	 * del presupuesto de bundle: la ruta la importa de forma ESTÁTICA justo para eso (el porqué,
	 * en la cabecera de la ruta).
	 *
	 * **Alcance de ESTA entrega (tarea "árbol de secciones y el inspector", ampliada sobre la
	 * anterior, y por la tarea posterior "acciones estructurales desde el editor visual")**: además
	 * del LIENZO (iframe + estados de conexión) y los CONTORNOS de selección (`VisualOverlay.svelte`),
	 * la rejilla ya usa sus TRES columnas (`.vega-visual-grid--tree`/`--inspector`, ver el CSS):
	 * `VisualBlockTree.svelte` (árbol de secciones, izquierda) y `VisualInspector.svelte` (ficha del
	 * bloque seleccionado, derecha), las tres sobre el MISMO `blocks` (`createBlocksState()`,
	 * instanciado UNA vez aquí abajo — "un solo `createBlocksState` por pantalla"). La ESCRITURA
	 * sobre un CAMPO de un bloque entra por `BlockEditor.svelte`, montado por `VisualInspector`,
	 * nunca aquí; la ESTRUCTURA (crear/duplicar/borrar/mover) entra por `VisualBlockTree.svelte` (la
	 * vía que manda) y por la barra flotante + los puntos de inserción de `VisualOverlay.svelte`
	 * (atajo sobre el lienzo) — las dos llaman a las mutaciones de `blocks-state.svelte.ts`
	 * DIRECTAMENTE, esta pantalla no las intercepta. Lo que esta pantalla SÍ hace para las tres
	 * superficies por igual: fijar la selección y refrescar el lienzo tras cada cambio, cableado
	 * como `onBlockSaved`/`onStructuralChange` más abajo — `RecordBlocks.svelte` deja de ser la
	 * única vía de mutar bloques desde esta tarea, pero sigue siendo la vía del formulario clásico,
	 * sin lienzo.
	 *
	 * **Refresco en vivo (tarea "refresco en vivo del lienzo"; §"Live refresh" del contrato),
	 * DOS caminos posibles tras cada cambio, decididos por `scheduleCanvasRefresh`**:
	 * - **Con puente `connected` y `liveRefresh`**: rebota `REFRESH_DEBOUNCE_MS` (varios cambios
	 *   seguidos piden UN solo token) y `refreshCanvas()` pide un token nuevo que entrega al puente
	 *   como `bridgeClient.refresh({ url })` — el marco sustituye `data-vega-blocks-root` por su
	 *   cuenta y avisa con `ready`; el `<iframe>` de esta pantalla NUNCA cambia de `src` y el scroll
	 *   del autor sobrevive. `refreshCanvas` por eso NO escribe en `tokenState` (cambiaría el `src`)
	 *   ni toca `scheduleRenew` (el token del `src`, que sigue siendo el viejo, conserva su propia
	 *   renovación, independiente de este refresco).
	 * - **Sin puente, o sin `liveRefresh`, o si el camino de arriba falla en cualquier punto**
	 *   (la petición del token, que llegue tarde, o que `bridgeClient.refresh()` devuelva `false`):
	 *   el camino de siempre, `requestPreview()`, que SÍ cambia `tokenState.token.url` y con él el
	 *   `src` del `<iframe>` — recarga entera, con su flicker y su pérdida de scroll, pero nunca un
	 *   lienzo mostrando algo que ya dejó de ser verdad.
	 * El botón "Reintentar" del error de token es la única excepción: sigue en `requestPreview`
	 * directo, sin pasar por `scheduleCanvasRefresh` — ahí no hay marco vivo al que pedirle un
	 * refresco en vivo, el `<iframe>` ni siquiera existe.
	 *
	 * **La selección tiene un solo dueño: `selectedBlockId`, aquí.** No vive en
	 * `bridge-client.ts` (que es puro transporte, ver su cabecera) ni en `VisualOverlay.svelte`
	 * (que solo pinta lo que le llega y muta bloques sin tocar `selectedBlockId`, ver su cabecera)
	 * ni en `VisualBlockTree.svelte` (mismo criterio: muta bloques, nunca la selección): un segundo
	 * dueño del mismo dato es la vía a que las mitades enseñen cosas distintas, mismo criterio que ya
	 * usa `bridge-client.ts` para la selección `onSelect` frente al estado del puente. Un bloque
	 * borrado (desde el árbol o desde la barra flotante) se limpia de la selección por esta MISMA
	 * vía, sin que ninguna de las dos superficies escriba `selectedBlockId`: `onStructuralChange`
	 * dispara `scheduleCanvasRefresh` (ver "Refresco en vivo" arriba), que por cualquiera de sus dos
	 * caminos —refresco en vivo o recarga entera— acaba en un `ready` posterior al cambio; ese
	 * `ready` ya NO reporta el bloque borrado y `ensureBridgeClient#onState` (más abajo) lo limpia —
	 * el mismo callback pase lo que pase, así que sigue habiendo UN solo escritor de
	 * `selectedBlockId` sin que a este componente le importe qué camino tomó el refresco. Cuando el
	 * sitio manda `select` (clic dentro
	 * de un bloque, en el iframe) O el autor elige una fila del árbol, esta pantalla actualiza
	 * `selectedBlockId` Y avisa al sitio con `highlight`/`scrollTo` (ya expuestos por el cliente)
	 * para que el marco reaccione a su propia selección — `handleBlockSelect`, más abajo, es la
	 * ÚNICA puerta de entrada para las dos fuentes, así que los dos sentidos ("clic en el lienzo
	 * selecciona en el árbol" y "elegir en el árbol resalta el lienzo") quedan sincronizados sin
	 * ningún camino que los pueda desincronizar.
	 *
	 * **Guard de salida**: esta pantalla puede tener ediciones sin guardar desde que el inspector
	 * monta `BlockEditor` de verdad, así que usa `beforeNavigate` + `beforeunload`, **el MISMO
	 * mecanismo que `RecordForm.svelte` y nunca `registerExitGuard`**. Esto no es preferencia: el
	 * audit de P5 (Finding 1) ya cambió `RecordForm` por este motivo exacto, y su cabecera lo deja
	 * escrito — `registerExitGuard` solo intercepta `ctx.nav.*`, así que el atrás/adelante del
	 * navegador, un clic en un enlace y cerrar o recargar la pestaña se llevarían por delante lo
	 * escrito sin preguntar. `beforeNavigate` cubre las tres primeras (incluido `ctx.nav.*`, que por
	 * dentro es `goto()`) y SvelteKit lo da de baja solo al desmontar; `beforeunload` cubre la
	 * cuarta. `window.confirm` es deliberado por la misma razón que allí: `beforeNavigate` necesita
	 * una respuesta SÍNCRONA en el mismo tick para poder cancelar.
	 *
	 * **Sin borrador, a propósito**: pide el token con `createPreviewClient` para
	 * `{collection, id}` SIN `draft` (a diferencia de `PreviewPanel.svelte`, que sí lo manda porque
	 * vive DENTRO de un formulario con cambios sin guardar). Esta pantalla no tiene formulario, así
	 * que enseña el registro guardado — la MISMA razón por la que el registro llega ya cargado
	 * desde la ruta (`ctx.port.get`), no como un `FormModel` editable.
	 *
	 * **Disciplina del token, copiada de `PreviewPanel.svelte` (no reinventada, ver su cabecera)**:
	 * contador de generación para peticiones solapadas (`requestGeneration`), renovación programada
	 * antes de `expiresAt` con el mismo margen y el mismo tope de 32 bits del propio `setTimeout`,
	 * limpieza del temporizador en `onDestroy`, y `frameLoaded` que se resetea en cada petición
	 * nueva (una URL nueva es un documento nuevo, aunque el nodo `<iframe>` del DOM sea el mismo).
	 *
	 * **Dos relojes distintos, cada uno con su propia superficie** — es la pieza de diseño de este
	 * componente, documentada para que nadie los funda en uno:
	 * - El TOKEN (`tokenState`): si no hay una URL que embeber, no hay NADA que enseñar en el
	 *   lienzo — mientras carga o si falla, el hueco del iframe pinta su propio aviso con
	 *   "Reintentar" (mismo criterio que el `frame-wrap` de `PreviewPanel`).
	 * - El PUENTE (`bridgeState`, `createVisualBridgeClient`): gobierna SOLO la barra superior.
	 *   Un `error/no-bridge` (o cualquier otro `kind`) no tapa el iframe — el contrato es explícito
	 *   en que un sitio sin puente (o con un puente que falla) "sigue sirviendo la vista previa de
	 *   siempre, que sí funciona" (§"Handshake and message envelope"). Cubrir el lienzo con un
	 *   error de PUENTE escondería una vista previa que SÍ está funcionando.
	 *
	 * **Por debajo de 900 px no se monta el lienzo, no solo se oculta**: la anchura se mide con
	 * `matchMedia` y el marco ni siquiera existe, así que en un móvil no se pide token ni se
	 * descarga el sitio del cliente entero para acabar enseñando un aviso de «no cabe». Ocultarlo
	 * por CSS habría dejado esa carga en marcha, invisible. Si la ventana se ensancha, se monta y
	 * se pide el token entonces; si se estrecha, se para el puente y se cancela la renovación.
	 *
	 * El cliente del puente se crea UNA VEZ, cuando llega el PRIMER token (necesita su `previewUrl`
	 * para fijar el origen contra el que valida, `bridge-client.ts#originOf`): las renovaciones
	 * posteriores conservan el mismo origen (mismo sitio), así que no hace falta recrearlo — solo
	 * disparar `start()` de nuevo cuando el iframe (con `src` nuevo) vuelve a hacer `load`.
	 * SUPUESTO, escrito para que se pueda desmentir: que el sitio no cambie de ORIGEN entre dos
	 * tokens de la misma sesión. Si un proyecto migrara de dominio a media edición, este cliente
	 * seguiría validando contra el origen viejo y se quedaría sordo al marco nuevo hasta recargar.
	 * No se defiende porque hoy `previewApiUrl` se resuelve una vez por sesión y el saludo tiene su
	 * propio plazo, pero es un supuesto, no una garantía.
	 *
	 * Esta pantalla se REMONTA entera si el autor navega a otro registro (`{#key}` en la ruta), así
	 * que tampoco hace falta resincronizar `type`/`record` cambiando por debajo — a diferencia de
	 * `RecordForm.svelte`, que sí resincroniza un `model` que cambia por debajo (ver su cabecera):
	 * esta pantalla es más simple porque el remontaje entero YA hace ese trabajo por ella. Sí que
	 * hay ahora dirty tracking y bloques con estado propio que perder (`blocks`, más abajo) —
	 * remontar entero es justo lo que también los limpia, sin necesitar la disciplina de resincronía
	 * de `RecordForm`.
	 *
	 * **Anchos de columna ajustables** (petición de David tras usar el editor visual en prod):
	 * `columnWidths` (dueño único, mismo criterio que `selectedBlockId`) gobierna las columnas
	 * árbol/inspector vía variables CSS (`style:--vega-visual-tree-w`/`--inspector-w`, ver el
	 * marcado); `VisualColumnResizer.svelte` traduce arrastre/teclado en llamadas a `setTreeWidth`/
	 * `setInspectorWidth`, que a su vez persisten con `column-widths-storage.ts` (mismo mecanismo
	 * que la densidad, ver `theme/apply.ts`). La manilla del árbol solo se MONTA (no solo se
	 * oculta) por encima de los 1180px del propio punto de corte del árbol
	 * (`treeResizerActive`, medido con `matchMedia` igual que `canvasActive` un poco más abajo):
	 * por debajo, el árbol ya es un cajón fijo que no reserva columna en el grid (ver la cabecera
	 * de `VisualBlockTree.svelte`), así que una manilla ahí no tendría nada que mover. La del
	 * inspector no necesita ese mismo cuidado: su columna nunca colapsa dentro de este grid (solo
	 * desaparece entera junto con el lienzo por debajo de 900px, que ya desmonta la rejilla
	 * completa vía `canvasActive`).
	 *
	 * **El escudo del arrastre** (`resizing`/`.vega-visual-shield`): mientras CUALQUIERA de las dos
	 * manillas está en medio de un gesto (`onDragChange`), una capa transparente cubre el
	 * `<iframe>` del lienzo. Sin esto, en cuanto el puntero entra en el marco (de otro origen) dejan
	 * de llegar sus `pointermove` al `window` de esta pantalla — el arrastre se queda "colgado" a
	 * medio camino la primera vez que el gesto cruza el lienzo entero. La capa no tapa nada más: el
	 * resto de la rejilla ya recibe los eventos con normalidad porque está en el MISMO documento.
	 *
	 * **Tamaño de pantalla + zoom del lienzo (tarea "el acabado: tamaños de pantalla, zoom, atajos
	 * y estado de guardado" del lote del editor visual)**: el cálculo puro vive en `viewport.ts`
	 * (ver su cabecera para el porqué de cada número); aquí solo el DOM. `screenPreset` cambia el
	 * ancho de LAYOUT del `<iframe>` (390/834/el medido, nunca el ancho del `<div>` de Vega — así
	 * el sitio dispara sus propios puntos de corte de verdad); `zoomPreference` decide el factor de
	 * `transform: scale()`.
	 *
	 * El punto CENTRAL, para que nadie lo deshaga sin querer: `<iframe>` y `VisualOverlay` viven
	 * DENTRO del mismo "escenario" (`.vega-visual-stage`, el único elemento que se escala) para que
	 * los contornos escalen con el MISMO factor que el iframe — el puente reporta coordenadas del
	 * VIEWPORT del iframe (`bridge-client.ts`), y `VisualOverlay` ya se posiciona con `inset: 0`
	 * sobre esa misma caja (ver su cabecera), así que escalar el escenario entero mueve las dos
	 * cosas a la vez sin tocar ni un `rect`. Escalar solo el iframe y multiplicar los `rect` a mano
	 * sería un segundo sistema de coordenadas que se desincroniza en el primer redondeo.
	 *
	 * `canvasSize` (ancho/alto de `.vega-visual-canvas`) se mide con `ResizeObserver` — NO con un
	 * único `onMount`/`onDestroy` como el resto de escuchadores de esta pantalla (`message`,
	 * `beforeunload`, las dos `matchMedia`): el elemento observado APARECE Y DESAPARECE con
	 * `canvasActive` (por debajo de 900px no hay `.vega-visual-canvas` que observar), así que su
	 * ciclo de vida tiene que seguir al ELEMENTO, no al componente. Un `$effect` que reacciona a
	 * `canvasEl` (el `bind:this`) hace justo eso: se reconecta cada vez que el elemento vuelve a
	 * existir y su función de limpieza (el `return`, equivalente a `onDestroy` PARA ESE elemento)
	 * desconecta el observer tanto al desmontar la pantalla entera como al estrechar la ventana. No
	 * hace falta un escuchador aparte de `resize` de `window` ni de las manillas de columna:
	 * `ResizeObserver` mide el elemento en sí, así que CUALQUIER causa de que su caja cambie de
	 * tamaño (la ventana, arrastrar una manilla, el árbol colapsando a cajón) dispara el mismo
	 * aviso sin que este componente tenga que enterarse de la causa.
	 *
	 * "Ajustar" en escritorio es (a propósito) un no-op visual: el ancho de layout de escritorio ES
	 * el ancho medido del lienzo, así que la proporción siempre sale `1`. Un zoom FIJO por debajo
	 * de 100% en escritorio sigue teniendo sentido (ver `viewport.ts`, "por qué el iframe se escala
	 * con transform"): el escenario mide el ancho completo del lienzo pero se PINTA más pequeño,
	 * dejando aire alrededor — una miniatura del layout de escritorio entero, no una recarga a otro
	 * tamaño.
	 *
	 * **Atajos de teclado, a nivel de PANTALLA** (mismo encargo): un solo escuchador de `keydown`
	 * en `window`, añadido/quitado en el MISMO `onMount`/`onDestroy` que ya gestiona `message` y
	 * `beforeunload` — no un tercer par para esto. Ver `handleVisualKeydown` para la tabla completa
	 * y el porqué de cada guarda; aquí solo el resumen de las dos piezas menos obvias:
	 * - `⌘S`/`Ctrl+S` es la ÚNICA excepción a `isEditableTarget` (mismo criterio que
	 *   `RecordForm.svelte`, ver su cabecera): tiene que guardar con el foco DENTRO de cualquier
	 *   campo de la ficha, así que nunca mira el `target`, y siempre hace `preventDefault()` para
	 *   matar el diálogo nativo "Guardar página" del navegador. Llama a
	 *   `VisualInspector.svelte#saveSelected()` a través de `inspectorRef` (ver su cabecera para
	 *   por qué hace falta un handle en vez del truco `formEl.requestSubmit()` de `RecordForm`).
	 * - Mover/borrar por teclado respetan la MISMA guarda que sus propios botones equivalentes en
	 *   `VisualOverlay.svelte` — no una tercera copia del criterio: mover reusa
	 *   `anyDirty || anySaving || structuralBusy` (igual que el botón de mover del overlay);
	 *   borrar reusa `anySaving || structuralBusy`, SIN `anyDirty` (igual que el botón de la
	 *   papelera del overlay/árbol — un borrado no necesita esperar a que OTRO bloque termine de
	 *   escribir un campo).
	 *
	 * **Estado de guardado en la barra (mismo encargo)**: `savedAt` es PROPIO de esta pantalla — a
	 * diferencia de `RecordForm.svelte`, NO se siembra del autodate `updated` del registro. Ese
	 * campo pertenece al registro PADRE, y lo que se guarda aquí son sus BLOQUES (otra colección):
	 * editar un bloque nunca toca el `updated` del padre, así que sembrar desde ahí enseñaría una
	 * hora sin relación con lo que se acaba de guardar. Arranca en `null` (nada sabido todavía en
	 * esta sesión de pantalla) y solo se escribe tras un guardado de verdad OCURRIDO AQUÍ —
	 * `handleContentSaved`, la puerta ÚNICA que sustituye a `scheduleCanvasRefresh` como callback de
	 * `onBlockSaved`/`onStructuralChange`, y que sigue pidiendo el refresco del lienzo exactamente
	 * igual que antes de esta tarea (nada de ese contrato cambia, solo se le añade marcar la hora).
	 * Reusa el patrón `.vega-editor-dirty`/`editor.dirty`/`editor.saving`/`editor.savedAt` de
	 * `RecordForm.svelte` — mismas claves i18n y mismo lenguaje visual (punto de 8px en
	 * `--warning`), con nombres de clase propios de este fichero porque el CSS con ámbito de
	 * Svelte no cruza de un componente a otro.
	 *
	 * **Migas** (mismo encargo): colección › documento › bloque seleccionado, para saber dónde
	 * estás cuando la pantalla es todo lienzo. La miga del bloque usa `blocks.blockTitle` sobre el
	 * MISMO registro que resuelve `selectedBlockId` — si el id no resuelve a ningún registro
	 * (selección fantasma, ver la cabecera de `VisualInspector.svelte`) no se pinta esa miga, ni un
	 * guion ni un "ninguno": mentiría sobre algo que el autor no eligió.
	 */
	import { onDestroy, onMount, untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { getVegaContext } from '$lib/app-context';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { VegaRecord } from '$lib/backend';
	import { createPreviewClient, type PreviewToken } from '$lib/backend/preview-client';
	import {
		createVisualBridgeClient,
		VISUAL_PROTOCOL_VERSION,
		type VisualBridgeClient,
		type VisualBridgeErrorKind,
		type VisualBridgeState
	} from './bridge-client';
	import { createBlocksState } from '$lib/form/blocks-state.svelte';
	import { isEditableTarget } from '$lib/shell/keyboard';
	import { describeCell } from '$lib/list/cell';
	import { resolveTitleCellText } from '$lib/list/list-load';
	import EditTopBar from '$lib/shell/EditTopBar.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import VisualOverlay from './VisualOverlay.svelte';
	import VisualBlockTree from './VisualBlockTree.svelte';
	import VisualInspector from './VisualInspector.svelte';
	import VisualColumnResizer from './VisualColumnResizer.svelte';
	import {
		INSPECTOR_DEFAULT_WIDTH,
		INSPECTOR_MAX_WIDTH,
		INSPECTOR_MIN_WIDTH,
		TREE_DEFAULT_WIDTH,
		TREE_MAX_WIDTH,
		TREE_MIN_WIDTH
	} from './column-widths';
	import { readColumnWidths, writeColumnWidths } from './column-widths-storage';
	import {
		frameWidthFor,
		resolveZoomFactor,
		SCREEN_PRESETS,
		stageHeightFor,
		ZOOM_LEVELS,
		type ScreenPreset,
		type ZoomPreference
	} from './viewport';
	import { readViewportPreference, writeViewportPreference } from './viewport-storage';

	interface Props {
		type: ResolvedContentType;
		record: VegaRecord;
	}

	let { type, record }: Props = $props();

	const ctx = getVegaContext();

	// Único `createBlocksState` de esta pantalla (§encargo): árbol e inspector lo reciben como PROP,
	// ninguno de los dos instancia la fábrica por su cuenta (ver sus cabeceras). `resolveVisualGate`
	// ya garantiza `type.blocks` no-nulo para que esta ruta exista (`visual-gate.ts`), así que
	// `parentType: type` siempre resuelve un `blocksConfig` real — `blocks.hidden` solo se activaría
	// por el camino DEFENSIVO de la propia fábrica (carga fallida, tipo hijo no encontrado), no
	// porque falte la capacidad. `getDisabled` fijo a `false`: esta pantalla no tiene un mutex
	// externo tipo "clonando página" que congele la edición de bloques.
	const blocks = createBlocksState({
		ctx,
		parentType: untrack(() => type),
		getParentId: () => record.id,
		getDisabled: () => false,
		onDirtyChange: () => {} // el guard de salida lee `blocks.anyDirty` directo, ver más abajo
	});

	/** Guard de salida (ver cabecera): mismo mecanismo y mismo texto que `RecordForm.svelte`.
	 *  `beforeNavigate` se registra en la inicialización del componente y SvelteKit lo da de baja
	 *  solo al desmontar; `beforeunload` se añade y se quita a mano en `onMount`/`onDestroy`. */
	beforeNavigate((navigation) => {
		if (!blocks.anyDirty) return;
		if (!window.confirm(ctx.t('editor.leaveConfirm'))) navigation.cancel();
	});

	// Capturados UNA vez (`untrack`, mismo patrón que `PreviewPanel.svelte`): esta pantalla se
	// remonta entera si cambia el registro (ver cabecera), así que el valor INICIAL basta. El gate
	// de la ruta (`visual-gate.ts`) ya garantiza `previewApiUrl` no-nulo antes de montar esto.
	const client = createPreviewClient({
		apiUrl: untrack(() => ctx.port.previewApiUrl ?? ''),
		token: ctx.session.token
	});

	type TokenState =
		| { kind: 'loading' }
		| { kind: 'ready'; token: PreviewToken }
		| { kind: 'error'; message: string };

	let tokenState = $state<TokenState>({ kind: 'loading' });
	// `true` tras el evento `load` del documento ACTUAL del iframe (ver cabecera de
	// `PreviewPanel.svelte`, "Qué NO hace"): se resetea en cada petición nueva.
	let frameLoaded = $state(false);
	let bridgeState = $state<VisualBridgeState>({ status: 'idle' });
	let iframeEl = $state<HTMLIFrameElement | undefined>(undefined);
	// Único dueño del bloque seleccionado (ver cabecera, "La selección tiene un solo dueño").
	// `null` = nada seleccionado, el estado inicial hasta el primer `select` del sitio.
	let selectedBlockId = $state<string | null>(null);

	// `true` mientras la ventana da de sí para el lienzo. Arranca en `true` (suposición de
	// escritorio) pero NADA se pide hasta que `onMount` lo mide de verdad, así que en un móvil no
	// llega a salir ninguna petición.
	let canvasActive = $state(true);

	let renewTimer: ReturnType<typeof setTimeout> | null = null;
	let requestGeneration = 0;
	let bridgeClient: VisualBridgeClient | null = null;
	let narrowQuery: MediaQueryList | null = null;
	// ————— Refresco en vivo (ver cabecera, camino nuevo de esta tarea) —————
	/** Rebote de `scheduleCanvasRefresh`: PROPIO, no comparte reloj con `renewTimer` (renovación de
	 *  token) ni con nada de `bridge-client.ts` (su plazo de `refresh()` es interno del cliente). */
	let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	/** Contador de generación de `refreshCanvas` (misma disciplina que `requestGeneration`, ver
	 *  `requestPreview`): distingue la petición de token EN VUELO de una que ya no importa —
	 *  `requestPreview()` también lo incrementa, porque una recarga entera deja sin sentido
	 *  cualquier refresco que siguiera en camino. */
	let refreshGeneration = 0;
	// ————— Anchos de columna ajustables (ver cabecera) —————
	let columnWidths = $state(readColumnWidths());
	// `true` mientras cualquiera de las dos manillas está en medio de un arrastre: gobierna el
	// escudo que tapa el iframe (ver cabecera, "El escudo del arrastre").
	let resizing = $state(false);
	// Arranca en `true` (suposición de escritorio, mismo criterio que `canvasActive`): `onMount`
	// lo mide de verdad antes de que se pinte nada que dependa de esto.
	let treeResizerActive = $state(true);
	let treeQuery: MediaQueryList | null = null;

	// ————— Tamaño de pantalla + zoom del lienzo (ver cabecera) —————
	const initialViewport = readViewportPreference();
	let screenPreset = $state<ScreenPreset>(initialViewport.preset);
	let zoomPreference = $state<ZoomPreference>(initialViewport.zoom);
	/** `.vega-visual-canvas`, medido por `ResizeObserver` (ver cabecera): arranca en `{0, 0}`, sin
	 *  ancho honesto que enseñar hasta el primer aviso — mismo criterio que `frameWidthFor`/
	 *  `resolveZoomFactor` (`viewport.ts`), que degradan sin dividir por cero mientras tanto. */
	let canvasEl = $state<HTMLDivElement | undefined>(undefined);
	let canvasSize = $state({ width: 0, height: 0 });
	// ————— Panel de ayuda de atajos (ver `handleVisualKeydown`) —————
	let helpOpen = $state(false);
	let helpDialogEl = $state<HTMLElement | undefined>(undefined);
	/** Primer elemento focusable del diálogo (su botón de cerrar): destino del foco inicial, mismo
	 *  patrón que `firstScopeEl` de `ExportDialog.svelte`. */
	let helpFirstEl = $state<HTMLElement | undefined>(undefined);
	/** Quién tenía el foco al abrir (el disparador, sea el botón "?" de la barra o la propia tecla
	 *  con el foco en cualquier otro sitio del lienzo): PLANA, no `$state` — solo se lee de forma
	 *  imperativa al cerrar, mismo criterio que `formEl` de `RecordForm.svelte`. */
	let helpPreviouslyFocused: HTMLElement | null = null;
	// ————— Handle del inspector, para el atajo ⌘S (ver `VisualInspector.svelte#saveSelected`) —————
	// `$state` (a diferencia de `formEl` de `RecordForm.svelte`, plano): `bind:this` sobre la
	// instancia de un COMPONENTE, no un nodo DOM nativo, y el compilador exige que el destino sea
	// reactivo para poder rastrear la reasignación — se lee de forma imperativa igual que `formEl`,
	// pero declararlo así calla el aviso `non_reactive_update` sin cambiar nada del criterio.
	let inspectorRef = $state<{ saveSelected: () => void } | undefined>(undefined);
	/** Hora del último guardado CONOCIDO en esta sesión de pantalla (ver cabecera, "Estado de
	 *  guardado en la barra"): `null` hasta el primer guardado real ocurrido aquí. */
	let savedAt = $state<Date | null>(null);

	/** Mismo punto de corte en el que `PreviewPanel.svelte` se retira entera (ver su cabecera). Vive
	 *  aquí y no solo en el CSS porque decide si se MONTA el lienzo, no si se ve. */
	const NARROW_QUERY = '(max-width: 900px)';
	/** Mismo punto de corte en el que el árbol deja de reservar columna (ver la cabecera de
	 *  `VisualBlockTree.svelte`, "Colapsable"): por debajo, su manilla no tiene columna que mover. */
	const TREE_QUERY = '(max-width: 1180px)';

	/** Margen de seguridad antes de `expiresAt` (ver cabecera de `PreviewPanel.svelte`). */
	const RENEW_BUFFER_MS = 15000;
	/** Tope del propio `setTimeout` (entero de 32 bits, ver la misma cabecera para el porqué). */
	const MAX_RENEW_DELAY_MS = 2_147_483_647;
	/** Rebote de `scheduleCanvasRefresh` (ver cabecera): varios campos guardados o varias acciones
	 *  estructurales seguidas piden UN solo token, no uno por cambio. */
	const REFRESH_DEBOUNCE_MS = 200;

	function clearRenewTimer(): void {
		if (renewTimer) clearTimeout(renewTimer);
		renewTimer = null;
	}

	function scheduleRenew(token: PreviewToken): void {
		clearRenewTimer();
		const delay = Math.min(
			MAX_RENEW_DELAY_MS,
			Math.max(0, new Date(token.expiresAt).getTime() - Date.now() - RENEW_BUFFER_MS)
		);
		renewTimer = setTimeout(() => void requestPreview(), delay);
	}

	function clearRefreshDebounce(): void {
		if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
		refreshDebounceTimer = null;
	}

	async function requestPreview(): Promise<void> {
		const generation = ++requestGeneration;
		// Recarga entera: cualquier rebote de refresco en vivo pendiente y cualquier `refreshCanvas`
		// en vuelo dejan de tener sentido (el marco que iban a actualizar va a desmontarse igualmente).
		clearRefreshDebounce();
		refreshGeneration++;
		// Pedir token nuevo desmonta el `<iframe>` (`{#if tokenState.kind === 'ready'}`), así que el
		// documento con el que el puente estaba hablando deja de existir. Sin este `stop()` el
		// cliente se quedaría en `connected` —enseñando en la barra los bloques de una página que ya
		// no está— y el `start()` del `load` siguiente sería un no-op, porque desde `connected` no
		// vuelve a saludar: la reconexión dependería por entero de que el sitio se anuncie solo.
		bridgeClient?.stop();
		tokenState = { kind: 'loading' };
		frameLoaded = false;
		try {
			// SIN `draft` (ver cabecera): esta pantalla no tiene formulario, enseña el registro
			// guardado tal cual `ctx.port.get` lo trajo.
			const token = await client.requestPreview(type.name, String(record.id));
			if (generation !== requestGeneration) return; // llegó tarde: manda la petición posterior
			tokenState = { kind: 'ready', token };
			scheduleRenew(token);
		} catch (err) {
			if (generation !== requestGeneration) return;
			clearRenewTimer();
			tokenState = {
				kind: 'error',
				message: err instanceof Error ? err.message : ctx.t('editor.preview.panel.genericError')
			};
		}
	}

	/** Puerta ÚNICA por la que la estructura o un campo guardado piden refrescar el lienzo (ver
	 *  cabecera, "Refresco en vivo"). El camino se decide AQUÍ, antes de esperar nada, para que el
	 *  camino viejo (recarga entera, `requestPreview`) conserve su tiempo exacto de respuesta — si el
	 *  rebote se aplicara primero a los dos caminos por igual, un sitio SIN refresco en vivo notaría
	 *  200ms más de retraso en cada guardado sin motivo. */
	function scheduleCanvasRefresh(): void {
		const state = bridgeClient?.state;
		if (!(state?.status === 'connected' && state.liveRefresh)) {
			void requestPreview();
			return;
		}
		clearRefreshDebounce();
		refreshDebounceTimer = setTimeout(() => {
			refreshDebounceTimer = null;
			void refreshCanvas();
		}, REFRESH_DEBOUNCE_MS);
	}

	/** Pide un token nuevo y se lo pasa al puente como `refresh()` en vez de escribirlo en
	 *  `tokenState` — escribir ahí cambiaría el `src` del `<iframe>` y recargaría el marco, que es
	 *  justo lo que este camino viene a evitar. Por el mismo motivo NO toca `scheduleRenew`: el token
	 *  del `src` (el que sigue en el iframe) conserva su propia renovación, independiente de este
	 *  refresco. Cualquier fallo —la petición del token, que llegue tarde, o que el puente rechace el
	 *  refresco (sin `liveRefresh`, o su plazo interno venció)— cae al camino de siempre: un flicker
	 *  es preferible a un lienzo que se queda sin actualizar en silencio. */
	async function refreshCanvas(): Promise<void> {
		const generation = ++refreshGeneration;
		try {
			// SIN `draft`, mismo motivo que `requestPreview` (ver cabecera): esta pantalla no tiene
			// formulario.
			const token = await client.requestPreview(type.name, String(record.id));
			// Llegó tarde: manda la petición posterior (misma disciplina que `requestPreview`). Callarse
			// es la ÚNICA salida correcta: caer aquí a la recarga entera no solo tiraría el refresco en
			// vivo que ya estaba en marcha, es que `requestPreview()` incrementa `refreshGeneration` y
			// dejaría obsoleta a esa petición posterior, que recargaría otra vez. Dos guardados seguidos
			// acabarían en dos recargas enteras, justo lo contrario de lo que hace esta pantalla.
			if (generation !== refreshGeneration) return;
			// El token se reenvía ENTERO, sin interpretarlo (§contrato: "the same two fields ...
			// forwarded without being parsed or rewritten"). Hoy `postToken` siempre viene vacío porque
			// esta pantalla pide sin borrador, pero omitirlo aquí sería una divergencia silenciosa que
			// solo se notaría el día que alguien le añada borrador a esta pantalla y no se acuerde de
			// este sitio.
			if (bridgeClient?.refresh({ url: token.url, postToken: token.postToken }) !== true) {
				void requestPreview();
			}
		} catch {
			if (generation !== refreshGeneration) return;
			void requestPreview();
		}
	}

	/** Un guardado de VERDAD acaba de completarse aquí — un campo (`VisualInspector#onBlockSaved`)
	 *  o una mutación estructural (`VisualBlockTree`/`VisualOverlay#onStructuralChange`, y las
	 *  versiones por teclado de `handleVisualKeydown`): marca la hora (ver cabecera, "Estado de
	 *  guardado en la barra") Y pide el refresco de lienzo de siempre. Sustituye a
	 *  `scheduleCanvasRefresh` como el callback que se pasa a los tres consumidores — el contrato de
	 *  refresco no cambia ni una coma, esta función solo le añade el reloj por delante. */
	function handleContentSaved(): void {
		savedAt = new Date();
		scheduleCanvasRefresh();
	}

	/** Puerta ÚNICA de selección (ver cabecera): la llama tanto el sitio (§contrato, `select`, clic
	 *  dentro de un bloque en el iframe) como `VisualBlockTree.svelte` (el autor elige una fila).
	 *  Además de mover el dueño único (`selectedBlockId`), avisa al sitio con `highlight`/
	 *  `scrollTo`: el marco puede querer resaltar visualmente el bloque que acaba de anunciar, o
	 *  desplazarse si la selección vino del árbol y el bloque está fuera de la vista. Las dos
	 *  llamadas son no-op si el puente no está `connected` (`bridge-client.ts#highlight`).
	 */
	function handleBlockSelect(blockId: string): void {
		selectedBlockId = blockId;
		bridgeClient?.highlight(blockId);
		bridgeClient?.scrollTo(blockId);
	}

	/** Crea el cliente del puente la PRIMERA vez que hay un token (ver cabecera): fija el origen
	 *  contra el que valida a partir de esa `previewUrl`. Llamadas posteriores (tras una renovación)
	 *  son no-op: el mismo cliente sigue sirviendo mientras el sitio no cambie de origen. */
	function ensureBridgeClient(previewUrl: string): VisualBridgeClient {
		if (bridgeClient) return bridgeClient;
		bridgeClient = createVisualBridgeClient({
			record: { collection: type.name, id: String(record.id) },
			previewUrl,
			documentUrl: location.href,
			frame: () => iframeEl?.contentWindow ?? null,
			onState: (state) => {
				bridgeState = state;
				// Si el bloque seleccionado ya no está en lo que reporta el sitio (lo borró otra
				// pestaña, cambió la plantilla, o el saludo trae otra página), la selección se
				// LIMPIA aquí mismo. Dejarla apuntando a un id que ya no existe no se nota hoy —el
				// contorno simplemente deja de pintarse— pero el inspector de la tarea siguiente
				// heredaría ese fantasma y abriría la ficha de un bloque que no está. Se hace en
				// este callback, no en un `$effect`, para que siga habiendo UN solo escritor de
				// `selectedBlockId` y ningún ciclo entre efectos.
				if (
					selectedBlockId !== null &&
					state.status === 'connected' &&
					!state.blocks.some((block) => block.id === selectedBlockId)
				) {
					selectedBlockId = null;
				}
			},
			onSelect: handleBlockSelect,
			// El plazo interno de `refresh()` venció, o el propio puente avisó con
			// `error/refresh-failed` (ver `bridge-client.ts`): en los dos casos el cambio no aterrizó
			// y el único camino honesto que queda es la recarga entera de siempre.
			onRefreshFailed: () => void requestPreview()
		});
		return bridgeClient;
	}

	/** `load` del iframe (§contrato, "Vega posts `hello` when the frame fires `load`"): dispara
	 *  también en cada recarga provocada por una renovación de token, que es justo cuando hay que
	 *  volver a saludar. */
	function handleFrameLoad(): void {
		frameLoaded = true;
		if (tokenState.kind !== 'ready') return;
		ensureBridgeClient(tokenState.token.url).start();
	}

	function handleMessage(event: MessageEvent): void {
		bridgeClient?.handleMessage(event);
	}

	function retryBridge(): void {
		bridgeClient?.start();
	}

	/** Monta o desmonta el lienzo según la anchura. Al desmontarlo NO basta con dejar de pintarlo:
	 *  hay que parar el puente, cancelar la renovación programada e invalidar la petición en vuelo
	 *  (`requestGeneration`), o el token seguiría renovándose contra un marco que ya no existe. Y
	 *  también el rebote de refresco en vivo: sin cancelarlo, un `scheduleCanvasRefresh` pendiente de
	 *  antes de estrechar la ventana dispararía `refreshCanvas` sobre un lienzo que ya no existe. */
	function applyWidth(wide: boolean): void {
		if (wide === canvasActive) return;
		canvasActive = wide;
		if (wide) {
			void requestPreview();
			return;
		}
		requestGeneration++;
		refreshGeneration++;
		clearRefreshDebounce();
		bridgeClient?.stop();
		clearRenewTimer();
		tokenState = { kind: 'loading' };
		frameLoaded = false;
	}

	function handleNarrowChange(event: MediaQueryListEvent): void {
		applyWidth(!event.matches);
	}

	function handleTreeQueryChange(event: MediaQueryListEvent): void {
		treeResizerActive = !event.matches;
	}

	/** `VisualColumnResizer.svelte` ya llega con el ancho recortado a `[min, max]` (ver su
	 *  cabecera): estos setters no vuelven a recortar, solo escriben — un segundo recorte aquí
	 *  escondería una rotura del tope de la manilla detrás de este otro, y entonces romperla a
	 *  propósito (ver el encargo) no pondría ningún test en rojo. */
	function setTreeWidth(next: number): void {
		columnWidths = { ...columnWidths, tree: next };
		writeColumnWidths(columnWidths);
	}

	function setInspectorWidth(next: number): void {
		columnWidths = { ...columnWidths, inspector: next };
		writeColumnWidths(columnWidths);
	}

	function setResizing(active: boolean): void {
		resizing = active;
	}

	/** Cierre o recarga de pestaña: `beforeNavigate` no los ve (no son navegación del router), así
	 *  que hace falta este segundo escuchador — mismo par que `RecordForm.svelte`. */
	function handleBeforeUnload(event: BeforeUnloadEvent): void {
		if (!blocks.anyDirty) return;
		event.preventDefault();
		event.returnValue = '';
	}

	// ————— Tamaño de pantalla + zoom (ver cabecera) —————

	function setScreenPreset(preset: ScreenPreset): void {
		screenPreset = preset;
		writeViewportPreference({ preset: screenPreset, zoom: zoomPreference });
	}

	function setZoom(zoom: ZoomPreference): void {
		zoomPreference = zoom;
		writeViewportPreference({ preset: screenPreset, zoom: zoomPreference });
	}

	/** `.vega-visual-canvas` aparece y desaparece con `canvasActive` (ver cabecera): este `$effect`
	 *  reacciona al propio `bind:this`, no a un `onMount` único, para que el observer se reconecte
	 *  cada vez que el elemento vuelve a existir. La función de limpieza (equivalente a `onDestroy`
	 *  PARA ESE elemento) desconecta tanto al desmontar la pantalla como al estrechar la ventana. */
	$effect(() => {
		if (!canvasEl) return;
		const el = canvasEl;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			canvasSize = { width: entry.contentRect.width, height: entry.contentRect.height };
		});
		observer.observe(el);
		return () => observer.disconnect();
	});

	/** Ancho de LAYOUT del iframe (390/834/el medido de `.vega-visual-canvas`, ver `viewport.ts`). */
	const frameWidth = $derived(frameWidthFor(screenPreset, canvasSize.width));
	/** Factor de `transform: scale()` del "escenario" (ver cabecera). */
	const zoomFactor = $derived(resolveZoomFactor(zoomPreference, canvasSize.width, frameWidth));
	/** Alto propio del escenario, para que al escalarlo llene el lienzo exacto (ver `viewport.ts`). */
	const stageHeightPx = $derived(stageHeightFor(canvasSize.height, zoomFactor));

	// ————— Panel de ayuda de atajos (ver `handleVisualKeydown`) —————

	function closeHelp(): void {
		helpOpen = false;
	}

	function helpFocusableItems(): HTMLElement[] {
		return helpDialogEl ? Array.from(helpDialogEl.querySelectorAll<HTMLElement>('button')) : [];
	}

	/** Solo atrapa `Tab` — `Esc` lo gestiona `handleVisualKeydown` (mismo escuchador de `window` de
	 *  toda la pantalla, ver su cabecera): un segundo camino para la misma tecla aquí sería el
	 *  antipatrón "dos escritores, un solo estado" que ya evita el resto de este componente. */
	function handleHelpDialogKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Tab') return;
		const items = helpFocusableItems();
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	/** Foco inicial + foco de vuelta al disparador (mismo patrón que `ExportDialog.svelte`, ver su
	 *  cabecera): `document.activeElement` YA es el disparador cuando este efecto corre, sea el
	 *  botón "?" de la barra o cualquier otro punto del lienzo si el panel se abrió con la tecla —
	 *  no hace falta distinguir el origen. `document.contains(...)` antes de devolver el foco: el
	 *  disparador podría haber desaparecido del DOM mientras el panel estaba abierto (landmine ya
	 *  documentada en este repo: ocultar un elemento anula su `.focus()`). */
	$effect(() => {
		if (!helpOpen) return;
		helpPreviouslyFocused = document.activeElement as HTMLElement | null;
		helpFirstEl?.focus();
		return () => {
			if (helpPreviouslyFocused && document.contains(helpPreviouslyFocused)) {
				helpPreviouslyFocused.focus();
			}
		};
	});

	// ————— Acciones estructurales por teclado (mover/borrar el bloque seleccionado) —————

	/** Mismo guard que el botón de mover de `VisualOverlay.svelte` (ver su cabecera): duplicar/
	 *  mover se congelan mientras haya CUALQUIER bloque sin guardar, un guardado en vuelo, o ya
	 *  otra mutación estructural en marcha. */
	const structuralGuard = $derived(blocks.anyDirty || blocks.anySaving || blocks.structuralBusy);

	/** `handleReorder` SÍ trae señal de éxito (a diferencia de crear/duplicar/borrar): solo se pide
	 *  vista previa nueva y se marca la hora si de verdad cambió algo. */
	async function moveSelectedBlock(direction: -1 | 1): Promise<void> {
		if (selectedBlockId === null || structuralGuard) return;
		const index = blocks.records.findIndex((r) => r.id === selectedBlockId);
		if (index < 0) return;
		const target = index + direction;
		if (target < 0 || target >= blocks.records.length) return;
		const moved = await blocks.handleReorder(index, target);
		if (moved) handleContentSaved();
	}

	/** Abre el MISMO diálogo de confirmación que ya pintan `VisualBlockTree.svelte`/
	 *  `VisualOverlay.svelte` (comparten `blocks.pendingDelete`, un solo dato — ver la cabecera del
	 *  árbol): esta pantalla no borra a pelo, solo pide el borrado. Mismo guard que el botón de la
	 *  papelera del overlay/árbol — `anySaving || structuralBusy`, SIN `anyDirty` (ver cabecera). */
	function requestDeleteSelected(): void {
		if (selectedBlockId === null || blocks.anySaving || blocks.structuralBusy) return;
		const record = blocks.records.find((r) => r.id === selectedBlockId);
		if (record) blocks.requestDelete(record);
	}

	// ————— Atajos de teclado a nivel de PANTALLA (ver cabecera, tabla completa aquí) —————
	//
	// | Tecla                  | Acción                                              |
	// |-------------------------|-----------------------------------------------------|
	// | Esc                     | deseleccionar el bloque (o cerrar el panel de ayuda) |
	// | Alt+↑ / Alt+↓            | mover el bloque seleccionado arriba/abajo            |
	// | Supr / Retroceso         | pedir el borrado del seleccionado (abre el diálogo)  |
	// | ⌘S / Ctrl+S              | guardar el bloque seleccionado                       |
	// | ?                        | abrir/cerrar el panel de ayuda de atajos             |
	function handleVisualKeydown(event: KeyboardEvent): void {
		// Callado ENTERO sin lienzo montado (ver cabecera): nada seleccionable ni nada que guardar
		// en esa vista.
		if (!canvasActive) return;

		// ⌘S: ÚNICA excepción a `isEditableTarget` (ver cabecera) — nunca mira el target, siempre
		// `preventDefault()` para matar el diálogo nativo "Guardar página" del navegador.
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
			event.preventDefault();
			inspectorRef?.saveSelected();
			return;
		}

		// Resto: atajos de una sola tecla (o con Alt). Se callan con el foco en un campo editable
		// (`isEditableTarget`), o robarían la pulsación al propio campo. `Escape` NO es excepción y
		// va por debajo de esta guarda a propósito: con el foco dentro de un campo de la ficha, Esc
		// es del campo (el navegador lo usa para descartar el autocompletado), no de la pantalla —
		// deseleccionar ahí cerraría de golpe la ficha que se está escribiendo.
		if (isEditableTarget(event.target)) return;

		if (event.key === 'Escape') {
			// Con el panel de ayuda abierto, Esc LO CIERRA y no deselecciona (§encargo): el panel
			// gana mientras está abierto.
			if (helpOpen) closeHelp();
			else selectedBlockId = null; // mismo dueño único que `handleBlockSelect` (ver cabecera)
			return;
		}

		if (event.key === '?') {
			event.preventDefault();
			helpOpen = !helpOpen;
			return;
		}

		if (helpOpen) return; // con el panel abierto, ninguna otra tecla actúa sobre el lienzo

		if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
			event.preventDefault();
			void moveSelectedBlock(event.key === 'ArrowUp' ? -1 : 1);
			return;
		}
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			requestDeleteSelected();
		}
	}

	onMount(() => {
		window.addEventListener('message', handleMessage);
		window.addEventListener('beforeunload', handleBeforeUnload);
		window.addEventListener('keydown', handleVisualKeydown);
		narrowQuery = window.matchMedia(NARROW_QUERY);
		canvasActive = !narrowQuery.matches;
		narrowQuery.addEventListener('change', handleNarrowChange);
		treeQuery = window.matchMedia(TREE_QUERY);
		treeResizerActive = !treeQuery.matches;
		treeQuery.addEventListener('change', handleTreeQueryChange);
		if (canvasActive) void requestPreview();
	});

	onDestroy(() => {
		// Invalida lo que siga EN VUELO, exactamente igual que `applyWidth` al desmontar el lienzo
		// (ver su comentario): cancelar los temporizadores no basta. Una petición de token que
		// resuelva DESPUÉS de esto pasaría su propia guarda de generación (se la asignó ella misma al
		// empezar), escribiría `tokenState` de un componente que ya no existe y, lo caro, armaría un
		// `renewTimer` nuevo que ya nadie puede cancelar — `onDestroy` no vuelve a correr, así que
		// ese temporizador se reprograma solo y pide token para siempre. Es alcanzable de verdad:
		// guardar un campo limpia el dirty (o sea que el guard de salida ya no pregunta) y deja un
		// `refreshCanvas` pidiendo token por red; basta con darle a "atrás" en esos milisegundos.
		requestGeneration++;
		refreshGeneration++;
		clearRenewTimer();
		clearRefreshDebounce();
		window.removeEventListener('message', handleMessage);
		window.removeEventListener('beforeunload', handleBeforeUnload);
		window.removeEventListener('keydown', handleVisualKeydown);
		narrowQuery?.removeEventListener('change', handleNarrowChange);
		treeQuery?.removeEventListener('change', handleTreeQueryChange);
		bridgeClient?.stop();
	});

	/** Nombre del registro en la barra: MISMA derivación que `docName` de `RecordForm.svelte`
	 *  (§"Nombre del documento" de su cabecera), sobre el registro YA guardado que trae esta
	 *  pantalla (nunca hay modo creación aquí). */
	const docName = $derived.by(() => {
		const titleField = type.titleField;
		if (titleField === null) return ctx.t('list.untitled');
		const field = type.fields.find((f) => f.name === titleField);
		if (!field) return ctx.t('list.untitled');
		const descriptor = describeCell(field, record.values[titleField] ?? null, ctx.locale);
		return resolveTitleCellText(descriptor, ctx.t('list.untitled'));
	});

	/** Última miga (ver cabecera, "Migas"): título del bloque seleccionado, o `null` sin selección
	 *  Y sin selección FANTASMA (un id que el sitio reporta pero no resuelve a ningún registro,
	 *  mismo caso que `danglingSelection` de `VisualInspector.svelte`) — en los dos casos de `null`
	 *  no se pinta ninguna miga de más, ni un guion ni un "ninguno". */
	const selectedBlockTitle = $derived.by(() => {
		if (selectedBlockId === null) return null;
		const selectedRecord = blocks.records.find((r) => r.id === selectedBlockId);
		return selectedRecord ? blocks.blockTitle(selectedRecord) : null;
	});

	/** HH:MM localizado (mismo criterio de locale que `RecordForm.svelte#savedAtText`), o `null`
	 *  sin hora conocida todavía (ver `savedAt`). */
	const savedAtText = $derived(
		savedAt === null
			? null
			: ctx.t('editor.savedAt', {
					time: new Intl.DateTimeFormat(ctx.locale, { hour: '2-digit', minute: '2-digit' }).format(
						savedAt
					)
				})
	);

	/** Traduce los CINCO estados de `bridgeState` a los DOS que necesita `VisualOverlay.svelte`
	 *  (ver su cabecera): solo `connected` trae bloques ciertos. `idle`/`connecting`/`error`
	 *  caen todos en `'waiting'` — un `error` (p.ej. `no-bridge`) ya lo cuenta la barra superior
	 *  con su propio texto y botón de reintentar (ver cabecera, "Dos relojes distintos"); el
	 *  lienzo no necesita repetir esa historia con otras palabras, solo no mentir sobre bloques
	 *  que no existen. */
	const overlayStatus = $derived(bridgeState.status === 'connected' ? 'ready' : 'waiting');
	const overlayBlocks = $derived(bridgeState.status === 'connected' ? bridgeState.blocks : []);
	const overlaySkippedBlocks = $derived(
		bridgeState.status === 'connected' ? bridgeState.skippedBlocks : 0
	);

	interface BridgeErrorText {
		title: string;
		body: string;
		/** `false` para `bad-preview-url`: la URL se fija al crear el cliente, así que reintentar
		 *  no puede cambiar nada (ver `bridge-client.ts#start`). Los otros cuatro SÍ pueden curarse
		 *  solos (un `ready` tardío) o con un reintento (el sitio se redespliega, la versión se
		 *  actualiza). */
		canRetry: boolean;
	}

	function bridgeErrorText(kind: VisualBridgeErrorKind, state: VisualBridgeState): BridgeErrorText {
		switch (kind) {
			case 'no-bridge':
				return {
					title: ctx.t('editor.visual.error.noBridge.title'),
					body: ctx.t('editor.visual.error.noBridge.body'),
					canRetry: true
				};
			case 'protocol-version':
				return {
					title: ctx.t('editor.visual.error.protocolVersion.title'),
					body: ctx.t('editor.visual.error.protocolVersion.body', {
						found: state.status === 'error' ? (state.version ?? '') : '',
						expected: VISUAL_PROTOCOL_VERSION
					}),
					canRetry: true
				};
			case 'site-error':
				return {
					title: ctx.t('editor.visual.error.siteError.title'),
					body: ctx.t('editor.visual.error.siteError.body', {
						code: state.status === 'error' ? (state.code ?? '') : ''
					}),
					canRetry: true
				};
			case 'record-mismatch':
				return {
					title: ctx.t('editor.visual.error.recordMismatch.title'),
					body: ctx.t('editor.visual.error.recordMismatch.body', {
						collection: state.status === 'error' ? (state.found?.collection ?? '') : '',
						id: state.status === 'error' ? (state.found?.id ?? '') : ''
					}),
					canRetry: true
				};
			case 'bad-preview-url':
				return {
					title: ctx.t('editor.visual.error.badPreviewUrl.title'),
					body: ctx.t('editor.visual.error.badPreviewUrl.body'),
					canRetry: false
				};
		}
	}
</script>

<div class="vega-visual-screen">
	<EditTopBar bleed>
		{#snippet crumb()}
			<button
				type="button"
				class="vega-visual-back"
				onclick={() => ctx.nav.toRecord(type.name, record.id)}
			>
				<Icon id="chevron" size={14} />
				{ctx.t('editor.visual.back')}
			</button>
			<!-- Migas (ver cabecera, "Migas"): colección › documento › bloque seleccionado. `<ol>`
			     + `aria-current="page"` en la ÚLTIMA (patrón APG de breadcrumb) — el separador `›`
			     es un `::before` de CSS, decorativo por construcción (no entra en el árbol de
			     accesibilidad salvo que se referencie, que no es el caso). -->
			<nav class="vega-visual-breadcrumbs" aria-label={ctx.t('editor.visual.breadcrumbs.label')}>
				<ol>
					<li>{type.label}</li>
					<li aria-current={selectedBlockTitle === null ? 'page' : undefined}>{docName}</li>
					{#if selectedBlockTitle !== null}
						<li aria-current="page">{selectedBlockTitle}</li>
					{/if}
				</ol>
			</nav>
		{/snippet}
		{#snippet actions()}
			<!-- Estado de guardado (ver cabecera, "Estado de guardado en la barra"): mismo patrón que
			     `RecordForm.svelte` (`.vega-editor-dirty`/`editor.dirty`/`editor.saving`/
			     `editor.savedAt`), nombres de clase propios de este fichero (el CSS con ámbito de
			     Svelte no cruza componentes). Las TRES ramas son mutuamente excluyentes, en el mismo
			     orden de prioridad que allí: guardando > sin guardar > última hora conocida. -->
			{#if blocks.anySaving || blocks.structuralBusy}
				<span class="vega-visual-saved-at vega-visual-saved-at--saving">
					{ctx.t('editor.saving')}
				</span>
			{:else if blocks.anyDirty}
				<span class="vega-visual-dirty" title={ctx.t('editor.dirty')}>
					<span class="vega-visually-hidden">{ctx.t('editor.dirty')}</span>
				</span>
			{:else if savedAtText}
				<span class="vega-visual-saved-at">{savedAtText}</span>
			{/if}

			{#if canvasActive}
				<!-- Conmutador de tamaño de pantalla (ver cabecera): `role="group"` + `aria-pressed`,
				     no `radiogroup` — son TRES botones alcanzables por Tab con un clic simple cada
				     uno, sin necesidad de navegación por flechas (mismo criterio que el propio botón
				     "Vista previa" de `RecordForm.svelte`, que también usa `aria-pressed` para su
				     toggle). Un `radiogroup` de verdad exigiría implementar esa navegación sin que
				     este control la necesite. -->
				<div
					class="vega-visual-screen-group"
					role="group"
					aria-label={ctx.t('editor.visual.screen.groupLabel')}
				>
					{#each SCREEN_PRESETS as preset (preset)}
						<button
							type="button"
							class="vega-visual-screen-btn"
							aria-pressed={screenPreset === preset}
							onclick={() => setScreenPreset(preset)}
						>
							{ctx.t(`editor.visual.screen.${preset}`)}
						</button>
					{/each}
				</div>
				<span class="vega-visual-screen-width">
					{ctx.t('editor.visual.screen.width', { width: frameWidth })}
				</span>

				<!-- Zoom (ver cabecera): mismo criterio de accesibilidad que el conmutador de arriba. -->
				<div
					class="vega-visual-zoom-group"
					role="group"
					aria-label={ctx.t('editor.visual.zoom.groupLabel')}
				>
					{#each ZOOM_LEVELS as level (level)}
						<button
							type="button"
							class="vega-visual-zoom-btn"
							aria-pressed={zoomPreference === level}
							onclick={() => setZoom(level)}
						>
							{ctx.t('editor.visual.zoom.level', { percent: level })}
						</button>
					{/each}
					<button
						type="button"
						class="vega-visual-zoom-btn"
						aria-pressed={zoomPreference === 'fit'}
						onclick={() => setZoom('fit')}
					>
						{ctx.t('editor.visual.zoom.fit')}
					</button>
				</div>
				<span class="vega-visual-zoom-value">
					{ctx.t('editor.visual.zoom.level', { percent: Math.round(zoomFactor * 100) })}
				</span>

				<button
					type="button"
					class="vega-visual-help-toggle"
					aria-label={ctx.t('editor.visual.help.toggle')}
					aria-pressed={helpOpen}
					onclick={() => (helpOpen = !helpOpen)}
				>
					?
				</button>
			{/if}

			<div class="vega-visual-status" aria-live="polite">
				{#if bridgeState.status === 'connected'}
					<span class="vega-visual-status-text">
						{ctx.t('editor.visual.connected', { count: bridgeState.blocks.length })}
					</span>
				{:else if bridgeState.status === 'error'}
					{@const errorText = bridgeErrorText(bridgeState.kind, bridgeState)}
					<span class="vega-visual-status-text vega-visual-status-text--error">
						{errorText.title}
					</span>
					<span class="vega-visual-status-detail">{errorText.body}</span>
					{#if errorText.canRetry}
						<button type="button" class="vega-visual-retry" onclick={retryBridge}>
							{ctx.t('common.retry')}
						</button>
					{/if}
				{:else if canvasActive && tokenState.kind !== 'error'}
					<!-- "Conectando" SOLO mientras la conexión sigue viva. Con el token caído no hay
					     marco con el que saludar, y decir aquí que se está conectando mientras el lienzo
					     enseña el error del token sería contar dos historias distintas del mismo fallo:
					     el mensaje lo da el lienzo, que es quien lo sabe. -->
					<span class="vega-visual-status-text">{ctx.t('editor.visual.connecting')}</span>
				{/if}
			</div>
		{/snippet}
	</EditTopBar>

	{#if canvasActive}
		<div
			class="vega-visual-grid vega-visual-grid--tree vega-visual-grid--inspector"
			style:--vega-visual-tree-w="{columnWidths.tree}px"
			style:--vega-visual-inspector-w="{columnWidths.inspector}px"
		>
			<!-- Tres columnas, mismo patrón que `.vega-editor-grid--rail`/`--aside` de
			     `RecordForm.svelte` (ver su cabecera): árbol | lienzo | inspector. Las dos columnas
			     laterales SIEMPRE están presentes en esta rama (a diferencia del raíl/aside de
			     `RecordForm`, opt-in por manifiesto): `resolveVisualGate` ya exige `type.blocks` para
			     que esta ruta exista, así que el árbol/inspector siempre tienen algo que decir, aunque
			     sea un aviso ("todavía no hay bloques", "elige uno"). Las manillas (ver cabecera,
			     "Anchos de columna ajustables") son celdas del MISMO grid, a propósito: su orden en
			     el marcado tiene que casar con el de `grid-template-columns` del CSS. -->
			<VisualBlockTree
				{blocks}
				selectedId={selectedBlockId}
				onSelect={handleBlockSelect}
				onStructuralChange={handleContentSaved}
			/>
			{#if treeResizerActive}
				<VisualColumnResizer
					value={columnWidths.tree}
					min={TREE_MIN_WIDTH}
					max={TREE_MAX_WIDTH}
					defaultValue={TREE_DEFAULT_WIDTH}
					sign={1}
					label={ctx.t('editor.visual.resize.tree')}
					onResize={setTreeWidth}
					onDragChange={setResizing}
				/>
			{/if}
			<div class="vega-visual-canvas" bind:this={canvasEl}>
				{#if tokenState.kind === 'ready'}
					<!-- Escenario del zoom (ver cabecera, "Tamaño de pantalla + zoom del lienzo"):
					     iframe + overlay viven dentro de la MISMA caja escalada, así que los
					     contornos siguen casando con las coordenadas del puente sin tocar ni un
					     `rect`. Ancho/alto/escala van INLINE (`style:`): son números calculados, no
					     constantes que quepan en una regla CSS. -->
					<div
						class="vega-visual-stage"
						style:width="{frameWidth}px"
						style:height="{stageHeightPx}px"
						style:transform="scale({zoomFactor})"
					>
						<iframe
							class="vega-visual-frame"
							bind:this={iframeEl}
							src={tokenState.token.url}
							title={ctx.t('editor.visual.frameTitle')}
							referrerpolicy="no-referrer"
							onload={handleFrameLoad}
						></iframe>
						<!-- ANTES del skeleton de token de abajo en el DOM a propósito: mientras el
						     token sigue cargando o el `load` del marco no ha disparado, ese skeleton
						     (más adelante, misma pila de apilamiento) tapa este overlay entero — no
						     hace falta `z-index`, solo el orden. Una vez visible, no tiene nada que
						     tapar: pinta "sin bloques todavía" hasta que el puente conteste. -->
						<VisualOverlay
							blocks={overlayBlocks}
							selectedId={selectedBlockId}
							highlightedId={null}
							skippedBlocks={overlaySkippedBlocks}
							status={overlayStatus}
							renderedBlockTypes={ctx.port.renderedBlockTypes ?? null}
							blocksState={blocks}
							onStructuralChange={handleContentSaved}
						/>
					</div>
				{/if}
				{#if tokenState.kind === 'loading' || (tokenState.kind === 'ready' && !frameLoaded)}
					<div class="vega-visual-overlay" aria-live="polite">
						<p>{ctx.t('editor.visual.connecting')}</p>
					</div>
				{:else if tokenState.kind === 'error'}
					<div class="vega-visual-overlay vega-visual-overlay--error" role="alert">
						<p>{ctx.t('editor.visual.token.error', { message: tokenState.message })}</p>
						<button type="button" onclick={() => void requestPreview()}>
							{ctx.t('common.retry')}
						</button>
					</div>
				{/if}
				{#if resizing}
					<!-- Escudo del arrastre (ver cabecera): solo existe mientras dura, así que fuera de
					     un arrastre el iframe recibe sus eventos de siempre sin ninguna capa de por
					     medio. -->
					<div class="vega-visual-shield" aria-hidden="true"></div>
				{/if}
			</div>
			<VisualColumnResizer
				value={columnWidths.inspector}
				min={INSPECTOR_MIN_WIDTH}
				max={INSPECTOR_MAX_WIDTH}
				defaultValue={INSPECTOR_DEFAULT_WIDTH}
				sign={-1}
				label={ctx.t('editor.visual.resize.inspector')}
				onResize={setInspectorWidth}
				onDragChange={setResizing}
			/>
			<VisualInspector
				bind:this={inspectorRef}
				{blocks}
				selectedId={selectedBlockId}
				onBlockSaved={handleContentSaved}
			/>
		</div>
	{:else}
		<!-- Responsive (ver cabecera): por debajo de 900px (mismo punto de corte en el que
	     `PreviewPanel.svelte` se retira entera) no tiene sitio un lienzo junto a sus futuros
	     paneles. Degradación HONESTA y COMPLETA: el lienzo no se oculta, no se monta — así no se
	     descarga el sitio del cliente para acabar enseñando este aviso. -->
		<div class="vega-visual-narrow">
			<p class="vega-visual-narrow-title">{ctx.t('editor.visual.tooNarrow.title')}</p>
			<p>{ctx.t('editor.visual.tooNarrow.body')}</p>
			<button type="button" onclick={() => ctx.nav.toRecord(type.name, record.id)}>
				{ctx.t('editor.visual.back')}
			</button>
		</div>
	{/if}

	<!-- Panel de ayuda de atajos (ver cabecera, "Atajos de teclado" + `handleVisualKeydown`):
	     diálogo modal con foco atrapado (mismo patrón que `ExportDialog.svelte`) — `Esc` lo cierra
	     vía el escuchador de `window` de toda la pantalla (no un segundo escuchador aquí, ver
	     `handleHelpDialogKeydown`), y el foco vuelve a su disparador al cerrarse. -->
	{#if helpOpen}
		<div class="vega-visual-help-backdrop">
			<div
				class="vega-visual-help-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="vega-visual-help-title"
				tabindex="-1"
				bind:this={helpDialogEl}
				onkeydown={handleHelpDialogKeydown}
			>
				<div class="vega-visual-help-head">
					<h2 id="vega-visual-help-title">{ctx.t('editor.visual.help.title')}</h2>
					<button
						type="button"
						class="vega-visual-help-close"
						bind:this={helpFirstEl}
						aria-label={ctx.t('common.close')}
						onclick={closeHelp}
					>
						<Icon id="close" size={16} />
					</button>
				</div>
				<dl class="vega-visual-help-list">
					<div>
						<dt><kbd>Esc</kbd></dt>
						<dd>{ctx.t('editor.visual.help.deselect')}</dd>
					</div>
					<div>
						<dt><kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd></dt>
						<dd>{ctx.t('editor.visual.help.move')}</dd>
					</div>
					<div>
						<dt><kbd>Supr</kbd> / <kbd>⌫</kbd></dt>
						<dd>{ctx.t('editor.visual.help.delete')}</dd>
					</div>
					<div>
						<dt><kbd>⌘S</kbd> / <kbd>Ctrl+S</kbd></dt>
						<dd>{ctx.t('editor.visual.help.save')}</dd>
					</div>
					<div>
						<dt><kbd>?</kbd></dt>
						<dd>{ctx.t('editor.visual.help.toggleHelp')}</dd>
					</div>
				</dl>
				<!-- La asimetría se DICE con palabras (§encargo), no se deja implícita: mover/
				     duplicar/borrar/crear secciones se guardan solos (decisión 1 de
				     `blocks-state.svelte.ts`); el texto de un campo se guarda con el botón
				     "Guardar" de la ficha. -->
				<p class="vega-visual-help-asymmetry">{ctx.t('editor.visual.help.asymmetry')}</p>
			</div>
		</div>
	{/if}
</div>

<style>
	/* A sangre (mismo criterio que `.vega-record-form` de `RecordForm.svelte`, ver su cabecera):
	   cancela el padding de `.vega-main` (`AppShell.svelte`) con márgenes negativos y ocupa el alto
	   ENTERO del hueco de contenido — la topbar de la app y el rail se quedan (son la salida, ver
	   cabecera), solo el `<main>` de `AppShell` desaparece bajo esta pantalla. Altura calculada, no
	   heredada de `.vega-main` (que scrollearía si el contenido se saliera): el iframe llena el
	   hueco exacto y el scroll que importa es el del SITIO, dentro del propio marco. */
	.vega-visual-screen {
		display: flex;
		flex-direction: column;
		min-width: 0;
		/* A sangre por los LADOS y por abajo, pero NO por arriba, y el porqué es un bug medido:
		   `EditTopBar` es `position: sticky; top: 0` contra el scroll de `.vega-main`, así que se
		   pega 1.75rem por debajo de su posición de flujo (el padding superior de `.vega-main`) y
		   se traga esa franja del contenido que va detrás. Con `margin-top: -1.75rem` el aviso de
		   pantalla estrecha quedaba con su TÍTULO entero debajo de la barra (`z-index: 9`), o sea
		   invisible. Cancelar el padding lateral e inferior no tiene ese problema porque ahí no
		   hay nada pegajoso. */
		margin: 0 -2rem -2.5rem;
		height: calc(100vh - var(--topbar-h) - 1.75rem);
		height: calc(100dvh - var(--topbar-h) - 1.75rem);
	}

	.vega-visual-back {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		padding: 0 0.5rem;
		border: 0;
		background: none;
		color: var(--ink-2);
		font-size: 0.85rem;
		font-weight: 550;
		cursor: pointer;
	}

	.vega-visual-back:hover {
		color: var(--ink);
	}

	/* Migas (ver cabecera, "Migas"): `<ol>` en fila, separador `›` como `::before` de CADA `li`
	   salvo el primero (`:not(:first-child)`) — así no hay que fabricar un `<span>` decorativo por
	   separador y el propio separador nunca entra en el árbol de accesibilidad. */
	.vega-visual-breadcrumbs ol {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-visual-breadcrumbs li {
		color: var(--ink-2);
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}

	/* La última miga (`aria-current="page"`) es la que importa de verdad: mismo peso/tinta que
	   `.vega-editor-doc` tenía antes de esta tarea (título del documento en negrita). */
	.vega-visual-breadcrumbs li[aria-current='page'] {
		color: var(--ink-hi);
		font-weight: 650;
	}

	.vega-visual-breadcrumbs li:not(:first-child)::before {
		content: '›';
		margin-right: 0.35rem;
		color: var(--ink-3);
	}

	/* Estado de guardado (ver cabecera, "Estado de guardado en la barra"): mismo lenguaje visual
	   que `.vega-editor-dirty`/`.vega-editor-saved-at` de `RecordForm.svelte` (ver su cabecera para
	   el porqué de cada pieza) — nombres de clase propios porque el CSS con ámbito de Svelte no
	   cruza de un componente a otro. */
	.vega-visual-dirty {
		display: inline-block;
		flex-shrink: 0;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--warning);
		overflow: hidden;
	}

	.vega-visual-saved-at {
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--ink-2);
		white-space: nowrap;
	}

	.vega-visual-saved-at--saving::before {
		content: '⟳ ';
		color: var(--info);
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

	.vega-visual-status {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 0.8125rem;
	}

	.vega-visual-status-text {
		color: var(--ink-2);
	}

	.vega-visual-status-text--error {
		color: var(--danger);
		font-weight: 600;
	}

	.vega-visual-status-detail {
		color: var(--ink-2);
	}

	.vega-visual-retry {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.9rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface-2);
		color: var(--ink);
		font-size: 0.8125rem;
		font-weight: 550;
		cursor: pointer;
	}

	.vega-visual-retry:hover {
		border-color: var(--line-strong);
	}

	/* Conmutador de tamaño de pantalla + zoom (ver cabecera): mismo lenguaje visual que las tres
	   otras "píldoras de grupo" de la app (`.vega-locale-tabs`, `.vega-tree-add-menu`…): un
	   contenedor con borde, botones sin borde propio, el activo se distingue por fondo/tinta de
	   acento (`aria-pressed`, ver el marcado). */
	.vega-visual-screen-group,
	.vega-visual-zoom-group {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
		padding: 0.15rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
	}

	.vega-visual-screen-btn,
	.vega-visual-zoom-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 26px;
		padding: 0 0.55rem;
		border: 0;
		border-radius: calc(var(--r) / 1.5);
		background: transparent;
		color: var(--ink-2);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}

	.vega-visual-screen-btn:hover,
	.vega-visual-zoom-btn:hover {
		background: var(--active);
		color: var(--ink);
	}

	.vega-visual-screen-btn:focus-visible,
	.vega-visual-zoom-btn:focus-visible,
	.vega-visual-help-toggle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.vega-visual-screen-btn[aria-pressed='true'],
	.vega-visual-zoom-btn[aria-pressed='true'] {
		background: var(--accent-soft);
		color: var(--accent-text);
	}

	/* Los VALORES numéricos (ancho en px, % de zoom) van en `--mono` (§transversal del encargo):
	   son datos, no prosa. */
	.vega-visual-screen-width,
	.vega-visual-zoom-value {
		font-family: var(--mono);
		font-size: 0.75rem;
		color: var(--ink-2);
		white-space: nowrap;
	}

	.vega-visual-help-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border: 1px solid var(--line);
		border-radius: 50%;
		background: var(--surface);
		color: var(--ink-2);
		font-size: 0.8rem;
		font-weight: 700;
		cursor: pointer;
	}

	.vega-visual-help-toggle:hover,
	.vega-visual-help-toggle[aria-pressed='true'] {
		border-color: var(--line-strong);
		color: var(--ink);
	}

	/* Diálogo de ayuda (ver cabecera, "Panel de ayuda de atajos"): mismo par backdrop/dialog que
	   `ExportDialog.svelte`/`ReloginModal.svelte` (ver sus cabeceras), scrim ALLOWLISTED en
	   `check-theme-coverage.mjs` por el mismo motivo que ahí (§3 no tiene token de velo). */
	.vega-visual-help-backdrop {
		position: fixed;
		z-index: 80;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--vega-space-gutter);
		background: rgb(15 17 21 / 55%);
	}

	.vega-visual-help-dialog {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		width: 100%;
		max-width: 26rem;
		max-height: calc(100dvh - var(--vega-space-gutter) * 2);
		padding: 1.25rem;
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-card);
		overflow-y: auto;
	}

	.vega-visual-help-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.vega-visual-help-head h2 {
		margin: 0;
		font-size: 1.05rem;
		color: var(--ink-hi);
	}

	.vega-visual-help-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.9rem;
		height: 1.9rem;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
	}

	.vega-visual-help-close:hover {
		background: var(--active);
		color: var(--ink);
	}

	.vega-visual-help-close:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.vega-visual-help-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
	}

	.vega-visual-help-list > div {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	.vega-visual-help-list dt {
		flex-shrink: 0;
		width: 7.5rem;
	}

	.vega-visual-help-list dd {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-visual-help-list kbd {
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--surface-2);
		color: var(--ink);
		font-family: var(--mono);
		font-size: 0.75rem;
	}

	/* La asimetría (ver cabecera del script, "Estado de guardado en la barra") se DICE aparte del
	   listado de teclas: no es un atajo, es la explicación de por qué el punto "sin guardar" de la
	   barra no siempre corresponde a lo último que se hizo. */
	.vega-visual-help-asymmetry {
		margin: 0;
		padding-top: 0.6rem;
		border-top: 1px solid var(--line);
		color: var(--ink-2);
		font-size: 0.8rem;
	}

	/* Tres columnas (ver cabecera): árbol | lienzo | inspector, mismo esquema que
	   `.vega-editor-grid--rail`/`--aside` de `RecordForm.svelte` (ver la suya) — `minmax(0, 1fr)` en
	   la del medio para que el iframe pueda encogerse por debajo de su contenido intrínseco, en vez
	   de forzar overflow horizontal. Sin `align-items` propio: el `stretch` por defecto es lo que
	   hace que `VisualBlockTree`/`VisualInspector` llenen el alto EXACTO de la fila sin necesitar
	   `position: sticky` (ver sus cabeceras) — a diferencia de `.vega-editor-grid`, esta rejilla ya
	   vive dentro de una pantalla de alto FIJO (`.vega-visual-screen`), no de una página que
	   scrollea. */
	.vega-visual-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: calc(var(--vega-space-gutter) * 1.25);
		flex: 1;
		min-height: 0;
		padding: 0 calc(var(--vega-space-gutter) * 1.5) calc(var(--vega-space-gutter) * 1.25);
	}

	/* `--vega-visual-tree-w`/`--inspector-w` (ver cabecera, "Anchos de columna ajustables"): el
	   `8px` intercalado es la celda que ocupa cada `VisualColumnResizer` — su valor tiene que
	   casar con el `width: 8px` de `.vega-col-resizer` (propio componente) o el grid dejaría un
	   hueco vacío o recortaría la manilla. El fallback (`280px`/`320px` tras la coma) es el mismo
	   ancho fijo de antes de este encargo: solo se usaría si la variable no llegara a aplicarse. */
	.vega-visual-grid--tree {
		grid-template-columns: var(--vega-visual-tree-w, 280px) 8px minmax(0, 1fr);
	}

	.vega-visual-grid--inspector {
		grid-template-columns: minmax(0, 1fr) 8px var(--vega-visual-inspector-w, 320px);
	}

	.vega-visual-grid--tree.vega-visual-grid--inspector {
		grid-template-columns: var(--vega-visual-tree-w, 280px) 8px minmax(0, 1fr) 8px var(
				--vega-visual-inspector-w,
				320px
			);
	}

	/* 1180px (ver cabecera de `VisualBlockTree.svelte`, "Colapsable"): el árbol deja de reservar
	   columna propia — a esa anchura ya es un cajón `position: fixed` (fuera del flujo del grid, ver
	   su CSS), así que reservarle una columna aquí sería hueco vacío; su manilla tampoco se MONTA
	   ahí (`treeResizerActive`, ver el script), así que la columna del 8px desaparece con ella. El
	   inspector SIGUE con columna fija (y su propia manilla): no es la vía accesible de selección
	   (el árbol sí lo es), así que no tiene el mismo motivo para convertirse en cajón — se queda
	   como columna normal hasta los 900px en los que el lienzo entero deja de montarse
	   (`canvasActive`, ver el script). */
	@media (max-width: 1180px) {
		.vega-visual-grid--tree {
			grid-template-columns: minmax(0, 1fr);
		}

		.vega-visual-grid--tree.vega-visual-grid--inspector {
			grid-template-columns: minmax(0, 1fr) 8px var(--vega-visual-inspector-w, 320px);
		}
	}

	.vega-visual-canvas {
		position: relative;
		min-height: 0;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		overflow: hidden;
	}

	/* Escenario del zoom (ver cabecera del script, "Tamaño de pantalla + zoom del lienzo"): el
	   ÚNICO elemento que se escala (`transform`, inline — ver el marcado), envolviendo iframe +
	   overlay en la MISMA caja para que sigan casando. `position: absolute` (no `flex`, ya no hace
	   falta desde que el ancho/alto son explícitos): a escala < 1 deja hueco alrededor DENTRO del
	   propio lienzo, que es justo el "zoom out" esperado — un layout de flujo lo centraría o
	   estiraría, ninguna de las dos cosas correcta aquí. */
	.vega-visual-stage {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: top left;
	}

	.vega-visual-frame {
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
		background: var(--surface);
	}

	/* Escudo del arrastre (ver cabecera, "El escudo del arrastre"): transparente a propósito — no
	   avisa de nada, solo evita que el `<iframe>` se quede con los eventos del puntero mientras una
	   manilla está en medio de un gesto. Por encima del `<iframe>` Y de `VisualOverlay` (los dos
	   anteriores en el DOM, mismo criterio de apilamiento por orden que el resto de este fichero:
	   sin `z-index` explícito). */
	.vega-visual-shield {
		position: absolute;
		inset: 0;
		cursor: col-resize;
	}

	/* Skeleton honesto (mismo criterio que `.vega-preview-panel-overlay` de `PreviewPanel.svelte`):
	   cubre el hueco del iframe mientras no hay nada que enseñar, en vez de dejarlo en blanco. Solo
	   reacciona al TOKEN (ver cabecera, "Dos relojes distintos") — un error del PUENTE no pasa por
	   aquí, el iframe se queda visible. */
	.vega-visual-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1.5rem;
		text-align: center;
		background: var(--paper);
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-visual-overlay--error {
		color: var(--danger);
	}

	.vega-visual-overlay button {
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}

	.vega-visual-overlay button:hover {
		border-color: var(--line-strong);
	}

	/* Aviso de pantalla estrecha. NO lleva `@media` ni `display: none` de partida: quien decide si
	   existe es `matchMedia` en el script (ver cabecera), porque el punto de corte gobierna si el
	   lienzo se MONTA, no solo si se ve. Duplicar aquí la condición dejaría dos dueños del mismo
	   umbral y la puerta abierta a que solo uno de los dos cambie. */
	.vega-visual-narrow {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		max-width: 32rem;
		margin: 0 calc(var(--vega-space-gutter) * 1.5) calc(var(--vega-space-gutter) * 1.25);
	}

	.vega-visual-narrow-title {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 650;
		color: var(--ink-hi);
	}

	.vega-visual-narrow p {
		margin: 0;
	}

	.vega-visual-narrow button {
		padding: 0.45rem 0.9rem;
		min-height: 44px;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface-2);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}

	.vega-visual-narrow button:hover {
		border-color: var(--line-strong);
	}
</style>
