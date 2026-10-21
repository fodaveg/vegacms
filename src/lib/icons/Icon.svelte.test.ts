/**
 * `Icon.svelte`: cada id del registro tiene su propio dibujo. Un id añadido a `registry.ts` sin
 * rama en el componente caería en silencio al `generic` (el círculo de aviso), y el test de
 * `tests/shell/icons.test.ts` solo mira la lista, no el SVG. También fija el grosor de trazo.
 */
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test } from 'vitest';
import Icon from './Icon.svelte';
import { knownIcons } from './registry';

const mounted: ReturnType<typeof mount>[] = [];

function render(id: string, props: Record<string, unknown> = {}): SVGSVGElement {
	const target = document.createElement('div');
	document.body.appendChild(target);
	mounted.push(mount(Icon, { target, props: { id, ...props } }));
	return target.querySelector('svg')!;
}

afterEach(() => {
	for (const instance of mounted.splice(0)) void unmount(instance);
	document.body.innerHTML = '';
});

describe('Icon', () => {
	test('ningún id conocido, salvo generic, cae al dibujo genérico', () => {
		const generic = render('generic').innerHTML;
		const fallbacks = knownIcons.filter(
			(id) => id !== 'generic' && render(id).innerHTML === generic
		);
		expect(fallbacks).toEqual([]);
	});

	test('dos ids distintos no comparten dibujo', () => {
		const byDrawing = new Map<string, string>();
		const duplicates: string[] = [];
		for (const id of knownIcons) {
			const drawing = render(id).innerHTML;
			const previous = byDrawing.get(drawing);
			if (previous) duplicates.push(`${previous}=${id}`);
			else byDrawing.set(drawing, id);
		}
		expect(duplicates).toEqual([]);
	});

	test('el grosor de trazo es 2 por defecto y se puede afinar', () => {
		expect(render('search').getAttribute('stroke-width')).toBe('2');
		expect(render('search', { strokeWidth: 1.6 }).getAttribute('stroke-width')).toBe('1.6');
	});
});
