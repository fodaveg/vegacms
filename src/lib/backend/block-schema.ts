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
import type { Field } from './types';
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

export type BlockRecordFieldDiagnostic =
	| {
			status: 'missing';
			expected: CollectionFieldSpec;
	  }
	| {
			status: 'compatible';
			expected: CollectionFieldSpec;
			actual: Field;
	  }
	| {
			status: 'incompatible';
			expected: CollectionFieldSpec;
			actual: Field;
			conflict: BlockRecordFieldConflictError;
	  };

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
			return `${spec.type}:${spec.required ?? false}:${spec.max ?? 0}${spec.unique ? ':unique' : ''}`;
		case 'select':
			return JSON.stringify({
				type: spec.type,
				required: spec.required ?? false,
				options: spec.options,
				multiple: spec.multiple
			});
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

/**
 * Baja el campo descubierto por el puerto al MISMO vocabulario físico reducido que usa el
 * generador. Las propiedades que `CollectionFieldSpec` no sabe declarar tampoco participan en su
 * firma: este puente no abre un segundo criterio de compatibilidad.
 */
function backendFieldToComparableSpec(field: Field): CollectionFieldSpec | null {
	const base = { name: field.name, required: field.required };
	const hasUnrepresentableBaseConstraint =
		field.readonly || (field.unique && field.type !== 'text');
	if (hasUnrepresentableBaseConstraint) return null;

	switch (field.type) {
		case 'text':
			return field.subtype === 'plain' &&
				field.minLength === undefined &&
				field.pattern === undefined
				? {
						...base,
						type: 'text',
						max: field.maxLength ?? 0,
						...(field.unique ? { unique: true as const } : {})
					}
				: null;
		case 'select':
			return field.maxSelect === (field.multiple ? 99 : 1)
				? {
						...base,
						type: 'select',
						options: [...field.options],
						multiple: field.multiple
					}
				: null;
		case 'bool':
			return { ...base, type: 'bool' };
		case 'number':
			return !field.integer && field.min === undefined && field.max === undefined
				? { ...base, type: 'number' }
				: null;
		case 'date':
			return field.min === undefined && field.max === undefined ? { ...base, type: 'date' } : null;
		case 'relation':
			if (field.maxSelect !== (field.multiple ? 99 : 1) || field.minSelect !== undefined) {
				return null;
			}
			return {
				...base,
				type: 'relation',
				target: field.target,
				multiple: field.multiple,
				cascadeDelete: field.cascadeDelete ?? false
			};
		case 'file':
			if (field.maxSelect !== (field.multiple ? 99 : 1) || field.protected) {
				return null;
			}
			return {
				...base,
				type: 'file',
				multiple: field.multiple,
				maxSizeBytes: field.maxSizeBytes ?? 0,
				mimeTypes: field.mimeTypes ?? [],
				// El puerto no expone miniaturas descubiertas; los campos de bloque v1 tampoco
				// declaran ninguna, así que la forma comparable canónica es el default vacío.
				thumbs: []
			};
		case 'json':
			return field.required ? null : { name: field.name, type: 'json' };
		case 'richtext':
		case 'email':
		case 'url':
		case 'unsupported':
			return null;
	}
}

function describeBackendField(owner: string, field: Field): string {
	const comparable = backendFieldToComparableSpec(field);
	if (comparable) return describe(owner, comparable);
	return `${owner} (restricciones no representables: ${JSON.stringify(field)})`;
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
 * Compara las columnas `record` declaradas por el manifiesto con los campos que el puerto descubrió
 * en la colección de bloques viva. Conserva tres estados porque solo `missing` es automatizable:
 * una incompatibilidad puede contener datos y siempre queda para decisión humana.
 */
export function diagnoseBlockRecordFields(
	blockTypes: readonly ResolvedBlockType[],
	blocks: ResolvedBlocksConfig,
	actualFields: readonly Field[]
): BlockRecordFieldDiagnostic[] {
	const actualByName = new Map(actualFields.map((field) => [field.name, field]));

	return deriveBlockRecordFieldsWithOwners(blockTypes, blocks).map((derived) => {
		const actual = actualByName.get(derived.spec.name);
		if (!actual) return { status: 'missing', expected: derived.spec };

		const comparable = backendFieldToComparableSpec(actual);
		if (comparable && specSignature(derived.spec) === specSignature(comparable)) {
			return { status: 'compatible', expected: derived.spec, actual };
		}

		return {
			status: 'incompatible',
			expected: derived.spec,
			actual,
			conflict: new BlockRecordFieldConflictError(derived.spec.name, [
				describe(derived.owner, derived.spec),
				describeBackendField(`${blocks.collection}.${actual.name} (esquema)`, actual)
			])
		};
	});
}

/**
 * Emite una migración `add-fields` únicamente para los diagnósticos `missing`. Los compatibles no
 * requieren acción y los incompatibles se omiten deliberadamente: cambiar columnas con datos no
 * es una reconciliación segura. `null` significa que no hay nada automatizable.
 */
export function generateBlockReconciliationMigration(
	blocks: ResolvedBlocksConfig,
	diagnostics: readonly BlockRecordFieldDiagnostic[],
	now: Date = new Date()
): GeneratedMigration | null {
	const fields = diagnostics
		.filter(
			(diagnostic): diagnostic is Extract<BlockRecordFieldDiagnostic, { status: 'missing' }> =>
				diagnostic.status === 'missing'
		)
		.map(({ expected }) => expected);

	if (fields.length === 0) return null;
	return generateSchemaMigration(
		{ kind: 'add-fields', collection: blocks.collection, fields },
		now
	);
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
