/**
 * La regla de guardado de un campo `markdown` en el guardado de un BLOQUE (QA de fodaveg, 21 oct
 * 2026). `BlockEditor` guarda con un botón, no con un `<form>`, así que hasta 0.14.0 ignoraba la
 * validez que el widget ponía en su `<textarea>`: el formulario clásico y el editor visual
 * guardaban el HTML del cuerpo de «Sobre mí» que el propio campo marcaba en rojo. Ahora aplica
 * la misma regla que el formulario (`markdown-safety.ts`), y un guardado rechazado despliega la
 * fila plegada, enfoca el campo y lo resume en una alerta. El texto heredado sin tocar no impide
 * guardar los demás campos.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ContentType, Field } from '$lib/backend/types';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';
import RecordBlocks from './RecordBlocks.svelte';

// jsdom no implementa `scrollIntoView` (el foco al primer error trae el campo a la vista) ni
// `matchMedia` (el widget Markdown elige su modo por el ancho).
Element.prototype.scrollIntoView ??= () => {};
window.matchMedia ??= (query: string) =>
	({
		matches: false,
		media: query,
		addEventListener() {},
		removeEventListener() {}
	}) as unknown as MediaQueryList;

const base = {
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
} as const;

const pageType: ContentType = {
	name: 'pages',
	readonly: false,
	fields: [{ ...base, name: 'title', type: 'text', subtype: 'plain', presentable: true } as Field]
};

const sectionType: ContentType = {
	name: 'page_sections',
	readonly: false,
	fields: [
		{ ...base, name: 'page', type: 'relation', target: 'pages', multiple: false } as Field,
		{ ...base, name: 'sort', type: 'number', integer: true } as Field,
		{ ...base, name: 'type', type: 'text', subtype: 'plain' } as Field,
		{ ...base, name: 'data', type: 'json' } as Field,
		{ ...base, name: 'titleEs', type: 'text', subtype: 'plain' } as Field,
		{ ...base, name: 'bodyEs', type: 'text', subtype: 'plain' } as Field
	]
};

/** El cuerpo de «Sobre mí»: Markdown con el botón heredado en HTML. */
const LEGACY = 'Puedes contactarme aquí:\n<a href="/contacto" class="btn">Contacto</a>\n';

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

async function mountSections() {
	const model = resolveContentModel({
		types: [pageType, sectionType],
		manifestRaw: {
			schemaVersion: 1,
			blockTypes: {
				text: {
					label: 'Texto',
					fields: [
						{ name: 'titleEs', label: 'Título', widget: 'text', source: 'record' },
						{ name: 'bodyEs', label: 'Cuerpo', widget: 'markdown', source: 'record' }
					]
				}
			},
			collections: {
				// Como fodaveg: el widget de una columna `source: record` lo dice SU colección.
				page_sections: { fields: { bodyEs: { widget: 'markdown' } } },
				pages: {
					blocks: {
						collection: 'page_sections',
						parentField: 'page',
						orderField: 'sort',
						typeField: 'type',
						dataField: 'data'
					}
				}
			}
		}
	});
	expect(model.warnings).toEqual([]);
	const parentType = model.types.find((t) => t.name === 'pages')!;
	const port = createMemoryBackend({
		users: [{ email: 'admin@vega.test', password: 'test-pass' }],
		contentTypes: [pageType, sectionType],
		records: {
			pages: [{ id: 'about', values: { title: 'Sobre mí' } }],
			page_sections: [
				{
					id: 's1',
					values: { page: 'about', sort: 0, type: 'text', data: {}, titleEs: '', bodyEs: LEGACY }
				}
			]
		}
	});
	await port.login({ email: 'admin@vega.test', password: 'test-pass' });
	const ctx = {
		port,
		model,
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(RecordBlocks, {
		target,
		props: { parentType, parentId: 'about', onDirtyChange: vi.fn() },
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance };
	return { target, port };
}

/** Espera a una condición del DOM (carga perezosa del editor Markdown, guardado asíncrono). */
async function until(check: () => boolean): Promise<void> {
	for (let i = 0; i < 100 && !check(); i++) {
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	expect(check()).toBe(true);
}

function input(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
	control.value = value;
	control.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('BlockEditor: un campo markdown con HTML', () => {
	test('heredado y sin tocar: avisa y deja guardar los demás campos', async () => {
		const { target, port } = await mountSections();
		await until(() => target.querySelector('.vega-block-toggle') !== null);
		target.querySelector<HTMLButtonElement>('.vega-block-toggle')!.click();
		const body = () => target.querySelector<HTMLTextAreaElement>('#vega-field-s1-bodyEs')!;
		await until(() => body() !== null && !body().disabled);
		await until(() => target.querySelector('.vega-markdown-security-note') !== null);
		expect(target.querySelector('.vega-markdown-security-note')?.textContent).toContain(
			'<a href="/contacto" class="btn">'
		);

		input(target.querySelector<HTMLInputElement>('#vega-field-s1-titleEs')!, 'Quién soy');
		await tick();
		target.querySelector<HTMLButtonElement>('.vega-block-save-button')!.click();
		await until(() => target.querySelector('.vega-block-dirty') === null);

		const saved = await port.get('page_sections', 's1');
		expect(saved.values.titleEs).toBe('Quién soy');
		expect(saved.values.bodyEs).toBe(LEGACY);
	});

	test('cambiado y aún con HTML: no se guarda, se despliega, se enfoca y se resume', async () => {
		const { target, port } = await mountSections();
		await until(() => target.querySelector('.vega-block-toggle') !== null);
		const toggle = target.querySelector<HTMLButtonElement>('.vega-block-toggle')!;
		toggle.click();
		const body = () => target.querySelector<HTMLTextAreaElement>('#vega-field-s1-bodyEs')!;
		await until(() => body() !== null && !body().disabled);

		input(body(), `${LEGACY}\nY algo más.`);
		await tick();
		toggle.click(); // la fila se pliega con el borrador dentro
		await tick();
		expect(toggle.getAttribute('aria-expanded')).toBe('false');

		const update = vi.spyOn(port, 'update');
		target.querySelector<HTMLButtonElement>('.vega-block-save-button')!.click();
		await until(() => toggle.getAttribute('aria-expanded') === 'true');
		await until(() => document.activeElement === body());

		expect(update).not.toHaveBeenCalled();
		const alerts = [...target.querySelectorAll('[role="alert"]')].map((el) => el.textContent);
		expect(
			alerts.some((text) => /No se ha guardado el bloque\. Revisa: Cuerpo\./.test(text ?? ''))
		).toBe(true);
		expect(target.querySelector('[data-field="bodyEs"]')?.textContent).toContain(
			'No se puede guardar'
		);
		expect((await port.get('page_sections', 's1')).values.bodyEs).toBe(LEGACY);
	});
});
