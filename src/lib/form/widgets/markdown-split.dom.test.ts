/**
 * `markdown-split.ts#observeSplit`: mide al empezar y a cada cambio de tamaño del cuerpo, con una
 * sonda de `SPLIT_MIN_CHARS`ch en la fuente del `<textarea>` y los rellenos reales de cada columna.
 * jsdom no maqueta: las cajas se stubean; el cálculo de la regla está en `markdown-split.test.ts`.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { observeSplit } from './markdown-split';

/** El marcado de `Markdown.svelte` que importa aquí: cuerpo, columna de escritura y vista. */
function workbench(): { body: HTMLElement; textarea: HTMLTextAreaElement } {
	const body = document.createElement('div');
	body.className = 'vega-markdown-body';
	body.innerHTML = `<div class="vega-markdown-write"><textarea style="padding: 0 20px; font-family: monospace; font-size: 14px"></textarea></div>
		<section class="vega-markdown-preview" style="border-left: 1px solid black"><div class="vega-markdown-preview-content" style="padding: 0 22.4px"></div></section>`;
	document.body.append(body);
	return { body, textarea: body.querySelector('textarea')! };
}

/** jsdom no maqueta: el cuerpo mide `bodyWidth()` y la sonda (el `<span>` que crea el módulo),
 *  268,8 px, lo que mide en Chromium 32ch de la monoespaciada del editor a 14 px. */
function stubLayout(body: HTMLElement, bodyWidth: () => number): void {
	vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
		const width = this === body ? bodyWidth() : this.tagName === 'SPAN' ? 268.8 : 0;
		return { width, height: 0 } as DOMRect;
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

describe('observeSplit', () => {
	test('mide en el acto y en cada aviso del ResizeObserver; al parar deja de observar y retira la sonda', () => {
		let notify: () => void = () => {};
		const disconnect = vi.fn();
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(callback: () => void) {
					notify = callback;
				}
				observe() {}
				disconnect = disconnect;
			}
		);
		const { body, textarea } = workbench();
		let bodyWidth = 900;
		stubLayout(body, () => bodyWidth);

		const seen: boolean[] = [];
		const stop = observeSplit(textarea, (fits) => seen.push(fits));
		const probe = body.querySelector<HTMLElement>(':scope > span[aria-hidden="true"]')!;
		expect(probe.style.width).toBe('32ch');
		expect(probe.style.visibility).toBe('hidden');
		expect(probe.style.fontFamily).toBe('monospace');
		expect(probe.style.fontSize).toBe('14px');
		expect(seen).toEqual([true]);

		bodyWidth = 600; // (600 / 2) − (44,8 + 1) < 268,8
		notify();
		bodyWidth = 640;
		notify();
		expect(seen).toEqual([true, false, true]);

		stop();
		expect(disconnect).toHaveBeenCalled();
		expect(probe.isConnected).toBe(false);
	});

	test('sin ResizeObserver mide una vez y no lanza', () => {
		vi.stubGlobal('ResizeObserver', undefined);
		const { body, textarea } = workbench();
		stubLayout(body, () => 300);
		const seen: boolean[] = [];
		const stop = observeSplit(textarea, (fits) => seen.push(fits));
		expect(seen).toEqual([false]);
		expect(() => stop()).not.toThrow();
	});

	test('un `<textarea>` fuera del cuerpo del widget: no mide nada', () => {
		const textarea = document.createElement('textarea');
		document.body.append(textarea);
		const onChange = vi.fn();
		observeSplit(textarea, onChange)();
		expect(onChange).not.toHaveBeenCalled();
	});
});
