import { mount, unmount } from 'svelte';
import { expect, test, vi } from 'vitest';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { VEGA_CONTEXT_KEY } from '$lib/app-context';
import { DEMO_CREDENTIALS, SHOWCASE_SEED } from '$lib/session/demo-seed';
import MediaFolders from './MediaFolders.svelte';

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
