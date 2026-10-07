/**
 * La revisión antes de publicar (lote 13) por el sitio donde se enchufa en el editor visual:
 * `VisualEditorScreen` montado sobre el adaptador `memory` con el sembrado REAL del sitio
 * (`review-world.fixture.ts`), en ventana estrecha (sin lienzo ni token: la cabecera con
 * `VisualPublishControl` se pinta igual). Lo que el test del popover con un `ReviewState` de
 * mentira (`VisualPublishControl.svelte.test.ts`) no puede medir:
 *   - que la pantalla NO le pasa a la revisión `[]` como bloques mientras la lista carga o si su
 *     carga falló (el popover publicaría sin preguntar);
 *   - que la petición de foco de «Abrir Descripción en el formulario» solo se deja si la
 *     navegación se HACE (`beforeNavigate` + `onNavigate`, aquí con su registro capturado);
 *   - adónde vuelve el foco al cerrar la ficha de Medios de «Describir la imagen…».
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import type { BeforeNavigate, OnNavigate } from '@sveltejs/kit';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import VisualEditorScreen from './VisualEditorScreen.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort } from '$lib/backend/port';
import type { VegaRecord } from '$lib/backend/types';
import { takeFieldFocus } from '$lib/form/focus-request';
import { recordRoute } from '$lib/nav/routes';
import { t as translate } from '$lib/i18n';
import {
	createBlock,
	createMedia,
	createPage,
	seededWorld,
	type ReviewWorld
} from '$lib/publish-review/review-world.fixture';

/** Los callbacks de navegación que registra la pantalla, para simular una navegación entera
 *  (cancelada o no) sin el router de SvelteKit. Se dan de alta y de baja con el montaje, como
 *  los de verdad. */
const navigation = vi.hoisted(() => ({
	before: new Set<(navigation: BeforeNavigate) => void>(),
	on: new Set<(navigation: OnNavigate) => void>()
}));
vi.mock('$app/navigation', async () => {
	const { onMount } = await import('svelte');
	return {
		beforeNavigate: (callback: (navigation: BeforeNavigate) => void) =>
			onMount(() => {
				navigation.before.add(callback);
				return () => navigation.before.delete(callback);
			}),
		onNavigate: (callback: (navigation: OnNavigate) => void) =>
			onMount(() => {
				navigation.on.add(callback);
				return () => navigation.on.delete(callback);
			})
	};
});

/**
 * La revisión y la lista de bloques leen los bloques con la MISMA consulta por el mismo puerto: la
 * carga de la revisión puede ir por otro (`reviewLoad.port`) para medir «la revisión ya cargó y la
 * lista no». Sin él, pasa tal cual.
 */
const reviewLoad = vi.hoisted(() => ({ port: null as null | Pick<BackendPort, 'list'> }));
vi.mock('$lib/publish-review/load-review-data', async (importOriginal) => {
	const real = await importOriginal<typeof import('$lib/publish-review/load-review-data')>();
	const loadReviewData: typeof real.loadReviewData = (port, model, type, record) =>
		real.loadReviewData(reviewLoad.port ?? port, model, type, record);
	return { ...real, loadReviewData };
});

/**
 * Una navegación como la de SvelteKit: todos los `beforeNavigate` y, si nadie la canceló, todos los
 * `onNavigate`. Devuelve si se hizo.
 */
function navigate(pathname: string): boolean {
	let cancelled = false;
	const url = new URL(pathname, 'http://localhost');
	const base = {
		from: null,
		to: { url, params: null, route: { id: null }, scroll: null },
		type: 'goto' as const,
		willUnload: false,
		delta: undefined,
		complete: Promise.resolve()
	};
	const before = {
		...base,
		cancel: () => {
			cancelled = true;
		}
	} as unknown as BeforeNavigate;
	for (const callback of navigation.before) callback(before);
	if (cancelled) return false;
	for (const callback of navigation.on) callback(base as unknown as OnNavigate);
	return true;
}

let world: ReviewWorld;
beforeAll(async () => {
	world = await seededWorld();
});

/** Ventana estrecha: ni lienzo ni token, la cabecera (y el control de publicar) igual. */
function stubNarrowWindow(): void {
	vi.stubGlobal('matchMedia', (query: string) => ({
		media: query,
		matches: true,
		addEventListener: () => {},
		removeEventListener: () => {}
	}));
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe(): void {}
			unobserve(): void {}
			disconnect(): void {}
		}
	);
}

interface Mounted {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	ctx: VegaAppContext;
	update: ReturnType<typeof vi.spyOn>;
}

let mounted: Mounted | null = null;

beforeEach(() => {
	stubNarrowWindow();
	Element.prototype.scrollIntoView = vi.fn();
	// Vacía cualquier petición de foco que haya dejado otro test.
	takeFieldFocus('', '');
});

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	reviewLoad.port = null;
	takeFieldFocus('', '');
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/** El puerto del sembrado con `list` desviado para UNA colección (colgarse, fallar). */
function portWithList(
	collection: string,
	list: () => ReturnType<BackendPort['list']>
): BackendPort {
	return new Proxy(world.port, {
		get(target, prop) {
			if (prop === 'list') {
				return (name: string, query?: Parameters<BackendPort['list']>[1]) =>
					name === collection ? list() : target.list(name, query);
			}
			const value = Reflect.get(target, prop, target) as unknown;
			return typeof value === 'function' ? value.bind(target) : value;
		}
	});
}

function mountScreen(record: VegaRecord, port: BackendPort = world.port): Mounted {
	const ctx = {
		port,
		model: world.model,
		session: { token: 't', user: { id: 'u', email: 'admin@vega.test' }, expiresAt: null },
		locale: 'es',
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		nav: { toRecord: vi.fn(), toSettings: vi.fn() },
		feedback: { toast: vi.fn(), reportError: vi.fn() },
		registerExitGuard: () => () => {}
	} as unknown as VegaAppContext;
	const update = vi.spyOn(port, 'update');
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(VisualEditorScreen, {
		target,
		props: { type: world.pagesType, record },
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance, ctx, update };
	return mounted;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Deja que carguen bloques, páginas, redirecciones y medios, y que se pinte. */
async function settle(): Promise<void> {
	for (let i = 0; i < 6; i += 1) {
		await wait(20);
		flushSync();
		await tick();
	}
}

const statusButton = (m: Mounted) =>
	m.target.querySelector<HTMLButtonElement>('.vega-visual-publish-btn[data-status-target]');
const pop = (m: Mounted) => m.target.querySelector<HTMLElement>('[role="alertdialog"]');
const popTitle = (m: Mounted) =>
	pop(m)?.querySelector('.vega-visual-publish-pop-title')?.textContent?.trim() ?? null;
const popButton = (m: Mounted, label: string) =>
	[...(pop(m)?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
		(b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label
	) ?? null;

/** Un borrador SIN avisos de SEO (descripción e imagen para redes puestas) cuyo único aviso está
 *  en un bloque: el enlace del `hero` lleva a una ruta que no existe. */
async function pageWithOnlyBlockWarning(): Promise<VegaRecord> {
	const social = await createMedia(world, 'portada.jpg', 'Portada del taller');
	const page = await createPage(world, {
		title: 'Talleres de otoño',
		path: `/talleres-${Math.random().toString(36).slice(2, 8)}`,
		status: 'draft',
		description: 'Cuatro talleres de costura para este otoño.',
		socialImage: social.id
	});
	await createBlock(world, page.id, 0, 'hero', {
		title: 'Hola',
		actionLabel: 'Reservar',
		actionHref: '/no-existe'
	});
	return page;
}

describe('VisualEditorScreen — la revisión cuando los bloques todavía no se saben', () => {
	test('con la lista de bloques todavía cargando, «Marcar como publicada» pregunta por el aviso del bloque', async () => {
		const page = await pageWithOnlyBlockWarning();
		reviewLoad.port = world.port;
		const m = mountScreen(
			page,
			portWithList('blocks', () => new Promise(() => {}))
		);
		await settle();

		statusButton(m)!.click();
		await settle();
		expect(popTitle(m)).toBe('Antes de publicar: 1 aviso');
		expect(m.update).not.toHaveBeenCalled();
	});

	test('con la lista de bloques fallida, el aviso del bloque no desaparece y también pregunta', async () => {
		const page = await pageWithOnlyBlockWarning();
		reviewLoad.port = world.port;
		const m = mountScreen(
			page,
			portWithList('blocks', () => Promise.reject(new Error('red caída')))
		);
		await settle();

		statusButton(m)!.click();
		await settle();
		expect(popTitle(m)).toBe('Antes de publicar: 1 aviso');
		expect(m.update).not.toHaveBeenCalled();
	});
});

describe('VisualEditorScreen — «Abrir Descripción en el formulario»', () => {
	/** Un borrador con la descripción vacía (aviso de SEO de un campo del registro). */
	async function pageWithEmptyDescription(): Promise<VegaRecord> {
		return createPage(world, {
			title: 'Sin descripción',
			path: `/sin-descripcion-${Math.random().toString(36).slice(2, 8)}`,
			status: 'draft',
			description: ''
		});
	}

	async function openDescriptionInForm(m: Mounted): Promise<void> {
		statusButton(m)!.click();
		await settle();
		popButton(m, 'Abrir Descripción en el formulario')!.click();
		await settle();
	}

	test('si la navegación se hace, el formulario de ESTA página recibe el campo', async () => {
		const page = await pageWithEmptyDescription();
		const m = mountScreen(page);
		await settle();

		await openDescriptionInForm(m);
		expect(m.ctx.nav.toRecord).toHaveBeenCalledWith('pages', page.id);
		expect(navigate(recordRoute('pages', page.id))).toBe(true);
		expect(takeFieldFocus('pages', page.id)).toBe('description');
	});

	test('si la salvaguarda cancela la navegación, la petición se pierde: una visita posterior NO enfoca el campo', async () => {
		const page = await pageWithEmptyDescription();
		await createBlock(world, page.id, 0, 'hero', { title: 'Hola' });
		const m = mountScreen(page);
		await settle();

		// Un bloque con cambios sin guardar: salir pregunta, y se responde «no».
		const title = m.target.querySelector<HTMLInputElement>(
			'.vega-inspector-body--texts [data-field="title"] input'
		)!;
		title.value = 'Hola de nuevo';
		title.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		const confirm = vi.fn(() => false);
		vi.stubGlobal('confirm', confirm);

		await openDescriptionInForm(m);
		expect(navigate(recordRoute('pages', page.id))).toBe(false);
		expect(confirm).toHaveBeenCalledTimes(1);

		// Más tarde se llega al formulario de la misma página por otro camino (ahora sí se sale).
		confirm.mockReturnValue(true);
		expect(navigate(recordRoute('pages', page.id))).toBe(true);
		expect(takeFieldFocus('pages', page.id)).toBeNull();
	});
});

describe('VisualEditorScreen — «Describir la imagen…»', () => {
	test('al cerrar la ficha de Medios, el foco vuelve al botón de estado (el popover ya no existe)', async () => {
		const media = await createMedia(world, 'chaqueta_lino.jpg', '');
		const social = await createMedia(world, 'portada.jpg', 'Portada');
		const page = await createPage(world, {
			title: 'Galería',
			path: `/galeria-${Math.random().toString(36).slice(2, 8)}`,
			status: 'draft',
			description: 'Una página con una imagen sin texto alternativo.',
			socialImage: social.id
		});
		await createBlock(world, page.id, 0, 'hero', { title: 'Hola' }, { image: media.id });
		const m = mountScreen(page);
		await settle();

		statusButton(m)!.click();
		await settle();
		popButton(m, 'Describir la imagen…')!.click();
		await settle();
		const dialog = await vi.waitFor(
			() => {
				flushSync();
				const detail = m.target.querySelector<HTMLElement>('.vega-media-detail-dialog');
				expect(detail).not.toBeNull();
				return detail!;
			},
			{ timeout: 5000 }
		);
		expect(pop(m)).toBeNull();

		dialog.querySelector<HTMLButtonElement>('.vega-media-detail-close')!.click();
		await settle();
		expect(m.target.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(statusButton(m));
	});
});
