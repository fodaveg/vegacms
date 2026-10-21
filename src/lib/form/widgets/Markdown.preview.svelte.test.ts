/**
 * Vista previa del widget `markdown` con los botones de fodaveg (QA, 21 oct 2026): el sitio los
 * escribe `[Contacto](/contacto){.btn}` y la vista previa no debe enseñar `{.btn}` como texto,
 * sino un enlace con esa clase (`parsePreviewMarkdown`, `richtext/markdown.ts`). Monta el widget
 * real: si deja de pasar por esa transformación, al montar o al escribir, esto falla. Lo que se
 * emite por `onChange` sigue siendo el texto escrito, sin tocar.
 */
import { mount, unmount, type Component } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import Markdown from './Markdown.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ResolvedField } from '$lib/model/types';

// jsdom no trae `matchMedia` (el widget elige su modo por el ancho).
window.matchMedia ??= (query: string) =>
	({
		matches: false,
		media: query,
		addEventListener() {},
		removeEventListener() {}
	}) as unknown as MediaQueryList;

const field = {
	schema: {
		name: 'bodyEs',
		type: 'text',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	name: 'bodyEs',
	label: 'Cuerpo',
	help: null,
	placeholder: null,
	hidden: false,
	group: null,
	widget: 'markdown',
	subtype: null,
	listable: false
} as unknown as ResolvedField;

const ctx = { t: (key: string) => key, locale: 'es' } as unknown as VegaAppContext;

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

function mountMarkdown(value: string, onChange = vi.fn()) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(Markdown as unknown as Component<Record<string, unknown>>, {
		target,
		props: { field, value, error: null, disabled: false, readonly: false, onChange },
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance };
	return target;
}

function previewLink(target: HTMLElement): HTMLAnchorElement | null {
	return target.querySelector<HTMLAnchorElement>('.vega-markdown-preview-content a');
}

describe('widget markdown: vista previa de `[texto](/ruta){.btn}`', () => {
	test('al montar: enlace con class="btn", sin `{.btn}` en la vista previa ni en el valor', async () => {
		const onChange = vi.fn();
		const value = 'Escríbeme: [Contacto](/contacto){.btn}';
		const target = mountMarkdown(value, onChange);
		await vi.waitFor(() => expect(previewLink(target)).not.toBeNull());
		const link = previewLink(target)!;
		expect(link.className).toBe('btn');
		expect(link.getAttribute('href')).toBe('/contacto');
		const preview = target.querySelector('.vega-markdown-preview-content')!;
		expect(preview.textContent).toBe('Escríbeme: Contacto');
		expect(target.querySelector('textarea')!.value).toBe(value);
		for (const [emitted] of onChange.mock.calls) expect(emitted).toBe(value);
	});

	test('al escribir: la vista previa se rehace con la clase y se emite el texto tal cual', async () => {
		const onChange = vi.fn();
		const target = mountMarkdown('Hola', onChange);
		await vi.waitFor(() =>
			expect(target.querySelector('.vega-markdown-preview-content')!.textContent).toBe('Hola')
		);
		const textarea = target.querySelector('textarea')!;
		const typed = 'Hola [Contacto](/contacto){.btn .btn-solid}';
		textarea.value = typed;
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		expect(onChange).toHaveBeenLastCalledWith(typed);
		await vi.waitFor(() => expect(previewLink(target)?.className).toBe('btn btn-solid'));
		expect(target.querySelector('.vega-markdown-preview-content')!.textContent).toBe(
			'Hola Contacto'
		);
	});
});
