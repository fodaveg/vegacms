import { afterEach, describe, expect, test, vi } from 'vitest';
import { createVisualBridgeClient } from './bridge-client';
import { parseInlineSource, sourceDigest, type InlineTargets } from './inline-session';

/**
 * Mensajería de la spec «edición en línea de todo el texto de la página» (22 oct 2026):
 * `editable` tras cada `ready` v2, campos del registro (`scope: 'record'`, sin bloque), rangos de
 * Markdown (`source`) y compatibilidad con sitios y Vegas que no los conocen. El dueño del borrador
 * (`BlockEditor`) se prueba en `inline-targets.svelte.test.ts`.
 */
const TARGETS: InlineTargets = {
	hint: 'Doble clic para editar',
	record: ['titleEs'],
	blocks: { b: ['heading'] },
	sources: { b: ['bodyEs'] }
};
const DIGEST = sourceDigest('Uno\n\nDos');

function setup(extra: Partial<Parameters<typeof createVisualBridgeClient>[0]> = {}) {
	const posted: Record<string, unknown>[] = [];
	const frame = { postMessage: (value: unknown) => posted.push(value as Record<string, unknown>) };
	const begin = vi.fn(
		(): ReturnType<
			NonNullable<Parameters<typeof createVisualBridgeClient>[0]['onInlineBegin']>
		> => ({
			widget: 'text' as const,
			value: 'Sobre mí'
		})
	);
	const input = vi.fn(() => true),
		end = vi.fn(),
		rect = vi.fn();
	const client = createVisualBridgeClient({
		record: { collection: 'pages', id: 'page' },
		previewUrl: 'https://site.test/preview',
		frame: () => frame,
		onInlineBegin: begin,
		onInlineInput: input,
		onInlineEnd: end,
		onInlineRect: rect,
		inlineTargets: () => TARGETS,
		...extra
	});
	client.start();
	const sessionId = posted[0].sessionId;
	const receive = (body: Record<string, unknown>, envelope = 'vega-visual-2') =>
		client.handleMessage({
			origin: 'https://site.test',
			source: frame,
			data: { vega: envelope, sessionId, documentId: 'doc', ...body }
		});
	const ready = {
		type: 'ready',
		collection: 'pages',
		id: 'page',
		blocks: [{ id: 'b', type: 'text', rect: { top: 0, left: 0, width: 100, height: 50 } }],
		liveRefresh: true
	};
	return { posted, client, receive, ready, begin, input, end, rect };
}

afterEach(() => vi.useRealTimers());

describe('editable (negotiation)', () => {
	test('each accepted v2 ready is followed by `editable` for that document', () => {
		const h = setup();
		h.receive(h.ready);
		expect(h.posted.at(-1)).toEqual({
			vega: 'vega-visual-2',
			sessionId: expect.any(String),
			documentId: 'doc',
			type: 'editable',
			...TARGETS
		});
		h.client.stop();
	});

	test('a v1 peer (old site) never receives it', () => {
		const h = setup();
		h.receive({ ...h.ready, sessionId: undefined, documentId: undefined }, 'vega-visual-1');
		expect(h.client.state.status).toBe('connected');
		expect(h.posted.some((message) => message.type === 'editable')).toBe(false);
		h.client.stop();
	});

	test('a late (async) answer is only sent while the document is the same', async () => {
		let resolve!: (targets: InlineTargets) => void;
		const h = setup({ inlineTargets: () => new Promise((done) => (resolve = done)) });
		h.receive(h.ready);
		h.client.loaded(); // the frame navigated: that document is gone
		resolve(TARGETS);
		await Promise.resolve();
		expect(h.posted.filter((message) => message.type === 'editable')).toEqual([]);
		h.client.stop();
	});
});

describe('record fields (A)', () => {
	test('scope record: no block, the owner gets `null`, editField carries the scope and no blockId', () => {
		const h = setup();
		h.receive(h.ready);
		expect(h.receive({ type: 'select', scope: 'record', field: 'titleEs', intent: 'edit' })).toBe(
			'accepted'
		);
		expect(h.begin).toHaveBeenCalledWith(null, 'titleEs', null, expect.any(Function));
		const edit = h.posted.at(-1)!;
		expect(edit).toMatchObject({
			type: 'editField',
			scope: 'record',
			field: 'titleEs',
			value: 'Sobre mí'
		});
		expect(edit).not.toHaveProperty('blockId');
		// Inputs with that identity reach the owner with `null` as block; there is no block to check.
		const identity = {
			editId: edit.editId,
			collection: 'pages',
			id: 'page',
			scope: 'record',
			field: 'titleEs'
		};
		expect(h.receive({ ...identity, type: 'input', sequence: 0, value: 'Sobre mí' })).toBe(
			'accepted'
		);
		expect(h.receive({ ...identity, type: 'input', sequence: 1, value: 'Sobre mí!' })).toBe(
			'accepted'
		);
		expect(h.input).toHaveBeenCalledExactlyOnceWith(null, 'titleEs', 'Sobre mí!');
		expect(h.receive({ ...identity, type: 'cancel', sequence: 2 })).toBe('accepted');
		expect(h.end).toHaveBeenCalledWith(null, true);
		// A block-scoped input cannot ride a record edit.
		h.client.stop();
	});

	test('a record request that also names a block or a source is malformed', () => {
		const h = setup();
		h.receive(h.ready);
		expect(
			h.receive({ type: 'select', scope: 'record', blockId: 'b', field: 'titleEs', intent: 'edit' })
		).toBe('malformed');
		expect(
			h.receive({
				type: 'select',
				scope: 'record',
				field: 'titleEs',
				intent: 'edit',
				source: { start: 0, end: 1, digest: DIGEST }
			})
		).toBe('malformed');
		expect(h.begin).not.toHaveBeenCalled();
		h.client.stop();
	});

	test('an async owner (the page form loads on demand) opens the edit when it resolves', async () => {
		const h = setup({
			onInlineBegin: () => Promise.resolve({ widget: 'textarea' as const, value: 'Hola' })
		});
		h.receive(h.ready);
		expect(
			h.receive({ type: 'select', scope: 'record', field: 'descriptionEs', intent: 'edit' })
		).toBe('accepted');
		await Promise.resolve();
		expect(h.posted.at(-1)).toMatchObject({ type: 'editField', scope: 'record', value: 'Hola' });
		h.client.stop();
	});

	test('isCurrent tells a slow owner that a later edit took over (review, 22 Oct: race with a block edit)', async () => {
		let resolve!: (value: { widget: 'text'; value: string }) => void;
		const checks: (() => boolean)[] = [];
		const h = setup({
			onInlineBegin: (blockId, _field, _source, isCurrent) => {
				checks.push(isCurrent);
				return blockId === null
					? new Promise((done) => (resolve = done))
					: { widget: 'text' as const, value: 'Bloque' };
			}
		});
		h.receive(h.ready);
		h.receive({ type: 'select', scope: 'record', field: 'titleEs', intent: 'edit' });
		expect(checks[0]!()).toBe(true);
		// The author opens a block text while the page card is still loading.
		h.receive({ type: 'select', blockId: 'b', field: 'heading', intent: 'edit' });
		expect(h.posted.at(-1)).toMatchObject({ type: 'editField', blockId: 'b' });
		expect(checks[0]!()).toBe(false);
		expect(checks[1]!()).toBe(true);
		resolve({ widget: 'text', value: 'T' });
		await Promise.resolve();
		await Promise.resolve();
		// The block edit is still the open one: no record editField after it.
		expect(h.posted.filter((message) => message.type === 'editField')).toHaveLength(1);
		h.client.stop();
	});

	test('if the request expired while the owner loaded, nothing opens and the owner is released', async () => {
		let resolve!: (value: { widget: 'text'; value: string }) => void;
		const h = setup({ onInlineBegin: () => new Promise((done) => (resolve = done)) });
		h.receive(h.ready);
		h.receive({ type: 'select', scope: 'record', field: 'titleEs', intent: 'edit' });
		h.client.finishInline(); // e.g. the author picked a block in the tree meanwhile
		resolve({ widget: 'text', value: 'T' });
		await Promise.resolve();
		await Promise.resolve();
		expect(h.posted.some((message) => message.type === 'editField')).toBe(false);
		expect(h.end).toHaveBeenCalledWith(null, true);
		h.client.stop();
	});
});

describe('Markdown source ranges (B)', () => {
	test('the range reaches the owner and is echoed in editField', () => {
		const h = setup({
			onInlineBegin: vi.fn(() => ({ widget: 'textarea' as const, value: 'Dos' }))
		});
		h.receive(h.ready);
		const source = { start: 5, end: 8, digest: DIGEST };
		expect(
			h.receive({ type: 'select', blockId: 'b', field: 'bodyEs', intent: 'edit', source })
		).toBe('accepted');
		expect(h.posted.at(-1)).toMatchObject({
			type: 'editField',
			blockId: 'b',
			field: 'bodyEs',
			widget: 'textarea',
			value: 'Dos',
			source
		});
		h.client.stop();
	});

	test('a malformed source is refused before the owner sees it; a stale one opens nothing', () => {
		const h = setup({ onInlineBegin: vi.fn(() => null) });
		h.receive(h.ready);
		for (const source of [
			{ start: 3, end: 1, digest: DIGEST },
			{ start: 0, end: 1, digest: 'md5:x' },
			{ start: -1, end: 1, digest: DIGEST },
			'0-1'
		])
			expect(
				h.receive({ type: 'select', blockId: 'b', field: 'bodyEs', intent: 'edit', source })
			).toBe('malformed');
		expect(
			h.receive({
				type: 'select',
				blockId: 'b',
				field: 'bodyEs',
				intent: 'edit',
				source: { start: 0, end: 3, digest: DIGEST }
			})
		).toBe('out-of-order');
		expect(h.posted.some((message) => message.type === 'editField')).toBe(false);
		h.client.stop();
	});

	test('parseInlineSource and sourceDigest follow the contract format', () => {
		expect(sourceDigest('')).toBe('v1:0:811c9dc5');
		expect(sourceDigest('a')).toBe('v1:1:e40c292c');
		expect(sourceDigest('foobar')).toBe('v1:6:bf9cf968');
		expect(parseInlineSource({ start: 0, end: 0, digest: 'v1:0:811c9dc5' })).toEqual({
			start: 0,
			end: 0,
			digest: 'v1:0:811c9dc5'
		});
		expect(parseInlineSource({ start: 1.5, end: 2, digest: 'v1:0:811c9dc5' })).toBeNull();
	});
});

test('layout.editRect moves the hint of the field being typed', () => {
	const h = setup();
	h.receive(h.ready);
	h.receive({ type: 'select', scope: 'record', field: 'titleEs', intent: 'edit' });
	const editRect = { top: 120, left: 8, width: 300, height: 40 };
	h.receive({ type: 'layout', blocks: h.ready.blocks, editRect });
	expect(h.rect).toHaveBeenLastCalledWith(null, editRect);
	h.client.stop();
});
