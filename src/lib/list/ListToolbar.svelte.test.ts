/**
 * Suite de `ListToolbar.svelte` (lote 11, tarea 3): el buscador del listado nombra la colección
 * («Buscar en Entradas…») en vez de prometer un «slug» que muchos tipos no tienen.
 */
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test } from 'vitest';
import ListToolbar from './ListToolbar.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import { ensureLocaleLoaded, t, type Locale } from '$lib/i18n';
import type { ContentType, Field } from '$lib/backend/types';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';

const titleSchema: Field = {
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
	schema: titleSchema,
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

function makeType(): ResolvedContentType {
	const schema: ContentType = { name: 'posts', readonly: false, fields: [titleSchema] };
	return {
		schema,
		name: 'posts',
		label: 'Entradas',
		labelSingular: 'Entrada',
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		permissions: ALL_PERMISSIONS,
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
		editorRail: true,
		page: null
	} as ResolvedContentType;
}

function mountToolbar(locale: Locale) {
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) => t(locale, key, params),
		locale
	} as unknown as VegaAppContext;
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(ListToolbar, {
		target,
		props: {
			contentType: makeType(),
			viewState: { q: '', sort: null, status: null, page: 1 },
			onSearch: () => {},
			onStatusChange: () => {}
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance };
}

describe('ListToolbar.svelte — placeholder del buscador', () => {
	let mounted: ReturnType<typeof mountToolbar> | null = null;
	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('nombra la colección, sin hablar de slug (es y en)', async () => {
		await ensureLocaleLoaded('en');
		mounted = mountToolbar('es');
		const es = mounted.target.querySelector('input[type="search"]') as HTMLInputElement;
		expect(es.placeholder).toBe('Buscar en Entradas…');
		expect(es.placeholder).not.toContain('slug');
		await unmount(mounted.instance);
		mounted.target.remove();

		mounted = mountToolbar('en');
		const en = mounted.target.querySelector('input[type="search"]') as HTMLInputElement;
		expect(en.placeholder).toBe('Search in Entradas…');
	});
});
