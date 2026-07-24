/**
 * `updateBannerState` (P8): estado reactivo que alimenta `UpdateBanner.svelte`. Singleton de
 * módulo, mismo patrón que `toasts.svelte.ts`/`transport-feedback.svelte.ts` — la app es SPA
 * client-only, una única instancia por pestaña basta.
 *
 * Este store NUNCA llama a `checkForUpdate` por su cuenta salvo que se lo pidan explícitamente
 * (`runAutoCheckIfEnabled`, y solo si la preferencia está en `true`): es la mitad "shell" del
 * opt-in, la otra mitad vive en `update/check-update.ts` (ver su cabecera). Se inicializa leyendo
 * lo que YA hubiera en `localStorage` (de una sesión anterior o de un check manual en
 * `/settings`), así que el banner puede aparecer sin que nadie dispare red en esta carga.
 */
import { checkForUpdate } from '$lib/update/check-update';
import { shouldShowUpdateBanner } from '$lib/update/preferences';
import {
	readAutoCheckPreference,
	readCachedUpdateCheck,
	readDismissedVersion,
	writeDismissedVersion,
	type CachedUpdateCheck
} from '$lib/update/storage';

let cached = $state<CachedUpdateCheck | null>(readCachedUpdateCheck());
let dismissedVersion = $state<string | null>(readDismissedVersion());

/** Re-lee la caché de `localStorage` (después de un check manual desde `/settings`, o del propio
 *  `runAutoCheckIfEnabled` de abajo): mismo patrón que `toastStore`/`transportFeedback`, el
 *  estado del módulo es la única fuente que lee el template de `UpdateBanner`. */
function refresh(): void {
	cached = readCachedUpdateCheck();
}

export const updateBannerState = {
	/** `true` solo cuando hay una versión más nueva cacheada Y no era la que el usuario descartó
	 *  (`update/preferences.ts#shouldShowUpdateBanner`). */
	get visible(): boolean {
		return shouldShowUpdateBanner(cached, dismissedVersion);
	},
	/** El propio `UpdateStatus` cacheado, para que el banner pinte versión + link sin volver a
	 *  leer `localStorage` directamente. `null` si `visible` es falso (el template no lo usa). */
	get status(): CachedUpdateCheck['status'] | null {
		return cached?.status ?? null;
	},
	refresh,
	/** Descarta el banner para la versión actual (§ "no reaparece para ESA versión"). No-op si no
	 *  hay ninguna actualización disponible que descartar. */
	dismiss(): void {
		if (cached?.status.kind !== 'update-available') return;
		const { latest } = cached.status;
		writeDismissedVersion(latest);
		dismissedVersion = latest;
	},
	/** Dispara `checkForUpdate` UNA vez, solo si `readAutoCheckPreference()` está en `true`
	 *  (`+layout.svelte`, `onMount`) — la mitad "automática" del opt-in de §3 del encargo. Con la
	 *  preferencia en `false` (default) esto es un no-op total: ni fetch ni escritura. */
	async runAutoCheckIfEnabled(fetchImpl?: typeof fetch): Promise<void> {
		if (!readAutoCheckPreference()) return;
		await checkForUpdate(fetchImpl);
		refresh();
	}
};
