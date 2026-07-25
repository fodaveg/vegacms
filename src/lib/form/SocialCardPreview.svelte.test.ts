/**
 * Suite de componente de `SocialCardPreview.svelte` (capacidad `social`, lote "editor" Fase B):
 * montaje real (mismo patrón que `FieldRow.svelte.test.ts`) centrado en la DEGRADACIÓN con
 * dignidad (requisito explícito del lote) — título/descripción/imagen/URL ausentes o inválidos
 * no dejan la tarjeta rota, cada pieza desaparece o cae a su fallback por su cuenta.
 *
 * Montado FUERA de un `RecordForm` (sin `setRecordIdentity`): `getRecordIdentity()` degrada a
 * `null` (documentado en `record-context.ts`), así que la ruta "FileRef ya persistido →
 * `ctx.port.fileUrl`" no se ejercita aquí (esa costura ya la cubre el precedente de
 * `FileInput.svelte`) — se prueban en cambio las rutas que SÍ son alcanzables sin identidad: sin
 * imagen, con una plantilla de URL que no usa `{id}` (`identity?.id ?? ''` no le afecta) y los
 * fallbacks de título/descripción.
 */
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ResolvedContentType, ResolvedSocialCardConfig } from '$lib/model/types';
import type { FormInputValues } from './dirty';
import SocialCardPreview from './SocialCardPreview.svelte';

const parentType: ResolvedContentType = {
	schema: { name: 'post', readonly: false, fields: [] },
	name: 'post',
	label: 'Entradas',
	labelSingular: 'Entrada',
	icon: null,
	hidden: false,
	group: null,
	singleton: false,
	readonly: false,
	titleField: 'title',
	subtitleField: null,
	slugField: null,
	orderField: null,
	defaultSort: null,
	statusField: null,
	statusLabels: null,
	previewUrl: null,
	fields: [
		{
			schema: {
				name: 'excerpt',
				type: 'text',
				subtype: 'plain',
				required: false,
				readonly: false,
				presentable: false,
				hidden: false,
				unique: false
			},
			name: 'excerpt',
			label: 'Extracto',
			help: null,
			placeholder: null,
			hidden: false,
			group: null,
			widget: 'text',
			subtype: 'plain',
			listable: true
		}
	],
	listFields: [],
	fieldGroups: [],
	editorRail: false
};

function fakeCtx(): VegaAppContext {
	return {
		t: (key: string, params?: Record<string, string | number>) => {
			if (key === 'list.untitled') return '(sin título)';
			return params ? `${key}:${JSON.stringify(params)}` : key;
		},
		locale: 'es',
		port: { capabilities: { thumbs: false }, fileUrl: vi.fn(() => '') }
	} as unknown as VegaAppContext;
}

function mountCard(
	config: ResolvedSocialCardConfig,
	values: FormInputValues
): { target: HTMLElement; instance: ReturnType<typeof mount> } {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(SocialCardPreview, {
		target,
		props: { config, type: parentType, values },
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
	});
	return { target, instance };
}

describe('SocialCardPreview.svelte — degradación con dignidad', () => {
	let mounted: ReturnType<typeof mountCard> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('las cuatro piezas resueltas: título, descripción y host se pintan', () => {
		mounted = mountCard(
			{
				titleField: 'title',
				descriptionField: 'excerpt',
				imageField: null,
				urlTemplate: 'https://fodaveg.net/blog/fijo'
			},
			{ title: 'Mi entrada', excerpt: 'Un resumen breve' }
		);
		expect(mounted.target.querySelector('.vega-social-title')?.textContent).toBe('Mi entrada');
		expect(mounted.target.querySelector('.vega-social-description')?.textContent).toBe(
			'Un resumen breve'
		);
		expect(mounted.target.querySelector('.vega-social-host')?.textContent).toBe('fodaveg.net');
	});

	test('título vacío → cae a "(sin título)"', () => {
		mounted = mountCard(
			{ titleField: 'title', descriptionField: null, imageField: null, urlTemplate: null },
			{ title: '' }
		);
		expect(mounted.target.querySelector('.vega-social-title')?.textContent).toBe('(sin título)');
	});

	test('sin descriptionField resuelto → sin párrafo de descripción (nunca uno vacío)', () => {
		mounted = mountCard(
			{ titleField: 'title', descriptionField: null, imageField: null, urlTemplate: null },
			{ title: 'X' }
		);
		expect(mounted.target.querySelector('.vega-social-description')).toBeNull();
	});

	test('sin imageField resuelto → caja con icono genérico, NUNCA un <img> roto', () => {
		mounted = mountCard(
			{ titleField: 'title', descriptionField: null, imageField: null, urlTemplate: null },
			{ title: 'X' }
		);
		expect(mounted.target.querySelector('img')).toBeNull();
		expect(mounted.target.querySelector('.vega-social-image-placeholder')).not.toBeNull();
	});

	test('sin urlTemplate resuelto → sin línea de host', () => {
		mounted = mountCard(
			{ titleField: 'title', descriptionField: null, imageField: null, urlTemplate: null },
			{ title: 'X' }
		);
		expect(mounted.target.querySelector('.vega-social-host')).toBeNull();
	});

	test('previsualización LIVE: usa el valor ACTUAL de `values`, no uno guardado aparte', () => {
		mounted = mountCard(
			{ titleField: 'title', descriptionField: null, imageField: null, urlTemplate: null },
			{ title: 'Borrador sin guardar todavía' }
		);
		expect(mounted.target.querySelector('.vega-social-title')?.textContent).toBe(
			'Borrador sin guardar todavía'
		);
	});
});
