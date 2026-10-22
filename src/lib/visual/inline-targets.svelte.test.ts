import { mount, tick, unmount } from 'svelte';
import { describe, expect, test, vi } from 'vitest';
import BlockEditor from '$lib/form/BlockEditor.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { resolveContentModel } from '$lib/model/resolve';
import { recordVersion, type ContentType, type VegaRecord } from '$lib/backend';
import { t } from '$lib/i18n';
import { sourceDigest } from './inline-session';
import { pageInlineFields, pageStructuralFields, pageTextFields } from './page-fields';
import { inlineFieldsOf } from './inline-fields';
import VisualPageFields from './VisualPageFields.svelte';
import Icon from '$lib/icons/Icon.svelte';

/**
 * Spec «edición en línea de todo el texto de la página» (22 oct 2026), lado del dueño del
 * borrador (`BlockEditor`): rangos de un campo `markdown` (parte B) y la ficha del REGISTRO de la
 * página (parte A), que es `BlockEditor` en modo homogéneo. La mensajería vive en
 * `bridge-client.test.ts`.
 */
const text = (name: string, extra: Record<string, unknown> = {}) => ({
	name,
	type: 'text' as const,
	subtype: 'plain' as const,
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false,
	...extra
});
const sections: ContentType = {
	name: 'sections',
	readonly: false,
	fields: [
		text('type'),
		text('heading'),
		text('body'),
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
const pages: ContentType = {
	name: 'pages',
	readonly: false,
	fields: [
		text('title'),
		text('description'),
		text('path'),
		text('slug'),
		text('secret', { hidden: true })
	]
};

function models(update = true) {
	const model = resolveContentModel({
		types: [sections, pages],
		manifestRaw: {
			schemaVersion: 1,
			collections: {
				sections: { fields: { body: { widget: 'markdown' } } },
				pages: {
					page: { pathField: 'path' },
					fields: { description: { widget: 'textarea' } }
				}
			},
			blockTypes: {
				text: {
					label: 'Texto',
					fields: [
						{ name: 'heading', label: 'Título', widget: 'text', source: 'record' },
						{ name: 'body', label: 'Cuerpo', widget: 'markdown', source: 'record' },
						{ name: 'aside', label: 'Nota', widget: 'markdown' }
					]
				}
			}
		}
	});
	const withPermission = (type: (typeof model.types)[number]) =>
		update ? type : { ...type, permissions: { ...type.permissions, update: false } };
	return {
		sectionsType: withPermission(model.types.find((type) => type.name === 'sections')!),
		pagesType: withPermission(model.types.find((type) => type.name === 'pages')!),
		blockType: model.blockTypes[0]
	};
}

// Un Markdown con CRLF, enlace con `{.btn}`, lista y un párrafo repetido: lo que tiene que quedar
// intacto alrededor del trozo editado.
const BODY =
	'Hola, soy **David**. [Escríbeme](/contacto){.btn}\r\n\r\n- uno\r\n- dos\r\n\r\nFin.\r\n\r\nFin.\r\n';
const range = (slice: string, from = 0) => {
	const start = BODY.indexOf(slice, from);
	return { start, end: start + slice.length, digest: sourceDigest(BODY) };
};

async function setup(
	kind: 'block' | 'page',
	{ update = true, takeover = vi.fn() }: { update?: boolean; takeover?: () => void } = {}
) {
	const { sectionsType, pagesType, blockType } = models(update);
	const record: VegaRecord =
		kind === 'block'
			? {
					id: 's1',
					type: 'sections',
					values: { type: 'text', heading: 'Sección', body: BODY, data: { aside: 'Nota' } }
				}
			: {
					id: 'p1',
					type: 'pages',
					values: { title: 'Sobre mí', description: 'Hola', path: '/sobre-mi', slug: 'sobre-mi' }
				};
	const target = document.createElement('div');
	document.body.append(target);
	const submit = vi.fn(
		async (input: Record<string, unknown>) =>
			({ ...record, values: { ...record.values, ...input } }) as VegaRecord
	);
	const draft = vi.fn();
	const ctx = {
		t: (key: string) => t('es', key),
		locale: 'es',
		port: { get: vi.fn() },
		feedback: { reportError: vi.fn(), toast: vi.fn() }
	} as unknown as VegaAppContext;
	const editor = mount(BlockEditor, {
		target,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]]),
		props:
			kind === 'block'
				? {
						childType: sectionsType,
						blockType,
						rawBlockType: 'text',
						dataField: 'data',
						record,
						structuralFields: ['type'],
						onSubmit: submit,
						onSaved: vi.fn(),
						onDirtyChange: vi.fn(),
						onDraftChange: draft,
						onInlineTakeover: takeover,
						textsOnly: true
					}
				: {
						childType: pagesType,
						blockType: null,
						rawBlockType: null,
						dataField: null,
						record,
						structuralFields: ['path', 'slug'],
						onSubmit: submit,
						onSaved: vi.fn(),
						onDirtyChange: vi.fn(),
						onDraftChange: draft,
						onInlineTakeover: takeover,
						textsOnly: true
					}
	});
	await tick();
	const lastDraft = () => draft.mock.lastCall?.[0].fields;
	return {
		editor,
		submit,
		lastDraft,
		record,
		async close() {
			await unmount(editor);
			target.remove();
		}
	};
}

/** Every column and data key of both fixtures: what `accepted` tries. */
const CANDIDATES = [
	'type',
	'heading',
	'body',
	'aside',
	'data',
	'title',
	'description',
	'path',
	'slug',
	'secret'
];

/** The fields `beginInline` actually opens, plain and by range, each closed again with cancel. */
function accepted(h: Awaited<ReturnType<typeof setup>>, names: readonly string[]) {
	const draft = h.lastDraft() as Record<string, unknown> & { data?: Record<string, unknown> };
	const opens = (name: string, ranged: boolean) => {
		const value = String(draft[name] ?? draft.data?.[name] ?? '');
		const result = ranged
			? h.editor.beginInline(name, { start: 0, end: 0, digest: sourceDigest(value) })
			: h.editor.beginInline(name);
		if (!result || result === 'stale') return false;
		h.editor.finishInline(true);
		return true;
	};
	return {
		text: names.filter((name) => opens(name, false)),
		source: names.filter((name) => opens(name, true))
	};
}

describe('Markdown source ranges (B)', () => {
	test('replacing a range leaves every other code unit of the field identical', async () => {
		const h = await setup('block');
		try {
			const item = range('- dos');
			expect(h.editor.beginInline('body', item)).toEqual({
				widget: 'textarea',
				label: 'Cuerpo',
				value: '- dos'
			});
			expect(h.editor.updateInline('body', '- dos y **tres**\n  con línea')).toBe(true);
			expect(h.editor.updateInline('body', '- dos y **tres**')).toBe(true);
			h.editor.finishInline();
			await tick();
			const expected = BODY.slice(0, item.start) + '- dos y **tres**' + BODY.slice(item.end);
			const body = h.lastDraft().body as string;
			expect(body).toBe(expected);
			// Byte a byte: todo lo de antes y todo lo de después, idénticos (CRLF incluidos).
			expect(body.slice(0, item.start)).toBe(BODY.slice(0, item.start));
			expect(body.slice(item.start + '- dos y **tres**'.length)).toBe(BODY.slice(item.end));
			// Guardar escribe ese valor, con la versión de la ficha.
			await h.editor.save();
			expect(h.submit).toHaveBeenCalledWith(
				{ body: expected },
				{ expectedVersion: recordVersion(h.record) }
			);
		} finally {
			await h.close();
		}
	});

	test('the second of two identical paragraphs is the one replaced, by its range', async () => {
		const h = await setup('block');
		try {
			const second = range('Fin.', BODY.indexOf('Fin.') + 1);
			h.editor.beginInline('body', second);
			h.editor.updateInline('body', 'Fin de verdad.');
			h.editor.finishInline();
			await tick();
			expect(h.lastDraft().body).toBe(BODY.replace(/Fin\.\r\n$/, 'Fin de verdad.\r\n'));
		} finally {
			await h.close();
		}
	});

	test('a range computed from another text is stale and opens nothing', async () => {
		const h = await setup('block');
		try {
			expect(
				h.editor.beginInline('body', { ...range('- uno'), digest: sourceDigest(BODY + 'x') })
			).toBe('stale');
			expect(
				h.editor.beginInline('body', {
					start: 0,
					end: BODY.length + 1,
					digest: sourceDigest(BODY)
				})
			).toBe('stale');
			// Nada quedó abierto: un rango válido sí entra después.
			expect(h.editor.beginInline('body', range('- uno'))).toMatchObject({ value: '- uno' });
		} finally {
			await h.close();
		}
	});

	test('if another writer changed the field mid-session, the next input is refused, never misplaced', async () => {
		const h = await setup('block');
		try {
			h.editor.beginInline('body', range('- uno'));
			expect(h.editor.updateInline('body', '- uno!')).toBe(true);
			// «Descartar» de la ficha vuelve el campo a lo guardado (otro escritor del mismo borrador).
			h.editor.discard();
			await tick();
			expect(h.editor.updateInline('body', '- uno!!')).toBe(false);
			expect(h.lastDraft().body).toBe(BODY);
		} finally {
			await h.close();
		}
	});

	test('cancel restores the whole field exactly; markdown needs a range and plain text refuses one', async () => {
		const h = await setup('block');
		try {
			h.editor.beginInline('body', range('Hola, soy **David**. [Escríbeme](/contacto){.btn}'));
			h.editor.updateInline('body', 'Otro');
			h.editor.finishInline(true);
			await tick();
			expect(h.lastDraft().body).toBe(BODY);
			expect(h.editor.beginInline('body')).toBeNull();
			expect(
				h.editor.beginInline('heading', { start: 0, end: 1, digest: sourceDigest('Sección') })
			).toBeNull();
			// Un `markdown` dentro de `data` también se edita por rangos.
			expect(
				h.editor.beginInline('aside', { start: 0, end: 4, digest: sourceDigest('Nota') })
			).toMatchObject({ value: 'Nota', widget: 'textarea' });
		} finally {
			await h.close();
		}
	});

	test('inlineFieldsOf (what `editable` announces) lists exactly what beginInline accepts, plain and markdown apart', async () => {
		for (const update of [true, false]) {
			const { sectionsType, blockType } = models(update);
			const h = await setup('block', { update });
			try {
				const announced = inlineFieldsOf(sectionsType, blockType, ['type'], true);
				expect(announced).toEqual(
					update ? { text: ['heading'], source: ['body', 'aside'] } : { text: [], source: [] }
				);
				expect(accepted(h, CANDIDATES)).toEqual(announced);
			} finally {
				await h.close();
			}
		}
	});
});

describe('fields of the page record (A)', () => {
	test('only visible, writable text fields outside the path; the save sends only what changed, versioned', async () => {
		const h = await setup('page');
		try {
			expect(accepted(h, CANDIDATES).text).toEqual(['title', 'description']);
			expect(h.editor.beginInline('path')).toBeNull();
			expect(h.editor.beginInline('slug')).toBeNull();
			expect(h.editor.beginInline('secret')).toBeNull();
			expect(h.editor.beginInline('description')).toMatchObject({
				widget: 'textarea',
				value: 'Hola'
			});
			h.editor.updateInline('description', 'Hola,\nsoy David');
			h.editor.finishInline();
			await h.editor.save();
			expect(h.submit).toHaveBeenCalledWith(
				{ description: 'Hola,\nsoy David' },
				{ expectedVersion: recordVersion(h.record) }
			);
		} finally {
			await h.close();
		}
	});

	test('cancel restores the exact draft; without update permission nothing is offered', async () => {
		const h = await setup('page');
		try {
			h.editor.beginInline('title');
			h.editor.updateInline('title', 'Otra cosa');
			h.editor.finishInline(true);
			await tick();
			expect(h.lastDraft().title).toBe('Sobre mí');
		} finally {
			await h.close();
		}
		const locked = await setup('page', { update: false });
		try {
			expect(accepted(locked, CANDIDATES).text).toEqual([]);
			expect(locked.editor.beginInline('title')).toBeNull();
		} finally {
			await locked.close();
		}
	});

	test('`editable.record` (page-fields.ts, sent before the card loads) matches what the card allows', async () => {
		for (const update of [true, false]) {
			const { pagesType } = models(update);
			const h = await setup('page', { update });
			try {
				expect(pageStructuralFields(pagesType)).toEqual(['path']);
				// The card is mounted with `pageStructuralFields`; `setup` adds `slug` on top, which
				// this type does not declare as its slug: compare with the same exclusions.
				expect(pageInlineFields(pagesType).filter((field) => field !== 'slug')).toEqual(
					accepted(h, CANDIDATES).text
				);
			} finally {
				await h.close();
			}
		}
	});
});

describe('review of 22 Oct 2026', () => {
	test('applying a Markdown range without changes keeps its CRLF and leaves the card clean', async () => {
		const h = await setup('block');
		try {
			const first = range('Hola, soy **David**. [Escríbeme](/contacto){.btn}');
			const list = range('- uno\r\n- dos');
			// The site sends what it shows: line breaks as "\n".
			h.editor.beginInline('body', list);
			expect(h.editor.updateInline('body', '- uno\n- dos')).toBe(true);
			h.editor.finishInline();
			await tick();
			expect(h.lastDraft().body).toBe(BODY);
			h.editor.beginInline('body', first);
			h.editor.updateInline('body', 'Hola, soy **David**. [Escríbeme](/contacto){.btn}');
			h.editor.finishInline();
			await tick();
			expect(h.lastDraft().body).toBe(BODY);
			expect(await h.editor.save()).toBe('idle');
			expect(h.submit).not.toHaveBeenCalled();
		} finally {
			await h.close();
		}
	});

	test('the page card sends only the fields it shows to the preview draft', async () => {
		const { pagesType } = models();
		const target = document.createElement('div');
		document.body.append(target);
		const draft = vi.fn();
		const ctx = {
			t: (key: string) => t('es', key),
			locale: 'es',
			port: { get: vi.fn(), update: vi.fn() },
			feedback: { reportError: vi.fn(), toast: vi.fn() }
		} as unknown as VegaAppContext;
		const card = mount(VisualPageFields, {
			target,
			context: new Map([[VEGA_CONTEXT_KEY, ctx]]),
			props: {
				ctx,
				Editor: BlockEditor,
				Icon,
				type: pagesType,
				record: {
					id: 'p1',
					type: 'pages',
					values: {
						title: 'Sobre mí',
						description: 'Hola',
						path: '/sobre-mi',
						slug: 'x',
						secret: 's'
					}
				},
				name: 'Sobre mí',
				fullFormHref: '/c/pages/p1',
				onClose: vi.fn(),
				onSaved: vi.fn(),
				onDirtyChange: vi.fn(),
				onDraftChange: draft,
				onInlineTakeover: vi.fn(),
				interceptSave: () => false,
				structuralFields: pageStructuralFields(pagesType),
				textFields: pageTextFields(pagesType),
				onBusyChange: vi.fn(),
				onSaveError: vi.fn()
			}
		});
		try {
			await tick();
			expect(Object.keys(draft.mock.lastCall?.[0].fields).sort()).toEqual(
				['description', 'slug', 'title'].sort()
			);
			expect(draft.mock.lastCall?.[0].fields).not.toHaveProperty('path');
			expect(draft.mock.lastCall?.[0].fields).not.toHaveProperty('secret');
		} finally {
			await unmount(card);
			target.remove();
		}
	});
});
