/** Contrato mínimo del propietario del borrador. Nunca recibe snapshots ni persiste por input. */
export interface InlineEditor {
	/** `BlockEditor#save`: `focus: false` no mueve el foco si se rechaza (ver `revealErrors`). */
	save(options?: { focus?: boolean }): Promise<'saved' | 'rejected' | 'idle'>;
	/** Lleva el foco al primer campo con error tras un rechazo con `focus: false`. */
	revealErrors(): Promise<void>;
	discard(): void;
	/** Con `source`, un rango de un campo `markdown` (ver `InlineSource`); `'stale'` si el borrador
	 *  ya no es el texto del que salió el rango. */
	beginInline(field: string, source?: InlineSource): InlineRequest | 'stale' | null;
	updateInline(field: string, value: string): boolean;
	finishInline(cancel?: boolean): void;
}

export const INLINE_PROTOCOL = 'vega-visual-2';
export interface InlineIdentity {
	sessionId: string;
	documentId: string;
	editId: string;
	collection: string;
	id: string;
	/** Bloque del campo; ausente en un campo del registro de la página (`scope: 'record'`). */
	blockId?: string;
	/** `'record'` en un campo del propio registro (§"Record fields" del contrato); ausente en uno
	 *  de bloque, como antes de existir, para que un sitio viejo vea la identidad de siempre. */
	scope?: 'record';
	field: string;
}
export interface InlineRequest {
	label?: string;
	widget: 'text' | 'textarea';
	value: string;
}

/** Rango del fuente de un campo `markdown` que pintó un elemento (§"Markdown source ranges" del
 *  contrato): `[start, end)` en unidades UTF-16 del valor guardado, y la huella del valor entero
 *  del que se calculó (`sourceDigest`). */
export interface InlineSource {
	start: number;
	end: number;
	digest: string;
}

/** `select.source` del sitio, o `null` si no tiene la forma del contrato. */
export function parseInlineSource(value: unknown): InlineSource | null {
	if (typeof value !== 'object' || value === null) return null;
	const { start, end, digest } = value as Record<string, unknown>;
	return Number.isSafeInteger(start) &&
		Number.isSafeInteger(end) &&
		(start as number) >= 0 &&
		(start as number) <= (end as number) &&
		typeof digest === 'string' &&
		/^v1:\d{1,9}:[0-9a-f]{8}$/.test(digest)
		? { start: start as number, end: end as number, digest }
		: null;
}

export { sourceDigest } from './source-digest';

/** Lo que anuncia `editable` (§"Record fields, Markdown source ranges and the edit hint"). */
export interface InlineTargets {
	hint: string;
	appearance?: { outline: string };
	record: string[];
	blocks: Record<string, string[]>;
	sources: Record<string, string[]>;
}

/** Colores de la pista de edición que Vega manda al sitio en `editField.appearance` (§"Inline
 *  editing" del contrato): el sitio no conoce los tokens de Vega. Sin ellos usa su valor por
 *  defecto documentado. */
export interface InlineAppearance {
	outline: string;
	soft: string;
}

/** Lo que va en `editField.appearance`: los colores cuando el tema los da y, siempre, el hueco
 *  (`hintSpace`, px de la página) que el sitio deja bajo el texto para la pista de Vega. */
export type InlineAppearanceMessage = Partial<InlineAppearance> & { hintSpace?: number };

/** Caja del campo que se escribe, en coordenadas del documento del marco (las mismas que
 *  `VisualBlock.rect`). La manda el sitio en cada `input` para colocar la pista debajo. */
export interface InlineRect {
	top: number;
	left: number;
	width: number;
	height: number;
}

/** `rect` de un `input`, o `null` si falta o no es una caja finita: es opcional y un sitio que no
 *  lo manda sigue funcionando (la pista se coloca bajo el borde superior del bloque). */
export function parseInlineRect(value: unknown): InlineRect | null {
	if (typeof value !== 'object' || value === null) return null;
	const { top, left, width, height } = value as Record<string, unknown>;
	const nums = [top, left, width, height];
	return nums.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
		(width as number) >= 0 &&
		(height as number) >= 0
		? { top: top as number, left: left as number, width: width as number, height: height as number }
		: null;
}

/** Valida identidad completa y secuencia antes de delegar al dueño del formulario. */
export function matchesInline(message: Record<string, unknown>, identity: InlineIdentity): boolean {
	return Object.entries(identity).every(([key, value]) => message[key] === value);
}

/** Nombre simple del manifiesto; nunca interpreta una ruta, selector o clave heredada. */
export function isInlineField(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value) &&
		!['__proto__', 'prototype', 'constructor'].includes(value)
	);
}
