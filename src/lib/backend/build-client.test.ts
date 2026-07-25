/**
 * Suite de `build-client.ts` (lote "publicación", fase A): `parseBuildStatus` (degradación campo
 * a campo, igual criterio que `project-discovery.test.ts`), `createBuildClient` (`trigger`/
 * `fetchStatus`, cabecera `Authorization` sin `Bearer`, mapeo de HTTP no-2xx) y `pollBuildStatus`
 * (sondeo mientras `running`, parada limpia, back-off ante fallo) con temporizadores falsos.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	createBuildClient,
	parseBuildStatus,
	pollBuildStatus,
	type BuildClient,
	type BuildStatus
} from './build-client';

const RUNNING: BuildStatus = {
	state: 'running',
	startedAt: '2026-07-25T10:00:00.000Z',
	finishedAt: null,
	lastPublishedAt: '2026-07-20T09:00:00.000Z',
	logUrl: null
};

describe('parseBuildStatus', () => {
	test('acepta el documento completo del contrato', () => {
		expect(parseBuildStatus(RUNNING)).toEqual(RUNNING);
	});

	test('campos opcionales ausentes/de tipo inesperado degradan a null, no invalidan el documento', () => {
		expect(parseBuildStatus({ state: 'idle' })).toEqual({
			state: 'idle',
			startedAt: null,
			finishedAt: null,
			lastPublishedAt: null,
			logUrl: null
		});
		expect(parseBuildStatus({ state: 'ok', logUrl: 42 })).toMatchObject({ logUrl: null });
	});

	test('"state" fuera del vocabulario o documento sin forma → null', () => {
		expect(parseBuildStatus({ state: 'building' })).toBeNull();
		expect(parseBuildStatus(null)).toBeNull();
		expect(parseBuildStatus('running')).toBeNull();
		expect(parseBuildStatus({})).toBeNull();
	});
});

describe('createBuildClient', () => {
	function fakeFetch(handler: (url: string, init: RequestInit) => Response): typeof fetch {
		return vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
			handler(String(url), init ?? {})
		) as unknown as typeof fetch;
	}

	test('trigger(): POST {apiUrl}/trigger con Authorization sin "Bearer", devuelve el id', async () => {
		let seenUrl = '';
		let seenInit: RequestInit = {};
		const fetcher = fakeFetch((url, init) => {
			seenUrl = url;
			seenInit = init;
			return new Response(JSON.stringify({ id: 'run-1' }), { status: 202 });
		});
		const client = createBuildClient({
			apiUrl: 'https://pb.test/api/vega-build/',
			token: 'tok-1',
			fetcher
		});

		await expect(client.trigger()).resolves.toEqual({ id: 'run-1' });
		expect(seenUrl).toBe('https://pb.test/api/vega-build/trigger');
		expect(seenInit.method).toBe('POST');
		expect((seenInit.headers as Record<string, string>).Authorization).toBe('tok-1');
	});

	test('fetchStatus(): GET {apiUrl}/status, parsea con parseBuildStatus', async () => {
		const fetcher = fakeFetch(() => new Response(JSON.stringify(RUNNING), { status: 200 }));
		const client = createBuildClient({
			apiUrl: 'https://pb.test/api/vega-build',
			token: 'tok',
			fetcher
		});

		await expect(client.fetchStatus()).resolves.toEqual(RUNNING);
	});

	test('HTTP no-2xx rechaza con un Error legible, nunca un VegaError (cliente ajeno al puerto)', async () => {
		const fetcher = fakeFetch(() => new Response('nope', { status: 503 }));
		const client = createBuildClient({
			apiUrl: 'https://pb.test/api/vega-build',
			token: 'tok',
			fetcher
		});

		await expect(client.fetchStatus()).rejects.toThrow(/503/);
	});

	test('trigger() sin "id" válido en la respuesta rechaza', async () => {
		const fetcher = fakeFetch(() => new Response(JSON.stringify({}), { status: 202 }));
		const client = createBuildClient({
			apiUrl: 'https://pb.test/api/vega-build',
			token: 'tok',
			fetcher
		});

		await expect(client.trigger()).rejects.toThrow(/id/);
	});

	test('fetchStatus() con forma inesperada rechaza en vez de inventar un estado', async () => {
		const fetcher = fakeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
		const client = createBuildClient({
			apiUrl: 'https://pb.test/api/vega-build',
			token: 'tok',
			fetcher
		});

		await expect(client.fetchStatus()).rejects.toThrow(/forma inesperada/);
	});
});

describe('pollBuildStatus', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function fakeClient(statuses: BuildStatus[], errors: unknown[] = []): { client: BuildClient } {
		let calls = 0;
		const client: BuildClient = {
			trigger: vi.fn(),
			async fetchStatus() {
				const index = calls;
				calls += 1;
				if (errors[index]) throw errors[index];
				return statuses[Math.min(index, statuses.length - 1)];
			}
		};
		return { client };
	}

	test('sondea de inmediato y se detiene sola al llegar a un estado terminal', async () => {
		const { client } = fakeClient([RUNNING, { ...RUNNING, state: 'ok' }]);
		const onStatus = vi.fn();

		pollBuildStatus(client, { onStatus, intervalMs: 1000 });

		await vi.advanceTimersByTimeAsync(0); // primer sondeo, inmediato
		expect(onStatus).toHaveBeenCalledTimes(1);
		expect(onStatus).toHaveBeenLastCalledWith(RUNNING);

		await vi.advanceTimersByTimeAsync(1000); // sigue 'running' → se reprograma
		expect(onStatus).toHaveBeenCalledTimes(2);
		expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'ok' }));

		// Estado terminal: NINGÚN sondeo más, por mucho que avance el reloj.
		await vi.advanceTimersByTimeAsync(60000);
		expect(onStatus).toHaveBeenCalledTimes(2);
	});

	test('stop() detiene el sondeo sin más llamadas (no deja un temporizador huérfano)', async () => {
		const { client } = fakeClient([RUNNING, RUNNING, RUNNING]);
		const onStatus = vi.fn();

		const stop = pollBuildStatus(client, { onStatus, intervalMs: 1000 });
		await vi.advanceTimersByTimeAsync(0);
		expect(onStatus).toHaveBeenCalledTimes(1);

		stop();
		await vi.advanceTimersByTimeAsync(10000);
		expect(onStatus).toHaveBeenCalledTimes(1);
	});

	test('un fallo de fetchStatus() no detiene el sondeo: reintenta con back-off exponencial acotado', async () => {
		const { client } = fakeClient(
			[RUNNING, RUNNING, { ...RUNNING, state: 'ok' }],
			[undefined, new Error('blip de red')]
		);
		const onStatus = vi.fn();
		const onError = vi.fn();

		pollBuildStatus(client, { onStatus, onError, intervalMs: 1000, maxIntervalMs: 5000 });

		await vi.advanceTimersByTimeAsync(0); // #1 éxito (RUNNING)
		expect(onStatus).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1000); // #2 falla
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onStatus).toHaveBeenCalledTimes(1); // no se notificó estado en el fallo

		await vi.advanceTimersByTimeAsync(2000); // back-off x2 = 2000ms → #3 éxito, estado terminal
		expect(onStatus).toHaveBeenCalledTimes(2);
		expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'ok' }));

		await vi.advanceTimersByTimeAsync(60000);
		expect(onStatus).toHaveBeenCalledTimes(2); // terminal: no se reprograma más
	});
});
