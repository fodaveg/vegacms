/**
 * Instancia ÚNICA del `BackendPort` (P3-L1, landmine SSR heredada de P1): se construye UNA vez,
 * perezosamente y solo en cliente, la primera vez que se pide. Ningún otro módulo del repo
 * instancia un adaptador concreto — el resto recibe el `BackendPort` ya armado, por
 * `VegaAppContext` (§2.1) o, en `/login` (que todavía no tiene sesión ni contexto), por
 * `getSessionContext()` (`session.svelte.ts`), nunca llamando a un `create*Backend` por su
 * cuenta.
 *
 * ## Selección de adaptador (seam que P3 posee, documentado para review)
 *
 * Dos señales, en este orden de prioridad:
 *  1. `window.__VEGA_ADAPTER__` — flag RUNTIME, opcional. Playwright lo fija con
 *     `page.addInitScript()` ANTES de que el bundle arranque (ver `e2e/fixtures.ts`), así la
 *     suite corre siempre contra la build normal, sin una build aparte por escenario.
 *  2. `import.meta.env.VITE_VEGA_ADAPTER` — variable de entorno de BUILD (Vite). Permite lanzar
 *     `VITE_VEGA_ADAPTER=memory pnpm build && pnpm preview` para servir la demo pública (P8) sin
 *     PocketBase real, sin tocar código.
 *
 * Si ninguna vale `'memory'`, el adaptador es `pocketbase` contra la URL resuelta por
 * `resolveBackendUrl` (§3.7, D-P3.5-a; ampliada por L5): same-origin por defecto, con override
 * opcional vía `static/vega.config.json` (fetch best-effort; ausencia/fallo → `null` →
 * same-origin, nunca bloquea el arranque), y por encima de ambos el override RUNTIME de L5
 * (`readBackendOverride()`, `backend-override.ts`) que el usuario guarda desde
 * `BackendUrlForm.svelte` en `/login`/`/settings`.
 *
 * La colección de auth (`authCollection` de `createPocketBaseBackend`, lote L6a) se resuelve por
 * el MISMO seam, en paralelo, vía `resolveAuthCollection` (mismos 3 niveles: override runtime
 * `readAuthCollectionOverride()` → `vega.config.json` → default `'_superusers'`). Aditivo puro:
 * sin override ni config, resultado idéntico al de antes de L6a (el dogfood de fodaveg no ve
 * ningún cambio).
 *
 * ## Por qué el adaptador `memory` necesita una envoltura aquí
 *
 * `$lib/backend/adapters/memory` NO persiste nada entre recargas por diseño (documentado en su
 * propia cabecera: "recargar = reset"). Para que el flujo de sesión (login → recarga → sigue
 * autenticado → logout) sea comprobable de punta a punta con Playwright SIN tocar
 * `src/lib/backend/**`, `wrapMemoryPortForDemo` añade un marcador de sesión en `localStorage`
 * (clave `vega.demoSession.v1`, deliberadamente DISTINTA de `vega.session.v1`, que gestiona en
 * exclusiva el adaptador `pocketbase`, P1 §4.1) y, al "restaurar" tras una recarga real, vuelve a
 * autenticar con las credenciales fijas de la semilla de demo si el marcador sigue vigente. Desde
 * fuera (session.svelte.ts, la UI) es indistinguible de un restore de token real. Es un mecanismo
 * EXCLUSIVO del modo demo/e2e, invisible al resto de la app.
 *
 * También expone el gancho de pruebas `window.__VEGA_FORCE_NETWORK_ERROR__`: si Playwright lo
 * fija a `true`, la envoltura rechaza con `VegaError.network()` en vez de delegar en `memory`
 * (que, al no tener transporte real, nunca produce ese `kind` por sí solo) — es la única forma
 * honesta de ensayar el banner "sin conexión" contra un backend en memoria. Cubre `login`/
 * `restoreSession` (arranque, §7.B.8/§6.7) y, desde Fase 2c, también `list`/`listContentTypes`
 * (el trigger real de un fallo de red A MITAD de sesión, §3.4/§7.B — p.ej. `nav.toSingleton`
 * reintentando un click, o el "Reintentar" de `GlobalBanner` sondeando la conexión).
 *
 * Y `window.__VEGA_FORCE_DELETE_ERROR__` (Fase 4e del contrato P4, L-P4.4/Audit H6): mismo
 * patrón que el flag de red — un booleano PERSISTENTE (no se autoconsume) que, mientras esté a
 * `true`, hace que `delete()` rechace con un `VegaError('backend', …)` en vez de delegar en
 * `memory`. Es la única forma de ensayar en e2e el camino "borrado bloqueado por una restricción
 * del backend" (p.ej. PB rechazando el borrado de un registro con una relación entrante
 * requerida, ver `adapters/pocketbase/errors.ts`) sin que `memory` tenga que saber nada de
 * relaciones ni de restricciones — el adaptador en sí queda intacto, el gancho vive SOLO en esta
 * envoltura de demo/e2e. `kind: 'backend'` (no `'validation'`) a propósito: replica el mapeo REAL
 * verificado contra PocketBase (un 400 de restricción de borrado no trae `data` por campo, así
 * que `mapPocketBaseError` lo resuelve a `backend` con el `message` de PB intacto, nunca
 * `fieldErrors` — ver el test dedicado en `errors.test.ts`). El resto de operaciones de datos no
 * necesitan un gancho equivalente: ninguna se ejercita desde el alcance actual del shell.
 *
 * Y `window.__VEGA_FORCE_EXPIRE__`: gancho de pruebas EXCLUSIVO de la demo/e2e para el overlay de
 * re-login no destructivo (§3.1.3/§3.1.4, D-P3.2-a). A diferencia del flag de red (un booleano
 * que se comprueba en cada llamada), este es un DISPARADOR de un solo uso: fijarlo a `true` hace
 * que la PRÓXIMA `list`/`listContentTypes` reproduzca EXACTAMENTE lo que hace `memory` cuando el
 * TTL real de una sesión expira (`checkSessionAlive()` en `adapters/memory/index.ts`) — notifica
 * `onAuthChange(null, 'expired')` a quien esté suscrito (una sola vez, P1 §3.1.3/L7) Y lanza
 * `VegaError.authExpired()` — sin tocar el estado privado del adaptador (`latchedExpired` es un
 * closure interno de `createMemoryBackend`, deliberadamente inalcanzable desde aquí: esta
 * envoltura no conoce su implementación, solo simula el mismo evento observable desde fuera).
 * Confinado por completo a `wrapMemoryPortForDemo`: en modo `pocketbase` esta función nunca se
 * ejecuta, así que ninguna de las dos propiedades llega a existir en `window`.
 *
 * Y `window.__VEGA_FORCE_MEDIA_CREATE_ERROR__` (Fase P6·6c): mientras sea `true`, `create('vega_media',
 * …)` — y SOLO esa, nunca otro tipo — rechaza con `VegaError.network()` en vez de delegar en
 * `memory`. Mismo motivo que `__VEGA_FORCE_MEDIA_LIST_ERROR__` (Fase 6b): `__VEGA_FORCE_NETWORK_ERROR__`
 * es DEMASIADO ancho (tumbaría también el `listContentTypes()` que `/media/+page.svelte` repite en
 * cada montaje, antes de llegar siquiera a la zona de subida). Es la única forma de ensayar en e2e
 * la EXCEPCIÓN de la Fase 6c: un `create()` que falla por `'network'`/`'forbidden'` ABORTA el resto
 * del lote de subida (`media-upload-state.svelte.ts`), a diferencia de un `'validation'` (que solo
 * marca ESE fichero y sigue con el siguiente) — `VegaError.network()` basta para ejercer esa rama;
 * `abortsBatch()` trata `'forbidden'` de forma IDÉNTICA (mismo `if`), así que no hace falta un
 * segundo gancho solo para variar el `kind`.
 *
 * Y `window.__VEGA_DELETE_DELAY_MS__` (fix de code-review de 4e): retrasa `delete()` los ms
 * indicados antes de delegar en `memory` — `memory` en sí resuelve casi instantáneo (sin
 * transporte real), así que la ventana en la que `DeleteConfirm.svelte` está en su estado
 * `deleting` (botones `aria-disabled`, trap de foco bajo prueba) es demasiado corta para que
 * Playwright pueda ejercerla de forma FIABLE (dos acciones reales, con su ida y vuelta al
 * navegador, casi siempre la dejan atrás). Este gancho abre esa ventana a propósito, para
 * verificar en e2e (a) que el guard de `requestDelete` de `+page.svelte` (`if (deleting) return`)
 * de verdad ignora una segunda petición mientras la primera sigue en vuelo, y (b) que el trap de
 * foco del diálogo (fix de code-review) sigue intacto —`Tab` cicla entre sus dos botones— durante
 * ese mismo tramo. `0`/ausente = sin retraso (comportamiento normal).
 */

import type { AuthChangeReason, BackendPort, Session } from '$lib/backend';
import { VegaError } from '$lib/backend';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import {
	resolveAuthApiBasePath,
	resolveAuthCollection,
	resolveBackendUrl,
	type VegaConfig
} from './backend-config';
import { readAuthCollectionOverride, readBackendOverride } from './backend-override';
import { DEMO_CREDENTIALS, DEMO_SEED, DEMO_SEED_WITH_MEDIA } from './demo-seed';

declare global {
	interface Window {
		/** Flag runtime SOLO para Playwright (ver cabecera): fija el adaptador antes de que la
		 *  app arranque, sin recompilar. Nadie más en el repo lo lee ni lo escribe. */
		__VEGA_ADAPTER__?: 'memory' | 'pocketbase';
		/** Flag runtime SOLO para Playwright: fuerza que la próxima operación de red del
		 *  adaptador `memory` rechace con `VegaError.network()` (ver cabecera). */
		__VEGA_FORCE_NETWORK_ERROR__?: boolean;
		/** Disparador runtime SOLO para Playwright: la próxima `list`/`listContentTypes` simula
		 *  una expiración de sesión real (ver cabecera). Se autoconsume (vuelve a `false`) tras
		 *  disparar, igual que el `'expired'` real de P1 se emite una sola vez. */
		__VEGA_FORCE_EXPIRE__?: boolean;
		/** Flag runtime SOLO para Playwright (Fase 4e): mientras sea `true`, `delete()` rechaza con
		 *  un `VegaError('backend', …)` que emula una restricción de borrado real de PB (ver
		 *  cabecera). Persistente como `__VEGA_FORCE_NETWORK_ERROR__` (no se autoconsume). */
		__VEGA_FORCE_DELETE_ERROR__?: boolean;
		/** Retraso runtime SOLO para Playwright (fix de code-review de 4e, ver cabecera): milisegundos
		 *  que `delete()` espera antes de delegar en `memory`. `0`/ausente = sin retraso. */
		__VEGA_DELETE_DELAY_MS__?: number;
		/** Flag runtime SOLO para Playwright (Fase P6·6b): `true` ⇒ el adaptador `memory` arranca
		 *  con `DEMO_SEED_WITH_MEDIA` (la colección `vega_media` YA creada, con 2-3 assets) en vez de
		 *  `DEMO_SEED` — mismo mecanismo que `__VEGA_ADAPTER__`, fijado ANTES de que el bundle
		 *  arranque (`e2e/fixtures.ts`, `loginAsDemo(page, { seedMedia: true })`). Ausente/`false` =
		 *  comportamiento previo (`DEMO_SEED`, sin `vega_media`) — `e2e/media.spec.ts` (Fase 6a)
		 *  depende de esa ausencia para ejercer el estado `'creatable'`. */
		__VEGA_SEED_MEDIA__?: boolean;
		/** Flag runtime SOLO para Playwright (Fase P6·6b): mientras sea `true`, `list('vega_media',
		 *  …)` — y SOLO esa, nunca `listContentTypes`/otro tipo — rechaza con un `VegaError`
		 *  `'backend'` (ver cabecera). Persistente (no se autoconsume), mismo criterio que
		 *  `__VEGA_FORCE_DELETE_ERROR__`. */
		__VEGA_FORCE_MEDIA_LIST_ERROR__?: boolean;
		/** Flag runtime SOLO para Playwright (Fase P6·6c): mientras sea `true`, `create('vega_media',
		 *  …)` — y SOLO esa, nunca otro tipo — rechaza con un `VegaError.network()` (ver cabecera).
		 *  Persistente (no se autoconsume), mismo criterio que `__VEGA_FORCE_MEDIA_LIST_ERROR__`. */
		__VEGA_FORCE_MEDIA_CREATE_ERROR__?: boolean;
		/** Flag runtime SOLO para Playwright (lote L6c): `true` ⇒ el `BackendPort` del adaptador
		 *  `memory` arranca con `capabilities.schemaDiscovery`/`schemaBootstrap` en `false` (ver
		 *  `withEditorCapabilities`), simulando una sesión de rol editor (`authCollection` distinta
		 *  de `_superusers`, L6a) SIN tener que montar un PocketBase real — `memory` en sí no
		 *  entiende de `authCollection` (§7 del contrato, adaptador de paridad de puerto). Fijado
		 *  ANTES de que el bundle arranque, mismo mecanismo que `__VEGA_SEED_MEDIA__`. Ausente/`false`
		 *  = comportamiento previo (capabilities de superuser, todas `true`/`false` como siempre).
		 *  Exclusivo del adaptador `memory`/e2e: en modo `pocketbase` esta flag nunca se lee. */
		__VEGA_FORCE_EDITOR_CAPABILITIES__?: boolean;
	}
}

/** Clave de `localStorage` del marcador de sesión de demo (ver cabecera). */
const DEMO_MARKER_KEY = 'vega.demoSession.v1';

interface DemoSessionMarker {
	/** ISO 8601 UTC, o `null` = no caduca (semilla sin `sessionTtlMs`). */
	expiresAt: string | null;
}

let instancePromise: Promise<BackendPort> | null = null;

/**
 * Devuelve el `BackendPort` singleton (perezoso, memoizado): la primera llamada lo construye;
 * las siguientes devuelven la MISMA instancia/promesa. Nunca se llama durante SSR (guard
 * explícito más abajo): con `ssr=false` esto nunca debería ejecutarse en servidor, pero si algún
 * día se cuela una llamada ahí, falla alto y claro en vez de fabricar una instancia fantasma que
 * podría filtrar sesión entre requests (landmine de P1).
 */
export function getBackend(): Promise<BackendPort> {
	if (!instancePromise) instancePromise = createInstance();
	return instancePromise;
}

async function createInstance(): Promise<BackendPort> {
	if (typeof window === 'undefined') {
		throw new Error('getBackend() no puede llamarse durante SSR (P3-L1 / landmine de P1).');
	}
	if (useMemoryAdapter()) {
		const seed = window.__VEGA_SEED_MEDIA__ ? DEMO_SEED_WITH_MEDIA : DEMO_SEED;
		const port = wrapMemoryPortForDemo(createMemoryBackend(seed), DEMO_CREDENTIALS);
		return window.__VEGA_FORCE_EDITOR_CAPABILITIES__ ? withEditorCapabilities(port) : port;
	}
	const override = readBackendOverride();
	const authCollectionOverride = readAuthCollectionOverride();
	// L6 auth fuerte añade una tercera pieza que solo vive en `vega.config.json`; por eso la
	// lectura best-effort ya no se puede omitir aunque URL y colección tengan override runtime.
	const config = await fetchVegaConfig();
	const url = resolveBackendUrl({ origin: window.location.origin, config, override });
	const authCollection = resolveAuthCollection({ config, override: authCollectionOverride });
	const authApiBasePath = resolveAuthApiBasePath(config);
	return createPocketBaseBackend({ url, authCollection, authApiBasePath });
}

function useMemoryAdapter(): boolean {
	if (window.__VEGA_ADAPTER__) return window.__VEGA_ADAPTER__ === 'memory';
	return import.meta.env.VITE_VEGA_ADAPTER === 'memory';
}

/**
 * (#l12-ux, item 1) Resuelve, para MOSTRAR en `/login` ANTES de que el usuario meta credenciales,
 * a qué PocketBase se conectaría Vega ahora mismo — MISMO seam de tres niveles que `createInstance`
 * (override runtime → `vega.config.json` → same-origin), pero sin instanciar ningún adaptador ni
 * tocar `instancePromise`: es una lectura de solo-mostrar, nunca dispara el singleton (llamarla
 * varias veces, p.ej. si el usuario reabre el disclosure, no tiene coste de crear nada).
 *
 * En modo demo (`memory`, e2e/build pública P8) no hay un PocketBase real detrás de la sesión —
 * devuelve `null`, y la UI de `/login` simplemente no pinta el indicador (P3-L3: nunca un dato
 * inventado, "conectado a" no significa nada en modo memoria).
 */
export async function resolveDisplayBackendUrl(): Promise<string | null> {
	if (typeof window === 'undefined' || useMemoryAdapter()) return null;
	const override = readBackendOverride();
	const config = await fetchVegaConfig();
	return resolveBackendUrl({ origin: window.location.origin, config, override });
}

/**
 * Lee `static/vega.config.json` en runtime (§3.7, D-P3.5-a): fetch best-effort, cero build.
 * Ausencia (404), fallo de red o forma inesperada ⇒ `null` (same-origin), NUNCA bloquea ni lanza.
 */
async function fetchVegaConfig(): Promise<VegaConfig | null> {
	try {
		const res = await fetch('/vega.config.json', { cache: 'no-store' });
		if (!res.ok) return null;
		const data: unknown = await res.json();
		return typeof data === 'object' && data !== null ? (data as VegaConfig) : null;
	} catch {
		return null;
	}
}

// ————— Envoltura de demo/e2e del adaptador `memory` (ver cabecera del módulo) —————

function readDemoMarker(): DemoSessionMarker | null {
	try {
		const raw = localStorage.getItem(DEMO_MARKER_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as DemoSessionMarker;
	} catch {
		return null;
	}
}

function writeDemoMarker(marker: DemoSessionMarker): void {
	try {
		localStorage.setItem(DEMO_MARKER_KEY, JSON.stringify(marker));
	} catch {
		// Almacenamiento no disponible (modo privado agresivo, cuota…): la demo simplemente no
		// sobrevive a una recarga. Degradación honesta, nunca rompe la app (P3-L3).
	}
}

function clearDemoMarker(): void {
	try {
		localStorage.removeItem(DEMO_MARKER_KEY);
	} catch {
		// ver arriba.
	}
}

function throwIfForcedNetworkError(): void {
	if (window.__VEGA_FORCE_NETWORK_ERROR__) {
		throw VegaError.network(undefined, 'Sin conexión con el backend (forzado por e2e)');
	}
}

/** Ver cabecera del módulo (Fase 4e, L-P4.4/Audit H6): emula un `delete()` bloqueado por una
 *  restricción del backend, `kind: 'backend'` con `message` accionable, mismo mapeo que PB real. */
function throwIfForcedDeleteError(): void {
	if (window.__VEGA_FORCE_DELETE_ERROR__) {
		throw VegaError.backend(
			'No se pudo borrar: el registro está referenciado por otros registros (forzado por e2e).'
		);
	}
}

/**
 * Ver cabecera del módulo (Fase P6·6b): fuerza que la PRÓXIMA `list('vega_media', …)` — y solo
 * esa, nunca otro tipo — rechace. `__VEGA_FORCE_NETWORK_ERROR__` (arriba) es deliberadamente
 * DEMASIADO ancho para ejercer "el grid en concreto falla": `/media/+page.svelte` llama a
 * `listContentTypes()` en CADA montaje (bootstrap de `vega_media`, Fase 6a), así que forzar el
 * flag genérico ANTES de (re)montar `/media` tumba el marco entero (`status: 'error'` de la
 * cabecera), no solo la rejilla — nunca se llega al estado `mediaListState.status.kind ===
 * 'error'` que 6b quiere comprobar EN CONTEXTO. Este gancho, acotado a `type === 'vega_media'`,
 * es la única forma de ensayar ESE fallo en concreto sin tocar `listContentTypes`. */
function throwIfForcedMediaListError(): void {
	if (window.__VEGA_FORCE_MEDIA_LIST_ERROR__) {
		throw VegaError.backend('No se pudo cargar la biblioteca de medios (forzado por e2e).');
	}
}

/**
 * Ver cabecera del módulo (Fase P6·6c): fuerza que la PRÓXIMA `create('vega_media', …)` — y solo
 * esa — rechace con `'network'`, para ejercer la rama de "aborta el resto del lote" de
 * `media-upload-state.svelte.ts` sin depender de `__VEGA_FORCE_NETWORK_ERROR__` (demasiado ancho,
 * ver `throwIfForcedMediaListError`).
 */
function throwIfForcedMediaCreateError(): void {
	if (window.__VEGA_FORCE_MEDIA_CREATE_ERROR__) {
		throw VegaError.network(
			undefined,
			'Sin conexión con el backend (forzado por e2e, subida de medios).'
		);
	}
}

/**
 * Envuelve un `BackendPort` `memory` con persistencia de sesión SOLO para la demo/e2e (ver
 * cabecera del módulo). `credentials` son las de la semilla fija: al "restaurar" tras una
 * recarga real, si el marcador de `localStorage` sigue vigente, esta envoltura vuelve a
 * autenticar con esas credenciales de forma transparente. Si ya caducó, lo limpia y
 * `restoreSession()` devuelve `null` sin lanzar (§4.1).
 *
 * El resto de operaciones de escritura (`create`/`update`/`delete`/`ensureCollections`/…) pasan
 * tal cual al adaptador interno: esta envoltura toca `login`/`logout`/`restoreSession` (sesión) y,
 * desde Fase 2c, también `list`/`listContentTypes`/`onAuthChange` (ganchos de red/expiración
 * forzadas a mitad de sesión, ver cabecera del módulo).
 */
function wrapMemoryPortForDemo(
	inner: BackendPort,
	credentials: { email: string; password: string }
): BackendPort {
	function saveMarker(session: Session, expiresAtOverride?: string | null): void {
		writeDemoMarker({
			expiresAt: expiresAtOverride !== undefined ? expiresAtOverride : session.expiresAt
		});
	}

	// Callbacks registrados a través de ESTA envoltura (no del `inner.onAuthChange` directamente):
	// es lo que permite que `throwIfForcedExpire()` notifique `'expired'` sin conocer el estado
	// privado del adaptador (ver cabecera del módulo). Se reenvía también a `inner.onAuthChange`
	// para que una expiración real por TTL (si algún día la demo usa `seed.sessionTtlMs`) siga
	// notificando con normalidad.
	const authSubscribers = new Set<(s: Session | null, reason: AuthChangeReason) => void>();

	function throwIfForcedExpire(): void {
		if (!window.__VEGA_FORCE_EXPIRE__) return;
		// Un solo disparo (P1 §3.1.3/L7: 'expired' se emite EXACTAMENTE una vez por expiración).
		window.__VEGA_FORCE_EXPIRE__ = false;
		clearDemoMarker();
		for (const cb of authSubscribers) cb(null, 'expired');
		throw VegaError.authExpired('La sesión ha caducado (forzado por e2e)');
	}

	return {
		...inner,

		onAuthChange(cb) {
			authSubscribers.add(cb);
			const unsubscribeInner = inner.onAuthChange(cb);
			return () => {
				authSubscribers.delete(cb);
				unsubscribeInner();
			};
		},

		async listContentTypes() {
			throwIfForcedNetworkError();
			throwIfForcedExpire();
			return inner.listContentTypes();
		},

		async list(type, query) {
			throwIfForcedNetworkError();
			throwIfForcedExpire();
			if (type === 'vega_media') throwIfForcedMediaListError();
			return inner.list(type, query);
		},

		async create(type, data) {
			// Ver cabecera del módulo (Fase P6·6c): SOLO el gancho de subida de medios, deliberadamente
			// sin `throwIfForcedNetworkError()/throwIfForcedExpire()` genéricos — mismo razonamiento
			// que `delete()` arriba, este escenario de e2e necesita fallar UN `create('vega_media', …)`
			// concreto en mitad de un lote, no la sesión/red enteras.
			if (type === 'vega_media') throwIfForcedMediaCreateError();
			return inner.create(type, data);
		},

		async delete(type, id) {
			// Ver cabecera del módulo (Fase 4e): SOLO los ganchos de borrado, deliberadamente sin
			// `throwIfForcedNetworkError()/throwIfForcedExpire()` — los escenarios de e2e que
			// necesitan estos flags son "el borrado lo rechaza el backend" y "el borrado tarda lo
			// suficiente para ejercer el estado `deleting`", no "no hay red"/"la sesión caducó"
			// (esos ya los cubren los otros dos ganchos en `list`/`login`/`restoreSession`).
			throwIfForcedDeleteError();
			if (window.__VEGA_DELETE_DELAY_MS__) {
				await new Promise((resolve) => setTimeout(resolve, window.__VEGA_DELETE_DELAY_MS__));
			}
			return inner.delete(type, id);
		},

		async login(creds) {
			throwIfForcedNetworkError();
			const session = await inner.login(creds);
			saveMarker(session);
			return session;
		},

		async logout() {
			await inner.logout();
			clearDemoMarker();
		},

		async restoreSession() {
			throwIfForcedNetworkError();

			// Recarga "suave" (misma instancia de `inner`, p.ej. llamadas repetidas en el mismo
			// ciclo de vida): si `inner` ya tiene sesión, esa es la verdad, sin tocar el marcador.
			const already = inner.currentSession();
			if (already) return already;

			const marker = readDemoMarker();
			if (!marker) return null;
			if (marker.expiresAt && Date.now() >= new Date(marker.expiresAt).getTime()) {
				clearDemoMarker();
				return null;
			}

			try {
				const session = await inner.login(credentials);
				// Conserva el `expiresAt` ORIGINAL del marcador (no el de este re-login
				// transparente): así una semilla con `sessionTtlMs` corto sigue caducando en el
				// momento correcto tras una recarga, en vez de renovarse silenciosamente cada vez.
				saveMarker(session, marker.expiresAt);
				return session;
			} catch {
				clearDemoMarker();
				return null;
			}
		}
	};
}

/**
 * Ver `__VEGA_FORCE_EDITOR_CAPABILITIES__` (cabecera del módulo, lote L6c): envoltura MÍNIMA que
 * solo sustituye `capabilities` — el resto de operaciones (`list`/`listContentTypes`/`create`/…)
 * quedan intactas, delegadas tal cual en `port`. El adaptador `memory` en sí (§7 del contrato) no
 * tiene noción de `authCollection`/rol editor, así que esto NO reproduce el modo snapshot de
 * `adapters/pocketbase` (L6b, servir `listContentTypes` desde `vega.schemaSnapshot`) — solo la
 * SEÑAL de capability que la UI consulta (`ley de capacidades`, §5 del contrato P1) para
 * degradarse. Suficiente para e2e: la persona editor de la Fase L6c ejercita el GATING de la UI
 * (`/settings`, `/media`), no el camino de red del adaptador `pocketbase`, ya cubierto por
 * `adapters/pocketbase/auth-collection.test.ts`.
 */
function withEditorCapabilities(port: BackendPort): BackendPort {
	return {
		...port,
		capabilities: { ...port.capabilities, schemaDiscovery: false, schemaBootstrap: false }
	};
}
