/** Borradores de esquema compartidos por el editor y el asistente de formularios. */
import type { CollectionFieldSpec } from '$lib/backend';
import { IMAGE_FIELD_TARGET } from '$lib/backend';

export type DraftFieldType =
	| 'text'
	| 'editor'
	| 'url'
	| 'email'
	| 'image'
	| 'number'
	| 'bool'
	| 'date'
	| 'json'
	| 'select'
	| 'relation';

/** Tipos de borrador que admiten la casilla «No se puede repetir» (`unique`). */
export const UNIQUE_DRAFT_TYPES: readonly DraftFieldType[] = ['text', 'url', 'email'];
export type RelationDeleteMode = 'unlink' | 'cascade';

/** Una fila de la lista de opciones de un campo `select` en edición. `id` estable para
 *  `{#each ... (draft.id)}` — sin él, reordenar/quitar filas reasigna el foco a la fila
 *  equivocada. */
export interface SelectOptionDraft {
	id: string;
	value: string;
}

export function newSelectOptionDraft(): SelectOptionDraft {
	return { id: crypto.randomUUID(), value: '' };
}

export interface FieldDraft {
	id: string;
	name: string;
	type: DraftFieldType;
	required: boolean;
	/** Solo se usa para `type === 'text'`: cadena cruda del input, `''` = sin límite. */
	max: string;
	/** Solo para `text`/`url`/`email` (`UNIQUE_DRAFT_TYPES`): índice único sobre el campo. */
	unique: boolean;
	/** Solo para `relation`: nombre de una colección presente en `types`. */
	relationTarget: string;
	relationMultiple: boolean;
	relationDeleteMode: RelationDeleteMode;
	/** Solo para `select`: opciones en edición, en el orden final del spec. */
	selectOptions: SelectOptionDraft[];
	/** Solo para `select`: `true` compila a `multiple: true` (§`collections.ts`, `maxSelect: 99`
	 *  en el adaptador/migración), `false` a selección simple. */
	selectMultiple: boolean;
}

export function newFieldDraft(): FieldDraft {
	return {
		id: crypto.randomUUID(),
		name: '',
		type: 'text',
		required: false,
		max: '',
		unique: false,
		relationTarget: '',
		relationMultiple: false,
		relationDeleteMode: 'unlink',
		selectOptions: [newSelectOptionDraft()],
		selectMultiple: false
	};
}

/** Análisis de las opciones de un `select` en edición: cuántas opciones ÚNICAS no vacías
 *  quedan (tras recortar espacios) y qué filas repiten el valor de una anterior — mismas
 *  reglas que `checkCollectionFieldSpecs` (`collections.ts`): vacía se descarta en silencio,
 *  repetida (comparando el string recortado, distinguiendo mayúsculas) se marca por fila. */
export function analyzeSelectOptions(options: SelectOptionDraft[]): {
	uniqueCount: number;
	duplicateIds: Set<string>;
} {
	// Conjuntos locales: el análisis no introduce estado reactivo compartido.
	const seen = new Set<string>();
	const duplicateIds = new Set<string>();
	let uniqueCount = 0;
	for (const option of options) {
		const value = option.value.trim();
		if (!value) continue;
		if (seen.has(value)) {
			duplicateIds.add(option.id);
			continue;
		}
		seen.add(value);
		uniqueCount++;
	}
	return { uniqueCount, duplicateIds };
}

export function selectOptionsValid(options: SelectOptionDraft[]): boolean {
	const { uniqueCount, duplicateIds } = analyzeSelectOptions(options);
	return uniqueCount > 0 && duplicateIds.size === 0;
}

/** `null` si la fila no tiene nombre (fila en blanco descartada al enviar, nunca un error). */
export function draftToSpec(draft: FieldDraft): CollectionFieldSpec | null {
	const name = draft.name.trim();
	if (!name) return null;
	switch (draft.type) {
		case 'text': {
			const max = Number(draft.max);
			return {
				name,
				type: 'text',
				required: draft.required,
				max: Number.isFinite(max) && max > 0 ? max : undefined,
				...(draft.unique ? { unique: true as const } : {})
			};
		}
		case 'editor':
			return { name, type: 'editor', required: draft.required };
		case 'url':
			return {
				name,
				type: 'url',
				required: draft.required,
				...(draft.unique ? { unique: true as const } : {})
			};
		case 'email':
			return {
				name,
				type: 'email',
				required: draft.required,
				...(draft.unique ? { unique: true as const } : {})
			};
		case 'image':
			// Atajo: una relación simple a `vega_media`. Al borrar la imagen, el registro se
			// conserva (nunca `cascadeDelete`: borrar una entrada por quitar su portada sería
			// una sorpresa destructiva).
			return {
				name,
				type: 'relation',
				target: IMAGE_FIELD_TARGET,
				required: draft.required,
				multiple: false,
				cascadeDelete: false
			};
		case 'number':
			return { name, type: 'number', required: draft.required };
		case 'bool':
			return { name, type: 'bool', required: draft.required };
		case 'date':
			return { name, type: 'date', required: draft.required };
		case 'json':
			return { name, type: 'json' };
		case 'select': {
			// Espacios de los extremos recortados al enviar; opción vacía descartada en silencio
			// (mismo criterio que una fila de campo sin nombre) — `draftsAreValid` ya bloqueó el
			// envío si no queda ninguna opción única o si hay una repetida.
			const options = draft.selectOptions
				.map((option) => option.value.trim())
				.filter((value) => value.length > 0);
			if (options.length === 0) return null;
			return {
				name,
				type: 'select',
				required: draft.required,
				multiple: draft.selectMultiple,
				options
			};
		}
		case 'relation':
			if (!draft.relationTarget) return null;
			return {
				name,
				type: 'relation',
				target: draft.relationTarget,
				required: draft.required,
				multiple: draft.relationMultiple,
				cascadeDelete: draft.relationDeleteMode === 'cascade'
			};
	}
}
