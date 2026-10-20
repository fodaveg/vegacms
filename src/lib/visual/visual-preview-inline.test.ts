import { afterEach, expect, test, vi } from 'vitest';
import { createVisualPreviewState } from './visual-preview-state';
import type { createPreviewClient, PreviewToken } from '$lib/backend/preview-client';
import type { VisualBridgeClient } from './bridge-client';
afterEach(() => vi.useRealTimers());
test('inline invalidates an in-flight token, pauses debounce and renewal, then refreshes the latest draft once', async () => {
	vi.useFakeTimers();
	let resolve!: (token: PreviewToken) => void;
	const request = vi.fn(
		() =>
			new Promise<PreviewToken>((done) => {
				resolve = done;
			})
	);
	const refresh = vi.fn(() => true),
		tokenState = vi.fn();
	let title = 'Old';
	const bridge = {
		state: { status: 'connected', liveRefresh: true },
		refresh,
		stop: vi.fn()
	} as unknown as VisualBridgeClient;
	const preview = createVisualPreviewState({
		client: { requestPreview: request } as ReturnType<typeof createPreviewClient>,
		typeName: 'pages',
		recordId: 'page',
		bridge: () => bridge,
		hasCanvas: () => true,
		getDraft: () => ({ record: { id: 'page', fields: { title } }, blocks: [] }),
		setTokenState: tokenState,
		resetFrameLoaded: vi.fn(),
		t: (key) => key
	});
	preview.scheduleCanvasRefresh({ draftEdit: true });
	await vi.advanceTimersByTimeAsync(400);
	expect(request).toHaveBeenCalledOnce();
	preview.pauseInline();
	resolve({ url: 'https://site.test/old', expiresAt: new Date(Date.now() + 60_000).toISOString() });
	await Promise.resolve();
	await Promise.resolve();
	title = 'New';
	preview.scheduleCanvasRefresh({ draftEdit: true });
	await vi.advanceTimersByTimeAsync(60_000);
	expect(refresh).not.toHaveBeenCalled();
	expect(tokenState).not.toHaveBeenCalled();
	expect(request).toHaveBeenCalledOnce();
	preview.resumeInline();
	await vi.advanceTimersByTimeAsync(400);
	expect(request).toHaveBeenCalledTimes(2);
	expect(request.mock.lastCall).toEqual([
		'pages',
		'page',
		{ record: { id: 'page', fields: { title: 'New' } }, blocks: [] }
	]);
	preview.dispose();
});
