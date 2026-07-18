/**
 * `describeBackendContract` (§10 del contrato): la suite de contrato parametrizada. Corre
 * IDÉNTICA contra `createMemoryBackend(fixtureSeed)` (ver `memory.contract.test.ts`) y, en
 * Fase 2, contra un PocketBase real — sin reescribir ni un test, solo pasando otro `makePort`.
 *
 * Los casos que dependen de una capability que el adaptador bajo prueba no tiene se SALTAN
 * declarándolo (`test.skip` visible en el reporter), nunca desaparecen en silencio.
 */

import { describe, expect, test } from 'vitest';
import type {
	BackendPort,
	Capabilities,
	CollectionSpec,
	RecordEvent,
	Session,
	VegaErrorKind
} from '$lib/backend';
import { VegaError, VEGA_COLLECTION } from '$lib/backend';
import {
	CAT_ALPHA,
	CAT_BETA,
	CAT_GAMMA,
	FIXTURE_ADMIN_EMAIL,
	FIXTURE_ADMIN_PASSWORD,
	KS_ALPHA,
	KS_BRAVO,
	KS_CHARLIE,
	KS_DELTA,
	KS_ECHO
} from './fixture';

export type MakePort = (opts?: { sessionTtlMs?: number }) => BackendPort | Promise<BackendPort>;

/**
 * Hooks SOLO para adaptadores con transporte real (§10.7/§9.4): construir un puerto que no
 * puede alcanzar el servidor, y uno cuya siguiente respuesta 2xx llega con forma corrupta.
 * `memory` no los provee (no tiene transporte) y esos casos se saltan declarándolo.
 */
export interface TransportFailureHooks {
	makeUnreachablePort(): BackendPort | Promise<BackendPort>;
	makeCorruptResponsePort(): Promise<{ port: BackendPort; cleanup: () => Promise<void> }>;
}

export interface ContractOptions {
	/** Nombre del adaptador bajo prueba (para los títulos de los tests). */
	name: string;
	/** Capabilities del adaptador — se usan para saltar (no ocultar) los casos que no aplican. */
	capabilities: Capabilities;
	transportFailures?: TransportFailureHooks;
	/**
	 * Cuánto esperar para que un `sessionTtlMs` dado a `makePort` haya vencido de verdad.
	 * Default 30ms (memory usa TTLs en milisegundos, arbitrarios). PB real solo permite fijar
	 * la duración del token del superuser a nivel de colección (mínimo 10s) — su harness la
	 * deja pineada y este valor pasa a ser ~11000.
	 */
	authExpiryWaitMs?: number;
	/**
	 * `true` si un `number` NUNCA omitido/vacío llega como `0` en vez de `null` (§2.1: "PB
	 * devuelve 0 para vacío solo si el campo lo fuerza"). Es una limitación real de PB —
	 * columna SQLite `NOT NULL DEFAULT 0`, verificado contra 0.39.6: NINGUNA config de campo
	 * number logra que PB devuelva `null` para un campo omitido — no un bug del adaptador
	 * (que "no inventa ceros": si PB dice 0, es 0). `memory` sí puede representar `null` de
	 * verdad y lo hace, así que el único `expect` que depende de esto (§10.3) se ramifica por
	 * esta opción en vez de forzar una paridad que PB no puede dar.
	 */
	numberFieldDefaultsToZero?: boolean;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Espera activa con timeout, en vez de un `sleep` fijo: memory despacha en microtask (casi
 * instantáneo), pero PB real entrega eventos por SSE con latencia de red de verdad. Un
 * `sleep(0)` bastaba para memory y NUNCA habría bastado para PB.
 */
async function waitUntil(
	predicate: () => boolean,
	timeoutMs = 2000,
	intervalMs = 20
): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) return; // se deja que la aserción de después falle con detalle
		await sleep(intervalMs);
	}
}

async function login(port: BackendPort): Promise<Session> {
	return port.login({ email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD });
}

function ids(records: Array<{ id: string }>): string[] {
	return records.map((r) => r.id);
}

export function describeBackendContract(makePort: MakePort, opts: ContractOptions): void {
	const { capabilities } = opts;

	/**
	 * Todo lo que NO es el propio bloque `auth` opera con la sesión de superuser YA establecida
	 * (§4.1, D1: v1 solo modela sesión de superuser). `memory` tolera operar sin login (nunca
	 * lo exigió); PB real no: cualquier operación de esquema/registros sin sesión responde
	 * 401/403 ("requires valid record authorization token") que el adaptador mapea a
	 * `forbidden`. Antes de este fix, la falta de login aquí colaba en `memory` (falso verde)
	 * y reventaba TODA la suite contra PB real — no era un bug del adaptador, era un hueco de
	 * la propia suite compartida (§10).
	 */
	async function makeAuthedPort(...args: Parameters<MakePort>): Promise<BackendPort> {
		const port = await makePort(...args);
		await login(port);
		return port;
	}

	describe(`BackendPort contract — ${opts.name}`, () => {
		// ————————————————————————————————————————————————————————————— 1. Auth —————

		describe('auth', () => {
			test('login ok devuelve Session con user/email', async () => {
				const port = await makePort();
				const session = await login(port);
				expect(session.user.email).toBe(FIXTURE_ADMIN_EMAIL);
				expect(session.token).toBeTruthy();
				expect(port.currentSession()?.token).toBe(session.token);
			});

			test('login con credenciales malas → forbidden (mensaje neutro)', async () => {
				const port = await makePort();
				await expect(
					port.login({ email: FIXTURE_ADMIN_EMAIL, password: 'wrong-password' })
				).rejects.toMatchObject({ kind: 'forbidden' satisfies VegaErrorKind });
			});

			test('logout limpia la sesión y emite el evento', async () => {
				const port = await makePort();
				await login(port);
				const events: Array<[Session | null, string]> = [];
				port.onAuthChange((s, reason) => events.push([s, reason]));

				await expect(port.logout()).resolves.toBeUndefined();
				expect(port.currentSession()).toBeNull();
				expect(events.at(-1)).toEqual([null, 'logout']);
			});

			test('logout nunca lanza aunque no haya sesión', async () => {
				const port = await makePort();
				await expect(port.logout()).resolves.toBeUndefined();
			});

			test('restoreSession con sesión activa devuelve Session + evento restored', async () => {
				const port = await makePort();
				await login(port);
				const reasons: string[] = [];
				port.onAuthChange((_s, reason) => reasons.push(reason));

				const restored = await port.restoreSession();
				expect(restored?.user.email).toBe(FIXTURE_ADMIN_EMAIL);
				expect(reasons).toContain('restored');
			});

			test('restoreSession sin sesión previa devuelve null sin lanzar', async () => {
				const port = await makePort();
				// Asegura estado limpio: algunos adaptadores persisten el token fuera de la
				// instancia (PB usa localStorage/fallback compartido por host, a propósito, para
				// sobrevivir a un reload real) — logout() siempre limpia, nunca lanza.
				await port.logout();
				await expect(port.restoreSession()).resolves.toBeNull();
			});

			test(
				'restoreSession con sesión caducada limpia y devuelve null sin lanzar',
				async () => {
					const port = await makePort({ sessionTtlMs: 10 });
					await login(port);
					await sleep(opts.authExpiryWaitMs ?? 30);
					const reasons: string[] = [];
					port.onAuthChange((_s, reason) => reasons.push(reason));

					await expect(port.restoreSession()).resolves.toBeNull();
					expect(port.currentSession()).toBeNull();
					expect(reasons).toHaveLength(0);
				},
				// Default de vitest (5000ms) no basta cuando `authExpiryWaitMs` es el de PB real
				// (~13000ms: el token de superuser en PB solo se puede pinear a 10s mínimo, ver
				// `pocketbase.contract.test.ts`). `memory` usa 30ms por defecto, muy por debajo.
				(opts.authExpiryWaitMs ?? 30) + 5000
			);

			test(
				'operación tras expirar → auth-expired + evento expired exactamente una vez, con 2 en vuelo',
				async () => {
					const port = await makePort({ sessionTtlMs: 10 });
					await login(port);
					await sleep(opts.authExpiryWaitMs ?? 30);

					const reasons: string[] = [];
					port.onAuthChange((_s, reason) => reasons.push(reason));

					const [first, second] = await Promise.allSettled([
						port.list('category'),
						port.get('category', CAT_ALPHA)
					]);

					expect(first.status).toBe('rejected');
					expect(second.status).toBe('rejected');
					if (first.status === 'rejected')
						expect((first.reason as VegaError).kind).toBe('auth-expired');
					if (second.status === 'rejected')
						expect((second.reason as VegaError).kind).toBe('auth-expired');
					expect(reasons.filter((r) => r === 'expired')).toHaveLength(1);
					expect(port.currentSession()).toBeNull();
				},
				(opts.authExpiryWaitMs ?? 30) + 5000
			);
		});

		// ——————————————————————————————————————————————————————————— 2. Esquema —————

		describe('schema', () => {
			test('listContentTypes incluye los tipos sembrados en orden alfabético', async () => {
				const port = await makeAuthedPort();
				const types = await port.listContentTypes();
				const names = types.map((t) => t.name);
				expect(names).toEqual([...names].sort());
				expect(names).toEqual(
					expect.arrayContaining(['category', 'category_view', 'kitchen_sink'])
				);
			});

			test('la vista de solo lectura llega con readonly: true; el resto, false', async () => {
				const port = await makeAuthedPort();
				const types = await port.listContentTypes();
				expect(types.find((t) => t.name === 'category_view')?.readonly).toBe(true);
				expect(types.find((t) => t.name === 'kitchen_sink')?.readonly).toBe(false);
			});

			test('mapeo campo a campo del kitchen sink (§6): tipo, subtype, readonly, config', async () => {
				const port = await makeAuthedPort();
				const types = await port.listContentTypes();
				const ks = types.find((t) => t.name === 'kitchen_sink')!;
				const byName = new Map(ks.fields.map((f) => [f.name, f]));

				expect(byName.get('title')).toMatchObject({
					type: 'text',
					subtype: 'plain',
					required: true
				});
				expect(byName.get('body')).toMatchObject({ type: 'richtext', subtype: 'html' });
				expect(byName.get('rating')).toMatchObject({
					type: 'number',
					integer: true,
					min: 0,
					max: 5
				});
				expect(byName.get('createdAt')).toMatchObject({ type: 'date', readonly: true });
				expect(byName.get('status')).toMatchObject({ type: 'select', multiple: false });
				expect(byName.get('tags')).toMatchObject({ type: 'select', multiple: true, maxSelect: 2 });
				expect(byName.get('category')).toMatchObject({
					type: 'relation',
					target: 'category',
					multiple: false
				});
				expect(byName.get('categories')).toMatchObject({
					type: 'relation',
					target: 'category',
					multiple: true
				});
				expect(byName.get('cover')).toMatchObject({ type: 'file', multiple: false });
				expect(byName.get('gallery')).toMatchObject({ type: 'file', multiple: true });
				expect(byName.get('metadata')).toMatchObject({ type: 'json' });
				expect(byName.get('location')).toMatchObject({
					type: 'unsupported',
					backendType: 'geoPoint'
				});
			});
		});

		// ————————————————————————————————————————————————————— 3. CRUD + normalización —————

		describe('crud + normalización', () => {
			test('create→get round-trip: los vacíos normalizan según §2.1', async () => {
				const port = await makeAuthedPort();
				const created = await port.create('kitchen_sink', { title: 'Solo el título' });

				expect(created.values.title).toBe('Solo el título');
				expect(created.values.body).toBe('');
				expect(created.values.rating).toEqual(opts.numberFieldDefaultsToZero ? 0 : null);
				expect(created.values.published).toBe(false);
				expect(created.values.publishedAt).toBeNull();
				expect(created.values.status).toBeNull();
				expect(created.values.tags).toEqual([]);
				expect(created.values.category).toBeNull();
				expect(created.values.categories).toEqual([]);
				expect(created.values.cover).toBeNull();
				expect(created.values.gallery).toEqual([]);
				expect(created.values.metadata).toBeNull();
				// readonly: el backend lo rellena solo, nunca undefined.
				expect(typeof created.values.createdAt).toBe('string');

				const fetched = await port.get('kitchen_sink', created.id);
				expect(fetched).toEqual(created);
			});

			test('update parcial no toca los campos ausentes', async () => {
				const port = await makeAuthedPort();
				const created = await port.create('kitchen_sink', { title: 'Original', rating: 2 });
				const updated = await port.update('kitchen_sink', created.id, { title: 'Cambiado' });

				expect(updated.values.title).toBe('Cambiado');
				expect(updated.values.rating).toBe(2);
			});

			test('delete real: el registro deja de existir', async () => {
				const port = await makeAuthedPort();
				const created = await port.create('kitchen_sink', { title: 'A borrar' });
				await port.delete('kitchen_sink', created.id);
				await expect(port.get('kitchen_sink', created.id)).rejects.toMatchObject({
					kind: 'not-found'
				});
			});

			test('get/update/delete de id inexistente → not-found', async () => {
				const port = await makeAuthedPort();
				await expect(port.get('kitchen_sink', 'no-existe')).rejects.toMatchObject({
					kind: 'not-found'
				});
				await expect(
					port.update('kitchen_sink', 'no-existe', { title: 'x' })
				).rejects.toMatchObject({
					kind: 'not-found'
				});
				await expect(port.delete('kitchen_sink', 'no-existe')).rejects.toMatchObject({
					kind: 'not-found'
				});
			});

			test('list/get/create/update/delete/subscribe de tipo inexistente → not-found', async () => {
				const port = await makeAuthedPort();
				await expect(port.list('no_existe')).rejects.toMatchObject({ kind: 'not-found' });
				await expect(port.get('no_existe', 'x')).rejects.toMatchObject({ kind: 'not-found' });
				await expect(port.create('no_existe', {})).rejects.toMatchObject({ kind: 'not-found' });
				await expect(port.update('no_existe', 'x', {})).rejects.toMatchObject({
					kind: 'not-found'
				});
				await expect(port.delete('no_existe', 'x')).rejects.toMatchObject({ kind: 'not-found' });
				await expect(port.subscribe('no_existe', () => {})).rejects.toMatchObject({
					kind: 'not-found'
				});
			});

			test('create con required vacío → validation con fieldErrors.title', async () => {
				const port = await makeAuthedPort();
				await expect(port.create('kitchen_sink', {})).rejects.toMatchObject({
					kind: 'validation',
					fieldErrors: { title: { code: 'validation_required' } }
				});
			});

			test("required no se puede eludir con '' en date/select/relation single (bug corregido)", async () => {
				const port = await makeAuthedPort();
				// Antes de la corrección, el valor "provisto" se validaba SIN normalizar:
				// `isEmptyValue` solo trata '' como vacío para texto, así que un '' explícito en
				// date/select/relation single NO contaba como vacío y `required` no saltaba.
				await expect(
					port.create('required_probe', { dueDate: '', level: 'low', owner: CAT_ALPHA })
				).rejects.toMatchObject({
					kind: 'validation',
					fieldErrors: { dueDate: { code: 'validation_required' } }
				});

				await expect(
					port.create('required_probe', {
						dueDate: '2026-01-01T00:00:00.000Z',
						level: '',
						owner: CAT_ALPHA
					})
				).rejects.toMatchObject({
					kind: 'validation',
					fieldErrors: { level: { code: 'validation_required' } }
				});

				await expect(
					port.create('required_probe', {
						dueDate: '2026-01-01T00:00:00.000Z',
						level: 'low',
						owner: ''
					})
				).rejects.toMatchObject({
					kind: 'validation',
					fieldErrors: { owner: { code: 'validation_required' } }
				});

				// Control: con valores reales, la creación funciona.
				const ok = await port.create('required_probe', {
					dueDate: '2026-01-01T00:00:00.000Z',
					level: 'low',
					owner: CAT_ALPHA
				});
				expect(ok.values.dueDate).toBe('2026-01-01T00:00:00.000Z');
			});

			test('pattern violado → validation con fieldErrors.slug', async () => {
				const port = await makeAuthedPort();
				await expect(
					port.create('kitchen_sink', { title: 'x', slug: 'NO ES UN SLUG!!' })
				).rejects.toMatchObject({
					kind: 'validation',
					fieldErrors: { slug: { code: 'validation_invalid_format' } }
				});
			});

			test('select fuera de options → validation con fieldErrors.status', async () => {
				const port = await makeAuthedPort();
				await expect(
					port.create('kitchen_sink', { title: 'x', status: 'no-existe' })
				).rejects.toMatchObject({
					kind: 'validation',
					fieldErrors: { status: { code: 'validation_invalid_value' } }
				});
			});

			test('relation a id inexistente → validation con fieldErrors.category', async () => {
				const port = await makeAuthedPort();
				await expect(
					port.create('kitchen_sink', { title: 'x', category: 'no-existe' })
				).rejects.toMatchObject({
					kind: 'validation',
					fieldErrors: { category: { code: 'validation_missing_rel_records' } }
				});
			});

			test('escribir readonly/unsupported/desconocido → validation local (§4.3)', async () => {
				const port = await makeAuthedPort();
				await expect(
					port.create('kitchen_sink', { title: 'x', createdAt: '2020-01-01T00:00:00.000Z' })
				).rejects.toMatchObject({
					kind: 'validation',
					fieldErrors: { createdAt: { code: 'vega_readonly_field' } }
				});

				await expect(
					port.create('kitchen_sink', { title: 'x', location: { lat: 0, lng: 0 } })
				).rejects.toMatchObject({
					kind: 'validation',
					fieldErrors: { location: { code: 'vega_unsupported_field' } }
				});

				await expect(
					port.create('kitchen_sink', { title: 'x', noExiste: 1 })
				).rejects.toMatchObject({
					kind: 'validation',
					fieldErrors: { noExiste: { code: 'vega_unknown_field' } }
				});
			});

			test('escribir en un ContentType.readonly (view) → forbidden', async () => {
				const port = await makeAuthedPort();
				await expect(port.create('category_view', { name: 'x' })).rejects.toMatchObject({
					kind: 'forbidden'
				});
				await expect(port.update('category_view', 'view-1', { name: 'x' })).rejects.toMatchObject({
					kind: 'forbidden'
				});
				await expect(port.delete('category_view', 'view-1')).rejects.toMatchObject({
					kind: 'forbidden'
				});
			});
		});

		// ——————————————————————————————————————————————————————————— 4. Query —————

		describe('query', () => {
			test('eq', async () => {
				const port = await makeAuthedPort();
				const page = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'title', op: 'eq', value: 'Zebra' }
				});
				expect(ids(page.items)).toEqual([KS_DELTA]);
			});

			test('neq', async () => {
				const port = await makeAuthedPort();
				const page = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'status', op: 'neq', value: 'draft' }
				});
				expect(ids(page.items)).toEqual([KS_ALPHA, KS_BRAVO, KS_CHARLIE, KS_ECHO]);
			});

			test('gt / gte / lt / lte numéricos, con null fuera de la comparación', async () => {
				const port = await makeAuthedPort();
				const gt = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'rating', op: 'gt', value: 1 }
				});
				expect(ids(gt.items)).toEqual([KS_ALPHA, KS_DELTA]);

				const gte = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'rating', op: 'gte', value: 1 }
				});
				expect(ids(gte.items)).toEqual([KS_ALPHA, KS_DELTA, KS_ECHO]);

				// KS_BRAVO tiene `rating: null` en el fixture (a propósito, para probar que un
				// vacío nunca "cuela" en una comparación numérica). En PB real eso es
				// irrepresentable (`numberFieldDefaultsToZero`, §2.1): el `null` se guarda como
				// `0` de verdad, así que BRAVO pasa a ser indistinguible de CHARLIE (que sí tiene
				// `rating: 0` real) y participa correctamente en `lt`/`lte` como el 0 que ahora es.
				const lt = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'rating', op: 'lt', value: 3 }
				});
				expect(ids(lt.items)).toEqual(
					opts.numberFieldDefaultsToZero ? [KS_BRAVO, KS_CHARLIE, KS_ECHO] : [KS_CHARLIE, KS_ECHO]
				);

				const lte = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'rating', op: 'lte', value: 3 }
				});
				expect(ids(lte.items)).toEqual(
					opts.numberFieldDefaultsToZero
						? [KS_BRAVO, KS_CHARLIE, KS_DELTA, KS_ECHO]
						: [KS_CHARLIE, KS_DELTA, KS_ECHO]
				);
			});

			test('contains: substring case-insensitive', async () => {
				const port = await makeAuthedPort();
				const page = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'title', op: 'contains', value: 'zeb' }
				});
				expect(ids(page.items)).toEqual([KS_DELTA]);
			});

			test('contains: el pliegue de mayúsculas es SOLO ASCII (§4.6, §7)', async () => {
				const port = await makeAuthedPort();
				await port.create('kitchen_sink', { title: 'café' });

				const asciiPrefix = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'title', op: 'contains', value: 'CAF' }
				});
				expect(asciiPrefix.items.some((r) => r.values.title === 'café')).toBe(true);

				const nonAsciiFold = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'title', op: 'contains', value: 'CAFÉ' }
				});
				expect(nonAsciiFold.items.some((r) => r.values.title === 'café')).toBe(false);
			});

			test('select multi: contains comprueba pertenencia a la opción', async () => {
				const port = await makeAuthedPort();
				const page = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'tags', op: 'contains', value: 'b' }
				});
				expect(ids(page.items)).toEqual([KS_ALPHA, KS_DELTA]);
			});

			test('in: azúcar de OR de eq; vacío no casa nada (§9.8)', async () => {
				const port = await makeAuthedPort();
				const page = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'status', op: 'in', value: ['draft', 'archived'] }
				});
				expect(ids(page.items)).toEqual([KS_CHARLIE, KS_DELTA]);

				const empty = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'status', op: 'in', value: [] }
				});
				expect(empty.items).toEqual([]);
				expect(empty.totalItems).toBe(0);
			});

			test('relation: eq / in (single) e in (multi)', async () => {
				const port = await makeAuthedPort();
				const eq = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'category', op: 'eq', value: CAT_ALPHA }
				});
				expect(ids(eq.items)).toEqual([KS_ALPHA, KS_ECHO]);

				const inSingle = await port.list('kitchen_sink', {
					filter: {
						kind: 'cond',
						field: 'category',
						op: 'in',
						value: [CAT_ALPHA, CAT_BETA]
					}
				});
				expect(ids(inSingle.items)).toEqual([KS_ALPHA, KS_CHARLIE, KS_ECHO]);

				const inMulti = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'categories', op: 'in', value: [CAT_GAMMA] }
				});
				expect(ids(inMulti.items)).toEqual([KS_CHARLIE]);
			});

			test('relation MÚLTIPLE con eq/neq → validation local (bug corregido: antes colaba y mentía)', async () => {
				const port = await makeAuthedPort();
				// Antes de la corrección, `allowedFilterOps` no bifurcaba `relation` por
				// `multiple` (al contrario que `select`) y `compareEq` asumía que `validateQuery`
				// ya lo habría bloqueado — así que `eq` devolvía 0 resultados y `neq` devolvía
				// TODOS, siempre, sin ningún error. Ahora `relation` multi se comporta como
				// `select` multi: solo `in`/`empty`/`notEmpty`.
				await expect(
					port.list('kitchen_sink', {
						filter: { kind: 'cond', field: 'categories', op: 'eq', value: CAT_ALPHA }
					})
				).rejects.toMatchObject({ kind: 'validation', fieldErrors: { categories: {} } });

				await expect(
					port.list('kitchen_sink', {
						filter: { kind: 'cond', field: 'categories', op: 'neq', value: CAT_ALPHA }
					})
				).rejects.toMatchObject({ kind: 'validation', fieldErrors: { categories: {} } });
			});

			test('empty / notEmpty', async () => {
				const port = await makeAuthedPort();
				const empty = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'category', op: 'empty', value: null }
				});
				expect(ids(empty.items)).toEqual([KS_BRAVO, KS_DELTA]);

				const notEmpty = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'category', op: 'notEmpty', value: null }
				});
				expect(ids(notEmpty.items)).toEqual([KS_ALPHA, KS_CHARLIE, KS_ECHO]);
			});

			test('grupos and/or anidados', async () => {
				const port = await makeAuthedPort();
				const and = await port.list('kitchen_sink', {
					filter: {
						kind: 'group',
						combinator: 'and',
						nodes: [
							{ kind: 'cond', field: 'published', op: 'eq', value: true },
							{ kind: 'cond', field: 'rating', op: 'gte', value: 1 }
						]
					}
				});
				expect(ids(and.items)).toEqual([KS_ALPHA, KS_ECHO]);

				const or = await port.list('kitchen_sink', {
					filter: {
						kind: 'group',
						combinator: 'or',
						nodes: [
							{ kind: 'cond', field: 'status', op: 'eq', value: 'draft' },
							{ kind: 'cond', field: 'status', op: 'eq', value: 'archived' }
						]
					}
				});
				expect(ids(or.items)).toEqual([KS_CHARLIE, KS_DELTA]);
			});

			test('sort multi-clave asc/desc, estable, con nulos en un extremo consistente', async () => {
				const port = await makeAuthedPort();
				const asc = await port.list('kitchen_sink', { sort: [{ field: 'rating', dir: 'asc' }] });
				expect(ids(asc.items)).toEqual([KS_BRAVO, KS_CHARLIE, KS_ECHO, KS_DELTA, KS_ALPHA]);

				const desc = await port.list('kitchen_sink', { sort: [{ field: 'rating', dir: 'desc' }] });
				// Mismo fondo que en el test de gt/gte/lt/lte: en PB, BRAVO (rating null en el
				// fixture) es un 0 real, empatado con CHARLIE. El desempate es SIEMPRE `+id`
				// (`compileSort`, independiente de la dirección del sort principal), así que
				// BRAVO queda antes que CHARLIE también en `desc` — al revés que en `memory`,
				// donde el null se trata como "menor que cualquier número" en ambas direcciones.
				expect(ids(desc.items)).toEqual(
					opts.numberFieldDefaultsToZero
						? [KS_ALPHA, KS_DELTA, KS_ECHO, KS_BRAVO, KS_CHARLIE]
						: [KS_ALPHA, KS_DELTA, KS_ECHO, KS_CHARLIE, KS_BRAVO]
				);

				const multi = await port.list('kitchen_sink', {
					sort: [
						{ field: 'status', dir: 'asc' },
						{ field: 'title', dir: 'asc' }
					]
				});
				expect(ids(multi.items)).toEqual([KS_BRAVO, KS_CHARLIE, KS_DELTA, KS_ALPHA, KS_ECHO]);
			});

			test('paginación: última página parcial, fuera de rango, perPage 1 y 200', async () => {
				const port = await makeAuthedPort();

				const page1 = await port.list('kitchen_sink', { perPage: 2, page: 1 });
				expect(ids(page1.items)).toEqual([KS_ALPHA, KS_BRAVO]);
				expect(page1).toMatchObject({ totalItems: 5, totalPages: 3 });

				const page3 = await port.list('kitchen_sink', { perPage: 2, page: 3 });
				expect(ids(page3.items)).toEqual([KS_ECHO]);

				const beyond = await port.list('kitchen_sink', { perPage: 2, page: 10 });
				expect(beyond.items).toEqual([]);
				expect(beyond).toMatchObject({ totalItems: 5, totalPages: 3 });

				const perPage1 = await port.list('kitchen_sink', { perPage: 1, page: 1 });
				expect(perPage1.items).toHaveLength(1);

				const perPage200 = await port.list('kitchen_sink', { perPage: 200, page: 1 });
				expect(perPage200.items).toHaveLength(5);
			});

			test('inyección: valores con \' " || && ~ % se tratan como datos, nunca como sintaxis', async () => {
				const port = await makeAuthedPort();
				const literal = `Quote ' and " and || && ~ % test`;

				const eq = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'title', op: 'eq', value: literal }
				});
				expect(ids(eq.items)).toEqual([KS_CHARLIE]);

				const contains = await port.list('kitchen_sink', {
					filter: { kind: 'cond', field: 'title', op: 'contains', value: '||' }
				});
				expect(ids(contains.items)).toEqual([KS_CHARLIE]);

				const createdWithInjection = await port.create('kitchen_sink', {
					title: `x' OR '1'='1`,
					slug: 'inyeccion'
				});
				expect(createdWithInjection.values.title).toBe(`x' OR '1'='1`);
			});

			test('query inválida (op/tipo, campo inexistente, sort no escalar, paginación) → validation local', async () => {
				const port = await makeAuthedPort();
				await expect(
					port.list('kitchen_sink', {
						filter: { kind: 'cond', field: 'published', op: 'gt', value: true }
					})
				).rejects.toMatchObject({ kind: 'validation' });

				await expect(
					port.list('kitchen_sink', {
						filter: { kind: 'cond', field: 'no_existe', op: 'eq', value: 1 }
					})
				).rejects.toMatchObject({ kind: 'validation' });

				await expect(
					port.list('kitchen_sink', { sort: [{ field: 'tags', dir: 'asc' }] })
				).rejects.toMatchObject({ kind: 'validation' });

				await expect(port.list('kitchen_sink', { page: 0 })).rejects.toMatchObject({
					kind: 'validation'
				});
				await expect(port.list('kitchen_sink', { perPage: 0 })).rejects.toMatchObject({
					kind: 'validation'
				});
				await expect(port.list('kitchen_sink', { perPage: 201 })).rejects.toMatchObject({
					kind: 'validation'
				});
			});
		});

		// —————————————————————————————————————————————————————————— 5. Ficheros —————

		describe('ficheros', () => {
			test('create con File single y multi; lectura devuelve FileRef y fileUrl sirve el contenido', async () => {
				const port = await makeAuthedPort();
				const cover = new File(['contenido-portada'], 'cover.png', { type: 'image/png' });
				const g1 = new File(['galeria-1'], 'g1.png', { type: 'image/png' });
				const g2 = new File(['galeria-2'], 'g2.png', { type: 'image/png' });

				const created = await port.create('kitchen_sink', {
					title: 'con ficheros',
					cover,
					gallery: [g1, g2]
				});

				expect(typeof created.values.cover).toBe('string');
				expect(Array.isArray(created.values.gallery)).toBe(true);
				expect((created.values.gallery as string[]).length).toBe(2);

				const url = port.fileUrl(created, 'cover', created.values.cover as string);
				expect(url).toBeTruthy();
				const res = await fetch(url);
				const text = await res.text();
				expect(text).toBe('contenido-portada');
			});

			test('reemplazo y borrado por estado-final, con verificación del diff (§4.4)', async () => {
				const port = await makeAuthedPort();
				const g1 = new File(['g1'], 'g1.png');
				const g2 = new File(['g2'], 'g2.png');
				const created = await port.create('kitchen_sink', { title: 'diff', gallery: [g1, g2] });
				const [ref1, ref2] = created.values.gallery as string[];

				const g3 = new File(['g3'], 'g3.png');
				const updated = await port.update('kitchen_sink', created.id, { gallery: [ref1, g3] });
				const finalRefs = updated.values.gallery as string[];

				expect(finalRefs[0]).toBe(ref1); // se conserva, y en el mismo orden
				expect(finalRefs).not.toContain(ref2); // el que ya no aparece, desaparece
				expect(finalRefs[1]).not.toBe(ref2);
				expect(finalRefs).toHaveLength(2);

				const cleared = await port.update('kitchen_sink', created.id, { cover: null });
				expect(cleared.values.cover).toBeNull();
			});

			test('un FileRef ajeno al registro → validation (§4.4/§9.9)', async () => {
				const port = await makeAuthedPort();
				const created = await port.create('kitchen_sink', { title: 'sin ficheros' });
				await expect(
					port.update('kitchen_sink', created.id, { gallery: ['ref-que-no-existe'] })
				).rejects.toMatchObject({ kind: 'validation', fieldErrors: { gallery: {} } });
			});

			test.skipIf(!capabilities.thumbs)(
				'thumb: URL de miniatura distinta del original y fetchable (requiere capability)',
				async () => {
					const port = await makeAuthedPort();
					// PNG 1x1 real (PB necesita bytes de imagen válidos para generar miniatura).
					const pngBytes = Buffer.from(
						'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
						'base64'
					);
					const cover = new File([pngBytes], 'pixel.png', { type: 'image/png' });
					const created = await port.create('kitchen_sink', { title: 'con thumb', cover });
					const ref = created.values.cover as string;

					const original = port.fileUrl(created, 'cover', ref);
					const thumb = port.fileUrl(created, 'cover', ref, {
						thumb: { width: 50, height: 50, fit: 'crop' }
					});
					expect(thumb).not.toBe(original);

					const res = await fetch(thumb);
					expect(res.status).toBe(200);
				}
			);
		});

		// ——————————————————————————————————————————————————————————— 6. Realtime —————

		describe('realtime', () => {
			test.skipIf(!capabilities.realtime)(
				'create/update/delete emiten evento con record normalizado; tras unsubscribe, nada más',
				async () => {
					const port = await makeAuthedPort();
					const events: RecordEvent[] = [];
					const unsubscribe = await port.subscribe('kitchen_sink', (e) => events.push(e));

					const created = await port.create('kitchen_sink', { title: 'realtime' });
					await port.update('kitchen_sink', created.id, { title: 'realtime 2' });
					await port.delete('kitchen_sink', created.id);

					await waitUntil(() => events.length >= 3);

					expect(events.map((e) => e.action)).toEqual(['create', 'update', 'delete']);
					expect(events[0].record.id).toBe(created.id);
					expect(events[2].record.values.title).toBe('realtime 2'); // último estado conocido

					unsubscribe();
					await port.create('kitchen_sink', { title: 'no debería llegar' });
					await waitUntil(() => events.length >= 4, 500); // confirmamos que NO llega un 4º
					expect(events).toHaveLength(3);
				}
			);

			test.skipIf(capabilities.realtime)(
				'sin capability realtime, subscribe rechaza inmediatamente (ley L8)',
				async () => {
					const port = await makeAuthedPort();
					await expect(port.subscribe('kitchen_sink', () => {})).rejects.toMatchObject({
						kind: 'backend'
					});
				}
			);
		});

		// ———————————————————————————————————————————————— 7. ensureCollections (Anexo A) —————

		describe('ensureCollections (Anexo A)', () => {
			function uniqueVegaName(): string {
				// Nombre distinto en cada test: contra PB real el servidor persiste entre tests
				// del mismo fichero (a diferencia de memory, que arranca en blanco cada vez), así
				// que reutilizar un nombre fijo rompería la idempotencia entre tests sin relación.
				return `vega_test_${Math.random().toString(36).slice(2, 10)}`;
			}

			test('capability schemaBootstrap presente (Anexo A.2)', () => {
				expect(capabilities.schemaBootstrap).toBe(true);
			});

			test('crea lo ausente y es idempotente (2ª llamada: created vacío, todo skipped)', async () => {
				const port = await makeAuthedPort();
				const name = uniqueVegaName();
				const spec: CollectionSpec = { name, fields: [{ name: 'note', type: 'text' }] };

				const first = await port.ensureCollections([spec]);
				expect(first.created).toEqual([name]);
				expect(first.skipped).toEqual([]);

				const types = await port.listContentTypes();
				expect(types.some((t) => t.name === name)).toBe(true);

				const second = await port.ensureCollections([spec]);
				expect(second.created).toEqual([]);
				expect(second.skipped).toEqual([name]);
			});

			test('no destructiva: si ya existe, se omite SIN tocar sus campos (§A.4.2)', async () => {
				const port = await makeAuthedPort();
				const name = uniqueVegaName();
				await port.ensureCollections([{ name, fields: [{ name: 'original', type: 'text' }] }]);

				// Segundo spec para el MISMO nombre con un campo distinto: debe seguir omitida,
				// sin reconciliar ni añadir el campo nuevo.
				const result = await port.ensureCollections([
					{ name, fields: [{ name: 'nuevo_campo', type: 'bool' }] }
				]);
				expect(result.created).toEqual([]);
				expect(result.skipped).toEqual([name]);

				const types = await port.listContentTypes();
				const ct = types.find((t) => t.name === name)!;
				expect(ct.fields.some((f) => f.name === 'original')).toBe(true);
				expect(ct.fields.some((f) => f.name === 'nuevo_campo')).toBe(false);
			});

			test('rechaza nombres fuera de "vega"/"vega_*" → validation local, sin tocar red (§A.4.3)', async () => {
				const port = await makeAuthedPort();
				await expect(
					port.ensureCollections([{ name: 'not_reserved', fields: [] }])
				).rejects.toMatchObject({ kind: 'validation', fieldErrors: { not_reserved: {} } });
			});

			test('crea (o encuentra ya creada) la especificación canónica VEGA_COLLECTION (§A.5)', async () => {
				const port = await makeAuthedPort();
				const result = await port.ensureCollections([VEGA_COLLECTION]);
				expect([...result.created, ...result.skipped]).toContain('vega');
				const types = await port.listContentTypes();
				expect(types.some((t) => t.name === 'vega')).toBe(true);
			});

			// v1 solo modela una identidad superuser (D1): no hay una sesión autenticada
			// NO-superuser con la que probar "capability presente pero sin permiso → forbidden"
			// sin inventar un segundo tipo de usuario que el contrato no define. Skip declarado,
			// no un caso que desaparece en silencio.
			test.skip('con capability pero sin permiso de superuser → forbidden (no modelado en v1)', () => {});
		});

		// ————————————————————————————————————————————————————— 8. Errores de transporte —————

		describe('errores de transporte', () => {
			test.skipIf(!opts.transportFailures)(
				'backend caído (sin red) → network retryable',
				async () => {
					const port = await opts.transportFailures!.makeUnreachablePort();
					await expect(port.listContentTypes()).rejects.toMatchObject({
						kind: 'network',
						retryable: true
					});
				}
			);

			test.skipIf(!opts.transportFailures)(
				'respuesta 2xx con cuerpo corrupto → backend',
				async () => {
					const { port, cleanup } = await opts.transportFailures!.makeCorruptResponsePort();
					try {
						await expect(port.listContentTypes()).rejects.toMatchObject({ kind: 'backend' });
					} finally {
						await cleanup();
					}
				}
			);
		});
	});
}
