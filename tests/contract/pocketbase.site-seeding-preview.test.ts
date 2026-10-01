import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import type { BackendPort } from '$lib/backend/port';
import {
	previewSiteSeed,
	SiteSeedDivergenceError,
	seedSiteProject,
	type SiteSeedPlanSummary,
	type SiteSeedResult
} from '$lib/backend/site-seeding';
import {
	seedLikePrevious0ace139,
	seedLikePrevious1bda988
} from '$lib/backend/site-seeding-previous.fixture';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import { createSiteSeedingAdmin, type SiteSeedingAdmin } from './pb-harness/site-seeding';
import { startPocketBase, type RunningPocketBase } from './pb-harness/server';

const AVAILABLE = isPocketBaseBinaryAvailable();
const RECORD_COLLECTIONS = ['pages', 'blocks', 'redirects', 'vega', 'vega_editors'] as const;

describe.skipIf(!AVAILABLE)('previewSiteSeed contra PocketBase real', () => {
	let running: RunningPocketBase | undefined;
	let admin: SiteSeedingAdmin;
	let port: BackendPort;

	beforeEach(async () => {
		running = await startPocketBase();
		admin = await createSiteSeedingAdmin(running);
		port = createPocketBaseBackend({ url: running.url });
		await port.login({ email: running.adminEmail, password: running.adminPassword });
	}, 30_000);

	afterEach(async () => {
		await running?.stop();
		running = undefined;
	});

	/**
	 * Todo lo que el servidor guarda de las colecciones del sembrado: esquema crudo (reglas,
	 * índices, campos) y registros. Si el preflight escribiera algo, esto cambiaría.
	 */
	async function serverState(): Promise<string> {
		const collections = await admin.collections.getFullList({ sort: 'name' });
		const records: Record<string, unknown> = {};
		for (const collection of collections) {
			if ((RECORD_COLLECTIONS as readonly string[]).includes(collection.name)) {
				records[collection.name] = await admin
					.collection(collection.name)
					.getFullList({ sort: 'id' });
			}
		}
		return JSON.stringify({ collections, records });
	}

	function visibleOnly(result: SiteSeedResult) {
		const addedFields = { ...result.addedFields };
		// `vega_editors` no se puede preflightar (ver la cabecera de `site-seeding.ts`).
		delete addedFields.vega_editors;
		return {
			createdCollections: result.createdCollections.filter((name) => name !== 'vega_editors'),
			addedFields,
			constrainedFields: result.constrainedFields,
			manifest: result.createdRecords.includes('manifest')
				? 'create'
				: result.upgradedRecords.includes('manifest')
					? 'upgrade'
					: 'keep',
			pageMissing: result.createdRecords.includes('page:/')
		};
	}

	function fromPlan(plan: SiteSeedPlanSummary) {
		return {
			createdCollections: plan.createdCollections,
			addedFields: plan.addedFields,
			constrainedFields: plan.constrainedFields,
			manifest: plan.manifest,
			pageMissing: plan.pageMissing
		};
	}

	/** El preflight no escribe, y lo que cuenta es exactamente lo que luego hace el sembrado. */
	async function expectPlanMatchesSeed(): Promise<SiteSeedPlanSummary> {
		const before = await serverState();
		const preview = await previewSiteSeed(port);
		expect(await serverState(), 'el preflight no escribe nada').toBe(before);
		if (preview.status !== 'ready') throw new Error('se esperaba un plan');

		const result = await seedSiteProject(port);
		expect(fromPlan(preview.plan)).toEqual(visibleOnly(result));
		return preview.plan;
	}

	test('desde limpio: el plan crea las cinco colecciones visibles, el manifiesto y «Inicio»', async () => {
		const plan = await expectPlanMatchesSeed();

		expect(plan.createdCollections).toEqual(['vega_media', 'pages', 'blocks', 'redirects', 'vega']);
		expect(plan.manifest).toBe('create');
		expect(plan.pageMissing).toBe(true);
	});

	test('tras sembrar el preflight dice «al día» y sigue sin escribir', async () => {
		await seedSiteProject(port);
		const before = await serverState();

		const preview = await previewSiteSeed(port);

		expect(preview).toMatchObject({ status: 'ready', plan: { upToDate: true } });
		expect(await serverState()).toBe(before);
	});

	test('un sitio sembrado con la versión anterior (1bda988): campos, colección y manifiesto coinciden', async () => {
		await seedLikePrevious1bda988(port);

		const plan = await expectPlanMatchesSeed();

		expect(plan.createdCollections).toEqual(['redirects']);
		expect(plan.manifest).toBe('upgrade');
		expect(plan.addedFields.pages).toEqual(
			expect.arrayContaining(['publishAt', 'description', 'socialImage', 'noindex'])
		);
	});

	test('un sitio con SEO pero sin created/updated ni patrones (0ace139): también las restricciones coinciden', async () => {
		await seedLikePrevious0ace139(port);

		const plan = await expectPlanMatchesSeed();

		expect(plan.constrainedFields).toEqual({ redirects: ['from', 'to'] });
		expect(plan.addedFields.redirects).toEqual(['created', 'updated']);
	});

	test('un patrón propio en redirects.to no entra en el plan', async () => {
		await seedLikePrevious0ace139(port);
		await port.addCollectionFieldPatterns!('redirects', { to: '^/solo-mio' });

		const plan = await expectPlanMatchesSeed();

		expect(plan.constrainedFields).toEqual({ redirects: ['from'] });
	});

	test('un manifiesto editado a mano: el preflight enseña la MISMA divergencia que aborta el sembrado', async () => {
		await seedSiteProject(port);
		const manifest = (await admin.collection('vega').getFullList())[0]!;
		await admin.collection('vega').update(manifest.id, { manifest: { editado: 'a mano' } });
		const before = await serverState();

		const preview = await previewSiteSeed(port);

		expect(await serverState()).toBe(before);
		expect(preview.status).toBe('blocked');
		if (preview.status !== 'blocked') return;
		const error = await seedSiteProject(port).then(
			() => null,
			(caught: unknown) => caught
		);
		expect(error).toBeInstanceOf(SiteSeedDivergenceError);
		expect(preview.divergences).toEqual((error as SiteSeedDivergenceError).divergences);
		expect(await serverState()).toBe(before);
	});
});
