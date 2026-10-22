import { expect, test } from 'vitest';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { seedSiteProject, previewSiteSeed } from '$lib/backend/site-seeding';
import { generateSchemaMigration } from '$lib/backend/migration';
import { newFieldDraft } from '$lib/model/editor/field-draft';
import {
	buildFormInbox,
	isFormInbox,
	FORM_INBOX_CREATE_RULE,
	RESERVED_FORM_FIELDS
} from './form-inbox';
import { enableInboxRateLimit } from './form-rate-limits';
const input = () => ({
	name: 'inscripciones',
	label: 'Inscripciones',
	singular: 'Inscripción',
	fields: [
		{
			label: 'Nombre',
			longText: false,
			draft: { ...newFieldDraft(), name: 'name', required: true }
		},
		{
			label: 'Correo',
			longText: false,
			draft: { ...newFieldDraft(), name: 'email', type: 'email' as const }
		}
	]
});
test('constructor con columnas fijas, reglas y manifiesto; rechaza reservados', () => {
	const module = buildFormInbox(input());
	expect(module.collections[0].createRule).toBe(FORM_INBOX_CREATE_RULE);
	expect(module.collections[0].fields.at(-2)).toMatchObject({ name: 'notifyState', hidden: true });
	expect(JSON.stringify(module.manifest)).toContain('hideCreate');
	for (const name of RESERVED_FORM_FIELDS) {
		const draft = input();
		draft.fields[0].draft.name = name;
		expect(() => buildFormInbox(draft)).toThrow('forms.reservedField');
	}
});
test('migración conserva hidden en texto', () => {
	const migration = generateSchemaMigration({
		kind: 'create',
		specs: [...buildFormInbox(input()).collections]
	});
	expect(migration.contents).toContain('"hidden": true');
});
test('módulo dinámico pasa preflight, escribe, repite sin cambios y bloquea divergencia', async () => {
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'x' });
	await seedSiteProject(port);
	const module = buildFormInbox(input());
	expect((await previewSiteSeed(port, { modules: [module] })).status).toBe('ready');
	const first = await seedSiteProject(port, { modules: [module] });
	expect(first.createdCollections).toContain('inscripciones');
	const second = await seedSiteProject(port, { modules: [module] });
	expect(second.createdCollections).toEqual([]);
	const bad = input();
	bad.fields[0].draft.type = 'bool';
	expect((await previewSiteSeed(port, { modules: [buildFormInbox(bad)] })).status).toBe('blocked');
});
test('límite relee y preserva lista ajena; repetido no duplica', async () => {
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'x' });
	const settings = port.serverSettings!;
	await settings.update({
		rateLimits: {
			enabled: false,
			rules: [{ label: 'users:auth', audience: '', duration: 60, maxRequests: 10 }],
			excludedIPs: ['10.0.0.1']
		}
	});
	await enableInboxRateLimit(settings, 'inscripciones');
	await enableInboxRateLimit(settings, 'inscripciones');
	const rate = (await settings.get()).rateLimits!;
	expect(rate.enabled).toBe(true);
	expect(rate.rules).toHaveLength(2);
	expect(rate.rules[0].label).toBe('users:auth');
	expect(rate.excludedIPs).toEqual(['10.0.0.1']);
});

test('identificación estructural exige texto oculto y autodate normalizado', async () => {
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'x' });
	await seedSiteProject(port);
	await seedSiteProject(port, { modules: [buildFormInbox(input())] });
	const schema = (await port.listContentTypes()).find((type) => type.name === 'inscripciones')!;
	expect(isFormInbox(schema)).toBe(true);
	for (const change of [{ hidden: false }, { type: 'bool' as const }]) {
		expect(
			isFormInbox({
				...schema,
				fields: schema.fields.map((field) =>
					field.name === 'notifyState' ? { ...field, ...change } : field
				)
			})
		).toBe(false);
	}
	expect(
		isFormInbox({
			...schema,
			fields: schema.fields.map((field) =>
				field.name === 'created' ? { ...field, readonly: false } : field
			)
		})
	).toBe(false);
});

test('vocabulario limitado, máximos y siguiente orden del grupo Sitio', () => {
	const draft = input();
	draft.fields[0].longText = true;
	const module = buildFormInbox(draft, { collections: { old: { group: 'Sitio', order: 7 } } });
	expect(module.collections[0].fields[0]).toMatchObject({ type: 'text', max: 5000 });
	expect(module.collections[0].listRule).toBe(module.collections[0].updateRule);
	expect(module.collections[0].deleteRule).toBe(module.collections[0].viewRule);
	expect(module.manifest).toMatchObject({
		collections: {
			inscripciones: {
				order: 8,
				hideCreate: true,
				titleField: 'name',
				subtitleField: 'email',
				fields: { name: { label: 'Nombre', widget: 'textarea' } }
			}
		}
	});
	for (const type of ['json', 'relation', 'image', 'editor'] as const) {
		const invalid = input();
		invalid.fields[0].draft.type = type;
		expect(() => buildFormInbox(invalid)).toThrow('forms.invalidType');
	}
	for (const name of ['vega', 'vega_custom', '_private', 'bad-name']) {
		expect(() => buildFormInbox({ ...input(), name })).toThrow('forms.invalidName');
	}
});
