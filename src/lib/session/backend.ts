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
 * `resolveBackendUrl` (§3.7, D-P3.5-a): same-origin por defecto, con override opcional vía
 * `static/vega.config.json` (fetch best-effort; ausencia/fallo → `null` → same-origin, nunca
 * bloquea el arranque).
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
 * reintentando un click, o el "Reintentar" de `GlobalBanner` sondeando la conexión). El resto de
 * operaciones de datos no lo necesitan: ninguna se ejercita desde el alcance actual del shell.
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
 */

import type { AuthChangeReason, BackendPort, Session } from '$lib/backend';
import { VegaError } from '$lib/backend';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import { resolveBackendUrl, type VegaConfig } from './backend-config';
import { DEMO_CREDENTIALS, DEMO_SEED } from './demo-seed';

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
		return wrapMemoryPortForDemo(createMemoryBackend(DEMO_SEED), DEMO_CREDENTIALS);
	}
	const config = await fetchVegaConfig();
	const url = resolveBackendUrl({ origin: window.location.origin, config });
	return createPocketBaseBackend({ url });
}

function useMemoryAdapter(): boolean {
	if (window.__VEGA_ADAPTER__) return window.__VEGA_ADAPTER__ === 'memory';
	return import.meta.env.VITE_VEGA_ADAPTER === 'memory';
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
			return inner.list(type, query);
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
