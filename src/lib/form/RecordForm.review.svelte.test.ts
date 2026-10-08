/**
 * La revisión antes de publicar (lote 13) por el sitio donde se enchufa: `RecordForm` montado
 * sobre el adaptador `memory` con el sembrado REAL del sitio (`seedSiteProject`, vía
 * `review-world.fixture.ts`: `pages` con SEO y bloques heterogéneos, `redirects`, `vega_media`).
 * Se mide lo que la tarjeta de componente (`ReviewCard.svelte.test.ts`) no puede: que la tarjeta
 * es la primera del aside, que se recalcula en vivo mientras se escribe, adónde va el FOCO con
 * cada acción (campo del registro, campo de un bloque plegado), que «Describir la imagen…» abre la
 * ficha de Medios de verdad y que guardar el alt quita el aviso sin releer, y la línea bajo Estado.
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import RecordForm from './RecordForm.svelte';
import { buildFormModel } from './form-model';
import { fieldIds } from './field-ids';
import { requestFieldFocus } from './focus-request';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { VegaRecord } from '$lib/backend/types';
import type { BackendPort } from '$lib/backend/port';
import type { ResolvedContentType } from '$lib/model/types';
import { t as translate } from '$lib/i18n';
import {
	createBlock,
	createMedia,
	createPage,
	seededWorld,
	type ReviewWorld
} from '$lib/publish-review/review-world.fixture';

vi.mock('$app/navigation', () => ({ beforeNavigate: () => {} }));

// El diálogo de Medios llega después del shell lazy: la prueba de foco debe esperar la ficha
// real aunque el import tarde más que los ciclos de `settle()`.
vi.mock('$lib/publish-review/ReviewMediaDialog.svelte', async (importOriginal) => {
	await new Promise((resolve) => setTimeout(resolve, 250));
	return importOriginal();
});

/**
 * La revisión y `RecordBlocks` leen los bloques con la MISMA consulta por el mismo `ctx.port`, así
 * que un puerto que retrasa o rompe esa lectura las retrasa o rompe a las dos. Para medir «la
 * revisión ya cargó y la lista de bloques no», la carga de la revisión puede ir por otro puerto
 * (`reviewLoad.port`); sin él, pasa tal cual. `reviewLoad.calls` cuenta las cargas.
 */
const reviewLoad = vi.hoisted(() => ({
	port: null as null | Pick<BackendPort, 'list'>,
	calls: [] as string[]
}));
vi.mock('$lib/publish-review/load-review-data', async (importOriginal) => {
	const real = await importOriginal<typeof import('$lib/publish-review/load-review-data')>();
	const loadReviewData: typeof real.loadReviewData = (port, model, type, record) => {
		reviewLoad.calls.push(record.id);
		return real.loadReviewData(reviewLoad.port ?? port, model, type, record);
	};
	return { ...real, loadReviewData };
});

// jsdom no implementa `scrollIntoView`, que el foco en un campo sí usa.
Element.prototype.scrollIntoView = vi.fn();

let world: ReviewWorld;
beforeAll(async () => {
	world = await seededWorld();
});

interface Mounted {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	toast: ReturnType<typeof vi.fn>;
	reportError: ReturnType<typeof vi.fn>;
}

let mounted: Mounted | null = null;

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	reviewLoad.port = null;
	reviewLoad.calls = [];
});

/**
 * El puerto del sembrado con `list` desviado para UNA colección: `list` decide qué devuelve esa
 * lectura (colgarse, fallar); el resto pasa al puerto de verdad.
 */
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

function mountForm(
	type: ResolvedContentType,
	record: VegaRecord | null,
	port: BackendPort = world.port
): Mounted {
	const toast = vi.fn();
	const reportError = vi.fn();
	const ctx = {
		port,
		model: world.model,
		session: { token: 't', user: { id: 'u', email: 'admin@vega.test' } },
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es',
		nav: {},
		feedback: { toast, reportError },
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
			onSubmit: (input, opts) =>
				record
					? world.port.update(type.name, record.id, input, opts)
					: world.port.create(type.name, input),
			onSaved: () => {},
			onCancel: () => {}
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance, toast, reportError };
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

const card = (m: Mounted) => m.target.querySelector<HTMLElement>('[data-review-card]');
const summary = (m: Mounted) =>
	m.target.querySelector('.vega-review-count, .vega-review-checking')?.textContent?.trim() ?? '';
const reviewLine = (m: Mounted) => m.target.querySelector<HTMLElement>('[data-review-line]');
const buttonByLabel = (m: Mounted, label: string) =>
	[...m.target.querySelectorAll<HTMLButtonElement>('button')].find(
		(b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label
	) ?? null;

/** La ficha llega tras el import diferido y la lectura de `vega_media`; el shell de carga también
 * tiene `role="dialog"`, así que esperar solo ese rol confundiría ambos estados. */
async function mediaDetailDialog(m: Mounted): Promise<HTMLElement> {
	return vi.waitFor(
		() => {
			flushSync();
			const dialog = m.target.querySelector<HTMLElement>('.vega-media-detail-dialog');
			expect(dialog).not.toBeNull();
			return dialog!;
		},
		{ timeout: 5000 }
	);
}

/**
 * Una página del sembrado con avisos de los tres grupos: descripción vacía e imagen social
 * ausente (SEO), un bloque `hero` con un enlace a una ruta que no existe (enlaces) y una imagen de
 * la biblioteca sin alt (imágenes). Cada test crea la suya: el adaptador es compartido.
 */
async function pageWithWarnings(): Promise<{
	page: VegaRecord;
	hero: VegaRecord;
	media: VegaRecord;
}> {
	const page = await createPage(world, {
		title: 'Talleres de otoño',
		path: `/talleres-${Math.random().toString(36).slice(2, 8)}`,
		status: 'draft',
		description: ''
	});
	const media = await createMedia(world, 'chaqueta_lino.jpg', '');
	const hero = await createBlock(
		world,
		page.id,
		0,
		'hero',
		{ title: 'Hola', actionLabel: 'Reservar', actionHref: '/no-existe' },
		{ image: media.id }
	);
	return { page, hero, media };
}

describe('RecordForm — la tarjeta «Revisión» en el aside', () => {
	test('es la primera tarjeta del aside, cuenta los avisos de los tres grupos y la línea bajo Estado lleva a ella', async () => {
		const { page } = await pageWithWarnings();
		const m = mountForm(world.pagesType, page);
		await settle();

		const aside = m.target.querySelector('.vega-editor-aside')!;
		expect(aside.firstElementChild?.hasAttribute('data-review-card')).toBe(true);
		// descripción vacía + imagen social + enlace roto + imagen sin alt
		expect(summary(m)).toBe('4 avisos');
		const status = (group: string) =>
			m.target
				.querySelector(`[data-review-group="${group}"] .vega-review-status`)
				?.textContent?.trim();
		expect(status('seo')).toBe('2 avisos');
		expect(status('links')).toBe('1 aviso');
		expect(status('media')).toBe('1 aviso');

		// La línea bajo el campo Estado, por el hueco `below` de `FieldRow`.
		const line = reviewLine(m)!;
		expect(line.closest('[data-field="status"]')).not.toBeNull();
		expect(line.textContent).toContain('La revisión tiene 4 avisos.');
		const open = line.querySelector<HTMLButtonElement>('button')!;
		expect(open.textContent?.trim()).toBe('Ver la revisión');
		open.click();
		expect(document.activeElement).toBe(card(m));
	});

	test('se recalcula en vivo con lo que hay en pantalla: escribir la descripción quita su aviso', async () => {
		const { page } = await pageWithWarnings();
		const m = mountForm(world.pagesType, page);
		await settle();
		expect(summary(m)).toBe('4 avisos');

		const description = m.target.querySelector<HTMLTextAreaElement | HTMLInputElement>(
			`#${fieldIds('description').inputId}`
		)!;
		description.value = 'Cuatro talleres de costura para este otoño.';
		description.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		await tick();

		expect(summary(m)).toBe('3 avisos');
		expect(reviewLine(m)?.textContent).toContain('La revisión tiene 3 avisos.');
		expect(
			m.target.querySelector('[data-review-group="seo"] .vega-review-status')?.textContent?.trim()
		).toBe('1 aviso');
	});

	test('«Descripción ›» pone el foco en el campo del registro', async () => {
		const { page } = await pageWithWarnings();
		const m = mountForm(world.pagesType, page);
		await settle();
		buttonByLabel(m, 'Ir al campo Descripción')!.click();
		await tick();
		await tick();
		expect(document.activeElement?.id).toBe(fieldIds('description').inputId);
	});

	test('«Bloque 1 · Hero › Enlace ›» despliega el bloque plegado y pone el foco en su campo', async () => {
		const { page, hero } = await pageWithWarnings();
		const m = mountForm(world.pagesType, page);
		await settle();

		const body = m.target.querySelector<HTMLElement>(`#vega-block-body-${hero.id}`)!;
		expect(body.hidden).toBe(true);
		const go = buttonByLabel(m, 'Bloque 1 · Hero › Enlace: ir al campo')!;
		expect(go.textContent?.trim()).toBe('Bloque 1 · Hero › Enlace');
		go.click();
		flushSync();
		await tick();
		await tick();

		expect(body.hidden).toBe(false);
		expect(
			m.target
				.querySelector(`[aria-controls="vega-block-body-${hero.id}"]`)
				?.getAttribute('aria-expanded')
		).toBe('true');
		expect(document.activeElement?.id).toBe(fieldIds('actionHref', hero.id).inputId);
	});

	test('«Describir la imagen…» abre la ficha de Medios con el foco en el alt; guardarlo quita el aviso', async () => {
		const { page, media } = await pageWithWarnings();
		const m = mountForm(world.pagesType, page);
		await settle();
		expect(m.target.querySelector('[role="dialog"]')).toBeNull();

		const opener = buttonByLabel(m, 'Describir la imagen…')!;
		opener.focus();
		opener.click();
		await settle();
		const dialog = await mediaDetailDialog(m);
		expect(dialog.getAttribute('aria-modal')).toBe('true');
		const alt = dialog.querySelector<HTMLInputElement>('#vega-media-detail-alt')!;
		await vi.waitFor(() => expect(document.activeElement).toBe(alt));
		expect(document.activeElement).toBe(alt);

		alt.value = 'Chaqueta de lino sobre la mesa de corte';
		alt.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		dialog.querySelector<HTMLFormElement>('form')!.requestSubmit();
		await settle();

		expect(m.target.querySelector('[role="dialog"]')).toBeNull();
		expect(document.contains(opener)).toBe(false);
		expect(document.activeElement).toBe(m.target.querySelector('h1'));
		expect((await world.port.get('vega_media', media.id)).values.alt).toBe(
			'Chaqueta de lino sobre la mesa de corte'
		);
		// Sin releer nada: la ficha guardada sustituye a la cargada y el aviso se va.
		expect(summary(m)).toBe('3 avisos');
		expect(
			m.target.querySelector('[data-review-group="media"] .vega-review-status')?.textContent?.trim()
		).toBe('Sin avisos');
	});

	test('cerrar la ficha sin guardar devuelve el foco al aviso que sigue visible', async () => {
		const { page } = await pageWithWarnings();
		const m = mountForm(world.pagesType, page);
		await settle();
		const opener = buttonByLabel(m, 'Describir la imagen…')!;
		opener.focus();
		opener.click();
		await settle();
		(await mediaDetailDialog(m))
			.querySelector<HTMLButtonElement>('.vega-media-detail-close')!
			.click();
		await settle();
		expect(m.target.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(opener);
	});

	test('una petición de foco del editor visual se cumple al montar, solo si es para este registro', async () => {
		const { page } = await pageWithWarnings();
		requestFieldFocus({ type: 'pages', id: page.id, field: 'description' });
		const m = mountForm(world.pagesType, page);
		await settle();
		expect(document.activeElement?.id).toBe(fieldIds('description').inputId);
		await unmount(m.instance);
		m.target.remove();
		mounted = null;

		requestFieldFocus({ type: 'pages', id: 'otra-pagina', field: 'description' });
		const other = mountForm(world.pagesType, page);
		await settle();
		expect(document.activeElement?.id).not.toBe(fieldIds('description').inputId);
		expect(other.target.querySelector('[data-review-card]')).not.toBeNull();
	});

	test('sin permiso de editar: los avisos se ven sin acciones', async () => {
		const { page } = await pageWithWarnings();
		const locked: ResolvedContentType = {
			...world.pagesType,
			permissions: { ...world.pagesType.permissions, update: false }
		};
		const m = mountForm(locked, page);
		await settle();
		expect(summary(m)).toBe('4 avisos');
		expect(card(m)!.querySelectorAll('button')).toHaveLength(0);
		expect(card(m)!.querySelector('.vega-review-note')).toBeNull();
	});

	test('sin campo Estado no hay tarjeta ni línea (Redirecciones)', async () => {
		const redirects = world.model.types.find((type) => type.name === 'redirects')!;
		expect(redirects.statusField).toBeNull();
		// Un registro en memoria basta: la tarjeta se decide por el TIPO, no por lo guardado.
		const record: VegaRecord = {
			id: 'r1',
			type: 'redirects',
			values: { from: '/vieja', to: '/nueva', code: '301' }
		};
		const m = mountForm(redirects, record);
		await settle();
		expect(card(m)).toBeNull();
		expect(reviewLine(m)).toBeNull();
	});
});

describe('RecordForm — la revisión con lecturas lentas o fallidas', () => {
	const groupStatus = (m: Mounted, group: string) =>
		m.target
			.querySelector(`[data-review-group="${group}"] .vega-review-status`)
			?.textContent?.trim();

	test('sin la biblioteca de medios, una <img> del texto sin alt sigue avisando en Imágenes, y el grupo dice qué no se comprobó', async () => {
		const { page } = await pageWithWarnings();
		// Un bloque de texto con formato con una `<img>` sin `alt` (no necesita la biblioteca), y
		// el `hero` de `pageWithWarnings` con una imagen de la biblioteca (que sí la necesita).
		await createBlock(world, page.id, 1, 'richtext', {
			body: '<p>Patrón</p><img src="/api/files/vega_media/x/patron-falda.png">'
		});
		reviewLoad.port = portWithList('vega_media', () =>
			Promise.reject(new Error('sin permiso en vega_media'))
		);
		const m = mountForm(world.pagesType, page);
		await settle();

		// SEO 2 + enlace roto 1 + `<img>` sin alt 1; la imagen del hero, sin comprobar.
		expect(summary(m)).toBe('4 avisos');
		expect(reviewLine(m)?.textContent).toContain('La revisión tiene 4 avisos.');
		const media = m.target.querySelector<HTMLElement>('[data-review-group="media"]')!;
		expect(groupStatus(m, 'media')).toBe('1 aviso');
		expect(
			media.querySelector('[data-review-check="media.alt-missing-inline"]')?.textContent
		).toContain('patron-falda.png');
		expect(media.querySelector('.vega-review-skipped')?.textContent).toContain(
			'No se ha podido leer la biblioteca de medios'
		);
	});

	test('con la lista de bloques todavía cargando, los avisos de los bloques salen igual (los lee la revisión)', async () => {
		const { page } = await pageWithWarnings();
		// La lista de `RecordBlocks` no termina nunca; la revisión lee por el puerto de verdad.
		const port = portWithList('blocks', () => new Promise(() => {}));
		reviewLoad.port = world.port;
		const m = mountForm(world.pagesType, page, port);
		await settle();

		expect(m.target.querySelector('.vega-blocks-notice')?.textContent?.trim()).toBe(
			translate('es', 'common.loading')
		);
		// descripción vacía + imagen social + enlace roto del hero + imagen sin alt del hero
		expect(summary(m)).toBe('4 avisos');
		expect(groupStatus(m, 'links')).toBe('1 aviso');
		expect(groupStatus(m, 'media')).toBe('1 aviso');
	});

	test('con la lista de bloques fallida, los avisos de los bloques no desaparecen', async () => {
		const { page } = await pageWithWarnings();
		const port = portWithList('blocks', () => Promise.reject(new Error('red caída')));
		reviewLoad.port = world.port;
		const m = mountForm(world.pagesType, page, port);
		await settle();

		expect(summary(m)).toBe('4 avisos');
		expect(groupStatus(m, 'links')).toBe('1 aviso');
		expect(groupStatus(m, 'media')).toBe('1 aviso');
	});

	test('sin carga de la revisión ni de los bloques todavía: «Comprobando…», nunca «Sin avisos»', async () => {
		const { page } = await pageWithWarnings();
		const port = portWithList('blocks', () => new Promise(() => {}));
		reviewLoad.port = port;
		const m = mountForm(world.pagesType, page, port);
		await settle();

		expect(summary(m)).toBe('Comprobando…');
		expect(groupStatus(m, 'links')).toBe('Comprobando…');
	});

	test('en creación no hay registro que revisar: ni se lee nada ni hay tarjeta', async () => {
		const m = mountForm(world.pagesType, null);
		await settle();

		expect(reviewLoad.calls).toEqual([]);
		expect(card(m)).toBeNull();
		expect(reviewLine(m)).toBeNull();
	});
	test('publicar reúne revisión y bloque sin guardar; cancelar conserva borrador y confirmar no autoguarda el bloque', async () => {
		const { page, hero } = await pageWithWarnings();
		const m = mountForm(world.pagesType, page);
		await settle();
		buttonByLabel(m, 'Bloque 1 · Hero › Enlace: ir al campo')!.click();
		await tick();
		const field = m.target.querySelector<HTMLInputElement>(
			`#${fieldIds('actionHref', hero.id).inputId}`
		)!;
		field.value = '/otro-enlace-roto';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		await tick();
		let publish = m.target.querySelector<HTMLButtonElement>('[data-status-target="published"]')!;
		publish.click();
		await vi.waitFor(() => {
			flushSync();
			expect(m.target.querySelector('[role="alertdialog"]')).not.toBeNull();
		});
		publish = m.target.querySelector<HTMLButtonElement>('[data-status-target="published"]')!;
		const dialog = m.target.querySelector<HTMLElement>('[role="alertdialog"]')!;
		expect(dialog).not.toBeNull();
		expect(dialog.querySelectorAll('.vega-review-pop-section')).toHaveLength(2);
		expect(dialog.querySelector('ul')!.textContent?.trim()).not.toBe('');
		expect(document.activeElement?.textContent?.trim()).toBe('Cancelar');
		dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await tick();
		expect(document.activeElement).toBe(publish);
		expect((await world.port.get('pages', page.id)).values.status).toBe('draft');
		publish.click();
		flushSync();
		await tick();
		const confirm = m.target.querySelector<HTMLButtonElement>(
			'.vega-visual-publish-pop-btn--primary'
		)!;
		confirm.click();
		await vi.waitFor(async () => {
			flushSync();
			expect((await world.port.get('pages', page.id)).values.status).toBe('published');
		});
		expect((await world.port.get('blocks', hero.id)).values.data).toEqual(hero.values.data);
		expect(field.value).toBe('/otro-enlace-roto');
	});
});
