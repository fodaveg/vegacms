/**
 * Carrera sobre el manifiesto: entre el preflight y `saveManifest`, otro editor guarda el suyo.
 * `seedSiteProject` relee el registro justo antes de escribir y aborta si ya no es el que vio el
 * preflight (`assertManifestUnchanged`), en vez de pisar el cambio con el manifiesto fusionado.
 *
 * El «otro editor» se simula con un espía sobre `ensureCollections`: justo después de que el
 * sembrado cree una colección concreta, escribe en el manifiesto por el mismo puerto.
 */

import { describe, expect, test, vi } from 'vitest';
import { createMemoryBackend, type MemoryBackendPort } from './adapters/memory';
import { VegaError } from './errors';
import { seedSiteProject } from './site-seeding';
import { SITE_SEED_BLOG_MODULE } from './site-seeding-blog';
import type { JsonValue } from './types';

async function authedMemory(): Promise<MemoryBackendPort> {
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'test-password' });
	return port;
}

/** Ejecuta `action` justo después de que el sembrado cree la colección `collection`. */
function afterEnsuring(port: MemoryBackendPort, collection: string, action: () => Promise<void>) {
	const original = port.ensureCollections.bind(port);
	return vi.spyOn(port, 'ensureCollections').mockImplementation(async (specs) => {
		const result = await original(specs);
		if (specs.some((spec) => spec.name === collection)) await action();
		return result;
	});
}

async function manifestRecord(port: MemoryBackendPort) {
	return (await port.list('vega', { perPage: 2 })).items;
}

describe('carrera sobre el manifiesto durante el sembrado', () => {
	test('un manifiesto que ya existía y cambia tras el preflight: aborta sin pisarlo y repetir converge', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);
		const [record] = await manifestRecord(port);
		const saved = structuredClone(record!.values.manifest) as {
			collections: Record<string, { label?: string }>;
		};
		saved.collections.pages = { ...saved.collections.pages, label: 'Páginas, por otro editor' };
		const theirs = saved as unknown as JsonValue;
		const spy = afterEnsuring(port, 'tags', async () => {
			await port.update('vega', record!.id, { manifest: theirs });
		});

		const error = await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] }).catch(
			(thrown: unknown) => thrown
		);

		expect(error).toBeInstanceOf(VegaError);
		expect((error as VegaError).message).toContain('El manifiesto cambió');
		const [after] = await manifestRecord(port);
		// Lo guardado es lo de OTRO editor, tal cual: sin las entradas del blog.
		expect(after!.values.manifest).toEqual(theirs);
		expect(
			(after!.values.manifest as { collections: Record<string, unknown> }).collections
		).not.toHaveProperty('posts');
		// Lo aditivo sí quedó hecho.
		expect((await port.listContentTypes()).map((type) => type.name)).toContain('tags');

		// Repetir, ya sin carrera, recalcula sobre lo que hay y conserva el cambio de la otra persona.
		spy.mockRestore();
		const again = await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });
		expect(again.upgradedRecords).toEqual(['manifest']);
		const [final] = await manifestRecord(port);
		const finalCollections = (
			final!.values.manifest as { collections: Record<string, { label?: string }> }
		).collections;
		expect(finalCollections.pages!.label).toBe('Páginas, por otro editor');
		expect(finalCollections).toHaveProperty('posts');
	});

	test('sin manifiesto en el preflight y otro lo crea antes de escribir: aborta sin pisarlo', async () => {
		const port = await authedMemory();
		const theirs = { appName: 'Creado por otro editor', collections: {} } as JsonValue;
		afterEnsuring(port, 'vega', async () => {
			await port.create('vega', { manifest: theirs });
		});

		await expect(seedSiteProject(port)).rejects.toThrow('El manifiesto cambió');

		const records = await manifestRecord(port);
		expect(records).toHaveLength(1);
		expect(records[0]!.values.manifest).toEqual(theirs);
	});

	test('el mismo contenido con otro orden de claves NO es un cambio (PocketBase no conserva el orden)', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);
		const [record] = await manifestRecord(port);
		const manifest = record!.values.manifest as Record<string, JsonValue>;
		const reordered = Object.fromEntries(Object.entries(manifest).reverse()) as JsonValue;
		afterEnsuring(port, 'tags', async () => {
			await port.update('vega', record!.id, { manifest: reordered });
		});

		const result = await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });

		expect(result.upgradedRecords).toEqual(['manifest']);
	});

	test('sin carrera, el sembrado escribe el manifiesto como siempre', async () => {
		const port = await authedMemory();

		const result = await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });

		expect(result.createdRecords).toContain('manifest');
		expect(await manifestRecord(port)).toHaveLength(1);
	});
});
