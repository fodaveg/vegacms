<script lang="ts">
	/**
	 * Mini-formulario de un bloque embebido en `RecordBlocks.svelte`.
	 *
	 * En modo tipado, el orden y la selección de campos pertenecen a `ResolvedBlockType.fields`:
	 * los `source: 'data'` usan los campos sintéticos de `resolveBlockDataFields` y solo cruzan la
	 * frontera JSON mediante `readBlockData`/`writeBlockData`; los `source: 'record'` se casan por
	 * nombre con las columnas descubiertas del hijo y solo esas columnas llegan a `toRecordInput`.
	 * Mantener ambos estados separados es el guardarraíl que impide inventar columnas físicas.
	 *
	 * Cada editor permanece montado aunque su fila esté plegada (`hidden` en `RecordBlocks`), así
	 * que plegar y desplegar conserva el borrador. El baseline solo se reasienta cuando `onSubmit`
	 * confirma: un fallo del puerto deja intactos ambos estados y permite reintentar.
	 *
	 * Sin tipo resuelto no se ofrece un guardado ambiguo. Si `data` no es un objeto JSON tampoco:
	 * se enseña su valor crudo y se bloquea antes de llamar a `writeBlockData`, que es tolerante al
	 * leer pero no debe decidir si un valor histórico destructible se puede sustituir. `null` NO
	 * cuenta como valor no-objeto: es lo que guarda PocketBase en una columna JSON que nadie ha
	 * escrito (un bloque creado sin `data`, o las secciones que creó la migración de páginas de
	 * fodaveg el 21 oct 2026), no hay nada que perder y se edita como el objeto vacío.
	 *
	 * El modo homogéneo anterior (`dataField === null`) conserva el formulario físico legado. Es
	 * una compatibilidad deliberada para colecciones de bloques sin vocabulario heterogéneo.
	 *
	 * **Edición concurrente** (lote del 24 sep 2026, lámina del audit p1, variante estrecha): cada
	 * guardado pasa la versión del bloque que la ficha tiene delante (`version`); si alguien lo
	 * guardó entre medias, el puerto falla cerrado y aquí se abre `ConflictNotice` sin tocar el
	 * borrador. Mismo camino de escritura que siempre (`onSubmit` → `port.update`): el editor visual
	 * monta esta MISMA ficha, no un segundo escritor. Un reorden (cambio solo estructural, ver el
	 * `$effect` de más abajo) no cuenta como edición ajena.
	 *
	 * **Modo «solo textos»** (`textsOnly`, Lote 12, lámina 8; lo pide `VisualInspector.svelte` por
	 * debajo de los 900 px del lienzo): la ficha pinta SOLO los campos de texto (`texts-mode.ts`:
	 * `text`/`textarea`, y desde el 21 oct 2026 el `markdown` como `<textarea>` con su fuente, sin
	 * barra de formato, `textsModeField`) y cuenta y nombra el resto en una línea («Esta sección
	 * tiene 2 campos más (Imágenes, Enlace)…»). Es una PRESENTACIÓN del mismo estado, no otro formulario: `current`/
	 * `dataCurrent`, el `dirty`, la validación, `handleSave` y el conflicto son los de siempre, así
	 * que guardar desde el móvil escribe por el MISMO `onSubmit` → `port.update` con la MISMA
	 * `expectedVersion`. La prop es REACTIVA a propósito (nunca `untrack`): la pantalla la cambia al
	 * ensanchar o estrechar la ventana sin remontar la ficha, y el borrador a medio escribir
	 * sobrevive al cambio porque es la misma instancia. Lo que esta presentación no puede enseñar es
	 * un error de validación de un campo que no pinta (un `required` vacío fuera de los textos):
	 * `handleSave` se queda igual (no guarda con errores), y la ficha lo DICE en su banner
	 * (`hiddenErrorLabels`) en vez de dejar el botón mudo.
	 *
	 * **`locked`** (sin permiso de editar la colección hija, `permissions.update`): campos
	 * deshabilitados y SIN botón «Guardar» — a diferencia de `disabled`, que es el mutex temporal del
	 * padre («clonando página») y deja el botón visible pero inerte. Son dos motivos distintos para
	 * no poder escribir, y el autor merece distinguir «ahora no» de «tú no».
	 */
	import { tick, untrack, type Snippet } from 'svelte';
	import type {
		ResolvedBlockField,
		ResolvedBlockType,
		ResolvedContentType,
		ResolvedField
	} from '$lib/model/types';
	import type { FieldInputValue, FieldValue, RecordInput, VegaRecord } from '$lib/backend/types';
	import type { PreviewDraftRecord } from '$lib/backend/preview-client';
	import type { UpdateOptions } from '$lib/backend/port';
	import { isConflictError, VegaError, type VegaConflictError } from '$lib/backend/errors';
	import { recordVersion, type RecordVersion } from '$lib/backend/version';
	import { getVegaContext } from '$lib/app-context';
	import { buildRelationFilter } from './widgets/relation-search';
	import { settingsRoute } from '$lib/nav/routes';
	import { fieldDisplayLabel } from '$lib/model/default-labels';
	import { isPlainTextWidget, isTextWidget, textsModeField } from '$lib/visual/texts-mode';
	import {
		readBlockData,
		resolveBlockDataFields,
		writeBlockData,
		type BlockDataValues
	} from '$lib/model/block-data-form';
	import { validateBlockData } from '$lib/model/block-validation';
	import { buildFormModel, type FormValues } from './form-model';
	import { isDirty, type FormInputValues } from './dirty';
	import { toRecordInput } from './to-record-input';
	import { validateForm } from './validation';
	import { nativeFieldErrors } from './native-validity';
	import { markdownSafetyErrors, type MarkdownSafetyErrors } from './markdown-safety';
	import {
		isFieldValidationError,
		mapFieldErrors,
		type FieldErrorsView,
		type TranslatedError
	} from './field-errors';
	import { fieldErrorMessage } from './field-error-message';
	import { setRecordIdentity } from './record-context';
	import { setFieldScope } from './field-scope';
	import type { BlockSaveResult } from './blocks-state.svelte';
	import { autodateInstant } from './record-meta';
	import { diffRecordValues } from '$lib/revisions/diff';
	import { threeWayDiff, toComparableValues, touchedBlockData } from './conflict';
	import FieldRow from './FieldRow.svelte';
	// Perezoso: el aviso solo se descarga si hay conflicto (ver `ConflictNoticeLoader.svelte`).
	import ConflictNotice from './ConflictNoticeLoader.svelte';

	interface Props {
		/** Tipo físico de la colección hija (p. ej. `landing_block`). */
		childType: ResolvedContentType;
		/** Tipo editorial de ESTA fila; `null` para tipo retirado, vacío o modo homogéneo. */
		blockType: ResolvedBlockType | null;
		/** Valor crudo de la columna de tipo, para distinguir huérfano de vacío. */
		rawBlockType: string | null;
		/** Columna JSON declarada por `blocks.dataField`; `null` identifica el modo homogéneo. */
		dataField: string | null;
		record: VegaRecord;
		/** Nombre legible del bloque para el aviso de edición concurrente; sin él, el del tipo. */
		name?: string;
		/** `parentField`/`orderField`/`typeField`: nunca editables desde este formulario. */
		structuralFields: readonly string[];
		/** Quien lo monta lo cablea a `ctx.port.update`, reenviando `opts` (versión esperada) tal cual. */
		onSubmit: (input: RecordInput, opts?: UpdateOptions) => Promise<VegaRecord>;
		onSaved: (record: VegaRecord) => void;
		onDirtyChange: (dirty: boolean) => void;
		/** Publica el borrador en forma FÍSICA: las claves tipadas viajan dentro de `dataField`. */
		onDraftChange?: (record: PreviewDraftRecord) => void;
		disabled?: boolean;
		onBusyChange?: (busy: boolean) => void;
		onSaveError?: (failed: boolean) => void;
		/** Modo «solo textos» (ver cabecera): pinta solo `text`/`textarea` y nombra el resto. */
		textsOnly?: boolean;
		/** Sin permiso de editar (ver cabecera): campos deshabilitados y sin «Guardar». */
		locked?: boolean;
		/** Formulario real del padre; la pantalla conserva su guarda de salida. */
		fullFormHref?: string;
		/** Inspector visual: una sola cabecera con nombre/estado y el mismo Guardar, persistente
		 *  dentro de la ficha. El consumidor aporta presentación, nunca otro dueño del guardado.
		 *  Sin snippet, el formulario clásico conserva su acción al pie. */
		contextualHeader?: Snippet<
			[name: string, state: string, save: Snippet | undefined, id: string, dirty: boolean]
		>;
		/** El autor toca en la ficha el MISMO campo que está escribiendo en la página: el anfitrión
		 *  cierra la sesión en línea (sin cancelar: lo escrito ya está en el borrador) ANTES de que se
		 *  aplique este cambio, para que ningún `input` tardío del sitio lo pise. */
		onInlineTakeover?: (field: string) => void;
		/** Dónde va `contextualHeader`: arriba (por defecto) o al pie de la ficha, tras los campos (el
		 *  inspector visual lo usa como pie con Guardar/Descartar, lámina «edición en vivo»). Mismo
		 *  snippet y mismo orden de foco que se ve: el DOM sigue a la presentación. */
		contextualPlacement?: 'top' | 'bottom';
		/** Antes de guardar: `true` = otro dueño lo resuelve (el editor visual espera el valor final de
		 *  una edición en línea abierta y guarda él al recibirlo). Sin él, guarda como siempre. */
		beforeSave?: () => boolean;
		/** Un guardado rechazado en el cliente: quien monta la ficha la hace visible (la fila plegada
		 *  de `RecordBlocks` se despliega) ANTES de que el foco vaya al primer campo con error. */
		onReveal?: () => void;
	}

	let {
		childType,
		blockType,
		rawBlockType,
		dataField,
		record,
		name,
		structuralFields,
		onSubmit,
		onSaved,
		onDirtyChange,
		onDraftChange = () => {},
		disabled = false,
		onBusyChange = () => {},
		onSaveError = () => {},
		textsOnly = false,
		locked = false,
		contextualHeader,
		fullFormHref,
		onInlineTakeover = () => {},
		contextualPlacement = 'top',
		beforeSave,
		onReveal = () => {}
	}: Props = $props();

	const ctx = getVegaContext();
	const EMPTY_ERRORS: FieldErrorsView = { byField: {}, record: null };
	const typed = untrack(() => dataField !== null);
	const settingsHref = settingsRoute();

	// Props de identidad estables durante la vida de una fila: `RecordBlocks` usa `{#each ... (id)}`
	// y remonta el componente si cambia el registro. Capturarlas evita que una recarga de la lista
	// pise un borrador vivo con el eco de otro cambio estructural.
	const initialRecord = untrack(() => $state.snapshot(record as unknown)) as VegaRecord;
	let baseline = untrack(() => buildFormModel(childType, initialRecord).baseline);
	let current = $state<FormInputValues>({ ...baseline });
	let persistedData = $state.raw<unknown>(
		untrack(() => (dataField === null ? null : initialRecord.values[dataField]))
	);
	let dataBaseline = untrack<BlockDataValues>(() =>
		blockType === null ? {} : readBlockData(blockType, persistedData)
	);
	let dataCurrent = $state.raw<BlockDataValues>({ ...dataBaseline });
	let clientErrors = $state<FieldErrorsView>(EMPTY_ERRORS);
	let backendErrors = $state<FieldErrorsView>(EMPTY_ERRORS);
	let saving = $state(false);

	// Edición concurrente (ver cabecera): versión del bloque que tiene delante esta ficha, los
	// valores COMPLETOS de los que sale (`baseValues`, para reconocer un cambio solo estructural) y
	// el conflicto vigente si el último guardado falló cerrado.
	let version = $state<RecordVersion>(recordVersion(initialRecord));
	let baseValues: Record<string, FieldValue> = initialRecord.values;
	let conflict = $state.raw<VegaConflictError | null>(null);

	untrack(() => setRecordIdentity({ type: childType.name, id: initialRecord.id }));
	// Ámbito de ids DOM (hallazgo p1, `field-scope.ts`, léase su cabecera): `initialRecord.id` ya
	// es la identidad ESTABLE de esta fila durante toda su vida (ver más arriba), así que namespacea
	// los ids de sus `FieldRow`/widgets sin que dos filas del mismo tipo de bloque puedan colisionar.
	setFieldScope(String(initialRecord.id));

	function isDataObject(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function rawDataText(value: unknown): string {
		const serialized = JSON.stringify(value, null, 2);
		return serialized === undefined ? String(value) : serialized;
	}

	function openSettings(event: MouseEvent): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		ctx.nav.toSettings();
	}

	type TypedField =
		| { kind: 'data'; field: ResolvedField }
		| { kind: 'record'; field: ResolvedField }
		| { kind: 'missing-record'; declaration: ResolvedBlockField };

	const typedFields = untrack<TypedField[]>(() => {
		if (blockType === null) return [];
		const dataFields = new Map(
			resolveBlockDataFields(blockType).map((field) => [field.name, field])
		);
		const recordFields = new Map(childType.fields.map((field) => [field.name, field]));

		const items: TypedField[] = [];
		for (const declaration of blockType.fields) {
			if (declaration.source === 'data') {
				const field = dataFields.get(declaration.name);
				if (field) items.push({ kind: 'data', field });
				continue;
			}
			const column = recordFields.get(declaration.name);
			if (column) {
				items.push({
					kind: 'record',
					// El schema/widget salen de la columna descubierta; el rótulo y el orden,
					// del tipo de bloque que dirige este formulario.
					field: {
						...column,
						label: declaration.label,
						...(declaration.relation && column.widget === 'relation'
							? {
									// Miniatura y filtro del selector: viajan en el `field` (ver `ResolvedField`).
									relationPicker: {
										thumbField: declaration.relation.thumbField,
										filter: buildRelationFilter(declaration.relation.filter)
									}
								}
							: {})
					}
				});
			} else {
				items.push({ kind: 'missing-record', declaration });
			}
		}
		return items;
	});

	const legacyFields = $derived(
		childType.fields.filter((field) => !field.hidden && !structuralFields.includes(field.name))
	);
	// `null` = columna JSON sin escribir: se trata como `{}` (ver cabecera). Solo un valor real que
	// no es objeto (texto, número, booleano, array) bloquea el bloque.
	const invalidData = $derived(
		typed && blockType !== null && persistedData !== null && !isDataObject(persistedData)
	);
	const recordDirty = $derived(isDirty(baseline, current));
	const dataDirty = $derived(
		typed &&
			blockType !== null &&
			!invalidData &&
			isDirty(dataBaseline as FormValues, dataCurrent as FormInputValues)
	);
	const dirty = $derived(
		typed ? blockType !== null && !invalidData && (recordDirty || dataDirty) : recordDirty
	);
	const inert = $derived(disabled || saving || invalidData || locked);

	// ————— Modo «solo textos» (ver cabecera) —————

	/** Un campo tipado cuenta como texto si existe de verdad y su widget es de texto; una columna
	 *  declarada que falta (`missing-record`) no se puede editar en ningún modo, así que va al resto. */
	function isTypedText(item: TypedField): boolean {
		return item.kind !== 'missing-record' && isTextWidget(item.field.widget);
	}

	/** Control con el que se pinta un campo: en «solo textos» el `markdown` va como `<textarea>`
	 *  con su fuente (`textsModeField`); nombre, valor y validación siguen siendo los del campo. */
	function shown(field: ResolvedField): ResolvedField {
		return textsOnly ? textsModeField(field) : field;
	}

	/** Lo que la ficha PINTA: en modo normal, todo; en «solo textos», solo los textos. */
	const visibleTypedFields = $derived(textsOnly ? typedFields.filter(isTypedText) : typedFields);
	const visibleLegacyFields = $derived(
		textsOnly ? legacyFields.filter((field) => isTextWidget(field.widget)) : legacyFields
	);
	/** Lo que «solo textos» cuenta y nombra sin editar (vacío fuera de ese modo). */
	const restLabels = $derived.by<string[]>(() => {
		if (!textsOnly) return [];
		if (typed) {
			return typedFields
				.filter((item) => !isTypedText(item))
				.map((item) =>
					item.kind === 'missing-record'
						? item.declaration.label
						: fieldDisplayLabel(item.field, ctx.t)
				);
		}
		return legacyFields
			.filter((field) => !isTextWidget(field.widget))
			.map((field) => fieldDisplayLabel(field, ctx.t));
	});
	const hasTexts = $derived(
		!textsOnly || (typed ? visibleTypedFields.length > 0 : visibleLegacyFields.length > 0)
	);

	const errors = $derived.by<FieldErrorsView>(() => {
		const dataColumnError: TranslatedError | null =
			dataField === null ? null : (backendErrors.byField[dataField] ?? null);
		return {
			byField: { ...clientErrors.byField, ...backendErrors.byField },
			record: backendErrors.record ?? dataColumnError ?? clientErrors.record
		};
	});

	/** Errores de campos que «solo textos» NO pinta (ver cabecera): se dicen en el banner, con la
	 *  etiqueta de cada campo, para que el botón «Guardar» nunca falle en silencio. */
	const hiddenErrorLabels = $derived.by<string[]>(() => {
		if (!textsOnly) return [];
		const visibleNames = new Set(visibleFieldNames);
		return Object.keys(errors.byField)
			.filter((fieldName) => !visibleNames.has(fieldName))
			.map(errorFieldLabel);
	});

	/** Nombres de los campos que la ficha PINTA ahora (todos, o solo los textos en «solo textos»). */
	const visibleFieldNames = $derived(
		typed
			? visibleTypedFields.flatMap((item) =>
					item.kind === 'missing-record' ? [] : [item.field.name]
				)
			: visibleLegacyFields.map((field) => field.name)
	);

	/** Rótulo de un campo con error, para los dos banners; sin campo que lo nombre, su nombre. */
	function errorFieldLabel(fieldName: string): string {
		const fields = typed
			? typedFields.flatMap((item) => (item.kind === 'missing-record' ? [] : [item.field]))
			: legacyFields;
		const match = fields.find((f) => f.name === fieldName);
		return match ? fieldDisplayLabel(match, ctx.t) : fieldName;
	}

	/** Resumen accesible de un guardado rechazado (ver `revealFirstError`): los campos con error
	 *  que la ficha pinta, en su orden. Los que no pinta los nombra `hiddenErrorLabels`. */
	const errorSummaryLabels = $derived.by<string[]>(() => {
		const visible = new Set(visibleFieldNames);
		return fieldOrder
			.filter((name) => name in errors.byField && visible.has(name))
			.map(errorFieldLabel);
	});

	$effect(() => {
		onDirtyChange(dirty);
	});

	/**
	 * Un cambio SOLO estructural del bloque que llega por `record` —el reorden de `blocks-state`,
	 * único escritor de la estructura, y con él el autodate `updated` si la colección lo tiene— no es
	 * una edición ajena: la ficha adopta la versión nueva sin tocar el borrador. Sin esto, mover un
	 * bloque en el árbol y editarlo después daría un conflicto falso atribuido a uno mismo. Cualquier
	 * otro cambio que llegue por `record` se ignora, como siempre (ver "Props de identidad
	 * estables"): si es de otra persona, el siguiente guardado fallará cerrado y lo enseñará el
	 * aviso. `diffRecordValues` ya deja fuera los `readonly` (autodate).
	 */
	$effect(() => {
		const incoming = record;
		untrack(() => {
			// `as unknown`: mismo truco que `initialRecord` (el tipo recursivo de `JsonValue` desborda
			// la instanciación de `Snapshot<>`).
			const incomingValues = $state.snapshot(incoming.values as unknown) as Record<
				string,
				FieldValue
			>;
			const incomingVersion = recordVersion({ values: incomingValues });
			if (incomingVersion === version) return;
			const onlyStructural = diffRecordValues(
				childType.fields.map((f) => f.schema),
				baseValues,
				incomingValues
			).every((d) => d.status === 'same' || structuralFields.includes(d.field));
			if (!onlyStructural) return;
			version = incomingVersion;
			baseValues = incomingValues;
		});
	});

	/** Reasienta la ficha entera sobre `rec` (lo que hay AHORA en el servidor). */
	function adoptRecord(rec: VegaRecord): void {
		baseline = buildFormModel(childType, rec).baseline;
		current = { ...baseline };
		if (typed && blockType !== null && dataField !== null) {
			persistedData = rec.values[dataField];
			dataBaseline = readBlockData(blockType, persistedData);
			dataCurrent = { ...dataBaseline };
		}
		version = recordVersion(rec);
		baseValues = rec.values;
		conflict = null;
		clientErrors = EMPTY_ERRORS;
		backendErrors = EMPTY_ERRORS;
	}

	// ————— Aviso de edición concurrente (ver cabecera) —————

	/** Columnas físicas que este formulario edita: las reclamadas por el tipo o las del modo legado. */
	const physicalFields = $derived(
		typed
			? typedFields.flatMap((item) => (item.kind === 'record' ? [item.field] : []))
			: legacyFields
	);
	const dataFields = $derived(
		typedFields.flatMap((item) => (item.kind === 'data' ? [item.field] : []))
	);
	const conflictFields = $derived([...physicalFields, ...dataFields]);

	/** Diff a tres bandas de columnas y, en modo tipado, de las claves de `data` por separado. */
	const conflictRows = $derived.by(() => {
		if (!conflict) return [];
		const server = conflict.serverRecord;
		const rows = threeWayDiff(
			physicalFields.map((f) => f.schema),
			baseline,
			toComparableValues(current),
			buildFormModel(childType, server).baseline
		);
		if (typed && blockType !== null && dataField !== null) {
			rows.push(
				...threeWayDiff(
					dataFields.map((f) => f.schema),
					dataBaseline as FormValues,
					toComparableValues(dataCurrent as FormInputValues),
					readBlockData(blockType, server.values[dataField]) as FormValues
				)
			);
		}
		return rows;
	});

	/**
	 * «Guardar igualmente»: solo lo tocado, con la versión del servidor como esperada. En modo
	 * tipado, las claves de `data` que tocaste se mezclan sobre el `data` DEL SERVIDOR
	 * (`touchedBlockData`), no sobre el que abriste: así una clave que cambió el otro y tú no se
	 * conserva, igual que una columna. Mismo contrato con `ConflictNotice` que `RecordForm`.
	 */
	async function forceSave(): Promise<void> {
		if (!conflict) return;
		const server = conflict.serverRecord;
		backendErrors = EMPTY_ERRORS;
		saving = true;
		try {
			const input = toRecordInput(childType, baseline, current);
			if (typed && blockType !== null && dataField !== null && dataDirty) {
				input[dataField] = writeBlockData(
					blockType,
					server.values[dataField],
					touchedBlockData(dataBaseline, dataCurrent)
				);
			}
			const saved = await onSubmit(input, { expectedVersion: conflict.serverVersion });
			adoptRecord(saved);
			onSaveError(false);
			onSaved(saved);
		} catch (err) {
			onSaveError(true);
			const vegaErr = err instanceof VegaError ? err : VegaError.backend('Error al guardar', err);
			if (isConflictError(vegaErr)) conflict = vegaErr;
			else if (isFieldValidationError(vegaErr)) backendErrors = mapFieldErrors(vegaErr);
			else throw vegaErr;
		} finally {
			saving = false;
		}
	}

	/**
	 * «Descartar y recargar»: relee el bloque y reasienta la ficha. Avisa al anfitrión por
	 * `onSaved` con el registro releído —no es un guardado, pero es lo que el anfitrión necesita para
	 * dejar de pintar la versión vieja (`blocks.handleBlockSaved`, la vista previa del lienzo).
	 */
	async function discardAndReload(): Promise<void> {
		try {
			const fresh = await ctx.port.get(childType.name, initialRecord.id);
			adoptRecord(fresh);
			onSaveError(false);
			onSaved(fresh);
		} catch (err) {
			const vegaErr = err instanceof VegaError ? err : VegaError.backend('Error al recargar', err);
			ctx.feedback.reportError(vegaErr, { action: 'block:reload' });
		}
	}

	$effect(() => {
		const fields: FormInputValues = { ...current };
		if (typed && blockType !== null && !invalidData && dataField !== null) {
			fields[dataField] = writeBlockData(blockType, persistedData, dataCurrent);
		}
		onDraftChange({ id: record.id, fields });
	});

	$effect(() => {
		onBusyChange(saving);
	});

	function clearFieldError(name: string): void {
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

	/** Cambio que viene de la FICHA (no del sitio): si ese campo se está escribiendo en la página,
	 *  la ficha gana y la sesión en línea termina conservando el borrador (ver `onInlineTakeover`). */
	function fromForm(name: string, apply: () => void): void {
		if (inlineField === name) onInlineTakeover(name);
		apply();
	}

	function handleRecordFieldChange(name: string, value: FieldInputValue): void {
		current = { ...current, [name]: value };
		clearFieldError(name);
	}

	function handleDataFieldChange(name: string, value: FieldInputValue): void {
		dataCurrent = { ...dataCurrent, [name]: value as BlockDataValues[string] };
		clearFieldError(name);
	}

	// Inline usa los mismos handlers que la ficha; el snapshot inicial conserva null y undefined.
	let inlineField = $state<string | null>(null);
	let inlineOriginal: FieldInputValue;
	let inlineSource: 'data' | 'record' = 'record';

	function inlineTarget(name: string) {
		if (
			inert ||
			!childType.permissions.update ||
			childType.readonly ||
			structuralFields.includes(name)
		)
			return null;
		const item = typed
			? typedFields.find((item) => item.kind !== 'missing-record' && item.field.name === name)
			: null;
		const field = typed
			? item && item.kind !== 'missing-record'
				? item.field
				: null
			: legacyFields.find((field) => field.name === name);
		if (!field || field.hidden || field.schema.readonly || !isPlainTextWidget(field.widget))
			return null;
		return { field, source: item?.kind === 'data' ? ('data' as const) : ('record' as const) };
	}

	/** Inicia una edición autorizada sin crear otro dueño del borrador. */
	export function beginInline(
		name: string
	): { widget: 'text' | 'textarea'; value: string; label: string } | null {
		const target = inlineTarget(name);
		if (!target || inlineField !== null) return null;
		inlineField = name;
		inlineSource = target.source;
		inlineOriginal = target.source === 'data' ? dataCurrent[name] : current[name];
		return {
			widget: target.field.widget as 'text' | 'textarea',
			label: target.field.label,
			value: String(inlineOriginal ?? '')
		};
	}

	/** Revalida permisos y campo en cada input, también si cambiaron durante la sesión. */
	export function updateInline(name: string, value: string): boolean {
		if (inlineField !== name || !inlineTarget(name)) return false;
		if (inlineSource === 'data') handleDataFieldChange(name, value);
		else handleRecordFieldChange(name, value);
		return true;
	}

	/** Commit conserva el borrador; cancelar restaura exactamente el valor anterior, sin guardar. */
	export function finishInline(cancel = false): void {
		if (inlineField === null) return;
		if (cancel) {
			if (inlineSource === 'data') handleDataFieldChange(inlineField, inlineOriginal);
			else handleRecordFieldChange(inlineField, inlineOriginal);
		}
		inlineField = null;
	}

	function validateTypedForm(): FieldErrorsView {
		const dataView = validateBlockData(blockType, dataCurrent);
		const physicalView = validateForm(childType, current);
		const claimedColumns = new Set(
			typedFields.flatMap((item) => (item.kind === 'record' ? [item.field.name] : []))
		);
		const byField = { ...dataView.byField };
		for (const [name, error] of Object.entries(physicalView.byField)) {
			if (claimedColumns.has(name)) byField[name] = error;
		}
		return { byField, record: dataView.record };
	}

	/** Raíz de la ficha: la validez nativa de SUS controles (`native-validity.ts`) y el destino del
	 *  foco al primer error. `data-vega-block-editor` la separa de los del registro padre. */
	let rootEl = $state<HTMLElement | undefined>(undefined);
	/** `true` mientras `handleSave` valida (la regla `markdown` carga su lexer bajo demanda). */
	let validating = false;

	/**
	 * Validación de cliente del guardado, la MISMA en el formulario clásico, el editor visual y
	 * «Solo textos» (QA de fodaveg, 21 oct 2026): obligatorios y opciones del tipo, validez nativa
	 * de los controles de esta ficha (un `type="email"`, el JSON a medio escribir) y la regla de los
	 * campos `markdown` CAMBIADOS (`markdown-safety.ts`). Hasta 0.14.0 esta ficha, que guarda con un
	 * botón y no con un `<form>`, ignoraba lo nativo: el editor visual guardaba el HTML que el
	 * campo marcaba en rojo. La validez nativa se lee ANTES de esperar a nada.
	 *
	 * Solo devuelve una promesa si hay un campo `markdown` cambiado que mirar: sin él, el guardado
	 * sigue en el mismo turno del clic (el botón pasa a «Guardando» en el acto, como hasta 0.14.0).
	 */
	function validateBeforeSave(): FieldErrorsView | Promise<FieldErrorsView> {
		const view = typed ? validateTypedForm() : validateForm(childType, current);
		const native = rootEl ? nativeFieldErrors(rootEl) : {};
		const checks = typed
			? [
					markdownSafetyErrors(physicalFields, baseline, current, ctx.t),
					markdownSafetyErrors(
						dataFields,
						dataBaseline as FormValues,
						dataCurrent as FormInputValues,
						ctx.t
					)
				]
			: [markdownSafetyErrors(legacyFields, baseline, current, ctx.t)];
		const merge = (markdown: readonly MarkdownSafetyErrors[]): FieldErrorsView => ({
			byField: Object.assign({}, ...markdown, native, view.byField),
			record: view.record
		});
		const settled = checks.filter((check) => !(check instanceof Promise));
		return settled.length === checks.length
			? merge(settled as MarkdownSafetyErrors[])
			: Promise.all(checks).then(merge);
	}

	/** Nombres de campo en el orden en que la ficha los pinta (tipados o del modo legado). */
	const fieldOrder = $derived(
		typed
			? typedFields.flatMap((item) => (item.kind === 'missing-record' ? [] : [item.field.name]))
			: legacyFields.map((field) => field.name)
	);

	/**
	 * Un guardado rechazado nunca se queda mudo: la ficha se hace visible (`onReveal`: la fila
	 * plegada se despliega), y el foco va al primer campo con error QUE SE PINTA, con el resumen
	 * (`editor.blocks.form.errorSummary`) anunciado como alerta. Un error de un campo que «Solo
	 * textos» no pinta lo dice su propio banner (`hiddenErrorLabels`).
	 *
	 * El `import()` de `focus-target` puede resolverse una tarea después, cuando el error ya se ve:
	 * si para entonces el foco se ha movido (quien edita saltó a otra sección con «Ir a sección»),
	 * no se le roba — mismo criterio que `focusField` de `RecordForm`. Con `focus = false` (el
	 * Guardar de la página ya llevó el foco a otra sección rechazada antes) solo se despliega.
	 */
	async function revealFirstError(view: FieldErrorsView, focus: boolean): Promise<void> {
		onReveal();
		if (!focus) return;
		await tick();
		const visible = new Set(visibleFieldNames);
		const first = fieldOrder.find((name) => name in view.byField && visible.has(name));
		if (!first || !rootEl) return;
		const origin = document.activeElement;
		const { resolveFocusTarget } = await import('./focus-target');
		if (!rootEl || document.activeElement !== origin) return;
		const target = resolveFocusTarget(rootEl, first, String(initialRecord.id));
		target?.focus();
		target?.scrollIntoView?.({ block: 'center' });
	}

	/** Guarda la ficha. `saved`: escrita y reasentada; `rejected`: no se escribió (error de campo,
	 *  conflicto o fallo) y la ficha lo dice; `idle`: nada que guardar ahora, o lo guarda otro
	 *  dueño (`beforeSave`). `focus` decide si un rechazo de cliente se lleva el foco. */
	async function handleSave(focus = true): Promise<BlockSaveResult> {
		if (saving || validating || disabled || invalidData || (typed && blockType === null) || !dirty)
			return 'idle';
		if (beforeSave?.()) return 'idle';

		onSaveError(false);
		const validation = validateBeforeSave();
		let clientView: FieldErrorsView;
		if (validation instanceof Promise) {
			validating = true;
			try {
				clientView = await validation;
			} finally {
				validating = false;
			}
		} else {
			clientView = validation;
		}
		clientErrors = clientView;
		if (Object.keys(clientView.byField).length > 0 || clientView.record) {
			onSaveError(true);
			await revealFirstError(clientView, focus);
			return 'rejected';
		}

		backendErrors = EMPTY_ERRORS;
		saving = true;
		let result: BlockSaveResult = 'rejected';
		try {
			const input = toRecordInput(childType, baseline, current);
			if (typed && blockType !== null && dataField !== null && dataDirty) {
				// ÚNICA escritura de `data`: parte del objeto persistido, de modo que las claves
				// shadowed y orphaned sobreviven por separado aunque el formulario no las pinte.
				input[dataField] = writeBlockData(blockType, persistedData, dataCurrent);
			}
			// Con la versión que esta ficha tiene delante: si alguien guardó el bloque entre medias,
			// falla cerrado y se abre el aviso (ver cabecera, "Edición concurrente").
			const saved = await onSubmit(input, { expectedVersion: version });

			adoptRecord(saved);
			onSaveError(false);
			onSaved(saved);
			result = 'saved';
		} catch (err) {
			onSaveError(true);
			const vegaErr = err instanceof VegaError ? err : VegaError.backend('Error al guardar', err);
			if (isConflictError(vegaErr)) {
				conflict = vegaErr;
			} else if (isFieldValidationError(vegaErr)) {
				backendErrors = mapFieldErrors(vegaErr);
			} else {
				ctx.feedback.reportError(vegaErr, { action: 'block:save' });
			}
		} finally {
			saving = false;
			await tick();
		}
		return result;
	}

	/**
	 * Handle de guardado desde FUERA de la ficha: el atajo ⌘S/Ctrl+S del editor visual
	 * (`VisualInspector.svelte#saveSelected`) y el «Guardar» / ⌘S del formulario de la página
	 * (`RecordBlocks.svelte#saveDirty`, QA de fodaveg del 21 oct 2026: hasta entonces guardaba solo
	 * la página). Este componente no renderiza un `<form>` (su guardado es un `<button
	 * type="button">`, más abajo), así que el truco de `formEl.requestSubmit()` no sirve aquí. Misma
	 * guarda EXACTA que el atributo `disabled` del botón "Guardar" de más abajo — si el botón está
	 * deshabilitado, este handle tampoco hace nada (`idle`). `focus: false` deja el foco donde está
	 * si el guardado se rechaza (otra ficha rechazada antes ya se lo llevó).
	 */
	export function save(options: { focus?: boolean } = {}): Promise<BlockSaveResult> {
		if (inert || !dirty || (typed && blockType === null)) return Promise.resolve('idle');
		return handleSave(options.focus ?? true);
	}

	/** Lleva el foco al primer campo con error de un guardado ya rechazado con `focus: false`: el
	 *  ⌘S del editor visual guarda todas las fichas y, al terminar, enseña la primera rechazada. */
	export function revealErrors(): Promise<void> {
		return revealFirstError(errors, true);
	}

	/**
	 * «Descartar» del inspector visual: vuelve al último estado GUARDADO de esta ficha, sin tocar el
	 * servidor (no relee; para eso está «Descartar y recargar» del aviso de conflicto). Una edición en
	 * línea abierta sobre esta ficha se cierra antes (`onInlineTakeover`), para que ningún `input`
	 * tardío del sitio reescriba el borrador recién descartado.
	 */
	export function discard(): void {
		if (saving || !dirty) return;
		if (inlineField !== null) onInlineTakeover(inlineField);
		current = { ...baseline };
		dataCurrent = { ...dataBaseline };
		clientErrors = EMPTY_ERRORS;
		backendErrors = EMPTY_ERRORS;
		onSaveError(false);
	}
</script>

{#snippet contextual()}
	{#if contextualHeader}
		{@render contextualHeader(
			name ?? blockType?.label ?? childType.label,
			ctx.t(
				saving
					? 'editor.saving'
					: conflict
						? 'editor.conflict.topbar'
						: errors.record
							? 'editor.conflict.error.title'
							: Object.keys(errors.byField).length > 0
								? 'editor.blocks.form.reviewFields'
								: dirty
									? 'editor.visual.pending.title'
									: 'editor.noLocalChanges'
			),
			hasTexts && !locked && (!typed || blockType !== null) ? saveButton : undefined,
			record.id,
			dirty && !saving
		)}
	{/if}
{/snippet}

{#snippet saveButton()}
	<button
		type="button"
		class="vega-block-save-button"
		disabled={inert || !dirty || (typed && blockType === null)}
		onclick={() => void handleSave()}
	>
		{saving ? ctx.t('editor.saving') : ctx.t('editor.save')}
	</button>
{/snippet}

<div
	class="vega-block-fields"
	class:vega-block-fields--texts={textsOnly}
	bind:this={rootEl}
	data-vega-block-editor
>
	{#if contextualPlacement === 'top'}{@render contextual()}{/if}
	{#if typed && blockType === null}
		<section class="vega-block-readonly" role="status">
			<p>
				{rawBlockType
					? ctx.t('editor.blocks.form.unknownType', { name: rawBlockType })
					: ctx.t('editor.blocks.form.noType')}
			</p>
			<!-- La URL real conserva abrir en pestaña nueva; el clic ordinario usa el NavApi del shell. -->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={settingsHref} class="vega-block-settings-link" onclick={openSettings}>
				{ctx.t('editor.blocks.form.openSettings')}
			</a>
			{#if dataField !== null}
				<div class="vega-block-raw">
					<strong>{ctx.t('editor.blocks.form.rawData', { field: dataField })}</strong>
					<pre>{rawDataText(persistedData)}</pre>
				</div>
			{/if}
		</section>
	{:else}
		{#if conflict}
			<ConflictNotice
				variant="narrow"
				name={name ?? blockType?.label ?? childType.label}
				fields={conflictFields}
				rows={conflictRows}
				collection={childType.name}
				recordId={initialRecord.id}
				openedVersion={version}
				serverVersion={conflict.serverVersion}
				fallbackAt={autodateInstant(childType, conflict.serverRecord.values, 'updated')}
				onDiscard={discardAndReload}
				onForce={forceSave}
			/>
		{/if}
		{#if errors.record}
			<p class="vega-block-banner" role="alert">{fieldErrorMessage(ctx.t, errors.record)}</p>
		{/if}
		{#if errorSummaryLabels.length > 0}
			<!-- Resumen accesible (ver `revealFirstError`): qué impide guardar, con el nombre de cada
			     campo; el foco ya está en el primero. -->
			<p class="vega-block-banner" role="alert">
				{ctx.t('editor.blocks.form.errorSummary', { fields: errorSummaryLabels.join(', ') })}
			</p>
		{/if}
		{#if hiddenErrorLabels.length > 0}
			<!-- «Solo textos» (ver cabecera): el error vive en un campo que esta presentación no
			     pinta, así que se dice aquí con su nombre en vez de dejar el botón mudo. -->
			<p class="vega-block-banner" role="alert">
				{ctx.t('editor.visual.texts.hiddenErrors', { fields: hiddenErrorLabels.join(', ') })}
			</p>
		{/if}

		{#if invalidData && dataField !== null}
			<section class="vega-block-readonly vega-block-readonly--danger" role="alert">
				<p>{ctx.t('editor.blocks.form.invalidData', { field: dataField })}</p>
				<div class="vega-block-raw">
					<strong>{ctx.t('editor.blocks.form.rawData', { field: dataField })}</strong>
					<pre>{rawDataText(persistedData)}</pre>
				</div>
			</section>
		{/if}

		{#if !hasTexts}
			<!-- «Solo textos» sobre una sección sin ningún texto (lámina 8.2): se lista igual, en su
			     sitio, para que el orden de la página se reconozca; sin campos y sin «Guardar». -->
			<p class="vega-block-rest">{ctx.t('editor.visual.texts.none')}</p>
		{:else if typed}
			{#each visibleTypedFields as item (item.kind === 'missing-record' ? item.declaration.name : item.field.name)}
				{#if item.kind === 'missing-record'}
					<div
						class="vega-block-missing-field"
						data-field={item.declaration.name}
						data-widget={item.declaration.widget}
					>
						<label for={`vega-block-missing-${record.id}-${item.declaration.name}`}>
							{item.declaration.label}
						</label>
						<input
							id={`vega-block-missing-${record.id}-${item.declaration.name}`}
							type="text"
							disabled
							aria-describedby={`vega-block-missing-help-${record.id}-${item.declaration.name}`}
						/>
						<p id={`vega-block-missing-help-${record.id}-${item.declaration.name}`}>
							{ctx.t('editor.blocks.form.missingRecordField', {
								field: item.declaration.name
							})}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href={settingsHref} class="vega-block-settings-link" onclick={openSettings}>
								{ctx.t('editor.blocks.form.openSettings')}
							</a>
						</p>
					</div>
				{:else if item.kind === 'data'}
					<FieldRow
						field={shown(item.field)}
						value={dataCurrent[item.field.name]}
						error={errors.byField[item.field.name] ?? null}
						disabled={inert}
						inlineActive={inlineField === item.field.name}
						typeReadonly={false}
						stacked
						onChange={(value) =>
							fromForm(item.field.name, () => handleDataFieldChange(item.field.name, value))}
					/>
				{:else}
					<FieldRow
						field={shown(item.field)}
						value={current[item.field.name]}
						error={errors.byField[item.field.name] ?? null}
						disabled={inert || structuralFields.includes(item.field.name)}
						inlineActive={inlineField === item.field.name}
						typeReadonly={false}
						stacked
						onChange={(value) =>
							fromForm(item.field.name, () => handleRecordFieldChange(item.field.name, value))}
					/>
				{/if}
			{/each}
		{:else}
			{#each visibleLegacyFields as field (field.name)}
				<FieldRow
					field={shown(field)}
					value={current[field.name]}
					error={errors.byField[field.name] ?? null}
					disabled={inert}
					inlineActive={inlineField === field.name}
					typeReadonly={false}
					stacked
					onChange={(value) =>
						fromForm(field.name, () => handleRecordFieldChange(field.name, value))}
				/>
			{/each}
		{/if}

		{#if hasTexts && restLabels.length > 0}
			<!-- «Solo textos» (lámina 8.1): se dice que hay más, con sus nombres, para que nadie crea
			     que la sección es solo esto. -->
			<p class="vega-block-rest">
				{ctx.t(
					restLabels.length === 1
						? 'editor.visual.texts.rest.one'
						: 'editor.visual.texts.rest.many',
					{ count: restLabels.length, fields: restLabels.join(', ') }
				)}
			</p>
		{/if}

		{#if textsOnly && fullFormHref && (!hasTexts || restLabels.length > 0)}
			<p class="vega-block-rest">
				<!-- Ruta real del registro padre: la guarda de salida del editor decide si se abandona. -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a class="vega-block-full-form" href={fullFormHref}>{ctx.t('editor.visual.texts.form')}</a>
				{#if dirty}
					{ctx.t('editor.visual.texts.formGuard')}{/if}
			</p>
		{/if}

		{#if hasTexts && !locked && !contextualHeader}
			<div class="vega-block-actions">{@render saveButton()}</div>
		{/if}
	{/if}
	{#if contextualPlacement === 'bottom'}{@render contextual()}{/if}
</div>

<style>
	.vega-block-fields {
		display: flex;
		flex-direction: column;
		gap: var(--gap-field);
		min-width: 0;
	}

	/* «Solo textos»: un cuerpo Markdown se escribe aquí entero, así que el `<textarea>` crece con su
	   texto (donde el navegador sabe, `field-sizing`) y empieza alto donde no. */
	.vega-block-fields--texts :global(textarea) {
		field-sizing: content;
		min-height: 5lh;
		max-height: 70vh;
	}

	.vega-block-banner,
	.vega-block-readonly {
		margin: 0;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}

	.vega-block-banner,
	.vega-block-readonly--danger {
		border-color: var(--danger);
		background: var(--danger-soft);
		color: var(--danger);
	}

	.vega-block-readonly p {
		margin: 0;
	}

	.vega-block-settings-link {
		display: inline-block;
		margin-top: 0.35rem;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		font-weight: 650;
		text-decoration: underline;
		cursor: pointer;
	}

	.vega-block-raw {
		margin-top: 0.75rem;
	}

	.vega-block-raw strong {
		display: block;
		margin-bottom: 0.3rem;
		font-size: 0.78rem;
	}

	.vega-block-raw pre {
		max-height: 14rem;
		margin: 0;
		padding: 0.6rem;
		overflow: auto;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--surface);
		color: var(--ink);
		font-family: var(--mono);
		font-size: 0.78rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.vega-block-missing-field {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.vega-block-missing-field label {
		margin-bottom: 0.35rem;
		color: var(--ink-2);
		font-size: 0.82em;
		font-weight: 650;
		letter-spacing: 0.03em;
		overflow-wrap: anywhere;
	}

	.vega-block-missing-field input {
		width: 100%;
		min-height: 2.25rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface-2);
		opacity: 0.65;
	}

	.vega-block-missing-field p {
		margin: 0.3rem 0 0;
		color: var(--warning);
		font-size: 0.82em;
		overflow-wrap: anywhere;
	}

	/* Lo que «solo textos» no enseña (lámina 8, `.vega-visual-texts-rest`): tipografía de
	   `.vega-field-help` (`FieldRow.svelte`), sin caja — es una nota, no un aviso. */
	.vega-block-rest {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.82em;
		overflow-wrap: anywhere;
	}

	.vega-block-actions {
		display: flex;
		justify-content: flex-end;
	}

	.vega-block-save-button {
		height: 30px;
		padding: 0 0.8rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		font-size: 0.8em;
		font-weight: 600;
		cursor: pointer;
	}

	.vega-block-save-button:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-block-save-button:focus-visible,
	.vega-block-settings-link:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.vega-block-full-form {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--ink);
	}

	.vega-block-full-form:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.vega-block-save-button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	@media (pointer: coarse) {
		.vega-block-save-button {
			min-height: 44px;
		}
	}
</style>
