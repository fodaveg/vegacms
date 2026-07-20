/**
 * Suite A.6 (§7 del contrato P3): `resolveBackendUrl` (§3.7, D-P3.5-a; ampliada por el lote L5
 * con el `override` runtime). Same-origin por defecto; override por `vega.config.json`; config
 * inválida → fallback a same-origin; y ahora el tercer nivel: `override` de `localStorage`
 * (§3-tarea1 del lote L5), que gana a los dos anteriores cuando es una URL válida. También cubre
 * el `.trim()` de la URL ganadora (fix de code-review de L5).
 */

import { describe, expect, test } from 'vitest';
import { resolveBackendUrl } from '$lib/session/backend-config';

const ORIGIN = 'https://mysite.example';

describe('resolveBackendUrl', () => {
	test('sin config ni override → same-origin', () => {
		expect(resolveBackendUrl({ origin: ORIGIN, config: null, override: null })).toBe(ORIGIN);
	});

	test('config sin backendUrl, sin override → same-origin', () => {
		expect(resolveBackendUrl({ origin: ORIGIN, config: {}, override: null })).toBe(ORIGIN);
	});

	test('config con backendUrl válida, sin override → gana la config (regresión de comportamiento previo)', () => {
		expect(
			resolveBackendUrl({
				origin: ORIGIN,
				config: { backendUrl: 'https://pb.example.com' },
				override: null
			})
		).toBe('https://pb.example.com');
	});

	test('config con backendUrl inválida, sin override → fallback a same-origin (nunca lanza)', () => {
		expect(
			resolveBackendUrl({ origin: ORIGIN, config: { backendUrl: 'no-es-una-url' }, override: null })
		).toBe(ORIGIN);
		expect(resolveBackendUrl({ origin: ORIGIN, config: { backendUrl: '' }, override: null })).toBe(
			ORIGIN
		);
	});

	test('host:puerto sin protocolo http(s), sin override → fallback (no es una URL de backend válida)', () => {
		// `new URL('pb.example.com:8090')` NO lanza (WHATWG lo lee como esquema opaco); exigir
		// http(s) hace que este typo plausible caiga a same-origin en vez de reventar en Fase 2.
		expect(
			resolveBackendUrl({
				origin: ORIGIN,
				config: { backendUrl: 'pb.example.com:8090' },
				override: null
			})
		).toBe(ORIGIN);
	});

	test('backendUrl http:// también es válida (no solo https), sin override', () => {
		expect(
			resolveBackendUrl({
				origin: ORIGIN,
				config: { backendUrl: 'http://localhost:8090' },
				override: null
			})
		).toBe('http://localhost:8090');
	});

	// ————— Override runtime (lote L5, §3-tarea1) —————

	test('override válido gana a config y a origin (mayor precedencia)', () => {
		expect(
			resolveBackendUrl({
				origin: ORIGIN,
				config: { backendUrl: 'https://pb-del-config.example.com' },
				override: 'https://pb-del-override.example.com'
			})
		).toBe('https://pb-del-override.example.com');
	});

	test('override válido gana a origin cuando no hay config', () => {
		expect(
			resolveBackendUrl({ origin: ORIGIN, config: null, override: 'https://pb.example.com' })
		).toBe('https://pb.example.com');
	});

	test('override vacío se ignora → cae a config', () => {
		expect(
			resolveBackendUrl({
				origin: ORIGIN,
				config: { backendUrl: 'https://pb-del-config.example.com' },
				override: ''
			})
		).toBe('https://pb-del-config.example.com');
	});

	test('override malformado (sin http/https) se ignora → cae a config', () => {
		expect(
			resolveBackendUrl({
				origin: ORIGIN,
				config: { backendUrl: 'https://pb-del-config.example.com' },
				override: 'pb.example.com:8090'
			})
		).toBe('https://pb-del-config.example.com');
	});

	test('override inválido y sin config válida → cae a same-origin', () => {
		expect(resolveBackendUrl({ origin: ORIGIN, config: null, override: 'no-es-una-url' })).toBe(
			ORIGIN
		);
	});

	// ————— `.trim()` de la URL ganadora (fix de code-review de L5) —————

	test('override con espacios colgantes → se devuelve recortado', () => {
		expect(
			resolveBackendUrl({ origin: ORIGIN, config: null, override: '  https://pb.example.com  ' })
		).toBe('https://pb.example.com');
	});

	test('config.backendUrl con espacios colgantes → se devuelve recortado', () => {
		expect(
			resolveBackendUrl({
				origin: ORIGIN,
				config: { backendUrl: '  https://pb.example.com  ' },
				override: null
			})
		).toBe('https://pb.example.com');
	});
});
