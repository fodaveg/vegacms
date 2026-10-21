/**
 * Guardar el formulario nunca se bloquea en silencio (QA de fodaveg, 21 oct 2026). En «Sobre mí»
 * el `<textarea>` Markdown de un bloque PLEGADO estaba marcado inválido con `setCustomValidity`:
 * el navegador cancelaba el envío de la página entera sin enseñar nada («An invalid form control
 * … is not focusable») y la página seguía en «Cambios sin guardar».
 *
 * Ahora el `<form>` va con `novalidate` y `RecordForm` lee la validez él mismo: un control PROPIO
 * inválido se convierte en error de campo (pintado, enfocado y resumido) y un control de un
 * bloque embebido —que se guarda con su propio botón— no impide guardar la página. jsdom aplica
 * la validación nativa en `requestSubmit()` igual que un navegador, así que sin el arreglo estos
 * casos no llegan nunca a `onSubmit` ni pintan nada.
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import RecordForm from './RecordForm.svelte';
import { buildFormModel } from './form-model';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ContentType, Field, VegaRecord } from '$lib/backend/types';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';

vi.mock('$app/navigation', () => ({ beforeNavigate: () => {} }));

const base = {
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
} as const;

const docsType: ContentType = {
	name: 'docs',
	readonly: false,
	fields: [
		{ ...base, name: 'title', type: 'text', subtype: 'plain' } as Field,
		{ ...base, name: 'meta', type: 'json' } as Field
	]
};

const record: VegaRecord = { id: 'd1', type: 'docs', values: { title: 'Hola', meta: { a: 1 } } };

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

// jsdom no implementa `scrollIntoView`; el foco al primer error lo usa para traer el campo a la vista.
Element.prototype.scrollIntoView ??= () => {};

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

async function mountForm(onSubmit = vi.fn(async () => record)) {
	const model = resolveContentModel({ types: [docsType], manifestRaw: {} });
	const type = model.types.find((t) => t.name === 'docs')!;
	const ctx = {
		port: {},
		model,
		session: { token: 't', user: { id: 'u', email: 'a@b.c' } },
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
			onSubmit,
			onSaved: () => {},
			onCancel: () => {}
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance };
	await tick();
	return { target, onSubmit, form: target.querySelector('form')! };
}

function type(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
	control.value = value;
	control.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

/** Espera a que `save()` termine (su validación es asíncrona: carga perezosa del lexer). */
async function settle(): Promise<void> {
	for (let i = 0; i < 5; i++) {
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

describe('RecordForm: un guardado rechazado se dice', () => {
	test('el <form> no deja que el navegador decida el envío', async () => {
		const { form } = await mountForm();
		expect(form.noValidate).toBe(true);
	});

	test('un control propio inválido da error de campo, resumen y foco, sin escribir', async () => {
		const { target, onSubmit, form } = await mountForm();
		const meta = target.querySelector<HTMLTextAreaElement>('textarea.vega-widget-json')!;
		type(meta, '{"a": ');
		expect(meta.validity.valid).toBe(false);

		form.requestSubmit();
		await settle();

		expect(onSubmit).not.toHaveBeenCalled();
		const alerts = [...target.querySelectorAll('[role="alert"]')].map((el) => el.textContent);
		expect(alerts.some((text) => /No se ha guardado\. Revisa: Meta\./.test(text ?? ''))).toBe(true);
		expect(document.activeElement).toBe(meta);
	});

	test('un control inválido de un bloque embebido no impide guardar la página', async () => {
		const { target, onSubmit, form } = await mountForm();
		// Lo que pinta `BlockEditor` dentro del `<form>` de la página (`RecordBlocks`): su raíz
		// lleva `data-vega-block-editor`, y su campo, inválido y PLEGADO (`hidden`).
		const block = document.createElement('div');
		block.setAttribute('data-vega-block-editor', '');
		block.hidden = true;
		block.innerHTML =
			'<div class="vega-field-row" data-field="bodyEs"><textarea id="cuerpo"></textarea></div>';
		form.appendChild(block);
		block.querySelector('textarea')!.setCustomValidity('El Markdown contiene HTML');

		type(
			target.querySelector<HTMLInputElement>('[data-field="title"] :is(input, textarea)')!,
			'Hola QA'
		);
		form.requestSubmit();
		await settle();

		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit.mock.calls[0]).toContainEqual({ title: 'Hola QA' });
	});
});
