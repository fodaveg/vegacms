import { mount, tick, unmount } from 'svelte';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConflictNotice } from '$lib/form/ConflictNoticeLoader.svelte';

// El aviso de conflicto llega por `import()` (`ConflictNoticeLoader.svelte`). Con la suite entera
// ese trozo tardaba más que un `tick()` y el gate de 0.14.1 cazó el test buscando el botón antes de
// que existiera. Aquí se descarga TARDE a propósito, y se espera ANTES de los tests: lo que
// comprueban no depende de cuándo llega.
vi.mock('$lib/form/ConflictNotice.svelte', async (importOriginal) => {
	await new Promise((resolve) => setTimeout(resolve, 50));
	return importOriginal();
});
beforeAll(() => loadConflictNotice());
import BlockEditor from '$lib/form/BlockEditor.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { resolveContentModel } from '$lib/model/resolve';
import { recordVersion, VegaConflictError, type VegaRecord, type ContentType } from '$lib/backend';
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
	const failed = vi.fn();
	const reload = vi.fn(async () => original);
	const ctx = {
		t: (key: string) => t('es', key),
		locale: 'es',
		port: { get: reload },
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
			onDraftChange: draft,
			onSaveError: failed
		}
	});
	await tick();
	return {
		editor,
		target,
		failed,
		reload,
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
	test.each(['force', 'discard'] as const)(
		'successful conflict %s clears the host save error',
		async (action) => {
			const h = await setup();
			try {
				h.submit.mockRejectedValueOnce(new VegaConflictError(original, 'server-version'));
				h.editor.beginInline('body');
				h.editor.updateInline('body', 'Unsaved');
				h.editor.finishInline();
				h.editor.save();
				await vi.waitFor(() => expect(h.failed).toHaveBeenLastCalledWith(true));
				await tick();
				const label = t(
					'es',
					action === 'force' ? 'editor.conflict.force' : 'editor.conflict.discardNarrow'
				);
				const button = [...h.target.querySelectorAll('button')].find(
					(node) => node.textContent?.trim() === label
				)!;
				expect(button).toBeDefined();
				button.click();
				await vi.waitFor(() => expect(h.failed).toHaveBeenLastCalledWith(false));
				await tick();
				expect(h.target.querySelector('.vega-conflict')).toBeNull();
				if (action === 'force')
					expect(h.submit).toHaveBeenLastCalledWith(expect.anything(), {
						expectedVersion: 'server-version'
					});
				else expect(h.reload).toHaveBeenCalledWith('blocks', 'block');
			} finally {
				await h.close();
			}
		}
	);

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
