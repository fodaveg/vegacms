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
});

function mountForm(type: ResolvedContentType, record: VegaRecord): Mounted {
	const toast = vi.fn();
	const reportError = vi.fn();
	const ctx = {
		port: world.port,
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
			onSubmit: (input, opts) => world.port.update(type.name, record.id, input, opts),
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
	m.target.querySelector('.vega-review-summary')?.textContent?.trim() ?? '';
const reviewLine = (m: Mounted) => m.target.querySelector<HTMLElement>('[data-review-line]');
const buttonByLabel = (m: Mounted, label: string) =>
	[...m.target.querySelectorAll<HTMLButtonElement>('button')].find(
		(b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label
	) ?? null;

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
		const go = buttonByLabel(m, 'Ir a Enlace, en el bloque 1 (Hero)')!;
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

		buttonByLabel(m, 'Describir la imagen…')!.click();
		await settle();
		const dialog = m.target.querySelector<HTMLElement>('[role="dialog"]')!;
		expect(dialog).not.toBeNull();
		expect(dialog.getAttribute('aria-modal')).toBe('true');
		const alt = dialog.querySelector<HTMLInputElement>('#vega-media-detail-alt')!;
		expect(document.activeElement).toBe(alt);

		alt.value = 'Chaqueta de lino sobre la mesa de corte';
		alt.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		dialog.querySelector<HTMLFormElement>('form')!.requestSubmit();
		await settle();

		expect(m.target.querySelector('[role="dialog"]')).toBeNull();
		expect((await world.port.get('vega_media', media.id)).values.alt).toBe(
			'Chaqueta de lino sobre la mesa de corte'
		);
		// Sin releer nada: la ficha guardada sustituye a la cargada y el aviso se va.
		expect(summary(m)).toBe('3 avisos');
		expect(
			m.target.querySelector('[data-review-group="media"] .vega-review-status')?.textContent?.trim()
		).toBe('Sin avisos');
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
