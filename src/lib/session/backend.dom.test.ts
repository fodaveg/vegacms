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

/**
 * Arranque de `getBackend()` (audit de rendimiento, p3): qué espera a qué. `getBackend` es un
 * singleton de módulo, así que cada test importa un módulo FRESCO (`vi.resetModules`). La config
 * se retiene hasta que el test la suelta, para ver si el discovery sale antes o después.
 */
describe('getBackend — config y discovery', () => {
	function holdConfig(config: unknown): { requested: string[]; release: () => void } {
		const requested: string[] = [];
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		global.fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof URL ? input.href : String(input);
			requested.push(url);
			if (url.endsWith('/vega.config.json')) {
				await gate;
				return { ok: true, json: async () => config } as Response;
			}
			return { ok: false } as Response; // discovery ausente: proyecto sin descubrimiento
		}) as unknown as typeof fetch;
		return {
			requested,
			release: () => release()
		};
	}

	test('con override runtime, el discovery sale SIN esperar a vega.config.json', async () => {
		writeBackendOverride('https://pb-override.example.com');
		const { requested, release } = holdConfig({});
		vi.resetModules();
		const { getBackend } = await import('./backend');

		const pending = getBackend();
		await vi.waitFor(() =>
			expect(requested.some((url) => url.startsWith('https://pb-override.example.com/'))).toBe(true)
		);
		release();
		await expect(pending).resolves.toBeDefined();
		clearBackendOverride();
	});

	test('el puerto de getBackend regenera el snapshot de los editores al crear una colección', async () => {
		// Cableado de `withSchemaSnapshotSync` (`model/load.ts`) en `createInstance`: la rama
		// `memory` se construye igual que la de `pocketbase`, decorador por debajo de `withRevisions`.
		window.__VEGA_ADAPTER__ = 'memory';
		vi.resetModules();
		const { getBackend } = await import('./backend');
		const { DEMO_CREDENTIALS } = await import('./demo-seed');
		const port = await getBackend();
		await port.login(DEMO_CREDENTIALS);

		await port.ensureCollections([{ name: 'author', fields: [{ name: 'name', type: 'text' }] }]);

		const vega = await port.list('vega', { perPage: 1 });
		const snapshot = vega.items[0].values.schemaSnapshot as { name: string }[] | null;
		expect(snapshot?.map((t) => t.name)).toContain('author');
	});

	test('sin override, el discovery espera a la config: la URL sale de ella', async () => {
		const { requested, release } = holdConfig({ backendUrl: 'https://pb-config.example.com' });
		vi.resetModules();
		const { getBackend } = await import('./backend');

		const pending = getBackend();
		await vi.waitFor(() => expect(requested).toHaveLength(1));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(requested).toHaveLength(1);
		release();
		await pending;
		expect(requested[1]).toMatch(/^https:\/\/pb-config\.example\.com\//);
	});
});
