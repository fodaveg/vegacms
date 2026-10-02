/**
 * Suite de componente de `ReviewCard.svelte` (+ `ReviewGroups.svelte`, que monta dentro): cada
 * estado de la lámina del lote 13 (1.1 a 1.9) con un `ReviewState` de mentira
 * (`review-state.fixture.ts`). Lo que se mide es lo que se PINTA y adónde lleva cada acción; el
 * cableado real (foco en el campo, bloque desplegado, ficha de Medios) lo mide
 * `RecordForm.review.svelte.test.ts` sobre el adaptador `memory`.
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import ReviewCard from './ReviewCard.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { t as translate } from '$lib/i18n';
import type { ReviewFinding } from './publish-review';
import {
	blockTarget,
	fakeReviewState,
	fieldTarget,
	finding,
	type FakeReviewState
} from './review-state.fixture';

const t = (key: string, params?: Record<string, string | number>) => translate('es', key, params);

interface Harness {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	onGo: ReturnType<typeof vi.fn>;
	onDescribe: ReturnType<typeof vi.fn>;
	card: () => HTMLElement;
	summary: () => string;
	group: (name: string) => HTMLElement | null;
	buttons: () => HTMLButtonElement[];
}

function mountCard(review: FakeReviewState, canAct = true): Harness {
	const ctx = { t, locale: 'es' } as unknown as VegaAppContext;
	const onGo = vi.fn();
	const onDescribe = vi.fn();
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(ReviewCard, {
		target,
		props: { review, canAct, onGo, onDescribe },
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return {
		target,
		instance,
		onGo,
		onDescribe,
		card: () => target.querySelector<HTMLElement>('[data-review-card]')!,
		summary: () => target.querySelector('.vega-review-summary')?.textContent?.trim() ?? '',
		group: (name) => target.querySelector<HTMLElement>(`[data-review-group="${name}"]`),
		buttons: () => [...target.querySelectorAll<HTMLButtonElement>('button')]
	};
}

const groupStatus = (group: HTMLElement) =>
	group.querySelector('.vega-review-status')?.textContent?.trim() ?? '';

// Los avisos de la lámina 1.2 («Talleres de otoño»): dos de SEO, tres de enlaces, dos de imágenes.
const SEO_LONG = finding('seo.description-long', fieldTarget('description', 'Descripción'), {
	params: { length: 211, max: 160 }
});
const SEO_IMAGE = finding(
	'seo.social-image-missing',
	fieldTarget('socialImage', 'Imagen para redes')
);
const LINK_BROKEN = finding(
	'link.broken',
	blockTarget('b2', 2, 'Texto rico', 'body', 'Contenido'),
	{
		params: { href: '/precios' },
		reason: 'not-found'
	}
);
const LINK_DRAFT = finding(
	'link.draft-target',
	blockTarget('b2', 2, 'Texto rico', 'body', 'Contenido'),
	{ id: 'link.draft-target:b.b2.body:1', params: { href: '/profesoras' } }
);
const LINK_CTA = finding(
	'link.broken',
	blockTarget('b4', 4, 'Llamada a la acción', 'href', 'Enlace'),
	{
		params: { href: '/inscripcion', to: '/reservas' },
		reason: 'redirect-dead-end'
	}
);
const ALT_MISSING = finding(
	'media.alt-missing',
	blockTarget('b3', 3, 'Galería', 'images', 'Imágenes'),
	{
		params: { file: 'chaqueta_lino_k3v8q1m2zt.jpg' },
		mediaId: 'm1'
	}
);
const ALT_INLINE = finding(
	'media.alt-missing-inline',
	blockTarget('b2', 2, 'Texto rico', 'body', 'Contenido'),
	{ params: { file: 'patron-falda.png' } }
);
const SEVEN: ReviewFinding[] = [
	SEO_LONG,
	SEO_IMAGE,
	LINK_BROKEN,
	LINK_DRAFT,
	LINK_CTA,
	ALT_MISSING,
	ALT_INLINE
];

describe('ReviewCard.svelte — la tarjeta, estado por estado', () => {
	let h: Harness | null = null;

	afterEach(async () => {
		if (h) {
			await unmount(h.instance);
			h.target.remove();
			h = null;
		}
	});

	test('1.1 sin avisos: resumen en verde y los tres grupos dicen «Sin avisos», sin pie', () => {
		h = mountCard(fakeReviewState());
		expect(h.card().getAttribute('aria-labelledby')).toBeTruthy();
		expect(h.target.querySelector('h2')?.textContent).toBe('Revisión');
		expect(h.summary()).toBe('Sin avisos');
		expect(h.target.querySelector('.vega-review-count')?.getAttribute('data-tone')).toBe('ok');
		for (const name of ['seo', 'links', 'media']) {
			expect(groupStatus(h.group(name)!)).toBe('Sin avisos');
			expect(h.group(name)!.querySelector('.vega-review-items')).toBeNull();
		}
		expect(h.target.querySelector('.vega-review-note')).toBeNull();
		// El resumen es lo que se anuncia por voz: el resultado de la carga, no cada tecla.
		expect(h.target.querySelector('.vega-review-summary')?.getAttribute('aria-live')).toBe(
			'polite'
		);
	});

	test('1.2 varios avisos: el resumen los cuenta, cada grupo el suyo, en el orden SEO · Enlaces · Imágenes', () => {
		h = mountCard(fakeReviewState({ findings: SEVEN }));
		expect(h.summary()).toBe('7 avisos');
		expect(h.target.querySelector('.vega-review-count')?.getAttribute('data-tone')).toBe('warn');
		const names = [...h.target.querySelectorAll('[data-review-group]')].map((el) =>
			el.getAttribute('data-review-group')
		);
		expect(names).toEqual(['seo', 'links', 'media']);
		expect(groupStatus(h.group('seo')!)).toBe('2 avisos');
		expect(groupStatus(h.group('links')!)).toBe('3 avisos');
		expect(groupStatus(h.group('media')!)).toBe('2 avisos');
		expect(h.target.querySelector('.vega-review-note')?.textContent).toBe(
			'Ningún aviso impide publicar.'
		);
		// El mensaje con sus valores en mono (`{href}`, `{file}`); los números, en prosa.
		const seoItem = h.group('seo')!.querySelector('.vega-review-item')!;
		expect(seoItem.textContent).toContain(
			'La descripción tiene 211 caracteres y los buscadores suelen cortarla a partir de 160.'
		);
		expect(seoItem.querySelector('.vega-review-value')).toBeNull();
		const linkItem = h.group('links')!.querySelector('.vega-review-item')!;
		expect(linkItem.querySelector('.vega-review-value')?.textContent).toBe('/precios');
		const deadEnd = h.group('links')!.querySelectorAll('.vega-review-item')[2];
		expect([...deadEnd.querySelectorAll('.vega-review-value')].map((v) => v.textContent)).toEqual([
			'/inscripcion',
			'/reservas'
		]);
	});

	test('1.2 cada aviso lleva UNA acción: al campo, al bloque (con su nombre accesible) o «Describir la imagen…»', () => {
		h = mountCard(fakeReviewState({ findings: SEVEN }));
		const byLabel = (label: string) =>
			h!.buttons().find((b) => b.getAttribute('aria-label') === label) ?? null;

		const toField = byLabel('Ir al campo Descripción')!;
		expect(toField.textContent?.trim()).toBe('Descripción');
		toField.click();
		expect(h.onGo).toHaveBeenLastCalledWith(SEO_LONG);

		const toBlock = byLabel('Ir a Contenido, en el bloque 2 (Texto rico)')!;
		expect(toBlock.textContent?.trim()).toBe('Bloque 2 · Texto rico › Contenido');
		toBlock.click();
		expect(h.onGo).toHaveBeenLastCalledWith(LINK_BROKEN);
		expect(byLabel('Ir a Enlace, en el bloque 4 (Llamada a la acción)')).not.toBeNull();

		// La imagen sin alt: dónde está como texto y «Describir la imagen…», nunca «ir al bloque».
		const altItem = h.group('media')!.querySelector('[data-review-check="media.alt-missing"]')!;
		expect(altItem.querySelector('.vega-review-where')?.textContent).toBe('Bloque 3 · Galería');
		const describe = altItem.querySelector<HTMLButtonElement>('button')!;
		expect(describe.textContent?.trim()).toBe('Describir la imagen…');
		describe.click();
		expect(h.onDescribe).toHaveBeenCalledWith(ALT_MISSING);
		expect(h.onGo).toHaveBeenCalledTimes(2);
	});

	test('1.3 muchos avisos de un tipo: 3 por grupo y «Ver N más», que despliega en el sitio y pasa a «Ver menos»', async () => {
		const nine = Array.from({ length: 9 }, (_, i) =>
			finding('media.alt-missing', blockTarget('b2', 2, 'Galería', 'images', 'Imágenes'), {
				id: `media.alt-missing:b.b2.images:${i + 1}`,
				params: { file: `falda_${i + 1}.jpg` },
				mediaId: `m${i + 1}`
			})
		);
		h = mountCard(fakeReviewState({ findings: nine }));
		expect(h.summary()).toBe('9 avisos');
		const media = h.group('media')!;
		expect(groupStatus(media)).toBe('9 avisos');
		expect(media.querySelectorAll('.vega-review-item')).toHaveLength(3);
		const more = media.querySelector<HTMLButtonElement>('.vega-review-more')!;
		expect(more.textContent?.trim()).toBe('Ver 6 más');
		expect(more.getAttribute('aria-expanded')).toBe('false');

		more.click();
		flushSync();
		await tick();
		expect(media.querySelectorAll('.vega-review-item')).toHaveLength(9);
		expect(more.textContent?.trim()).toBe('Ver menos');
		expect(more.getAttribute('aria-expanded')).toBe('true');

		more.click();
		flushSync();
		expect(media.querySelectorAll('.vega-review-item')).toHaveLength(3);
	});

	test('1.4 una comprobación no comprobada: su motivo y «Volver a comprobar», que relee; nunca «Sin avisos»', () => {
		const review = fakeReviewState({
			findings: [SEO_LONG, SEO_IMAGE],
			skipped: ['link.broken', 'link.draft-target']
		});
		h = mountCard(review);
		expect(h.summary()).toBe('2 avisos');
		const links = h.group('links')!;
		expect(groupStatus(links)).toBe('No comprobado');
		expect(links.querySelector('.vega-review-status')?.getAttribute('data-tone')).toBe('muted');
		expect(links.querySelector('.vega-review-skipped')?.textContent).toContain(
			'Vega no ha podido saber qué páginas y redirecciones tiene el sitio'
		);
		const recheck = links.querySelector<HTMLButtonElement>('button')!;
		expect(recheck.textContent?.trim()).toBe('Volver a comprobar');
		recheck.click();
		expect(review.reload).toHaveBeenCalledTimes(1);
		expect(groupStatus(h.group('media')!)).toBe('Sin avisos');
		expect(h.target.querySelector('.vega-review-note')).not.toBeNull();
	});

	test('1.5 cero avisos con algo sin comprobar: «Incompleta» en neutro, sin pie', () => {
		h = mountCard(fakeReviewState({ skipped: ['media.alt-missing'] }));
		expect(h.summary()).toBe('Incompleta');
		expect(h.target.querySelector('.vega-review-count')?.getAttribute('data-tone')).toBe('muted');
		expect(groupStatus(h.group('media')!)).toBe('No comprobado');
		expect(h.target.querySelector('.vega-review-note')).toBeNull();
	});

	test('1.6 cargando: «Comprobando…» en la cabecera y en enlaces e imágenes; SEO sale ya', async () => {
		const review = fakeReviewState({ phase: 'loading', findings: [SEO_LONG, SEO_IMAGE] });
		h = mountCard(review);
		expect(h.card().getAttribute('aria-busy')).toBe('true');
		expect(h.summary()).toBe('Comprobando…');
		expect(h.target.querySelector('.vega-review-count')).toBeNull();
		expect(groupStatus(h.group('seo')!)).toBe('2 avisos');
		expect(groupStatus(h.group('links')!)).toBe('Comprobando…');
		expect(groupStatus(h.group('media')!)).toBe('Comprobando…');

		// La carga termina: el resultado se anuncia en el mismo sitio.
		review.set({ phase: 'ready', findings: [SEO_LONG, SEO_IMAGE, LINK_BROKEN] });
		flushSync();
		await tick();
		expect(h.card().getAttribute('aria-busy')).toBeNull();
		expect(h.summary()).toBe('3 avisos');
		expect(groupStatus(h.group('links')!)).toBe('1 aviso');
		expect(groupStatus(h.group('media')!)).toBe('Sin avisos');
	});

	test('1.7 error al cargar: SEO sigue, enlaces e imágenes dejan paso al error con «Reintentar»', () => {
		const review = fakeReviewState({
			phase: 'error',
			findings: [SEO_LONG, SEO_IMAGE],
			errorMessage: 'Demasiados bloques'
		});
		h = mountCard(review);
		expect(h.summary()).toBe('2 avisos');
		expect(h.group('seo')).not.toBeNull();
		expect(h.group('links')).toBeNull();
		expect(h.group('media')).toBeNull();
		const error = h.target.querySelector<HTMLElement>('.vega-review-error')!;
		expect(error.getAttribute('role')).toBe('alert');
		expect(error.textContent).toContain('No se han podido leer los bloques de la página');
		error.querySelector('button')!.click();
		expect(review.reload).toHaveBeenCalledTimes(1);
	});

	test('1.8 colección con un solo grupo que aplica: solo se pinta ese', () => {
		h = mountCard(
			fakeReviewState({
				groups: ['links'],
				findings: [
					finding('link.draft-target', fieldTarget('content', 'Contenido'), {
						params: { href: '/talleres-de-invierno' }
					})
				]
			})
		);
		expect(h.target.querySelectorAll('[data-review-group]')).toHaveLength(1);
		expect(h.group('links')).not.toBeNull();
		expect(h.summary()).toBe('1 aviso');
		expect(groupStatus(h.group('links')!)).toBe('1 aviso');
	});

	test('1.9 sin permiso de editar: los avisos se ven, sin acciones y sin el pie', () => {
		h = mountCard(fakeReviewState({ findings: [LINK_BROKEN, ALT_MISSING] }), false);
		expect(h.summary()).toBe('2 avisos');
		expect(h.buttons()).toEqual([]);
		const wheres = [...h.target.querySelectorAll('.vega-review-where')].map((el) =>
			el.textContent?.trim()
		);
		expect(wheres).toEqual(['Bloque 2 · Texto rico › Contenido', 'Bloque 3 · Galería']);
		expect(h.target.querySelector('.vega-review-note')).toBeNull();
	});

	test('«Ver la revisión» (`focus()`): la tarjeta recibe el foco y se desplaza a la vista', () => {
		const scroll = vi.fn();
		Element.prototype.scrollIntoView = scroll;
		h = mountCard(fakeReviewState({ findings: [SEO_LONG] }));
		flushSync();
		(h.instance as unknown as { focus: () => void }).focus();
		expect(document.activeElement).toBe(h.card());
		expect(scroll).toHaveBeenCalledTimes(1);
	});
});
