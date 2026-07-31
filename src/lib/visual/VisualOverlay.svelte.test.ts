/**
 * Suite de `VisualOverlay.svelte` (tarea "contornos de selección"): geometría de las cajas
 * contra `rect`, el modificador de seleccionada, que nada aquí captura el puntero, los cuatro
 * estados que hay que pintar de verdad (cargando/sin bloques/bloques mal descritos/tipo no
 * soportado) y que el par `renderedBlockTypes` ausente no marca nada. No prueba el resalte por
 * ratón ni la selección por clic: ver la cabecera del componente para el porqué de los dos.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test } from 'vitest';
import VisualOverlay from './VisualOverlay.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { t as translate } from '$lib/i18n';
import type { VisualBlock } from './bridge-client';

/** Mismo vocabulario que el `status` interno del componente (no exportado, ver su cabecera):
 *  duplicado aquí a propósito, dos literales no merecen un módulo compartido. */
type VisualOverlayStatus = 'waiting' | 'ready';

function fakeCtx(): VegaAppContext {
	return {
		locale: 'es',
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params)
	} as unknown as VegaAppContext;
}

function block(id: string, type: string, rect: Partial<VisualBlock['rect']> = {}): VisualBlock {
	return { id, type, rect: { top: 0, left: 0, width: 100, height: 50, ...rect } };
}

function mountOverlay(props: {
	blocks: VisualBlock[];
	selectedId?: string | null;
	highlightedId?: string | null;
	skippedBlocks?: number;
	status: VisualOverlayStatus;
	renderedBlockTypes?: readonly string[] | null;
}): { target: HTMLElement; instance: ReturnType<typeof mount> } {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(VisualOverlay, {
		target,
		props: {
			selectedId: null,
			highlightedId: null,
			skippedBlocks: 0,
			renderedBlockTypes: null,
			...props
		},
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
	});
	return { target, instance };
}

describe('VisualOverlay.svelte', () => {
	let mounted: ReturnType<typeof mountOverlay> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('coloca una caja por bloque, posicionada con SU rect', async () => {
		mounted = mountOverlay({
			status: 'ready',
			blocks: [
				block('b1', 'hero', { top: 10, left: 20, width: 300, height: 150 }),
				block('b2', 'gallery', { top: 200, left: 0, width: 640, height: 480 })
			]
		});
		await tick();

		const b1 = mounted.target.querySelector<HTMLElement>('[data-vega-block-id="b1"]');
		const b2 = mounted.target.querySelector<HTMLElement>('[data-vega-block-id="b2"]');
		expect(b1?.style.top).toBe('10px');
		expect(b1?.style.left).toBe('20px');
		expect(b1?.style.width).toBe('300px');
		expect(b1?.style.height).toBe('150px');
		expect(b2?.style.top).toBe('200px');
		expect(b2?.style.width).toBe('640px');
	});

	test('marca la caja seleccionada, y solo esa', async () => {
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero'), block('b2', 'gallery')],
			selectedId: 'b2'
		});
		await tick();

		const b1 = mounted.target.querySelector('[data-vega-block-id="b1"]');
		const b2 = mounted.target.querySelector('[data-vega-block-id="b2"]');
		expect(b1?.classList.contains('vega-visual-overlay-box--selected')).toBe(false);
		expect(b2?.classList.contains('vega-visual-overlay-box--selected')).toBe(true);
	});

	test('marca la caja resaltada por Vega (`highlightedId`), independiente de la seleccionada', async () => {
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero'), block('b2', 'gallery')],
			selectedId: 'b1',
			highlightedId: 'b2'
		});
		await tick();

		const b2 = mounted.target.querySelector('[data-vega-block-id="b2"]');
		expect(b2?.classList.contains('vega-visual-overlay-box--highlighted')).toBe(true);
		expect(b2?.classList.contains('vega-visual-overlay-box--selected')).toBe(false);
	});

	test('nada captura el puntero: ni el contenedor ni una caja', async () => {
		mounted = mountOverlay({ status: 'ready', blocks: [block('b1', 'hero')] });
		await tick();

		// `pointer-events: none` va en línea (`style:`, ver la cabecera del componente): esta
		// suite corre en el proyecto `component` de Vitest, que NO procesa el `<style>` scoped de
		// Svelte (`test.css` no está activado — sin él no hay hoja de estilos que
		// `getComputedStyle` pueda leer), así que el estilo en línea es también lo único que un
		// test puede verificar aquí sin encender ese pipeline para todo el repo.
		const root = mounted.target.querySelector<HTMLElement>('.vega-visual-overlay-root');
		const box = mounted.target.querySelector<HTMLElement>('.vega-visual-overlay-box');
		expect(root?.style.pointerEvents).toBe('none');
		expect(box?.style.pointerEvents).toBe('none');
	});

	test('estado "cargando": sin bloques todavía no dice lo mismo que "sin bloques"', async () => {
		mounted = mountOverlay({ status: 'waiting', blocks: [] });
		await tick();

		expect(mounted.target.querySelector('.vega-visual-overlay-status')?.textContent).toContain(
			translate('es', 'editor.visual.overlay.waiting')
		);
	});

	test('estado "sin bloques": conectado pero el sitio no describió ninguno', async () => {
		mounted = mountOverlay({ status: 'ready', blocks: [] });
		await tick();

		expect(mounted.target.querySelector('.vega-visual-overlay-status')?.textContent).toContain(
			translate('es', 'editor.visual.overlay.empty')
		);
	});

	test('estado "bloques mal descritos": dice el número, no lo esconde', async () => {
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero')],
			skippedBlocks: 3
		});
		await tick();

		expect(mounted.target.querySelector('.vega-visual-overlay-status')?.textContent).toContain(
			translate('es', 'editor.visual.overlay.skipped', { count: 3 })
		);
		// Y con bloques SÍ pintados, no reemplaza el estado "sin bloques".
		expect(mounted.target.querySelector('.vega-visual-overlay-status')?.textContent).not.toContain(
			translate('es', 'editor.visual.overlay.empty')
		);
	});

	test('tipo que el sitio no sabe pintar: la etiqueta se marca no soportada, la caja sigue ahí', async () => {
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero'), block('b2', 'carrusel-raro')],
			renderedBlockTypes: ['hero']
		});
		await tick();

		const supported = mounted.target.querySelector(
			'[data-vega-block-id="b1"] .vega-visual-overlay-label'
		);
		const unsupported = mounted.target.querySelector(
			'[data-vega-block-id="b2"] .vega-visual-overlay-label'
		);
		expect(supported?.classList.contains('vega-visual-overlay-label--unsupported')).toBe(false);
		expect(unsupported?.classList.contains('vega-visual-overlay-label--unsupported')).toBe(true);
		expect(unsupported?.textContent).toContain(
			translate('es', 'editor.visual.overlay.unsupported')
		);
	});

	test('sin `renderedBlockTypes` (proyecto legacy o sin discovery): ningún bloque se marca', async () => {
		mounted = mountOverlay({
			status: 'ready',
			blocks: [block('b1', 'hero'), block('b2', 'carrusel-raro')],
			renderedBlockTypes: null
		});
		await tick();

		const labels = mounted.target.querySelectorAll('.vega-visual-overlay-label--unsupported');
		expect(labels).toHaveLength(0);
	});
});
