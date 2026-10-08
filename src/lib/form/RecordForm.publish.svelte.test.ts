/** Publicar desde el formulario sobre memory real: contenido, versión, errores y mutex entre pasos. */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import RecordForm from './RecordForm.svelte';
import { buildFormModel } from './form-model';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { VegaError } from '$lib/backend/errors';
import { recordVersion } from '$lib/backend/version';
import type { ContentType, Field, RecordInput } from '$lib/backend/types';
import type { UpdateOptions } from '$lib/backend/port';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';

const navigation = vi.hoisted(() => ({
	guard: null as null | ((event: { cancel: () => void }) => void)
}));
vi.mock('$app/navigation', () => ({
	beforeNavigate: (guard: typeof navigation.guard) => {
		navigation.guard = guard;
	}
}));
Element.prototype.scrollIntoView = vi.fn();

const base = {
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
} as const;
const posts: ContentType = {
	name: 'posts',
	readonly: false,
	fields: [
		{ ...base, name: 'title', type: 'text', subtype: 'plain', required: true, presentable: true },
		{ ...base, name: 'status', type: 'select', options: ['draft', 'published'], multiple: false }
	] as Field[]
};

async function setup(
	opts: {
		create?: boolean;
		readonly?: boolean;
		noStatus?: boolean;
		statusReadonly?: boolean;
		dateReadonly?: boolean;
		ignoreStatus?: boolean;
		preview?: boolean;
		beforeSubmit?: (input: RecordInput, call: number) => Promise<void>;
	} = {}
) {
	const writableSource = {
		...posts,
		fields: posts.fields.map((field) =>
			field.name === 'status' && opts.statusReadonly ? { ...field, readonly: true } : field
		)
	};
	if (opts.dateReadonly)
		writableSource.fields = [
			...writableSource.fields,
			{ ...base, name: 'publishAt', type: 'date', readonly: true }
		];
	const source = opts.noStatus
		? { ...posts, fields: posts.fields.filter((f) => f.name !== 'status') }
		: writableSource;
	const values = {
		title: 'Notas del huerto',
		status: 'draft',
		...(opts.dateReadonly ? { publishAt: '2020-01-01T00:00:00Z' } : {})
	};
	const port = createMemoryBackend({
		users: [{ email: 'a@b.c', password: 'pw' }],
		contentTypes: [source],
		records: { posts: [{ id: 'p1', values }] }
	});
	await port.login({ email: 'a@b.c', password: 'pw' });
	const model = resolveContentModel({
		types: [source],
		manifestRaw: {
			collections: {
				posts: {
					statusLabels: { draft: 'Borrador', published: 'Publicado' },
					...(opts.dateReadonly ? { publishAtField: 'publishAt' } : {})
				}
			}
		}
	});
	const type = model.types.find((t) => t.name === 'posts')!;
	const initial = await port.get('posts', 'p1');
	const saved = vi.fn();
	const reportError = vi.fn();
	const onSubmit = vi.fn(async (input: RecordInput, options?: UpdateOptions) => {
		await opts.beforeSubmit?.(input, onSubmit.mock.calls.length);
		const actual = opts.ignoreStatus && input.status ? {} : input;
		return opts.create ? port.create('posts', actual) : port.update('posts', 'p1', actual, options);
	});
	const ctx = {
		port: opts.preview ? { ...port, previewApiUrl: 'https://preview.test/api/vega-preview' } : port,
		model,
		session: { token: 't', user: { id: 'u', email: 'a@b.c' } },
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es',
		nav: {},
		feedback: { toast: vi.fn(), reportError },
		registerExitGuard: () => () => {},
		reloadModel: async () => {}
	} as unknown as VegaAppContext;
	const target = document.createElement('div');
	document.body.appendChild(target);
	const props = $state({
		type,
		model: buildFormModel(type, opts.create ? null : initial),
		typeReadonly: opts.readonly ?? false,
		onSubmit,
		onSaved: saved,
		onCancel: () => {}
	});
	const instance = mount(RecordForm, {
		target,
		props,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	const w = { port, ctx, props, type, initial, saved, reportError, onSubmit, target, instance };
	mounted = w;
	await tick();
	return w;
}
type World = Awaited<ReturnType<typeof setup>>;
let mounted: World | null = null;
let releasePreview = () => {};
afterEach(async () => {
	releasePreview();
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	navigation.guard = null;
	vi.doUnmock('./PreviewPanel.svelte');
	vi.unstubAllGlobals();
});
const publish = (w: World) =>
	w.target.querySelector<HTMLButtonElement>('[data-status-target="published"]')!;
const title = (w: World) =>
	w.target.querySelector<HTMLInputElement | HTMLTextAreaElement>(
		'[data-field="title"] input, [data-field="title"] textarea'
	)!;
async function editTitle(w: World, value: string) {
	title(w).value = value;
	title(w).dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
	await tick();
}
async function settled(assertion: () => void) {
	await vi.waitFor(() => {
		flushSync();
		assertion();
	});
	await tick();
}
async function stored(w: World) {
	return (await w.port.get('posts', 'p1')).values;
}

describe('RecordForm — publicar', () => {
	test('limpio escribe solo estado y avisa una vez', async () => {
		const w = await setup();
		publish(w).click();
		await settled(() => expect(w.saved).toHaveBeenCalledTimes(1));
		expect(w.onSubmit).toHaveBeenCalledTimes(1);
		expect(w.onSubmit.mock.calls[0]).toEqual([
			{ status: 'published' },
			{ expectedVersion: recordVersion(w.initial) }
		]);
		expect((await stored(w)).status).toBe('published');
		expect(w.saved.mock.calls[0][1]).toContain('Publicado');
	});
	test('sucio guarda contenido en borrador antes de estado, con la versión nueva', async () => {
		const w = await setup();
		await editTitle(w, 'Huerto de invierno');
		publish(w).click();
		await settled(() => expect(w.saved).toHaveBeenCalledTimes(1));
		expect(w.onSubmit.mock.calls.map((call) => call[0])).toEqual([
			{ title: 'Huerto de invierno' },
			{ status: 'published' }
		]);
		expect(w.onSubmit.mock.calls[1][1]).toEqual({
			expectedVersion: recordVersion({
				values: { ...w.initial.values, title: 'Huerto de invierno' }
			})
		});
		expect(await stored(w)).toMatchObject({ title: 'Huerto de invierno', status: 'published' });
	});
	test('Estado editado no anticipa publicación durante el guardado del contenido', async () => {
		const writes: RecordInput[] = [];
		const w = await setup({
			beforeSubmit: async (input) => {
				writes.push(input);
			}
		});
		await editTitle(w, 'Cambio de título');
		const select = w.target.querySelector<HTMLSelectElement>('[data-field="status"] select')!;
		select.value = 'published';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		publish(w).click();
		await settled(() => expect(w.saved).toHaveBeenCalledTimes(1));
		expect(writes).toEqual([{ title: 'Cambio de título' }, { status: 'published' }]);
	});
	test('validación cliente aborta publicación y devuelve foco al campo', async () => {
		const w = await setup();
		await editTitle(w, '');
		publish(w).click();
		await settled(() => expect(title(w).getAttribute('aria-invalid')).toBe('true'));
		await settled(() => expect(document.activeElement).toBe(title(w)));
		expect(w.onSubmit).not.toHaveBeenCalled();
		expect((await stored(w)).status).toBe('draft');
	});
	test('rechazo de campo del backend no publica ni avisa de éxito', async () => {
		const w = await setup({
			beforeSubmit: async () => {
				throw VegaError.validation({
					title: { code: 'validation_required', message: 'Título rechazado' }
				});
			}
		});
		await editTitle(w, 'Nuevo título');
		publish(w).click();
		await settled(() => expect(title(w).getAttribute('aria-invalid')).toBe('true'));
		expect(w.onSubmit).toHaveBeenCalledTimes(1);
		expect(w.saved).not.toHaveBeenCalled();
		expect((await stored(w)).status).toBe('draft');
	});
	test('fallo de contenido conserva edición y nunca escribe estado', async () => {
		const w = await setup({
			beforeSubmit: async () => {
				throw VegaError.backend('No se pudo guardar');
			}
		});
		await editTitle(w, 'Contenido nuevo');
		publish(w).click();
		await settled(() => expect(w.reportError).toHaveBeenCalledTimes(1));
		expect(w.onSubmit).toHaveBeenCalledTimes(1);
		expect(title(w).value).toBe('Contenido nuevo');
		expect((await stored(w)).status).toBe('draft');
		expect(w.saved).not.toHaveBeenCalled();
	});
	test('conflicto de contenido falla cerrado con el aviso habitual', async () => {
		const w = await setup();
		await editTitle(w, 'Mi título');
		await w.port.update('posts', 'p1', { title: 'Título ajeno' });
		publish(w).click();
		await settled(() => expect(w.target.querySelector('.vega-conflict')).not.toBeNull());
		expect(w.onSubmit).toHaveBeenCalledTimes(1);
		expect(await stored(w)).toMatchObject({ title: 'Título ajeno', status: 'draft' });
		expect(title(w).value).toBe('Mi título');
	});
	test('fallo de estado conserva contenido guardado; reintento solo estado', async () => {
		let reject = true;
		const w = await setup({
			beforeSubmit: async (input) => {
				if (input.status === 'published' && reject) throw VegaError.backend('Publicación fallida');
			}
		});
		await editTitle(w, 'Título guardado');
		publish(w).click();
		await settled(() => expect(w.reportError).toHaveBeenCalledTimes(1));
		expect(await stored(w)).toMatchObject({ title: 'Título guardado', status: 'draft' });
		expect(w.saved).not.toHaveBeenCalled();
		expect(w.target.querySelector('[role="alert"]')?.textContent).toContain(
			'Guardado. No se pudo marcar como publicada'
		);
		reject = false;
		publish(w).click();
		await settled(() => expect(w.saved).toHaveBeenCalledTimes(1));
		expect(w.onSubmit.mock.calls.map((call) => call[0])).toEqual([
			{ title: 'Título guardado' },
			{ status: 'published' },
			{ status: 'published' }
		]);
	});
	test('mutex entre pasos impide doble click, Guardar y navegación incluso con contenido limpio', async () => {
		let release!: () => void;
		const hold = new Promise<void>((resolve) => {
			release = resolve;
		});
		const w = await setup({
			beforeSubmit: async (input) => {
				if (input.status === 'published') await hold;
			}
		});
		await editTitle(w, 'Nuevo contenido');
		publish(w).click();
		await settled(() => expect(w.onSubmit).toHaveBeenCalledTimes(2));
		expect(w.saved).not.toHaveBeenCalled();
		expect(title(w).disabled).toBe(true);
		publish(w).click();
		w.target
			.querySelector<HTMLFormElement>('form')!
			.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		const cancel = vi.fn();
		navigation.guard!({ cancel });
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(w.onSubmit).toHaveBeenCalledTimes(2);
		release();
		await settled(() => expect(w.saved).toHaveBeenCalledTimes(1));
		expect(title(w).disabled).toBe(false);
	});
	test.each([{ create: true }, { readonly: true }, { noStatus: true }])(
		'no añade control fuera del alcance: %j',
		async (opts) => {
			const w = await setup(opts);
			expect(publish(w)).toBeNull();
		}
	);
	test.each([false, true])(
		'readonly status: limpio/sucio=%s no ofrece publicación ni confirma un no-op',
		async (dirty) => {
			const w = await setup({ statusReadonly: true });
			if (dirty) await editTitle(w, 'Contenido permitido');
			expect(publish(w)).toBeNull();
			expect(w.onSubmit).not.toHaveBeenCalled();
			expect(w.saved).not.toHaveBeenCalled();
			expect((await stored(w)).status).toBe('draft');
			if (dirty) {
				w.target
					.querySelector<HTMLFormElement>('form')!
					.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
				await settled(() => expect(w.saved).toHaveBeenCalledTimes(1));
				expect(w.onSubmit.mock.calls.map((call) => call[0])).toEqual([
					{ title: 'Contenido permitido' }
				]);
				expect(await stored(w)).toMatchObject({ title: 'Contenido permitido', status: 'draft' });
			}
		}
	);
	test('readonly publishAt no resuelve programación: no ofrece vencido ni borra una fecha arbitraria', async () => {
		const w = await setup({ dateReadonly: true });
		expect(w.type.publishAtField).toBeNull();
		expect(
			[...w.target.querySelectorAll('button')].some(
				(b) => b.textContent?.trim() === 'Publicar ahora'
			)
		).toBe(false);
		publish(w).click();
		await settled(() => expect(w.saved).toHaveBeenCalledTimes(1));
		expect(w.onSubmit.mock.calls.map((call) => call[0])).toEqual([{ status: 'published' }]);
		expect(await stored(w)).toMatchObject({
			status: 'published',
			publishAt: w.initial.values.publishAt
		});
	});

	test.each([false, true])(
		'no confirma publicación si el backend devuelve borrador; sucio=%s',
		async (dirty) => {
			const w = await setup({ ignoreStatus: true });
			if (dirty) await editTitle(w, 'Contenido conservado');
			publish(w).click();
			await settled(() => expect(w.reportError).toHaveBeenCalledTimes(1));
			expect(w.saved).not.toHaveBeenCalled();
			expect((await stored(w)).status).toBe('draft');
			if (dirty) expect((await stored(w)).title).toBe('Contenido conservado');
		}
	);
});

/** Exercise the form's intent boundary separately from PreviewPanel's HTTP/timer engine suite. */
function deferredPreview() {
	let loads = 0;
	let completed = 0;
	const gate = new Promise<void>((resolve) => {
		releasePreview = resolve;
	});
	vi.doMock('./PreviewPanel.svelte', async (original) => {
		loads++;
		await gate;
		const component = await original();
		completed++;
		return component;
	});
	const fetch = vi.fn().mockResolvedValue(
		new Response(
			JSON.stringify({
				url: 'https://site.test/preview?token=fixture',
				expiresAt: '2099-01-01T00:00:00Z'
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		)
	);
	vi.stubGlobal('fetch', fetch);
	return { fetch, loads: () => loads, completed: () => completed };
}
const previewToggle = (w: World) =>
	w.target.querySelector<HTMLButtonElement>('.vega-editor-preview-toggle')!;

test('preview loads only on intent; closing a pending opening discards it and reopening starts once', async () => {
	const probe = deferredPreview();
	const w = await setup({ preview: true });
	expect(probe.loads()).toBe(0);
	expect(probe.fetch).not.toHaveBeenCalled();
	previewToggle(w).click();
	await settled(() => expect(probe.loads()).toBe(1));
	previewToggle(w).click();
	releasePreview();
	await settled(() => expect(probe.completed()).toBe(1));
	await settled(() => expect(previewToggle(w).getAttribute('aria-busy')).toBe('false'));
	expect(w.target.querySelector('iframe')).toBeNull();
	expect(probe.fetch).not.toHaveBeenCalled();
	previewToggle(w).click();
	await settled(() => expect(w.target.querySelector('iframe')).not.toBeNull());
	expect(probe.fetch).toHaveBeenCalledTimes(1);
	expect(probe.fetch.mock.calls[0][1].method).toBe('POST');
});

for (const boundary of ['logout', 'port', 'token', 'record', 'unmount'] as const) {
	test(`preview discards a pending opening after ${boundary} without a token request`, async () => {
		const probe = deferredPreview();
		const w = await setup({ preview: true });
		previewToggle(w).click();
		await settled(() => expect(probe.loads()).toBe(1));
		if (boundary === 'logout') Object.defineProperty(w.ctx, 'session', { get: () => null });
		if (boundary === 'port') Object.defineProperty(w.ctx, 'port', { get: () => w.port });
		if (boundary === 'token') w.ctx.session.token = 'new-session';
		if (boundary === 'record') w.props.model = buildFormModel(w.type, { ...w.initial, id: 'p2' });
		if (boundary === 'unmount') {
			await unmount(w.instance);
			w.target.remove();
			mounted = null;
		}
		releasePreview();
		await settled(() => expect(probe.completed()).toBe(1));
		if (boundary !== 'unmount')
			await settled(() => expect(previewToggle(w).getAttribute('aria-pressed')).toBe('false'));
		else await new Promise((resolve) => setTimeout(resolve, 20));
		expect(probe.fetch).not.toHaveBeenCalled();
	});
}
