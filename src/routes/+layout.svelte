<script lang="ts">
	/**
	 * AppShell + provider de `VegaAppContext`/`SessionStore` + guard de sesión (§3.1, §3.4, P3-L9).
	 * Único punto del árbol de rutas que instancia el estado de sesión/modelo y los publica en
	 * contexto (§2.1); `/login` y las rutas protegidas los leen vía `getSessionContext()`/
	 * `getVegaContext()`, nunca instanciando nada por su cuenta.
	 *
	 * Orquestación:
	 * 1. Al montar: aplica el tema inicial (evita FOUC) y arranca `sessionStore.restore()`.
	 * 2. Con sesión, carga el `ContentModel` (P2) una vez.
	 * 3. El guard de rutas (protegida sin sesión → /login; /login con sesión → índice) espera a
	 *    `afterNavigate` (router-ready, P3-L9): ninguna navegación programática antes de eso.
	 * 4. Estados globales honestos (P3-L3): loading, `network-error` con Reintentar (ni sesión ni
	 *    modelo expulsan a login por un fallo de red — el token puede seguir siendo válido).
	 *
	 * Feedback del sistema (Fase 2c, §2.3/§3.1.3/§3.4): `ToastHost`/`GlobalBanner`/`ReloginModal`
	 * se montan FUERA del árbol condicional de arriba, así que sobreviven a cualquier transición
	 * de estado y quedan visibles sobre cualquier ruta protegida.
	 * - `feedback.toast()` escribe en `toastStore` (`toasts.svelte.ts`); `ToastHost` lo pinta.
	 * - `feedback.reportError('network'|'backend')` escribe en `transportFeedback`
	 *   (`transport-feedback.svelte.ts`); `GlobalBanner` lo pinta y `ConnectionStatus` lee su
	 *   `state`. Los errores de ARRANQUE (antes de que `AppShell` exista) NO pasan por aquí: siguen
	 *   siendo las pantallas completas de más abajo (§3.1.1).
	 * - `'auth-expired'` no toca ninguno de los dos: `ReloginModal` reacciona directamente a
	 *   `sessionStore.expired`, que `onAuthChange('expired')` ya marca (session.svelte.ts, §3.1.3).
	 */
	import favicon from '$lib/assets/favicon.svg';
	// El CSS generado del motor P7 define los tokens §3 (`--bg`/`--ink`/`--accent`/…) por
	// `data-theme`/`data-mode`/`data-density`; el shim de `theme/base.css` los REFERENCIA
	// (`--vega-color-*: var(--token)`), así que tiene que importarse después (Fase F7w-a).
	import '$lib/themes/themes.generated.css';
	import '$lib/theme/base.css';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { ContentModel } from '$lib/model/types';
	import { loadContentModel } from '$lib/model/load';
	import { getBackend } from '$lib/session/backend';
	import { createSessionStore, setSessionContext } from '$lib/session/session.svelte';
	import { setVegaContext, type NavApi, type FeedbackApi } from '$lib/app-context';
	import { t as translate, resolveLocale, type Locale } from '$lib/i18n';
	import { iconRegistry } from '$lib/icons/registry';
	import { applyInitialTheme } from '$lib/theme/apply';
	import {
		indexRoute,
		listRoute,
		loginRoute,
		mediaRoute,
		newRoute,
		recordRoute,
		settingsRoute
	} from '$lib/nav/routes';
	import { resolveSingletonTarget } from '$lib/nav/singleton';
	import { VegaError } from '$lib/backend';
	import AppShell from '$lib/shell/AppShell.svelte';
	import ToastHost from '$lib/shell/ToastHost.svelte';
	import GlobalBanner from '$lib/shell/GlobalBanner.svelte';
	import ReloginModal from '$lib/shell/ReloginModal.svelte';
	import { toastStore } from '$lib/shell/toasts.svelte';
	import { transportFeedback } from '$lib/shell/transport-feedback.svelte';

	let { children } = $props();

	const sessionStore = createSessionStore(getBackend);
	setSessionContext(sessionStore);

	type ModelStatus = 'idle' | 'loading' | 'ready' | 'network-error' | 'error';

	let model = $state<ContentModel | null>(null);
	let modelStatus = $state<ModelStatus>('idle');
	let modelError = $state<VegaError | null>(null);
	let locale = $state<Locale>('es');
	let routerReady = $state(false);
	let pendingRedirectTarget: string | null = null;

	// Registro imperativo (nunca se lee en el template, no necesita reactividad de Svelte):
	// `SvelteSet` añadiría overhead de señales sin ningún consumidor reactivo.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const exitGuards = new Set<() => boolean | Promise<boolean>>();

	function registerExitGuard(guard: () => boolean | Promise<boolean>): () => void {
		exitGuards.add(guard);
		return () => exitGuards.delete(guard);
	}

	async function confirmCanLeave(): Promise<boolean> {
		for (const guard of exitGuards) {
			if (!(await guard())) return false;
		}
		return true;
	}

	async function navigateTo(url: string): Promise<void> {
		if (!(await confirmCanLeave())) return;
		await goto(url);
	}

	const nav: NavApi = {
		toIndex: () => void navigateTo(indexRoute()),
		toList: (type) => void navigateTo(listRoute(type)),
		toNew: (type) => void navigateTo(newRoute(type)),
		toRecord: (type, id) => void navigateTo(recordRoute(type, id)),
		toSingleton: async (type) => {
			// La resolución consulta el puerto (§3.3): un fallo de red/backend NO debe propagarse
			// como promesa rechazada sin capturar (dejaría al índice congelado en "Cargando…",
			// P3-L3). Se enruta por `feedback.reportError` como cualquier otro estado global.
			try {
				const port = sessionStore.port;
				const result = await port.list(type, { perPage: 1 });
				const target = resolveSingletonTarget(type, result.totalItems, result.items[0]?.id);
				await navigateTo(target.url);
			} catch (err) {
				feedback.reportError(
					err instanceof VegaError ? err : VegaError.backend('Error resolviendo el singleton', err),
					{ action: `toSingleton:${type}` }
				);
			}
		},
		toMedia: () => void navigateTo(mediaRoute()),
		toSettings: () => void navigateTo(settingsRoute()),
		toLogin: () => void navigateTo(loginRoute())
	};

	const feedback: FeedbackApi = {
		toast(message, opts) {
			toastStore.push(message, opts);
		},
		reportError(err, ctx) {
			if (err.kind === 'auth-expired') {
				// El overlay de re-login reacciona directamente a `sessionStore.expired`, que
				// `onAuthChange('expired')` ya marca (session.svelte.ts, §3.1.3) — NO un toast.
				return;
			}
			if (err.kind === 'network' || err.kind === 'backend') {
				// Banner global reintentable/descartable (§3.4) + `ConnectionStatus` (vía
				// `transportFeedback.state`, solo para 'network'). Nunca `err.cause` (P1 §5): el
				// banner solo pinta `err.message`.
				transportFeedback.report(err);
				return;
			}
			// 'forbidden'/'not-found'/'validation' fuera de campo: su superficie EN CONTEXTO es de
			// P4/P5 (§2.3, tabla de la ruta). Aquí, mínimo honesto (P3-L10, "nada muere en
			// silencio"): un toast persistente con el mensaje real, nunca `err.cause`, hasta que la
			// parte correspondiente exista y lo pinte donde toca.
			toastStore.push(err.message, { kind: 'error' });
			if (ctx?.action) console.error(`[vega:${err.kind}]`, err.message, ctx.action);
		}
	};

	function t(key: string, params?: Record<string, string | number>): string {
		return translate(locale, key, params);
	}

	async function loadModel(): Promise<void> {
		// Fase 3b (P3-L5, §7.B.10): distingue la carga INICIAL (sin modelo todavía, `modelStatus`
		// aún no es 'ready') de un RECARGO (`reloadModel()` tras `saveManifest` o el botón
		// "Recargar modelo" de `/settings`). Solo la inicial puede tapar la pantalla entera con
		// loading/error — es el único momento en que no hay nada montado debajo que proteger. Un
		// recargo con `modelStatus` ya 'ready' NUNCA vuelve a pasar por 'loading'/'error'/
		// 'network-error': hacerlo desmontaría `AppShell` (y con él cualquier vista con estado en
		// memoria, p.ej. el textarea del `ManifestEditor` a mitad de edición) por culpa del propio
		// refresco, violando P3-L5. Un fallo de transporte durante un recargo se enruta por
		// `feedback.reportError`, igual que cualquier otro fallo a mitad de sesión (§3.4): 'network'/
		// 'backend' al banner global, 'auth-expired' al overlay de re-login (vía `sessionStore.expired`,
		// que el propio adaptador ya marca antes de lanzar) — nunca a una pantalla completa.
		const isReload = modelStatus === 'ready';
		if (!isReload) {
			modelStatus = 'loading';
			modelError = null;
		}
		// Guard de resultado stale: si la sesión cambia (logout / re-login) MIENTRAS este `await`
		// está en vuelo, el modelo cargado es de la sesión anterior y NO debe pintarse. Se captura
		// el token de arranque y se descarta el resultado si ya no coincide al resolver.
		const startedToken = sessionStore.session?.token ?? null;
		const isStale = () => (sessionStore.session?.token ?? null) !== startedToken;
		// Sesión NUEVA tras el cambio → vuelve a 'idle' para que el `$effect` de sesión dispare una
		// carga fresca; si fue logout (sin sesión), ese mismo efecto ya resetea a 'idle'.
		const discardStale = () => {
			if (sessionStore.session) modelStatus = 'idle';
		};
		try {
			const port = sessionStore.port;
			const loaded = await loadContentModel(port, { knownIcons: iconRegistry.knownIcons });
			if (isStale()) return discardStale();
			model = loaded;
			locale = resolveLocale(
				loaded.site.locale ? { locale: loaded.site.locale } : null,
				typeof navigator !== 'undefined' ? navigator.language : null
			);
			// Re-aplica el tema con el default REAL del proyecto (§2.6): idempotente, no pisa una
			// preferencia ya guardada (`applyInitialTheme` prioriza `localStorage` siempre).
			applyInitialTheme({ siteDefaultTheme: loaded.site.defaultTheme });
			modelStatus = 'ready';
		} catch (err) {
			// Un error de una sesión ya obsoleta tampoco debe pintarse (ni como pantalla ni como banner).
			if (isStale()) return discardStale();
			const vegaErr =
				err instanceof VegaError
					? err
					: VegaError.backend('Error inesperado cargando el modelo', err);
			if (isReload) {
				feedback.reportError(vegaErr, { action: 'reloadModel' });
				return;
			}
			modelError = vegaErr;
			modelStatus = vegaErr.kind === 'network' ? 'network-error' : 'error';
		}
	}

	// `VegaAppContext` se publica UNA vez, síncrono, en la inicialización (obligatorio para
	// `setContext`). `model`/`session`/`locale` viajan como getters sobre estado reactivo: se
	// leen SIEMPRE ya resueltos porque el template solo renderiza `AppShell`/`children` cuando
	// ambos están listos (guard de más abajo) — "confía en el guard", patrón habitual de Svelte 5
	// para contextos que dependen de datos async.
	setVegaContext({
		get port() {
			return sessionStore.port;
		},
		get model() {
			return model as ContentModel;
		},
		get session() {
			return sessionStore.session!;
		},
		t,
		get locale() {
			return locale;
		},
		icons: iconRegistry,
		async reloadModel() {
			await loadModel();
		},
		nav,
		feedback,
		registerExitGuard
	});

	onMount(() => {
		applyInitialTheme();
		void sessionStore.restore();

		// Gancho de e2e confinado al adaptador `memory` (tipado en `src/app.d.ts`).
		if (window.__VEGA_ADAPTER__ === 'memory') {
			window.__VEGA_TEST_TOAST__ = (message, opts) => feedback.toast(message, opts);
		}
	});

	// Carga/descarga el modelo en función de la sesión (login → carga una vez; logout → limpia
	// para que el siguiente login recargue desde cero).
	$effect(() => {
		if (sessionStore.session) {
			if (modelStatus === 'idle') void loadModel();
		} else if (modelStatus !== 'idle') {
			model = null;
			modelStatus = 'idle';
			modelError = null;
		}
	});

	afterNavigate(() => {
		routerReady = true;
	});

	// Guard de rutas (§2.4, §3.1, P3-L9): NUNCA navega antes de que el router esté listo.
	$effect(() => {
		if (!routerReady) return;
		if (
			sessionStore.status === 'loading' ||
			sessionStore.status === 'network-error' ||
			sessionStore.status === 'error'
		)
			return;

		const path = page.url.pathname;
		const onLoginRoute = path === loginRoute();

		if (!sessionStore.session) {
			if (!onLoginRoute) {
				// Conserva query y ancla del deep-link para restaurarlos tras el login.
				pendingRedirectTarget = path + page.url.search + page.url.hash;
				void goto(loginRoute());
			}
			return;
		}

		if (onLoginRoute) {
			const target = pendingRedirectTarget ?? indexRoute();
			pendingRedirectTarget = null;
			void goto(target);
		}
	});

	const isLoginPath = $derived(page.url.pathname === loginRoute());
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#snippet loadingState()}
	<div class="vega-global-state" aria-live="polite">
		<p>{t('common.loading')}</p>
	</div>
{/snippet}

{#if sessionStore.status === 'network-error'}
	<div class="vega-global-state" role="alert">
		<h1>{t('errors.network.title')}</h1>
		<p>{t('errors.network.body')}</p>
		<button type="button" onclick={() => sessionStore.retryRestore()}>
			{t('errors.network.retry')}
		</button>
	</div>
{:else if sessionStore.status === 'error'}
	<!-- Fallo de transporte NO-red al restaurar (p.ej. backend 5xx): mensaje honesto + Reintentar,
	     NUNCA login silencioso ni `err.cause` crudo (P3-L3/§3.4). -->
	<div class="vega-global-state" role="alert">
		<h1>{t('errors.backend.title')}</h1>
		<p>{sessionStore.restoreError?.message}</p>
		<button type="button" onclick={() => sessionStore.retryRestore()}>{t('common.retry')}</button>
	</div>
{:else if sessionStore.status === 'loading'}
	{@render loadingState()}
{:else if isLoginPath && !sessionStore.session}
	{@render children()}
{:else if !sessionStore.session}
	{@render loadingState()}
{:else if modelStatus === 'network-error'}
	<div class="vega-global-state" role="alert">
		<h1>{t('errors.network.title')}</h1>
		<p>{t('errors.network.body')}</p>
		<button type="button" onclick={() => loadModel()}>{t('errors.network.retry')}</button>
	</div>
{:else if modelStatus === 'error'}
	<div class="vega-global-state" role="alert">
		<h1>{t('errors.backend.title')}</h1>
		<p>{modelError?.message}</p>
		<button type="button" onclick={() => loadModel()}>{t('common.retry')}</button>
	</div>
{:else if modelStatus !== 'ready' || !model}
	{@render loadingState()}
{:else if isLoginPath}
	{@render loadingState()}
{:else}
	<AppShell>
		{@render children()}
	</AppShell>
{/if}

<!-- Feedback del sistema (Fase 2c, §2.3): fuera del `{#if}` de arriba a propósito, para que
     sobrevivan a cualquier transición de estado y queden visibles sobre cualquier ruta protegida
     sin depender de que `AppShell` esté montado. Los tres renderizan `null` cuando no hay nada
     que mostrar (`toastStore.entries` vacío / `transportFeedback.bannerError` nulo /
     `sessionStore.expired` falso), así que montarlos siempre es seguro. -->
<ToastHost />
<GlobalBanner />
<ReloginModal />

<style>
	.vega-global-state {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		max-width: 32rem;
		margin: 15vh auto 0;
		padding: 1.5rem;
		text-align: left;
	}

	.vega-global-state h1 {
		margin: 0;
		font-size: 1.2rem;
	}

	.vega-global-state button {
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		cursor: pointer;
	}
</style>
