/**
 * `UpdateBanner.svelte`: el CABLEADO del enlace «Ver el release» (revisión de seguridad del
 * 30 sep 2026). El filtro en sí se prueba en `update/release-url.test.ts`; aquí, que lo que el
 * banner pinta sale de la caché ya filtrada: con una URL de `https://github.com/` hay enlace, y
 * con cualquier otra el aviso se da igual, sin `<a>`.
 *
 * Montaje real (proyecto vitest `component`), mismo patrón que `PublishButton.svelte.test.ts`. La
 * caché se escribe en `localStorage` a mano, como la dejaría una versión anterior al filtro, y se
 * relee con `updateBannerState.refresh()` (el store es un singleton de módulo).
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import UpdateBanner from './UpdateBanner.svelte';
import { updateBannerState } from './update-banner.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { VEGA_VERSION } from '$lib/version';

const fakeCtx = {
	t: (key: string, params?: Record<string, string | number>) =>
		params ? `${key}:${JSON.stringify(params)}` : key,
	icons: { knownIcons: [], has: () => true }
} as unknown as VegaAppContext;

let target: HTMLElement;
let instance: ReturnType<typeof mount> | null = null;

async function mountWithCachedUrl(releaseUrl: unknown): Promise<void> {
	localStorage.setItem(
		'vega.updateCheck.v1',
		JSON.stringify({
			checkedAt: Date.now(),
			status: { kind: 'update-available', current: VEGA_VERSION, latest: '999.0.0', releaseUrl }
		})
	);
	updateBannerState.refresh();
	instance = mount(UpdateBanner, { target, context: new Map([[VEGA_CONTEXT_KEY, fakeCtx]]) });
	await tick();
}

beforeEach(() => {
	localStorage.clear();
	target = document.createElement('div');
	document.body.appendChild(target);
});

afterEach(() => {
	if (instance) void unmount(instance);
	instance = null;
	target.remove();
	localStorage.clear();
	updateBannerState.refresh();
});

describe('UpdateBanner: enlace al release', () => {
	test('URL de https://github.com/ → aviso con enlace', async () => {
		await mountWithCachedUrl('https://github.com/fodaveg/vegacms/releases/tag/v999.0.0');
		expect(target.querySelector('.vega-update-banner-message')?.textContent).toContain('999.0.0');
		expect(target.querySelector('a')?.getAttribute('href')).toBe(
			'https://github.com/fodaveg/vegacms/releases/tag/v999.0.0'
		);
	});

	test.each([
		'https://github.com.evil.example/',
		'https://github.com@evil.example/',
		'javascript:alert(1)',
		null
	])('URL rechazada (%s) → el aviso sigue, sin enlace', async (releaseUrl) => {
		await mountWithCachedUrl(releaseUrl);
		expect(target.querySelector('.vega-update-banner-message')?.textContent).toContain('999.0.0');
		expect(target.querySelector('a')).toBeNull();
		// Sigue pudiéndose descartar.
		expect(target.querySelector('.vega-update-banner-dismiss')).not.toBeNull();
	});
});
