/**
 * «Guardar» del formulario de una página guarda TAMBIÉN sus secciones con cambios (QA de fodaveg,
 * 21 oct 2026: en `/c/pages/<id>`, con una sección desplegada y su Cuerpo editado, «Guardar ⌘S»
 * guardaba solo los campos de la página, decía «Guardado.» y `page_sections.bodyEs` no cambiaba).
 *
 * Se monta `RecordForm` con la forma de fodaveg (`pages` + `page_sections`, cuerpo Markdown en una
 * columna) sobre el adaptador `memory`, y se mide en el servidor de mentira, no en el DOM: qué se
 * escribió, cuándo sale «Guardado.» (`onSaved`, que la ruta convierte en el aviso) y adónde va el
 * foco cuando una sección no se puede guardar.
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import RecordForm from './RecordForm.svelte';
import { buildFormModel } from './form-model';
import { fieldIds } from './field-ids';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ContentType, Field } from '$lib/backend/types';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';

vi.mock('$app/navigation', () => ({ beforeNavigate: () => {} }));

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
		{ ...base, name: 'titleEs', type: 'text', subtype: 'plain', presentable: true } as Field,
		{ ...base, name: 'bodyEs', type: 'text', subtype: 'plain' } as Field
	]
};

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

async function mountPage() {
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
	const type = model.types.find((t) => t.name === 'pages')!;
	const port = createMemoryBackend({
		users: [{ email: 'admin@vega.test', password: 'test-pass' }],
		contentTypes: [pageType, sectionType],
		records: {
			pages: [{ id: 'about', values: { title: 'Sobre mí' } }],
			page_sections: [
				{
					id: 's1',
					values: { page: 'about', sort: 0, type: 'text', data: {}, titleEs: 'Quién soy' }
				},
				{
					id: 's2',
					values: { page: 'about', sort: 1, type: 'text', data: {}, titleEs: 'Escríbeme' }
				}
			]
		}
	});
	await port.login({ email: 'admin@vega.test', password: 'test-pass' });
	const record = await port.get('pages', 'about');
	const onSaved = vi.fn();
	const ctx = {
		port,
		model,
		session: { token: 't', user: { id: 'u', email: 'admin@vega.test' } },
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es',
		nav: {},
		feedback: { toast: vi.fn(), reportError: vi.fn() },
		registerExitGuard: () => () => {},
		reloadModel: async () => {}
	} as unknown as VegaAppContext;
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(RecordForm, {
		target,
		props: {
			type,
			model: buildFormModel(type, record),
			typeReadonly: false,
			onSubmit: (input, opts) => port.update('pages', 'about', input, opts),
			onSaved,
			onCancel: () => {}
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance };
	await until(() => target.querySelectorAll('.vega-block-toggle').length === 2);
	return { target, port, onSaved, form: target.querySelector('form')! };
}

/** Espera a una condición (carga de la lista y del editor Markdown, guardados asíncronos). */
async function until(check: () => boolean): Promise<void> {
	for (let i = 0; i < 200 && !check(); i++) {
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	expect(check()).toBe(true);
}

function input(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
	control.value = value;
	control.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

/** Despliega la sección `id` y devuelve su cuerpo Markdown, ya habilitado. */
async function openBody(target: HTMLElement, id: string): Promise<HTMLTextAreaElement> {
	const toggle = target.querySelector<HTMLButtonElement>(
		`.vega-block-toggle[aria-controls="vega-block-body-${id}"]`
	)!;
	if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
	const body = () => target.querySelector<HTMLTextAreaElement>(`#vega-field-${id}-bodyEs`);
	await until(() => body() !== null && !body()!.disabled);
	return body()!;
}

const localState = (target: HTMLElement) =>
	target.querySelector('.vega-editor-local-state')?.textContent?.trim() ?? '';

describe('RecordForm: el Guardar de la página guarda también sus secciones', () => {
	test('«Guardar» escribe el cuerpo editado y solo después dice «Guardado.»', async () => {
		const { target, port, onSaved, form } = await mountPage();
		input(await openBody(target, 's1'), 'Hago software y dibujo.');
		expect(localState(target)).toBe('Cambios sin guardar en esta pantalla');

		form.requestSubmit();
		await until(() => onSaved.mock.calls.length > 0);

		expect((await port.get('page_sections', 's1')).values.bodyEs).toBe('Hago software y dibujo.');
		expect(onSaved).toHaveBeenCalledOnce();
		expect(localState(target)).toContain('Guardado en el servidor');
		expect(target.querySelector('.vega-block-dirty')).toBeNull();
	});

	test('⌘S con el foco dentro del cuerpo también lo guarda, junto con la página', async () => {
		const { target, port, onSaved } = await mountPage();
		input(target.querySelector<HTMLInputElement>(`#${fieldIds('title').inputId}`)!, 'Sobre mí ya');
		const body = await openBody(target, 's2');
		input(body, 'Escríbeme por correo.');
		body.focus();
		body.dispatchEvent(
			new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true })
		);
		await until(() => onSaved.mock.calls.length > 0);

		expect((await port.get('pages', 'about')).values.title).toBe('Sobre mí ya');
		expect((await port.get('page_sections', 's2')).values.bodyEs).toBe('Escríbeme por correo.');
		expect(onSaved).toHaveBeenCalledOnce();
	});

	test('una sección no válida no se escribe: el aviso la nombra, el foco va a su campo y no hay «Guardado.»', async () => {
		const { target, port, onSaved, form } = await mountPage();
		input(await openBody(target, 's1'), 'Texto bueno.');
		const bad = await openBody(target, 's2');
		input(bad, 'Contacto: <a href="/contacto" class="btn">aquí</a>');
		// Plegada con el borrador dentro: el rechazo la vuelve a desplegar.
		target
			.querySelector<HTMLButtonElement>('.vega-block-toggle[aria-controls="vega-block-body-s2"]')!
			.click();
		flushSync();
		target.querySelector<HTMLButtonElement>('.vega-editor-save-button')!.focus();

		form.requestSubmit();
		await until(() => document.activeElement === bad);

		expect((await port.get('page_sections', 's1')).values.bodyEs).toBe('Texto bueno.');
		expect((await port.get('page_sections', 's2')).values.bodyEs ?? '').toBe('');
		expect(onSaved).not.toHaveBeenCalled();
		await until(() => target.querySelector('.vega-visual-publish-error') !== null);
		expect(target.querySelector('.vega-visual-publish-error')?.textContent).toBe(
			'Sin guardar: Escríbeme. Cada sección dice qué falta.'
		);
		// El aviso ocupa el hueco del estado de la barra; el punto «sin guardar» sigue en la miga.
		expect(target.querySelector('.vega-editor-dirty')).not.toBeNull();

		// Corregida, el mismo Guardar la escribe y entonces sí: «Guardado.», y el aviso se va.
		input(bad, 'Contacto: [aquí](/contacto){.btn}');
		form.requestSubmit();
		await until(() => onSaved.mock.calls.length > 0);
		expect((await port.get('page_sections', 's2')).values.bodyEs).toBe(
			'Contacto: [aquí](/contacto){.btn}'
		);
		expect(target.querySelector('.vega-visual-publish-error')).toBeNull();
	});
});
