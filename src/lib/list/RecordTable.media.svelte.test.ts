import { mount, tick, unmount } from 'svelte';
import { describe, expect, test, vi } from 'vitest';
import RecordTable from './RecordTable.svelte';
import { deriveColumns } from './columns';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { resolveContentModel } from '$lib/model/resolve';
import type { ContentType, Field, VegaRecord } from '$lib/backend/types';

const base = { required: false, readonly: false, presentable: false, hidden: false, unique: false };
const fields: Field[] = [
	{ ...base, name: 'title', type: 'text', subtype: 'plain' },
	{ ...base, name: 'media', type: 'relation', target: 'vega_media', multiple: false },
	{ ...base, name: 'tags', type: 'relation', target: 'tags', multiple: true }
];
const types: ContentType[] = [
	{ name: 'artworks', readonly: false, fields },
	{ name: 'tags', readonly: false, fields: [] },
	{
		name: 'vega_media',
		readonly: false,
		fields: [
			{ ...base, name: 'file', type: 'file', multiple: false, protected: false, thumbs: ['28x28'] }
		]
	}
];
const model = resolveContentModel({
	types,
	manifestRaw: {
		schemaVersion: 1,
		collections: {
			artworks: {
				listFields: ['media', 'title', 'tags'],
				titleField: 'title',
				fields: { media: { mediaKind: 'image' } }
			}
		}
	}
});
const contentType = model.types.find((type) => type.name === 'artworks')!;
const artwork = (id: string, media: string): VegaRecord => ({
	id,
	type: 'artworks',
	values: { title: `Obra ${id}`, media, tags: ['tag1', 'tag2'] }
});
const asset = (id: string, file: string): VegaRecord => ({
	id,
	type: 'vega_media',
	values: { file }
});
const page = (items: VegaRecord[]) => ({
	items,
	page: 1,
	perPage: 50,
	totalItems: items.length,
	totalPages: 1
});

function setup(thumbs: boolean, initial = [artwork('a', 'm1'), artwork('b', 'm1')]) {
	const rows = $state({ records: initial });
	let file = 'first.png';
	const list = vi.fn(async () => page([asset('m1', file)]));
	const fileUrl = vi.fn(
		(owner: Pick<VegaRecord, 'type' | 'id'>, field: string, ref: string) =>
			`https://files/${owner.type}/${owner.id}/${field}/${ref}`
	);
	const ctx = {
		model,
		t: (key: string) => key,
		locale: 'es',
		port: { list, get: vi.fn(), fileUrl, capabilities: { thumbs } }
	} as unknown as VegaAppContext;
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(RecordTable, {
		target,
		props: {
			contentType,
			columns: deriveColumns(contentType),
			get records() {
				return rows.records;
			},
			sort: null,
			onSort: vi.fn(),
			onDeleteRequest: vi.fn(),
			reorderable: false,
			onReorder: vi.fn()
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return {
		target,
		instance,
		list,
		fileUrl,
		rows,
		setFile(value: string) {
			file = value;
		}
	};
}

describe('RecordTable — relación image a Medios', () => {
	test('miniatura 28px, propietario real y dedup; otras relaciones conservan contador', async () => {
		const view = setup(true);
		try {
			await vi.waitFor(() =>
				expect(view.target.querySelectorAll('.vega-file-thumbs img')).toHaveLength(2)
			);
			expect(view.list).toHaveBeenCalledTimes(1);
			expect(view.fileUrl).toHaveBeenCalledWith(
				{ type: 'vega_media', id: 'm1' },
				'file',
				'first.png',
				{ thumb: { width: 28, height: 28, fit: 'crop' } }
			);
			expect(view.target.querySelector('img')?.getAttribute('width')).toBe('28');
			expect(
				[...view.target.querySelectorAll('tbody tr')].map((row) =>
					row.querySelectorAll('td')[2]?.textContent?.trim()
				)
			).toEqual(['2', '2']);
		} finally {
			await unmount(view.instance);
			view.target.remove();
		}
	});

	test('sin thumbs muestra nombre del fichero y no llama fileUrl', async () => {
		const view = setup(false);
		try {
			await vi.waitFor(() =>
				expect(view.target.querySelectorAll('.vega-file-names')).toHaveLength(2)
			);
			expect(view.target.querySelector('.vega-file-names')?.textContent).toBe('first.png');
			expect(view.target.querySelector('img')).toBeNull();
			expect(view.fileUrl).not.toHaveBeenCalled();
		} finally {
			await unmount(view.instance);
			view.target.remove();
		}
	});

	test('recargar las mismas filas invalida el medio cuando su file cambia', async () => {
		const view = setup(true);
		try {
			await vi.waitFor(() =>
				expect(view.target.querySelector('img')?.getAttribute('src')).toContain('first.png')
			);
			view.setFile('replacement.png');
			view.rows.records = [artwork('a', 'm1')];
			await tick();
			await vi.waitFor(() =>
				expect(view.target.querySelector('img')?.getAttribute('src')).toContain('replacement.png')
			);
			expect(view.list).toHaveBeenCalledTimes(2);
		} finally {
			await unmount(view.instance);
			view.target.remove();
		}
	});

	test('PDF, relación vacía y medio ausente no pintan imágenes rotas', async () => {
		const view = setup(true, [artwork('a', 'm1'), artwork('b', '')]);
		view.setFile('document.pdf');
		try {
			await vi.waitFor(() => expect(view.list).toHaveBeenCalledTimes(1));
			await tick();
			expect(view.target.querySelector('img')).toBeNull();
		} finally {
			await unmount(view.instance);
			view.target.remove();
		}
	});
});
