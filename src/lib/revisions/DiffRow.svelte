<script lang="ts">
	/**
	 * `DiffRow.svelte`: UNA fila de diff (etiqueta del campo, valor de antes tachado → valor de
	 * después). Extraída de `RevisionDiff.svelte` (historial) para que el aviso de edición
	 * concurrente (`form/ConflictNotice.svelte`) pinte sus filas con el MISMO marcado y los mismos
	 * estilos en vez de copiarlos. El único añadido es `scope`: la etiqueta de alcance del diff a
	 * tres bandas («Lo cambiasteis los dos» / «Solo cambió en el servidor» / «Solo tú»), una
	 * píldora de 20 px con el color de `.vega-status-badge` que indica `kind`. Sin `scope`, el
	 * marcado es el de siempre del historial.
	 *
	 * Es un `<li>`: el `<ul>` y su espaciado los pone quien la usa.
	 */
	import { getVegaContext } from '$lib/app-context';
	import type { FieldValue } from '$lib/backend/types';
	import type { ResolvedField } from '$lib/model/types';
	import { diffSideText } from './diff-text';

	interface Props {
		label: string;
		/** `null` si el campo ya no existe en el tipo actual (ver `diffSideText`). */
		field: ResolvedField | null;
		before: FieldValue | undefined;
		after: FieldValue | undefined;
		/** Atributo `data-diff-status` (el `FieldDiffStatus` del historial), opcional. */
		status?: string;
		scope?: { label: string; kind: 'warn' | 'other' | 'draft'; id: string };
	}

	let { label, field, before, after, status, scope }: Props = $props();

	const ctx = getVegaContext();
</script>

<li
	class="vega-revision-diff-row"
	data-diff-status={status}
	data-conflict-scope={scope?.id}
	data-field={field?.name}
>
	{#if scope}
		<span class="vega-revision-diff-row-top">
			<span class="vega-revision-diff-label">{label}</span>
			<span class="vega-revision-diff-scope" data-scope-kind={scope.kind}>{scope.label}</span>
		</span>
	{:else}
		<span class="vega-revision-diff-label">{label}</span>
	{/if}
	<span class="vega-revision-diff-values">
		<span class="vega-revision-diff-before">{diffSideText(ctx.t, ctx.locale, field, before)}</span>
		<span class="vega-revision-diff-arrow" aria-hidden="true">→</span>
		<span class="vega-revision-diff-after">{diffSideText(ctx.t, ctx.locale, field, after)}</span>
	</span>
</li>

<style>
	.vega-revision-diff-row {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
	}

	.vega-revision-diff-row-top {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.vega-revision-diff-label {
		font-weight: 600;
		font-size: 0.82rem;
		color: var(--ink);
	}

	/* Píldora de alcance: geometría de `.vega-status-badge` reducida a 20 px, mismos pares de
	   color que la insignia de estado (`draft` neutro, `other` info) más `warn` para "los dos". */
	.vega-revision-diff-scope {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		height: 20px;
		padding: 0 0.5rem;
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 600;
		line-height: 20px;
		white-space: nowrap;
	}

	.vega-revision-diff-scope::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
		flex-shrink: 0;
	}

	.vega-revision-diff-scope[data-scope-kind='warn'] {
		color: var(--warning);
		background: var(--warning-soft);
	}

	.vega-revision-diff-scope[data-scope-kind='other'] {
		color: var(--info);
		background: var(--info-soft);
	}

	.vega-revision-diff-scope[data-scope-kind='draft'] {
		color: var(--ink-2);
		background: var(--btn);
	}

	.vega-revision-diff-values {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.35rem;
		font-family: var(--mono);
		font-size: 0.78rem;
		overflow-wrap: anywhere;
	}

	.vega-revision-diff-before {
		color: var(--danger);
		text-decoration: line-through;
	}

	.vega-revision-diff-arrow {
		color: var(--ink-3);
	}

	.vega-revision-diff-after {
		color: var(--success);
	}
</style>
