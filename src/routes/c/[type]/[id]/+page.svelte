<script lang="ts">
	/**
	 * `/c/[type]/[id]` (§2.4 del contrato P3): marco de EDITAR (P5). Fase 3a resuelve el ÚNICO
	 * desenlace que depende solo del `ContentModel` ya cargado (P3-L2): `type` inexistente u
	 * oculto → `not-found`. Con `type` válido pinta el placeholder honesto de P5 mostrando el
	 * `[id]` del deep-link (P3-L10).
	 *
	 * NOTA (anotado para P5, no implementado aquí): "`id` inexistente → not-found" (§2.4, §6.6)
	 * necesita CARGAR el registro (`port.getOne`/equivalente) para saber si existe — eso es la
	 * ruta real de P5, fuera de alcance de este marco. Fase 3a no finge esa comprobación: un `id`
	 * que no existe en el backend hoy sigue mostrando el placeholder de creación/edición honesto,
	 * no un `not-found` falso.
	 */
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import { resolveVisibleContentType } from '$lib/nav/content-type';
	import RouteState from '$lib/shell/RouteState.svelte';

	const ctx = getVegaContext();

	const typeParam = $derived(page.params.type ?? '');
	const idParam = $derived(page.params.id ?? '');
	const contentType = $derived(resolveVisibleContentType(ctx.model, typeParam));
</script>

{#if !contentType}
	<RouteState
		kind="not-found"
		title={ctx.t('errors.notFoundType.title')}
		body={ctx.t('errors.notFoundType.body', { type: typeParam })}
		action={{ label: ctx.t('errors.backToIndex'), onClick: () => ctx.nav.toIndex() }}
	/>
{:else}
	<RouteState
		kind="placeholder"
		title={ctx.t('placeholder.edit.title')}
		body={ctx.t('placeholder.edit.body', { label: contentType.label, id: idParam })}
		badge={contentType.readonly ? ctx.t('nav.readonlyBadge') : undefined}
		action={{
			label: ctx.t('errors.notFoundRecord.backToList'),
			onClick: () => ctx.nav.toList(contentType.name)
		}}
	/>
{/if}
