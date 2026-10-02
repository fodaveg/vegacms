/**
 * Reglas de acceso de una colección de módulo que YA existe (`tags`, `posts`, `messages` son
 * nombres genéricos): el preflight las compara con las del módulo y, si difieren, el módulo no se
 * añade sin una confirmación expresa (`SiteSeedOptions.confirmRuleDifferences`).
 */

import { describe, expect, test } from 'vitest';
import { createMemoryBackend, type MemoryBackendPort } from './adapters/memory';
import type { BackendPort } from './port';
import {
	previewSiteSeed,
	seedSiteProject,
	SITE_SEED_EDITOR_ACCESS_RULE,
	SiteSeedRuleDifferencesError,
	type SiteSeedModulePlan
} from './site-seeding';
import { SITE_SEED_BLOG_MODULE } from './site-seeding-blog';
import { CONTACT_CREATE_RULE, SITE_SEED_CONTACT_MODULE } from './site-seeding-contact';

async function seededMemory(): Promise<MemoryBackendPort> {
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'test-password' });
	await seedSiteProject(port);
	return port;
}

/** Una `messages` anterior al módulo: compatible en sus campos, con la bandeja ABIERTA sin sesión. */
async function previousOpenMessages(port: MemoryBackendPort): Promise<void> {
	await port.ensureCollections([
		{
			name: 'messages',
			listRule: '',
			viewRule: null,
			createRule: '',
			updateRule: null,
			deleteRule: null,
			fields: [
				{ name: 'name', type: 'text', required: true, max: 200 },
				{ name: 'email', type: 'email', required: true },
				{ name: 'message', type: 'text', required: true, max: 5000 }
			]
		}
	]);
}

async function planOf(port: BackendPort, module: typeof SITE_SEED_CONTACT_MODULE) {
	const preview = await previewSiteSeed(port, { modules: [module] });
	if (preview.status !== 'ready') throw new Error('se esperaba un plan');
	return preview.modules.find((item) => item.id === module.id) as SiteSeedModulePlan;
}

describe('reglas de una colección de módulo que ya existe', () => {
	test('el plan dice qué colección, qué regla, su valor actual y el esperado', async () => {
		const port = await seededMemory();
		await previousOpenMessages(port);

		const plan = await planOf(port, SITE_SEED_CONTACT_MODULE);

		expect(plan.ruleDifferences).toEqual([
			{
				collection: 'messages',
				rule: 'listRule',
				actual: '',
				expected: SITE_SEED_EDITOR_ACCESS_RULE
			},
			{
				collection: 'messages',
				rule: 'viewRule',
				actual: null,
				expected: SITE_SEED_EDITOR_ACCESS_RULE
			},
			{ collection: 'messages', rule: 'createRule', actual: '', expected: CONTACT_CREATE_RULE },
			{
				collection: 'messages',
				rule: 'updateRule',
				actual: null,
				expected: SITE_SEED_EDITOR_ACCESS_RULE
			},
			{
				collection: 'messages',
				rule: 'deleteRule',
				actual: null,
				expected: SITE_SEED_EDITOR_ACCESS_RULE
			}
		]);
		// Es información del plan, no un bloqueo: el preflight sigue siendo «ready».
		expect(plan.addedFields.messages).toEqual(['read', 'notifyState', 'created']);
	});

	test('sin confirmación no se escribe NADA: ni campos ni manifiesto', async () => {
		const port = await seededMemory();
		await previousOpenMessages(port);
		const before = await port.listContentTypes();
		const manifestBefore = (await port.list('vega', { perPage: 1 })).items[0]!.values.manifest;

		const error = await seedSiteProject(port, { modules: [SITE_SEED_CONTACT_MODULE] }).catch(
			(thrown: unknown) => thrown
		);

		expect(error).toBeInstanceOf(SiteSeedRuleDifferencesError);
		const differences = (error as SiteSeedRuleDifferencesError).differences;
		expect(Object.keys(differences)).toEqual(['contacto']);
		expect(differences.contacto).toHaveLength(5);
		expect((error as Error).message).toContain('messages.listRule está en ""');
		expect(await port.listContentTypes()).toEqual(before);
		expect((await port.list('vega', { perPage: 1 })).items[0]!.values.manifest).toEqual(
			manifestBefore
		);
	});

	test('confirmado, el módulo se añade con las reglas que había: no se cambian', async () => {
		const port = await seededMemory();
		await previousOpenMessages(port);

		const result = await seedSiteProject(port, {
			modules: [SITE_SEED_CONTACT_MODULE],
			confirmRuleDifferences: ['contacto']
		});

		expect(result.addedFields.messages).toEqual(['read', 'notifyState', 'created']);
		expect(result.upgradedRecords).toEqual(['manifest']);
		expect(port.inspectCollection('messages')?.rules).toMatchObject({
			listRule: '',
			viewRule: null,
			createRule: ''
		});
	});

	test('confirmar un módulo no confirma otro', async () => {
		const port = await seededMemory();
		await previousOpenMessages(port);
		await port.ensureCollections([
			{
				name: 'tags',
				listRule: null,
				viewRule: null,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: 'name', type: 'text', required: true },
					{ name: 'slug', type: 'text', required: true, unique: true }
				]
			}
		]);

		const error = await seedSiteProject(port, {
			modules: [SITE_SEED_BLOG_MODULE, SITE_SEED_CONTACT_MODULE],
			confirmRuleDifferences: ['contacto']
		}).catch((thrown: unknown) => thrown);

		expect(error).toBeInstanceOf(SiteSeedRuleDifferencesError);
		expect(Object.keys((error as SiteSeedRuleDifferencesError).differences)).toEqual(['blog']);
	});

	test('un módulo con las reglas del módulo no tiene diferencias y no pide confirmación', async () => {
		const port = await seededMemory();
		await seedSiteProject(port, { modules: [SITE_SEED_CONTACT_MODULE] });

		expect((await planOf(port, SITE_SEED_CONTACT_MODULE)).ruleDifferences).toEqual([]);
		await expect(
			seedSiteProject(port, { modules: [SITE_SEED_CONTACT_MODULE] })
		).resolves.toBeDefined();
	});

	test('un módulo que ya está completo y no tiene nada que escribir no pide confirmación', async () => {
		const port = await seededMemory();
		await previousOpenMessages(port);
		await seedSiteProject(port, {
			modules: [SITE_SEED_CONTACT_MODULE],
			confirmRuleDifferences: ['contacto']
		});

		// Las reglas siguen distintas (se ve en el plan) pero no hay nada que añadir.
		expect((await planOf(port, SITE_SEED_CONTACT_MODULE)).ruleDifferences).toHaveLength(5);
		await expect(
			seedSiteProject(port, { modules: [SITE_SEED_CONTACT_MODULE] })
		).resolves.toMatchObject({ createdCollections: [], addedFields: {} });
	});

	test('un módulo cuyas colecciones no existen no tiene nada que comparar', async () => {
		const port = await seededMemory();

		expect((await planOf(port, SITE_SEED_CONTACT_MODULE)).ruleDifferences).toEqual([]);
	});

	test('un puerto que no sabe leer reglas no las compara (y no rompe)', async () => {
		const port = await seededMemory();
		await previousOpenMessages(port);
		const blind: BackendPort = { ...port, collectionRules: undefined };

		expect((await planOf(blind, SITE_SEED_CONTACT_MODULE)).ruleDifferences).toEqual([]);
		await expect(
			seedSiteProject(blind, { modules: [SITE_SEED_CONTACT_MODULE] })
		).resolves.toBeDefined();
	});
});
