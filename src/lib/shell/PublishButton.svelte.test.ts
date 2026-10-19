import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import PublishButton from './PublishButton.svelte';
import { hasNewSiteUpdateResult, observeSiteUpdate } from './site-update';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort } from '$lib/backend/port';
import type { BuildStatus, ContentType, Field } from '$lib/backend';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

async function flush(): Promise<void> {
	await vi.advanceTimersByTimeAsync(0);
	flushSync();
	await tick();
}

const updatedField: Field = {
	name: 'updated',
	type: 'date',
	readonly: true,
	required: false,
	presentable: false,
	hidden: false,
	unique: false
};

/** Un único `ContentType` con campo `updated`, para que `detectUnpublishedChanges` pueda
 *  determinar algo (`hasChanges` real, no `null`) en los tests que lo necesitan. */
const postSchema: ContentType = { name: 'post', readonly: false, fields: [updatedField] };

function fakePort(buildApiUrl: string | null): BackendPort {
	return {
		buildApiUrl,
		list: vi
			.fn()
			.mockResolvedValue({ items: [], page: 1, perPage: 1, totalItems: 0, totalPages: 0 })
	} as unknown as BackendPort;
}

function fakeCtx(opts: { buildApiUrl: string | null; withPostType?: boolean }): VegaAppContext {
	return {
		port: fakePort(opts.buildApiUrl),
		model: { types: opts.withPostType ? [{ schema: postSchema }] : [] },
		session: { token: 'tok-123', user: { id: 'u1', email: 'a@b.test' }, expiresAt: null },
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}:${JSON.stringify(params)}` : key,
		locale: 'es',
		icons: { knownIcons: [], has: () => true },
		reloadModel: async () => {},
		nav: {},
		feedback: { toast: vi.fn(), reportError: vi.fn() },
		registerExitGuard: () => () => {}
	} as unknown as VegaAppContext;
}

function mountButton(ctx: VegaAppContext): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(PublishButton, { target, context: new Map([[VEGA_CONTEXT_KEY, ctx]]) });
	return { target, instance };
}

const OLD: BuildStatus = {
	state: 'ok',
	startedAt: '2026-10-18T10:00:00Z',
	finishedAt: '2026-10-18T10:02:00Z',
	lastPublishedAt: '2026-10-18T10:02:00Z',
	detail: null,
	logUrl: null
};
const RUNNING: BuildStatus = {
	...OLD,
	state: 'running',
	startedAt: '2026-10-19T10:00:00Z',
	finishedAt: null
};
const NEW: BuildStatus = {
	...RUNNING,
	state: 'ok',
	finishedAt: '2026-10-19T10:02:00Z',
	lastPublishedAt: '2026-10-19T10:02:00Z'
};
let mounted: ReturnType<typeof mountButton> | null = null;
const trigger = () => mounted!.target.querySelector<HTMLButtonElement>('.vega-publish-trigger')!;
const state = () => mounted!.target.querySelector('.vega-publish')!.getAttribute('data-state');
const check = () =>
	mounted!.target.querySelector<HTMLButtonElement>('.vega-publish > .vega-publish-check')!;
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((finish) => {
		resolve = finish;
	});
	return { resolve, promise };
}
async function start(
	fetcher: ReturnType<typeof vi.fn>,
	ctx = fakeCtx({ buildApiUrl: 'https://pb.test/api/vega-build' })
) {
	vi.stubGlobal('fetch', fetcher);
	mounted = mountButton(ctx);
	await flush();
	return ctx;
}
beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('PublishButton — site update observation', () => {
	test('absent capability renders nothing and sends no requests', async () => {
		const fetcher = vi.fn();
		await start(fetcher, fakeCtx({ buildApiUrl: null }));
		expect(mounted!.target.textContent).toBe('');
		expect(fetcher).not.toHaveBeenCalled();
	});
	test.each([true, false])(
		'detector coverage %s does not disable updating or claim the site is current',
		async (withPostType) => {
			await start(
				vi.fn().mockImplementation(async () => jsonResponse(OLD)),
				fakeCtx({ buildApiUrl: 'https://pb.test/api/vega-build', withPostType })
			);
			expect(trigger().disabled).toBe(false);
			expect(state()).toBe('ok');
			expect(mounted!.target.querySelector('.vega-publish-state summary span')?.textContent).toBe(
				'topbar.publish.ok'
			);
			expect(mounted!.target.textContent).toContain(
				withPostType ? 'topbar.publish.noChanges' : 'topbar.publish.unknownChanges'
			);
			expect(trigger().textContent).toContain('topbar.publish.ready');
		}
	);
	test('202 → old ok → new running → new ok never promotes the old terminal', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(OLD))
			.mockResolvedValueOnce(jsonResponse({ id: 'run' }, 202))
			.mockResolvedValueOnce(jsonResponse(OLD))
			.mockResolvedValueOnce(jsonResponse(RUNNING))
			.mockImplementation(async () => jsonResponse(NEW));
		await start(fetcher);
		trigger().click();
		await flush();
		expect(state()).toBe('accepted');
		expect(trigger().disabled).toBe(true);
		await vi.advanceTimersByTimeAsync(4000);
		await tick();
		expect(state()).toBe('running');
		await vi.advanceTimersByTimeAsync(4000);
		await tick();
		expect(state()).toBe('ok');
		expect(trigger().disabled).toBe(false);
		await vi.advanceTimersByTimeAsync(120000);
		expect(fetcher).toHaveBeenCalledTimes(5);
	});
	test('a newer timestamp can reveal a global result without observing running', async () => {
		await start(
			vi
				.fn()
				.mockResolvedValueOnce(jsonResponse(OLD))
				.mockResolvedValueOnce(jsonResponse({ id: 'run' }, 202))
				.mockImplementation(async () => jsonResponse(NEW))
		);
		trigger().click();
		await flush();
		expect(state()).toBe('ok');
		expect(trigger().disabled).toBe(false);
	});
	test('GET error takes precedence over old success and recheck sends no second POST', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(OLD))
			.mockResolvedValueOnce(jsonResponse({ id: 'run' }, 202))
			.mockRejectedValueOnce(new Error('private transport'))
			.mockImplementation(async () => jsonResponse(OLD));
		await start(fetcher);
		trigger().click();
		await flush();
		expect(state()).toBe('unavailable');
		expect(trigger().disabled).toBe(true);
		expect(mounted!.target.querySelector('.vega-publish-state summary span')?.textContent).toBe(
			'topbar.publish.unavailableOffline'
		);
		expect(mounted!.target.textContent).toContain('topbar.publish.history');
		await vi.advanceTimersByTimeAsync(120000);
		expect(fetcher).toHaveBeenCalledTimes(3);
		check().click();
		await flush();
		expect(state()).toBe('uncertain');
		expect(trigger().disabled).toBe(false);
		expect(trigger().textContent).toContain('topbar.publish.again');
		expect(mounted!.target.textContent).toContain('topbar.publish.retryUncertain');
		expect(fetcher.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1);
		trigger().click();
		await flush();
		expect(fetcher.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(2);
	});
	test.each([
		OLD,
		{ ...OLD, state: 'failed' as const, detail: 'changed detail' },
		{ ...OLD, startedAt: null, finishedAt: null, lastPublishedAt: null },
		{ ...OLD, startedAt: 'invalid', finishedAt: 'invalid', lastPublishedAt: 'invalid' }
	])('an unproven terminal stays pending until the finite deadline: %j', async (terminal) => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(OLD))
			.mockResolvedValueOnce(jsonResponse({ id: 'run' }, 202))
			.mockImplementation(async () => jsonResponse(terminal));
		await start(fetcher);
		trigger().click();
		await flush();
		expect(state()).toBe('accepted');
		await vi.advanceTimersByTimeAsync(120000);
		await tick();
		expect(state()).toBe('uncertain');
		expect(trigger().disabled).toBe(true);
		expect(check().disabled).toBe(false);
		const calls = fetcher.mock.calls.length;
		await vi.advanceTimersByTimeAsync(120000);
		expect(fetcher).toHaveBeenCalledTimes(calls);
	});
	test('running followed by the same old terminal does not prove a newer result', async () => {
		await start(
			vi
				.fn()
				.mockResolvedValueOnce(jsonResponse(OLD))
				.mockResolvedValueOnce(jsonResponse({ id: 'run' }, 202))
				.mockResolvedValueOnce(jsonResponse(RUNNING))
				.mockImplementation(async () => jsonResponse(OLD))
		);
		trigger().click();
		await flush();
		expect(state()).toBe('running');
		await vi.advanceTimersByTimeAsync(4000);
		await tick();
		expect(state()).toBe('accepted');
	});
	test('POST error is ambiguous; observing running does not announce a failed or cancelled build', async () => {
		const ctx = await start(
			vi
				.fn()
				.mockResolvedValueOnce(jsonResponse(OLD))
				.mockRejectedValueOnce(new Error('private-provider-token'))
				.mockImplementation(async () => jsonResponse(RUNNING))
		);
		trigger().click();
		await flush();
		expect(state()).toBe('running');
		expect(mounted!.target.querySelector('.vega-publish-state summary span')?.textContent).toBe(
			'topbar.publish.ambiguousRunning'
		);
		expect(ctx.feedback.toast).toHaveBeenCalledWith('topbar.publish.triggerError', {
			kind: 'error'
		});
		expect(mounted!.target.textContent).not.toContain('private-provider-token');
	});
	test('stalled POST ends the local wait at 30 s; a late response cannot revive acceptance', async () => {
		const pending = deferred<Response>();
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(OLD))
			.mockReturnValueOnce(pending.promise)
			.mockImplementation(async () => jsonResponse(OLD));
		const ctx = await start(fetcher);
		trigger().click();
		await flush();
		expect(state()).toBe('requesting');
		const signal = fetcher.mock.calls[1][1].signal as AbortSignal;
		await vi.advanceTimersByTimeAsync(30000);
		await flush();
		expect(signal.aborted).toBe(true);
		expect(state()).toBe('ambiguous');
		expect(ctx.feedback.toast).toHaveBeenCalledWith('topbar.publish.triggerError', {
			kind: 'error'
		});
		pending.resolve(jsonResponse({ id: 'late' }, 202));
		await flush();
		expect(state()).toBe('ambiguous');
		expect(fetcher.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1);
	});
	test('stalled GET deadline aborts it; late completion cannot replace uncertainty', async () => {
		const pending = deferred<Response>();
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(OLD))
			.mockResolvedValueOnce(jsonResponse({ id: 'run' }, 202))
			.mockReturnValueOnce(pending.promise);
		await start(fetcher);
		trigger().click();
		await flush();
		const signal = fetcher.mock.calls[2][1].signal as AbortSignal;
		await vi.advanceTimersByTimeAsync(120000);
		await tick();
		expect(signal.aborted).toBe(true);
		expect(state()).toBe('uncertain');
		pending.resolve(jsonResponse(NEW));
		await flush();
		expect(state()).toBe('uncertain');
	});
	test.each([401, 403])(
		'permission error %s stops and offers only a status check',
		async (httpStatus) => {
			const fetcher = vi.fn().mockResolvedValue(new Response('private', { status: httpStatus }));
			await start(fetcher);
			expect(state()).toBe('unavailable');
			expect(trigger().disabled).toBe(true);
			expect(mounted!.target.textContent).toContain('topbar.publish.unavailableDenied');
			await vi.advanceTimersByTimeAsync(120000);
			expect(fetcher).toHaveBeenCalledTimes(1);
		}
	);
	test('failure detail remains plain text and only safe log URLs survive parsing', async () => {
		await start(
			vi.fn().mockResolvedValue(
				jsonResponse({
					...OLD,
					state: 'failed',
					detail: '<img src=x onerror=alert(1)>',
					logUrl: 'javascript:alert(1)'
				})
			)
		);
		expect(state()).toBe('failed');
		expect(trigger().disabled).toBe(false);
		expect(mounted!.target.querySelector('.vega-publish-detail')?.textContent).toContain(
			'<img src=x onerror=alert(1)>'
		);
		expect(mounted!.target.querySelector('img')).toBeNull();
		expect(mounted!.target.querySelector('.vega-publish-log')).toBeNull();
	});
	test('failed result retains the safe log link in its contextual details', async () => {
		await start(
			vi
				.fn()
				.mockResolvedValue(
					jsonResponse({ ...OLD, state: 'failed', logUrl: 'https://ci.test/run/1' })
				)
		);
		expect(mounted!.target.querySelector<HTMLAnchorElement>('.vega-publish-log')?.href).toBe(
			'https://ci.test/run/1'
		);
	});
	test('POST carries the session token and ignores repeated activation', async () => {
		const pending = deferred<Response>();
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(OLD))
			.mockReturnValueOnce(pending.promise)
			.mockImplementation(async () => jsonResponse(RUNNING));
		await start(fetcher);
		trigger().click();
		trigger().click();
		await flush();
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(fetcher.mock.calls[1][0]).toBe('https://pb.test/api/vega-build/trigger');
		expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('tok-123');
		pending.resolve(jsonResponse({ id: 'run' }, 202));
		await flush();
		expect(state()).toBe('running');
	});
	test.each([202, 502])(
		'unmount aborts POST and suppresses late feedback and requests (%s)',
		async (httpStatus) => {
			const pending = deferred<Response>();
			const fetcher = vi
				.fn()
				.mockResolvedValueOnce(jsonResponse(OLD))
				.mockReturnValueOnce(pending.promise);
			const ctx = await start(fetcher);
			trigger().click();
			await flush();
			const signal = fetcher.mock.calls[1][1].signal as AbortSignal;
			await unmount(mounted!.instance);
			mounted!.target.remove();
			mounted = null;
			expect(signal.aborted).toBe(true);
			pending.resolve(jsonResponse({ id: 'late' }, httpStatus));
			await flush();
			await vi.advanceTimersByTimeAsync(180000);
			expect(fetcher).toHaveBeenCalledTimes(2);
			expect(ctx.feedback.toast).not.toHaveBeenCalled();
		}
	);
	test('hidden tabs skip the limited detector; returning to the visible tab refreshes it', async () => {
		const ctx = fakeCtx({ buildApiUrl: 'https://pb.test/api/vega-build', withPostType: true });
		await start(
			vi.fn().mockImplementation(async () => jsonResponse(OLD)),
			ctx
		);
		const list = ctx.port.list as ReturnType<typeof vi.fn>;
		list.mockClear();
		try {
			Object.defineProperty(document, 'hidden', { value: true, configurable: true });
			Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
			await vi.advanceTimersByTimeAsync(120000);
			expect(list).not.toHaveBeenCalled();
			Object.defineProperty(document, 'hidden', { value: false, configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
			await flush();
			expect(list).toHaveBeenCalledTimes(1);
		} finally {
			Object.defineProperty(document, 'hidden', { value: false, configurable: true });
			Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
		}
	});
	test('a delayed detector cannot overwrite the newer result or hide a GET error', async () => {
		const delayed = deferred<{
			items: never[];
			page: number;
			perPage: number;
			totalItems: number;
			totalPages: number;
		}>();
		const ctx = fakeCtx({ buildApiUrl: 'https://pb.test/api/vega-build', withPostType: true });
		(ctx.port.list as ReturnType<typeof vi.fn>).mockReturnValueOnce(delayed.promise);
		await start(
			vi
				.fn()
				.mockResolvedValueOnce(jsonResponse(OLD))
				.mockResolvedValueOnce(jsonResponse({ id: 'run' }, 202))
				.mockRejectedValue(new Error('offline')),
			ctx
		);
		trigger().click();
		await flush();
		expect(state()).toBe('unavailable');
		delayed.resolve({ items: [], page: 1, perPage: 1, totalItems: 0, totalPages: 0 });
		await flush();
		expect(state()).toBe('unavailable');
		expect(mounted!.target.textContent).toContain('topbar.publish.unknownChanges');
	});
});

describe('site update evidence', () => {
	test('same, missing, invalid and regressive timestamps do not identify a new result', () => {
		const observation = { baseline: OLD, runningStartedAt: null };
		for (const status of [
			OLD,
			{ ...OLD, finishedAt: null },
			{ ...OLD, finishedAt: 'invalid' },
			{ ...OLD, finishedAt: '2020-01-01T00:00:00Z' }
		])
			expect(hasNewSiteUpdateResult(observation, status)).toBe(false);
		expect(
			hasNewSiteUpdateResult(
				{
					baseline: { ...OLD, startedAt: null, finishedAt: null, lastPublishedAt: null },
					runningStartedAt: null
				},
				NEW
			)
		).toBe(false);
	});
	test('only a matching new observed run plus a valid finish explains an otherwise incomparable terminal', () => {
		const baseline = { ...OLD, startedAt: null, finishedAt: null, lastPublishedAt: null };
		const observed = observeSiteUpdate({ baseline, runningStartedAt: null }, RUNNING);
		expect(hasNewSiteUpdateResult(observed, NEW)).toBe(true);
		expect(hasNewSiteUpdateResult(observed, { ...NEW, startedAt: OLD.startedAt })).toBe(false);
		expect(hasNewSiteUpdateResult(observed, { ...NEW, finishedAt: '2020-01-01T00:00:00Z' })).toBe(
			false
		);
	});
});
