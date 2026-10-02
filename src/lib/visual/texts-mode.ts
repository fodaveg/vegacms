/**
 * Modo «solo textos» del editor visual (Lote 12, lámina 8): por debajo del punto de corte del
 * lienzo (`VisualEditorScreen.svelte#NARROW_QUERY`, 900 px), la pantalla deja de ser una salida
 * («no cabe, vuelve al formulario») y enseña las secciones de la página con SOLO sus campos de
 * texto, cada una con su «Guardar». Sirve para lo que se hace desde un móvil: corregir una errata o
 * cambiar un titular.
 *
 * Este módulo es la ÚNICA definición de «qué cuenta como texto» (decisión 5 del README del lote,
 * confirmada en el encargo): los campos de una línea (`text`) y los de varias (`textarea`). El
 * texto con formato (`markdown`/`richtext`) queda FUERA a propósito: su editor no cabe ni tiene
 * sentido en 390 px, así que se cuenta y se nombra entre «lo demás», y el aviso de la sección dice
 * dónde se edita (una pantalla ancha o el formulario). Lo mismo para imágenes, relaciones,
 * selectores, interruptores, números, fechas, correos, direcciones y datos en bruto.
 *
 * Puro, sin Svelte, para probarlo sin montar nada (mismo criterio que `visual-gate.ts`): quien lo
 * consume (`BlockEditor.svelte` con `textsOnly`) solo necesita separar su lista de campos en dos.
 */
import type { WidgetId } from '$lib/model/types';

/** Los `WidgetId` que este modo edita. Lista cerrada: ampliarla es una decisión de producto. */
export const TEXT_WIDGETS: readonly WidgetId[] = ['text', 'textarea'];

export function isTextWidget(widget: WidgetId): boolean {
	return TEXT_WIDGETS.includes(widget);
}

export interface TextsSplit<T> {
	/** Lo que el modo enseña y deja editar, en el orden original. */
	texts: T[];
	/** Lo que el modo cuenta y nombra pero NO edita, en el orden original. */
	rest: T[];
}

/** Reparte `fields` conservando el orden: los de texto a `texts`, el resto a `rest`. */
export function splitTextFields<T extends { widget: WidgetId }>(
	fields: readonly T[]
): TextsSplit<T> {
	const texts: T[] = [];
	const rest: T[] = [];
	for (const field of fields) (isTextWidget(field.widget) ? texts : rest).push(field);
	return { texts, rest };
}
