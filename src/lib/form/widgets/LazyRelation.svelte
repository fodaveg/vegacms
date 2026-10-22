<script lang="ts">
	/** Las relaciones descargan sus buscadores y biblioteca solo al aparecer un campo de relación. */
	import type { WidgetProps } from './types';
	import { loadRelationWidget } from './relation-loader';
	import { getVegaContext } from '$lib/app-context';
	let props: WidgetProps = $props();
	const ctx = getVegaContext();
	let attempt = $state(0);
	const loading = $derived.by(() => {
		void attempt;
		return loadRelationWidget();
	});
</script>

{#await loading}
	<p role="status">{ctx.t('common.loading')}</p>
{:then module}
	<module.default {...props} />
{:catch}
	<p role="alert">
		{ctx.t('form.relation.loadError')}
		<button
			type="button"
			onclick={() => {
				attempt += 1;
			}}>{ctx.t('common.retry')}</button
		>
	</p>
{/await}
