import { flushSync } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { VegaAppContext } from '$lib/app-context';
import type { ContentType, Field, JsonValue } from '$lib/backend/types';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { VegaError } from '$lib/backend/errors';
import { resolveContentModel } from '$lib/model/resolve';
import { validateManifestStrict } from '$lib/model/validate';
import { t } from '$lib/i18n';
import { createBlocksState, type BlocksState } from './blocks-state.svelte';

const base = { required: false, readonly: false, presentable: false, hidden: false, unique: false };
const text = (name: string): Field => ({ ...base, name, type: 'text', subtype: 'plain' });
const relation = (name: string, target: string, multiple = false): Field => ({
	...base,
	name,
	target,
	multiple,
	type: 'relation'
});
const types: ContentType[] = [
	{ name: 'menus', readonly: false, fields: [text('name')] },
	{ name: 'pages', readonly: false, fields: [text('titleEs')] },
	{
		name: 'menu_items',
		readonly: false,
		fields: [
			text('label'),
			relation('menu', 'menus'),
			relation('page', 'pages'),
			relation('multiple', 'pages', true),
			relation('unknown', 'missing'),
			{ ...base, name: 'order', type: 'number', integer: true }
		]
	}
];
function manifest(fallback: JsonValue = 'page'): JsonValue {
	return {
		schemaVersion: 1,
		collections: {
			menus: {
				blocks: {
					collection: 'menu_items',
					parentField: 'menu',
					orderField: 'order',
					titleFallbackField: fallback
				}
			},
			pages: { titleField: 'titleEs' },
			menu_items: { titleField: 'label' }
		}
	};
}
const records = {
	menus: [{ id: 'main', values: { name: 'Principal' } }],
	pages: [
		{ id: 'about', values: { titleEs: 'Sobre mí' } },
		{ id: 'contact', values: { titleEs: 'Contacto' } }
	],
	menu_items: [
		{ id: 'one', values: { menu: 'main', order: 0, label: '', page: 'about' } },
		{ id: 'two', values: { menu: 'main', order: 1, label: '', page: 'contact' } },
		{ id: 'three', values: { menu: 'main', order: 2, label: 'Mi texto', page: 'about' } },
		{ id: 'four', values: { menu: 'main', order: 3, label: '', page: null } }
	]
};
let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
	vi.restoreAllMocks();
});
async function setup(denied = false) {
	const model = resolveContentModel({ types, manifestRaw: manifest() });
	const port = createMemoryBackend({
		contentTypes: types,
		records,
		users: [{ email: 'admin@vega.test', password: 'test-pass' }]
	});
	await port.login({ email: 'admin@vega.test', password: 'test-pass' });
	const originalList = port.list.bind(port);
	const list = vi.spyOn(port, 'list').mockImplementation((collection, query) => {
		if (denied && collection === 'pages')
			return Promise.reject(VegaError.forbidden('No permitido'));
		return originalList(collection, query);
	});
	const update = vi.spyOn(port, 'update');
	const ctx = {
		port,
		model,
		locale: 'es',
		t: (key: string, params?: Record<string, string | number>) => t('es', key, params),
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	let state!: BlocksState;
	cleanup = $effect.root(() => {
		state = createBlocksState({
			ctx,
			parentType: model.types.find((type) => type.name === 'menus')!,
			getParentId: () => 'main',
			getDisabled: () => false,
			onDirtyChange: vi.fn()
		});
	});
	flushSync();
	await vi.waitFor(() => {
		flushSync();
		expect(state.records).toHaveLength(4);
	});
	return { state, port, list, update };
}

describe('título relacionado de bloques, solo presentación', () => {
	test('resuelve por lote, distingue las páginas y conserva overrides y relaciones vacías', async () => {
		const { state, port, list, update } = await setup();
		await vi.waitFor(() => {
			flushSync();
			expect(state.blockTitle(state.records[0])).toBe('Sobre mí');
		});
		expect(state.records.map(state.blockTitle)).toEqual([
			'Sobre mí',
			'Contacto',
			'Mi texto',
			'(sin título)'
		]);
		expect(list.mock.calls.filter(([collection]) => collection === 'pages')).toHaveLength(1);
		expect((await port.get('menu_items', 'one')).values.label).toBe('');
		expect(update).not.toHaveBeenCalled();
		state.handleBlockDraftChange('one', {
			id: 'one',
			fields: { ...state.records[0].values, label: 'Borrador' }
		});
		expect(state.blockTitle(state.records[0])).toBe('Borrador');
		expect(update).not.toHaveBeenCalled();
	});
	test('sin permiso de lectura conserva una etiqueta estable y no bloquea el editor', async () => {
		const { state, update } = await setup(true);
		await vi.waitFor(() => {
			flushSync();
			expect(state.blockTitle(state.records[0])).toBe('about');
		});
		expect(state.failed).toBe(false);
		expect(state.records.map(state.blockTitle)).toEqual([
			'about',
			'contact',
			'Mi texto',
			'(sin título)'
		]);
		expect(update).not.toHaveBeenCalled();
	});
	test.each(['menu', 'label', 'multiple', 'unknown', '', 42, null])(
		'fallback inválido %s degrada solo la presentación',
		(fallback) => {
			const model = resolveContentModel({ types, manifestRaw: manifest(fallback) });
			const blocks = model.types.find((type) => type.name === 'menus')!.blocks;
			expect(blocks?.collection).toBe('menu_items');
			expect(blocks?.titleFallbackField).toBeUndefined();
			expect(model.warnings).toContainEqual(
				expect.objectContaining({
					code: 'manifest-invalid-key',
					path: '/collections/menus/blocks/titleFallbackField'
				})
			);
		}
	);
	test('escritor estricto acepta solo un nombre no vacío', () => {
		expect(validateManifestStrict(manifest())).toEqual({ ok: true });
		expect(validateManifestStrict(manifest('')).ok).toBe(false);
		expect(validateManifestStrict(manifest(42)).ok).toBe(false);
	});
});
