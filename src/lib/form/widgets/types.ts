/**
 * Contrato de widget (D-P5.1 del contrato P5, L-P5.2): la interfaz ÚNICA que implementan los 15
 * componentes del field registry (`registry.ts`). Controlado (opción (a) de D-P5.1): el
 * `RecordForm` es la única fuente de verdad del valor — necesario para el dirty tracking
 * (L-P5.6, `dirty.ts`) y `to-record-input.ts`. Nunca `$bindable` ni un "field controller" propio
 * del widget.
 */

import type { Component } from 'svelte';
import type { ResolvedField } from '$lib/model/types';
import type { FieldInputValue } from '$lib/backend/types';
import type { TranslatedError } from '../field-errors';

export interface WidgetProps {
	/** El `ResolvedField` INTACTO: el widget lee `schema`/`label`/`placeholder`/`help` de aquí,
	 *  nunca los redefine (P5 "consume, no descubre"). */
	field: ResolvedField;
	/** Valor controlado actual. Puede ser un `File` pendiente (o mezclado en un array) en campos
	 *  `file`: el vocabulario completo de `FieldInputValue`, no solo `FieldValue`. */
	value: FieldInputValue;
	/** Error traducible del campo, o `null` si no hay ninguno — la fusión cliente+backend ya la
	 *  resolvió `RecordForm` (L-P5.4), el widget solo lo pinta (típicamente `aria-invalid`). */
	error: TranslatedError | null;
	/** `true` mientras el formulario guarda (L-P5.2, estado "loading"): el widget deja de aceptar
	 *  cambios sin necesitar un estado de widget separado. */
	disabled: boolean;
	/** `field.schema.readonly` (autodate) O `contentType.readonly` (view, L-P5.2) — ya combinados
	 *  por `FieldRow`. Un widget readonly NUNCA llama a `onChange`. */
	readonly: boolean;
	/** Notifica el nuevo valor. Un widget readonly nunca la invoca. */
	onChange: (value: FieldInputValue) => void;
}

/** Componente Svelte que implementa `WidgetProps`: la forma que exige `WIDGET_REGISTRY`. */
export type WidgetComponent = Component<WidgetProps>;
