/** Camino real diálogo → preview → escritura: el JSON nunca autoriza por sí solo red de medios. */
import { flushSync, mount, tick, unmount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import type { ResolvedContentType } from '$lib/model/types';
import { t } from '$lib/i18n';
import ImportDialog from './ImportDialog.svelte';

const input = vi.hoisted(() => ({ text: '' }));
vi.mock('./read-file-progress', () => ({ readTextWithProgress: async () => input.text }));

const type = {
	name: 'posts',
	hidden: false,
	permissions: ALL_PERMISSIONS,
	schema: {
		name: 'posts',
		fields: [{ name: 'cover', type: 'file', required: false, readonly: false, multiple: false }]
	}
} as unknown as ResolvedContentType;
const create = vi.fn();
const update = vi.fn();
const list = vi.fn();
const fetchSpy = vi.fn();
let mounted: { target: HTMLElement; instance: Record<string, unknown> } | null = null;

beforeEach(() => {
	vi.clearAllMocks();
	input.text = JSON.stringify({
		vegaTransfer: 1,
		origin: { backendUrl: 'http://u:secret@127.0.0.1:8090/api?secret=1' },
		collections: [
			{
				type: 'posts',
				records: [
					{ id: 'p1', values: { cover: { file: 'a.png', url: 'https://media.test/a.png' } } }
				]
			}
		]
	});
	list.mockResolvedValue({
		items: [{ id: 'p1', type: 'posts', values: {} }],
		page: 1,
		perPage: 30,
		totalItems: 1,
		totalPages: 1
	});
	fetchSpy.mockImplementation(
		async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } })
	);
	vi.stubGlobal('fetch', fetchSpy);
});
afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	vi.unstubAllGlobals();
});
function mountDialog() {
	const state = new SvelteMap([['open', true]]);
	const identity = new SvelteMap([
		['id', 'first'],
		['token', 'old']
	]);
	const ports = new SvelteMap([['current', { list, create, update }]]);
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) => t('es', key, params),
		model: { types: [type] },
		get port() {
			return ports.get('current');
		},
		get session() {
			return { user: { id: identity.get('id') }, token: identity.get('token') };
		},
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(ImportDialog, {
		target,
		props: {
			get open() {
				return state.get('open')!;
			},
			onClose: () => state.set('open', false)
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance };
	flushSync();
	return { target, state, identity, ports };
}
async function settle() {
	for (let i = 0; i < 15; i++) await tick();
	flushSync();
}
async function pick(target: HTMLElement, name = 'datos.vega.json') {
	const picker = target.querySelector<HTMLInputElement>('input[type=file]')!;
	Object.defineProperty(picker, 'files', { configurable: true, value: [new File(['{}'], name)] });
	picker.dispatchEvent(new Event('change', { bubbles: true }));
	await settle();
}
async function select(target: HTMLElement, checked = true) {
	const checkbox = target.querySelector<HTMLInputElement>('.vega-import-origin input')!;
	checkbox.checked = checked;
	checkbox.dispatchEvent(new Event('change', { bubbles: true }));
	await settle();
}
async function preview(target: HTMLElement) {
	target.querySelector<HTMLButtonElement>('.vega-import-preview-button')!.click();
	await settle();
}

describe('ImportDialog — consentimiento de medios', () => {
	test('elegir JSON muestra orígenes sanitizados sin permisos ni fetch; optional ajeno bloquea PISA', async () => {
		const { target } = mountDialog();
		await pick(target);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(list).not.toHaveBeenCalled();
		expect(target.textContent).toContain('http://127.0.0.1:8090');
		expect(target.textContent).toContain('dirección local');
		expect(target.textContent).not.toContain('secret');
		expect(target.querySelector<HTMLInputElement>('.vega-import-origin input')!.checked).toBe(
			false
		);
		await preview(target);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(target.textContent).toContain('no está autorizado');
		const submit = target.querySelector<HTMLButtonElement>('.vega-import-confirm-button')!;
		expect(submit.disabled).toBe(true);
		submit.click();
		await settle();
		expect(create).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
	});
	test('recalcular con permiso comparte la descarga y conserva confirmación PISA aparte', async () => {
		const { target } = mountDialog();
		await pick(target);
		await preview(target);
		await select(target);
		await preview(target);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const submit = target.querySelector<HTMLButtonElement>('.vega-import-confirm-button')!;
		expect(submit.disabled).toBe(true);
		const overwrite = target.querySelector<HTMLInputElement>(
			'.vega-import-preview .vega-import-confirm input'
		)!;
		overwrite.checked = true;
		overwrite.dispatchEvent(new Event('change', { bubbles: true }));
		await settle();
		submit.click();
		await settle();
		expect(update).toHaveBeenCalledWith('posts', 'p1', { cover: expect.any(File) });
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
	test('un fallo de red autorizado avisa antes de confirmar PISA y se informa al terminar', async () => {
		fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
		const { target } = mountDialog();
		await pick(target);
		await select(target);
		await preview(target);
		expect(target.textContent).toContain('Los opcionales se importarán sin esos ficheros');
		const overwrite = target.querySelector<HTMLInputElement>(
			'.vega-import-preview .vega-import-confirm input'
		)!;
		expect(overwrite.checked).toBe(false);
		overwrite.checked = true;
		overwrite.dispatchEvent(new Event('change', { bubbles: true }));
		await settle();
		target.querySelector<HTMLButtonElement>('.vega-import-confirm-button')!.click();
		await settle();
		expect(update).toHaveBeenCalledWith('posts', 'p1', { cover: null });
		expect(target.textContent).toContain('Medios no traídos: cover');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
	test('otro fichero y cerrar/reabrir reinician permisos, caché y confirmación', async () => {
		const { target, state } = mountDialog();
		await pick(target);
		await select(target);
		await preview(target);
		await pick(target, 'otro.vega.json');
		expect(target.querySelector<HTMLInputElement>('.vega-import-origin input')!.checked).toBe(
			false
		);
		await preview(target);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(target.textContent).toContain('no está autorizado');
		state.set('open', false);
		await settle();
		state.set('open', true);
		await settle();
		await pick(target);
		expect(target.querySelector<HTMLInputElement>('.vega-import-origin input')!.checked).toBe(
			false
		);
		await select(target);
		await preview(target);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(
			target.querySelector<HTMLInputElement>('.vega-import-preview .vega-import-confirm input')!
				.checked
		).toBe(false);
	});
	test('Tab recorre los orígenes y Escape cierra sin conservar permiso', async () => {
		const { target, state } = mountDialog();
		await pick(target);
		const consent = target.querySelector<HTMLInputElement>('.vega-import-origin input')!;
		expect(consent.labels?.length).toBe(1);
		const last = target.querySelector<HTMLButtonElement>('.vega-import-preview-button')!;
		last.focus();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
		expect(document.activeElement).toBe(target.querySelector('input[type=file]'));
		await select(target);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		expect(state.get('open')).toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

/** La descarga termina en otro contexto: ni su preview ni sus permisos pueden heredarse. */
test('otra identidad en el mismo puerto durante una descarga reinicia consentimiento sin escribir', async () => {
	let resolve!: (response: Response) => void;
	fetchSpy.mockImplementationOnce(() => new Promise<Response>((r) => (resolve = r)));
	const { target, identity } = mountDialog();
	await pick(target);
	await select(target);
	target.querySelector<HTMLButtonElement>('.vega-import-preview-button')!.click();
	await settle();
	expect(fetchSpy).toHaveBeenCalledTimes(1);
	identity.set('id', 'second');
	await settle();
	resolve(new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }));
	await settle();
	expect(create).not.toHaveBeenCalled();
	expect(update).not.toHaveBeenCalled();
	expect(target.querySelector('.vega-import-preview')).toBeNull();
	await pick(target);
	expect(target.querySelector<HTMLInputElement>('.vega-import-origin input')!.checked).toBe(false);
});

test('renovar el token del mismo usuario conserva el consentimiento y el preview', async () => {
	const { target, identity } = mountDialog();
	await pick(target);
	await select(target);
	await preview(target);
	identity.set('token', 'renewed');
	await settle();
	expect(target.querySelector<HTMLInputElement>('.vega-import-origin input')!.checked).toBe(true);
	expect(target.querySelector('.vega-import-preview')).not.toBeNull();
	expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test('cambiar el puerto reinicia permiso y descarta la vista previa', async () => {
	const { target, ports } = mountDialog();
	await pick(target);
	await select(target);
	await preview(target);
	ports.set('current', { list, create, update });
	await settle();
	expect(target.querySelector('.vega-import-preview')).toBeNull();
	await pick(target);
	expect(target.querySelector<HTMLInputElement>('.vega-import-origin input')!.checked).toBe(false);
});
