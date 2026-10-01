/**
 * Suite de `Json.svelte`: el texto que escribe el usuario es SUYO mientras escribe. Lo que se
 * rompía (audit 30 sep 2026): el `<textarea>` se pintaba desde el último JSON válido, así que un
 * JSON a medio escribir no avisaba de nada, el formulario se podía guardar con el valor viejo y,
 * al volver a ser válido, el reformateo movía el cursor a mitad de escritura.
 */
import { mount, unmount, tick } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import Json from './Json.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { FieldInputValue } from '$lib/backend/types';
import type { ResolvedField } from '$lib/model/types';

const jsonField = {
	schema: {
		name: 'meta',
		type: 'json',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	name: 'meta',
	label: 'Meta',
	help: null,
	placeholder: 'Pega un JSON',
	hidden: false,
	group: null,
	widget: 'json',
	subtype: null,
	listable: false
} as unknown as ResolvedField;

function fakeCtx(): VegaAppContext {
	return { t: (key: string) => key } as unknown as VegaAppContext;
}

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

async function mountJson(value: FieldInputValue, onChange = vi.fn()) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(Json, {
		target,
		props: { field: jsonField, value, error: null, disabled: false, readonly: false, onChange },
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
	});
	mounted = { target, instance };
	await tick(); // los efectos del montaje corren en el siguiente flush
	const textarea = target.querySelector('textarea') as HTMLTextAreaElement;
	return { target, textarea, onChange };
}

async function type(textarea: HTMLTextAreaElement, raw: string): Promise<void> {
	textarea.value = raw;
	textarea.dispatchEvent(new Event('input', { bubbles: true }));
	await tick();
}

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

describe('Json.svelte', () => {
	test('un campo vacío se muestra vacío, no «null», y trae el placeholder del manifiesto', async () => {
		const { textarea } = await mountJson(null);
		expect(textarea.value).toBe('');
		expect(textarea.placeholder).toBe('Pega un JSON');
	});

	test('JSON inválido: muestra error, invalida el formulario nativo y NO propaga el valor', async () => {
		const { target, textarea, onChange } = await mountJson({ a: 1 });
		await type(textarea, '{"a": ');
		expect(onChange).not.toHaveBeenCalled();
		expect(textarea.validity.customError).toBe(true);
		expect(textarea.getAttribute('aria-invalid')).toBe('true');
		expect(target.textContent).toContain('form.json.invalid');
		// Lo escrito sigue ahí tal cual.
		expect(textarea.value).toBe('{"a": ');
	});

	test('al volver a ser válido se propaga y se limpia el error, sin reformatear el texto mientras se escribe', async () => {
		const { target, textarea, onChange } = await mountJson({ a: 1 });
		await type(textarea, '{"a": ');
		await type(textarea, '{"a":2}');
		expect(onChange).toHaveBeenLastCalledWith({ a: 2 });
		expect(textarea.validity.customError).toBe(false);
		expect(target.textContent).not.toContain('form.json.invalid');
		expect(textarea.value).toBe('{"a":2}');
	});

	test('reformatea solo al perder el foco', async () => {
		const { textarea } = await mountJson({ a: 1 });
		await type(textarea, '{"a":2}');
		textarea.dispatchEvent(new FocusEvent('blur'));
		await tick();
		expect(textarea.value).toBe('{\n  "a": 2\n}');
	});

	test('al perder el foco con JSON inválido no toca el texto', async () => {
		const { textarea } = await mountJson({ a: 1 });
		await type(textarea, '{"a": ');
		textarea.dispatchEvent(new FocusEvent('blur'));
		await tick();
		expect(textarea.value).toBe('{"a": ');
		expect(textarea.validity.customError).toBe(true);
	});

	test('vaciar el texto sigue enviando null y deja el campo vacío', async () => {
		const { textarea, onChange } = await mountJson({ a: 1 });
		await type(textarea, '');
		expect(onChange).toHaveBeenLastCalledWith(null);
		expect(textarea.validity.customError).toBe(false);
	});
});
