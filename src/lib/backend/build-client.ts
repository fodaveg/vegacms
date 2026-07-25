/**
 * Cliente HTTP del disparador de build/despliegue (lote "publicación", fase A; contrato en
 * `docs/PROJECT-CONTRACT-v1.md#build-trigger-endpoint-optional`). Fetch crudo, DELIBERADAMENTE fuera del
 * `BackendPort`/adaptador `pocketbase`: esta ruta vive en un `apiBasePath` propio del proyecto
 * conectado, no en el puerto (mismo criterio que `session/project-discovery.ts#fetchProjectDiscovery`,
 * que tampoco pasa por ningún adaptador — ver la cabecera de `BackendPort.buildApiUrl`, `port.ts`).
 *
 * Autentica con el MISMO token que ya usa la sesión activa (`Session.token`), en la cabecera
 * `Authorization` SIN prefijo `Bearer`: es la convención que usa el propio SDK de PocketBase
 * (`pb.authStore.token`, ver `adapters/pocketbase/strong-auth.ts`), así que una extensión Go
 * instalada en el mismo PocketBase puede validar el token con el helper de auth estándar del
 * SDK Go sin inventar un esquema paralelo (documentado con la receta completa en
 * `docs/POCKETBASE-INTEGRATION.md#publicación-disparador-de-build`).
 *
 * Este módulo NUNCA lanza `VegaError`: es ajeno al puerto (igual que `check-update.ts`), así que
 * sus errores son `Error` planos — quien lo consume (`shell/PublishButton.svelte`) los traduce a
 * feedback de UI con su propio criterio, sin fingir un `VegaError.kind` que no le corresponde.
 */

// ————— Contrato del endpoint (§"Build trigger endpoint" del contrato de proyecto) —————

export type BuildState = 'idle' | 'running' | 'ok' | 'failed';

/** `GET {apiBasePath}/status`. Forma completa exigida por el contrato; ver `parseBuildStatus`
 *  para la degradación campo a campo de una respuesta real. */
export interface BuildStatus {
	state: BuildState;
	startedAt: string | null;
	finishedAt: string | null;
	lastPublishedAt: string | null;
	logUrl: string | null;
}

/** `POST {apiBasePath}/trigger` → `202` + este cuerpo (§contrato). */
export interface BuildTriggerResult {
	id: string;
}

export interface BuildClientOptions {
	/** Base ABSOLUTA ya resuelta (`BackendPort.buildApiUrl`), con o sin barra final — se normaliza
	 *  aquí, mismo criterio que el resto del repo (`backend-config.ts#resolveAuthApiBasePath`). */
	apiUrl: string;
	/** `Session.token` de la sesión activa, reenviado tal cual en `Authorization`. */
	token: string;
	/** Inyectable para tests, por defecto el `fetch` global (mismo patrón que `check-update.ts`). */
	fetcher?: typeof fetch;
}

export interface BuildClient {
	/** Dispara un build nuevo. Rechaza si la respuesta no es `2xx` o no trae un `id` no vacío. */
	trigger(): Promise<BuildTriggerResult>;
	/** Consulta el estado actual. Rechaza si la respuesta no es `2xx` o no encaja con `BuildStatus`
	 *  (nunca infiere un estado a partir de una forma parcial — mejor un error explícito que un
	 *  estado inventado, P3-L3). */
	fetchStatus(): Promise<BuildStatus>;
}

const BUILD_STATES: readonly BuildState[] = ['idle', 'running', 'ok', 'failed'];

function stringOrNull(value: unknown): string | null {
	return typeof value === 'string' && value ? value : null;
}

/** Valida la forma de `GET .../status` (§contrato). Exportada para testear la degradación con
 *  documentos sueltos, mismo criterio que `project-discovery.ts#parseProjectDiscovery`: un campo
 *  ausente/de tipo inesperado cae a `null`, pero `state` fuera del vocabulario invalida el
 *  documento entero (es la única señal que decide qué pinta `PublishButton.svelte`). */
export function parseBuildStatus(raw: unknown): BuildStatus | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const record = raw as Record<string, unknown>;
	if (typeof record.state !== 'string' || !BUILD_STATES.includes(record.state as BuildState)) {
		return null;
	}
	return {
		state: record.state as BuildState,
		startedAt: stringOrNull(record.startedAt),
		finishedAt: stringOrNull(record.finishedAt),
		lastPublishedAt: stringOrNull(record.lastPublishedAt),
		logUrl: stringOrNull(record.logUrl)
	};
}

/** Crea el cliente contra una instalación concreta del endpoint de build. Puro transporte: no
 *  cachea estado ni decide cuándo llamarse (eso vive en `pollBuildStatus`, más abajo, y en el
 *  componente que lo monta). */
export function createBuildClient(opts: BuildClientOptions): BuildClient {
	const fetcher = opts.fetcher ?? fetch;
	const base = opts.apiUrl.replace(/\/+$/, '');

	async function request<T>(path: string, method: 'GET' | 'POST'): Promise<T> {
		const response = await fetcher(`${base}${path}`, {
			method,
			headers: { Accept: 'application/json', Authorization: opts.token },
			cache: 'no-store'
		});
		if (!response.ok) {
			throw new Error(
				`El endpoint de build respondió con el estado ${response.status} (${method} ${path}).`
			);
		}
		return (await response.json()) as T;
	}

	return {
		async trigger() {
			const data = await request<Record<string, unknown>>('/trigger', 'POST');
			if (typeof data.id !== 'string' || !data.id) {
				throw new Error('El endpoint de build no devolvió un "id" de disparo válido.');
			}
			return { id: data.id };
		},
		async fetchStatus() {
			const status = parseBuildStatus(await request('/status', 'GET'));
			if (!status) {
				throw new Error('El endpoint de build devolvió un estado con forma inesperada.');
			}
			return status;
		}
	};
}

// ————— Sondeo mientras el build está en curso —————

/** Intervalo de sondeo en estado sano (ms): ni tan corto que machaque al servidor de build (un
 *  despliegue real tarda decenas de segundos-minutos, no tiene sentido más fino que esto), ni
 *  tan largo que el botón "Publicando…" parezca colgado. */
const POLL_INTERVAL_MS = 4000;
/** Techo del back-off exponencial cuando `fetchStatus()` falla en vuelo (servidor de build caído
 *  a mitad de un despliegue, blip de red…): sigue reintentando, cada vez más espaciado, en vez de
 *  martillear o darse por vencido del todo. */
const POLL_MAX_INTERVAL_MS = 30000;

export interface PollBuildStatusOptions {
	/** Se llama con CADA estado leído con éxito, incluido el primero. */
	onStatus: (status: BuildStatus) => void;
	/** Se llama en cada fallo de `fetchStatus()`; el sondeo sigue vivo (con back-off), nunca se
	 *  detiene solo por esto — opcional, para que la UI pueda avisar sin cortar el sondeo. */
	onError?: (err: unknown) => void;
	intervalMs?: number;
	maxIntervalMs?: number;
}

/**
 * Sondea `client.fetchStatus()` MIENTRAS el estado devuelto siga siendo `'running'`. Se detiene
 * SOLO (sin más temporizadores programados) en cuanto ve un estado terminal (`'idle'`/`'ok'`/
 * `'failed'`) o en cuanto quien llama invoca la función `stop()` devuelta — nunca deja un
 * `setTimeout` huérfano corriendo tras desmontar el componente que lo inició (la razón de ser de
 * esta función: `onDestroy` de `PublishButton.svelte` SIEMPRE debe poder llamar a `stop()`).
 *
 * El primer sondeo es INMEDIATO (sin esperar `intervalMs`): quien llama normalmente acaba de
 * disparar un `trigger()` o acaba de montar el botón y quiere el estado real cuanto antes.
 */
export function pollBuildStatus(client: BuildClient, opts: PollBuildStatusOptions): () => void {
	const interval = opts.intervalMs ?? POLL_INTERVAL_MS;
	const maxInterval = opts.maxIntervalMs ?? POLL_MAX_INTERVAL_MS;
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let delay = interval;

	function schedule(ms: number): void {
		if (stopped) return;
		timer = setTimeout(tick, ms);
	}

	async function tick(): Promise<void> {
		if (stopped) return;
		try {
			const status = await client.fetchStatus();
			delay = interval; // éxito: resetea el back-off para el próximo fallo, si lo hay
			if (stopped) return;
			opts.onStatus(status);
			if (status.state !== 'running') return; // terminal: no se reprograma más
		} catch (err) {
			if (stopped) return;
			opts.onError?.(err);
			delay = Math.min(delay * 2, maxInterval);
		}
		schedule(delay);
	}

	schedule(0);

	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
		timer = null;
	};
}
