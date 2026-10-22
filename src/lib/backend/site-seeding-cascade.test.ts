/** La política de borrado forma parte del contrato físico de una relación existente. */
import { describe, expect, test, vi } from 'vitest';
import { createMemoryBackend } from './adapters/memory';
import type { Field } from './types';
import {
	actualFieldShape,
	expectedFieldShape,
	previewSiteSeed,
	sameShape,
	seedSiteProject,
	SITE_SEED_BASE_MODULE,
	SiteSeedDivergenceError
} from './site-seeding';
import { SITE_SEED_BLOG_MODULE } from './site-seeding-blog';
import { SITE_SEED_MENUS_MODULE } from './site-seeding-menus';
import { SITE_SEED_SITE_SETTINGS_MODULE } from './site-seeding-site-settings';

const relations = [
	SITE_SEED_BASE_MODULE,
	SITE_SEED_BLOG_MODULE,
	SITE_SEED_MENUS_MODULE,
	SITE_SEED_SITE_SETTINGS_MODULE
].flatMap((module) =>
	module.collections.flatMap((collection) =>
		collection.fields.flatMap((field) =>
			field.type === 'relation' ? [{ module, collection: collection.name, field }] : []
		)
	)
);

describe('sembrado: política de borrado de relaciones', () => {
	test.each(relations)(
		'$collection.$field.name con cascadeDelete distinto bloquea antes de escribir',
		async ({ module, collection, field }) => {
			const port = createMemoryBackend();
			await port.login({ email: 'admin@vega.test', password: 'test-password' });
			await seedSiteProject(port, { modules: [module] });
			// Reproduce un cambio de esquema externo tal como lo descubre el adaptador.
			const types = await port.listContentTypes();
			vi.spyOn(port, 'listContentTypes').mockResolvedValue(
				types.map((type) =>
					type.name === collection
						? {
								...type,
								fields: type.fields.map((actual) =>
									actual.name === field.name
										? { ...actual, cascadeDelete: !field.cascadeDelete }
										: actual
								)
							}
						: type
				)
			);
			const writes = [
				vi.spyOn(port, 'ensureCollections'),
				vi.spyOn(port, 'addCollectionFields'),
				vi.spyOn(port, 'create'),
				vi.spyOn(port, 'update'),
				vi.spyOn(port, 'delete')
			];
			const preview = await previewSiteSeed(port, { modules: [module] });
			expect(preview).toMatchObject({
				status: 'blocked',
				divergences: [expect.objectContaining({ piece: `campo "${collection}.${field.name}"` })]
			});
			if (preview.status !== 'blocked') throw new Error('El preflight debía bloquear la cascada');
			expect(JSON.parse(preview.divergences[0].expected).cascadeDelete).toBe(field.cascadeDelete);
			expect(JSON.parse(preview.divergences[0].actual).cascadeDelete).toBe(!field.cascadeDelete);
			await expect(seedSiteProject(port, { modules: [module] })).rejects.toBeInstanceOf(
				SiteSeedDivergenceError
			);
			for (const write of writes) expect(write).not.toHaveBeenCalled();
		}
	);

	test.each([false, undefined])(
		'cascadeDelete=%s equivale a relación sin cascada',
		(cascadeDelete) => {
			const field: Field = {
				name: 'parent',
				type: 'relation',
				target: 'nodes',
				multiple: false,
				cascadeDelete,
				required: false,
				readonly: false,
				presentable: false,
				hidden: false,
				unique: false
			};
			const expected = expectedFieldShape({
				name: 'parent',
				type: 'relation',
				target: 'nodes',
				multiple: false,
				cascadeDelete: false
			});
			expect(sameShape(expected, actualFieldShape(field))).toBe(true);
		}
	);
});
