/**
 * Suite de `RichtextLinkDialog.svelte`: los dos modos del diálogo de enlace y sus estados. El
 * diálogo no toca el editor, así que aquí se afirma sobre lo que DEVUELVE (`onApply`, `onRemove`,
 * `onClose`); que eso acabe bien escrito en el HTML lo cubre `Richtext.svelte.test.ts`.
 *
 * `t` devuelve la clave, así que las aserciones van contra claves y atributos, no contra textos.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import RichtextLinkDialog from './RichtextLinkDialog.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { VegaError } from '$lib/backend/errors';
import type { ResolvedContentType } from '$lib/model/types';

function textField(name: string) {
	return {
		name,
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
}

const PAGE_TYPE = {
	name: 'paginas',
	label: 'Páginas',
	labelSingular: 'Página',
	titleField: 'title',
	schema: { name: 'paginas', fields: [textField('title'), textField('ruta')] },
	page: { pathField: 'ruta', pathFieldUnique: true, layoutField: null, localizedPath: null }
} as unknown as ResolvedContentType;

const PAGES = [
	{ id: 'p1', type: 'paginas', values: { title: 'Sobre mí', ruta: '/sobre-mi' } },
	{ id: 'p2', type: 'paginas', values: { title: 'Contacto', ruta: '/contacto' } },
	{ id: 'p3', type: 'paginas', values: { title: 'Borrador sin ruta', ruta: '' } }
];

function pageResult(items: unknown[]) {
	return { items, page: 1, perPage: 20, totalItems: items.length, totalPages: 1 };
}

interface Mounted {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	list: ReturnType<typeof vi.fn>;
	onApply: ReturnType<typeof vi.fn>;
	onRemove: ReturnType<typeof vi.fn>;
	onClose: ReturnType<typeof vi.fn>;
}

let mounted: Mounted | null = null;

function mountDialog(
	opts: {
		currentHref?: string | null;
		types?: ResolvedContentType[];
		list?: ReturnType<typeof vi.fn>;
	} = {}
): Mounted {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const list = opts.list ?? vi.fn(async () => pageResult(PAGES));
	const ctx = {
		port: { list },
		model: { types: opts.types ?? [PAGE_TYPE] },
		t: (key: string) => key,
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const onApply = vi.fn();
	const onRemove = vi.fn();
	const onClose = vi.fn();
	const instance = mount(RichtextLinkDialog, {
		target,
		props: { currentHref: opts.currentHref ?? null, onApply, onRemove, onClose },
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance, list, onApply, onRemove, onClose };
	return mounted;
}

async function settle(): Promise<void> {
	for (let i = 0; i < 10; i++) await Promise.resolve();
	await tick();
}

function radio(target: HTMLElement, value: 'page' | 'external'): HTMLInputElement {
	return target.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!;
}

async function chooseMode(target: HTMLElement, value: 'page' | 'external'): Promise<void> {
	const input = radio(target, value);
	input.checked = true;
	input.dispatchEvent(new Event('change', { bubbles: true }));
	await tick();
}

async function typeUrl(target: HTMLElement, value: string): Promise<void> {
	const input = target.querySelector<HTMLInputElement>('input[inputmode="url"]')!;
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await tick();
}

async function submit(target: HTMLElement): Promise<void> {
	target
		.querySelector('form')!
		.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
	await tick();
}

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

describe('RichtextLinkDialog — página del sitio', () => {
	test('lista las páginas con su ruta y, al elegir una, devuelve la RUTA como href', async () => {
		const { target, list, onApply } = mountDialog();
		expect(target.querySelector('[data-link-pages="loading"]')).not.toBeNull();
		await settle();

		expect(list).toHaveBeenCalledWith('paginas', { perPage: 20 });
		const rows = Array.from(target.querySelectorAll<HTMLButtonElement>('.vega-rt-link-page'));
		expect(rows.map((row) => row.querySelector('.vega-rt-link-page-title')?.textContent)).toEqual([
			'Sobre mí',
			'Contacto',
			'Borrador sin ruta'
		]);
		expect(rows[0].querySelector('.vega-rt-link-page-path')?.textContent).toBe('/sobre-mi');

		rows[0].click();
		await tick();
		expect(rows[0].getAttribute('aria-pressed')).toBe('true');
		await submit(target);

		expect(onApply).toHaveBeenCalledWith({ href: '/sobre-mi', text: 'Sobre mí' });
	});

	test('una página sin ruta se enseña pero no se puede elegir', async () => {
		const { target, onApply } = mountDialog();
		await settle();
		const rows = Array.from(target.querySelectorAll<HTMLButtonElement>('.vega-rt-link-page'));

		expect(rows[2].getAttribute('aria-disabled')).toBe('true');
		rows[2].click();
		await tick();
		await submit(target);

		expect(onApply).not.toHaveBeenCalled();
		expect(target.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
			'form.editor.linkDialog.error.noPage'
		);
	});

	test('sin resultados lo dice', async () => {
		const { target } = mountDialog({ list: vi.fn(async () => pageResult([])) });
		await settle();

		expect(target.querySelector('.vega-rt-link-status')?.textContent?.trim()).toBe(
			'form.editor.linkDialog.empty'
		);
	});

	test('un fallo de red se pinta con «Reintentar», y reintentar vuelve a pedir', async () => {
		const list = vi
			.fn()
			.mockRejectedValueOnce(VegaError.network('sin conexión'))
			.mockResolvedValueOnce(pageResult(PAGES));
		const { target } = mountDialog({ list });
		await settle();

		const error = target.querySelector('.vega-rt-link-error');
		expect(error?.getAttribute('role')).toBe('alert');
		error!.querySelector('button')!.click();
		await settle();

		expect(list).toHaveBeenCalledTimes(2);
		expect(target.querySelectorAll('.vega-rt-link-page')).toHaveLength(3);
	});

	test('sin ningún tipo con ruta abre en «Dirección externa» y el modo de página lo explica', async () => {
		const { target, list } = mountDialog({ types: [] });
		await settle();

		expect(radio(target, 'external').checked).toBe(true);
		expect(list).not.toHaveBeenCalled();
		await chooseMode(target, 'page');
		expect(target.querySelector('[data-link-pages="none"]')).not.toBeNull();
	});
});

describe('RichtextLinkDialog — dirección externa', () => {
	test('una dirección válida se devuelve tal cual', async () => {
		const { target, onApply } = mountDialog();
		await settle();
		await chooseMode(target, 'external');
		await typeUrl(target, ' https://fodaveg.net/blog ');
		await submit(target);

		expect(onApply).toHaveBeenCalledWith({
			href: 'https://fodaveg.net/blog',
			text: 'https://fodaveg.net/blog'
		});
	});

	test.each([
		['javascript:alert(1)', 'scheme'],
		['data:text/html,x', 'scheme'],
		['ejemplo.com', 'format'],
		['', 'empty']
	])('%j se rechaza (%s) y no se aplica', async (value, reason) => {
		const { target, onApply } = mountDialog();
		await settle();
		await chooseMode(target, 'external');
		await typeUrl(target, value);
		await submit(target);

		expect(onApply).not.toHaveBeenCalled();
		const input = target.querySelector<HTMLInputElement>('input[inputmode="url"]')!;
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(target.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
			`form.editor.linkDialog.error.${reason}`
		);
	});
});

describe('RichtextLinkDialog — sobre un enlace que ya existe', () => {
	test('externo: abre en «Dirección externa» con su valor y ofrece «Quitar enlace»', async () => {
		const { target, onRemove } = mountDialog({ currentHref: 'https://fodaveg.net/x' });
		await settle();

		expect(radio(target, 'external').checked).toBe(true);
		expect(target.querySelector<HTMLInputElement>('input[inputmode="url"]')!.value).toBe(
			'https://fodaveg.net/x'
		);
		target.querySelector<HTMLButtonElement>('.vega-rt-link-remove')!.click();
		expect(onRemove).toHaveBeenCalledTimes(1);
	});

	test('interno: abre en «Página del sitio» con su ruta ya elegida', async () => {
		const { target, onApply } = mountDialog({ currentHref: '/contacto' });
		await settle();

		expect(radio(target, 'page').checked).toBe(true);
		expect(target.querySelector('[data-link-selected]')?.textContent).toContain('/contacto');
		const rows = Array.from(target.querySelectorAll<HTMLButtonElement>('.vega-rt-link-page'));
		expect(rows[1].getAttribute('aria-pressed')).toBe('true');
		await submit(target);
		expect(onApply).toHaveBeenCalledWith({ href: '/contacto', text: '/contacto' });
	});

	test('sin enlace previo no hay «Quitar enlace»; «Cancelar» solo cierra', async () => {
		const { target, onClose, onApply, onRemove } = mountDialog();
		await settle();

		expect(target.querySelector('.vega-rt-link-remove')).toBeNull();
		const cancel = Array.from(target.querySelectorAll('button')).find(
			(button) => button.textContent?.trim() === 'common.cancel'
		)!;
		cancel.click();

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onApply).not.toHaveBeenCalled();
		expect(onRemove).not.toHaveBeenCalled();
	});
});
