/**
 * Suite de `RecordTable.svelte` — el menú de acciones de fila (Lote 12, lámina 7
 * `07-accion-de-fila-en-menu.html`): una sola parada de tabulación por fila, el disparador se
 * alcanza con → desde el título (← vuelve), rol y nombre accesibles, «Duplicar» y «Borrar…» según
 * permisos y props, y ni celda ni hueco cuando no hay nada que ofrecer. Montaje real, mismo patrón
 * que `RecordTable.svelte.test.ts`; textos reales en español (`t`), que es lo que mide el encargo.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import RecordTable from './RecordTable.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { ALL_PERMISSIONS, type TypePermissions } from '$lib/backend/access';
import type { ContentType, Field, VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';
import { ensureLocaleLoaded, t } from '$lib/i18n';

const titleFieldSchema: Field = {
	name: 'title',
	type: 'text',
	subtype: 'plain',
	required: false,
	readonly: false,
	presentable: true,
	hidden: false,
	unique: false
};

const titleField: ResolvedField = {
	schema: titleFieldSchema,
	name: 'title',
	label: 'Título',
	help: null,
	placeholder: null,
	hidden: false,
	group: null,
	widget: 'text',
	subtype: 'plain',
	listable: true
};

function makeType(permissions: Partial<TypePermissions> = {}): ResolvedContentType {
	const schema: ContentType = { name: 'posts', readonly: false, fields: [titleFieldSchema] };
	return {
		schema,
		name: 'posts',
		label: 'Entradas',
		labelSingular: 'Entrada',
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		permissions: { ...ALL_PERMISSIONS, ...permissions },
		readonly: false,
		titleField: 'title',
		subtitleField: null,
		slugField: null,
		orderField: null,
		defaultSort: null,
		statusField: null,
		statusLabels: null,
		previewUrl: null,
		fields: [titleField],
		listFields: ['title'],
		fieldGroups: [{ name: null, columns: 1, placement: 'main' }],
		editorRail: false,
		page: null
	} as ResolvedContentType;
}

const records: VegaRecord[] = [
	{ id: 'r1', type: 'posts', values: { title: 'Sobre mí' } },
	{ id: 'r2', type: 'posts', values: { title: 'Contacto' } },
	{ id: 'r3', type: 'posts', values: { title: 'Notas del huerto: julio' } }
];

function fakeCtx(): VegaAppContext {
	return {
		t: (key: string, params?: Record<string, string | number>) => t('es', key, params),
		locale: 'es',
		model: { scheduledPublishing: 'unknown' },
		nav: { toRecord: vi.fn() }
	} as unknown as VegaAppContext;
}

interface Mounted {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	onDeleteRequest: ReturnType<typeof vi.fn>;
	onDuplicateRequest: ReturnType<typeof vi.fn>;
}

/** Espera un `tick()` tras montar: `bind:this` del disparador se asienta en el primer flush (ver
 *  cabecera de `ActionMenu.svelte.test.ts`). */
async function mountTable(
	contentType: ResolvedContentType,
	options: { duplicate?: boolean } = { duplicate: true }
): Promise<Mounted> {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const onDeleteRequest = vi.fn();
	const onDuplicateRequest = vi.fn();
	const instance = mount(RecordTable, {
		target,
		props: {
			contentType,
			columns: [{ field: titleField, isTitle: true, isStatus: false, sortable: false }],
			records,
			sort: null,
			onSort: vi.fn(),
			onDeleteRequest,
			onDuplicateRequest: options.duplicate ? onDuplicateRequest : undefined,
			reorderable: false,
			onReorder: vi.fn()
		},
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
	});
	await tick();
	return { target, instance, onDeleteRequest, onDuplicateRequest };
}

function rows(m: Mounted): HTMLTableRowElement[] {
	return Array.from(m.target.querySelectorAll<HTMLTableRowElement>('tbody tr'));
}

function triggerOf(row: HTMLElement): HTMLButtonElement | null {
	return row.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
}

function key(el: Element | null, keyName: string): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true });
	(el ?? document.body).dispatchEvent(event);
	return event;
}

/** Paradas de tabulación de una fila: controles enfocables con `tabindex` distinto de -1. */
function tabStops(row: HTMLElement): HTMLElement[] {
	return Array.from(
		row.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')
	).filter((el) => el.tabIndex >= 0);
}

async function settle(): Promise<void> {
	await tick();
	await tick();
}

describe('RecordTable.svelte — menú de acciones de fila (lámina 7)', () => {
	let mounted: Mounted | null = null;

	beforeAll(async () => {
		await ensureLocaleLoaded('es');
	});

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('cada fila tiene UNA parada de tabulación (el título); el disparador lleva tabindex=-1', async () => {
		mounted = await mountTable(makeType());
		for (const row of rows(mounted)) {
			const stops = tabStops(row);
			expect(stops).toHaveLength(1);
			expect(stops[0]?.tagName).toBe('A');
			expect(triggerOf(row)?.tabIndex).toBe(-1);
		}
		// 3 filas → 3 paradas en total, no 6 (la lámina cuenta 60 → 30 en una página de 30).
		expect(rows(mounted).flatMap(tabStops)).toHaveLength(3);
	});

	test('rol y nombre accesibles: cabecera «Acciones» oculta, disparador «Acciones de «título»», frase del atajo', async () => {
		mounted = await mountTable(makeType());
		const th = mounted.target.querySelector('thead th.vega-th-menu');
		expect(th?.textContent?.trim()).toBe('Acciones');
		expect(th?.querySelector('.vega-visually-hidden')).not.toBeNull();

		const [first] = rows(mounted);
		const trigger = triggerOf(first!)!;
		expect(trigger.getAttribute('aria-label')).toBe('Acciones de «Sobre mí»');
		expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(first!.querySelector('td.vega-cell-menu')).not.toBeNull();

		const link = first!.querySelector<HTMLAnchorElement>('.vega-cell-title a')!;
		const hintId = link.getAttribute('aria-describedby');
		expect(hintId).toBeTruthy();
		const hint = document.getElementById(hintId!);
		expect(hint?.textContent).toBe('Flecha derecha: acciones de la fila');
		// Una frase por tabla, no una por fila.
		expect(
			Array.from(mounted.target.querySelectorAll('[id]')).filter((el) => el.id === hintId)
		).toHaveLength(1);
	});

	test('→ desde el título lleva el foco al disparador de SU fila; ← lo devuelve al título', async () => {
		mounted = await mountTable(makeType());
		const [, second] = rows(mounted);
		const link = second!.querySelector<HTMLAnchorElement>('.vega-cell-title a')!;
		link.focus();
		const right = key(link, 'ArrowRight');
		expect(right.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(triggerOf(second!));

		const left = key(document.activeElement, 'ArrowLeft');
		expect(left.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(link);
	});

	test('abrir el menú ofrece «Duplicar» y «Borrar…» (peligro, la última) y cada una emite con el título', async () => {
		mounted = await mountTable(makeType());
		const [first] = rows(mounted);
		triggerOf(first!)!.click();
		await settle();
		const items = Array.from(first!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
		expect(items.map((item) => item.textContent?.trim())).toEqual(['Duplicar', 'Borrar…']);
		expect(items[1]?.getAttribute('data-tone')).toBe('danger');
		expect(items[1]?.getAttribute('data-action')).toBe('delete');
		expect(document.activeElement).toBe(items[0]);

		items[1]!.click();
		await settle();
		expect(mounted.onDeleteRequest).toHaveBeenCalledWith(records[0], 'Sobre mí');
		expect(mounted.onDuplicateRequest).not.toHaveBeenCalled();

		triggerOf(first!)!.click();
		await settle();
		first!.querySelector<HTMLButtonElement>('[data-action="duplicate"]')!.click();
		await settle();
		expect(mounted.onDuplicateRequest).toHaveBeenCalledWith(records[0], 'Sobre mí');
	});

	test('Escape cierra el menú y devuelve el foco al disparador de la fila', async () => {
		mounted = await mountTable(makeType());
		const [first] = rows(mounted);
		const trigger = triggerOf(first!)!;
		trigger.click();
		await settle();
		key(document.activeElement, 'Escape');
		await settle();
		expect(first!.querySelector('[role="menu"]')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	test('sin permiso de borrar: el menú solo ofrece «Duplicar», sin ninguna entrada data-action="delete"', async () => {
		mounted = await mountTable(makeType({ delete: false }));
		const [first] = rows(mounted);
		expect(first!.querySelector('td.vega-cell-menu')).not.toBeNull();
		triggerOf(first!)!.click();
		await settle();
		const items = Array.from(first!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
		expect(items.map((item) => item.textContent?.trim())).toEqual(['Duplicar']);
		expect(mounted.target.querySelector('[data-action="delete"]')).toBeNull();
	});

	test('sin Duplicar (quien monta no lo pasa) y sin permiso de borrar: ni celda, ni cabecera, ni hueco', async () => {
		mounted = await mountTable(makeType({ delete: false }), { duplicate: false });
		expect(mounted.target.querySelector('td.vega-cell-menu')).toBeNull();
		expect(mounted.target.querySelector('th.vega-th-menu')).toBeNull();
		expect(mounted.target.querySelector('[aria-haspopup="menu"]')).toBeNull();
		// Sin menú, el título no anuncia un atajo que no existe.
		const link = mounted.target.querySelector('.vega-cell-title a');
		expect(link?.hasAttribute('aria-describedby')).toBe(false);
	});

	test('sin Duplicar pero con permiso de borrar: el menú sigue, solo con «Borrar…»', async () => {
		mounted = await mountTable(makeType(), { duplicate: false });
		const [first] = rows(mounted);
		triggerOf(first!)!.click();
		await settle();
		const items = Array.from(first!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
		expect(items.map((item) => item.textContent?.trim())).toEqual(['Borrar…']);
	});

	test('fila sin permiso de ver (el título no es enlace): el disparador pasa a ser LA parada de tabulación', async () => {
		mounted = await mountTable(makeType({ view: false }));
		for (const row of rows(mounted)) {
			expect(row.querySelector('.vega-cell-title a')).toBeNull();
			const stops = tabStops(row);
			expect(stops).toHaveLength(1);
			expect(stops[0]).toBe(triggerOf(row));
			expect(triggerOf(row)?.tabIndex).toBe(0);
		}
	});

	test('el disparador va oculto hasta que la fila lo revele (clase de aparición) y el menú se ancla a la ventana', async () => {
		mounted = await mountTable(makeType());
		const [first] = rows(mounted);
		const trigger = triggerOf(first!)!;
		expect(trigger.classList.contains('vega-action-menu-trigger--reveal')).toBe(true);
		expect(trigger.classList.contains('vega-action-menu-trigger--icon')).toBe(true);
		trigger.click();
		await settle();
		expect(
			first!.querySelector('[role="menu"]')?.classList.contains('vega-action-menu-list--viewport')
		).toBe(true);
	});

	test('cada fila tiene su propio menú con id distinto (aria-controls)', async () => {
		mounted = await mountTable(makeType());
		const ids = rows(mounted).map((row) => triggerOf(row)!.getAttribute('aria-controls'));
		expect(new Set(ids).size).toBe(ids.length);
	});
});
