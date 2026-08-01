/**
 * Suite de `FieldRow.svelte` — SOLO la prop `stacked` (§4.9b): dentro de un grupo con
 * `columns > 1`, `RecordForm.svelte` la pasa `true` y la fila debe pintar la clase modificadora
 * `vega-field-row--stacked` (label ENCIMA del control, sin padding/borde propios — ver la
 * cabecera del componente y su CSS). Montaje real (proyecto vitest `component`, Svelte 5
 * `mount()`/`unmount()`), mismo patrón que `widgets/FileInput.svelte.test.ts` (el primer uso real
 * de la convención `*.svelte.test.ts`): un `VegaAppContext` de mentira basta, el widget `text`
 * nunca llama a `ctx.t` si no hay error que traducir.
 */
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import FieldRow from './FieldRow.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ResolvedField, ResolvedLayout } from '$lib/model/types';

const titleField: ResolvedField = {
	schema: {
		name: 'title',
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: true,
		hidden: false,
		unique: false
	},
	name: 'title',
	label: 'Título',
	help: null,
	placeholder: null,
	hidden: false,
	group: 'Título',
	widget: 'text',
	subtype: 'plain',
	listable: true
};

/** `VegaAppContext` mínimo: nada de lo que mira `FieldRow`/el widget `text` (sin error) llega a
 *  invocar nada más que `t`, que ni siquiera hace falta llamar si no hay error que traducir. */
function fakeCtx(): VegaAppContext {
	return { t: (key: string) => key, locale: 'es' } as unknown as VegaAppContext;
}

function mountFieldRow(stacked: boolean | undefined): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(FieldRow, {
		target,
		props: {
			field: titleField,
			value: null,
			error: null,
			disabled: false,
			typeReadonly: false,
			...(stacked === undefined ? {} : { stacked }),
			onChange: vi.fn()
		},
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
	});
	return { target, instance };
}

describe('FieldRow.svelte — prop `stacked` (§4.9b, rejilla de columnas de fieldGroups)', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('sin `stacked` (default, layout de siempre): SIN la clase modificadora', () => {
		mounted = mountFieldRow(undefined);
		const row = mounted.target.querySelector('.vega-field-row');
		expect(row).not.toBeNull();
		expect(row?.classList.contains('vega-field-row--stacked')).toBe(false);
	});

	test('`stacked: false` explícito: igual que el default, sin la clase', () => {
		mounted = mountFieldRow(false);
		const row = mounted.target.querySelector('.vega-field-row');
		expect(row?.classList.contains('vega-field-row--stacked')).toBe(false);
	});

	test('`stacked: true` (dentro de un grupo de columnas): SÍ pinta la clase modificadora', () => {
		mounted = mountFieldRow(true);
		const row = mounted.target.querySelector('.vega-field-row');
		expect(row?.classList.contains('vega-field-row--stacked')).toBe(true);
		// El resto de la fila sigue montado con normalidad: label + control, nada desaparece.
		expect(mounted.target.querySelector('label')).not.toBeNull();
		expect(mounted.target.querySelector('.vega-widget-text')).not.toBeNull();
	});
});

/** Monta con props EXTRA arbitrarias por encima del mínimo (mismo patrón que `mountFieldRow`,
 *  reutilizado por las tres suites de abajo — modelo de páginas, tarea p1 `1dc63001`). */
function mountFieldRowWith(extra: Record<string, unknown>): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(FieldRow, {
		target,
		props: {
			field: titleField,
			value: null,
			error: null,
			disabled: false,
			typeReadonly: false,
			onChange: vi.fn(),
			...extra
		},
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
	});
	return { target, instance };
}

describe('FieldRow.svelte — `isPathField` (modelo de páginas, `type.page.pathField`)', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('sin `isPathField`: SIN la clase modificadora de ruta', () => {
		mounted = mountFieldRowWith({});
		const row = mounted.target.querySelector('.vega-field-row');
		expect(row?.classList.contains('vega-field-row--path')).toBe(false);
	});

	test('con `isPathField: true`: la fila pinta la clase (mono, "es lo que es")', () => {
		mounted = mountFieldRowWith({ isPathField: true });
		const row = mounted.target.querySelector('.vega-field-row');
		expect(row?.classList.contains('vega-field-row--path')).toBe(true);
	});
});

describe('FieldRow.svelte — `notice` (aviso del modelo, p. ej. `page-path-not-unique`)', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('sin `notice`: no pinta ningún párrafo de aviso', () => {
		mounted = mountFieldRowWith({});
		expect(mounted.target.querySelector('.vega-field-notice')).toBeNull();
	});

	test('con `notice`: pinta el texto TAL CUAL, sin pasar por i18n (ya viene humano de P2)', () => {
		mounted = mountFieldRowWith({ notice: 'Aviso de prueba del modelo.' });
		const notice = mounted.target.querySelector('.vega-field-notice');
		expect(notice?.textContent).toBe('Aviso de prueba del modelo.');
	});
});

describe('FieldRow.svelte — `layoutOptions` (modelo de páginas, `type.page.layoutField`)', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;
	const layouts: ResolvedLayout[] = [{ name: 'landing', label: 'Landing', icon: null }];

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('sin `layoutOptions`: pinta el widget genérico de siempre (input de texto)', () => {
		mounted = mountFieldRowWith({});
		expect(mounted.target.querySelector('.vega-widget-text')).not.toBeNull();
		expect(mounted.target.querySelector('select')).toBeNull();
	});

	test('con `layoutOptions`: sustituye el widget por el selector de plantilla', () => {
		mounted = mountFieldRowWith({ layoutOptions: layouts });
		expect(mounted.target.querySelector('.vega-widget-text')).toBeNull();
		const select = mounted.target.querySelector('select');
		expect(select).not.toBeNull();
		expect(select?.querySelector('option[value="landing"]')?.textContent).toBe('Landing');
	});
});
