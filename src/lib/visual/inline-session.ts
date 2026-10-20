/** Contrato mínimo del propietario del borrador. Nunca recibe snapshots ni persiste por input. */
export interface InlineEditor {
	save(): void;
	beginInline(field: string): { widget: 'text' | 'textarea'; value: string; label?: string } | null;
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
	blockId: string;
	field: string;
}
export interface InlineRequest {
	label?: string;
	widget: 'text' | 'textarea';
	value: string;
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
