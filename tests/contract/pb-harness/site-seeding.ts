/**
 * Acceso raw al servidor efímero para medir el sembrado. Vive en el harness porque el contrato
 * L1 prohíbe que las suites importen el SDK PocketBase directamente fuera de esta infraestructura.
 */

import PocketBase, { ClientResponseError, type CollectionModel } from 'pocketbase';
import type { RunningPocketBase } from './server';

export type SiteSeedingAdmin = PocketBase;
export type SiteSeedingCollectionModel = CollectionModel;

export async function createSiteSeedingAdmin(
	running: RunningPocketBase
): Promise<SiteSeedingAdmin> {
	const admin = new PocketBase(running.url);
	admin.autoCancellation(false);
	await admin.collection('_superusers').authWithPassword(running.adminEmail, running.adminPassword);
	return admin;
}

export function isPocketBaseNotFound(error: unknown): boolean {
	return error instanceof ClientResponseError && error.status === 404;
}
