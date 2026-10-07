/**
 * Los widgets respetan lo que el manifiesto y el esquema declaran: `placeholder` en Select, Chips,
 * Datetime y Richtext, y `min`/`max` del campo `date` en Datetime. Antes lo ignoraban (solo
 * `Text`/`Textarea`/`Number`/`Email`/`Url`/`Markdown` lo leían).
 */
import { flushSync, mount, unmount, tick, type Component } from 'svelte';
import type { WidgetComponent, WidgetProps } from './types';
import { afterEach, describe, expect, test, vi } from 'vitest';
import Select from './Select.svelte';
import Chips from './Chips.svelte';
import Datetime from './Datetime.svelte';
import Richtext from './Richtext.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { FieldInputValue } from '$lib/backend/types';
import type { ResolvedField } from '$lib/model/types';
import { isoUtcToLocalInput, localInputToIsoUtc } from './datetime';
import { ensureLocaleLoaded, t, type Locale } from '$lib/i18n';
import { fieldIds } from '../field-ids';

function field(schema: Record<string, unknown>, placeholder: string | null): ResolvedField {
	return {
		schema: {
			name: 'f',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false,
			...schema
		},
		name: 'f',
		label: 'F',
		help: null,
		placeholder,
		hidden: false,
		group: null,
		widget: 'text',
		subtype: null,
		listable: false
	} as unknown as ResolvedField;
}

const ctx = { t: (key: string) => key, locale: 'es' } as unknown as VegaAppContext;

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

function mountWidget(
	widget: WidgetComponent,
	f: ResolvedField,
	value: FieldInputValue,
	opts?: { props?: Partial<WidgetProps>; ctx?: VegaAppContext }
) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(widget as unknown as Component<Record<string, unknown>>, {
		target,
		props: {
			field: f,
			value,
			error: null,
			disabled: false,
			readonly: false,
			onChange: vi.fn(),
			...opts?.props
		},
		context: new Map([[VEGA_CONTEXT_KEY, opts?.ctx ?? ctx]])
	});
	mounted = { target, instance };
	return target;
}

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

const selectSchema = { type: 'select', options: ['a', 'b'], multiple: false };
const chipsSchema = { type: 'select', options: ['a', 'b'], multiple: true };

describe('Select — placeholder', () => {
	test('el texto de la opción vacía es el placeholder del manifiesto', () => {
		const target = mountWidget(Select, field(selectSchema, 'Elige uno'), null);
		expect(target.querySelector('option[value=""]')?.textContent).toBe('Elige uno');
	});

	test('sin placeholder conserva el texto por defecto', () => {
		const target = mountWidget(Select, field(selectSchema, null), null);
		expect(target.querySelector('option[value=""]')?.textContent).toBe('form.select.empty');
	});

	test('placeholder vacío o solo espacios conserva una opción vacía legible', async () => {
		for (const placeholder of ['', '   ']) {
			const target = mountWidget(Select, field(selectSchema, placeholder), null);
			expect(target.querySelector('option[value=""]')?.textContent).toBe('form.select.empty');
			await unmount(mounted!.instance);
			mounted!.target.remove();
			mounted = null;
		}
	});
});

describe('Chips — placeholder', () => {
	test('se pinta como pista mientras no hay selección', () => {
		const target = mountWidget(Chips, field(chipsSchema, 'Marca las que apliquen'), []);
		expect(target.querySelector('.vega-chips-placeholder')?.textContent).toBe(
			'Marca las que apliquen'
		);
	});

	test('desaparece con una selección y no se pinta sin placeholder', () => {
		const withValue = mountWidget(Chips, field(chipsSchema, 'Pista'), ['a']);
		expect(withValue.querySelector('.vega-chips-placeholder')).toBeNull();
		const without = mountWidget(Chips, field(chipsSchema, null), []);
		expect(without.querySelector('.vega-chips-placeholder')).toBeNull();
	});
});

describe('Datetime — placeholder, min y max', () => {
	const iso = { min: '2024-01-15T10:30:00.000Z', max: '2030-12-31T23:00:00.000Z' };

	test('placeholder del manifiesto y min/max del esquema, en hora de pared como el valor', () => {
		const target = mountWidget(Datetime, field({ type: 'date', ...iso }, 'Cuándo'), null);
		const input = target.querySelector('input') as HTMLInputElement;
		expect(input.placeholder).toBe('Cuándo');
		expect(input.min).toBe(isoUtcToLocalInput(iso.min));
		expect(input.max).toBe(isoUtcToLocalInput(iso.max));
		expect(input.min).not.toBe('');
	});

	test('sin min/max ni placeholder no pone los atributos', () => {
		const target = mountWidget(Datetime, field({ type: 'date' }, null), null);
		const input = target.querySelector('input') as HTMLInputElement;
		expect(input.hasAttribute('min')).toBe(false);
		expect(input.hasAttribute('max')).toBe(false);
		expect(input.hasAttribute('placeholder')).toBe(false);
	});

	test('idioma efectivo, mes escrito y ayuda enlazada se actualizan sin cambiar el valor UTC', async () => {
		await ensureLocaleLoaded('en');
		const state = $state({ locale: 'es' as Locale });
		const localizedCtx = {
			get locale() {
				return state.locale;
			},
			t: (key: string, params?: Record<string, string | number>) => t(state.locale, key, params)
		} as unknown as VegaAppContext;
		const value = '2026-07-15T13:30:00.000Z';
		const onChange = vi.fn();
		const f = { ...field({ type: 'date' }, null), help: 'Ayuda del manifiesto' };
		const target = mountWidget(Datetime, f, value, {
			ctx: localizedCtx,
			props: { onChange, error: { code: 'invalid-date', message: 'Fecha inválida', known: false } }
		});
		const input = target.querySelector<HTMLInputElement>('input')!;
		const help = target.querySelector<HTMLElement>('.vega-datetime-help')!;
		const ids = fieldIds(f.name);
		expect(input.type).toBe('datetime-local');
		expect(input.lang).toBe('es');
		expect(input.value).toBe(isoUtcToLocalInput(value));
		expect(input.getAttribute('aria-describedby')?.split(' ')).toEqual([
			ids.helpId,
			ids.errorId,
			help.id
		]);
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(help.textContent).toContain('Fecha y hora locales de este dispositivo');
		expect(help.textContent).toContain('julio');
		expect(help.textContent).not.toContain('form.datetime.');

		state.locale = 'en';
		flushSync();
		expect(input.lang).toBe('en');
		expect(help.textContent).toContain('July');
		expect(help.textContent).toContain('Selected date:');
		expect(input.value).toBe(isoUtcToLocalInput(value));
		expect(onChange).not.toHaveBeenCalled();
	});

	test('vacío o inválido conserva ayuda sin inventar una fecha legible', async () => {
		for (const value of [null, 'invalid-date']) {
			const target = mountWidget(Datetime, field({ type: 'date' }, null), value);
			expect(target.querySelector<HTMLInputElement>('input')?.value).toBe('');
			expect(target.querySelector('.vega-datetime-help')).not.toBeNull();
			expect(target.querySelector('.vega-datetime-value')).toBeNull();
			await unmount(mounted!.instance);
			mounted!.target.remove();
			mounted = null;
		}
	});

	test('editar y vaciar usan la conversión existente, sin emitir al montar', () => {
		const onChange = vi.fn();
		const target = mountWidget(
			Datetime,
			field({ type: 'date' }, null),
			'2026-07-15T13:30:00.000Z',
			{
				props: { onChange }
			}
		);
		const input = target.querySelector<HTMLInputElement>('input')!;
		expect(onChange).not.toHaveBeenCalled();
		input.value = '2026-07-15T16:45';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		expect(onChange).toHaveBeenLastCalledWith(localInputToIsoUtc('2026-07-15T16:45'));
		input.value = '';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		expect(onChange).toHaveBeenLastCalledWith(null);
	});

	test.each(['readonly', 'disabled'] as const)(
		'%s: la fecha sigue legible y no emite cambios',
		(state) => {
			const onChange = vi.fn();
			const target = mountWidget(
				Datetime,
				field({ type: 'date' }, null),
				'2026-07-15T13:30:00.000Z',
				{
					props: { [state]: true, onChange }
				}
			);
			const input = target.querySelector<HTMLInputElement>('input')!;
			expect(input.disabled).toBe(true);
			expect(target.querySelector('.vega-datetime-value')).not.toBeNull();
			expect(onChange).not.toHaveBeenCalled();
		}
	);

	test('un valor existente anterior al mínimo no bloquea el submit nativo', () => {
		const target = mountWidget(
			Datetime,
			field({ type: 'date', ...iso }, null),
			'2023-12-01T10:00:00.000Z'
		);
		const input = target.querySelector('input') as HTMLInputElement;
		expect(input.hasAttribute('min')).toBe(false);
		expect(input.max).toBe(isoUtcToLocalInput(iso.max));
		expect(input.validity.rangeUnderflow).toBe(false);
	});

	test('un valor existente posterior al máximo no bloquea el submit nativo', () => {
		const target = mountWidget(
			Datetime,
			field({ type: 'date', ...iso }, null),
			'2031-01-01T10:00:00.000Z'
		);
		const input = target.querySelector('input') as HTMLInputElement;
		expect(input.hasAttribute('max')).toBe(false);
		expect(input.min).toBe(isoUtcToLocalInput(iso.min));
		expect(input.validity.rangeOverflow).toBe(false);
	});
});

describe('Richtext — placeholder', () => {
	const richSchema = { type: 'richtext', subtype: 'html' };

	async function settle(target: HTMLElement): Promise<void> {
		await vi.waitFor(() => {
			expect(target.querySelector('[role="textbox"]')).not.toBeNull();
		});
		await tick();
	}

	test('se pinta sobre el editor vacío y no mientras tiene contenido', async () => {
		const empty = mountWidget(Richtext, field(richSchema, 'Escribe aquí'), '');
		await settle(empty);
		expect(empty.querySelector('.vega-widget-richtext-placeholder')?.textContent).toBe(
			'Escribe aquí'
		);
		await unmount(mounted!.instance);
		mounted!.target.remove();

		const filled = mountWidget(Richtext, field(richSchema, 'Escribe aquí'), '<p>Hola</p>');
		await settle(filled);
		expect(filled.querySelector('.vega-widget-richtext-placeholder')).toBeNull();
	});

	test('sin placeholder en el manifiesto no pinta nada', async () => {
		const target = mountWidget(Richtext, field(richSchema, null), '');
		await settle(target);
		expect(target.querySelector('.vega-widget-richtext-placeholder')).toBeNull();
	});
});
