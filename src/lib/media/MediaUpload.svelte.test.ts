import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { VegaError } from '$lib/backend/errors';
import MediaUpload from './MediaUpload.svelte';
import type { MediaFileFieldSchema } from './media-upload';

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

afterEach(async () => {
	if (!mounted) return;
	await unmount(mounted.instance);
	mounted.target.remove();
	mounted = null;
});

describe('MediaUpload — reintentar', () => {
	test('mantiene visibles los demás ficheros del lote tras reintentar uno fallido', async () => {
		const create = vi
			.fn()
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(VegaError.backend('falló'))
			.mockResolvedValue({});
		const ctx = {
			port: { create },
			t: (key: string) => key,
			locale: 'es',
			feedback: { toast: vi.fn(), reportError: vi.fn() }
		} as unknown as VegaAppContext;
		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(MediaUpload, {
			target,
			props: {
				schema: { maxSizeBytes: 1000, mimeTypes: [] } as unknown as MediaFileFieldSchema,
				onUploaded: vi.fn()
			},
			context: new Map([[VEGA_CONTEXT_KEY, ctx]])
		});
		mounted = { target, instance };
		await tick();

		const files = ['uno.txt', 'dos.txt', 'tres.txt'].map(
			(name) => new File(['x'], name, { type: 'text/plain' })
		);
		const drop = new Event('drop', { bubbles: true, cancelable: true });
		Object.defineProperty(drop, 'dataTransfer', { value: { files } });
		target.querySelector('.vega-media-dropzone')!.dispatchEvent(drop);
		await vi.waitFor(() => {
			expect(
				Array.from(target.querySelectorAll('[data-media-upload-item]'), (item) =>
					item.getAttribute('data-media-upload-status')
				)
			).toEqual(['done', 'error', 'done']);
		});

		(target.querySelector('.vega-media-upload-retry') as HTMLButtonElement).click();
		await vi.waitFor(() => {
			const items = Array.from(target.querySelectorAll('[data-media-upload-item]'));
			expect(items.map((item) => item.getAttribute('data-media-upload-status'))).toEqual([
				'done',
				'done',
				'done'
			]);
			expect(
				items.map((item) => item.querySelector('.vega-media-upload-name')?.textContent)
			).toEqual(files.map((file) => file.name));
		});
		expect(create).toHaveBeenCalledTimes(4);
	});
});
