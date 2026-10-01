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

function mountBanner() {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		port: {}
	} as unknown as VegaAppContext;
	const instance = mount(GlobalBanner, { target, context: new Map([[VEGA_CONTEXT_KEY, ctx]]) });
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
