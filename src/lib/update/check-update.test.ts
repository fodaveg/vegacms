/**
 * `compareSemver`/`checkForUpdate` (P8, ver la cabecera de `check-update.ts`). `checkForUpdate`
 * se testea con un `fetchImpl` mockeado (nunca red real) — entorno 'server' (Node, sin
 * `localStorage`): la escritura de caché de `writeCachedUpdateCheck` es un no-op ahí (mismo
 * guard SSR-safe que el resto del repo), así que estos tests solo comprueban el `UpdateStatus`
 * devuelto. El round-trip de caché en `localStorage` real vive en `storage.dom.test.ts`.
 */

import { describe, expect, test, vi } from 'vitest';
import { checkForUpdate, compareSemver, VEGA_REPO_SLUG } from './check-update';
import { VEGA_VERSION } from '$lib/version';

describe('compareSemver', () => {
	test('mayor por el segmento MAJOR', () => {
		expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
		expect(compareSemver('1.9.9', '2.0.0')).toBe(-1);
	});

	test('mayor por el segmento MINOR', () => {
		expect(compareSemver('1.3.0', '1.2.9')).toBe(1);
		expect(compareSemver('1.2.9', '1.3.0')).toBe(-1);
	});

	test('mayor por el segmento PATCH', () => {
		expect(compareSemver('1.2.4', '1.2.3')).toBe(1);
		expect(compareSemver('1.2.3', '1.2.4')).toBe(-1);
	});

	test('iguales → 0', () => {
		expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
	});

	test('longitudes distintas: segmentos ausentes cuentan como 0', () => {
		expect(compareSemver('1.2', '1.2.0')).toBe(0);
		expect(compareSemver('1.2.1', '1.2')).toBe(1);
		expect(compareSemver('2', '1.9.9')).toBe(1);
	});

	test('ignora pre-release/build metadata (MVP) sin romper', () => {
		expect(compareSemver('1.2.3-beta.1', '1.2.3')).toBe(0);
		expect(compareSemver('1.2.3+build5', '1.2.3')).toBe(0);
		expect(compareSemver('1.3.0-rc.1', '1.2.9')).toBe(1);
	});
});

/** Construye un `Response`-like mínimo, suficiente para lo que `checkForUpdate` le pide. */
function fakeResponse(opts: { ok: boolean; status?: number; body?: unknown }): Response {
	return {
		ok: opts.ok,
		status: opts.status ?? (opts.ok ? 200 : 500),
		json: () =>
			opts.body instanceof Error ? Promise.reject(opts.body) : Promise.resolve(opts.body)
	} as unknown as Response;
}

describe('checkForUpdate', () => {
	test('release más nueva → update-available, con releaseUrl y sin la "v" en `latest`', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			fakeResponse({
				ok: true,
				body: {
					tag_name: 'v999.0.0',
					html_url: 'https://github.com/fodaveg/vegacms/releases/tag/v999.0.0'
				}
			})
		);
		const result = await checkForUpdate(fetchImpl as unknown as typeof fetch);
		expect(result).toEqual({
			kind: 'update-available',
			current: VEGA_VERSION,
			latest: '999.0.0',
			releaseUrl: 'https://github.com/fodaveg/vegacms/releases/tag/v999.0.0'
		});
		expect(fetchImpl).toHaveBeenCalledWith(
			`https://api.github.com/repos/${VEGA_REPO_SLUG}/releases/latest`,
			expect.objectContaining({
				headers: { Accept: 'application/vnd.github+json' }
			})
		);
	});

	test('release igual a la instalada → up-to-date', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(fakeResponse({ ok: true, body: { tag_name: VEGA_VERSION } }));
		const result = await checkForUpdate(fetchImpl as unknown as typeof fetch);
		expect(result).toEqual({ kind: 'up-to-date', current: VEGA_VERSION, latest: VEGA_VERSION });
	});

	test('release más vieja → up-to-date (nunca "downgrade available")', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(fakeResponse({ ok: true, body: { tag_name: 'v0.0.1' } }));
		const result = await checkForUpdate(fetchImpl as unknown as typeof fetch);
		expect(result.kind).toBe('up-to-date');
	});

	test('tag_name sin "v" inicial se acepta tal cual', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(fakeResponse({ ok: true, body: { tag_name: '999.0.0' } }));
		const result = await checkForUpdate(fetchImpl as unknown as typeof fetch);
		expect(result).toMatchObject({ kind: 'update-available', latest: '999.0.0' });
	});

	test('sin releaseUrl en la respuesta → cae a una URL de release construida', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(fakeResponse({ ok: true, body: { tag_name: 'v999.0.0' } }));
		const result = await checkForUpdate(fetchImpl as unknown as typeof fetch);
		expect(result).toMatchObject({
			kind: 'update-available',
			releaseUrl: `https://github.com/${VEGA_REPO_SLUG}/releases/tag/v999.0.0`
		});
	});

	// Segunda barrera (revisión de seguridad del 30 sep 2026): el `html_url` viaja hasta un
	// `<a href>`; solo se enlaza si es, de verdad, una página del repositorio de Vega en GitHub.
	test.each([
		['otro repositorio GitHub', 'https://github.com/otro/otro/releases/tag/v999.0.0'],
		['prefijo de repo', 'https://github.com/fodaveg/vegacms-evil/releases'],
		['prefijo de cadena con otro host', 'https://github.com.evil.example/fodaveg/vegacms'],
		['github.com como usuario de otro host', 'https://github.com@evil.example/'],
		['credenciales delante del host bueno', 'https://alguien@github.com/fodaveg/vegacms'],
		['http sin TLS', 'http://github.com/fodaveg/vegacms/releases'],
		['subdominio', 'https://gist.github.com/fodaveg'],
		['otro puerto', 'https://github.com:8443/fodaveg/vegacms'],
		['esquema javascript', 'javascript:alert(1)'],
		['esquema data', 'data:text/html,<script>alert(1)</script>'],
		['relativa al protocolo', '//evil.example/github.com/'],
		['no parseable', 'esto no es una URL'],
		['cadena vacía', '']
	])('html_url rechazado (%s) → el aviso sigue, sin enlace', async (_caso, htmlUrl) => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				fakeResponse({ ok: true, body: { tag_name: 'v999.0.0', html_url: htmlUrl } })
			);
		const result = await checkForUpdate(fetchImpl as unknown as typeof fetch);
		expect(result).toEqual({
			kind: 'update-available',
			current: VEGA_VERSION,
			latest: '999.0.0',
			releaseUrl: null
		});
	});

	test('html_url que no es un string → se trata como ausente y cae a la URL construida', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				fakeResponse({ ok: true, body: { tag_name: 'v999.0.0', html_url: { href: 'x' } } })
			);
		const result = await checkForUpdate(fetchImpl as unknown as typeof fetch);
		expect(result).toMatchObject({
			releaseUrl: `https://github.com/${VEGA_REPO_SLUG}/releases/tag/v999.0.0`
		});
	});

	test('error de red (fetch rechaza) → error', async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		const result = await checkForUpdate(fetchImpl as unknown as typeof fetch);
		expect(result.kind).toBe('error');
	});

	test('HTTP no-2xx → error', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 404 }));
		const result = await checkForUpdate(fetchImpl as unknown as typeof fetch);
		expect(result).toEqual({ kind: 'error', reason: 'GitHub respondió con el estado 404.' });
	});

	test('JSON malformado (response.json() rechaza) → error', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(fakeResponse({ ok: true, body: new Error('unexpected token') }));
		const result = await checkForUpdate(fetchImpl as unknown as typeof fetch);
		expect(result.kind).toBe('error');
	});

	test('respuesta sin "tag_name" → error', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(fakeResponse({ ok: true, body: { name: 'v1.0.0' } }));
		const result = await checkForUpdate(fetchImpl as unknown as typeof fetch);
		expect(result).toEqual({
			kind: 'error',
			reason: 'La respuesta de GitHub no incluye "tag_name".'
		});
	});
});
