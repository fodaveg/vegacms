<script lang="ts">
	/**
	 * `RecordForm.svelte` (Fase F5-a, el "armazón" del motor de edición): el formulario generado
	 * desde un `ResolvedContentType`. Componente COMPARTIDO por `/c/[type]/new` y
	 * `/c/[type]/[id]` (D-P5.1..12) — ninguna de las dos rutas conoce el estado editable, el
	 * dirty tracking ni el guard de salida; se lo delegan entero a este componente.
	 *
	 * - Itera `type.fields` en el orden efectivo de `type.fieldGroups` (§4.9 de P2), agrupando en
	 *   secciones (grupo `null` = anónimo, sin cabecera; ver `form-sections.ts`). Un campo cuyo
	 *   `group` no aparezca en `fieldGroups` (no debería pasar — P2 lo garantiza — pero L11 manda
	 *   degradar sin crashear) cae en una sección final sin cabecera, en vez de desaparecer.
	 * - **Rejilla de columnas por grupo (§4.9b)**: un grupo con `columns > 1` (manifiesto
	 *   `fieldGroups: [{ name, columns }]`, feature genérica "campos emparejados" —
	 *   `titleEs`|`titleEn`, no algo específico de fodaveg) pinta sus `FieldRow` en
	 *   `.vega-fgroup-grid`, una rejilla CSS de N columnas (gap = `--gap-field`, tema P7) que
	 *   colapsa a 1 columna por debajo de 940px (el mismo breakpoint que ya usan `FieldRow`/
	 *   `ManifestEditor` para su propio colapso `label|control`). Dentro de esa rejilla, cada
	 *   `FieldRow` recibe `stacked` (label ENCIMA del control SIEMPRE, no solo bajo el
	 *   breakpoint — con 2-3 columnas el ancho por campo ya es estrecho de por sí). Un grupo con
	 *   `columns` 1 o ausente (el caso de siempre) NO pasa por esta rama: markup y layout
	 *   idénticos a antes de §4.9b.
	 * - Estado editable `current` (D-P5.1, widget CONTROLADO): arranca clonando `model.baseline`
	 *   (spread superficial, `dirty.ts`/`form-model.ts` ya garantizan que ninguna mutación
	 *   in-place alcanza al baseline). Si el padre pasa un `model` NUEVO (deep-link a otro
	 *   registro reutilizando esta misma instancia de ruta), se resincroniza — comparado por
	 *   REFERENCIA contra `syncedModel`, una variable PLANA (no `$state`, mismo patrón que
	 *   `lastKnownQ` de `ListToolbar.svelte`): así el `$effect` no depende de su propia
	 *   escritura, y el reasentado interno tras guardar (más abajo) no se revierte en el
	 *   siguiente tick.
	 * - Errores: `clientErrors` (`validation.ts`, D-P5.3) bloquea el envío SIN tocar la red si el
	 *   propio cliente ya ve un `required`/`maxSelect` incumplido; `backendErrors`
	 *   (`field-errors.ts`, L-P5.4) es lo que devuelve `onSubmit` si el puerto rechaza. Se funden
	 *   con spread (`{...client, ...backend}`, backend gana) para casar con la forma documentada
	 *   en `field-errors.ts`, aunque en la práctica nunca coexisten sobre el mismo campo (un
	 *   envío con error de cliente ni llega a `onSubmit`).
	 * - Guardado (L-P5.6/D-P5.11): `onSubmit` (que la ruta cablea a `port.create`/`port.update`)
	 *   devuelve el `VegaRecord` guardado; se reconstruye el `baseline` con `buildFormModel` a
	 *   partir de ÉL (no de `current`: así autodate/defaults que el backend rellenó también
	 *   entran al nuevo baseline) ANTES de avisar al padre vía `onSaved` — el orden importa: si
	 *   se navegara antes de reasentar, el propio guardado dispararía el guard de salida.
	 * - Guard de salida (D-P5.5, CAMBIADO por el audit — Finding 1): `beforeNavigate` +
	 *   `beforeunload` como ÚNICO mecanismo, NUNCA `registerExitGuard` (ese solo intercepta
	 *   `ctx.nav.*`, no back/forward ni recarga/cierre). `beforeNavigate` sí cubre `ctx.nav.*`
	 *   (que internamente llama `goto()`), clics de enlace y atrás/adelante; SvelteKit lo da de
	 *   baja solo al desmontar. `window.confirm` aquí es DELIBERADO (no el patrón "inline" de
	 *   `ManifestEditor.svelte`): es el propio patrón que documenta SvelteKit para
	 *   `beforeNavigate` — necesita una respuesta SÍNCRONA para decidir `navigation.cancel()`
	 *   dentro del mismo tick, algo que un diálogo inline (que espera un clic en un tick futuro)
	 *   no puede dar sin reimplementar manualmente el reintento de la navegación para cada tipo
	 *   (link/goto/popstate) — la razón por la que `ManifestEditor` evita `confirm()` (una
	 *   confirmación SIN carrera con el router) no aplica aquí.
	 * - Foco al primer error (F5-g, L-P5.2, a11y de cierre): tras un envío que deja errores (de
	 *   cliente `validateForm` O de backend `mapFieldErrors`), el foco se mueve al PRIMER campo con
	 *   error en el orden EFECTIVO de formulario — `firstErrorFieldName` (`first-error-field.ts`)
	 *   resuelve el NOMBRE (puro, testeado); `resolveFocusTarget` (`focus-target.ts`, testeado con
	 *   jsdom) resuelve el ELEMENTO: para los widgets input/select/textarea/`file` (su `inputId` YA
	 *   es el control focusable) basta el propio id; para los de tipo GRUPO (`chips`/`relation`,
	 *   `role="group"` sobre un `<div>` no-focusable) cae al primer elemento focusable Y HABILITADO
	 *   dentro de su `.vega-field-row` (ver esa cabecera para la landmine de `maxSelect`+`disabled`,
	 *   fix de code-review). Se espera un `tick()` antes de resolver: los errores de backend llegan
	 *   tras un `await`, el nodo del campo puede no existir todavía en el frame en que se asigna
	 *   `backendErrors`. NUNCA se dispara en el camino de ÉXITO (guardado ok).
	 *
	 * **R7 del rediseño C2 «Cabina» + mockup FINAL `aquelarre-detalle-post.html`**: reestilizado a
	 * fichas (`.vega-fsection` por grupo, ver el `{#each}` de más abajo) tras una barra pegajosa
	 * `EditTopBar` (atrás + título del documento + tag de estado + punto dirty + estado de guardado +
	 * "Ver en el sitio" + "Guardar"), repartidas en la rejilla MAESTRO-DETALLE del mockup final:
	 * raíl de hermanos | tarjetas de campos | aside de metadatos. Todo esto es ADITIVO/de MARKUP
	 * sobre el armazón de arriba — ninguna palabra de lo descrito arriba cambia: ni el dirty
	 * tracking, ni el guard de salida, ni el foco al primer error, ni la interfaz de widget
	 * (D-P5.1). Puntos nuevos, documentados aquí para no repetirlos junto a cada variable:
	 *
	 * - **Las piezas nuevas de la rejilla son CAPACIDADES OPT-IN del manifiesto, nunca reglas sobre
	 *   nombres de campo** (misma ley genérica que `statusLabels`/`subtitleField`): el raíl solo
	 *   existe si el tipo declara `editorRail: true`; un grupo solo cae en el aside si declara
	 *   `placement: 'aside'` en `fieldGroups`; el campo héroe y la fila de slug salen de `titleField`
	 *   y `slugField`. Una colección que no declara nada (p. ej. `posts` en la demo) pinta EXACTAMENTE
	 *   lo de siempre: una sola columna de tarjetas, sin raíl y con un aside que solo aparece si hay
	 *   metadatos/zona de peligro que enseñar.
	 * - **La afordancia "Volver" es el enlace-atrás de la barra (D-P5.12 intacto)**: antes había un
	 *   botón `{ctx.t('editor.cancel')}` ("Volver") en una fila de acciones al pie; el mockup no tiene
	 *   esa fila — el `‹ {type.label}` de la barra ES el control que llama `onCancel`. Sigue siendo la
	 *   MISMA función (la ruta decide `toIndex`/`toList`, D-P5.12 sin tocar), solo cambia dónde vive
	 *   el control; los e2e que antes buscaban el rol "Volver" buscan el nombre accesible del tipo.
	 *   Es un `<button>` y no el `<a href>` del mockup A PROPÓSITO: el destino depende de
	 *   `type.singleton` y lo decide la ruta, así que un enlace mentiría sobre a dónde lleva.
	 * - **Sin botón "Publicar" (desviación consciente del mockup)**: el mockup pinta `<button
	 *   class="btn">Publicar</button>` junto a "Guardar". P5 (el puerto `BackendPort`, §5) NO expone
	 *   ninguna transición de estado/publicación — solo `create`/`update`/`delete` sobre el mismo
	 *   registro. Fabricar ese botón sería un elemento decorativo sin acción real detrás, así que
	 *   esta fase lo omite: la fidelidad 1:1 se detiene donde empezaría a mentir sobre lo que Vega
	 *   puede hacer. Si un P futuro añade transiciones de estado al puerto, este es el hueco natural.
	 * - **`<h1>` visualmente oculto, no eliminado del todo**: el mockup no pinta NINGÚN heading
	 *   visible en el editor (el crumb es un `<span>`, no un heading) — pero dejar la página sin
	 *   ningún heading de nivel superior sería un agujero de a11y (eje 4 de la checklist: un lector
	 *   de pantalla que navegue por headings no encontraría ninguno que anuncie "estás editando
	 *   Entrada X"). Se mantiene el h1 de antes (`editor.create.title`/`editor.edit.title`) pero
	 *   `.vega-visually-hidden` (técnica clip estándar, WCAG): ocupa 1×1px, invisible a simple
	 *   vista, presente en el árbol de accesibilidad. Esto deja una jerarquía coherente de UN solo
	 *   criterio: h1 oculto de página → h2 por cada `.fsection` con nombre de grupo (el grupo
	 *   anónimo sigue sin cabecera, igual que antes).
	 * - **Nombre del documento = MISMA derivación que la celda-título de `RecordTable`** (L-P4.15):
	 *   `describeCell`+`resolveTitleCellText` (`$lib/list/cell`, `$lib/list/list-load`) sobre
	 *   `type.titleField`, con el mismo fallback i18n `list.untitled`. Simplificado respecto al
	 *   fallback de LISTADO (que cae a la primera COLUMNA visible o al id crudo cuando no hay
	 *   `titleField` — una decisión de "qué celda hago clicable", que no aplica aquí): sin
	 *   `titleField` el editor no tiene ninguna otra pista de nombre más honesta, así que cae
	 *   directo a `list.untitled`. En modo creación (`model.mode === 'create'`) el nombre es
	 *   siempre `editor.new` ("nuevo"), sin mirar `titleField` — no hay nada que derivar todavía.
	 * - **Tag de estado**: si `type.statusField` existe y `baseline[statusField]` es un string no
	 *   vacío, se pinta como `.vega-editor-tag` con `classifyStatusBadge` (`$lib/list/cell`, la
	 *   MISMA función que clasifica la insignia de `RecordTable`, R3 de lote-2) decidiendo el
	 *   color — pub/draft/other, `data-status-kind` igual que la tabla, y la MISMA píldora del
	 *   mockup (alto 24px, punto + palabra) con la etiqueta legible de `statusLabels` si el tipo la
	 *   declara. Sin `statusField`, o con el campo vacío, no se pinta nada (nunca una insignia
	 *   "vacía").
	 * - **Punto "sin guardar" (mockup `.dirty-dot`)**: el indicador dirty pasa de píldora con texto
	 *   a un punto de 8px en `--warning` junto al título. El TEXTO (`editor.dirty`) no desaparece,
	 *   se vuelve `.vega-visually-hidden` dentro del punto: un punto de color sin alternativa
	 *   textual no es información para un lector de pantalla (eje 4 del checklist).
	 * - **"Ver en el sitio"**: `buildPreviewUrl(type, { id: model.recordId ?? '', type: type.name,
	 *   values: baseline })` (`$lib/model/preview-url`). `null` (borrador sin resolver, o creación
	 *   sin guardar aún) → botón deshabilitado con `title` explicando por qué (fiel al mockup, que
	 *   lo pinta disabled con el mismo motivo); si no, `<a target="_blank" rel="noreferrer">`. Solo
	 *   depende de `type`/`baseline`/`model.recordId` — se re-evalúa solo porque `baseline` cambia
	 *   tras guardar (p.ej. un slug que se resuelve con el guardado ya entra en la URL).
	 * - **"Vista previa" (lote "publicación", fase B, §"Preview endpoint" del contrato)**: botón
	 *   OPT-IN aparte de "Ver en el sitio" — visible solo con `ctx.port.previewApiUrl` no nulo (el
	 *   proyecto declaró la capacidad en su discovery) Y `model.recordId` no nulo (nada que
	 *   previsualizar en `/new` sin guardar). Alterna `PreviewPanel.svelte` (`{#if}`, nunca un prop
	 *   `open` — ver su cabecera para el porqué), un panel FIJO al borde del viewport, no una
	 *   tarjeta más del aside. `savedCount` (más abajo, ya existía para el raíl) hace doble
	 *   servicio como `refreshToken` del panel: un guardado con éxito es la única vez que el
	 *   registro remoto cambia de verdad, así que es también el disparo correcto de refresco del
	 *   preview. Cambiar de registro (el `$effect` de resincronía, más abajo) cierra el panel: la
	 *   colección/id que tenía abiertos ya no son los del registro nuevo.
	 * - **"Último guardado"**: semilla desde el campo autodate `updated` de `baseline` SI el tipo lo
	 *   declara (`type.fields`, no todo backend de demo lo modela — PocketBase real siempre lo
	 *   trae) y tiene un valor parseable; tras cualquier guardado con éxito se actualiza a
	 *   `new Date()` SIN mirar si el tipo declara `updated` — a partir de ahí sabemos la hora real
	 *   del guardado por haberlo hecho nosotros mismos, no hace falta que el propio schema lo
	 *   confirme. Formateado HH:MM con `Intl.DateTimeFormat(ctx.locale, …)`, mismo criterio de
	 *   locale que `cell.ts`. Ausente (`null`) → la barra no pinta nada ahí (nunca una hora falsa).
	 * - **Atajo ⌘S/Ctrl+S**: listener `keydown` en `window` (añadido/quitado en el mismo `onMount`
	 *   que ya gestionaba `beforeunload`, sin abrir un segundo `onMount`). SIEMPRE hace
	 *   `preventDefault()` sobre la combinación (evita el diálogo nativo "Guardar página" del
	 *   navegador), pero solo dispara el envío real si `!formDisabled && dirty` — a diferencia del
	 *   click en "Guardar" (que no mira `dirty`, siempre reenvía si se pulsa), el atajo no tiene
	 *   sentido disparar un roundtrip cuando no hay nada que guardar. Deliberadamente SIN
	 *   `isEditableTarget` (`$lib/shell/keyboard`, usado por los atajos de una sola tecla `N`/`/`):
	 *   ⌘S no es una tecla que un campo de texto interprete como carácter, así que debe funcionar
	 *   con el foco DENTRO de cualquier input del formulario, no solo fuera de él. Reusa
	 *   `formEl.requestSubmit()` (referencia al `<form>` vía `bind:this`) para disparar el MISMO
	 *   `onsubmit={handleSubmit}` que el click nativo — cero lógica de guardado duplicada.
	 *
	 * **Piezas del mockup FINAL.** Las que dependen de un DATO de la colección son opt-in (raíl,
	 * grupos del aside, campo héroe, fila de slug — ver el primer punto de la lista de arriba); las
	 * dos que dependen solo de "estoy editando un registro que existe" (la tarjeta "Registro" y la
	 * zona de peligro) valen para CUALQUIER colección, porque su información no la declara nadie:
	 * el id y los autodates los da el propio registro, y borrarlo es una capacidad del puerto que
	 * ya existía (hasta ahora solo alcanzable desde la fila del listado).
	 * - **Rejilla maestro-detalle**: `.vega-editor-grid` = `[raíl] | tarjetas | [aside]`, con las
	 *   columnas laterales pegajosas y los dos breakpoints del mockup (1180px tira el raíl, 900px
	 *   colapsa a una columna). El editor va A SANGRE: `.vega-record-form` cancela con márgenes
	 *   negativos el padding de `.vega-main` (`AppShell.svelte`) para que la hairline de la barra y
	 *   el fondo lleguen de borde a borde como en el mockup; el aire lateral lo repone la propia
	 *   rejilla. Es el ÚNICO sitio del repo que conoce ese padding, y por eso se anota aquí.
	 * - **Raíl** (`EditorRail.svelte`, `$lib/list/`): se carga solo y se documenta allí.
	 * - **Aside**: los grupos con `placement: 'aside'` + la tarjeta "Registro" (id/creado/
	 *   actualizado, `record-meta.ts` — solo lo que el schema respalde de verdad) + la zona de
	 *   peligro. Se pinta si hay ALGO que poner: sin grupos de aside, sin metadatos y sin borrado
	 *   (p.ej. en `/new`), la columna no existe y la rejilla queda de dos columnas.
	 * - **Borrado (zona de peligro)**: `onDelete` es OPCIONAL — sin esa prop (ruta `/new`: no hay
	 *   registro que borrar) la tarjeta no se pinta, igual que en un tipo `readonly`. Este
	 *   componente NO habla con el puerto (mismo reparto que `onSubmit`): abre el MISMO
	 *   `DeleteConfirm.svelte` que el listado (L-P4.11: ningún borrado sin confirmación) y delega
	 *   la llamada real + el toast + la navegación en la ruta. Mientras el borrado está en vuelo se
	 *   levanta `discarding`, que DESACTIVA el guard de salida: sin eso, borrar un registro con
	 *   cambios sin guardar preguntaría "¿salir sin guardar?" justo después de haberlo borrado.
	 * - **Estado legible en el `<select>`**: el campo que sea el `statusField` del tipo recibe
	 *   `optionLabels` = `type.statusLabels` (P2, opt-in), así que su desplegable pinta «Publicado»
	 *   donde antes ponía `published` — la MISMA traducción que ya hacían la insignia del listado,
	 *   los chips de filtro, el raíl y la píldora de esta misma barra. Sin `statusLabels` (p. ej.
	 *   `posts`) el select sigue pintando el valor crudo. El VALUE nunca cambia: se guarda siempre
	 *   el valor de dominio.
	 * - **Fila de slug**: si el tipo declara `slugField`, ese campo recibe una acción inline
	 *   ("Regenerar") que recalcula el slug desde el valor ACTUAL del `titleField` con `slugify`
	 *   (módulo puro). Nunca escribe un slug vacío encima de uno bueno: si el título no da nada
	 *   utilizable, el botón queda deshabilitado.
	 */
	import { beforeNavigate } from '$app/navigation';
	import { onMount, tick, untrack } from 'svelte';
	import type { ResolvedContentType, ResolvedField } from '$lib/model/types';
	import type { FieldInputValue, RecordInput, VegaRecord } from '$lib/backend/types';
	import type { PreviewDraft, PreviewDraftRecord } from '$lib/backend/preview-client';
	import { VegaError } from '$lib/backend/errors';
	import { getVegaContext } from '$lib/app-context';
	import { classifyStatusBadge, describeCell } from '$lib/list/cell';
	import { resolveTitleCellText } from '$lib/list/list-load';
	import DeleteConfirm from '$lib/list/DeleteConfirm.svelte';
	import EditorRail from '$lib/list/EditorRail.svelte';
	import { buildPreviewUrl } from '$lib/model/preview-url';
	import { slugify } from '$lib/model/slugify';
	import Icon from '$lib/icons/Icon.svelte';
	import EditTopBar from '$lib/shell/EditTopBar.svelte';
	import RecordBlocks from './RecordBlocks.svelte';
	import UsedInPanel from '$lib/integrity/UsedInPanel.svelte';
	import RevisionsPanel from '$lib/revisions/RevisionsPanel.svelte';
	import { hasFileValues } from '$lib/revisions/restore';
	import SocialCardPreview from './SocialCardPreview.svelte';
	import PreviewPanel from './PreviewPanel.svelte';
	import { buildFormModel, type FormModel } from './form-model';
	import { buildFormSections, localeForField, type FormSection } from './form-sections';
	import { autodateInstant, autodateText } from './record-meta';
	import { localeStatus, type LocaleStatus } from './locale-status';
	import { isDirty, type FormInputValues } from './dirty';
	import { toRecordInput } from './to-record-input';
	import { validateForm } from './validation';
	import { isFieldValidationError, mapFieldErrors, type FieldErrorsView } from './field-errors';
	import { fieldErrorMessage } from './field-error-message';
	import { firstErrorFieldName } from './first-error-field';
	import { resolveFocusTarget } from './focus-target';
	import { setRecordIdentity } from './record-context';
	import FieldRow from './FieldRow.svelte';

	interface Props {
		type: ResolvedContentType;
		model: FormModel;
		/** `contentType.readonly` (view, L-P5.2): deshabilita TODOS los campos y oculta "Guardar".
		 *  Desde `#lote-shell` NO es la única razón por la que el formulario puede quedar bloqueado
		 *  —una regla de acceso que veda actualizar hace lo mismo, ver `locked` más abajo— pero sí la
		 *  única que pinta el rótulo "Solo lectura". */
		typeReadonly: boolean;
		/** La ruta cablea esto a `ctx.port.create`/`ctx.port.update`. Puede rechazar con `VegaError`. */
		onSubmit: (input: RecordInput) => Promise<VegaRecord>;
		/** Se llama YA con el baseline reasentado (L-P5.6): seguro navegar/toastear aquí dentro. */
		onSaved: (record: VegaRecord) => void;
		/** "Volver" (D-P5.12): la ruta decide `toIndex`/`toList` según `type.singleton`. Desde R7
		 *  del rediseño, el CONTROL que lo dispara es el enlace-atrás de `EditTopBar` (ver cabecera),
		 *  no un botón "Volver" aparte. */
		onCancel: () => void;
		/** Borrado del registro abierto (zona de peligro del aside, mockup final). OPCIONAL: sin
		 *  esta prop no se pinta la tarjeta — es el caso de `/c/[type]/new`, donde todavía no hay
		 *  nada que borrar. La ruta hace el `ctx.port.delete` + toast + navegación; este componente
		 *  solo confirma (`DeleteConfirm`) y le pasa el NOMBRE ya derivado del registro (que es él
		 *  quien lo resuelve, ver `docName`) para el mensaje de éxito. Rechaza con `VegaError` si el
		 *  borrado falla; aquí se reporta al feedback global y la tarjeta sigue en su sitio. */
		onDelete?: (label: string) => Promise<void>;
		/** Duplicado de una página existente; la ruta clona el registro y sus bloques y navega. */
		onDuplicate?: () => Promise<void>;
	}

	let { type, model, typeReadonly, onSubmit, onSaved, onCancel, onDelete, onDuplicate }: Props =
		$props();

	const ctx = getVegaContext();
	const EMPTY_ERRORS: FieldErrorsView = { byField: {}, record: null };
	/** Referencia al `<form>` (R7): la usa el atajo ⌘S para reenviar por `requestSubmit()`, el
	 *  mismo camino que un click real en "Guardar" — ver cabecera del módulo. Variable PLANA (no
	 *  `$state`): solo se LEE dentro del handler de teclado, nunca en el template/`$derived`. */
	let formEl: HTMLFormElement | undefined;

	// Semilla inicial (`untrack`, mismo patrón que `ListToolbar.svelte`/`ManifestEditor.svelte`):
	// un `$state` poblado a partir de una prop reactiva solo captura su valor INICIAL — es justo
	// lo que queremos aquí (el `$effect` de abajo es el único responsable de mantenerlo al día),
	// pero sin `untrack` Svelte lo marca como sospechoso (`state_referenced_locally`).
	let baseline = $state(untrack(() => model.baseline));
	let current = $state<FormInputValues>(untrack(() => ({ ...model.baseline })));
	let clientErrors = $state<FieldErrorsView>(EMPTY_ERRORS);
	let backendErrors = $state<FieldErrorsView>(EMPTY_ERRORS);
	let saving = $state(false);
	let duplicating = $state(false);
	let activeLocale = $state(untrack(() => type.localization?.defaultLocale ?? ''));
	/** Decisión 2 de `RecordBlocks.svelte` (capacidad `blocks`): `true` mientras AL MENOS un bloque
	 *  embebido tenga ediciones de campo sin guardar. Se OR-ea con `isDirty(baseline, current)` más
	 *  abajo — un bloque sucio es tan "hay cambios sin guardar" como un campo del propio registro,
	 *  aunque viva en otra colección. `RecordBlocks` no existe sin `type.blocks`, así que este
	 *  arranca en `false` y solo cambia si la colección declara la capacidad. */
	let blocksDirty = $state(false);
	/** Mutación estructural de bloques en vuelo: no se puede clonar una instantánea intermedia. */
	let blocksBusy = $state(false);
	/** Snapshot editable de los hijos, incluida cualquier edición aún no guardada publicada por
	 *  `BlockEditor`. Nunca se envía al puerto; solo alimenta el token cifrado de preview. */
	let previewBlocks = $state<PreviewDraftRecord[]>([]);

	// Lote "publicación" fase B (ver cabecera, "Vista previa"): `true` mientras `PreviewPanel` está
	// montado. Variable de estado propia (no derivada de `savedCount`/`model`): el usuario decide
	// cuándo abrir/cerrar, nada más lo cambia salvo un cambio de REGISTRO (ver el `$effect` de
	// resincronía, más abajo, que la fuerza a `false`).
	let previewPanelOpen = $state(false);

	// Ver cabecera: variable PLANA (no `$state`) para no crear un ciclo effect↔escritura propia.
	let syncedModel = untrack(() => model);

	// Costura de identidad de registro (F5-f, `record-context.ts`): el widget `file` necesita
	// `{type, id}` para `ctx.port.fileUrl`, que `WidgetProps` no lleva (D-P5.1). Se publica un
	// OBJETO `$state` ESTABLE (nunca reemplazado, solo mutado) para que un widget montado ahora
	// siga viendo la identidad al día si `model` cambia más tarde (ver cabecera de
	// `record-context.ts`) — el mismo motivo por el que `titleCache` de `Relation.svelte` es un
	// objeto reasignado y no esto: aquí SÍ necesitamos que la referencia sobreviva, porque el
	// widget la captura una única vez con `getContext` al montar.
	const recordIdentity = $state({
		type: untrack(() => type.name),
		id: untrack(() => model.recordId)
	});
	setRecordIdentity(recordIdentity);

	// "Último guardado" (R7 del rediseño, ver cabecera): se siembra del autodate `updated` del
	// baseline SI el tipo declara uno de verdad (`date` + `readonly`, como lo hornea PB) — la regla
	// completa, y por qué el nombre a secas no basta, viven en `record-meta.ts`, compartidas con la
	// tarjeta "Registro" del aside.
	let savedAt = $state<Date | null>(
		untrack(() => autodateInstant(type, model.baseline, 'updated'))
	);

	$effect(() => {
		if (model !== syncedModel) {
			syncedModel = model;
			baseline = model.baseline;
			current = { ...model.baseline };
			clientErrors = EMPTY_ERRORS;
			backendErrors = EMPTY_ERRORS;
			activeLocale = type.localization?.defaultLocale ?? '';
			recordIdentity.type = type.name;
			recordIdentity.id = model.recordId;
			// Un `model` nuevo es un registro DISTINTO (ver LANDMINE de más abajo): "último guardado"
			// tiene que resembrarse de SU PROPIO baseline, no arrastrar la hora del registro anterior.
			savedAt = autodateInstant(type, model.baseline, 'updated');
			// Los bloques del registro ANTERIOR ya no aplican (misma LANDMINE): `RecordBlocks` se
			// remonta con el `parentId`/`parentType` nuevos y recalculará su propio dirty desde cero.
			blocksDirty = false;
			blocksBusy = false;
			previewBlocks = [];
			// Lote "publicación" fase B: un panel de preview abierto para el registro ANTERIOR ya no
			// tiene sentido (otra colección/id) — se cierra, `RecordForm` lo reabrirá si el usuario
			// vuelve a pedirlo para el registro nuevo.
			previewPanelOpen = false;
		}
	});

	// LANDMINE anotada (code-review, no activa hoy — NO tocar sin que David lo pida): `model` lo
	// deriva la ruta a partir de `contentType` (que a su vez sale de `ctx.model.types.find(...)`,
	// reactivo). Hoy `ctx.model` solo cambia por `reloadModel()` (botón "Recargar modelo" de
	// `/settings`, o tras guardar el manifiesto) y NADA en F5-a dispara eso mientras un
	// `RecordForm` está montado con cambios sin guardar — así que este `$effect` nunca ve un
	// `model` nuevo a mitad de edición en la práctica. SI algún día algo recarga `ctx.model` en
	// caliente (otra pestaña, un futuro realtime de P4/P6) mientras el usuario edita, este mismo
	// `$effect` reasentaría `current`/`baseline` con los DEFAULTS del modelo recién resuelto,
	// tirando silenciosamente los cambios sin guardar del usuario — sin pasar por el guard de
	// salida (que solo vigila NAVEGACIÓN, no un `model` prop que cambia por debajo). Si eso llega
	// a pasar de verdad, la corrección NO es aquí: es que la ruta deje de reconstruir `formModel`
	// mientras haya un guardado en curso, o que este componente ignore un `model` nuevo si `dirty`.

	// Secciones en el orden efectivo de `fieldGroups` (§4.9/§4.9b/§4.9c P2), incl. `columns` por
	// grupo (rejilla responsive, ver cabecera y CSS de `.vega-fgroup-grid` más abajo) y `placement`
	// (columna del editor); ver `form-sections.ts` para el fallback de campos "huérfanos"
	// (defensivo, no debería darse por contrato) — extraído a módulo PURO para poder testearlo sin
	// montar este componente. Las secciones VACÍAS se filtran aquí, una sola vez, en vez de repetir
	// el `{#if section.fields.length > 0}` en las dos columnas del marcado.
	const sections = $derived.by(() =>
		buildFormSections(type, activeLocale).filter((section) => section.fields.length > 0)
	);
	const mainSections = $derived(sections.filter((section) => section.placement === 'main'));
	const asideSections = $derived(sections.filter((section) => section.placement === 'aside'));

	const errors = $derived<FieldErrorsView>({
		byField: { ...clientErrors.byField, ...backendErrors.byField },
		record: backendErrors.record ?? clientErrors.record
	});

	const dirty = $derived(isDirty(baseline, current) || blocksDirty);
	const previewDraft = $derived.by((): PreviewDraft => ({
		record: {
			id: model.recordId ?? '',
			fields: { ...current }
		},
		blocks: previewBlocks.map((record) => ({ id: record.id, fields: { ...record.fields } }))
	}));
	/**
	 * El formulario está BLOQUEADO (`#lote-shell`): o la colección es una vista del backend
	 * (`typeReadonly`, prop de la ruta) o las reglas de acceso no dejan ACTUALIZAR a esta sesión
	 * (`type.permissions.update`). Las dos razones tienen la misma consecuencia —campos
	 * deshabilitados y sin "Guardar"— y por eso comparten variable; lo que NO comparten es el
	 * mensaje, ver la nota del cuerpo y el rótulo "Solo lectura" de la cabecera (que sigue colgado
	 * de `typeReadonly` a secas: describe la naturaleza de la colección, no un permiso).
	 */
	const locked = $derived(typeReadonly || !type.permissions.update);

	const formDisabled = $derived(saving || duplicating || locked);
	const activeLocaleTabId = $derived(
		type.localization ? `vega-locale-tab-${type.name}-${activeLocale}` : undefined
	);

	/** `<h1>` visualmente oculto (ver cabecera): mismo texto que antes era la cabecera VISIBLE. */
	const pageTitle = $derived(
		model.mode === 'create'
			? ctx.t('editor.create.title', { label: type.labelSingular })
			: ctx.t('editor.edit.title', { label: type.labelSingular })
	);

	/** Nombre del registro en la barra (ver cabecera: MISMA derivación que `openText` de
	 *  `RecordTable`). En creación siempre `editor.new` ("nuevo"), sin mirar `titleField`. */
	const docName = $derived.by(() => {
		if (model.mode === 'create') return ctx.t('editor.new');
		const titleField = type.titleField;
		if (titleField === null) return ctx.t('list.untitled');
		const field = type.fields.find((f) => f.name === titleField);
		if (!field) return ctx.t('list.untitled');
		const descriptor = describeCell(field, baseline[titleField] ?? null, ctx.locale);
		return resolveTitleCellText(descriptor, ctx.t('list.untitled'));
	});

	/** Tag de estado de la barra (ver cabecera): `null` sin `statusField`, o con el campo vacío.
	 *  `label` pasa por `statusLabels` (P2, opt-in) igual que la insignia de `RecordTable`; `raw`
	 *  se conserva aparte porque es lo que va al atributo `data-status` (valor canónico, estable
	 *  para tests y para cualquier hoja de estilo que quiera engancharse a un estado concreto). */
	const statusTag = $derived.by(() => {
		if (type.statusField === null) return null;
		const raw = baseline[type.statusField];
		if (typeof raw !== 'string' || raw === '') return null;
		return { raw, label: type.statusLabels?.[raw] ?? raw, kind: classifyStatusBadge(raw) };
	});

	/** "Ver en el sitio" (ver cabecera): `null` ⇒ botón deshabilitado, nunca oculto (fiel al
	 *  mockup, que también lo pinta disabled con motivo en vez de quitarlo del todo). */
	const previewUrl = $derived(
		buildPreviewUrl(type, { id: model.recordId ?? '', type: type.name, values: baseline })
	);

	/** Lote "publicación" fase B (ver cabecera, "Vista previa"): capacidad OPT-IN e independiente de
	 *  `previewUrl` de arriba — un proyecto puede servir preview de borrador aunque el registro
	 *  todavía no tenga URL pública resuelta (es justo el caso en el que un preview aporta algo). */
	const previewCapable = $derived(
		(ctx.port.previewApiUrl ?? null) !== null && model.recordId !== null
	);

	/** Tarea "pantalla del editor visual" (aditiva sobre "Vista previa" de arriba): visible SOLO
	 *  con las MISMAS cuatro puertas que `visual-gate.ts` («forbidden» no aplica aquí — esta ruta
	 *  ya exige `permissions.view` para estar montada) más `model.recordId` no nulo (nada que
	 *  editar visualmente en `/new` sin guardar, mismo criterio que `previewCapable`). Repetir las
	 *  condiciones en vez de importar `resolveVisualGate` es deliberado: esa función decide si la
	 *  RUTA `/visual` tiene sentido con SOLO `type`/`port` (sin `model`), y esta capa además
	 *  necesita el id del registro — fundirlas exigiría pasarle un `model` que no le pertenece. */
	const visualEditorAvailable = $derived(
		(ctx.port.previewApiUrl ?? null) !== null &&
			ctx.port.previewVisualEditing === true &&
			Boolean(type.blocks) &&
			model.recordId !== null
	);

	/** HH:MM localizado (mismo criterio de locale que `cell.ts`), o `null` sin hora conocida
	 *  todavía (ver `savedAt`/cabecera). */
	const savedAtText = $derived(
		savedAt === null
			? null
			: ctx.t('editor.savedAt', {
					time: new Intl.DateTimeFormat(ctx.locale, { hour: '2-digit', minute: '2-digit' }).format(
						savedAt
					)
				})
	);

	// ————— Piezas del mockup final (todas opt-in, ver cabecera) —————

	/** Raíl de hermanos: capacidad `editorRail` del manifiesto. Nunca en un `singleton` (no hay
	 *  hermanos que listar: la colección entera es este registro) — inerte, no un error. */
	const showRail = $derived(type.editorRail && !type.singleton);

	/** Token de recarga del raíl: sube en CADA guardado con éxito. Sin esto, renombrar el registro
	 *  abierto dejaría su fila del índice con el título viejo hasta recargar la página. Lote
	 *  "publicación" fase B: el MISMO contador hace doble servicio como `refreshToken` de
	 *  `PreviewPanel` (ver cabecera, "Vista previa") — un guardado con éxito es la única señal
	 *  honesta de que hay algo nuevo que previsualizar. `#lote-integridad` Fase B: TERCER uso,
	 *  `refreshToken` de `RevisionsPanel` — un `update` con éxito es también la única señal
	 *  honesta de que `withRevisions` acaba de crear una revisión nueva. */
	let savedCount = $state(0);

	/** Tarjeta "Registro" (id/creado/actualizado): solo en edición — en creación no hay id ni
	 *  autodates todavía, y una tarjeta con tres huecos vacíos no informa de nada. */
	const showMeta = $derived(model.mode === 'edit' && model.recordId !== null);
	/** Id del registro SOLO cuando ya existe de verdad (`null` en `/new`): es lo que habilita todo lo
	 *  que necesita apuntar a un registro real —hoy los paneles "Historial" y "Se usa en" y la
	 *  comprobación de referencias del borrado (`#lote-integridad`)—. Se deriva aparte de `showMeta` a propósito
	 *  aunque hoy la condición coincida: aquello decide si una TARJETA informa de algo, esto es la
	 *  identidad del registro, y estrecharlo a un `RecordId` no-nulo evita el `?? ''` en cada uso. */
	const existingRecordId = $derived(model.mode === 'edit' ? model.recordId : null);
	const createdText = $derived(autodateText(type, baseline, 'created', ctx.locale));
	const updatedText = $derived(autodateText(type, baseline, 'updated', ctx.locale));

	/** Zona de peligro: solo si la ruta cableó `onDelete` (⇒ hay registro), el tipo no es de solo
	 *  lectura y estamos editando. Mismo criterio que el botón "Borrar" de la fila del listado. */
	const canDelete = $derived(
		onDelete !== undefined && type.permissions.delete && model.mode === 'edit'
	);

	/** La columna del aside existe si hay ALGO que poner en ella (ver cabecera). */
	const showAside = $derived(
		asideSections.length > 0 || showMeta || canDelete || Boolean(type.social)
	);

	/** Texto ACTUAL del campo título (no el del baseline): "Regenerar" deriva de lo que el usuario
	 *  está escribiendo ahora mismo, no de lo último guardado. `''` sin `titleField`. */
	const titleText = $derived.by(() => {
		if (type.titleField === null) return '';
		const raw = current[type.titleField];
		return typeof raw === 'string' ? raw : '';
	});

	/** El slug que produciría "Regenerar" con el título actual; `''` ⇒ nada utilizable (título
	 *  vacío o en un alfabeto que `slugify` no romaniza) y el botón queda deshabilitado. */
	const regeneratedSlug = $derived(slugify(titleText));

	/** Escribe el slug derivado del título en el campo `slugField` (ver cabecera). No-op si no hay
	 *  nada que escribir: JAMÁS pisa un slug bueno con una cadena vacía. */
	function regenerateSlug(): void {
		if (type.slugField === null || regeneratedSlug === '' || formDisabled) return;
		handleFieldChange(type.slugField, regeneratedSlug);
	}

	// ————— Borrado (zona de peligro; el puerto lo llama la RUTA, ver cabecera) —————
	let deleteOpen = $state(false);
	let deleting = $state(false);
	/** `true` mientras se borra: el guard de salida se calla (ver cabecera). Variable PLANA: solo
	 *  la lee `beforeNavigate`, nunca el marcado. */
	let discarding = false;
	/** Destino de foco de reserva de `DeleteConfirm` (ver su cabecera): el `<h1>` oculto de la
	 *  página, `tabindex="-1"` en el marcado — mismo truco que el `<h1>` del listado. */
	let headingEl = $state<HTMLElement | null>(null);

	/**
	 * Confirmación del diálogo de borrado. `discarding` se levanta ANTES de llamar a la ruta y NO se
	 * baja en el camino de éxito A PROPÓSITO: la navegación de la ruta (`ctx.nav.toList`) no se
	 * espera (`goto()` fire-and-forget), así que `beforeNavigate` puede dispararse DESPUÉS de este
	 * `finally` — bajar la bandera ahí volvería a armar el guard justo a tiempo de preguntar "hay
	 * cambios sin guardar" por un registro que ya no existe. Solo el camino de ERROR la baja: ahí
	 * seguimos en la página, con los cambios intactos y el guard tiene que volver a valer.
	 */
	async function confirmDelete(): Promise<void> {
		if (!onDelete || deleting) return;
		deleting = true;
		discarding = true;
		try {
			await onDelete(docName);
		} catch (err) {
			// El borrado NO llegó a hacerse: se vuelve a armar el guard de salida (seguimos en la
			// página, con los cambios sin guardar intactos) y el error va al feedback global, como
			// cualquier fallo de puerto que no sea de validación por campo (L-P5.5).
			discarding = false;
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend('Error al borrar el registro', err),
				{ action: 'record:delete' }
			);
		} finally {
			deleting = false;
			deleteOpen = false;
		}
	}

	async function handleDuplicate(): Promise<void> {
		if (!onDuplicate || duplicating || dirty || blocksBusy) return;
		duplicating = true;
		try {
			await onDuplicate();
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('No se pudo duplicar la página', err);
			ctx.feedback.reportError(vegaErr, { action: 'record:duplicate' });
		} finally {
			duplicating = false;
		}
	}

	function handleFieldChange(name: string, value: FieldInputValue): void {
		current = { ...current, [name]: value };
		// Corrige el campo ⇒ su error (de cualquiera de las dos fuentes) deja de mostrarse: el
		// usuario ya está reaccionando a él, no tiene sentido dejarlo pintado hasta el próximo envío.
		if (name in clientErrors.byField) {
			const rest = { ...clientErrors.byField };
			delete rest[name];
			clientErrors = { ...clientErrors, byField: rest };
		}
		if (name in backendErrors.byField) {
			const rest = { ...backendErrors.byField };
			delete rest[name];
			backendErrors = { ...backendErrors, byField: rest };
		}
	}

	/**
	 * `#lote-integridad` Fase B (§8·B1): "aplica estos valores al formulario y márcalo sucio" — el
	 * camino que `RevisionsPanel`/`RevisionDiff` necesitan para "Restaurar en el formulario". NO
	 * escribe nada al puerto (§8: "un 'restaurar' que escribe directo es un segundo pisotón
	 * silencioso, justo el problema que el lote viene a arreglar"): solo sustituye `current` por
	 * los valores de la revisión, dejando que `dirty`/el guard de salida/el propio "Guardar" hagan
	 * su trabajo de siempre — la persona revisa y guarda, lo que a su vez produce OTRA revisión con
	 * la pre-imagen correcta.
	 *
	 * Se EXCLUYEN los campos `readonly` (autodate `created`/`updated`, §4.3 del contrato P1:
	 * escribirlos es violación de contrato) — `toRecordInput` ya los filtraría del payload de
	 * guardado, pero cargarlos en `current` de todos modos marcaría "sucio" un campo que la persona
	 * no puede tocar ni corregir, una fricción sin ningún beneficio. Los campos `file` SÍ se
	 * restauran (a diferencia de B2/papelera, §8: aquí el registro sigue vivo y PocketBase no
	 * destruye un fichero al hacer `update` — solo un `delete` de registro lo hace, §0.3).
	 */
	function applyRestoredValues(values: FormInputValues): void {
		const next = { ...current };
		for (const field of type.fields) {
			if (field.schema.readonly) continue;
			if (!(field.name in values)) continue;
			next[field.name] = values[field.name];
		}
		current = next;
	}

	/**
	 * Mueve el foco al primer campo con error de `errorsView` (ver cabecera): espera el `tick()`
	 * de Svelte (los errores pintan tras esta llamada, no antes), resuelve el ELEMENTO con
	 * `resolveFocusTarget` (`focus-target.ts`, sobre `document` — el único acceso a él de todo
	 * este módulo) y hace `scrollIntoView` suave por si el campo queda fuera de la vista. No-op si
	 * no hay ningún error POR CAMPO (p.ej. solo el de registro, clave `''`, sin campo al que
	 * asociar el foco).
	 */
	async function focusFirstErrorField(errorsView: FieldErrorsView): Promise<void> {
		const name = firstErrorFieldName(type.fields, errorsView);
		if (name === null) return;
		const errorLocale = localeForField(type, name);
		if (errorLocale !== null) activeLocale = errorLocale;
		await tick();
		const target = resolveFocusTarget(document, name);
		target?.focus();
		target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	function localeStatusText(label: string, status: LocaleStatus): string {
		switch (status) {
			case 'error':
				return ctx.t('form.locale.status.error', { label });
			case 'dirty':
				return ctx.t('form.locale.status.dirty', { label });
			case 'missing':
				return ctx.t('form.locale.status.missing', { label });
			case 'complete':
				return ctx.t('form.locale.status.complete', { label });
		}
	}

	async function handleLocaleTabKeydown(event: KeyboardEvent, index: number): Promise<void> {
		const locales = type.localization?.locales ?? [];
		if (locales.length === 0) return;
		let next: number;
		if (event.key === 'ArrowRight') next = (index + 1) % locales.length;
		else if (event.key === 'ArrowLeft') next = (index - 1 + locales.length) % locales.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = locales.length - 1;
		else return;
		event.preventDefault();
		activeLocale = locales[next].id;
		await tick();
		const tabs = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>(
			'[role="tab"]'
		);
		tabs?.[next]?.focus();
	}

	async function handleSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (formDisabled) return;

		// D-P5.3: validación cliente MÍNIMA, solo UX — evita un roundtrip evidente. Si el cliente
		// ya ve un error, el envío se bloquea aquí SIN tocar la red (L-P5.12 solo exige lo
		// contrario: si el cliente lo cree válido, SIEMPRE se envía).
		const clientView = validateForm(type, current);
		clientErrors = clientView;
		if (Object.keys(clientView.byField).length > 0 || clientView.record) {
			await focusFirstErrorField(clientView); // F5-g, L-P5.2: foco al primer campo con error
			return;
		}

		// FIX (code-review): `backendErrors` NO se limpia hasta llegar aquí (tras pasar la
		// validación de cliente), no al entrar en el handler. Si se limpiara antes e incondicional:
		// guardar → error de backend en el campo A → el usuario corrige A pero deja B vacío
		// (`required`) → reintenta → el bloqueo por B es puramente de CLIENTE, nunca toca la red —
		// pero el error de A ya se habría borrado sin haberse corregido de verdad, mintiendo sobre
		// el estado real del registro.
		backendErrors = EMPTY_ERRORS;
		saving = true;
		// LANDMINE (F5-g, cazada en e2e): el foco NO puede pedirse todavía dentro del `catch` — el
		// campo sigue `disabled` (`formDisabled = saving || typeReadonly`, `saving` aún `true` hasta
		// el `finally`) y un elemento deshabilitado JAMÁS acepta foco (`.focus()` es un no-op sobre
		// él). Se pospone la llamada a DESPUÉS del `finally`, con `saving` ya en `false` y el
		// control re-habilitado.
		let errorsToFocus: FieldErrorsView | null = null;
		try {
			const input = toRecordInput(type, baseline, current);
			const saved = await onSubmit(input);
			// L-P5.6/D-P5.11: reasentar baseline (→ no-dirty) ANTES de avisar al padre — si no, el
			// guard de salida de abajo se dispararía sobre el propio guardado que acaba de navegar.
			const nextModel = buildFormModel(type, saved);
			syncedModel = nextModel;
			baseline = nextModel.baseline;
			current = { ...nextModel.baseline };
			clientErrors = EMPTY_ERRORS;
			// R7 del rediseño: "último guardado" pasa a la hora REAL de este guardado, sin mirar si
			// el tipo declara `updated` (ver cabecera) — acabamos de guardar, así que la sabemos.
			savedAt = new Date();
			savedCount += 1; // el raíl relee la colección: su fila puede haber cambiado de título
			onSaved(saved);
		} catch (err) {
			const vegaErr = err instanceof VegaError ? err : VegaError.backend('Error al guardar', err);
			if (isFieldValidationError(vegaErr)) {
				// L-P5.4: mapeo por campo + banner de registro (clave '').
				backendErrors = mapFieldErrors(vegaErr);
				errorsToFocus = backendErrors; // F5-g, L-P5.2: foco al primer campo con error
			} else {
				// L-P5.5: cualquier otro kind (network/backend/forbidden/auth-expired) es feedback
				// global de P3, no de este formulario. 'auth-expired' lo tapa el overlay de
				// re-login SIN desmontar este componente (el estado editable sobrevive).
				ctx.feedback.reportError(vegaErr, { action: `${model.mode}:save` });
			}
		} finally {
			saving = false;
		}
		if (errorsToFocus) await focusFirstErrorField(errorsToFocus);
	}

	beforeNavigate((navigation) => {
		// `discarding` (ver cabecera): la navegación la ha provocado el propio borrado del registro
		// — preguntar "hay cambios sin guardar, ¿salir igualmente?" por un registro que acaba de
		// dejar de existir sería absurdo (y la única respuesta útil sería "sí").
		if (!dirty || discarding) return;
		if (!window.confirm(ctx.t('editor.leaveConfirm'))) navigation.cancel();
	});

	onMount(() => {
		function handleBeforeUnload(event: BeforeUnloadEvent): void {
			if (!dirty) return;
			event.preventDefault();
			event.returnValue = '';
		}
		// Atajo ⌘S/Ctrl+S (R7, ver cabecera): a diferencia de los atajos de una tecla (`N`/`/`,
		// `$lib/shell/keyboard.isEditableTarget`), este SÍ debe funcionar con el foco dentro de
		// cualquier input del formulario — nunca se comprueba el target.
		function handleKeydown(event: KeyboardEvent): void {
			if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
			event.preventDefault(); // siempre: evita el diálogo nativo "Guardar página" del navegador
			if (formDisabled || !dirty) return; // nada que guardar, o formulario inerte (readonly/saving)
			formEl?.requestSubmit();
		}
		window.addEventListener('beforeunload', handleBeforeUnload);
		window.addEventListener('keydown', handleKeydown);
		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<form class="vega-record-form" bind:this={formEl} onsubmit={handleSubmit}>
	<!-- Ver cabecera del módulo: h1 presente para a11y (jerarquía de headings) pero sin el peso
	     visual que el mockup no pide — el título del documento en `EditTopBar`, abajo, es el título
	     "visible". `tabindex="-1"`: destino de foco de reserva de `DeleteConfirm` (ver su cabecera),
	     nunca alcanzable con Tab. -->
	<h1 class="vega-visually-hidden" tabindex="-1" bind:this={headingEl}>{pageTitle}</h1>

	<EditTopBar bleed={true}>
		{#snippet crumb()}
			<!-- Atrás (mockup `.back`): chevron + label del tipo. El icono `chevron` del set apunta a
			     la DERECHA (es el mismo que usa la nav); se espeja con CSS en vez de añadir un id
			     nuevo al registro de iconos por un giro de 180°. -->
			<button
				type="button"
				class="vega-editor-back"
				disabled={duplicating}
				onclick={() => {
					if (!duplicating) onCancel();
				}}
			>
				<Icon id="chevron" size={14} />
				{type.label}
			</button>
			<span class="vega-editor-doc">
				<span class="vega-editor-crumb-name">{docName}</span>
				{#if dirty}
					<!-- Punto "sin guardar" (mockup `.dirty-dot`): el texto sigue ahí para lectores de
					     pantalla (ver cabecera), solo deja de verse. -->
					<span class="vega-editor-dirty" title={ctx.t('editor.dirty')}>
						<span class="vega-visually-hidden">{ctx.t('editor.dirty')}</span>
					</span>
				{/if}
				{#if typeReadonly}
					<span class="vega-editor-readonly-badge">{ctx.t('nav.readonlyBadge')}</span>
				{/if}
				{#if statusTag}
					<span
						class="vega-editor-tag"
						data-status={statusTag.raw}
						data-status-kind={statusTag.kind}
					>
						{statusTag.label}
					</span>
				{/if}
			</span>
		{/snippet}
		{#snippet actions()}
			<!-- Estado de guardado (mockup `.save-state`): "Guardando…" mientras el envío está en
			     vuelo, si no la hora del último guardado conocido. El BOTÓN ya no cambia de texto al
			     guardar (el mockup lo deja fijo en "Guardar" y solo lo deshabilita): así su nombre
			     accesible es estable para cualquier locator, y el feedback vive aquí. -->
			{#if saving}
				<span class="vega-editor-saved-at vega-editor-saved-at--saving">
					{ctx.t('editor.saving')}
				</span>
			{:else if savedAtText}
				<span class="vega-editor-saved-at">{savedAtText}</span>
			{/if}
			{#if visualEditorAvailable}
				{@const visualRecordId = model.recordId}
				{#if visualRecordId !== null}
					<!-- Tarea "pantalla del editor visual" (ver cabecera, `visualEditorAvailable`):
					     navega a `/c/[type]/[id]/visual` — no abre nada en el sitio, sustituye esta
					     pantalla. -->
					<button
						type="button"
						class="vega-editor-visual-button"
						onclick={() => ctx.nav.toVisual(type.name, visualRecordId)}
					>
						<Icon id="box" size={14} />
						{ctx.t('editor.visual.open')}
					</button>
				{/if}
			{/if}
			{#if previewCapable}
				<!-- Lote "publicación" fase B (ver cabecera, "Vista previa"): OPT-IN, independiente de
				     "Ver en el sitio" — alterna `PreviewPanel`, nunca abre una pestaña. -->
				<button
					type="button"
					class="vega-editor-preview-toggle"
					class:vega-editor-preview-toggle--active={previewPanelOpen}
					aria-pressed={previewPanelOpen}
					onclick={() => (previewPanelOpen = !previewPanelOpen)}
				>
					<Icon id="eye" size={14} />
					{ctx.t('editor.preview.toggle')}
				</button>
			{/if}
			{#if previewUrl}
				<!-- `rel="external"` (además de `noreferrer`): `previewUrl` es SIEMPRE un sitio ajeno
				     a esta SPA (el sitio público del propio manifiesto, cualquier dominio) — nunca
				     una ruta interna de SvelteKit, así que no necesita `resolve()`
				     (`svelte/no-navigation-without-resolve` reconoce `rel="external"` como la señal
				     explícita de "esto no es navegación interna", ver `eslint.config.js`). -->
				<a
					class="vega-editor-preview-link"
					href={previewUrl}
					target="_blank"
					rel="noreferrer external"
				>
					{ctx.t('editor.previewLink')}
				</a>
			{:else}
				<button
					type="button"
					class="vega-editor-preview-link"
					disabled
					title={ctx.t('editor.previewDisabledTitle')}
				>
					{ctx.t('editor.previewLink')}
				</button>
			{/if}
			{#if !locked}
				{#if onDuplicate && model.mode === 'edit'}
					<button
						type="button"
						class="vega-editor-duplicate-button"
						disabled={formDisabled || dirty || blocksBusy}
						title={dirty ? ctx.t('editor.duplicate.saveFirst') : undefined}
						onclick={handleDuplicate}
					>
						{duplicating ? ctx.t('editor.duplicating') : ctx.t('editor.duplicate')}
					</button>
				{/if}
				<button type="submit" class="vega-editor-save-button" disabled={formDisabled}>
					{ctx.t('editor.save')}
					<kbd aria-hidden="true">⌘S</kbd>
				</button>
			{/if}
		{/snippet}
	</EditTopBar>

	<!-- "Regenerar" (mockup `.slug-row .btn`): deriva el slug del título ACTUAL. Deshabilitado si
	     el título no da nada utilizable — nunca borra el slug que ya había. -->
	{#snippet slugAction()}
		<button
			type="button"
			class="vega-editor-inline-button"
			disabled={formDisabled || regeneratedSlug === ''}
			onclick={regenerateSlug}
		>
			{ctx.t('editor.slug.regenerate')}
		</button>
	{/snippet}

	{#snippet fieldRow(field: ResolvedField, stacked: boolean)}
		<FieldRow
			{field}
			value={current[field.name]}
			error={errors.byField[field.name] ?? null}
			disabled={formDisabled}
			typeReadonly={locked}
			{stacked}
			isTitleField={field.name === type.titleField}
			isSlugField={field.name === type.slugField}
			optionLabels={field.name === type.statusField ? (type.statusLabels ?? undefined) : undefined}
			action={field.name === type.slugField && type.titleField !== null ? slugAction : undefined}
			onChange={(value) => handleFieldChange(field.name, value)}
		/>
	{/snippet}

	{#snippet fieldSection(section: FormSection)}
		{#if section.columns > 1}
			<!-- §4.9b: rejilla de N columnas (ver cabecera) — cada FieldRow va `stacked`. -->
			<div class="vega-fgroup-grid" class:vega-fgroup-grid--3={section.columns === 3}>
				{#each section.fields as field (field.name)}
					{@render fieldRow(field, true)}
				{/each}
			</div>
		{:else}
			<div class="vega-fields">
				{#each section.fields as field (field.name)}
					{@render fieldRow(field, false)}
				{/each}
			</div>
		{/if}
	{/snippet}

	<!-- Rejilla maestro-detalle del mockup final (ver cabecera): las columnas laterales solo
	     existen si su capacidad está declarada / hay algo que poner en ellas. -->
	<div
		class="vega-editor-grid"
		class:vega-editor-grid--rail={showRail}
		class:vega-editor-grid--aside={showAside}
	>
		{#if showRail}
			<EditorRail contentType={type} activeId={model.recordId} reloadToken={savedCount} />
		{/if}

		<div class="vega-editor-main">
			{#if typeReadonly}
				<p class="vega-record-form-notice">{ctx.t('editor.readonlyNotice')}</p>
			{:else if locked}
				<!-- Bloqueado por REGLA de acceso, no por ser una vista: el motivo se dice tal cual,
				     porque "solo lectura" haría pensar que la colección entera es inmutable. -->
				<p class="vega-record-form-notice">{ctx.t('editor.noUpdateNotice')}</p>
			{/if}
			{#if errors.record}
				<p class="vega-record-form-banner" role="alert">
					{fieldErrorMessage(ctx.t, errors.record)}
				</p>
			{/if}

			{#if type.localization}
				<div
					class="vega-locale-tabs"
					role="tablist"
					aria-label={ctx.t('form.locale.tabsLabel')}
					aria-orientation="horizontal"
				>
					{#each type.localization.locales as locale, index (locale.id)}
						{@const status = localeStatus(type, locale.id, baseline, current, errors)}
						<button
							id={`vega-locale-tab-${type.name}-${locale.id}`}
							type="button"
							role="tab"
							aria-selected={activeLocale === locale.id}
							aria-controls={`vega-locale-panel-${type.name}`}
							aria-label={localeStatusText(locale.label, status)}
							tabindex={activeLocale === locale.id ? 0 : -1}
							data-status={status}
							onclick={() => (activeLocale = locale.id)}
							onkeydown={(event) => handleLocaleTabKeydown(event, index)}
						>
							<span>{locale.label}</span>
							<span class="vega-locale-status" aria-hidden="true"></span>
						</button>
					{/each}
				</div>
			{/if}

			<div
				id={type.localization ? `vega-locale-panel-${type.name}` : undefined}
				class="vega-form-content"
				role={type.localization ? 'tabpanel' : undefined}
				aria-labelledby={activeLocaleTabId}
			>
				{#each mainSections as section (section.group ?? '')}
					<section class="vega-fsection">
						{#if section.group}
							<h2>{section.group}</h2>
						{/if}
						{@render fieldSection(section)}
					</section>
				{/each}
			</div>

			<!-- Bloques ordenables embebidos (capacidad `blocks`, lote "editor" Fase A): FUERA de
			     `.vega-form-content`/el tabpanel de idioma a propósito — un bloque no es contenido
			     LOCALIZADO de este registro, es una lista de registros hijos con su propia identidad.
			     `RecordBlocks` se carga y se muta a sí misma (ver su cabecera); este componente solo
			     le pasa el tipo/id del padre y escucha `onDirtyChange` (decisión 2 de su cabecera). -->
			{#if type.blocks}
				<RecordBlocks
					parentType={type}
					parentId={model.recordId}
					onDirtyChange={(value) => (blocksDirty = value)}
					onDraftChange={(records) => (previewBlocks = records)}
					onBusyChange={(value) => (blocksBusy = value)}
					disabled={duplicating}
				/>
			{/if}
		</div>

		{#if showAside}
			<aside class="vega-editor-aside">
				{#each asideSections as section (section.group ?? '')}
					<section class="vega-fsection vega-fsection--aside">
						{#if section.group}
							<h2>{section.group}</h2>
						{/if}
						{@render fieldSection(section)}
					</section>
				{/each}

				{#if type.social}
					<!-- Vista previa de tarjeta social (capacidad `social`, lote "editor" Fase B):
					     lee `current` (LIVE, no `baseline`) para que la previsualización responda
					     mientras se escribe, igual que "Regenerar" del slug lee `titleText` actual. -->
					<SocialCardPreview config={type.social} {type} values={current} />
				{/if}

				{#if showMeta}
					<!-- Tarjeta "Registro" (mockup `.kv`): solo filas que el schema respalde de verdad
					     (ver `record-meta.ts`) — el `id` siempre, las fechas solo si hay autodate. -->
					<section class="vega-fsection vega-fsection--aside">
						<h2>{ctx.t('editor.meta.title')}</h2>
						<dl class="vega-editor-kv">
							<div>
								<dt>{ctx.t('editor.meta.id')}</dt>
								<dd class="vega-editor-kv-mono">{model.recordId}</dd>
							</div>
							{#if createdText}
								<div>
									<dt>{ctx.t('editor.meta.created')}</dt>
									<dd>{createdText}</dd>
								</div>
							{/if}
							{#if updatedText}
								<div>
									<dt>{ctx.t('editor.meta.updated')}</dt>
									<dd>{updatedText}</dd>
								</div>
							{/if}
						</dl>
					</section>
				{/if}

				{#if existingRecordId !== null}
					<!-- Panel "Historial" (`#lote-integridad`, Fase B §10.1): las revisiones guardadas de
					     ESTE registro + "Restaurar en el formulario" (`applyRestoredValues`, ver su
					     cabecera). Va ANTES de "Se usa en": el historial es lo primero que se quiere ver
					     al reabrir un registro, mientras que "Se usa en" es la información que hace falta
					     justo antes de BORRAR, así que se queda pegada a la zona de peligro. Colapsado por
					     defecto, mismo criterio que "Se usa en". Nunca en `/new`. -->
					<RevisionsPanel
						{type}
						recordId={existingRecordId}
						onRestore={applyRestoredValues}
						refreshToken={savedCount}
					/>

					<!-- Panel "Se usa en" (`#lote-integridad`, Fase A): quién apunta a este registro.
					     Va DEBAJO de la tarjeta "Registro" y ENCIMA de la zona de peligro a propósito —
					     es la información que hace falta justo antes de borrar. Colapsado por defecto:
					     abrir un registro no paga las N consultas del motor de referencias si nadie las
					     pide (ver cabecera de `UsedInPanel.svelte`). Nunca en `/new`: un registro sin
					     guardar no puede tener referencias. -->
					<UsedInPanel targetCollection={type.name} targetId={existingRecordId} />
				{/if}

				{#if canDelete}
					<section class="vega-fsection vega-fsection--aside vega-editor-danger">
						<h2>{ctx.t('editor.dangerZone.title')}</h2>
						<button
							type="button"
							class="vega-editor-delete-button"
							onclick={() => (deleteOpen = true)}
						>
							{ctx.t('editor.delete', { label: type.labelSingular })}
						</button>
					</section>
				{/if}
			</aside>
		{/if}
	</div>
</form>

<!-- L-P4.11 (misma ley que el listado): ningún borrado sin pasar por este diálogo. Fuera del
     `<form>` a propósito — es un overlay de pantalla completa, no parte del formulario. -->
<DeleteConfirm
	open={deleteOpen}
	recordLabel={docName}
	targetCollection={type.name}
	targetId={existingRecordId}
	{deleting}
	fallbackFocusEl={headingEl}
	hasFiles={hasFileValues(type.schema.fields, model.baseline)}
	onConfirm={confirmDelete}
	onCancel={() => (deleteOpen = false)}
/>

<!-- Lote "publicación" fase B (ver cabecera, "Vista previa"): panel FIJO fuera del `<form>`, mismo
     criterio que `DeleteConfirm` arriba — no es contenido del formulario, es un overlay propio. -->
{#if previewPanelOpen && previewCapable}
	{@const previewApiUrl = ctx.port.previewApiUrl ?? null}
	{@const previewRecordId = model.recordId}
	{#if previewApiUrl !== null && previewRecordId !== null}
		<PreviewPanel
			apiBasePath={previewApiUrl}
			collection={type.name}
			recordId={previewRecordId}
			draft={previewDraft}
			refreshToken={savedCount}
			onClose={() => (previewPanelOpen = false)}
		/>
	{/if}
{/if}

<style>
	/* El editor va A SANGRE (mockup final, ver cabecera): `.vega-main` (AppShell) pinta el papel
	   con `padding: 1.75rem 2rem 2.5rem` para TODAS las rutas, y aquí se cancela con márgenes
	   negativos para que la hairline de la barra pegajosa y el fondo lleguen de borde a borde —
	   igual que en el mockup, donde el lienzo del editor no tiene padding y quien lo repone es la
	   propia rejilla (`.vega-editor-grid`). Es el ÚNICO punto del repo que replica ese valor: si
	   cambia en `AppShell.svelte`, hay que cambiarlo aquí. */
	.vega-record-form {
		display: flex;
		flex-direction: column;
		margin: -1.75rem -2rem -2.5rem;
		/* Casos límite de contenido real (F5-g): sin esto, el formulario es un flex-item cuyo
		   `min-width` por defecto es el de su contenido — un label/valor kilométrico (una sola
		   palabra sin espacios) podría forzar overflow horizontal de la página entera. */
		min-width: 0;
	}

	/* Rejilla maestro-detalle (mockup `.detail-grid`): raíl | tarjetas | aside. `align-items:
	   start` es lo que permite que las dos columnas laterales sean pegajosas (si se estiraran a la
	   altura de la fila, no habría nada que "pegar"). */
	.vega-editor-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: calc(var(--vega-space-gutter) * 1.25);
		align-items: start;
		padding: calc(var(--vega-space-gutter) * 1.25) calc(var(--vega-space-gutter) * 1.5);
	}

	.vega-editor-grid--rail {
		grid-template-columns: 264px minmax(0, 1fr);
	}

	.vega-editor-grid--aside {
		grid-template-columns: minmax(0, 1fr) 296px;
	}

	.vega-editor-grid--rail.vega-editor-grid--aside {
		grid-template-columns: 264px minmax(0, 1fr) 296px;
	}

	.vega-editor-main {
		display: flex;
		flex-direction: column;
		gap: var(--vega-space-gutter);
		min-width: 0;
	}

	/* Columna lateral (mockup `.aside`): tarjetas compactas apiladas, pegajosa bajo la barra. */
	.vega-editor-aside {
		display: flex;
		flex-direction: column;
		gap: var(--vega-space-gutter);
		position: sticky;
		/* Mismo offset (y mismo motivo) que `.vega-rail` en `EditorRail.svelte`: el scroll es el de
		   `.vega-main`, así que solo hay que descontar el alto de la barra pegajosa del editor. */
		top: 58px;
		min-width: 0;
	}

	/* Responsive del mockup, punto por punto. 1180px: se va el raíl (lo primero que sobra: es una
	   ayuda de navegación, no contenido) y la rejilla queda en dos columnas. */
	@media (max-width: 1180px) {
		.vega-editor-grid--rail {
			grid-template-columns: minmax(0, 1fr);
		}

		.vega-editor-grid--rail.vega-editor-grid--aside {
			grid-template-columns: minmax(0, 1fr) 296px;
		}

		/* `:global` DELIBERADO (mismo patrón que `FieldRow` con `.vega-widget-text`): el raíl es un
		   componente hijo con su propio CSS scoped, pero quién sobra y a qué ancho es una decisión
		   de ESTA rejilla, no suya. Se oculta el hijo directo, no se envuelve en un `<div>`: un
		   envoltorio de altura ajustada dejaría su `position: sticky` sin recorrido. */
		.vega-editor-grid--rail > :global(.vega-rail) {
			display: none;
		}
	}

	/* 900px: una sola columna y el aside deja de ser pegajoso (cae bajo el formulario, donde no
	   tiene sentido que se quede clavado). Los selectores repiten la misma especificidad que el
	   bloque de 1180px para poder ganarle por orden de cascada. */
	@media (max-width: 900px) {
		.vega-editor-grid,
		.vega-editor-grid--rail,
		.vega-editor-grid--aside,
		.vega-editor-grid--rail.vega-editor-grid--aside {
			grid-template-columns: minmax(0, 1fr);
		}

		.vega-editor-aside {
			position: static;
		}
	}

	.vega-form-content {
		display: flex;
		flex-direction: column;
		gap: var(--vega-space-gutter);
		min-width: 0;
	}

	.vega-locale-tabs {
		display: flex;
		width: fit-content;
		max-width: 100%;
		overflow-x: auto;
		padding: 0.3rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface-2);
		box-shadow: var(--shadow-card);
		scrollbar-width: thin;
	}

	.vega-locale-tabs button {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		flex: 0 0 auto;
		min-height: 2.35rem;
		padding: 0.45rem 0.85rem;
		border: 1px solid transparent;
		border-radius: calc(var(--r) - 2px);
		background: transparent;
		color: var(--ink-2);
		font-family: var(--mono);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}

	.vega-locale-tabs button:hover {
		color: var(--ink);
		background: var(--active);
	}

	.vega-locale-tabs button[aria-selected='true'] {
		border-color: var(--line-strong);
		background: var(--surface);
		color: var(--ink-hi);
		box-shadow: var(--shadow-card);
	}

	.vega-locale-tabs button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.vega-locale-status {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		background: var(--success);
	}

	.vega-locale-tabs button[data-status='missing'] .vega-locale-status {
		background: var(--ink-3);
	}

	.vega-locale-tabs button[data-status='dirty'] .vega-locale-status {
		background: var(--warning);
	}

	.vega-locale-tabs button[data-status='error'] .vega-locale-status {
		background: var(--danger);
	}

	/* Técnica WCAG estándar de "visualmente oculto" (ver cabecera del módulo): 1×1px, invisible a
	   simple vista, presente en el árbol de accesibilidad (Playwright/lectores de pantalla SÍ lo
	   ven). NUNCA `display:none`/`visibility:hidden`, que lo sacarían del árbol por completo. */
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

	/* Enlace-atrás de la barra (mockup `.back`): chevron + label del tipo, tenue hasta el hover. */
	.vega-editor-back {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		flex-shrink: 0;
		padding: 0.25rem 0.5rem;
		border: 0;
		border-radius: var(--r);
		background: none;
		color: var(--ink-2);
		font: inherit;
		font-size: 0.9em;
		line-height: 1.2; /* explícito: el `line-height` heredado no viaja a un componente Svelte */
		cursor: pointer;
	}

	.vega-editor-back:hover:not(:disabled) {
		background: var(--active);
		color: var(--ink-hi);
	}

	.vega-editor-back:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	/* El chevron del set apunta a la derecha (ver el marcado): se espeja para señalar "atrás". */
	.vega-editor-back :global(svg) {
		transform: scaleX(-1);
	}

	/* Título del documento + indicadores (mockup `.doc`). `min-width: 0` para que la elipsis del
	   título funcione dentro del flex de la barra. */
	.vega-editor-doc {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
	}

	/* Mockup `.doc-title`: el título del registro, acotado a 30ch con elipsis — un título
	   kilométrico no puede empujar las acciones fuera de la barra (eje 5, contenido real). */
	.vega-editor-crumb-name {
		font-weight: 650;
		color: var(--ink-hi);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 30ch;
	}

	.vega-editor-readonly-badge {
		flex-shrink: 0;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 0.7rem;
		line-height: 1.4;
		white-space: nowrap;
		color: var(--ink-2);
	}

	/* Tag de estado (mockup final `.status`): la MISMA píldora que la insignia de la tabla
	   (`.vega-status-badge` en `RecordTable.svelte`) — alto fijo 24px, punto de 6px + palabra, sin
	   borde, fondo semántico `-soft`. SANS, nunca `--mono`: una etiqueta de estado es un RÓTULO, no
	   un valor canónico. `line-height` explícito (el heredado no viaja a un componente Svelte: sin
	   él la palabra queda baja dentro de la píldora). */
	.vega-editor-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
		height: 24px;
		padding: 0 0.65rem;
		border-radius: 999px;
		font-size: 0.82em;
		font-weight: 600;
		line-height: 24px;
		white-space: nowrap;
	}

	.vega-editor-tag::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
		flex-shrink: 0;
	}

	.vega-editor-tag[data-status-kind='pub'] {
		color: var(--success);
		background: var(--success-soft);
	}

	.vega-editor-tag[data-status-kind='draft'] {
		color: var(--ink-2);
		background: var(--btn);
	}

	.vega-editor-tag[data-status-kind='other'] {
		color: var(--info);
		background: var(--info-soft);
	}

	/* Punto "sin guardar" (mockup `.dirty-dot`): 8px en `--warning`. El texto va dentro,
	   visualmente oculto (ver cabecera) — de ahí `overflow: hidden`, para que el clip del texto no
	   estire el punto. */
	.vega-editor-dirty {
		display: inline-block;
		flex-shrink: 0;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--warning);
		overflow: hidden;
	}

	/* Estado de guardado (mockup `.save-state`): tenue; con `⟳` en `--info` mientras se guarda. */
	.vega-editor-saved-at {
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--ink-2);
		white-space: nowrap;
	}

	.vega-editor-saved-at--saving::before {
		content: '⟳ ';
		color: var(--info);
	}

	/* Botones de la barra (mockup `.btn`/`.btn-primary`): namespaced a este componente (mismo
	   criterio que el resto de la app — cada marco define su propio botón, ver
	   `.vega-list-new-button` de `/c/[type]/+page.svelte`). */
	.vega-editor-preview-link {
		display: inline-flex;
		align-items: center;
		height: 34px;
		padding: 0 0.9rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font-size: 0.8125rem;
		font-weight: 550;
		line-height: 34px;
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
	}

	a.vega-editor-preview-link:hover {
		border-color: var(--line-strong);
	}

	button.vega-editor-preview-link:disabled {
		cursor: not-allowed;
		opacity: 0.5; /* mockup `.btn:disabled { opacity: 0.5 }` */
	}

	/* Botón "Vista previa" (lote "publicación" fase B, ver cabecera): MISMO tamaño/forma que
	   "Ver en el sitio", con estado `--active` cuando el panel está abierto (mismo lenguaje de
	   "pulsado" que un toggle, no un color nuevo). */
	.vega-editor-preview-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		height: 34px;
		padding: 0 0.9rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font-size: 0.8125rem;
		font-weight: 550;
		line-height: 1.2;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-editor-preview-toggle:hover {
		border-color: var(--line-strong);
	}

	.vega-editor-preview-toggle--active {
		border-color: var(--accent-line);
		color: var(--accent-text);
		background: var(--active);
	}

	/* Botón "Editor visual" (tarea "pantalla del editor visual"): MISMO tamaño/forma que "Vista
	   previa"/"Ver en el sitio" — sin estado `--active` propio, a diferencia del toggle: este
	   botón NAVEGA (sustituye la pantalla entera), no alterna un panel sobre el propio formulario. */
	.vega-editor-visual-button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		height: 34px;
		padding: 0 0.9rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font-size: 0.8125rem;
		font-weight: 550;
		line-height: 1.2;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-editor-visual-button:hover {
		border-color: var(--line-strong);
	}

	.vega-editor-duplicate-button {
		display: inline-flex;
		align-items: center;
		height: 34px;
		padding: 0 0.9rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font-size: 0.8125rem;
		font-weight: 550;
		line-height: 1.2;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-editor-duplicate-button:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-editor-duplicate-button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	/* Mismo breakpoint que `PreviewPanel.svelte` se oculta por completo (ver su cabecera,
	   "Responsive"): sin panel que abrir, el botón que lo abriría sobraría. */
	@media (max-width: 900px) {
		.vega-editor-preview-toggle {
			display: none;
		}
	}

	@media (pointer: coarse) {
		.vega-editor-duplicate-button {
			min-height: 44px;
		}
	}

	/* Acción inline junto a un control (mockup `.slug-row .btn`): el MISMO botón secundario de la
	   barra, en el tamaño de un control de campo. */
	.vega-editor-inline-button {
		flex-shrink: 0;
		height: 34px;
		padding: 0 0.9rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		font-weight: 550;
		line-height: 1.2;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-editor-inline-button:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-editor-inline-button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	/* Botón primario "Guardar" → --accent-fill (mockups aquelarre-*.html, firma de David: relleno
	   de marca, gradiente en los temas ricos y acento sólido en los planos — nunca `--sheen`, que
	   es solo trazo). Hover = anillo de `--accent-line` en vez de oscurecer el relleno (un
	   `background` sólido de hover no tiene sentido sobre un gradiente). */
	.vega-editor-save-button {
		display: inline-flex;
		align-items: center;
		height: 34px; /* mockup `.btn`: los tres botones de la barra comparten alto */
		padding: 0 0.9rem;
		border: 1px solid transparent;
		border-radius: var(--r);
		background: var(--accent-fill);
		color: var(--accent-ink);
		font-size: 0.8125rem;
		font-weight: 600;
		line-height: 34px;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-editor-save-button:hover:not(:disabled) {
		box-shadow: 0 0 0 1.5px var(--accent-line);
	}

	/* Mismo "kbd sobre botón de acento" que `.vega-list-new-button kbd` (R2 de lote-2): el mockup
	   usa un halo `color-mix(...)` que `check-theme-coverage.mjs` prohíbe fuera de
	   `src/lib/themes/` (ver `GlobalSearch.svelte`, mismo motivo) — este es el sustituto ya
	   establecido: borde neutro `--line-strong` + `opacity` en vez de mezclar color. */
	.vega-editor-save-button kbd {
		margin-left: 0.4rem;
		font-family: var(--mono);
		font-size: 0.6875rem;
		border: 1px solid var(--line-strong);
		border-bottom-width: 2px;
		border-radius: 4px;
		padding: 0.08rem 0.35rem;
		color: var(--accent-ink);
		opacity: 0.75;
	}

	.vega-editor-save-button:disabled {
		cursor: not-allowed;
		opacity: 0.45; /* mockup `.btn:disabled { opacity: 0.45 }` — mismo valor que el manifiesto */
	}

	/* Tarjeta de campos (mockup final `.card`): papel elevado + borde + sombra, con el padding de
	   densidad `--pad-card`. `--paper` y no `--surface`: en el vocabulario del rediseño `--paper` es
	   la superficie de TARJETA y `--surface` la de los CONTROLES que van dentro (inputs, botones);
	   una tarjeta en `--surface` haría desaparecer sus propios campos. */
	.vega-fsection {
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

	/* Rótulo de tarjeta (mockup `.aside h2`, usado también en las de la columna central para que el
	   editor tenga UN solo criterio de cabecera): versalita tenue, sin barra de fondo. */
	.vega-fsection h2 {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0;
		font-size: 0.76em;
		font-weight: 650;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ink-3);
		overflow-wrap: anywhere;
	}

	/* Tarjetas del aside (mockup `.aside .card`): mismo lenguaje, tres cuartos de padding. */
	.vega-fsection--aside {
		padding: calc(var(--pad-card) * 0.75);
	}

	/* Pila de campos de una sección (mockup `.fields`): la separación entre campos es este `gap`
	   —`--gap-field`, el token de densidad P7— y no un borde por fila, como en el mockup. */
	.vega-fields {
		display: flex;
		flex-direction: column;
		gap: var(--gap-field);
		min-width: 0;
	}

	/* En el aside los campos van más juntos (mockup `.aside .field + .field { margin-top: .9rem }`):
	   son tarjetas estrechas de metadatos, no el cuerpo del documento. */
	.vega-fsection--aside .vega-fields {
		gap: 0.9rem;
	}

	/* Rejilla de columnas de un grupo (§4.9b, ver cabecera del módulo): 2 columnas por defecto,
	   `--3` para el máximo del schema (1-3). `gap` reutiliza `--gap-field` (mismo token de
	   densidad P7 que ya separa los campos entre sí) en vez de un valor nuevo — nada hardcodeado. */
	.vega-fgroup-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--gap-field);
	}

	.vega-fgroup-grid--3 {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	/* Mismo breakpoint que el colapso de `.manif` en `ManifestEditor` (940px): grupo de columnas y
	   manifiesto rompen a 1 columna juntos. */
	@media (max-width: 940px) {
		.vega-fgroup-grid,
		.vega-fgroup-grid--3 {
			grid-template-columns: 1fr;
			gap: 0.9rem;
		}
	}

	/* Tarjeta "Registro" (mockup `.kv`): pares clave/valor a lado y lado. El `id` en `--mono`
	   (VALOR canónico); las fechas en tabular para que no bailen al actualizarse. */
	.vega-editor-kv {
		display: flex;
		flex-direction: column;
		margin: 0;
	}

	.vega-editor-kv > div {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.25rem 0;
		font-size: 0.86em;
		color: var(--ink-2);
	}

	.vega-editor-kv dd {
		margin: 0;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}

	.vega-editor-kv-mono {
		font-family: var(--mono);
		font-size: 0.92em;
	}

	/* Zona de peligro (mockup `.danger-zone`/`.btn-danger`): el borde de la tarjeta avisa antes de
	   leer nada, y el botón ocupa todo el ancho para que no se confunda con una acción menor. */
	.vega-editor-danger {
		border-color: var(--danger-soft);
	}

	.vega-editor-delete-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 34px;
		padding: 0 0.9rem;
		border: 1px solid transparent;
		border-radius: var(--r);
		background: var(--danger-soft);
		color: var(--danger);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 550;
		line-height: 1.2;
		cursor: pointer;
	}

	.vega-editor-delete-button:hover {
		box-shadow: 0 0 0 1.5px var(--danger);
	}

	.vega-record-form-notice {
		margin: 0;
		padding: 0.6rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-record-form-banner {
		margin: 0;
		padding: 0.6rem 0.9rem;
		border: 1px solid var(--danger);
		border-radius: 6px;
		background: var(--danger-soft);
		color: var(--danger);
		font-size: 0.9rem;
		overflow-wrap: anywhere;
	}
</style>
