<script lang="ts">
	/**
	 * `/` (§2.4, §6.1 del contrato P3): índice. Redirige al primer `NavItem` del primer grupo con
	 * items (respetando `singleton`, §3.3); si la nav está vacía, se queda aquí con un estado
	 * vacío honesto y una guía a `/settings` (caso límite §6.1 — es también el estado real de la
	 * semilla de demo/e2e, ver `session/demo-seed.ts`).
	 *
	 * Solo se monta dentro de una ruta protegida (guard de `+layout.svelte`): `getVegaContext()`
	 * siempre tiene `model`/`session` listos aquí.
	 *
	 * Guard P3-L9 vía `onMount` (NO `afterNavigate`): este componente solo llega a montarse cuando
	 * `+layout.svelte` ya resolvió sesión+modelo (`{#if modelStatus === 'ready'}`), muy por detrás
	 * de la hidratación — el router está asentado sin duda. `afterNavigate` era frágil aquí: en un
	 * hard-reload/deep-link DIRECTO a `/` con sesión válida, su único evento se dispara ANTES de que
	 * este componente exista, así que el callback jamás corría y la redirección quedaba colgada en
	 * "Cargando…". Mismo razonamiento (y mismo bug evitado) que `routes/c/[type]/+page.svelte`.
	 */
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { listRoute, viewRoute } from '$lib/nav/routes';

	const ctx = getVegaContext();

	let routerReady = $state(false);
	onMount(() => {
		routerReady = true;
	});

	const firstItem = $derived(ctx.model.nav.groups.flatMap((group) => group.items)[0] ?? null);

	// Guard P3-L9: nunca navega antes de que el router esté listo. Una vista fusionada (L7c,
	// `kind === 'view'`) nunca es singleton (P2 §4.6 no aplica) — enruta directo a `/v/:id`.
	$effect(() => {
		if (!routerReady || !firstItem) return;
		if (firstItem.kind === 'view') {
			void goto(viewRoute(firstItem.type));
		} else if (firstItem.singleton) {
			void ctx.nav.toSingleton(firstItem.type);
		} else {
			void goto(listRoute(firstItem.type));
		}
	});
</script>

{#if !firstItem}
	<div class="vega-empty-nav">
		<h1>{ctx.t('nav.emptyTitle')}</h1>
		<p>{ctx.t('nav.emptyBody')}</p>
		<button type="button" onclick={() => ctx.nav.toSettings()}>{ctx.t('nav.emptyCta')}</button>
	</div>
{:else}
	<p aria-live="polite">{ctx.t('common.loading')}</p>
{/if}

<style>
	.vega-empty-nav {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		max-width: 30rem;
	}

	.vega-empty-nav h1 {
		margin: 0;
		font-size: 1.2rem;
	}

	.vega-empty-nav button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		cursor: pointer;
	}
</style>
