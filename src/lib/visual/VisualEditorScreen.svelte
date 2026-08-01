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

	onMount(() => {
		window.addEventListener('message', handleMessage);
		window.addEventListener('beforeunload', handleBeforeUnload);
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
			<span class="vega-visual-doc">{docName}</span>
		{/snippet}
		{#snippet actions()}
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
				onStructuralChange={scheduleCanvasRefresh}
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
			<div class="vega-visual-canvas">
				{#if tokenState.kind === 'ready'}
					<iframe
						class="vega-visual-frame"
						bind:this={iframeEl}
						src={tokenState.token.url}
						title={ctx.t('editor.visual.frameTitle')}
						referrerpolicy="no-referrer"
						onload={handleFrameLoad}
					></iframe>
					<!-- ANTES del skeleton de token de abajo en el DOM a propósito: mientras el token
					     sigue cargando o el `load` del marco no ha disparado, ese skeleton (más
					     adelante, misma pila de apilamiento) tapa este overlay entero — no hace falta
					     `z-index`, solo el orden. Una vez visible, no tiene nada que tapar: pinta "sin
					     bloques todavía" hasta que el puente conteste. -->
					<VisualOverlay
						blocks={overlayBlocks}
						selectedId={selectedBlockId}
						highlightedId={null}
						skippedBlocks={overlaySkippedBlocks}
						status={overlayStatus}
						renderedBlockTypes={ctx.port.renderedBlockTypes ?? null}
						blocksState={blocks}
						onStructuralChange={scheduleCanvasRefresh}
					/>
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
			<VisualInspector {blocks} selectedId={selectedBlockId} onBlockSaved={scheduleCanvasRefresh} />
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

	.vega-visual-doc {
		font-weight: 650;
		color: var(--ink-hi);
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
		display: flex;
		min-height: 0;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		overflow: hidden;
	}

	.vega-visual-frame {
		flex: 1;
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
