import { mount, tick, unmount } from 'svelte';
import { expect, test, vi } from 'vitest';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { seedSiteProject } from '$lib/backend/site-seeding';
import { VEGA_CONTEXT_KEY } from '$lib/app-context';
import { t } from '$lib/i18n';
import FormInboxDialog from './FormInboxDialog.svelte';

test('custom project uses the same resolved users rules in preview, seed and exported migration', async () => {
	const base = createMemoryBackend();
	await base.login({ email: 'admin@vega.test', password: 'x' });
	await base.ensureCollections([{ name: 'users', type: 'auth', fields: [] }]);
	const port = {
		...base,
		editorAuthCollection: 'users',
		assertEditorAuthCollection: vi.fn(async () => {})
	};
	await seedSiteProject(port);
	const target = document.createElement('div');
	document.body.append(target);
	const instance = mount(FormInboxDialog, {
		target,
		props: { onClose: vi.fn(), onChanged: vi.fn(async () => {}) },
		context: new Map([
			[
				VEGA_CONTEXT_KEY,
				{
					port,
					t: (key: string, values?: Record<string, string | number>) => t('es', key, values),
					feedback: { reportError: vi.fn() }
				}
			]
		])
	});
	const button = (label: string) =>
		Array.from(target.querySelectorAll('button')).find(
			(node) => node.textContent?.trim() === label
		)!;
	try {
		const title = target.querySelector<HTMLInputElement>('input[data-autofocus]')!;
		title.value = 'Consulta';
		title.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		button('Vista previa').click();
		await vi.waitFor(() => expect(target.querySelector('pre')?.textContent).toContain('users'));
		const preview = JSON.parse(target.querySelector('pre')!.textContent!);
		expect(preview.listRule).toContain('"users"');
		expect(preview.listRule).not.toContain('vega_editors');
		button('Crear formulario').click();
		await vi.waitFor(() => expect(target.querySelector('.vega-migration-code')).not.toBeNull());
		const rules = (await port.collectionRules!(['consulta'])).consulta;
		expect(rules.listRule).toBe(preview.listRule);
		expect(rules.createRule).toBe(preview.createRule);
		expect(target.querySelector('.vega-migration-code')!.textContent).toContain(
			JSON.stringify(preview.listRule)
		);
		expect(target.querySelector('.vega-migration-code')!.textContent).not.toContain('vega_editors');
	} finally {
		await unmount(instance);
		target.remove();
	}
});
