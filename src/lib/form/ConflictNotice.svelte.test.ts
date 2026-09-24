/**
 * Suite de componente de `ConflictNotice.svelte` (lámina del audit p1): los cuatro estados, el
 * reparto de responsabilidades con el anfitrión (`onForce`/`onDiscard`) y la línea de autor. El
 * puerto es un doble con solo `list` (lo único que el aviso lee, para el autor).
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import ConflictNotice from './ConflictNotice.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ContentType, VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import { recordVersion } from '$lib/backend/version';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';
import type { ConflictRow } from './conflict';

const pagesType: ContentType = {
	name: 'pages',
	readonly: false,
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		},
		{
			name: 'summary',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

const model = resolveContentModel({ types: [pagesType], manifestRaw: null });
const fields = model.types.find((t) => t.name === 'pages')!.fields;

const OPENED = { title: 'Sobre mí', summary: 'Diseño web' };
const OPENED_VERSION = recordVersion({ values: OPENED });

const ROWS: ConflictRow[] = [
	{ field: 'title', scope: 'server', before: 'Sobre mí', after: 'Sobre mí y este cuaderno' },
	{ field: 'summary', scope: 'both', before: 'Escribo sobre PocketBase', after: 'Tomates' }
];

const t = (key: string, params?: Record<string, string | number>) => translate('es', key, params);

function fakeCtx(list: ReturnType<typeof vi.fn>): VegaAppContext {
	return {
		port: { list },
		t,
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
}

const noRevisions = () =>
	vi.fn(async () => {
		throw VegaError.notFound();
	});

interface MountOptions {
	list?: ReturnType<typeof vi.fn>;
	onForce?: () => Promise<void>;
	onDiscard?: () => Promise<void>;
	fallbackAt?: Date | null;
	variant?: 'page' | 'narrow';
}

async function settle(): Promise<void> {
	await tick();
	await Promise.resolve();
	await Promise.resolve();
	await tick();
}

function mountNotice(opts: MountOptions = {}) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const props = $state({
		name: 'Sobre mí',
		variant: opts.variant ?? ('page' as const),
		fields,
		rows: ROWS,
		collection: 'pages',
		recordId: 'p1',
		openedVersion: OPENED_VERSION,
		serverVersion: 'v-servidor-1',
		fallbackAt: opts.fallbackAt ?? null,
		onForce: opts.onForce ?? vi.fn(async () => {}),
		onDiscard: opts.onDiscard ?? vi.fn(async () => {})
	});
	const instance = mount(ConflictNotice, {
		target,
		props,
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx(opts.list ?? noRevisions())]])
	});
	return { target, instance, props };
}

function button(target: HTMLElement, name: string): HTMLButtonElement {
	const found = [...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
	if (!found) throw new Error(`no hay botón «${name}»`);
	return found;
}

describe('ConflictNotice.svelte', () => {
	let mounted: ReturnType<typeof mountNotice> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('estado 1: aviso en línea con título, foco en el título y las tres acciones en orden', async () => {
		mounted = mountNotice();
		await settle();

		const alert = mounted.target.querySelector('[role="alert"]')!;
		const title = mounted.target.querySelector<HTMLElement>('.vega-conflict-title')!;
		expect(title.textContent).toContain(t('editor.conflict.title', { name: 'Sobre mí' }));
		expect(document.activeElement).toBe(title);
		expect(alert.textContent).toContain(t('editor.conflict.nothingSaved'));
		expect(
			[...mounted.target.querySelectorAll('.vega-conflict-actions button')].map((b) =>
				b.textContent?.trim()
			)
		).toEqual([
			t('editor.conflict.showDiff'),
			t('editor.conflict.discard'),
			t('editor.conflict.force')
		]);
	});

	test('sin historial ni `updated`: «Se guardó otra versión…» sin hora; con `updated`, con hora', async () => {
		mounted = mountNotice();
		await settle();
		expect(mounted.target.querySelector('.vega-conflict-who')?.textContent).toBe(
			t('editor.conflict.unknown')
		);
		await unmount(mounted.instance);
		mounted.target.remove();

		const at = new Date('2026-09-24T12:41:00');
		mounted = mountNotice({ fallbackAt: at });
		await settle();
		const time = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(at);
		expect(mounted.target.querySelector('.vega-conflict-who')?.textContent).toBe(
			t('editor.conflict.atTime', { time })
		);
	});

	test('con una revisión que encadena con la versión abierta: «Lo guardó X a las HH:MM»', async () => {
		const created = '2026-09-24T10:41:00.000Z';
		const list = vi.fn(async () => ({
			items: [
				{
					id: 'r1',
					type: 'vega_revisions',
					values: {
						collection: 'pages',
						recordId: 'p1',
						kind: 'update',
						values: OPENED,
						label: 'Sobre mí',
						author: 'ana.ruiz@fodaveg.net',
						created
					}
				} as unknown as VegaRecord
			],
			page: 1,
			perPage: 10,
			totalItems: 1,
			totalPages: 1
		}));
		mounted = mountNotice({ list });
		await settle();

		const time = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(
			new Date(created)
		);
		expect(mounted.target.querySelector('.vega-conflict-who')?.textContent).toBe(
			t('editor.conflict.byAuthor', { author: 'ana.ruiz@fodaveg.net', time })
		);
	});

	test('estado 2: «Ver diferencias» abre las filas con su etiqueta de alcance', async () => {
		mounted = mountNotice();
		await settle();

		const show = button(mounted.target, t('editor.conflict.showDiff'));
		expect(show.getAttribute('aria-expanded')).toBe('false');
		show.click();
		flushSync();

		const rows = [...mounted.target.querySelectorAll<HTMLElement>('.vega-revision-diff-row')];
		expect(rows.map((r) => r.dataset.conflictScope)).toEqual(['server', 'both']);
		expect(rows[0].textContent).toContain(t('editor.conflict.scope.server'));
		expect(rows[0].querySelector('.vega-revision-diff-after')?.textContent).toBe(
			'Sobre mí y este cuaderno'
		);
		expect(rows[1].textContent).toContain(t('editor.conflict.scope.both'));
		expect(mounted.target.textContent).toContain(t('editor.conflict.diffHead'));

		const hide = button(mounted.target, t('editor.conflict.hideDiff'));
		expect(hide.getAttribute('aria-expanded')).toBe('true');
		hide.click();
		flushSync();
		expect(mounted.target.querySelectorAll('.vega-revision-diff-row')).toHaveLength(0);
	});

	test('estado 3: guardando — el botón en curso con aria-disabled, el resto deshabilitado', async () => {
		let release!: () => void;
		const onForce = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		mounted = mountNotice({ onForce });
		await settle();

		button(mounted.target, t('editor.conflict.force')).click();
		flushSync();

		expect(onForce).toHaveBeenCalledTimes(1);
		const saving = button(mounted.target, t('editor.saving'));
		expect(saving.getAttribute('aria-disabled')).toBe('true');
		expect(saving.disabled).toBe(false); // el foco no se pierde
		expect(button(mounted.target, t('editor.conflict.showDiff')).disabled).toBe(true);
		expect(button(mounted.target, t('editor.conflict.discard')).disabled).toBe(true);
		expect(mounted.target.querySelector('[role="alert"]')?.getAttribute('aria-busy')).toBe('true');

		// Un segundo clic mientras tanto no dispara otro guardado.
		saving.click();
		expect(onForce).toHaveBeenCalledTimes(1);
		release();
		await settle();
	});

	test('estado 4: si «Guardar igualmente» falla por otra causa, pasa a error con reintento', async () => {
		const onForce = vi
			.fn<() => Promise<void>>()
			.mockRejectedValueOnce(VegaError.network(undefined, 'Sin conexión con el servidor.'))
			.mockResolvedValueOnce(undefined);
		mounted = mountNotice({ onForce });
		await settle();

		button(mounted.target, t('editor.conflict.force')).click();
		await settle();

		const alert = mounted.target.querySelector<HTMLElement>('[role="alert"]')!;
		expect(alert.classList.contains('vega-conflict--danger')).toBe(true);
		expect(alert.textContent).toContain(t('editor.conflict.error.title'));
		expect(alert.textContent).toContain(
			t('editor.conflict.error.body', { message: 'Sin conexión con el servidor.' })
		);

		button(mounted.target, t('common.retry')).click();
		await settle();
		expect(onForce).toHaveBeenCalledTimes(2);
		expect(alert.dataset.conflictPhase).toBe('idle');
	});

	test('un conflicto NUEVO (otro `serverVersion`) devuelve el aviso al estado 1', async () => {
		const onForce = vi.fn(async () => {
			throw VegaError.network();
		});
		mounted = mountNotice({ onForce });
		await settle();
		button(mounted.target, t('editor.conflict.force')).click();
		await settle();
		expect(mounted.target.querySelector<HTMLElement>('[role="alert"]')!.dataset.conflictPhase).toBe(
			'error'
		);

		mounted.props.serverVersion = 'v-servidor-2';
		await settle();
		expect(mounted.target.querySelector<HTMLElement>('[role="alert"]')!.dataset.conflictPhase).toBe(
			'idle'
		);
	});

	test('«Descartar mis cambios y recargar» delega en el anfitrión', async () => {
		const onDiscard = vi.fn(async () => {});
		mounted = mountNotice({ onDiscard });
		await settle();

		button(mounted.target, t('editor.conflict.discard')).click();
		await settle();
		expect(onDiscard).toHaveBeenCalledTimes(1);
	});

	test('variante estrecha: título corto, rótulo corto de descartar y sin la línea de "nada guardado"', async () => {
		mounted = mountNotice({ variant: 'narrow' });
		await settle();

		expect(mounted.target.querySelector('.vega-conflict-title')?.textContent).toContain(
			t('editor.conflict.titleNarrow', { name: 'Sobre mí' })
		);
		expect(button(mounted.target, t('editor.conflict.discardNarrow'))).toBeTruthy();
		expect(mounted.target.textContent).not.toContain(t('editor.conflict.nothingSaved'));
	});
});
