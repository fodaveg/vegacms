/** El editor visual exige una página con ruta, además de una lista de elementos. */
import { mount, tick, unmount } from 'svelte';
import { describe, expect, test, vi } from 'vitest';
import RecordForm from './RecordForm.svelte';
import { buildFormModel } from './form-model';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { seedSiteProject } from '$lib/backend/site-seeding';
import { SITE_SEED_MENUS_MODULE } from '$lib/backend/site-seeding-menus';
import { resolveContentModel } from '$lib/model/resolve';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { t } from '$lib/i18n';

vi.mock('$app/navigation', () => ({ beforeNavigate: () => {} }));

describe('RecordForm: entrada al editor visual', () => {
	test.each([
		['menus', false],
		['pages', true]
	] as const)('%s: botón visible = %s', async (name, visible) => {
		const backend = createMemoryBackend();
		await backend.login({ email: 'admin@vega.test', password: 'test-password' });
		await seedSiteProject(backend, { modules: [SITE_SEED_MENUS_MODULE] });
		const port = {
			...backend,
			previewApiUrl: 'https://preview.test/api',
			previewVisualEditing: true
		};
		const model = resolveContentModel({
			types: await port.listContentTypes(),
			manifestRaw: (await port.list('vega')).items[0]!.values.manifest,
			accessBypass: true
		});
		const type = model.types.find((type) => type.name === name)!;
		const record = (await port.list(name)).items[0]!;
		const ctx = {
			port,
			model,
			locale: 'es',
			t: (key: string, params?: Record<string, string | number>) => t('es', key, params),
			nav: {},
			feedback: { toast: vi.fn(), reportError: vi.fn() },
			registerExitGuard: () => () => {}
		} as unknown as VegaAppContext;
		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(RecordForm, {
			target,
			props: {
				type,
				model: buildFormModel(type, record),
				typeReadonly: false,
				onSubmit: vi.fn(),
				onSaved: vi.fn(),
				onCancel: vi.fn()
			},
			context: new Map([[VEGA_CONTEXT_KEY, ctx]])
		});
		try {
			await tick();
			expect(Boolean(target.querySelector('.vega-editor-visual-button'))).toBe(visible);
		} finally {
			await unmount(instance);
			target.remove();
		}
	});
});
