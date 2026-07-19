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
	 */
	import { beforeNavigate } from '$app/navigation';
	import { onMount, tick, untrack } from 'svelte';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { FieldInputValue, RecordInput, VegaRecord } from '$lib/backend/types';
	import { VegaError } from '$lib/backend/errors';
	import { getVegaContext } from '$lib/app-context';
	import { buildFormModel, type FormModel } from './form-model';
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
		/** "Volver" (D-P5.12): la ruta decide `toIndex`/`toList` según `type.singleton`. */
		onCancel: () => void;
	}

	let { type, model, typeReadonly, onSubmit, onSaved, onCancel }: Props = $props();

	const ctx = getVegaContext();
	const EMPTY_ERRORS: FieldErrorsView = { byField: {}, record: null };

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

	$effect(() => {
		if (model !== syncedModel) {
			syncedModel = model;
			baseline = model.baseline;
			current = { ...model.baseline };
			clientErrors = EMPTY_ERRORS;
			backendErrors = EMPTY_ERRORS;
			recordIdentity.type = type.name;
			recordIdentity.id = model.recordId;
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
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});
</script>

<form class="vega-record-form" onsubmit={handleSubmit}>
	{#if typeReadonly}
		<p class="vega-record-form-notice">{ctx.t('editor.readonlyNotice')}</p>
	{/if}
	{#if errors.record}
		<p class="vega-record-form-banner" role="alert">{fieldErrorMessage(ctx.t, errors.record)}</p>
	{/if}

	{#each sections as section (section.group ?? '')}
		{#if section.fields.length > 0}
			<section class="vega-record-form-group">
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

	<div class="vega-record-form-actions">
		<button type="button" onclick={onCancel} disabled={saving}>{ctx.t('editor.cancel')}</button>
		{#if !typeReadonly}
			<button type="submit" disabled={formDisabled}>
				{saving ? ctx.t('editor.saving') : ctx.t('editor.save')}
			</button>
		{/if}
	</div>
</form>

<style>
	.vega-record-form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		max-width: 40rem;
		/* Casos límite de contenido real (F5-g): sin esto, el formulario es un flex-item cuyo
		   `min-width` por defecto es el de su contenido — un label/valor kilométrico (una sola
		   palabra sin espacios) podría forzar overflow horizontal de la página entera. */
		min-width: 0;
	}

	.vega-record-form-group {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.vega-record-form-group h2 {
		margin: 0;
		font-size: 0.95rem;
		color: var(--ink-2);
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

	.vega-record-form-actions {
		display: flex;
		gap: 0.5rem;
	}

	.vega-record-form-actions button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		cursor: pointer;
	}

	.vega-record-form-actions button[type='submit'] {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-ink);
	}

	.vega-record-form-actions button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
</style>
