/** The compact form entry loads the real engine only after an explicit, still-current action. */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import FormPublishControl from './FormPublishControl.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { resolveContentModel } from '$lib/model/resolve';
import type { ContentType, VegaRecord } from '$lib/backend/types';
import { t as translate } from '$lib/i18n';

const source: ContentType = {
	name: 'pages',
	readonly: false,
	fields: [
		{
			name: 'status',
			type: 'select',
			options: ['draft', 'published'],
			multiple: false,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};
let mounted: { instance: ReturnType<typeof mount>; target: HTMLElement } | null = null;
let release = () => {};
afterEach(async () => {
	release();
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	vi.doUnmock('$lib/visual/VisualPublishControl.svelte');
});

async function setup(statusReadonly = false, failLoad = false) {
	let loads = 0;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	vi.doMock('$lib/visual/VisualPublishControl.svelte', async (original) => {
		loads++;
		if (failLoad) throw new Error('Controlled loading failure');
		await gate;
		return original();
	});
	const model = resolveContentModel({ types: [source], manifestRaw: {} });
	const type = model.types[0]!;
	if (statusReadonly) type.fields[0]!.schema.readonly = true;
	const record: VegaRecord = { id: 'p1', type: 'pages', values: { status: 'draft' } };
	const onChange = vi.fn(async () => ({ ...record, values: { status: 'published' } }));
	const contextValue = {
		model,
		port: {},
		session: { token: 't', user: { id: 'u' } } as VegaAppContext['session'] | null,
		locale: 'es',
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	};
	const ctx = contextValue as unknown as VegaAppContext;
	const props = $state({
		type,
		record,
		name: 'Página',
		pendingBlocks: [] as string[],
		onChange,
		disabled: false
	});
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(FormPublishControl, {
		target,
		props,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { instance, target };
	await tick();
	return { target, instance, props, ctx, contextValue, onChange, loads: () => loads };
}
async function settled(assertion: () => void) {
	await vi.waitFor(() => {
		flushSync();
		assertion();
	});
	await tick();
}

test('mounting a writable draft presents the action without loading or writing', async () => {
	const w = await setup();
	expect(w.target.textContent).toContain('Marcar como publicada');
	expect(w.loads()).toBe(0);
	expect(w.onChange).not.toHaveBeenCalled();
});

test('double activation while loading delegates once and keeps focus on the real action', async () => {
	const w = await setup();
	const first = w.instance.requestChange();
	await settled(() => expect(w.loads()).toBe(1));
	await w.instance.requestChange();
	expect(w.onChange).not.toHaveBeenCalled();
	release();
	await first;
	await settled(() => expect(w.onChange).toHaveBeenCalledTimes(1));
	expect(w.onChange).toHaveBeenCalledWith({ status: 'published' });
	expect(document.activeElement).toBe(w.target.querySelector('[data-status-target]'));
});

for (const boundary of ['record', 'token', 'port', 'disabled', 'status', 'logout'] as const) {
	test(`discards an activation after ${boundary} changes while loading`, async () => {
		const w = await setup();
		const action = w.instance.requestChange();
		await settled(() => expect(w.loads()).toBe(1));
		if (boundary === 'record') w.props.record = { ...w.props.record, id: 'p2' };
		if (boundary === 'token') w.ctx.session.token = 'other';
		if (boundary === 'port') w.contextValue.port = {};
		if (boundary === 'disabled') w.props.disabled = true;
		if (boundary === 'logout') w.contextValue.session = null;
		if (boundary === 'status')
			w.props.record = { ...w.props.record, values: { status: 'published' } };
		flushSync();
		release();
		await action;
		expect(w.onChange).not.toHaveBeenCalled();
	});
}

test('a load failure writes nothing and another activation can retry', async () => {
	const w = await setup(false, true);
	await w.instance.requestChange();
	await tick();
	expect(w.onChange).not.toHaveBeenCalled();
	expect(w.target.querySelector('[role="alert"]')).not.toBeNull();
	expect(w.target.querySelector('button')?.textContent).toContain('Reintentar');
	vi.doMock('$lib/visual/VisualPublishControl.svelte', (original) => original());
	await w.instance.requestChange();
	await settled(() => expect(w.onChange).toHaveBeenCalledTimes(1));
});

test('unmounting discards an in-flight activation', async () => {
	const w = await setup();
	const action = w.instance.requestChange();
	await settled(() => expect(w.loads()).toBe(1));
	await unmount(w.instance);
	w.target.remove();
	mounted = null;
	release();
	await action;
	expect(w.onChange).not.toHaveBeenCalled();
});

test('a readonly status cannot load the engine or write, including the imperative path', async () => {
	const w = await setup(true);
	await w.instance.requestChange();
	expect(w.target.querySelector('button')).toBeNull();
	expect(w.loads()).toBe(0);
	expect(w.onChange).not.toHaveBeenCalled();
});
