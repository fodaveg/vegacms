<script lang="ts">
	/**
	 * Carga `ConflictNotice.svelte` solo cuando hay un conflicto que enseñar. Lo montan
	 * `RecordForm.svelte` y `BlockEditor.svelte` en el mismo sitio y con las mismas props que el
	 * aviso: así el aviso, sus diferencias (`DiffRow`) y la búsqueda del autor
	 * (`revisions/conflict-author.ts`) salen del coste de abrir el editor de registro y el editor
	 * visual, que solo los usan si un guardado choca con otro (`scripts/check-bundle-budget.mjs`:
	 * la 0.14.1 pasaba el tope de la pantalla más cara por 0.67 KB).
	 *
	 * El aviso gestiona su foco al montarse (título con `tabindex="-1"`), así que llegar un instante
	 * después no cambia nada para quien edita. Si el trozo no se puede descargar (sin red, o una
	 * versión nueva desplegada que retiró el anterior), el hueco no se queda vacío: dice que el
	 * registro cambió en el servidor y que no se ha guardado nada, con el mismo `role="alert"`.
	 */
	import type { ComponentProps } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import type ConflictNotice from './ConflictNotice.svelte';

	type Props = ComponentProps<typeof ConflictNotice>;

	let props: Props = $props();
	const ctx = getVegaContext();
	// Una sola petición por montaje: `import()` ya devuelve el mismo módulo a cada anfitrión.
	const notice = import('./ConflictNotice.svelte');
</script>

{#await notice then { default: Notice }}
	<Notice {...props} />
{:catch}
	<div class="vega-conflict-fallback" role="alert">
		<p class="vega-conflict-fallback-title">
			{props.variant === 'narrow'
				? ctx.t('editor.conflict.titleNarrow', { name: props.name })
				: ctx.t('editor.conflict.title', { name: props.name })}
		</p>
		<p>{ctx.t('editor.conflict.nothingSaved')}</p>
	</div>
{/await}

<style>
	/* El tono `warning` de `.vega-conflict` (ConflictNotice.svelte), sin acciones: sin el aviso no
	   hay con qué descartar ni forzar, pero sí se dice qué ha pasado. */
	.vega-conflict-fallback {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--warning);
		border-radius: var(--r);
		background: var(--warning-soft);
		color: var(--ink);
	}

	.vega-conflict-fallback p {
		margin: 0;
	}

	.vega-conflict-fallback-title {
		font-weight: 600;
		color: var(--ink-hi);
		overflow-wrap: anywhere;
	}
</style>
