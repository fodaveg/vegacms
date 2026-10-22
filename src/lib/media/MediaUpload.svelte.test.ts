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

test('cambiar filtro no retargetea ni ofrece override; carpeta original desaparecida permite recuperar los bytes', async () => {
	const create = vi
		.fn()
		.mockRejectedValueOnce(VegaError.network())
		.mockRejectedValueOnce(VegaError.network())
		.mockResolvedValue({});
	const get = vi
		.fn()
		.mockResolvedValue({ id: 'old', type: 'vega_media_folders', values: { name: 'Anterior' } });
	const ctx = {
		port: { create, get },
		t: (key: string) => key,
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const target = document.createElement('div');
	document.body.append(target);
	const props = $state({
		schema: { maxSizeBytes: 1000, mimeTypes: [] } as unknown as MediaFileFieldSchema,
		onUploaded: vi.fn(),
		folder: 'old' as string | null
	});
	const instance = mount(MediaUpload, {
		target,
		props,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance };
	await tick();
	const file = new File(['bytes originales'], 'original.txt', { type: 'text/plain' });
	const drop = new Event('drop', { bubbles: true, cancelable: true });
	Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } });
	target.querySelector('.vega-media-dropzone')!.dispatchEvent(drop);
	await vi.waitFor(() =>
		expect(target.querySelector('[data-media-upload-status="error"]')).not.toBeNull()
	);
	props.folder = 'other';
	await tick();
	await vi.waitFor(() => expect(get).toHaveBeenCalledWith('vega_media_folders', 'old'));
	expect(target.textContent).not.toContain('media.upload.retryCurrentFolder');
	(target.querySelector('.vega-media-upload-retry') as HTMLButtonElement).click();
	await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
	expect(create.mock.calls[1][1]).toEqual({ file, folder: 'old' });
	get.mockRejectedValue(VegaError.notFound());
	props.folder = null;
	await tick();
	await vi.waitFor(() => expect(target.textContent).toContain('media.upload.retryUnfiled'));
	Array.from(target.querySelectorAll<HTMLButtonElement>('button'))
		.find((button) => button.textContent?.includes('media.upload.retryUnfiled'))!
		.click();
	await vi.waitFor(() =>
		expect(target.querySelector('[data-media-upload-status="done"]')).not.toBeNull()
	);
	expect(create.mock.calls[2][1]).toEqual({ file });
	expect((create.mock.calls[2][1] as { file: File }).file).toBe(file);
});

test('reanudar explícitamente sin carpeta recupera todos los pendientes y conserva sus archivos', async () => {
	const create = vi.fn().mockRejectedValueOnce(VegaError.authExpired()).mockResolvedValue({});
	const ctx = {
		port: { create, get: vi.fn().mockRejectedValue(VegaError.notFound()) },
		t: (key: string) => key,
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const target = document.createElement('div');
	document.body.append(target);
	const props = $state({
		schema: { maxSizeBytes: 1000, mimeTypes: [] } as unknown as MediaFileFieldSchema,
		onUploaded: vi.fn(),
		folder: 'old' as string | null
	});
	const instance = mount(MediaUpload, {
		target,
		props,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance };
	await tick();
	const files = ['uno.txt', 'dos.txt'].map(
		(name) => new File(['bytes originales'], name, { type: 'text/plain' })
	);
	const drop = new Event('drop', { bubbles: true, cancelable: true });
	Object.defineProperty(drop, 'dataTransfer', { value: { files } });
	target.querySelector('.vega-media-dropzone')!.dispatchEvent(drop);
	await vi.waitFor(() =>
		expect(target.querySelectorAll('[data-media-upload-status="pending"]')).toHaveLength(2)
	);
	props.folder = null;
	await tick();
	await vi.waitFor(() => expect(target.textContent).toContain('media.upload.resumeUnfiled'));
	Array.from(target.querySelectorAll<HTMLButtonElement>('button'))
		.find((button) => button.textContent?.includes('media.upload.resumeUnfiled'))!
		.click();
	await vi.waitFor(() =>
		expect(target.querySelectorAll('[data-media-upload-status="done"]')).toHaveLength(2)
	);
	expect(create).toHaveBeenCalledTimes(3);
	for (let index = 0; index < files.length; index++) {
		expect(create.mock.calls[index + 1][1]).toEqual({ file: files[index] });
		expect(create.mock.calls[index + 1][1].file).toBe(files[index]);
	}
});
