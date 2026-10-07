/** Sonda aislada del escritor anterior: su JSON Schema no conocía `hideCreate`.
 * El sembrado conserva su preflight real y todas las escrituras se espían. */
import { describe, expect, test, vi } from 'vitest';
import { createMemoryBackend } from './adapters/memory';
import { seedSiteProject, SiteSeedDivergenceError } from './site-seeding';
import { SITE_SEED_CONTACT_MODULE } from './site-seeding-contact';
import type { JsonValue } from './types';

const legacy = vi.hoisted(() => ({ enabled: false }));
vi.mock('$lib/model/validate', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/model/validate')>();
	const { default: Ajv2020 } = await import('ajv/dist/2020');
	const { default: schema } = await import('$lib/model/manifest-schema.json');
	const oldSchema = structuredClone(schema);
	delete (
		oldSchema.properties.collections.additionalProperties.properties as Record<string, unknown>
	).hideCreate;
	const validateOld = new Ajv2020({ strict: true, allErrors: true }).compile(oldSchema);
	return {
		...actual,
		validateManifestStrict(raw: JsonValue) {
			if (legacy.enabled && !validateOld(raw)) {
				return {
					ok: false,
					errors: [
						{
							path: '/collections/messages/hideCreate',
							message: 'Clave desconocida para el escritor anterior.'
						}
					]
				};
			}
			return actual.validateManifestStrict(raw);
		}
	};
});

/** Fragmento que ofrecía contacto antes de esta adición; el resto del módulo es idéntico. */
function oldContactModule() {
	const module = structuredClone(SITE_SEED_CONTACT_MODULE);
	const collections = (module.manifest as Record<string, JsonValue>).collections as Record<
		string,
		Record<string, JsonValue>
	>;
	delete collections.messages!.hideCreate;
	return module;
}

async function prepared() {
	legacy.enabled = false;
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'test-password' });
	await seedSiteProject(port, { modules: [SITE_SEED_CONTACT_MODULE] });
	const record = (await port.list('vega', { perPage: 1 })).items[0]!;
	return { port, record };
}

function watchWrites(port: Awaited<ReturnType<typeof prepared>>['port']) {
	return (['ensureCollections', 'addCollectionFields', 'create', 'update', 'delete'] as const).map(
		(key) => vi.spyOn(port, key)
	);
}

describe('compatibilidad con escritor anterior a hideCreate', () => {
	test('clave desconocida con adiciones pendientes aborta antes de cualquier escritura', async () => {
		const { port, record } = await prepared();
		const saved = structuredClone(record.values.manifest) as Record<string, JsonValue>;
		const collections = saved.collections as Record<string, Record<string, JsonValue>>;
		delete collections.pages!.label;
		await port.update('vega', record.id, { manifest: saved });
		const writes = watchWrites(port);
		legacy.enabled = true;
		await expect(seedSiteProject(port, { modules: [oldContactModule()] })).rejects.toBeInstanceOf(
			SiteSeedDivergenceError
		);
		for (const spy of writes) expect(spy).not.toHaveBeenCalled();
		expect((await port.get('vega', record.id)).values.manifest).toEqual(saved);
	});

	test('sin entradas que añadir conserva keep antes de validar, aun con clave desconocida', async () => {
		const { port, record } = await prepared();
		const update = vi.spyOn(port, 'update');
		legacy.enabled = true;
		const result = await seedSiteProject(port, { modules: [oldContactModule()] });
		expect(result.upgradedRecords).toEqual([]);
		expect(update).not.toHaveBeenCalled();
		expect((await port.get('vega', record.id)).values.manifest).toEqual(record.values.manifest);
	});

	test('fragmento nuevo con escritor anterior falla antes de crear colecciones', async () => {
		legacy.enabled = true;
		const port = createMemoryBackend();
		await port.login({ email: 'admin@vega.test', password: 'test-password' });
		const writes = watchWrites(port);
		await expect(seedSiteProject(port, { modules: [SITE_SEED_CONTACT_MODULE] })).rejects.toThrow(
			'no forman un manifiesto válido'
		);
		for (const spy of writes) expect(spy).not.toHaveBeenCalled();
	});
});
