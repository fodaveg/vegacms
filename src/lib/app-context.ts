/**
 * `VegaAppContext` (§2.1 del contrato P3): la ÚNICA superficie por la que P4/P5/P6 tocan
 * sesión, modelo, puerto, navegación e feedback. Nadie bajo `routes/**` instancia el puerto por
 * su cuenta (P3-L1). Este fichero SOLO fija los tipos (§2.1–2.3, §2.7) y los helpers de
 * contexto de Svelte (`setContext`/`getContext`); la instancia real la construye la Fase 2
 * (`src/routes/+layout.svelte`).
 *
 * Los tipos de P1/P2 se importan, nunca se redefinen (ley del contrato). `Locale` e `IconRegistry`
 * se reexportan desde sus módulos dueños (`$lib/i18n`, `$lib/icons/registry`) en vez de
 * redefinirlos aquí.
 */

import { getContext, setContext } from 'svelte';
import type { BackendPort, RecordId, Session, VegaError } from '$lib/backend';
import type { ContentModel } from '$lib/model/types';
import type { Locale } from '$lib/i18n';
import type { IconRegistry } from '$lib/icons/registry';

export type { IconRegistry };

/** Navegación tipada (§2.2): único camino, nadie compone URLs a mano. */
export interface NavApi {
	toIndex(): void;
	toList(type: string): void; // /c/:type
	toNew(type: string): void; // /c/:type/new
	toRecord(type: string, id: RecordId): void; // /c/:type/:id
	/** Resuelve el singleton (P2 §4.6) y navega a su edición/creación. Async: consulta el puerto. */
	toSingleton(type: string): Promise<void>;
	toMedia(): void; // /media
	toSettings(): void; // /settings
	toLogin(): void;
}

/** Feedback global del sistema (§2.3): toasts + reporte de `VegaError` contextual. */
export interface FeedbackApi {
	/** Toast efímero. `timeoutMs` por defecto según `kind`; `'error'` es persistente hasta descartar. */
	toast(message: string, opts?: { kind?: 'success' | 'error' | 'info'; timeoutMs?: number }): void;
	/**
	 * Pinta un `VegaError` como mensaje accionable (maestra L4). P3 elige la superficie según
	 * `kind` (§2.3): `network` → banner reintentable; `auth-expired` → overlay de re-login (no
	 * un toast a secas); `forbidden` → mensaje en contexto; `not-found` → estado vacío de la
	 * ruta; `backend`/`validation` → banner/toast con `message` (NUNCA `err.cause`, P1 §5).
	 * `fieldErrors` (validation) son de P5, no los pinta esta API.
	 */
	reportError(err: VegaError, ctx?: { action?: string }): void;
}

/** El contrato completo que P3 publica en contexto y P4/P5/P6 consumen (§2.1). */
export interface VegaAppContext {
	/** El puerto YA autenticado (P3 garantiza sesión válida dentro de rutas protegidas). */
	readonly port: BackendPort;
	/** El `ContentModel` resuelto por P2. Reactivo: cambia tras `reloadModel()`. */
	readonly model: ContentModel;
	/** Sesión activa. Nunca `null` dentro de rutas protegidas (el guard lo garantiza, P3-L2). */
	readonly session: Session;
	/** i18n del chrome (§2.5). Traduce solo strings de UI de Vega, nunca contenido. */
	readonly t: (key: string, params?: Record<string, string | number>) => string;
	/** Idioma efectivo del chrome, resuelto en §2.5. */
	readonly locale: Locale;
	/** Los iconos empaquetados (§2.7). Fuente de `knownIcons` para P2. */
	readonly icons: IconRegistry;

	/** Re-resuelve el modelo (tras `saveManifest` o el botón "Recargar modelo"). Propaga `VegaError`. */
	reloadModel(): Promise<void>;
	/** Navegación tipada (§2.2). Único camino: nadie compone URLs a mano. */
	readonly nav: NavApi;
	/** Feedback global: toasts + reporte de `VegaError` contextual (§2.3). */
	readonly feedback: FeedbackApi;
	/**
	 * Registro del guard de salida para formularios sucios (lo usa P5). P3 lo consulta ANTES de
	 * cualquier navegación interna y del `beforeunload`. Devuelve la función de baja. Contrato:
	 * el guard devuelve `true` = puede salir.
	 */
	registerExitGuard(guard: () => boolean | Promise<boolean>): () => void;
}

/** Clave de contexto de Svelte, un símbolo para no colisionar con contexto de terceros. */
const VEGA_CONTEXT_KEY = Symbol('vega-app-context');

/** Publica el `VegaAppContext` para que los componentes descendientes lo lean con `getVegaContext()`. */
export function setVegaContext(context: VegaAppContext): void {
	setContext(VEGA_CONTEXT_KEY, context);
}

/**
 * Lee el `VegaAppContext` publicado por un ancestro. Lanza si se llama fuera de un árbol de
 * componentes que haya hecho `setVegaContext()` (bug de montaje, no un estado válido de UI:
 * P4/P5/P6 SIEMPRE cuelgan de `+layout.svelte`, que lo publica).
 */
export function getVegaContext(): VegaAppContext {
	const context = getContext<VegaAppContext | undefined>(VEGA_CONTEXT_KEY);
	if (!context) {
		throw new Error(
			'getVegaContext() llamado fuera de un árbol con setVegaContext() (falta el layout de Vega).'
		);
	}
	return context;
}
