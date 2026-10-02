/**
 * Integración de «Redirección al cambiar la ruta» (lote 2 del audit del 30 sep): `RecordForm`
 * montado sobre el adaptador `memory` real, con una colección `pages` (modelo de páginas) y una
 * `redirects` con `from` único. Se cambia la ruta, se guarda y se mide QUÉ redirecciones quedan
 * en el servidor, no lo que el banner dice (eso lo cubre `RedirectOffer.svelte.test.ts`).
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import RecordForm from './RecordForm.svelte';
import { buildFormModel } from './form-model';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import type { MemoryBackendPort } from '$lib/backend/adapters/memory';
import type { ContentType, Field, VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';

vi.mock('$app/navigation', () => ({ beforeNavigate: () => {} }));

const base = {
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
} as const;
const text = (name: string, over: Partial<Field> = {}) =>
	({ ...base, name, type: 'text', subtype: 'plain', ...over }) as Field;

const pagesType: ContentType = {
	name: 'pages',
	readonly: false,
	fields: [
		text('title', { required: true, presentable: true }),
		text('path', { required: true, unique: true }),
		{
			...base,
			name: 'status',
			type: 'select',
			options: ['draft', 'published'],
			multiple: false
		} as Field
	]
};

const redirectsType = (access?: ContentType['access']): ContentType => ({
	name: 'redirects',
	readonly: false,
	...(access ? { access } : {}),
	fields: [
		text('from', { required: true, unique: true }),
		text('to', { required: true }),
		{ ...base, name: 'code', type: 'select', options: ['301', '308'], multiple: false } as Field
	]
});

const MANIFEST = {
	collections: { pages: { statusField: 'status', page: { pathField: 'path' } } }
};

const OLD = '/sobre-nosotros';
const NEW = '/quienes-somos';

interface World {
	port: MemoryBackendPort;
	toast: ReturnType<typeof vi.fn>;
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	saved: ReturnType<typeof vi.fn>;
}

async function setup(opts: {
	status?: string;
	redirects?: { id: string; from: string; to: string }[];
	redirectsType?: ContentType | null;
	pagePath?: string;
}): Promise<World> {
	const types = [pagesType];
	if (opts.redirectsType !== null) types.push(opts.redirectsType ?? redirectsType());
	const port = createMemoryBackend({
		users: [{ email: 'a@b.c', password: 'pw' }],
		contentTypes: types,
		records: {
			pages: [
				{
					id: 'p1',
					values: {
						title: 'Quiénes somos',
						path: opts.pagePath ?? OLD,
						status: opts.status ?? 'published'
					}
				}
			],
			...(opts.redirectsType === null
				? {}
				: {
						redirects: (opts.redirects ?? []).map((r) => ({
							id: r.id,
							values: { from: r.from, to: r.to, code: '301' }
						}))
					})
		}
	});
	await port.login({ email: 'a@b.c', password: 'pw' });
	const model = resolveContentModel({ types, manifestRaw: MANIFEST });
	const type = model.types.find((t) => t.name === 'pages')!;
	const record: VegaRecord = {
		id: 'p1',
		type: 'pages',
		values: {
			title: 'Quiénes somos',
			path: opts.pagePath ?? OLD,
			status: opts.status ?? 'published'
		}
	};
	const toast = vi.fn();
	const saved = vi.fn();
	const ctx = {
		port,
		model,
		session: { token: 't', user: { id: 'u', email: 'a@b.c' } },
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es',
		nav: {},
		feedback: { toast, reportError: vi.fn() },
		registerExitGuard: () => () => {},
		reloadModel: async () => {}
	} as unknown as VegaAppContext;
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(RecordForm, {
		target,
		props: {
			type,
			model: buildFormModel(type, record),
			typeReadonly: false,
			onSubmit: (input: Record<string, unknown>, o?: { expectedVersion?: string }) =>
				port.update('pages', 'p1', input as never, o as never),
			onSaved: saved,
			onCancel: () => {}
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { port, toast, target, instance, saved };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function settle(): Promise<void> {
	await wait(350); // el respiro de lectura (250 ms) + la lectura al puerto
	flushSync();
	await tick();
}

async function typePath(w: World, value: string): Promise<void> {
	const input = w.target.querySelector<HTMLInputElement>('[data-field="path"] input')!;
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
	await settle();
}

async function save(w: World): Promise<void> {
	w.target.querySelector<HTMLFormElement>('form')!.requestSubmit();
	await wait(50);
	flushSync();
	await tick();
	await wait(50);
	flushSync();
}

async function redirectsNow(w: World): Promise<{ from: string; to: string }[]> {
	const page = await w.port.list('redirects', { perPage: 200 });
	return page.items
		.map((r) => ({ from: String(r.values.from), to: String(r.values.to) }))
		.sort((a, b) => a.from.localeCompare(b.from));
}

describe('RecordForm: redirección al cambiar la ruta (adaptador memory)', () => {
	let world: World | null = null;

	afterEach(async () => {
		if (world) {
			await unmount(world.instance);
			world.target.remove();
			world = null;
		}
	});

	test('oferta marcada: tras guardar queda vieja → nueva con 301 y el toast lo dice', async () => {
		world = await setup({});
		await typePath(world, NEW);
		expect(world.target.querySelector('[data-redirect-state="offer"]')).not.toBeNull();
		await save(world);
		const page = await world.port.list('redirects', {});
		expect(page.items.map((r) => r.values)).toMatchObject([{ from: OLD, to: NEW, code: '301' }]);
		expect(world.saved).toHaveBeenCalledTimes(1);
		expect(world.saved.mock.calls[0][1]).toBe(`Redirección creada de ${OLD} a ${NEW}.`);
		// la ruta guardada es la nueva y el banner se va
		expect((await world.port.get('pages', 'p1')).values.path).toBe(NEW);
		expect(world.target.querySelector('.vega-redirect')).toBeNull();
	});

	test('casilla desmarcada: se guarda la página y no se crea nada', async () => {
		world = await setup({});
		await typePath(world, NEW);
		world.target.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
		flushSync();
		await save(world);
		expect(await redirectsNow(world)).toEqual([]);
		expect((await world.port.get('pages', 'p1')).values.path).toBe(NEW);
		expect(world.saved.mock.calls[0][1]).toBeUndefined();
	});

	test('cadena: las que llevaban a la vieja pasan a llevar a la nueva', async () => {
		world = await setup({
			redirects: [
				{ id: 'r1', from: '/nosotros', to: OLD },
				{ id: 'r2', from: '/about', to: OLD },
				{ id: 'r3', from: '/x', to: '/y' }
			]
		});
		await typePath(world, NEW);
		expect(world.target.querySelector('[data-redirect-state="chain"]')).not.toBeNull();
		await save(world);
		expect(await redirectsNow(world)).toEqual([
			{ from: '/about', to: NEW },
			{ from: '/nosotros', to: NEW },
			{ from: OLD, to: NEW },
			{ from: '/x', to: '/y' }
		]);
	});

	test('conflicto, «cambiarla» (por defecto): la existente pasa a llevar a la nueva', async () => {
		world = await setup({ redirects: [{ id: 'r9', from: OLD, to: '/empresa' }] });
		await typePath(world, NEW);
		expect(world.target.querySelector('[data-redirect-state="conflict"]')).not.toBeNull();
		await save(world);
		expect(await redirectsNow(world)).toEqual([{ from: OLD, to: NEW }]);
		expect(world.saved.mock.calls[0][1]).toBe(
			`Redirección de ${OLD} cambiada para llevar a ${NEW}.`
		);
	});

	test('conflicto, «dejarla como está»: la existente no se toca', async () => {
		world = await setup({ redirects: [{ id: 'r9', from: OLD, to: '/empresa' }] });
		await typePath(world, NEW);
		world.target.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click();
		flushSync();
		await save(world);
		expect(await redirectsNow(world)).toEqual([{ from: OLD, to: '/empresa' }]);
		expect((await world.port.get('pages', 'p1')).values.path).toBe(NEW);
	});

	test('bucle: volver a una ruta anterior borra la redirección que apuntaba a la vieja', async () => {
		// la página estuvo en /quienes-somos, pasó a /sobre-nosotros y dejó /quienes-somos → /sobre-nosotros
		world = await setup({ redirects: [{ id: 'r7', from: NEW, to: OLD }] });
		await typePath(world, NEW);
		expect(world.target.querySelector('[data-redirect-removal]')).not.toBeNull();
		await save(world);
		const left = await redirectsNow(world);
		expect(left).toEqual([{ from: OLD, to: NEW }]);
		expect(left.some((r) => r.from === NEW)).toBe(false);
	});

	test('bucle con la oferta desmarcada: también se borra', async () => {
		world = await setup({ redirects: [{ id: 'r7', from: NEW, to: OLD }] });
		await typePath(world, NEW);
		world.target.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
		flushSync();
		await save(world);
		expect(await redirectsNow(world)).toEqual([]);
	});

	test('página no publicada: no se ofrece ni se escribe nada', async () => {
		world = await setup({ status: 'draft' });
		await typePath(world, NEW);
		expect(world.target.querySelector('.vega-redirect')).toBeNull();
		await save(world);
		expect(await redirectsNow(world)).toEqual([]);
		expect((await world.port.get('pages', 'p1')).values.path).toBe(NEW);
	});

	test('sin colección redirects: no se ofrece nada y no hay error', async () => {
		world = await setup({ redirectsType: null });
		await typePath(world, NEW);
		expect(world.target.querySelector('.vega-redirect')).toBeNull();
		await save(world);
		expect((await world.port.get('pages', 'p1')).values.path).toBe(NEW);
		expect(world.target.querySelector('[role="alert"]')).toBeNull();
	});

	test('sin permiso para crear en redirects: no se ofrece nada', async () => {
		world = await setup({
			redirectsType: redirectsType({
				list: 'allowed',
				view: 'allowed',
				create: 'denied',
				update: 'allowed',
				delete: 'allowed'
			})
		});
		await typePath(world, NEW);
		expect(world.target.querySelector('.vega-redirect')).toBeNull();
	});

	test('la ruta sin cambiar no ofrece nada', async () => {
		world = await setup({});
		await typePath(world, OLD);
		expect(world.target.querySelector('.vega-redirect')).toBeNull();
	});

	test('volver a la ruta guardada retira la oferta', async () => {
		world = await setup({});
		await typePath(world, NEW);
		expect(world.target.querySelector('.vega-redirect')).not.toBeNull();
		await typePath(world, OLD);
		expect(world.target.querySelector('.vega-redirect')).toBeNull();
	});

	test('si la redirección falla, la página queda guardada y el banner reintenta', async () => {
		world = await setup({});
		await typePath(world, NEW);
		const create = world.port.create.bind(world.port);
		let failures = 1;
		world.port.create = async (type, data, o) => {
			if (type === 'redirects' && failures-- > 0)
				throw VegaError.backend('Failed to create record.');
			return create(type, data, o);
		};
		await save(world);
		// la página se guardó; la redirección no
		expect((await world.port.get('pages', 'p1')).values.path).toBe(NEW);
		expect(await redirectsNow(world)).toEqual([]);
		const alert = world.target.querySelector('[data-redirect-state="failed"]')!;
		expect(alert.getAttribute('role')).toBe('alert');
		expect(alert.textContent).toContain('Failed to create record.');
		expect(world.toast).not.toHaveBeenCalled();

		[...alert.querySelectorAll('button')]
			.find((b) => b.textContent?.trim() === 'Reintentar')!
			.click();
		await wait(100);
		flushSync();
		expect(await redirectsNow(world)).toEqual([{ from: OLD, to: NEW }]);
		expect(world.target.querySelector('[data-redirect-state="failed"]')).toBeNull();
		expect(world.toast).toHaveBeenCalledWith(`Redirección creada de ${OLD} a ${NEW}.`, {
			kind: 'success'
		});
	});

	test('si la redirección falla con un 5xx, el banner pinta el texto del catálogo y no el crudo', async () => {
		world = await setup({});
		await typePath(world, NEW);
		world.port.create = async (type) => {
			if (type === 'redirects')
				throw VegaError.backend('Something went wrong.', undefined, 'server-error');
			throw new Error('inesperado');
		};
		await save(world);
		const alert = world.target.querySelector('[data-redirect-state="failed"]')!;
		expect(alert.textContent).toContain(translate('es', 'errors.backendCode.serverError'));
		expect(alert.textContent).not.toContain('Something went wrong.');
	});

	test('nunca actúa sobre lo que no se enseñó: guardar antes de que cargue no escribe redirecciones', async () => {
		world = await setup({});
		const input = world.target.querySelector<HTMLInputElement>('[data-field="path"] input')!;
		input.value = NEW;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		await save(world); // sin esperar el respiro de lectura: el banner aún no estaba
		expect(await redirectsNow(world)).toEqual([]);
	});
});
