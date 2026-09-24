/**
 * Suite de `MediaGrid.svelte` — la marca «Sin texto alternativo» de la tarjeta (audit del 23 sep,
 * lámina pieza 3). Montaje real (proyecto vitest `component`) porque lo que importa no es la regla
 * (esa vive en `mediaMissingAlt`, `media-card.test.ts`) sino DÓNDE cae la marca: dentro del botón
 * de la celda, para que entre en su nombre accesible, y solo en imágenes sin `alt`.
 */
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import MediaGrid from './MediaGrid.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort } from '$lib/backend/port';
import type { MediaItemView } from './media-item';

// Sin `fileRef` en los items (ver `item()`), la rejilla nunca pide una URL: la miniatura cae al
// icono por tipo, que es todo lo que esta suite necesita.
const fakePort = {
	capabilities: { thumbs: false },
	fileUrl: vi.fn()
} as unknown as BackendPort;

function fakeCtx(): VegaAppContext {
	return {
		port: fakePort,
		t: (key: string) => key,
		locale: 'es'
	} as unknown as VegaAppContext;
}

function item(id: string, fileName: string, alt: string, title = ''): MediaItemView {
	return {
		id,
		fileRef: null,
		fileName,
		kind: 'image',
		alt,
		title,
		tags: [],
		created: null,
		focal: null
	};
}

describe('MediaGrid.svelte — marca «Sin texto alternativo»', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	function render(items: MediaItemView[], isSelected?: (i: MediaItemView) => boolean): HTMLElement {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(MediaGrid, {
			target,
			props: { items, onSelect: vi.fn(), isSelected },
			context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
		});
		mounted = { target, instance };
		return target;
	}

	function cell(target: HTMLElement, id: string): HTMLButtonElement {
		return target.querySelector<HTMLButtonElement>(`[data-media-item="${id}"]`)!;
	}

	test('solo las imágenes sin alt llevan la marca; un título no la quita; un PDF nunca', () => {
		const target = render([
			item('con-alt', 'portada.jpg', 'Tomateras al atardecer'),
			item('sin-alt', 'IMG_2026.jpg', ''),
			item('solo-titulo', 'retrato.webp', '', 'Retrato 2026'),
			item('pdf', 'manual.pdf', '')
		]);

		expect(cell(target, 'con-alt').querySelector('[data-media-alt-missing]')).toBeNull();
		expect(cell(target, 'sin-alt').querySelector('[data-media-alt-missing]')).not.toBeNull();
		expect(cell(target, 'solo-titulo').querySelector('[data-media-alt-missing]')).not.toBeNull();
		expect(cell(target, 'pdf').querySelector('[data-media-alt-missing]')).toBeNull();
	});

	test('la marca vive dentro del botón de la celda, con palabra (su texto entra en el nombre accesible)', () => {
		const target = render([item('sin-alt', 'IMG_2026.jpg', '')]);

		const mark = target.querySelector('[data-media-alt-missing]');
		expect(mark?.closest('button')).toBe(cell(target, 'sin-alt'));
		expect(cell(target, 'sin-alt').textContent).toContain('media.alt.missing');
	});

	test('también en el modo selector (misma tarjeta en biblioteca y picker)', () => {
		const target = render([item('sin-alt', 'IMG_2026.jpg', '')], () => true);

		expect(cell(target, 'sin-alt').getAttribute('aria-pressed')).toBe('true');
		expect(cell(target, 'sin-alt').querySelector('[data-media-alt-missing]')).not.toBeNull();
	});
});
