<script lang="ts">
	/**
	 * `/c/[type]/new` (§2.4 del contrato P3; Fase F5-a del contrato P5): CREACIÓN real.
	 *
	 * - `type` inexistente u oculto → `not-found` (P3-L2, mismo criterio que `/c/[type]`).
	 * - `type.readonly` (view) → `forbidden`: §2.4 "no se crea en views" (P4 tampoco ofrece el
	 *   botón crear para un tipo readonly; esta ruta cierra el hueco si se llega por URL directa).
	 * - Si no, `buildFormModel(type, null)` (D-P5.11: baseline = defaults, PURO, sin red) y
	 *   `RecordForm` hace el resto: "Guardar" llama `ctx.port.create`; al terminar, reasienta
	 *   baseline (dentro de `RecordForm`, L-P5.6) y esta ruta navega a la EDICIÓN del nuevo id
	 *   (D-P5.11 "destino post-create"), el mismo camino que resuelve un singleton con 1 registro
	 *   (§3.3, ya cubierto por P3).
	 */
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import { resolveVisibleContentType } from '$lib/nav/content-type';
	import { buildFormModel } from '$lib/form/form-model';
	import RouteState from '$lib/shell/RouteState.svelte';
	import RecordForm from '$lib/form/RecordForm.svelte';

	const ctx = getVegaContext();

	const typeParam = $derived(page.params.type ?? '');
	const contentType = $derived(resolveVisibleContentType(ctx.model, typeParam));
	const formModel = $derived(contentType ? buildFormModel(contentType, null) : null);
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
{:else if formModel}
	{@const activeType = contentType}
	<div class="vega-editor-page">
		<h1>{ctx.t('editor.create.title', { label: activeType.labelSingular })}</h1>
		<RecordForm
			type={activeType}
			model={formModel}
			typeReadonly={false}
			onSubmit={(input) => ctx.port.create(activeType.name, input)}
			onSaved={(record) => {
				ctx.feedback.toast(ctx.t('editor.saveSuccess'), { kind: 'success' });
				ctx.nav.toRecord(activeType.name, record.id);
			}}
			onCancel={() => (activeType.singleton ? ctx.nav.toIndex() : ctx.nav.toList(activeType.name))}
		/>
	</div>
{/if}

<style>
	.vega-editor-page {
		display: flex;
		flex-direction: column;
		gap: var(--vega-space-gutter);
	}

	.vega-editor-page h1 {
		margin: 0;
		font-size: 1.2rem;
	}
</style>
