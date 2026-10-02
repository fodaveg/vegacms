/**
 * El campo título pasa por el SITIO donde se enchufa (lote 12, lámina 4): `FieldRow` con
 * `isTitleField` monta `Text.svelte`, que pinta el `GrowingTextarea`. Se comprueba lo que la
 * lámina promete que NO cambia (clase, `id`, nombre accesible, `aria-*`, límites, valor guardado)
 * y lo que cambia (un textarea sin saltos de línea; Intro envía el formulario como en el `<input>`).
 * Y que un campo que NO es el título sigue siendo el `<input>` de siempre.
 */
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import FieldRow from './FieldRow.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ResolvedField } from '$lib/model/types';

const titleField: ResolvedField = {
	schema: {
		name: 'title',
		type: 'text',
		subtype: 'plain',
		required: true,
		readonly: false,
		presentable: true,
		hidden: false,
		unique: false,
		maxLength: 140
	},
	name: 'title',
	label: 'Título',
	help: 'Ayuda del título',
	placeholder: 'Escribe el título',
	hidden: false,
	group: 'Título',
	widget: 'text',
	subtype: 'plain',
	listable: true
};

function fakeCtx(): VegaAppContext {
	return { t: (key: string) => key, locale: 'es' } as unknown as VegaAppContext;
}

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

/** Monta `FieldRow` DENTRO de un `<form>` (como en `RecordForm`) para observar el envío. */
function setup(extra: Record<string, unknown> = {}): {
	target: HTMLElement;
	onChange: ReturnType<typeof vi.fn>;
	onSubmit: ReturnType<typeof vi.fn>;
} {
	const target = document.createElement('form');
	const onSubmit = vi.fn((event: Event) => event.preventDefault());
	target.addEventListener('submit', onSubmit);
	const button = document.createElement('button');
	button.type = 'submit';
	target.appendChild(button);
	const holder = document.createElement('div');
	target.insertBefore(holder, button);
	document.body.appendChild(target);
	const onChange = vi.fn();
	const instance = mount(FieldRow, {
		target: holder,
		props: {
			field: titleField,
			value: 'Hola',
			error: null,
			disabled: false,
			typeReadonly: false,
			isTitleField: true,
			onChange,
			...extra
		},
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
	});
	mounted = { target, instance };
	flushSync();
	return { target, onChange, onSubmit };
}

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

describe('FieldRow + Text — el título como área que crece', () => {
	test('el título es un <textarea rows="1"> con la clase, el id y la etiqueta del <input> de antes', () => {
		const { target } = setup();
		const area = target.querySelector('textarea')!;
		expect(target.querySelector('input.vega-widget-text')).toBeNull();
		expect(area.classList.contains('vega-widget-text')).toBe(true);
		expect(area.getAttribute('rows')).toBe('1');
		expect(area.id).toBe('vega-field-title');
		expect(target.querySelector('label')!.getAttribute('for')).toBe(area.id);
		expect(target.querySelector('label')!.textContent).toContain('Título');
		expect(area.value).toBe('Hola');
		expect(area.placeholder).toBe('Escribe el título');
		expect(area.maxLength).toBe(140);
		expect(area.getAttribute('aria-describedby')).toBe('vega-field-title-help');
	});

	test('con error: aria-invalid, aria-describedby al mensaje y el mismo mensaje de validación', () => {
		const { target } = setup({
			error: { code: 'validation_required', message: 'Este campo es obligatorio.', known: false }
		});
		const area = target.querySelector('textarea')!;
		expect(area.getAttribute('aria-invalid')).toBe('true');
		expect(area.getAttribute('aria-describedby')).toContain('vega-field-title-error');
		expect(target.querySelector('.vega-field-error')!.textContent).toContain(
			'Este campo es obligatorio.'
		);
	});

	test('con error el área lleva aria-invalid, de donde cuelga el subrayado rojo (lámina 4.4)', () => {
		// jsdom no calcula el CSS de Svelte: aquí solo se ve el atributo del que cuelga la regla
		// `.vega-field-row--title .vega-widget-text[aria-invalid='true']` (FieldRow.svelte). El color
		// real (borde inferior `--danger`, sin foco y con foco, 2px y sin `--sheen`) se mira en navegador.
		const { target } = setup({
			error: { code: 'validation_required', message: 'Este campo es obligatorio.', known: false }
		});
		const area = target.querySelector('textarea')!;
		expect(target.querySelector('.vega-field-row--title .vega-widget-text')).toBe(area);
		expect(
			target.querySelector(".vega-field-row--title .vega-widget-text[aria-invalid='true']")
		).toBe(area);
	});

	test('deshabilitado o solo lectura: el área queda deshabilitada', () => {
		expect(setup({ disabled: true }).target.querySelector('textarea')!.disabled).toBe(true);
	});

	test('escribir llama a onChange con el texto', () => {
		const { target, onChange } = setup();
		const area = target.querySelector('textarea')!;
		area.value = 'Otro título';
		area.dispatchEvent(new Event('input', { bubbles: true }));
		expect(onChange).toHaveBeenLastCalledWith('Otro título');
	});

	test('un texto pegado con saltos se guarda sin ellos', () => {
		const { target, onChange } = setup();
		const area = target.querySelector('textarea')!;
		area.value = 'Primera\nSegunda';
		area.dispatchEvent(new Event('input', { bubbles: true }));
		expect(onChange).toHaveBeenLastCalledWith('Primera Segunda');
		expect(area.value).toBe('Primera Segunda');
	});

	test('Intro no inserta un salto y envía el formulario, como en el <input> de antes', () => {
		const { target, onSubmit } = setup();
		const area = target.querySelector('textarea')!;
		const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		area.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(onSubmit).toHaveBeenCalledTimes(1);
	});

	test('un campo que NO es el título sigue siendo el <input type="text"> de siempre', () => {
		const { target } = setup({ isTitleField: false });
		expect(target.querySelector('textarea')).toBeNull();
		const input = target.querySelector('input.vega-widget-text') as HTMLInputElement;
		expect(input.type).toBe('text');
		expect(input.id).toBe('vega-field-title');
	});
});
