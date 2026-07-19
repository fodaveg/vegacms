<script lang="ts">
	/**
	 * `RecordForm.svelte` (Fase F5-a, el "armazón" del motor de edición): el formulario generado
	 * desde un `ResolvedContentType`. Componente COMPARTIDO por `/c/[type]/new` y
	 * `/c/[type]/[id]` (D-P5.1..12) — ninguna de las dos rutas conoce el estado editable, el
	 * dirty tracking ni el guard de salida; se lo delegan entero a este componente.
	 *
	 * - Itera `type.fields` en el orden efectivo de `type.fieldGroups` (§4.9 de P2), agrupando en
	 *   secciones (grupo `null` = anónimo, sin cabecera). Un campo cuyo `group` no aparezca en
	 *   `fieldGroups` (no debería pasar — P2 lo garantiza — pero L11 manda degradar sin
	 *   crashear) cae en una sección final sin cabecera, en vez de desaparecer.
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
	 * **R7 del rediseño C2 «Cabina»**: reestilizado a fichas (`.vega-fsection` por grupo, ver el
	 * `{#each sections}` de más abajo) tras una barra pegajosa `EditTopBar` (crumb + tag de estado +
	 * indicador dirty + "último guardado" + "Ver en el sitio" + "Guardar"). Toda esta fase es
	 * ADITIVA/de MARKUP sobre el armazón de arriba — ninguna palabra de lo descrito arriba cambia:
	 * ni el dirty tracking, ni el guard de salida, ni el foco al primer error, ni la interfaz de
	 * widget (D-P5.1). Puntos nuevos, documentados aquí para no repetirlos junto a cada variable:
	 *
	 * - **La afordancia "Volver" se MUDA al crumb (D-P5.12 intacto)**: antes había un botón
	 *   `{ctx.t('editor.cancel')}` ("Volver") en una fila de acciones al pie; el mockup no tiene esa
	 *   fila — el propio nombre del tipo en el crumb (`{type.label} / …`) ES ahora el enlace que
	 *   llama `onCancel`. Sigue siendo la MISMA función (la ruta decide `toIndex`/`toList`, D-P5.12
	 *   sin tocar), solo cambia dónde vive el control; los e2e que antes buscaban el rol "Volver"
	 *   ahora buscan el nombre accesible del tipo (`e2e/form.spec.ts`, actualizado en esta fase).
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
	 * - **Nombre del crumb = MISMA derivación que la celda-título de `RecordTable`** (L-P4.15):
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
	 *   color — pub/draft/other, `data-status-kind` igual que la tabla. Sin `statusField`, o con el
	 *   campo vacío, no se pinta nada (nunca una insignia "vacía").
	 * - **"Ver en el sitio"**: `buildPreviewUrl(type, { id: model.recordId ?? '', type: type.name,
	 *   values: baseline })` (`$lib/model/preview-url`). `null` (borrador sin resolver, o creación
	 *   sin guardar aún) → botón deshabilitado con `title` explicando por qué (fiel al mockup, que
	 *   lo pinta disabled con el mismo motivo); si no, `<a target="_blank" rel="noreferrer">`. Solo
	 *   depende de `type`/`baseline`/`model.recordId` — se re-evalúa solo porque `baseline` cambia
	 *   tras guardar (p.ej. un slug que se resuelve con el guardado ya entra en la URL).
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
	 */
	import { beforeNavigate } from '$app/navigation';
	import { onMount, tick, untrack } from 'svelte';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { FieldInputValue, RecordInput, VegaRecord } from '$lib/backend/types';
	import { VegaError } from '$lib/backend/errors';
	import { getVegaContext } from '$lib/app-context';
	import { classifyStatusBadge, describeCell } from '$lib/list/cell';
	import { resolveTitleCellText } from '$lib/list/list-load';
	import { buildPreviewUrl } from '$lib/model/preview-url';
	import EditTopBar from '$lib/shell/EditTopBar.svelte';
	import { buildFormModel, type FormModel, type FormValues } from './form-model';
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
		/** `contentType.readonly` (view, L-P5.2): deshabilita TODOS los campos y oculta "Guardar". */
		typeReadonly: boolean;
		/** La ruta cablea esto a `ctx.port.create`/`ctx.port.update`. Puede rechazar con `VegaError`. */
		onSubmit: (input: RecordInput) => Promise<VegaRecord>;
		/** Se llama YA con el baseline reasentado (L-P5.6): seguro navegar/toastear aquí dentro. */
		onSaved: (record: VegaRecord) => void;
		/** "Volver" (D-P5.12): la ruta decide `toIndex`/`toList` según `type.singleton`. Desde R7
		 *  del rediseño, el CONTROL que lo dispara es el nombre del tipo en el crumb de `EditTopBar`
		 *  (ver cabecera), no un botón "Volver" aparte. */
		onCancel: () => void;
	}

	let { type, model, typeReadonly, onSubmit, onSaved, onCancel }: Props = $props();

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

	/**
	 * "Último guardado" (R7 del rediseño, ver cabecera): `Date` sembrada del campo autodate
	 * `updated` de `values` si el tipo declara un campo `updated` que REALMENTE es un autodate
	 * (tipo `date` + `readonly`, como lo hornea PB) y trae un valor parseable; `null` si no hay
	 * ninguna pista. El chequeo por tipo+readonly (no solo por nombre) evita que un tipo de
	 * contenido de usuario con un campo cualquiera llamado `updated` (Vega es un CMS generalista,
	 * manifest-driven) haga pintar una hora inventada — la barra no pinta nada en ese caso.
	 */
	function parseUpdatedAt(values: FormValues): Date | null {
		const field = type.fields.find((f) => f.name === 'updated');
		if (!field || field.schema.type !== 'date' || !field.schema.readonly) return null;
		const raw = values['updated'];
		if (typeof raw !== 'string') return null;
		const ms = Date.parse(raw);
		return Number.isNaN(ms) ? null : new Date(ms);
	}

	let savedAt = $state<Date | null>(untrack(() => parseUpdatedAt(model.baseline)));

	$effect(() => {
		if (model !== syncedModel) {
			syncedModel = model;
			baseline = model.baseline;
			current = { ...model.baseline };
			clientErrors = EMPTY_ERRORS;
			backendErrors = EMPTY_ERRORS;
			recordIdentity.type = type.name;
			recordIdentity.id = model.recordId;
			// Un `model` nuevo es un registro DISTINTO (ver LANDMINE de más abajo): "último guardado"
			// tiene que resembrarse de SU PROPIO baseline, no arrastrar la hora del registro anterior.
			savedAt = parseUpdatedAt(model.baseline);
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

	// Secciones en el orden efectivo de `fieldGroups` (§4.9 P2); ver cabecera para el fallback de
	// campos "huérfanos" (defensivo, no debería darse por contrato).
	const sections = $derived.by(() => {
		// Objeto plano en vez de `Set` (evita `svelte/prefer-svelte-reactivity`, que no aplica: es
		// un acumulador LOCAL de esta pasada de cálculo, descartado al terminar, nunca leído fuera).
		const placed: Record<string, true> = {};
		const result = type.fieldGroups.map((group) => {
			const fields = type.fields.filter((f) => f.group === group);
			for (const f of fields) placed[f.name] = true;
			return { group, fields };
		});
		const leftover = type.fields.filter((f) => !placed[f.name]);
		if (leftover.length > 0) result.push({ group: null, fields: leftover });
		return result;
	});

	const errors = $derived<FieldErrorsView>({
		byField: { ...clientErrors.byField, ...backendErrors.byField },
		record: backendErrors.record ?? clientErrors.record
	});

	const dirty = $derived(isDirty(baseline, current));
	const formDisabled = $derived(saving || typeReadonly);

	/** `<h1>` visualmente oculto (ver cabecera): mismo texto que antes era la cabecera VISIBLE. */
	const pageTitle = $derived(
		model.mode === 'create'
			? ctx.t('editor.create.title', { label: type.labelSingular })
			: ctx.t('editor.edit.title', { label: type.labelSingular })
	);

	/** Nombre del registro en el crumb (ver cabecera: MISMA derivación que `openText` de
	 *  `RecordTable`). En creación siempre `editor.new` ("nuevo"), sin mirar `titleField`. */
	const crumbName = $derived.by(() => {
		if (model.mode === 'create') return ctx.t('editor.new');
		const titleField = type.titleField;
		if (titleField === null) return ctx.t('list.untitled');
		const field = type.fields.find((f) => f.name === titleField);
		if (!field) return ctx.t('list.untitled');
		const descriptor = describeCell(field, baseline[titleField] ?? null, ctx.locale);
		return resolveTitleCellText(descriptor, ctx.t('list.untitled'));
	});

	/** Tag de estado del crumb (ver cabecera): `null` sin `statusField`, o con el campo vacío. */
	const statusTag = $derived.by(() => {
		if (type.statusField === null) return null;
		const raw = baseline[type.statusField];
		if (typeof raw !== 'string' || raw === '') return null;
		return { label: raw, kind: classifyStatusBadge(raw) };
	});

	/** "Ver en el sitio" (ver cabecera): `null` ⇒ botón deshabilitado, nunca oculto (fiel al
	 *  mockup, que también lo pinta disabled con motivo en vez de quitarlo del todo). */
	const previewUrl = $derived(
		buildPreviewUrl(type, { id: model.recordId ?? '', type: type.name, values: baseline })
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
		await tick();
		const target = resolveFocusTarget(document, name);
		target?.focus();
		target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
		if (!dirty) return;
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
	     visual que el mockup no pide — el crumb de `EditTopBar`, abajo, es el título "visible". -->
	<h1 class="vega-visually-hidden">{pageTitle}</h1>

	<EditTopBar>
		{#snippet crumb()}
			<span class="vega-editor-crumb">
				<button type="button" class="vega-editor-crumb-link" onclick={onCancel}>
					{type.label}
				</button>
				/ <b class="vega-editor-crumb-name">{crumbName}</b>
			</span>
			{#if typeReadonly}
				<span class="vega-editor-readonly-badge">{ctx.t('nav.readonlyBadge')}</span>
			{/if}
			{#if statusTag}
				<span class="vega-editor-tag" data-status-kind={statusTag.kind}>{statusTag.label}</span>
			{/if}
			{#if dirty}
				<span class="vega-editor-dirty">{ctx.t('editor.dirty')}</span>
			{/if}
		{/snippet}
		{#snippet actions()}
			{#if savedAtText}
				<span class="vega-editor-saved-at">{savedAtText}</span>
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
			{#if !typeReadonly}
				<button type="submit" class="vega-editor-save-button" disabled={formDisabled}>
					{saving ? ctx.t('editor.saving') : ctx.t('editor.save')}
					<kbd aria-hidden="true">⌘S</kbd>
				</button>
			{/if}
		{/snippet}
	</EditTopBar>

	{#if typeReadonly}
		<p class="vega-record-form-notice">{ctx.t('editor.readonlyNotice')}</p>
	{/if}
	{#if errors.record}
		<p class="vega-record-form-banner" role="alert">{fieldErrorMessage(ctx.t, errors.record)}</p>
	{/if}

	{#each sections as section (section.group ?? '')}
		{#if section.fields.length > 0}
			<section class="vega-fsection">
				{#if section.group}
					<h2>{section.group}</h2>
				{/if}
				{#each section.fields as field (field.name)}
					<FieldRow
						{field}
						value={current[field.name]}
						error={errors.byField[field.name] ?? null}
						disabled={formDisabled}
						{typeReadonly}
						onChange={(value) => handleFieldChange(field.name, value)}
					/>
				{/each}
			</section>
		{/if}
	{/each}
</form>

<style>
	.vega-record-form {
		display: flex;
		flex-direction: column;
		gap: 1.75rem; /* C: ritmo entre fichas (mockup `.fsection { margin-bottom: 1.75rem }`) */
		max-width: 55rem; /* mockup `.form { max-width: 880px }` */
		/* Casos límite de contenido real (F5-g): sin esto, el formulario es un flex-item cuyo
		   `min-width` por defecto es el de su contenido — un label/valor kilométrico (una sola
		   palabra sin espacios) podría forzar overflow horizontal de la página entera. */
		min-width: 0;
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

	/* Crumb (R7, mockup `.edit-top .crumb`): mono, tenue; el nombre del registro en `--ink-hi`. */
	.vega-editor-crumb {
		display: inline-flex;
		align-items: baseline;
		gap: 0.3rem;
		font-family: var(--mono);
		font-size: 0.75rem;
		color: var(--ink-3);
		overflow-wrap: anywhere;
	}

	/* Botón SIN estilo de botón (la afordancia visual sigue siendo la de un enlace de crumb, ver
	   cabecera del módulo: "Volver" se mudó aquí) — foco visible SÍ conservado (nunca `outline:none`
	   sin sustituto). */
	.vega-editor-crumb-link {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		color: inherit;
		text-decoration: underline;
		text-decoration-color: transparent;
		cursor: pointer;
	}

	.vega-editor-crumb-link:hover {
		color: var(--ink);
		text-decoration-color: currentColor;
	}

	.vega-editor-crumb-name {
		color: var(--ink);
		font-weight: 600;
	}

	.vega-editor-readonly-badge {
		flex-shrink: 0;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 0.7rem;
		white-space: nowrap;
		color: var(--ink-2);
	}

	/* Tag de estado (R7, mockup `.tag`): mismos tres colores que la insignia de `RecordTable`
	   (`classifyStatusBadge`, R3 de lote-2) — pub/draft/other. */
	.vega-editor-tag {
		display: inline-flex;
		align-items: center;
		font-family: var(--mono);
		font-size: 0.72rem;
		font-weight: 600;
		border-radius: 5px;
		padding: 0.18rem 0.55rem;
		border: 1px solid transparent;
		white-space: nowrap;
	}

	.vega-editor-tag[data-status-kind='pub'] {
		color: var(--success);
		background: var(--success-soft);
		border-color: var(--success);
	}

	.vega-editor-tag[data-status-kind='draft'] {
		color: var(--ink-2);
		background: var(--active);
		border-color: var(--line-strong);
	}

	.vega-editor-tag[data-status-kind='other'] {
		color: var(--info);
		background: var(--info-soft);
		border-color: var(--info);
	}

	/* Indicador "sin guardar" (mockup `.dirty`): el `●` es puramente decorativo (`aria-hidden` vía
	   `::before`, invisible a lectores de pantalla — el TEXTO ya dice "sin guardar"). */
	.vega-editor-dirty {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--mono);
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--warning);
		white-space: nowrap;
	}

	.vega-editor-dirty::before {
		content: '●';
	}

	.vega-editor-saved-at {
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--ink-3);
		white-space: nowrap;
	}

	/* Botones de la barra (mockup `.btn`/`.btn.quiet`/`.btn.primary`): namespaced a este componente
	   (mismo criterio que el resto de la app — cada marco define su propio botón, ver
	   `.vega-list-new-button` de `/c/[type]/+page.svelte`). */
	.vega-editor-preview-link {
		display: inline-flex;
		align-items: center;
		border: 1px solid transparent;
		background: none;
		color: var(--ink-2);
		border-radius: var(--r);
		padding: 0.45rem 1rem;
		font-size: 0.8125rem;
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
	}

	a.vega-editor-preview-link:hover {
		background: var(--active);
		color: var(--ink-hi);
	}

	button.vega-editor-preview-link:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.vega-editor-save-button {
		display: inline-flex;
		align-items: center;
		border: 1px solid var(--accent);
		background: var(--accent);
		color: var(--accent-ink);
		border-radius: var(--r);
		padding: 0.45rem 1rem;
		font-size: 0.8125rem;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-editor-save-button:hover:not(:disabled) {
		background: var(--accent-hover);
		border-color: var(--accent-hover);
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

	/* Fichas (R7, mockup `.fsection`): borde+radio+fondo+sombra de tarjeta, MISMOS tokens que el
	   resto de tarjetas del rediseño (`.vega-list-card`, `.vega-cabin`). */
	.vega-fsection {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}

	.vega-fsection h2 {
		margin: 0;
		font-family: var(--mono);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-3);
		padding: 0.7rem 1.25rem;
		background: var(--surface-2);
		border-bottom: 1px solid var(--line);
		overflow-wrap: anywhere;
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
