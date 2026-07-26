/**
 * Corre la MISMA suite de contrato (§10, Fase 2) contra un PocketBase real. Si no hay binario
 * descargado (`.pbbin/`, ver `scripts/download-pocketbase.mjs` / `pnpm test:pb`), el bloque
 * entero se salta declarándolo — nunca rompe `pnpm gate` para quien no tenga el binario.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { EventSource } from 'eventsource';
import PocketBase from 'pocketbase';
import type { VegaError } from '$lib/backend';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import { MAX_PER_PAGE } from '$lib/backend/query';
import type { Query } from '$lib/backend/query';
import type { ResolvedContentType } from '$lib/model/types';
import { exportCollection } from '$lib/transfer/export-collection';
import { describeBackendContract } from './backend-contract';
import {
	isPocketBaseBinaryAvailable,
	pocketBaseBinaryVersion,
	pbVersionAtLeast
} from './pb-harness/binary';
import type { RunningPocketBase } from './pb-harness/server';
import { startPocketBase } from './pb-harness/server';
import { resetPocketBaseRecords, seedPocketBaseSchema } from './pb-harness/seed';
import { startCorruptingProxy } from './pb-harness/corrupt-proxy';
import { startAuthFailureProxy } from './pb-harness/auth-failure-proxy';

// La suite ejercita `subscribe()` (SSE) tal como lo haría un navegador; Node no trae
// `EventSource` global (a diferencia de un navegador de producción real), así que se
// polirrellena SOLO para este test — nunca en el adaptador de producción, que asume navegador.
globalThis.EventSource = EventSource as unknown as typeof globalThis.EventSource;

const AVAILABLE = isPocketBaseBinaryAvailable();

// `geoPoint` (tipo de campo) no existe en el servidor hasta PB 0.27.0 (ver `pb-harness/seed.ts`
// para la evidencia/CHANGELOG): con el binario real presente, el propio binario dice la verdad
// sobre su versión — nunca el env var `PB_VERSION`, que puede mentir si `alreadyUsable()` (en
// `scripts/download-pocketbase.mjs`) reutilizó en silencio uno ya descargado.
const PB_BINARY_VERSION = AVAILABLE ? pocketBaseBinaryVersion() : null;
const HAS_GEO_POINT_FIELD_TYPE =
	PB_BINARY_VERSION === null || pbVersionAtLeast(PB_BINARY_VERSION, '0.27.0');

// PB solo permite fijar la duración del token de superuser a nivel de colección, con un
// mínimo de 10s (verificado en Fase 2). Se pinea aquí, una vez, para toda la suite: los tests
// de expiración (§10.1) esperan `authExpiryWaitMs` tras el login para darlo por vencido.
const SUPERUSER_TOKEN_DURATION_SECONDS = 10;
const AUTH_EXPIRY_WAIT_MS = (SUPERUSER_TOKEN_DURATION_SECONDS + 3) * 1000;

describe.skipIf(!AVAILABLE)('BackendPort contract — pocketbase (binario real en .pbbin/)', () => {
	let running: RunningPocketBase;
	let admin: PocketBase;

	beforeAll(async () => {
		running = await startPocketBase();
		admin = new PocketBase(running.url);
		admin.autoCancellation(false);
		await admin
			.collection('_superusers')
			.authWithPassword(running.adminEmail, running.adminPassword);
		await seedPocketBaseSchema(admin);
		// Última, a propósito: el resto de la siembra corre con la duración por defecto (86400s).
		await admin.collections.update('_superusers', {
			authToken: { duration: SUPERUSER_TOKEN_DURATION_SECONDS }
		});
	}, 30_000);

	afterAll(async () => {
		await running?.stop();
	});

	beforeEach(async () => {
		// El propio admin puede haber caducado entre tests (duration global = 10s): se
		// reautentica siempre antes de tocar datos, nunca asume que su sesión sigue viva.
		await admin
			.collection('_superusers')
			.authWithPassword(running.adminEmail, running.adminPassword);
		await resetPocketBaseRecords(admin);
	});

	// `capabilities` es una constante estática del adaptador: no hace falta (ni se puede, antes
	// de `beforeAll`) un `running.url` real para leerla — cualquier URL vale, no hay I/O aquí.
	const capabilities = createPocketBaseBackend({ url: 'http://placeholder.invalid' }).capabilities;

	describeBackendContract(() => createPocketBaseBackend({ url: running.url }), {
		name: 'pocketbase',
		capabilities,
		authExpiryWaitMs: AUTH_EXPIRY_WAIT_MS,
		numberFieldDefaultsToZero: true,
		hasGeoPointFieldType: HAS_GEO_POINT_FIELD_TYPE,
		transportFailures: {
			makeUnreachablePort: () => createPocketBaseBackend({ url: 'http://127.0.0.1:1' }),
			async makeCorruptResponsePort() {
				const proxy = await startCorruptingProxy(running.url);
				return {
					port: createPocketBaseBackend({ url: proxy.url }),
					cleanup: () => proxy.stop()
				};
			}
		}
	});
	/**
	 * Bugs de correctitud encontrados en code-review (§4.1/§5): la suite de contrato normal
	 * nunca provoca un 5xx real en `login`/`authRefresh` (PB solo rechaza con 400/401 en esos
	 * casos), así que hacía falta un proxy que se interponga entre el adaptador y el PB real
	 * para armar esos fallos a demanda.
	 */
	describe('login/restoreSession — 5xx del servidor (bug corregido: no colapsar a forbidden/limpieza)', () => {
		test('login: 5xx del servidor → backend, NUNCA forbidden (§5)', async () => {
			const proxy = await startAuthFailureProxy(running.url);
			try {
				proxy.setStatus('/auth-with-password', 500);
				const port = createPocketBaseBackend({ url: proxy.url });

				await expect(
					port.login({ email: running.adminEmail, password: running.adminPassword })
				).rejects.toMatchObject({ kind: 'backend' });
			} finally {
				await proxy.stop();
			}
		});

		test('restoreSession: 5xx en authRefresh → backend, NO limpia el token persistido (§4.1)', async () => {
			const proxy = await startAuthFailureProxy(running.url);
			try {
				const port = createPocketBaseBackend({ url: proxy.url });
				await port.login({ email: running.adminEmail, password: running.adminPassword });

				proxy.setStatus('/auth-refresh', 500);
				await expect(port.restoreSession()).rejects.toMatchObject({ kind: 'backend' });

				// Prueba de "no limpió el token": si `restoreSession` lo hubiese limpiado (bug
				// anterior: cualquier fallo no-network colapsaba a "inválido, limpiar"), esta
				// segunda llamada —con el 5xx ya desarmado, passthrough real hacia PB— tendría
				// que devolver `null` (no hay token que restaurar). En vez de eso, restaura de
				// verdad porque el token seguía persistido y sigue siendo válido.
				proxy.setStatus('/auth-refresh', null);
				const restored = await port.restoreSession();
				expect(restored?.user.email).toBe(running.adminEmail);
			} finally {
				await proxy.stop();
			}
		});
	});

	/**
	 * L7 (dedup del evento `expired`): el test de §10.1 en `backend-contract.ts` solo cubre el
	 * camino PROACTIVO (TTL/`exp` local, vía `checkSessionAlive` antes de tocar red), que NUNCA
	 * pasaba por el `catch` de `guarded()` donde vivía la carrera real. Este test fuerza el
	 * camino REACTIVO: el servidor responde 403 en endpoints de registros mientras el token
	 * sigue siendo localmente válido (invalidación que el chequeo proactivo no puede anticipar).
	 */
	describe('expiración REACTIVA concurrente (bug corregido: carrera al leer hasSession en el catch)', () => {
		test('2 operaciones en vuelo con 403 reactivo → AMBAS auth-expired, evento expired una sola vez', async () => {
			const proxy = await startAuthFailureProxy(running.url);
			try {
				const port = createPocketBaseBackend({ url: proxy.url });
				await port.login({ email: running.adminEmail, password: running.adminPassword });

				// A partir de aquí, cualquier petición a los endpoints de registros de `category`
				// recibe 403 — el token sigue siendo válido localmente (`pb.authStore.isValid`),
				// así que ninguna operación lo detecta de antemano: ambas llegan al `catch` de
				// `guarded()` casi a la vez.
				proxy.setStatus('/collections/category/records', 403);

				const reasons: string[] = [];
				port.onAuthChange((_s, reason) => reasons.push(reason));

				const [first, second] = await Promise.allSettled([
					port.list('category'),
					port.get('category', 'cualquiera')
				]);

				expect(first.status).toBe('rejected');
				expect(second.status).toBe('rejected');
				if (first.status === 'rejected') {
					expect((first.reason as VegaError).kind).toBe('auth-expired');
				}
				if (second.status === 'rejected') {
					expect((second.reason as VegaError).kind).toBe('auth-expired');
				}
				expect(reasons.filter((r) => r === 'expired')).toHaveLength(1);
				expect(port.currentSession()).toBeNull();
			} finally {
				await proxy.stop();
			}
		});
	});

	/**
	 * Premisa CORREGIDA de la tarea "reemplazar un asset conservando su URL" (`#lote-integridad`,
	 * Fase A — ver cabecera del contrato): **NO se puede cumplir con la API de PocketBase**. PB
	 * nombra el fichero guardado como `<basename>_<sufijo aleatorio>.<ext>` y el cliente no elige
	 * ese sufijo, así que dos subidas con el MISMO nombre de origen producen `FileRef` (y por
	 * tanto URL, `fileUrl`) DISTINTOS. Este test es la documentación ejecutable de esa
	 * restricción: si un día PB empezara a conservar el nombre, se pone ROJO y hay que revisar la
	 * UI de "Reemplazar" de `MediaDetail.svelte` sobre esa premisa nueva — no se verifica adivinando,
	 * se verifica contra el binario real.
	 */
	describe('premisa "reemplazar sin conservar la URL" (§ contrato integridad, Fase A)', () => {
		test('dos ficheros con el MISMO nombre de origen producen FileRef (y URL) distintos', async () => {
			const port = createPocketBaseBackend({ url: running.url });
			await port.login({ email: running.adminEmail, password: running.adminPassword });

			const first = new File(['contenido-1'], 'foto.png', { type: 'image/png' });
			const created = await port.create('kitchen_sink', { title: 'reemplazo', cover: first });
			const firstRef = created.values.cover as string;

			// Mismo NOMBRE DE ORIGEN que el primero, contenido distinto: si PB conservara el
			// nombre del fichero, el `FileRef` resultante sería idéntico al de arriba.
			const second = new File(['contenido-2'], 'foto.png', { type: 'image/png' });
			const updated = await port.update('kitchen_sink', created.id, { cover: second });
			const secondRef = updated.values.cover as string;

			expect(secondRef).not.toBe(firstRef);
			// Ambos derivan del MISMO basename ("foto"): PB antepone un sufijo aleatorio al
			// nombre, nunca lo sustituye por uno irreconocible — de ahí que "misma identidad de
			// registro" siga siendo verificable a simple vista, aunque la URL cambie.
			expect(firstRef.startsWith('foto')).toBe(true);
			expect(secondRef.startsWith('foto')).toBe(true);

			const firstUrl = port.fileUrl(created, 'cover', firstRef);
			const secondUrl = port.fileUrl(updated, 'cover', secondRef);
			expect(secondUrl).not.toBe(firstUrl);
		});
	});

	/**
	 * Hallazgo de la Fase B2 (`#lote-integridad`, papelera — NO estaba en §0 del contrato, se
	 * descubrió escribiendo el test de "restaurar conserva las relaciones"): borrar el DESTINO de
	 * un campo `relation` no-`required` (single o múltiple) no lo deja "colgando" en los registros
	 * que apuntaban a él — PB los REESCRIBE en el mismo `delete()` (limpieza de integridad
	 * referencial, no cascada de borrado: el registro que apunta sigue vivo, solo pierde la
	 * referencia). Documentado aquí, ejecutable, porque invalida un supuesto ingenuo ("el id sigue
	 * ahí, restaurar lo repara") que el propio contrato de Fase B daba por hecho sin medirlo — ver
	 * la cabecera del test gemelo en `backend-contract.ts` ("restaurar un borrado revive el id...")
	 * para la consecuencia de diseño: la papelera solo puede prometer "el id vuelve a estar vivo",
	 * nunca "las relaciones de PB se reparan solas".
	 */
	describe('borrar el destino de una relación no-required la limpia en el acto (Fase B2, ver cabecera)', () => {
		test('relation single: pasa a null; relation múltiple: el id se quita del array', async () => {
			const port = createPocketBaseBackend({ url: running.url });
			await port.login({ email: running.adminEmail, password: running.adminPassword });

			const target = await port.create('category', { name: 'A borrar' });
			const other = await port.create('category', { name: 'Superviviente' });
			const holder = await port.create('kitchen_sink', {
				title: 'Con relaciones',
				category: target.id,
				categories: [target.id, other.id]
			});

			await port.delete('category', target.id);

			const reread = await port.get('kitchen_sink', holder.id);
			expect(reread.values.category).toBeNull();
			expect(reread.values.categories).toEqual([other.id]);
		});
	});

	/**
	 * `#lote-shell` — las reglas de acceso que la UI refleja (`ContentType.access`) MEDIDAS contra
	 * el binario real, no supuestas. Lo que se comprueba aquí no es el mapeo (eso ya lo cubre
	 * `schema-access.test.ts` con JSON sintético) sino la PREMISA de la que cuelga: que PocketBase
	 * devuelve `null` para "solo superuser" y la cadena VACÍA para "abierta a cualquiera", dos
	 * valores falsy que, confundidos, invertirían el significado de la regla más peligrosa.
	 */
	describe('reglas de acceso: `null` (solo superuser) vs `""` (abierta) — medido contra PB real', () => {
		test('cada forma de regla llega a `ContentType.access` con su nivel correcto', async () => {
			await admin.collections.create({
				name: 'access_probe',
				type: 'base',
				fields: [{ name: 'title', type: 'text' }],
				listRule: '',
				viewRule: null,
				createRule: '@request.auth.id != ""',
				updateRule: null,
				deleteRule: null
			});

			try {
				const port = createPocketBaseBackend({ url: running.url });
				await port.login({ email: running.adminEmail, password: running.adminPassword });

				const types = await port.listContentTypes();
				const probe = types.find((t) => t.name === 'access_probe');

				expect(probe?.access).toEqual({
					list: 'allowed', // ''  → abierta
					view: 'denied', // null → solo superuser
					create: 'conditional', // expresión → depende del usuario/registro
					update: 'denied',
					delete: 'denied'
				});
			} finally {
				await admin.collections.delete('access_probe');
			}
		});
	});

	/**
	 * Guardarraíl de completitud del export (`#lote-esquema`, fix de code-review sobre la
	 * paginación por cursor de `$lib/transfer/paginate.ts`): todo el valor de la Fase 1 descansa
	 * en "no falta ni se duplica ningún registro" — hasta este test, esa garantía solo estaba
	 * probada con paginación SIMULADA (`paginate.test.ts`, `export-collection.test.ts`). Si el
	 * orden real de PocketBase no fuera exactamente el que se asume (id ascendente por defecto sin
	 * `sort` explícito, `compileSort`), el export saldría incompleto EN SILENCIO, con el mismo
	 * toast de éxito — un test que solo mira la simulación se queda ciego precisamente en el caso
	 * que importa. Corre `exportCollection` (el camino REAL, no una reimplementación de la
	 * iteración) contra > `MAX_PER_PAGE` registros creados en un PocketBase real.
	 *
	 * Sin campo `number` en la colección de prueba a propósito (landmine conocida, §7 del contrato
	 * de transfer: un `number` `required` rechaza el `0` en PB — aquí ni siquiera hace falta un
	 * contador, `title` de texto basta para tener algo que exportar).
	 */
	describe('completitud del export por cursor (guardarraíl, corre contra > MAX_PER_PAGE registros)', () => {
		test('250 registros (2 páginas): salen EXACTAMENTE esos 250, sin duplicados, ninguno perdido — ni con un borrado de un registro YA entregado a mitad', async () => {
			await admin.collections.create({
				name: 'export_completeness_probe',
				type: 'base',
				fields: [{ name: 'title', type: 'text' }]
			});

			try {
				const port = createPocketBaseBackend({ url: running.url });
				await port.login({ email: running.adminEmail, password: running.adminPassword });

				const TOTAL = 250;
				expect(TOTAL).toBeGreaterThan(MAX_PER_PAGE); // el punto del test: más de una página real

				// Creación en lotes (no las 250 de golpe): un PB local de test también tiene un
				// límite razonable de conexiones concurrentes.
				const CHUNK = 25;
				const createdIds: string[] = [];
				for (let i = 0; i < TOTAL; i += CHUNK) {
					const batch = await Promise.all(
						Array.from({ length: Math.min(CHUNK, TOTAL - i) }, (_, j) =>
							port.create('export_completeness_probe', { title: `Registro ${i + j}` })
						)
					);
					createdIds.push(...batch.map((r) => r.id));
				}
				expect(new Set(createdIds).size).toBe(TOTAL); // sanity: PB no coincidió ningún id

				// Orden REAL de exportación (id ascendente, ver `paginate.ts`): el registro que
				// cae en la primera página ("ya entregado") frente a los que quedan para la
				// segunda ("pendientes") se decide por este orden, no por el de creación — los
				// ids de PB son opacos, nunca se asume que nacen en orden.
				const sortedIds = [...createdIds].sort();
				const pendingIds = sortedIds.slice(MAX_PER_PAGE); // los ~50 de la 2ª página
				const alreadyDeliveredId = sortedIds[50]; // uno cualquiera de la 1ª página

				const probeType: ResolvedContentType = {
					schema: {
						name: 'export_completeness_probe',
						readonly: false,
						fields: [
							{
								name: 'title',
								type: 'text',
								subtype: 'plain',
								required: false,
								readonly: false,
								presentable: true,
								hidden: false,
								unique: false
							}
						]
					},
					name: 'export_completeness_probe',
					label: 'Probe',
					labelSingular: 'Probe',
					icon: null,
					hidden: false,
					group: null,
					singleton: false,
					permissions: ALL_PERMISSIONS,
					readonly: false,
					titleField: 'title',
					subtitleField: null,
					slugField: null,
					statusField: null,
					statusLabels: null,
					orderField: null,
					defaultSort: null,
					previewUrl: null,
					fields: [],
					listFields: ['title'],
					fieldGroups: [],
					editorRail: false
				};

				// Envoltorio MÍNIMO de `port` que intercala el borrado ENTRE la 1ª y la 2ª llamada a
				// `list` — no vía `onProgress` (fire-and-forget en `paginate.ts` a propósito, ver
				// su cabecera: awaitarlo ahí cambiaría el comportamiento de producción solo para
				// poder testear esto, justo la instrumentación artificiosa a evitar). Esto NO
				// toca `exportCollection`/`paginate.ts`: es exactamente el seam que
				// `exportCollection` ya expone para tests (`Pick<BackendPort, 'list' | 'fileUrl'>`,
				// ver su cabecera) — aquí se usa contra el PB real de verdad, delegando cada
				// llamada real y solo intercalando el borrado, awaitado, antes de la 2ª.
				let listCalls = 0;
				let deletedOnce = false;
				const instrumentedPort = {
					list: async (type: string, query?: Query) => {
						listCalls += 1;
						if (listCalls === 2 && !deletedOnce) {
							deletedOnce = true;
							await port.delete('export_completeness_probe', alreadyDeliveredId);
						}
						return port.list(type, query);
					},
					fileUrl: port.fileUrl.bind(port)
				};

				const { collection, cancelled } = await exportCollection(
					instrumentedPort,
					probeType,
					'all',
					{ q: '', sort: null, status: null, page: 1 }
				);

				expect(cancelled).toBe(false);
				expect(listCalls).toBe(2); // 2 páginas reales: 200 + 50
				expect(deletedOnce).toBe(true); // el borrado SÍ se disparó (si no, el test no prueba nada)

				const exportedIds = collection.records.map((r) => r.id);
				expect(exportedIds).toHaveLength(TOTAL); // el borrado NO resta: ya se había capturado
				expect(new Set(exportedIds).size).toBe(TOTAL); // sin duplicados
				expect(new Set(exportedIds)).toEqual(new Set(createdIds)); // exactamente los 250 creados

				// La prueba específica del hallazgo: TODOS los pendientes de la 2ª página llegaron
				// — ninguno se perdió por el desplazamiento que sí habría causado el offset.
				for (const pendingId of pendingIds) {
					expect(exportedIds).toContain(pendingId);
				}
			} finally {
				await admin.collections.delete('export_completeness_probe');
			}
		}, 60_000); // 250 creates + un delete + 2 páginas reales contra el binario: más que el timeout por defecto
	});
});
