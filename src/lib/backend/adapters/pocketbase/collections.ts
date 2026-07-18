/**
 * `ensureCollections` (Anexo A) sobre PocketBase real: crea, una a una y secuencialmente (para
 * no acumular colisiones de nombre), las colecciones ausentes. El guardarraíl del prefijo
 * (§A.4.3) ya se comprueba ANTES de llegar aquí (compartido con `memory`, ver `collections.ts`
 * del puerto); esta función asume que `specs` ya pasó esa validación.
 */

import type PocketBase from 'pocketbase';
import { ClientResponseError } from 'pocketbase';
import type { CollectionSpec, EnsureResult } from '../../collections';
import { collectionFieldSpecToPbField } from './schema';

export async function ensureCollectionsOnPocketBase(
	pb: PocketBase,
	specs: CollectionSpec[]
): Promise<EnsureResult> {
	const created: string[] = [];
	const skipped: string[] = [];

	for (const spec of specs) {
		const exists = await collectionExists(pb, spec.name);
		if (exists) {
			skipped.push(spec.name);
			continue;
		}
		await pb.collections.create({
			name: spec.name,
			type: 'base',
			fields: spec.fields.map(collectionFieldSpecToPbField)
			// Reglas de API cerradas por defecto (null = solo superuser), como todo en v1 (§A.4.5).
		});
		created.push(spec.name);
	}

	return { created, skipped };
}

async function collectionExists(pb: PocketBase, name: string): Promise<boolean> {
	try {
		await pb.collections.getOne(name);
		return true;
	} catch (err) {
		if (err instanceof ClientResponseError && err.status === 404) return false;
		throw err;
	}
}
