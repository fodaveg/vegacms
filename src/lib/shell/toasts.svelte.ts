/**
 * `toastStore` (Fase 2c, §2.3 del contrato P3): implementación real de `FeedbackApi.toast`
 * (`+layout.svelte` la publica en `VegaAppContext.feedback.toast`), consumida por
 * `ToastHost.svelte`. Singleton de MÓDULO (mismo patrón que `icons/registry.ts`): la app es SPA
 * client-only (`ssr=false`), así que una única cola por pestaña es todo lo que hace falta — no
 * necesita contexto de Svelte porque no hay nada que aislar entre árboles de componentes.
 *
 * - `success` / `info`: efímeros, se autodescartan tras `timeoutMs` (default por `kind`, §2.3).
 * - `error`: persistente HASTA que el usuario lo descarta explícitamente (§2.3: nunca se pierde
 *   un error sin que alguien lo haya visto y lo haya cerrado).
 */

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastEntry {
	readonly id: number;
	readonly message: string;
	readonly kind: ToastKind;
}

/** `timeoutMs` por defecto según `kind` (§2.3). `null` = persistente (nunca se autodescarta). */
const DEFAULT_TIMEOUT_MS: Record<ToastKind, number | null> = {
	success: 4000,
	info: 4000,
	error: null
};

let nextId = 0;
let entries = $state<ToastEntry[]>([]);
// Registro imperativo de timers (nunca se lee en el template, no necesita reactividad de Svelte):
// mismo criterio que `exitGuards` en `+layout.svelte`.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function clearTimer(id: number): void {
	const timer = timers.get(id);
	if (timer !== undefined) {
		clearTimeout(timer);
		timers.delete(id);
	}
}

function dismiss(id: number): void {
	clearTimer(id);
	entries = entries.filter((entry) => entry.id !== id);
}

function push(message: string, opts?: { kind?: ToastKind; timeoutMs?: number }): void {
	const kind = opts?.kind ?? 'info';
	const id = nextId++;
	entries = [...entries, { id, message, kind }];

	const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS[kind];
	if (timeoutMs !== null) {
		timers.set(
			id,
			setTimeout(() => dismiss(id), timeoutMs)
		);
	}
}

/** Superficie que consumen `+layout.svelte` (escribe, vía `push`) y `ToastHost.svelte` (lee). */
export const toastStore = {
	get entries(): readonly ToastEntry[] {
		return entries;
	},
	push,
	dismiss
};
