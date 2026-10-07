/** Bootstrap y lectura de esquema de una instancia `memory`. */

import type { BackendPort } from '../../port';
import type { ContentType, Field, FieldValue } from '../../types';
import type { FieldError } from '../../errors';
import { VegaError } from '../../errors';
import { normalizeFieldValue } from '../../normalize';
import type {
	AddFieldsResult,
	CollectionAccessRules,
	CollectionFieldSpec,
	CollectionSpec,
	ConstrainPatternsResult,
	EnsureResult
} from '../../collections';
import {
	checkCollectionSpecAccess,
	checkCollectionFieldSpecs,
	checkCreatableCollectionNames,
	checkRelationTargets,
	COMMON_COLLECTION_RULE_KEYS
} from '../../collections';
import {
	collectionSpecToMemorySnapshot,
	type MemoryCollectionSnapshot,
	type MemoryState
} from './state';

type MemorySchemaOps = Pick<
	BackendPort,
	| 'listContentTypes'
	| 'ensureCollections'
	| 'addCollectionFields'
	| 'collectionRules'
	| 'addCollectionFieldPatterns'
> & { inspectCollection(name: string): MemoryCollectionSnapshot | null };

/** Las mutaciones de esquema son aditivas y actualizan los mapas compartidos in situ. */
export function createSchemaOps(
	state: MemoryState,
	checkSessionAlive: () => void,
	getContentTypeOrThrow: (type: string) => ContentType,
	capabilities: BackendPort['capabilities']
): MemorySchemaOps {
	const { contentTypesByName, collectionsByName, records } = state;
	function getSortedContentTypes(): ContentType[] {
		return [...contentTypesByName.values()].sort((a, b) =>
			a.name < b.name ? -1 : a.name > b.name ? 1 : 0
		);
	}

	return {
		inspectCollection(name) {
			const collection = collectionsByName.get(name);
			return collection ? structuredClone(collection) : null;
		},

		async listContentTypes() {
			checkSessionAlive();
			return structuredClone(getSortedContentTypes());
		},

		async ensureCollections(specs: CollectionSpec[]): Promise<EnsureResult> {
			checkSessionAlive();
			if (!capabilities.schemaBootstrap) {
				throw VegaError.backend('schemaBootstrap no disponible (ley L8)');
			}

			const rejects = checkCreatableCollectionNames(specs);
			const fieldRejects = checkCollectionFieldSpecs(specs.flatMap((spec) => spec.fields));
			const accessRejects = checkCollectionSpecAccess(specs);
			const allRejects = { ...rejects, ...fieldRejects, ...accessRejects };
			if (Object.keys(allRejects).length > 0) throw VegaError.validation(allRejects);

			const created: string[] = [];
			const skipped: string[] = [];
			for (const spec of specs) {
				// No destructiva (§A.4.2): si ya existe, se omite tal cual está, nunca se toca.
				const expectedType = spec.type ?? 'base';
				const existing = collectionsByName.get(spec.name);
				if (existing) {
					if (existing.type !== expectedType) {
						throw VegaError.validation(
							{
								[spec.name]: {
									code: 'vega_collection_type_mismatch',
									message: `La colección "${spec.name}" ya existe como ${existing.type}, no como ${expectedType}`,
									params: { collection: spec.name, existingType: existing.type, expectedType }
								}
							},
							`La colección "${spec.name}" ya existe como ${existing.type}, no como ${expectedType}`
						);
					}
					skipped.push(spec.name);
					continue;
				}
				const relationRejects = checkRelationTargets(
					spec.fields,
					[...collectionsByName.values()]
						.filter((collection) => collection.type !== 'view')
						.map((collection) => collection.name)
				);
				if (Object.keys(relationRejects).length > 0) {
					throw VegaError.validation(
						relationRejects,
						`No se pudo crear la colección "${spec.name}"`
					);
				}
				collectionsByName.set(spec.name, collectionSpecToMemorySnapshot(spec));
				if (expectedType === 'base') {
					const ct: ContentType = {
						name: spec.name,
						readonly: false,
						fields: spec.fields.map(collectionFieldSpecToField)
					};
					contentTypesByName.set(spec.name, ct);
					records.set(spec.name, new Map());
				}
				created.push(spec.name);
			}
			return { created, skipped };
		},

		async addCollectionFields(
			collectionName: string,
			fields: CollectionFieldSpec[]
		): Promise<AddFieldsResult> {
			checkSessionAlive();
			if (!capabilities.schemaFieldBootstrap) {
				throw VegaError.backend('schemaFieldBootstrap no disponible (ley L8)');
			}
			const fieldRejects = checkCollectionFieldSpecs(fields);
			if (Object.keys(fieldRejects).length > 0) throw VegaError.validation(fieldRejects);
			// Una colección `auth` (hoy, `vega_editors`) no es un `ContentType` (D-P1.1), pero en PB
			// admite campos nuevos igual que cualquier otra: aquí solo existe como instantánea, así
			// que se le suman los nombres, con la misma regla aditiva e idempotente.
			const authCollection = collectionsByName.get(collectionName);
			if (!contentTypesByName.has(collectionName) && authCollection?.type === 'auth') {
				const existing = new Set(authCollection.fieldNames);
				const added = fields.filter((spec) => !existing.has(spec.name)).map((spec) => spec.name);
				const skipped = fields.filter((spec) => existing.has(spec.name)).map((spec) => spec.name);
				collectionsByName.set(collectionName, {
					...authCollection,
					fieldNames: [...authCollection.fieldNames, ...added]
				});
				return { added, skipped };
			}
			const ct = getContentTypeOrThrow(collectionName);

			const existingNames = new Set(ct.fields.map((f) => f.name));
			const added: string[] = [];
			const skipped: string[] = [];
			const newSpecs: CollectionFieldSpec[] = [];
			for (const spec of fields) {
				// No destructiva (misma regla que `ensureCollections`): un campo que ya existe se
				// omite tal cual está, nunca se reconcilia ni se sobreescribe.
				if (existingNames.has(spec.name)) {
					skipped.push(spec.name);
					continue;
				}
				newSpecs.push(spec);
				added.push(spec.name);
			}

			const relationRejects = checkRelationTargets(
				newSpecs,
				[...contentTypesByName.values()].filter((type) => !type.readonly).map((type) => type.name)
			);
			if (Object.keys(relationRejects).length > 0) {
				throw VegaError.validation(relationRejects);
			}
			const newFields = newSpecs.map(collectionFieldSpecToField);
			if (newFields.length > 0) {
				const byId = records.get(collectionName)!;
				const uniqueBackfillErrors: Record<string, FieldError> = {};
				for (const field of newFields) {
					if (!field.unique || byId.size < 2) continue;
					// Índice parcial de url/email: los registros existentes (vacíos) no chocan.
					if (field.type === 'url' || field.type === 'email') continue;
					uniqueBackfillErrors[field.name] = {
						code: 'validation_not_unique',
						message:
							'El campo unique no puede añadirse: los registros existentes comparten su valor vacío'
					};
				}
				if (Object.keys(uniqueBackfillErrors).length > 0) {
					throw VegaError.validation(uniqueBackfillErrors);
				}

				contentTypesByName.set(collectionName, {
					...ct,
					fields: [...ct.fields, ...newFields]
				});
				const collection = collectionsByName.get(collectionName);
				if (collection) {
					collectionsByName.set(collectionName, {
						...collection,
						fieldNames: [...collection.fieldNames, ...newSpecs.map((field) => field.name)]
					});
				}
				// Paridad con PB real: una columna nueva en SQLite rellena las filas EXISTENTES
				// con su valor por defecto (§2.1) — sin este backfill, `get`/`list` devolverían un
				// registro antiguo SIN la clave nueva en `values`, distinto de lo que vería un
				// `listContentTypes` en vivo contra PB tras el mismo `ALTER TABLE`.
				for (const raw of byId.values()) {
					for (const field of newFields) {
						raw[field.name] = field.readonly
							? defaultReadonlyValue(field)
							: normalizeFieldValue(field, undefined);
					}
				}
			}

			return { added, skipped };
		},

		async collectionRules(
			names: readonly string[]
		): Promise<Record<string, CollectionAccessRules>> {
			checkSessionAlive();
			const found: Record<string, CollectionAccessRules> = {};
			for (const name of names) {
				const collection = collectionsByName.get(name);
				if (!collection) continue;
				found[name] = Object.fromEntries(
					COMMON_COLLECTION_RULE_KEYS.map((key) => [key, collection.rules[key] ?? null])
				) as CollectionAccessRules;
			}
			return found;
		},

		async addCollectionFieldPatterns(
			collectionName: string,
			patterns: Record<string, string>
		): Promise<ConstrainPatternsResult> {
			checkSessionAlive();
			if (!capabilities.schemaFieldBootstrap) {
				throw VegaError.backend('schemaFieldBootstrap no disponible (ley L8)');
			}
			const ct = getContentTypeOrThrow(collectionName);
			const applied: string[] = [];
			const skipped: string[] = [];
			const fields = ct.fields.map((field) => {
				const pattern = patterns[field.name];
				if (pattern === undefined) return field;
				if (field.type !== 'text' || field.pattern) {
					skipped.push(field.name);
					return field;
				}
				applied.push(field.name);
				return { ...field, pattern };
			});
			for (const name of Object.keys(patterns)) {
				if (!applied.includes(name) && !skipped.includes(name)) skipped.push(name);
			}
			if (applied.length > 0) contentTypesByName.set(collectionName, { ...ct, fields });
			return { applied, skipped };
		}
	};
}

export function defaultReadonlyValue(field: Field): FieldValue {
	// Emula un campo `autodate` de PB (readonly: true, siempre `date`): se rellena solo al crear.
	if (field.type === 'date') return new Date().toISOString();
	return normalizeFieldValue(field, undefined);
}

/**
 * Compila el vocabulario REDUCIDO de `CollectionFieldSpec` (Anexo A §A.3) al `Field` del
 * puerto. Los defaults de `readonly`/`presentable`/`hidden` siguen siendo correctos porque el
 * bootstrap no necesita más. `unique` YA NO es un default: `text` puede declararlo y este
 * adaptador lo hace cumplir de verdad en `create`/`update`, no solo lo expone.
 */
function collectionFieldSpecToField(spec: CollectionFieldSpec): Field {
	const base = {
		name: spec.name,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
	switch (spec.type) {
		case 'json':
			return { ...base, type: 'json', required: false };
		case 'text':
			return {
				...base,
				unique: spec.unique ?? false,
				hidden: spec.hidden ?? false,
				type: 'text',
				subtype: 'plain',
				required: spec.required ?? false,
				maxLength: spec.max,
				pattern: spec.pattern || undefined
			};
		case 'editor':
			return { ...base, type: 'richtext', subtype: 'html', required: spec.required ?? false };
		case 'url':
			return {
				...base,
				unique: spec.unique ?? false,
				type: 'url',
				required: spec.required ?? false
			};
		case 'email':
			return {
				...base,
				unique: spec.unique ?? false,
				type: 'email',
				required: spec.required ?? false
			};
		case 'select':
			return {
				...base,
				type: 'select',
				required: spec.required ?? false,
				options: [...spec.options],
				multiple: spec.multiple,
				maxSelect: spec.multiple ? 99 : 1
			};
		case 'file':
			return {
				...base,
				type: 'file',
				required: spec.required ?? false,
				multiple: spec.multiple ?? false,
				maxSizeBytes: spec.maxSizeBytes,
				mimeTypes: spec.mimeTypes,
				protected: false
			};
		case 'bool':
			return { ...base, type: 'bool', required: spec.required ?? false };
		case 'number':
			// Misma landmine de PocketBase que documenta `collectionFieldSpecToPbField` (adaptador
			// `pocketbase`): un `number` `required` rechaza 0. `memory` no la reproduce (`validate.ts`
			// no tiene ese sesgo), pero SÍ debe honrar el flag para que el dry-run de campos
			// nuevos se comporte igual en ambos adaptadores (paridad, §7 del contrato).
			return { ...base, type: 'number', required: spec.required ?? false, integer: false };
		case 'date':
			return { ...base, type: 'date', required: spec.required ?? false };
		case 'relation':
			return {
				...base,
				type: 'relation',
				required: spec.required ?? false,
				target: spec.target,
				multiple: spec.multiple,
				maxSelect: spec.multiple ? 99 : 1,
				cascadeDelete: spec.cascadeDelete
			};
		case 'autodate':
			// Emula un campo `autodate` de PB (§9 del contrato P6): readonly, nunca required (el
			// backend lo rellena solo). `defaultReadonlyValue` (más abajo, en este mismo fichero)
			// YA puebla cualquier `date` readonly con `new Date().toISOString()` al crear — la
			// semántica autodate exacta sin código adicional.
			return { ...base, type: 'date', readonly: true, required: false };
	}
}
