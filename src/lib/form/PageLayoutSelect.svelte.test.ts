/**
 * Suite de `PageLayoutSelect.svelte` (modelo de páginas, tarea p1 `1dc63001`): las opciones salen
 * de `layouts` (etiqueta legible, no la clave cruda) y el valor emitido a `onChange` es SIEMPRE
 * un `string` (nunca `null` — a diferencia del widget `select` genérico, ver la cabecera del
 * componente). Montaje real (Svelte 5 `mount()`/`unmount()`), mismo patrón que
 * `FieldRow.svelte.test.ts`.
 */
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import PageLayoutSelect from './PageLayoutSelect.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ResolvedField, ResolvedLayout } from '$lib/model/types';

const layoutField: ResolvedField = {
	schema: {
		name: 'layout',
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	name: 'layout',
	label: 'Plantilla',
	help: null,
	placeholder: null,
	hidden: false,
	group: null,
	widget: 'text',
	subtype: 'plain',
	listable: false
};

const layouts: ResolvedLayout[] = [
	{ name: 'default', label: 'Por defecto', icon: null },
	{ name: 'landing', label: 'Landing', icon: null }
];

function fakeCtx(): VegaAppContext {
	return {
		t: (key: string) => (key === 'form.select.empty' ? '— sin selección —' : key)
	} as unknown as VegaAppContext;
}

function mountSelect(
	value: string,
	onChange = vi.fn()
): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	onChange: typeof onChange;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(PageLayoutSelect, {
		target,
		props: {
			field: layoutField,
			value,
			error: null,
			disabled: false,
			readonly: false,
			layouts,
			onChange
		},
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
	});
	return { target, instance, onChange };
}

describe('PageLayoutSelect.svelte', () => {
	let mounted: ReturnType<typeof mountSelect> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('pinta una opción vacía + una por layout, con la ETIQUETA legible (no la clave cruda)', () => {
		mounted = mountSelect('');
		const options = Array.from(mounted.target.querySelectorAll('option'));
		expect(options.map((o) => o.value)).toEqual(['', 'default', 'landing']);
		expect(options.map((o) => o.textContent)).toEqual([
			'— sin selección —',
			'Por defecto',
			'Landing'
		]);
	});

	test('preselecciona el valor actual', () => {
		mounted = mountSelect('landing');
		const select = mounted.target.querySelector('select') as HTMLSelectElement;
		expect(select.value).toBe('landing');
	});

	test('elegir una plantilla llama a onChange con el NOMBRE (string), nunca null', () => {
		mounted = mountSelect('');
		const select = mounted.target.querySelector('select') as HTMLSelectElement;
		select.value = 'default';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(mounted.onChange).toHaveBeenCalledWith('default');
	});

	test('volver a la opción vacía llama a onChange con "" (nunca null: layoutField es texto)', () => {
		mounted = mountSelect('landing');
		const select = mounted.target.querySelector('select') as HTMLSelectElement;
		select.value = '';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(mounted.onChange).toHaveBeenCalledWith('');
	});

	test('sin layouts declarados (manifiesto sin `layouts`): SIGUE pintando un select, solo con la opción vacía', () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const onChange = vi.fn();
		const instance = mount(PageLayoutSelect, {
			target,
			props: {
				field: layoutField,
				value: '',
				error: null,
				disabled: false,
				readonly: false,
				layouts: [],
				onChange
			},
			context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
		});
		const options = Array.from(target.querySelectorAll('option'));
		expect(options).toHaveLength(1);
		expect(target.querySelector('select')).not.toBeNull();
		unmount(instance);
		target.remove();
	});
});
