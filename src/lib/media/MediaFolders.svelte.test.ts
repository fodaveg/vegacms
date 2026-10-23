import { mount, tick, unmount } from 'svelte';
import { expect, test, vi } from 'vitest';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { VEGA_CONTEXT_KEY } from '$lib/app-context';
import { DEMO_CREDENTIALS, SHOWCASE_SEED } from '$lib/session/demo-seed';
import MediaFolders from './MediaFolders.svelte';

test.each([
	{ create: false, update: false, delete: false, missingSchema: false },
	{ create: true, update: false, delete: false, missingSchema: false },
	{ create: false, update: true, delete: false, missingSchema: false },
	{ create: false, update: false, delete: true, missingSchema: false },
	{ create: false, update: false, delete: false, missingSchema: true }
])(
	'folder actions respect their own permissions %o while navigation remains available',
	async (permissions) => {
		const folder = SHOWCASE_SEED.contentTypes.find((type) => type.name === 'vega_media_folders')!;
		const schema = {
			...folder,
			access: {
				list: 'allowed' as const,
				view: 'allowed' as const,
				create: permissions.create ? ('allowed' as const) : ('denied' as const),
				update: permissions.update ? ('allowed' as const) : ('denied' as const),
				delete: permissions.delete ? ('allowed' as const) : ('denied' as const)
			}
		};
		const base = createMemoryBackend({
			users: SHOWCASE_SEED.users,
			contentTypes: [schema],
			records: { vega_media_folders: [{ id: 'folder-one', values: { name: 'Visible' } }] }
		});
		await base.login(DEMO_CREDENTIALS);
		const port = { ...base, capabilities: { ...base.capabilities, accessBypass: false } };
		const writes = [vi.spyOn(port, 'create'), vi.spyOn(port, 'update'), vi.spyOn(port, 'delete')];
		const target = document.createElement('div');
		document.body.append(target);
		const changed = vi.fn();
		const instance = mount(MediaFolders, {
			target,
			props: { manage: true, value: 'folder-one', onChange: changed },
			context: new Map([
				[
					VEGA_CONTEXT_KEY,
					{
						port,
						model: { types: permissions.missingSchema ? [] : [{ name: schema.name, schema }] },
						t: (key: string) => key,
						feedback: { toast: vi.fn() }
					}
				]
			])
		});
		try {
			await vi.waitFor(() => expect(target.querySelectorAll('nav .folder')).toHaveLength(1));
			await tick();
			expect(!!target.querySelector('.new-folder')).toBe(permissions.create);
			const trigger = target.querySelector<HTMLButtonElement>('.vega-action-menu-trigger');
			expect(!!trigger).toBe(permissions.update || permissions.delete);
			trigger?.click();
			await tick();
			const menu = target.querySelector('[role="menu"]');
			expect(menu?.textContent.includes('media.folders.rename') ?? false).toBe(permissions.update);
			expect(menu?.textContent.includes('media.folders.delete') ?? false).toBe(permissions.delete);
			expect(
				target.querySelector('.mobile-actions')?.textContent?.includes('media.folders.rename') ??
					false
			).toBe(permissions.update);
			expect(
				target.querySelector('.mobile-actions')?.textContent?.includes('media.folders.delete') ??
					false
			).toBe(permissions.delete);
			(target.querySelector('nav > button') as HTMLButtonElement).click();
			expect(changed).toHaveBeenCalledWith(null);
			for (const write of writes) expect(write).not.toHaveBeenCalled();
		} finally {
			await unmount(instance);
			target.remove();
		}
	}
);

test('más de 200 carpetas se cargan completas y ordenadas en la columna', async () => {
	const { users, contentTypes } = SHOWCASE_SEED;
	const records = Array.from({ length: 205 }, (_, index) => ({
		id: `folder_${String(index).padStart(3, '0')}`,
		values: { name: `Carpeta ${String(index).padStart(3, '0')}` }
	}));
	const port = createMemoryBackend({
		users,
		contentTypes,
		records: { vega_media_folders: records }
	});
	await port.login(DEMO_CREDENTIALS);
	const list = vi.spyOn(port, 'list');
	const target = document.createElement('div');
	document.body.append(target);
	const onChange = vi.fn();
	const instance = mount(MediaFolders, {
		target,
		props: { manage: true, onChange },
		context: new Map([
			[VEGA_CONTEXT_KEY, { port, t: (key: string) => key, feedback: { toast: vi.fn() } }]
		])
	});
	try {
		await vi.waitFor(() => expect(target.querySelectorAll('nav .folder')).toHaveLength(205));
		expect(list).toHaveBeenCalledTimes(2);
		expect(target.querySelectorAll('select option')).toHaveLength(207);
		expect(target.querySelector('nav .folder')?.textContent).toContain('Carpeta 000');
		expect(target.querySelector('nav .folder:last-child')?.textContent).toContain('Carpeta 204');
		expect(onChange).not.toHaveBeenCalled();
	} finally {
		await unmount(instance);
		target.remove();
	}
});
