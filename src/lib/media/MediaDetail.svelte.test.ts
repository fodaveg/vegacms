/**
 * Suite de `MediaDetail.svelte`:
 * - la pista del texto alternativo (audit del 23 sep, lámina pieza 3): solo en imágenes, bajo el
 *   campo `alt`, siguiendo a lo que se ESCRIBE (no al valor guardado) y atada al campo con
 *   `aria-describedby`;
 * - el punto focal (audit del 23 sep, tarea 2): clic para fijarlo, flechas + Intro con teclado,
 *   «Centrar», y qué viaja al puerto al guardar — nada si la colección no tiene el campo.
 */
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import MediaDetail from './MediaDetail.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort } from '$lib/backend/port';
import type { MediaItemView } from './media-item';

function fakePort(): BackendPort {
	return {
		capabilities: { thumbs: false },
		fileUrl: vi.fn(() => 'https://pb.example/api/files/vega_media/m1/foto.jpg'),
		update: vi.fn(async (_type: string, id: string, data: Record<string, unknown>) => ({
			id,
			type: 'vega_media',
			values: { file: 'IMG_2026.jpg', ...data }
		}))
	} as unknown as BackendPort;
}

function fakeCtx(port: BackendPort): VegaAppContext {
	return {
		port,
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
		focal: null,
		...overrides
	};
}

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

interface Rendered {
	target: HTMLElement;
	port: BackendPort;
	onClose: ReturnType<typeof vi.fn>;
}

function render(item: MediaItemView, extra: { canSetFocal?: boolean } = {}): Rendered {
	const port = fakePort();
	const onClose = vi.fn();
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(MediaDetail, {
		target,
		props: {
			item,
			onClose,
			onSaved: vi.fn(),
			onDeleted: vi.fn(),
			fallbackFocusEl: null,
			...extra
		},
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx(port)]])
	});
	mounted = { target, instance };
	flushSync();
	return { target, port, onClose };
}

describe('MediaDetail.svelte — pista del texto alternativo', () => {
	function altInput(target: HTMLElement): HTMLInputElement {
		return target.querySelector<HTMLInputElement>('#vega-media-detail-alt')!;
	}

	function hint(target: HTMLElement): HTMLElement | null {
		return target.querySelector<HTMLElement>('#vega-media-detail-alt-hint');
	}

	test('imagen sin alt: aviso con el nombre de fichero que leería un lector de pantalla', () => {
		const { target } = render(asset());

		expect(altInput(target).getAttribute('aria-describedby')).toBe('vega-media-detail-alt-hint');
		expect(hint(target)?.dataset.mediaAltHint).toBe('missing');
		expect(hint(target)?.textContent).toContain('media.detail.altMissingHint');
		expect(hint(target)?.textContent).toContain('IMG_2026.jpg');
	});

	test('la pista sigue a lo que se escribe: con texto pasa a la ayuda neutra, y vuelve al borrarlo', () => {
		const { target } = render(asset());
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
		const { target } = render(asset({ title: 'Retrato 2026' }));
		expect(hint(target)?.dataset.mediaAltHint).toBe('missing');
	});

	test('un PDF no lleva pista ni aria-describedby', () => {
		const { target } = render(
			asset({ fileRef: 'manual.pdf', fileName: 'manual.pdf', kind: 'other' })
		);
		expect(hint(target)).toBeNull();
		expect(altInput(target).hasAttribute('aria-describedby')).toBe(false);
	});
});

describe('MediaDetail.svelte — punto focal', () => {
	function focalButton(target: HTMLElement): HTMLButtonElement {
		return target.querySelector<HTMLButtonElement>('[data-media-focal]')!;
	}

	function mark(target: HTMLElement): HTMLElement {
		return target.querySelector<HTMLElement>('[data-media-focal-mark]')!;
	}

	function status(target: HTMLElement): string {
		return target.querySelector('[data-media-focal-status]')?.textContent?.trim() ?? '';
	}

	function resetButton(target: HTMLElement): HTMLButtonElement {
		return target.querySelector<HTMLButtonElement>('.vega-media-focal-reset')!;
	}

	/** La caja de la imagen pintada: jsdom no maqueta, así que se fija a mano (400×200 en 100,50). */
	function stubImageBox(target: HTMLElement): void {
		const img = focalButton(target).querySelector('img')!;
		img.getBoundingClientRect = () =>
			({ left: 100, top: 50, width: 400, height: 200, right: 500, bottom: 250 }) as DOMRect;
	}

	function pointerClick(el: HTMLElement, clientX: number, clientY: number): void {
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX, clientY, detail: 1 }));
		flushSync();
	}

	/** Intro/Espacio sobre un `<button>`: el navegador lanza un `click` con `detail === 0`. */
	function keyboardActivate(el: HTMLElement): void {
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
		flushSync();
	}

	function key(el: HTMLElement, name: string, shiftKey = false): void {
		el.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true }));
		flushSync();
	}

	async function save(target: HTMLElement): Promise<void> {
		target
			.querySelector('form')!
			.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await Promise.resolve();
		flushSync();
	}

	test('sin el campo en la colección (canSetFocal ausente) no hay gesto ni se manda focal', async () => {
		const { target, port } = render(asset({ alt: 'Algo' }));

		expect(target.querySelector('[data-media-focal]')).toBeNull();
		expect(target.querySelector('[data-media-focal-status]')).toBeNull();

		await save(target);
		const payload = vi.mocked(port.update).mock.calls[0][2];
		expect(payload).not.toHaveProperty('focal');
	});

	test('un PDF no ofrece el gesto aunque la colección tenga el campo', () => {
		const { target } = render(
			asset({ fileRef: 'manual.pdf', fileName: 'manual.pdf', kind: 'other' }),
			{ canSetFocal: true }
		);
		expect(target.querySelector('[data-media-focal]')).toBeNull();
	});

	test('sin punto: marca en el centro, estado «centro» y «Centrar» deshabilitado', () => {
		const { target } = render(asset(), { canSetFocal: true });

		expect(focalButton(target).getAttribute('aria-label')).toBe('media.focal.label');
		expect(mark(target).style.left).toBe('50%');
		expect(mark(target).style.top).toBe('50%');
		expect(status(target)).toBe('media.focal.center');
		expect(resetButton(target).disabled).toBe(true);
	});

	test('clic en la imagen fija el punto en esa fracción de la imagen', () => {
		const { target } = render(asset(), { canSetFocal: true });
		stubImageBox(target);

		pointerClick(focalButton(target), 200, 100);

		expect(mark(target).style.left).toBe('25%');
		expect(mark(target).style.top).toBe('25%');
		expect(status(target)).toBe('media.focal.value {"x":25,"y":25}');
		expect(resetButton(target).disabled).toBe(false);
	});

	test('teclado: las flechas mueven un punto pendiente e Intro lo fija', () => {
		const { target } = render(asset(), { canSetFocal: true });
		const button = focalButton(target);

		key(button, 'ArrowRight');
		key(button, 'ArrowUp', true);

		// Pendiente: marca discontinua aparte; la fija sigue en el centro hasta Intro.
		expect(target.querySelector('[data-media-focal-pending]')).not.toBeNull();
		expect(mark(target).style.left).toBe('50%');
		expect(status(target)).toBe('media.focal.pending {"x":55,"y":49}');

		keyboardActivate(button);

		expect(target.querySelector('[data-media-focal-pending]')).toBeNull();
		expect(mark(target).style.left).toBe('55%');
		expect(mark(target).style.top).toBe('49%');
	});

	test('Esc suelta el punto pendiente sin cerrar la ficha', () => {
		const { target, onClose } = render(asset(), { canSetFocal: true });
		const button = focalButton(target);

		key(button, 'ArrowLeft');
		expect(target.querySelector('[data-media-focal-pending]')).not.toBeNull();

		key(button, 'Escape');

		expect(target.querySelector('[data-media-focal-pending]')).toBeNull();
		expect(onClose).not.toHaveBeenCalled();
		expect(mark(target).style.left).toBe('50%');
	});

	test('guardar manda el punto como objeto plano', async () => {
		const { target, port } = render(asset({ alt: 'Algo' }), { canSetFocal: true });
		stubImageBox(target);
		pointerClick(focalButton(target), 400, 200);

		await save(target);

		expect(port.update).toHaveBeenCalledWith(
			'vega_media',
			'm1',
			expect.objectContaining({ focal: { x: 0.75, y: 0.75 } })
		);
	});

	test('«Centrar» borra el punto: se guarda vacío', async () => {
		const { target, port } = render(asset({ alt: 'Algo', focal: { x: 0.2, y: 0.8 } }), {
			canSetFocal: true
		});
		expect(mark(target).style.left).toBe('20%');

		resetButton(target).click();
		flushSync();
		expect(status(target)).toBe('media.focal.center');

		await save(target);
		expect(port.update).toHaveBeenCalledWith(
			'vega_media',
			'm1',
			expect.objectContaining({ focal: null })
		);
	});
});
