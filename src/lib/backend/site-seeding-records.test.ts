import { describe, expect, test, vi } from 'vitest';
import { createMemoryBackend } from './adapters/memory';
import {
	previewSiteSeed,
	seedSiteProject,
	SiteSeedDivergenceError,
	SiteSeedRuleDifferencesError,
	type SiteSeedModule
} from './site-seeding';
import { SITE_SEED_MENUS_MODULE } from './site-seeding-menus';
import { buildPlanView, siteModuleState } from '$lib/admin/site-base';
import { t } from '$lib/i18n';

async function backend() {
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'test-password' });
	await seedSiteProject(port);
	return port;
}
const options = { modules: [SITE_SEED_MENUS_MODULE] };

describe('registros iniciales de módulos por clave única', () => {
	test('el plan enumera las claves y el diálogo las muestra; crea faltantes y no toca existentes', async () => {
		const port = await backend();
		const preview = await previewSiteSeed(port, options);
		expect(preview.status).toBe('ready');
		if (preview.status !== 'ready') return;
		const plan = preview.modules.find((module) => module.id === 'menus')!;
		expect(plan.createdRecords).toEqual([
			{ collection: 'menus', keyField: 'key', key: 'principal' },
			{ collection: 'menus', keyField: 'key', key: 'pie' }
		]);
		const view = buildPlanView(preview.plan, (key, params) => t('es', key, params), {
			modules: preview.modules,
			target: 'menus'
		});
		expect(view.groups.flatMap((group) => group.items).map((item) => item.code)).toContain(
			'menus.key = principal'
		);
		const first = await seedSiteProject(port, options);
		expect(first.createdModuleRecords).toEqual(plan.createdRecords);
		const existing = (
			await port.list('menus', {
				filter: { kind: 'cond', field: 'key', op: 'eq', value: 'principal' }
			})
		).items[0]!;
		await port.update('menus', existing.id, { name: 'Mi navegación' });
		const create = vi.spyOn(port, 'create');
		const update = vi.spyOn(port, 'update');
		const second = await seedSiteProject(port, options);
		expect(second.createdModuleRecords).toBeUndefined();
		expect(create).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
		expect((await port.get('menus', existing.id)).values.name).toBe('Mi navegación');
	});

	test('si se borra solo un registro el módulo está incompleto y la siguiente pasada lo repone', async () => {
		const port = await backend();
		await seedSiteProject(port, options);
		const record = (await port.list('menus')).items[0]!;
		await port.delete('menus', record.id);
		const preview = await previewSiteSeed(port, options);
		expect(preview.status).toBe('ready');
		if (preview.status !== 'ready') return;
		const plan = preview.modules.find((module) => module.id === 'menus')!;
		expect(preview.plan.upToDate).toBe(false);
		expect(siteModuleState(SITE_SEED_MENUS_MODULE, plan)).toBe('incomplete');
		expect(plan.createdRecords).toHaveLength(1);
		expect((await seedSiteProject(port, options)).createdModuleRecords).toHaveLength(1);
	});

	test.each(['unique', 'type'] as const)(
		'una clave existente con %s incompatible bloquea antes de escribir',
		async (property) => {
			const port = await backend();
			await port.ensureCollections([
				{
					name: 'menus',
					fields: [
						{
							name: 'key',
							type: property === 'type' ? 'number' : 'text',
							required: true
						}
					]
				}
			]);
			const ensure = vi.spyOn(port, 'ensureCollections');
			await expect(seedSiteProject(port, options)).rejects.toBeInstanceOf(SiteSeedDivergenceError);
			expect(ensure).not.toHaveBeenCalled();
		}
	);

	test('no añade una clave obligatoria única sobre registros que ya existen sin ella', async () => {
		const port = await backend();
		await port.ensureCollections([
			{ name: 'menus', fields: [{ name: 'name', type: 'text', required: true, max: 80 }] }
		]);
		await port.create('menus', { name: 'Menú previo' });
		const create = vi.spyOn(port, 'create');
		const preview = await previewSiteSeed(port, options);
		expect(preview).toMatchObject({
			status: 'blocked',
			divergences: [
				expect.objectContaining({ piece: 'registro "menus/principal"' }),
				expect.objectContaining({ piece: 'registro "menus/pie"' })
			]
		});
		expect(create).not.toHaveBeenCalled();
	});

	test('el registro creado por otro escritor tras el preflight se conserva en la relectura', async () => {
		const port = await backend();
		await seedSiteProject(port, options);
		const record = (await port.list('menus')).items[0]!;
		await port.delete('menus', record.id);
		const ensure = port.ensureCollections.bind(port);
		let inserted = false;
		vi.spyOn(port, 'ensureCollections').mockImplementation(async (specs) => {
			if (!inserted) {
				inserted = true;
				await port.create('menus', { key: record.values.key, name: 'Otro escritor' });
			}
			return ensure(specs);
		});
		const result = await seedSiteProject(port, options);
		expect(result.createdModuleRecords).toBeUndefined();
		expect((await port.list('menus')).items.map((item) => item.values.name)).toContain(
			'Otro escritor'
		);
	});

	test('un registro ausente también exige confirmar las reglas distintas aunque no falten campos ni manifiesto', async () => {
		const port = await backend();
		await seedSiteProject(port, options);
		await port.delete('menus', (await port.list('menus')).items[0]!.id);
		vi.spyOn(port, 'collectionRules').mockResolvedValue({
			menus: {
				listRule: null,
				viewRule: null,
				createRule: null,
				updateRule: null,
				deleteRule: null
			}
		});
		await expect(seedSiteProject(port, options)).rejects.toBeInstanceOf(
			SiteSeedRuleDifferencesError
		);
	});

	test('una clave repetida detectada por la lectura bloquea el lote sin escrituras', async () => {
		const port = await backend();
		await seedSiteProject(port, options);
		const list = port.list.bind(port);
		vi.spyOn(port, 'list').mockImplementation(async (type, query) => {
			const result = await list(type, query);
			return type === 'menus' ? { ...result, totalItems: 2 } : result;
		});
		const ensure = vi.spyOn(port, 'ensureCollections');
		await expect(seedSiteProject(port, options)).rejects.toBeInstanceOf(SiteSeedDivergenceError);
		expect(ensure).not.toHaveBeenCalled();
	});

	test('un fallo al leer registros nunca cuenta como ausencia y no empieza a escribir', async () => {
		const port = await backend();
		await seedSiteProject(port, options);
		const list = port.list.bind(port);
		vi.spyOn(port, 'list').mockImplementation((type, query) =>
			type === 'menus' ? Promise.reject(new Error('red indisponible')) : list(type, query)
		);
		const ensure = vi.spyOn(port, 'ensureCollections');
		await expect(seedSiteProject(port, options)).rejects.toThrow('red indisponible');
		expect(ensure).not.toHaveBeenCalled();
	});

	test('rechaza un registro sin clave única declarada antes de leer o escribir', async () => {
		const port = await backend();
		const list = vi.spyOn(port, 'listContentTypes');
		const invalid: SiteSeedModule = {
			id: 'invalido',
			collections: [],
			manifest: {},
			records: [{ collection: 'menus', keyField: 'key', key: 'principal' }]
		};
		await expect(seedSiteProject(port, { modules: [invalid] })).rejects.toThrow(
			'requiere una clave'
		);
		expect(list).not.toHaveBeenCalled();
	});
});
