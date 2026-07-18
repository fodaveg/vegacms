<script lang="ts">
	/**
	 * `/c/[type]` (§2.4, §3.3 del contrato P3): marco de LISTADO (P4) + resolutor de singleton por
	 * deep-link (§3.3, §7.B.12). Fase 3a NO implementa el listado real (eso es P4): resuelve los
	 * tres desenlaces que dependen solo del `ContentModel` ya cargado (P3-L2 garantiza sesión y
	 * modelo listos aquí, `getVegaContext()` nunca lanza en esta ruta).
	 *
	 * - `type` inexistente u oculto → `not-found` en contexto (§6.5): NO redirige a `/login`.
	 * - `type` con `singleton: true` → nunca pinta listado: resuelve la regla runtime de P2 §4.6
	 *   con `ctx.nav.toSingleton()`, el MISMO camino que usa un click de sidebar (`NavItem.svelte`)
	 *   — incluida su captura de errores de transporte vía `feedback.reportError` (P3-L3: ninguna
	 *   promesa rechazada suelta).
	 * - `type` normal → placeholder honesto de P4 (P3-L10), con la insignia "Solo lectura" si
	 *   `type.readonly` (view).
	 *
	 * Guard P3-L9 (router-ready antes de navegar): esta ruta usa `onMount`, NO el patrón
	 * `afterNavigate` + `routerReady` del índice (`routes/+page.svelte`). Motivo (bug real
	 * encontrado al implementar esta fase, anotado para no repetirlo): `+layout.svelte` NO monta
	 * `{@render children()}` hasta que `modelStatus === 'ready'` (async); un deep-link DIRECTO
	 * (`page.goto('/c/tipo')`, sin navegación cliente previa) dispara UNA sola vez el evento
	 * `afterNavigate` de SvelteKit, en el instante de la hidratación — ANTES de que este
	 * componente llegue a montarse (el `{#if}` del layout aún lo tiene oculto). El callback local
	 * de `afterNavigate` registrado aquí llegaría tarde a ese único evento y JAMÁS se dispararía
	 * (no hay una segunda navegación que lo rescate), dejando el efecto de abajo bloqueado para
	 * siempre. El índice sale indemne solo porque SIEMPRE llega aquí vía una navegación cliente
	 * real (el `goto()` del guard de sesión tras el login), que sí genera un evento nuevo — pero
	 * el mismo hueco existe ahí para una recarga/deep-link directo a `/` con sesión ya válida.
	 * `onMount` es equivalente y robusto en ambos casos: este componente SOLO llega a existir
	 * después de que el layout resolvió sesión+modelo, momento en el que el router YA está
	 * asentado sin ninguna duda (la ventana de riesgo de la landmine de Lumbre — navegar durante
	 * el primer render síncrono, antes de hidratar — ya ha pasado hace rato).
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import { resolveVisibleContentType } from '$lib/nav/content-type';
	import RouteState from '$lib/shell/RouteState.svelte';

	const ctx = getVegaContext();

	const typeParam = $derived(page.params.type ?? '');
	const contentType = $derived(resolveVisibleContentType(ctx.model, typeParam));

	let routerReady = $state(false);
	onMount(() => {
		routerReady = true;
	});

	$effect(() => {
		if (!routerReady || !contentType?.singleton) return;
		void ctx.nav.toSingleton(contentType.name);
	});
</script>

{#if !contentType}
	<RouteState
		kind="not-found"
		title={ctx.t('errors.notFoundType.title')}
		body={ctx.t('errors.notFoundType.body', { type: typeParam })}
		action={{ label: ctx.t('errors.backToIndex'), onClick: () => ctx.nav.toIndex() }}
	/>
{:else if contentType.singleton}
	<!-- La resolución de singleton está en vuelo (o a punto de arrancar tras router-ready): nunca
	     se pinta el listado para un singleton (§3.3). `aria-live` por consistencia con el estado de
	     carga global de `+layout.svelte`. -->
	<p aria-live="polite">{ctx.t('common.loading')}</p>
{:else}
	<RouteState
		kind="placeholder"
		title={ctx.t('placeholder.list.title')}
		body={ctx.t('placeholder.list.body', { label: contentType.label })}
		badge={contentType.readonly ? ctx.t('nav.readonlyBadge') : undefined}
	/>
{/if}
