/**
 * Modo «solo textos» del editor visual (Lote 12, lámina 8): por debajo del punto de corte del
 * lienzo (`VisualEditorScreen.svelte#NARROW_QUERY`, 900 px), la pantalla deja de ser una salida
 * («no cabe, vuelve al formulario») y enseña las secciones de la página con SOLO sus campos de
 * texto, cada una con su «Guardar». Sirve para lo que se hace desde un móvil: corregir una errata,
 * cambiar un titular o el cuerpo de una página.
 *
 * Este módulo es la ÚNICA definición de «qué cuenta como texto» (decisión 5 del README del lote,
 * ampliada el 21 oct 2026): los campos de una línea (`text`), los de varias (`textarea`) y el
 * Markdown (`markdown`). El Markdown entra como su TEXTO FUENTE en un `<textarea>` plano, sin la
 * barra de formato ni la vista previa, que no caben en 390 px (`textsModeField`): sin él, el
 * cuerpo de una página como «Sobre mí» no se podía tocar desde el teléfono. Lo que se escribe ahí
 * pasa por la MISMA regla de guardado que en el formulario y en el editor visual
 * (`form/markdown-safety.ts`). El `richtext` sigue FUERA: su valor es HTML, no un texto que se
 * pueda editar a mano sin su editor. Se cuenta y se nombra entre «lo demás», igual que imágenes,
 * relaciones, selectores, interruptores, números, fechas, correos, direcciones y datos en bruto.
 *
 * La edición EN LA PÁGINA (escribir sobre el lienzo) es otra cosa y sigue limitada a texto plano
 * (`isPlainTextWidget`): un `markdown` pintado por el sitio no es su fuente.
 *
 * Puro, sin Svelte, para probarlo sin montar nada (mismo criterio que `visual-gate.ts`): quien lo
 * consume (`BlockEditor.svelte` con `textsOnly`) solo necesita separar su lista de campos en dos.
 */
import type { WidgetId } from '$lib/model/types';

/** Los `WidgetId` que este modo edita. Lista cerrada: ampliarla es una decisión de producto. */
export const TEXT_WIDGETS: readonly WidgetId[] = ['text', 'textarea', 'markdown'];

export function isTextWidget(widget: WidgetId): boolean {
	return TEXT_WIDGETS.includes(widget);
}

/** Texto plano de verdad (`text`/`textarea`): lo único que se escribe EN la página. */
export function isPlainTextWidget(widget: WidgetId): boolean {
	return widget === 'text' || widget === 'textarea';
}

/** Cómo pinta este modo un campo: el `markdown` como `textarea` con su fuente (ver cabecera);
 *  el resto, tal cual. Solo cambia el control: nombre, valor y validación son los del campo. */
export function textsModeField<T extends { widget: WidgetId }>(field: T): T {
	return field.widget === 'markdown' ? { ...field, widget: 'textarea' } : field;
}

interface TextsSplit<T> {
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
