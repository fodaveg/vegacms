import { mount, tick, unmount } from 'svelte';
import { describe, expect, test, vi } from 'vitest';
import BlockEditor from '$lib/form/BlockEditor.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { resolveContentModel } from '$lib/model/resolve';
import { recordVersion, type VegaRecord, type ContentType } from '$lib/backend';
import { t } from '$lib/i18n';

const text = (name: string) => ({
	name,
	type: 'text' as const,
	subtype: 'plain' as const,
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
});
const physical: ContentType = {
	name: 'blocks',
	readonly: false,
	fields: [
		text('type'),
		text('heading'),
		{
			name: 'data',
			type: 'json',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};
const model = resolveContentModel({
	types: [physical],
	manifestRaw: {
		schemaVersion: 1,
		blockTypes: {
			hero: {
				label: 'Portada',
				description: 'Presenta la página',
				fields: [
					{ name: 'title', label: 'Título', widget: 'text' },
					{ name: 'body', label: 'Cuerpo', widget: 'textarea' },
					{ name: 'heading', label: 'Encabezado', widget: 'text', source: 'record' }
				]
			}
		}
	}
});
const childType = model.types[0],
	blockType = model.blockTypes[0];
const original: VegaRecord = {
	id: 'block',
	type: 'blocks',
	values: {
		type: 'hero',
		heading: 'Record title',
		data: { title: null, body: 'Previous draft', orphan: { keep: true }, heading: 'shadowed' }
	}
};

async function setup() {
	const target = document.createElement('div');
	document.body.append(target);
	const submit = vi.fn(async (input) => ({
		...original,
		values: { ...original.values, ...input }
	}));
	const draft = vi.fn();
	const ctx = {
		t: (key: string) => t('es', key),
		locale: 'es',
		feedback: { reportError: vi.fn(), toast: vi.fn() }
	} as unknown as VegaAppContext;
	const editor = mount(BlockEditor, {
		target,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]]),
		props: {
			childType,
			blockType,
			rawBlockType: 'hero',
			dataField: 'data',
			record: original,
			structuralFields: ['type'],
			onSubmit: submit,
			onSaved: vi.fn(),
			onDirtyChange: vi.fn(),
			onDraftChange: draft
		}
	});
	await tick();
	return {
		editor,
		submit,
		draft,
		async close() {
			await unmount(editor);
			target.remove();
		}
	};
}

describe('inline owns the existing typed draft', () => {
	test('null is restored exactly; data and record changes keep orphaned and shadowed JSON on explicit versioned save', async () => {
		const h = await setup();
		try {
			expect(h.editor.beginInline('title')).toMatchObject({ widget: 'text', value: '' });
			h.editor.updateInline('title', 'Temporary');
			h.editor.finishInline(true);
			await tick();
			expect(h.draft.mock.lastCall?.[0].fields.data.title).toBeNull();
			expect(h.submit).not.toHaveBeenCalled();
			h.editor.beginInline('body');
			h.editor.updateInline('body', 'Line one\nLine two');
			h.editor.finishInline();
			h.editor.beginInline('heading');
			h.editor.updateInline('heading', 'Record changed');
			h.editor.finishInline();
			await tick();
			expect(h.submit).not.toHaveBeenCalled();
			h.editor.save();
			await tick();
			expect(h.submit).toHaveBeenCalledWith(
				{
					heading: 'Record changed',
					data: {
						title: null,
						body: 'Line one\nLine two',
						orphan: { keep: true },
						heading: 'shadowed'
					}
				},
				{ expectedVersion: recordVersion(original) }
			);
		} finally {
			await h.close();
		}
	});
	test('cancel restores an earlier unsaved draft and a second writer cannot start', async () => {
		const h = await setup();
		try {
			h.editor.beginInline('body');
			h.editor.updateInline('body', 'Unsaved');
			h.editor.finishInline();
			h.editor.beginInline('body');
			expect(h.editor.beginInline('heading')).toBeNull();
			h.editor.updateInline('body', 'Discard');
			h.editor.finishInline(true);
			await tick();
			expect(h.draft.mock.lastCall?.[0].fields.data.body).toBe('Unsaved');
			expect(h.editor.beginInline('orphan')).toBeNull();
			expect(h.editor.beginInline('type')).toBeNull();
		} finally {
			await h.close();
		}
	});
});
