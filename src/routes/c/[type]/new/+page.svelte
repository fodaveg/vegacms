<script lang="ts">
	/**
	 * `/c/[type]/new` (§2.4 del contrato P3): marco de CREAR (P5). Fase 3a solo resuelve los
	 * desenlaces que dependen del `ContentModel` ya cargado (P3-L2):
	 *
	 * - `type` inexistente u oculto → `not-found` en contexto (mismo criterio que `/c/[type]`).
	 * - `type.readonly` (view) → `forbidden`: §2.4 "no se crea en views" (P4 tampoco ofrece el
	 *   botón crear para un tipo readonly; esta ruta cierra el hueco si se llega por URL directa).
	 * - Si no, placeholder honesto de P5 (P3-L10), con vuelta al listado (afordancia real, no un
	 *   botón muerto: navega con `ctx.nav.toList`, el único camino de `NavApi`).
	 */
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import { resolveVisibleContentType } from '$lib/nav/content-type';
	import RouteState from '$lib/shell/RouteState.svelte';

	const ctx = getVegaContext();

	const typeParam = $derived(page.params.type ?? '');
	const contentType = $derived(resolveVisibleContentType(ctx.model, typeParam));
</script>

{#if !contentType}
	<RouteState
		kind="not-found"
		title={ctx.t('errors.notFoundType.title')}
		body={ctx.t('errors.notFoundType.body', { type: typeParam })}
		action={{ label: ctx.t('errors.backToIndex'), onClick: () => ctx.nav.toIndex() }}
	/>
{:else if contentType.readonly}
	<RouteState
		kind="forbidden"
		title={ctx.t('errors.forbidden.title')}
		body={ctx.t('errors.forbidden.readonlyType.body', { label: contentType.label })}
		action={{
			label: ctx.t('errors.notFoundRecord.backToList'),
			onClick: () => ctx.nav.toList(contentType.name)
		}}
	/>
{:else}
	<RouteState
		kind="placeholder"
		title={ctx.t('placeholder.create.title')}
		body={ctx.t('placeholder.create.body', { label: contentType.label })}
		action={{
			label: ctx.t('errors.notFoundRecord.backToList'),
			onClick: () => ctx.nav.toList(contentType.name)
		}}
	/>
{/if}
