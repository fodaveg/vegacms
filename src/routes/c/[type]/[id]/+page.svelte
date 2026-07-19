<script lang="ts">
	/**
	 * `/c/[type]/[id]` (§2.4 del contrato P3; Fase F5-a del contrato P5): EDICIÓN real.
	 *
	 * - `type` inexistente u oculto → `not-found` (P3-L2, mismo criterio que `/c/[type]`).
	 * - `type` válido: carga el registro con `ctx.port.get`. `VegaError 'not-found'` → `not-found`
	 *   EN CONTEXTO (L-P5.7, cierra el hueco que dejó el marco 3a). Cualquier otro `kind`
	 *   (network/backend/forbidden/auth-expired) va al feedback global de P3 (L-P5.5) Y a un
	 *   estado local con "Reintentar" (mismo criterio que `/settings`) — nunca se queda
	 *   "Cargando…" para siempre sin afordancia.
	 * - `type.readonly` (view) NO bloquea la carga aquí (a diferencia de `/new`: se PUEDE ver un
	 *   registro de una view, solo no escribirlo): `RecordForm` recibe `typeReadonly` y
	 *   deshabilita todos los campos + oculta "Guardar" (L-P5.2).
	 * - "Guardar" llama `ctx.port.update`; `RecordForm` reasienta baseline internamente
	 *   (L-P5.6) — esta ruta no navega tras guardar (D-P5.11 solo prescribe destino tras CREAR),
	 *   solo confirma con un toast.
	 *
	 * **R7 del rediseño C2**: el `<h1>`/insignia "Solo lectura" que esta ruta pintaba junto al
	 *   título se MUDAN dentro de `RecordForm` (crumb + tag, ver su cabecera) — el título visible
	 *   era redundante con el crumb del mockup, y la insignia de solo-lectura ahora vive junto al
	 *   resto de indicadores de la barra pegajosa. Esta ruta ya no pinta NINGÚN marco propio
	 *   alrededor del formulario más allá del hueco de layout (`vega-editor-page`).
	 */
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import { resolveVisibleContentType } from '$lib/nav/content-type';
	import { buildFormModel, type FormModel } from '$lib/form/form-model';
	import { VegaError } from '$lib/backend';
	import type { ResolvedContentType } from '$lib/model/types';
	import RouteState from '$lib/shell/RouteState.svelte';
	import RecordForm from '$lib/form/RecordForm.svelte';

	const ctx = getVegaContext();

	const typeParam = $derived(page.params.type ?? '');
	const idParam = $derived(page.params.id ?? '');
	const contentType = $derived(resolveVisibleContentType(ctx.model, typeParam));

	type LoadStatus =
		| { kind: 'loading' }
		| { kind: 'ready'; model: FormModel }
		| { kind: 'not-found' }
		| { kind: 'error'; error: VegaError };

	let status = $state<LoadStatus>({ kind: 'loading' });
	// Última clave `type:id` ya cargada (variable PLANA, no `$state`: mismo patrón que
	// `syncedModel` de `RecordForm` — evita que el propio `status` retrigee este `$effect`).
	let loadedKey: string | null = null;

	async function load(activeType: ResolvedContentType, id: string): Promise<void> {
		status = { kind: 'loading' };
		try {
			const record = await ctx.port.get(activeType.name, id);
			status = { kind: 'ready', model: buildFormModel(activeType, record) };
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error cargando el registro', err);
			if (vegaErr.kind === 'not-found') {
				status = { kind: 'not-found' };
				return;
			}
			ctx.feedback.reportError(vegaErr, { action: 'record:load' });
			status = { kind: 'error', error: vegaErr };
		}
	}

	$effect(() => {
		if (!contentType) return;
		const key = `${contentType.name}:${idParam}`;
		if (key === loadedKey) return;
		loadedKey = key;
		void load(contentType, idParam);
	});
</script>

{#if !contentType}
	<RouteState
		kind="not-found"
		title={ctx.t('errors.notFoundType.title')}
		body={ctx.t('errors.notFoundType.body', { type: typeParam })}
		action={{ label: ctx.t('errors.backToIndex'), onClick: () => ctx.nav.toIndex() }}
	/>
{:else}
	{@const activeType = contentType}
	{#if status.kind === 'loading'}
		<p aria-live="polite">{ctx.t('common.loading')}</p>
	{:else if status.kind === 'not-found'}
		<RouteState
			kind="not-found"
			title={ctx.t('errors.notFoundRecord.title')}
			body={ctx.t('errors.notFoundRecord.body')}
			action={{
				label: ctx.t('errors.notFoundRecord.backToList'),
				onClick: () => ctx.nav.toList(activeType.name)
			}}
		/>
	{:else if status.kind === 'error'}
		<div class="vega-editor-error" role="alert">
			<p>{ctx.t('editor.load.error.body', { message: status.error.message })}</p>
			<button type="button" onclick={() => load(activeType, idParam)}
				>{ctx.t('common.retry')}</button
			>
		</div>
	{:else}
		{@const readyModel = status.model}
		<div class="vega-editor-page">
			<RecordForm
				type={activeType}
				model={readyModel}
				typeReadonly={activeType.readonly}
				onSubmit={(input) => ctx.port.update(activeType.name, idParam, input)}
				onSaved={() => ctx.feedback.toast(ctx.t('editor.saveSuccess'), { kind: 'success' })}
				onCancel={() =>
					activeType.singleton ? ctx.nav.toIndex() : ctx.nav.toList(activeType.name)}
			/>
		</div>
	{/if}
{/if}

<style>
	.vega-editor-page {
		display: flex;
		flex-direction: column;
		gap: var(--vega-space-gutter);
	}

	.vega-editor-error {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		max-width: 32rem;
	}

	.vega-editor-error button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		cursor: pointer;
	}
</style>
