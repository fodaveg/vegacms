/**
 * El foco al primer error de un guardado rechazado de un BLOQUE (`revealFirstError` de
 * `BlockEditor.svelte`) no se roba a quien ya se ha ido a otro sitio (e2e UX11, 21 oct 2026: con
 * carga, el `import()` de `focus-target` resolvía una tarea después de pintarse el error; para
 * entonces «Ir a sección» ya había llevado el foco al Título de la sección siguiente, y el foco
 * volvía al campo con error de la anterior).
 *
 * El `import()` se retiene con `vi.mock` hasta que el test lo suelta: el orden «error pintado →
 * el foco se mueve → resuelve el import» es exacto, no depende del reloj ni de la carga. Fichero
 * aparte porque el módulo simulado se carga una sola vez por fichero.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ContentType, Field } from '$lib/backend/types';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';
import RecordBlocks from './RecordBlocks.svelte';

const gate = vi.hoisted(() => {
	let open!: () => void;
	const opened = new Promise<void>((resolve) => (open = resolve));
	return { opened, open, loaded: false };
});

vi.mock('./focus-target', async (importOriginal) => {
	await gate.opened;
	const original = await importOriginal<typeof import('./focus-target')>();
	gate.loaded = true;
	return original;
});

// jsdom no implementa `scrollIntoView` (el foco al primer error trae el campo a la vista).
Element.prototype.scrollIntoView ??= () => {};

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
		{ ...base, name: 'data', type: 'json' } as Field
	]
};

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
	await cleanup?.();
	cleanup = null;
});

/** Espera a una condición del DOM (montaje y guardado asíncronos). */
async function until(check: () => boolean): Promise<void> {
	for (let i = 0; i < 100 && !check(); i++) {
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	expect(check()).toBe(true);
}

test('un guardado rechazado no le roba el foco a quien ya se fue; si sigue ahí, va al campo', async () => {
	const model = resolveContentModel({
		types: [pageType, sectionType],
		manifestRaw: {
			schemaVersion: 1,
			blockTypes: {
				text: {
					label: 'Texto',
					fields: [
						{ name: 'heading', label: 'Título', widget: 'text', source: 'data' },
						{ name: 'detail', label: 'Detalle', widget: 'text', source: 'data', required: true }
					]
				}
			},
			collections: {
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
	const port = createMemoryBackend({
		users: [{ email: 'admin@vega.test', password: 'test-pass' }],
		contentTypes: [pageType, sectionType],
		records: {
			pages: [{ id: 'about', values: { title: 'Sobre mí' } }],
			page_sections: [
				{ id: 's1', values: { page: 'about', sort: 0, type: 'text', data: { heading: 'Hola' } } }
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
	const elsewhere = document.createElement('input');
	document.body.append(target, elsewhere);
	const instance = mount(RecordBlocks, {
		target,
		props: {
			parentType: model.types.find((t) => t.name === 'pages')!,
			parentId: 'about',
			onDirtyChange: vi.fn()
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	cleanup = async () => {
		await unmount(instance);
		target.remove();
		elsewhere.remove();
	};

	await until(() => target.querySelector('.vega-block-toggle') !== null);
	target.querySelector<HTMLButtonElement>('.vega-block-toggle')!.click();
	const heading = () => target.querySelector<HTMLInputElement>('#vega-field-s1-heading');
	const detail = () => target.querySelector<HTMLInputElement>('#vega-field-s1-detail');
	await until(() => heading() !== null && detail() !== null);
	heading()!.value = 'Hola de nuevo';
	heading()!.dispatchEvent(new Event('input', { bubbles: true }));
	await tick();

	// 1. Rechazado con el `import()` retenido: el error ya se ve y el foco sigue en Guardar.
	const save = target.querySelector<HTMLButtonElement>('.vega-block-save-button')!;
	save.focus();
	save.click();
	await until(() => target.querySelector('[data-field="detail"] .vega-field-error') !== null);
	expect(document.activeElement).toBe(save);

	// Quien edita se va a otro sitio ANTES de que el import resuelva.
	elsewhere.focus();
	gate.open();
	await until(() => gate.loaded);
	for (let i = 0; i < 5; i++) await tick();
	expect(document.activeElement).toBe(elsewhere);

	// 2. Mismo rechazo con el foco aún en Guardar: va al campo con error, como siempre.
	save.focus();
	save.click();
	await until(() => document.activeElement === detail());
	expect(await port.get('page_sections', 's1')).toMatchObject({
		values: { data: { heading: 'Hola' } }
	});
});
