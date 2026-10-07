/**
 * `toastStore` (Fase 2c, §2.3 del contrato P3): implementación real de `FeedbackApi.toast`
 * (`+layout.svelte` la publica en `VegaAppContext.feedback.toast`), consumida por
 * `ToastHost.svelte`. Singleton de MÓDULO (mismo patrón que `icons/registry.ts`): la app es SPA
 * client-only (`ssr=false`), así que una única cola por pestaña es todo lo que hace falta — no
 * necesita contexto de Svelte porque no hay nada que aislar entre árboles de componentes.
 *
 * - `success` / `info`: efímeros, se autodescartan tras `timeoutMs` (default por `kind`, §2.3).
 * - Las acciones permanecen hasta pulsarlas o descartarlas; no se pierde su oportunidad.
 * - `error`: persistente HASTA que el usuario lo descarta explícitamente (§2.3: nunca se pierde
 *   un error sin que alguien lo haya visto y lo haya cerrado).
 */

import type { ToastAction } from '$lib/app-context';

type ToastKind = 'success' | 'error' | 'info';

interface ToastEntry {
	readonly id: number;
	readonly message: string;
	readonly kind: ToastKind;
	readonly action?: ToastAction;
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

function push(
	message: string,
	opts?: { kind?: ToastKind; timeoutMs?: number; action?: ToastAction }
): void {
	const kind = opts?.kind ?? 'info';
	const id = nextId++;
	entries = [...entries, { id, message, kind, action: opts?.action }];

	const timeoutMs = opts?.action ? null : (opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS[kind]);
	if (timeoutMs !== null) {
		timers.set(
			id,
			setTimeout(() => dismiss(id), timeoutMs)
		);
	}
}

/** Una acción se consume una sola vez y se descarta si su sesión dejó de ser válida. */
function invokeAction(id: number): void {
	const action = entries.find((entry) => entry.id === id)?.action;
	dismiss(id);
	if (action?.isCurrent()) action.invoke();
}

/** Al cerrar/cambiar sesión no se conserva información ni acciones de la cuenta anterior. */
function dismissActions(): void {
	for (const entry of entries) if (entry.action) dismiss(entry.id);
}

/** Superficie que consumen `+layout.svelte` (escribe, vía `push`) y `ToastHost.svelte` (lee). */
export const toastStore = {
	get entries(): readonly ToastEntry[] {
		return entries;
	},
	push,
	dismissActions,
	invokeAction,
	dismiss
};
