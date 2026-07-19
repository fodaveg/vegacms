/**
 * Siembra el fixture "kitchen sink" (mismo `tests/contract/fixture.ts` que usa `memory`) en un
 * PocketBase real, vía la API de superuser: crea las colecciones (traduciendo los `Field` Vega
 * del fixture al vocabulario COMPLETO de creación de PB — más amplio que el reducido de
 * `ensureCollections`/Anexo A, que no cubre select/relation/email/etc.) y, antes de cada test,
 * trunca+reinserta los registros canónicos para que cada test arranque con el mismo dataset
 * (memory logra esto recreando el backend entero; contra un servidor real y persistente eso
 * sería carísimo, así que aquí se trunca).
 *
 * Vive en `tests/contract/pb-harness/` (no en `src/`): es infraestructura de test, no del
 * adaptador — el adaptador de producción nunca crea colecciones fuera de `ensureCollections`.
 */

import PocketBase, { ClientResponseError } from 'pocketbase';
import type { Field } from '$lib/backend';
import { categoryType, kitchenSinkType, kitchenSinkSeed, requiredProbeType } from '../fixture';
import { pocketBaseBinaryVersion, pbVersionAtLeast } from './binary';

const CATEGORY_VIEW_QUERY = 'SELECT id, name FROM category';

/**
 * El campo `geoPoint` (usado por `kitchen_sink.location` para probar que Vega degrada tipos
 * exóticos a `unsupported`, §6/§9.10) es una capacidad de PocketBase, no un formato de creación:
 * el tipo de campo `geoPoint` NO EXISTE en el servidor hasta la v0.27.0 (CHANGELOG oficial:
 * "Added new geoPoint field"; verificado 2026-07-19 contra 0.26.0 real: crearlo devuelve 400
 * "Failed to load the submitted data due to invalid formatting" — el servidor ni siquiera
 * reconoce el tipo, no es un problema de shape). Como ninguna instalación 0.26.0 real puede
 * tener jamás un campo `geoPoint` (el tipo no existía), el escenario "leer un geoPoint ajeno y
 * degradarlo" es inaplicable contra esa versión — se omite el campo al sembrar, en vez de forzar
 * un shape que el servidor no puede aceptar.
 */
const GEO_POINT_MIN_VERSION = '0.27.0';

function supportsGeoPointField(): boolean {
	const version = pocketBaseBinaryVersion();
	// Sin binario detectable, no bloqueamos (el resto del harness ya se salta declarándolo).
	return version === null || pbVersionAtLeast(version, GEO_POINT_MIN_VERSION);
}

/** Crea (si no existen) las colecciones del fixture en PB, en orden de dependencia. */
export async function seedPocketBaseSchema(pb: PocketBase): Promise<void> {
	const categoryId = await ensureBaseCollection(pb, 'category', categoryType.fields, {});
	const kitchenSinkFields = supportsGeoPointField()
		? kitchenSinkType.fields
		: kitchenSinkType.fields.filter(
				(f) => !(f.type === 'unsupported' && f.backendType === 'geoPoint')
			);
	await ensureBaseCollection(pb, 'kitchen_sink', kitchenSinkFields, { category: categoryId });
	await ensureBaseCollection(pb, 'required_probe', requiredProbeType.fields, {
		category: categoryId
	});
	await ensureViewCollection(pb, 'category_view', CATEGORY_VIEW_QUERY);
}

/** Trunca y reinserta los registros canónicos del fixture (llamar antes de cada test). */
export async function resetPocketBaseRecords(pb: PocketBase): Promise<void> {
	// Orden de DEPENDENCIA, no alfabético: `required_probe` tiene una relation `required` hacia
	// `category`, así que truncar `category` primero falla ("required cascade delete record
	// references") en cuanto `required_probe` tiene filas vivas. Antes pasaba desapercibido
	// porque esos `create()` fallaban por falta de login (ver el fix de auth en
	// `backend-contract.ts`) y `required_probe` nunca llegaba a tener filas.
	for (const name of ['kitchen_sink', 'required_probe', 'category']) {
		await pb.collections.truncate(name);
	}

	const seed = kitchenSinkSeed();
	const nonWritable = new Set(
		kitchenSinkType.fields.filter((f) => f.readonly || f.type === 'unsupported').map((f) => f.name)
	);

	for (const rec of seed.records.category ?? []) {
		await pb.collection('category').create({ id: rec.id, ...rec.values });
	}
	for (const rec of seed.records.kitchen_sink ?? []) {
		const values = Object.fromEntries(
			Object.entries(rec.values).filter(([k]) => !nonWritable.has(k))
		);
		await pb.collection('kitchen_sink').create({ id: rec.id, ...values });
	}
	// `category_view` es una vista real: sus filas las deriva PB de `category`, no se insertan.
}

async function ensureBaseCollection(
	pb: PocketBase,
	name: string,
	fields: Field[],
	targetIds: Record<string, string>
): Promise<string> {
	const existing = await tryGetCollection(pb, name);
	if (existing) return existing.id;

	const created = await pb.collections.create({
		name,
		type: 'base',
		fields: [
			// Los ids del fixture llevan guiones (p.ej. "cat-alpha"): el patrón por defecto de PB
			// (`^[a-z0-9]+$`) los rechazaría, así que se declara uno explícito y permisivo.
			{
				name: 'id',
				type: 'text',
				primaryKey: true,
				required: true,
				system: true,
				pattern: '^[a-z0-9-]+$',
				autogeneratePattern: '[a-z0-9]{15}',
				min: 1,
				max: 60
			},
			...fields.map((f) => vegaFieldToPbCreateSpec(f, targetIds))
		]
	});
	return created.id;
}

async function ensureViewCollection(
	pb: PocketBase,
	name: string,
	viewQuery: string
): Promise<void> {
	const existing = await tryGetCollection(pb, name);
	if (existing) return;
	await pb.collections.create({ name, type: 'view', viewQuery });
}

async function tryGetCollection(pb: PocketBase, name: string) {
	try {
		return await pb.collections.getOne(name);
	} catch (err) {
		if (err instanceof ClientResponseError && err.status === 404) return null;
		throw err;
	}
}

/**
 * Traduce un `Field` Vega (el vocabulario COMPLETO del puerto, no el reducido de Anexo A) al
 * payload de creación de campo que espera `POST /api/collections`. Solo para el harness de
 * tests: cubre exactamente los tipos que aparecen en el fixture "kitchen sink" (§10.2).
 */
function vegaFieldToPbCreateSpec(
	field: Field,
	targetIds: Record<string, string>
): Record<string, unknown> {
	switch (field.type) {
		case 'text':
			return {
				name: field.name,
				type: 'text',
				required: field.required,
				min: field.minLength ?? 0,
				max: field.maxLength ?? 0,
				pattern: field.pattern ?? ''
			};
		case 'richtext':
			return { name: field.name, type: 'editor', required: field.required };
		case 'number':
			return {
				name: field.name,
				type: 'number',
				required: field.required,
				onlyInt: field.integer,
				min: field.min ?? null,
				max: field.max ?? null
			};
		case 'bool':
			return { name: field.name, type: 'bool', required: field.required };
		case 'email':
			return { name: field.name, type: 'email', required: field.required };
		case 'url':
			return { name: field.name, type: 'url', required: field.required };
		case 'date':
			if (field.readonly)
				return { name: field.name, type: 'autodate', onCreate: true, onUpdate: false };
			return {
				name: field.name,
				type: 'date',
				required: field.required,
				min: field.min ?? '',
				max: field.max ?? ''
			};
		case 'select':
			return {
				name: field.name,
				type: 'select',
				required: field.required,
				values: field.options,
				maxSelect: field.multiple ? (field.maxSelect ?? 99) : 1
			};
		case 'relation': {
			const collectionId = targetIds[field.target];
			if (!collectionId) {
				throw new Error(
					`vegaFieldToPbCreateSpec: target "${field.target}" no está creado todavía (orden de siembra)`
				);
			}
			return {
				name: field.name,
				type: 'relation',
				required: field.required,
				collectionId,
				maxSelect: field.multiple ? (field.maxSelect ?? 99) : 1
			};
		}
		case 'file':
			return {
				name: field.name,
				type: 'file',
				required: field.required,
				maxSelect: field.multiple ? (field.maxSelect ?? 99) : 1,
				maxSize: field.maxSizeBytes ?? 0
			};
		case 'json':
			return { name: field.name, type: 'json', required: field.required };
		case 'unsupported':
			if (field.backendType === 'geoPoint') return { name: field.name, type: 'geoPoint' };
			throw new Error(
				`vegaFieldToPbCreateSpec: backendType no soportado por el harness: ${field.backendType}`
			);
	}
}
