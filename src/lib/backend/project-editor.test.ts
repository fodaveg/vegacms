import { describe, expect, test, vi } from 'vitest';
import type { CollectionSpec } from './collections';
import { createMemoryBackend } from './adapters/memory';
import { projectEditorAuthCollection, resolveProjectEditorCollection } from './project-editor';
import { previewSiteSeed, seedSiteProject, type SiteSeedModule } from './site-seeding';
import { SITE_SEED_OPTIONAL_MODULES } from './site-seeding-modules';
import { buildFormInbox, FORM_INBOX_CREATE_RULE } from '$lib/forms/form-inbox';
import { ensureMediaCollection } from '$lib/media/media-collection';
import { ensureMediaFolders } from '$lib/media/media-folders';
import { newFieldDraft } from '$lib/model/editor/field-draft';
import { generateSchemaMigration } from './migration';

const users = { editorAuthCollection: 'users' };
const identity = '(@request.auth.collectionName = "users" && @request.auth.id != "")';

describe('project editor policy', () => {
	test('form migration export uses the applied editor identity and preserves the public guards', () => {
		const form = buildFormInbox({
			name: 'registro_export',
			label: 'Registro',
			singular: '',
			fields: [{ label: 'Nombre', draft: { ...newFieldDraft(), name: 'name' }, longText: false }]
		});
		const migration = generateSchemaMigration({
			kind: 'create',
			specs: form.collections.map((spec) => resolveProjectEditorCollection(spec, users))
		});
		expect(migration.contents).toContain(JSON.stringify(identity));
		expect(migration.contents).toContain(JSON.stringify(FORM_INBOX_CREATE_RULE));
		expect(migration.contents).not.toContain('vega_editors');
		expect(migration.contents).not.toContain('projectEditorRules');
	});

	test('raw rules remain literal, including text identical to a canonical rule', () => {
		const raw: CollectionSpec = {
			name: 'explicit',
			fields: [],
			listRule: '@request.auth.collectionName = "vega_editors"',
			viewRule: '',
			createRule: null
		};
		expect(resolveProjectEditorCollection(raw, users)).toBe(raw);
		expect(() => projectEditorAuthCollection({ editorAuthCollection: '_superusers' })).toThrow();
		expect(() => projectEditorAuthCollection({ editorAuthCollection: 'users" || true' })).toThrow();
	});

	test('only the opt-in identity changes; default, deny, public and compound guards remain', () => {
		const spec: CollectionSpec = {
			projectEditorRules: true,
			name: 'template',
			fields: [],
			listRule: null,
			viewRule: '',
			createRule: FORM_INBOX_CREATE_RULE,
			updateRule:
				'@request.auth.collectionName = "vega_editors" && @request.body.key:isset = false',
			deleteRule: 'status = "published" || @request.auth.collectionName = "vega_editors"'
		};
		expect(resolveProjectEditorCollection(spec, {})).toBe(spec);
		expect(resolveProjectEditorCollection(spec, users)).toMatchObject({
			listRule: null,
			viewRule: '',
			createRule: FORM_INBOX_CREATE_RULE,
			updateRule: `${identity} && @request.body.key:isset = false`,
			deleteRule: `status = "published" || ${identity}`
		});
		expect(spec.updateRule).toContain('vega_editors');
	});

	test('custom auth is checked before any write and is never created or completed', async () => {
		const base = createMemoryBackend();
		await base.login({ email: 'admin@vega.test', password: 'test-password' });
		const ensure = vi.spyOn(base, 'ensureCollections');
		const port = {
			...base,
			...users,
			assertEditorAuthCollection: vi.fn(async () => {
				throw new Error('missing users');
			})
		};
		await expect(seedSiteProject(port)).rejects.toThrow('missing users');
		expect(ensure).not.toHaveBeenCalled();
		expect(await base.listContentTypes()).toEqual([]);
	});

	test('custom project creates all first-party modules and new forms; preflight matches execution', async () => {
		const base = createMemoryBackend();
		await base.login({ email: 'admin@vega.test', password: 'test-password' });
		await base.ensureCollections([{ name: 'users', type: 'auth', fields: [] }]);
		const authBefore = base.inspectCollection('users');
		const invitation = vi.spyOn(base.administration!, 'ensureInvitationLink');
		const port = { ...base, ...users, assertEditorAuthCollection: vi.fn(async () => {}) };
		const form = buildFormInbox({
			name: 'inscripciones',
			label: 'Inscripciones',
			singular: '',
			fields: [{ label: 'Nombre', draft: { ...newFieldDraft(), name: 'name' }, longText: false }]
		});
		const modules = [...SITE_SEED_OPTIONAL_MODULES, form];
		await seedSiteProject(port, { modules, passwordResetUrl: 'https://example.test/reset' });
		expect(base.inspectCollection('users')).toEqual(authBefore);
		expect(base.inspectCollection('vega_editors')).toBeNull();
		expect(invitation).not.toHaveBeenCalled();
		for (const name of [
			'vega_media',
			'vega_media_folders',
			'posts',
			'authors',
			'categories',
			'menu_items',
			'messages',
			'inscripciones'
		]) {
			expect((await port.collectionRules!([name]))[name].updateRule).toBe(identity);
		}
		expect((await port.collectionRules!(['inscripciones'])).inscripciones.createRule).toBe(
			FORM_INBOX_CREATE_RULE
		);
		expect((await port.collectionRules!(['site_settings'])).site_settings.updateRule).toBe(
			`${identity} && @request.body.key:isset = false`
		);
		const preview = await previewSiteSeed(port, { modules });
		expect(preview.status).toBe('ready');
		if (preview.status === 'ready') {
			expect(preview.plan.upToDate).toBe(true);
			expect(preview.modules.flatMap((module) => module.ruleDifferences)).toEqual([]);
		}
		const explicit: SiteSeedModule = {
			id: 'explicit',
			collections: [
				{ name: 'explicit', fields: [], listRule: '@request.auth.collectionName = "vega_editors"' }
			],
			manifest: {}
		};
		await seedSiteProject(port, { modules: [explicit] });
		expect((await port.collectionRules!(['explicit'])).explicit.listRule).toContain('vega_editors');
		expect(base.inspectCollection('users')).toEqual(authBefore);
	});

	test('standalone media bootstrap uses the same policy, without creating any auth', async () => {
		const base = createMemoryBackend();
		await base.login({ email: 'admin@vega.test', password: 'test-password' });
		const port = { ...base, ...users, assertEditorAuthCollection: vi.fn(async () => {}) };
		await ensureMediaCollection(port);
		await ensureMediaFolders(port);
		expect((await port.collectionRules!(['vega_media'])).vega_media.viewRule).toBe('');
		expect((await port.collectionRules!(['vega_media_folders'])).vega_media_folders.listRule).toBe(
			identity
		);
		expect(base.inspectCollection('vega_editors')).toBeNull();
	});
});
