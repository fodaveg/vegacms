/**
 * Tests unitarios del lote L6a/L6b (`createPocketBaseBackend`): `authCollection` y las
 * `Capabilities` derivadas, en AMBOS modos. `fetch` mockeado a mano (mismo patrón que
 * `media-file-from-url.test.ts`: `vi.stubGlobal('fetch', ...)`, nunca red real) — la SDK
 * `pocketbase` hace SIEMPRE `(t.fetch||fetch)(url, init)` por debajo (verificado en el bundle),
 * así que interceptar el `fetch` global basta para simular un PocketBase entero sin levantar
 * ningún binario ni tocar `tests/contract/` (ese harness sigue siendo la fuente de verdad para
 * el contrato completo contra un PB real).
 *
 * Cobertura:
 * - Modo superuser (default, sin `authCollection`): `capabilities` IDÉNTICAS a antes de L6a,
 *   `login` autentica contra `_superusers`, `listContentTypes` introspecciona `/api/collections`.
 * - Modo editor (`authCollection: 'vega_editors'`): `capabilities.schemaDiscovery`/
 *   `schemaBootstrap` en `false`, `login` autentica contra `vega_editors`, `listContentTypes`
 *   sirve el esquema desde `vega.schemaSnapshot` (cacheando la PROMESA, no solo el valor: dos
 *   llamadas concurrentes deduplican en UNA sola lectura de red) y NUNCA llama a
 *   `/api/collections` (vedado a no-superusers).
 * - Snapshot ausente/malformado en modo editor → `VegaError('backend', …)`, nunca `[]` silencioso.
 * - 404 (colección `vega` ausente) Y 403 (regla de API sin el rol editor) → `VegaError('backend',
 *   …)` los DOS, nunca `auth-expired` (fix de code-review: un 403 real colapsaba al mapeo
 *   genérico de `errors.ts`, pensado solo para superusers, metiendo al editor en bucle de
 *   deslogueo).
 * - Un fallo TRANSITORIO (red) no se cachea permanentemente: una llamada posterior reintenta.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { createPocketBaseBackend } from './index';

const BASE_URL = 'https://pb.example.test';

/** JWT sintético MÍNIMO (base64 estándar, NO url-safe — verificado en el bundle de la SDK:
 *  `getTokenPayload` decodifica el segmento crudo sin traducir `-`/`_`) con un `exp` futuro, para
 *  que `pb.authStore.isValid` (`checkSessionAlive`) dé `true` tras `login`/`restoreSession`. */
function fakeJwt(payload: Record<string, unknown>): string {
	const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64');
	return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

function futureExp(): number {
	return Math.floor(Date.now() / 1000) + 3600;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

/** Campo PB `text` mínimo, con la forma que `mapField` (`schema.ts`) espera. */
function pbTextField(name: string): Record<string, unknown> {
	return {
		name,
		type: 'text',
		system: false,
		primaryKey: false,
		required: false,
		presentable: false,
		hidden: false,
		min: 0,
		max: 0,
		pattern: ''
	};
}

/** Colección PB `base` mínima, con la forma que `mapCollectionsToContentTypes` espera. */
function pbCollection(name: string, fields: Record<string, unknown>[]): Record<string, unknown> {
	return { id: `col_${name}`, name, type: 'base', system: false, fields, indexes: [] };
}

/** Enrutador de `fetch` mockeado por PATHNAME exacto (ignora query string): cada test declara
 *  solo los endpoints que necesita, cualquier otro lanza (nunca "red real" por accidente). */
function stubFetchRoutes(routes: Record<string, () => Response>): { pathnames: string[] } {
	const pathnames: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL) => {
			const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
			const { pathname } = new URL(raw);
			pathnames.push(pathname);
			const handler = routes[pathname];
			if (!handler) throw new Error(`fetch no mockeado en el test: ${pathname}`);
			return handler();
		})
	);
	return { pathnames };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('modo superuser (default, sin authCollection) — camino previo INTACTO', () => {
	test('capabilities IDÉNTICAS a antes de L6a', () => {
		const port = createPocketBaseBackend({ url: BASE_URL });
		expect(port.capabilities).toEqual({
			realtime: true,
			thumbs: true,
			schemaDiscovery: true,
			filePerRecord: true,
			protectedFiles: false,
			schemaBootstrap: true,
			strongAuth: false
		});
	});

	test('login autentica contra _superusers; listContentTypes introspecciona /api/collections', async () => {
		const { pathnames } = stubFetchRoutes({
			'/api/collections/_superusers/auth-with-password': () =>
				jsonResponse({
					token: fakeJwt({ exp: futureExp() }),
					record: { id: 'su1', email: 'admin@example.com', collectionName: '_superusers' }
				}),
			'/api/collections': () =>
				jsonResponse({
					page: 1,
					perPage: 200,
					totalItems: 1,
					totalPages: 1,
					items: [pbCollection('posts', [pbTextField('title')])]
				})
		});

		const port = createPocketBaseBackend({ url: BASE_URL });
		await port.login({ email: 'admin@example.com', password: 'x' });
		expect(pathnames).toContain('/api/collections/_superusers/auth-with-password');

		const types = await port.listContentTypes();
		expect(types.map((t) => t.name)).toEqual(['posts']);
		expect(pathnames).toContain('/api/collections');
	});
});

describe('modo editor (authCollection: vega_editors, L6a/L6b)', () => {
	test('capabilities.schemaDiscovery/schemaBootstrap en false', () => {
		const port = createPocketBaseBackend({ url: BASE_URL, authCollection: 'vega_editors' });
		expect(port.capabilities.schemaDiscovery).toBe(false);
		expect(port.capabilities.schemaBootstrap).toBe(false);
		// El resto de capabilities no depende de quién se autentica (ver `computeCapabilities`).
		expect(port.capabilities.realtime).toBe(true);
		expect(port.capabilities.thumbs).toBe(true);
		expect(port.capabilities.filePerRecord).toBe(true);
		expect(port.capabilities.protectedFiles).toBe(false);
		expect(port.capabilities.strongAuth).toBe(false);
	});

	test('auth fuerte es opt-in y no altera las capabilities del modo editor', () => {
		const port = createPocketBaseBackend({
			url: BASE_URL,
			authCollection: 'vega_editors',
			authApiBasePath: '/api/vega-auth/'
		});
		expect(port.capabilities.strongAuth).toBe(true);
		expect(port.capabilities.schemaDiscovery).toBe(false);
		expect(port.strongAuth).toBeDefined();
	});

	test('login autentica contra vega_editors (no contra _superusers)', async () => {
		const { pathnames } = stubFetchRoutes({
			'/api/collections/vega_editors/auth-with-password': () =>
				jsonResponse({
					token: fakeJwt({ exp: futureExp() }),
					record: { id: 'ed1', email: 'editor@example.com', collectionName: 'vega_editors' }
				})
		});

		const port = createPocketBaseBackend({ url: BASE_URL, authCollection: 'vega_editors' });
		await port.login({ email: 'editor@example.com', password: 'x' });
		expect(pathnames).toEqual(['/api/collections/vega_editors/auth-with-password']);
	});

	test('listContentTypes sirve del schemaSnapshot cacheado, SIN llamar jamás a /api/collections', async () => {
		const snapshotTypes = [{ name: 'posts', readonly: false, fields: [] }];
		const { pathnames } = stubFetchRoutes({
			'/api/collections/vega_editors/auth-with-password': () =>
				jsonResponse({
					token: fakeJwt({ exp: futureExp() }),
					record: { id: 'ed1', email: 'editor@example.com', collectionName: 'vega_editors' }
				}),
			'/api/collections/vega/records': () =>
				jsonResponse({
					page: 1,
					perPage: 1,
					totalItems: 1,
					totalPages: 1,
					items: [{ id: 'vega1', manifest: {}, schemaSnapshot: snapshotTypes }]
				})
		});

		const port = createPocketBaseBackend({ url: BASE_URL, authCollection: 'vega_editors' });
		await port.login({ email: 'editor@example.com', password: 'x' });

		const first = await port.listContentTypes();
		const second = await port.listContentTypes();

		expect(first).toEqual(snapshotTypes);
		expect(second).toEqual(snapshotTypes);
		// Caché: una sola lectura de red del registro `vega`, aunque `listContentTypes` se haya
		// llamado dos veces (ver `cachedEditorSnapshot` en `index.ts`).
		expect(pathnames.filter((p) => p === '/api/collections/vega/records')).toHaveLength(1);
		// El chokepoint reservado a superusers NUNCA se toca en modo editor.
		expect(pathnames).not.toContain('/api/collections');
	});

	test('colección vega ausente (404) → VegaError backend con mensaje accionable', async () => {
		stubFetchRoutes({
			'/api/collections/vega_editors/auth-with-password': () =>
				jsonResponse({
					token: fakeJwt({ exp: futureExp() }),
					record: { id: 'ed1', email: 'editor@example.com', collectionName: 'vega_editors' }
				}),
			'/api/collections/vega/records': () => jsonResponse({ message: 'Missing collection.' }, 404)
		});

		const port = createPocketBaseBackend({ url: BASE_URL, authCollection: 'vega_editors' });
		await port.login({ email: 'editor@example.com', password: 'x' });

		await expect(port.listContentTypes()).rejects.toMatchObject({ kind: 'backend' });
	});

	test('schemaSnapshot ausente (registro vega creado antes de L6b) → VegaError backend, nunca [] silencioso', async () => {
		stubFetchRoutes({
			'/api/collections/vega_editors/auth-with-password': () =>
				jsonResponse({
					token: fakeJwt({ exp: futureExp() }),
					record: { id: 'ed1', email: 'editor@example.com', collectionName: 'vega_editors' }
				}),
			'/api/collections/vega/records': () =>
				jsonResponse({
					page: 1,
					perPage: 1,
					totalItems: 1,
					totalPages: 1,
					items: [{ id: 'vega1', manifest: {} }] // sin `schemaSnapshot` (aditivo: registro previejo)
				})
		});

		const port = createPocketBaseBackend({ url: BASE_URL, authCollection: 'vega_editors' });
		await port.login({ email: 'editor@example.com', password: 'x' });

		await expect(port.listContentTypes()).rejects.toMatchObject({ kind: 'backend' });
	});

	test('schemaSnapshot con forma inesperada (no-array) → VegaError backend', async () => {
		stubFetchRoutes({
			'/api/collections/vega_editors/auth-with-password': () =>
				jsonResponse({
					token: fakeJwt({ exp: futureExp() }),
					record: { id: 'ed1', email: 'editor@example.com', collectionName: 'vega_editors' }
				}),
			'/api/collections/vega/records': () =>
				jsonResponse({
					page: 1,
					perPage: 1,
					totalItems: 1,
					totalPages: 1,
					items: [{ id: 'vega1', manifest: {}, schemaSnapshot: { not: 'an array' } }]
				})
		});

		const port = createPocketBaseBackend({ url: BASE_URL, authCollection: 'vega_editors' });
		await port.login({ email: 'editor@example.com', password: 'x' });

		await expect(port.listContentTypes()).rejects.toMatchObject({ kind: 'backend' });
	});

	test('403 al leer vega (regla de API sin el rol editor) → VegaError backend, NUNCA auth-expired (fix de code-review, bucle de deslogueo)', async () => {
		stubFetchRoutes({
			'/api/collections/vega_editors/auth-with-password': () =>
				jsonResponse({
					token: fakeJwt({ exp: futureExp() }),
					record: { id: 'ed1', email: 'editor@example.com', collectionName: 'vega_editors' }
				}),
			'/api/collections/vega/records': () =>
				jsonResponse({ message: 'Only superusers can perform this action.' }, 403)
		});

		const port = createPocketBaseBackend({ url: BASE_URL, authCollection: 'vega_editors' });
		await port.login({ email: 'editor@example.com', password: 'x' });

		// Con sesión activa, el mapeo GENÉRICO de `errors.ts` (§5) colapsaría un 401/403 a
		// `auth-expired` — el fix de code-review intercepta el 403 de ESTE chokepoint ANTES de
		// llegar ahí, precisamente para que el editor no se deslogueé por un permiso mal puesto.
		await expect(port.listContentTypes()).rejects.toMatchObject({ kind: 'backend' });
	});

	test('dos listContentTypes() concurrentes (sin await intermedio) → UNA sola lectura de red (deduplica la promesa en vuelo)', async () => {
		const snapshotTypes = [{ name: 'posts', readonly: false, fields: [] }];
		const { pathnames } = stubFetchRoutes({
			'/api/collections/vega_editors/auth-with-password': () =>
				jsonResponse({
					token: fakeJwt({ exp: futureExp() }),
					record: { id: 'ed1', email: 'editor@example.com', collectionName: 'vega_editors' }
				}),
			'/api/collections/vega/records': () =>
				jsonResponse({
					page: 1,
					perPage: 1,
					totalItems: 1,
					totalPages: 1,
					items: [{ id: 'vega1', manifest: {}, schemaSnapshot: snapshotTypes }]
				})
		});

		const port = createPocketBaseBackend({ url: BASE_URL, authCollection: 'vega_editors' });
		await port.login({ email: 'editor@example.com', password: 'x' });

		// Sin `await` entre las dos llamadas: la segunda arranca ANTES de que la primera resuelva
		// (mismo patrón que dos widgets del shell pidiendo el esquema en el primer render).
		const [first, second] = await Promise.all([port.listContentTypes(), port.listContentTypes()]);

		expect(first).toEqual(snapshotTypes);
		expect(second).toEqual(snapshotTypes);
		expect(pathnames.filter((p) => p === '/api/collections/vega/records')).toHaveLength(1);
	});

	test('un fallo TRANSITORIO (red) NO se cachea permanentemente: una llamada posterior reintenta', async () => {
		const snapshotTypes = [{ name: 'posts', readonly: false, fields: [] }];
		let attempts = 0;
		stubFetchRoutes({
			'/api/collections/vega_editors/auth-with-password': () =>
				jsonResponse({
					token: fakeJwt({ exp: futureExp() }),
					record: { id: 'ed1', email: 'editor@example.com', collectionName: 'vega_editors' }
				}),
			'/api/collections/vega/records': () => {
				attempts += 1;
				// El PRIMER intento simula la caída de red real (fetch() rechaza, ANTES de que
				// haya respuesta HTTP) — la SDK lo envuelve como `ClientResponseError` con
				// `status: 0`, que `guarded()` mapea a `VegaError('network', …)`.
				if (attempts === 1) throw new TypeError('network down (forzado por el test)');
				return jsonResponse({
					page: 1,
					perPage: 1,
					totalItems: 1,
					totalPages: 1,
					items: [{ id: 'vega1', manifest: {}, schemaSnapshot: snapshotTypes }]
				});
			}
		});

		const port = createPocketBaseBackend({ url: BASE_URL, authCollection: 'vega_editors' });
		await port.login({ email: 'editor@example.com', password: 'x' });

		await expect(port.listContentTypes()).rejects.toMatchObject({ kind: 'network' });
		// Si el fallo se hubiese cacheado (bug), esta segunda llamada repetiría el mismo rechazo
		// SIN volver a tocar la red — en vez de eso, reintenta desde cero y esta vez funciona.
		await expect(port.listContentTypes()).resolves.toEqual(snapshotTypes);
		expect(attempts).toBe(2);
	});
});
