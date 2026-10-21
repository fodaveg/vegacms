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
	 *   renovación, independiente de este refresco). La propia RENOVACIÓN programada del token
	 *   (`renewToken`) usa este mismo camino cuando se puede (`refreshCanvas({ renew: true })`, que
	 *   además rearma `scheduleRenew` con el token nuevo): el marco no se recarga cada ~5 min.
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
	 * ningún camino que los pueda desincronizar. Por el mismo motivo es también el único sitio que
	 * ANUNCIA la selección por voz (`announceSelection`, encargo de accesibilidad D3): un lector de
	 * pantalla oye lo mismo venga la selección del sitio o del árbol.
	 *
	 * **El resalte al pasar (`highlightedBlockId`) tiene DOS fuentes y un solo dueño, aquí, y NO es
	 * la selección.**
	 * - La PÁGINA (`pageHoveredBlockId`): la escribe solo `onHover` del cliente (§"Hover" del
	 *   contrato: mensaje opcional del sitio, `null` al salir de todo bloque y al empezar a
	 *   desplazarse) y la limpia `onState` cuando el puente deja de estar conectado o el bloque ya no
	 *   se reporta — mismo criterio que la selección fantasma de arriba.
	 * - El ÁRBOL (`treeHoveredBlockId`): la escribe solo `VisualBlockTree.svelte#onHover`, con el
	 *   puntero sobre una fila o el foco de teclado dentro de ella.
	 *
	 * Precedencia: **el último que llegó gana, y soltar uno devuelve el otro si sigue vigente.**
	 * `hoverSource` recuerda cuál encendió el resalte más reciente; si esa fuente pasa a `null`
	 * (salir del árbol, salir del bloque en la página), se ve la otra si todavía tiene un id. Con
	 * ratón las dos rara vez coinciden (el puntero no puede estar en el árbol y en el marco a la
	 * vez), pero con el foco de teclado en una fila y el ratón sobre la página sí, y ahí manda la
	 * última acción del autor. "Vigente" también significa que el sitio REPORTA ese bloque: un id
	 * que no está en `overlayBlocks` (una fila borrada bajo el puntero, que ya no dispara
	 * `mouseleave`) no tapa a la otra fuente.
	 *
	 * Se pinta con el MISMO `highlightedId` de `VisualOverlay.svelte`. Ninguna de las dos pasa por
	 * `handleBlockSelect` ni avisa al sitio con `highlight`: el sitio ya sabe dónde está su propio
	 * puntero, y el `highlight` del protocolo no tiene forma de apagarse, así que usarlo para el
	 * hover del árbol dejaría el marco marcando la última fila por la que pasó el ratón.
	 *
	 * **Qué secciones NO son públicas lo dice el sitio, no Vega** (`unpublished` de cada bloque del
	 * puente, ver `bridge-client.ts#VisualBlock`): esta pantalla solo lo reparte — al overlay le
	 * llega dentro de cada bloque, al árbol como `unpublishedIds`, porque el árbol pinta registros
	 * de PocketBase y no los bloques del puente. Sin puente conectado, el árbol no marca ninguna.
	 *
	 * **El arrastre de paleta en vuelo tiene el MISMO reparto de dueño único que la selección
	 * (encargo "paleta de bloques arrastrable del editor visual", decisión 5).** `paletteDragType`
	 * (`ResolvedBlockType | null`) es EL OTRO `$state` que esta pantalla posee y nadie más escribe:
	 * `VisualPalette.svelte` (montada dentro de `VisualBlockTree.svelte`) avisa por los callbacks
	 * `onPaletteDragStart`/`onPaletteDragEnd`, que aquí solo escriben esta variable
	 * (`handlePaletteDragStart`/`handlePaletteDragEnd`, más abajo); `VisualOverlay.svelte` la RECIBE
	 * por prop, nunca la escribe. Dos efectos escribiendo el mismo estado ya es un bug conocido de
	 * este proyecto (ver la cabecera de `blocks-state.svelte.ts`) — aquí ni siquiera hace falta un
	 * `$effect`: los dos callbacks son la ÚNICA puerta de escritura, igual que `handleBlockSelect`
	 * lo es para `selectedBlockId`.
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
	 * **Borrador sin escritura**: el snapshot de `blocks.currentDraftRecords()` contiene los campos
	 * de todos los `BlockEditor` montados, incluidos los no seleccionados. El token recibe ese
	 * snapshot y el registro padre; si el sitio devuelve `postToken`, el iframe recibe un POST de
	 * formulario. Ni el refresco ni la selección llaman a `port.update`.
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
	 * - El PUENTE (`bridgeState`, `createVisualBridgeClient`): gobierna SOLO el estado de la franja del lienzo.
	 *   Un `error/no-bridge` (o cualquier otro `kind`) no tapa el iframe — el contrato es explícito
	 *   en que un sitio sin puente (o con un puente que falla) "sigue sirviendo la vista previa de
	 *   siempre, que sí funciona" (§"Handshake and message envelope"). Cubrir el lienzo con un
	 *   error de PUENTE escondería una vista previa que SÍ está funcionando.
	 *
	 * **Por debajo de 900 px no se monta el lienzo, no solo se oculta**: la anchura se mide con
	 * `matchMedia` y el marco ni siquiera existe, así que en un móvil no se pide token ni se
	 * descarga el sitio del cliente entero. Ocultarlo por CSS habría dejado esa carga en marcha,
	 * invisible. Si la ventana se ensancha, se monta y se pide el token entonces; si se estrecha, se
	 * para el puente y se cancela la renovación.
	 *
	 * **Y lo que SÍ hay por debajo de 900 px es el modo «solo textos» (Lote 12, lámina 8)**: hasta
	 * ese lote esta rama era una pantalla de salida («no cabe, vuelve al formulario»). Ahora la
	 * rejilla se queda con UNA celda, `VisualInspector.svelte` en `mode="texts"`: las secciones de la
	 * página en su orden, cada una con sus campos de texto y su «Guardar» (`BlockEditor` con
	 * `textsOnly`, ver `texts-mode.ts`). La decisión de qué es «estrecho» sigue siendo UNA,
	 * `canvasActive`: la misma que desmonta el lienzo elige el modo del inspector — nunca un segundo
	 * `matchMedia` ni un `@media` paralelo con el mismo número. El inspector se monta en los DOS
	 * anchos y solo cambia de `mode`: sus `BlockEditor` son las mismas instancias, así que un
	 * borrador a medio escribir sobrevive al cambio de ancho (ver su cabecera, "Dos modos, un solo
	 * `{#each}`"). Guardar desde este modo es el mismo camino que desde la ficha ancha (`onSubmit` →
	 * `port.update` con `expectedVersion`, conflictos incluidos); lo único que `handleContentSaved`
	 * NO hace sin lienzo es pedir el refresco — no hay marco que refrescar, y pedir un token para
	 * nada volvería a arrancar la cadena de renovaciones en un móvil. Al ensanchar, `applyWidth`
	 * pide el token y el lienzo nace ya con lo guardado.
	 *
	 * El cliente del puente se crea UNA VEZ, cuando llega el PRIMER token (necesita su `previewUrl`
	 * para fijar el origen contra el que valida, `bridge-client.ts#originOf`): las renovaciones
	 * posteriores conservan el mismo origen (mismo sitio), así que no hace falta recrearlo — solo
	 * disparar `start()` de nuevo cuando el iframe (con `src` nuevo) vuelve a hacer `load`
	 * (solo en la recarga entera de respaldo: con puente y `liveRefresh` la renovación no recarga).
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
	 * ancho de LAYOUT del `<iframe>` (390/834/1280, nunca el ancho del `<div>` de Vega — así
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
	 * "Ajustar" encaja el escritorio de 1280px CSS en el ancho físico del lienzo. Cambiar la
	 * ventana o plegar la sidebar recalcula la escala sin disparar otros puntos de corte del sitio.
	 * El mismo escenario escala iframe y overlay, conservando las coordenadas que reporta el puente.
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
	 * **Estado de guardado en la barra (mismo encargo)**: `savedAt` es PROPIO de esta pantalla:
	 * igual que `RecordForm.svelte`, no se siembra del autodate `updated` del registro. Ese
	 * campo pertenece al registro PADRE, y lo que se guarda aquí son sus BLOQUES (otra colección):
	 * editar un bloque nunca toca el `updated` del padre, así que sembrar desde ahí enseñaría una
	 * hora sin relación con lo que se acaba de guardar. Arranca en `null` (nada sabido todavía en
	 * esta sesión de pantalla) y solo se escribe tras un guardado de verdad OCURRIDO AQUÍ —
	 * `handleContentSaved`, la puerta ÚNICA que sustituye a `scheduleCanvasRefresh` como callback de
	 * `onBlockSaved`/`onStructuralChange`, y que sigue pidiendo el refresco del lienzo exactamente
	 * igual que antes de esta tarea (nada de ese contrato cambia, solo se le añade marcar la hora).
	 * Reusa el patrón `.vega-editor-dirty`/`editor.dirty`/`editor.saving`/`editor.savedAt` de
	 * `RecordForm.svelte` — mismas claves i18n y texto visible de estado local, con nombres de clase propios de este fichero porque el CSS con ámbito de
	 * Svelte no cruza de un componente a otro.
	 *
	 * **Contexto documental** (UX01): documento como H1; colección y bloque seleccionado en las
	 * migas, para saber dónde estás cuando la pantalla es todo lienzo. La miga del bloque usa `blocks.blockTitle` sobre el
	 * MISMO registro que resuelve `selectedBlockId` — si el id no resuelve a ningún registro
	 * (selección fantasma, ver la cabecera de `VisualInspector.svelte`) no se pinta esa miga, ni un
	 * guion ni un "ninguno": mentiría sobre algo que el autor no eligió.
	 *
	 * **Estado de la página** (lámina del audit p2): `VisualPublishControl.svelte` junto al documento — etiqueta del `statusField` y botón para publicar / pasar a borrador, escribiendo
	 * por el mismo `port.update` que el formulario (un solo escritor). Recibe los títulos de los
	 * bloques sucios para pedir confirmación antes de publicar con cambios sin guardar. Vive en su
	 * propio componente (y en la lista de `check-touch-targets`) porque tiene estado propio: el
	 * registro que el servidor confirmó, la confirmación en línea y el error.
	 *
	 * **Revisión antes de publicar** (lote 13): `createReviewState` (`$lib/publish-review`) sobre el
	 * registro guardado y los bloques EN PANTALLA (`blocks.currentDraftRecords()`, guardados o no);
	 * páginas, redirecciones y medios se releen al abrir y tras cada guardado real
	 * (`handleContentSaved`, vía `contentSavedCount`). Se la pasa a `VisualPublishControl`, que la
	 * mete en su popover. Las acciones de un aviso se resuelven aquí: un campo del registro abre el
	 * formulario (`ctx.nav.toRecord`, con la salvaguarda de salida de siempre si hay bloques sin
	 * guardar) con ese campo enfocado; un bloque pasa por `handleBlockSelect` (la puerta única de
	 * selección); una imagen sin alt abre su ficha de Medios encima (`ReviewMediaDialog`) y, al
	 * cerrarla, el foco vuelve al botón de estado (el popover que la abrió ya no existe).
	 *
	 * La petición de foco solo llega a `focus-request.ts` si la navegación se HACE: `beforeNavigate`
	 * la ata a la navegación que sale y `onNavigate` (que SvelteKit solo llama si nadie la canceló)
	 * la entrega. Si la salvaguarda la cancela, se pierde con ella; dejarla antes de navegar la
	 * dejaba colgada, y la siguiente visita al formulario de esta página enfocaba ese campo sin que
	 * nadie lo hubiera pedido.
	 */
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { beforeNavigate, onNavigate } from '$app/navigation';
	import { getVegaContext } from '$lib/app-context';
	import type { ResolvedBlockType, ResolvedContentType } from '$lib/model/types';
	import type { VegaRecord } from '$lib/backend';
	import { createPreviewClient } from '$lib/backend/preview-client';
	import {
		createVisualBridgeClient,
		type VisualBridgeClient,
		type VisualBridgeState
	} from './bridge-client';
	import { bridgeErrorText } from './bridge-error-text';
	import { createVisualPreviewState, type TokenState } from './visual-preview-state';
	import { createBlocksState } from '$lib/form/blocks-state.svelte';
	import { requestFieldFocus, type FieldFocusRequest } from '$lib/form/focus-request';
	import { listRoute, recordRoute } from '$lib/nav/routes';
	import type { ReviewFinding } from '$lib/publish-review/publish-review';
	import { createReviewState } from '$lib/publish-review/review-state.svelte';
	import ReviewMediaLoader from '$lib/publish-review/ReviewMediaLoader.svelte';
	import { visualKeyboardAction } from './visual-keyboard';
	import { describeCell } from '$lib/list/cell';
	import { resolveTitleCellText } from '$lib/list/list-load';
	import PublishButton from '$lib/shell/PublishButton.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import VisualOverlay from './VisualOverlay.svelte';
	import VisualInspector from './VisualInspector.svelte';
	import VisualColumnResizer from './VisualColumnResizer.svelte';
	import VisualPublishControl from './VisualPublishControl.svelte';
	import type { InlineRect, InlineRequest } from './inline-session';
	import { inlineAppearanceMessage } from './inline-appearance';
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
	import { typeMenuKeydownIndex } from './type-menu';
	import type { IconId } from '$lib/icons/registry';

	interface Props {
		type: ResolvedContentType;
		record: VegaRecord;
	}

	let { type, record }: Props = $props();

	const ctx = getVegaContext();

	/** Un clic normal usa `NavApi` y su guard de salida; los clics modificados conservan el href. */
	function openDestination(event: MouseEvent, destination: 'list' | 'form'): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
			return;
		event.preventDefault();
		if (destination === 'list') ctx.nav.toList(type.name);
		else ctx.nav.toRecord(type.name, record.id);
	}

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
		onDirtyChange: () => {}, // el guard de salida lee `blocks.anyDirty` directo, ver más abajo
		onCreated: (created) => handleBlockCreated(created),
		onDraftChange: (drafts) => {
			// La fábrica emite un snapshot por cambio de campo; el token se pide tras el debounce.
			if (blocks.status.kind !== 'ready' || !canvasActive) return;
			const snapshot = JSON.stringify(drafts);
			if (snapshot === lastDraftSnapshot) return;
			lastDraftSnapshot = snapshot;
			if (blocks.anyDirty || draftPreviewStarted) {
				draftPreviewStarted = blocks.anyDirty;
				previewUpdating = true;
				preview.scheduleCanvasRefresh({ draftEdit: true });
			}
		}
	});
	let lastDraftSnapshot = '';
	let draftPreviewStarted = false;

	// ————— Revisión antes de publicar (ver cabecera) —————

	/** Guardados reales ocurridos aquí (`handleContentSaved`): releen lo que la revisión lee del
	 *  servidor. */
	let contentSavedCount = $state(0);
	/** Ficha de Medios abierta desde «Describir la imagen…», o `null`. */
	let reviewMediaId = $state<string | null>(null);

	const review = createReviewState({
		ctx,
		type: untrack(() => type),
		getRecordId: () => record.id,
		getRecord: () => record,
		// Los bloques EN PANTALLA, con las ediciones sin guardar de cada ficha (`draftOverrides`):
		// la revisión mira lo que se ve, guardado o no. `null` (no se sabe) mientras la lista no
		// tiene tipo hijo, no ha cargado o su carga falló: ahí `currentDraftRecords()` da `[]`, y
		// la revisión lo leería como «no hay bloques» y publicaría sin preguntar.
		getBlocks: () => {
			const child = blocks.childType;
			if (!child || blocks.status.kind !== 'ready') return null;
			return blocks.currentDraftRecords().map((draft) => ({
				id: draft.id,
				type: child.name,
				values: draft.fields as VegaRecord['values']
			}));
		},
		getReloadToken: () => contentSavedCount
	});

	/** Campo que pidió un aviso, a la espera de la navegación al formulario (ver cabecera). */
	let reviewFocusPending: FieldFocusRequest | null = null;
	/** La misma petición, atada a la navegación que acaba de salir (`beforeNavigate`). */
	let reviewFocusArmed: FieldFocusRequest | null = null;

	/** La acción de un aviso del popover (ver cabecera): al formulario con el campo enfocado, o al
	 *  bloque en el árbol. */
	function handleReviewGo(finding: ReviewFinding): void {
		const target = finding.target;
		if (target.kind === 'field') {
			reviewFocusPending = { type: type.name, id: record.id, field: target.field };
			ctx.nav.toRecord(type.name, record.id);
			return;
		}
		handleBlockSelect(target.blockId);
	}

	function handleReviewDescribe(finding: ReviewFinding): void {
		reviewMediaId = finding.mediaId ?? null;
	}

	let publishControlRef = $state<{ focus: () => void } | undefined>(undefined);

	/**
	 * Cierre de la ficha de Medios de un aviso. `MediaDetail` devuelve el foco a lo que lo tenía al
	 * abrirse, pero eso era «Describir la imagen…» DENTRO del popover, que ya se cerró. La ficha
	 * usa entonces su destino de foco estable; este cierre lleva el foco al botón de estado,
	 * como `closeSchedule()` en `VisualPublishControl`.
	 */
	async function closeReviewMedia(): Promise<void> {
		reviewMediaId = null;
		await tick();
		const active = document.activeElement;
		if (active === null || active === document.body || !active.isConnected) {
			publishControlRef?.focus();
		}
	}

	/** Guard de salida (ver cabecera): mismo mecanismo y mismo texto que `RecordForm.svelte`.
	 *  `beforeNavigate` se registra en la inicialización del componente y SvelteKit lo da de baja
	 *  solo al desmontar; `beforeunload` se añade y se quita a mano en `onMount`/`onDestroy`.
	 *  Antes de nada, la petición de foco de un aviso pasa a ser de ESTA navegación: si alguien la
	 *  cancela, la siguiente vuelve a empezar sin ella. */
	beforeNavigate((navigation) => {
		reviewFocusArmed = reviewFocusPending;
		reviewFocusPending = null;
		if (!blocks.anyDirty) return;
		if (!window.confirm(ctx.t('editor.leaveConfirm'))) navigation.cancel();
	});

	/** SvelteKit solo llama a esto con la navegación en marcha (nadie la canceló): ahora sí se deja
	 *  la petición para el formulario que se va a montar, si es el de esta página. */
	onNavigate((navigation) => {
		const request = reviewFocusArmed;
		reviewFocusArmed = null;
		if (request && navigation.to?.url.pathname === recordRoute(request.type, request.id)) {
			requestFieldFocus(request);
		}
	});

	// Capturados UNA vez (`untrack`, mismo patrón que `PreviewPanel.svelte`): esta pantalla se
	// remonta entera si cambia el registro (ver cabecera), así que el valor INICIAL basta. El gate
	// de la ruta (`visual-gate.ts`) ya garantiza `previewApiUrl` no-nulo antes de montar esto.
	const client = createPreviewClient({
		apiUrl: untrack(() => ctx.port.previewApiUrl ?? ''),
		token: ctx.session.token
	});

	// `true` tras el evento `load` del documento ACTUAL del iframe (ver cabecera de
	// `PreviewPanel.svelte`, "Qué NO hace"): se resetea en cada petición nueva.
	let tokenState = $state<TokenState>({ kind: 'loading' });
	/** Cada token aceptado abre un documento nuevo, incluso si el backend reutiliza la URL opaca. */
	let frameVersion = $state(0);
	let previewError = $state<string | null>(null);
	let previewUpdating = $state(false);
	let previewDraftAccepted = $state(false);
	let frameLoaded = $state(false);
	let postForm = $state<HTMLFormElement | undefined>(undefined);
	let postGeneration = 0;
	const frameName = 'vega-visual-draft-frame';
	let bridgeState = $state<VisualBridgeState>({ status: 'idle' });
	let iframeEl = $state<HTMLIFrameElement | undefined>(undefined);
	// Único dueño del bloque seleccionado (ver cabecera, "La selección tiene un solo dueño").
	// `null` = nada seleccionado, el estado inicial hasta el primer `select` del sitio.
	let selectedBlockId = $state<string | null>(null);
	/** Los paneles se cierran sin desmontar los editores, que conservan el borrador de cada bloque. */
	let treeVisible = $state(false);
	let inspectorVisible = $state(false);
	/** El árbol y su catálogo se descargan al abrir «Estructura» en escritorio. Entre 900 y
	 * 1180 px se cargan al montar porque el propio árbol contiene el disparador del cajón.
	 * Una vez montado, plegarlo conserva su instancia, estado y foco. */
	let treeRequest = $state.raw<Promise<typeof import('./VisualBlockTree.svelte')> | null>(null);
	function ensureTreeLoaded(): void {
		if (treeRequest === null) treeRequest = import('./VisualBlockTree.svelte');
	}
	function toggleTree(): void {
		treeVisible = !treeVisible;
		if (treeVisible) ensureTreeLoaded();
	}
	function retryTree(): void {
		treeRequest = import('./VisualBlockTree.svelte');
	}
	// El único DeleteConfirm vive en el árbol. Una petición desde el lienzo o el teclado puede
	// llegar antes de abrir Estructura: se carga el árbol y se muestra su columna para que el
	// diálogo y su ancla de foco no queden dentro del wrapper plegado (display:none).
	$effect(() => {
		if (blocks.pendingDelete === null) return;
		ensureTreeLoaded();
		treeVisible = true;
	});
	let editBlockButtonEl = $state<HTMLButtonElement | undefined>(undefined);

	/** Cerrar conserva el editor montado y devuelve el foco a su disparador recién mostrado. */
	async function closeInspector(): Promise<void> {
		inspectorVisible = false;
		await tick();
		editBlockButtonEl?.focus();
	}

	/** El autor vuelve al mismo campo y al mismo borrador, sin cambiar la selección. */
	async function reopenInspector(): Promise<void> {
		inspectorVisible = true;
		await tick();
		if (selectedBlockId) inspectorRef?.focusBlock(selectedBlockId);
	}
	// Las dos fuentes del resalte al pasar (ver cabecera, "El resalte al pasar tiene DOS fuentes").
	// Página: bloque bajo el puntero DENTRO del marco; `null` si no hay ninguno o el sitio no
	// implementa `hover`. Árbol: fila bajo el puntero o con el foco. `hoverSource`: cuál de las dos
	// encendió el resalte más reciente.
	let pageHoveredBlockId = $state<string | null>(null);
	let treeHoveredBlockId = $state<string | null>(null);
	let hoverSource = $state<'page' | 'tree'>('page');

	function handlePageHover(blockId: string | null): void {
		pageHoveredBlockId = blockId;
		if (blockId !== null) hoverSource = 'page';
	}

	function handleTreeHover(blockId: string | null): void {
		treeHoveredBlockId = blockId;
		if (blockId !== null) hoverSource = 'tree';
	}
	// Único dueño del arrastre de PALETA en vuelo (ver cabecera, "El arrastre de paleta en vuelo
	// tiene el MISMO reparto..."). `null` fuera de un gesto.
	let paletteDragType = $state<ResolvedBlockType | null>(null);

	// `true` mientras la ventana da de sí para el lienzo. Arranca en `true` (suposición de
	// escritorio) pero NADA se pide hasta que `onMount` lo mide de verdad, así que en un móvil no
	// llega a salir ninguna petición.
	let canvasActive = $state(true);

	let bridgeClient: VisualBridgeClient | null = null;
	let narrowQuery: MediaQueryList | null = null;
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
	 *  medida física hasta el primer aviso; `resolveZoomFactor` (`viewport.ts`) mantiene un factor
	 *  finito mientras tanto. El ancho CSS del preset ya está disponible. */
	let canvasEl = $state<HTMLDivElement | undefined>(undefined);
	let canvasSize = $state({ width: 0, height: 0 });
	// ————— Panel de ayuda de atajos (ver `handleVisualKeydown`) —————
	let helpRequest = $state.raw<Promise<typeof import('./VisualHelpDialog.svelte')> | null>(null);
	/** Quién tenía el foco al abrir (el disparador, sea el botón "?" de la barra o la propia tecla
	 *  con el foco en cualquier otro sitio del lienzo): PLANA, no `$state` — solo se lee de forma
	 *  imperativa al cerrar, mismo criterio que `formEl` de `RecordForm.svelte`. */
	let helpPreviouslyFocused: HTMLElement | null = null;
	// ————— Handle del inspector, para el atajo ⌘S (ver `VisualInspector.svelte#saveSelected`) —————
	// `$state` (a diferencia de `formEl` de `RecordForm.svelte`, plano): `bind:this` sobre la
	// instancia de un COMPONENTE, no un nodo DOM nativo, y el compilador exige que el destino sea
	// reactivo para poder rastrear la reasignación — se lee de forma imperativa igual que `formEl`,
	// pero declararlo así calla el aviso `non_reactive_update` sin cambiar nada del criterio.
	let previewPanelOpen = $state(false);
	/** Edición en línea en curso (dueño: el puente vía `onInlineBegin`/`onInlineEnd`). `rect` es la
	 *  caja del campo que mandó el sitio y `anchor` la del bloque EN ESE MISMO momento: la pista se
	 *  coloca con el desplazamiento entre las dos sobre el `rect` vigente del bloque, así sigue al
	 *  texto cuando la página se desplaza sin que el sitio tenga que volver a medir. */
	let inlineEdit = $state<{
		blockId: string;
		field: string;
		label: string;
		widget: 'text' | 'textarea';
		rect: InlineRect | null;
		anchor: InlineRect | null;
	} | null>(null);
	const inlineBlockId = $derived(inlineEdit?.blockId ?? null);
	let screenEl = $state<HTMLDivElement | undefined>(undefined);
	let saveErrorBlockId = $state<string | null>(null);
	let previewOpener = $state<HTMLButtonElement | undefined>(undefined);
	function saveSelectedBlock(): void {
		if (bridgeClient?.saveInline()) return;
		inspectorRef?.saveSelected();
	}
	/** «Reintentar» del error de guardado de la barra: el MISMO guardado de la ficha que falló. */
	function retrySave(): void {
		if (saveErrorBlockId === null) return;
		if (saveErrorBlockId === inlineBlockId && bridgeClient?.saveInline()) return;
		inspectorRef?.saveBlock(saveErrorBlockId);
	}
	/** «Texto», «Portada»…: el NOMBRE del tipo del bloque que no se pudo guardar (lámina, «No se pudo
	 *  guardar «Texto»»), o su título sin vocabulario de tipos. */
	const saveErrorLabel = $derived.by(() => {
		const failed = blocks.records.find((item) => item.id === saveErrorBlockId);
		if (!failed) return '';
		return blocks.blockTypeOf(failed)?.label ?? blocks.blockTitle(failed);
	});
	/** La vista previa de siempre (el panel lateral). Una edición en línea abierta se cierra antes:
	 *  lo escrito ya está en el borrador y el panel lo enseña. */
	function openPreviewPanel(): void {
		bridgeClient?.finishInline();
		previewPanelOpen = true;
	}
	async function closePreviewPanel(): Promise<void> {
		previewPanelOpen = false;
		await tick();
		previewOpener?.focus();
	}

	// ————— Zoom desde la barra (lámina, «1280 px · 59 %»): el texto abre los niveles —————
	const PRESET_ICONS: Record<ScreenPreset, IconId> = {
		mobile: 'mobile',
		tablet: 'tablet',
		desktop: 'desktop'
	};
	let zoomMenuOpen = $state(false);
	let zoomEl = $state<HTMLDivElement | undefined>(undefined);
	let zoomMenuEl = $state<HTMLDivElement | undefined>(undefined);
	function zoomItems(): HTMLButtonElement[] {
		return Array.from(
			zoomMenuEl?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []
		);
	}
	async function toggleZoomMenu(): Promise<void> {
		zoomMenuOpen = !zoomMenuOpen;
		if (!zoomMenuOpen) return;
		await tick();
		const items = zoomItems();
		(items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
	}
	function closeZoomMenu(restoreFocus: boolean): void {
		if (!zoomMenuOpen) return;
		zoomMenuOpen = false;
		if (restoreFocus)
			zoomEl?.querySelector<HTMLButtonElement>('.vega-visual-zoom-trigger')?.focus();
	}
	function chooseZoom(zoom: ZoomPreference): void {
		setZoom(zoom);
		closeZoomMenu(true);
	}
	/** Flechas/`Home`/`End` (mismo algoritmo que los menús de tipos), `Esc` cierra y devuelve el foco. */
	function handleZoomMenuKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			closeZoomMenu(true);
			return;
		}
		const items = zoomItems();
		const next = typeMenuKeydownIndex(event, items);
		if (next === null) return;
		event.preventDefault();
		items[next]?.focus();
	}
	function handleZoomWindowClick(event: MouseEvent): void {
		if (zoomMenuOpen && !zoomEl?.contains(event.target as Node)) closeZoomMenu(false);
	}

	let inspectorRef = $state<
		| {
				saveSelected: () => void;
				saveBlock: (id: string) => void;
				focusBlock: (id: string) => void;
				beginInline: (blockId: string, field: string) => InlineRequest | null;
				updateInline: (blockId: string, field: string, value: string) => boolean;
				finishInline: (blockId: string, cancel?: boolean) => void;
		  }
		| undefined
	>(undefined);
	/** Hora del último guardado CONOCIDO en esta sesión de pantalla (ver cabecera, "Estado de
	 *  guardado en la barra"): `null` hasta el primer guardado real ocurrido aquí. */
	let savedAt = $state<Date | null>(null);

	/** Mismo punto de corte en el que `PreviewPanel.svelte` se retira entera (ver su cabecera). Vive
	 *  aquí y no solo en el CSS porque decide si se MONTA el lienzo, no si se ve. */
	const NARROW_QUERY = '(max-width: 900px)';
	/** Margen del escenario a la IZQUIERDA de la hoja, donde viven los «+» de las juntas (44 px de
	 *  objetivo táctil + aire). Debe casar con el `padding-left` de `.vega-visual-canvas`. */
	const STAGE_GUTTER = 52;
	/** Mismo punto de corte en el que el árbol deja de reservar columna (ver la cabecera de
	 *  `VisualBlockTree.svelte`, "Colapsable"): por debajo, su manilla no tiene columna que mover. */
	const TREE_QUERY = '(max-width: 1180px)';

	// El controlador posee peticiones, generaciones y temporizadores; la pantalla conserva el
	// estado visible del token, iframe y puente para que selección, foco y montaje tengan un dueño.
	const preview = createVisualPreviewState({
		client,
		typeName: untrack(() => type.name),
		recordId: untrack(() => String(record.id)),
		bridge: () => bridgeClient,
		hasCanvas: () => tokenState.kind === 'ready',
		getDraft: () =>
			blocks.status.kind === 'ready'
				? {
						record: { id: record.id, fields: { ...record.values } },
						blocks: blocks.currentDraftRecords()
					}
				: undefined,
		setTokenState: (state) => {
			tokenState = state;
			if (state.kind === 'ready') frameVersion++;
			if (state.kind === 'ready' && state.token.postToken) {
				const generation = ++postGeneration;
				void tick().then(() => {
					if (generation === postGeneration) postForm?.requestSubmit();
				});
			}
		},
		onPreviewToken: (token) => {
			previewDraftAccepted = token.postToken !== undefined;
			if (bridgeClient?.state.status !== 'connected' || !bridgeClient.state.liveRefresh)
				previewUpdating = false;
		},
		onRefreshError: (message) => {
			previewError = message;
			if (message !== null) previewUpdating = false;
		},
		resetFrameLoaded: () => (frameLoaded = false),
		t: ctx.t
	});
	const requestPreview = preview.requestPreview;
	const scheduleCanvasRefresh = preview.scheduleCanvasRefresh;

	/** Un guardado de VERDAD acaba de completarse aquí — un campo (`VisualInspector#onBlockSaved`)
	 *  o una mutación estructural (`VisualBlockTree`/`VisualOverlay#onStructuralChange`, y las
	 *  versiones por teclado de `handleVisualKeydown`): marca la hora (ver cabecera, "Estado de
	 *  guardado en la barra") Y pide el refresco de lienzo de siempre. Sustituye a
	 *  `scheduleCanvasRefresh` como el callback que se pasa a los tres consumidores — el contrato de
	 *  refresco no cambia ni una coma, esta función solo le añade el reloj por delante. */
	function handleContentSaved(): void {
		savedAt = new Date();
		draftPreviewStarted = false;
		previewUpdating = false;
		contentSavedCount += 1; // la revisión relee páginas, redirecciones y medios (ver cabecera)
		// Sin lienzo (modo «solo textos», ver cabecera) no hay marco que refrescar: pedir un token
		// aquí lo descargaría para nadie y rearmaría su renovación en un móvil. Al ensanchar,
		// `applyWidth(true)` pide uno nuevo y el lienzo nace ya con lo guardado.
		if (!canvasActive) return;
		scheduleCanvasRefresh();
	}

	/** Sección recién creada que el lienzo todavía no ha pintado: al reconectar con ella dentro, se
	 *  resalta y se trae a la vista (ver `onState`). */
	let revealOnConnect: string | null = null;

	/**
	 * Una sección NUEVA, venga de donde venga (paleta, «+» del lienzo, árbol: `onCreated` de
	 * `blocks-state`), queda SELECCIONADA con su ficha abierta y el foco en su primer campo (QA de
	 * fodaveg, 21 oct 2026: «insertar un bloque no deja rastro»). Su sitio en el lienzo lo marca el
	 * overlay aunque el sitio aún no pinte nada (`VisualOverlay`, marcador de altura mínima).
	 */
	function handleBlockCreated(created: VegaRecord): void {
		revealOnConnect = String(created.id);
		void openPendingBlock(String(created.id));
	}

	/** Abre un borrador desde el aviso y lleva el foco a su ficha ya visible, sin guardar nada. */
	async function openPendingBlock(blockId: string): Promise<void> {
		handleBlockSelect(blockId);
		await tick();
		inspectorRef?.focusBlock(blockId);
	}

	/** Puerta ÚNICA de selección (ver cabecera): la llama tanto el sitio (§contrato, `select`, clic
	 *  dentro de un bloque en el iframe) como `VisualBlockTree.svelte` (el autor elige una fila).
	 *  Además de mover el dueño único (`selectedBlockId`), avisa al sitio con `highlight`/
	 *  `scrollTo`: el marco puede querer resaltar visualmente el bloque que acaba de anunciar, o
	 *  desplazarse si la selección vino del árbol y el bloque está fuera de la vista. Las dos
	 *  llamadas son no-op si el puente no está `connected` (`bridge-client.ts#highlight`). Desde el
	 *  encargo de accesibilidad (D3), también ANUNCIA la selección por la región `aria-live` de
	 *  `VisualBlockTree.svelte` — un solo sitio (esta puerta), no tres, aunque la selección pueda
	 *  llegar por el sitio o por el árbol.
	 */
	function handleBlockSelect(blockId: string): void {
		bridgeClient?.finishInline();
		selectedBlockId = blockId;
		inspectorVisible = true;
		bridgeClient?.highlight(blockId);
		bridgeClient?.scrollTo(blockId);
		announceSelection(blockId);
	}

	/** Construye y anuncia el texto de la selección (ver `handleBlockSelect`, D3): título del
	 *  bloque + su posición entre los que hay. Si `blockId` no resuelve a ningún registro de
	 *  `blocks.records` (selección fantasma, mismo caso que `danglingSelection` de
	 *  `VisualInspector.svelte`), no anuncia nada — inventar una posición mentiría sobre algo que
	 *  el autor no eligió. */
	function announceSelection(blockId: string): void {
		const index = blocks.records.findIndex((r) => r.id === blockId);
		if (index < 0) return;
		blocks.say(
			ctx.t('editor.visual.tree.announceSelect', {
				label: blocks.blockTitle(blocks.records[index]),
				position: index + 1,
				total: blocks.records.length
			})
		);
	}

	// ————— Arrastre de paleta en vuelo (ver cabecera, decisión 5 del encargo "paleta de bloques
	// arrastrable"): las DOS únicas puertas de escritura de `paletteDragType`. —————

	function handlePaletteDragStart(blockType: ResolvedBlockType): void {
		paletteDragType = blockType;
	}

	function handlePaletteDragEnd(): void {
		paletteDragType = null;
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
				// Salvo que el bloque EXISTA (`blocks.records`) y solo sea que el sitio no lo pinta:
				// una sección recién insertada con sus campos vacíos (un «Botón» sin texto) no tiene
				// nada que pintar, y es justo la que el autor acaba de pedir (QA de fodaveg, 21 oct
				// 2026: insertar no dejaba rastro). Su ficha sigue abierta y el overlay marca su sitio.
				if (
					selectedBlockId !== null &&
					state.status === 'connected' &&
					!state.blocks.some((block) => block.id === selectedBlockId) &&
					!blocks.records.some((item) => item.id === selectedBlockId)
				) {
					selectedBlockId = null;
				}
				// La sección recién creada ya la pinta el sitio: se trae a la vista una vez.
				if (
					revealOnConnect !== null &&
					state.status === 'connected' &&
					state.blocks.some((block) => block.id === revealOnConnect)
				) {
					const id = revealOnConnect;
					revealOnConnect = null;
					bridgeClient?.highlight(id);
					bridgeClient?.scrollTo(id);
				}
				// Mismo criterio para el resalte del puntero EN LA PÁGINA (ver cabecera): sin conexión
				// no hay lienzo que resaltar, y un id que el sitio ya no reporta no tiene contorno. El
				// del árbol no se toca: lo apaga su propio `mouseleave`/`focusout`, y mientras tanto
				// `highlightedBlockId` ya lo ignora si el sitio no reporta ese bloque.
				if (
					pageHoveredBlockId !== null &&
					(state.status !== 'connected' ||
						!state.blocks.some((block) => block.id === pageHoveredBlockId))
				) {
					pageHoveredBlockId = null;
				}
			},
			onSelect: handleBlockSelect,
			onInlineBegin: (blockId, field) => {
				const target = inspectorRef?.beginInline(blockId, field);
				if (!target) return null;
				selectedBlockId = blockId;
				inlineEdit = {
					blockId,
					field,
					label: target.label ?? field,
					widget: target.widget,
					rect: null,
					anchor: null
				};
				preview.pauseInline();
				previewUpdating = false;
				return target;
			},
			onInlineInput: (blockId, field, value) =>
				inspectorRef?.updateInline(blockId, field, value) ?? false,
			onInlineRect: (blockId, rect) => {
				if (inlineEdit?.blockId !== blockId) return;
				const block =
					bridgeState.status === 'connected'
						? bridgeState.blocks.find((item) => item.id === blockId)
						: undefined;
				inlineEdit = { ...inlineEdit, rect, anchor: block ? { ...block.rect } : null };
			},
			inlineAppearance: () => inlineAppearanceMessage(screenEl, zoomFactor),
			onInlineEnd: (blockId, cancel) => {
				inspectorRef?.finishInline(blockId, cancel);
				inlineEdit = null;
				preview.resumeInline();
			},
			onInlineSave: saveSelectedBlock,
			onHover: handlePageHover,
			// El plazo interno de `refresh()` venció, o el propio puente avisó con
			// `error/refresh-failed` (ver `bridge-client.ts`): en los dos casos el cambio no aterrizó
			// y el único camino honesto que queda es la recarga entera de siempre.
			onRefreshFailed: () => void requestPreview(true)
		});
		return bridgeClient;
	}

	/** `load` del iframe (§contrato, "Vega posts `hello` when the frame fires `load`"): dispara
	 *  también en cada recarga entera (renovación de token de respaldo, sin puente o sin
	 *  `liveRefresh`), que es justo cuando hay que volver a saludar. */
	function handleFrameLoad(): void {
		// `about:blank` es el documento local previo al POST, no el renderer del sitio. Su `load`
		// puede llegar incluso después de montar el formulario; solo el documento real saluda.
		if (tokenState.kind === 'ready' && tokenState.token.postToken) {
			try {
				if (iframeEl?.contentWindow?.location.href === 'about:blank') return;
			} catch {
				// El renderer cross-origin sí es opaco: su `load` es el que esperamos.
			}
		}
		frameLoaded = true;
		if (tokenState.kind !== 'ready') return;
		ensureBridgeClient(tokenState.token.url).loaded();
	}

	function handleMessage(event: MessageEvent): void {
		const verdict = bridgeClient?.handleMessage(event);
		// `layout` del documento anterior también devuelve `accepted` y actualiza `onState`:
		// solo el `ready` validado por el puente confirma que el nuevo draft se está viendo.
		if (verdict === 'accepted' && event.data?.type === 'ready') previewUpdating = false;
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
			// Entre 900 y 1180 px el propio árbol aporta el disparador del cajón.
			if (!treeResizerActive) ensureTreeLoaded();
			void requestPreview();
			return;
		}
		preview.deactivate();
	}

	function handleNarrowChange(event: MediaQueryListEvent): void {
		applyWidth(!event.matches);
	}

	function handleTreeQueryChange(event: MediaQueryListEvent): void {
		treeResizerActive = !event.matches;
		if (event.matches && canvasActive) ensureTreeLoaded();
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

	/** Ancho de LAYOUT del iframe (390/834/1280, ver `viewport.ts`). */
	const frameWidth = $derived(frameWidthFor(screenPreset));
	/** Factor de `transform: scale()` del "escenario" (ver cabecera). */
	const zoomFactor = $derived(resolveZoomFactor(zoomPreference, canvasSize.width, frameWidth));
	/** Ajuste disponible en el menú, incluso cuando la escala activa es un nivel manual. */
	const fitZoomFactor = $derived(resolveZoomFactor('fit', canvasSize.width, frameWidth));
	/** Alto propio del escenario, para que al escalarlo llene el lienzo exacto (ver `viewport.ts`). */
	const stageHeightPx = $derived(stageHeightFor(canvasSize.height, zoomFactor));
	/** Borde izquierdo de la hoja: centrada en el escenario cuando cabe, pegada al margen de la
	 *  izquierda (`STAGE_GUTTER`, el `padding` izquierdo del escenario) cuando el zoom la hace más
	 *  ancha que él. */
	const stageLeft = $derived(
		STAGE_GUTTER + Math.max(0, (canvasSize.width - frameWidth * zoomFactor) / 2)
	);
	/** Ancho en pantalla de la franja: el de la hoja, sin salirse del escenario. */
	const chromeWidth = $derived(
		Math.max(0, Math.min(frameWidth * zoomFactor, STAGE_GUTTER + canvasSize.width - stageLeft))
	);
	/** Franja del escenario y margen izquierdo de la hoja (ver «Nada sobre la página» en la cabecera
	 *  de `VisualOverlay.svelte`): el overlay pinta ahí sus controles, no sobre el sitio. */
	let chromeEl = $state<HTMLElement | null>(null);
	let gutterEl = $state<HTMLElement | null>(null);

	/** Tarjeta de error del lienzo (lámina `.cerr`): el token que no llega o el puente que no
	 *  contesta, con su texto propio. `null` si el lienzo no tiene nada que contar. */
	const canvasError = $derived.by(() => {
		if (tokenState.kind === 'error')
			return {
				title: ctx.t('editor.visual.canvas.tokenTitle'),
				body: ctx.t('editor.visual.token.error', { message: tokenState.message }),
				canRetry: true,
				retry: () => void requestPreview()
			};
		if (bridgeState.status === 'error') {
			const text = bridgeErrorText(bridgeState.kind, bridgeState, ctx.t);
			return { title: text.title, body: text.body, canRetry: text.canRetry, retry: retryBridge };
		}
		return null;
	});

	// ————— Panel de ayuda de atajos (ver `handleVisualKeydown`) —————

	function closeHelp(): void {
		helpRequest = null;
	}

	/** El disparador se captura antes del import; cerrar durante la carga retira el #await, de
	 *  modo que resolver tarde nunca abre un diálogo ni roba foco tras desmontar la pantalla. */
	function toggleHelp(): void {
		if (helpRequest) {
			closeHelp();
			return;
		}
		helpPreviouslyFocused = document.activeElement as HTMLElement | null;
		helpRequest = import('./VisualHelpDialog.svelte');
	}

	function focusHelpClose(node: HTMLButtonElement): void {
		node.focus();
	}

	$effect(() => {
		if (!helpRequest) return;
		return () => {
			if (helpPreviouslyFocused?.isConnected) helpPreviouslyFocused.focus();
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
		switch (visualKeyboardAction(event, canvasActive, helpRequest !== null)) {
			case 'save':
				inspectorRef?.saveSelected();
				break;
			case 'close-help':
				closeHelp();
				break;
			case 'clear-selection':
				selectedBlockId = null;
				break;
			case 'toggle-help':
				toggleHelp();
				break;
			case 'move-up':
				void moveSelectedBlock(-1);
				break;
			case 'move-down':
				void moveSelectedBlock(1);
				break;
			case 'delete':
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
		if (canvasActive && !treeResizerActive) ensureTreeLoaded();
		// Lámina «edición en vivo»: en escritorio ancho la estructura se ve desde el principio (se
		// puede plegar; plegarla no desmonta nada ni pierde borradores).
		if (canvasActive && treeResizerActive) {
			treeVisible = true;
			ensureTreeLoaded();
		}
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
		// Las generaciones cubren `requestPreview` y la escritura de estado de `refreshCanvas`, pero
		// no el `scheduleRenew` de `refreshCanvas({ renew: true })`, que va antes de su guarda a
		// propósito (ver `destroyed`): esa la corta la bandera.
		preview.dispose();
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

	/** La MISMA fuente dirty del guard estructural, también para bloques no seleccionados. */
	const pendingBlocks = $derived(blocks.records.filter((block) => blocks.isDirty(block.id)));

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
	 *  caen todos en `'waiting'` — un `error` (p.ej. `no-bridge`) ya lo cuenta la franja del lienzo
	 *  con su propio texto y botón de reintentar (ver cabecera, "Dos relojes distintos"); el
	 *  lienzo no necesita repetir esa historia con otras palabras, solo no mentir sobre bloques
	 *  que no existen. */
	const overlayStatus = $derived(bridgeState.status === 'connected' ? 'ready' : 'waiting');
	const overlayBlocks = $derived(bridgeState.status === 'connected' ? bridgeState.blocks : []);
	const overlaySkippedBlocks = $derived(
		bridgeState.status === 'connected' ? bridgeState.skippedBlocks : 0
	);
	/** Resalte al pasar que se pinta (ver cabecera, "Precedencia"): la fuente más reciente si
	 *  tiene un id que el sitio reporta, si no la otra, si no nada. */
	const highlightedBlockId = $derived.by(() => {
		const reported = (id: string | null) =>
			id !== null && overlayBlocks.some((block) => block.id === id) ? id : null;
		const page = reported(pageHoveredBlockId);
		const tree = reported(treeHoveredBlockId);
		return hoverSource === 'tree' ? (tree ?? page) : (page ?? tree);
	});
	/** Ids que el SITIO dice no públicos (ver cabecera, "Qué secciones NO son públicas"), para el
	 *  árbol. Vacío sin conexión: sin puente, Vega no sabe nada de publicación. */
	const unpublishedBlockIds = $derived(
		new Set(overlayBlocks.filter((block) => block.unpublished).map((block) => block.id))
	);
	/** Pista de la edición en línea sobre el lienzo (lámina, `.inl-hint`): bajo el campo que se
	 *  escribe, desplazada con su bloque (ver `inlineEdit`). Sin `rect` del sitio, bajo el borde
	 *  superior del bloque: la pista no depende de que el sitio mida. */
	const inlineHint = $derived.by(() => {
		if (!inlineEdit) return null;
		const edit = inlineEdit;
		const block = overlayBlocks.find((item) => item.id === edit.blockId);
		if (!block) return null;
		const rect =
			edit.rect && edit.anchor
				? {
						top: block.rect.top + edit.rect.top - edit.anchor.top,
						left: block.rect.left + edit.rect.left - edit.anchor.left,
						width: edit.rect.width,
						height: edit.rect.height
					}
				: { top: block.rect.top, left: block.rect.left, width: block.rect.width, height: 0 };
		return { label: edit.label, widget: edit.widget, rect };
	});
</script>

{#snippet helpLoading(failed: boolean)}
	<aside class="vega-visual-help-loading" aria-label={ctx.t('editor.visual.help.title')}>
		<p role={failed ? 'alert' : 'status'}>
			{ctx.t(failed ? 'editor.visual.help.loadError' : 'common.loading')}
		</p>
		<button
			type="button"
			class="vega-visual-help-loading-close"
			use:focusHelpClose
			onclick={closeHelp}>{ctx.t('common.close')}</button
		>
	</aside>
{/snippet}

<svelte:window onclick={handleZoomWindowClick} />

<div class="vega-visual-screen" bind:this={screenEl}>
	<!-- Barra ÚNICA del editor (lámina «edición en vivo», `.edbar`): sustituye a la barra de la app
	     en esta ruta (ver el `:global` del final del estilo). Volver, migas, estado de la PÁGINA,
	     estado de GUARDADO, tamaño de pantalla con su anchura y zoom, atajos, vista previa y el
	     «Publicar» del SITIO, que es el mismo componente que la barra de la app: nunca guarda. Las
	     rutas canónicas (`listRoute`/`recordRoute`) ya incluyen el base path; este repo desactiva la
	     regla de `resolve()` en los otros consumidores del mismo `NavApi`. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<header class="vega-visual-bar" class:vega-visual-bar--publish={Boolean(ctx.port.buildApiUrl)}>
		<a
			href={recordRoute(type.name, record.id)}
			class="vega-visual-back"
			aria-label={ctx.t('editor.visual.back')}
			onclick={(event) => openDestination(event, 'form')}
			><Icon id="back" size={16} strokeWidth={1.6} /><span class="vega-visual-hide-narrow"
				>{ctx.t('editor.visual.back')}</span
			></a
		>
		<nav class="vega-visual-crumbs" aria-label={ctx.t('editor.visual.breadcrumbs.label')}>
			<a
				href={listRoute(type.name)}
				title={ctx.t('editor.visual.backToList', { label: type.label })}
				onclick={(event) => openDestination(event, 'list')}>{type.label}</a
			>
			<span class="vega-visual-crumbs-sep" aria-hidden="true">/</span>
			<h1 title={docName} aria-current="page">{docName}</h1>
		</nav>
		<div class="vega-visual-statusgrp">
			<VisualPublishControl
				bind:this={publishControlRef}
				{type}
				{record}
				name={docName}
				bar
				pendingBlocks={pendingBlocks.map((block) => blocks.blockTitle(block))}
				{review}
				onReviewGo={handleReviewGo}
				onReviewDescribe={handleReviewDescribe}
			/>
		</div>

		<!-- Estado de GUARDADO (lámina, `.savestate`): punto + texto, y el error DENTRO de la barra con
		     «Reintentar». Con bloques sin guardar es un desplegable con su lista: ocultar paneles no
		     deja ningún borrador sin camino de vuelta (audit del 19 oct). Con un error de guardado Y
		     bloques pendientes, el error es el RESUMEN de ese mismo desplegable: la lista no se pierde
		     (la paleta manda a «abrir los bloques pendientes en el aviso»). -->
		{#if pendingBlocks.length > 0}
			<!-- Con bloques pendientes la lista sigue a mano hasta que el guardado se CONFIRMA (audit
			     del 19 oct); mientras uno está en vuelo, el resumen dice «Guardando…». -->
			<details class="vega-visual-pending">
				<summary
					class="vega-visual-savestate"
					class:vega-visual-savestate--err={saveErrorBlockId !== null}
					class:vega-visual-savestate--dirty={saveErrorBlockId === null &&
						!(blocks.anySaving || blocks.structuralBusy)}
					class:vega-visual-savestate--saving={saveErrorBlockId === null &&
						(blocks.anySaving || blocks.structuralBusy)}
					title={saveErrorBlockId
						? ctx.t('editor.visual.bar.saveError', { label: saveErrorLabel })
						: undefined}
				>
					<i aria-hidden="true"></i>
					{#if saveErrorBlockId}<span class="vega-visual-savestate-text" role="alert"
							>{ctx.t('editor.visual.bar.saveError', { label: saveErrorLabel })}</span
						>{:else if blocks.anySaving || blocks.structuralBusy}<span
							class="vega-visual-saved-at--saving"
							role="status">{ctx.t('editor.saving')}</span
						>{:else}<span class="vega-visual-dirty" role="status"
							>{ctx.t(
								pendingBlocks.length === 1
									? 'editor.visual.pending.one'
									: 'editor.visual.pending.many',
								{ count: pendingBlocks.length }
							)}</span
						>{/if}
					<span class="vega-visually-hidden vega-visual-pending-expand"
						>{ctx.t('editor.visual.pending.view')}</span
					>
					<span class="vega-visually-hidden vega-visual-pending-collapse"
						>{ctx.t('editor.visual.pending.hide')}</span
					>
				</summary>
				<div class="vega-visual-pending-pop">
					<p>{ctx.t('editor.visual.pending.body')}</p>
					<ul class="vega-visual-pending-list">
						{#each pendingBlocks as block (block.id)}
							<li>
								<button
									type="button"
									class="vega-visual-pending-block"
									onclick={() => void openPendingBlock(block.id)}
								>
									{ctx.t('editor.visual.pending.open', { label: blocks.blockTitle(block) })}
								</button>
							</li>
						{/each}
					</ul>
				</div>
			</details>
			{#if saveErrorBlockId}
				<button type="button" class="vega-visual-retry" onclick={retrySave}
					><Icon id="update" size={14} />{ctx.t('common.retry')}</button
				>
			{/if}
		{:else if saveErrorBlockId}
			<span
				class="vega-visual-savestate vega-visual-savestate--err"
				role="alert"
				title={ctx.t('editor.visual.bar.saveError', { label: saveErrorLabel })}
				><i aria-hidden="true"></i>{ctx.t('editor.visual.bar.saveError', {
					label: saveErrorLabel
				})}</span
			>
			<button type="button" class="vega-visual-retry" onclick={retrySave}
				><Icon id="update" size={14} />{ctx.t('common.retry')}</button
			>
		{:else if blocks.anySaving || blocks.structuralBusy}
			<span class="vega-visual-savestate vega-visual-savestate--saving vega-visual-saved-at--saving"
				><i aria-hidden="true"></i><span role="status">{ctx.t('editor.saving')}</span></span
			>
		{:else}
			<span
				class="vega-visual-savestate vega-visual-local-state"
				class:vega-visual-savestate--saved={savedAtText}
				><i aria-hidden="true"></i><span role="status"
					>{#if savedAtText}<span class="vega-visual-saved-at">{savedAtText}</span>{:else}{ctx.t(
							'editor.noLocalChanges'
						)}{/if}</span
				></span
			>
		{/if}

		<span class="vega-visual-bar-spacer"></span>

		{#if canvasActive}
			{#if selectedBlockId && !inspectorVisible}
				<button
					type="button"
					class="vega-visual-iconbtn vega-visual-panel-toggle"
					bind:this={editBlockButtonEl}
					aria-label={ctx.t('editor.visual.editBlock')}
					title={ctx.t('editor.visual.editBlock')}
					onclick={() => void reopenInspector()}
					><Icon id="pen" size={16} strokeWidth={1.6} /></button
				>
			{/if}
			<!-- `data-vega-own-keys` (ver `visual-keyboard.ts`): sus teclas no son gestos de bloque. -->
			<div
				class="vega-visual-segm"
				role="group"
				aria-label={ctx.t('editor.visual.screen.groupLabel')}
				data-vega-own-keys
			>
				{#each SCREEN_PRESETS as preset (preset)}
					<button
						type="button"
						aria-pressed={screenPreset === preset}
						title={ctx.t('editor.visual.screen.width', { width: frameWidthFor(preset) })}
						onclick={() => setScreenPreset(preset)}
						><Icon id={PRESET_ICONS[preset]} size={14} strokeWidth={1.6} /><span
							class="vega-visual-segm-label">{ctx.t(`editor.visual.screen.${preset}`)}</span
						></button
					>
				{/each}
			</div>
			<div class="vega-visual-zoom" bind:this={zoomEl} data-vega-own-keys>
				<button
					type="button"
					class="vega-visual-zoom-trigger"
					aria-haspopup="menu"
					aria-expanded={zoomMenuOpen}
					aria-controls="vega-visual-zoom-menu"
					aria-label={ctx.t('editor.visual.zoom.trigger', {
						width: frameWidth,
						percent: Math.round(zoomFactor * 100)
					})}
					onclick={toggleZoomMenu}
					><span class="vega-visual-zoom-width"
						>{`${ctx.t('editor.visual.screen.width', { width: frameWidth })} · `}</span
					>{Math.round(zoomFactor * 100)} %</button
				>
				{#if zoomMenuOpen}
					<div
						id="vega-visual-zoom-menu"
						class="vega-visual-zoom-menu"
						role="menu"
						tabindex="-1"
						aria-label={ctx.t('editor.visual.zoom.groupLabel')}
						bind:this={zoomMenuEl}
						onkeydown={handleZoomMenuKeydown}
					>
						<button
							type="button"
							role="menuitemradio"
							aria-checked={zoomPreference === 'fit'}
							onclick={() => chooseZoom('fit')}
							>{ctx.t('editor.visual.zoom.fitWithLevel', {
								percent: Math.round(fitZoomFactor * 100)
							})}</button
						>
						{#each ZOOM_LEVELS as level (level)}
							<button
								type="button"
								role="menuitemradio"
								aria-checked={zoomPreference === level}
								onclick={() => chooseZoom(level)}
								>{ctx.t('editor.visual.zoom.level', { percent: level })}</button
							>
						{/each}
					</div>
				{/if}
			</div>
			<button
				type="button"
				class="vega-visual-iconbtn vega-visual-help-toggle vega-visual-hide-narrow"
				aria-label={ctx.t('editor.visual.help.toggle')}
				title={ctx.t('editor.visual.help.toggle')}
				aria-pressed={helpRequest !== null}
				onclick={toggleHelp}><Icon id="keyboard" size={16} strokeWidth={1.6} /></button
			>
		{/if}
		<button
			type="button"
			class="vega-visual-iconbtn vega-visual-preview-open vega-visual-hide-narrow"
			aria-label={ctx.t('editor.visual.openPreview')}
			title={ctx.t('editor.visual.inline.preview')}
			bind:this={previewOpener}
			onclick={openPreviewPanel}><Icon id="eye" size={16} strokeWidth={1.6} /></button
		>
		<div class="vega-visual-site-publish"><PublishButton /></div>
	</header>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->

	<!-- En escritorio el árbol plegado sale de accesibilidad con display:none; la misma región
	     permanece aquí para anunciar selecciones del lienzo antes de abrir Estructura. -->
	{#if canvasActive && treeResizerActive && !treeVisible}
		<div aria-live="polite" class="vega-visually-hidden">{blocks.announce}</div>
	{/if}

	<!-- La rejilla existe en los DOS anchos; lo que cambia con `canvasActive` es cuántas celdas
	     tiene (ver cabecera, "lo que SÍ hay por debajo de 900 px"). Las clases de columnas van
	     condicionadas al lienzo: sin él, `.vega-visual-grid` es una sola columna y el inspector en
	     modo «solo textos» la ocupa entera. -->
	<div
		class="vega-visual-grid"
		class:vega-visual-grid--tree={canvasActive && treeVisible && treeResizerActive}
		class:vega-visual-grid--inspector={canvasActive && inspectorVisible}
		class:vega-visual-grid--texts={!canvasActive}
		style:--vega-visual-tree-w="{columnWidths.tree}px"
		style:--vega-visual-inspector-w="{columnWidths.inspector}px"
	>
		{#if canvasActive}
			<!-- Hasta tres columnas: árbol | lienzo | inspector. Las manillas (ver cabecera, "Anchos de
			     columna ajustables") son celdas del MISMO grid, a propósito: su orden en el marcado
			     tiene que casar con el de `grid-template-columns` del CSS. -->
			<div class="vega-visual-tree-shell" class:vega-visual-tree-shell--hidden={!treeVisible}>
				{#if treeRequest}
					{#await treeRequest}
						<p role="status">{ctx.t('common.loading')}</p>
					{:then tree}
						<tree.default
							{blocks}
							selectedId={selectedBlockId}
							unpublishedIds={unpublishedBlockIds}
							connectedText={bridgeState.status === 'connected'
								? ctx.t(
										bridgeState.blocks.length === 1
											? 'editor.visual.connected.one'
											: 'editor.visual.connected.many',
										{ count: bridgeState.blocks.length }
									)
								: null}
							onHover={handleTreeHover}
							onSelect={handleBlockSelect}
							onStructuralChange={handleContentSaved}
							onPaletteDragStart={handlePaletteDragStart}
							onPaletteDragEnd={handlePaletteDragEnd}
						/>
					{:catch}
						<p role="alert">{ctx.t('editor.visual.structureLoadError')}</p>
						<button type="button" class="vega-visual-tree-retry" onclick={retryTree}
							>{ctx.t('common.retry')}</button
						>
					{/await}
				{/if}
			</div>
			{#if treeResizerActive && treeVisible}
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
			<div
				class="vega-visual-preview"
				role="region"
				aria-label={ctx.t('editor.visual.preview.label')}
			>
				<!-- Escenario (lámina, `.stage`): gris propio (`--v-stage`) y la página como una hoja con
				     sombra. Lo que dice del lienzo va en la línea de arriba, en mono, sin robar sitio. -->
				<div class="vega-visual-canvas" bind:this={canvasEl}>
					{#if treeResizerActive}
						<!-- Plegar o abrir la estructura: en la esquina del escenario, junto al panel que
						     gobierna; plegarla no desmonta el árbol ni pierde nada. -->
						<button
							type="button"
							class="vega-visual-iconbtn vega-visual-panel-toggle vega-visual-panel-toggle--tree"
							aria-expanded={treeVisible}
							aria-controls="vega-block-tree-panel"
							aria-label={ctx.t('editor.visual.structure')}
							title={ctx.t('editor.visual.structure')}
							onclick={toggleTree}><Icon id="list" size={16} strokeWidth={1.6} /></button
						>
					{/if}
					<div class="vega-visual-status vega-visual-meta" aria-live="polite">
						{#if inlineBlockId !== null}
							<span class="vega-visual-inline-state" role="status"
								>{ctx.t('editor.visual.inline.typing')}</span
							>
						{:else if previewError !== null}
							<span class="vega-visual-status-text vega-visual-status-text--error" role="alert">
								{ctx.t('editor.visual.previewRefreshError', { message: previewError })}
							</span>
							<button
								type="button"
								class="vega-visual-meta-retry"
								onclick={() => scheduleCanvasRefresh()}
							>
								{ctx.t('common.retry')}
							</button>
						{:else if blocks.anyDirty && (previewUpdating || !frameLoaded)}
							<span class="vega-visual-status-text">{ctx.t('editor.visual.previewUpdating')}</span>
						{:else if blocks.anyDirty && previewDraftAccepted}
							<span class="vega-visual-status-text">{ctx.t('editor.visual.previewDraft')}</span>
						{:else if blocks.anyDirty}
							<span class="vega-visual-status-text">{ctx.t('editor.visual.previewSavedOnly')}</span>
						{:else if bridgeState.status === 'connected'}
							<span class="vega-visual-status-text"
								>{ctx.t(
									bridgeState.blocks.length === 1
										? 'editor.visual.connected.one'
										: 'editor.visual.connected.many',
									{ count: bridgeState.blocks.length }
								)}</span
							>
						{:else if bridgeState.status !== 'error' && tokenState.kind !== 'error'}
							<!-- "Conectando" SOLO mientras la conexión sigue viva: con el token caído el
							     mensaje lo da la tarjeta del lienzo, que es quien lo sabe. -->
							<span class="vega-visual-status-text">{ctx.t('editor.visual.connecting')}</span>
						{/if}
					</div>
					{#if tokenState.kind === 'ready'}
						{#if tokenState.token.postToken}
							<form
								method="post"
								action={tokenState.token.url}
								target={frameName}
								bind:this={postForm}
							>
								<input type="hidden" name="token" value={tokenState.token.postToken} />
							</form>
						{/if}
						<!-- La HOJA: caja sin escalar con radio y sombra, del tamaño ya escalado del
						     escenario; dentro, el escenario del zoom (iframe + overlay en la MISMA caja
						     escalada, así los contornos siguen casando con las coordenadas del puente). -->
						<!-- Franja y margen de la hoja (ver `VisualOverlay.svelte`, «Nada sobre la página»):
						     el overlay pinta aquí la selección, sus acciones y los «+»; fuera de la página. -->
						<div
							class="vega-visual-chrome"
							bind:this={chromeEl}
							style:left="{stageLeft}px"
							style:width="{chromeWidth}px"
						></div>
						<div
							class="vega-visual-gutter"
							bind:this={gutterEl}
							style:left="{stageLeft - STAGE_GUTTER}px"
							style:height="{stageHeightPx * zoomFactor}px"
						></div>
						<div
							class="vega-visual-sheet"
							style:left="{stageLeft}px"
							style:width="{frameWidth * zoomFactor}px"
							style:height="{stageHeightPx * zoomFactor}px"
						>
							<div
								class="vega-visual-stage"
								style:width="{frameWidth}px"
								style:height="{stageHeightPx}px"
								style:transform="scale({zoomFactor})"
							>
								{#key frameVersion}
									<iframe
										class="vega-visual-frame"
										bind:this={iframeEl}
										name={frameName}
										src={tokenState.token.postToken ? 'about:blank' : tokenState.token.url}
										title={ctx.t('editor.visual.frameTitle')}
										referrerpolicy="no-referrer"
										onload={handleFrameLoad}
									></iframe>
								{/key}
								<VisualOverlay
									inlineId={inlineBlockId}
									{inlineHint}
									blocks={overlayBlocks}
									selectedId={selectedBlockId}
									highlightedId={highlightedBlockId}
									skippedBlocks={overlaySkippedBlocks}
									status={overlayStatus}
									renderedBlockTypes={ctx.port.renderedBlockTypes ?? null}
									blocksState={blocks}
									onStructuralChange={handleContentSaved}
									{paletteDragType}
									{zoomFactor}
									canvasHeight={canvasSize.height}
									chromeTarget={chromeEl}
									gutterTarget={gutterEl}
								/>
							</div>
						</div>
					{/if}
					{#if canvasError}
						<!-- Error del lienzo (lámina, `.cerr`): tarjeta con salida en los tres sentidos. El
						     árbol y la ficha siguen operativos: se puede editar sin lienzo. -->
						<div class="vega-visual-cerr-wrap">
							<div class="vega-visual-cerr" role="alert">
								<span class="vega-visual-cerr-glyph" aria-hidden="true"
									><Icon id="generic" size={18} strokeWidth={1.6} /></span
								>
								<h2>{canvasError.title}</h2>
								<p>{canvasError.body}</p>
								<div class="vega-visual-cerr-acts">
									{#if canvasError.canRetry}
										<button
											type="button"
											class="vega-visual-btn vega-visual-btn--primary vega-visual-cerr-retry"
											onclick={canvasError.retry}
											><Icon id="update" size={14} />{ctx.t('common.retry')}</button
										>
									{/if}
									<button type="button" class="vega-visual-btn" onclick={openPreviewPanel}
										><Icon id="eye" size={14} />{ctx.t('editor.visual.openPreview')}</button
									>
									<!-- Ruta canónica con base path (ver la barra). -->
									<!-- eslint-disable svelte/no-navigation-without-resolve -->
									<a
										href={recordRoute(type.name, record.id)}
										class="vega-visual-btn vega-visual-btn--quiet"
										onclick={(event) => openDestination(event, 'form')}
										>{ctx.t('editor.visual.back')}</a
									>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								</div>
							</div>
						</div>
					{:else if tokenState.kind === 'loading' || (tokenState.kind === 'ready' && !frameLoaded)}
						<div class="vega-visual-overlay" aria-live="polite">
							<p>{ctx.t('editor.visual.connecting')}</p>
						</div>
					{/if}
					{#if resizing}
						<!-- Escudo del arrastre (ver cabecera): solo existe mientras dura. -->
						<div class="vega-visual-shield" aria-hidden="true"></div>
					{/if}
				</div>
			</div>
			{#if inspectorVisible}<VisualColumnResizer
					value={columnWidths.inspector}
					min={INSPECTOR_MIN_WIDTH}
					max={INSPECTOR_MAX_WIDTH}
					defaultValue={INSPECTOR_DEFAULT_WIDTH}
					sign={-1}
					label={ctx.t('editor.visual.resize.inspector')}
					onResize={setInspectorWidth}
					onDragChange={setResizing}
				/>{/if}
		{/if}
		<!-- FUERA del `{#if canvasActive}` a propósito (ver cabecera): es la misma instancia en los
		     dos anchos, solo cambia de `mode`. -->
		<div
			class="vega-visual-inspector-shell"
			class:vega-visual-inspector-shell--hidden={canvasActive && !inspectorVisible}
		>
			<VisualInspector
				onSaveError={(blockId, failed) => {
					if (failed) saveErrorBlockId = blockId;
					else if (saveErrorBlockId === blockId) saveErrorBlockId = null;
				}}
				bind:this={inspectorRef}
				{blocks}
				selectedId={selectedBlockId}
				mode={canvasActive ? 'inspector' : 'texts'}
				onBlockSaved={handleContentSaved}
				onBack={() => ctx.nav.toRecord(type.name, record.id)}
				onSelectBlock={openPendingBlock}
				onInlineTakeover={() => bridgeClient?.finishInline()}
				interceptSave={(blockId) =>
					inlineBlockId === blockId && (bridgeClient?.saveInline() ?? false)}
				onClose={() => void closeInspector()}
				fullFormHref={recordRoute(type.name, record.id)}
			/>
		</div>
	</div>

	<!-- La ayuda se descarga al pedirla; el estado de carga/error sigue siendo cancelable. -->
	{#if helpRequest}
		{#await helpRequest}
			{@render helpLoading(false)}
		{:then help}
			<help.default onClose={closeHelp} />
		{:catch}
			{@render helpLoading(true)}
		{/await}
	{/if}

	<!-- «Describir la imagen…» de la revisión (lote 13): la ficha de Medios de siempre, encima del
	     editor visual. Guardar sustituye la ficha en la revisión; borrar relee. Al cerrar, el foco
	     vuelve al botón de estado a mano (`closeReviewMedia`); `fallbackFocusEl` solo lo usan las
	     confirmaciones de borrar y reemplazar de la ficha, y aquí no hay un nodo estable que darles. -->
	<ReviewMediaLoader
		mediaId={reviewMediaId}
		onClose={() => void closeReviewMedia()}
		onSaved={(item) => review.updateMedia(item)}
		onDeleted={() => void review.reload()}
		fallbackFocusEl={null}
	/>
</div>

{#if previewPanelOpen && ctx.port.previewApiUrl}
	{#await import('$lib/form/PreviewPanel.svelte')}
		<aside class="vega-visual-help-loading" role="status">{ctx.t('common.loading')}</aside>
	{:then module}
		<module.default
			apiBasePath={ctx.port.previewApiUrl}
			collection={type.name}
			recordId={record.id}
			draft={{
				record: { id: record.id, fields: { ...record.values } },
				blocks: blocks.currentDraftRecords()
			}}
			refreshToken={contentSavedCount}
			onClose={() => void closePreviewPanel()}
		/>
	{:catch}
		<aside class="vega-visual-help-loading" role="alert">
			<p>{ctx.t('common.networkError')}</p>
			<button
				type="button"
				class="vega-visual-help-loading-close"
				onclick={() => void closePreviewPanel()}>{ctx.t('common.close')}</button
			>
		</aside>
	{/await}
{/if}

<style>
	/* La barra del editor SUSTITUYE a la de la app en esta ruta (lámina «edición en vivo», nota 3):
	   lo resuelve `AppShell.svelte` (`.vega-shell--visual`), que no monta su barra aquí. */
	.vega-visual-screen {
		display: flex;
		flex-direction: column;
		min-width: 0;
		height: 100%;
		background-color: var(--bg);
		background-image: var(--halo);
		background-repeat: no-repeat;
	}

	/* ————— Barra (lámina `.edbar`) ————— */
	.vega-visual-bar {
		position: relative;
		z-index: 5;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px;
		min-height: var(--topbar-h, 56px);
		padding: 6px var(--sp-4);
		border-bottom: 1px solid var(--line);
		background: var(--glass);
		backdrop-filter: blur(18px) saturate(1.4);
		-webkit-backdrop-filter: blur(18px) saturate(1.4);
		font-family: var(--sans);
		font-size: var(--fs-13);
	}

	.vega-visual-bar-spacer {
		flex: 1;
	}

	.vega-visual-back,
	.vega-visual-btn,
	.vega-visual-retry {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		height: 34px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: var(--r-pill);
		background: var(--surface);
		color: var(--ink-hi);
		font: inherit;
		font-size: var(--fs-13);
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-visual-back {
		border-color: transparent;
		background: transparent;
		color: var(--ink-2);
		padding: 0 10px;
	}

	.vega-visual-back:hover,
	.vega-visual-btn--quiet:hover,
	.vega-visual-iconbtn:hover {
		background: var(--btn);
		color: var(--ink-hi);
	}

	.vega-visual-btn:hover,
	.vega-visual-retry:hover {
		border-color: var(--line-strong);
		background: var(--btn);
	}

	.vega-visual-btn--primary {
		border-color: transparent;
		background: var(--accent-fill);
		color: var(--accent-ink);
		box-shadow: var(--shadow-card);
	}

	.vega-visual-btn--primary:hover {
		border-color: transparent;
		background: var(--accent-fill);
		box-shadow: var(--shadow-brand, var(--shadow-card));
	}

	.vega-visual-btn--quiet {
		border-color: transparent;
		background: transparent;
		color: var(--ink-2);
	}

	.vega-visual-back:focus-visible,
	.vega-visual-btn:focus-visible,
	.vega-visual-retry:focus-visible,
	.vega-visual-iconbtn:focus-visible,
	.vega-visual-segm button:focus-visible,
	.vega-visual-zoom-trigger:focus-visible,
	.vega-visual-zoom-menu button:focus-visible,
	.vega-visual-crumbs a:focus-visible,
	.vega-visual-pending summary:focus-visible,
	.vega-visual-pending-block:focus-visible,
	.vega-visual-meta-retry:focus-visible,
	.vega-visual-help-loading-close:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.vega-visual-iconbtn {
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
		width: 34px;
		height: 34px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--r-pill);
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
	}

	.vega-visual-iconbtn[aria-pressed='true'],
	.vega-visual-iconbtn[aria-expanded='true'] {
		background: var(--btn);
		color: var(--ink-hi);
	}

	/* Migas (lámina `.crumbs`): tipo en tinta 2, documento en la display. */
	.vega-visual-crumbs {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		color: var(--ink-2);
		white-space: nowrap;
	}

	.vega-visual-crumbs a {
		color: inherit;
		text-decoration: none;
		border-radius: 4px;
	}

	.vega-visual-crumbs a:hover {
		color: var(--ink-hi);
	}

	.vega-visual-crumbs-sep {
		color: var(--ink-3);
	}

	.vega-visual-crumbs h1 {
		max-width: 18rem;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--ink-hi);
		font-family: var(--display);
		font-size: var(--fs-15);
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	/* Estado de la página (lámina `.statusgrp`): una píldora con su estado y sus acciones. */
	.vega-visual-statusgrp {
		display: inline-flex;
		align-items: center;
		min-width: 0;
		padding: 3px 4px 3px 6px;
		border: 1px solid var(--line);
		border-radius: var(--r-pill);
		background: var(--surface);
	}

	/* Estado de guardado (lámina `.savestate`): punto de color + texto en mono. */
	.vega-visual-savestate {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-height: 34px;
		padding: 0 8px;
		color: var(--ink-2);
		font-family: var(--mono);
		font-size: var(--fs-12);
		font-feature-settings: 'tnum' 1;
		white-space: nowrap;
	}

	.vega-visual-savestate > i {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ink-3);
	}

	.vega-visual-savestate--dirty > i {
		background: var(--warning);
	}

	.vega-visual-savestate--saving > i {
		background: var(--accent);
		animation: vega-visual-blink 1s infinite;
	}

	.vega-visual-savestate--saved > i {
		background: var(--success);
	}

	.vega-visual-savestate--err {
		color: var(--danger);
		max-width: 18rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.vega-visual-savestate--err > i {
		background: var(--danger);
	}

	@keyframes vega-visual-blink {
		50% {
			opacity: 0.3;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.vega-visual-savestate--saving > i {
			animation: none;
		}
	}

	.vega-visual-retry {
		height: 30px;
		padding: 0 10px;
		font-size: var(--fs-12);
	}

	/* «N bloques sin guardar» abre su lista como un desplegable de la barra. */
	.vega-visual-pending {
		position: relative;
	}

	.vega-visual-pending summary {
		list-style: none;
		cursor: pointer;
		border-radius: var(--r-pill);
	}

	.vega-visual-pending summary::-webkit-details-marker {
		display: none;
	}

	.vega-visual-pending summary:hover,
	.vega-visual-pending[open] summary {
		background: var(--btn);
		color: var(--ink-hi);
	}

	/* Con error, el resumen del desplegable ES el error: sigue en rojo al pasar o abrirlo, y su
	   texto se corta con puntos suspensivos (el completo, en el `title`). */
	.vega-visual-pending summary.vega-visual-savestate--err {
		color: var(--danger);
	}

	.vega-visual-savestate-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.vega-visual-pending-pop {
		position: absolute;
		z-index: 20;
		top: calc(100% + 6px);
		left: 0;
		width: min(22rem, calc(100vw - 2rem));
		padding: var(--sp-3);
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-raised);
		color: var(--ink);
		font-family: var(--sans);
		font-size: var(--fs-13);
	}

	.vega-visual-pending-pop p {
		margin: 0 0 var(--sp-2);
		color: var(--ink-2);
	}

	.vega-visual-pending-list {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-visual-pending-block {
		width: 100%;
		min-height: 36px;
		padding: 0 var(--sp-2);
		border: 0;
		border-radius: var(--r-sm);
		background: transparent;
		color: var(--ink-hi);
		font: inherit;
		text-align: left;
		cursor: pointer;
		overflow-wrap: anywhere;
	}

	.vega-visual-pending-block:hover {
		background: var(--accent-soft);
		color: var(--accent-text);
	}

	/* Tamaño de pantalla (lámina `.segm`): segmentado en píldora con icono. */
	.vega-visual-segm {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 3px;
		border-radius: var(--r-pill);
		background: var(--btn);
	}

	.vega-visual-segm button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 28px;
		padding: 0 9px;
		border: 0;
		border-radius: var(--r-pill);
		background: transparent;
		color: var(--ink-2);
		font: inherit;
		font-size: var(--fs-12);
		font-weight: 500;
		cursor: pointer;
	}

	.vega-visual-segm button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--ink-hi);
		box-shadow: var(--shadow-card);
	}

	/* Con poco ancho, el segmentado se queda en iconos: la etiqueta sigue en el nombre accesible
	   (recorte, nunca `display: none`). Con el «Publicar» del sitio en la barra hace falta antes. */
	@media (max-width: 1339px) {
		.vega-visual-segm-label {
			position: absolute;
			width: 1px;
			height: 1px;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
		}
	}

	/* Con «Publicar» y por debajo de 1600 px la barra no cabe entera en una fila cuando además lleva
	   el error de guardado y «Reintentar» (medido a 1440: 1449 px). El disparador de zoom se queda en
	   el porcentaje: la anchura sigue en su nombre accesible y en el `title` de cada tamaño. */
	@media (max-width: 1599px) {
		.vega-visual-bar--publish .vega-visual-zoom-width {
			display: none;
		}
	}

	@media (max-width: 1599px) {
		.vega-visual-bar--publish .vega-visual-segm-label {
			position: absolute;
			width: 1px;
			height: 1px;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
		}
	}

	/* Anchura y zoom (lámina `.width`): el texto ES el control; abre los niveles de zoom. */
	.vega-visual-zoom {
		position: relative;
	}

	.vega-visual-zoom-trigger {
		height: 30px;
		padding: 0 6px;
		border: 0;
		border-radius: var(--r-sm);
		background: transparent;
		color: var(--ink-3);
		font-family: var(--mono);
		font-size: 11px;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-visual-zoom-trigger:hover,
	.vega-visual-zoom-trigger[aria-expanded='true'] {
		background: var(--btn);
		color: var(--ink-hi);
	}

	.vega-visual-zoom-menu {
		position: absolute;
		z-index: 20;
		top: calc(100% + 6px);
		right: 0;
		display: grid;
		min-width: 11rem;
		padding: 6px;
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-raised);
	}

	.vega-visual-zoom-menu button {
		min-height: 34px;
		padding: 0 var(--sp-3);
		border: 0;
		border-radius: var(--r-sm);
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-size: var(--fs-13);
		text-align: left;
		cursor: pointer;
	}

	.vega-visual-zoom-menu button:hover,
	.vega-visual-zoom-menu button[aria-checked='true'] {
		background: var(--accent-soft);
		color: var(--accent-text);
	}

	/* «Publicar» del sitio: el MISMO componente de la barra de la app, con la píldora de esta. */
	.vega-visual-site-publish :global(.vega-publish-trigger) {
		height: 34px;
		padding: 0 14px;
		border-radius: var(--r-pill);
		font-size: var(--fs-13);
	}

	.vega-visual-site-publish :global(.vega-publish-state summary) {
		color: var(--ink-2);
		font-size: var(--fs-12);
	}

	.vega-visual-help-loading {
		position: fixed;
		z-index: 80;
		right: var(--vega-space-gutter);
		bottom: var(--vega-space-gutter);
		max-width: min(26rem, calc(100% - var(--vega-space-gutter) * 2));
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-raised);
	}

	.vega-visual-help-loading p {
		margin: 0 0 0.5rem;
	}

	.vega-visual-help-loading-close {
		min-height: 34px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: var(--r-pill);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
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

	/* ————— Cuerpo: paneles de cristal y escenario (lámina `.edbody`) ————— */
	.vega-visual-grid {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		/* 2 + 8 (manilla) + 2 = 12 px entre paneles, el `--v-inset` de la lámina. */
		column-gap: 2px;
		row-gap: var(--sp-3);
		flex: 1;
		min-height: 12rem;
		padding: var(--sp-3);
	}

	/* `display: contents` deja los paneles en sus celdas originales; `none` los quita del foco
	   y del ancho sin desmontar BlockEditor ni sus borradores. */
	.vega-visual-tree-shell,
	.vega-visual-inspector-shell {
		display: contents;
	}

	.vega-visual-tree-shell--hidden,
	.vega-visual-inspector-shell--hidden {
		display: none;
	}

	.vega-visual-tree-retry {
		min-width: 44px;
		min-height: 44px;
	}

	.vega-visual-grid--tree {
		grid-template-columns: var(--vega-visual-tree-w, 264px) 8px minmax(0, 1fr);
	}

	.vega-visual-grid--inspector {
		grid-template-columns: minmax(0, 1fr) 8px var(--vega-visual-inspector-w, 340px);
	}

	.vega-visual-grid--tree.vega-visual-grid--inspector {
		grid-template-columns: var(--vega-visual-tree-w, 264px) 8px minmax(0, 1fr) 8px var(
				--vega-visual-inspector-w,
				340px
			);
	}

	/* 1180px (ver cabecera de `VisualBlockTree.svelte`, "Colapsable"): el árbol pasa a cajón fuera
	   del flujo y su manilla no se monta; el inspector sigue en columna hasta los 900px. */
	@media (max-width: 1180px) {
		.vega-visual-tree-shell--hidden {
			display: contents;
		}

		.vega-visual-grid--tree {
			grid-template-columns: minmax(0, 1fr);
		}

		.vega-visual-grid--tree.vega-visual-grid--inspector {
			grid-template-columns: minmax(0, 1fr) 8px var(--vega-visual-inspector-w, 340px);
		}
	}

	.vega-visual-preview {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}

	/* Escenario (lámina `.stage`): el gris propio y radio de panel. El relleno lo mide el
	   `ResizeObserver` fuera (`contentRect`), así que «Ajustar» ya descuenta el aire. Arriba, la
	   línea de estado (28 px) y la franja del seleccionado (40 + 8 de aire); a la izquierda, el
	   margen de los «+» (`STAGE_GUTTER`, 52 px). Ningún control del editor cae sobre la hoja. */
	.vega-visual-canvas {
		flex: 1;
		position: relative;
		min-height: 0;
		padding: 76px 24px 24px 52px;
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--v-stage);
		overflow: hidden;
	}

	.vega-visual-panel-toggle--tree {
		position: absolute;
		top: 4px;
		left: 8px;
		z-index: 3;
		width: 28px;
		height: 28px;
	}

	.vega-visual-meta {
		position: absolute;
		top: 6px;
		left: 50%;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: calc(100% - 2rem);
		transform: translateX(-50%);
		color: var(--ink-3);
		font-family: var(--mono);
		font-size: 11px;
		white-space: nowrap;
	}

	.vega-visual-meta > span {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.vega-visual-status-text--error {
		color: var(--danger);
	}

	.vega-visual-inline-state {
		color: var(--v-ol-inline-text);
		font-weight: 600;
	}

	.vega-visual-meta-retry {
		padding: 0 8px;
		border: 1px solid var(--line);
		border-radius: var(--r-pill);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}

	/* Franja del seleccionado (ver la cabecera de `VisualOverlay.svelte`, «Nada sobre la página»):
	   una fila de 40 px ENCIMA de la hoja, alineada con ella; el overlay pinta dentro. */
	.vega-visual-chrome {
		position: absolute;
		top: 28px;
		z-index: 3;
		display: flex;
		align-items: center;
		height: 40px;
		pointer-events: none;
	}

	/* Margen de los «+»: a la izquierda de la hoja y de su mismo alto. No recorta: el menú de tipos
	   sale hacia la derecha, sobre la página, mientras está abierto. */
	.vega-visual-gutter {
		position: absolute;
		top: 76px;
		z-index: 3;
		width: 52px;
		pointer-events: none;
	}

	/* La HOJA (lámina `.site`): radio y sombra de dos capas sobre el escenario, sin escalar. */
	.vega-visual-sheet {
		position: absolute;
		top: 76px;
		border-radius: 12px;
		background: var(--surface);
		box-shadow: var(--shadow-raised);
		overflow: hidden;
	}

	/* Escenario del zoom (ver cabecera del script, "Tamaño de pantalla + zoom del lienzo"): el ÚNICO
	   elemento que se escala, envolviendo iframe + overlay en la MISMA caja para que sigan casando. */
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

	/* Escudo del arrastre (ver cabecera, "El escudo del arrastre"). */
	.vega-visual-shield {
		position: absolute;
		inset: 0;
		cursor: col-resize;
	}

	/* Mientras no hay nada que enseñar, el escenario lo dice en vez de quedarse en blanco. */
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
		background: var(--v-stage);
		color: var(--ink-2);
		font-size: var(--fs-13);
	}

	/* Error del lienzo (lámina `.cerr`): tarjeta centrada en el escenario. */
	.vega-visual-cerr-wrap {
		position: absolute;
		inset: 0;
		z-index: 3;
		display: grid;
		place-items: center;
		padding: var(--sp-6);
		background: var(--v-stage);
		overflow: auto;
	}

	.vega-visual-cerr {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
		width: min(460px, 100%);
		padding: var(--sp-6);
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}

	.vega-visual-cerr-glyph {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		margin-bottom: 4px;
		border-radius: var(--r-sm);
		background: var(--danger-soft);
		color: var(--danger);
	}

	.vega-visual-cerr h2 {
		margin: 0;
		color: var(--ink-hi);
		font-family: var(--display);
		font-size: var(--fs-17);
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.vega-visual-cerr p {
		margin: 0;
		color: var(--ink-2);
		font-size: var(--fs-13);
		overflow-wrap: anywhere;
	}

	.vega-visual-cerr-acts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 8px;
	}

	/* Modo «solo textos»: sin lienzo no hay escenario; la columna conserva el aire de la rejilla. */
	.vega-visual-grid--texts {
		padding-top: var(--sp-4);
	}

	/* Bajo 900 px (lámina, `@container ed (max-width: 900px)`): la barra se parte en filas y lo
	   que solo sirve con lienzo ya ni se monta; aquí se esconden los textos largos. */
	@media (max-width: 900px) {
		.vega-visual-bar {
			padding: 8px 12px;
		}

		.vega-visual-hide-narrow {
			display: none;
		}

		.vega-visual-back {
			padding: 0 10px;
		}

		.vega-visual-crumbs h1 {
			max-width: 10rem;
		}
	}

	/* Objetivo táctil 44×44 (checklist de accesibilidad, `scripts/check-touch-targets.mjs`): solo con
	   puntero basto; con ratón la barra conserva la densidad de la lámina. */
	@media (pointer: coarse) {
		.vega-visual-back,
		.vega-visual-btn,
		.vega-visual-retry,
		.vega-visual-segm button,
		.vega-visual-zoom-trigger,
		.vega-visual-zoom-menu button,
		.vega-visual-pending-block,
		.vega-visual-meta-retry,
		.vega-visual-help-loading-close {
			min-height: 44px;
		}

		.vega-visual-iconbtn,
		.vega-visual-retry,
		.vega-visual-meta-retry {
			min-width: 44px;
			min-height: 44px;
		}

		.vega-visual-pending summary {
			min-height: 44px;
		}
	}
</style>
