/**
 * Suite de `MediaPicker.svelte` — la paginación sobrevive al filtro `accept` (audit del 30 sep): una
 * página cuyos assets no pasan el filtro (solo vídeos con `accept: image/*`) sigue teniendo
 * páginas vecinas, y el usuario ha de poder ir a ellas.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import MediaPicker from './MediaPicker.svelte';
import { mediaPickerState } from './media-picker-state.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort } from '$lib/backend/port';
import type { Page, VegaRecord } from '$lib/backend/types';

function mediaRecord(id: string, file: string): VegaRecord {
	return { id, type: 'vega_media', values: { file, alt: 'x', title: '', tags: [] } } as VegaRecord;
}

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

function mountPicker(page: Page<VegaRecord>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		port: {
			capabilities: { thumbs: false },
			list: vi.fn(async () => page),
			fileUrl: vi.fn()
		} as unknown as BackendPort,
		t: (key: string) => key,
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(MediaPicker, {
		target,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance };
	return target;
}

async function settle(): Promise<void> {
	for (let i = 0; i < 10; i++) await Promise.resolve();
	await tick();
}

afterEach(async () => {
	mediaPickerState.settle(null);
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

describe('MediaPicker.svelte — paginación con filtro accept', () => {
	test('la página queda vacía por accept pero hay más páginas: se pinta el vacío Y la paginación', async () => {
		const target = mountPicker({
			items: [mediaRecord('v1', 'clip.mp4'), mediaRecord('v2', 'otro.mp4')],
			page: 1,
			perPage: 24,
			totalItems: 60,
			totalPages: 3
		});
		void mediaPickerState.open({ multiple: false, accept: ['image/*'] });
		await settle();

		expect(target.querySelector('.vega-media-picker-empty')).not.toBeNull();
		expect(target.querySelector('[data-pagination]')).not.toBeNull();
	});

	test('sin más páginas no hay paginación aunque accept deje la página vacía', async () => {
		const target = mountPicker({
			items: [mediaRecord('v1', 'clip.mp4')],
			page: 1,
			perPage: 24,
			totalItems: 1,
			totalPages: 1
		});
		void mediaPickerState.open({ multiple: false, accept: ['image/*'] });
		await settle();

		expect(target.querySelector('.vega-media-picker-empty')).not.toBeNull();
		expect(target.querySelector('[data-pagination]')).toBeNull();
	});
});

/**
 * `opts.notice`: el aviso de la cabecera dice que se inserta una COPIA, que es lo que hace el campo
 * de fichero. Quien enlaza lo elegido por su URL (la barra del texto enriquecido) pasa el suyo.
 */
describe('MediaPicker.svelte — aviso de la cabecera', () => {
	const emptyPage = { items: [], page: 1, perPage: 24, totalItems: 0, totalPages: 1 };

	test('sin notice pinta el aviso de siempre', async () => {
		const target = mountPicker(emptyPage);
		void mediaPickerState.open({ multiple: false });
		await settle();

		expect(target.querySelector('.vega-media-picker-copy')?.textContent?.trim()).toBe(
			'media.picker.copyNotice'
		);
	});

	test('con notice pinta ese texto en su lugar', async () => {
		const target = mountPicker(emptyPage);
		void mediaPickerState.open({ multiple: false, notice: 'Se enlaza la imagen.' });
		await settle();

		expect(target.querySelector('.vega-media-picker-copy')?.textContent?.trim()).toBe(
			'Se enlaza la imagen.'
		);
	});
});
