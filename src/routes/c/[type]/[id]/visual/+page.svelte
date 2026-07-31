<script lang="ts">
	/**
	 * `/c/[type]/[id]/visual` (tarea "pantalla del editor visual", lote único): pantalla a pantalla
	 * completa que enseña la página del sitio en un iframe y la conecta al puente de edición visual
	 * (§"Visual editing bridge" del contrato, `$lib/visual/bridge-client.ts`). Sustituye al panel
	 * lateral de 480px de `form/PreviewPanel.svelte` SOLO para este flujo; ese panel sigue existiendo
	 * intacto y esta ruta no lo toca.
	 *
	 * Guards, en el MISMO orden y con el MISMO criterio que `/c/[type]/[id]` (ver su cabecera, que
	 * esta ruta replica letra por letra para las tres primeras):
	 * - `type` inexistente u oculto → `not-found`.
	 * - `!permissions.view` → `forbidden`, ANTES de tocar el puerto (mismo motivo: las reglas del
	 *   backend pueden dejar `listRule` abierta y `viewRule` cerrada).
	 * - Tras eso, TRES condiciones PROPIAS de esta pantalla (`$lib/visual/visual-gate.ts`,
	 *   `resolveVisualGate` — módulo PURO, con su propia suite, para no tener que mockear
	 *   `$app/state` solo para probarlas): sin `type.blocks`, sin `ctx.port.previewApiUrl` o sin
	 *   `ctx.port.previewVisualEditing` cierran el paso ANTES de pedir el registro — ninguna
	 *   depende de él, así que no hay razón para gastar la petición de red si la pantalla ya sabe
	 *   que no tiene sentido. Las tres se pintan con `RouteState kind="placeholder"` (informativo,
	 *   no un fallo: el proyecto simplemente no tiene esta capacidad todavía) y un botón de vuelta
	 *   al formulario de siempre — nunca un lienzo mudo.
	 * - Con las cuatro puertas abiertas: carga el registro con `ctx.port.get`, MISMO manejo de
	 *   errores que `/c/[type]/[id]` (`not-found` en contexto si el id no existe — esta ruta no
	 *   aplica a `/new`, así que "no existe todavía" cae aquí, no en una quinta condición propia;
	 *   cualquier otro error → estado local con "Reintentar" + `ctx.feedback.reportError`).
	 *
	 * `VisualEditorScreen.svelte` se importa de forma ESTÁTICA, y es una decisión medida, no un
	 * descuido. El primer intento lo cargaba con `import()` dinámico "para que no pesara en la
	 * carga inicial", que suena bien y es INÚTIL aquí por dos motivos: los nodos de ruta de
	 * SvelteKit ya se descargan bajo demanda (esta ruta nunca entra en la carga inicial, se pueda
	 * o no cargar su componente aparte), y `scripts/check-bundle-budget.mjs` excluye A PROPÓSITO
	 * los `import()` dinámicos del coste de la pantalla que los contiene (ver su cabecera). O sea
	 * que el import dinámico no ahorraba un byte a nadie y a cambio escondía el peso del editor
	 * visual del ÚNICO tope que lo vigila: los 80 KB de "pantalla más cara", que existen
	 * exactamente para este lote. Estático, ese peso cuenta donde tiene que contar.
	 *
	 * `{#key}` alrededor de la pantalla (ver más abajo): a diferencia de `RecordForm.svelte`, que
	 * SÍ se resincroniza en caliente si `model` cambia por debajo (dirty tracking, guard de salida,
	 * bloques embebidos con estado propio — demasiado que perder con un remontaje), esta pantalla no
	 * tiene NADA de eso: es más simple y más seguro remontarla entera si el autor navega de un
	 * registro a otro sin recargar la página (deep-link desde el raíl, por ejemplo) que replicar la
	 * disciplina de resincronía de `RecordForm` para un componente que la tarea siguiente todavía
	 * tiene que ampliar con árbol/inspector.
	 */
	import { page } from '$app/state';
	import { getVegaContext } from '$lib/app-context';
	import { resolveVisibleContentType } from '$lib/nav/content-type';
	import { resolveVisualGate } from '$lib/visual/visual-gate';
	import { VegaError, type VegaRecord } from '$lib/backend';
	import type { ResolvedContentType } from '$lib/model/types';
	import RouteState from '$lib/shell/RouteState.svelte';
	import VisualEditorScreen from '$lib/visual/VisualEditorScreen.svelte';

	const ctx = getVegaContext();

	const typeParam = $derived(page.params.type ?? '');
	const idParam = $derived(page.params.id ?? '');
	const contentType = $derived(resolveVisibleContentType(ctx.model, typeParam));
	const gate = $derived(contentType ? resolveVisualGate(contentType, ctx.port) : null);

	type LoadStatus =
		| { kind: 'loading' }
		| { kind: 'ready'; record: VegaRecord }
		| { kind: 'not-found' }
		| { kind: 'error'; error: VegaError };

	let status = $state<LoadStatus>({ kind: 'loading' });
	// Última clave `type:id` ya cargada (variable PLANA, mismo patrón que `/c/[type]/[id]`).
	let loadedKey: string | null = null;

	async function load(activeType: ResolvedContentType, id: string): Promise<void> {
		status = { kind: 'loading' };
		try {
			const record = await ctx.port.get(activeType.name, id);
			status = { kind: 'ready', record };
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
		if (!contentType || gate?.status !== 'ok') return; // sin las cuatro puertas abiertas, ni se intenta el `get`
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
{:else if gate?.status === 'forbidden'}
	<RouteState
		kind="forbidden"
		title={ctx.t('errors.forbidden.title')}
		body={ctx.t('errors.forbidden.noView.body', { label: contentType.label })}
		action={{
			label: ctx.t('errors.notFoundRecord.backToList'),
			onClick: () => ctx.nav.toList(contentType.name)
		}}
	/>
{:else if gate?.status === 'no-blocks' || gate?.status === 'no-preview' || gate?.status === 'no-visual-editing'}
	{@const activeType = contentType}
	<RouteState
		kind="placeholder"
		title={ctx.t('editor.visual.unavailable.title')}
		body={gate.status === 'no-blocks'
			? ctx.t('editor.visual.unavailable.noBlocks', { label: activeType.label })
			: gate.status === 'no-preview'
				? ctx.t('editor.visual.unavailable.noPreview')
				: ctx.t('editor.visual.unavailable.noVisualEditing')}
		action={{
			label: ctx.t('editor.visual.back'),
			onClick: () => ctx.nav.toRecord(activeType.name, idParam)
		}}
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
		<div class="vega-visual-route-error" role="alert">
			<p>{ctx.t('editor.load.error.body', { message: status.error.message })}</p>
			<button type="button" onclick={() => load(activeType, idParam)}
				>{ctx.t('common.retry')}</button
			>
		</div>
	{:else}
		{@const readyRecord = status.record}
		{#key `${activeType.name}:${readyRecord.id}`}
			<VisualEditorScreen type={activeType} record={readyRecord} />
		{/key}
	{/if}
{/if}

<style>
	.vega-visual-route-error {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		max-width: 32rem;
	}

	.vega-visual-route-error button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		cursor: pointer;
	}
</style>
