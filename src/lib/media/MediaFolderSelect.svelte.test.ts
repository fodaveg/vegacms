import { mount, tick, unmount } from 'svelte';
import { expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY } from '$lib/app-context';
import MediaFolderSelect from './MediaFolderSelect.svelte';
import MediaFolders from './MediaFolders.svelte';
const load = vi.hoisted(() => vi.fn());
vi.mock('./media-folders-loader', () => ({ loadMediaFoldersComponent: load }));
const types = [
	{
		schema: {
			name: 'vega_media_folders',
			fields: [
				{ name: 'name', type: 'text', required: true, unique: true, maxLength: 80 },
				{ name: 'created', type: 'date', readonly: true }
			]
		}
	},
	{
		schema: {
			name: 'vega_media',
			fields: [
				{
					name: 'folder',
					type: 'relation',
					target: 'vega_media_folders',
					multiple: false,
					cascadeDelete: false
				}
			]
		}
	}
];
function context(list: ReturnType<typeof vi.fn>) {
	return {
		model: { types },
		t: (key: string) => key,
		port: { list },
		feedback: { toast: vi.fn() }
	};
}

test('fallo de chunk tiene reintento y no toca el borrador; fallo de datos en edición tampoco', async () => {
	load.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ default: MediaFolders });
	const list = vi
		.fn()
		.mockRejectedValueOnce(new Error('offline'))
		.mockResolvedValue({
			page: 1,
			perPage: 200,
			totalItems: 1,
			totalPages: 1,
			items: [{ id: 'f1', values: { name: 'Viajes' } }]
		});
	const onChange = vi.fn();
	const target = document.createElement('div');
	document.body.append(target);
	const instance = mount(MediaFolderSelect, {
		target,
		props: { value: 'f1', onChange },
		context: new Map([[VEGA_CONTEXT_KEY, context(list)]])
	});
	try {
		await vi.waitFor(() => expect(target.textContent).toContain('media.folders.loadError'));
		expect(onChange).not.toHaveBeenCalled();
		target.querySelector('button')!.click();
		await tick();
		await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));
		await vi.waitFor(() => expect(target.querySelector('[role="alert"]')).not.toBeNull());
		expect(onChange).not.toHaveBeenCalled();
		target.querySelector('button')!.click();
		await vi.waitFor(() => expect(target.querySelector('option[value="f1"]')).not.toBeNull());
		expect(onChange).not.toHaveBeenCalled();
		expect(load).toHaveBeenCalledTimes(2);
	} finally {
		await unmount(instance);
		target.remove();
	}
});
