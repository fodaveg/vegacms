/**
 * `ensureCollections` (Anexo A) sobre PocketBase real: crea, una a una y secuencialmente (para
 * no acumular colisiones de nombre), las colecciones ausentes. Tipo, reglas y campos son
 * creation-only: si el nombre ya existe con el mismo tipo, se omite sin enviar ningún PATCH.
 */

import type PocketBase from 'pocketbase';
import { ClientResponseError, type CollectionModel } from 'pocketbase';
import type {
	AddFieldsResult,
	CollectionFieldSpec,
	CollectionSpec,
	EnsureResult
} from '../../collections';
import {
	checkCollectionSpecAccess,
	checkRelationTargets,
	collectionSpecCreationMetadata,
	collectionUniqueIndexes
} from '../../collections';
import { VegaError } from '../../errors';
import { mapPocketBaseError } from './errors';
import { collectionFieldSpecToPbField } from './schema';

export function collectionSpecToPocketBasePayload(
	spec: CollectionSpec,
	fields: Record<string, unknown>[]
): Record<string, unknown> {
	return {
		...collectionSpecCreationMetadata(spec),
		fields,
		indexes: collectionUniqueIndexes(spec.name, spec.fields)
	};
}

export async function ensureCollectionsOnPocketBase(
	pb: PocketBase,
	specs: CollectionSpec[]
): Promise<EnsureResult> {
	const accessRejects = checkCollectionSpecAccess(specs);
	if (Object.keys(accessRejects).length > 0) throw VegaError.validation(accessRejects);

	const created: string[] = [];
	const skipped: string[] = [];

	for (const spec of specs) {
		try {
			const expectedType = spec.type ?? 'base';
			const existing = await findCollection(pb, spec.name);
			if (existing) {
				if (existing.type !== expectedType) {
					throw VegaError.validation(
						{
							[spec.name]: {
								code: 'vega_collection_type_mismatch',
								message: `La colección "${spec.name}" ya existe como ${existing.type}, no como ${expectedType}`
							}
						},
						`La colección "${spec.name}" ya existe con otro tipo`
					);
				}
				skipped.push(spec.name);
				continue;
			}
			const fields = await resolveCollectionFields(pb, spec.fields);
			await pb.collections.create(collectionSpecToPocketBasePayload(spec, fields));
			created.push(spec.name);
		} catch (err) {
			throw withCollectionContext(spec.name, err);
		}
	}

	return { created, skipped };
}

async function findCollection(pb: PocketBase, name: string): Promise<CollectionModel | null> {
	try {
		return await pb.collections.getOne(name);
	} catch (err) {
		if (err instanceof ClientResponseError && err.status === 404) return null;
		throw err;
	}
}

function withCollectionContext(name: string, err: unknown): VegaError {
	const mapped = mapPocketBaseError(err, { hadSession: true });
	if (mapped.message.includes(`"${name}"`)) return mapped;
	return new VegaError(mapped.kind, `No se pudo crear la colección "${name}": ${mapped.message}`, {
		fieldErrors: mapped.fieldErrors,
		retryable: mapped.retryable,
		cause: mapped.cause ?? err
	});
}

/**
 * `addCollectionFields` (Anexo A ampliado) sobre PocketBase real: lee la colección COMPLETA
 * (incluye el `id` interno de cada campo existente, imprescindible para que el PATCH de abajo
 * los CONSERVE en vez de borrarlos — PB trata `fields` como el array COMPLETO y final, no un
 * merge), añade los campos ausentes al final y guarda de una vez. Un 404 en `getOne` (la
 * colección no existe) se deja escapar tal cual — lo mapea `guarded()`/`mapPocketBaseError` de
 * `index.ts` a `VegaError 'not-found'`, mismo criterio que el resto de operaciones de este
 * adaptador (ninguna función de `collections.ts` mapea errores por su cuenta).
 */
export async function addFieldsOnPocketBase(
	pb: PocketBase,
	collectionName: string,
	fields: CollectionFieldSpec[]
): Promise<AddFieldsResult> {
	const collection = await pb.collections.getOne(collectionName);

	const existingNames = new Set(collection.fields.map((f) => f.name));
	const added: string[] = [];
	const skipped: string[] = [];
	const newSpecs: CollectionFieldSpec[] = [];
	for (const spec of fields) {
		// No destructiva (misma regla que `ensureCollectionsOnPocketBase`): un campo que ya
		// existe se omite tal cual está, nunca se reconcilia ni se sobreescribe.
		if (existingNames.has(spec.name)) {
			skipped.push(spec.name);
			continue;
		}
		newSpecs.push(spec);
		added.push(spec.name);
	}

	const newFields = await resolveCollectionFields(pb, newSpecs);
	const newIndexes = collectionUniqueIndexes(collectionName, newSpecs);
	if (newFields.length > 0) {
		// RELECTURA justo antes de escribir, y NO por paranoia: esto es un read-modify-write sobre
		// el array COMPLETO de campos. Entre el `getOne` de arriba y este `update`, otro escritor
		// (una segunda pestaña del mismo superuser, o el Admin nativo de PocketBase abierto al
		// lado) puede haber añadido campos; reenviar la copia rancia de `collection.fields` los
		// BORRARÍA del esquema, y las dos llamadas devolverían éxito a sus respectivas UI. Pérdida
		// de datos silenciosa, que es justo lo que este adaptador promete no hacer.
		//
		// No se reintenta ni se fusiona automáticamente: fusionar exigiría decidir qué hacer si el
		// otro escritor añadió un campo con NUESTRO mismo nombre y otro tipo, y esa decisión es del
		// humano, no del adaptador. Se falla alto y claro; reintentar es teclear el formulario otra
		// vez, sobre un esquema que ya se ha repintado.
		const fresh = await pb.collections.getOne(collectionName);
		if (!sameFieldIdentity(collection.fields, fresh.fields)) {
			// `backend` y no un `kind` nuevo: `VegaErrorKind` es parte del contrato del puerto (§5,
			// con su tabla de mapeo y sus switches exhaustivos), y añadir 'conflict' para un caso
			// que la UI trata igual —enseñar el mensaje y dejar reintentar— sería mover el contrato
			// por comodidad de nomenclatura.
			throw VegaError.backend(
				`El esquema de "${collectionName}" cambió mientras se preparaban los campos nuevos. ` +
					'Vuelve a intentarlo sobre el esquema ya actualizado.'
			);
		}
		if (newIndexes.length > 0 && !sameIndexIdentity(collection.indexes, fresh.indexes)) {
			throw VegaError.backend(
				`Los índices de "${collectionName}" cambiaron mientras se preparaban los campos nuevos. ` +
					'Vuelve a intentarlo sobre el esquema ya actualizado.'
			);
		}
		// `fresh.fields` (los que YA trae `getOne`, con su `id`) + los nuevos (sin `id`: PB se lo
		// asigna al guardar) — reenviar los existentes TAL CUAL es lo que los preserva.
		await pb.collections.update(collectionName, {
			fields: [...fresh.fields, ...newFields],
			...(newIndexes.length > 0 ? { indexes: [...fresh.indexes, ...newIndexes] } : {})
		});
	}

	return { added, skipped };
}

/**
 * Resuelve nombres de destino contra el esquema REAL y compila los payloads con sus ids internos.
 * No se incrusta el nombre en `collectionId`: PocketBase exige el id estable de la colección.
 */
async function resolveCollectionFields(
	pb: PocketBase,
	fields: CollectionFieldSpec[]
): Promise<Record<string, unknown>[]> {
	const targetIds = new Map<string, string>();
	const relationTargets = [
		...new Set(fields.flatMap((field) => (field.type === 'relation' ? [field.target] : [])))
	];

	for (const target of relationTargets) {
		try {
			const collection = await pb.collections.getOne(target);
			// PocketBase solo permite que una view relacione hacia otra view; esta operación
			// siempre crea o amplía colecciones base, así que una view no es un destino válido.
			if (collection.type !== 'view') targetIds.set(target, collection.id);
		} catch (err) {
			if (!(err instanceof ClientResponseError && err.status === 404)) throw err;
		}
	}

	const rejects = checkRelationTargets(fields, targetIds.keys());
	if (Object.keys(rejects).length > 0) throw VegaError.validation(rejects);

	return fields.map((field) =>
		collectionFieldSpecToPbField(
			field,
			field.type === 'relation' ? targetIds.get(field.target) : undefined
		)
	);
}

/**
 * `true` si los dos arrays de campos describen el MISMO esquema desde el punto de vista de esta
 * operación: mismos `id` y mismos nombres, en cualquier orden. Compara `id` y no solo nombres
 * porque un campo borrado y recreado con el mismo nombre es OTRO campo (otra columna) y reenviar
 * el `id` viejo lo resucitaría mal.
 */
function sameFieldIdentity(
	before: { id: string; name: string }[],
	after: { id: string; name: string }[]
): boolean {
	if (before.length !== after.length) return false;
	const key = (f: { id: string; name: string }) => `${f.id}\u0000${f.name}`;
	const beforeKeys = new Set(before.map(key));
	return after.every((f) => beforeKeys.has(key(f)));
}

/** Igual que `sameFieldIdentity`, para el array completo de SQL de índices de la colección. */
function sameIndexIdentity(before: string[], after: string[]): boolean {
	if (before.length !== after.length) return false;
	const beforeIndexes = new Set(before);
	return after.every((index) => beforeIndexes.has(index));
}
