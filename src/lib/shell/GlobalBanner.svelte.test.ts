/**
 * `GlobalBanner`: con texto del catálogo (`backendCode`) el mensaje original del backend va debajo
 * como detalle técnico; si no hay código, o el original coincide con lo mostrado, no hay segunda
 * línea.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { VegaError } from '$lib/backend';
import { t as translate } from '$lib/i18n';
import GlobalBanner from './GlobalBanner.svelte';
import { transportFeedback } from './transport-feedback.svelte';

function mountBanner(isClipped?: (el: HTMLElement) => boolean) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		port: {}
	} as unknown as VegaAppContext;
	const instance = mount(GlobalBanner, {
		target,
		props: isClipped ? { isClipped } : {},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance };
}

describe('GlobalBanner: detalle técnico bajo el texto del catálogo', () => {
	let mounted: ReturnType<typeof mountBanner> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		transportFeedback.dismiss();
		transportFeedback.markConnected();
	});

	test('con backendCode pinta el catálogo y el mensaje original como línea secundaria', async () => {
		transportFeedback.report(
			VegaError.backend('hook: cuota excedida en collection X', undefined, 'server-error')
		);
		mounted = mountBanner();
		await tick();
		const message = mounted.target.querySelector('.vega-global-banner-message')!;
		expect(message.textContent).toBe(translate('es', 'errors.backendCode.serverError'));
		const detail = mounted.target.querySelector('[data-banner-detail]')!;
		expect(detail.textContent).toBe('hook: cuota excedida en collection X');
	});

	test('sin backendCode pinta el mensaje una sola vez, sin segunda línea', async () => {
		transportFeedback.report(VegaError.backend('Fallo raro del hook.'));
		mounted = mountBanner();
		await tick();
		expect(mounted.target.querySelector('.vega-global-banner-message')!.textContent).toBe(
			'Fallo raro del hook.'
		);
		expect(mounted.target.querySelector('[data-banner-detail]')).toBeNull();
	});

	test('si el mensaje original es idéntico al del catálogo no hay segunda línea', async () => {
		transportFeedback.report(
			VegaError.backend(
				translate('es', 'errors.backendCode.serverError'),
				undefined,
				'server-error'
			)
		);
		mounted = mountBanner();
		await tick();
		expect(mounted.target.querySelector('[data-banner-detail]')).toBeNull();
	});

	test('un banner de red no lleva detalle', async () => {
		transportFeedback.report(VegaError.network());
		mounted = mountBanner();
		await tick();
		expect(mounted.target.querySelector('[data-banner-detail]')).toBeNull();
	});
});

describe('GlobalBanner: detalle plegable', () => {
	let mounted: ReturnType<typeof mountBanner> | null = null;
	const LONG = 'hook: ' + 'cuota excedida en la colección X. '.repeat(10).trim();

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		transportFeedback.dismiss();
		transportFeedback.markConnected();
	});

	const toggle = () =>
		mounted!.target.querySelector<HTMLButtonElement>('.vega-global-banner-toggle');
	const detail = () => mounted!.target.querySelector<HTMLElement>('[data-banner-detail]')!;
	const reportLong = (message = LONG) =>
		transportFeedback.report(VegaError.backend(message, undefined, 'server-error'));

	test('sin recorte no hay botón', async () => {
		reportLong();
		mounted = mountBanner(() => false);
		await tick();
		expect(toggle()).toBeNull();
		expect(detail().classList.contains('vega-global-banner-detail-clamped')).toBe(true);
	});

	test('con recorte aparece el botón, enlazado al detalle y plegado', async () => {
		reportLong();
		mounted = mountBanner(() => true);
		await tick();
		const button = toggle()!;
		expect(button.textContent?.trim()).toBe(translate('es', 'errors.banner.detailShow'));
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(button.getAttribute('aria-controls')).toBe(detail().id);
		expect(detail().id).not.toBe('');
	});

	test('pulsar alterna aria-expanded y el texto entero está en el DOM plegado y desplegado', async () => {
		reportLong();
		mounted = mountBanner(() => true);
		await tick();
		expect(detail().textContent?.trim()).toBe(LONG);
		toggle()!.click();
		await tick();
		expect(toggle()!.getAttribute('aria-expanded')).toBe('true');
		expect(toggle()!.textContent?.trim()).toBe(translate('es', 'errors.banner.detailHide'));
		expect(detail().classList.contains('vega-global-banner-detail-clamped')).toBe(false);
		expect(detail().textContent?.trim()).toBe(LONG);
		toggle()!.click();
		await tick();
		expect(toggle()!.getAttribute('aria-expanded')).toBe('false');
		expect(detail().classList.contains('vega-global-banner-detail-clamped')).toBe(true);
		expect(detail().textContent?.trim()).toBe(LONG);
	});

	test('un error nuevo vuelve a plegado', async () => {
		reportLong();
		mounted = mountBanner(() => true);
		await tick();
		toggle()!.click();
		await tick();
		expect(toggle()!.getAttribute('aria-expanded')).toBe('true');
		reportLong(LONG + ' otra vez');
		await tick();
		await tick();
		expect(toggle()!.getAttribute('aria-expanded')).toBe('false');
		expect(detail().classList.contains('vega-global-banner-detail-clamped')).toBe(true);
	});
});
