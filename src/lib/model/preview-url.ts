/**
 * `previewUrl` (§4.7 del contrato P2): validación de placeholders en resolución y sustitución
 * en runtime (`buildPreviewUrl`, parte de la API pública de P2, §2). Módulo PURO.
 */

import type { Field, VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType } from './types';

const PLACEHOLDER_RE = /\{([^{}]*)\}/g;

/**
 * "Escalar" en el sentido de §4.7: puede sustituirse tal cual como segmento de URL.
 * Deliberadamente MÁS estrecho que `isScalarField` de `query.ts` (que también admite `bool`
 * y `richtext`): aquí solo entra lo que tiene sentido pintado en una URL de un sitio.
 */
function isPreviewScalarField(field: Field): boolean {
	switch (field.type) {
		case 'text':
		case 'email':
		case 'url':
		case 'number':
		case 'date':
			return true;
		case 'select':
			return !field.multiple;
		default:
			return false;
	}
}

/**
 * `true` si todo placeholder `{x}` de `template` es `{id}` o `{<campo>}` con un campo
 * existente y escalar (§4.7). Pura; no sustituye valores.
 */
export function validatePreviewUrlPlaceholders(
	template: string,
	fields: readonly Field[]
): boolean {
	const byName = new Map(fields.map((f) => [f.name, f]));
	for (const match of template.matchAll(PLACEHOLDER_RE)) {
		const name = match[1];
		if (name === 'id') continue;
		const field = byName.get(name);
		if (!field || !isPreviewScalarField(field)) return false;
	}
	return true;
}

/**
 * Sustituye los placeholders de `type.previewUrl` con los valores de `record` (§2, §4.7):
 * `encodeURIComponent` por valor; `null` si la plantilla es `null` o algún placeholder
 * resuelve a vacío (`null`/`undefined`/`''`) — mejor sin botón que un botón roto. Pura.
 */
export function buildPreviewUrl(type: ResolvedContentType, record: VegaRecord): string | null {
	if (type.previewUrl === null) return null;

	let allResolved = true;
	const result = type.previewUrl.replace(PLACEHOLDER_RE, (_match, name: string) => {
		const raw = name === 'id' ? record.id : record.values[name];
		if (raw === null || raw === undefined || raw === '') {
			allResolved = false;
			return '';
		}
		return encodeURIComponent(String(raw));
	});

	return allResolved ? result : null;
}
