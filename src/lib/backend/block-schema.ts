/**
 * Puente PURO entre los campos `source: 'record'` del modelo de bloques y el esquema físico que
 * consume el generador de migraciones. No toca el puerto ni decide CUÁNDO proponer/aplicar una
 * migración: ese flujo de producto queda deliberadamente fuera de este módulo.
 *
 * El contrato v1 ya fijado por el starter Astro es estrecho: los campos `relation` de bloque
 * enlazan `vega_media`; `image` es simple e `images` múltiple. No se infiere una colección por
 * tipo de bloque ni se crea `hero_image`: el nombre lógico es la columna física compartida por
 * todos los tipos. El resto de widgets `record` compila al tipo físico equivalente.
 *
 * `generateBlockSchemaMigration` entrega TODOS los specs enriquecidos a
 * `generateSchemaMigration`; así las nuevas aristas `blocks -> vega_media` y la estructural
 * `blocks -> pages` pasan por `topologicallySortCollectionSpecs` en vez de abrir un segundo
 * generador o reproducir su ordenación aquí.
 */

import type { CollectionFieldSpec, CollectionSpec } from './collections';
import { generateSchemaMigration, type GeneratedMigration } from './migration';
import type { ResolvedBlockField, ResolvedBlocksConfig, ResolvedBlockType } from '$lib/model/types';

const MEDIA_COLLECTION = 'vega_media';
const MULTIPLE_MEDIA_FIELD = 'images';

export class BlockRecordFieldConflictError extends Error {
	readonly fieldName: string;
	readonly declarations: readonly string[];

	constructor(fieldName: string, declarations: readonly string[]) {
		super(
			`La columna de bloque "${fieldName}" tiene declaraciones físicas incompatibles: ${declarations.join(
				' <> '
			)}.`
		);
		this.name = 'BlockRecordFieldConflictError';
		this.fieldName = fieldName;
		this.declarations = declarations;
	}
}

interface DerivedField {
	spec: CollectionFieldSpec;
	owner: string;
}

const STRUCTURAL_FIELD_KEYS = [
	'parentField',
	'orderField',
	'typeField',
	'dataField'
] as const satisfies readonly (keyof ResolvedBlocksConfig)[];

/**
 * `required` del manifiesto pertenece al formulario de ESE tipo. La colección de bloques es
 * heterogénea y compartida: un `divider` no tiene `image`, por lo que toda columna derivada debe
 * ser opcional en PocketBase aunque el campo sea obligatorio dentro de `hero`.
 */
function blockFieldToCollectionFieldSpec(field: ResolvedBlockField): CollectionFieldSpec {
	const base = { name: field.name, required: false };

	switch (field.widget) {
		case 'text':
		case 'textarea':
		case 'markdown':
		case 'richtext':
		case 'email':
		case 'url':
		case 'select':
			return { ...base, type: 'text' };
		case 'number':
			return { ...base, type: 'number' };
		case 'switch':
			return { ...base, type: 'bool' };
		case 'datetime':
			return { ...base, type: 'date' };
		case 'chips':
		case 'json':
			return { name: field.name, type: 'json' };
		case 'relation':
			return {
				...base,
				type: 'relation',
				target: MEDIA_COLLECTION,
				multiple: field.name === MULTIPLE_MEDIA_FIELD,
				cascadeDelete: false
			};
		case 'file':
			// `images` es una convención de cardinalidad exclusiva de `relation`. Los campos `file`
			// son simples en v1 hasta que el manifiesto disponga de vocabulario propio para indicarla.
			return {
				...base,
				type: 'file',
				multiple: false
			};
		case 'unsupported':
			// `ResolvedBlockField` nunca contiene este widget (BLOCK_FIELD_WIDGET_IDS lo excluye),
			// pero el switch sigue exhaustivo sobre WidgetId para que TypeScript avise si cambia.
			throw new Error(`El widget unsupported no puede materializar el campo "${field.name}".`);
	}
}

function specSignature(spec: CollectionFieldSpec): string {
	switch (spec.type) {
		case 'json':
			return spec.type;
		case 'text':
			return `${spec.type}:${spec.required ?? false}:${spec.max ?? 0}`;
		case 'bool':
		case 'number':
		case 'date':
			return `${spec.type}:${spec.required ?? false}`;
		case 'relation':
			return `${spec.type}:${spec.target}:${spec.required ?? false}:${spec.multiple ? 'multiple' : 'single'}:${spec.cascadeDelete ? 'cascade' : 'keep'}`;
		case 'file':
			return JSON.stringify({
				type: spec.type,
				required: spec.required ?? false,
				multiple: spec.multiple ?? false,
				maxSizeBytes: spec.maxSizeBytes ?? 0,
				mimeTypes: spec.mimeTypes ?? [],
				thumbs: spec.thumbs ?? []
			});
		case 'autodate':
			return `${spec.type}:${spec.onUpdate ?? false}`;
	}
}

function describe(owner: string, spec: CollectionFieldSpec): string {
	return `${owner} (${specSignature(spec)})`;
}

function assertCompatible(previous: DerivedField, current: DerivedField): void {
	if (specSignature(previous.spec) === specSignature(current.spec)) return;
	throw new BlockRecordFieldConflictError(previous.spec.name, [
		describe(previous.owner, previous.spec),
		describe(current.owner, current.spec)
	]);
}

function structuralFieldOwners(
	blocks: ResolvedBlocksConfig
): ReadonlyMap<string, (typeof STRUCTURAL_FIELD_KEYS)[number]> {
	const owners = new Map<string, (typeof STRUCTURAL_FIELD_KEYS)[number]>();
	for (const key of STRUCTURAL_FIELD_KEYS) {
		const fieldName = blocks[key];
		if (fieldName !== null) owners.set(fieldName, key);
	}
	return owners;
}

function deriveBlockRecordFieldsWithOwners(
	blockTypes: readonly ResolvedBlockType[],
	blocks: ResolvedBlocksConfig
): DerivedField[] {
	const byName = new Map<string, DerivedField>();
	const structuralOwners = structuralFieldOwners(blocks);

	for (const blockType of blockTypes) {
		for (const field of blockType.fields) {
			if (field.source !== 'record') continue;
			const current: DerivedField = {
				spec: blockFieldToCollectionFieldSpec(field),
				owner: `${blockType.name}.${field.name}`
			};
			const structuralOwner = structuralOwners.get(field.name);
			if (structuralOwner) {
				throw new BlockRecordFieldConflictError(field.name, [
					describe(current.owner, current.spec),
					`${blocks.collection}.${field.name} (estructural: ${structuralOwner})`
				]);
			}
			const previous = byName.get(field.name);
			if (previous) {
				assertCompatible(previous, current);
				continue;
			}
			byName.set(field.name, current);
		}
	}

	return Array.from(byName.values());
}

/**
 * Deriva una sola columna por NOMBRE a partir de todos los tipos. El orden es el de la primera
 * declaración del manifiesto. Dos tipos que comparten nombre comparten columna únicamente si su
 * forma física completa coincide (tipo, destino, cardinalidad y política destructiva). Los nombres
 * estructurales proceden de la declaración de bloques resuelta: nunca se deducen ni se fijan aquí.
 */
export function deriveBlockRecordFields(
	blockTypes: readonly ResolvedBlockType[],
	blocks: ResolvedBlocksConfig
): CollectionFieldSpec[] {
	return deriveBlockRecordFieldsWithOwners(blockTypes, blocks).map(({ spec }) => spec);
}

/**
 * Añade las columnas derivadas al spec de la colección hija sin mutar los argumentos. Una columna
 * base ya presente se conserva si su forma es idéntica; si no, el conflicto se rechaza antes de
 * emitir una migración que dejaría ganar silenciosamente a una de las dos declaraciones.
 */
export function addBlockRecordFieldsToCollectionSpecs(
	specs: readonly CollectionSpec[],
	blocks: ResolvedBlocksConfig,
	blockTypes: readonly ResolvedBlockType[]
): CollectionSpec[] {
	const derived = deriveBlockRecordFieldsWithOwners(blockTypes, blocks);
	let found = false;

	const enriched = specs.map((spec) => {
		if (spec.name !== blocks.collection) return { ...spec, fields: [...spec.fields] };
		found = true;
		const fields = [...spec.fields];
		const byName = new Map(fields.map((field) => [field.name, field]));

		for (const current of derived) {
			const existing = byName.get(current.spec.name);
			if (existing) {
				assertCompatible(
					{ spec: existing, owner: `${blocks.collection}.${existing.name} (spec base)` },
					current
				);
				continue;
			}
			fields.push(current.spec);
			byName.set(current.spec.name, current.spec);
		}

		return { ...spec, fields };
	});

	if (!found) {
		throw new Error(
			`No existe el CollectionSpec "${blocks.collection}" al materializar sus campos de bloque.`
		);
	}
	return enriched;
}

/**
 * Enganche único con el generador existente. El llamador sigue eligiendo cuándo invocarlo; aquí
 * solo se compone el artefacto determinista y se preserva la ordenación topológica canónica.
 */
export function generateBlockSchemaMigration(
	input: {
		specs: readonly CollectionSpec[];
		blocks: ResolvedBlocksConfig;
		blockTypes: readonly ResolvedBlockType[];
	},
	now: Date = new Date()
): GeneratedMigration {
	const specs = addBlockRecordFieldsToCollectionSpecs(input.specs, input.blocks, input.blockTypes);
	return generateSchemaMigration({ kind: 'create', specs }, now);
}
