<script lang="ts">
	/**
	 * `UnsupportedField.svelte` — el ÚNICO widget REAL de F5-a (L-P5.1, D-P5.13: `geoPoint`/
	 * `password` en v1). Un campo `widget: 'unsupported'` se pinta SIEMPRE visible, solo lectura,
	 * con su `schema.backendType` a la vista — nunca oculto, nunca editable, nunca emite
	 * `onChange` (L-P5.2). No hay nada más que F5-b añada aquí: este es ya el componente final.
	 */
	import { getVegaContext } from '$lib/app-context';
	import type { WidgetProps } from './types';
	import { fieldIds } from '../field-ids';

	let { field }: WidgetProps = $props();

	const ctx = getVegaContext();
	const ids = $derived(fieldIds(field.name));
	const backendType = $derived(
		field.schema.type === 'unsupported' ? field.schema.backendType : field.schema.type
	);
</script>

<div id={ids.inputId} class="vega-widget-unsupported" data-widget="unsupported">
	<code>{backendType}</code>
	<span>{ctx.t('form.unsupported')}</span>
</div>

<style>
	.vega-widget-unsupported {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.6rem;
		border: 1px dashed var(--vega-color-border);
		border-radius: 6px;
		color: var(--vega-color-text-muted);
		font-size: 0.9rem;
	}

	.vega-widget-unsupported code {
		padding: 0.05rem 0.35rem;
		border-radius: 4px;
		background: var(--vega-color-bg-raised);
	}
</style>
