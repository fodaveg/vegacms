/**
 * Tests DOM de `resolveDisplayBackendUrl` (#l12-ux, item 1): toca `window.location`/`fetch`/
 * `localStorage`, así que necesita jsdom real — misma convención `*.dom.test.ts` que
 * `backend-override.dom.test.ts` (proyecto `dom` de `vite.config.ts`). No cubre el resto de
 * `backend.ts` (el singleton `getBackend()`/adaptador real): eso vive fuera del alcance de este
 * lote, sin tests dedicados hasta ahora (módulo impuro, documentado en su propia cabecera).
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { resolveDisplayBackendUrl } from './backend';
import { clearBackendOverride, writeBackendOverride } from './backend-override';

/** Sustituye `global.fetch` por un mock que responde `data` como `/vega.config.json`, o un 404 si
 *  `data` es `null` (ausencia del fichero, ver `fetchVegaConfig`). */
function mockConfigResponse(data: unknown | null): void {
	global.fetch = vi.fn(async () => {
		if (data === null) return { ok: false } as Response;
		return { ok: true, json: async () => data } as Response;
	}) as unknown as typeof fetch;
}

beforeEach(() => {
	localStorage.clear();
	delete window.__VEGA_ADAPTER__;
});

afterEach(() => {
	vi.restoreAllMocks();
	delete window.__VEGA_ADAPTER__;
});

describe('resolveDisplayBackendUrl', () => {
	test('adaptador memory (window.__VEGA_ADAPTER__) → null, ni siquiera lee vega.config.json', async () => {
		window.__VEGA_ADAPTER__ = 'memory';
		const fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;

		expect(await resolveDisplayBackendUrl()).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test('sin override ni config → same-origin (window.location.origin)', async () => {
		mockConfigResponse(null);

		expect(await resolveDisplayBackendUrl()).toBe(window.location.origin);
	});

	test('config.backendUrl válida, sin override → gana la config (D-P3.5-a)', async () => {
		mockConfigResponse({ backendUrl: 'https://pb-config.example.com' });

		expect(await resolveDisplayBackendUrl()).toBe('https://pb-config.example.com');
	});

	test('override runtime válido gana a config y a origin (mayor precedencia, lote L5)', async () => {
		writeBackendOverride('https://pb-override.example.com');
		mockConfigResponse({ backendUrl: 'https://pb-config.example.com' });

		expect(await resolveDisplayBackendUrl()).toBe('https://pb-override.example.com');

		clearBackendOverride();
	});

	test('config.backendUrl inválida, sin override → fallback a same-origin (nunca lanza)', async () => {
		mockConfigResponse({ backendUrl: 'no-es-una-url' });

		expect(await resolveDisplayBackendUrl()).toBe(window.location.origin);
	});
});
