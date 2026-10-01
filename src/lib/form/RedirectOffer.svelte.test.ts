/**
 * Suite de componente de `RedirectOffer.svelte` (lámina C del 1 oct 2026): todos los estados del
 * banner, las dos elecciones que recoge y el fallo con «Reintentar». El plan sale del módulo puro
 * (`planRedirect`), así que aquí se comprueba lo que el banner DICE y deja elegir, no la lógica.
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import RedirectOffer from './RedirectOffer.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { ensureLocaleLoaded, t as translate, type Locale } from '$lib/i18n';
import {
	DEFAULT_REDIRECT_CHOICE,
	planRedirect,
	type RedirectChoice,
	type RedirectRef
} from '$lib/model/redirect-plan';

const OLD = '/sobre-nosotros';
const NEW = '/quienes-somos';
const ref = (id: string, from: string, to: string): RedirectRef => ({ id, from, to });

function plan(existing: RedirectRef[] = [], oldPath = OLD, newPath = NEW) {
	return planRedirect({
		oldPath,
		newPath,
		published: true,
		hasRedirects: true,
		access: { create: true, update: true, delete: true },
		existing
	});
}

interface MountOptions {
	locale?: Locale;
	choice?: RedirectChoice;
	failure?: { from: string; message: string } | null;
	retrying?: boolean;
	disabled?: boolean;
	onRetry?: () => void;
}

function mountOffer(p: ReturnType<typeof plan>, opts: MountOptions = {}) {
	const locale = opts.locale ?? 'es';
	const target = document.createElement('div');
	document.body.appendChild(target);
	const props = $state({
		plan: p,
		choice: opts.choice ?? { ...DEFAULT_REDIRECT_CHOICE },
		failure: opts.failure ?? null,
		retrying: opts.retrying ?? false,
		disabled: opts.disabled ?? false,
		onRetry: opts.onRetry ?? vi.fn()
	});
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
		locale
	} as unknown as VegaAppContext;
	const instance = mount(RedirectOffer, {
		target,
		props,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance, props };
}

const text = (el: Element) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const codes = (el: Element) => [...el.querySelectorAll('code')].map((c) => c.textContent);

describe('RedirectOffer.svelte', () => {
	let mounted: ReturnType<typeof mountOffer> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('sin plan ni fallo no pinta nada', () => {
		mounted = mountOffer(null);
		expect(mounted.target.querySelector('.vega-redirect')).toBeNull();
	});

	test('C1: oferta normal, neutra y marcada por defecto', () => {
		mounted = mountOffer(plan());
		const box = mounted.target.querySelector('.vega-redirect')!;
		expect(box.getAttribute('data-redirect-state')).toBe('offer');
		expect(box.className).toBe('vega-redirect svelte-' + box.className.split('svelte-')[1]);
		const check = box.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
		expect(check.checked).toBe(true);
		expect(text(box.querySelector('.vega-redirect-check')!)).toBe(
			`Crear una redirección de ${OLD} a ${NEW}`
		);
		expect(codes(box.querySelector('.vega-redirect-check')!)).toEqual([OLD, NEW]);
		expect(text(box.querySelector('.vega-redirect-body')!)).toBe(
			'Quien abra la dirección antigua llegará a la nueva. Se crea al guardar.'
		);
		expect(box.getAttribute('role')).toBe('group');
		expect(box.getAttribute('aria-label')).toBe('Redirección desde la ruta antigua');
	});

	test('C1b: desmarcada dice que la ruta vieja dará «página no encontrada»', async () => {
		mounted = mountOffer(plan());
		const check = mounted.target.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
		check.click();
		flushSync();
		await tick();
		expect(mounted.props.choice.createOffered).toBe(false);
		const box = mounted.target.querySelector('.vega-redirect')!;
		expect(box.getAttribute('data-redirect-state')).toBe('declined');
		expect(text(box.querySelector('.vega-redirect-body')!)).toBe(
			`Sin redirección, quien abra ${OLD} verá «página no encontrada».`
		);
	});

	test('C2: cadena simple, tono informativo y sin pregunta', () => {
		mounted = mountOffer(plan([ref('1', '/nosotros', OLD)]));
		const box = mounted.target.querySelector('.vega-redirect')!;
		expect(box.getAttribute('data-redirect-state')).toBe('chain');
		expect(box.classList.contains('vega-redirect--info')).toBe(true);
		expect(box.querySelectorAll('input')).toHaveLength(1);
		expect(text(box.querySelector('.vega-redirect-body')!)).toBe(
			`Ya hay una redirección que lleva a la ruta antigua: /nosotros → ${OLD}. Al guardar pasará a llevar directamente a ${NEW}, para que nadie dé dos saltos.`
		);
	});

	test('C2b: cadena múltiple, con la lista de las que se reapuntan', () => {
		const long = '/la-cooperativa/quienes-somos-y-de-donde-venimos';
		mounted = mountOffer(
			plan([ref('1', '/nosotros', OLD), ref('2', '/about', OLD), ref('3', long, OLD)])
		);
		const box = mounted.target.querySelector('.vega-redirect')!;
		expect(text(box.querySelector('.vega-redirect-body')!)).toBe(
			`Ya hay 3 redirecciones que llevan a la ruta antigua. Al guardar pasarán a llevar directamente a ${NEW}, para que nadie dé dos saltos:`
		);
		expect([...box.querySelectorAll('.vega-redirect-list li')].map(text)).toEqual([
			'/nosotros',
			'/about',
			long
		]);
	});

	test('la cadena desmarcada vuelve a tono neutro y no promete reapuntar', async () => {
		mounted = mountOffer(plan([ref('1', '/nosotros', OLD)]), {
			choice: { createOffered: false, conflict: 'repoint' }
		});
		const box = mounted.target.querySelector('.vega-redirect')!;
		expect(box.classList.contains('vega-redirect--info')).toBe(false);
		expect(box.querySelector('.vega-redirect-list')).toBeNull();
		expect(text(box.querySelector('.vega-redirect-body')!)).toContain('página no encontrada');
	});

	test('C3: conflicto en tono de aviso, dos frases completas y «cambiarla» por defecto', async () => {
		mounted = mountOffer(plan([ref('9', OLD, '/empresa')]));
		const box = mounted.target.querySelector('.vega-redirect')!;
		expect(box.getAttribute('data-redirect-state')).toBe('conflict');
		expect(box.classList.contains('vega-redirect--warning')).toBe(true);
		expect(box.querySelector('input[type="checkbox"]')).toBeNull();
		expect(text(box.querySelector('.vega-redirect-title')!)).toBe(
			`Ya existe una redirección desde ${OLD}`
		);
		expect(text(box.querySelector('.vega-redirect-body')!)).toBe(
			'Lleva a /empresa. Mientras la página estaba en esa ruta no hacía nada; en cuanto la muevas, empezará a actuar.'
		);
		const radios = [...box.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
		expect(radios.map((r) => r.checked)).toEqual([true, false]);
		expect([...box.querySelectorAll('.vega-redirect-choices label')].map(text)).toEqual([
			`Cambiarla para que lleve a ${NEW}`,
			`Dejarla como está: ${OLD} llevará a /empresa`
		]);
		// el conflicto no se hace pasar por un error: no es una alerta y no hay botón que bloquee
		expect(box.getAttribute('role')).toBe('group');
		expect(box.querySelector('button')).toBeNull();
		expect(box.getAttribute('aria-labelledby')).toBe(box.querySelector('.vega-redirect-title')!.id);

		radios[1].click();
		flushSync();
		await tick();
		expect(mounted.props.choice.conflict).toBe('keep');
	});

	test('conflicto con cadena: la frase de la cadena solo sale si se elige cambiarla', async () => {
		mounted = mountOffer(plan([ref('9', OLD, '/empresa'), ref('1', '/nosotros', OLD)]));
		expect(mounted.target.querySelectorAll('.vega-redirect-body')).toHaveLength(2);
		mounted.props.choice.conflict = 'keep';
		flushSync();
		await tick();
		expect(mounted.target.querySelectorAll('.vega-redirect-body')).toHaveLength(1);
	});

	test('bucle: avisa de que se borrará, dentro de la oferta, y sigue ahí con la casilla desmarcada', async () => {
		mounted = mountOffer(plan([ref('7', NEW, OLD)]));
		const removal = mounted.target.querySelector('[data-redirect-removal]')!;
		expect(text(removal)).toBe(
			`Existe una redirección de ${NEW} a ${OLD}. Al guardar se borrará: la página vuelve a vivir en ${NEW} y la redirección daría vueltas.`
		);
		mounted.props.choice.createOffered = false;
		flushSync();
		await tick();
		expect(mounted.target.querySelector('[data-redirect-removal]')).not.toBeNull();
	});

	test('redirección desde la ruta viva hacia otra parte: frase propia', () => {
		mounted = mountOffer(plan([ref('8', NEW, '/otra')]));
		expect(text(mounted.target.querySelector('[data-redirect-removal]')!)).toBe(
			`Existe una redirección desde ${NEW} que lleva a /otra. Al guardar se borrará: esa dirección pasa a ser la de la página.`
		);
	});

	test('solo bucle (la oferta ya está cumplida): una caja neutra con la frase', () => {
		mounted = mountOffer(plan([ref('9', OLD, NEW), ref('7', NEW, OLD)]));
		const box = mounted.target.querySelector('.vega-redirect')!;
		expect(box.getAttribute('data-redirect-state')).toBe('removal');
		expect(box.querySelector('input')).toBeNull();
		expect(box.querySelector('[data-redirect-removal]')).not.toBeNull();
	});

	test('C5: rutas larguísimas van enteras en <code>, sin recortar', () => {
		const a = '/la-cooperativa/historia/' + 'quienes-somos-y-de-donde-venimos-'.repeat(4) + 'fin';
		const b = '/la-cooperativa/' + 'quienes-somos-las-artesanas-'.repeat(4) + 'fin';
		mounted = mountOffer(plan([], a, b));
		expect(codes(mounted.target.querySelector('.vega-redirect-check')!)).toEqual([a, b]);
	});

	test('C7: el fallo es una alerta, nombra la ruta y el servidor, y reintenta', async () => {
		const onRetry = vi.fn();
		mounted = mountOffer(plan(), {
			failure: { from: OLD, message: 'Failed to create record. from: Value must be unique.' },
			onRetry
		});
		const box = mounted.target.querySelector('.vega-redirect')!;
		expect(box.getAttribute('role')).toBe('alert');
		expect(box.classList.contains('vega-redirect--danger')).toBe(true);
		expect(text(box.querySelector('.vega-redirect-title')!)).toBe(
			'La página se ha guardado, pero la redirección no'
		);
		expect(text(box.querySelector('.vega-redirect-body')!)).toBe(
			`${OLD} ya no lleva a ningún sitio. El servidor ha contestado: Failed to create record. from: Value must be unique.`
		);
		// la ruta va en <code>; el mensaje del servidor es texto llano
		expect(codes(box)).toEqual([OLD]);
		const retry = box.querySelector('button')!;
		expect(text(retry)).toBe('Reintentar');
		retry.click();
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	test('el fallo sustituye a cualquier otro estado y se puede mostrar sin plan', () => {
		mounted = mountOffer(null, { failure: { from: OLD, message: 'x' } });
		expect(mounted.target.querySelector('[data-redirect-state="failed"]')).not.toBeNull();
	});

	test('reintentando: el botón queda deshabilitado', () => {
		mounted = mountOffer(null, { failure: { from: OLD, message: 'x' }, retrying: true });
		expect(mounted.target.querySelector('button')!.disabled).toBe(true);
	});

	test('guardando: las elecciones quedan inertes', () => {
		mounted = mountOffer(plan(), { disabled: true });
		expect(mounted.target.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(
			true
		);
	});

	test('en inglés usa las mismas frases traducidas', async () => {
		await ensureLocaleLoaded('en');
		mounted = mountOffer(plan(), { locale: 'en' });
		expect(text(mounted.target.querySelector('.vega-redirect-check')!)).toBe(
			`Create a redirect from ${OLD} to ${NEW}`
		);
	});
});
