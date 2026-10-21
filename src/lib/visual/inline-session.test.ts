import { afterEach, describe, expect, test, vi } from 'vitest';
import { createVisualBridgeClient } from './bridge-client';
import { isInlineField, parseInlineRect } from './inline-session';

function setup(extra: Partial<Parameters<typeof createVisualBridgeClient>[0]> = {}) {
	const posted: Record<string, unknown>[] = [];
	const frame = { postMessage: (value: unknown) => posted.push(value as Record<string, unknown>) };
	const begin = vi.fn(() => ({ widget: 'text' as const, value: '' }));
	const input = vi.fn(() => true),
		end = vi.fn(),
		save = vi.fn();
	const client = createVisualBridgeClient({
		record: { collection: 'pages', id: 'page' },
		previewUrl: 'https://site.test/preview',
		frame: () => frame,
		onInlineBegin: begin,
		onInlineInput: input,
		onInlineEnd: end,
		onInlineSave: save,
		...extra
	});
	client.start();
	const sessionId = posted[0].sessionId;
	const identity = { vega: 'vega-visual-2', sessionId, documentId: 'doc' };
	const receive = (body: Record<string, unknown>) =>
		client.handleMessage({
			origin: 'https://site.test',
			source: frame,
			data: { ...identity, ...body }
		});
	const ready = {
		type: 'ready',
		collection: 'pages',
		id: 'page',
		blocks: [{ id: 'b', type: 'hero', rect: { top: 0, left: 0, width: 100, height: 50 } }],
		liveRefresh: true
	};
	receive(ready);
	const start = () => {
		receive({ type: 'select', blockId: 'b', field: 'heading', intent: 'edit' });
		return posted.at(-1)!;
	};
	return { posted, frame, client, receive, ready, start, input, begin, end, save };
}

afterEach(() => vi.useRealTimers());
describe('inline v2', () => {
	test('negotiates using a v1 hello, preserves v1 peers, and ignores late v1 after opt-in', () => {
		const h = setup();
		expect(h.posted[0]).toMatchObject({
			vega: 'vega-visual-1',
			supportedProtocols: ['vega-visual-2', 'vega-visual-1']
		});
		expect(h.receive({ ...h.ready, vega: 'vega-visual-1' })).toBe('out-of-order');
		h.client.loaded();
		expect(h.receive({ ...h.ready, vega: 'vega-visual-1' })).toBe('accepted');
		expect(h.start().type).toBe('hello');
		h.client.stop();
	});
	test('requires exact origin/source, session/document/edit identity and increasing sequence', () => {
		const h = setup();
		const edit = h.start();
		expect(
			h.client.handleMessage({
				origin: 'https://site.test',
				data: { ...edit, type: 'input', sequence: 0 }
			})
		).toBe('foreign-source');
		expect(h.receive({ ...edit, type: 'input', sequence: 0, sessionId: 'old' })).toBe(
			'out-of-order'
		);
		expect(h.receive({ ...edit, type: 'input', sequence: 1 })).toBe('out-of-order');
		expect(h.receive({ ...edit, type: 'input', sequence: 0 })).toBe('accepted');
		expect(h.input).not.toHaveBeenCalled(); // ack must not turn a null draft into an empty string
		expect(h.receive({ ...edit, type: 'input', sequence: 1, value: 'Draft' })).toBe('accepted');
		expect(h.receive({ ...edit, type: 'input', sequence: 1, value: 'Replay' })).toBe(
			'out-of-order'
		);
		expect(h.input).toHaveBeenCalledExactlyOnceWith('b', 'heading', 'Draft');
		h.client.stop();
	});
	test('editField carries Vega colours when the host resolves them, and none otherwise', () => {
		const withColours = setup({
			inlineAppearance: () => ({ outline: 'computed-outline', soft: 'computed-soft' })
		});
		expect(withColours.start()).toMatchObject({
			type: 'editField',
			appearance: { outline: 'computed-outline', soft: 'computed-soft' }
		});
		withColours.client.stop();
		const without = setup({ inlineAppearance: () => null });
		expect(without.start()).not.toHaveProperty('appearance');
		without.client.stop();
	});
	test('input rect reaches the host from the acknowledgement on; malformed rects are dropped', () => {
		const onInlineRect = vi.fn();
		const h = setup({ onInlineRect });
		const edit = h.start();
		const rect = { top: 10, left: 20, width: 300, height: 40 };
		h.receive({ ...edit, type: 'input', sequence: 0, rect });
		expect(onInlineRect).toHaveBeenCalledWith('b', rect);
		h.receive({ ...edit, type: 'input', sequence: 1, value: 'x', rect: { top: 'NaN' } });
		expect(onInlineRect).toHaveBeenCalledOnce();
		expect(parseInlineRect({ top: 1, left: 2, width: -1, height: 3 })).toBeNull();
		expect(parseInlineRect({ top: 1, left: 2, width: Infinity, height: 3 })).toBeNull();
		h.client.stop();
	});
	test('commit is draft-only; repeated ready does not end editing; explicit save is separate', () => {
		const h = setup();
		const edit = h.start();
		h.receive({ ...edit, type: 'input', sequence: 0 });
		h.receive(h.ready);
		expect(h.end).not.toHaveBeenCalled();
		h.receive({ ...edit, type: 'commit', sequence: 1, value: 'Draft' });
		expect(h.end).toHaveBeenCalledWith('b', false);
		expect(h.save).not.toHaveBeenCalled();
		h.receive({ type: 'save', collection: 'pages', id: 'page' });
		expect(h.save).toHaveBeenCalledOnce();
		h.client.stop();
	});
	test('cancel, missing field timeout, permission revocation and refresh invalidation', () => {
		vi.useFakeTimers();
		const h = setup();
		h.client.refresh({ url: 'https://site.test/new' });
		const refresh = h.posted.at(-1)!;
		const edit = h.start();
		h.receive({ ...edit, type: 'input', sequence: 0 });
		h.input.mockReturnValue(false);
		h.receive({ ...edit, type: 'input', sequence: 1, value: 'denied' });
		expect(h.end).toHaveBeenCalledWith('b', false);
		const next = h.start();
		h.receive({ ...next, type: 'cancel', sequence: 0 });
		expect(h.end).toHaveBeenLastCalledWith('b', true);
		h.start();
		vi.advanceTimersByTime(2000);
		expect(h.end).toHaveBeenLastCalledWith('b', false);
		expect(refresh.refreshId).toEqual(expect.any(String));
		h.client.stop();
	});
	test('toolbar Save waits for the final field value before invoking the shared save', () => {
		vi.useFakeTimers();
		const h = setup();
		const edit = h.start();
		h.receive({ ...edit, type: 'input', sequence: 0 });
		expect(h.client.saveInline()).toBe(true);
		expect(h.posted.at(-1)).toMatchObject({ type: 'finishField', requestValue: true });
		vi.advanceTimersByTime(10000);
		expect(h.save).not.toHaveBeenCalled();
		expect(h.end).not.toHaveBeenCalled();
		h.receive({ ...edit, type: 'commit', sequence: 1, value: 'Final IME text' });
		expect(h.input).toHaveBeenCalledWith('b', 'heading', 'Final IME text');
		expect(h.save).toHaveBeenCalledOnce();
		h.client.stop();
	});

	test('unanswered final save can be retried and navigation invalidates its late commit', () => {
		const h = setup();
		const edit = h.start();
		h.receive({ ...edit, type: 'input', sequence: 0 });
		expect(h.client.saveInline()).toBe(true);
		expect(h.client.saveInline()).toBe(true);
		expect(h.posted.filter((m) => m.type === 'finishField' && m.requestValue)).toHaveLength(2);
		h.client.loaded();
		expect(h.end).toHaveBeenCalledWith('b', false);
		expect(h.receive({ ...edit, type: 'commit', sequence: 1, value: 'Late' })).toBe('out-of-order');
		expect(h.save).not.toHaveBeenCalled();
		h.client.stop();
	});

	test('simple names only', () => {
		for (const field of ['title.html', 'x[y]', '__proto__', 'constructor', '<b>'])
			expect(isInlineField(field)).toBe(false);
		expect(isInlineField('body_text')).toBe(true);
	});
});
