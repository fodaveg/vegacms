/**
 * `drag-image.ts`: la imagen de arrastre es una copia OPACA del elemento, de su mismo tamaño y con
 * el cursor donde se agarró (spec del 22 oct 2026, parte E). jsdom no pinta ni trae `DragEvent`:
 * aquí se comprueba lo que se le pasa a `setDragImage`; la imagen nativa se mira en Chromium y
 * WebKit (ver la entrega de la parte E).
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { opaqueBackground, setCopyDragImage } from './drag-image';

/** Fondos de prueba, ya en la forma que devuelve `getComputedStyle` (allowlist de
 *  `scripts/check-theme-coverage.mjs`): uno opaco, el papel y un tinte translúcido. */
const [SOLID, PAPER, TINT] = ['rgb(1, 2, 30)', 'rgb(255, 255, 255)', 'rgba(232, 86, 42, 0.12)'];

function rect(left: number, top: number, width: number, height: number): DOMRect {
	return {
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
		x: left,
		y: top,
		toJSON: () => ({})
	} as DOMRect;
}

/** `dragstart` de mentira: jsdom no trae `DragEvent` ni `DataTransfer`. */
function dragStart(clientX: number, clientY: number, setDragImage?: ReturnType<typeof vi.fn>) {
	const event = new Event('dragstart') as DragEvent;
	Object.defineProperties(event, {
		clientX: { value: clientX },
		clientY: { value: clientY },
		dataTransfer: { value: setDragImage ? { setDragImage } : { setData: vi.fn() } }
	});
	return event;
}

afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
});

describe('opaqueBackground', () => {
	test('un fondo opaco se queda tal cual', () => {
		const el = document.createElement('div');
		el.style.backgroundColor = SOLID;
		document.body.append(el);
		expect(opaqueBackground(el)).toBe(SOLID);
	});

	test('capas translúcidas se apilan sobre el primer antepasado opaco', () => {
		const panel = document.createElement('div');
		panel.style.backgroundColor = PAPER;
		const card = document.createElement('button');
		card.style.backgroundColor = TINT;
		panel.append(card);
		document.body.append(panel);
		expect(opaqueBackground(card)).toBe(`linear-gradient(${TINT}, ${TINT}), ${PAPER}`);
	});

	test('transparente hasta arriba: cae al color `Canvas` del sistema', () => {
		const card = document.createElement('button');
		card.style.backgroundColor = 'transparent';
		document.body.append(card);
		expect(opaqueBackground(card)).toBe('Canvas');
	});
});

describe('setCopyDragImage', () => {
	test('pasa una COPIA opaca, de la misma caja, con el cursor donde se agarró, y la retira después', () => {
		vi.useFakeTimers();
		const panel = document.createElement('div');
		panel.style.backgroundColor = PAPER;
		const card = document.createElement('button');
		card.id = 'tile';
		card.innerHTML = '<span id="inner">Vídeo embebido</span>';
		card.style.backgroundColor = 'transparent';
		panel.append(card);
		document.body.append(panel);
		vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(rect(40, 300, 96, 64));
		const setDragImage = vi.fn();

		setCopyDragImage(dragStart(70, 320, setDragImage), card);

		expect(setDragImage).toHaveBeenCalledTimes(1);
		const [copy, x, y] = setDragImage.mock.calls[0] as [HTMLElement, number, number];
		expect(copy).not.toBe(card);
		expect(copy.textContent).toBe('Vídeo embebido');
		expect(copy.isConnected).toBe(true);
		expect(copy.parentElement).toBe(document.body);
		expect([x, y]).toEqual([30, 20]);
		expect(copy.style.position).toBe('fixed');
		expect([copy.style.left, copy.style.top, copy.style.width, copy.style.height]).toEqual([
			'40px',
			'300px',
			'96px',
			'64px'
		]);
		expect(copy.style.background).toContain(PAPER);
		expect(copy.style.opacity).toBe('1');
		expect(copy.getAttribute('aria-hidden')).toBe('true');
		// Ningún id duplicado en el documento mientras vive la copia.
		expect(document.querySelectorAll('#tile, #inner')).toHaveLength(2);

		vi.runAllTimers();
		expect(copy.isConnected).toBe(false);
		expect(card.isConnected).toBe(true);
	});

	test('el punto de agarre se recorta a la caja (un evento con coordenadas fuera de ella)', () => {
		const card = document.createElement('button');
		document.body.append(card);
		vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(rect(10, 10, 44, 44));
		const setDragImage = vi.fn();
		setCopyDragImage(dragStart(0, 200, setDragImage), card);
		expect(setDragImage.mock.calls[0].slice(1)).toEqual([0, 44]);
	});

	test('sin `setDragImage`, sin caja o sin elemento: no hace nada y no lanza', () => {
		const card = document.createElement('button');
		document.body.append(card);
		expect(() => setCopyDragImage(dragStart(1, 1), card)).not.toThrow();
		const setDragImage = vi.fn();
		setCopyDragImage(dragStart(1, 1, setDragImage), card); // jsdom: caja 0×0
		setCopyDragImage(dragStart(1, 1, setDragImage), null);
		expect(setDragImage).not.toHaveBeenCalled();
		expect(document.querySelector('[data-vega-drag-image]')).toBeNull();
	});
});
