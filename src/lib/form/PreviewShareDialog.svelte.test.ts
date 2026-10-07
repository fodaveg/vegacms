/** Consumidor real: RecordForm + diálogo lazy + HTTP existente; jamás guarda el padre. */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import RecordForm from './RecordForm.svelte';
import { buildFormModel } from './form-model';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { resolveContentModel } from '$lib/model/resolve';
import type { ContentType } from '$lib/backend/types';
import type { CreatedPreviewShareLink, PreviewShareLink } from '$lib/backend/preview-share-client';
import { t as translate } from '$lib/i18n';

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn() }));
Element.prototype.scrollIntoView = vi.fn();
const schema: ContentType = {
	name: 'pages',
	readonly: false,
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		}
	]
};
const created: CreatedPreviewShareLink = {
	id: 'share1',
	label: 'Ana',
	createdAt: '2026-10-07T12:00:00Z',
	expiresAt: '2099-10-08T12:00:00Z',
	createdBy: 'editor1',
	createdByCollection: 'vega_editors',
	url: 'https://site.test/preview-share/synthetic-one-time'
};
const { url: _url, ...row } = created;
let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
	else Reflect.deleteProperty(navigator, 'clipboard');
});
async function settle() {
	await tick();
	await new Promise((resolve) => setTimeout(resolve, 5));
	await tick();
}
function input(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
	el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}
function modal() {
	return document.querySelector<HTMLElement>('[data-preview-share]')!;
}
function button(text: string, root: ParentNode = modal()) {
	return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
		(el) => el.textContent?.trim() === text
	)!;
}

async function setup(options: { gate?: string; items?: PreviewShareLink[] } = {}) {
	const model = resolveContentModel({ types: [schema], manifestRaw: null });
	const type = model.types[0];
	if (options.gate === 'view' || options.gate === 'update') type.permissions[options.gate] = false;
	const session = $state({
		token: 'editor-test-token',
		user: { id: 'editor1', email: 'editor@example.test' },
		expiresAt: null
	});
	const onSubmit = vi.fn(async () => ({
		id: 'page1',
		type: 'pages',
		values: { title: 'Guardado' }
	}));
	const feedback = { reportError: vi.fn(), toast: vi.fn() };
	const ctx = {
		port: {
			previewApiUrl: options.gate === 'endpoint' ? null : 'https://pb.test/api/preview',
			previewShare: options.gate !== 'flag',
			capabilities: {}
		},
		model,
		session,
		locale: 'es',
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		feedback
	} as unknown as VegaAppContext;
	const props = $state({
		type,
		model: buildFormModel(
			type,
			options.gate === 'new' ? null : { id: 'page1', type: 'pages', values: { title: 'Guardado' } }
		),
		typeReadonly: options.gate === 'readonly',
		onSubmit,
		onSaved: vi.fn(),
		onCancel: vi.fn()
	});
	const target = document.createElement('div');
	document.body.append(target);
	const items = [...(options.items ?? [])];
	const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		if (String(url).endsWith('/revoke')) {
			items.splice(
				items.findIndex((item) => item.id === 'share1'),
				1
			);
			return new Response(null, { status: 204 });
		}
		if (init?.method === 'POST') {
			items.unshift(row);
			return new Response(JSON.stringify(created), { status: 201 });
		}
		return new Response(JSON.stringify({ items }), { status: 200 });
	});
	vi.stubGlobal('fetch', request);
	const writeText = vi.fn(async () => {});
	Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
	mounted = {
		target,
		instance: mount(RecordForm, { target, props, context: new Map([[VEGA_CONTEXT_KEY, ctx]]) })
	};
	await settle();
	return { target, props, ctx, session, onSubmit, request, writeText, feedback };
}
async function open(target: HTMLElement) {
	const opener = button('Compartir vista previa', target);
	opener.focus();
	opener.click();
	await vi.waitFor(() => expect(modal()).not.toBeNull());
	await vi.waitFor(() =>
		expect(button('Crear enlace')?.getAttribute('aria-disabled')).toBe('false')
	);
	await settle();
	return opener;
}
async function createForm() {
	button('Crear enlace').click();
	await settle();
}

describe('L13 compartir desde RecordForm', () => {
	test.each(['new', 'readonly', 'view', 'update', 'flag', 'endpoint'])(
		'%s no ofrece ni pide compartir',
		async (gate) => {
			const { target, request } = await setup({ gate });
			expect(button('Compartir vista previa', target)).toBeUndefined();
			expect(request).not.toHaveBeenCalled();
		}
	);
	test('dirty comparte guardado actual; CmdS no guarda padre y URL/copy solo una apertura', async () => {
		const { target, onSubmit, request, writeText } = await setup();
		const title = target.querySelector<HTMLTextAreaElement>('#vega-field-title')!;
		input(title, 'Sin guardar');
		const opener = await open(target);
		expect(modal().closest('form')).toBeNull();
		expect(modal().textContent).toContain('Se compartirá la versión guardada');
		await createForm();
		const label = modal().querySelector<HTMLInputElement>('[data-share-label]')!;
		expect(document.activeElement).toBe(label);
		label.dispatchEvent(
			new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
		);
		input(label, ' Ana ');
		button('Crear enlace').click();
		await settle();
		const posts = request.mock.calls.filter(([, init]) => init?.method === 'POST');
		expect(posts).toHaveLength(1);
		expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
			collection: 'pages',
			id: 'page1',
			ttlSeconds: 86400,
			label: 'Ana'
		});
		expect(onSubmit).not.toHaveBeenCalled();
		expect(title.value).toBe('Sin guardar');
		const url = modal().querySelector<HTMLTextAreaElement>('[data-share-url]')!;
		expect(url.value).toBe(created.url);
		expect(document.activeElement).toBe(url);
		button('Copiar enlace').click();
		await settle();
		expect(writeText).toHaveBeenCalledWith(created.url);
		button('Cerrar').click();
		await settle();
		expect(modal()).toBeNull();
		expect(document.activeElement).toBe(opener);
		await open(target);
		expect(modal().querySelector('[data-share-url]')).toBeNull();
		expect(modal().textContent).toContain('Ana');
		expect(modal().textContent).not.toContain(created.url);
		expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
	});
	test('copy rechazado conserva dirección seleccionada; cerrar sin copiar confirma en misma superficie', async () => {
		const { target, writeText } = await setup();
		writeText.mockRejectedValue(new Error('clipboard denied'));
		await open(target);
		await createForm();
		button('Crear enlace').click();
		await settle();
		button('Copiar enlace').click();
		await settle();
		expect(modal().textContent).toContain('cópiala manualmente');
		button('Cerrar').click();
		await settle();
		expect(button('Volver al enlace')).not.toBeUndefined();
		expect(document.activeElement).toBe(button('Volver al enlace'));
		button('Volver al enlace').click();
		await settle();
		expect(modal().querySelector<HTMLTextAreaElement>('[data-share-url]')!.value).toBe(created.url);
		button('Cerrar').click();
		await settle();
		button('Cerrar sin copiar').click();
		await settle();
		expect(modal()).toBeNull();
	});
	test('anular pide confirmación del enlace; Cancelar recibe foco y204quita fila', async () => {
		const { target, request } = await setup({ items: [row] });
		await open(target);
		const revoke = button('Anular');
		revoke.click();
		await settle();
		expect(document.activeElement).toBe(button('Cancelar'));
		expect(modal().textContent).toContain('Ana');
		button('Cancelar').click();
		await settle();
		const restoredRevoke = button('Anular');
		expect(document.activeElement).toBe(restoredRevoke);
		expect(restoredRevoke.dataset.shareLink).toBe('share1');
		restoredRevoke.click();
		await settle();
		button('Anular enlace').click();
		await settle();
		expect(modal().querySelectorAll('.vega-share-list li')).toHaveLength(0);
		expect(modal().textContent).toContain('Enlace anulado');
		expect(
			JSON.parse(
				String(request.mock.calls.find(([url]) => String(url).endsWith('/revoke'))![1]?.body)
			)
		).toEqual({ collection: 'pages', id: 'page1', linkId: 'share1' });
	});
	test('busy no cierra ni repite envío, pero cambio de sesión descarta respuesta tardía', async () => {
		const { target, session, request } = await setup();
		await open(target);
		await createForm();
		let resolve!: (value: Response) => void;
		request.mockImplementationOnce(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		button('Crear enlace').click();
		await settle();
		button('Creando…').click();
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		);
		await settle();
		expect(modal()).not.toBeNull();
		expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
		session.token = 'new-test-session';
		flushSync();
		await settle();
		expect(modal()).toBeNull();
		resolve(new Response(JSON.stringify(created), { status: 201 }));
		await settle();
		expect(document.body.textContent).not.toContain(created.url);
	});
	test.each([400, 401, 403, 404, 409, 503])(
		'error%s usa feedback fijo y conserva etiqueta/duración',
		async (status) => {
			const { target, request, feedback } = await setup();
			await open(target);
			await createForm();
			const label = modal().querySelector<HTMLInputElement>('[data-share-label]')!;
			input(label, 'Conservar');
			request.mockResolvedValueOnce(new Response('raw body forbidden in UI', { status }));
			button('Crear enlace').click();
			await settle();
			expect(label.value).toBe('Conservar');
			expect(modal().querySelector<HTMLInputElement>('[data-share-amount]')!.value).toBe('1');
			expect(modal().querySelector('[role="alert"]')).not.toBeNull();
			expect(modal().textContent).not.toContain('raw body');
			if (status === 401)
				expect(feedback.reportError).toHaveBeenCalledWith(
					expect.objectContaining({ kind: 'auth-expired' }),
					{ action: 'preview-share:manage' }
				);
		}
	);
	test('network ambiguo conserva valores y pide GETfresco sin duplicar POST', async () => {
		const { target, request } = await setup();
		await open(target);
		await createForm();
		request.mockRejectedValueOnce(new TypeError('network failed'));
		button('Crear enlace').click();
		await settle();
		expect(modal().textContent).toContain('No sabemos si el enlace llegó a crearse');
		button('Crear enlace').click();
		await settle();
		expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
		button('Consultar enlaces activos').click();
		await settle();
		expect(request.mock.calls.filter(([, init]) => init?.method === 'GET')).toHaveLength(2);
		expect(button('Crear enlace').getAttribute('aria-disabled')).toBe('true');
	});
});
