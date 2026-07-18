/**
 * `transportFeedback` (Fase 2c, §2.3/§3.4 del contrato P3): estado de los `VegaError`
 * 'network'/'backend' que aflotan a MITAD de sesión — a diferencia de los de ARRANQUE, que
 * `+layout.svelte` sigue pintando como pantalla completa honesta (§3.1.1) sin pasar por aquí.
 * Alimenta dos piezas del chrome que antes no tenían de dónde leer esto: `GlobalBanner.svelte`
 * (el mensaje reintentable/descartable) y `ConnectionStatus.svelte` (el punto de conexión de la
 * topbar). Singleton de módulo, mismo patrón que `toasts.svelte.ts`/`icons/registry.ts`.
 *
 * `state` distingue 'network' (afecta al indicador de conexión) de 'backend' (un backend que
 * responde algo inesperado no es necesariamente "sin conexión" — la sesión y el transporte
 * pueden seguir sanos; solo se avisa con el banner, sin tocar `ConnectionStatus`).
 */
import { VegaError } from '$lib/backend';

export type TransportState = 'connected' | 'disconnected' | 'retrying';

let state = $state<TransportState>('connected');
let bannerError = $state<VegaError | null>(null);

function report(err: VegaError): void {
	// `auth-expired` NUNCA va al banner (§2.3/§3.1.4): su única superficie es el `ReloginModal`,
	// que se abre por la vía independiente de `onAuthChange('expired')`. Aquí se limpia el banner y
	// se restablece el transporte: la sesión caducó, pero la CONEXIÓN está sana. (Esto importa en
	// el `catch` de `retry()`: una sonda que resuelve en `auth-expired` no debe dejar el banner
	// pintando su mensaje ni `ConnectionStatus` clavado en "Reintentando…".)
	if (err.kind === 'auth-expired') {
		bannerError = null;
		state = 'connected';
		return;
	}
	// Solo 'network' afecta al indicador de conexión; cualquier otro `kind` (backend/…) significa
	// que el transporte SÍ respondió, así que el estado vuelve a 'connected' aunque se avise con el
	// banner. Fijarlo SIEMPRE (no solo en 'network') evita que quede atascado en 'retrying' tras un
	// reintento que falla con un `kind` distinto de red.
	state = err.kind === 'network' ? 'disconnected' : 'connected';
	bannerError = err;
}

export const transportFeedback = {
	get state(): TransportState {
		return state;
	},
	get bannerError(): VegaError | null {
		return bannerError;
	},
	/** `feedback.reportError` lo llama para 'network'/'backend' (§2.3). */
	report,
	/**
	 * Reintento genérico del banner: ejecuta `probe` (una operación de solo lectura, barata e
	 * idempotente contra el puerto — `GlobalBanner` usa `listContentTypes()`) para comprobar si la
	 * conectividad se ha restablecido, SIN tocar `modelStatus`/`model` (a propósito: reintentar NO
	 * puede desmontar el shell, §3.4 — si usara `reloadModel()`, el layout mostraría de nuevo la
	 * pantalla de carga global mientras dura).
	 */
	async retry(probe: () => Promise<void>): Promise<void> {
		state = 'retrying';
		try {
			await probe();
			state = 'connected';
			bannerError = null;
		} catch (err) {
			report(err instanceof VegaError ? err : VegaError.backend('Error inesperado', err));
		}
	},
	/** Descarta el banner sin reintentar (§2.3, "Descartable"). No toca `state`: si seguía
	 *  'disconnected', `ConnectionStatus` lo refleja hasta el próximo `retry()`/`report()`. */
	dismiss(): void {
		bannerError = null;
	}
};
