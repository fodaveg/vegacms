/**
 * Suite A.6 (§7 del contrato P3): `resolveBackendUrl` (§3.7, D-P3.5-a). Same-origin por
 * defecto; override por `vega.config.json`; config inválida → fallback a same-origin.
 */

import { describe, expect, test } from 'vitest';
import { resolveBackendUrl } from '$lib/session/backend-config';

const ORIGIN = 'https://mysite.example';

describe('resolveBackendUrl', () => {
	test('sin config → same-origin', () => {
		expect(resolveBackendUrl({ origin: ORIGIN, config: null })).toBe(ORIGIN);
	});

	test('config sin backendUrl → same-origin', () => {
		expect(resolveBackendUrl({ origin: ORIGIN, config: {} })).toBe(ORIGIN);
	});

	test('config con backendUrl válida → override', () => {
		expect(
			resolveBackendUrl({ origin: ORIGIN, config: { backendUrl: 'https://pb.example.com' } })
		).toBe('https://pb.example.com');
	});

	test('config con backendUrl inválida → fallback a same-origin (nunca lanza)', () => {
		expect(resolveBackendUrl({ origin: ORIGIN, config: { backendUrl: 'no-es-una-url' } })).toBe(
			ORIGIN
		);
		expect(resolveBackendUrl({ origin: ORIGIN, config: { backendUrl: '' } })).toBe(ORIGIN);
	});

	test('host:puerto sin protocolo http(s) → fallback (no es una URL de backend válida)', () => {
		// `new URL('pb.example.com:8090')` NO lanza (WHATWG lo lee como esquema opaco); exigir
		// http(s) hace que este typo plausible caiga a same-origin en vez de reventar en Fase 2.
		expect(
			resolveBackendUrl({ origin: ORIGIN, config: { backendUrl: 'pb.example.com:8090' } })
		).toBe(ORIGIN);
	});

	test('backendUrl http:// también es válida (no solo https)', () => {
		expect(
			resolveBackendUrl({ origin: ORIGIN, config: { backendUrl: 'http://localhost:8090' } })
		).toBe('http://localhost:8090');
	});
});
