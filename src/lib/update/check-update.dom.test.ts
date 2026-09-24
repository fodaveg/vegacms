/**
 * TTL de caché de `checkForUpdate` (fix de peso, auditoría 23 sep 2026 p3): fichero SEPARADO de
 * `check-update.test.ts` a propósito — ese vive en el proyecto `server` (sin `localStorage`, ver
 * su cabecera) precisamente para no ejercitar esta rama; aquí SÍ hace falta `localStorage` real
 * (proyecto `dom`), porque el TTL se decide leyendo `vega.updateCheck.v1` con
 * `readCachedUpdateCheck`.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { checkForUpdate } from './check-update';
import { writeCachedUpdateCheck } from './storage';
import { VEGA_VERSION } from '$lib/version';

/** Construye un `Response`-like mínimo, mismo patrón que `check-update.test.ts`. */
function fakeResponse(body: unknown): Response {
	return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response;
}

beforeEach(() => {
	localStorage.clear();
});

describe('checkForUpdate: TTL de la caché', () => {
	test('caché reciente (< 4h) → NO llama a fetch, devuelve el UpdateStatus cacheado', async () => {
		const cachedStatus = {
			kind: 'up-to-date' as const,
			current: VEGA_VERSION,
			latest: VEGA_VERSION
		};
		writeCachedUpdateCheck(cachedStatus);
		const fetchImpl = vi.fn();

		const result = await checkForUpdate(fetchImpl as unknown as typeof fetch);

		expect(fetchImpl).not.toHaveBeenCalled();
		expect(result).toEqual(cachedStatus);
	});

	test('caché caducada (> 4h) → SÍ llama a fetch y re-escribe la caché', async () => {
		const staleStatus = { kind: 'up-to-date' as const, current: '0.0.1', latest: '0.0.1' };
		writeCachedUpdateCheck(staleStatus);
		// Retrasa `checkedAt` manualmente 5 horas: mismo formato que escribe `writeCachedUpdateCheck`.
		const raw = JSON.parse(localStorage.getItem('vega.updateCheck.v1') as string);
		raw.checkedAt = Date.now() - 5 * 60 * 60 * 1000;
		localStorage.setItem('vega.updateCheck.v1', JSON.stringify(raw));
		const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ tag_name: `v${VEGA_VERSION}` }));

		const result = await checkForUpdate(fetchImpl as unknown as typeof fetch);

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ kind: 'up-to-date', current: VEGA_VERSION, latest: VEGA_VERSION });
	});

	test('sin caché previa → SÍ llama a fetch', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ tag_name: `v${VEGA_VERSION}` }));

		await checkForUpdate(fetchImpl as unknown as typeof fetch);

		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	test('force:true ignora una caché reciente y comprueba igualmente (botón "Comprobar" de /settings)', async () => {
		writeCachedUpdateCheck({ kind: 'up-to-date', current: VEGA_VERSION, latest: VEGA_VERSION });
		const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ tag_name: `v${VEGA_VERSION}` }));

		await checkForUpdate(fetchImpl as unknown as typeof fetch, { force: true });

		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	test('localStorage corrupto en la lectura del TTL → cae a red, no lanza (checkForUpdate sigue funcionando)', async () => {
		localStorage.setItem('vega.updateCheck.v1', '{ esto no es JSON');
		const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ tag_name: `v${VEGA_VERSION}` }));

		const result = await checkForUpdate(fetchImpl as unknown as typeof fetch);

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(result.kind).toBe('up-to-date');
	});
});
