<script lang="ts">
	/**
	 * `ReferencesSummary.svelte` (`#lote-integridad`, Fase A): pinta un `ReferencesReport` YA
	 * cargado — módulo de presentación PURO respecto a red (no llama a `findReferences`, solo
	 * consume su resultado). Reutilizado por `UsedInPanel.svelte` (panel pasivo "Se usa en") y por
	 * el aviso de `DeleteConfirm.svelte`/`MediaDeleteConfirm.svelte` (gate antes de borrar): la
	 * MISMA lista/agrupación vale para los dos contextos, solo cambia lo que el llamador pinta
	 * alrededor (toggle colapsable vs. checkbox de confirmación).
	 *
	 * Resuelve etiqueta de colección y de registro contra `ctx.model.types` (P2, `ResolvedContentType`)
	 * — el motor de referencias trabaja con `ContentType` crudo (P1) y no sabe de `titleField`/`label`,
	 * así que esa traducción vive aquí, en la ÚNICA capa que ya conoce el modelo resuelto.
	 *
	 * **Enlace de navegación** (§2 del contrato): `recordRoute(collection, id)` es el MISMO
	 * constructor de URL que usa el resto de la app (`$lib/nav/routes`) — nunca se compone una ruta
	 * a mano aquí.
	 *
	 * **Caso límite "registro sin `titleField`"**: se etiqueta por `id`, igual criterio que
	 * `RecordTable`/`list.untitled` (aquí sin depender de i18n: un id siempre es un string válido
	 * que mostrar, y las referencias son casos raros que no merecen una clave nueva solo para esto).
	 */
	import { getVegaContext } from '$lib/app-context';
	import type { VegaRecord } from '$lib/backend/types';
	import { recordRoute } from '$lib/nav/routes';
	import type { ReferencesReport } from './references';

	interface Props {
		report: ReferencesReport;
	}

	let { report }: Props = $props();

	const ctx = getVegaContext();

	function resolvedType(collection: string) {
		return ctx.model.types.find((t) => t.name === collection) ?? null;
	}

	function collectionLabel(collection: string): string {
		return resolvedType(collection)?.label ?? collection;
	}

	/** Etiqueta de UN registro de muestra: `titleField` resuelto si el tipo lo declara y el valor
	 *  es texto no vacío; si no, el id (ver cabecera, "caso límite sin titleField"). */
	function recordLabel(collection: string, record: VegaRecord): string {
		const type = resolvedType(collection);
		if (!type || type.titleField === null) return record.id;
		const value = record.values[type.titleField];
		return typeof value === 'string' && value !== '' ? value : record.id;
	}
</script>

{#if report.partial}
	<p class="vega-refs-partial" role="alert">{ctx.t('integrity.usedIn.partial')}</p>
{/if}

<ul class="vega-refs-groups">
	{#each report.groups as group (group.collection)}
		<li class="vega-refs-group">
			<div class="vega-refs-group-head">
				<span class="vega-refs-group-label">{collectionLabel(group.collection)}</span>
				{#if group.readonly}
					<span class="vega-refs-readonly-badge">{ctx.t('nav.readonlyBadge')}</span>
				{/if}
			</div>
			{#each group.matches as match (match.via)}
				{#if match.status === 'ok'}
					<div class="vega-refs-match">
						<span class="vega-refs-count">
							{ctx.t('integrity.usedIn.countLabel', { count: match.count })}
						</span>
						<ul class="vega-refs-sample">
							{#each match.sample as sampleRecord (sampleRecord.id)}
								<li>
									<a href={recordRoute(group.collection, sampleRecord.id)}>
										{recordLabel(group.collection, sampleRecord)}
									</a>
								</li>
							{/each}
						</ul>
						{#if match.count > match.sample.length}
							<span class="vega-refs-more">
								{ctx.t('integrity.usedIn.moreCount', {
									count: match.count - match.sample.length
								})}
							</span>
						{/if}
					</div>
				{:else}
					<p class="vega-refs-degraded">
						{ctx.t('integrity.usedIn.collectionDegraded', {
							collection: collectionLabel(group.collection),
							reason: ctx.t(`integrity.usedIn.reason.${match.reason}`)
						})}
					</p>
				{/if}
			{/each}
		</li>
	{/each}
</ul>

<style>
	.vega-refs-partial {
		margin: 0 0 0.6rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--warning);
		border-radius: 6px;
		background: var(--warning-soft);
		color: var(--warning);
		font-size: 0.85rem;
	}

	.vega-refs-groups {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-refs-group {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
	}

	.vega-refs-group-head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		/* Nombre de colección larguísimo (caso límite del contrato): parte en vez de desbordar el
		   marco fijo del diálogo/panel que lo contiene. */
		overflow-wrap: anywhere;
	}

	.vega-refs-group-label {
		font-weight: 600;
		color: var(--ink);
		font-size: 0.9rem;
	}

	.vega-refs-readonly-badge {
		flex-shrink: 0;
		padding: 0.05rem 0.35rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 0.7rem;
		color: var(--ink-2);
	}

	.vega-refs-match {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.vega-refs-count {
		color: var(--ink-2);
		font-size: 0.8rem;
		font-family: var(--mono);
	}

	.vega-refs-sample {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-refs-sample a {
		color: var(--accent-text);
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}

	.vega-refs-more {
		color: var(--ink-3);
		font-size: 0.78rem;
	}

	.vega-refs-degraded {
		margin: 0;
		color: var(--warning);
		font-size: 0.8rem;
		overflow-wrap: anywhere;
	}
</style>
