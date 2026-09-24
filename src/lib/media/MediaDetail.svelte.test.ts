/**
 * Suite de `MediaDetail.svelte` — la pista del texto alternativo (audit del 23 sep, lámina
 * pieza 3): solo en imágenes, bajo el campo `alt`, siguiendo a lo que se ESCRIBE (no al valor
 * guardado) y atada al campo con `aria-describedby`.
 */
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import MediaDetail from './MediaDetail.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort } from '$lib/backend/port';
import type { MediaItemView } from './media-item';

const fakePort = {
	capabilities: { thumbs: false },
	fileUrl: vi.fn(() => 'https://pb.example/api/files/vega_media/m1/foto.jpg'),
	update: vi.fn()
} as unknown as BackendPort;

function fakeCtx(): VegaAppContext {
	return {
		port: fakePort,
		model: { types: [], revisions: { enabled: false, trashDays: 30 } },
		t: (key: string, params?: Record<string, unknown>) =>
			params ? `${key} ${JSON.stringify(params)}` : key,
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
}

function asset(overrides: Partial<MediaItemView> = {}): MediaItemView {
	return {
		id: 'm1',
		fileRef: 'IMG_2026.jpg',
		fileName: 'IMG_2026.jpg',
		kind: 'image',
		alt: '',
		title: '',
		tags: [],
		created: null,
		...overrides
	};
}

describe('MediaDetail.svelte — pista del texto alternativo', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	function render(item: MediaItemView): HTMLElement {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(MediaDetail, {
			target,
			props: {
				item,
				onClose: vi.fn(),
				onSaved: vi.fn(),
				onDeleted: vi.fn(),
				fallbackFocusEl: null
			},
			context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
		});
		mounted = { target, instance };
		flushSync();
		return target;
	}

	function altInput(target: HTMLElement): HTMLInputElement {
		return target.querySelector<HTMLInputElement>('#vega-media-detail-alt')!;
	}

	function hint(target: HTMLElement): HTMLElement | null {
		return target.querySelector<HTMLElement>('#vega-media-detail-alt-hint');
	}

	test('imagen sin alt: aviso con el nombre de fichero que leería un lector de pantalla', () => {
		const target = render(asset());

		expect(altInput(target).getAttribute('aria-describedby')).toBe('vega-media-detail-alt-hint');
		expect(hint(target)?.dataset.mediaAltHint).toBe('missing');
		expect(hint(target)?.textContent).toContain('media.detail.altMissingHint');
		expect(hint(target)?.textContent).toContain('IMG_2026.jpg');
	});

	test('la pista sigue a lo que se escribe: con texto pasa a la ayuda neutra, y vuelve al borrarlo', () => {
		const target = render(asset());
		const input = altInput(target);

		input.value = 'Bancal de tomateras';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		expect(hint(target)?.dataset.mediaAltHint).toBe('help');

		input.value = '   ';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		expect(hint(target)?.dataset.mediaAltHint).toBe('missing');
	});

	test('un título no sustituye al alt', () => {
		const target = render(asset({ title: 'Retrato 2026' }));
		expect(hint(target)?.dataset.mediaAltHint).toBe('missing');
	});

	test('un PDF no lleva pista ni aria-describedby', () => {
		const target = render(asset({ fileRef: 'manual.pdf', fileName: 'manual.pdf', kind: 'other' }));
		expect(hint(target)).toBeNull();
		expect(altInput(target).hasAttribute('aria-describedby')).toBe(false);
	});
});
